import { locale, tr } from './i18n';
// Озвучка и распознавание речи через Web Speech API (работает без сервера).
import { getState, toast } from '../store';

export function voices(): SpeechSynthesisVoice[] {
  return typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
}

function speakable(text: string, quotesOnly: boolean): string {
  let t = text.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, '');
  if (quotesOnly) {
    const q = t.match(/«[^»]*»|"[^"]*"|“[^”]*”/g);
    t = q ? q.join(' ') : '';
  } else t = t.replace(/\*([^*]+)\*/g, '$1');
  return t.trim();
}

export function speak(text: string) {
  if (typeof speechSynthesis === 'undefined') {
    toast(tr('Браузер не поддерживает озвучку'), 'error');
    return;
  }
  const cfg = getState().ext.tts;
  const t = speakable(text, cfg.narrateQuotesOnly);
  if (!t) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  const v = voices().find((x) => x.voiceURI === cfg.voice);
  if (v) u.voice = v;
  else u.lang = locale();
  u.rate = cfg.rate;
  u.pitch = cfg.pitch;
  speechSynthesis.speak(u);
}

export const stopSpeaking = () => typeof speechSynthesis !== 'undefined' && speechSynthesis.cancel();

type Rec = { start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null; lang: string; interimResults: boolean; continuous: boolean };

export function startRecognition(onText: (text: string, final: boolean) => void, onEnd: () => void): (() => void) | null {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) {
    toast(tr('Распознавание речи не поддерживается этим браузером'), 'error');
    return null;
  }
  const rec: Rec = new Ctor();
  rec.lang = getState().ext.stt.lang || 'ru-RU';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e: any) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    onText(text, final);
  };
  rec.onerror = (e: any) => toast(tr('Ошибка распознавания: ') + (e.error ?? ''), 'error');
  rec.onend = onEnd;
  rec.start();
  return () => rec.stop();
}
