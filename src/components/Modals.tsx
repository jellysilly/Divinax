import { tr } from '../lib/i18n';
import { useShallow } from 'zustand/react/shallow';
import { useState } from 'react';
import { Crop as CropIcon, Download, FolderOpen, Link2, Pencil, Unlink, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  activeChat,
  activePreset,
  chatOwnerName,
  chatsOf,
  closeModal,
  getState,
  setState,
  toast,
  updateChat,
  updatePreset,
  upsertCharacter,
  upsertGroup,
  upsertLorebook,
  useStore,
} from '../store';
import type { ExtensionSettings, Group, QuickReply, RegexScript } from '../types';
import { Avatar, BgThumb, Divider, Field, IconBtn, LazyInput, LazyTextarea, Modal, NumInput, Select, Seg, Slider, Switch } from './ui';
import { ActiveBooksModal } from './BooksModal';
import { UserExtSettingsModal } from './UserExtensions';
import { AVATAR_CROP, BANNER_CROP, cropImage, pickAndCrop } from './Cropper';
import { MACRO_HELP } from '../lib/macros';
import { COMMANDS } from '../lib/slash';
import { deleteChat, openChat, openOwner, renameChat, startNewChat } from '../lib/chats';
import { CHAT_FILE_ACCEPT, exportChat, importChatFiles } from '../lib/chatio';
import { buildPrompt } from '../lib/prompt';
import { characterFromJson, readPngTextChunks } from '../lib/cards';
import { blankRegex, cardRegex, regexToST } from '../lib/regex';
import { mergeRegex, readRegexFiles } from '../lib/regexio';
import { voices } from '../lib/speech';
import { LANGS, translateMessage } from '../lib/extras';
import { EXPRESSIONS } from '../lib/defaults';
import { EXTENSIONS } from '../pages/Extensions';
import { PromptEditorModal } from '../pages/Generation';
import { exportCharacter } from '../pages/Characters';
import { runGeneration, summarizeChat } from '../lib/generate';
import { generateImage } from '../lib/images';
import { download, fmtDay, fmtNum, pickFiles, plural, readDataUrl, safeName, shrinkImage, uid } from '../lib/util';

export function Modals() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  const p = modal.payload;
  switch (modal.kind) {
    case 'help':
      return <HelpModal />;
    case 'chats':
      return <ChatsModal />;
    case 'authorNote':
      return <AuthorNoteModal />;
    case 'prompt':
      return <PromptModal />;
    case 'promptEdit':
      return <PromptEditorModal key={String(p)} id={String(p)} />;
    case 'lightbox':
      return (
        <div className="overlay lightbox" onClick={closeModal}>
          <img src={String(p)} alt="" />
        </div>
      );
    case 'bgPicker':
      return <BgPicker />;
    case 'gallery':
      return <GalleryModal ownerId={String(p)} />;
    case 'group':
      return <GroupModal id={(p as { id: string }).id} />;
    case 'tags':
      return <TagsModal />;
    case 'books':
      return <ActiveBooksModal />;
    case 'userExtSettings':
      return <UserExtSettingsModal />;
    case 'importUrl':
      return <ImportUrlModal />;
    case 'ext':
      return <ExtModal id={String(p).split(':')[0]} arg={String(p).split(':')[1]} />;
    case 'exportChar':
      return <ExportCharModal id={String(p)} />;
    case 'charAdvanced':
      return <CharAdvancedModal id={String(p)} />;
    case 'creatorNotes':
      return <CreatorNotesModal id={String(p)} />;
    case 'info':
      return (
        <Modal title="Divinax" onClose={closeModal} footer={<button type="button" className="btn primary" onClick={closeModal}>{tr('Понятно')}</button>}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{String(p)}</p>
        </Modal>
      );
    default:
      return null;
  }
}

// ───────────── Справка ─────────────

function HelpModal() {
  return (
    <Modal title={tr('Справка и макросы')} onClose={closeModal} wide>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 10 }}>
          <Divider title={tr('Макросы')} />
          {MACRO_HELP.map(([m, d]) => (
            <div key={m} className="col" style={{ gap: 2 }}>
              <code className="kbd" style={{ alignSelf: 'flex-start' }}>
                {tr(m)}
              </code>
              <span className="sub">{tr(d)}</span>
            </div>
          ))}
        </div>
        <div className="col" style={{ gap: 10 }}>
          <Divider title={tr('Команды')} />
          {COMMANDS.map((c) => (
            <div key={c.names[0]} className="row" style={{ alignItems: 'baseline', gap: 10 }}>
              <code className="kbd">/{c.names[0]}</code>
              <span className="sub">{tr(c.help)}</span>
            </div>
          ))}
          <span className="sub">{tr('Команды можно соединять: /sys Ночь | /continue')}</span>
          <Divider title={tr('Клавиши')} />
          <div className="sub" style={{ lineHeight: 1.9 }}>
            <span className="kbd">Enter</span> {tr('— отправить ·')} <span className="kbd">Shift+Enter</span> {tr('— перенос')}
            <br />
            <span className="kbd">↑</span> {tr('в пустом поле — изменить последнее сообщение')}
            <br />
            <span className="kbd">Esc</span> {tr('— остановить генерацию ·')} <span className="kbd">Ctrl+Enter</span> {tr('— сохранить правку')}
            <br />
            {tr('Пустая отправка — персонаж продолжает сцену сам')}
          </div>
          <Divider title={tr('Разметка')} />
          <div className="sub" style={{ lineHeight: 1.9 }}>
            {tr('*действие* — курсив · **важное** — жирный · «речь» — цитата · `код`')}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ───────────── Файлы чатов ─────────────

