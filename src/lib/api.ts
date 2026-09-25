import { tr } from './i18n';
// Клиенты API: Chat Completion (OpenAI-совместимые, Claude), Text Completion, KoboldAI, AI Horde, NovelAI.
import type { ApiSettings, ChatSource, ConnectionProfile, GenPreset, MainApi, Role, TextSource } from '../types';
import { sleep } from './util';

export interface ChatMsg {
  role: Role;
  content: string;
  name?: string;
  images?: string[];
}

export interface GenRequest {
  messages?: ChatMsg[];
  prompt?: string;
  preset: GenPreset;
  stop: string[];
  signal: AbortSignal;
  stream: boolean;
  onDelta?: (text: string, reasoning: string) => void;
  maxTokens?: number;
}

export interface GenResult {
  text: string;
  reasoning: string;
  model: string;
}

export const CHAT_SOURCES: { id: ChatSource; name: string; base: string; keyUrl?: string }[] = [
  { id: 'openrouter', name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'claude', name: 'Anthropic Claude', base: 'https://api.anthropic.com/v1', keyUrl: 'https://console.anthropic.com/' },
  { id: 'google', name: 'Google AI Studio (Gemini)', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/' },
  { id: 'mistral', name: 'Mistral AI', base: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/' },
  { id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  { id: 'xai', name: 'xAI (Grok)', base: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai/' },
  { id: 'custom', name: 'Свой OpenAI-совместимый', base: '' },
];

export const TEXT_SOURCES: { id: TextSource; name: string }[] = [
  { id: 'koboldcpp', name: 'KoboldCpp' },
  { id: 'llamacpp', name: 'llama.cpp' },
  { id: 'ooba', name: 'Text Generation WebUI (ooba)' },
  { id: 'tabby', name: 'TabbyAPI' },
  { id: 'vllm', name: 'vLLM' },
  { id: 'ollama', name: 'Ollama' },
  { id: 'generic', name: 'Другой OpenAI-совместимый' },
];

export const NOVEL_MODELS = ['llama-3-erato-v1', 'kayra-v1', 'clio-v1'];

export const MAIN_API_LABELS: Record<MainApi, string> = {
  chat: 'Chat Completion',
  text: 'Text Completion',
  novel: 'NovelAI',
  horde: 'AI Horde',
  kobold: 'KoboldAI',
};

export function sourceName(api: ApiSettings): string {
  switch (api.main) {
    case 'chat':
      return tr(CHAT_SOURCES.find((s) => s.id === api.chatSource)?.name ?? api.chatSource);
    case 'text':
      return tr(TEXT_SOURCES.find((s) => s.id === api.textSource)?.name ?? api.textSource);
    default:
      return MAIN_API_LABELS[api.main];
  }
}

/** Ключ модели в api.models для текущего API. */
export function modelKey(api: ApiSettings): string {
  if (api.main === 'chat') return api.chatSource;
  if (api.main === 'text') return 'text:' + api.textSource;
  return api.main;
}

export const currentModel = (api: ApiSettings) => api.models[modelKey(api)] ?? '';

/** Настройки API, как если бы был применён профиль (model — замена модели профиля). */
export function apiForProfile(api: ApiSettings, p: ConnectionProfile, model?: string): ApiSettings {
  const next = { ...api, main: p.main, chatSource: p.chatSource, textSource: p.textSource };
  const urls = { ...next.urls };
  if (p.url) {
    if (p.main === 'text') urls[p.textSource] = p.url;
    else if (p.main === 'kobold') urls.kobold = p.url;
    else if (p.chatSource === 'custom') urls.custom = p.url;
  }
  return { ...next, urls, models: { ...next.models, [modelKey(next)]: model || p.model } };
}

function chatEndpoint(api: ApiSettings): { base: string; key: string } {
  const proxy = api.proxies.find((p) => p.id === api.proxyPresetId);
  const src = CHAT_SOURCES.find((s) => s.id === api.chatSource)!;
  let base = api.chatSource === 'custom' ? api.urls.custom ?? '' : src.base;
  let key = api.keys[api.chatSource] ?? '';
  if (proxy && proxy.url) {
    base = proxy.url;
    if (proxy.password) key = proxy.password;
  }
  return { base: base.replace(/\/+$/, ''), key };
}

function textBase(api: ApiSettings): string {
  return (api.urls[api.textSource] ?? '').replace(/\/+$/, '');
}

async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  let detail = '';
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      detail = j.error?.message ?? j.message ?? j.detail ?? t;
    } catch {
      detail = t;
    }
  } catch {
    /* ignore */
  }
  throw new Error(`HTTP ${res.status}${detail ? ': ' + String(detail).slice(0, 400) : ''}`);
}

async function* sseLines(res: Response, signal: AbortSignal): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      if (signal.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.startsWith('data:')) yield line.slice(5).trimStart();
      }
    }
    if (buf.startsWith('data:')) yield buf.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}

