// Лёгкий безопасный рендер ролевого текста: *действия*, **жирный**, «цитаты», `код`, ```блоки```.
import { escapeHtml } from './util';

function inline(s: string): string {
  return s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(«[^»\n]*»|&quot;[^\n]*?&quot;|“[^”\n]*”)/g, '<q>$1</q>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)»])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMessage(text: string): string {
  const parts = text.split(/```/);
  let html = '';
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf('\n');
      const body = nl >= 0 && /^[\w+-]*$/.test(part.slice(0, nl)) ? part.slice(nl + 1) : part;
      html += `<pre><code>${escapeHtml(body.replace(/\n$/, ''))}</code></pre>`;
      return;
    }
    const esc = escapeHtml(part);
    const paras = esc.split(/\n{2,}/);
    html += paras
      .map((p) => {
        if (!p.trim()) return '';
        if (/^&gt;\s?/.test(p)) return `<blockquote>${inline(p.replace(/^&gt;\s?/gm, '')).replace(/\n/g, '<br>')}</blockquote>`;
        const h = /^(#{1,3})\s+(.+)$/.exec(p);
        if (h) return `<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`;
        return `<p>${inline(p).replace(/\n/g, '<br>')}</p>`;
      })
      .join('');
  });
  return html;
}
