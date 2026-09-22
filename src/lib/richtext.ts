// Рендер сообщений с HTML/CSS (плашки, статусы, HUD) и JavaScript.
// HTML очищается DOMPurify и показывается в Shadow DOM (стили сообщения не ломают интерфейс).
// Код со <script> или целые HTML-документы выполняются в iframe-песочнице без доступа к данным Divinax.
import DOMPurify from 'dompurify';
import { renderMessage } from './markdown';

export interface Rendered {
  html: string;
  frames: string[]; // исходники для iframe
  rich: boolean; // нужен Shadow DOM (есть HTML или фреймы)
}

const FRAME_MARK = (i: number) => `\u0000DXFRAME${i}\u0000`;
const FRAME_DIV = (i: number) => `<div data-dx-frame="${i}"></div>`;
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const HAS_TAG = /<\/?[a-zA-Z][\w:-]*(?:\s[^<>]*)?\/?>/;
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track']);
const RAW = new Set(['style', 'script', 'textarea', 'pre', 'code', 'svg']);
const BLOCK = new Set([
  'div', 'p', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'details', 'summary', 'style', 'script', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre',
  'hr', 'br', 'figure', 'figcaption', 'center', 'fieldset', 'svg', 'img', 'progress', 'meter',
]);

function inline(s: string): string {
  return s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(«[^»\n<]*»|"[^"\n<]*"|“[^”\n<]*”)/g, '<q>$1</q>');
}

const escText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Текст с HTML: разметка и переносы строк работают только вне HTML-блоков. */
function renderMixed(src: string): string {
  let out = '';
  let depth = 0;
  let last = 0;
  let prevBlock = true;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  // Разбор идёт в две стадии: сначала токены, затем вывод с учётом соседних блочных тегов
  const tokens: ({ kind: 'text'; text: string; depth: number } | { kind: 'tag'; raw: string; block: boolean })[] = [];
  while ((m = TAG.exec(src))) {
    if (m.index > last) tokens.push({ kind: 'text', text: src.slice(last, m.index), depth });
    const raw = m[0];
    const closing = m[1] === '/';
    const name = (m[2] ?? '').toLowerCase();
    const selfClose = m[4] === '/' || VOID.has(name);
    if (raw.startsWith('<!--')) {
      last = TAG.lastIndex;
      continue;
    }
    tokens.push({ kind: 'tag', raw, block: BLOCK.has(name) });
    if (!closing && RAW.has(name) && !selfClose) {
      // содержимое <style>, <pre>, <svg>… берём как есть до закрывающего тега
      const endRe = new RegExp(`</${name}\\s*>`, 'i');
      const rest = src.slice(TAG.lastIndex);
      const em = endRe.exec(rest);
      const body = em ? rest.slice(0, em.index) : rest;
      tokens.push({ kind: 'tag', raw: body, block: false });
      if (em) tokens.push({ kind: 'tag', raw: em[0], block: true });
      TAG.lastIndex += em ? em.index + em[0].length : rest.length;
      last = TAG.lastIndex;
      continue;
    }
    if (closing) depth = Math.max(0, depth - 1);
    else if (!selfClose) depth++;
    last = TAG.lastIndex;
  }
  if (last < src.length) tokens.push({ kind: 'text', text: src.slice(last), depth });

  tokens.forEach((t, i) => {
    if (t.kind === 'tag') {
      out += t.raw;
      prevBlock = t.block;
      return;
    }
    let text = t.text;
    if (t.depth > 0) {
      out += inline(escText(text));
      prevBlock = false;
      return;
    }
    const next = tokens[i + 1];
    if (prevBlock) text = text.replace(/^[ \t]*\n+/, '');
    if (next && next.kind === 'tag' && next.block) text = text.replace(/\n+[ \t]*$/, '');
    out += inline(escText(text))
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
    prevBlock = false;
  });
  return out;
}

const PURIFY = {
  ADD_TAGS: ['style'],
  ADD_ATTR: ['target', 'open'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'form', 'frame', 'frameset'],
  FORCE_BODY: true,
  ALLOW_DATA_ATTR: true,
};

function sanitize(html: string): string {
  return String(DOMPurify.sanitize(html, PURIFY));
}

