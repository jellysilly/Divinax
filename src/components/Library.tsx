import { useMemo, useState } from 'react';
import { ArrowUpDown, Link, Plus, Star as StarIcon, Tag, Upload, UserPlus, Users } from 'lucide-react';
import { chatsOf, openModal, setState, upsertCharacter, useStore } from '../store';
import type { Character, Group } from '../types';
import { blankCharacter } from '../lib/cards';
import { importFiles } from '../lib/importer';
import { pickFiles } from '../lib/util';
import { Avatar, IconBtn, Panel, Seg, SearchInput } from './ui';

type Sort = 'name' | 'recent' | 'created' | 'chats';
const SORT_LABEL: Record<Sort, string> = { name: 'по имени', recent: 'по активности', created: 'по дате создания', chats: 'по числу чатов' };

export function Library({
  selectedId,
  onPickChar,
  onPickGroup,
  className = '',
  style,
}: {
  selectedId?: string;
  onPickChar: (id: string) => void;
  onPickGroup: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const characters = useStore((s) => s.characters);
  const groups = useStore((s) => s.groups);
  const chats = useStore((s) => s.chats);
  const [mode, setMode] = useState<'chars' | 'groups'>('chars');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('__all');
  const [sort, setSort] = useState<Sort>('recent');

  const lastActivity = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of Object.values(chats)) m[c.ownerId] = Math.max(m[c.ownerId] ?? 0, c.updatedAt);
    return m;
  }, [chats]);

  const topTags = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const c of Object.values(characters)) for (const t of c.tags) cnt[t] = (cnt[t] ?? 0) + 1;
    return Object.entries(cnt)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t);
  }, [characters]);

  const matches = (name: string, tags: string[], fav: boolean) => {
    if (filter === '__fav' && !fav) return false;
    if (filter !== '__all' && filter !== '__fav' && !tags.includes(filter)) return false;
    if (!q.trim()) return true;
    const n = q.toLowerCase();
    return name.toLowerCase().includes(n) || tags.some((t) => t.toLowerCase().includes(n));
  };

  const sorter = <T extends { id: string; name: string; createdAt: number; fav: boolean }>(a: T, b: T) => {
    if (a.fav !== b.fav) return a.fav ? -1 : 1;
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, 'ru');
      case 'created':
        return b.createdAt - a.createdAt;
      case 'chats':
        return Object.values(chats).filter((c) => c.ownerId === b.id).length - Object.values(chats).filter((c) => c.ownerId === a.id).length;
      default:
        return (lastActivity[b.id] ?? b.createdAt) - (lastActivity[a.id] ?? a.createdAt);
    }
  };

  const charList = Object.values(characters).filter((c) => matches(c.name, c.tags, c.fav)).sort(sorter);
  const groupList = Object.values(groups).filter((g) => matches(g.name, g.tags, g.fav)).sort(sorter);

  const create = () => {
    const c = blankCharacter();
    upsertCharacter(c);
    setState({ editingCharId: c.id, tab: 'characters' });
  };

  const cycleSort = () => {
    const order: Sort[] = ['recent', 'name', 'created', 'chats'];
    setSort(order[(order.indexOf(sort) + 1) % order.length]);
  };

  return (
    <Panel title="Библиотека" className={className} style={style}>
      <Seg
        large
        value={mode}
        onChange={setMode}
        options={[
          { value: 'chars', label: 'Персонажи' },
          { value: 'groups', label: 'Группы' },
        ]}
      />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <IconBtn size="lg" icon={<Plus size={17} />} label="Создать персонажа" onClick={create} />
        <IconBtn
          size="lg"
          icon={<Upload size={17} />}
          label="Импорт карточки (PNG, JSON)"
          onClick={async () => importFiles(await pickFiles('.png,.json', true))}
        />
        <IconBtn size="lg" icon={<Link size={17} />} label="Импорт по ссылке" onClick={() => openModal('importUrl')} />
        <IconBtn size="lg" icon={<UserPlus size={17} />} label="Создать групповой чат" onClick={() => openModal('group', { id: '' })} />
        <IconBtn size="lg" icon={<Tag size={17} />} label="Управление тегами" onClick={() => openModal('tags')} />
        <IconBtn size="lg" icon={<ArrowUpDown size={17} />} label={`Сортировка: ${SORT_LABEL[sort]}`} onClick={cycleSort} />
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Поиск персонажей и тегов" />
      <div className="row wrap" style={{ gap: 6 }}>
        <button type="button" className={`chip ${filter === '__all' ? 'on' : ''}`} onClick={() => setFilter('__all')}>
          Все
        </button>
        <button type="button" className={`chip ${filter === '__fav' ? 'on' : ''}`} onClick={() => setFilter('__fav')}>
          <StarIcon size={13} /> Избранное
        </button>
        {topTags.map((t) => (
          <button key={t} type="button" className={`chip ${filter === t ? 'on' : ''}`} onClick={() => setFilter(filter === t ? '__all' : t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="list scroll grow" style={{ margin: '0 -8px', padding: '0 4px' }}>
        {mode === 'chars' &&
          charList.map((c) => <CharRow key={c.id} c={c} on={selectedId === c.id} onClick={() => onPickChar(c.id)} />)}
        {mode === 'chars' && !charList.length && (
          <div className="empty">
            {Object.keys(characters).length ? 'Никого не найдено' : 'Библиотека пуста. Создайте персонажа или перетащите PNG-карточку в окно.'}
          </div>
        )}
        {mode === 'groups' &&
          groupList.map((g) => <GroupRow key={g.id} g={g} on={selectedId === g.id} onClick={() => onPickGroup(g.id)} />)}
        {mode === 'groups' && !groupList.length && (
          <div className="empty">
            Групповых чатов пока нет.
            <br />
            <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={() => openModal('group', { id: '' })}>
              <Users size={15} /> Создать группу
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function CharRow({ c, on, onClick }: { c: Character; on: boolean; onClick: () => void }) {
  const count = useStore((s) => chatsOf(s, c.id).length);
  return (
    <div className={`list-item ${on ? 'on' : ''}`} role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <Avatar src={c.avatar} name={c.name} glow={on} />
      <span className="li-text">
        <span className="li-title ellipsis">{c.name}</span>
        <span className="li-sub ellipsis">{c.tags.length ? c.tags.slice(0, 3).join(' · ') : `${count} чат(ов)`}</span>
      </span>
      <button
        type="button"
        className="icon-btn sm bare"
        aria-label={c.fav ? 'Убрать из избранного' : 'В избранное'}
        title={c.fav ? 'Убрать из избранного' : 'В избранное'}
        onClick={(e) => {
          e.stopPropagation();
          upsertCharacter({ ...c, fav: !c.fav });
        }}
      >
        <StarIcon size={15} fill={c.fav ? 'currentColor' : 'none'} style={{ color: c.fav ? 'var(--strong)' : undefined }} />
      </button>
    </div>
  );
}

function GroupRow({ g, on, onClick }: { g: Group; on: boolean; onClick: () => void }) {
  const characters = useStore((s) => s.characters);
  const members = g.members.map((id) => characters[id]).filter(Boolean) as Character[];
  return (
    <div className={`list-item ${on ? 'on' : ''}`} role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div style={{ position: 'relative', width: 44, height: 44, flex: 'none' }}>
        {members.slice(0, 2).map((m, i) => (
          <div key={m.id} style={{ position: 'absolute', left: i * 10, top: i * 4 }}>
            <Avatar src={m.avatar} name={m.name} size={34} />
          </div>
        ))}
        {!members.length && <Avatar name={g.name} />}
      </div>
      <span className="li-text">
        <span className="li-title ellipsis">{g.name}</span>
        <span className="li-sub ellipsis">групповой чат · {members.length} участника(ов)</span>
      </span>
      <Users size={15} className="muted" />
    </div>
  );
}
