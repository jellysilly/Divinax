// Сторонние расширения: установка по ссылке, список, окно настроек и место в меню палочки.
import { useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Puzzle, RefreshCw, RotateCw, Settings, Trash2 } from 'lucide-react';
import { tr } from '../lib/i18n';
import { closeModal, openModal, toast, useStore } from '../store';
import type { UserExtension } from '../types';
import { IconBtn, Modal, Panel, Switch } from './ui';

const loader = () => import('../lib/userext/loader');

/** Переносит DOM-контейнеры расширений (живут вне React) внутрь себя, пока смонтирован и виден. */
export function DomSlot({ ids, className, onEmpty }: { ids: string[]; className?: string; onEmpty?: (empty: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    // меню рисуется дважды (десктоп и нижний лист) — забираем контейнеры только в видимую копию
    if (!host || !host.getClientRects().length) return;
    const els = ids.map((id) => document.getElementById(id)).filter((x): x is HTMLElement => Boolean(x));
    els.forEach((el) => host.appendChild(el));
    onEmpty?.(els.every((el) => !el.children.length));
    return () => {
      // возвращаем в скрытый контейнер синхронно — иначе можно утащить их из только что открытого окна
      const holder = document.getElementById('dx-ext-holder');
      els.forEach((el) => holder && host.contains(el) && holder.appendChild(el));
    };
  }, [ids, onEmpty]);
  return <div ref={ref} className={className} />;
}

const SETTINGS_IDS = ['extensions_settings', 'extensions_settings2'];
const MENU_IDS = ['extensionsMenu'];

export function WandExtensionsSlot() {
  const has = useStore((s) => s.userExts.some((x) => x.enabled));
  if (!has) return null;
  return <DomSlot ids={MENU_IDS} className="dx-ext-menu" />;
}

export function UserExtSettingsModal() {
  const [empty, setEmpty] = useState(false);
  return (
    <Modal title={tr('Настройки сторонних расширений')} onClose={closeModal} wide>
      <DomSlot ids={SETTINGS_IDS} className="dx-ext-settings" onEmpty={setEmpty} />
      {empty && <div className="empty">{tr('Установленные расширения не добавили своих настроек.')}</div>}
    </Modal>
  );
}

function statusText(ext: UserExtension, st?: { state: string; error?: string }) {
  if (st?.state === 'reload') return { text: tr('изменения вступят в силу после перезагрузки страницы'), cls: 'warn' };
  if (!ext.enabled) return { text: tr('выключено'), cls: '' };
  if (st?.state === 'loading') return { text: tr('загружается…'), cls: '' };
  if (st?.state === 'error') return { text: tr('ошибка: {0}', st.error ?? ''), cls: 'err' };
  if (st?.state === 'ok') return { text: tr('работает'), cls: 'ok' };
  return { text: tr('не загружено'), cls: '' };
}

