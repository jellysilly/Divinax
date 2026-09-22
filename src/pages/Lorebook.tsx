import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, Link2, MoreHorizontal, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { activeChat, getState, setState, toast, updateChat, upsertLorebook, useStore } from '../store';
import { WILogic, WIPosition, type LoreEntry, type Lorebook, type WorldInfoSettings } from '../types';
import { Divider, Field, IconBtn, LazyInput, LazyTextarea, NumInput, Panel, SearchInput, Select, Slider, Switch, TagInput } from '../components/ui';
import { LOGIC_LABELS, POSITION_LABELS, POSITION_SHORT, blankEntry, lorebookToST } from '../lib/worldinfo';
import { importLorebookJson } from '../lib/importer';
import { download, estimateTokens, pickFiles, safeName, uid } from '../lib/util';

const setWI = (p: Partial<WorldInfoSettings>) => setState((s) => ({ wi: { ...s.wi, ...p } }));

type Sort = 'order' | 'title' | 'tokens' | 'uid';

export function LorebookPage() {
  const books = useStore((s) => s.lorebooks);
  const editingId = useStore((s) => s.editingLorebookId);
  const list = Object.values(books).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const book = books[editingId] ?? list[0];
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('order');
  const [open, setOpen] = useState<number | null>(null);

  const createBook = () => {
    const name = prompt('Название лорбука', 'Новый мир');
    if (!name) return;
    const now = Date.now();
    const lb: Lorebook = { id: uid(), name, entries: [], createdAt: now, updatedAt: now };
    upsertLorebook(lb);
    setState({ editingLorebookId: lb.id });
  };

  const addEntry = () => {
    if (!book) return createBook();
    const uidNext = book.entries.reduce((m, e) => Math.max(m, e.uid), -1) + 1;
    const e = { ...blankEntry(uidNext), comment: 'Новая запись' };
    upsertLorebook({ ...book, entries: [e, ...book.entries] });
    setOpen(e.uid);
  };

  return (
    <div className="col" style={{ flex: 1, minHeight: 0, gap: 0 }}>
      <div className="lb-toolbar">
        <Select
          style={{ width: 260 }}
          value={book?.id ?? ''}
          placeholder="Нет лорбуков"
          onChange={(v) => setState({ editingLorebookId: v })}
          options={list.map((b) => ({ value: b.id, label: b.name }))}
        />
        <IconBtn size="lg" icon={<Plus size={16} />} label="Создать лорбук" onClick={createBook} />
        <IconBtn
          size="lg"
          icon={<Upload size={16} />}
          label="Импорт лорбука (JSON SillyTavern)"
          onClick={async () => {
            const files = await pickFiles('.json', true);
            for (const f of files) {
              try {
                importLorebookJson(JSON.parse(await f.text()), f.name.replace(/\.json$/i, ''));
              } catch (e) {
                toast(`${f.name}: ${(e as Error).message}`, 'error');
              }
            }
          }}
        />
        <IconBtn size="lg" icon={<Download size={16} />} label="Экспорт лорбука" disabled={!book} onClick={() => book && download(`${safeName(book.name)}.json`, JSON.stringify(lorebookToST(book), null, 2))} />
        <IconBtn
          size="lg"
          icon={<Pencil size={16} />}
          label="Переименовать"
          disabled={!book}
          onClick={() => {
            const n = book && prompt('Новое название', book.name);
            if (book && n) upsertLorebook({ ...book, name: n });
          }}
        />
        <IconBtn
          size="lg"
          icon={<Copy size={16} />}
          label="Дублировать"
          disabled={!book}
          onClick={() => {
            if (!book) return;
            const c = { ...structuredClone(book), id: uid(), name: book.name + ' (копия)' };
            upsertLorebook(c);
            setState({ editingLorebookId: c.id });
          }}
        />
        <IconBtn
          size="lg"
          className="danger"
          icon={<Trash2 size={16} />}
          label="Удалить лорбук"
          disabled={!book}
          onClick={() => {
            if (!book || !confirm(`Удалить лорбук «${book.name}»?`)) return;
            setState((s) => {
              const lorebooks = { ...s.lorebooks };
              delete lorebooks[book.id];
              return { lorebooks, editingLorebookId: '', wi: { ...s.wi, global: s.wi.global.filter((x) => x !== book.id) } };
            });
          }}
        />
        <div className="grow" style={{ minWidth: 200 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Поиск по записям и ключам" />
        </div>
        <Select
          style={{ width: 170 }}
          value={sort}
          onChange={(v: Sort) => setSort(v)}
          options={[
            { value: 'order', label: 'По порядку' },
            { value: 'title', label: 'По названию' },
            { value: 'tokens', label: 'По размеру' },
            { value: 'uid', label: 'По созданию' },
          ]}
        />
        <button type="button" className="btn primary" onClick={addEntry}>
          <Plus size={16} /> Новая запись
        </button>
      </div>
      <div className="cols wrap-sm">
        <GlobalSettings book={book} />
        <Panel className="fill" style={{ flex: '1 1 0' }} title={book ? `Записи · ${book.entries.length}` : 'Записи'} actions={<Legend />}>
          {book ? <Entries book={book} q={q} sort={sort} open={open} setOpen={setOpen} /> : <div className="empty">Создайте или импортируйте лорбук.</div>}
        </Panel>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="row sub d-only" style={{ gap: 14, fontSize: 12 }}>
      <span className="row" style={{ gap: 6 }}>
        <span className="strategy-dot constant" /> постоянная
      </span>
      <span className="row" style={{ gap: 6 }}>
        <span className="strategy-dot" /> по ключам
      </span>
      <span className="row" style={{ gap: 6 }}>
        <Link2 size={12} /> векторная
      </span>
    </div>
  );
}

function GlobalSettings({ book }: { book?: Lorebook }) {
  const wi = useStore((s) => s.wi);
  const books = useStore((s) => s.lorebooks);
  const chat = useStore(activeChat);
  const [adding, setAdding] = useState(false);
  return (
    <Panel style={{ width: 340, flex: 'none' }} title="Глобальные настройки">
      <div className="body scroll grow" style={{ paddingRight: 4 }}>
        <Slider label="Глубина сканирования, сообщений" value={wi.scanDepth} min={0} max={50} onChange={(v) => setWI({ scanDepth: Math.round(v) })} hint="Сколько последних сообщений проверяется на ключи" />
        <Slider label="Бюджет контекста" value={wi.budget} min={1} max={100} suffix="%" onChange={(v) => setWI({ budget: Math.round(v) })} hint="Доля контекста, которую может занять лорбук" />
        <Slider label="Макс. глубина рекурсии" value={wi.maxRecursion} min={0} max={10} onChange={(v) => setWI({ maxRecursion: Math.round(v) })} hint="0 — без ограничений" />
        <Divider />
        <div className="col" style={{ gap: 10 }}>
          <Switch label="Рекурсивное сканирование" checked={wi.recursive} onChange={(v) => setWI({ recursive: v })} />
          <Switch label="Учитывать регистр" checked={wi.caseSensitive} onChange={(v) => setWI({ caseSensitive: v })} />
          <Switch label="Только целые слова" checked={wi.matchWholeWords} onChange={(v) => setWI({ matchWholeWords: v })} />
          <Switch label="Сканировать имена участников" checked={wi.includeNames} onChange={(v) => setWI({ includeNames: v })} />
        </div>
        <Divider />
        <span className="label" style={{ marginBottom: 0 }}>
          Активны во всех чатах
        </span>
        <div className="row wrap" style={{ gap: 6 }}>
          {wi.global.map((id) =>
            books[id] ? (
              <span key={id} className="chip">
                {books[id].name}
                <button type="button" className="x" aria-label="Убрать" onClick={() => setWI({ global: wi.global.filter((x) => x !== id) })}>
                  <X size={12} />
                </button>
              </span>
            ) : null,
          )}
          {adding ? (
            <Select
              small
              value=""
              placeholder="Выберите…"
              onChange={(v) => {
                if (v) setWI({ global: [...wi.global, v] });
                setAdding(false);
              }}
              options={Object.values(books)
                .filter((b) => !wi.global.includes(b.id))
                .map((b) => ({ value: b.id, label: b.name }))}
            />
          ) : (
            <button type="button" className="chip dashed" onClick={() => setAdding(true)}>
              <Plus size={13} /> Добавить
            </button>
          )}
        </div>
        {chat && book && (
          <>
            <Divider />
            <Switch
              label="Привязать к текущему чату"
              hint={`«${chat.name}»`}
              checked={chat.lorebookIds.includes(book.id)}
              onChange={(v) =>
                updateChat(chat.id, (c) => void (c.lorebookIds = v ? [...c.lorebookIds, book.id] : c.lorebookIds.filter((x) => x !== book.id)))
              }
            />
            {chat.ownerType === 'char' && <CharBind charId={chat.ownerId} bookId={book.id} />}
          </>
        )}
      </div>
    </Panel>
  );
}

function CharBind({ charId, bookId }: { charId: string; bookId: string }) {
  const ch = useStore((s) => s.characters[charId]);
  if (!ch) return null;
  return (
    <Switch
      label={`Лорбук персонажа «${ch.name}»`}
      checked={ch.lorebookId === bookId}
      onChange={(v) => setState((s) => ({ characters: { ...s.characters, [charId]: { ...ch, lorebookId: v ? bookId : undefined } } }))}
    />
  );
}

function Entries({ book, q, sort, open, setOpen }: { book: Lorebook; q: string; sort: Sort; open: number | null; setOpen: (v: number | null) => void }) {
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const arr = book.entries.filter(
      (e) => !n || e.comment.toLowerCase().includes(n) || e.content.toLowerCase().includes(n) || e.key.some((k) => k.toLowerCase().includes(n)),
    );
    const cmp: Record<Sort, (a: LoreEntry, b: LoreEntry) => number> = {
      order: (a, b) => a.order - b.order || a.uid - b.uid,
      title: (a, b) => a.comment.localeCompare(b.comment, 'ru'),
      tokens: (a, b) => estimateTokens(b.content) - estimateTokens(a.content),
      uid: (a, b) => a.uid - b.uid,
    };
    return [...arr].sort(cmp[sort]);
  }, [book.entries, q, sort]);

  const update = (uidv: number, p: Partial<LoreEntry>) => {
    const b = getState().lorebooks[book.id];
    if (!b) return;
    upsertLorebook({ ...b, entries: b.entries.map((e) => (e.uid === uidv ? { ...e, ...p } : e)) });
  };
  const remove = (uidv: number) => {
    if (!confirm('Удалить запись?')) return;
    const b = getState().lorebooks[book.id];
    upsertLorebook({ ...b, entries: b.entries.filter((e) => e.uid !== uidv) });
  };
  const duplicate = (e: LoreEntry) => {
    const b = getState().lorebooks[book.id];
    const next = b.entries.reduce((m, x) => Math.max(m, x.uid), -1) + 1;
    upsertLorebook({ ...b, entries: [...b.entries, { ...structuredClone(e), uid: next, comment: e.comment + ' (копия)' }] });
  };

  // раскрытая запись показывается первой
  const opened = list.find((e) => e.uid === open);
  const rest = list.filter((e) => e.uid !== open);

  return (
    <div className="col scroll grow" style={{ gap: 8, paddingRight: 2 }}>
      {opened && <EntryEditor key={opened.uid} e={opened} onChange={(p) => update(opened.uid, p)} onClose={() => setOpen(null)} onDelete={() => remove(opened.uid)} onDuplicate={() => duplicate(opened)} />}
      {rest.map((e) => (
        <div key={e.uid} className={`entry ${e.disable ? 'disabled' : ''}`}>
          <div className="entry-row" onClick={() => setOpen(e.uid)}>
            <span onClick={(ev) => ev.stopPropagation()}>
              <Switch checked={!e.disable} onChange={(v) => update(e.uid, { disable: !v })} />
            </span>
            <ChevronRight size={15} className="muted" />
            {e.strategy === 'vector' ? <Link2 size={13} className="muted" /> : <span className={`strategy-dot ${e.strategy === 'constant' ? 'constant' : ''}`} />}
            <span className="t">{e.comment || e.key.join(', ') || `Запись ${e.uid}`}</span>
            <span className="k">{e.strategy === 'constant' ? 'постоянная' : e.strategy === 'vector' ? 'векторный поиск' : e.key.join(', ') || '—'}</span>
            <span className="p">{POSITION_SHORT[e.position]}</span>
            <span className="p d tabular" style={{ textAlign: 'center' }}>
              {e.position === WIPosition.atDepth ? e.depth : '—'}
            </span>
            <span className="p o tabular" style={{ textAlign: 'right' }}>
              {e.order}
            </span>
            <IconBtn size="sm" bare icon={<MoreHorizontal size={15} />} label="Открыть" onClick={() => setOpen(e.uid)} />
          </div>
        </div>
      ))}
      {!list.length && <div className="empty">{book.entries.length ? 'Ничего не найдено' : 'Записей пока нет — нажмите «Новая запись».'}</div>}
    </div>
  );
}

