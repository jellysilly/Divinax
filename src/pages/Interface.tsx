import { tr } from '../lib/i18n';
import { Archive, Download, Save, Trash2, Upload } from 'lucide-react';
import { activeChat, setState, toast, updateChat, useStore } from '../store';
import type { ThemeColors, UiSettings } from '../types';
import { BgThumb, Field, IconBtn, Panel, Seg, Select, Slider, Star, Switch } from '../components/ui';
import { THEMES } from '../lib/defaults';
import { download, pickFiles, readDataUrl, shrinkImage, uid } from '../lib/util';
import { exportSettings, importSettings } from '../lib/backup';

const setUi = (p: Partial<UiSettings>) => setState((s) => ({ ui: { ...s.ui, ...p } }));

const COLOR_LABELS: [keyof ThemeColors, string][] = [
  ['text', 'Основной текст'],
  ['italics', 'Курсив'],
  ['quotes', 'Цитаты'],
  ['panel', 'Фон панелей'],
  ['border', 'Рамки'],
  ['glow', 'Свечение'],
];

export function InterfacePage() {
  const ui = useStore((s) => s.ui);
  const chat = useStore(activeChat);
  const themeOptions = [
    ...Object.entries(THEMES).map(([id, t]) => ({ value: id, label: tr(t.name) })),
    ...ui.customThemes.map((t) => ({ value: 'custom:' + t.name, label: t.name + tr(' (своя)') })),
  ];
  const currentBg = (ui.perChatBg && chat?.background) || ui.activeBg;

  const pickTheme = (id: string) => {
    if (id.startsWith('custom:')) {
      const t = ui.customThemes.find((x) => 'custom:' + x.name === id);
      if (t) setUi({ theme: id, colors: t.colors });
    } else setUi({ theme: id, colors: THEMES[id].colors });
  };

  const setBg = (id: string) => {
    if (ui.perChatBg && chat) updateChat(chat.id, (c) => void (c.background = id));
    else setUi({ activeBg: id });
  };

  return (
    <div className="cols wrap-md">
      <Panel className="fill" style={{ flex: '1 1 0' }} title={tr('Тема оформления')}>
        <div className="body scroll grow" style={{ paddingRight: 4 }}>
          <Field label={tr('Тема')}>
            <Select value={ui.theme} onChange={pickTheme} options={themeOptions} />
          </Field>
          <Field label={tr('Цвета')}>
            <div className="color-grid">
              {COLOR_LABELS.map(([k, label]) => (
                <label key={k} className="color-btn">
                  <span className="dot" style={{ background: ui.colors[k] }} />
                  {tr(label)}
                  <input type="color" value={ui.colors[k]} onChange={(e) => setUi({ colors: { ...ui.colors, [k]: e.target.value } })} aria-label={tr(label)} />
                </label>
              ))}
            </div>
          </Field>
          <Slider label={tr('Размер шрифта')} value={ui.fontScale} min={0.8} max={1.4} step={0.01} onChange={(v) => setUi({ fontScale: v })} />
          <Slider label={tr('Ширина чата')} value={ui.chatWidth} min={30} max={100} suffix="%" onChange={(v) => setUi({ chatWidth: Math.round(v) })} hint={tr('Для стиля «Документ»')} />
          <Slider label={tr('Размытие фона, px')} value={ui.bgBlur} min={0} max={30} onChange={(v) => setUi({ bgBlur: Math.round(v) })} />
          <Slider label={tr('Интенсивность орнаментов')} value={ui.ornaments} min={0} max={100} suffix="%" onChange={(v) => setUi({ ornaments: Math.round(v) })} />
        </div>
        <div className="row">
          <button
            type="button"
            className="btn primary grow"
            onClick={() => {
              const name = prompt(tr('Название темы'), tr('Моя тема'));
              if (!name) return;
              setUi({ customThemes: [...ui.customThemes.filter((t) => t.name !== name), { name, colors: ui.colors }], theme: 'custom:' + name });
              toast(tr('Тема сохранена'), 'success');
            }}
          >
            <Save size={15} /> {tr('Сохранить тему')}
          </button>
          <IconBtn
            size="lg"
            icon={<Upload size={16} />}
            label={tr('Импорт темы')}
            onClick={async () => {
              const [f] = await pickFiles('.json');
              if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                if (!j.colors) throw new Error(tr('нет цветов'));
                const name = j.name ?? f.name.replace(/\.json$/i, '');
                setUi({ customThemes: [...ui.customThemes.filter((t) => t.name !== name), { name, colors: { ...ui.colors, ...j.colors } }], theme: 'custom:' + name, colors: { ...ui.colors, ...j.colors } });
              } catch (e) {
                toast(tr('Ошибка: ') + (e as Error).message, 'error');
              }
            }}
          />
          <IconBtn size="lg" icon={<Download size={16} />} label={tr('Экспорт темы')} onClick={() => download('divinax-theme.json', JSON.stringify({ name: ui.theme.replace('custom:', ''), colors: ui.colors, fontScale: ui.fontScale }, null, 2))} />
        </div>
      </Panel>

      <Panel className="fill" style={{ flex: '1 1 0' }} title={tr('Чат')}>
        <div className="body scroll grow" style={{ paddingRight: 4 }}>
          <Field label={tr('Стиль сообщений')}>
            <Seg
              value={ui.messageStyle}
              onChange={(v) => setUi({ messageStyle: v })}
              options={[
                { value: 'flat', label: tr('Плоский') },
                { value: 'bubbles', label: tr('Пузыри') },
                { value: 'document', label: tr('Документ') },
              ]}
            />
          </Field>
          <Field label={tr('Положение аватара')}>
            <Seg
              value={ui.avatarPosition}
              onChange={(v) => setUi({ avatarPosition: v })}
              options={[
                { value: 'top', label: tr('Сверху') },
                { value: 'side', label: tr('Сбоку') },
                { value: 'none', label: tr('Без аватара') },
              ]}
            />
          </Field>
          <Field label={tr('Аватары')}>
            <Seg
              value={ui.avatarStyle}
              onChange={(v) => setUi({ avatarStyle: v })}
              options={[
                { value: 'round', label: tr('Круглые') },
                { value: 'square', label: tr('Квадратные') },
                { value: 'portrait', label: tr('Портрет') },
              ]}
            />
          </Field>
          <div className="col" style={{ gap: 10 }}>
            <Switch label={tr('Время отправки')} checked={ui.showTimestamps} onChange={(v) => setUi({ showTimestamps: v })} />
            <Switch label={tr('Номер сообщения')} checked={ui.showNumbers} onChange={(v) => setUi({ showNumbers: v })} />
            <Switch label={tr('Счётчик токенов')} checked={ui.showTokens} onChange={(v) => setUi({ showTokens: v })} />
            <Switch label={tr('Время генерации')} checked={ui.showGenTime} onChange={(v) => setUi({ showGenTime: v })} />
            <Switch label={tr('Стрелки свайпов')} checked={ui.swipeArrows} onChange={(v) => setUi({ swipeArrows: v })} />
            <Switch label={tr('Автопрокрутка чата')} checked={ui.autoscroll} onChange={(v) => setUi({ autoscroll: v })} />
            <Switch label={tr('Enter отправляет сообщение')} checked={ui.enterSends} onChange={(v) => setUi({ enterSends: v })} />
            <Switch label={tr('Подтверждать удаление')} checked={ui.confirmDelete} onChange={(v) => setUi({ confirmDelete: v })} />
            <Switch label={tr('Мерцание звёзд и свечей')} checked={ui.twinkle} onChange={(v) => setUi({ twinkle: v })} />
            <Switch label={tr('HTML и CSS в сообщениях')} hint={tr('плашки, статусы, таблицы из ответов и регексов')} checked={ui.renderHtml} onChange={(v) => setUi({ renderHtml: v })} />
            <Switch
              label={tr('JavaScript в сообщениях')}
              hint={tr('скрипты работают в песочнице без доступа к ключам и данным')}
              checked={ui.runScripts}
              disabled={!ui.renderHtml}
              onChange={(v) => setUi({ runScripts: v })}
            />
          </div>
          <Field label={tr('Язык интерфейса')}>
            <Switch
              label={tr('Английский интерфейс')}
              hint={tr('Выключите, чтобы переключиться на русский')}
              checked={ui.language === 'en'}
              onChange={(v) => setUi({ language: v ? 'en' : 'ru' })}
            />
          </Field>
          <div className="hint" style={{ marginTop: 'auto', paddingTop: 8 }}>
            Divinax {__DX_VERSION__}
          </div>
        </div>
      </Panel>

      <Panel className="fill" style={{ flex: '1 1 0' }} title={tr('Фоны')}>
        <div className="body scroll grow" style={{ paddingRight: 4 }}>
          <div className="bg-grid">
            {ui.backgrounds.map((b) => (
              <div key={b.id} className={`bg-tile ${currentBg === b.id ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => setBg(b.id)}>
                <BgThumb bg={b} />
                <span>
                  {currentBg === b.id && <Star size={10} />} {b.builtin ? tr(b.name) : b.name}
                </span>
                {!b.builtin && (
                  <IconBtn
                    size="sm"
                    className="del danger xl"
                    icon={<Trash2 size={14} />}
                    label={tr('Удалить фон')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUi({ backgrounds: ui.backgrounds.filter((x) => x.id !== b.id), activeBg: ui.activeBg === b.id ? 'bg-transparent' : ui.activeBg });
                    }}
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              className="bg-tile upload"
              onClick={async () => {
                const files = await pickFiles('image/*', true);
                const added = await Promise.all(
                  files.map(async (f) => ({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), url: await shrinkImage(await readDataUrl(f), 1920, 0.85) })),
                );
                if (added.length) {
                  setUi({ backgrounds: [...ui.backgrounds, ...added] });
                  setBg(added[0].id);
                }
              }}
            >
              <Upload size={18} />
              {tr('Загрузить фон')}
            </button>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <Switch label={tr('Свой фон для каждого чата')} checked={ui.perChatBg} onChange={(v) => setUi({ perChatBg: v })} />
            <Switch label={tr('Затемнять фон под сообщениями')} checked={ui.dimBg} onChange={(v) => setUi({ dimBg: v })} />
          </div>
          <Field label={tr('Подгонка изображения')}>
            <Seg
              value={ui.bgFit}
              onChange={(v) => setUi({ bgFit: v })}
              options={[
                { value: 'cover', label: tr('Заполнить') },
                { value: 'contain', label: tr('Вписать') },
                { value: 'stretch', label: tr('Растянуть') },
              ]}
            />
          </Field>
        </div>
        <div className="row wrap">
          <button
            type="button"
            className="btn grow"
            onClick={async () => {
              const [f] = await pickFiles('.json');
              if (!f) return;
              try {
                importSettings(JSON.parse(await f.text()));
              } catch (e) {
                toast(tr('Ошибка: ') + (e as Error).message, 'error');
              }
            }}
          >
            <Upload size={15} /> {tr('Импорт настроек')}
          </button>
          <button type="button" className="btn" onClick={() => exportSettings(false)}>
            <Download size={15} /> {tr('Экспорт')}
          </button>
          <IconBtn size="lg" icon={<Archive size={16} />} label={tr('Полная резервная копия (персонажи, чаты, лорбуки)')} onClick={() => exportSettings(true)} />
        </div>
      </Panel>
    </div>
  );
}
