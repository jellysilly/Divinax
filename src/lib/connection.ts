import { getState, setState, toast } from '../store';
import { fetchModels, modelKey, sourceName, type ModelInfo } from './api';

let ctrl: AbortController | null = null;
export let modelInfo: ModelInfo[] = [];

export async function connect(silent = false): Promise<boolean> {
  ctrl?.abort();
  ctrl = new AbortController();
  const api = getState().api;
  setState({ conn: { ...getState().conn, status: 'connecting', message: 'Подключение…' } });
  try {
    const models = api.skipStatusCheck ? [] : await fetchModels(api, ctrl.signal);
    modelInfo = models;
    const shown = api.showPaid ? models : models.filter((m) => m.paid !== true);
    setState({
      conn: { status: 'ok', message: `Подключено · ${sourceName(api)}`, models: shown.map((m) => m.id), checkedAt: Date.now() },
    });
    // если модель не выбрана — берём первую
    const key = modelKey(api);
    if (!api.models[key] && shown[0]) setState((s) => ({ api: { ...s.api, models: { ...s.api.models, [key]: shown[0].id } } }));
    if (!silent) toast(`Подключено: ${sourceName(api)}`, 'success');
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
    const msg = (e as Error).message || 'Ошибка сети';
    setState({ conn: { status: 'error', message: msg, models: getState().conn.models } });
    if (!silent) toast('Не удалось подключиться: ' + msg + hintFor(msg), 'error');
    return false;
  }
}

function hintFor(msg: string): string {
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg))
    return '. Проверьте адрес и CORS: локальным серверам нужен флаг вроде --cors / OLLAMA_ORIGINS=*';
  if (/401|403/.test(msg)) return '. Проверьте API-ключ';
  return '';
}

export function disconnect() {
  ctrl?.abort();
  setState({ conn: { status: 'idle', message: 'Не подключено', models: [] } });
}

export function contextSize(): number | undefined {
  const s = getState();
  const id = s.api.models[modelKey(s.api)];
  return modelInfo.find((m) => m.id === id)?.context;
}
