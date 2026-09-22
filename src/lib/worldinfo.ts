import { WILogic, WIPosition, type LoreEntry, type Lorebook, type Role, type WorldInfoSettings } from '../types';
import { escapeRegex, estimateTokens, parseRegex } from './util';

export interface WIScanMessage {
  name: string;
  text: string;
}

export interface WIResult {
  before: string;
  after: string;
  anTop: string;
  anBottom: string;
  emTop: string;
  emBottom: string;
  depth: { depth: number; role: Role; content: string }[];
  activated: { book: string; entry: LoreEntry }[];
}

export function blankEntry(uid: number): LoreEntry {
  return {
    uid,
    comment: '',
    key: [],
    keysecondary: [],
    selectiveLogic: WILogic.AND_ANY,
    content: '',
    strategy: 'normal',
    disable: false,
    position: WIPosition.before,
    depth: 4,
    role: 'system',
    order: 100,
    probability: 100,
    useProbability: true,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    caseSensitive: null,
    matchWholeWords: null,
    scanDepth: null,
    group: '',
    sticky: 0,
    cooldown: 0,
    delay: 0,
  };
}

function keyMatches(key: string, haystack: string, entry: LoreEntry, s: WorldInfoSettings): boolean {
  const k = key.trim();
  if (!k) return false;
  const rx = parseRegex(k);
  if (rx) {
    rx.lastIndex = 0;
    return rx.test(haystack);
  }
  const cs = entry.caseSensitive ?? s.caseSensitive;
  const whole = entry.matchWholeWords ?? s.matchWholeWords;
  const h = cs ? haystack : haystack.toLowerCase();
  const n = cs ? k : k.toLowerCase();
  if (!whole || /\s/.test(n)) return h.includes(n);
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(n)}(?![\\p{L}\\p{N}_])`, 'u');
  return re.test(h);
}

function entryMatches(entry: LoreEntry, text: string, s: WorldInfoSettings): boolean {
  const primary = entry.key.some((k) => keyMatches(k, text, entry, s));
  if (!primary) return false;
  const sec = entry.keysecondary.filter((k) => k.trim());
  if (!sec.length) return true;
  const hits = sec.map((k) => keyMatches(k, text, entry, s));
  switch (entry.selectiveLogic) {
    case WILogic.AND_ANY:
      return hits.some(Boolean);
    case WILogic.AND_ALL:
      return hits.every(Boolean);
    case WILogic.NOT_ANY:
      return !hits.some(Boolean);
    case WILogic.NOT_ALL:
      return !hits.every(Boolean);
    default:
      return true;
  }
}

// Таймеры sticky/cooldown живут в памяти вкладки: chatId → uid → номер сообщения
const stickyUntil = new Map<string, Map<string, number>>();
const cooldownUntil = new Map<string, Map<string, number>>();

export function scanWorldInfo(opts: {
  books: Lorebook[];
  messages: WIScanMessage[]; // от старых к новым
  settings: WorldInfoSettings;
  maxContext: number;
  chatId: string;
  extraScanText?: string; // описание персонажа и т.п. не сканируется по умолчанию
  dryRun?: boolean;
}): WIResult {
  const { books, messages, settings: s, maxContext, chatId } = opts;
  const res: WIResult = { before: '', after: '', anTop: '', anBottom: '', emTop: '', emBottom: '', depth: [], activated: [] };
  const all: { book: string; entry: LoreEntry }[] = [];
  for (const b of books) for (const e of b.entries) if (!e.disable && e.content.trim()) all.push({ book: b.id, entry: e });
  if (!all.length) return res;

  const msgCount = messages.length;
  const sticky = stickyUntil.get(chatId) ?? new Map<string, number>();
  const cooldown = cooldownUntil.get(chatId) ?? new Map<string, number>();
  const idOf = (x: { book: string; entry: LoreEntry }) => `${x.book}:${x.entry.uid}`;

  const bufferFor = (depth: number) =>
    messages
      .slice(-Math.max(0, depth))
      .map((m) => (s.includeNames ? `${m.name}: ${m.text}` : m.text))
      .reverse()
      .join('\n');

  const activated = new Map<string, { book: string; entry: LoreEntry }>();
  let recursionText = '';
  const maxSteps = s.recursive ? (s.maxRecursion > 0 ? s.maxRecursion : 10) : 0;

  for (let step = 0; step <= maxSteps; step++) {
    const isRecursion = step > 0;
    const found: { book: string; entry: LoreEntry }[] = [];
    for (const item of all) {
      const id = idOf(item);
      if (activated.has(id)) continue;
      const e = item.entry;
      if (e.delay && msgCount < e.delay) continue;
      if (!isRecursion && e.delayUntilRecursion) continue;
      if (isRecursion && e.excludeRecursion) continue;
      const stickyActive = (sticky.get(id) ?? -1) >= msgCount;
      if (!stickyActive && (cooldown.get(id) ?? -1) >= msgCount) continue;
      let hit = stickyActive || e.strategy === 'constant';
      if (!hit && e.strategy !== 'vector') {
        const text =
          bufferFor(e.scanDepth ?? s.scanDepth) + (opts.extraScanText ? '\n' + opts.extraScanText : '') + (isRecursion ? '\n' + recursionText : '');
        if (isRecursion) hit = entryMatches(e, recursionText, s);
        else hit = entryMatches(e, text, s);
      }
      if (!hit) continue;
      if (!stickyActive && e.useProbability && e.probability < 100 && Math.random() * 100 >= e.probability) continue;
      found.push(item);
    }
    if (!found.length) break;
    for (const f of found) {
      activated.set(idOf(f), f);
      if (!f.entry.preventRecursion) recursionText += '\n' + f.entry.content;
    }
    if (!s.recursive) break;
  }

  // Группы включения: из каждой группы остаётся запись с наибольшим порядком
  const byGroup = new Map<string, { book: string; entry: LoreEntry }>();
  let list: { book: string; entry: LoreEntry }[] = [];
  for (const a of activated.values()) {
    const g = a.entry.group.trim();
    if (!g) {
      list.push(a);
      continue;
    }
    for (const name of g.split(',').map((x) => x.trim()).filter(Boolean)) {
      const cur = byGroup.get(name);
      if (!cur || cur.entry.order < a.entry.order) byGroup.set(name, a);
    }
  }
  list.push(...new Set(byGroup.values()));

  // Бюджет: приоритет у постоянных и записей с большим порядком
  let budget = Math.round((maxContext * s.budget) / 100);
  if (s.budgetCap > 0) budget = Math.min(budget, s.budgetCap);
  list.sort((a, b) => Number(b.entry.strategy === 'constant') - Number(a.entry.strategy === 'constant') || b.entry.order - a.entry.order);
  const kept: typeof list = [];
  let used = 0;
  for (const x of list) {
    const t = estimateTokens(x.entry.content);
    if (used + t > budget && kept.length) continue;
    used += t;
    kept.push(x);
  }
  kept.sort((a, b) => a.entry.order - b.entry.order);

  if (!opts.dryRun) {
    for (const x of kept) {
      const id = idOf(x);
      if (x.entry.sticky > 0 && !((sticky.get(id) ?? -1) >= msgCount)) sticky.set(id, msgCount + x.entry.sticky);
      if (x.entry.cooldown > 0) cooldown.set(id, msgCount + (x.entry.sticky || 0) + x.entry.cooldown);
    }
    stickyUntil.set(chatId, sticky);
    cooldownUntil.set(chatId, cooldown);
  }

  const join = (pos: WIPosition) =>
    kept
      .filter((x) => x.entry.position === pos)
      .map((x) => x.entry.content.trim())
      .join('\n');
  res.before = join(WIPosition.before);
  res.after = join(WIPosition.after);
  res.anTop = join(WIPosition.anTop);
  res.anBottom = join(WIPosition.anBottom);
  res.emTop = join(WIPosition.emTop);
  res.emBottom = join(WIPosition.emBottom);
  res.depth = kept
    .filter((x) => x.entry.position === WIPosition.atDepth)
    .map((x) => ({ depth: x.entry.depth, role: x.entry.role, content: x.entry.content.trim() }));
  res.activated = kept;
  return res;
}

// ── Импорт/экспорт в формате SillyTavern ──

type Raw = Record<string, unknown>;

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter((x) => x.trim()) : typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];
const ROLE_BY_NUM: Role[] = ['system', 'user', 'assistant'];

export function entryFromST(raw: Raw, fallbackUid: number): LoreEntry {
  const e = blankEntry(num(raw.uid ?? raw.id, fallbackUid));
  e.comment = String(raw.comment ?? raw.name ?? '');
  e.key = arr(raw.key ?? raw.keys);
  e.keysecondary = arr(raw.keysecondary ?? raw.secondary_keys);
  e.selectiveLogic = num(raw.selectiveLogic, 0) as WILogic;
  e.content = String(raw.content ?? '');
  const constant = bool(raw.constant, false);
  e.strategy = constant ? 'constant' : raw.vectorized ? 'vector' : 'normal';
  e.disable = bool(raw.disable, raw.enabled === false);
  // Character Book хранит position как строку
  const pos = raw.position;
  if (typeof pos === 'string') e.position = pos === 'after_char' ? WIPosition.after : WIPosition.before;
  else e.position = num(pos, 0) as WIPosition;
  const ext = (raw.extensions as Raw) ?? {};
  if (typeof pos === 'string' && typeof ext.position === 'number') e.position = ext.position as WIPosition;
  e.depth = num(raw.depth ?? ext.depth, 4);
  const role = raw.role ?? ext.role;
  e.role = typeof role === 'number' ? ROLE_BY_NUM[role] ?? 'system' : (['system', 'user', 'assistant'].includes(String(role)) ? (role as Role) : 'system');
  e.order = num(raw.order ?? raw.insertion_order, 100);
  e.probability = num(raw.probability ?? ext.probability, 100);
  e.useProbability = bool(raw.useProbability ?? ext.useProbability, true);
  e.excludeRecursion = bool(raw.excludeRecursion ?? ext.exclude_recursion, false);
  e.preventRecursion = bool(raw.preventRecursion ?? ext.prevent_recursion, false);
  e.delayUntilRecursion = bool(raw.delayUntilRecursion ?? ext.delay_until_recursion, false);
  e.caseSensitive = typeof (raw.caseSensitive ?? raw.case_sensitive) === 'boolean' ? ((raw.caseSensitive ?? raw.case_sensitive) as boolean) : null;
  e.matchWholeWords = typeof (raw.matchWholeWords ?? ext.match_whole_words) === 'boolean' ? ((raw.matchWholeWords ?? ext.match_whole_words) as boolean) : null;
  e.scanDepth = typeof (raw.scanDepth ?? ext.scan_depth) === 'number' ? ((raw.scanDepth ?? ext.scan_depth) as number) : null;
  e.group = String(raw.group ?? ext.group ?? '');
  e.sticky = num(raw.sticky ?? ext.sticky, 0);
  e.cooldown = num(raw.cooldown ?? ext.cooldown, 0);
  e.delay = num(raw.delay ?? ext.delay, 0);
  return e;
}

export function entriesFromST(data: Raw): LoreEntry[] {
  const src = data.entries;
  const list: Raw[] = Array.isArray(src) ? (src as Raw[]) : src && typeof src === 'object' ? Object.values(src as Record<string, Raw>) : [];
  return list.map((r, i) => entryFromST(r, i));
}

export function entryToST(e: LoreEntry): Raw {
  return {
    uid: e.uid,
    key: e.key,
    keysecondary: e.keysecondary,
    comment: e.comment,
    content: e.content,
    constant: e.strategy === 'constant',
    vectorized: e.strategy === 'vector',
    selective: e.keysecondary.length > 0,
    selectiveLogic: e.selectiveLogic,
    addMemo: true,
    order: e.order,
    position: e.position,
    disable: e.disable,
    excludeRecursion: e.excludeRecursion,
    preventRecursion: e.preventRecursion,
    delayUntilRecursion: e.delayUntilRecursion,
    probability: e.probability,
    useProbability: e.useProbability,
    depth: e.depth,
    role: ROLE_BY_NUM.indexOf(e.role),
    group: e.group,
    scanDepth: e.scanDepth,
    caseSensitive: e.caseSensitive,
    matchWholeWords: e.matchWholeWords,
    sticky: e.sticky,
    cooldown: e.cooldown,
    delay: e.delay,
  };
}

export function lorebookToST(lb: Lorebook): Raw {
  const entries: Record<string, Raw> = {};
  lb.entries.forEach((e) => (entries[String(e.uid)] = entryToST(e)));
  return { name: lb.name, description: lb.description ?? '', entries };
}

/** Встроенный Character Book (spec v2) для экспорта в карточку. */
export function lorebookToCharacterBook(lb: Lorebook): Raw {
  return {
    name: lb.name,
    description: lb.description ?? '',
    scan_depth: undefined,
    token_budget: undefined,
    recursive_scanning: true,
    extensions: {},
    entries: lb.entries.map((e) => ({
      id: e.uid,
      keys: e.key,
      secondary_keys: e.keysecondary,
      comment: e.comment,
      content: e.content,
      constant: e.strategy === 'constant',
      selective: e.keysecondary.length > 0,
      insertion_order: e.order,
      enabled: !e.disable,
      position: e.position === WIPosition.after ? 'after_char' : 'before_char',
      extensions: {
        position: e.position,
        depth: e.depth,
        role: ROLE_BY_NUM.indexOf(e.role),
        probability: e.probability,
        useProbability: e.useProbability,
        selectiveLogic: e.selectiveLogic,
        exclude_recursion: e.excludeRecursion,
        prevent_recursion: e.preventRecursion,
        delay_until_recursion: e.delayUntilRecursion,
        group: e.group,
        scan_depth: e.scanDepth,
        match_whole_words: e.matchWholeWords,
        sticky: e.sticky,
        cooldown: e.cooldown,
        delay: e.delay,
      },
    })),
  };
}

export const POSITION_LABELS: Record<WIPosition, string> = {
  [WIPosition.before]: 'До описания персонажа',
  [WIPosition.after]: 'После описания персонажа',
  [WIPosition.anTop]: 'Над заметкой автора',
  [WIPosition.anBottom]: 'Под заметкой автора',
  [WIPosition.atDepth]: 'На глубине',
  [WIPosition.emTop]: 'Над примерами диалогов',
  [WIPosition.emBottom]: 'Под примерами диалогов',
};

export const POSITION_SHORT: Record<WIPosition, string> = {
  [WIPosition.before]: 'до перс.',
  [WIPosition.after]: 'после перс.',
  [WIPosition.anTop]: 'над АН',
  [WIPosition.anBottom]: 'под АН',
  [WIPosition.atDepth]: 'глубина',
  [WIPosition.emTop]: 'над прим.',
  [WIPosition.emBottom]: 'под прим.',
};

export const LOGIC_LABELS: Record<WILogic, string> = {
  [WILogic.AND_ANY]: 'И — любой',
  [WILogic.AND_ALL]: 'И — все',
  [WILogic.NOT_ANY]: 'НЕ — ни один',
  [WILogic.NOT_ALL]: 'НЕ — не все',
};
