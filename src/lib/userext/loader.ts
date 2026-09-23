// Установка и загрузка сторонних расширений (формат SillyTavern: manifest.json + index.js).
// Файлы берутся с GitHub через jsDelivr (правильный MIME для модулей и CORS), версия закрепляется по коммиту.
// Импорты внутренних модулей ST (../../../extensions.js, ../../../../script.js…) подменяются совместимым слоем.
import type { ExtManifest, ExtRuntimeStatus, UserExtension } from '../../types';
import { getState, setState, toast, useStore } from '../../store';
import { tr } from '../i18n';
import { uid } from '../util';
import { eventSource, event_types } from './events';
import { extBases, exportsTable, getContext, loadExtensionSettings, stub, toastrShim } from './st';

// ── Источники ──

export type ExtSource =
  | { kind: 'github'; owner: string; repo: string; ref?: string; path: string }
  | { kind: 'url'; base: string };

/** github.com/автор/репо, автор/репо, …/tree/ветка/папка, или прямая ссылка на папку с manifest.json. */
export function parseSource(input: string): ExtSource {
  const t = input.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(t);
  if (short) return { kind: 'github', owner: short[1], repo: short[2], path: '' };
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new Error(tr('Нужна ссылка на репозиторий GitHub или папку с manifest.json'));
  }
  if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
    const [owner, repo, kind, ref, ...rest] = u.pathname.split('/').filter(Boolean);
    if (!owner || !repo) throw new Error(tr('В ссылке не хватает автора или репозитория'));
    return { kind: 'github', owner, repo: repo.replace(/\.git$/i, ''), ref: kind === 'tree' || kind === 'blob' ? ref : undefined, path: kind === 'tree' ? rest.join('/') : '' };
  }
  const base = u.href.replace(/manifest\.json$/i, '').replace(/\/?$/, '/');
  return { kind: 'url', base };
}

async function githubSha(owner: string, repo: string, ref: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, {
      headers: { Accept: 'application/vnd.github.sha' },
    });
    if (!r.ok) return undefined;
    const sha = (await r.text()).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

async function githubDefaultBranch(owner: string, repo: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (r.status === 404) throw new Error(tr('Репозиторий {0}/{1} не найден (или он закрытый)', owner, repo));
    if (!r.ok) return undefined;
    return (await r.json()).default_branch;
  } catch (e) {
    if ((e as Error).message.includes(repo)) throw e;
    return undefined;
  }
}

const cdn = (owner: string, repo: string, at: string, path: string) =>
  `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${at}/${path ? path.replace(/\/?$/, '/') : ''}`;

