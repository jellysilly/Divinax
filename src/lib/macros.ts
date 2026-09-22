import { locale, tr } from './i18n';
// Макросы в стиле SillyTavern: {{char}}, {{user}}, {{random::a::b}}, {{roll:2d6}}, {{getvar::x}} …

export interface MacroEnv {
  char?: string;
  user?: string;
  group?: string;
  charIfNotGroup?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  persona?: string;
  mesExamples?: string;
  charPrompt?: string;
  charJailbreak?: string;
  model?: string;
  input?: string;
  lastMessage?: string;
  lastUserMessage?: string;
  lastCharMessage?: string;
  lastMessageId?: number;
  lastChatMessage?: string;
  original?: string;
  idleSince?: number;
  maxPrompt?: number;
  vars?: Record<string, string>;
  globalVars?: Record<string, string>;
  extra?: Record<string, string>;
}


function roll(expr: string): string {
  const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) {
    const n = parseInt(expr, 10);
    return Number.isFinite(n) && n > 0 ? String(1 + Math.floor(Math.random() * n)) : expr;
  }
  const count = Math.min(100, parseInt(m[1] || '1', 10));
  const sides = parseInt(m[2], 10);
  let total = 0;
  for (let i = 0; i < count; i++) total += 1 + Math.floor(Math.random() * sides);
  if (m[3]) total += parseInt(m[3].replace(/\s/g, ''), 10);
  return String(total);
}

function splitList(body: string): string[] {
  if (body.startsWith('::')) return body.slice(2).split('::');
  if (body.startsWith(':')) body = body.slice(1);
  return body.split(/(?<!\\),/).map((x) => x.replace(/\\,/g, ',').trim());
}

function idle(since?: number): string {
  if (!since) return tr('только что');
  const min = Math.round((Date.now() - since) / 60000);
  if (min < 1) return tr('меньше минуты');
  if (min < 60) return tr('{0} мин.', min);
  const h = Math.round(min / 60);
  if (h < 24) return tr('{0} ч.', h);
  return tr('{0} дн.', Math.round(h / 24));
}

// Стабильный «pick»: одинаковый результат для одного и того же текста
function seeded(str: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return Math.abs(h) % n;
}

export function substituteMacros(text: string, env: MacroEnv): string {
  if (!text || !text.includes('{{') && !text.includes('<')) return text ?? '';
  const vars = env.vars ?? {};
  const gvars = env.globalVars ?? {};
  let out = text
    .replace(/<USER>/gi, env.user ?? '')
    .replace(/<BOT>|<CHAR>/gi, env.char ?? '');

  // комментарии {{// ...}}
  out = out.replace(/\{\{\/\/[\s\S]*?\}\}/g, '');

  const now = new Date();
  for (let pass = 0; pass < 4 && out.includes('{{'); pass++) {
    const before = out;
    out = out.replace(/\{\{([^{}]*)\}\}/g, (whole, raw: string) => {
      const inner = raw.trim();
      const lower = inner.toLowerCase();
      const simple: Record<string, string | number | undefined> = {
        char: env.char,
        user: env.user,
        group: env.group ?? env.char,
        charifnotgroup: env.charIfNotGroup ?? env.char,
        description: env.description,
        chardescription: env.description,
        personality: env.personality,
        charpersonality: env.personality,
        scenario: env.scenario,
        persona: env.persona,
        mesexamples: env.mesExamples,
        mesexamplesraw: env.mesExamples,
        charprompt: env.charPrompt,
        charjailbreak: env.charJailbreak,
        charinstruction: env.charJailbreak,
        model: env.model,
        input: env.input,
        lastmessage: env.lastMessage,
        lastusermessage: env.lastUserMessage,
        lastcharmessage: env.lastCharMessage,
        lastchatmessage: env.lastChatMessage ?? env.lastMessage,
        lastmessageid: env.lastMessageId,
        original: env.original,
        maxprompt: env.maxPrompt,
        newline: '\n',
        trim: '\u0000TRIM\u0000',
        noop: '',
        time: now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
        date: now.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
        weekday: now.toLocaleDateString(locale(), { weekday: 'long' }),
        isotime: now.toTimeString().slice(0, 5),
        isodate: now.toISOString().slice(0, 10),
        idle_duration: idle(env.idleSince),
      };
      if (lower in simple) return String(simple[lower] ?? '');
      if (env.extra && inner in env.extra) return env.extra[inner];

      let m: RegExpExecArray | null;
      if ((m = /^random\s*(::?[\s\S]*)$/i.exec(inner))) {
        const list = splitList(m[1]);
        return list[Math.floor(Math.random() * list.length)] ?? '';
      }
      if ((m = /^pick\s*(::?[\s\S]*)$/i.exec(inner))) {
        const list = splitList(m[1]);
        return list[seeded(text + inner, list.length)] ?? '';
      }
      if ((m = /^roll[:\s]+(.+)$/i.exec(inner))) return roll(m[1]);
      if ((m = /^getvar::(.+)$/i.exec(inner))) return vars[m[1].trim()] ?? '';
      if ((m = /^setvar::([^:]+)::([\s\S]*)$/i.exec(inner))) {
        vars[m[1].trim()] = m[2];
        return '';
      }
      if ((m = /^addvar::([^:]+)::([\s\S]*)$/i.exec(inner))) {
        const k = m[1].trim();
        const a = parseFloat(vars[k] ?? '0');
        const b = parseFloat(m[2]);
        vars[k] = Number.isFinite(a) && Number.isFinite(b) ? String(a + b) : (vars[k] ?? '') + m[2];
        return '';
      }
      if ((m = /^(inc|dec)var::(.+)$/i.exec(inner))) {
        const k = m[2].trim();
        vars[k] = String((parseFloat(vars[k] ?? '0') || 0) + (m[1].toLowerCase() === 'inc' ? 1 : -1));
        return vars[k];
      }
      if ((m = /^getglobalvar::(.+)$/i.exec(inner))) return gvars[m[1].trim()] ?? '';
      if ((m = /^setglobalvar::([^:]+)::([\s\S]*)$/i.exec(inner))) {
        gvars[m[1].trim()] = m[2];
        return '';
      }
      if ((m = /^upper::([\s\S]*)$/i.exec(inner))) return m[1].toUpperCase();
      if ((m = /^lower::([\s\S]*)$/i.exec(inner))) return m[1].toLowerCase();
      if ((m = /^reverse:([\s\S]*)$/i.exec(inner))) return Array.from(m[1]).reverse().join('');
      if ((m = /^datetimeformat\s+(.+)$/i.exec(inner))) return formatDate(now, m[1]);
      if ((m = /^time_utc([+-]\d+)$/i.exec(inner))) {
        const d = new Date(now.getTime() + (parseInt(m[1], 10) * 60 + now.getTimezoneOffset()) * 60000);
        return d.toTimeString().slice(0, 5);
      }
      return whole;
    });
    if (out === before) break;
  }
  if (out.includes('\u0000TRIM\u0000')) out = out.replace(/\s*\u0000TRIM\u0000\s*/g, '');
  return out;
}

