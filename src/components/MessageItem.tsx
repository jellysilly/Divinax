import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
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
import { getState, openModal, setState, toast, updateChat, updateMessage, useStore } from '../store';
import { renderMessage } from '../lib/markdown';
import { applyRegex } from '../lib/regex';
import { branchChat } from '../lib/chats';
import { swipe } from '../lib/generate';
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
  const regex = useStore((s) => (s.ext.enabled.regex ? s.ext.regex : null));
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
  const html = useMemo(() => {
    const shown = regex ? applyRegex(regex, text, { isUser: m.isUser, target: 'display' }) : text;
    return renderMessage(shown);
  }, [text, regex, m.isUser]);

  const avatar = m.isUser ? personaAvatar : charAvatar;
  const tokens = m.tokens ?? estimateTokens(m.text);
  const meta = [
    ui.showNumbers ? `#${index}` : '',
    ui.showTimestamps ? fmtTime(m.date) : '',
    ui.showTokens && !streaming ? `${tokens} т.` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const toggleSelect = () =>
    setState((s) => ({ selecting: s.selecting?.includes(m.id) ? s.selecting.filter((x) => x !== m.id) : [...(s.selecting ?? []), m.id] }));

  const del = () => {
    if (getState().ui.confirmDelete && !confirm('Удалить сообщение?')) return;
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

  return (
    <article className={cls} onClick={selecting ? toggleSelect : undefined} style={selecting ? { cursor: 'pointer' } : undefined} data-mid={m.id}>
      {!m.isSystem && <Avatar src={avatar} name={m.name} glow={!m.isUser} />}
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-name">{m.name}</span>
          {m.isUser && <span className="tag">вы</span>}
          {m.hidden && (
            <span className="tag" title="Сообщение не отправляется модели">
              скрыто
            </span>
          )}
          {m.bookmark && (
            <button type="button" className="tag" title="Открыть контрольную точку" onClick={() => setState({ activeChatId: m.bookmark! })}>
              <Flag size={10} /> точка
            </button>
          )}
          {meta && <span className="msg-meta">{meta}</span>}
          {translateOn && m.translation && (
            <button type="button" className="tag" title="Переключить оригинал/перевод" onClick={() => setShowOriginal(!showOriginal)}>
              {showOriginal ? 'оригинал' : 'перевод'}
            </button>
          )}
          {!selecting && !editing && !streaming && (
            <div className="msg-tools" role="toolbar" aria-label="Действия с сообщением">
              <IconBtn size="sm" bare className="keep" icon={<Pencil size={15} />} label="Изменить" onClick={() => setState({ editingMessageId: m.id })} />
              <IconBtn
                size="sm"
                bare
                icon={<Copy size={15} />}
                label="Копировать"
                onClick={() => {
                  void navigator.clipboard?.writeText(m.text);
                  toast('Скопировано');
                }}
              />
              <IconBtn size="sm" bare icon={<GitBranch size={15} />} label="Создать ветку" onClick={() => branchChat(chatId, m.id)} />
              <IconBtn size="sm" bare icon={<Flag size={15} />} label="Контрольная точка" onClick={() => branchChat(chatId, m.id, true)} />
              <IconBtn size="sm" bare icon={<Volume2 size={15} />} label="Озвучить" onClick={() => speak(m.text)} />
              <IconBtn
                size="sm"
                bare
                icon={m.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                label={m.hidden ? 'Показать ИИ' : 'Скрыть от ИИ'}
                onClick={() => updateMessage(chatId, m.id, (x) => void (x.hidden = !x.hidden))}
              />
              <IconBtn size="sm" bare className="keep danger" icon={<Trash2 size={15} />} label="Удалить" onClick={del} />
            </div>
          )}
        </div>

        {reasoning && showReasoning && (
          <details className="reasoning" open={Boolean(streaming && !streaming.text)}>
            <summary>
              <Brain size={14} /> Рассуждения модели{streaming && !streaming.text ? '…' : ''}
            </summary>
            <div className="scroll">{reasoning}</div>
          </details>
        )}

        {editing ? (
          <Editor chatId={chatId} m={m} />
        ) : generatingThis && !text ? (
          <span className="typing" aria-label="Печатает">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <div className={`msg-text ${streaming ? 'cursor' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
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
            <span className="msg-meta">{ui.showGenTime && m.genTime && !streaming ? `сгенерировано за ${(m.genTime / 1000).toFixed(1).replace('.', ',')} с` : ''}</span>
            {ui.swipeArrows && (m.swipes.length > 1 || isLastChar) && (
              <div className="swipes" role="group" aria-label="Варианты ответа">
                <IconBtn
                  size="sm"
                  icon={<ChevronLeft size={16} />}
                  label="Предыдущий вариант"
                  disabled={m.swipeId === 0 || Boolean(streaming)}
                  onClick={() => void swipe(chatId, m.id, -1)}
                />
                <span>
                  {m.swipeId + 1} / {m.swipes.length}
                </span>
                <IconBtn
                  size="sm"
                  icon={<ChevronRight size={16} />}
                  label={m.swipeId === m.swipes.length - 1 ? 'Новый вариант' : 'Следующий вариант'}
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
        <span className="sub spacer">Ctrl+Enter — сохранить, Esc — отмена</span>
        <button type="button" className="btn sm" onClick={cancel}>
          <X size={15} /> Отмена
        </button>
        <button type="button" className="btn sm primary" onClick={save}>
          <Check size={15} /> Сохранить
        </button>
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemInner);