async function fetchManifest(base: string): Promise<ExtManifest> {
  const r = await fetch(`${base}manifest.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(tr('manifest.json не найден ({0})', `HTTP ${r.status}`));
  const m = (await r.json()) as ExtManifest;
  if (!m || typeof m !== 'object' || !(m.js || m.css)) throw new Error(tr('manifest.json без поля js — это не расширение'));
  m.display_name = String(m.display_name || '').trim();
  return m;
}

/** Определяет, откуда брать файлы, и читает manifest.json. */
async function resolve(src: ExtSource): Promise<{ base: string; manifest: ExtManifest; github?: UserExtension['github']; folder: string }> {
  if (src.kind === 'url') {
    const manifest = await fetchManifest(src.base);
    const folder = decodeURIComponent(src.base.replace(/\/$/, '').split('/').pop() ?? 'extension');
    return { base: src.base, manifest, folder };
  }
  const { owner, repo, path } = src;
  const refs = src.ref ? [src.ref] : [(await githubDefaultBranch(owner, repo)) ?? 'main', 'master'];
  let lastErr: unknown;
  for (const ref of [...new Set(refs)]) {
    const sha = await githubSha(owner, repo, ref);
    const base = cdn(owner, repo, sha ?? ref, path);
    try {
      const manifest = await fetchManifest(base);
      return { base, manifest, github: { owner, repo, ref, path, sha }, folder: path ? path.split('/').pop()! : repo };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error(tr('Не удалось загрузить расширение'));
}

// ── Установка, обновление, удаление ──

const setStatus = (id: string, st: ExtRuntimeStatus) => setState((s) => ({ extStatus: { ...s.extStatus, [id]: st } }));

export async function installExtension(input: string): Promise<UserExtension> {
  const src = parseSource(input);
  const { base, manifest, github, folder } = await resolve(src);
  const s = getState();
  const dup = s.userExts.find((x) => x.folder === folder || x.source.replace(/\/$/, '') === input.trim().replace(/\/$/, ''));
  if (dup) throw new Error(tr('Расширение «{0}» уже установлено', dup.manifest.display_name || dup.folder));
  const now = Date.now();
  const ext: UserExtension = { id: uid(), folder, source: input.trim(), base, github, manifest, enabled: true, installedAt: now, updatedAt: now };
  setState((st) => ({ userExts: [...st.userExts, ext] }));
  // APP_READY уже был — новое расширение получит его сразу при подписке (см. EventEmitter.on)
  await loadExtension(ext);
  return ext;
}

/** Проверяет новую версию. true — обновилось (нужна перезагрузка страницы). */
export async function updateExtension(id: string): Promise<boolean> {
  const ext = getState().userExts.find((x) => x.id === id);
  if (!ext) return false;
  const src: ExtSource = ext.github ? { kind: 'github', ...ext.github, ref: ext.github.ref } : { kind: 'url', base: ext.base };
  const r = await resolve(src);
  const changed = r.base !== ext.base || JSON.stringify(r.manifest) !== JSON.stringify(ext.manifest) || !ext.github;
  if (!changed) return false;
  setState((s) => ({ userExts: s.userExts.map((x) => (x.id === id ? { ...x, base: r.base, manifest: r.manifest, github: r.github, updatedAt: Date.now() } : x)) }));
  if (loaded.has(id)) setStatus(id, { state: 'reload' });
  return true;
}

export function removeExtension(id: string) {
  const ext = getState().userExts.find((x) => x.id === id);
  setState((s) => ({ userExts: s.userExts.filter((x) => x.id !== id) }));
  document.querySelectorAll(`link[data-dx-ext="${id}"]`).forEach((l) => l.remove());
  if (ext && loaded.has(id)) setStatus(id, { state: 'reload' });
}

export function setExtensionEnabled(id: string, on: boolean) {
  setState((s) => ({ userExts: s.userExts.map((x) => (x.id === id ? { ...x, enabled: on } : x)) }));
  const ext = getState().userExts.find((x) => x.id === id);
  if (!ext) return;
  if (on && !loaded.has(id)) void loadExtension(ext);
  // выгрузить уже выполненный код нельзя — выключение вступит в силу после перезагрузки
  if (!on && loaded.has(id)) setStatus(id, { state: 'reload' });
}

// ── Глобальное окружение для расширений ST ──

let envReady: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error(`${src}: не загрузился`));
    document.head.appendChild(s);
  });
}

/** /scripts/extensions/third-party/<папка>/файл → адрес файла расширения */
export function rewriteExtUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  const m = /\/scripts\/extensions\/third-party\/([^/]+)\/(.*)$/.exec(url.pathname);
  const base = m && extBases.get(decodeURIComponent(m[1]));
  return base ? base + m![2] + url.search : null;
}

/** Контейнеры, куда расширения ST добавляют свои элементы. Живут вне React и переносятся в окна при открытии. */
export const HOLDER_IDS = ['extensions_settings', 'extensions_settings2', 'extensionsMenu'];

function ensureHolder() {
  let holder = document.getElementById('dx-ext-holder');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'dx-ext-holder';
    holder.hidden = true;
    document.body.appendChild(holder);
  }
  for (const id of [...HOLDER_IDS, 'movingDivs']) {
    if (!document.getElementById(id)) {
      const d = document.createElement('div');
      d.id = id;
      holder.appendChild(d);
    }
  }
  return holder;
}

function setupEnv(): Promise<void> {
  if (envReady) return envReady;
  envReady = (async () => {
    const w = window as any;
    ensureHolder();
    loadExtensionSettings();
    // таблица строится при каждом импорте: имена, текущий персонаж и т.п. берутся свежими
    w.__dxST = {
      pick: (name: string) => {
        const table = exportsTable();
        return name in table ? table[name] : stub(name);
      },
    };
    w.SillyTavern = { getContext, libs: { DOMPurify: exportsTable().DOMPurify } };
    w.toastr ??= toastrShim;
    // запросы к файлам расширения по путям ST
    const origFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      const r = rewriteExtUrl(u);
      return origFetch(r ?? input, init);
    };
    // jQuery и значки Font Awesome — на них построены почти все расширения ST
    if (!w.jQuery) await loadScript('https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js');
    if (!w.jQuery) throw new Error(tr('не удалось загрузить jQuery с cdn.jsdelivr.net — проверьте интернет'));
    w.$ ??= w.jQuery;
    w.jQuery.ajaxPrefilter((o: { url?: string }) => {
      const r = o.url && rewriteExtUrl(o.url);
      if (r) o.url = r;
    });
    if (!document.querySelector('link[data-dx-fa]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
      l.dataset.dxFa = '1';
      document.head.appendChild(l);
    }
    // раскрывающиеся блоки настроек ST (inline-drawer)
    document.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest?.('.inline-drawer-toggle');
      if (!t) return;
      const drawer = t.closest('.inline-drawer');
      const content = drawer?.querySelector<HTMLElement>(':scope > .inline-drawer-content');
      if (!content) return;
      const open = content.classList.toggle('dx-open');
      drawer!.querySelector('.inline-drawer-icon')?.classList.toggle('down', !open);
      drawer!.querySelector('.inline-drawer-icon')?.classList.toggle('up', open);
    });
    // смена чата
    useStore.subscribe((s, prev) => {
      if (s.activeChatId !== prev.activeChatId) void eventSource.emit(event_types.CHAT_CHANGED, s.activeChatId);
    });
  })();
  return envReady;
}

// ── Загрузка модулей с подменой импортов ST ──

const IMPORT_RE = /(\bimport\s*(?:([\w$*{}\s,]+?)\s*from\s*)?|\bexport\s*(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\4/g;
const DYN_RE = /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(['default', 'class', 'function', 'const', 'let', 'var', 'new', 'delete', 'in', 'if', 'for', 'while', 'return', 'import', 'export']);

/** Имена, которые модуль берёт из импорта: { a, b as c } → a, b; default. */
function importedNames(clause: string | undefined): string[] {
  if (!clause) return [];
  const out: string[] = [];
  const braces = /\{([^}]*)\}/.exec(clause);
  if (braces) for (const part of braces[1].split(',')) {
    const n = part.trim().split(/\s+as\s+/)[0]?.trim();
    if (n) out.push(n);
  }
  const head = clause.replace(/\{[^}]*\}/, '').split(',')[0]?.trim();
  if (head && !head.startsWith('*') && IDENT.test(head)) out.push('default');
  return out;
}

const shimCache = new Map<string, string>();
/** Модуль-заглушка вместо файла ST: экспортирует всё из таблицы совместимости и всё, что у неё попросили. */
function shimModule(names: string[]): string {
  const table = exportsTable();
  const all = new Set([...Object.keys(table), ...names].filter((n) => IDENT.test(n) && !RESERVED.has(n)));
  const key = [...all].sort().join(',');
  const hit = shimCache.get(key);
  if (hit) return hit;
  const code = ['const S = globalThis.__dxST;', 'export default S.pick("default");', ...[...all].map((n) => `export const ${n} = S.pick(${JSON.stringify(n)});`)].join('\n');
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  shimCache.set(key, url);
  return url;
}

class ModuleLoader {
  private cache = new Map<string, Promise<string>>();
  private stack = new Set<string>();
  constructor(
    private base: string,
    private folder: string,
  ) {}

  /** Путь ST для файла расширения — чтобы относительные импорты разрешались как в таверне. */
  private virtual(rel: string) {
    return new URL(rel, `https://st.invalid/scripts/extensions/third-party/${encodeURIComponent(this.folder)}/`).href;
  }

  private ownPrefix() {
    return `https://st.invalid/scripts/extensions/third-party/${encodeURIComponent(this.folder)}/`;
  }

  load(rel: string): Promise<string> {
    const key = rel.replace(/^\.?\//, '');
    const hit = this.cache.get(key);
    if (hit) return hit;
    // циклический импорт: отдаём файл напрямую (его импорты ST уже не подменятся)
    if (this.stack.has(key)) return Promise.resolve(this.base + key);
    const p = this.compile(key);
    this.cache.set(key, p);
    return p;
  }

  private async compile(rel: string): Promise<string> {
    this.stack.add(rel);
    const url = this.base + rel;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    let code = await res.text();
    const fileVirtual = this.virtual(rel);

    const replacements = new Map<string, string>();
    const resolveSpec = async (spec: string, clause?: string): Promise<string | null> => {
      if (/^(https?:|data:|blob:)/.test(spec)) return null;
      if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // «голые» имена пакетов оставляем как есть
      const abs = new URL(spec, fileVirtual).href;
      if (abs.startsWith(this.ownPrefix())) return this.load(decodeURIComponent(abs.slice(this.ownPrefix().length)));
      return shimModule(importedNames(clause));
    };

    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[5];
      const k = `${spec}|${m[2] ?? m[3] ?? ''}`;
      if (!replacements.has(k)) {
        const r = await resolveSpec(spec, m[2] ?? m[3]);
        if (r) replacements.set(k, r);
      }
    }
    code = code.replace(IMPORT_RE, (whole, head: string, clause: string | undefined, exp: string | undefined, q: string, spec: string) => {
      const r = replacements.get(`${spec}|${clause ?? exp ?? ''}`);
      return r ? `${head}${q}${r}${q}` : whole;
    });
    const dyn = new Map<string, string>();
    for (const m of code.matchAll(DYN_RE)) {
      if (!dyn.has(m[2])) {
        const r = await resolveSpec(m[2]);
        if (r) dyn.set(m[2], r);
      }
    }
    code = code.replace(DYN_RE, (whole, q: string, spec: string) => (dyn.has(spec) ? `import(${q}${dyn.get(spec)}${q})` : whole));
    code = code.replace(/\bimport\.meta\.url\b/g, JSON.stringify(url));
    this.stack.delete(rel);
    return URL.createObjectURL(new Blob([code + `\n//# sourceURL=${url}`], { type: 'text/javascript' }));
  }
}

