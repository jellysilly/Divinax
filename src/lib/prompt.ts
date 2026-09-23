import { tr } from './i18n';
// Сборка промпта: менеджер промптов для Chat Completion и шаблон контекста + Instruct для Text Completion.
import type { Character, Chat, InstructTemplate, Message, Persona, Role } from '../types';
import { activePreset, currentPersona, type State } from '../store';
import type { ChatMsg } from './api';
import { currentModel } from './api';
import { renderStoryString, substituteMacros, type MacroEnv } from './macros';
import { applyRegex, scriptsFor } from './regex';
import { estimateTokens } from './util';
import { scanWorldInfo, type WIResult } from './worldinfo';
import { bookSources } from './books';

export type GenKind = 'normal' | 'swipe' | 'regenerate' | 'continue' | 'impersonate' | 'quiet';

export interface BuildOptions {
  chat: Chat;
  kind: GenKind;
  charId?: string; // для групп — кто отвечает
  quietPrompt?: string; // служебный запрос (пересказ, перевод и т.п.)
  dryRun?: boolean;
  history?: Message[]; // уже обрезанная история (для свайпов/регенерации)
}

export interface BuiltPrompt {
  messages?: ChatMsg[];
  prompt?: string;
  stop: string[];
  items: { name: string; tokens: number }[];
  tokens: number;
  wi: WIResult;
  env: MacroEnv;
  char?: Character;
  persona?: Persona;
  prefill?: string; // текст, который продолжаем (continue)
}

interface Injection {
  depth: number;
  role: Role;
  content: string;
  name: string;
}

export function speakingCharacter(s: State, chat: Chat, charId?: string): Character | undefined {
  if (chat.ownerType === 'char') return s.characters[chat.ownerId];
  const g = s.groups[chat.ownerId];
  if (!g) return undefined;
  return s.characters[charId ?? ''] ?? s.characters[g.members.find((m) => !g.disabledMembers.includes(m)) ?? ''];
}

export function macroEnv(s: State, chat: Chat, char?: Character, persona?: Persona): MacroEnv {
  const user = persona?.name || tr('Вы');
  const msgs = chat.messages.filter((m) => !m.isSystem);
  const last = msgs[msgs.length - 1];
  const lastUser = [...msgs].reverse().find((m) => m.isUser);
  const lastChar = [...msgs].reverse().find((m) => !m.isUser);
  const group = chat.ownerType === 'group' ? s.groups[chat.ownerId] : undefined;
  const groupNames = group
    ? group.members.filter((id) => !group.disabledMembers.includes(id)).map((id) => s.characters[id]?.name).filter(Boolean).join(', ')
    : undefined;
  const env: MacroEnv = {
    char: char?.name ?? '',
    user,
    group: groupNames ?? char?.name,
    charIfNotGroup: group ? groupNames : char?.name,
    model: currentModel(s.api),
    lastMessage: last?.text ?? '',
    lastUserMessage: lastUser?.text ?? '',
    lastCharMessage: lastChar?.text ?? '',
    lastChatMessage: last?.text ?? '',
    lastMessageId: chat.messages.length - 1,
    idleSince: lastUser?.date,
    maxPrompt: activePreset(s).maxContext,
    vars: chat.vars,
    globalVars: globalVars,
  };
  const sub = (t: string) => substituteMacros(t, env);
  env.description = sub(char?.description ?? '');
  env.personality = sub(char?.personality ?? '');
  env.scenario = sub(char?.scenario ?? '');
  env.persona = sub(persona?.description ?? '');
  env.mesExamples = sub(char?.mes_example ?? '');
  env.charPrompt = sub(char?.system_prompt ?? '');
  env.charJailbreak = sub(char?.post_history_instructions ?? '');
  return env;
}

export const globalVars: Record<string, string> = {};

/** Разбивает mes_example по <START> на блоки. */
export function parseExamples(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/<START>/i)
    .map((b) => b.trim())
    .filter(Boolean);
}

function activeBooks(s: State, chat: Chat, persona?: Persona) {
  return [...bookSources(s, chat, persona).keys()].map((id) => s.lorebooks[id]);
}

function displayName(s: State, m: Message, userName: string): string {
  if (m.isUser) return m.name || userName;
  return m.name || (m.charId ? s.characters[m.charId]?.name : '') || tr('Персонаж');
}

