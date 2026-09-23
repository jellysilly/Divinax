import { tr } from './i18n';
// Операции с чатами: создание, ветки, приветствия. Импорт/экспорт — в chatio.ts.
import type { Chat, Message } from '../types';
import { chatsOf, currentPersona, getState, newChatObject, setState, toast, updateChat } from '../store';
import { macroEnv } from './prompt';
import { substituteMacros } from './macros';
import { uid } from './util';

export function makeMessage(p: Partial<Message> & { text: string; name: string; isUser: boolean }): Message {
  const now = Date.now();
  return {
    id: uid(),
    swipes: [p.text],
    swipeId: 0,
    swipeInfo: [{ date: now }],
    date: now,
    hidden: false,
    ...p,
  };
}

function greetings(chat: Chat): Message[] {
  const s = getState();
  const persona = currentPersona(s, chat);
  const out: Message[] = [];
  const add = (charId: string) => {
    const ch = s.characters[charId];
    if (!ch) return;
    const env = macroEnv(s, chat, ch, persona);
    const list = [ch.first_mes, ...ch.alternate_greetings].filter((x) => x.trim()).map((x) => substituteMacros(x, env));
    if (!list.length) return;
    const m = makeMessage({ text: list[0], name: ch.name, isUser: false, charId });
    m.swipes = list;
    m.swipeInfo = list.map(() => ({ date: m.date }));
    out.push(m);
  };
  if (chat.ownerType === 'char') add(chat.ownerId);
  else {
    const g = s.groups[chat.ownerId];
    g?.members.filter((id) => !g.disabledMembers.includes(id)).forEach(add);
  }
  return out;
}

export function startNewChat(ownerType: 'char' | 'group', ownerId: string, name?: string): string {
  const chat = newChatObject(ownerType, ownerId, name);
  const s = getState();
  if (ownerType === 'char' && s.charPersona[ownerId]) chat.personaId = s.charPersona[ownerId];
  chat.messages = greetings(chat);
  setState((st) => ({
    chats: { ...st.chats, [chat.id]: chat },
    activeChatId: chat.id,
    lastChatByOwner: { ...st.lastChatByOwner, [ownerId]: chat.id },
  }));
  return chat.id;
}

export function openChat(chatId: string) {
  const c = getState().chats[chatId];
  if (!c) return;
  setState((s) => ({ activeChatId: chatId, lastChatByOwner: { ...s.lastChatByOwner, [c.ownerId]: chatId }, tab: 'chat', mobileMenu: false }));
}

/** Открыть последний чат персонажа/группы или создать новый. */
export function openOwner(ownerType: 'char' | 'group', ownerId: string) {
  const s = getState();
  const last = s.lastChatByOwner[ownerId];
  if (last && s.chats[last]) return openChat(last);
  const existing = chatsOf(s, ownerId)[0];
  if (existing) return openChat(existing.id);
  startNewChat(ownerType, ownerId);
  setState({ tab: 'chat' });
}

export function closeChat() {
  setState({ activeChatId: '', chatMenu: false });
}

export function deleteChat(chatId: string) {
  setState((s) => {
    const chats = { ...s.chats };
    const c = chats[chatId];
    delete chats[chatId];
    const next = c ? Object.values(chats).filter((x) => x.ownerId === c.ownerId).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
    return {
      chats,
      activeChatId: s.activeChatId === chatId ? next?.id ?? '' : s.activeChatId,
      lastChatByOwner: c ? { ...s.lastChatByOwner, [c.ownerId]: next?.id ?? '' } : s.lastChatByOwner,
    };
  });
}

export function renameChat(chatId: string, name: string) {
  updateChat(chatId, (c) => void (c.name = name.trim() || c.name));
}

/** Ветка: копия чата до указанного сообщения включительно. */
export function branchChat(chatId: string, messageId: string, asCheckpoint = false, name?: string): string | undefined {
  const s = getState();
  const src = s.chats[chatId];
  if (!src) return;
  const idx = src.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  const now = Date.now();
  const copy: Chat = {
    ...structuredClone(src),
    id: uid(),
    name: name ?? `${asCheckpoint ? tr('Контрольная точка') : tr('Ветка')}: ${src.name}`,
    messages: structuredClone(src.messages.slice(0, idx + 1)),
    branchOf: { chatId, messageId },
    createdAt: now,
    updatedAt: now,
  };
  setState((st) => ({ chats: { ...st.chats, [copy.id]: copy } }));
  if (asCheckpoint) {
    updateChat(chatId, (c) => {
      c.messages = c.messages.map((m) => (m.id === messageId ? { ...m, bookmark: copy.id } : m));
    });
    toast(tr('Контрольная точка «{0}» сохранена', copy.name), 'success');
  } else {
    openChat(copy.id);
    toast(tr('Создана ветка чата'), 'success');
  }
  return copy.id;
}