/** Разметка текста с HTML: блоки ``` — как код, остальное — renderMixed. */
function renderFenced(src: string): string {
  return src
    .split(/```/)
    .map((part, i) => {
      if (i % 2 === 1) {
        const nl = part.indexOf('\n');
        const body = nl >= 0 && /^[\w+-]*$/.test(part.slice(0, nl)) ? part.slice(nl + 1) : part;
        return `<pre><code>${escText(body.replace(/\n$/, ''))}</code></pre>`;
      }
      return renderMixed(part);
    })
    .join('');
}

/** Похоже на HTML-документ или код, который надо исполнять. */
const isRunnable = (code: string) => /<(?:!doctype|html|head|body|script)\b/i.test(code);

export function renderRich(text: string, opts: { html: boolean; js: boolean; streaming?: boolean }): Rendered {
  if (!opts.html) return { html: renderMessage(text), frames: [], rich: false };

  const frames: string[] = [];
  let src = text;

  if (opts.js) {
    // ```html … ``` с документом или скриптом — отдельный фрейм (как в Tavern Helper)
    src = src.replace(/```[\w-]*\n([\s\S]*?)```/g, (whole, body: string) => {
      if (!isRunnable(body)) return whole;
      frames.push(body);
      return FRAME_MARK(frames.length - 1);
    });
    // <script> прямо в тексте — всё сообщение исполняется во фрейме
    if (/<script\b/i.test(src.replace(/```[\s\S]*?```/g, ''))) {
      frames.push(/<html[\s>]|<!doctype/i.test(src) ? src : renderFenced(src));
      src = FRAME_MARK(frames.length - 1);
    }
  }

  const hasHtml = HAS_TAG.test(src.replace(/```[\s\S]*?```/g, ''));
  // метки фреймов превращаем в <div data-dx-frame> до очистки: DOMPurify вырезает \u0000
  const marks = (h: string) => h.replace(/\u0000DXFRAME(\d+)\u0000/g, (_m, i: string) => FRAME_DIV(Number(i)));
  const html = hasHtml ? sanitize(marks(renderFenced(src))) : marks(renderMessage(src));
  return { html, frames, rich: hasHtml || frames.length > 0 };
}

// ── iframe-песочница ──

let fontCss: string | null = null;

/** @font-face интерфейса с абсолютными адресами — чтобы во фрейме были те же шрифты. */
function collectFonts(): string {
  if (fontCss !== null) return fontCss;
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(rules)) {
      if (r instanceof CSSFontFaceRule) {
        const base = sheet.href ?? location.href;
        out.push(r.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, _q, u: string) => `url("${new URL(u, base).href}")`));
      }
    }
  }
  fontCss = out.join('\n');
  return fontCss;
}

export function frameDocument(code: string, id: string): string {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
  const fs = parseFloat(v('--fs', '1')) || 1;
  const base = `<meta charset="utf-8"><meta name="color-scheme" content="dark"><base target="_blank"><style>${collectFonts()}
:root{color-scheme:dark}
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
body{color:${v('--text', '#ebe9ee')};font-family:'Cormorant Garamond',Georgia,serif;font-size:${Math.round(19 * fs)}px;line-height:1.5;overflow-wrap:anywhere}
a{color:inherit}img,video{max-width:100%;height:auto}
</style>`;
  const bridge = `<script>(function(){
var ID=${JSON.stringify(id)},seq=0,wait={};
function post(m){m.__dx=ID;parent.postMessage(m,'*')}
function size(){var d=document.documentElement,b=document.body;post({type:'height',h:Math.ceil(Math.max(d.scrollHeight,b?b.scrollHeight:0,d.getBoundingClientRect().height))})}
try{new ResizeObserver(size).observe(document.documentElement)}catch(e){}
addEventListener('load',size);setTimeout(size,30);setTimeout(size,400);setTimeout(size,1500);
addEventListener('message',function(e){var d=e.data;if(d&&d.__dxReply===ID&&wait[d.seq]){wait[d.seq](d.value);delete wait[d.seq]}});
function call(n,a){return new Promise(function(r){var s=++seq;wait[s]=r;post({type:'call',name:n,args:a,seq:s})})}
var api={
 triggerSlash:function(c){return call('slash',[String(c)])},
 sendMessage:function(t){return call('send',[String(t)])},
 fillInput:function(t){return call('fill',[String(t)])},
 getVar:function(k){return call('getVar',[String(k)])},
 setVar:function(k,v){return call('setVar',[String(k),String(v)])},
 getContext:function(){return call('context',[])}
};
window.Divinax=api;window.triggerSlash=api.triggerSlash;window.getChatVar=api.getVar;window.setChatVar=api.setVar;
})();<\/script>`;
  if (/<html[\s>]/i.test(code) || /<!doctype/i.test(code)) {
    // полноценный документ: добавляем базу и мост в начало <head>
    if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, (h) => h + base + bridge);
    return code.replace(/<html[^>]*>/i, (h) => `${h}<head>${base}${bridge}</head>`);
  }
  return `<!doctype html><html><head>${base}${bridge}</head><body>${code}</body></html>`;
}

/** Стили внутри Shadow DOM сообщения: оформление Divinax для HTML-сообщений. */
export const SHADOW_CSS = `
:host{display:block;max-width:100%;overflow-x:auto}
p{margin:0 0 .6em}p:last-child{margin-bottom:0}
em{color:var(--em)}q{quotes:none;color:var(--q)}q::before,q::after{content:none}
strong{color:var(--strong)}
a{color:var(--text)}
code{font-family:ui-monospace,monospace;font-size:.78em;background:rgba(255,255,255,.06);padding:1px 5px;border-radius:5px}
pre{background:var(--input);border:1px solid var(--line);border-radius:10px;padding:10px 12px;overflow:auto;font-size:.8em;white-space:pre-wrap}
pre code{background:none;padding:0}
blockquote{margin:0 0 .6em;padding-left:12px;border-left:2px solid var(--line-strong);color:var(--soft)}
img,video{max-width:100%;height:auto}
details>summary{cursor:pointer}
table{border-collapse:collapse;max-width:100%}
.dx-frame{display:block;width:100%;min-height:24px;border:0;background:transparent;color-scheme:dark}
.dx-pending{font-family:var(--sans);font-size:12.5px;color:var(--muted);border:1px dashed var(--line);border-radius:10px;padding:8px 12px}
.dx-cursor::after{content:'▍';color:var(--soft)}
`;
