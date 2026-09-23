// Меню «Активные лорбуки»: что включено в текущем чате, откуда, и быстрые переключатели.
import { useState } from 'react';
import { BookMarked, Pencil } from 'lucide-react';
import { tr } from '../lib/i18n';
import { activeChat, closeModal, setState, setTab, updateChat, useStore } from '../store';
import { bookSources, setCharBook, type BookSource } from '../lib/books';
import { fmtNum, plural } from '../lib/util';
import { IconBtn, Modal, SearchInput } from './ui';

function sourceLabel(src: BookSource): string {
  switch (src.kind) {
    case 'global':
      return tr('во всех чатах');
    case 'chat':
      return tr('в этом чате');
    case 'char':
      return tr('персонаж «{0}»', src.name);
    case 'charExtra':
      return tr('персонаж «{0}», доп.', src.name);
    case 'persona':
      return tr('персона «{0}»', src.name);
  }
}

export function ActiveBooksModal() {
  const lorebooks = useStore((s) => s.lorebooks);
  const global = useStore((s) => s.wi.global);
  const chat = useStore(activeChat);
  const characters = useStore((s) => s.characters);
  // источники сериализуем в строку: селектор должен возвращать стабильное значение
  const srcKey = useStore((s) => JSON.stringify([...bookSources(s, activeChat(s))]));
  const sources = new Map<string, BookSource[]>(JSON.parse(srcKey));
  const [q, setQ] = useState('');
  const charId = chat?.ownerType === 'char' ? chat.ownerId : undefined;
  const char = charId ? characters[charId] : undefined;

  const all = Object.values(lorebooks);
  const activeEntries = [...sources.keys()].reduce((n, id) => n + (lorebooks[id]?.entries.filter((e) => !e.disable).length ?? 0), 0);
  const needle = q.trim().toLowerCase();
  const list = all
    .filter((b) => !needle || b.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(sources.has(b.id)) - Number(sources.has(a.id)) || a.name.localeCompare(b.name));

  const toggleGlobal = (id: string, on: boolean) =>
    setState((s) => ({ wi: { ...s.wi, global: on ? [...s.wi.global.filter((x) => x !== id), id] : s.wi.global.filter((x) => x !== id) } }));
  const toggleChat = (id: string, on: boolean) =>
    chat && updateChat(chat.id, (c) => void (c.lorebookIds = on ? [...c.lorebookIds.filter((x) => x !== id), id] : c.lorebookIds.filter((x) => x !== id)));

  const open = (id: string) => {
    setState({ editingLorebookId: id });
    setTab('lorebook');
    closeModal();
  };

  return (
    <Modal title={tr('Активные лорбуки')} onClose={closeModal} wide>
      <div className="sub">
        {sources.size
          ? tr('Сейчас работают {0} {1} · {2} {3}.', sources.size, plural(sources.size, 'лорбук', 'лорбука', 'лорбуков'), fmtNum(activeEntries), plural(activeEntries, 'запись', 'записи', 'записей'))
          : tr('Сейчас ни один лорбук не включён.')}{' '}
        {tr('Включайте сколько угодно лорбуков сразу: во всех чатах, только в этом чате или для персонажа.')}
      </div>
      {all.length > 6 && <SearchInput value={q} onChange={setQ} placeholder={tr('Поиск лорбука')} />}
      {!all.length && <div className="empty">{tr('Лорбуков пока нет. Создайте или импортируйте их во вкладке «Лорбук».')}</div>}
      <div className="col" style={{ gap: 8 }}>
        {list.map((b) => {
          const src = sources.get(b.id) ?? [];
          const on = src.length > 0;
          const count = b.entries.filter((e) => !e.disable).length;
          const inChar = Boolean(char && (char.lorebookId === b.id || char.extraLorebookIds?.includes(b.id)));
          return (
            <div key={b.id} className={`book-row ${on ? 'on' : ''}`}>
              <BookMarked size={18} className="book-icon" />
              <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
                <div className="book-name">{b.name}</div>
                <div className="hint" style={{ margin: 0 }}>
                  {fmtNum(count)} {plural(count, 'запись', 'записи', 'записей')}
                  {on ? ' · ' + src.map(sourceLabel).join(', ') : ' · ' + tr('выключен')}
                </div>
              </div>
              <div className="book-toggles">
                <button type="button" className={`chip ${global.includes(b.id) ? 'on' : ''}`} aria-pressed={global.includes(b.id)} onClick={() => toggleGlobal(b.id, !global.includes(b.id))}>
                  {tr('Везде')}
                </button>
                {chat && (
                  <button type="button" className={`chip ${chat.lorebookIds.includes(b.id) ? 'on' : ''}`} aria-pressed={chat.lorebookIds.includes(b.id)} onClick={() => toggleChat(b.id, !chat.lorebookIds.includes(b.id))}>
                    {tr('Этот чат')}
                  </button>
                )}
                {charId && (
                  <button type="button" className={`chip ${inChar ? 'on' : ''}`} aria-pressed={inChar} onClick={() => setCharBook(charId, b.id, !inChar)}>
                    {tr('Персонаж')}
                  </button>
                )}
              </div>
              <IconBtn size="sm" icon={<Pencil size={14} />} label={tr('Открыть лорбук')} onClick={() => open(b.id)} />
            </div>
          );
        })}
      </div>
      <div className="sub">
        {tr('«Везде» — во всех чатах. «Этот чат» — только здесь. «Персонаж» — во всех чатах с персонажем; первый такой лорбук считается основным и попадает в карточку при экспорте. Лорбук персоны включается на вкладке «Персона».')}
      </div>
    </Modal>
  );
}
