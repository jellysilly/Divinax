import { tr } from './i18n';
// Генерация ответов: обычная, свайп, регенерация, продолжение, «ответ за меня», тихие запросы, групповые чаты.
import type { Chat, Message } from '../types';
import { activePreset, currentPersona, getState, setState, toast, updateChat, updateMessage, userName } from '../store';
import { generate } from './api';
import { makeMessage } from './chats';
import { buildPrompt, cleanResponse, speakingCharacter, type GenKind } from './prompt';
import { applyRegex, scriptsFor } from './regex';
import { estimateTokens } from './util';
import { speak } from './speech';
import { classifyEmotion, translateMessage, translateText } from './extras';
import { eventSource, event_types, extActive } from './userext/events';

/** Индекс сообщения в чате — так события ST ссылаются на сообщения. */
const msgIndex = (chatId: string, id?: string) => (id ? (getState().chats[chatId]?.messages.findIndex((m) => m.id === id) ?? -1) : -1);

let controller: AbortController | null = null;

export const isGenerating = () => getState().gen !== null;

export function stopGeneration() {
  controller?.abort();
}

function lastNonSystem(chat: Chat): Message | undefined {
  for (let i = chat.messages.length - 1; i >= 0; i--) if (!chat.messages[i].isSystem) return chat.messages[i];
  return undefined;
}

/** Кто отвечает в групповом чате. */
export function pickGroupSpeakers(chat: Chat, userText: string): string[] {
  const s = getState();
  const g = s.groups[chat.ownerId];
  if (!g) return [];
  const active = g.members.filter((id) => !g.disabledMembers.includes(id) && s.characters[id]);
  if (!active.length) return [];
  const last = lastNonSystem(chat);
  switch (g.activation) {
    case 'list':
      return active;
    case 'manual':
      return [];
    case 'pooled': {
      const spoken = new Set(chat.messages.slice(-active.length * 2).filter((m) => !m.isUser).map((m) => m.charId));
      const pool = active.filter((id) => !spoken.has(id) && (g.allowSelfResponses || id !== last?.charId));
      const src = pool.length ? pool : active;
      return [src[Math.floor(Math.random() * src.length)]];
    }
    case 'natural':
    default: {
      const text = (userText || last?.text || '').toLowerCase();
      const mentioned = active.filter((id) => {
        const name = s.characters[id]!.name.toLowerCase();
        const first = name.split(/\s+/)[0];
        return text.includes(name) || (first.length > 2 && text.includes(first));
      });
      const out: string[] = [];
      for (const id of mentioned) if (g.allowSelfResponses || id !== last?.charId) out.push(id);
      for (const id of active) {
        if (out.includes(id)) continue;
        if (!g.allowSelfResponses && id === last?.charId) continue;
        const talk = s.characters[id]!.talkativeness ?? 0.5;
        if (Math.random() < talk) out.push(id);
      }
      if (!out.length) {
        const pool = active.filter((id) => g.allowSelfResponses || id !== last?.charId);
        const src = pool.length ? pool : active;
        out.push(src[Math.floor(Math.random() * src.length)]);
      }
      return out;
    }
  }
}

