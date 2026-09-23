// Совместимый слой с API SillyTavern для сторонних расширений.
// Всё, что расширения берут из script.js, extensions.js, popup.js, slash-commands.js и т.д.,
// собрано в одну таблицу имён; модули-заглушки отдают значения из неё (см. loader.ts).
import DOMPurify from 'dompurify';
import type { Chat, Message } from '../../types';
import { activeChat, activePreset, currentPersona, getState, setState, toast, updateChat, userName } from '../../store';
import { eventSource, event_types } from './events';
import { EXT_PROMPT_ROLES, EXT_PROMPT_TYPES, extensionPrompts, setExtensionPrompt } from '../extprompts';
import { toStMessage } from '../chatio';
import { makeMessage } from '../chats';
import { quietGenerate, sendMessage, stopGeneration } from '../generate';
import { lastPipe, registerCommand, runSlash } from '../slash';
import { substituteMacros } from '../macros';
import { macroEnv } from '../prompt';
import { renderMessage } from '../markdown';
import { estimateTokens, uid } from '../util';
import { tr } from '../i18n';

/** папка расширения → адрес, откуда грузятся его файлы */
export const extBases = new Map<string, string>();

// ── extension_settings ──

export const extension_settings: Record<string, any> = {};
let settingsLoaded = false;

export function loadExtensionSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;
  Object.assign(extension_settings, structuredClone(getState().userExtSettings ?? {}));
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function saveSettingsDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettingsNow, 400);
}
function saveSettingsNow() {
  try {
    setState({ userExtSettings: JSON.parse(JSON.stringify(extension_settings)) });
  } catch (e) {
    console.error('[Divinax] не удалось сохранить extension_settings', e);
  }
}

// ── Живые данные чата в формате ST ──

let chatCache: { chat?: Chat; arr: Record<string, any>[]; ids: string[] } = { arr: [], ids: [] };

function liveChat(): Record<string, any>[] {
  const s = getState();
  const c = activeChat(s);
  if (!c) return (chatCache = { arr: [], ids: [] }).arr;
  if (chatCache.chat === c) return chatCache.arr;
  chatCache = { chat: c, arr: c.messages.map((m) => toStMessage(s, c, m)), ids: c.messages.map((m) => m.id) };
  return chatCache.arr;
}

/** Переносит правки расширения в context.chat обратно в Divinax. */
function saveChat() {
  const { chat, arr, ids } = chatCache;
  if (!chat) return Promise.resolve();
  updateChat(chat.id, (c) => {
    arr.forEach((st, i) => {
      const id = ids[i];
      const idx = id ? c.messages.findIndex((x) => x.id === id) : -1;
      const mes = typeof st.mes === 'string' ? st.mes : '';
      if (idx < 0) {
        // расширение добавило сообщение через chat.push
        const nm: Message = makeMessage({ text: mes, name: String(st.name ?? ''), isUser: Boolean(st.is_user) });
        nm.hidden = Boolean(st.is_system);
        c.messages.push(nm);
        ids[i] = nm.id;
        return;
      }
      const m = c.messages[idx];
      const shown = typeof st.extra?.display_text === 'string' && st.extra.display_text ? st.extra.display_text : undefined;
      const hidden = Boolean(st.is_system);
      if (m.text === mes && m.translation === shown && m.hidden === hidden) return;
      // сообщения в хранилище неизменяемые — заменяем объект целиком
      const swipes = [...m.swipes];
      swipes[m.swipeId] = mes;
      c.messages[idx] = { ...m, text: mes, swipes, translation: shown, hidden };
    });
  });
  return Promise.resolve();
}

function liveArray(get: () => any[]): any[] {
  return new Proxy([], {
    get: (_t, p) => {
      const a = get();
      const v = Reflect.get(a, p, a);
      return typeof v === 'function' ? v.bind(a) : v;
    },
    set: (_t, p, v) => Reflect.set(get(), p, v),
    has: (_t, p) => Reflect.has(get(), p),
  });
}

function liveObject(get: () => Record<string, any>): Record<string, any> {
  return new Proxy({}, {
    get: (_t, p) => Reflect.get(get(), p),
    set: (_t, p, v) => Reflect.set(get(), p, v),
    has: (_t, p) => Reflect.has(get(), p),
    deleteProperty: (_t, p) => Reflect.deleteProperty(get(), p),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, p) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), p);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

