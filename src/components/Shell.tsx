import type { ReactNode } from 'react';
import {
  ALargeSmall,
  BookMarked,
  Box,
  ChevronRight,
  CircleHelp,
  MessageCircle,
  Plug,
  SlidersHorizontal,
  Sun,
  Users,
  VenetianMask,
  X,
} from 'lucide-react';
import { activePreset, currentPersona, openModal, setState, setTab, useStore } from '../store';
import type { TabId } from '../types';
import { fmtNum } from '../lib/util';
import { sourceName } from '../lib/api';
import { Avatar, Divider, Star } from './ui';

export const NAV: { id: TabId; label: string; sub: string; icon: ReactNode }[] = [
  { id: 'chat', label: 'Чат', sub: 'текущая сцена', icon: <MessageCircle size={18} strokeWidth={1.6} /> },
  { id: 'api', label: 'API', sub: 'подключение', icon: <Plug size={18} strokeWidth={1.6} /> },
  { id: 'generation', label: 'Генерация', sub: 'температура, промпты', icon: <SlidersHorizontal size={18} strokeWidth={1.6} /> },
  { id: 'format', label: 'Формат', sub: 'шаблоны, instruct', icon: <ALargeSmall size={18} strokeWidth={1.6} /> },
  { id: 'lorebook', label: 'Лорбук', sub: 'мир и факты', icon: <BookMarked size={18} strokeWidth={1.6} /> },
  { id: 'persona', label: 'Персона', sub: 'кто вы в истории', icon: <VenetianMask size={18} strokeWidth={1.6} /> },
  { id: 'interface', label: 'Интерфейс', sub: 'тема и фоны', icon: <Sun size={18} strokeWidth={1.6} /> },
  { id: 'extensions', label: 'Расширения', sub: 'модули', icon: <Box size={18} strokeWidth={1.6} /> },
  { id: 'characters', label: 'Персонажи', sub: 'библиотека', icon: <Users size={18} strokeWidth={1.6} /> },
];

const HINTS: Record<TabId, string> = {
  chat: 'Enter — отправить · Shift+Enter — перенос · ↑ — изменить последнее · /help — команды',
  api: 'Подсказка: сначала подключитесь, затем выберите пресет генерации',
  generation: 'Наведите на параметр, чтобы увидеть подсказку · Изменения сохраняются в пресет',
  format: 'Макросы: {{char}} · {{user}} · {{time}} — подставляются при отправке',
  lorebook: 'Запись попадает в промпт, когда ключ встречается в последних сообщениях',
  persona: 'Нажмите на персону, чтобы сделать её активной в текущем чате',
  interface: 'Изменения применяются сразу · Тему можно экспортировать и поделиться ей',
  extensions: 'Кнопка с волшебной палочкой в поле ввода открывает быстрые действия расширений',
  characters: 'Перетащите PNG-карточку в окно, чтобы импортировать персонажа',
};

export function Ornaments() {
  return (
    <>
      <div className="frame-line a" aria-hidden="true" />
      <div className="frame-line b" aria-hidden="true" />
      <img className="orn corner-l" src="./ornaments/corner.png" alt="" aria-hidden="true" />
      <img className="orn corner-r" src="./ornaments/corner.png" alt="" aria-hidden="true" />
      <img className="orn crest" src="./ornaments/crest.png" alt="" aria-hidden="true" />
      <img className="orn candle-l" src="./ornaments/candle-left.png" alt="" aria-hidden="true" />
      <img className="orn candle-r" src="./ornaments/candle-right.png" alt="" aria-hidden="true" />
      <img className="orn wings" src="./ornaments/wings.png" alt="" aria-hidden="true" />
    </>
  );
}

