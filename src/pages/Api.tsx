import { useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, Layers, Plug, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { getState, setState, toast, useStore } from '../store';
import type { ApiSettings, ChatSource, ConnectionProfile, MainApi, TextSource } from '../types';
import { Divider, Field, IconBtn, LazyInput, Panel, Select, Seg, Star, Switch } from '../components/ui';
import { CHAT_SOURCES, MAIN_API_LABELS, NOVEL_MODELS, TEXT_SOURCES, currentModel, generate, modelKey, sourceName } from '../lib/api';
import { connect, disconnect, modelInfo } from '../lib/connection';
import { activePreset } from '../store';
import { uid } from '../lib/util';

const setApi = (p: Partial<ApiSettings>) => setState((s) => ({ api: { ...s.api, ...p } }));

export function ApiPage() {
  const api = useStore((s) => s.api);
  const conn = useStore((s) => s.conn);
  const [showKey, setShowKey] = useState(false);
  const key = api.main === 'chat' ? api.chatSource : api.main === 'text' ? 'text:' + api.textSource : api.main;
  const mKey = modelKey(api);
  const model = currentModel(api);
  const models = conn.models;
  const [keyDraft, setKeyDraft] = useState('');

  const saveKey = () => {
    setApi({ keys: { ...api.keys, [key]: keyDraft.trim() } });
    setKeyDraft('');
    toast('Ключ сохранён', 'success');
  };

  const test = async () => {
    const ctrl = new AbortController();
    try {
      toast('Отправляю тестовое сообщение…');
      const res = await generate(getState().api, {
        messages: [{ role: 'user', content: 'Ответь одним словом: привет' }],
        prompt: 'Ответь одним словом: привет\n',
        preset: { ...activePreset(getState()), maxTokens: 20 },
        stop: [],
        stream: false,
        signal: ctrl.signal,
        maxTokens: 20,
      });
      toast(`Ответ модели: ${res.text.trim().slice(0, 120) || '(пусто)'}`, 'success');
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message, 'error');
    }
  };

  const needsUrl = api.main === 'text' || api.main === 'kobold' || (api.main === 'chat' && api.chatSource === 'custom');
  const urlKey = api.main === 'text' ? api.textSource : api.main === 'kobold' ? 'kobold' : 'custom';
  const hasKeyField = api.main !== 'kobold';
  const srcInfo = CHAT_SOURCES.find((s) => s.id === api.chatSource);

  return (
    <div className="cols wrap-md">
      <Panel
        className="fill"
        style={{ flex: '1.6 1 0' }}
        title="Подключение к API"
        actions={<span className="sub d-only">Шаг 1 из 3 · затем «Генерация» и «Формат»</span>}
      >
        <div className="body scroll grow" style={{ paddingRight: 4 }}>
          <Seg
            large
            value={api.main}
            onChange={(v: MainApi) => {
              setApi({ main: v });
              disconnect();
            }}
            options={(Object.keys(MAIN_API_LABELS) as MainApi[]).map((k) => ({ value: k, label: MAIN_API_LABELS[k] }))}
          />
          <div className="grid2">
            <Field label="Источник">
              {api.main === 'chat' ? (
                <Select
                  value={api.chatSource}
                  onChange={(v: ChatSource) => {
                    setApi({ chatSource: v });
                    disconnect();
                  }}
                  options={CHAT_SOURCES.map((s) => ({ value: s.id, label: s.name }))}
                />
              ) : api.main === 'text' ? (
                <Select
                  value={api.textSource}
                  onChange={(v: TextSource) => {
                    setApi({ textSource: v });
                    disconnect();
                  }}
                  options={TEXT_SOURCES.map((s) => ({ value: s.id, label: s.name }))}
                />
              ) : (
                <input className="input" readOnly value={MAIN_API_LABELS[api.main]} />
              )}
            </Field>
            <Field label="Модель" hint={models.length ? `Доступно моделей: ${models.length}` : 'Список моделей подгружается после подключения'}>
              {api.main === 'horde' ? (
                <Select
                  value={api.hordeModels[0] ?? ''}
                  placeholder="Любая доступная"
                  onChange={(v) => setApi({ hordeModels: v ? [v] : [] })}
                  options={[{ value: '', label: 'Любая доступная' }, ...models.map((m) => ({ value: m, label: modelInfo.find((x) => x.id === m)?.name ?? m }))]}
                />
              ) : models.length || api.main === 'novel' ? (
                <Select
                  value={model}
                  placeholder={model || '[выберите модель]'}
                  onChange={(v) => setApi({ models: { ...api.models, [mKey]: v } })}
                  options={(api.main === 'novel' ? NOVEL_MODELS : models).map((m) => ({ value: m, label: m }))}
                />
              ) : (
                <LazyInput value={model} placeholder="[название модели]" onCommit={(v) => setApi({ models: { ...api.models, [mKey]: v.trim() } })} />
              )}
            </Field>
          </div>

          {needsUrl && (
            <Field label="Адрес сервера" hint={api.main === 'text' ? 'Например http://127.0.0.1:5001 — сервер должен разрешать CORS' : undefined}>
              <LazyInput value={api.urls[urlKey] ?? ''} placeholder="http://127.0.0.1:5000" onCommit={(v) => setApi({ urls: { ...api.urls, [urlKey]: v.trim() } })} />
            </Field>
          )}

          {hasKeyField && (
            <Field
              label={api.main === 'horde' ? 'API-ключ Horde (необязательно)' : 'API-ключ'}
              hint={
                <>
                  Ключи хранятся только в вашем браузере и не попадают в экспорт настроек
                  {srcInfo?.keyUrl && api.main === 'chat' && (
                    <>
                      {' · '}
                      <a href={srcInfo.keyUrl} target="_blank" rel="noreferrer">
                        получить ключ
                      </a>
                    </>
                  )}
                </>
              }
            >
              <div className="row">
                <input
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  value={keyDraft}
                  placeholder={api.keys[key] ? (showKey ? api.keys[key] : '••••••••••••••••••••••••') : 'Вставьте ключ'}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && keyDraft && saveKey()}
                />
                <IconBtn size="lg" icon={showKey ? <EyeOff size={17} /> : <Eye size={17} />} label={showKey ? 'Скрыть' : 'Показать'} onClick={() => setShowKey(!showKey)} />
                <button type="button" className="btn" disabled={!keyDraft} onClick={saveKey}>
                  <KeyRound size={15} /> Сохранить ключ
                </button>
                {api.keys[key] && (
                  <IconBtn size="lg" className="danger" icon={<Trash2 size={16} />} label="Удалить ключ" onClick={() => setApi({ keys: { ...api.keys, [key]: '' } })} />
                )}
              </div>
            </Field>
          )}

          {api.main === 'chat' && <ProxySection />}

          <Divider title="Параметры" />
          <div className="grid2">
            <Switch label="Автоподключение при запуске" checked={api.autoConnect} onChange={(v) => setApi({ autoConnect: v })} />
            <Switch label="Пропустить проверку статуса" checked={api.skipStatusCheck} onChange={(v) => setApi({ skipStatusCheck: v })} />
            {api.main === 'chat' && (
              <Switch label="Отправлять изображения модели" hint="для мультимодальных моделей" checked={api.sendImages} onChange={(v) => setApi({ sendImages: v })} />
            )}
            {api.main === 'chat' && api.chatSource === 'openrouter' && (
              <Switch label="Показывать платные модели" checked={api.showPaid} onChange={(v) => setApi({ showPaid: v })} />
            )}
            {api.main === 'horde' && <Switch label="Только доверенные воркеры" checked={api.hordeTrusted} onChange={(v) => setApi({ hordeTrusted: v })} />}
          </div>
        </div>
        <div className="row wrap" style={{ flex: 'none' }}>
          <button type="button" className="btn primary" onClick={() => void connect()} disabled={conn.status === 'connecting'}>
            <Plug size={16} /> Подключиться
          </button>
          <button type="button" className="btn" onClick={() => void test()}>
            <Send size={16} /> Проверить сообщением
          </button>
          <button type="button" className="btn" onClick={() => void connect(true)}>
            <RefreshCw size={16} /> Обновить модели
          </button>
          <span className="spacer" />
          <button type="button" className="btn danger" onClick={disconnect}>
            Отключиться
          </button>
        </div>
      </Panel>

      <div className="col" style={{ flex: '1 1 0', gap: 16, minWidth: 0, minHeight: 0 }}>
        <Panel title="Статус">
          <div className="row" style={{ gap: 14 }}>
            <span className={`status-dot ${conn.status}`} style={{ width: 12, height: 12 }} />
            <span className="h3" style={{ fontSize: 26 }}>
              {conn.status === 'ok' ? 'Подключено' : conn.status === 'connecting' ? 'Подключение…' : conn.status === 'error' ? 'Ошибка' : 'Не подключено'}
            </span>
          </div>
          {conn.status === 'error' && <div className="sub" style={{ color: 'var(--danger)' }}>{conn.message}</div>}
          <div className="col" style={{ gap: 0 }}>
            <StatusRow label="Источник" value={`${sourceName(api)} · ${MAIN_API_LABELS[api.main]}`} />
            <StatusRow label="Модель" value={model || (api.main === 'horde' ? 'любая' : '—')} />
            <StatusRow label="Ключ" value={hasKeyField ? (api.keys[key] ? 'сохранён' : 'нет') : 'не нужен'} />
          </div>
        </Panel>
        <ProfilesPanel />
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)', gap: 16 }}>
      <span className="sub" style={{ fontSize: 13 }}>
        {label}
      </span>
      <span className="ellipsis" style={{ fontSize: 13.5 }}>
        {value}
      </span>
    </div>
  );
}

