import { tr } from '../lib/i18n';
import { useShallow } from 'zustand/react/shallow';
import { useState } from 'react';
import {
  BookMarked,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop as CropIcon,
  Download,
  FileText,
  MessageCircle,
  Plus,
  SlidersHorizontal,
  Star as StarIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { openModal, setState, setTab, toast, upsertCharacter, upsertLorebook, useStore } from '../store';
import type { Character } from '../types';
import { Library } from '../components/Library';
import { AVATAR_CROP, cropImage, pickAndCrop } from '../components/Cropper';
import { Avatar, Field, IconBtn, LazyInput, LazyTextarea, Panel, Star, TagInput } from '../components/ui';
import { characterToJson, exportCharacterPng } from '../lib/cards';
import { openOwner } from '../lib/chats';
import { download, estimateTokens, fmtNum, plural, safeName, uid } from '../lib/util';

export function CharactersPage() {
  const characters = useStore((s) => s.characters);
  const editingId = useStore((s) => s.editingCharId);
  const activeOwner = useStore((s) => s.chats[s.activeChatId]?.ownerId);
  const ch = characters[editingId] ?? characters[activeOwner ?? ''] ?? Object.values(characters)[0];
  return (
    <div className="cols wrap-sm">
      <Library
        style={{ width: 328, flex: 'none' }}
        selectedId={ch?.id}
        onPickChar={(id) => setState({ editingCharId: id })}
        onPickGroup={(id) => openModal('group', { id })}
      />
      {ch ? (
        <CharEditor key={ch.id} ch={ch} />
      ) : (
        <Panel className="fill grow" title={tr('Карточка персонажа')}>
          <div className="empty">{tr('Создайте персонажа кнопкой «+» или импортируйте PNG/JSON-карточку.')}</div>
        </Panel>
      )}
    </div>
  );
}

function CharEditor({ ch }: { ch: Character }) {
  const allTags = useStore(useShallow((s) => [...new Set(Object.values(s.characters).flatMap((c) => c.tags))]));
  const book = useStore((s) => (ch.lorebookId ? s.lorebooks[ch.lorebookId] : undefined));
  const [greet, setGreet] = useState(0);
  const set = (p: Partial<Character>) => upsertCharacter({ ...useStore.getState().characters[ch.id], ...p });

  const greetings = [ch.first_mes, ...ch.alternate_greetings];
  const gi = Math.min(greet, greetings.length - 1);
  const setGreeting = (v: string) => {
    if (gi === 0) set({ first_mes: v });
    else {
      const alt = [...ch.alternate_greetings];
      alt[gi - 1] = v;
      set({ alternate_greetings: alt });
    }
  };

  const permanent = estimateTokens([ch.description, ch.personality, ch.scenario, ch.system_prompt, ch.post_history_instructions].join('\n'));
  const total = permanent + estimateTokens(ch.first_mes + ch.mes_example);

  const changeAvatar = async () => {
    const url = await pickAndCrop(AVATAR_CROP);
    if (url) set({ avatar: url });
  };
  const recropAvatar = async () => {
    if (!ch.avatar) return;
    const url = await cropImage(ch.avatar, AVATAR_CROP);
    if (url) set({ avatar: url });
  };

  return (
    <Panel
      className="fill"
      style={{ flex: '1 1 0' }}
      title={tr('Карточка персонажа')}
      actions={
        <span className="btn sm" style={{ cursor: 'default' }}>
          <Check size={15} /> {tr('Сохранено')}
        </span>
      }
    >
      <div className="body scroll grow" style={{ paddingRight: 4 }}>
        <div className="char-hero">
          <div className="avatar-edit">
          <div className="hero-avatar" style={{ width: 116, height: 116, margin: 12 }}>
            <div className="ring" />
            <button type="button" onClick={() => void changeAvatar()} title={tr('Сменить аватар')} style={{ borderRadius: '50%' }}>
              <Avatar src={ch.avatar} name={ch.name} size={116} />
            </button>
            <span className="spark" style={{ left: '50%', top: -18, marginLeft: -9 }}>
              <Star size={18} />
            </span>
            <span className="spark" style={{ left: '50%', bottom: -18, marginLeft: -9 }}>
              <Star size={18} />
            </span>
            <span className="spark" style={{ top: '50%', left: -18, marginTop: -9 }}>
              <Star size={18} />
            </span>
            <span className="spark" style={{ top: '50%', right: -18, marginTop: -9 }}>
              <Star size={18} />
            </span>
          </div>
            <div className="row" style={{ gap: 6 }}>
              <IconBtn size="sm" icon={<Upload size={14} />} label={tr('Загрузить аватар')} onClick={() => void changeAvatar()} />
              {ch.avatar && <IconBtn size="sm" icon={<CropIcon size={14} />} label={tr('Обрезать аватар')} onClick={() => void recropAvatar()} />}
              {ch.avatar && <IconBtn size="sm" className="danger" icon={<X size={14} />} label={tr('Убрать аватар')} onClick={() => set({ avatar: undefined })} />}
            </div>
          </div>
          <div className="col grow" style={{ gap: 12, minWidth: 0, width: '100%' }}>
            <div className="row wrap" style={{ alignItems: 'flex-end', gap: 14 }}>
              <Field label={tr('Имя персонажа')} className="grow" style={{ minWidth: 220 }}>
                <LazyInput className="input big-name" value={ch.name} onCommit={(v) => set({ name: v.trim() || ch.name })} />
              </Field>
              <div className="row" style={{ paddingBottom: 4 }}>
                <IconBtn size="lg" active={ch.fav} icon={<StarIcon size={16} fill={ch.fav ? 'currentColor' : 'none'} />} label={ch.fav ? tr('Убрать из избранного') : tr('В избранное')} onClick={() => set({ fav: !ch.fav })} />
                <IconBtn size="lg" icon={<MessageCircle size={16} />} label={tr('Открыть чат')} onClick={() => openOwner('char', ch.id)} />
                <IconBtn
                  size="lg"
                  icon={<BookMarked size={16} />}
                  label={book ? tr('Лорбук: {0}', book.name) : tr('Создать лорбук персонажа')}
                  active={Boolean(book)}
                  onClick={() => {
                    if (book) {
                      setState({ editingLorebookId: book.id });
                      setTab('lorebook');
                      return;
                    }
                    const now = Date.now();
                    const lb = { id: uid(), name: tr('{0} — лорбук', ch.name), entries: [], createdAt: now, updatedAt: now };
                    upsertLorebook(lb);
                    set({ lorebookId: lb.id });
                    setState({ editingLorebookId: lb.id });
                    setTab('lorebook');
                  }}
                />
                <IconBtn
                  size="lg"
                  icon={<Copy size={16} />}
                  label={tr('Дублировать')}
                  onClick={() => {
                    const c = { ...structuredClone(ch), id: uid(), name: ch.name + tr(' (копия)'), createdAt: Date.now() };
                    upsertCharacter(c);
                    setState({ editingCharId: c.id });
                  }}
                />
                <IconBtn size="lg" icon={<Download size={16} />} label={tr('Экспорт (PNG / JSON)')} onClick={() => openModal('exportChar', ch.id)} />
                <IconBtn
                  size="lg"
                  className="danger"
                  icon={<Trash2 size={16} />}
                  label={tr('Удалить персонажа')}
                  onClick={() => {
                    if (!confirm(tr('Удалить «{0}» и все его чаты?', ch.name))) return;
                    setState((s) => {
                      const characters = { ...s.characters };
                      delete characters[ch.id];
                      const chats = Object.fromEntries(Object.entries(s.chats).filter(([, c]) => c.ownerId !== ch.id));
                      return { characters, chats, editingCharId: '', activeChatId: chats[s.activeChatId] ? s.activeChatId : '' };
                    });
                  }}
                />
              </div>
            </div>
            <TagInput values={ch.tags} onChange={(v) => set({ tags: v })} placeholder={tr('+ тег')} suggestions={allTags} />
          </div>
        </div>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <span className="sub">
            {tr('Всего')} <b style={{ color: 'var(--text)' }}>{fmtNum(total)}</b> {plural(total, 'токен', 'токена', 'токенов')} {tr('· постоянно в контексте')}{' '}
            <b style={{ color: 'var(--text)' }}>{fmtNum(permanent)}</b>
          </span>
          <div className="row wrap">
            <button type="button" className="btn sm" onClick={() => openModal('charAdvanced', ch.id)}>
              <SlidersHorizontal size={15} /> {tr('Расширенные поля')}
            </button>
            <button type="button" className="btn sm" onClick={() => openModal('creatorNotes', ch.id)}>
              <FileText size={15} /> {tr('Заметки создателя')}
            </button>
          </div>
        </div>
        <div className="grid2" style={{ alignItems: 'start' }}>
          <div className="col" style={{ gap: 16 }}>
            <Field label={tr('Описание')}>
              <LazyTextarea className="textarea serif" rows={8} value={ch.description} onCommit={(v) => set({ description: v })} placeholder={tr('Внешность, характер, история, манера речи…')} />
            </Field>
            <Field
              label={
                <span className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <span>{gi === 0 ? tr('Первое сообщение') : tr('Приветствие {0}', gi + 1)}</span>
                  <span className="row" style={{ gap: 6, letterSpacing: 0 }}>
                    <IconBtn size="sm" icon={<ChevronLeft size={14} />} label={tr('Предыдущее')} disabled={gi === 0} onClick={() => setGreet(gi - 1)} />
                    <span className="tabular" style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {gi + 1} / {greetings.length}
                    </span>
                    <IconBtn size="sm" icon={<ChevronRight size={14} />} label={tr('Следующее')} disabled={gi >= greetings.length - 1} onClick={() => setGreet(gi + 1)} />
                    <IconBtn
                      size="sm"
                      icon={<Plus size={14} />}
                      label={tr('Добавить приветствие')}
                      onClick={() => {
                        set({ alternate_greetings: [...ch.alternate_greetings, ''] });
                        setGreet(greetings.length);
                      }}
                    />
                    {gi > 0 && (
                      <IconBtn
                        size="sm"
                        className="danger"
                        icon={<Trash2 size={13} />}
                        label={tr('Удалить приветствие')}
                        onClick={() => {
                          set({ alternate_greetings: ch.alternate_greetings.filter((_, k) => k !== gi - 1) });
                          setGreet(gi - 1);
                        }}
                      />
                    )}
                  </span>
                </span>
              }
            >
              <LazyTextarea key={gi} className="textarea serif" rows={7} value={greetings[gi] ?? ''} onCommit={setGreeting} />
            </Field>
          </div>
          <div className="col" style={{ gap: 16 }}>
            <Field label={tr('Личность')}>
              <LazyTextarea className="textarea serif" rows={3} value={ch.personality} onCommit={(v) => set({ personality: v })} />
            </Field>
            <Field label={tr('Сценарий')}>
              <LazyTextarea className="textarea serif" rows={4} value={ch.scenario} onCommit={(v) => set({ scenario: v })} />
            </Field>
            <Field label={tr('Примеры диалогов')} hint={tr('Разделяйте примеры строкой <START>')}>
              <LazyTextarea className="textarea mono" rows={7} value={ch.mes_example} onCommit={(v) => set({ mes_example: v })} placeholder={'<START>\n{{user}}: …\n{{char}}: …'} />
            </Field>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export async function exportCharacter(ch: Character, kind: 'png' | 'json') {
  const s = useStore.getState();
  const book = ch.lorebookId ? s.lorebooks[ch.lorebookId] : undefined;
  if (kind === 'json') download(`${safeName(ch.name)}.json`, JSON.stringify(characterToJson(ch, book), null, 2));
  else {
    try {
      download(`${safeName(ch.name)}.png`, await exportCharacterPng(ch, book));
    } catch (e) {
      toast(tr('Не удалось собрать PNG: ') + (e as Error).message, 'error');
    }
  }
}