function ChatsModal() {
  const chat = useStore(activeChat);
  const list = useStore(useShallow((s) => (chat ? chatsOf(s, chat.ownerId) : [])));
  const owner = useStore((s) => chatOwnerName(s, chat));
  const [q, setQ] = useState('');
  if (!chat) return null;
  const filtered = list.filter(
    (c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.messages.some((m) => m.text.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Modal title={tr('Чаты · {0}', owner)} onClose={closeModal} wide>
      <div className="row">
        <input className="input grow" placeholder={tr('Поиск по названию и тексту сообщений')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn" onClick={() => (startNewChat(chat.ownerType, chat.ownerId), closeModal())}>
          <Plus size={15} /> {tr('Новый чат')}
        </button>
      </div>
      <div className="row wrap">
        <button
          type="button"
          className="btn sm"
          onClick={async () => {
            const files = await pickFiles(CHAT_FILE_ACCEPT, true);
            if (files.length && (await importChatFiles(files))) closeModal();
          }}
        >
          <Upload size={14} /> {tr('Импорт чатов')}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!list.length}
          title={tr('Браузер может спросить разрешение на скачивание нескольких файлов')}
          onClick={() => list.forEach((c, i) => setTimeout(() => exportChat(c.id), i * 400))}
        >
          <Download size={14} /> {tr('Экспорт всех ({0})', list.length)}
        </button>
      </div>
      <div className="sub">
        {tr('Экспорт — в формате SillyTavern (JSONL): файл открывается в таверне через «Импорт чата». Импорт понимает JSONL SillyTavern (в т.ч. групповые чаты), Oobabooga, Agnai, CAI Tools и RisuAI; можно выбрать несколько файлов. Чат попадает к персонажу с тем же именем, иначе — в текущий.')}
      </div>
      <div className="col" style={{ gap: 8 }}>
        {filtered.map((c) => {
          const last = c.messages[c.messages.length - 1];
          return (
            <div key={c.id} className={`list-item ${c.id === chat.id ? 'on' : ''}`} style={{ border: '1px solid var(--line)', alignItems: 'flex-start' }}>
              <div className="li-text">
                <span className="li-title">{c.name}</span>
                <span className="li-sub">
                  {c.messages.length} {plural(c.messages.length, 'сообщение', 'сообщения', 'сообщений')} · {fmtDay(c.updatedAt)}
                  {c.branchOf ? tr(' · ветка') : ''}
                </span>
                {last && (
                  <span className="sub ellipsis" style={{ marginTop: 4 }}>
                    {last.name}: {last.text.slice(0, 140)}
                  </span>
                )}
              </div>
              <div className="row">
                <IconBtn size="sm" icon={<FolderOpen size={14} />} label={tr('Открыть')} onClick={() => (openChat(c.id), closeModal())} />
                <IconBtn
                  size="sm"
                  icon={<Pencil size={14} />}
                  label={tr('Переименовать')}
                  onClick={() => {
                    const n = prompt(tr('Название чата'), c.name);
                    if (n) renameChat(c.id, n);
                  }}
                />
                <IconBtn size="sm" icon={<Download size={14} />} label={tr('Экспорт JSONL')} onClick={() => exportChat(c.id)} />
                <IconBtn size="sm" icon={<Download size={14} style={{ opacity: 0.6 }} />} label={tr('Экспорт TXT')} onClick={() => exportChat(c.id, 'txt')} />
                <IconBtn
                  size="sm"
                  className="danger"
                  icon={<Trash2 size={14} />}
                  label={tr('Удалить')}
                  onClick={() => confirm(tr('Удалить чат «{0}»?', c.name)) && deleteChat(c.id)}
                />
              </div>
            </div>
          );
        })}
        {!filtered.length && <div className="empty">{tr('Ничего не найдено')}</div>}
      </div>
    </Modal>
  );
}

// ───────────── Заметка автора ─────────────

function AuthorNoteModal() {
  const chat = useStore(activeChat);
  if (!chat) return null;
  const an = chat.authorNote;
  const set = (p: Partial<typeof an>) => updateChat(chat.id, (c) => void (c.authorNote = { ...c.authorNote, ...p }));
  return (
    <Modal title={tr('Заметка автора')} onClose={closeModal}>
      <Switch label={tr('Включена')} checked={an.enabled} onChange={(v) => set({ enabled: v })} />
      <LazyTextarea className="textarea serif" rows={6} value={an.text} onCommit={(v) => set({ text: v })} placeholder={tr('[Стиль: мрачный, неторопливый. {{char}} говорит загадками.]')} />
      <div className="grid3">
        <Field label={tr('Глубина')} hint={tr('0 — после последнего сообщения')}>
          <NumInput value={an.depth} min={0} max={999} onChange={(v) => set({ depth: v })} />
        </Field>
        <Field label={tr('Роль')}>
          <Select
            value={an.role}
            onChange={(v) => set({ role: v })}
            options={[
              { value: 'system', label: tr('Система') },
              { value: 'user', label: tr('Пользователь') },
              { value: 'assistant', label: tr('Ассистент') },
            ]}
          />
        </Field>
        <Field label={tr('Частота')} hint={tr('Каждые N ваших сообщений (0 — всегда)')}>
          <NumInput value={an.interval} min={0} max={100} onChange={(v) => set({ interval: v })} />
        </Field>
      </div>
      <Divider title={tr('Пересказ чата')} />
      <LazyTextarea className="textarea" rows={4} value={chat.summary ?? ''} onCommit={(v) => updateChat(chat.id, (c) => void (c.summary = v))} placeholder={tr('Здесь появится краткое содержание, если включено расширение «Суммаризация»')} />
      <div className="row">
        <button type="button" className="btn sm" onClick={() => void summarizeChat(chat.id)}>
          {tr('Обновить пересказ')}
        </button>
      </div>
    </Modal>
  );
}

// ───────────── Просмотр промпта ─────────────

function PromptModal() {
  const s = useStore();
  const chat = activeChat(s);
  const [view, setView] = useState<'parts' | 'raw'>('parts');
  if (!chat) {
    return (
      <Modal title={tr('Промпт')} onClose={closeModal}>
        <div className="empty">{tr('Откройте чат')}</div>
      </Modal>
    );
  }
  const built = buildPrompt(s, { chat, kind: 'normal', dryRun: true });
  const raw = built.prompt ?? (built.messages ?? []).map((m) => `── ${m.role} ──\n${m.content}`).join('\n\n');
  const max = activePreset(s).maxContext;
  const top = Math.max(1, ...built.items.map((i) => i.tokens));
  return (
    <Modal title={tr('Что видит модель')} onClose={closeModal} wide>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Seg
          value={view}
          onChange={setView}
          options={[
            { value: 'parts', label: tr('По частям') },
            { value: 'raw', label: tr('Целиком') },
          ]}
        />
        <span className="big-tokens">
          {fmtNum(built.tokens)} / {fmtNum(max)}
        </span>
      </div>
      {view === 'parts' ? (
        <div className="prompt-bars">
          {built.items
            .filter((i) => i.tokens > 0)
            .map((i, k) => (
              <div key={k} className="prompt-bar">
                <div>
                  {tr(i.name)}
                  <div className="bar">
                    <i style={{ width: `${(i.tokens / top) * 100}%` }} />
                  </div>
                </div>
                <span className="tabular soft" style={{ textAlign: 'right' }}>
                  {fmtNum(i.tokens)}
                </span>
              </div>
            ))}
          {built.wi.activated.length > 0 && (
            <>
              <Divider title={tr('Сработавшие записи лорбука')} />
              <div className="row wrap" style={{ gap: 6 }}>
                {built.wi.activated.map((a) => (
                  <span key={a.book + a.entry.uid} className="chip">
                    {a.entry.comment || a.entry.key.join(', ')}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="code-block scroll">{raw}</div>
      )}
      <div className="modal-foot">
        <button type="button" className="btn sm" onClick={() => void navigator.clipboard?.writeText(raw).then(() => toast(tr('Скопировано')))}>
          {tr('Копировать')}
        </button>
      </div>
    </Modal>
  );
}

// ───────────── Фон чата ─────────────

function BgPicker() {
  const ui = useStore((s) => s.ui);
  const chat = useStore(activeChat);
  const cur = (ui.perChatBg && chat?.background) || ui.activeBg;
  const pick = (id: string) => {
    if (ui.perChatBg && chat) updateChat(chat.id, (c) => void (c.background = id));
    else setState((s) => ({ ui: { ...s.ui, activeBg: id } }));
  };
  return (
    <Modal title={tr('Фон чата')} onClose={closeModal}>
      <div className="bg-grid">
        {ui.backgrounds.map((b) => (
          <button key={b.id} type="button" className={`bg-tile ${cur === b.id ? 'on' : ''}`} onClick={() => pick(b.id)}>
            <BgThumb bg={b} />
            <span>{b.builtin ? tr(b.name) : b.name}</span>
          </button>
        ))}
        <button
          type="button"
          className="bg-tile upload"
          onClick={async () => {
            const [f] = await pickFiles('image/*');
            if (!f) return;
            const bg = { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), url: await shrinkImage(await readDataUrl(f), 1920, 0.85) };
            setState((s) => ({ ui: { ...s.ui, backgrounds: [...s.ui.backgrounds, bg] } }));
            pick(bg.id);
          }}
        >
          <Upload size={18} /> {tr('Загрузить')}
        </button>
      </div>
      <Switch label={tr('Свой фон для каждого чата')} checked={ui.perChatBg} onChange={(v) => setState((s) => ({ ui: { ...s.ui, perChatBg: v } }))} />
    </Modal>
  );
}

// ───────────── Галерея ─────────────

function GalleryModal({ ownerId }: { ownerId: string }) {
  const ch = useStore((s) => s.characters[ownerId]);
  const chatImages = useStore(
    useShallow((s) =>
      Object.values(s.chats)
        .filter((c) => c.ownerId === ownerId)
        .flatMap((c) => c.messages.flatMap((m) => m.images ?? [])),
    ),
  );
  if (!ch) {
    return (
      <Modal title={tr('Галерея')} onClose={closeModal}>
        <div className="empty">{tr('Галерея доступна для персонажей')}</div>
      </Modal>
    );
  }
  const all = [...(ch.avatar ? [ch.avatar] : []), ...(ch.banner ? [ch.banner] : []), ...ch.gallery, ...chatImages];
  return (
    <Modal
      title={tr('Галерея · {0}', ch.name)}
      onClose={closeModal}
      wide
      footer={
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const files = await pickFiles('image/*', true);
            const urls = await Promise.all(files.map(async (f) => shrinkImage(await readDataUrl(f), 1600)));
            upsertCharacter({ ...getState().characters[ch.id], gallery: [...ch.gallery, ...urls] });
          }}
        >
          <Upload size={15} /> {tr('Добавить изображения')}
        </button>
      }
    >
      <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {all.map((src, i) => (
          <div key={i} className="bg-tile" style={{ padding: 4 }}>
            <img src={src} alt="" style={{ aspectRatio: '1', cursor: 'zoom-in' }} onClick={() => setState({ modal: { kind: 'lightbox', payload: src } })} />
            <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
              <IconBtn size="sm" bare icon={<span style={{ fontSize: 11 }}>{tr('аватар')}</span>} label={tr('Сделать аватаром')} onClick={async () => {
                const url = await cropImage(src, AVATAR_CROP);
                if (url) upsertCharacter({ ...getState().characters[ch.id], avatar: url });
              }} />
              <IconBtn size="sm" bare icon={<span style={{ fontSize: 11 }}>{tr('обложка')}</span>} label={tr('Сделать обложкой чата')} onClick={async () => {
                const url = await cropImage(src, BANNER_CROP);
                if (url) upsertCharacter({ ...getState().characters[ch.id], banner: url });
              }} />
              {ch.gallery.includes(src) && (
                <IconBtn size="sm" bare className="danger" icon={<X size={13} />} label={tr('Убрать')} onClick={() => upsertCharacter({ ...getState().characters[ch.id], gallery: ch.gallery.filter((x) => x !== src) })} />
              )}
            </div>
          </div>
        ))}
      </div>
      {!all.length && <div className="empty">{tr('Изображений пока нет')}</div>}
    </Modal>
  );
}

// ───────────── Группа ─────────────

function GroupModal({ id }: { id: string }) {
  const existing = useStore((s) => s.groups[id]);
  const characters = useStore((s) => s.characters);
  const [g, setG] = useState<Group>(
    () =>
      existing ?? {
        id: uid(),
        name: tr('Новая группа'),
        members: [],
        disabledMembers: [],
        activation: 'natural',
        generationMode: 'swap',
        allowSelfResponses: false,
        autoMode: false,
        fav: false,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
  );
  const toggleMember = (cid: string) =>
    setG((x) => ({ ...x, members: x.members.includes(cid) ? x.members.filter((m) => m !== cid) : [...x.members, cid] }));
  const save = (open: boolean) => {
    if (!g.members.length) return toast(tr('Добавьте хотя бы одного участника'), 'error');
    upsertGroup(g);
    closeModal();
    if (open) openOwner('group', g.id);
  };
  return (
    <Modal
      title={existing ? tr('Групповой чат') : tr('Новый групповой чат')}
      onClose={closeModal}
      wide
      footer={
        <>
          {existing && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!confirm(tr('Удалить группу «{0}» и её чаты?', g.name))) return;
                setState((s) => {
                  const groups = { ...s.groups };
                  delete groups[g.id];
                  const chats = Object.fromEntries(Object.entries(s.chats).filter(([, c]) => c.ownerId !== g.id));
                  return { groups, chats, modal: null, activeChatId: chats[s.activeChatId] ? s.activeChatId : '' };
                });
              }}
            >
              <Trash2 size={15} /> {tr('Удалить')}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => save(false)}>
            {tr('Сохранить')}
          </button>
          <button type="button" className="btn primary" onClick={() => save(true)}>
            {tr('Сохранить и открыть')}
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label={tr('Название')}>
          <input className="input" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
        </Field>
        <Field label={tr('Кто отвечает')}>
          <Select
            value={g.activation}
            onChange={(v) => setG({ ...g, activation: v })}
            options={[
              { value: 'natural', label: tr('Естественно (упоминания и разговорчивость)') },
              { value: 'list', label: tr('Все по очереди') },
              { value: 'pooled', label: tr('По одному, кто давно молчал') },
              { value: 'manual', label: tr('Вручную (/trigger Имя)') },
            ]}
          />
        </Field>
      </div>
      <Switch label={tr('Разрешить отвечать самому себе подряд')} checked={g.allowSelfResponses} onChange={(v) => setG({ ...g, allowSelfResponses: v })} />
      <Divider title={tr('Участники')} />
      <div className="col" style={{ gap: 6 }}>
        {Object.values(characters).map((c) => {
          const inGroup = g.members.includes(c.id);
          const muted = g.disabledMembers.includes(c.id);
          return (
            <div key={c.id} className={`list-item ${inGroup ? 'on' : ''}`} style={{ border: '1px solid var(--line)' }}>
              <Avatar src={c.avatar} name={c.name} size={36} />
              <span className="li-text">
                <span className="li-title">{c.name}</span>
                <span className="li-sub">{tr('разговорчивость')} {Math.round(c.talkativeness * 100)}%</span>
              </span>
              {inGroup && (
                <Switch
                  label={tr('активен')}
                  checked={!muted}
                  onChange={(v) => setG({ ...g, disabledMembers: v ? g.disabledMembers.filter((x) => x !== c.id) : [...g.disabledMembers, c.id] })}
                />
              )}
              {inGroup && (
                <IconBtn
                  size="sm"
                  icon={<span style={{ fontSize: 11 }}>▶</span>}
                  label={tr('Заставить ответить')}
                  onClick={async () => {
                    closeModal();
                    await runGeneration('normal', { charId: c.id });
                  }}
                />
              )}
              <button type="button" className="btn sm" onClick={() => toggleMember(c.id)}>
                {inGroup ? tr('Убрать') : tr('Добавить')}
              </button>
            </div>
          );
        })}
        {!Object.keys(characters).length && <div className="empty">{tr('Сначала создайте персонажей')}</div>}
      </div>
    </Modal>
  );
}

// ───────────── Теги ─────────────

function TagsModal() {
  const characters = useStore((s) => s.characters);
  const counts: Record<string, number> = {};
  Object.values(characters).forEach((c) => c.tags.forEach((t) => (counts[t] = (counts[t] ?? 0) + 1)));
  const rename = (from: string) => {
    const to = prompt(tr('Новое имя тега'), from)?.trim();
    if (!to || to === from) return;
    setState((s) => ({
      characters: Object.fromEntries(
        Object.entries(s.characters).map(([id, c]) => [id, { ...c, tags: [...new Set(c.tags.map((t) => (t === from ? to : t)))] }]),
      ),
    }));
  };
  const remove = (tag: string) => {
    if (!confirm(tr('Удалить тег «{0}» у всех персонажей?', tag))) return;
    setState((s) => ({
      characters: Object.fromEntries(Object.entries(s.characters).map(([id, c]) => [id, { ...c, tags: c.tags.filter((t) => t !== tag) }])),
    }));
  };
  return (
    <Modal title={tr('Управление тегами')} onClose={closeModal}>
      <div className="col" style={{ gap: 6 }}>
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => (
            <div key={t} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <span className="chip">{t}</span>
              <span className="sub grow">
                {n} {plural(n, 'персонаж', 'персонажа', 'персонажей')}
              </span>
              <IconBtn size="sm" icon={<Pencil size={13} />} label={tr('Переименовать')} onClick={() => rename(t)} />
              <IconBtn size="sm" className="danger" icon={<Trash2 size={13} />} label={tr('Удалить')} onClick={() => remove(t)} />
            </div>
          ))}
        {!Object.keys(counts).length && <div className="empty">{tr('Тегов пока нет — добавьте их в карточке персонажа')}</div>}
      </div>
    </Modal>
  );
}

// ───────────── Импорт по ссылке ─────────────

function ImportUrlModal() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      let target = url.trim();
      const chub = /chub\.ai\/characters\/([^/?#]+\/[^/?#]+)/.exec(target);
      if (chub) target = `https://avatars.charhub.io/avatars/${chub[1]}/chara_card_v2.png`;
      const res = await fetch(target);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 4));
      let parsed;
      if (head[0] === 0x89 && head[1] === 0x50) {
        const chunks = readPngTextChunks(buf);
        const raw = chunks.ccv3 ?? chunks.chara;
        if (!raw) throw new Error(tr('В PNG нет карточки'));
        const json = new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
        parsed = characterFromJson(JSON.parse(json));
        parsed.char.avatar = await shrinkImage(await readDataUrl(new Blob([buf], { type: 'image/png' })), 768);
      } else {
        parsed = characterFromJson(JSON.parse(new TextDecoder().decode(buf)));
      }
      if (parsed.book) upsertLorebook(parsed.book);
      upsertCharacter(parsed.char);
      setState({ editingCharId: parsed.char.id, modal: null });
      toast(tr('Импортирован «{0}»', parsed.char.name), 'success');
    } catch (e) {
      toast(tr('Не удалось загрузить: ') + (e as Error).message + tr('. Если сайт блокирует запросы (CORS) — скачайте PNG и перетащите в окно.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={tr('Импорт по ссылке')}
      onClose={closeModal}
      footer={
        <button type="button" className="btn primary" disabled={!url || busy} onClick={() => void go()}>
          {busy ? tr('Загрузка…') : tr('Импортировать')}
        </button>
      }
    >
      <Field label={tr('Ссылка')} hint={tr('Chub.ai (страница персонажа) или прямая ссылка на PNG/JSON-карточку')}>
        <input className="input" value={url} autoFocus placeholder={tr('https://chub.ai/characters/автор/имя')} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void go()} />
      </Field>
    </Modal>
  );
}

