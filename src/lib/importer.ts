// Универсальный импорт: карточки PNG/JSON, лорбуки, чаты JSONL.
import { activeChat, getState, openModal, setState, toast, upsertCharacter, upsertLorebook } from '../store';
import { importCharacterFile } from './cards';
import { importChatText } from './chats';
import { entriesFromST } from './worldinfo';
import { uid } from './util';

export async function importFiles(files: File[]) {
  for (const f of files) {
    try {
      const name = f.name.toLowerCase();
      if (name.endsWith('.jsonl')) {
        const c = activeChat(getState());
        if (!c) throw new Error('Откройте чат персонажа, чтобы импортировать историю');
        importChatText(await f.text(), c.ownerType, c.ownerId, f.name);
        toast(`Чат «${f.name}» импортирован`, 'success');
        continue;
      }
      if (name.endsWith('.json')) {
        const j = JSON.parse(await f.text());
        if (j.entries && !j.spec && !j.data && !j.first_mes) {
          importLorebookJson(j, f.name.replace(/\.json$/i, ''));
          continue;
        }
      }
      if (name.endsWith('.png') || name.endsWith('.json')) {
        const { char, book } = await importCharacterFile(f);
        if (book) upsertLorebook(book);
        upsertCharacter(char);
        setState({ editingCharId: char.id });
        toast(`Персонаж «${char.name}» импортирован${book ? ' вместе с лорбуком' : ''}`, 'success');
        continue;
      }
      if (/\.(jpe?g|webp|gif|avif)$/.test(name)) {
        openModal('info', 'Картинку можно загрузить как фон во вкладке «Интерфейс» или как аватар в карточке.');
        continue;
      }
      throw new Error('Неизвестный формат');
    } catch (e) {
      toast(`${f.name}: ${(e as Error).message}`, 'error');
    }
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
  toast(`Лорбук «${String(j.name || fallbackName)}» импортирован`, 'success');
  return id;
}
