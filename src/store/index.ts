import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type {
  ApiSettings,
  Character,
  Chat,
  ConnectionProfile,
  ContextTemplate,
  ExtensionSettings,
  FormatSettings,
  GenPreset,
  Group,
  InstructTemplate,
  Lorebook,
  Message,
  Persona,
  SysPromptPreset,
  TabId,
  Toast,
  UiSettings,
  WorldInfoSettings,
} from '../types';
import {
  CONTEXT_TEMPLATES,
  DEFAULT_API,
  DEFAULT_AUTHOR_NOTE,
  DEFAULT_EXTENSIONS,
  DEFAULT_FORMAT,
  DEFAULT_PRESET,
  DEFAULT_UI,
  DEFAULT_WI,
  INSTRUCT_TEMPLATES,
  SYS_PROMPTS,
} from '../lib/defaults';
import { uid } from '../lib/util';

export type ConnStatus = 'idle' | 'connecting' | 'ok' | 'error';

export interface GenState {
  chatId: string;
  kind: 'normal' | 'swipe' | 'regenerate' | 'continue' | 'impersonate' | 'quiet';
  messageId?: string;
  charId?: string;
  startedAt: number;
}

export interface Streaming {
  chatId: string;
  messageId: string;
  text: string;
  reasoning: string;
}

export interface PersistedState {
  characters: Record<string, Character>;
  groups: Record<string, Group>;
  chats: Record<string, Chat>;
  personas: Record<string, Persona>;
  lorebooks: Record<string, Lorebook>;
  presets: GenPreset[];
  activePresetId: string;
  contextTemplates: ContextTemplate[];
  instructTemplates: InstructTemplate[];
  sysPrompts: SysPromptPreset[];
  format: FormatSettings;
  api: ApiSettings;
  profiles: ConnectionProfile[];
  activeProfileId: string;
  wi: WorldInfoSettings;
  ui: UiSettings;
  ext: ExtensionSettings;
  activeChatId: string;
  lastChatByOwner: Record<string, string>;
  defaultPersonaId: string;
  charPersona: Record<string, string>;
  seeded: boolean;
}

export interface TransientState {
  hydrated: boolean;
  tab: TabId;
  mobileMenu: boolean;
  chatMenu: boolean;
  modal: { kind: string; payload?: unknown } | null;
  conn: { status: ConnStatus; message: string; models: string[]; checkedAt?: number };
  gen: GenState | null;
  streaming: Streaming | null;
  toasts: Toast[];
  lastPrompt: { tokens: number; items: { name: string; tokens: number }[]; raw: string } | null;
  editingCharId: string;
  editingLorebookId: string;
  editingPersonaId: string;
  draft: string;
  selecting: string[] | null; // режим выбора сообщений для удаления
  editingMessageId: string;
}

export type State = PersistedState & TransientState;

const initialPersisted: PersistedState = {
  characters: {},
  groups: {},
  chats: {},
  personas: {},
  lorebooks: {},
  presets: [DEFAULT_PRESET],
  activePresetId: DEFAULT_PRESET.id,
  contextTemplates: CONTEXT_TEMPLATES,
  instructTemplates: INSTRUCT_TEMPLATES,
  sysPrompts: SYS_PROMPTS,
  format: DEFAULT_FORMAT,
  api: DEFAULT_API,
  profiles: [],
  activeProfileId: '',
  wi: DEFAULT_WI,
  ui: DEFAULT_UI,
  ext: DEFAULT_EXTENSIONS,
  activeChatId: '',
  lastChatByOwner: {},
  defaultPersonaId: '',
  charPersona: {},
  seeded: false,
};

const initialTransient: TransientState = {
  hydrated: false,
  tab: 'chat',
  mobileMenu: false,
  chatMenu: false,
  modal: null,
  conn: { status: 'idle', message: 'Не подключено', models: [] },
  gen: null,
  streaming: null,
  toasts: [],
  lastPrompt: null,
  editingCharId: '',
  editingLorebookId: '',
  editingPersonaId: '',
  draft: '',
  selecting: null,
  editingMessageId: '',
};

// IndexedDB с отложенной записью: стриминг и ввод не долбят базу на каждый символ.
function idbStorage(): PersistStorage<PersistedState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { name: string; value: StorageValue<PersistedState> } | null = null;
  const flush = () => {
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    void idbSet(name, value);
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);
  return {
    getItem: async (name) => (await idbGet(name)) ?? null,
    setItem: (name, value) => {
      pending = { name, value };
      clearTimeout(timer);
      timer = setTimeout(flush, 350);
    },
    removeItem: (name) => idbDel(name),
  };
}