export function UserExtensionsPanel() {
  const exts = useStore((s) => s.userExts);
  const status = useStore((s) => s.extStatus);
  const [url, setUrl] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState('');
  const needReload = Object.values(status).some((x) => x.state === 'reload');

  const install = async () => {
    setBusy('install');
    try {
      const { installExtension } = await loader();
      const ext = await installExtension(url);
      setUrl('');
      setConfirming(false);
      const st = useStore.getState().extStatus[ext.id];
      if (st?.state === 'error') toast(tr('«{0}» установлено, но не запустилось: {1}', ext.manifest.display_name || ext.folder, st.error ?? ''), 'error');
      else toast(tr('Расширение «{0}» установлено', ext.manifest.display_name || ext.folder), 'success');
    } catch (e) {
      toast(tr('Не удалось установить: ') + (e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const update = async (ids: string[]) => {
    setBusy(ids.length > 1 ? 'all' : ids[0]);
    let changed = 0;
    for (const id of ids) {
      try {
        if (await (await loader()).updateExtension(id)) changed++;
      } catch (e) {
        toast(`${exts.find((x) => x.id === id)?.folder}: ${(e as Error).message}`, 'error');
      }
    }
    setBusy('');
    toast(changed ? tr('Обновлено: {0}. Перезагрузите страницу, чтобы применить.', changed) : tr('Новых версий нет'), changed ? 'success' : 'info');
  };

  return (
    <>
      <Panel star={false} style={{ flex: 'none', gap: 12 }}>
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
          <div className="col grow" style={{ gap: 6, minWidth: 240 }}>
            <h2 className="h2">{tr('Расширения')}</h2>
            <span className="sub">{tr('Встроенные модули включаются ниже. Сторонние расширения ставятся по ссылке на репозиторий GitHub — подходят расширения SillyTavern.')}</span>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <input
            className="input grow"
            style={{ minWidth: 220 }}
            value={url}
            onChange={(e) => (setUrl(e.target.value), setConfirming(false))}
            onKeyDown={(e) => e.key === 'Enter' && url.trim() && setConfirming(true)}
            placeholder="https://github.com/author/extension"
            aria-label={tr('Ссылка на расширение')}
          />
          <button type="button" className="btn primary" disabled={!url.trim() || busy === 'install'} onClick={() => setConfirming(true)}>
            <Download size={15} /> {tr('Установить')}
          </button>
          <button type="button" className="btn" disabled={!exts.length || Boolean(busy)} onClick={() => void update(exts.map((x) => x.id))}>
            <RefreshCw size={15} /> {tr('Обновить все')}
          </button>
        </div>
        {confirming && (
          <div className="dx-warn">
            <AlertTriangle size={18} style={{ flex: 'none' }} />
            <div className="col grow" style={{ gap: 8 }}>
              <span>
                {tr('Расширение — это чужой код. Оно работает с полным доступом к Divinax: видит чаты, персонажей и ключи API и может отправлять их куда угодно. Устанавливайте только расширения, автору которых доверяете.')}
              </span>
              <div className="row wrap">
                <button type="button" className="btn primary sm" disabled={busy === 'install'} onClick={() => void install()}>
                  {busy === 'install' ? tr('Устанавливаю…') : tr('Понимаю, установить')}
                </button>
                <button type="button" className="btn sm" onClick={() => setConfirming(false)}>
                  {tr('Отмена')}
                </button>
              </div>
            </div>
          </div>
        )}
        <span className="hint" style={{ margin: 0 }}>
          {tr('Можно указать github.com/автор/репозиторий, ссылку на ветку или подпапку (…/tree/ветка/папка) или прямую ссылку на папку с manifest.json. Divinax повторяет основное API SillyTavern (getContext, события, slash-команды, настройки, всплывающие окна, вставки в промпт), но расширения, которые перестраивают интерфейс таверны, могут работать частично.')}
        </span>
      </Panel>

      {needReload && (
        <div className="dx-warn">
          <RotateCw size={18} style={{ flex: 'none' }} />
          <span className="grow">{tr('Часть изменений в расширениях вступит в силу после перезагрузки страницы.')}</span>
          <button type="button" className="btn sm primary" onClick={() => location.reload()}>
            {tr('Перезагрузить')}
          </button>
        </div>
      )}

      {exts.length > 0 && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', flex: 'none' }}>
            <h3 className="h3">{tr('Сторонние расширения')}</h3>
            <button type="button" className="btn sm" onClick={() => openModal('userExtSettings')}>
              <Settings size={15} /> {tr('Их настройки')}
            </button>
          </div>
          <div className="cards-grid">
            {exts.map((x) => {
              const st = statusText(x, status[x.id]);
              const link = x.github ? `https://github.com/${x.github.owner}/${x.github.repo}` : x.manifest.homePage || x.base;
              return (
                <div key={x.id} className="ext-card">
                  <div className="row" style={{ gap: 12 }}>
                    <span className="ico">
                      <Puzzle size={18} />
                    </span>
                    <span className="h3 grow ellipsis">{x.manifest.display_name || x.folder}</span>
                    <Switch checked={x.enabled} onChange={(v) => void loader().then((m) => m.setExtensionEnabled(x.id, v))} />
                  </div>
                  <p>
                    {[x.manifest.version && `v${x.manifest.version}`, x.manifest.author, x.github?.sha?.slice(0, 7)].filter(Boolean).join(' · ') || x.folder}
                  </p>
                  <span className={`sub dx-ext-status ${st.cls}`} style={{ fontSize: 12 }}>
                    {st.text}
                  </span>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <IconBtn size="sm" icon={<ExternalLink size={14} />} label={tr('Открыть страницу расширения')} onClick={() => window.open(link, '_blank', 'noopener')} />
                    <IconBtn size="sm" icon={<RefreshCw size={14} />} label={tr('Проверить обновления')} disabled={Boolean(busy)} onClick={() => void update([x.id])} />
                    <IconBtn
                      size="sm"
                      className="danger"
                      icon={<Trash2 size={14} />}
                      label={tr('Удалить')}
                      onClick={() => {
                        if (confirm(tr('Удалить расширение «{0}»?', x.manifest.display_name || x.folder))) void loader().then((m) => m.removeExtension(x.id));
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
