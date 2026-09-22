// Генерация изображений через бесплатный Pollinations (без ключа).
import { getState, toast, updateChat } from '../store';
import { makeMessage } from './chats';
import { quietGenerate } from './generate';

const PROMPTS = {
  scene:
    '[Опиши текущую сцену ролевой игры как промпт для генератора изображений: одним абзацем на английском, через запятую — место, освещение, персонажи, их внешность и позы, настроение. Только сам промпт, без пояснений.]',
  char: '[Опиши внешность {{char}} как промпт для генератора изображений: одним абзацем на английском, через запятую. Только сам промпт.]',
};

export function pollinationsUrl(prompt: string, w: number, h: number): string {
  const seed = Math.floor(Math.random() * 1e9);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
}

export async function generateImage(chatId: string, kind: 'scene' | 'char' | 'free', free?: string) {
  const s = getState();
  const cfg = s.ext.imageGen;
  let desc = free ?? '';
  if (kind !== 'free') {
    toast('Составляю описание сцены…');
    const res = await quietGenerate(PROMPTS[kind], chatId);
    if (!res) return;
    desc = res.replace(/^["'\s]+|["'\s]+$/g, '');
  }
  const url = pollinationsUrl(cfg.stylePrefix + desc, cfg.width, cfg.height);
  const msg = makeMessage({ text: `*${desc.slice(0, 300)}*`, name: 'Иллюстрация', isUser: false, isSystem: true, images: [url] });
  msg.hidden = true;
  updateChat(chatId, (c) => void c.messages.push(msg));
}
