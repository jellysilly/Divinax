import type { RegexScript } from '../types';
import { parseRegex, uid } from './util';

export function blankRegex(): RegexScript {
  return {
    id: uid(),
    name: 'Новый скрипт',
    find: '',
    replace: '',
    flags: 'g',
    enabled: true,
    onInput: false,
    onOutput: true,
    onPrompt: false,
    displayOnly: false,
    minDepth: null,
    maxDepth: null,
  };
}

function compile(r: RegexScript): RegExp | null {
  if (!r.find) return null;
  const lit = parseRegex(r.find);
  if (lit) return lit;
  try {
    return new RegExp(r.find, r.flags || 'g');
  } catch {
    return null;
  }
}

/**
 * target:
 *  - 'store'   — меняет сохранённый текст (не displayOnly и не onPrompt)
 *  - 'display' — только при показе (displayOnly)
 *  - 'prompt'  — только в промпте (onPrompt)
 */
export function applyRegex(
  scripts: RegexScript[],
  text: string,
  o: { isUser: boolean; depth?: number; target: 'store' | 'display' | 'prompt' },
): string {
  let out = text;
  for (const r of scripts) {
    if (!r.enabled) continue;
    if (o.isUser ? !r.onInput : !r.onOutput) continue;
    const kind = r.displayOnly ? 'display' : r.onPrompt ? 'prompt' : 'store';
    if (kind !== o.target) continue;
    if (o.depth != null) {
      if (r.minDepth != null && o.depth < r.minDepth) continue;
      if (r.maxDepth != null && o.depth > r.maxDepth) continue;
    }
    const re = compile(r);
    if (!re) continue;
    out = out.replace(re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      return r.replace.replace(/\$(\d+|&)/g, (_m, g: string) => (g === '&' ? groups[0] : groups[+g] ?? ''));
    });
  }
  return out;
}

/** Импорт скрипта в формате SillyTavern. */
export function regexFromST(raw: Record<string, any>): RegexScript {
  const r = blankRegex();
  r.name = String(raw.scriptName ?? raw.name ?? 'Скрипт');
  r.find = String(raw.findRegex ?? raw.find ?? '');
  r.replace = String(raw.replaceString ?? raw.replace ?? '');
  r.enabled = !raw.disabled;
  const placement: number[] = raw.placement ?? [];
  r.onInput = placement.includes(1);
  r.onOutput = placement.includes(2);
  r.displayOnly = Boolean(raw.markdownOnly);
  r.onPrompt = Boolean(raw.promptOnly);
  r.minDepth = typeof raw.minDepth === 'number' ? raw.minDepth : null;
  r.maxDepth = typeof raw.maxDepth === 'number' ? raw.maxDepth : null;
  return r;
}

export function regexToST(r: RegexScript) {
  return {
    id: r.id,
    scriptName: r.name,
    findRegex: r.find,
    replaceString: r.replace,
    trimStrings: [],
    placement: [...(r.onInput ? [1] : []), ...(r.onOutput ? [2] : [])],
    disabled: !r.enabled,
    markdownOnly: r.displayOnly,
    promptOnly: r.onPrompt,
    runOnEdit: true,
    substituteRegex: 0,
    minDepth: r.minDepth,
    maxDepth: r.maxDepth,
  };
}