// ── Chat Completion ──

function openaiBody(api: ApiSettings, req: GenRequest, model: string) {
  const p = req.preset;
  const body: Record<string, unknown> = {
    model,
    messages: req.messages!.map((m) => {
      if (m.images?.length && api.sendImages) {
        return {
          role: m.role,
          content: [{ type: 'text', text: m.content }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))],
        };
      }
      return { role: m.role, content: m.content, ...(m.name ? { name: m.name } : {}) };
    }),
    max_tokens: req.maxTokens ?? p.maxTokens,
    temperature: p.temperature,
    top_p: p.topP,
    frequency_penalty: p.freqPen,
    presence_penalty: p.presPen,
    stream: req.stream,
  };
  if (req.stop.length) body.stop = req.stop.slice(0, 4);
  if (p.seed >= 0) body.seed = p.seed;
  const src = api.chatSource;
  if (src === 'openrouter' || src === 'custom') {
    if (p.topK > 0) body.top_k = p.topK;
    if (p.minP > 0) body.min_p = p.minP;
    if (p.topA > 0) body.top_a = p.topA;
    if (p.repPen !== 1) body.repetition_penalty = p.repPen;
  }
  if (src === 'openrouter') {
    body.transforms = p.unlockedContext ? [] : ['middle-out'];
    if (p.reasoning) body.reasoning = p.reasoningEffort === 'auto' ? { enabled: true } : { effort: p.reasoningEffort === 'minimal' ? 'low' : p.reasoningEffort };
    else body.include_reasoning = false;
  } else if (p.reasoning && p.reasoningEffort !== 'auto' && (src === 'openai' || src === 'xai' || src === 'google')) {
    body.reasoning_effort = p.reasoningEffort;
  }
  if (src === 'mistral' || src === 'google') {
    delete body.frequency_penalty;
    delete body.presence_penalty;
  }
  if (src === 'openai' && /^(o\d|gpt-5)/.test(model)) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
    delete body.temperature;
    delete body.top_p;
  }
  return body;
}

async function openaiChat(api: ApiSettings, req: GenRequest): Promise<GenResult> {
  const { base, key } = chatEndpoint(api);
  if (!base) throw new Error(tr('Не указан адрес API'));
  const model = currentModel(api);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (api.chatSource === 'openrouter') {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'Divinax';
  }
  const res = await ensureOk(
    await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(openaiBody(api, req, model)), signal: req.signal }),
  );
  if (!req.stream) {
    const j = await res.json();
    const msg = j.choices?.[0]?.message ?? {};
    return { text: msg.content ?? j.choices?.[0]?.text ?? '', reasoning: msg.reasoning ?? msg.reasoning_content ?? '', model: j.model ?? model };
  }
  let text = '';
  let reasoning = '';
  let usedModel = model;
  for await (const line of sseLines(res, req.signal)) {
    if (line === '[DONE]') break;
    try {
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error.message ?? tr('Ошибка API'));
      if (j.model) usedModel = j.model;
      const d = j.choices?.[0]?.delta ?? {};
      if (d.content) text += d.content;
      if (d.reasoning) reasoning += d.reasoning;
      if (d.reasoning_content) reasoning += d.reasoning_content;
      req.onDelta?.(text, reasoning);
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  return { text, reasoning, model: usedModel };
}