// chat_metadata: отдельный объект на чат, сохраняется в Chat.stMeta
const metaObjs = new Map<string, Record<string, any>>();
function chatMetadata(): Record<string, any> {
  const c = activeChat(getState());
  if (!c) return {};
  let o = metaObjs.get(c.id);
  if (!o) {
    o = structuredClone(c.stMeta ?? {}) as Record<string, any>;
    metaObjs.set(c.id, o);
  }
  return o;
}
function saveMetadata() {
  const c = activeChat(getState());
  const o = c && metaObjs.get(c.id);
  if (c && o) updateChat(c.id, (cc) => void (cc.stMeta = JSON.parse(JSON.stringify(o))));
  return Promise.resolve();
}

function charList() {
  return Object.values(getState().characters).map((c) => {
    const data = {
      name: c.name,
      description: c.description,
      personality: c.personality,
      scenario: c.scenario,
      first_mes: c.first_mes,
      mes_example: c.mes_example,
      creator_notes: c.creator_notes,
      system_prompt: c.system_prompt,
      post_history_instructions: c.post_history_instructions,
      alternate_greetings: c.alternate_greetings,
      tags: c.tags,
      creator: c.creator,
      character_version: c.character_version,
      extensions: c.extensions,
    };
    return { ...data, avatar: `${c.name}.png`, chat: c.id, creatorcomment: c.creator_notes, fav: c.fav, data, _divinaxId: c.id };
  });
}

function currentNames() {
  const s = getState();
  const c = activeChat(s);
  const char = c?.ownerType === 'char' ? s.characters[c.ownerId] : undefined;
  return { name1: c ? userName(s, c) : (currentPersona(s)?.name ?? tr('Вы')), name2: char?.name ?? (c ? s.groups[c.ownerId]?.name : '') ?? '' };
}

export function substituteParams(text: string): string {
  if (typeof text !== 'string') return text;
  const s = getState();
  const c = activeChat(s);
  if (!c) return text;
  return substituteMacros(text, macroEnv(s, c, s.characters[c.ownerId], currentPersona(s, c)));
}

async function generateQuietPrompt(arg: unknown): Promise<string> {
  const prompt = typeof arg === 'object' && arg ? String((arg as any).quietPrompt ?? (arg as any).prompt ?? '') : String(arg ?? '');
  return (await quietGenerate(prompt)) ?? '';
}

async function generateRaw(arg: unknown): Promise<string> {
  const o = typeof arg === 'object' && arg ? (arg as any) : { prompt: arg };
  const p = Array.isArray(o.prompt) ? o.prompt.map((m: any) => m.content ?? '').join('\n\n') : String(o.prompt ?? '');
  return (await quietGenerate([o.systemPrompt, p].filter(Boolean).join('\n\n'))) ?? '';
}

// ── Всплывающие окна (popup.js) ──

export const POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4, CROP: 5 } as const;
export const POPUP_RESULT = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: null, CUSTOM1: 1001, CUSTOM2: 1002 } as const;

function toNode(content: unknown): Node {
  if (content instanceof Node) return content;
  if (content && typeof content === 'object' && 'jquery' in content) return (content as any)[0] ?? document.createTextNode('');
  const d = document.createElement('div');
  d.innerHTML = String(content ?? '');
  return d;
}

