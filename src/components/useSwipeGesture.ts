// Жест смахивания по сообщению (только касания и стилус, мышь не трогаем — ей выделяют текст).
// Влево — следующий вариант (на последнем варианте последнего ответа — новый), вправо — предыдущий.
import { useEffect, useRef, type RefObject } from 'react';

export interface SwipeOptions {
  enabled: boolean;
  /** Можно ли уйти в эту сторону: -1 — предыдущий вариант, 1 — следующий/новый. */
  canGo: (dir: -1 | 1) => boolean;
  /** Подпись подсказки во время жеста. */
  /** Что покажет значок: новый вариант, следующий или предыдущий, и короткая подпись («3/3», «новый»). */
  hint: (dir: -1 | 1) => { kind: 'new' | 'next' | 'prev'; text: string };
  onSwipe: (dir: -1 | 1) => void;
}

const LOCK = 12; // px до решения, горизонтальный это жест или прокрутка
const MAX_SHIFT = 76; // насколько сообщение уезжает за пальцем
const BADGE = 46; // ширина значка: он показывается только в освободившемся месте, не поверх текста

/** Внутри горизонтально прокручиваемого блока (таблица, код) жест не начинаем. */
function inHorizontalScroller(el: Element | null, stop: Element): boolean {
  for (let e = el; e && e !== stop; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 2) {
      const ox = getComputedStyle(e).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

export function useSwipeGesture(root: RefObject<HTMLElement | null>, hint: RefObject<HTMLElement | null>, opts: SwipeOptions) {
  // обработчики вешаются один раз, актуальные параметры читаются через ref
  const o = useRef(opts);
  o.current = opts;

  useEffect(() => {
    const el = root.current;
    if (!el || !opts.enabled) return;
    let start: { x: number; y: number; id: number } | null = null;
    let locked = false;
    let dx = 0;
    let suppressClick = 0; // время, до которого глотаем клик после жеста

    const setVisual = (shift: number, dir: -1 | 1 | 0, ready: boolean) => {
      const h = hint.current;
      // сдвигаем всё сообщение (аватар и текст), кроме подсказки
      for (const c of moving()) c.style.transform = shift ? `translateX(${shift}px)` : '';
      if (h) {
        // значок проявляется, когда под него открылось место (с запасом на отступ сообщения)
        const room = Math.min(1, Math.max(0, (Math.abs(shift) + 12 - BADGE) / 16));
        h.style.opacity = dir ? String(room * (ready ? 1 : 0.6)) : '0';
        h.classList.toggle('ready', ready);
        // при скрытии подсказка гаснет на месте: сторону и вид меняем только пока жест идёт
        if (dir) {
          // сообщение уезжает от подсказки: влево (следующий) — подсказка справа
          h.classList.toggle('right', dir === 1);
          const { kind, text } = o.current.hint(dir);
          h.dataset.kind = kind;
          const lbl = h.querySelector('small');
          if (lbl) lbl.textContent = text;
        }
      }
    };

    const reset = (animate: boolean) => {
      const items = moving();
      for (const c of items) c.style.transition = animate ? 'transform 0.22s ease' : '';
      setVisual(0, 0, false);
      if (animate) setTimeout(() => items.forEach((c) => (c.style.transition = '')), 240);
      start = null;
      locked = false;
      dx = 0;
    };

    const moving = () => Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c !== hint.current);

    const threshold = () => Math.max(60, Math.min(140, el.clientWidth * 0.2));

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      const t = e.target as Element;
      if (t.closest('input, textarea, select, button, a, summary, iframe, .msg-tools, .swipes, [data-no-swipe]') || inHorizontalScroller(t, el)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      locked = false;
      dx = 0;
    };

    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const ddx = e.clientX - start.x;
      const ddy = e.clientY - start.y;
      if (!locked) {
        if (Math.abs(ddy) > LOCK && Math.abs(ddy) >= Math.abs(ddx)) {
          start = null; // вертикальная прокрутка — не наш жест
          return;
        }
        if (Math.abs(ddx) < LOCK || Math.abs(ddx) < Math.abs(ddy) * 1.3) return;
        locked = true;
        // подсказка — на высоте пальца: в длинном ответе середина сообщения может быть за экраном
        const h = hint.current;
        if (h) {
          const r = el.getBoundingClientRect();
          h.style.top = `${Math.max(24, Math.min(r.height - 24, start.y - r.top))}px`;
        }
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* элемент мог исчезнуть */
        }
      }
      dx = ddx;
      const dir: -1 | 1 = dx < 0 ? 1 : -1;
      const can = o.current.canGo(dir);
      // куда нельзя — лишь слегка тянется, чтобы было понятно, что жест распознан
      const shift = can ? Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx * 0.6)) : dx * 0.12;
      setVisual(shift, can ? dir : 0, can && Math.abs(dx) >= threshold());
    };

    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const wasLocked = locked;
      const dir: -1 | 1 = dx < 0 ? 1 : -1;
      const fire = wasLocked && Math.abs(dx) >= threshold() && o.current.canGo(dir);
      if (wasLocked) suppressClick = Date.now() + 400;
      reset(true);
      if (fire) {
        navigator.vibrate?.(8);
        o.current.onSwipe(dir);
      }
    };

    const cancel = () => start && reset(true);
    // клик после жеста не должен открывать ссылки/плашки под пальцем
    const click = (e: MouseEvent) => {
      if (Date.now() < suppressClick) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('click', click, true);
      reset(false);
    };
  }, [root, hint, opts.enabled]);
}
