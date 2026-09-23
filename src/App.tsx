import { setLang, tr } from './lib/i18n';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { activeChat, setState, toast, useStore } from './store';
import { Footer, Header, MobileMenu, MobileTopBar, Ornaments } from './components/Shell';
import { Modals } from './components/Modals';
import { CropperHost } from './components/Cropper';
import { ChatPage } from './pages/Chat';
import { ApiPage } from './pages/Api';
import { GenerationPage } from './pages/Generation';
import { FormatPage } from './pages/Format';
import { LorebookPage } from './pages/Lorebook';
import { PersonaPage } from './pages/Persona';
import { InterfacePage } from './pages/Interface';
import { ExtensionsPage } from './pages/Extensions';
import { CharactersPage } from './pages/Characters';
import { seedIfNeeded } from './lib/seed';
import { connect } from './lib/connection';
import { importFiles } from './lib/importer';

function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return '255, 255, 255';
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

function useTheme() {
  const ui = useStore((s) => s.ui);
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty('--text', ui.colors.text);
    r.setProperty('--strong', ui.colors.text);
    r.setProperty('--em', ui.colors.italics);
    r.setProperty('--q', ui.colors.quotes);
    r.setProperty('--panel-rgb', hexToRgb(ui.colors.panel));
    r.setProperty('--border-rgb', hexToRgb(ui.colors.border));
    r.setProperty('--glow-rgb', hexToRgb(ui.colors.glow));
    r.setProperty('--fs', String(ui.fontScale));
    r.setProperty('--orn', String(ui.ornaments / 100));
    r.setProperty('--blur', `${ui.bgBlur}px`);
    r.setProperty('--chat-w', `${ui.chatWidth}vw`);
    document.documentElement.lang = ui.language;
  }, [ui]);
}

function useActiveBackground() {
  return useStore((s) => {
    const chat = activeChat(s);
    const id = (s.ui.perChatBg && chat?.background) || s.ui.activeBg;
    return s.ui.backgrounds.find((b) => b.id === id);
  });
}

function Background() {
  const bg = useActiveBackground();
  const fit = useStore((s) => s.ui.bgFit);
  const dim = useStore((s) => s.ui.dimBg);
  // «Прозрачный» — остаётся звёздное небо самого приложения
  if (!bg || bg.color === 'transparent' || (!bg.url && !bg.color)) return null;
  if (bg.color) return <div className="app-bg solid" style={{ backgroundColor: bg.color }} />;
  return (
    <div
      className={`app-bg ${dim ? 'dim' : ''}`}
      style={{
        backgroundImage: `url("${bg.url}")`,
        backgroundSize: fit === 'stretch' ? '100% 100%' : fit,
      }}
    />
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="grow">{t.text}</span>
          <button type="button" aria-label={tr('Закрыть')} onClick={() => setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const tab = useStore((s) => s.tab);
  const mobileMenu = useStore((s) => s.mobileMenu);
  const twinkle = useStore((s) => s.ui.twinkle);
  const avatarStyle = useStore((s) => s.ui.avatarStyle);
  const avatarPosition = useStore((s) => s.ui.avatarPosition);
  const lang = useStore((s) => s.ui.language);
  const lightBg = useActiveBackground()?.color?.toLowerCase() === '#ffffff';
  // язык выставляется до отрисовки детей: tr() читает его напрямую
  setLang(lang);
  useTheme();

  useEffect(() => {
    if (!hydrated) return;
    seedIfNeeded();
    if (useStore.getState().api.autoConnect) void connect(true);
    // расширения, которые пользователь сам установил, — отдельным чанком, чтобы не тормозить запуск
    void import('./lib/userext/loader').then((m) => m.loadUserExtensions());
  }, [hydrated]);

  // Перетаскивание карточек, лорбуков и чатов в окно
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      void importFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  useEffect(() => {
    const onErr = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason);
      if (!/abort/i.test(msg)) toast(msg, 'error');
    };
    window.addEventListener('unhandledrejection', onErr);
    return () => window.removeEventListener('unhandledrejection', onErr);
  }, []);

  if (!hydrated) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span className="logo-text">Divinax</span>
      </div>
    );
  }

  return (
    // key={lang}: при смене языка дерево перерисовывается целиком
    <div key={lang} className={`app ${twinkle ? 'twinkle' : ''} av-${avatarStyle} avpos-${avatarPosition} ${lightBg ? 'bg-light' : ''}`}>
      <Background />
      <Ornaments />
      <Header />
      <main className="main">
        <MobileTopBar />
        {tab === 'chat' && <ChatPage />}
        {tab === 'api' && <ApiPage />}
        {tab === 'generation' && <GenerationPage />}
        {tab === 'format' && <FormatPage />}
        {tab === 'lorebook' && <LorebookPage />}
        {tab === 'persona' && <PersonaPage />}
        {tab === 'interface' && <InterfacePage />}
        {tab === 'extensions' && <ExtensionsPage />}
        {tab === 'characters' && <CharactersPage />}
      </main>
      <Footer />
      {mobileMenu && <MobileMenu />}
      <Modals />
      <CropperHost />
      <Toasts />
    </div>
  );
}
