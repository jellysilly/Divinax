// Вставки в промпт от сторонних расширений (setExtensionPrompt из SillyTavern).
import type { Role } from '../types';

/** Позиции как в ST: 0 — в промпт (после описаний), 1 — в чат на глубину, 2 — перед промптом, -1 — выключено. */
export const EXT_PROMPT_TYPES = { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 } as const;
export const EXT_PROMPT_ROLES = { SYSTEM: 0, USER: 1, ASSISTANT: 2 } as const;

export interface ExtPrompt {
  value: string;
  position: number;
  depth: number;
  role: Role;
  scan: boolean;
}

export const extensionPrompts = new Map<string, ExtPrompt>();

export function setExtensionPrompt(key: string, value: string, position = 0, depth = 4, scan = false, role = 0) {
  if (!value) {
    extensionPrompts.delete(key);
    return;
  }
  extensionPrompts.set(key, {
    value: String(value),
    position: Number(position),
    depth: Math.max(0, Number(depth) || 0),
    role: (['system', 'user', 'assistant'] as Role[])[Number(role)] ?? 'system',
    scan: Boolean(scan),
  });
}

/** Вставки для сборки промпта, отсортированные по ключу (как в ST). */
export function extPromptsAt(position: number): ExtPrompt[] {
  return [...extensionPrompts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, p]) => p)
    .filter((p) => p.position === position && p.value.trim());
}
