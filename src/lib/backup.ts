import { tr } from './i18n';
// Экспорт/импорт настроек и полная резервная копия.
import { getState, setState, toast, type PersistedState } from '../store';
import { download } from './util';

const SETTINGS_KEYS: (keyof PersistedState)[] = [
  'presets',
  'activePresetId',
  'contextTemplates',
  'instructTemplates',
  'sysPrompts',
  'format',
  'api',
  'profiles',
  'wi',
  'ui',
  'ext',
];

const DATA_KEYS: (keyof PersistedState)[] = [
  'characters',
  'groups',
  'chats',
  'personas',
  'lorebooks',
  'defaultPersonaId',
  'charPersona',
  'lastChatByOwner',
  'activeChatId',
];

export function exportSettings(full: boolean) {
  const s = getState();
  const out: Record<string, unknown> = { divinax: 1, kind: full ? 'backup' : 'settings', date: new Date().toISOString() };
  for (const k of full ? [...SETTINGS_KEYS, ...DATA_KEYS] : SETTINGS_KEYS) out[k] = s[k];
  // ключи API никогда не попадают в файл
  out.api = { ...s.api, keys: {}, proxies: s.api.proxies.map((p) => ({ ...p, password: '' })) };
  const stamp = new Date().toISOString().slice(0, 10);
  download(full ? `divinax-backup-${stamp}.json` : `divinax-settings-${stamp}.json`, JSON.stringify(out));
}

export function importSettings(json: Record<string, unknown>) {
  if (!json || json.divinax !== 1) throw new Error(tr('Это не файл настроек Divinax'));
  const patch: Partial<PersistedState> = {};
  const s = getState();
  for (const k of [...SETTINGS_KEYS, ...DATA_KEYS]) {
    if (!(k in json)) continue;
    (patch as Record<string, unknown>)[k] = json[k];
  }
  if (patch.api) patch.api = { ...patch.api, keys: s.api.keys }; // сохраняем свои ключи
  if (json.kind === 'backup') {
    // объединяем, а не затираем
    patch.characters = { ...s.characters, ...(patch.characters ?? {}) };
    patch.groups = { ...s.groups, ...(patch.groups ?? {}) };
    patch.chats = { ...s.chats, ...(patch.chats ?? {}) };
    patch.personas = { ...s.personas, ...(patch.personas ?? {}) };
    patch.lorebooks = { ...s.lorebooks, ...(patch.lorebooks ?? {}) };
  }
  setState(patch);
  toast(json.kind === 'backup' ? tr('Резервная копия восстановлена') : tr('Настройки импортированы'), 'success');
}
