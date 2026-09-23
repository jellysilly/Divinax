// Какие лорбуки активны в чате и откуда они подключены.
import type { Chat, Persona } from '../types';
import { currentPersona, setState, type State } from '../store';

export type BookSource =
  | { kind: 'global' }
  | { kind: 'chat' }
  | { kind: 'char'; name: string } // основной лорбук персонажа (уходит в карточку при экспорте)
  | { kind: 'charExtra'; name: string } // дополнительный лорбук персонажа
  | { kind: 'persona'; name: string };

/** id лорбука → откуда он включён. Порядок: глобальные, персонажи, чат, персона. */
export function bookSources(s: State, chat?: Chat, persona?: Persona): Map<string, BookSource[]> {
  const out = new Map<string, BookSource[]>();
  const add = (id: string | undefined, src: BookSource) => {
    if (!id || !s.lorebooks[id]) return;
    const list = out.get(id);
    if (list) list.push(src);
    else out.set(id, [src]);
  };
  s.wi.global.forEach((id) => add(id, { kind: 'global' }));
  if (chat) {
    const ids = chat.ownerType === 'group' ? (s.groups[chat.ownerId]?.members ?? []) : [chat.ownerId];
    for (const id of ids) {
      const c = s.characters[id];
      if (!c) continue;
      add(c.lorebookId, { kind: 'char', name: c.name });
      (c.extraLorebookIds ?? []).forEach((b) => add(b, { kind: 'charExtra', name: c.name }));
    }
    chat.lorebookIds.forEach((id) => add(id, { kind: 'chat' }));
    const p = persona ?? currentPersona(s, chat);
    if (p) add(p.lorebookId, { kind: 'persona', name: p.name });
  }
  return out;
}

/** Включить/выключить лорбук для персонажа: первый становится основным, остальные — дополнительными. */
export function setCharBook(charId: string, bookId: string, on: boolean) {
  setState((s) => {
    const ch = s.characters[charId];
    if (!ch) return {};
    let { lorebookId } = ch;
    let extra = (ch.extraLorebookIds ?? []).filter((x) => x !== bookId);
    if (on) {
      if (!lorebookId || !s.lorebooks[lorebookId]) lorebookId = bookId;
      else if (lorebookId !== bookId) extra = [...extra, bookId];
    } else if (lorebookId === bookId) {
      // основной выключили — его место занимает первый дополнительный
      lorebookId = extra[0];
      extra = extra.slice(1);
    }
    return { characters: { ...s.characters, [charId]: { ...ch, lorebookId, extraLorebookIds: extra, updatedAt: Date.now() } } };
  });
}

export function charHasBook(s: State, charId: string, bookId: string): boolean {
  const ch = s.characters[charId];
  return Boolean(ch && (ch.lorebookId === bookId || ch.extraLorebookIds?.includes(bookId)));
}
