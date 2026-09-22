// Локализация: ключ — русская строка, для английского берётся перевод из словаря.
import { EN, EN_PLURALS } from './i18n-en';

export type Lang = 'ru' | 'en';

let current: Lang = 'en';

export const setLang = (l: Lang) => void (current = l);
export const getLang = (): Lang => current;
export const locale = () => (current === 'en' ? 'en-US' : 'ru-RU');

/** tr('Чат «{0}»', name) — перевод с подстановкой {0}, {1}… */
export function tr(ru: string, ...args: unknown[]): string {
  const s = current === 'en' ? EN[ru] ?? ru : ru;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

/** Английская форма для русского plural(n, 'сообщение', 'сообщения', 'сообщений'). */
export function enPlural(n: number, many: string): string | undefined {
  const f = EN_PLURALS[many];
  return f ? (n === 1 ? f[0] : f[1]) : undefined;
}
