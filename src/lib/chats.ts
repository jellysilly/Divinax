// Операции с чатами: создание, ветки, импорт/экспорт (JSONL SillyTavern), приветствия.
import type { Chat, Message } from '../types';
import { chatsOf, currentPersona, getState, newChatObject, setState, toast, updateChat, userName } from '../store';
import { macroEnv } from './prompt';
import { substituteMacros } from './macros';
import { download, safeName, uid } from './util';

export function makeMessage(p: Partial<Message> & { text: string; name: string; isUser: boolean }): Message {
  const now = Date.now();
  return {
    id: uid(),
    swipes: [p.text],
    swipeId: 0,
    swipeInfo: [{ date: now }],
    date: now,
    hidden: false,
    ...p,
  };
}

function greetings(chat: Chat): Message[] {
  const s = getState();
  const persona = currentPersona(s, chat);
  const out: Message[] = [];
  const add = (charId: string) => {
    const ch = s.characters[charId];
    if (!ch) return;
    const env = macroEnv(s, chat, ch, persona);
    const list = [ch.first_mes, ...ch.alternate_greetings].filter((x) => x.trim()).map((x) => substituteMacros(x, env));
    if (!list.length) return;
    const m = makeMessage({ text: list[0], name: ch.name, isUser: false, charId });
    m.swipes = list;
    m.swipeInfo = list.map(() => ({ date: m.date }));
    out.push(m);
  };
  if (chat.ownerType === 'char') add(chat.ownerId);
  else {
    const g = s.groups[chat.ownerId];
    g?.members.filter((id) => !g.disabledMembers.includes(id)).forEach(add);
  }
  return out;
}

export function startNewChat(ownerType: 'char' | 'group', ownerId: string, name?: string): string {
  const chat = newChatObject(ownerType, ownerId, name);
  const s = getState();
  if (ownerType === 'char' && s.charPersona[ownerId]) chat.personaId = s.charPersona[ownerId];
  chat.messages = greetings(chat);
  setState((st) => ({
    chats: { ...st.chats, [chat.id]: chat },
    activeChatId: chat.id,
    lastChatByOwner: { ...st.lastChatByOwner, [ownerId]: chat.id },
  }));
  return chat.id;
}

export function openChat(chatId: string) {
  const c = getState().chats[chatId];
  if (!c) return;
  setState((s) => ({ activeChatId: chatId, lastChatByOwner: { ...s.lastChatByOwner, [c.ownerId]: chatId }, tab: 'chat', mobileMenu: false }));
}

/** Открыть последний чат персонажа/группы или создать новый. */
export function openOwner(ownerType: 'char' | 'group', ownerId: string) {
  const s = getState();
  const last = s.lastChatByOwner[ownerId];
  if (last && s.chats[last]) return openChat(last);
  const existing = chatsOf(s, ownerId)[0];
  if (existing) return openChat(existing.id);
  startNewChat(ownerType, ownerId);
  setState({ tab: 'chat' });
}

export function closeChat() {
  setState({ activeChatId: '', chatMenu: false });
}

export function deleteChat(chatId: string) {
  setState((s) => {
    const chats = { ...s.chats };
    const c = chats[chatId];
    delete chats[chatId];
    const next = c ? Object.values(chats).filter((x) => x.ownerId === c.ownerId).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
    return {
      chats,
      activeChatId: s.activeChatId === chatId ? next?.id ?? '' : s.activeChatId,
      lastChatByOwner: c ? { ...s.lastChatByOwner, [c.ownerId]: next?.id ?? '' } : s.lastChatByOwner,
    };
  });
}

export function renameChat(chatId: string, name: string) {
  updateChat(chatId, (c) => void (c.name = name.trim() || c.name));
}

