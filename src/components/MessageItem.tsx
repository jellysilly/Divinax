import { tr } from '../lib/i18n';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  Flag,
  GitBranch,
  Pencil,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { Message } from '../types';
import { getState, openModal, setState, toast, updateChat, updateMessage, useStore, userName } from '../store';
import { applyRegex, cardRegex, combineRegex, presetRegex } from '../lib/regex';
import { substituteMacros } from '../lib/macros';
import { RichText } from './RichText';
import { branchChat } from '../lib/chats';
import { swipe } from '../lib/generate';
import { useSwipeGesture } from './useSwipeGesture';
import { speak } from '../lib/speech';
import { estimateTokens, fmtTime } from '../lib/util';
import { Avatar, IconBtn } from './ui';

interface Props {
  chatId: string;
  m: Message;
  index: number;
  isLast: boolean;
  isLastChar: boolean;
}

function MessageItemInner({ chatId, m, index, isLast, isLastChar }: Props) {
  const ui = useStore((s) => s.ui);
  const regexOn = useStore((s) => s.ext.enabled.regex);
  const globalRegex = useStore((s) => s.ext.regex);
  const cardRegexOn = useStore((s) => s.ext.cardRegex !== false);
  const presetScripts = useStore(presetRegex);
  const ownerChar = useStore((s) => (s.chats[chatId]?.ownerType === 'char' ? s.chats[chatId].ownerId : undefined));
  const character = useStore((s) => s.characters[m.charId ?? ownerChar ?? '']);
  const uname = useStore((s) => userName(s, s.chats[chatId]));
  const charAvatar = useStore((s) => (m.charId ? s.characters[m.charId]?.avatar : undefined));
  const personaAvatar = useStore((s) => (m.isUser ? (m.personaId ? s.personas[m.personaId]?.avatar : undefined) ?? m.avatar : undefined));
  const streaming = useStore((s) => (s.streaming?.messageId === m.id ? s.streaming : null));
  const generatingThis = useStore((s) => s.gen?.messageId === m.id && s.gen.chatId === chatId);
  const selecting = useStore((s) => s.selecting);
  const editing = useStore((s) => s.editingMessageId === m.id);
  const showReasoning = useStore((s) => s.format.showReasoning);
  const translateOn = useStore((s) => s.ext.enabled.translate);
  const [showOriginal, setShowOriginal] = useState(false);
  const selected = selecting?.includes(m.id) ?? false;

  const useTranslation = translateOn && m.translation && !showOriginal && !streaming;
  const text = streaming ? streaming.text : useTranslation ? m.translation! : m.text;
  const reasoning = streaming ? streaming.reasoning : m.reasoning;
  // Показ: регексы «только отображение» (включая регексы карточки) и макросы {{char}}/{{user}}
  const shown = useMemo(() => {
    let out = text;
    if (regexOn) {
      const scripts = combineRegex(globalRegex, presetScripts, cardRegexOn ? cardRegex(character) : []);
      out = applyRegex(scripts, out, { isUser: m.isUser, target: 'display' });
    }
    if (out.includes('{{')) out = substituteMacros(out, { char: character?.name ?? m.name, user: uname });
    return out;
  }, [text, regexOn, globalRegex, presetScripts, cardRegexOn, character, m.isUser, m.name, uname]);

  const avatar = m.isUser ? personaAvatar : charAvatar;
  const tokens = m.tokens ?? estimateTokens(m.text);
  const meta = [
    ui.showNumbers ? `#${index}` : '',
    ui.showTimestamps ? fmtTime(m.date) : '',
    ui.showTokens && !streaming ? tr('{0} т.', tokens) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const toggleSelect = () =>
    setState((s) => ({ selecting: s.selecting?.includes(m.id) ? s.selecting.filter((x) => x !== m.id) : [...(s.selecting ?? []), m.id] }));

  // жест смахивания: влево — следующий/новый вариант, вправо — предыдущий
  const articleRef = useRef<HTMLElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const gestures = ui.gestures && !m.isUser && !m.isSystem && !editing && !selecting && !streaming;
  useSwipeGesture(articleRef, hintRef, {
    enabled: gestures,
    canGo: (dir) => (dir < 0 ? m.swipeId > 0 : m.swipeId < m.swipes.length - 1 || isLastChar),
    hint: (dir) =>
      dir < 0
        ? { kind: 'prev', text: `${m.swipeId}/${m.swipes.length}` }
        : m.swipeId >= m.swipes.length - 1
          ? { kind: 'new', text: tr('новый') }
          : { kind: 'next', text: `${m.swipeId + 2}/${m.swipes.length}` },
    onSwipe: (dir) => void swipe(chatId, m.id, dir),
  });

  const del = () => {
    if (getState().ui.confirmDelete && !confirm(tr('Удалить сообщение?'))) return;
    updateChat(chatId, (c) => void (c.messages = c.messages.filter((x) => x.id !== m.id)));
  };

  const cls = [
    'msg',
    m.isUser ? 'user' : '',
    m.isSystem ? 'system' : '',
    m.hidden ? 'hidden-msg' : '',
    isLast ? 'last' : '',
    selected ? 'selected' : '',
  ].join(' ');

  // разметка как в SillyTavern (.mes[mesid] > .mes_block > .mes_text) — по ней сторонние расширения находят сообщения
  const stAttrs: Record<string, string> = { mesid: String(index), is_user: String(m.isUser), is_system: String(m.hidden), ch_name: m.name };

  return (
    <article
      ref={articleRef}
      className={cls + ' mes' + (gestures ? ' gest' : '')}
      onClick={selecting ? toggleSelect : undefined}
      style={selecting ? { cursor: 'pointer' } : undefined}
      data-mid={m.id}
      {...stAttrs}
    >
      {gestures && (
        <div ref={hintRef} className="swipe-hint" aria-hidden="true">
          <RefreshCw size={17} className="i-new" />
          <ChevronRight size={18} className="i-next" />
          <ChevronLeft size={18} className="i-prev" />
          <small />
        </div>
      )}
      {!m.isSystem && <Avatar src={avatar} name={m.name} glow={!m.isUser} />}
      <div className="msg-body mes_block">
        <div className="msg-head">
          <span className="msg-name">{m.name}</span>
          {m.isUser && <span className="tag">{tr('вы')}</span>}
          {m.hidden && (
            <span className="tag" title={tr('Сообщение не отправляется модели')}>
              {tr('скрыто')}
            </span>
          )}
          {m.bookmark && (
            <button type="button" className="tag" title={tr('Открыть контрольную точку')} onClick={() => setState({ activeChatId: m.bookmark! })}>
              <Flag size={10} /> {tr('точка')}
            </button>
          )}
          {meta && <span className="msg-meta">{meta}</span>}
          {translateOn && m.translation && (
            <button type="button" className="tag" title={tr('Переключить оригинал/перевод')} onClick={() => setShowOriginal(!showOriginal)}>
              {showOriginal ? tr('оригинал') : tr('перевод')}
            </button>
          )}
          {!selecting && !editing && !streaming && (
            <div className="msg-tools" role="toolbar" aria-label={tr('Действия с сообщением')}>
              <IconBtn size="sm" bare className="keep" icon={<Pencil size={15} />} label={tr('Изменить')} onClick={() => setState({ editingMessageId: m.id })} />
              <IconBtn
                size="sm"
                bare
                icon={<Copy size={15} />}
                label={tr('Копировать')}
                onClick={() => {
                  void navigator.clipboard?.writeText(m.text);
                  toast(tr('Скопировано'));
                }}
              />
              <IconBtn size="sm" bare icon={<GitBranch size={15} />} label={tr('Создать ветку')} onClick={() => branchChat(chatId, m.id)} />
              <IconBtn size="sm" bare icon={<Flag size={15} />} label={tr('Контрольная точка')} onClick={() => branchChat(chatId, m.id, true)} />
              <IconBtn size="sm" bare icon={<Volume2 size={15} />} label={tr('Озвучить')} onClick={() => speak(m.text)} />
              <IconBtn
                size="sm"
                bare
                icon={m.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                label={m.hidden ? tr('Показать ИИ') : tr('Скрыть от ИИ')}
                onClick={() => updateMessage(chatId, m.id, (x) => void (x.hidden = !x.hidden))}
              />
              <IconBtn size="sm" bare className="keep danger" icon={<Trash2 size={15} />} label={tr('Удалить')} onClick={del} />
            </div>
          )}
        </div>

        {reasoning && showReasoning && (
          <details className="reasoning" open={Boolean(streaming && !streaming.text)}>
            <summary>
              <Brain size={14} /> {tr('Рассуждения модели')}{streaming && !streaming.text ? '…' : ''}
            </summary>
            <div className="scroll">{reasoning}</div>
          </details>
        )}

        {editing ? (
          <Editor chatId={chatId} m={m} />
        ) : generatingThis && !text ? (
          <span className="typing" aria-label={tr('Печатает')}>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <RichText text={shown} streaming={Boolean(streaming)} />
        )}

        {m.images && m.images.length > 0 && (
          <div className="msg-images">
            {m.images.map((src, i) => (
              <img key={i} src={src} alt="" onClick={() => openModal('lightbox', src)} />
            ))}
          </div>
        )}

        {!m.isUser && !m.isSystem && !editing && (
          (ui.showGenTime && m.genTime && !streaming) || (ui.swipeArrows && (m.swipes.length > 1 || isLastChar))
        ) ? (
          <div className="msg-foot">
            <span className="msg-meta">{ui.showGenTime && m.genTime && !streaming ? tr('сгенерировано за {0} с', (m.genTime / 1000).toFixed(1).replace('.', ',')) : ''}</span>
            {ui.swipeArrows && (m.swipes.length > 1 || isLastChar) && (
              <div className="swipes" role="group" aria-label={tr('Варианты ответа')}>
                <IconBtn
                  size="sm"
                  icon={<ChevronLeft size={16} />}
                  label={tr('Предыдущий вариант')}
                  disabled={m.swipeId === 0 || Boolean(streaming)}
                  onClick={() => void swipe(chatId, m.id, -1)}
                />
                <span>
                  {m.swipeId + 1} / {m.swipes.length}
                </span>
                <IconBtn
                  size="sm"
                  icon={<ChevronRight size={16} />}
                  label={m.swipeId === m.swipes.length - 1 ? tr('Новый вариант') : tr('Следующий вариант')}
                  disabled={Boolean(streaming) || (m.swipeId === m.swipes.length - 1 && !isLastChar)}
                  onClick={() => void swipe(chatId, m.id, 1)}
                />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Editor({ chatId, m }: { chatId: string; m: Message }) {
  const [v, setV] = useState(m.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
    t.style.height = Math.min(600, t.scrollHeight + 4) + 'px';
  }, []);
  const save = () => {
    updateMessage(chatId, m.id, (x) => {
      x.text = v;
      x.swipes[x.swipeId] = v;
      x.tokens = estimateTokens(v);
    });
    setState({ editingMessageId: '' });
  };
  const cancel = () => setState({ editingMessageId: '' });
  return (
    <div className="col">
      <textarea
        ref={ref}
        className="textarea edit-area scroll"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          e.target.style.height = Math.min(600, e.target.scrollHeight + 4) + 'px';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <span className="sub spacer">{tr('Ctrl+Enter — сохранить, Esc — отмена')}</span>
        <button type="button" className="btn sm" onClick={cancel}>
          <X size={15} /> {tr('Отмена')}
        </button>
        <button type="button" className="btn sm primary" onClick={save}>
          <Check size={15} /> {tr('Сохранить')}
        </button>
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemInner);
