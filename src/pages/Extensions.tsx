import type { ReactNode } from 'react';
import {
  AlignLeft,
  Captions,
  Database,
  Download,
  Globe,
  Image as ImageIcon,
  Languages,
  LayoutGrid,
  Mic,
  Regex,
  RefreshCw,
  Settings,
  Smile,
  Volume2,
  Zap,
} from 'lucide-react';
import { openModal, setState, useStore } from '../store';
import { Panel, Switch } from '../components/ui';

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
      <Panel star={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap', flex: 'none' }}>
        <div className="col grow" style={{ gap: 6, minWidth: 260 }}>
          <h2 className="h2">Расширения</h2>
          <span className="sub">Включайте модули и настраивайте их здесь. Сторонние расширения ставятся по ссылке на репозиторий.</span>
        </div>
        <input className="input" style={{ maxWidth: 340 }} placeholder="https://github.com/автор/расширение" />
        <button type="button" className="btn primary" onClick={() => openModal('info', 'Установка сторонних расширений появится в следующей версии Divinax — сейчас доступны встроенные модули.')}>
          <Download size={15} /> Установить
        </button>
        <button type="button" className="btn" onClick={() => openModal('info', 'Все встроенные расширения актуальны.')}>
          <RefreshCw size={15} /> Обновить все
        </button>
      </Panel>
      <div className="cards-grid">
        {EXTENSIONS.map((e) => (
          <div key={e.id} className="ext-card">
            <div className="row" style={{ gap: 12 }}>
              <span className="ico">{e.icon}</span>
              <span className="h3 grow">{e.name}</span>
              <Switch checked={Boolean(enabled[e.id])} onChange={(v) => toggle(e.id, v)} />
            </div>
            <p>{e.desc}</p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="sub" style={{ fontSize: 12 }}>
                {e.ready ? (enabled[e.id] ? 'включено' : 'выключено') : 'в разработке'}
              </span>
              <button type="button" className="btn sm" onClick={() => openModal('ext', e.id)}>
                <Settings size={15} /> Настроить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
