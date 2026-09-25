// Импорт и экспорт чатов. Основной формат — JSONL SillyTavern (одиночные и групповые чаты),
// при импорте также понимаем форматы, которые умеет читать SillyTavern: Oobabooga, Agnai, CAI Tools, RisuAI.
import { tr } from './i18n';
import type { Chat, Message, Role } from '../types';
import { activeChat, getState, newChatObject, setState, toast, userName, type State } from '../store';
import { openChat } from './chats';
import { download, safeName, uid } from './util';

// ── Даты в формате SillyTavern ──

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-09-23@02h06m11s — так ST пишет create_date и имена файлов чатов. */
export function stDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}@${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Разбирает даты ST: ISO, числа, «2026-09-23@02h06m11s» и старое «September 23, 2026 2:06am». */
export function parseStDate(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const at = /^(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/.exec(v);
  if (at) return new Date(+at[1], +at[2] - 1, +at[3], +at[4], +at[5], +at[6]).getTime();
  const old = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(v.trim());
  if (old) {
    const m = MONTHS.indexOf(old[1].toLowerCase());
    let h = +old[4];
    if (old[6]?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (old[6]?.toLowerCase() === 'am' && h === 12) h = 0;
    if (m >= 0) return new Date(+old[3], m, +old[2], h, +old[5]).getTime();
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

// ── Экспорт ──

const AN_POSITION: Record<Chat['authorNote']['position'], number> = { after: 0, depth: 1, before: 2 };
const ROLE_NUM: Record<Role, number> = { system: 0, user: 1, assistant: 2 };

function ownerName(s: State, c: Chat): string {
  return (c.ownerType === 'group' ? s.groups[c.ownerId]?.name : s.characters[c.ownerId]?.name) ?? 'chat';
}

/** Чат в JSONL SillyTavern: первая строка — заголовок с chat_metadata, дальше по строке на сообщение. */
export function chatToJsonl(s: State, c: Chat): string {
  const an = c.authorNote;
  const book = c.lorebookIds.map((id) => s.lorebooks[id]?.name).find(Boolean);
  const header = {
    user_name: userName(s, c),
    character_name: c.ownerType === 'group' ? 'unused' : ownerName(s, c),
    create_date: stDate(c.createdAt),
    chat_metadata: {
      ...(c.stMeta ?? {}),
      note_prompt: an.text,
      note_interval: an.enabled ? Math.max(1, an.interval) : 0,
      note_position: AN_POSITION[an.position],
      note_depth: an.depth,
      note_role: ROLE_NUM[an.role],
      variables: c.vars,
      ...(book ? { world_info: book } : {}),
      divinax: { name: c.name, summary: c.summary, lorebooks: c.lorebookIds.map((id) => s.lorebooks[id]?.name).filter(Boolean) },
    },
  };
  return [JSON.stringify(header), ...c.messages.map((m) => JSON.stringify(toStMessage(s, c, m)))].join('\n');
}

/** Ключи extra, которые Divinax хранит в своих полях сообщения; всё остальное живёт в Message.stExtra. */
const OWN_EXTRA = new Set(['type', 'reasoning', 'display_text', 'gen_time', 'token_count', 'model', 'image', 'inline_image']);

/** extra сообщения ST без полей, которые Divinax хранит сам (undefined, если ничего не осталось). */
export function foreignExtra(extra: unknown): Record<string, unknown> | undefined {
  if (!extra || typeof extra !== 'object') return undefined;
  const rest = Object.fromEntries(Object.entries(extra as Record<string, unknown>).filter(([k, v]) => !OWN_EXTRA.has(k) && v !== undefined));
  return Object.keys(rest).length ? JSON.parse(JSON.stringify(rest)) : undefined;
}

/** Ключи chat_metadata, которые Divinax разбирает сам; остальное — данные расширений (Chat.stMeta). */
const OWN_META = new Set(['note_prompt', 'note_interval', 'note_position', 'note_depth', 'note_role', 'variables', 'world_info', 'divinax']);

/** Сообщение в формате SillyTavern (строка JSONL и элемент context.chat для расширений). */
export function toStMessage(s: State, c: Chat, m: Message): Record<string, unknown> {
  const ch = m.charId ? s.characters[m.charId] : undefined;
  const iso = new Date(m.date).toISOString();
  const extra: Record<string, unknown> = structuredClone(m.stExtra ?? {});
  if (m.isSystem) extra.type = 'narrator';
  if (m.reasoning) extra.reasoning = m.reasoning;
  if (m.translation) extra.display_text = m.translation;
  if (m.genTime) extra.gen_time = m.genTime;
  if (m.tokens) extra.token_count = m.tokens;
  const model = m.swipeInfo[m.swipeId]?.model;
  if (model) extra.model = model;
  if (m.images?.length) {
    extra.image = m.images[0];
    extra.inline_image = true;
  }
  const line: Record<string, unknown> = {
    name: m.name,
    is_user: m.isUser,
    // в ST is_system — «скрыто от ИИ», а системное сообщение помечается extra.type = narrator
    is_system: m.hidden,
    send_date: iso,
    mes: m.text,
    extra,
  };
  if (!m.isUser && !m.isSystem) {
    line.swipes = m.swipes;
    line.swipe_id = m.swipeId;
    line.swipe_info = m.swipes.map((_, i) => {
      const inf = m.swipeInfo[i];
      const date = new Date(inf?.date ?? m.date).toISOString();
      return { send_date: date, gen_started: date, gen_finished: date, extra: inf?.reasoning ? { reasoning: inf.reasoning } : {} };
    });
    if (c.ownerType === 'group' && ch) line.original_avatar = `${ch.name}.png`;
  }
  return line;
}

export function chatToText(c: Chat): string {
  return c.messages
    .filter((m) => !m.hidden)
    .map((m) => `${m.name}: ${m.text}`)
    .join('\n\n');
}

export function exportChat(chatId: string, format: 'jsonl' | 'txt' = 'jsonl') {
  const s = getState();
  const c = s.chats[chatId];
  if (!c) return;
  const owner = ownerName(s, c);
  // чаты из ST уже называются «Имя - дата» — не повторяем имя дважды
  const base = safeName(c.name.startsWith(owner) ? c.name : `${owner} - ${c.name}`);
  if (format === 'txt') download(`${base}.txt`, chatToText(c), 'text/plain');
  else download(`${base}.jsonl`, chatToJsonl(s, c), 'application/jsonl');
}

// ── Импорт ──

interface RawMsg {
  name?: string;
  isUser: boolean;
  isSystem?: boolean;
  hidden?: boolean;
  text: string;
  swipes?: string[];
  swipeId?: number;
  swipeInfo?: Message['swipeInfo'];
  date?: number;
  reasoning?: string;
  translation?: string;
  genTime?: number;
  images?: string[];
  stExtra?: Record<string, unknown>;
}

export interface ParsedChat {
  name: string;
  characterName?: string; // из файла, если известно
  userName?: string;
  group?: boolean;
  createdAt?: number;
  meta: Record<string, any>;
  messages: RawMsg[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function fromStLine(j: any): RawMsg | null {
  if (typeof j?.mes !== 'string') return null;
  const swipes: string[] = Array.isArray(j.swipes) && j.swipes.length ? j.swipes.map(str) : [j.mes];
  const swipeId = Math.min(swipes.length - 1, Math.max(0, Number(j.swipe_id ?? 0) || 0));
  const date = parseStDate(j.send_date) ?? Date.now();
  const info = Array.isArray(j.swipe_info) ? j.swipe_info : [];
  const narrator = j.extra?.type === 'narrator';
  const img = j.extra?.image;
  return {
    name: str(j.name),
    isUser: Boolean(j.is_user),
    isSystem: narrator,
    hidden: Boolean(j.is_system) && !narrator,
    // активный свайп хранится и в mes, и в swipes — при расхождении верим mes
    text: j.mes,
    swipes: swipes.map((t, i) => (i === swipeId ? j.mes : t)),
    swipeId,
    swipeInfo: swipes.map((_, i) => ({
      date: parseStDate(info[i]?.send_date) ?? date,
      reasoning: info[i]?.extra?.reasoning || (i === swipeId ? j.extra?.reasoning : undefined) || undefined,
      model: i === swipeId ? j.extra?.model : undefined,
    })),
    date,
    reasoning: j.extra?.reasoning || undefined,
    translation: j.extra?.display_text || undefined,
    genTime: j.extra?.gen_time,
    images: typeof img === 'string' && /^(data:image\/|https?:)/.test(img) ? [img] : undefined,
    stExtra: foreignExtra(j.extra),
  };
}

function parseJsonl(text: string, fileName: string): ParsedChat | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const out: ParsedChat = { name: fileName, meta: {}, messages: [] };
  let valid = false;
  for (const [i, l] of lines.entries()) {
    let j: any;
    try {
      j = JSON.parse(l);
    } catch {
      continue;
    }
    if (i === 0 && j && j.mes === undefined && (j.chat_metadata || j.user_name || j.character_name)) {
      valid = true;
      out.meta = j.chat_metadata ?? {};
      out.userName = j.user_name && j.user_name !== 'unused' ? str(j.user_name) : undefined;
      if (j.character_name === 'unused' || j.character_name === undefined) out.group = true;
      else out.characterName = str(j.character_name);
      out.createdAt = parseStDate(j.create_date);
      if (out.meta.divinax?.name) out.name = str(out.meta.divinax.name);
      continue;
    }
    const m = fromStLine(j);
    if (m) {
      valid = true;
      out.messages.push(m);
    }
  }
  return valid ? out : null;
}

/** Oobabooga: { internal|data: [[user, bot]…], visible|data_visible: … }. */
function parseOoba(j: any, name: string): ParsedChat | null {
  const pairs = j.internal ?? j.data ?? j.visible ?? j.data_visible;
  if (!Array.isArray(pairs) || !pairs.every((p: unknown) => Array.isArray(p))) return null;
  const messages: RawMsg[] = [];
  for (const [u, b] of pairs as string[][]) {
    if (u && u !== '<|BEGIN-VISIBLE-CHAT|>') messages.push({ isUser: true, text: str(u) });
    if (b) messages.push({ isUser: false, text: str(b) });
  }
  return { name, meta: {}, messages };
}

/** Agnai: { name, messages: [{ msg, userId?, characterId? }] }. */
function parseAgnai(j: any, name: string): ParsedChat | null {
  if (!Array.isArray(j.messages) || !j.messages.some((m: any) => typeof m?.msg === 'string')) return null;
  return {
    name: j.name ? str(j.name) : name,
    meta: {},
    messages: j.messages
      .filter((m: any) => typeof m?.msg === 'string')
      .map((m: any) => ({ isUser: Boolean(m.userId), text: m.msg, date: parseStDate(m.createdAt) })),
  };
}

/** CAI Tools: { info: { character: { name } }, histories: { histories: [{ msgs: [{ src: { is_human }, text }] }] } }. */
function parseCai(j: any, name: string): ParsedChat[] | null {
  const hs = j.histories?.histories;
  if (!Array.isArray(hs)) return null;
  const charName = j.info?.character?.name ? str(j.info.character.name) : undefined;
  return hs
    .map((h: any, i: number) => ({
      name: hs.length > 1 ? `${name} (${i + 1})` : name,
      characterName: charName,
      meta: {},
      messages: (h.msgs ?? [])
        .filter((m: any) => typeof m?.text === 'string')
        .map((m: any) => ({ isUser: Boolean(m.src?.is_human), text: m.text })),
    }))
    .filter((c: ParsedChat) => c.messages.length);
}

/** RisuAI: { type: 'risuChat', data: { name, message: [{ role: 'user' | 'char', data }] } }. */
function parseRisu(j: any, name: string): ParsedChat | null {
  const msgs = j.data?.message ?? j.message;
  if (!Array.isArray(msgs)) return null;
  return {
    name: j.data?.name ? str(j.data.name) : name,
    meta: {},
    messages: msgs
      .filter((m: any) => typeof m?.data === 'string')
      .map((m: any) => ({ isUser: m.role === 'user', text: m.data, date: parseStDate(m.time) })),
  };
}

/** Разбирает файл чата любого поддерживаемого формата. Пустой массив — формат не распознан. */
export function parseChatFile(text: string, fileName: string): ParsedChat[] {
  const name = fileName.replace(/\.(jsonl|json|txt)$/i, '');
  const t = text.trim();
  // JSONL: несколько JSON-объектов построчно (или один объект с полем mes/chat_metadata)
  if (t.startsWith('{') && (/\n\s*\{/.test(t) || /"(mes|chat_metadata)"\s*:/.test(t.slice(0, 2000)))) {
    const st = parseJsonl(t, name);
    if (st) return [st];
  }
  let j: any;
  try {
    j = JSON.parse(t);
  } catch {
    return [];
  }
  if (Array.isArray(j)) {
    // массив сообщений ST
    const messages = j.map(fromStLine).filter(Boolean) as RawMsg[];
    return messages.length ? [{ name, meta: {}, messages }] : [];
  }
  const cai = parseCai(j, name);
  if (cai) return cai;
  const one = (j.type === 'risuChat' ? parseRisu(j, name) : null) ?? parseAgnai(j, name) ?? parseOoba(j, name);
  return one ? [one] : [];
}

type Owner = { ownerType: 'char' | 'group'; ownerId: string };

function findOwner(s: State, p: ParsedChat, fallback?: Owner): Owner | undefined {
  if (p.characterName) {
    const n = p.characterName.trim().toLowerCase();
    const ch = Object.values(s.characters).find((c) => c.name.trim().toLowerCase() === n);
    if (ch) return { ownerType: 'char', ownerId: ch.id };
  }
  return fallback;
}

/** Собирает объект чата из разобранного файла для указанного владельца. */
export function buildChat(s: State, p: ParsedChat, owner: Owner): Chat {
  const chat = newChatObject(owner.ownerType, owner.ownerId, p.name);
  if (p.createdAt) chat.createdAt = p.createdAt;
  const members = owner.ownerType === 'group' ? (s.groups[owner.ownerId]?.members ?? []) : [owner.ownerId];
  const byName = new Map(members.map((id) => [s.characters[id]?.name.trim().toLowerCase(), id] as const));
  const charName = owner.ownerType === 'char' ? s.characters[owner.ownerId]?.name : undefined;
  const uname = p.userName ?? userName(s, chat);

  const meta = p.meta ?? {};
  if (typeof meta.note_prompt === 'string') {
    const an = chat.authorNote;
    an.text = meta.note_prompt;
    const interval = Number(meta.note_interval ?? 1);
    an.enabled = Boolean(meta.note_prompt.trim()) && interval !== 0;
    an.interval = interval > 1 ? interval : 0;
    an.position = meta.note_position === 0 ? 'after' : meta.note_position === 2 ? 'before' : 'depth';
    if (Number.isFinite(Number(meta.note_depth))) an.depth = Number(meta.note_depth);
    an.role = (['system', 'user', 'assistant'] as Role[])[Number(meta.note_role)] ?? an.role;
  }
  if (meta.variables && typeof meta.variables === 'object') {
    chat.vars = Object.fromEntries(Object.entries(meta.variables).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  }
  if (meta.divinax?.summary) chat.summary = str(meta.divinax.summary);
  const stMeta = Object.fromEntries(Object.entries(meta).filter(([k]) => !OWN_META.has(k)));
  if (Object.keys(stMeta).length) chat.stMeta = stMeta;
  // лорбуки чата: по названию среди уже импортированных
  const bookNames: string[] = [...(Array.isArray(meta.divinax?.lorebooks) ? meta.divinax.lorebooks : []), ...(meta.world_info ? [meta.world_info] : [])].map(str);
  const books = Object.values(s.lorebooks);
  chat.lorebookIds = [...new Set(bookNames.map((n) => books.find((b) => b.name === n)?.id).filter((x): x is string => Boolean(x)))];

  for (const r of p.messages) {
    const date = r.date ?? Date.now();
    const swipes = r.swipes?.length ? r.swipes : [r.text];
    const name = r.name || (r.isUser ? uname : (charName ?? ''));
    chat.messages.push({
      id: uid(),
      name,
      isUser: r.isUser,
      isSystem: r.isSystem || undefined,
      charId: r.isUser || r.isSystem ? undefined : (byName.get(name.trim().toLowerCase()) ?? (owner.ownerType === 'char' ? owner.ownerId : undefined)),
      text: r.text,
      swipes,
      swipeId: r.swipeId ?? 0,
      swipeInfo: r.swipeInfo?.length === swipes.length ? r.swipeInfo : swipes.map(() => ({ date })),
      date,
      hidden: Boolean(r.hidden),
      reasoning: r.reasoning,
      translation: r.translation,
      genTime: r.genTime,
      images: r.images,
      stExtra: r.stExtra,
    });
  }
  const last = chat.messages[chat.messages.length - 1];
  chat.updatedAt = Math.max(chat.createdAt, last?.date ?? 0) || Date.now();
  return chat;
}

/**
 * Импорт файлов чатов. Чат достаётся персонажу, чьё имя записано в файле (character_name),
 * иначе — владельцу открытого чата (или target). Возвращает число импортированных чатов.
 */
export async function importChatFiles(files: File[], target?: Owner): Promise<number> {
  let count = 0;
  let lastId = '';
  for (const f of files) {
    try {
      const parsed = parseChatFile(await f.text(), f.name);
      if (!parsed.length) throw new Error(tr('не похоже на чат (JSONL SillyTavern, Oobabooga, Agnai, CAI Tools, RisuAI)'));
      for (const p of parsed) {
        const s = getState();
        const cur = activeChat(s);
        const fallback = target ?? (cur ? { ownerType: cur.ownerType, ownerId: cur.ownerId } : undefined);
        // групповой чат ST не хранит имени владельца — кладём в открытый чат
        const owner = p.group ? fallback : findOwner(s, p, fallback);
        if (!owner) throw new Error(tr('персонаж «{0}» не найден — откройте чат персонажа и импортируйте ещё раз', p.characterName ?? '?'));
        const chat = buildChat(s, p, owner);
        setState((st) => ({ chats: { ...st.chats, [chat.id]: chat } }));
        lastId = chat.id;
        count++;
        const who = owner.ownerType === 'group' ? s.groups[owner.ownerId]?.name : s.characters[owner.ownerId]?.name;
        toast(tr('Чат «{0}» импортирован: {1}', chat.name, who ?? ''), 'success');
      }
    } catch (e) {
      toast(`${f.name}: ${(e as Error).message}`, 'error');
    }
  }
  if (lastId) openChat(lastId);
  return count;
}

export const CHAT_FILE_ACCEPT = '.jsonl,.json';