export function StatusPill({ compact }: { compact?: boolean }) {
  const conn = useStore((s) => s.conn);
  const api = useStore((s) => s.api);
  const last = useStore((s) => s.lastPrompt);
  const max = useStore((s) => activePreset(s).maxContext);
  const label = conn.status === 'ok' ? 'Подключено' : conn.status === 'connecting' ? 'Подключение…' : conn.status === 'error' ? 'Ошибка' : 'Не подключено';
  return (
    <button type="button" className="status-pill" onClick={() => setTab('api')} title={conn.message}>
      <span className={`status-dot ${conn.status}`} />
      <span style={{ minWidth: 0 }}>
        <b>{compact ? `${label} · ${sourceName(api)}` : label}</b>
        <small>
          {fmtNum(last?.tokens ?? 0)} / {fmtNum(max)} токенов{compact ? ' контекста' : ''}
        </small>
      </span>
    </button>
  );
}

export function Header() {
  const tab = useStore((s) => s.tab);
  return (
    <header className="header">
      <button type="button" className="logo" onClick={() => setTab('chat')} aria-label="Divinax — на главную">
        <Star size={20} />
        <span className="logo-text">Divinax</span>
      </button>
      <nav className="nav" aria-label="Разделы">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`nav-item ${tab === n.id ? 'active' : ''}`}
            aria-current={tab === n.id ? 'page' : undefined}
            onClick={() => setTab(n.id)}
            title={n.label}
          >
            <span className="nav-ico">{n.icon}</span>
            <span className="lbl">{n.label}</span>
          </button>
        ))}
      </nav>
      <StatusPill />
    </header>
  );
}

export function Footer() {
  const tab = useStore((s) => s.tab);
  return (
    <footer className="footer">
      <span className="footer-hint">{HINTS[tab]}</span>
      <button type="button" className="help-link" onClick={() => openModal('help')}>
        <CircleHelp size={15} strokeWidth={1.5} />
        <span>Справка и макросы</span>
      </button>
    </footer>
  );
}

export function MobileMenu() {
  const tab = useStore((s) => s.tab);
  const persona = useStore((s) => currentPersona(s));
  return (
    <div className="m-menu scroll">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="logo">
          <Star size={20} />
          <span className="logo-text">Divinax</span>
        </div>
        <button type="button" className="menu-btn" style={{ width: 48, height: 48 }} aria-label="Закрыть меню" onClick={() => setState({ mobileMenu: false })}>
          <X size={20} />
        </button>
      </div>
      <Divider title="Разделы" />
      <div className="m-menu-grid">
        {NAV.map((n) => (
          <button key={n.id} type="button" className={`m-tile ${tab === n.id ? 'on' : ''}`} onClick={() => setTab(n.id)}>
            <span className="nav-ico">{n.icon}</span>
            <b>{n.label}</b>
            <small>{n.sub}</small>
          </button>
        ))}
      </div>
      <StatusRow />
      <button type="button" className="m-row" onClick={() => setTab('persona')}>
        <Avatar src={persona?.avatar} name={persona?.name ?? '?'} size={38} />
        <span className="grow">
          <b style={{ display: 'block', fontSize: 14 }}>Вы играете за: {persona?.name ?? '—'}</b>
          <small className="muted">сменить персону</small>
        </span>
        <ChevronRight size={16} className="muted" />
      </button>
      <button type="button" className="m-row" onClick={() => openModal('help')}>
        <CircleHelp size={18} />
        <span className="grow">Справка и макросы</span>
        <ChevronRight size={16} className="muted" />
      </button>
    </div>
  );
}

function StatusRow() {
  const conn = useStore((s) => s.conn);
  const api = useStore((s) => s.api);
  const last = useStore((s) => s.lastPrompt);
  const max = useStore((s) => activePreset(s).maxContext);
  return (
    <button type="button" className="m-row" onClick={() => setTab('api')}>
      <span className={`status-dot ${conn.status}`} />
      <span className="grow">
        <b style={{ display: 'block', fontSize: 14 }}>
          {conn.status === 'ok' ? 'Подключено' : conn.status === 'error' ? 'Ошибка подключения' : 'Не подключено'} · {sourceName(api)}
        </b>
        <small className="muted">
          {fmtNum(last?.tokens ?? 0)} / {fmtNum(max)} токенов контекста
        </small>
      </span>
      <ChevronRight size={16} className="muted" />
    </button>
  );
}