export async function sendMessage(raw: string, opts: { generate?: boolean; asSystem?: boolean; images?: string[] } = {}) {
  const s = getState();
  const chat = s.chats[s.activeChatId];
  if (!chat) {
    toast(tr('Сначала выберите персонажа или чат'), 'error');
    return;
  }
  let text = raw.trim();
  let original: string | undefined;
  if (text && s.ext.enabled.translate && (s.ext.translate.mode === 'input' || s.ext.translate.mode === 'both') && !text.startsWith('/')) {
    try {
      original = text;
      text = await translateText(text, s.ext.translate.inputTarget);
    } catch (e) {
      toast(tr('Перевод ввода не удался: ') + (e as Error).message, 'error');
      original = undefined;
    }
  }
  if (text) {
    if (s.ext.enabled.regex) text = applyRegex(scriptsFor(s, chat.ownerType === 'char' ? chat.ownerId : undefined), text, { isUser: true, target: 'store' });
    const persona = currentPersona(s, chat);
    const msg = makeMessage({
      text,
      name: opts.asSystem ? tr('Рассказчик') : userName(s, chat),
      isUser: !opts.asSystem,
      isSystem: opts.asSystem,
      personaId: persona?.id,
      avatar: persona?.avatar,
      images: opts.images,
    });
    if (original) msg.translation = original;
    msg.tokens = estimateTokens(text);
    updateChat(chat.id, (c) => void c.messages.push(msg));
    if (extActive()) {
      const idx = msgIndex(chat.id, msg.id);
      await eventSource.emit(event_types.MESSAGE_SENT, idx);
      await eventSource.emit(event_types.USER_MESSAGE_RENDERED, idx);
    }
  }
  if (opts.generate === false) return;
  if (chat.ownerType === 'group') {
    const speakers = pickGroupSpeakers(getState().chats[chat.id], text);
    for (const id of speakers) {
      const ok = await runGeneration('normal', { charId: id });
      if (!ok) break;
    }
    return;
  }
  await runGeneration('normal');
}

