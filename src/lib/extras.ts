import { tr } from './i18n';
// Перевод (Google Translate без ключа) и определение эмоции для спрайтов.
import { getState, toast, updateMessage } from '../store';

export const LANGS: [string, string][] = [
  ['ru', 'Русский'],
  ['en', 'English'],
  ['uk', 'Українська'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['pl', 'Polski'],
  ['ja', '日本語'],
  ['zh-CN', '中文'],
  ['ko', '한국어'],
];

export async function translateText(text: string, target: string): Promise<string> {
  // Режем по абзацам, чтобы не упереться в длину URL
  const chunks: string[] = [];
  let buf = '';
  for (const para of text.split(/(\n+)/)) {
    if ((buf + para).length > 1800 && buf) {
      chunks.push(buf);
      buf = '';
    }
    buf += para;
  }
  if (buf) chunks.push(buf);
  const out: string[] = [];
  for (const c of chunks) {
    if (!c.trim()) {
      out.push(c);
      continue;
    }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(c)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(tr('Переводчик ответил {0}', res.status));
    const j = await res.json();
    out.push((j[0] as [string][]).map((x) => x[0]).join(''));
  }
  return out.join('');
}

export async function translateMessage(chatId: string, messageId: string) {
  const s = getState();
  const m = s.chats[chatId]?.messages.find((x) => x.id === messageId);
  if (!m) return;
  try {
    const t = await translateText(m.text, s.ext.translate.target);
    updateMessage(chatId, messageId, (x) => void (x.translation = t));
  } catch (e) {
    toast(tr('Перевод не удался: ') + (e as Error).message, 'error');
  }
}

const EMOTION_WORDS: Record<string, string[]> = {
  радость: ['улыб', 'смеё', 'смех', 'рад', 'весел', 'счаст', 'smile', 'laugh', 'happy', 'grin', 'хихик'],
  грусть: ['груст', 'печал', 'слез', 'плач', 'тоск', 'sad', 'tear', 'cry', 'sigh', 'вздых'],
  гнев: ['злит', 'гнев', 'ярост', 'рычит', 'кричит', 'зло', 'angry', 'rage', 'furious', 'growl', 'хмур'],
  страх: ['страх', 'боит', 'испуг', 'дрож', 'ужас', 'fear', 'scared', 'afraid', 'tremb', 'панич'],
  удивление: ['удивл', 'изумл', 'ошеломл', 'неожидан', 'surpris', 'shock', 'gasp', 'ахает'],
  смущение: ['смущ', 'красне', 'румян', 'неловк', 'blush', 'embarrass', 'fluster'],
  любовь: ['люб', 'нежн', 'целу', 'обним', 'love', 'kiss', 'hug', 'tender'],
  задумчивость: ['задум', 'размышл', 'хмурит', 'think', 'ponder', 'wonder', 'hmm'],
  отвращение: ['отвращ', 'морщ', 'брезг', 'disgust', 'grimace'],
};

export function classifyEmotion(text: string): string {
  const t = text.toLowerCase();
  let best = 'нейтрально';
  let score = 0;
  for (const [emo, words] of Object.entries(EMOTION_WORDS)) {
    const sc = words.reduce((a, w) => a + (t.split(w).length - 1), 0);
    if (sc > score) {
      score = sc;
      best = emo;
    }
  }
  return best;
}