function formatDate(d: Date, fmt: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));
}

/** Мини-Handlebars для шаблона контекста: {{#if x}}…{{else}}…{{/if}}. */
export function renderStoryString(tpl: string, params: Record<string, string>): string {
  let out = tpl;
  const re = /\{\{#if\s+(\w+)\}\}((?:(?!\{\{#if)[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#if)[\s\S])*?))?\{\{\/if\}\}/;
  for (let i = 0; i < 200; i++) {
    const m = re.exec(out);
    if (!m) break;
    const val = params[m[1]];
    const pick = val && val.trim() ? m[2] : (m[3] ?? '');
    out = out.slice(0, m.index) + pick + out.slice(m.index + m[0].length);
  }
  out = out.replace(/\{\{(\w+)\}\}/g, (w, k: string) => (k in params ? params[k] : w));
  return out;
}

export const MACRO_HELP: [string, string][] = [
  ['{{char}}', 'имя персонажа'],
  ['{{user}}', 'имя вашей персоны'],
  ['{{group}}', 'участники группового чата через запятую'],
  ['{{description}} {{personality}} {{scenario}}', 'поля карточки'],
  ['{{persona}}', 'описание персоны'],
  ['{{time}} {{date}} {{weekday}}', 'текущее время, дата, день недели'],
  ['{{idle_duration}}', 'сколько прошло с последнего сообщения'],
  ['{{random::а::б::в}}', 'случайный вариант при каждой отправке'],
  ['{{pick::а::б}}', 'случайный вариант, стабильный для чата'],
  ['{{roll:2d6+1}}', 'бросок кубиков'],
  ['{{lastMessage}} {{lastUserMessage}} {{lastCharMessage}}', 'последние сообщения'],
  ['{{setvar::имя::значение}} {{getvar::имя}}', 'переменные чата'],
  ['{{addvar::имя::1}} {{incvar::имя}} {{decvar::имя}}', 'арифметика переменных'],
  ['{{setglobalvar::имя::значение}} {{getglobalvar::имя}}', 'глобальные переменные'],
  ['{{newline}} {{trim}} {{noop}}', 'перенос строки, обрезка пробелов, пусто'],
  ['{{// комментарий}}', 'удаляется из текста'],
  ['{{model}}', 'текущая модель'],
];