/** Запускает генерацию. Возвращает true при успехе. */
export async function runGeneration(
  kind: GenKind,
  o: { charId?: string; messageId?: string; quietPrompt?: string; chatId?: string } = {},
): Promise<boolean> {
  const s0 = getState();
  if (s0.gen) {
    toast(tr('Генерация уже идёт'), 'info');
    return false;
  }
  const chatId = o.chatId ?? s0.activeChatId;
  const chat = s0.chats[chatId];
  if (!chat) return false;
  const preset = activePreset(s0);

  // Какое сообщение обновляем и какую историю видит модель
  let target: Message | undefined;
  let history = chat.messages;
  let charId = o.charId;
  if (kind === 'swipe' || kind === 'regenerate') {
    target = o.messageId ? chat.messages.find((m) => m.id === o.messageId) : lastNonSystem(chat);
    if (!target || target.isUser) {
      toast(tr('Нечего перегенерировать'), 'info');
      return false;
    }
    history = chat.messages.slice(0, chat.messages.indexOf(target));
    charId = target.charId ?? charId;
  } else if (kind === 'continue') {
    target = lastNonSystem(chat);
    if (!target) return false;
    if (target.isUser) {
      // продолжать нечего — обычная генерация
      return runGeneration('normal', o);
    }
    charId = target.charId ?? charId;
  }
  if (chat.ownerType === 'group' && !charId && kind !== 'impersonate' && kind !== 'quiet') {
    charId = pickGroupSpeakers(chat, '')[0];
  }

  let built;
  try {
    built = buildPrompt(s0, { chat, kind, charId, quietPrompt: o.quietPrompt, history });
  } catch (e) {
    toast(tr('Ошибка сборки промпта: ') + (e as Error).message, 'error');
    return false;
  }
  const char = built.char ?? speakingCharacter(s0, chat, charId);
  const uname = built.env.user ?? tr('Вы');

  // Для Claude «продолжение» передаём как префилл ассистента
  if (kind === 'continue' && built.messages && s0.api.main === 'chat' && s0.api.chatSource === 'claude' && built.prefill) {
    const last = built.messages[built.messages.length - 1];
    if (last?.role === 'assistant') last.content = last.content.replace(/\s+$/, '');
  }

  setState({
    lastPrompt: {
      tokens: built.tokens,
      items: built.items,
      raw: built.prompt ?? JSON.stringify(built.messages, null, 2),
    },
  });

  // Сообщение-приёмник
  let messageId = target?.id;
  const startedAt = Date.now();
  const isQuietLike = kind === 'impersonate' || kind === 'quiet';
  if (!isQuietLike && kind === 'normal') {
    const m = makeMessage({ text: '', name: char?.name ?? tr('Персонаж'), isUser: false, charId: char?.id });
    m.swipes = [''];
    messageId = m.id;
    updateChat(chatId, (c) => void c.messages.push(m));
  }
  if (kind === 'swipe' && target) {
    updateMessage(chatId, target.id, (m) => {
      m.swipes.push('');
      m.swipeInfo.push({ date: Date.now() });
      m.swipeId = m.swipes.length - 1;
      m.text = '';
      m.reasoning = undefined;
    });
  }
  const baseText = kind === 'continue' && target ? target.text : '';

  controller = new AbortController();
  setState({ gen: { chatId, kind, messageId, charId: char?.id, startedAt }, streaming: null });

  if (extActive()) {
    await eventSource.emit(event_types.GENERATION_STARTED, kind === 'normal' ? 'normal' : kind, {}, kind === 'quiet');
    // расширения могут поправить промпт (как CHAT_COMPLETION_PROMPT_READY в ST)
    if (built.messages) await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, { chat: built.messages, dryRun: false });
  }

  const stream = preset.stream && s0.api.main !== 'horde' && s0.api.main !== 'kobold' && s0.api.main !== 'novel';
  try {
    const res = await generate(s0.api, {
      messages: built.messages,
      prompt: built.prompt,
      preset,
      stop: built.stop,
      signal: controller.signal,
      stream,
      onDelta: (text, reasoning) => {
        if (isQuietLike) {
          if (kind === 'impersonate') setState({ draft: text });
          return;
        }
        if (messageId) setState({ streaming: { chatId, messageId, text: joinContinue(baseText, text), reasoning } });
      },
    });
    const cleaned = cleanResponse(getState(), res.text, {
      charName: char?.name ?? '',
      userName: uname,
      stop: built.stop,
      kind,
      isGroup: chat.ownerType === 'group',
    });
    let text = cleaned.text;
    const reasoning = [res.reasoning, cleaned.reasoning].filter(Boolean).join('\n');
    const st = getState();
    if (st.ext.enabled.regex && kind !== 'quiet') text = applyRegex(scriptsFor(st, char?.id), text, { isUser: kind === 'impersonate', target: 'store' });
    const genTime = Date.now() - startedAt;

    if (kind === 'quiet') {
      lastQuietResult = text;
      return true;
    }
    if (kind === 'impersonate') {
      setState({ draft: text });
      return true;
    }
    if (!text.trim() && kind !== 'continue') {
      toast(tr('Модель вернула пустой ответ'), 'error');
      rollbackEmpty(chatId, messageId, kind);
      return false;
    }
    const finalText = kind === 'continue' ? joinContinue(baseText, text) : text;
    const tokens = estimateTokens(finalText);
    updateMessage(chatId, messageId!, (m) => {
      m.text = finalText;
      m.swipes[m.swipeId] = finalText;
      m.swipeInfo[m.swipeId] = { date: Date.now(), genTime, tokens, model: res.model, reasoning };
      m.genTime = genTime;
      m.tokens = tokens;
      m.reasoning = reasoning || undefined;
      m.translation = undefined;
      if (kind !== 'continue') m.date = Date.now();
    });
    if (st.ext.enabled.expressions) updateMessage(chatId, messageId!, (m) => void (m.expression = classifyEmotion(finalText)));
    if (st.ext.enabled.translate && (st.ext.translate.mode === 'display' || st.ext.translate.mode === 'both'))
      void translateMessage(chatId, messageId!);
    if (st.ext.enabled.tts && st.ext.tts.auto) speak(finalText);
    void maybeAutoSummarize(chatId);
    if (extActive()) {
      const idx = msgIndex(chatId, messageId);
      if (kind === 'swipe') await eventSource.emit(event_types.MESSAGE_SWIPED, idx);
      await eventSource.emit(event_types.MESSAGE_RECEIVED, idx, kind);
      await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, idx, kind);
      await eventSource.emit(event_types.GENERATION_ENDED, idx);
    }
    return true;
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      if (extActive()) void eventSource.emit(event_types.GENERATION_STOPPED);
      // сохраняем то, что успело прийти
      const partial = getState().streaming;
      if (partial && partial.messageId === messageId && partial.text.trim()) {
        updateMessage(chatId, messageId!, (m) => {
          m.text = partial.text;
          m.swipes[m.swipeId] = partial.text;
        });
      } else rollbackEmpty(chatId, messageId, kind);
      return false;
    }
    toast(tr('Ошибка генерации: ') + err.message, 'error');
    const partial = getState().streaming;
    if (partial && partial.messageId === messageId && partial.text.trim()) {
      updateMessage(chatId, messageId!, (m) => {
        m.text = partial.text;
        m.swipes[m.swipeId] = partial.text;
      });
    } else rollbackEmpty(chatId, messageId, kind);
    return false;
  } finally {
    controller = null;
    setState({ gen: null, streaming: null });
  }
}