// ───────────── Экспорт персонажа ─────────────

function ExportCharModal({ id }: { id: string }) {
  const ch = useStore((s) => s.characters[id]);
  if (!ch) return null;
  return (
    <Modal title={tr('Экспорт · {0}', ch.name)} onClose={closeModal}>
      <div className="sub">{tr('PNG-карточка совместима с SillyTavern и другими фронтендами (spec v2/v3). Привязанный лорбук встраивается в карточку.')}</div>
      <div className="row">
        <button type="button" className="btn primary grow" onClick={() => void exportCharacter(ch, 'png').then(closeModal)}>
          <Download size={15} /> {tr('PNG-карточка')}
        </button>
        <button type="button" className="btn grow" onClick={() => (void exportCharacter(ch, 'json'), closeModal())}>
          <Download size={15} /> JSON
        </button>
      </div>
    </Modal>
  );
}

// ───────────── Расширенные поля персонажа ─────────────

function CharAdvancedModal({ id }: { id: string }) {
  const ch = useStore((s) => s.characters[id]);
  if (!ch) return null;
  const set = (p: Partial<typeof ch>) => upsertCharacter({ ...getState().characters[id], ...p });
  return (
    <Modal title={tr('Расширенные поля')} onClose={closeModal} wide>
      <div className="grid2">
        <Field label={tr('Системный промпт персонажа')} hint={tr('Заменяет основной промпт. {{original}} — вставить исходный')}>
          <LazyTextarea className="textarea" rows={5} value={ch.system_prompt} onCommit={(v) => set({ system_prompt: v })} />
        </Field>
        <Field label={tr('Инструкции после истории')} hint={tr('Заменяют «Инструкции после истории» пресета')}>
          <LazyTextarea className="textarea" rows={5} value={ch.post_history_instructions} onCommit={(v) => set({ post_history_instructions: v })} />
        </Field>
      </div>
      <Divider title={tr('Заметка персонажа на глубине')} />
      <LazyTextarea className="textarea" rows={3} value={ch.depth_prompt.prompt} onCommit={(v) => set({ depth_prompt: { ...ch.depth_prompt, prompt: v } })} />
      <div className="grid3">
        <Field label={tr('Глубина')}>
          <NumInput value={ch.depth_prompt.depth} min={0} max={999} onChange={(v) => set({ depth_prompt: { ...ch.depth_prompt, depth: v } })} />
        </Field>
        <Field label={tr('Роль')}>
          <Select
            value={ch.depth_prompt.role}
            onChange={(v) => set({ depth_prompt: { ...ch.depth_prompt, role: v } })}
            options={[
              { value: 'system', label: tr('Система') },
              { value: 'user', label: tr('Пользователь') },
              { value: 'assistant', label: tr('Ассистент') },
            ]}
          />
        </Field>
        <Slider label={tr('Разговорчивость в группе')} value={Math.round(ch.talkativeness * 100)} min={0} max={100} suffix="%" onChange={(v) => set({ talkativeness: v / 100 })} />
      </div>
      <div className="grid3">
        <Field label={tr('Автор')}>
          <LazyInput value={ch.creator} onCommit={(v) => set({ creator: v })} />
        </Field>
        <Field label={tr('Версия')}>
          <LazyInput value={ch.character_version} onCommit={(v) => set({ character_version: v })} />
        </Field>
        <Field label={tr('Обложка чата')}>
          <div className="row">
            <button
              type="button"
              className="btn sm grow"
              onClick={async () => {
                const url = await pickAndCrop(BANNER_CROP);
                if (url) set({ banner: url });
              }}
            >
              <Upload size={14} /> {tr('Загрузить')}
            </button>
            {ch.banner && (
              <IconBtn
                size="sm"
                icon={<CropIcon size={14} />}
                label={tr('Обрезать обложку')}
                onClick={async () => {
                  const url = await cropImage(ch.banner!, BANNER_CROP);
                  if (url) set({ banner: url });
                }}
              />
            )}
            {ch.banner && <IconBtn size="sm" className="danger" icon={<X size={14} />} label={tr('Убрать обложку')} onClick={() => set({ banner: undefined })} />}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function CreatorNotesModal({ id }: { id: string }) {
  const ch = useStore((s) => s.characters[id]);
  if (!ch) return null;
  return (
    <Modal title={tr('Заметки создателя')} onClose={closeModal}>
      <div className="sub">{tr('Видны только вам и не отправляются модели.')}</div>
      <LazyTextarea className="textarea" rows={12} value={ch.creator_notes} onCommit={(v) => upsertCharacter({ ...getState().characters[id], creator_notes: v })} />
    </Modal>
  );
}

// ───────────── Настройки расширений ─────────────

function ExtModal({ id, arg }: { id: string; arg?: string }) {
  const info = EXTENSIONS.find((e) => e.id === id);
  const ext = useStore((s) => s.ext);
  const setExt = <K extends keyof ExtensionSettings>(k: K, v: Partial<ExtensionSettings[K]>) =>
    setState((s) => ({ ext: { ...s.ext, [k]: Array.isArray(s.ext[k]) ? v : { ...(s.ext[k] as object), ...(v as object) } } }));
  const chat = useStore(activeChat);
  const enabled = Boolean(ext.enabled[id]);
  const header = (
    <Switch
      label={enabled ? tr('Включено') : tr('Выключено')}
      checked={enabled}
      onChange={(v) => setState((s) => ({ ext: { ...s.ext, enabled: { ...s.ext.enabled, [id]: v } } }))}
    />
  );
  let body: React.ReactNode = null;
  switch (id) {
    case 'summarize':
      body = (
        <>
          <Field label={tr('Промпт пересказа')} hint={tr('{{words}} — лимит слов')}>
            <LazyTextarea className="textarea" rows={4} value={ext.summarize.prompt} onCommit={(v) => setExt('summarize', { prompt: v })} />
          </Field>
          <Field label={tr('Шаблон вставки')} hint={tr('{{summary}} — текст пересказа')}>
            <LazyInput value={ext.summarize.template} onCommit={(v) => setExt('summarize', { template: v })} />
          </Field>
          <div className="grid3">
            <Field label={tr('Куда вставлять')}>
              <Select
                value={ext.summarize.position}
                onChange={(v) => setExt('summarize', { position: v })}
                options={[
                  { value: 'before', label: tr('До персонажа') },
                  { value: 'after', label: tr('После персонажа') },
                  { value: 'depth', label: tr('На глубине') },
                ]}
              />
            </Field>
            <Field label={tr('Глубина')}>
              <NumInput value={ext.summarize.depth} min={0} onChange={(v) => setExt('summarize', { depth: v })} />
            </Field>
            <Field label={tr('Лимит слов')}>
              <NumInput value={ext.summarize.maxWords} min={20} onChange={(v) => setExt('summarize', { maxWords: v })} />
            </Field>
          </div>
          <Field label={tr('Авто-пересказ каждые N сообщений')} hint={tr('0 — только вручную (/sum или палочка)')}>
            <NumInput value={ext.summarize.every} min={0} onChange={(v) => setExt('summarize', { every: v })} />
          </Field>
          {chat && (
            <Field label={tr('Текущий пересказ чата')}>
              <LazyTextarea className="textarea" rows={5} value={chat.summary ?? ''} onCommit={(v) => updateChat(chat.id, (c) => void (c.summary = v))} />
            </Field>
          )}
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void summarizeChat()}>
            {tr('Пересказать сейчас')}
          </button>
        </>
      );
      break;
    case 'tts': {
      const vs = voices();
      body = (
        <>
          <Field label={tr('Голос')} hint={tr('Голоса берутся из системы/браузера')}>
            <Select
              value={ext.tts.voice}
              onChange={(v) => setExt('tts', { voice: v })}
              options={[{ value: '', label: tr('Системный (русский)') }, ...vs.map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` }))]}
            />
          </Field>
          <Slider label={tr('Скорость')} value={ext.tts.rate} min={0.5} max={2} step={0.05} onChange={(v) => setExt('tts', { rate: v })} />
          <Slider label={tr('Высота')} value={ext.tts.pitch} min={0.5} max={2} step={0.05} onChange={(v) => setExt('tts', { pitch: v })} />
          <Switch label={tr('Озвучивать ответы автоматически')} checked={ext.tts.auto} onChange={(v) => setExt('tts', { auto: v })} />
          <Switch label={tr('Только прямую речь в кавычках')} checked={ext.tts.narrateQuotesOnly} onChange={(v) => setExt('tts', { narrateQuotesOnly: v })} />
        </>
      );
      break;
    }
    case 'stt':
      body = (
        <>
          <Field label={tr('Язык распознавания')}>
            <Select
              value={ext.stt.lang}
              onChange={(v) => setExt('stt', { lang: v })}
              options={[
                { value: 'ru-RU', label: tr('Русский') },
                { value: 'en-US', label: 'English' },
                { value: 'uk-UA', label: tr('Українська') },
                { value: 'de-DE', label: 'Deutsch' },
              ]}
            />
          </Field>
          <Switch label={tr('Отправлять сразу после распознавания')} checked={ext.stt.autoSend} onChange={(v) => setExt('stt', { autoSend: v })} />
          <div className="sub">{tr('Микрофон включается из меню палочки в поле ввода. Работает в Chrome, Edge и Safari.')}</div>
        </>
      );
      break;
    case 'translate':
      body = (
        <>
          <Field label={tr('Режим')}>
            <Select
              value={ext.translate.mode}
              onChange={(v) => setExt('translate', { mode: v })}
              options={[
                { value: 'display', label: tr('Переводить ответы для показа') },
                { value: 'input', label: tr('Переводить мои сообщения для модели') },
                { value: 'both', label: tr('В обе стороны') },
                { value: 'none', label: tr('Только вручную') },
              ]}
            />
          </Field>
          <div className="grid2">
            <Field label={tr('Язык показа')}>
              <Select value={ext.translate.target} onChange={(v) => setExt('translate', { target: v })} options={LANGS.map(([v, l]) => ({ value: v, label: l }))} />
            </Field>
            <Field label={tr('Язык для модели')}>
              <Select value={ext.translate.inputTarget} onChange={(v) => setExt('translate', { inputTarget: v })} options={LANGS.map(([v, l]) => ({ value: v, label: l }))} />
            </Field>
          </div>
          <div className="sub">{tr('Используется бесплатный Google Translate. Оригинал всегда можно посмотреть, нажав метку «перевод» у сообщения.')}</div>
          {chat && (
            <button
              type="button"
              className="btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                const last = [...chat.messages].reverse().find((m) => !m.isUser);
                if (last) await translateMessage(chat.id, last.id);
              }}
            >
              {tr('Перевести последний ответ')}
            </button>
          )}
        </>
      );
      break;
    case 'imageGen':
      body = (
        <>
          <div className="sub">{tr('Изображения рисует бесплатный сервис Pollinations. Описание сцены составляет подключённая модель.')}</div>
          <Field label={tr('Стиль (добавляется в начало)')}>
            <LazyInput value={ext.imageGen.stylePrefix} onCommit={(v) => setExt('imageGen', { stylePrefix: v })} />
          </Field>
          <div className="grid2">
            <Field label={tr('Ширина')}>
              <NumInput value={ext.imageGen.width} min={256} max={1536} onChange={(v) => setExt('imageGen', { width: v })} />
            </Field>
            <Field label={tr('Высота')}>
              <NumInput value={ext.imageGen.height} min={256} max={1536} onChange={(v) => setExt('imageGen', { height: v })} />
            </Field>
          </div>
          {chat && (
            <div className="row">
              <button type="button" className="btn" onClick={() => (closeModal(), void generateImage(chat.id, 'scene'))}>
                {tr('Нарисовать сцену')}
              </button>
              <button type="button" className="btn" onClick={() => (closeModal(), void generateImage(chat.id, 'char'))}>
                {tr('Нарисовать персонажа')}
              </button>
            </div>
          )}
        </>
      );
      break;
    case 'expressions':
      body = <ExpressionsSettings />;
      break;
    case 'regex':
      body = <RegexSettings initial={arg === 'preset' ? 'preset' : 'global'} />;
      break;
    case 'quickReplies':
      body = <QuickReplySettings />;
      break;
    case 'gallery':
      body = <div className="sub">{tr('Галерея открывается кнопкой «Галерея» над чатом. Туда попадают аватар, обложка, загруженные и сгенерированные изображения.')}</div>;
      break;
    case 'captions':
      body = (
        <div className="sub">
          {tr('Прикреплённые к сообщению картинки (скрепка в меню палочки или вставка из буфера) отправляются мультимодальной модели как есть — отдельная подпись не нужна. Включите «Отправлять изображения модели» во вкладке API.')}
        </div>
      );
      break;
    default:
      body = <div className="sub">{tr('Этот модуль в разработке. Скажите, если он нужен в первую очередь — добавим.')}</div>;
  }
  return (
    <Modal title={info ? tr(info.name) : tr('Расширение')} onClose={closeModal} wide={id === 'regex' || id === 'quickReplies' || id === 'expressions'}>
      <div className="sub">{info ? tr(info.desc) : ''}</div>
      {header}
      <Divider />
      {body}
    </Modal>
  );
}

type RegexScope = 'global' | 'preset';

const setGlobalRegex = (fn: (l: RegexScript[]) => RegexScript[]) => setState((s) => ({ ext: { ...s.ext, regex: fn(s.ext.regex) } }));
const setPresetRegex = (fn: (l: RegexScript[]) => RegexScript[]) => updatePreset((p) => ({ ...p, regex: fn(p.regex ?? []) }));

function RegexSettings({ initial }: { initial: RegexScope }) {
  const [scope, setScope] = useState<RegexScope>(initial);
  const globalList = useStore((s) => s.ext.regex);
  const preset = useStore(activePreset);
  const presetList = preset.regex ?? [];
  const list = scope === 'global' ? globalList : presetList;
  const setList = (regex: RegexScript[]) => (scope === 'global' ? setGlobalRegex : setPresetRegex)(() => regex);
  const upd = (id: string, p: Partial<RegexScript>) => setList(list.map((r) => (r.id === id ? { ...r, ...p } : r)));
  /** Перенести скрипт между глобальными и пресетом. */
  const moveScript = (r: RegexScript) => {
    if (scope === 'global') {
      setGlobalRegex((l) => l.filter((x) => x.id !== r.id));
      setPresetRegex((l) => [...l, r]);
      toast(tr('«{0}» привязан к пресету «{1}»', r.name, tr(preset.name)), 'success');
    } else {
      setPresetRegex((l) => l.filter((x) => x.id !== r.id));
      setGlobalRegex((l) => [...l, r]);
      toast(tr('«{0}» теперь глобальный', r.name), 'success');
    }
  };
  const [test, setTest] = useState('');
  const cardOn = useStore((s) => s.ext.cardRegex !== false);
  const chatChar = useStore((s) => {
    const c = activeChat(s);
    return c?.ownerType === 'char' ? s.characters[c.ownerId] : undefined;
  });
  const fromCard = cardRegex(chatChar);
  return (
    <>
      <Switch
        label={tr('Регексы из карточек персонажей')}
        hint={tr('скрипты, встроенные в карточку (как в SillyTavern), работают только в чатах этого персонажа')}
        checked={cardOn}
        onChange={(v) => setState((s) => ({ ext: { ...s.ext, cardRegex: v } }))}
      />
      {chatChar && fromCard.length > 0 && (
        <div className="sub">
          {tr('В карточке «{0}»: {1}', chatChar.name, fromCard.map((r) => r.name).join(', '))}
        </div>
      )}
      <Seg
        value={scope}
        onChange={setScope}
        options={[
          { value: 'global', label: tr('Глобальные ({0})', globalList.length) },
          { value: 'preset', label: tr('Пресет «{0}» ({1})', tr(preset.name), presetList.length) },
        ]}
      />
      <div className="sub">
        {scope === 'global'
          ? tr('Работают всегда. Кнопкой со скрепкой скрипт можно привязать к текущему пресету.')
          : tr('Работают, только пока выбран пресет «{0}»: сменили пресет — сменились и регексы. Сохраняются и экспортируются вместе с пресетом.', tr(preset.name))}
      </div>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => setList([...list, blankRegex()])}>
          <Plus size={14} /> {tr('Скрипт')}
        </button>
        <button
          type="button"
          className="btn sm"
          title={tr('JSON из SillyTavern (один скрипт или массив) или ZIP-архив с ними — распаковывать не нужно')}
          onClick={async () => {
            const files = await pickFiles('.json,.zip,application/json,application/zip', true);
            if (!files.length) return;
            const { scripts, errors } = await readRegexFiles(files);
            errors.forEach((e) => toast(e, 'error'));
            if (!scripts.length) return;
            const r = mergeRegex(list, scripts);
            setList(r.list);
            toast(
              r.skipped ? tr('Импортировано регексов: {0}, пропущено повторов: {1}', r.added, r.skipped) : tr('Импортировано регексов: {0}', r.added),
              'success',
            );
          }}
        >
          <Upload size={14} /> {tr('Импорт (JSON, ZIP)')}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!list.length}
          title={tr('Скрипты этого списка одним JSON-файлом')}
          onClick={() => download(scope === 'global' ? 'regex.json' : `regex-${safeName(preset.name)}.json`, JSON.stringify(list.map(regexToST), null, 2))}
        >
          <Download size={14} /> {tr('Экспорт')}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!globalList.length && !presetList.length && !fromCard.length}
          title={tr('Глобальные, регексы пресета и из карточки — в одном JSON (открывается в Divinax и SillyTavern)')}
          onClick={() => {
            const all = [...globalList, ...presetList, ...fromCard];
            download('regex-all.json', JSON.stringify(all.map(regexToST), null, 2));
            toast(tr('В файле {0} {1}', all.length, plural(all.length, 'регекс', 'регекса', 'регексов')), 'success');
          }}
        >
          <Download size={14} /> {tr('Все одним JSON')}
        </button>
      </div>
      {list.map((r) => (
        <div key={r.id} className="entry open" style={{ padding: 14 }}>
          <div className="col" style={{ gap: 10 }}>
            <div className="row">
              <Switch checked={r.enabled} onChange={(v) => upd(r.id, { enabled: v })} />
              <LazyInput className="input sm grow" value={r.name} onCommit={(v) => upd(r.id, { name: v })} />
              <IconBtn
                size="sm"
                icon={scope === 'global' ? <Link2 size={14} /> : <Unlink size={14} />}
                label={scope === 'global' ? tr('Привязать к пресету «{0}»', tr(preset.name)) : tr('Отвязать от пресета (сделать глобальным)')}
                onClick={() => moveScript(r)}
              />
              <IconBtn size="sm" className="danger" icon={<Trash2 size={14} />} label={tr('Удалить')} onClick={() => setList(list.filter((x) => x.id !== r.id))} />
            </div>
            <div className="grid2">
              <Field label={tr('Найти')} hint={tr('/регулярка/флаги или текст')}>
                <LazyInput className="input mono" value={r.find} onCommit={(v) => upd(r.id, { find: v })} />
              </Field>
              <Field label={tr('Заменить на')} hint={tr('$1, $2 — группы, {{match}} — всё совпадение; можно HTML')}>
                <LazyInput className="input mono" value={r.replace} onCommit={(v) => upd(r.id, { replace: v })} />
              </Field>
            </div>
            <div className="row wrap" style={{ gap: 16 }}>
              <Switch label={tr('Ввод')} checked={r.onInput} onChange={(v) => upd(r.id, { onInput: v })} />
              <Switch label={tr('Ответ ИИ')} checked={r.onOutput} onChange={(v) => upd(r.id, { onOutput: v })} />
              <Switch label={tr('Только показ')} checked={r.displayOnly} onChange={(v) => upd(r.id, { displayOnly: v, onPrompt: v ? false : r.onPrompt })} />
              <Switch label={tr('Только промпт')} checked={r.onPrompt} onChange={(v) => upd(r.id, { onPrompt: v, displayOnly: v ? false : r.displayOnly })} />
            </div>
          </div>
        </div>
      ))}
      {!list.length && <div className="empty">{tr('Скриптов нет. Пример: найти /\\*\\*(.+?)\\*\\*/g → заменить на $1')}</div>}
      {list.length > 0 && (
        <Field label={tr('Проверка (ответ ИИ, сохранение)')}>
          <input className="input" value={test} onChange={(e) => setTest(e.target.value)} placeholder={tr('Введите текст')} />
          {test && (
            <div className="hint">
              →{' '}
              {(() => {
                let out = test;
                for (const r of list) {
                  if (!r.enabled || !r.find) continue;
                  try {
                    const m = /^\/(.+)\/([a-z]*)$/s.exec(r.find);
                    out = out.replace(m ? new RegExp(m[1], m[2]) : new RegExp(r.find, 'g'), r.replace);
                  } catch {
                    /* неверная регулярка */
                  }
                }
                return out;
              })()}
            </div>
          )}
        </Field>
      )}
    </>
  );
}

function QuickReplySettings() {
  const qr = useStore((s) => s.ext.quickReplies);
  const setQr = (p: Partial<typeof qr>) => setState((s) => ({ ext: { ...s.ext, quickReplies: { ...s.ext.quickReplies, ...p } } }));
  const set = qr.sets.find((x) => x.id === qr.activeSet) ?? qr.sets[0];
  const updItems = (items: QuickReply[]) => setQr({ sets: qr.sets.map((x) => (x.id === set.id ? { ...x, items } : x)) });
  return (
    <>
      <div className="row">
        <Select className="grow" value={set?.id ?? ''} onChange={(v) => setQr({ activeSet: v })} options={qr.sets.map((x) => ({ value: x.id, label: tr(x.name) }))} />
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            const name = prompt(tr('Название набора'), tr('Новый набор'));
            if (!name) return;
            const ns = { id: uid(), name, items: [] };
            setQr({ sets: [...qr.sets, ns], activeSet: ns.id });
          }}
        >
          <Plus size={14} /> {tr('Набор')}
        </button>
        {qr.sets.length > 1 && (
          <IconBtn
            size="lg"
            className="danger"
            icon={<Trash2 size={15} />}
            label={tr('Удалить набор')}
            onClick={() => {
              const rest = qr.sets.filter((x) => x.id !== set.id);
              setQr({ sets: rest, activeSet: rest[0].id });
            }}
          />
        )}
      </div>
      {set?.items.map((it) => (
        <div key={it.id} className="row" style={{ alignItems: 'flex-start' }}>
          <LazyInput className="input" style={{ width: 180 }} value={it.label} onCommit={(v) => updItems(set.items.map((x) => (x.id === it.id ? { ...x, label: v } : x)))} />
          <LazyTextarea className="textarea grow" rows={1} style={{ minHeight: 40 }} value={it.message} onCommit={(v) => updItems(set.items.map((x) => (x.id === it.id ? { ...x, message: v } : x)))} />
          <div style={{ paddingTop: 8 }}>
            <Switch label={tr('сразу')} checked={it.autoSend} onChange={(v) => updItems(set.items.map((x) => (x.id === it.id ? { ...x, autoSend: v } : x)))} />
          </div>
          <IconBtn size="lg" className="danger" icon={<Trash2 size={14} />} label={tr('Удалить')} onClick={() => updItems(set.items.filter((x) => x.id !== it.id))} />
        </div>
      ))}
      {set && (
        <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => updItems([...set.items, { id: uid(), label: tr('Кнопка'), message: '', autoSend: false }])}>
          <Plus size={14} /> {tr('Кнопка')}
        </button>
      )}
      <div className="sub">{tr('«Сразу» — отправить или выполнить команду (/sum, /continue…). Иначе текст вставляется в поле ввода.')}</div>
    </>
  );
}

function ExpressionsSettings() {
  const chat = useStore(activeChat);
  const characters = useStore((s) => s.characters);
  const sprites = useStore((s) => s.ext.expressions.sprites);
  const [charId, setCharId] = useState(chat?.ownerType === 'char' ? chat.ownerId : Object.keys(characters)[0] ?? '');
  const mine = sprites[charId] ?? {};
  const setSprite = (emo: string, url?: string) =>
    setState((s) => {
      const cur = { ...(s.ext.expressions.sprites[charId] ?? {}) };
      if (url) cur[emo] = url;
      else delete cur[emo];
      return { ext: { ...s.ext, expressions: { sprites: { ...s.ext.expressions.sprites, [charId]: cur } } } };
    });
  return (
    <>
      <div className="sub">{tr('Загрузите картинки для эмоций — аватар над чатом будет меняться под настроение последней реплики.')}</div>
      <Field label={tr('Персонаж')}>
        <Select value={charId} onChange={setCharId} options={Object.values(characters).map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {EXPRESSIONS.map((emo) => (
          <div key={emo} className="bg-tile" style={{ alignItems: 'center' }}>
            {mine[emo] ? <img src={mine[emo]} alt="" style={{ aspectRatio: '1' }} /> : <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, border: '1px dashed var(--line)' }} />}
            <span>{tr(emo)}</span>
            <div className="row">
              <IconBtn
                size="sm"
                icon={<Upload size={13} />}
                label={tr('Загрузить')}
                onClick={async () => {
                  const [f] = await pickFiles('image/*');
                  if (f) setSprite(emo, await shrinkImage(await readDataUrl(f), 512));
                }}
              />
              {mine[emo] && <IconBtn size="sm" className="danger" icon={<X size={13} />} label={tr('Убрать')} onClick={() => setSprite(emo)} />}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