export const useStore = create<State>()(
  persist(
    () => ({ ...initialPersisted, ...initialTransient }),
    {
      name: 'divinax',
      version: 1,
      storage: idbStorage(),
      partialize: (s) => {
        const out = {} as Record<string, unknown>;
        for (const k of Object.keys(initialPersisted)) out[k] = (s as unknown as Record<string, unknown>)[k];
        return out as unknown as PersistedState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedState>;
        return {
          ...current,
          ...p,
          // новые поля настроек подтягиваются из значений по умолчанию
          api: { ...DEFAULT_API, ...p.api, urls: { ...DEFAULT_API.urls, ...p.api?.urls } },
          ui: { ...DEFAULT_UI, ...p.ui, colors: { ...DEFAULT_UI.colors, ...p.ui?.colors } },
          wi: { ...DEFAULT_WI, ...p.wi },
          format: { ...DEFAULT_FORMAT, ...p.format },
          ext: {
            ...DEFAULT_EXTENSIONS,
            ...p.ext,
            enabled: { ...DEFAULT_EXTENSIONS.enabled, ...p.ext?.enabled },
            summarize: { ...DEFAULT_EXTENSIONS.summarize, ...p.ext?.summarize },
            tts: { ...DEFAULT_EXTENSIONS.tts, ...p.ext?.tts },
            stt: { ...DEFAULT_EXTENSIONS.stt, ...p.ext?.stt },
            translate: { ...DEFAULT_EXTENSIONS.translate, ...p.ext?.translate },
            imageGen: { ...DEFAULT_EXTENSIONS.imageGen, ...p.ext?.imageGen },
            expressions: { ...DEFAULT_EXTENSIONS.expressions, ...p.ext?.expressions },
            quickReplies: p.ext?.quickReplies ?? DEFAULT_EXTENSIONS.quickReplies,
          },
          presets: (p.presets ?? current.presets).map((x) => ({ ...DEFAULT_PRESET, ...x })),
        };
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

export const getState = useStore.getState;
export const setState = useStore.setState;

// ── Селекторы-помощники ──

export const activeChat = (s: State): Chat | undefined => s.chats[s.activeChatId];

export const activePreset = (s: State): GenPreset =>
  s.presets.find((p) => p.id === s.activePresetId) ?? s.presets[0] ?? DEFAULT_PRESET;

export function chatOwnerName(s: State, chat?: Chat): string {
  if (!chat) return '';
  if (chat.ownerType === 'group') return s.groups[chat.ownerId]?.name ?? 'Группа';
  return s.characters[chat.ownerId]?.name ?? 'Персонаж';
}

export function currentPersona(s: State, chat?: Chat): Persona | undefined {
  const c = chat ?? activeChat(s);
  const id =
    (c?.personaId && s.personas[c.personaId] ? c.personaId : '') ||
    (c && c.ownerType === 'char' && s.charPersona[c.ownerId] && s.personas[s.charPersona[c.ownerId]]
      ? s.charPersona[c.ownerId]
      : '') ||
    s.defaultPersonaId;
  return s.personas[id] ?? Object.values(s.personas)[0];
}

export const userName = (s: State, chat?: Chat) => currentPersona(s, chat)?.name || 'Вы';

// ── Действия ──

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t: Toast = { id: uid(), kind, text };
  setState((s) => ({ toasts: [...s.toasts, t] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), kind === 'error' ? 7000 : 3500);
}

export const setTab = (tab: TabId) => setState({ tab, mobileMenu: false, chatMenu: false });

export const openModal = (kind: string, payload?: unknown) => setState({ modal: { kind, payload }, chatMenu: false });
export const closeModal = () => setState({ modal: null });

export function patch<K extends keyof PersistedState>(key: K, value: Partial<PersistedState[K]>) {
  setState((s) => ({ [key]: { ...(s[key] as object), ...(value as object) } }) as Partial<State>);
}

export function updateChat(chatId: string, fn: (c: Chat) => Chat | void) {
  setState((s) => {
    const c = s.chats[chatId];
    if (!c) return {};
    const copy: Chat = { ...c, messages: [...c.messages] };
    const res = fn(copy) ?? copy;
    res.updatedAt = Date.now();
    return { chats: { ...s.chats, [chatId]: res } };
  });
}

export function updateMessage(chatId: string, messageId: string, fn: (m: Message) => Message | void) {
  updateChat(chatId, (c) => {
    const i = c.messages.findIndex((m) => m.id === messageId);
    if (i < 0) return;
    const m = { ...c.messages[i], swipes: [...c.messages[i].swipes], swipeInfo: [...c.messages[i].swipeInfo] };
    c.messages[i] = fn(m) ?? m;
  });
}

export function upsertCharacter(ch: Character) {
  setState((s) => ({ characters: { ...s.characters, [ch.id]: { ...ch, updatedAt: Date.now() } } }));
}

export function upsertLorebook(lb: Lorebook) {
  setState((s) => ({ lorebooks: { ...s.lorebooks, [lb.id]: { ...lb, updatedAt: Date.now() } } }));
}

export function upsertPersona(p: Persona) {
  setState((s) => ({ personas: { ...s.personas, [p.id]: p } }));
}

export function upsertGroup(g: Group) {
  setState((s) => ({ groups: { ...s.groups, [g.id]: { ...g, updatedAt: Date.now() } } }));
}

export function updatePreset(fn: (p: GenPreset) => GenPreset) {
  setState((s) => ({ presets: s.presets.map((p) => (p.id === s.activePresetId ? fn(p) : p)) }));
}

export function newChatObject(ownerType: 'char' | 'group', ownerId: string, name?: string): Chat {
  const now = Date.now();
  return {
    id: uid(),
    ownerType,
    ownerId,
    name: name ?? `Чат от ${new Date(now).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
    messages: [],
    authorNote: { ...DEFAULT_AUTHOR_NOTE },
    lorebookIds: [],
    vars: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function chatsOf(s: State, ownerId: string): Chat[] {
  return Object.values(s.chats)
    .filter((c) => c.ownerId === ownerId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
