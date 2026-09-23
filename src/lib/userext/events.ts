// Шина событий для сторонних расширений — повторяет eventSource из SillyTavern.
type Listener = (...args: any[]) => unknown;

/** Имена событий ST. Неизвестные ключи превращаются в snake_case, как их пишет ST. */
const KNOWN: Record<string, string> = {
  APP_READY: 'app_ready',
  EXTRAS_CONNECTED: 'extras_connected',
  MESSAGE_SWIPED: 'message_swiped',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_UPDATED: 'message_updated',
  IMPERSONATE_READY: 'impersonate_ready',
  CHAT_CHANGED: 'chat_id_changed',
  GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
  GENERATION_STARTED: 'generation_started',
  GENERATION_STOPPED: 'generation_stopped',
  GENERATION_ENDED: 'generation_ended',
  EXTENSIONS_FIRST_LOAD: 'extensions_first_load',
  EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',
  SETTINGS_LOADED: 'settings_loaded',
  SETTINGS_UPDATED: 'settings_updated',
  GROUP_UPDATED: 'group_updated',
  MOVABLE_PANELS_RESET: 'movable_panels_reset',
  SETTINGS_LOADED_BEFORE: 'settings_loaded_before',
  SETTINGS_LOADED_AFTER: 'settings_loaded_after',
  CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',
  CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',
  OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',
  OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',
  WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
  WORLDINFO_UPDATED: 'worldinfo_updated',
  CHARACTER_EDITED: 'character_edited',
  CHARACTER_PAGE_LOADED: 'character_page_loaded',
  CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE: 'character_group_overlay_state_change_before',
  CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER: 'character_group_overlay_state_change_after',
  USER_MESSAGE_RENDERED: 'user_message_rendered',
  CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
  FORCE_SET_BACKGROUND: 'force_set_background',
  CHAT_DELETED: 'chat_deleted',
  CHAT_CREATED: 'chat_created',
  GROUP_CHAT_DELETED: 'group_chat_deleted',
  GROUP_CHAT_CREATED: 'group_chat_created',
  GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',
  GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',
  GENERATE_AFTER_DATA: 'generate_after_data',
  GROUP_MEMBER_DRAFTED: 'group_member_drafted',
  WORLD_INFO_ACTIVATED: 'world_info_activated',
  TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',
  CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
  CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
  CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',
  CHARACTER_DELETED: 'characterDeleted',
  CHARACTER_DUPLICATED: 'character_duplicated',
  STREAM_TOKEN_RECEIVED: 'stream_token_received',
  FILE_ATTACHMENT_DELETED: 'file_attachment_deleted',
  WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',
  OPEN_CHARACTER_LIBRARY: 'open_character_library',
  ONLINE_STATUS_CHANGED: 'online_status_changed',
  IMAGE_SWIPED: 'image_swiped',
  CONNECTION_PROFILE_LOADED: 'connection_profile_loaded',
  TOOL_CALLS_PERFORMED: 'tool_calls_performed',
  TOOL_CALLS_RENDERED: 'tool_calls_rendered',
};

export const event_types: Record<string, string> = new Proxy(KNOWN, {
  get: (t, k) => (typeof k === 'string' ? (t[k] ?? k.toLowerCase()) : undefined),
});

class EventEmitter {
  private events = new Map<string, Listener[]>();
  private autoFire = new Map<string, unknown[]>();

  on(event: string, fn: Listener) {
    const list = this.events.get(event) ?? [];
    list.push(fn);
    this.events.set(event, list);
    // APP_READY и подобные: если событие уже было, слушатель получает его сразу
    if (this.autoFire.has(event)) void Promise.resolve().then(() => fn(...(this.autoFire.get(event) ?? [])));
  }
  makeLast(event: string, fn: Listener) {
    this.on(event, fn);
  }
  makeFirst(event: string, fn: Listener) {
    const list = this.events.get(event) ?? [];
    list.unshift(fn);
    this.events.set(event, list);
  }
  once(event: string, fn: Listener) {
    const wrap: Listener = (...a) => {
      this.removeListener(event, wrap);
      return fn(...a);
    };
    this.on(event, wrap);
  }
  removeListener(event: string, fn: Listener) {
    const list = this.events.get(event);
    if (list) this.events.set(event, list.filter((x) => x !== fn));
  }
  off(event: string, fn: Listener) {
    this.removeListener(event, fn);
  }
  /** Как в ST: слушатели вызываются по очереди, каждый дожидается предыдущего. */
  async emit(event: string, ...args: unknown[]) {
    for (const fn of [...(this.events.get(event) ?? [])]) {
      try {
        await fn(...args);
      } catch (e) {
        console.error(`[Divinax] ошибка в обработчике ${event}:`, e);
      }
    }
  }
  emitAndWait(event: string, ...args: unknown[]) {
    for (const fn of [...(this.events.get(event) ?? [])]) {
      try {
        fn(...args);
      } catch (e) {
        console.error(`[Divinax] ошибка в обработчике ${event}:`, e);
      }
    }
  }
  /** Событие, которое срабатывает и для слушателей, подписавшихся позже. */
  fireOnce(event: string, ...args: unknown[]) {
    this.autoFire.set(event, args);
    return this.emit(event, ...args);
  }
  get hasListeners() {
    return this.events.size > 0;
  }
}

export const eventSource = new EventEmitter();

/** Быстрая проверка перед подготовкой аргументов события. */
export const extActive = () => eventSource.hasListeners;