async function claudeChat(api: ApiSettings, req: GenRequest): Promise<GenResult> {
  const { base, key } = chatEndpoint(api);
  const model = currentModel(api) || 'claude-sonnet-5';
  const p = req.preset;
  const msgs = req.messages!;
  // Ведущие system-сообщения уходят в поле system, остальные сливаются в чередование user/assistant
  const firstTurn = msgs.findIndex((x) => x.role !== 'system');
  const head = firstTurn < 0 ? msgs : msgs.slice(0, firstTurn);
  const tail = firstTurn < 0 ? [] : msgs.slice(firstTurn);
  const system = head.map((m) => m.content).join('\n\n');
  const rest: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of tail) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = m.content;
    const last = rest[rest.length - 1];
    if (last && last.role === role) last.content += '\n\n' + content;
    else rest.push({ role, content });
  }
  if (!rest.length || rest[0].role !== 'user') rest.unshift({ role: 'user', content: tr('[Начало]') });
  const body: Record<string, unknown> = {
    model,
    system,
    messages: rest,
    max_tokens: req.maxTokens ?? p.maxTokens,
    stream: req.stream,
  };
  if (p.reasoning) {
    const budget = { auto: 4096, minimal: 1024, low: 2048, medium: 4096, high: 12000 }[p.reasoningEffort];
    body.thinking = { type: 'enabled', budget_tokens: budget };
    body.max_tokens = (body.max_tokens as number) + budget;
  } else {
    body.temperature = Math.min(1, p.temperature);
    if (p.topK > 0) body.top_k = p.topK;
  }
  if (req.stop.length) body.stop_sequences = req.stop.filter((s) => s.trim());
  const res = await ensureOk(
    await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    }),
  );
  if (!req.stream) {
    const j = await res.json();
    const text = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const reasoning = (j.content ?? []).filter((b: any) => b.type === 'thinking').map((b: any) => b.thinking).join('');
    return { text, reasoning, model: j.model ?? model };
  }
  let text = '';
  let reasoning = '';
  for await (const line of sseLines(res, req.signal)) {
    try {
      const j = JSON.parse(line);
      if (j.type === 'error') throw new Error(j.error?.message ?? tr('Ошибка Claude'));
      if (j.type === 'content_block_delta') {
        if (j.delta?.type === 'text_delta') text += j.delta.text;
        if (j.delta?.type === 'thinking_delta') reasoning += j.delta.thinking;
        req.onDelta?.(text, reasoning);
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  return { text, reasoning, model };
}

// ── Text Completion ──

function samplerParams(p: GenPreset, maxTokens: number) {
  return {
    max_tokens: maxTokens,
    max_length: maxTokens,
    n_predict: maxTokens,
    num_predict: maxTokens,
    temperature: p.temperature,
    top_p: p.topP,
    top_k: p.topK,
    min_p: p.minP,
    top_a: p.topA,
    typical_p: p.typicalP,
    typical: p.typicalP,
    tfs: p.tfs,
    repetition_penalty: p.repPen,
    rep_pen: p.repPen,
    repeat_penalty: p.repPen,
    repetition_penalty_range: p.repPenRange,
    rep_pen_range: p.repPenRange,
    repeat_last_n: p.repPenRange,
    frequency_penalty: p.freqPen,
    presence_penalty: p.presPen,
    seed: p.seed,
    truncation_length: p.maxContext,
    max_context_length: p.maxContext,
    num_ctx: p.maxContext,
  };
}

async function textCompletion(api: ApiSettings, req: GenRequest): Promise<GenResult> {
  const base = textBase(api);
  if (!base) throw new Error(tr('Не указан адрес сервера'));
  const model = currentModel(api);
  const url = base.endsWith('/v1') ? `${base}/completions` : `${base}/v1/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = api.keys['text:' + api.textSource];
  if (key) headers.Authorization = `Bearer ${key}`;
  const body = {
    model: model || undefined,
    prompt: req.prompt,
    stream: req.stream,
    stop: req.stop,
    stop_sequence: req.stop,
    ...samplerParams(req.preset, req.maxTokens ?? req.preset.maxTokens),
  };
  const res = await ensureOk(await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal }));
  if (!req.stream) {
    const j = await res.json();
    return { text: j.choices?.[0]?.text ?? j.results?.[0]?.text ?? j.content ?? '', reasoning: '', model: j.model ?? model };
  }
  let text = '';
  for await (const line of sseLines(res, req.signal)) {
    if (line === '[DONE]') break;
    try {
      const j = JSON.parse(line);
      text += j.choices?.[0]?.text ?? j.content ?? j.token ?? '';
      req.onDelta?.(text, '');
    } catch {
      /* пропуск служебных строк */
    }
  }
  return { text, reasoning: '', model };
}

async function koboldClassic(api: ApiSettings, req: GenRequest): Promise<GenResult> {
  const base = (api.urls.kobold ?? '').replace(/\/+$/, '');
  const p = req.preset;
  const res = await ensureOk(
    await fetch(`${base}/api/v1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: req.prompt,
        max_length: req.maxTokens ?? p.maxTokens,
        max_context_length: p.maxContext,
        temperature: p.temperature,
        top_p: p.topP,
        top_k: p.topK,
        top_a: p.topA,
        typical: p.typicalP,
        tfs: p.tfs,
        rep_pen: p.repPen,
        rep_pen_range: p.repPenRange,
        min_p: p.minP,
        stop_sequence: req.stop,
        sampler_seed: p.seed >= 0 ? p.seed : undefined,
      }),
      signal: req.signal,
    }),
  );
  const j = await res.json();
  return { text: j.results?.[0]?.text ?? '', reasoning: '', model: currentModel(api) };
}

