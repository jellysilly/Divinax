import { useState } from 'react';
import { Copy, Download, Image as ImageIcon, Plus, Save, Trash2, Upload } from 'lucide-react';
import { activeChat, chatOwnerName, currentPersona, getState, setState, toast, updateChat, upsertPersona, useStore } from '../store';
import type { Persona } from '../types';
import { Avatar, Divider, Field, IconBtn, NumInput, Panel, SearchInput, Select, Switch } from '../components/ui';
import { download, estimateTokens, pickFiles, plural, readDataUrl, shrinkImage, uid } from '../lib/util';

function blankPersona(name = 'Новая персона'): Persona {
  return { id: uid(), name, description: '', position: 'in_prompt', depth: 2, role: 'system', createdAt: Date.now() };
}

export function PersonaPage() {
  const personas = useStore((s) => s.personas);
  const editingId = useStore((s) => s.editingPersonaId);
  const active = useStore((s) => currentPersona(s));
  const defaultId = useStore((s) => s.defaultPersonaId);
  const chats = useStore((s) => s.chats);
  const [q, setQ] = useState('');
  const list = Object.values(personas)
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.createdAt - b.createdAt);
  const editing = personas[editingId] ?? active;

  const activate = (p: Persona) => {
    setState({ editingPersonaId: p.id, defaultPersonaId: p.id });
    const chat = activeChat(getState());
    if (chat?.personaId) updateChat(chat.id, (c) => void (c.personaId = p.id));
    toast(`Вы играете за: ${p.name}`);
  };

  const chatCount = (id: string) => Object.values(chats).filter((c) => c.personaId === id).length;

  return (
    <div className="cols wrap-md">
      <Panel
        className="fill"
        style={{ flex: '1 1 0' }}
        title="Мои персоны"
        actions={
          <>
            <IconBtn
              icon={<Upload size={16} />}
              label="Импорт персон (JSON)"
              onClick={async () => {
                const [f] = await pickFiles('.json');
                if (!f) return;
                try {
                  const j = JSON.parse(await f.text());
                  const arr: Persona[] = Array.isArray(j) ? j : j.personas ? j.personas : fromST(j);
                  setState((s) => {
                    const next = { ...s.personas };
                    for (const p of arr) {
                      const np = { ...blankPersona(), ...p, id: uid() };
                      next[np.id] = np;
                    }
                    return { personas: next };
                  });
                  toast(`Импортировано персон: ${arr.length}`, 'success');
                } catch (e) {
                  toast('Ошибка импорта: ' + (e as Error).message, 'error');
                }
              }}
            />
            <IconBtn icon={<Download size={16} />} label="Экспорт персон" onClick={() => download('personas.json', JSON.stringify({ personas: Object.values(getState().personas) }, null, 2))} />
          </>
        }
      >
        <SearchInput value={q} onChange={setQ} placeholder="Поиск персон" />
        <div className="persona-grid scroll grow">
          {list.map((p) => {
            const n = chatCount(p.id);
            return (
              <button key={p.id} type="button" className={`persona-card ${active?.id === p.id ? 'on' : ''}`} onClick={() => activate(p)} style={editing?.id === p.id && active?.id !== p.id ? { borderColor: 'var(--line-strong)' } : undefined}>
                <Avatar src={p.avatar} name={p.name} size={72} />
                <span className="h3" style={{ fontSize: 20 }}>
                  {p.name}
                </span>
                <span className="li-sub">{p.id === defaultId ? 'по умолчанию' : n ? `${n} ${plural(n, 'чат', 'чата', 'чатов')}` : '—'}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="persona-card add"
            onClick={() => {
              const p = blankPersona();
              upsertPersona(p);
              setState({ editingPersonaId: p.id });
            }}
          >
            <Plus size={22} />
            Создать персону
          </button>
        </div>
        <div className="sub">Персона — это вы в истории: имя и описание подставляются вместо {'{{user}}'}.</div>
      </Panel>
      {editing ? <PersonaEditor key={editing.id} p={editing} /> : <Panel className="fill" style={{ flex: '1.3 1 0' }} title="Редактор персоны"><div className="empty">Создайте персону</div></Panel>}
    </div>
  );
}

function fromST(j: any): Persona[] {
  // power_user.personas: { "avatar.png": "Имя" }, persona_descriptions: { "avatar.png": { description, position } }
  const names = j.personas ?? {};
  const desc = j.persona_descriptions ?? {};
  return Object.entries(names).map(([k, name]) => ({
    ...blankPersona(String(name)),
    description: desc[k]?.description ?? '',
    depth: desc[k]?.depth ?? 2,
  }));
}

function PersonaEditor({ p }: { p: Persona }) {
  const [d, setD] = useState(p);
  const chat = useStore(activeChat);
  const ownerName = useStore((s) => chatOwnerName(s, chat));
  const defaultId = useStore((s) => s.defaultPersonaId);
  const charPersona = useStore((s) => s.charPersona);
  const dirty = JSON.stringify(d) !== JSON.stringify(p);

  const save = () => {
    upsertPersona(d);
    toast('Персона сохранена', 'success');
  };

  return (
    <Panel className="fill" style={{ flex: '1.3 1 0' }} title="Редактор персоны">
      <div className="body scroll grow" style={{ paddingRight: 4 }}>
        <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
          <button
            type="button"
            title="Сменить аватар"
            onClick={async () => {
              const [f] = await pickFiles('image/*');
              if (f) setD({ ...d, avatar: await shrinkImage(await readDataUrl(f), 512) });
            }}
          >
            <Avatar src={d.avatar} name={d.name} size={108} glow />
          </button>
          <div className="col grow" style={{ gap: 12 }}>
            <Field label="Имя">
              <input className="input big-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
            <div className="row wrap">
              <button
                type="button"
                className="btn sm"
                onClick={async () => {
                  const [f] = await pickFiles('image/*');
                  if (f) setD({ ...d, avatar: await shrinkImage(await readDataUrl(f), 512) });
                }}
              >
                <ImageIcon size={15} /> Сменить аватар
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  const c = { ...d, id: uid(), name: d.name + ' (копия)', createdAt: Date.now() };
                  upsertPersona(c);
                  setState({ editingPersonaId: c.id });
                }}
              >
                <Copy size={15} /> Дублировать
              </button>
              <button
                type="button"
                className="btn sm danger"
                disabled={Object.keys(getState().personas).length < 2}
                onClick={() => {
                  if (!confirm(`Удалить персону «${p.name}»?`)) return;
                  setState((s) => {
                    const personas = { ...s.personas };
                    delete personas[p.id];
                    const first = Object.keys(personas)[0];
                    return { personas, editingPersonaId: '', defaultPersonaId: s.defaultPersonaId === p.id ? first : s.defaultPersonaId };
                  });
                }}
              >
                <Trash2 size={15} /> Удалить
              </button>
            </div>
          </div>
        </div>
        <Field label="Описание">
          <textarea className="textarea serif scroll" rows={7} value={d.description} placeholder="Кто вы, как выглядите, чем живёте…" onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
        <div className="grid2">
          <Field label="Где размещать описание">
            <Select
              value={d.position}
              onChange={(v) => setD({ ...d, position: v })}
              options={[
                { value: 'in_prompt', label: 'В описании персонажа' },
                { value: 'top_an', label: 'Над заметкой автора' },
                { value: 'bottom_an', label: 'Под заметкой автора' },
                { value: 'at_depth', label: 'На глубине в чате' },
                { value: 'none', label: 'Не отправлять' },
              ]}
            />
          </Field>
          <Field label="Роль при размещении на глубине">
            <Select
              value={d.role}
              onChange={(v) => setD({ ...d, role: v })}
              options={[
                { value: 'system', label: 'Система' },
                { value: 'user', label: 'Пользователь' },
                { value: 'assistant', label: 'Ассистент' },
              ]}
            />
          </Field>
          {d.position === 'at_depth' && (
            <Field label="Глубина">
              <NumInput value={d.depth} min={0} max={999} onChange={(v) => setD({ ...d, depth: v })} />
            </Field>
          )}
          <PersonaLorebook value={d.lorebookId} onChange={(v) => setD({ ...d, lorebookId: v || undefined })} />
        </div>
        <Divider title="Привязки" />
        <div className="col" style={{ gap: 10 }}>
          <Switch label="Использовать для новых чатов" checked={defaultId === p.id} onChange={(v) => v && setState({ defaultPersonaId: p.id })} />
          <Switch
            label="Привязать к этому чату"
            hint={chat ? `«${chat.name}»` : 'нет открытого чата'}
            disabled={!chat}
            checked={chat?.personaId === p.id}
            onChange={(v) => chat && updateChat(chat.id, (c) => void (c.personaId = v ? p.id : undefined))}
          />
          {chat?.ownerType === 'char' && (
            <Switch
              label={`Привязать к персонажу «${ownerName}»`}
              checked={charPersona[chat.ownerId] === p.id}
              onChange={(v) =>
                setState((s) => {
                  const next = { ...s.charPersona };
                  if (v) next[chat.ownerId] = p.id;
                  else delete next[chat.ownerId];
                  return { charPersona: next };
                })
              }
            />
          )}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="sub">
          {estimateTokens(d.description)} {plural(estimateTokens(d.description), 'токен', 'токена', 'токенов')} в описании
        </span>
        <button type="button" className="btn primary" disabled={!dirty} onClick={save}>
          <Save size={15} /> {dirty ? 'Сохранить' : 'Сохранено'}
        </button>
      </div>
    </Panel>
  );
}

function PersonaLorebook({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const books = useStore((s) => s.lorebooks);
  return (
    <Field label="Лорбук персоны">
      <Select value={value ?? ''} onChange={onChange} options={[{ value: '', label: 'Нет' }, ...Object.values(books).map((b) => ({ value: b.id, label: b.name }))]} />
    </Field>
  );
}
