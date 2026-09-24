import { tr } from './i18n';
// Универсальный импорт: карточки PNG/JSON, лорбуки, чаты JSONL, регексы и ZIP-архивы с ними.
import type { RegexScript } from '../types';
import { getState, openModal, setState, toast, upsertCharacter, upsertLorebook } from '../store';
import { mergeRegex, regexFromAny } from './regexio';
import { zipToFiles } from './zip';
import { importCharacterFile } from './cards';
import { importChatFiles, parseChatFile } from './chatio';
import { entriesFromST } from './worldinfo';
import { uid } from './util';

export async function importFiles(input: File[]) {
  // архивы распаковываем: внутри могут быть карточки, лорбуки, чаты и регексы вперемешку
  const files: File[] = [];
  const fromZip = new Set<File>();
  for (const f of input) {
    if (!/\.zip$/i.test(f.name)) {
      files.push(f);
      continue;
    }
    try {
      const inner = await zipToFiles(await f.arrayBuffer());
      if (!inner.length) throw new Error(tr('архив пустой'));
      inner.forEach((x) => fromZip.add(x));
      files.push(...inner);
    } catch (e) {
      toast(`${f.name}: ${(e as Error).message}`, 'error');
    }
  }
  const regex: RegexScript[] = [];
  for (const f of files) {
    // из архива берём только то, что умеем импортировать; README, картинки и прочее молча пропускаем
    if (fromZip.has(f) && !/\.(png|json|jsonl)$/i.test(f.name)) continue;
    try {
      const name = f.name.toLowerCase();
      if (name.endsWith('.jsonl')) {
        await importChatFiles([f]);
        continue;
      }
      if (name.endsWith('.json')) {
        const text = await f.text();
        const j = JSON.parse(text);
        if (j.entries && !j.spec && !j.data && !j.first_mes) {
          importLorebookJson(j, f.name.replace(/\.json$/i, ''));
          continue;
        }
        // регекс SillyTavern (один скрипт или массив) — собираем все и добавляем одним разом
        if (Array.isArray(j) || typeof j.findRegex === 'string') {
          const found = regexFromAny(j);
          if (found.length) {
            regex.push(...found);
            continue;
          }
        }
        // чаты других фронтендов (Agnai, Oobabooga, CAI Tools, RisuAI)
        const isCard = j.spec || j.first_mes !== undefined || (j.data && j.data.first_mes !== undefined);
        if (!isCard && parseChatFile(text, f.name).length) {
          await importChatFiles([f]);
          continue;
        }
      }
      if (name.endsWith('.png') || name.endsWith('.json')) {
        const { char, book } = await importCharacterFile(f);
        if (book) upsertLorebook(book);
        upsertCharacter(char);
        setState({ editingCharId: char.id });
        toast(tr('Персонаж «{0}» импортирован{1}', char.name, book ? tr(' вместе с лорбуком') : ''), 'success');
        continue;
      }
      if (/\.(jpe?g|webp|gif|avif)$/.test(name)) {
        openModal('info', tr('Картинку можно загрузить как фон во вкладке «Интерфейс» или как аватар в карточке.'));
        continue;
      }
      throw new Error(tr('Неизвестный формат'));
    } catch (e) {
      toast(`${f.name}: ${(e as Error).message}`, 'error');
    }
  }
  if (regex.length) {
    const r = mergeRegex(getState().ext.regex, regex);
    setState((s) => ({ ext: { ...s.ext, regex: r.list } }));
    toast(
      r.skipped ? tr('Импортировано регексов: {0}, пропущено повторов: {1}', r.added, r.skipped) : tr('Импортировано регексов: {0}', r.added),
      'success',
    );
  }
}

export function importLorebookJson(j: Record<string, unknown>, fallbackName: string): string {
  const now = Date.now();
  const id = uid();
  upsertLorebook({
    id,
    name: String(j.name || fallbackName),
    description: String(j.description ?? ''),
    entries: entriesFromST(j),
    createdAt: now,
    updatedAt: now,
  });
  setState({ editingLorebookId: id });
  toast(tr('Лорбук «{0}» импортирован', String(j.name || fallbackName)), 'success');
  return id;
}