function showPopup(content: unknown, type: number = POPUP_TYPE.TEXT, inputValue = '', opts: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay dx-popup';
    const panel = document.createElement('section');
    panel.className = 'panel modal' + (opts.wide || opts.large ? ' wide' : '');
    const body = document.createElement('div');
    body.className = 'modal-body scroll';
    body.appendChild(toNode(content));
    let input: HTMLTextAreaElement | undefined;
    if (type === POPUP_TYPE.INPUT) {
      input = document.createElement('textarea');
      input.className = 'textarea';
      input.rows = opts.rows ?? 3;
      input.value = String(inputValue ?? '');
      body.appendChild(input);
    }
    const foot = document.createElement('div');
    foot.className = 'modal-foot';
    const done = (v: unknown) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const btn = (label: string, v: () => unknown, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (primary ? ' primary' : '');
      b.textContent = label;
      b.onclick = () => done(v());
      foot.appendChild(b);
    };
    const ok = typeof opts.okButton === 'string' ? opts.okButton : type === POPUP_TYPE.CONFIRM ? tr('Да') : 'OK';
    const cancel = typeof opts.cancelButton === 'string' ? opts.cancelButton : type === POPUP_TYPE.CONFIRM ? tr('Нет') : tr('Отмена');
    if (type === POPUP_TYPE.CONFIRM || type === POPUP_TYPE.INPUT || opts.cancelButton) btn(cancel, () => (type === POPUP_TYPE.INPUT ? null : POPUP_RESULT.NEGATIVE));
    for (const c of Array.isArray(opts.customButtons) ? opts.customButtons : [])
      btn(typeof c === 'string' ? c : String(c.text ?? ''), () => (typeof c === 'object' ? (c.result ?? POPUP_RESULT.CUSTOM1) : POPUP_RESULT.CUSTOM1));
    if (opts.okButton !== false) btn(ok, () => (type === POPUP_TYPE.INPUT ? input!.value : POPUP_RESULT.AFFIRMATIVE), true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(type === POPUP_TYPE.INPUT ? null : POPUP_RESULT.CANCELLED);
      }
    };
    window.addEventListener('keydown', onKey, true);
    overlay.onmousedown = (e) => e.target === overlay && done(POPUP_RESULT.CANCELLED);
    panel.append(body, foot);
    overlay.appendChild(panel);
    (document.querySelector('.app') ?? document.body).appendChild(overlay);
    input?.focus();
  });
}

export class Popup {
  content: unknown;
  type: number;
  inputValue: string;
  opts: Record<string, any>;
  constructor(content: unknown, type: number, inputValue = '', opts: Record<string, any> = {}) {
    this.content = content;
    this.type = type;
    this.inputValue = inputValue;
    this.opts = opts;
  }
  show() {
    return showPopup(this.content, this.type, this.inputValue, this.opts);
  }
}

const callGenericPopup = (content: unknown, type?: number, inputValue?: string, opts?: Record<string, any>) => showPopup(content, type, inputValue, opts);
/** Старый callPopup(text, 'text' | 'confirm' | 'input', value) */
function callPopup(text: unknown, type: string = 'text', inputValue = '') {
  const t = type === 'confirm' ? POPUP_TYPE.CONFIRM : type === 'input' ? POPUP_TYPE.INPUT : POPUP_TYPE.TEXT;
  return showPopup(text, t, inputValue).then((r) => (t === POPUP_TYPE.CONFIRM ? r === POPUP_RESULT.AFFIRMATIVE : r));
}

// ── Slash-команды ──

export const ARGUMENT_TYPE = {
  STRING: 'string',
  NUMBER: 'number',
  RANGE: 'range',
  BOOLEAN: 'bool',
  VARIABLE_NAME: 'varname',
  CLOSURE: 'closure',
  SUBCOMMAND: 'subcommand',
  LIST: 'list',
  DICTIONARY: 'dictionary',
};

class SlashCommandArgument {
  [k: string]: unknown;
  static fromProps(p: Record<string, unknown>) {
    return Object.assign(new SlashCommandArgument(), p);
  }
  constructor(description?: string, typeList?: unknown, isRequired = false, acceptsMultiple = false, defaultValue?: unknown, enumList?: unknown) {
    Object.assign(this, { description, typeList, isRequired, acceptsMultiple, defaultValue, enumList });
  }
}
class SlashCommandNamedArgument extends SlashCommandArgument {
  static fromProps(p: Record<string, unknown>) {
    return Object.assign(new SlashCommandNamedArgument(), p);
  }
  constructor(name?: string, description?: string, typeList?: unknown, isRequired = false, acceptsMultiple = false, defaultValue?: unknown, enumList?: unknown) {
    super(description, typeList, isRequired, acceptsMultiple, defaultValue, enumList);
    this.name = name;
  }
}
class SlashCommandEnumValue {
  constructor(public value: string, public enumType?: unknown) {}
}
class SlashCommand {
  name = '';
  callback: (named: Record<string, unknown>, unnamed: string) => unknown = () => '';
  aliases: string[] = [];
  helpString = '';
  namedArgumentList: SlashCommandNamedArgument[] = [];
  unnamedArgumentList: SlashCommandArgument[] = [];
  static fromProps(p: Partial<SlashCommand>) {
    return Object.assign(new SlashCommand(), p);
  }
}