export function buildPrompt(s: State, o: BuildOptions): BuiltPrompt {
  const { chat, kind } = o;
  const preset = activePreset(s);
  const persona = currentPersona(s, chat);
  const char = speakingCharacter(s, chat, o.charId);
  const env = macroEnv(s, chat, char, persona);
  const sub = (t: string) => substituteMacros(t, env);
  const isGroup = chat.ownerType === 'group';
  const tokMode = s.format.tokenizer;
  const tok = (t: string) => estimateTokens(t, tokMode);
  const userName = env.user!;
  const regexOn = s.ext.enabled.regex;

  // История, которую видит модель
  let history = (o.history ?? chat.messages).filter((m) => !m.hidden);
  let prefill: string | undefined;
  if (kind === 'continue') {
    const last = history[history.length - 1];
    if (last) prefill = last.text;
  }
  const histText = (m: Message, depth: number) => {
    let t = m.text;
    if (regexOn) t = applyRegex(scriptsFor(s, m.charId ?? char?.id), t, { isUser: m.isUser, depth, target: 'prompt' });
    return sub(t);
  };

  // Лорбук
  const wi = scanWorldInfo({
    books: activeBooks(s, chat, persona),
    messages: history.map((m) => ({ name: displayName(s, m, userName), text: m.text })),
    settings: s.wi,
    maxContext: preset.maxContext,
    chatId: chat.id,
    dryRun: o.dryRun,
  });

  // Инъекции на глубину
  const inj: Injection[] = [];
  const an = chat.authorNote;
  const userTurns = history.filter((m) => m.isUser).length;
  const anActive = an.enabled && an.text.trim() && (an.interval <= 0 || userTurns % an.interval === 0);
  let anText = anActive ? sub(an.text) : '';
  if (persona?.description && persona.position === 'top_an') anText = sub(persona.description) + (anText ? '\n' + anText : '');
  if (persona?.description && persona.position === 'bottom_an') anText = (anText ? anText + '\n' : '') + sub(persona.description);
  if (wi.anTop) anText = wi.anTop + (anText ? '\n' + anText : '');
  if (wi.anBottom) anText = (anText ? anText + '\n' : '') + wi.anBottom;
  if (anText) inj.push({ depth: an.depth, role: an.role, content: anText, name: tr('Заметка автора') });
  if (persona?.description && persona.position === 'at_depth')
    inj.push({ depth: persona.depth, role: persona.role, content: sub(persona.description), name: tr('Персона (глубина)') });
  if (char?.depth_prompt?.prompt?.trim())
    inj.push({ depth: char.depth_prompt.depth, role: char.depth_prompt.role, content: sub(char.depth_prompt.prompt), name: tr('Заметка персонажа') });
  for (const d of wi.depth) inj.push({ depth: d.depth, role: d.role, content: sub(d.content), name: tr('Лорбук (глубина)') });
  const summary = s.ext.enabled.summarize && chat.summary?.trim()
    ? sub(s.ext.summarize.template.replace('{{summary}}', chat.summary))
    : '';
  if (summary && s.ext.summarize.position === 'depth')
    inj.push({ depth: s.ext.summarize.depth, role: s.ext.summarize.role, content: summary, name: tr('Пересказ') });

  const personaInPrompt = persona?.description && persona.position === 'in_prompt' ? env.persona! : '';
  const examples = parseExamples(env.mesExamples ?? '');
  const wiBefore = sub(wi.before);
  const wiAfter = sub(wi.after);

  const budget = preset.unlockedContext ? 10_000_000 : Math.max(512, preset.maxContext - preset.maxTokens);
  const items: { name: string; tokens: number }[] = [];

  const isChat = s.api.main === 'chat';
  if (isChat && !(s.format.instructEnabled && s.format.instructForChat)) {
    return buildChatCompletion();
  }
  return buildTextCompletion();

  // ───────────────────────── Chat Completion ─────────────────────────
  function buildChatCompletion(): BuiltPrompt {
    const before: ChatMsg[] = [];
    const after: ChatMsg[] = [];
    let historySlot = -1;
    const absolute: Injection[] = [];
    const sysOverride = s.format.sysPromptEnabled ? s.sysPrompts.find((p) => p.id === s.format.sysPromptId)?.content ?? '' : '';

    for (const p of preset.prompts) {
      if (!p.enabled) continue;
      if (p.id === 'chatHistory') {
        historySlot = before.length;
        continue;
      }
      if (!p.marker && p.position === 'absolute') {
        if (p.content.trim()) absolute.push({ depth: p.depth, role: p.role, content: sub(p.content), name: p.name });
        continue;
      }
      let content = '';
      switch (p.id) {
        case 'main': {
          const original = sub(sysOverride || p.content);
          content = char?.system_prompt?.trim() ? substituteMacros(char.system_prompt, { ...env, original }) : original;
          break;
        }
        case 'worldInfoBefore':
          content = [wiBefore, summary && s.ext.summarize.position === 'before' ? summary : ''].filter(Boolean).join('\n');
          break;
        case 'worldInfoAfter':
          content = [wiAfter, summary && s.ext.summarize.position === 'after' ? summary : ''].filter(Boolean).join('\n');
          break;
        case 'charDescription':
          content = isGroup ? groupDescriptions() : env.description ?? '';
          break;
        case 'charPersonality':
          content = !isGroup && env.personality ? tr('Личность {0}: {1}', env.char, env.personality) : '';
          break;
        case 'scenario':
          content = env.scenario ? tr('Сценарий: {0}', env.scenario) : '';
          break;
        case 'personaDescription':
          content = personaInPrompt;
          break;
        case 'dialogueExamples':
          if (examples.length)
            content = [wi.emTop, ...examples.map((e) => `${sub(preset.newExampleChatPrompt)}\n${e}`), wi.emBottom].filter(Boolean).join('\n\n');
          break;
        case 'jailbreak': {
          const original = sub(p.content);
          content = char?.post_history_instructions?.trim() ? substituteMacros(char.post_history_instructions, { ...env, original }) : original;
          break;
        }
        default:
          content = sub(p.content);
      }
      if (!content.trim()) continue;
      const msg: ChatMsg = { role: p.role, content };
      if (historySlot >= 0) after.push(msg);
      else before.push(msg);
      items.push({ name: p.name, tokens: tok(content) });
    }
    if (historySlot < 0) historySlot = before.length;

    // Хвост: служебные подсказки
    const tail: ChatMsg[] = [];
    if (kind === 'impersonate') tail.push({ role: 'system', content: sub(preset.impersonationPrompt) });
    else if (kind === 'continue' && s.api.chatSource !== 'claude') tail.push({ role: 'system', content: sub(preset.continuePrompt) });
    else if (kind === 'quiet' && o.quietPrompt) tail.push({ role: 'system', content: sub(o.quietPrompt) });
    else if (isGroup && char && kind !== 'quiet') tail.push({ role: 'system', content: sub(preset.groupNudgePrompt) });
    tail.forEach((t) => items.push({ name: tr('Служебный промпт'), tokens: tok(t.content) }));

    const fixed = [...before, ...after, ...tail].reduce((a, m) => a + tok(m.content) + 4, 0);
    const injAll = [...inj, ...absolute];
    const injTokens = injAll.reduce((a, x) => a + tok(x.content), 0);

    // История с конца, пока влезает
    const hist: ChatMsg[] = [];
    let used = fixed + injTokens;
    const startPrompt = sub(isGroup ? preset.newGroupChatPrompt : preset.newChatPrompt);
    used += tok(startPrompt);
    let histTokens = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      const depth = history.length - 1 - i;
      let content = histText(m, depth);
      if (m.isSystem) {
        hist.unshift({ role: 'system', content });
      } else {
        if (isGroup) content = `${displayName(s, m, userName)}: ${content}`;
        hist.unshift({ role: m.isUser ? 'user' : 'assistant', content, images: m.images });
      }
      const t = tok(content) + 4;
      if (used + t > budget && hist.length > 1) {
        hist.shift();
        break;
      }
      used += t;
      histTokens += t;
    }
    // Инъекции: depth 0 — после последнего сообщения
    injAll
      .sort((a, b) => b.depth - a.depth)
      .forEach((x) => {
        const pos = Math.max(0, hist.length - Math.max(0, x.depth));
        hist.splice(pos, 0, { role: x.role, content: x.content });
        items.push({ name: x.name, tokens: tok(x.content) });
      });
    if (startPrompt.trim()) hist.unshift({ role: 'system', content: startPrompt });
    items.push({ name: tr('История чата'), tokens: histTokens });

    let messages = [...before.slice(0, historySlot), ...hist, ...before.slice(historySlot), ...after, ...tail];
    if (preset.squashSystem) messages = squash(messages);
    const stop = customStops();
    const tokens = messages.reduce((a, m) => a + tok(m.content) + 4, 0);
    return { messages, stop, items, tokens, wi, env, char, persona, prefill };
  }

  // ───────────────────────── Text Completion ─────────────────────────
  function buildTextCompletion(): BuiltPrompt {
    const ctx = s.contextTemplates.find((c) => c.id === s.format.contextId) ?? s.contextTemplates[0];
    const ins: InstructTemplate | undefined = s.format.instructEnabled
      ? s.instructTemplates.find((i) => i.id === s.format.instructId)
      : undefined;
    const sysText = s.format.sysPromptEnabled ? sub(s.sysPrompts.find((p) => p.id === s.format.sysPromptId)?.content ?? '') : '';
    const system = char?.system_prompt?.trim() ? substituteMacros(char.system_prompt, { ...env, original: sysText }) : sysText;

    const story = renderStoryString(ctx.storyString, {
      system,
      description: isGroup ? groupDescriptions() : env.description ?? '',
      personality: isGroup ? '' : env.personality ?? '',
      scenario: env.scenario ?? '',
      persona: personaInPrompt,
      wiBefore: [wiBefore, summary && s.ext.summarize.position === 'before' ? summary : ''].filter(Boolean).join('\n'),
      wiAfter: [wiAfter, summary && s.ext.summarize.position === 'after' ? summary : ''].filter(Boolean).join('\n'),
      loreBefore: wiBefore,
      loreAfter: wiAfter,
      mesExamples: env.mesExamples ?? '',
      char: env.char!,
      user: userName,
    });
    let storyText = sub(story);
    if (ctx.collapseNewlines) storyText = storyText.replace(/\n{3,}/g, '\n\n');
    const wrapSys = (t: string) => (ins ? ins.systemPrefix + t + ins.systemSuffix : t + '\n');
    const header = storyText.trim() ? wrapSys(storyText.trim()) : '';
    items.push({ name: tr('Шаблон контекста'), tokens: tok(header) });

    let exampleText = '';
    if (examples.length) {
      const sep = ctx.exampleSeparator ? sub(ctx.exampleSeparator) + '\n' : '';
      exampleText = [wi.emTop, ...examples.map((e) => sep + e), wi.emBottom].filter(Boolean).join('\n') + '\n';
      items.push({ name: tr('Примеры диалогов'), tokens: tok(exampleText) });
    }
    const chatStart = ctx.chatStart ? sub(ctx.chatStart) + '\n' : '';

    const addNames = ins ? ins.names || isGroup : true;
    const line = (m: { isUser: boolean; isSystem?: boolean; name: string; text: string }, isLast = false) => {
      const nm = addNames || ctx.alwaysAddCharName ? `${m.name}: ` : '';
      if (!ins) return `${m.isSystem ? '' : nm}${m.text}${isLast ? '' : '\n'}`;
      if (m.isSystem) return ins.systemPrefix + m.text + ins.systemSuffix;
      const pre = m.isUser ? ins.userPrefix : ins.assistantPrefix;
      const suf = m.isUser ? ins.userSuffix : ins.assistantSuffix;
      return pre + nm + m.text + (isLast ? '' : suf) + (ins.wrap && !isLast ? '\n' : '');
    };

    // Хвост-подсказка для модели
    const targetName = kind === 'impersonate' ? userName : env.char!;
    let tail = '';
    if (kind !== 'continue') {
      const quiet = kind === 'quiet' && o.quietPrompt ? line({ isUser: false, isSystem: true, name: '', text: sub(o.quietPrompt) }) : '';
      const pre = ins ? (kind === 'impersonate' ? ins.userPrefix : ins.assistantPrefix) : '';
      tail = quiet + pre + (kind === 'quiet' ? '' : `${targetName}:`);
      if (kind === 'impersonate' && !ins) tail = quiet + `${userName}:`;
    }

    const fixed = tok(header + exampleText + chatStart + tail) + inj.reduce((a, x) => a + tok(x.content), 0);
    const lines: string[] = [];
    let used = fixed;
    let histTokens = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      const isLast = kind === 'continue' && i === history.length - 1;
      const l = line({ isUser: m.isUser, isSystem: m.isSystem, name: displayName(s, m, userName), text: histText(m, history.length - 1 - i) }, isLast);
      const t = tok(l);
      if (used + t > budget && lines.length) break;
      lines.unshift(l);
      used += t;
      histTokens += t;
    }
    inj
      .sort((a, b) => b.depth - a.depth)
      .forEach((x) => {
        const pos = Math.max(0, lines.length - Math.max(0, x.depth));
        lines.splice(pos, 0, ins ? ins.systemPrefix + x.content + ins.systemSuffix : x.content + '\n');
        items.push({ name: x.name, tokens: tok(x.content) });
      });
    items.push({ name: tr('История чата'), tokens: histTokens });

    let prompt = header + exampleText + chatStart + lines.join('') + tail;
    if (ctx.collapseNewlines) prompt = prompt.replace(/\n{3,}/g, '\n\n');

    const stop = customStops();
    if (ins?.stopSequence) stop.push(ins.stopSequence);
    if (ins?.userPrefix.trim()) stop.push(ins.userPrefix.trim());
    if (kind !== 'impersonate') stop.push(`\n${userName}:`);
    else stop.push(`\n${env.char}:`);
    if (isGroup) {
      const g = s.groups[chat.ownerId];
      g?.members.forEach((id) => {
        const n = s.characters[id]?.name;
        if (n && n !== env.char) stop.push(`\n${n}:`);
      });
    }
    return { prompt, stop: [...new Set(stop.filter(Boolean))], items, tokens: tok(prompt), wi, env, char, persona, prefill };
  }

  function groupDescriptions(): string {
    const g = s.groups[chat.ownerId];
    if (!g) return '';
    return g.members
      .filter((id) => !g.disabledMembers.includes(id) || id === char?.id)
      .map((id) => s.characters[id])
      .filter(Boolean)
      .map((c) => {
        const e = { ...env, char: c!.name };
        const parts = [
          substituteMacros(c!.description, e),
          c!.personality ? tr('Личность {0}: {1}', c!.name, substituteMacros(c!.personality, e)) : '',
        ].filter(Boolean);
        return `### ${c!.name}\n${parts.join('\n')}`;
      })
      .join('\n\n');
  }

  function customStops(): string[] {
    try {
      const arr = JSON.parse(sub(s.format.customStops || '[]'));
      return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}

function squash(msgs: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === 'system' && m.role === 'system') last.content += '\n\n' + m.content;
    else out.push({ ...m });
  }
  return out;
}