const loaded = new Set<string>();

export async function loadExtension(ext: UserExtension) {
  if (loaded.has(ext.id) || !ext.enabled) return;
  setStatus(ext.id, { state: 'loading' });
  try {
    await setupEnv();
    extBases.set(ext.folder, ext.base);
    if (ext.manifest.css && !document.querySelector(`link[data-dx-ext="${ext.id}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = ext.base + ext.manifest.css;
      l.dataset.dxExt = ext.id;
      document.head.appendChild(l);
    }
    if (ext.manifest.js) {
      const entry = await new ModuleLoader(ext.base, ext.folder).load(ext.manifest.js);
      await import(/* @vite-ignore */ entry);
    }
    loaded.add(ext.id);
    setStatus(ext.id, { state: 'ok' });
  } catch (e) {
    console.error(`[Divinax] расширение ${ext.folder}:`, e);
    setStatus(ext.id, { state: 'error', error: (e as Error).message });
  }
}

/** Загрузка всех включённых расширений при старте (по loading_order, как в ST). */
export async function loadUserExtensions() {
  const list = getState()
    .userExts.filter((x) => x.enabled)
    .sort((a, b) => (a.manifest.loading_order ?? 100) - (b.manifest.loading_order ?? 100));
  for (const ext of list) await loadExtension(ext);
  await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED);
  await eventSource.emit(event_types.SETTINGS_LOADED);
  await eventSource.fireOnce(event_types.APP_READY);
  const failed = list.filter((x) => getState().extStatus[x.id]?.state === 'error');
  if (failed.length) toast(tr('Не загрузились расширения: {0}', failed.map((x) => x.manifest.display_name || x.folder).join(', ')), 'error');
}

export const isLoaded = (id: string) => loaded.has(id);