const stripTags = (s: string) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** «key=value key2="a b" остальное» → именованные аргументы и текст. */
function parseNamed(arg: string): { named: Record<string, string>; rest: string } {
  const named: Record<string, string> = {};
  let rest = arg;
  const re = /^\s*([\w-]+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S*)/;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    let v = m[2];
    if (/^["']/.test(v)) v = v.slice(1, -1).replace(/\\(["'])/g, '$1');
    named[m[1]] = v;
    rest = rest.slice(m[0].length);
  }
  return { named, rest: rest.trim() };
}

function addSlash(cmd: SlashCommand) {
  const defaults = Object.fromEntries(
    (cmd.namedArgumentList ?? []).filter((a) => a?.name && a.defaultValue !== undefined).map((a) => [String(a.name), a.defaultValue]),
  );
  registerCommand([cmd.name, ...(cmd.aliases ?? [])], stripTags(cmd.helpString) || tr('команда расширения'), async (arg) => {
    const { named, rest } = parseNamed(arg);
    const r = await cmd.callback({ ...defaults, ...named, _scope: null, _abortController: null }, rest);
    return r == null ? undefined : typeof r === 'string' ? r : JSON.stringify(r);
  });
}

const SlashCommandParser = {
  commands: {} as Record<string, SlashCommand>,
  addCommandObject(cmd: SlashCommand) {
    this.commands[cmd.name] = cmd;
    addSlash(cmd);
  },
  addCommand(name: string, callback: SlashCommand['callback'], aliases: string[] = [], helpString = '') {
    this.addCommandObject(SlashCommand.fromProps({ name, callback, aliases, helpString }));
  },
};

function registerSlashCommand(name: string, callback: SlashCommand['callback'], aliases: string[] = [], helpString = '') {
  SlashCommandParser.addCommand(name, callback, aliases, helpString);
}

async function executeSlashCommands(text: string) {
  await runSlash(String(text));
  return { pipe: lastPipe(), isError: false, interrupt: false };
}

// ── Шаблоны расширений ──

async function renderExtensionTemplateAsync(extensionName: string, templateId: string, data: Record<string, unknown> = {}) {
  const folder = String(extensionName).split('/').filter(Boolean).pop() ?? '';
  const base = extBases.get(folder) ?? [...extBases.values()].pop();
  if (!base) return '';
  const res = await fetch(`${base}${templateId}.html`);
  if (!res.ok) throw new Error(`template ${templateId}: HTTP ${res.status}`);
  const html = await res.text();
  return html.replace(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g, (_m, k: string) => String(k.split('.').reduce<any>((o, x) => o?.[x], data) ?? ''));
}

// ── Прочее из utils.js ──

function debounce<T extends (...a: any[]) => any>(fn: T, ms = 300) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uuidv4 = () => (crypto.randomUUID ? crypto.randomUUID() : uid());
function getBase64Async(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function getStringHash(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
async function waitUntilCondition(cond: () => boolean, timeout = 1000, interval = 100) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for condition');
    await delay(interval);
  }
}
const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const isTrueBoolean = (v: string) => ['on', 'true', '1'].includes(String(v).trim().toLowerCase());
const isFalseBoolean = (v: string) => ['off', 'false', '0'].includes(String(v).trim().toLowerCase());

class ModuleWorkerWrapper {
  private busy = false;
  constructor(private fn: (...a: unknown[]) => Promise<unknown>) {}
  async update(...a: unknown[]) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.fn(...a);
    } finally {
      this.busy = false;
    }
  }
}

