import { tr } from '../lib/i18n';
import { useShallow } from 'zustand/react/shallow';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRightToLine,
  BookMarked,
  Brain,
  Download,
  FileText,
  Folder,
  History,
  IdCard,
  Image as ImageIcon,
  ImagePlus,
  Languages,
  Library as LibraryIcon,
  Menu,
  MessageCircle,
  Mic,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Send,
  Square,
  Trash2,
  Upload,
  Users,
  VenetianMask,
  Volume2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  activeChat,
  chatOwnerName,
  chatsOf,
  getState,
  openModal,
  setState,
  setTab,
  toast,
  updateChat,
  upsertGroup,
  useStore,
} from '../store';
import type { Chat } from '../types';
import { Library } from '../components/Library';
import { MessageItem } from '../components/MessageItem';
import { Avatar, IconBtn, LazyTextarea, NumInput, Panel, Select, Star, Switch } from '../components/ui';
import { closeChat, exportChat, importChatText, openChat, openOwner, startNewChat } from '../lib/chats';
import { runGeneration, sendMessage, stopGeneration, summarizeChat } from '../lib/generate';
import { runSlash } from '../lib/slash';
import { speak, startRecognition } from '../lib/speech';
import { fmtDay, fmtDayTitle, pickFiles, plural, readDataUrl, shrinkImage, uid } from '../lib/util';
import { generateImage } from '../lib/images';