const HORDE = 'https://aihorde.net/api/v2';

async function horde(api: ApiSettings, req: GenRequest): Promise<GenResult> {
  const p = req.preset;
  const key = api.keys.horde || '0000000000';
  const res = await ensureOk(
    await fetch(`${HORDE}/generate/text/async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, 'Client-Agent': 'Divinax:0.1:github.com/jellysilly/Divinax' },
      body: JSON.stringify({
        prompt: req.prompt,
        params: {
          max_length: Math.min(512, req.maxTokens ?? p.maxTokens),
          max_context_length: Math.min(p.maxContext, 8192),
          temperature: p.temperature,
          top_p: p.topP,
          top_k: p.topK,
          top_a: p.topA,
          typical: p.typicalP,
          tfs: p.tfs,
          rep_pen: p.repPen,
          rep_pen_range: p.repPenRange,
          min_p: p.minP,
          stop_sequence: req.stop,
          n: 1,
        },
        models: api.hordeModels,
        trusted_workers: api.hordeTrusted,
      }),
      signal: req.signal,
    }),
  );
  const { id } = await res.json();
  const cancel = () => void fetch(`${HORDE}/generate/text/status/${id}`, { method: 'DELETE' });
  req.signal.addEventListener('abort', cancel);
  while (!req.signal.aborted) {
    await sleep(2500);
    const s = await (await fetch(`${HORDE}/generate/text/status/${id}`, { signal: req.signal })).json();
    if (s.faulted) throw new Error(tr('Horde: генерация не удалась'));
    if (s.done && s.generations?.length) {
      const g = s.generations[0];
      return { text: g.text ?? '', reasoning: '', model: g.model ?? '' };
    }
    req.onDelta?.('', tr('В очереди: позиция {0}, ожидание ~{1} с', s.queue_position ?? '?', s.wait_time ?? '?'));
  }
  throw new DOMException('Aborted', 'AbortError');
}

async function novel(api: ApiSettings, req: GenRequest): Promise<GenResult> {
  const p = req.preset;
  const model = currentModel(api) || NOVEL_MODELS[0];
  const res = await ensureOk(
    await fetch('https://text.novelai.net/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.keys.novel ?? ''}` },
      body: JSON.stringify({
        input: req.prompt,
        model,
        parameters: {
          use_string: true,
          temperature: p.temperature,
          max_length: Math.min(150, req.maxTokens ?? p.maxTokens),
          min_length: 1,
          top_k: p.topK,
          top_p: p.topP,
          top_a: p.topA,
          typical_p: p.typicalP,
          tail_free_sampling: p.tfs,
          min_p: p.minP,
          repetition_penalty: p.repPen,
          repetition_penalty_range: p.repPenRange,
          repetition_penalty_frequency: p.freqPen,
          repetition_penalty_presence: p.presPen,
          generate_until_sentence: true,
        },
      }),
      signal: req.signal,
    }),
  );
  const j = await res.json();
  return { text: j.output ?? '', reasoning: '', model };
}

