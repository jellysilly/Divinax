import type {
  ApiSettings,
  AuthorNote,
  ContextTemplate,
  ExtensionSettings,
  FormatSettings,
  GenPreset,
  InstructTemplate,
  PromptItem,
  SysPromptPreset,
  ThemeColors,
  UiSettings,
  WorldInfoSettings,
} from '../types';

export const DEFAULT_PROMPTS: PromptItem[] = [
  {
    id: 'main',
    name: 'Основной промпт',
    role: 'system',
    content:
      'Напиши следующую реплику {{char}} в вымышленном ролевом чате между {{char}} и {{user}}. Пиши живо, от лица персонажа, не говори и не действуй за {{user}}.',
    marker: false,
    enabled: true,
    system: true,
    position: 'relative',
    depth: 4,
  },
  { id: 'worldInfoBefore', name: 'Лорбук — до персонажа', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  { id: 'charDescription', name: 'Описание персонажа', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  { id: 'charPersonality', name: 'Личность персонажа', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  { id: 'scenario', name: 'Сценарий', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  { id: 'personaDescription', name: 'Описание персоны', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  {
    id: 'enhanceDefinitions',
    name: 'Усилить описание',
    role: 'system',
    content:
      'Если у тебя есть знания о {{char}}, дополни ими описание персонажа. Используй их, чтобы точнее передать характер и манеру речи.',
    marker: false,
    enabled: false,
    system: true,
    position: 'relative',
    depth: 4,
  },
  { id: 'worldInfoAfter', name: 'Лорбук — после персонажа', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  { id: 'dialogueExamples', name: 'Примеры диалогов', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  { id: 'chatHistory', name: 'История чата', role: 'system', content: '', marker: true, enabled: true, system: true, position: 'relative', depth: 4 },
  {
    id: 'jailbreak',
    name: 'Инструкции после истории',
    role: 'system',
    content: '',
    marker: false,
    enabled: true,
    system: true,
    position: 'relative',
    depth: 4,
  },
];

export const DEFAULT_PRESET: GenPreset = {
  id: 'default',
  name: 'Ночь (по умолчанию)',
  stream: true,
  reasoning: false,
  unlockedContext: false,
  maxContext: 32768,
  maxTokens: 400,
  temperature: 1,
  topP: 0.95,
  topK: 0,
  minP: 0.05,
  topA: 0,
  typicalP: 1,
  tfs: 1,
  freqPen: 0,
  presPen: 0,
  repPen: 1.1,
  repPenRange: 1024,
  reasoningEffort: 'medium',
  seed: -1,
  swipes: 1,
  prompts: DEFAULT_PROMPTS,
  impersonationPrompt:
    '[Напиши следующую реплику от лица {{user}}. Пиши только за {{user}}, в том же стиле, что и предыдущие сообщения {{user}}.]',
  continuePrompt: '[Продолжи свой последний ответ с того места, где он оборвался. Не повторяй уже написанное.]',
  newChatPrompt: '[Начало нового чата]',
  newGroupChatPrompt: '[Начало нового группового чата. Участники: {{group}}]',
  newExampleChatPrompt: '[Пример чата]',
  groupNudgePrompt: '[Напиши следующую реплику только от лица {{char}}.]',
  squashSystem: false,
};

export const DEFAULT_STORY_STRING = `{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}Личность {{char}}: {{personality}}
{{/if}}{{#if scenario}}Сценарий: {{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}`;

export const CONTEXT_TEMPLATES: ContextTemplate[] = [
  {
    id: 'default',
    name: 'По умолчанию',
    storyString: DEFAULT_STORY_STRING,
    exampleSeparator: '***',
    chatStart: '***',
    collapseNewlines: true,
    alwaysAddCharName: false,
    trimIncomplete: false,
  },
  {
    id: 'minimal',
    name: 'Минимальный',
    storyString: `{{#if system}}{{system}}\n{{/if}}{{description}}\n{{personality}}\n{{scenario}}\n{{persona}}`,
    exampleSeparator: '',
    chatStart: '',
    collapseNewlines: true,
    alwaysAddCharName: false,
    trimIncomplete: false,
  },
  {
    id: 'roleplay',
    name: 'Ролевая игра',
    storyString: `{{#if system}}{{system}}\n\n{{/if}}### Мир и персонаж\n{{#if wiBefore}}{{wiBefore}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if personality}}Характер: {{personality}}\n{{/if}}{{#if scenario}}Сцена: {{scenario}}\n{{/if}}{{#if wiAfter}}{{wiAfter}}\n{{/if}}{{#if persona}}\n### {{user}}\n{{persona}}\n{{/if}}`,
    exampleSeparator: '### Пример',
    chatStart: '### Начало ролевой игры',
    collapseNewlines: true,
    alwaysAddCharName: true,
    trimIncomplete: true,
  },
];

export const INSTRUCT_TEMPLATES: InstructTemplate[] = [
  {
    id: 'chatml',
    name: 'ChatML',
    systemPrefix: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    userPrefix: '<|im_start|>user\n',
    userSuffix: '<|im_end|>\n',
    assistantPrefix: '<|im_start|>assistant\n',
    assistantSuffix: '<|im_end|>\n',
    stopSequence: '<|im_end|>',
    wrap: false,
    names: true,
  },
  {
    id: 'llama3',
    name: 'Llama 3 Instruct',
    systemPrefix: '<|start_header_id|>system<|end_header_id|>\n\n',
    systemSuffix: '<|eot_id|>',
    userPrefix: '<|start_header_id|>user<|end_header_id|>\n\n',
    userSuffix: '<|eot_id|>',
    assistantPrefix: '<|start_header_id|>assistant<|end_header_id|>\n\n',
    assistantSuffix: '<|eot_id|>',
    stopSequence: '<|eot_id|>',
    wrap: false,
    names: true,
  },
  {
    id: 'mistral-v7',
    name: 'Mistral V7',
    systemPrefix: '[SYSTEM_PROMPT] ',
    systemSuffix: '[/SYSTEM_PROMPT]',
    userPrefix: '[INST] ',
    userSuffix: '[/INST]',
    assistantPrefix: ' ',
    assistantSuffix: '</s>',
    stopSequence: '</s>',
    wrap: false,
    names: true,
  },
  {
    id: 'gemma',
    name: 'Gemma 2/3',
    systemPrefix: '<start_of_turn>user\n',
    systemSuffix: '<end_of_turn>\n',
    userPrefix: '<start_of_turn>user\n',
    userSuffix: '<end_of_turn>\n',
    assistantPrefix: '<start_of_turn>model\n',
    assistantSuffix: '<end_of_turn>\n',
    stopSequence: '<end_of_turn>',
    wrap: false,
    names: true,
  },
  {
    id: 'alpaca',
    name: 'Alpaca',
    systemPrefix: '',
    systemSuffix: '\n\n',
    userPrefix: '### Instruction:\n',
    userSuffix: '\n\n',
    assistantPrefix: '### Response:\n',
    assistantSuffix: '\n\n',
    stopSequence: '',
    wrap: true,
    names: true,
  },
  {
    id: 'metharme',
    name: 'Metharme / Pygmalion',
    systemPrefix: '<|system|>',
    systemSuffix: '',
    userPrefix: '<|user|>',
    userSuffix: '',
    assistantPrefix: '<|model|>',
    assistantSuffix: '',
    stopSequence: '</s>',
    wrap: false,
    names: true,
  },
  {
    id: 'vicuna',
    name: 'Vicuna 1.1',
    systemPrefix: '',
    systemSuffix: '\n\n',
    userPrefix: 'USER: ',
    userSuffix: '\n',
    assistantPrefix: 'ASSISTANT: ',
    assistantSuffix: '\n',
    stopSequence: '',
    wrap: false,
    names: true,
  },
];

export const SYS_PROMPTS: SysPromptPreset[] = [
  {
    id: 'rp-immersive',
    name: 'Ролевая игра — погружение',
    content:
      'Ты — {{char}}. Веди ролевую игру с {{user}}, оставаясь в образе. Описывай действия, окружение и ощущения живо и образно, двигай сюжет вперёд, проявляй инициативу. Никогда не пиши реплики и действия за {{user}}.',
  },
  {
    id: 'rp-concise',
    name: 'Ролевая игра — кратко',
    content: 'Ты — {{char}}. Отвечай в образе, коротко: 1–3 абзаца. Не пиши за {{user}}.',
  },
  {
    id: 'narrator',
    name: 'Рассказчик',
    content:
      'Ты — рассказчик интерактивной истории. Описывай мир, персонажей и последствия действий {{user}}. Давай {{user}} свободу выбора и не принимай решения за него.',
  },
  {
    id: 'assistant',
    name: 'Ассистент',
    content: 'Ты — полезный ассистент {{char}}. Отвечай {{user}} точно и по делу.',
  },
  { id: 'blank', name: 'Пустой', content: '' },
];

export const DEFAULT_FORMAT: FormatSettings = {
  contextId: 'default',
  instructEnabled: true,
  instructId: 'chatml',
  instructForChat: false,
  sysPromptEnabled: true,
  sysPromptId: 'rp-immersive',
  tokenizer: 'auto',
  customStops: '["\\n{{user}}:"]',
  reasoningPrefix: '<think>',
  reasoningSuffix: '</think>',
  autoParseReasoning: true,
  showReasoning: true,
};

export const DEFAULT_API: ApiSettings = {
  main: 'chat',
  chatSource: 'openrouter',
  textSource: 'koboldcpp',
  models: {},
  keys: {},
  urls: {
    custom: 'http://127.0.0.1:5000/v1',
    koboldcpp: 'http://127.0.0.1:5001',
    llamacpp: 'http://127.0.0.1:8080',
    ooba: 'http://127.0.0.1:5000',
    tabby: 'http://127.0.0.1:5000',
    vllm: 'http://127.0.0.1:8000',
    ollama: 'http://127.0.0.1:11434',
    generic: 'http://127.0.0.1:5000',
    kobold: 'http://127.0.0.1:5001',
  },
  proxyPresetId: '',
  proxies: [],
  autoConnect: true,
  skipStatusCheck: false,
  sendImages: true,
  showPaid: true,
  hordeModels: [],
  hordeTrusted: false,
};

export const DEFAULT_WI: WorldInfoSettings = {
  scanDepth: 4,
  budget: 25,
  budgetCap: 0,
  maxRecursion: 0,
  recursive: true,
  caseSensitive: false,
  matchWholeWords: true,
  includeNames: true,
  global: [],
};

export const THEMES: Record<string, { name: string; colors: ThemeColors }> = {
  night: {
    name: 'Divinax — ночь',
    colors: { text: '#ebe9ee', italics: '#b3b1bb', quotes: '#f7f3ea', panel: '#0b0b0f', border: '#d6d6e4', glow: '#ffffff' },
  },
  moon: {
    name: 'Лунное серебро',
    colors: { text: '#e4e8f0', italics: '#9fb0c8', quotes: '#dfe9ff', panel: '#0a0d14', border: '#c8d4ea', glow: '#cfe0ff' },
  },
  blood: {
    name: 'Кровавая луна',
    colors: { text: '#efe6e6', italics: '#c29a9a', quotes: '#ffd9d0', panel: '#110809', border: '#e4c2c4', glow: '#ff9c9c' },
  },
  amethyst: {
    name: 'Аметист',
    colors: { text: '#ece6f5', italics: '#b6a3d1', quotes: '#f1e4ff', panel: '#0d0914', border: '#d8c8f0', glow: '#e3cfff' },
  },
  gold: {
    name: 'Старое золото',
    colors: { text: '#efe9dc', italics: '#c3b28c', quotes: '#fff0c8', panel: '#0f0c07', border: '#e8dcc0', glow: '#ffe7a8' },
  },
};

export const DEFAULT_UI: UiSettings = {
  theme: 'night',
  colors: THEMES.night.colors,
  fontScale: 1,
  chatWidth: 55,
  bgBlur: 10,
  ornaments: 80,
  messageStyle: 'flat',
  avatarStyle: 'round',
  showTimestamps: true,
  showNumbers: true,
  showTokens: true,
  showGenTime: true,
  swipeArrows: true,
  autoscroll: true,
  enterSends: true,
  confirmDelete: true,
  twinkle: false,
  language: 'ru',
  backgrounds: [
    { id: 'bg-judge', name: 'Небесный суд', url: './demo/judge-banner.jpg', builtin: true },
    { id: 'bg-window', name: 'Витраж', url: './ornaments/window.png', builtin: true },
    { id: 'bg-vines', name: 'Розарий', url: './ornaments/vines.png', builtin: true },
  ],
  activeBg: '',
  perChatBg: true,
  dimBg: true,
  bgFit: 'cover',
  customThemes: [],
};

export const DEFAULT_AUTHOR_NOTE: AuthorNote = {
  enabled: false,
  text: '',
  depth: 4,
  role: 'system',
  interval: 0,
  position: 'depth',
};

export const DEFAULT_EXTENSIONS: ExtensionSettings = {
  enabled: {
    summarize: true,
    vectors: false,
    imageGen: false,
    tts: false,
    stt: false,
    translate: false,
    expressions: false,
    regex: true,
    quickReplies: true,
    webSearch: false,
    captions: false,
    gallery: true,
  },
  summarize: {
    prompt:
      'Кратко перескажи ключевые события ролевой игры выше: кто что сделал, что изменилось, какие обещания и цели появились. Не больше {{words}} слов. Пиши в прошедшем времени, без вступлений.',
    template: '[Краткое содержание предыдущих событий: {{summary}}]',
    every: 0,
    depth: 4,
    role: 'system',
    position: 'before',
    maxWords: 200,
  },
  tts: { voice: '', rate: 1, pitch: 1, auto: false, narrateQuotesOnly: false },
  stt: { lang: 'ru-RU', autoSend: false },
  translate: { target: 'ru', inputTarget: 'en', mode: 'display' },
  regex: [],
  quickReplies: {
    activeSet: 'scenes',
    sets: [
      {
        id: 'scenes',
        name: 'Сцены',
        items: [
          { id: 'qr1', label: 'Продолжить сцену', message: '/continue', autoSend: true },
          { id: 'qr2', label: 'Описать место', message: '*Я осматриваюсь вокруг.*', autoSend: false },
          { id: 'qr3', label: '/sum', message: '/sum', autoSend: true },
          { id: 'qr4', label: 'OOC: пауза', message: '(OOC: давай ненадолго остановимся.)', autoSend: false },
        ],
      },
    ],
  },
  imageGen: { provider: 'pollinations', width: 768, height: 512, stylePrefix: 'dark gothic, cinematic lighting, ' },
  expressions: { sprites: {} },
};

export const EXPRESSIONS = [
  'нейтрально',
  'радость',
  'грусть',
  'гнев',
  'страх',
  'удивление',
  'смущение',
  'любовь',
  'задумчивость',
  'отвращение',
];
