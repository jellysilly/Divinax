export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16);

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function fmtDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export const fmtDayTitle = (ts: number) => {
  const s = fmtDay(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const fmtNum = (n: number) => n.toLocaleString('ru-RU');

/** Приблизительный подсчёт токенов без загрузки токенизатора. */
export function estimateTokens(text: string, mode: 'auto' | 'chars' | 'words' = 'auto'): number {
  if (!text) return 0;
  if (mode === 'words') return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);
  if (mode === 'chars') return Math.ceil(text.length / 4);
  // «auto»: кириллица токенизируется плотнее латиницы
  const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const other = text.length - cyr;
  return Math.ceil(cyr / 2.6 + other / 3.8);
}

export function download(filename: string, data: string | Blob, type = 'application/json') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // удаляем чуть позже: иначе часть браузеров теряет имя файла
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(a.href);
  }, 5000);
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export const readText = (f: Blob) => f.text();

export function readDataUrl(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/** Уменьшает картинку, чтобы не раздувать хранилище. */
export async function shrinkImage(dataUrl: string, max = 768, quality = 0.88): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode().catch(() => undefined);
  if (!img.width) return dataUrl;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  if (k === 1 && dataUrl.length < 400_000) return dataUrl;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', quality);
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'divinax';

export function initials(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function parseRegex(src: string): RegExp | null {
  const m = /^\/(.+)\/([dgimsuy]*)$/s.exec(src.trim());
  if (!m) return null;
  try {
    return new RegExp(m[1], m[2]);
  } catch {
    return null;
  }
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
