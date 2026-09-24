// Модель данных Divinax. Поля по возможности совпадают с SillyTavern,
// чтобы карточки, лорбуки и пресеты импортировались без конвертации.

export type Role = 'system' | 'user' | 'assistant';

export type TabId =
  | 'chat'
  | 'api'
  | 'generation'
  | 'format'
  | 'lorebook'
  | 'persona'
  | 'interface'
  | 'extensions'
  | 'characters';

export interface DepthPrompt {
  prompt: string;
  depth: number;
  role: Role;
}

export interface Character {
  id: string;
  name: string;
  avatar?: string; // data URL
  banner?: string; // data URL обложки чата
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  alternate_greetings: string[];
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  creator: string;
  character_version: string;
  tags: string[];
  fav: boolean;
  talkativeness: number;
  depth_prompt: DepthPrompt;
  lorebookId?: string; // привязанный лорбук (уходит в карточку при экспорте)
  extraLorebookIds?: string[]; // дополнительные лорбуки персонажа
  gallery: string[]; // data URL
  extensions: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type GroupActivation = 'natural' | 'list' | 'manual' | 'pooled';

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  members: string[];
  disabledMembers: string[];
  activation: GroupActivation;
  generationMode: 'swap' | 'append';
  allowSelfResponses: boolean;
  autoMode: boolean;
  fav: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SwipeInfo {
  date: number;
  genTime?: number;
  tokens?: number;
  model?: string;
  reasoning?: string;
}

export interface Message {
  id: string;
  name: string;
  isUser: boolean;
  isSystem?: boolean; // системное/нарратор сообщение
  charId?: string; // автор-персонаж (для групп)
  personaId?: string;
  avatar?: string; // снимок аватара персоны
  text: string;
  swipes: string[];
  swipeId: number;
  swipeInfo: SwipeInfo[];
  date: number;
  hidden: boolean; // скрыто от ИИ
  genTime?: number;
  tokens?: number;
  reasoning?: string;
  bookmark?: string; // имя чата-чекпоинта
  images?: string[];
  translation?: string; // перевод для отображения
  expression?: string; // эмоция для спрайтов
}

export interface AuthorNote {
  enabled: boolean;
  text: string;
  depth: number;
  role: Role;
  interval: number; // вставлять каждые N сообщений пользователя (0 — всегда)
  position: 'depth' | 'before' | 'after';
}

export interface Chat {
  id: string;
  ownerType: 'char' | 'group';
  ownerId: string;
  name: string;
  messages: Message[];
  authorNote: AuthorNote;
  personaId?: string; // привязанная к чату персона
  background?: string; // id фона
  lorebookIds: string[]; // лорбуки чата
  summary?: string;
  branchOf?: { chatId: string; messageId: string };
  vars: Record<string, string>; // переменные макросов {{getvar}}
  stMeta?: Record<string, unknown>; // chat_metadata для сторонних расширений
  createdAt: number;
  updatedAt: number;
}

export type PersonaPosition = 'in_prompt' | 'top_an' | 'bottom_an' | 'at_depth' | 'none';

export interface Persona {
  id: string;
  name: string;
  avatar?: string;
  description: string;
  title?: string;
  position: PersonaPosition;
  depth: number;
  role: Role;
  lorebookId?: string;
  createdAt: number;
}

// ── Лорбуки (World Info) ──

export enum WIPosition {
  before = 0,
  after = 1,
  anTop = 2,
  anBottom = 3,
  atDepth = 4,
  emTop = 5,
  emBottom = 6,
}

export enum WILogic {
  AND_ANY = 0,
  NOT_ALL = 1,
  NOT_ANY = 2,
  AND_ALL = 3,
}

export type WIStrategy = 'constant' | 'normal' | 'vector';

export interface LoreEntry {
  uid: number;
  comment: string;
  key: string[];
  keysecondary: string[];
  selectiveLogic: WILogic;
  content: string;
  strategy: WIStrategy;
  disable: boolean;
  position: WIPosition;
  depth: number;
  role: Role;
  order: number;
  probability: number;
  useProbability: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  scanDepth: number | null;
  group: string;
  sticky: number;
  cooldown: number;
  delay: number;
}

export interface Lorebook {
  id: string;
  name: string;
  description?: string;
  entries: LoreEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface WorldInfoSettings {
  scanDepth: number;
  budget: number; // % от контекста
  budgetCap: number; // абсолютный лимит токенов (0 — без лимита)
  maxRecursion: number; // 0 — без лимита
  recursive: boolean;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  includeNames: boolean;
  global: string[]; // активные во всех чатах
}

// ── API ──

export type MainApi = 'chat' | 'text' | 'novel' | 'horde' | 'kobold';

export type ChatSource =
  | 'openrouter'
  | 'openai'
  | 'claude'
  | 'google'
  | 'mistral'
  | 'deepseek'
  | 'groq'
  | 'xai'
  | 'custom';

export type TextSource = 'koboldcpp' | 'llamacpp' | 'ooba' | 'tabby' | 'vllm' | 'ollama' | 'generic';

export interface ProxyPreset {
  id: string;
  name: string;
  url: string;
  password: string;
}

export interface ApiSettings {
  main: MainApi;
  chatSource: ChatSource;
  textSource: TextSource;
  models: Record<string, string>; // модель на источник
  keys: Record<string, string>; // ключи на источник
  urls: Record<string, string>; // адреса на источник (custom, text, kobold)
  proxyPresetId: string; // '' — не использовать
  proxies: ProxyPreset[];
  autoConnect: boolean;
  skipStatusCheck: boolean;
  sendImages: boolean;
  showPaid: boolean;
  hordeModels: string[];
  hordeTrusted: boolean;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  main: MainApi;
  chatSource: ChatSource;
  textSource: TextSource;
  model: string;
  url?: string;
  presetId?: string;
  instructId?: string;
  contextId?: string;
  sysPromptId?: string;
}

// ── Генерация ──

export interface PromptItem {
  id: string; // для маркеров — identifier как в ST
  name: string;
  role: Role;
  content: string;
  marker: boolean;
  enabled: boolean;
  system: boolean; // встроенный (не удаляется)
  position: 'relative' | 'absolute';
  depth: number;
}

export interface GenPreset {
  id: string;
  name: string;
  stream: boolean;
  reasoning: boolean;
  unlockedContext: boolean;
  maxContext: number;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  topA: number;
  typicalP: number;
  tfs: number;
  freqPen: number;
  presPen: number;
  repPen: number;
  repPenRange: number;
  reasoningEffort: 'auto' | 'minimal' | 'low' | 'medium' | 'high';
  seed: number;
  swipes: number; // сколько вариантов за раз (n)
  prompts: PromptItem[];
  impersonationPrompt: string;
  continuePrompt: string;
  newChatPrompt: string;
  newGroupChatPrompt: string;
  newExampleChatPrompt: string;
  groupNudgePrompt: string;
  squashSystem: boolean;
  regex: RegexScript[]; // регексы, привязанные к пресету: работают, пока он выбран
}

// ── Формат ──

export interface ContextTemplate {
  id: string;
  name: string;
  storyString: string;
  exampleSeparator: string;
  chatStart: string;
  collapseNewlines: boolean;
  alwaysAddCharName: boolean;
  trimIncomplete: boolean;
}

export interface InstructTemplate {
  id: string;
  name: string;
  systemPrefix: string;
  systemSuffix: string;
  userPrefix: string;
  userSuffix: string;
  assistantPrefix: string;
  assistantSuffix: string;
  stopSequence: string;
  wrap: boolean;
  names: boolean;
}

export interface SysPromptPreset {
  id: string;
  name: string;
  content: string;
}

export interface FormatSettings {
  contextId: string;
  instructEnabled: boolean;
  instructId: string;
  instructForChat: boolean;
  sysPromptEnabled: boolean;
  sysPromptId: string;
  tokenizer: 'auto' | 'chars' | 'words';
  customStops: string;
  reasoningPrefix: string;
  reasoningSuffix: string;
  autoParseReasoning: boolean;
  showReasoning: boolean;
}

// ── Интерфейс ──

export interface ThemeColors {
  text: string;
  italics: string;
  quotes: string;
  panel: string;
  border: string;
  glow: string;
}

export interface Background {
  id: string;
  name: string;
  url: string;
  color?: string; // сплошной цвет ('transparent' — без фона)
  builtin?: boolean;
}

export interface UiSettings {
  theme: string;
  colors: ThemeColors;
  fontScale: number;
  chatWidth: number; // % для режима «документ»
  bgBlur: number;
  ornaments: number; // 0..100
  messageStyle: 'flat' | 'bubbles' | 'document';
  avatarStyle: 'round' | 'square' | 'portrait';
  avatarPosition: 'top' | 'side' | 'none';
  renderHtml: boolean; // HTML и CSS в сообщениях
  runScripts: boolean; // JavaScript в сообщениях (в песочнице)
  showTimestamps: boolean;
  showNumbers: boolean;
  showTokens: boolean;
  showGenTime: boolean;
  swipeArrows: boolean;
  gestures: boolean; // смахивание по ответу для вариантов/перегенерации
  autoscroll: boolean;
  enterSends: boolean;
  confirmDelete: boolean;
  twinkle: boolean;
  language: 'ru' | 'en';
  backgrounds: Background[];
  activeBg: string;
  perChatBg: boolean;
  dimBg: boolean;
  bgFit: 'cover' | 'contain' | 'stretch';
  customThemes: { name: string; colors: ThemeColors }[];
}

// ── Расширения ──

export interface RegexScript {
  id: string;
  name: string;
  find: string;
  replace: string;
  flags: string;
  enabled: boolean;
  onInput: boolean; // сообщения пользователя
  onOutput: boolean; // ответы ИИ
  onPrompt: boolean; // только в промпте (не меняет отображение)
  displayOnly: boolean; // только отображение
  minDepth: number | null;
  maxDepth: number | null;
}

export interface QuickReply {
  id: string;
  label: string;
  message: string;
  autoSend: boolean; // true — отправить/выполнить, false — вставить в поле
}

export interface QuickReplySet {
  id: string;
  name: string;
  items: QuickReply[];
}

export interface ExtensionSettings {
  enabled: Record<string, boolean>;
  summarize: {
    prompt: string;
    template: string;
    every: number; // авто-пересказ каждые N сообщений (0 — вручную)
    depth: number;
    role: Role;
    position: 'before' | 'after' | 'depth';
    maxWords: number;
  };
  tts: { voice: string; rate: number; pitch: number; auto: boolean; narrateQuotesOnly: boolean };
  stt: { lang: string; autoSend: boolean };
  translate: { target: string; inputTarget: string; mode: 'none' | 'display' | 'input' | 'both' };
  regex: RegexScript[];
  cardRegex: boolean; // применять регексы из карточек персонажей
  quickReplies: { activeSet: string; sets: QuickReplySet[] };
  imageGen: { provider: 'pollinations'; width: number; height: number; stylePrefix: string };
  expressions: { sprites: Record<string, Record<string, string>> };
}

export interface Toast {
  id: string;
  kind: 'info' | 'error' | 'success';
  text: string;
}

// ── Сторонние расширения ──

export interface ExtManifest {
  display_name: string;
  js?: string;
  css?: string;
  author?: string;
  version?: string;
  homePage?: string;
  loading_order?: number;
}

export interface UserExtension {
  id: string;
  folder: string; // имя папки, как в SillyTavern (scripts/extensions/third-party/<folder>)
  source: string; // что ввёл пользователь
  base: string; // откуда грузим файлы (со слэшем в конце)
  github?: { owner: string; repo: string; ref: string; path: string; sha?: string };
  manifest: ExtManifest;
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
}

export type ExtRuntimeStatus = { state: 'loading' | 'ok' | 'error' | 'reload'; error?: string };