/** Ветка: копия чата до указанного сообщения включительно. */
export function branchChat(chatId: string, messageId: string, asCheckpoint = false, name?: string): string | undefined {
  const s = getState();
  const src = s.chats[chatId];
  if (!src) return;
  const idx = src.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  const now = Date.now();
  const copy: Chat = {
    ...structuredClone(src),
    id: uid(),
    name: name ?? `${asCheckpoint ? 'Контрольная точка' : 'Ветка'}: ${src.name}`,
    messages: structuredClone(src.messages.slice(0, idx + 1)),
    branchOf: { chatId, messageId },
    createdAt: now,
    updatedAt: now,
  };
  setState((st) => ({ chats: { ...st.chats, [copy.id]: copy } }));
  if (asCheckpoint) {
    updateChat(chatId, (c) => {
      c.messages = c.messages.map((m) => (m.id === messageId ? { ...m, bookmark: copy.id } : m));
    });
    toast(`Контрольная точка «${copy.name}» сохранена`, 'success');
  } else {
    openChat(copy.id);
    toast('Создана ветка чата', 'success');
  }
  return copy.id;
}

export function exportChat(chatId: string, format: 'jsonl' | 'txt' = 'jsonl') {
  const s = getState();
  const c = s.chats[chatId];
  if (!c) return;
  const owner = c.ownerType === 'group' ? s.groups[c.ownerId]?.name : s.characters[c.ownerId]?.name;
  const uname = userName(s, c);
  if (format === 'txt') {
    const txt = c.messages.map((m) => `${m.name}: ${m.text}`).join('\n\n');
    download(`${safeName(owner ?? 'chat')} - ${safeName(c.name)}.txt`, txt, 'text/plain');
    return;
  }
  const header = {
    user_name: uname,
    character_name: owner,
    create_date: new Date(c.createdAt).toISOString(),
    chat_metadata: { note_prompt: c.authorNote.text, note_depth: c.authorNote.depth, divinax: { name: c.name, summary: c.summary, vars: c.vars } },
  };
  const lines = [JSON.stringify(header)];
  for (const m of c.messages) {
    lines.push(
      JSON.stringify({
        name: m.name,
        is_user: m.isUser,
        is_system: Boolean(m.isSystem || m.hidden),
        send_date: new Date(m.date).toISOString(),
        mes: m.text,
        swipes: m.swipes,
        swipe_id: m.swipeId,
        extra: { reasoning: m.reasoning, gen_time: m.genTime, token_count: m.tokens, ...(m.isSystem ? { type: 'narrator' } : {}) },
      }),
    );
  }
  download(`${safeName(owner ?? 'chat')} - ${safeName(c.name)}.jsonl`, lines.join('\n'), 'application/jsonl');
}

export function importChatText(text: string, ownerType: 'char' | 'group', ownerId: string, fileName = 'Импорт'): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const chat = newChatObject(ownerType, ownerId, fileName.replace(/\.jsonl?$/i, ''));
  const s = getState();
  for (const [i, l] of lines.entries()) {
    let j: any;
    try {
      j = JSON.parse(l);
    } catch {
      continue;
    }
    if (i === 0 && (j.chat_metadata || j.user_name) && j.mes === undefined) {
      if (j.chat_metadata?.note_prompt) {
        chat.authorNote.text = j.chat_metadata.note_prompt;
        chat.authorNote.enabled = true;
      }
      if (j.chat_metadata?.divinax?.summary) chat.summary = j.chat_metadata.divinax.summary;
      continue;
    }
    if (typeof j.mes !== 'string') continue;
    const swipes: string[] = Array.isArray(j.swipes) && j.swipes.length ? j.swipes.map(String) : [j.mes];
    const swipeId = Math.min(swipes.length - 1, Math.max(0, Number(j.swipe_id ?? 0)));
    const date = Date.parse(j.send_date) || Date.now();
    const charId = !j.is_user ? Object.values(s.characters).find((c) => c.name === j.name)?.id : undefined;
    chat.messages.push({
      id: uid(),
      name: String(j.name ?? ''),
      isUser: Boolean(j.is_user),
      // в ST скрытые сообщения помечены is_system, а системные — extra.type = narrator
      isSystem: j.extra?.type === 'narrator',
      charId,
      text: swipes[swipeId] ?? j.mes,
      swipes,
      swipeId,
      swipeInfo: swipes.map(() => ({ date })),
      date,
      hidden: Boolean(j.is_system) && j.extra?.type !== 'narrator',
      reasoning: j.extra?.reasoning,
      genTime: j.extra?.gen_time,
    });
  }
  setState((st) => ({ chats: { ...st.chats, [chat.id]: chat } }));
  openChat(chat.id);
  return chat.id;
}
