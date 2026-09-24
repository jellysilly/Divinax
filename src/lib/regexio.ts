// Импорт регексов из файлов: JSON SillyTavern (скрипт, массив скриптов, пресет или карточка с regex_scripts) и ZIP-архивы с ними.
import type { RegexScript } from '../types';
import { tr } from './i18n';
import { regexFromST } from './regex';
import { isZip, zipToFiles } from './zip';

/** Все скрипты из разобранного JSON любого из известных видов. */
export function regexFromAny(j: unknown): RegexScript[] {
  if (Array.isArray(j)) return j.flatMap(regexFromAny);
  if (!j || typeof j !== 'object') return [];
  const o = j as Record<string, any>;
  if (typeof o.findRegex === 'string' || (typeof o.find === 'string' && 'replace' in o)) return [regexFromST(o)];
  const nested = o.regex_scripts ?? o.extensions?.regex_scripts ?? o.data?.extensions?.regex_scripts ?? o.scripts;
  return Array.isArray(nested) ? nested.flatMap(regexFromAny) : [];
}

export interface RegexImport {
  scripts: RegexScript[];
  errors: string[]; // «файл: причина»
}

/** Читает выбранные файлы (.json и .zip) и собирает из них скрипты. */
export async function readRegexFiles(files: File[]): Promise<RegexImport> {
  const out: RegexImport = { scripts: [], errors: [] };
  const queue = [...files];
  while (queue.length) {
    const f = queue.shift()!;
    try {
      const buf = await f.arrayBuffer();
      if (isZip(buf)) {
        queue.push(...(await zipToFiles(buf)).filter((x) => /\.json$/i.test(x.name)));
        continue;
      }
      const found = regexFromAny(JSON.parse(new TextDecoder().decode(buf).replace(/^﻿/, '')));
      if (found.length) out.scripts.push(...found);
      else out.errors.push(`${f.name}: ${tr('не похоже на регекс')}`);
    } catch (e) {
      out.errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Добавляет скрипты к списку, пропуская точные повторы (то же имя, поиск и замена). */
export function mergeRegex(list: RegexScript[], added: RegexScript[]): { list: RegexScript[]; added: number; skipped: number } {
  const key = (r: RegexScript) => `${r.name}\u0000${r.find}\u0000${r.replace}`;
  const seen = new Set(list.map(key));
  const fresh = added.filter((r) => !seen.has(key(r)) && (seen.add(key(r)), true));
  return { list: [...list, ...fresh], added: fresh.length, skipped: added.length - fresh.length };
}
