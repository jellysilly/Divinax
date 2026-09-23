import { tr } from './i18n';
// Slash-команды в духе STscript: /sys, /continue, /sum, /bg, /persona …
import { activeChat, getState, openModal, setState, setTab, toast, updateChat } from '../store';
import { runGeneration, sendMessage, stopGeneration, summarizeChat } from './generate';
import { makeMessage, openOwner, startNewChat } from './chats';
import { substituteMacros } from './macros';
import { macroEnv } from './prompt';
import { currentPersona } from '../store';
import { speak } from './speech';

interface Cmd {
  names: string[];
  help: string;
  run: (arg: string) => Promise<string | void> | string | void;
}

const pipe: { value: string } = { value: '' };

function chatOrThrow() {
  const c = activeChat(getState());
  if (!c) throw new Error(tr('Нет открытого чата'));
  return c;
}

export const COMMANDS: Cmd[] = [
  { names: ['help', '?'], help: 'список команд', run: () => void openModal('help') },
  {
    names: ['sys', 'nar', 'narrator'],
    help: '/sys текст — сообщение рассказчика (видно модели)',
    run: async (a) => void (await sendMessage(a, { generate: false, asSystem: true })),
  },
  {
    names: ['send'],
    help: '/send текст — добавить ваше сообщение без генерации',
    run: async (a) => void (await sendMessage(a, { generate: false })),
  },
  {
    names: ['sendas'],
    help: '/sendas name=Имя текст — сообщение от лица персонажа',
    run: (a) => {
      const m = /name=("[^"]+"|\S+)\s*([\s\S]*)/.exec(a);
      if (!m) throw new Error(tr('Формат: /sendas name=Имя текст'));
      const name = m[1].replace(/"/g, '');
      const c = chatOrThrow();
      const ch = Object.values(getState().characters).find((x) => x.name === name);
      updateChat(c.id, (cc) => void cc.messages.push(makeMessage({ text: m[2], name, isUser: false, charId: ch?.id })));
    },
  },
  { names: ['continue', 'cont'], help: 'продолжить последний ответ', run: async () => void (await runGeneration('continue')) },
  { names: ['regen', 'regenerate'], help: 'перегенерировать последний ответ', run: async () => void (await runGeneration('regenerate')) },
  { names: ['swipe'], help: 'новый вариант последнего ответа', run: async () => void (await runGeneration('swipe')) },
  { names: ['impersonate', 'imp'], help: 'ответить за вас', run: async () => void (await runGeneration('impersonate')) },
  {
    names: ['trigger', 'gen'],
    help: '/trigger — заставить персонажа ответить (в группе: /trigger Имя)',
    run: async (a) => {
      const s = getState();
      const ch = a ? Object.values(s.characters).find((x) => x.name.toLowerCase() === a.toLowerCase()) : undefined;
      await runGeneration('normal', { charId: ch?.id });
    },
  },
  { names: ['stop', 'abort'], help: 'остановить генерацию', run: () => stopGeneration() },
  { names: ['sum', 'summarize'], help: 'обновить пересказ чата', run: async () => void (await summarizeChat()) },
  {
    names: ['del', 'cut'],
    help: '/del N — удалить N последних сообщений',
    run: (a) => {
      const n = Math.max(1, parseInt(a || '1', 10) || 1);
      const c = chatOrThrow();
      updateChat(c.id, (cc) => void (cc.messages = cc.messages.slice(0, Math.max(0, cc.messages.length - n))));
    },
  },
  {
    names: ['hide', 'unhide'],
    help: '/hide 3-5 — скрыть сообщения от ИИ (по номерам), /unhide — вернуть',
    run: () => undefined, // обрабатывается в runSlash
  },
  {
    names: ['newchat'],
    help: 'начать новый чат с текущим персонажем',
    run: () => {
      const c = chatOrThrow();
      startNewChat(c.ownerType, c.ownerId);
    },
  },
  {
    names: ['bg', 'background'],
    help: '/bg название — сменить фон',
    run: (a) => {
      const s = getState();
      const q = a.trim().toLowerCase();
      const bg = s.ui.backgrounds.find((b) => b.name.toLowerCase().includes(q) || tr(b.name).toLowerCase().includes(q));
      if (!bg) throw new Error(tr('Фон не найден'));
      const c = activeChat(s);
      if (c && s.ui.perChatBg) updateChat(c.id, (cc) => void (cc.background = bg.id));
      else setState((st) => ({ ui: { ...st.ui, activeBg: bg.id } }));
    },
  },
  {
    names: ['persona', 'name'],
    help: '/persona Имя — сменить персону в этом чате',
    run: (a) => {
      const s = getState();
      const p = Object.values(s.personas).find((x) => x.name.toLowerCase() === a.toLowerCase());
      if (!p) throw new Error(tr('Персона не найдена'));
      const c = chatOrThrow();
      updateChat(c.id, (cc) => void (cc.personaId = p.id));
      toast(tr('Теперь вы — {0}', p.name), 'success');
    },
  },
  {
    names: ['go', 'char'],
    help: '/go Имя — открыть чат с персонажем',
    run: (a) => {
      const s = getState();
      const ch = Object.values(s.characters).find((x) => x.name.toLowerCase().startsWith(a.toLowerCase()));
      if (!ch) throw new Error(tr('Персонаж не найден'));
      openOwner('char', ch.id);
    },
  },
  {
    names: ['setvar'],
    help: '/setvar key=имя значение — переменная чата',
    run: (a) => {
      const m = /key=(\S+)\s*([\s\S]*)/.exec(a);
      if (!m) throw new Error(tr('Формат: /setvar key=имя значение'));
      const c = chatOrThrow();
      updateChat(c.id, (cc) => void (cc.vars = { ...cc.vars, [m[1]]: m[2] }));
    },
  },
  {
    names: ['getvar'],
    help: '/getvar имя — вывести переменную',
    run: (a) => {
      const c = chatOrThrow();
      const v = c.vars[a.trim()] ?? '';
      toast(`${a.trim()} = ${v}`);
      return v;
    },
  },
  { names: ['echo'], help: '/echo текст — показать уведомление', run: (a) => void toast(a || pipe.value) },
  { names: ['speak', 'tts'], help: '/speak текст — озвучить', run: (a) => speak(a || pipe.value) },
  {
    names: ['roll', 'r'],
    help: '/roll 2d6 — бросок кубиков в чат',
    run: async (a) => {
      const res = substituteMacros(`{{roll:${a || '1d20'}}}`, {});
      await sendMessage(`🎲 ${a || '1d20'}: **${res}**`, { generate: false, asSystem: true });
    },
  },
  {
    names: ['tab', 'open'],
    help: '/tab api|generation|format|lorebook|persona|interface|extensions|characters',
    run: (a) => setTab((a.trim() || 'chat') as never),
  },
];

// /hide и /unhide — отдельная реализация, т.к. нужен флаг
function hideRange(arg: string, hidden: boolean) {
  const c = chatOrThrow();
  const [a, b] = arg.split('-').map((x) => parseInt(x.trim(), 10));
  if (!Number.isFinite(a)) throw new Error(tr('Укажите номер или диапазон: 3-5'));
  const to = Number.isFinite(b) ? b : a;
  updateChat(c.id, (cc) => {
    cc.messages = cc.messages.map((m, i) => (i >= a && i <= to ? { ...m, hidden } : m));
  });
}

/** Регистрация команды сторонним расширением: заменяет команды с теми же именами. */
export function registerCommand(names: string[], help: string, run: Cmd['run']) {
  const lower = names.map((n) => n.toLowerCase().replace(/^\//, '')).filter(Boolean);
  if (!lower.length) return;
  for (let i = COMMANDS.length - 1; i >= 0; i--) if (COMMANDS[i].names.some((n) => lower.includes(n))) COMMANDS.splice(i, 1);
  COMMANDS.push({ names: lower, help, run });
}

/** Последний результат конвейера | (для executeSlashCommands). */
export const lastPipe = () => pipe.value;

export async function runSlash(input: string): Promise<boolean> {
  const text = input.trim();
  if (!text.startsWith('/')) return false;
  // Команды можно соединять через |
  const parts = text.split(/\s*\|\s*(?=\/)/);
  for (const part of parts) {
    const m = /^\/(\S+)\s*([\s\S]*)$/.exec(part);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const s = getState();
    const chat = activeChat(s);
    let arg = m[2];
    if (chat) {
      const env = macroEnv(s, chat, s.characters[chat.ownerId], currentPersona(s, chat));
      arg = substituteMacros(arg, { ...env, extra: { pipe: pipe.value } });
    }
    try {
      if (name === 'hide' || name === 'unhide') {
        hideRange(arg, name === 'hide');
        continue;
      }
      const cmd = COMMANDS.find((c) => c.names.includes(name));
      if (!cmd) {
        toast(tr('Неизвестная команда /{0}. Список: /help', name), 'error');
        return true;
      }
      const res = await cmd.run(arg);
      if (typeof res === 'string') pipe.value = res;
    } catch (e) {
      toast(`/${name}: ${(e as Error).message}`, 'error');
      return true;
    }
  }
  return true;
}