function EntryEditor({
  e,
  onChange,
  onClose,
  onDelete,
  onDuplicate,
}: {
  e: LoreEntry;
  onChange: (p: Partial<LoreEntry>) => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [more, setMore] = useState(false);
  return (
    <div className={`entry open ${e.disable ? 'disabled' : ''}`}>
      <div className="entry-body" style={{ paddingTop: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
          <div className="row" style={{ paddingBottom: 8 }}>
            <Switch checked={!e.disable} onChange={(v) => onChange({ disable: !v })} />
            <IconBtn size="sm" bare icon={<ChevronDown size={16} />} label="Свернуть" onClick={onClose} />
          </div>
          <div className="entry-grid grow">
            <Field label="Название">
              <LazyInput className="input" style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600 }} value={e.comment} onCommit={(v) => onChange({ comment: v })} />
            </Field>
            <Field label="Тип">
              <Select
                value={e.strategy}
                onChange={(v) => onChange({ strategy: v })}
                options={[
                  { value: 'normal', label: 'По ключам' },
                  { value: 'constant', label: 'Постоянная' },
                  { value: 'vector', label: 'Векторная' },
                ]}
              />
            </Field>
            <Field label="Позиция">
              <Select
                value={e.position}
                onChange={(v) => onChange({ position: Number(v) as WIPosition })}
                options={(Object.keys(POSITION_LABELS) as unknown as WIPosition[]).map((k) => ({ value: Number(k) as WIPosition, label: POSITION_LABELS[k] }))}
              />
            </Field>
            <Field label="Глуб.">
              <NumInput value={e.depth} min={0} max={999} onChange={(v) => onChange({ depth: v })} />
            </Field>
            <Field label="Порядок">
              <NumInput value={e.order} onChange={(v) => onChange({ order: v })} />
            </Field>
            <Field label="Шанс">
              <NumInput value={e.probability} min={0} max={100} onChange={(v) => onChange({ probability: v, useProbability: true })} />
            </Field>
          </div>
        </div>
        <div className="grid3" style={{ gridTemplateColumns: '1.6fr 0.9fr 1.6fr' }}>
          <Field label="Основные ключи" hint="Слово, фраза или /регулярка/">
            <TagInput values={e.key} onChange={(v) => onChange({ key: v })} placeholder="ключ или /regex/" />
          </Field>
          <Field label="Логика">
            <Select value={e.selectiveLogic} onChange={(v) => onChange({ selectiveLogic: Number(v) as WILogic })} options={[0, 3, 2, 1].map((k) => ({ value: k as WILogic, label: LOGIC_LABELS[k as WILogic] }))} />
          </Field>
          <Field label="Вторичные ключи">
            <TagInput values={e.keysecondary} onChange={(v) => onChange({ keysecondary: v })} placeholder="необязательно" />
          </Field>
        </div>
        <Field label="Содержимое">
          <LazyTextarea className="textarea serif" rows={5} value={e.content} onCommit={(v) => onChange({ content: v })} />
        </Field>
        <div className="row wrap" style={{ gap: 18 }}>
          <Switch label="Не рекурсивная" checked={e.excludeRecursion} onChange={(v) => onChange({ excludeRecursion: v })} />
          <Switch label="Предотвращать рекурсию" checked={e.preventRecursion} onChange={(v) => onChange({ preventRecursion: v })} />
          <Switch label="Отложить до рекурсии" checked={e.delayUntilRecursion} onChange={(v) => onChange({ delayUntilRecursion: v })} />
          <span className="spacer" />
          <span className="sub">{estimateTokens(e.content)} токенов</span>
          <button type="button" className="btn sm" onClick={() => setMore(!more)}>
            {more ? 'Скрыть' : 'Дополнительно'}
          </button>
          <IconBtn size="sm" icon={<Copy size={14} />} label="Дублировать" onClick={onDuplicate} />
          <IconBtn size="sm" className="danger" icon={<Trash2 size={14} />} label="Удалить" onClick={onDelete} />
        </div>
        {more && (
          <div className="grid3">
            {e.position === WIPosition.atDepth && (
              <Field label="Роль на глубине">
                <Select
                  value={e.role}
                  onChange={(v) => onChange({ role: v })}
                  options={[
                    { value: 'system', label: 'Система' },
                    { value: 'user', label: 'Пользователь' },
                    { value: 'assistant', label: 'Ассистент' },
                  ]}
                />
              </Field>
            )}
            <Field label="Группа включения" hint="Из группы срабатывает одна запись">
              <LazyInput value={e.group} onCommit={(v) => onChange({ group: v })} />
            </Field>
            <Field label="Своя глубина сканирования">
              <LazyInput value={e.scanDepth == null ? '' : String(e.scanDepth)} placeholder="как в настройках" onCommit={(v) => onChange({ scanDepth: v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0) })} />
            </Field>
            <Field label="Липкость (сообщ.)" hint="Остаётся активной N сообщений">
              <NumInput value={e.sticky} min={0} onChange={(v) => onChange({ sticky: v })} />
            </Field>
            <Field label="Перезарядка (сообщ.)">
              <NumInput value={e.cooldown} min={0} onChange={(v) => onChange({ cooldown: v })} />
            </Field>
            <Field label="Задержка (сообщ.)" hint="Не срабатывает, пока в чате меньше N сообщений">
              <NumInput value={e.delay} min={0} onChange={(v) => onChange({ delay: v })} />
            </Field>
            <Field label="Регистр">
              <Select
                value={e.caseSensitive == null ? 'g' : e.caseSensitive ? 'y' : 'n'}
                onChange={(v) => onChange({ caseSensitive: v === 'g' ? null : v === 'y' })}
                options={[
                  { value: 'g', label: 'Как в настройках' },
                  { value: 'y', label: 'Учитывать' },
                  { value: 'n', label: 'Не учитывать' },
                ]}
              />
            </Field>
            <Field label="Целые слова">
              <Select
                value={e.matchWholeWords == null ? 'g' : e.matchWholeWords ? 'y' : 'n'}
                onChange={(v) => onChange({ matchWholeWords: v === 'g' ? null : v === 'y' })}
                options={[
                  { value: 'g', label: 'Как в настройках' },
                  { value: 'y', label: 'Да' },
                  { value: 'n', label: 'Нет' },
                ]}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