function ProxySection() {
  const api = useStore((s) => s.api);
  const proxy = api.proxies.find((p) => p.id === api.proxyPresetId);
  const upd = (p: Partial<{ name: string; url: string; password: string }>) =>
    setApi({ proxies: api.proxies.map((x) => (x.id === api.proxyPresetId ? { ...x, ...p } : x)) });
  return (
    <>
      <Divider title="Обратный прокси" />
      <div className="grid3">
        <Field label="Пресет прокси">
          <Select
            value={api.proxyPresetId}
            onChange={(v) => {
              if (v === '__new') {
                const id = uid();
                setApi({ proxies: [...api.proxies, { id, name: `Прокси ${api.proxies.length + 1}`, url: '', password: '' }], proxyPresetId: id });
              } else setApi({ proxyPresetId: v });
            }}
            options={[
              { value: '', label: 'Не использовать' },
              ...api.proxies.map((p) => ({ value: p.id, label: p.name })),
              { value: '__new', label: '+ Новый пресет' },
            ]}
          />
        </Field>
        <Field label="Адрес прокси">
          <LazyInput value={proxy?.url ?? ''} placeholder="https://…" onCommit={(v) => proxy && upd({ url: v.trim() })} />
        </Field>
        <Field label="Пароль прокси">
          <LazyInput type="password" value={proxy?.password ?? ''} placeholder="необязательно" onCommit={(v) => proxy && upd({ password: v })} />
        </Field>
      </div>
      {proxy && (
        <div className="row">
          <LazyInput value={proxy.name} onCommit={(v) => upd({ name: v })} className="input sm" style={{ maxWidth: 240 }} />
          <button
            type="button"
            className="btn sm danger"
            onClick={() => setApi({ proxies: api.proxies.filter((p) => p.id !== proxy.id), proxyPresetId: '' })}
          >
            <Trash2 size={14} /> Удалить пресет
          </button>
        </div>
      )}
    </>
  );
}