/** Постобработка ответа модели. */
export function cleanResponse(
  s: State,
  raw: string,
  opts: { charName: string; userName: string; stop: string[]; kind: GenKind; isGroup: boolean },
): { text: string; reasoning: string } {
  let text = raw;
  let reasoning = '';
  const { reasoningPrefix: rp, reasoningSuffix: rs } = s.format;
  if (s.format.autoParseReasoning && rp && rs) {
    const t = text.trimStart();
    if (t.startsWith(rp)) {
      const end = t.indexOf(rs);
      if (end >= 0) {
        reasoning = t.slice(rp.length, end).trim();
        text = t.slice(end + rs.length);
      } else {
        reasoning = t.slice(rp.length).trim();
        text = '';
      }
    }
  }
  for (const st of opts.stop) {
    if (!st) continue;
    const i = text.indexOf(st);
    if (i > 0 || (i === 0 && opts.kind !== 'continue')) text = text.slice(0, i);
  }
  if (opts.kind !== 'continue') {
    text = text.replace(/^\s+/, '');
    const own = opts.kind === 'impersonate' ? opts.userName : opts.charName;
    if (own && text.startsWith(own + ':')) text = text.slice(own.length + 1).trimStart();
  }
  const ctx = s.contextTemplates.find((c) => c.id === s.format.contextId);
  if (ctx?.trimIncomplete) {
    const m = /^([\s\S]*[.!?…»"*)\]~])[^.!?…»"*)\]~]*$/.exec(text);
    if (m && m[1].length > text.length * 0.5) text = m[1];
  }
  text = text.replace(/\s+$/, '');
  return { text, reasoning };
}