function joinContinue(base: string, add: string): string {
  if (!base) return add;
  if (!add) return base;
  const needsSpace = !/\s$/.test(base) && !/^[\s.,!?;:…»)]/.test(add);
  return base + (needsSpace ? ' ' : '') + add;
}

function rollbackEmpty(chatId: string, messageId: string | undefined, kind: GenKind) {
  if (!messageId) return;
  if (kind === 'normal') {
    updateChat(chatId, (c) => {
      c.messages = c.messages.filter((m) => !(m.id === messageId && !m.text.trim()));
    });
  } else if (kind === 'swipe') {
    updateMessage(chatId, messageId, (m) => {
      if (m.swipes.length > 1 && !m.swipes[m.swipeId].trim()) {
        m.swipes.splice(m.swipeId, 1);
        m.swipeInfo.splice(m.swipeId, 1);
        m.swipeId = m.swipes.length - 1;
        m.text = m.swipes[m.swipeId];
      }
    });
  }
}

let lastQuietResult = '';

/** Тихий запрос к модели (без сообщения в чате). */
export async function quietGenerate(prompt: string, chatId?: string): Promise<string | null> {
  lastQuietResult = '';
  const ok = await runGeneration('quiet', { quietPrompt: prompt, chatId });
  return ok ? lastQuietResult : null;
}

/** Переключение свайпа; на последнем — генерирует новый. */
export async function swipe(chatId: string, messageId: string, dir: -1 | 1) {
  const chat = getState().chats[chatId];
  const m = chat?.messages.find((x) => x.id === messageId);
  if (!chat || !m) return;
  const next = m.swipeId + dir;
  if (next < 0) return;
  if (next >= m.swipes.length) {
    const isLast = lastNonSystem(chat)?.id === m.id;
    if (!isLast || m.isUser) return;
    await runGeneration('swipe', { messageId });
    return;
  }
  updateMessage(chatId, messageId, (x) => {
    x.swipeId = next;
    x.text = x.swipes[next];
    x.reasoning = x.swipeInfo[next]?.reasoning;
    x.genTime = x.swipeInfo[next]?.genTime;
    x.tokens = x.swipeInfo[next]?.tokens ?? estimateTokens(x.text);
  });
}

// ── Пересказ (расширение «Суммаризация») ──

let summarizing = false;

export async function summarizeChat(chatId?: string): Promise<boolean> {
  const s = getState();
  const id = chatId ?? s.activeChatId;
  if (!s.chats[id] || summarizing) return false;
  summarizing = true;
  try {
    const prompt = s.ext.summarize.prompt.replace(/\{\{words\}\}/g, String(s.ext.summarize.maxWords));
    const res = await quietGenerate(prompt, id);
    if (res && res.trim()) {
      updateChat(id, (c) => void (c.summary = res.trim()));
      toast(tr('Пересказ обновлён'), 'success');
      return true;
    }
    return false;
  } finally {
    summarizing = false;
  }
}

async function maybeAutoSummarize(chatId: string) {
  const s = getState();
  if (!s.ext.enabled.summarize || s.ext.summarize.every <= 0) return;
  const c = s.chats[chatId];
  if (!c) return;
  if (c.messages.length > 0 && c.messages.length % s.ext.summarize.every === 0) {
    setTimeout(() => void summarizeChat(chatId), 300);
  }
}