function stNow() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}@${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}s`;
}

/** toastr из ST → уведомления Divinax */
export const toastrShim = {
  info: (m: unknown, t?: unknown) => toast(stripTags([t, m].filter(Boolean).join(': ')), 'info'),
  success: (m: unknown, t?: unknown) => toast(stripTags([t, m].filter(Boolean).join(': ')), 'success'),
  warning: (m: unknown, t?: unknown) => toast(stripTags([t, m].filter(Boolean).join(': ')), 'info'),
  error: (m: unknown, t?: unknown) => toast(stripTags([t, m].filter(Boolean).join(': ')), 'error'),
  clear: () => undefined,
  remove: () => undefined,
  options: {},
};

// ── Контекст (SillyTavern.getContext) ──

export function getContext(): Record<string, any> {
  const s = getState();
  const c = activeChat(s);
  const chars = charList();
  const idx = c?.ownerType === 'char' ? chars.findIndex((x) => x._divinaxId === c.ownerId) : -1;
  const names = currentNames();
  const ctx: Record<string, any> = {
    get chat() {
      return liveChat();
    },
    get chatMetadata() {
      return chatMetadata();
    },
    characters: chars,
    characterId: idx >= 0 ? String(idx) : undefined,
    this_chid: idx >= 0 ? idx : undefined,
    groupId: c?.ownerType === 'group' ? c.ownerId : null,
    groups: Object.values(s.groups).map((g) => ({ id: g.id, name: g.name, members: g.members.map((id) => `${s.characters[id]?.name}.png`) })),
    chatId: c?.id,
    getCurrentChatId: () => activeChat(getState())?.id,
    name1: names.name1,
    name2: names.name2,
    onlineStatus: s.conn.status === 'ok' ? s.conn.models[0] || 'connected' : 'no_connection',
    maxContext: activePreset(s).maxContext,
    mainApi: s.api.main === 'chat' ? 'openai' : s.api.main === 'text' ? 'textgenerationwebui' : s.api.main,
    extensionSettings: extension_settings,
    eventSource,
    eventTypes: event_types,
    event_types,
    saveSettingsDebounced,
    saveSettings: async () => saveSettingsNow(),
    saveChat,
    saveChatConditional: saveChat,
    saveChatDebounced: saveChat,
    saveMetadata,
    saveMetadataDebounced: saveMetadata,
    addOneMessage: () => void saveChat(),
    reloadCurrentChat: async () => undefined,
    printMessages: async () => undefined,
    updateMessageBlock: () => undefined,
    generateQuietPrompt,
    generateRaw,
    sendMessageAsUser: (text: string) => sendMessage(String(text), { generate: false }),
    sendSystemMessage: (_type: unknown, text: string) => sendMessage(String(text), { generate: false, asSystem: true }),
    stopGeneration: () => (stopGeneration(), true),
    substituteParams,
    substituteParamsExtended: substituteParams,
    setExtensionPrompt,
    get extensionPrompts() {
      return Object.fromEntries(extensionPrompts);
    },
    extension_prompt_types: EXT_PROMPT_TYPES,
    extension_prompt_roles: EXT_PROMPT_ROLES,
    registerSlashCommand,
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    SlashCommandNamedArgument,
    SlashCommandEnumValue,
    ARGUMENT_TYPE,
    executeSlashCommands,
    executeSlashCommandsWithOptions: executeSlashCommands,
    callGenericPopup,
    callPopup,
    Popup,
    POPUP_TYPE,
    POPUP_RESULT,
    renderExtensionTemplateAsync,
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    getTokenCount: (t: string) => estimateTokens(String(t ?? '')),
    getTokenCountAsync: async (t: string) => estimateTokens(String(t ?? '')),
    messageFormatting: (t: string) => renderMessage(String(t ?? '')),
    activateSendButtons: () => undefined,
    deactivateSendButtons: () => undefined,
    uuidv4,
    humanizedDateTime: stNow,
    tags: [],
    tagMap: {},
    powerUserSettings: {},
    ModuleWorkerWrapper,
    writeExtensionField: async (charIndex: number | string, key: string, value: unknown) => {
      const ch = chars[Number(charIndex)];
      if (!ch) return;
      setState((st) => {
        const cur = st.characters[ch._divinaxId];
        return cur ? { characters: { ...st.characters, [cur.id]: { ...cur, extensions: { ...cur.extensions, [key]: value } } } } : {};
      });
    },
    isMobile: () => matchMedia('(max-width: 760px)').matches,
    t: (strings: TemplateStringsArray | string, ...vals: unknown[]) =>
      typeof strings === 'string' ? strings : strings.reduce((a, str, i) => a + str + (i < vals.length ? String(vals[i]) : ''), ''),
    translate: (text: string) => text,
    getCurrentLocale: () => getState().ui.language,
    DOMPurify,
  };
  return withStubs(ctx, 'context');
}

// ── Заглушки для неподдерживаемого API ──

const warned = new Set<string>();
/** Вызываемый объект: любые обращения и вызовы ничего не делают, но не роняют расширение. */
export function stub(name: string): any {
  const fn = function () {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[Divinax] API SillyTavern «${name}» не поддерживается — вызов пропущен`);
    }
    return undefined;
  };
  return new Proxy(fn, {
    get: (_t, p) => {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return stub(`${name}.${p}`);
    },
  });
}