function ProfilesPanel() {
  const profiles = useStore((s) => s.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  const presets = useStore((s) => s.presets);

  const snapshot = (name: string): ConnectionProfile => {
    const s = getState();
    return {
      id: uid(),
      name,
      main: s.api.main,
      chatSource: s.api.chatSource,
      textSource: s.api.textSource,
      model: currentModel(s.api),
      url: s.api.main === 'text' ? s.api.urls[s.api.textSource] : s.api.main === 'kobold' ? s.api.urls.kobold : s.api.chatSource === 'custom' ? s.api.urls.custom : undefined,
      presetId: s.activePresetId,
      instructId: s.format.instructId,
      contextId: s.format.contextId,
      sysPromptId: s.format.sysPromptId,
    };
  };

  const apply = (p: ConnectionProfile) => {
    setState((s) => {
      const api = { ...s.api, main: p.main, chatSource: p.chatSource, textSource: p.textSource };
      const mk = modelKey(api);
      const urls = { ...api.urls };
      if (p.url) {
        if (p.main === 'text') urls[p.textSource] = p.url;
        else if (p.main === 'kobold') urls.kobold = p.url;
        else if (p.chatSource === 'custom') urls.custom = p.url;
      }
      return {
        api: { ...api, urls, models: { ...api.models, [mk]: p.model } },
        activeProfileId: p.id,
        activePresetId: p.presetId && s.presets.some((x) => x.id === p.presetId) ? p.presetId : s.activePresetId,
        format: {
          ...s.format,
          instructId: p.instructId ?? s.format.instructId,
          contextId: p.contextId ?? s.format.contextId,
          sysPromptId: p.sysPromptId ?? s.format.sysPromptId,
        },
      };
    });
    void connect(true);
    toast(`Профиль «${p.name}» применён`, 'success');
  };

  const describe = (p: ConnectionProfile) => {
    const src = p.main === 'chat' ? CHAT_SOURCES.find((x) => x.id === p.chatSource)?.name : p.main === 'text' ? TEXT_SOURCES.find((x) => x.id === p.textSource)?.name : MAIN_API_LABELS[p.main];
    const preset = presets.find((x) => x.id === p.presetId)?.name;
    return [src, MAIN_API_LABELS[p.main], preset ? `пресет «${preset}»` : ''].filter(Boolean).join(' · ');
  };

  return (
    <Panel title="Профили подключений" className="grow">
      <div className="sub">Профиль запоминает API, модель и пресеты генерации и формата — переключайтесь одним нажатием.</div>
      <div className="col scroll grow" style={{ gap: 8, minHeight: 60 }}>
        {profiles.map((p) => (
          <div key={p.id} className={`list-item ${p.id === activeId ? 'on' : ''}`} style={{ border: '1px solid var(--line)', padding: '12px 14px' }}>
            {p.id === activeId ? <Star size={14} /> : <Layers size={16} className="muted" />}
            <span className="li-text">
              <span className="li-title ellipsis">{p.name}</span>
              <span className="li-sub ellipsis">
                {describe(p)} {p.model ? `· ${p.model}` : ''}
              </span>
            </span>
            {p.id === activeId ? (
              <span className="row sub" style={{ fontSize: 12 }}>
                <Check size={14} /> Активен
              </span>
            ) : (
              <button type="button" className="btn sm" onClick={() => apply(p)}>
                Применить
              </button>
            )}
            <IconBtn
              size="sm"
              bare
              className="danger"
              icon={<Trash2 size={14} />}
              label="Удалить профиль"
              onClick={() => setState((s) => ({ profiles: s.profiles.filter((x) => x.id !== p.id), activeProfileId: s.activeProfileId === p.id ? '' : s.activeProfileId }))}
            />
          </div>
        ))}
        {!profiles.length && <div className="empty">Профилей пока нет</div>}
      </div>
      <button
        type="button"
        className="btn block"
        onClick={() => {
          const name = prompt('Название профиля', `${sourceName(getState().api)} · ${currentModel(getState().api) || 'модель'}`);
          if (!name) return;
          const p = snapshot(name);
          setState((s) => ({ profiles: [...s.profiles, p], activeProfileId: p.id }));
          toast('Профиль сохранён', 'success');
        }}
      >
        <Plus size={16} /> Сохранить текущие настройки как профиль
      </button>
    </Panel>
  );
}
