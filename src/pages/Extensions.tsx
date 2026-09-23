import { tr } from '../lib/i18n';
import type { ReactNode } from 'react';
import {
  AlignLeft,
  Captions,
  Database,
  Globe,
  Image as ImageIcon,
  Languages,
  LayoutGrid,
  Mic,
  Regex,
  Settings,
  Smile,
  Volume2,
  Zap,
} from 'lucide-react';
import { openModal, setState, useStore } from '../store';
import { Switch } from '../components/ui';
import { UserExtensionsPanel } from '../components/UserExtensions';

export interface ExtInfo {
  id: string;
  name: string;
  desc: string;
  icon: ReactNode;
  ready: boolean; // реализовано в этой версии
}

export const EXTENSIONS: ExtInfo[] = [
  { id: 'summarize', name: 'Суммаризация', desc: 'Пересказывает старые сообщения, чтобы сюжет не выпадал из памяти.', icon: <AlignLeft size={18} />, ready: true },
  { id: 'vectors', name: 'Векторное хранилище', desc: 'Ищет по смыслу в истории чата и загруженных файлах.', icon: <Database size={18} />, ready: false },
  { id: 'imageGen', name: 'Генерация изображений', desc: 'Рисует сцену или портрет по команде из меню палочки.', icon: <ImageIcon size={18} />, ready: true },
  { id: 'tts', name: 'Озвучка', desc: 'Читает ответы персонажа выбранным голосом.', icon: <Volume2 size={18} />, ready: true },
  { id: 'stt', name: 'Распознавание речи', desc: 'Надиктовывайте сообщения голосом.', icon: <Mic size={18} />, ready: true },
  { id: 'translate', name: 'Перевод чата', desc: 'Переводит сообщения на лету в обе стороны.', icon: <Languages size={18} />, ready: true },
  { id: 'expressions', name: 'Эмоции персонажа', desc: 'Меняет спрайт персонажа под настроение реплики.', icon: <Smile size={18} />, ready: true },
  { id: 'regex', name: 'Регулярные выражения', desc: 'Правила поиска и замены для ввода, ответа и промпта.', icon: <Regex size={18} />, ready: true },
  { id: 'quickReplies', name: 'Быстрые ответы', desc: 'Кнопки-макросы над полем ввода и скрипты STscript.', icon: <Zap size={18} />, ready: true },
  { id: 'webSearch', name: 'Веб-поиск', desc: 'Добавляет найденное в интернете в контекст ответа.', icon: <Globe size={18} />, ready: false },
  { id: 'captions', name: 'Подписи к картинкам', desc: 'Описывает прикреплённые изображения для модели.', icon: <Captions size={18} />, ready: true },
  { id: 'gallery', name: 'Галерея', desc: 'Все изображения персонажа в одном месте.', icon: <LayoutGrid size={18} />, ready: true },
];

export function ExtensionsPage() {
  const enabled = useStore((s) => s.ext.enabled);
  const toggle = (id: string, v: boolean) => setState((s) => ({ ext: { ...s.ext, enabled: { ...s.ext.enabled, [id]: v } } }));
  return (
    <div className="col scroll" style={{ flex: 1, minHeight: 0, gap: 16, paddingTop: 2 }}>
      <UserExtensionsPanel />
      <h3 className="h3" style={{ flex: 'none' }}>
        {tr('Встроенные модули')}
      </h3>
      <div className="cards-grid">
        {EXTENSIONS.map((e) => (
          <div key={e.id} className="ext-card">
            <div className="row" style={{ gap: 12 }}>
              <span className="ico">{e.icon}</span>
              <span className="h3 grow">{tr(e.name)}</span>
              <Switch checked={Boolean(enabled[e.id])} onChange={(v) => toggle(e.id, v)} />
            </div>
            <p>{tr(e.desc)}</p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="sub" style={{ fontSize: 12 }}>
                {e.ready ? (enabled[e.id] ? tr('включено') : tr('выключено')) : tr('в разработке')}
              </span>
              <button type="button" className="btn sm" onClick={() => openModal('ext', e.id)}>
                <Settings size={15} /> {tr('Настроить')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