export function ChatPage() {
  const chat = useStore(activeChat);
  const [drawer, setDrawer] = useState<'' | 'left' | 'right'>('');
  return (
    <div className="page">
      <div className="chat-left">
        <LeftColumn chat={chat} />
      </div>
      <div className="chat-center">
        {chat ? <ChatView chat={chat} onDrawer={setDrawer} /> : <NoChat onDrawer={setDrawer} />}
      </div>
      <div className="chat-right d-only">
        <Library
          style={{ height: '100%' }}
          selectedId={chat?.ownerId}
          onPickChar={(id) => openOwner('char', id)}
          onPickGroup={(id) => openOwner('group', id)}
        />
      </div>
      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer('')} />
          <div className={`drawer ${drawer} scroll`}>
            {drawer === 'left' ? (
              <LeftColumn chat={chat} />
            ) : (
              <Library
                style={{ minHeight: '100%' }}
                selectedId={chat?.ownerId}
                onPickChar={(id) => {
                  openOwner('char', id);
                  setDrawer('');
                }}
                onPickGroup={(id) => {
                  openOwner('group', id);
                  setDrawer('');
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LeftColumn({ chat }: { chat?: Chat }) {
  return (
    <>
      <ChatsPanel chat={chat} />
      {chat && <AuthorNotePanel chat={chat} />}
      <QuickRepliesPanel />
    </>
  );
}

function NoChat({ onDrawer }: { onDrawer: (d: 'left' | 'right') => void }) {
  const count = useStore((s) => Object.keys(s.characters).length);
  return (
    <>
    <Panel className="grow" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 260 }}>
      <button type="button" className="menu-btn m-only" style={{ position: 'absolute', top: 14, right: 14 }} aria-label={tr('Меню')} onClick={() => setState({ mobileMenu: true })}>
        <Menu size={20} />
      </button>
      <Star size={28} />
      <h1 className="hero-name" style={{ fontFamily: 'var(--sc)', letterSpacing: '0.1em' }}>
        Divinax
      </h1>
      <p className="sub" style={{ maxWidth: 420 }}>
        {count
          ? tr('Выберите персонажа в библиотеке, чтобы начать или продолжить историю.')
          : tr('Создайте персонажа или перетащите PNG-карточку SillyTavern прямо в окно.')}
      </p>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn lib-toggle" onClick={() => onDrawer('right')}>
          <LibraryIcon size={16} /> {tr('Библиотека')}
        </button>
        <button type="button" className="btn" onClick={() => setTab('characters')}>
          <Users size={16} /> {tr('Персонажи')}
        </button>
        <button type="button" className="btn" onClick={() => setTab('api')}>
          {tr('Подключить API')}
        </button>
      </div>
    </Panel>
    {/* на телефоне библиотека сразу под приветствием */}
    <div className="m-only" style={{ flexDirection: 'column' }}>
      <Library onPickChar={(id) => openOwner('char', id)} onPickGroup={(id) => openOwner('group', id)} />
    </div>
    </>
  );
}

// ───────────── Левая колонка ─────────────

function ChatsPanel({ chat }: { chat?: Chat }) {
  const list = useStore(useShallow((s) => (chat ? chatsOf(s, chat.ownerId) : [])));
  const ownerName = useStore((s) => chatOwnerName(s, chat));
  return (
    <Panel
      title={tr('Чаты')}
      actions={
        chat && (
          <IconBtn icon={<Plus size={17} />} label={tr('Новый чат')} onClick={() => startNewChat(chat.ownerType, chat.ownerId)} />
        )
      }
    >
      {chat ? (
        <div className="list scroll chats-list">
          {list.map((c) => (
            <button key={c.id} type="button" className={`list-item ${c.id === chat.id ? 'on' : ''}`} onClick={() => openChat(c.id)}>
              {c.id === chat.id ? <Star size={10} /> : <span style={{ width: 10, flex: 'none' }} />}
              <span className="li-text">
                <span className="li-title">
                  <span className="ellipsis">{c.name}</span>
                  {c.branchOf && (
                    <span className="muted" style={{ display: 'flex' }} title={tr('Ветка')}>
                      <History size={13} />
                    </span>
                  )}
                </span>
                <span className="li-sub">
                  {c.messages.length} {plural(c.messages.length, 'сообщение', 'сообщения', 'сообщений')} · {fmtDay(c.updatedAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="sub">{tr('Чат не выбран')}</div>
      )}
      <div className="row">
        <button type="button" className="btn sm grow" disabled={!chat} onClick={() => openModal('chats')} title={tr('Все чаты: {0}', ownerName)}>
          <History size={15} /> {tr('Все чаты')}
        </button>
        <IconBtn
          icon={<Upload size={16} />}
          label={tr('Импорт чата (JSONL)')}
          disabled={!chat}
          onClick={async () => {
            const [f] = await pickFiles('.jsonl,.json');
            if (f && chat) importChatText(await f.text(), chat.ownerType, chat.ownerId, f.name);
          }}
        />
        <IconBtn icon={<Download size={16} />} label={tr('Экспорт чата')} disabled={!chat} onClick={() => chat && exportChat(chat.id)} />
      </div>
    </Panel>
  );
}

function AuthorNotePanel({ chat }: { chat: Chat }) {
  const an = chat.authorNote;
  const set = (p: Partial<Chat['authorNote']>) => updateChat(chat.id, (c) => void (c.authorNote = { ...c.authorNote, ...p }));
  return (
    <Panel title={tr('Заметка автора')} actions={<Switch checked={an.enabled} onChange={(v) => set({ enabled: v })} />}>
      <LazyTextarea
        className="textarea serif"
        rows={2}
        value={an.text}
        placeholder={tr('[Стиль, настроение, напоминания для модели…]')}
        onCommit={(v) => set({ text: v, enabled: an.enabled || Boolean(v.trim()) })}
        style={{ minHeight: 70, fontSize: 16 }}
      />
      <div className="row">
        <label className="row" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {tr('Глубина')}
          <NumInput value={an.depth} min={0} max={999} onChange={(v) => set({ depth: v })} className="input sm" style={{ width: 52 }} />
        </label>
        <Select
          small
          className="grow"
          value={an.role}
          onChange={(v) => set({ role: v })}
          options={[
            { value: 'system', label: tr('Система') },
            { value: 'user', label: tr('Пользователь') },
            { value: 'assistant', label: tr('Ассистент') },
          ]}
        />
        <IconBtn icon={<MoreHorizontal size={16} />} label={tr('Все настройки заметки')} onClick={() => openModal('authorNote')} />
      </div>
    </Panel>
  );
}

function QuickRepliesPanel() {
  const qr = useStore((s) => s.ext.quickReplies);
  const enabled = useStore((s) => s.ext.enabled.quickReplies);
  if (!enabled) return null;
  const set = qr.sets.find((x) => x.id === qr.activeSet) ?? qr.sets[0];
  return (
    <Panel title={tr('Быстрые ответы')} actions={set && <span className="sub">{tr('набор «{0}»', tr(set.name))}</span>}>
      <div className="row wrap" style={{ gap: 6 }}>
        {set?.items.map((it) => (
          <button key={it.id} type="button" className="chip" onClick={() => runQuickReply(it.message, it.autoSend)} title={it.message}>
            <Zap size={13} /> <span className="ellipsis">{tr(it.label)}</span>
          </button>
        ))}
        <button type="button" className="chip dashed" onClick={() => openModal('ext', 'quickReplies')}>
          <Plus size={13} /> {tr('Добавить')}
        </button>
      </div>
    </Panel>
  );
}

export async function runQuickReply(message: string, autoSend: boolean) {
  if (!autoSend) {
    setState((s) => ({ draft: s.draft ? s.draft + ' ' + message : message }));
    return;
  }
  if (message.trim().startsWith('/')) await runSlash(message);
  else await sendMessage(message);
}

// ───────────── Центр ─────────────

function ChatView({ chat, onDrawer }: { chat: Chat; onDrawer: (d: 'left' | 'right') => void }) {
  const owner = useStore((s) => (chat.ownerType === 'group' ? s.groups[chat.ownerId] : s.characters[chat.ownerId]));
  const selecting = useStore((s) => s.selecting);
  const name = owner?.name ?? tr('Неизвестно');
  const char = chat.ownerType === 'char' ? useStore.getState().characters[chat.ownerId] : undefined;
  const cover = useStore((s) => {
    const c = chat.ownerType === 'char' ? s.characters[chat.ownerId] : undefined;
    if (c?.banner) return c.banner;
    const bgId = chat.background || s.ui.activeBg;
    return s.ui.backgrounds.find((b) => b.id === bgId)?.url;
  });
  // Эмоции: спрайт под настроение последней реплики
  const sprite = useStore((s) => {
    if (!s.ext.enabled.expressions || chat.ownerType !== 'char') return undefined;
    const last = [...chat.messages].reverse().find((m) => !m.isUser && !m.isSystem);
    const set = s.ext.expressions.sprites[chat.ownerId];
    return set ? set[last?.expression ?? 'нейтрально'] ?? set['нейтрально'] : undefined;
  });
  const avatar = sprite ?? (owner && 'avatar' in owner ? owner.avatar : undefined);
  const msgCount = chat.messages.length;

  return (
    <>
      <div className="hero">
        {cover ? <img className="cover" src={cover} alt={tr('Обложка персонажа')} /> : null}
        <div className="shade" />
        <img className="window" src="./ornaments/window.png" alt="" aria-hidden="true" />
        <div className="hero-actions">
          <IconBtn size="xl" className="left-toggle" icon={<PanelLeft size={18} />} label={tr('Чаты и заметки')} onClick={() => onDrawer('left')} />
          <IconBtn size="xl" className="lib-toggle" icon={<LibraryIcon size={18} />} label={tr('Библиотека')} onClick={() => onDrawer('right')} />
          <IconBtn size="xl" className="d-only" icon={<ImageIcon size={18} />} label={tr('Сменить фон чата')} onClick={() => openModal('bgPicker')} />
          <IconBtn
            size="xl"
            className="d-only"
            icon={<Pencil size={18} />}
            label={tr('Открыть карточку персонажа')}
            onClick={() => (chat.ownerType === 'group' ? openModal('group', { id: chat.ownerId }) : (setState({ editingCharId: chat.ownerId }), setTab('characters')))}
          />
          <button type="button" className="menu-btn m-only" style={{ width: 48, height: 48 }} aria-label={tr('Меню разделов')} onClick={() => setState({ mobileMenu: true })}>
            <Menu size={20} />
          </button>
        </div>
      </div>
      <div className="hero-info">
        <div className="hero-avatar">
          <div className="ring" />
          <Avatar src={avatar} name={name} size={104} />
          <span className="spark" style={{ left: '50%', top: -16, marginLeft: -9 }}>
            <Star size={18} />
          </span>
          <span className="spark" style={{ left: '50%', bottom: -16, marginLeft: -9 }}>
            <Star size={18} />
          </span>
          <span className="spark" style={{ top: '50%', left: -16, marginTop: -9 }}>
            <Star size={18} />
          </span>
          <span className="spark" style={{ top: '50%', right: -16, marginTop: -9 }}>
            <Star size={18} />
          </span>
        </div>
        <div className="col grow" style={{ gap: 6, paddingBottom: 2 }}>
          <h1 className="hero-name">{name}</h1>
          <span className="sub">
            {tr('Чат «{0}» · {1} {2}', chat.name, msgCount, plural(msgCount, 'сообщение', 'сообщения', 'сообщений'))}
          </span>
        </div>
        <div className="hero-links d-only">
          <button
            type="button"
            className="btn framed"
            onClick={() => (chat.ownerType === 'group' ? openModal('group', { id: chat.ownerId }) : (setState({ editingCharId: chat.ownerId }), setTab('characters')))}
          >
            {tr('Карточка')}
          </button>
          <Star size={10} />
          <button
            type="button"
            className="btn framed"
            onClick={() => {
              if (char?.lorebookId) setState({ editingLorebookId: char.lorebookId });
              setTab('lorebook');
            }}
          >
            {tr('Лорбук')}
          </button>
          <Star size={10} />
          <button type="button" className="btn framed" onClick={() => openModal('gallery', chat.ownerId)}>
            {tr('Галерея')}
          </button>
        </div>
      </div>
      <div className="hero-links m-only">
        <button
          type="button"
          className="btn framed"
          onClick={() => (chat.ownerType === 'group' ? openModal('group', { id: chat.ownerId }) : (setState({ editingCharId: chat.ownerId }), setTab('characters')))}
        >
          {tr('Карточка')}
        </button>
        <Star size={10} />
        <button type="button" className="btn framed" onClick={() => setTab('lorebook')}>
          {tr('Лорбук')}
        </button>
        <Star size={10} />
        <button type="button" className="btn framed" onClick={() => openModal('chats')}>
          {tr('Чаты')}
        </button>
      </div>
      <Messages chat={chat} />
      {selecting ? <SelectBar chat={chat} /> : <Composer chat={chat} />}
    </>
  );
}

function Messages({ chat }: { chat: Chat }) {
  const ref = useRef<HTMLDivElement>(null);
  const style = useStore((s) => s.ui.messageStyle);
  const autoscroll = useStore((s) => s.ui.autoscroll);
  const streamLen = useStore((s) => (s.streaming?.chatId === chat.id ? s.streaming.text.length + s.streaming.reasoning.length : 0));
  const [limit, setLimit] = useState(60);
  const stick = useRef(true);

  useEffect(() => setLimit(60), [chat.id]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && autoscroll && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, streamLen, chat.id, autoscroll]);

  useLayoutEffect(() => {
    stick.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.id]);

  const msgs = chat.messages;
  const start = Math.max(0, msgs.length - limit);
  let lastCharIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--)
    if (!msgs[i].isSystem) {
      if (!msgs[i].isUser) lastCharIdx = i;
      break;
    }

  return (
    <div ref={ref} onScroll={onScroll} className={`messages scroll ${style} ${style === 'document' ? 'doc' : ''}`}>
      {start > 0 && (
        <button type="button" className="btn sm" style={{ alignSelf: 'center' }} onClick={() => setLimit((l) => l + 60)}>
          {tr('Показать ранние сообщения ({0})', start)}
        </button>
      )}
      {msgs.slice(start).map((m, k) => {
        const i = start + k;
        const prev = msgs[i - 1];
        const newDay = !prev || new Date(prev.date).toDateString() !== new Date(m.date).toDateString();
        return (
          <Fragment key={m.id}>
            {newDay && (
              <div className="day-sep" aria-hidden="true">
                <div className="ln" />
                <Star size={10} />
                <span>{fmtDayTitle(m.date)}</span>
                <Star size={10} />
                <div className="ln r" />
              </div>
            )}
            <MessageItem chatId={chat.id} m={m} index={i} isLast={i === msgs.length - 1} isLastChar={i === lastCharIdx} />
          </Fragment>
        );
      })}
      {!msgs.length && (
        <div className="empty">
          <div className="h3">{tr('Начало истории')}</div>
          {tr('У персонажа нет приветствия — напишите первое сообщение.')}
        </div>
      )}
    </div>
  );
}

function SelectBar({ chat }: { chat: Chat }) {
  const sel = useStore((s) => s.selecting) ?? [];
  return (
    <div className="select-bar">
      <Trash2 size={16} />
      <span className="grow">{tr('Выбрано: {0}. Нажимайте на сообщения, чтобы отметить.', sel.length)}</span>
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          const idx = chat.messages.findIndex((m) => sel.includes(m.id));
          if (idx >= 0) setState({ selecting: chat.messages.slice(idx).map((m) => m.id) });
        }}
      >
        {tr('До конца')}
      </button>
      <button type="button" className="btn sm" onClick={() => setState({ selecting: null })}>
        {tr('Отмена')}
      </button>
      <button
        type="button"
        className="btn sm danger"
        disabled={!sel.length}
        onClick={() => {
          updateChat(chat.id, (c) => void (c.messages = c.messages.filter((m) => !sel.includes(m.id))));
          setState({ selecting: null });
        }}
      >
        {tr('Удалить')}
      </button>
    </div>
  );
}

// ───────────── Поле ввода ─────────────

function Composer({ chat }: { chat: Chat }) {
  const draft = useStore((s) => s.draft);
  const gen = useStore((s) => s.gen);
  const enterSends = useStore((s) => s.ui.enterSends);
  const menuOpen = useStore((s) => s.chatMenu);
  const [wand, setWand] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [listening, setListening] = useState<(() => void) | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const busy = Boolean(gen);

  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, window.innerHeight * 0.4) + 'px';
  }, [draft]);

  const submit = async () => {
    if (busy) return;
    const text = draft;
    if (text.trim().startsWith('/')) {
      setState({ draft: '' });
      await runSlash(text);
      return;
    }
    if (!text.trim() && !images.length) {
      // пустая отправка — персонаж продолжает сцену
      await runGeneration('normal');
      return;
    }
    setState({ draft: '' });
    const imgs = images;
    setImages([]);
    await sendMessage(text || tr('[изображение]'), { images: imgs.length ? imgs : undefined });
  };

  const editLastUser = () => {
    const last = [...chat.messages].reverse().find((m) => m.isUser);
    if (last) setState({ editingMessageId: last.id });
  };

  const attach = async () => {
    const files = await pickFiles('image/*', true);
    const urls = await Promise.all(files.map(async (f) => shrinkImage(await readDataUrl(f), 1024)));
    setImages((x) => [...x, ...urls]);
  };

  const mic = () => {
    if (listening) {
      listening();
      setListening(null);
      return;
    }
    const base = getState().draft;
    const stop = startRecognition(
      (text, final) => {
        setState({ draft: (base ? base + ' ' : '') + text });
        if (final && getState().ext.stt.autoSend) setTimeout(() => void submit(), 100);
      },
      () => setListening(null),
    );
    if (stop) setListening(() => stop);
  };

  return (
    <div className="composer">
      <img className="rose" src="./ornaments/rose.png" alt="" aria-hidden="true" />
      <div className="composer-box">
        <div style={{ position: 'relative' }}>
          <IconBtn bare size="lg" icon={<WandSparkles size={18} />} label={tr('Меню расширений')} onClick={() => setWand(!wand)} />
          {wand && <WandMenu chat={chat} onClose={() => setWand(false)} onAttach={attach} onMic={mic} listening={Boolean(listening)} />}
        </div>
        {images.length > 0 && (
          <div className="attach-preview">
            {images.map((src, i) => (
              <button key={i} type="button" title={tr('Убрать')} onClick={() => setImages((x) => x.filter((_, k) => k !== i))}>
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ta}
          rows={1}
          value={draft}
          placeholder={listening ? tr('Говорите…') : window.innerWidth < 760 ? tr('Сообщение…') : tr('Напишите сообщение…')}
          aria-label={tr('Сообщение')}
          onChange={(e) => setState({ draft: e.target.value })}
          onKeyDown={(e) => {
            const isMobile = window.matchMedia('(max-width: 760px)').matches;
            if (e.key === 'Enter' && !e.shiftKey && (enterSends ? !isMobile || e.ctrlKey : e.ctrlKey)) {
              e.preventDefault();
              void submit();
            } else if (e.key === 'ArrowUp' && !draft) {
              e.preventDefault();
              editLastUser();
            } else if (e.key === 'Escape' && busy) stopGeneration();
          }}
          onPaste={async (e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (!files.length) return;
            e.preventDefault();
            const urls = await Promise.all(files.map(async (f) => shrinkImage(await readDataUrl(f), 1024)));
            setImages((x) => [...x, ...urls]);
          }}
        />
        {listening && <IconBtn bare size="lg" icon={<Mic size={18} />} label={tr('Остановить запись')} active onClick={mic} />}
        <IconBtn bare size="lg" className="d-only" icon={<ArrowRightToLine size={18} />} label={tr('Продолжить последний ответ')} disabled={busy} onClick={() => void runGeneration('continue')} />
        {busy ? (
          <button type="button" className="send-btn" aria-label={tr('Остановить')} title={tr('Остановить генерацию (Esc)')} onClick={stopGeneration}>
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button type="button" className="send-btn" aria-label={tr('Отправить')} title={tr('Отправить')} onClick={() => void submit()}>
            <Send size={18} />
          </button>
        )}
      </div>
      <button
        type="button"
        className="menu-btn"
        aria-label={tr('Меню чата')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setState({ chatMenu: !menuOpen })}
      >
        <MoreHorizontal size={22} />
      </button>
      {menuOpen && <ChatMenu chat={chat} />}
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="mi-ico">{icon}</span>
      {children}
    </button>
  );
}

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.menu-btn, .icon-btn'))
        onClose();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [onClose]);
  return ref;
}

function ChatMenu({ chat }: { chat: Chat }) {
  const close = () => setState({ chatMenu: false });
  const ref = useOutsideClose(close);
  const items = (
    <>
      <MenuItem icon={<Plus size={17} />} onClick={() => (close(), startNewChat(chat.ownerType, chat.ownerId))}>
        {tr('Начать новый чат')}
      </MenuItem>
      <MenuItem icon={<Folder size={17} />} onClick={() => openModal('chats')}>
        {tr('Управление файлами чата')}
      </MenuItem>
      <MenuItem icon={<FileText size={17} />} onClick={() => openModal('authorNote')}>
        {tr('Заметка автора')}
      </MenuItem>
      <MenuItem icon={<RefreshCw size={17} />} onClick={() => (close(), void runGeneration('regenerate'))}>
        {tr('Перегенерировать')}
      </MenuItem>
      <MenuItem icon={<ArrowRightToLine size={17} />} onClick={() => (close(), void runGeneration('continue'))}>
        {tr('Продолжить ответ')}
      </MenuItem>
      <MenuItem icon={<VenetianMask size={17} />} onClick={() => (close(), void runGeneration('impersonate'))}>
        {tr('Ответить за меня')}
      </MenuItem>
      <MenuItem icon={<Trash2 size={17} />} onClick={() => setState({ selecting: [], chatMenu: false })}>
        {tr('Удалить сообщения')}
      </MenuItem>
      {chat.ownerType === 'char' && (
        <MenuItem icon={<Users size={17} />} onClick={() => (close(), convertToGroup(chat))}>
          {tr('Превратить в групповой')}
        </MenuItem>
      )}
      <div className="menu-sep" />
      <MenuItem icon={<ScrollText size={17} />} onClick={() => openModal('prompt')}>
        {tr('Просмотр промпта')}
      </MenuItem>
      <MenuItem icon={<Download size={17} />} onClick={() => (close(), exportChat(chat.id))}>
        {tr('Экспорт чата')}
      </MenuItem>
      <MenuItem icon={<X size={17} />} onClick={closeChat}>
        {tr('Закрыть чат')}
      </MenuItem>
    </>
  );
  return (
    <>
      <div ref={ref} role="menu" aria-label={tr('Меню чата')} className="popmenu scroll">
        <div className="panel-star" style={{ position: 'absolute', top: -8, left: '50%', marginLeft: -8 }}>
          <Star />
        </div>
        {items}
      </div>
      <div className="m-only">
        <div className="drawer-backdrop" onClick={close} />
        <Panel
          className="sheet scroll"
          title={tr('Меню чата')}
          actions={<IconBtn icon={<X size={16} />} label={tr('Закрыть')} onClick={close} />}
        >
          <div className="col" style={{ gap: 0 }}>
            {items}
          </div>
        </Panel>
      </div>
    </>
  );
}

function convertToGroup(chat: Chat) {
  const s = getState();
  const ch = s.characters[chat.ownerId];
  if (!ch) return;
  const now = Date.now();
  const g = {
    id: uid(),
    name: tr('{0} и компания', ch.name),
    members: [ch.id],
    disabledMembers: [],
    activation: 'natural' as const,
    generationMode: 'swap' as const,
    allowSelfResponses: false,
    autoMode: false,
    fav: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  upsertGroup(g);
  const copy: Chat = { ...structuredClone(chat), id: uid(), ownerType: 'group', ownerId: g.id, name: chat.name, createdAt: now, updatedAt: now };
  copy.messages = copy.messages.map((m) => (m.isUser || m.isSystem ? m : { ...m, charId: m.charId ?? ch.id }));
  setState((st) => ({ chats: { ...st.chats, [copy.id]: copy } }));
  openChat(copy.id);
  openModal('group', { id: g.id });
  toast(tr('Чат превращён в групповой — добавьте участников'), 'success');
}

function WandMenu({
  chat,
  onClose,
  onAttach,
  onMic,
  listening,
}: {
  chat: Chat;
  onClose: () => void;
  onAttach: () => void;
  onMic: () => void;
  listening: boolean;
}) {
  const ext = useStore((s) => s.ext.enabled);
  const ref = useOutsideClose(onClose);
  const lastChar = [...chat.messages].reverse().find((m) => !m.isUser);
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <div ref={ref} role="menu" className="popmenu left" style={{ bottom: 58, width: 280 }}>
      <div className="menu-title">{tr('Быстрые действия')}</div>
      <MenuItem icon={<Paperclip size={17} />} onClick={go(onAttach)}>
        {tr('Прикрепить изображение')}
      </MenuItem>
      {ext.summarize && (
        <MenuItem icon={<Brain size={17} />} onClick={go(() => void summarizeChat())}>
          {tr('Обновить пересказ')}
        </MenuItem>
      )}
      {ext.stt && (
        <MenuItem icon={<Mic size={17} />} onClick={go(onMic)}>
          {listening ? tr('Остановить запись') : tr('Надиктовать сообщение')}
        </MenuItem>
      )}
      {ext.tts && lastChar && (
        <MenuItem icon={<Volume2 size={17} />} onClick={go(() => speak(lastChar.text))}>
          {tr('Озвучить последний ответ')}
        </MenuItem>
      )}
      {ext.imageGen && (
        <MenuItem icon={<ImagePlus size={17} />} onClick={go(() => void generateImage(chat.id, 'scene'))}>
          {tr('Нарисовать сцену')}
        </MenuItem>
      )}
      {ext.translate && (
        <MenuItem icon={<Languages size={17} />} onClick={go(() => openModal('ext', 'translate'))}>
          {tr('Перевод')}
        </MenuItem>
      )}
      <MenuItem icon={<MessageCircle size={17} />} onClick={go(() => void runSlash('/sys ' + (getState().draft || '…')).then(() => setState({ draft: '' })))}>
        {tr('Отправить как рассказчик')}
      </MenuItem>
      <MenuItem icon={<IdCard size={17} />} onClick={go(() => openModal('prompt'))}>
        {tr('Что видит модель')}
      </MenuItem>
      <MenuItem icon={<BookMarked size={17} />} onClick={go(() => openModal('help'))}>
        {tr('Команды и макросы')}
      </MenuItem>
    </div>
  );
}
