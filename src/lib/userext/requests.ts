// Запросы расширений к модели в обход чата: generateRaw и ConnectionManagerRequestService из SillyTavern.
// Не трогают состояние генерации Divinax — их можно делать, пока персонаж пишет ответ.
import type { ApiSettings, ConnectionProfile, GenPreset, Role } from '../../types';
import { activePreset, getState } from '../../store';
import { apiForProfile, generate, type ChatMsg, type GenResult } from '../api';
import { tr } from '../i18n';

const ROLES: Role[] = ['system', 'user', 'assistant'];
const role = (r: unknown): Role => (ROLES.includes(r as Role) ? (r as Role) : 'user');

/** Сообщения ST ({ role, content }) или строка → сообщения Divinax. */
export function toChatMsgs(prompt: unknown): ChatMsg[] {
  if (Array.isArray(prompt)) return prompt.map((m: any) => ({ role: role(m?.role), content: String(m?.content ?? '') }));
  const text = String(prompt ?? '');
  return text ? [{ role: 'user', content: text }] : [];
}

/** Один запрос к модели без промпта чата: как есть, без стриминга. */
export async function rawGenerate(o: { messages: ChatMsg[]; api?: ApiSettings; preset?: GenPreset; maxTokens?: number; signal?: AbortSignal | null }): Promise<GenResult> {
  const s = getState();
  const api = o.api ?? s.api;
  const preset = { ...(o.preset ?? activePreset(s)), stream: false, swipes: 1 };
  if (!o.messages.length) throw new Error(tr('Пустой запрос'));
  const chat = api.main === 'chat';
  return generate(api, {
    messages: chat ? o.messages : undefined,
    // текстовым API — простой склеенный текст: у запроса расширения нет своего instruct-шаблона
    prompt: chat ? undefined : o.messages.map((m) => m.content).join('\n\n') + '\n\n',
    preset,
    stop: [],
    signal: o.signal ?? new AbortController().signal,
    stream: false,
    maxTokens: o.maxTokens && o.maxTokens > 0 ? o.maxTokens : undefined,
  });
}

/** Профиль подключения Divinax в виде профиля Connection Manager из ST. */
function stProfile(p: ConnectionProfile) {
  const s = getState();
  const api = p.main === 'chat' ? p.chatSource : p.main === 'text' ? p.textSource : p.main;
  return {
    id: p.id,
    name: p.name,
    mode: p.main === 'chat' ? 'cc' : 'tc',
    api,
    model: p.model,
    preset: s.presets.find((x) => x.id === p.presetId)?.name,
    'api-url': p.url,
  };
}

export const stProfiles = () => getState().profiles.map(stProfile);

export const ConnectionManagerRequestService = {
  defaultSendRequestParams: { stream: false, signal: null, extractData: true, includePreset: true, includeInstruct: true, instructSettings: {} },
  getAllowedTypes: () => ({ openai: 'Chat Completion', textgenerationwebui: 'Text Completion' }),
  getSupportedProfiles: stProfiles,
  isProfileSupported: (p: unknown) => Boolean(p && (p as { api?: string }).api),
  getProfile(id: string) {
    const p = stProfiles().find((x) => x.id === id);
    if (!p) throw new Error(`Profile not found (ID: ${id})`);
    return p;
  },
  validateProfile(p: unknown) {
    if (!p) throw new Error('Could not find profile.');
    return { selected: (p as { mode?: string }).mode === 'tc' ? 'textgenerationwebui' : 'openai' };
  },
  /** sendRequest(профиль, промпт, maxTokens, { signal, extractData, includePreset }, { model, … }) */
  async sendRequest(profileId: string, prompt: unknown, maxTokens?: number, custom: Record<string, any> = {}, override: Record<string, any> = {}) {
    const s = getState();
    const p = s.profiles.find((x) => x.id === profileId);
    if (!p) throw new Error(`Profile not found (ID: ${profileId})`);
    let api = apiForProfile(s.api, p, typeof override.model === 'string' ? override.model : undefined);
    // прокси в Divinax общий, профиль его не хранит: для чужого источника он скорее помешает
    if (p.main !== s.api.main || p.chatSource !== s.api.chatSource) api = { ...api, proxyPresetId: '' };
    const own = custom.includePreset !== false && p.presetId ? s.presets.find((x) => x.id === p.presetId) : undefined;
    let preset = own ?? activePreset(s);
    if (typeof override.temperature === 'number') preset = { ...preset, temperature: override.temperature };
    const res = await rawGenerate({ messages: toChatMsgs(prompt), api, preset, maxTokens, signal: custom.signal });
    if (custom.extractData === false) return { model: res.model, choices: [{ message: { content: res.text, reasoning: res.reasoning } }] };
    return { content: res.text, reasoning: res.reasoning };
  },
};