export function isChatApi(api: ApiSettings) {
  return api.main === 'chat';
}

export async function generate(api: ApiSettings, req: GenRequest): Promise<GenResult> {
  switch (api.main) {
    case 'chat':
      return api.chatSource === 'claude' ? claudeChat(api, req) : openaiChat(api, req);
    case 'text':
      return textCompletion(api, req);
    case 'kobold':
      return koboldClassic(api, req);
    case 'horde':
      return horde(api, req);
    case 'novel':
      return novel(api, req);
  }
}

export interface ModelInfo {
  id: string;
  name?: string;
  context?: number;
  paid?: boolean;
}

/** Проверка соединения и загрузка списка моделей. */
export async function fetchModels(api: ApiSettings, signal?: AbortSignal): Promise<ModelInfo[]> {
  switch (api.main) {
    case 'chat': {
      const { base, key } = chatEndpoint(api);
      if (!base) throw new Error(tr('Не указан адрес API'));
      if (api.chatSource === 'claude') {
        const res = await ensureOk(
          await fetch(`${base}/models?limit=100`, {
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            signal,
          }),
        );
        const j = await res.json();
        return (j.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name }));
      }
      const headers: Record<string, string> = {};
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await ensureOk(await fetch(`${base}/models`, { headers, signal }));
      const j = await res.json();
      const list: any[] = j.data ?? j.models ?? [];
      if (api.chatSource === 'openrouter' && key) {
        // проверим ключ отдельным запросом: /models открыт без авторизации
        await ensureOk(await fetch(`${base}/key`, { headers, signal }));
      }
      return list
        .map((m) => ({
          id: String(m.id ?? m.name ?? '').replace(/^models\//, ''),
          name: m.name,
          context: m.context_length,
          paid: m.pricing ? Number(m.pricing.prompt) > 0 || Number(m.pricing.completion) > 0 : undefined,
        }))
        .filter((m) => m.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    }
    case 'text': {
      const base = textBase(api);
      const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
      const headers: Record<string, string> = {};
      const key = api.keys['text:' + api.textSource];
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await ensureOk(await fetch(url, { headers, signal }));
      const j = await res.json();
      return (j.data ?? j.models ?? []).map((m: any) => ({ id: String(m.id ?? m.name ?? m.model) }));
    }
    case 'kobold': {
      const base = (api.urls.kobold ?? '').replace(/\/+$/, '');
      const j = await (await ensureOk(await fetch(`${base}/api/v1/model`, { signal }))).json();
      return [{ id: String(j.result ?? 'kobold') }];
    }
    case 'horde': {
      const j = await (await ensureOk(await fetch(`${HORDE}/status/models?type=text`, { signal }))).json();
      return (j as any[])
        .sort((a, b) => b.count - a.count)
        .map((m) => ({ id: m.name, name: tr('{0} · {1} воркер(ов)', m.name, m.count), context: m.max_context_length }));
    }
    case 'novel': {
      if (!api.keys.novel) throw new Error(tr('Нужен ключ NovelAI'));
      await ensureOk(
        await fetch('https://api.novelai.net/user/subscription', { headers: { Authorization: `Bearer ${api.keys.novel}` }, signal }),
      );
      return NOVEL_MODELS.map((id) => ({ id }));
    }
  }
}
