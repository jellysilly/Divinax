import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { activeChat, getState, setState, updateChat, useStore } from '../store';
import { SHADOW_CSS, frameDocument, renderRich } from '../lib/richtext';
import { renderMessage } from '../lib/markdown';
import { runSlash } from '../lib/slash';
import { sendMessage } from '../lib/generate';
import { tr } from '../lib/i18n';
import { uid } from '../lib/util';

// ── Мост между фреймами-песочницами и Divinax ──

const frames = new Map<string, HTMLIFrameElement>();

function reply(frame: HTMLIFrameElement, id: string, seq: number, value: unknown) {
  frame.contentWindow?.postMessage({ __dxReply: id, seq, value }, '*');
}

async function handleCall(name: string, args: string[]): Promise<unknown> {
  const s = getState();
  const chat = activeChat(s);
  switch (name) {
    case 'slash':
      await runSlash(args[0].startsWith('/') ? args[0] : '/' + args[0]);
      return true;
    case 'send':
      await sendMessage(args[0]);
      return true;
    case 'fill':
      setState({ draft: args[0] });
      return true;
    case 'getVar':
      return chat?.vars[args[0]] ?? '';
    case 'setVar':
      if (chat) updateChat(chat.id, (c) => void (c.vars = { ...c.vars, [args[0]]: args[1] }));
      return true;
    case 'context': {
      const last = chat?.messages[chat.messages.length - 1];
      return {
        chatId: chat?.id,
        chatName: chat?.name,
        characterName: chat ? (chat.ownerType === 'group' ? s.groups[chat.ownerId]?.name : s.characters[chat.ownerId]?.name) : undefined,
        lastMessage: last?.text,
        messageCount: chat?.messages.length ?? 0,
        vars: chat?.vars ?? {},
      };
    }
    default:
      return undefined;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    const d = e.data as { __dx?: string; type?: string; h?: number; name?: string; args?: string[]; seq?: number } | null;
    if (!d || typeof d.__dx !== 'string') return;
    const frame = frames.get(d.__dx);
    // отвечаем только своим фреймам
    if (!frame || e.source !== frame.contentWindow) return;
    if (d.type === 'height' && typeof d.h === 'number') frame.style.height = Math.min(Math.max(d.h, 16), 6000) + 'px';
    if (d.type === 'call' && d.name && typeof d.seq === 'number') {
      const id = d.__dx;
      const seq = d.seq;
      handleCall(d.name, (d.args ?? []).map(String)).then(
        (v) => reply(frame, id, seq, v),
        () => reply(frame, id, seq, null),
      );
    }
  });
}

function makeFrame(code: string): HTMLIFrameElement {
  const id = uid();
  const f = document.createElement('iframe');
  f.className = 'dx-frame';
  // без allow-same-origin: скрипт не видит ключи API и данные Divinax
  f.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads');
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.setAttribute('loading', 'lazy');
  f.srcdoc = frameDocument(code, id);
  frames.set(id, f);
  return f;
}

function RichTextInner({ text, streaming }: { text: string; streaming?: boolean }) {
  const renderHtml = useStore((s) => s.ui.renderHtml);
  const runScripts = useStore((s) => s.ui.runScripts);
  const ref = useRef<HTMLDivElement>(null);
  const out = useMemo(() => renderRich(text, { html: renderHtml, js: runScripts }), [text, renderHtml, runScripts]);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || !out.rich) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${SHADOW_CSS}</style>${out.html}${streaming ? '<span class="dx-cursor"></span>' : ''}`;
    const created: HTMLIFrameElement[] = [];
    root.querySelectorAll<HTMLElement>('[data-dx-frame]').forEach((ph) => {
      const code = out.frames[Number(ph.dataset.dxFrame)];
      if (code == null) return;
      if (streaming) {
        // во время генерации код не запускаем — иначе фрейм перезагружался бы на каждом токене
        const note = document.createElement('div');
        note.className = 'dx-pending';
        note.textContent = tr('HTML/JS-блок появится после завершения ответа');
        ph.replaceWith(note);
        return;
      }
      const f = makeFrame(code);
      created.push(f);
      ph.replaceWith(f);
    });
    return () => {
      for (const [id, f] of frames) if (created.includes(f)) frames.delete(id);
    };
  }, [out, streaming]);

  if (!out.rich) {
    return <div className={`msg-text ${streaming ? 'cursor' : ''}`} dangerouslySetInnerHTML={{ __html: out.html || renderMessage(text) }} />;
  }
  return <div ref={ref} className="msg-text rich" />;
}

export const RichText = memo(RichTextInner);