function withStubs<T extends Record<string, any>>(obj: T, name: string): T {
  return new Proxy(obj, {
    get: (t, p, r) => (p in t || typeof p === 'symbol' || p === 'then' || p === 'toJSON' ? Reflect.get(t, p, r) : stub(`${name}.${String(p)}`)),
  });
}

/** Все имена, которые можно импортировать из модулей ST. Одинаковые имена в разных модулях ST означают одно и то же. */
export function exportsTable(): Record<string, unknown> {
  const names = currentNames();
  return {
    // script.js
    eventSource,
    event_types,
    saveSettingsDebounced,
    saveSettings: async () => saveSettingsNow(),
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    substituteParams,
    substituteParamsExtended: substituteParams,
    generateQuietPrompt,
    generateRaw,
    sendMessageAsUser: (text: string) => sendMessage(String(text), { generate: false }),
    sendSystemMessage: (_t: unknown, text: string) => sendMessage(String(text), { generate: false, asSystem: true }),
    chat: liveArray(liveChat),
    characters: liveArray(charList),
    chat_metadata: liveObject(chatMetadata),
    this_chid: getContext().this_chid,
    name1: names.name1,
    name2: names.name2,
    saveChat,
    saveChatDebounced: saveChat,
    saveChatConditional: saveChat,
    saveMetadata,
    saveMetadataDebounced: saveMetadata,
    reloadCurrentChat: async () => undefined,
    messageFormatting: (t: string) => renderMessage(String(t ?? '')),
    addOneMessage: () => void saveChat(),
    updateMessageBlock: () => undefined,
    printMessages: async () => undefined,
    setExtensionPrompt,
    extension_prompt_types: EXT_PROMPT_TYPES,
    extension_prompt_roles: EXT_PROMPT_ROLES,
    callPopup,
    getCurrentChatId: () => activeChat(getState())?.id,
    stopGeneration: () => (stopGeneration(), true),
    activateSendButtons: () => undefined,
    deactivateSendButtons: () => undefined,
    main_api: getContext().mainApi,
    online_status: getContext().onlineStatus,
    is_send_press: false,
    // extensions.js
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,
    renderExtensionTemplate: () => '',
    ModuleWorkerWrapper,
    doExtrasFetch: () => Promise.reject(new Error('Extras API is not available in Divinax')),
    getApiUrl: () => '',
    modules: [],
    writeExtensionField: getContext().writeExtensionField,
    loadExtensionSettings: async () => undefined,
    // popup.js
    callGenericPopup,
    Popup,
    POPUP_TYPE,
    POPUP_RESULT,
    // slash-commands
    registerSlashCommand,
    executeSlashCommands,
    executeSlashCommandsWithOptions: executeSlashCommands,
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    SlashCommandNamedArgument,
    SlashCommandEnumValue,
    ARGUMENT_TYPE,
    // utils.js
    debounce,
    delay,
    uuidv4,
    getBase64Async,
    getStringHash,
    waitUntilCondition,
    escapeHtml,
    isTrueBoolean,
    isFalseBoolean,
    onlyUnique: (v: unknown, i: number, a: unknown[]) => a.indexOf(v) === i,
    getSortableDelay: () => 0,
    // tokenizers.js
    getTokenCount: (t: string) => estimateTokens(String(t ?? '')),
    getTokenCountAsync: async (t: string) => estimateTokens(String(t ?? '')),
    // i18n.js
    t: getContext().t,
    translate: (text: string) => text,
    getCurrentLocale: () => getState().ui.language,
    // power-user.js
    power_user: {},
    // lib.js
    DOMPurify,
  };
}
