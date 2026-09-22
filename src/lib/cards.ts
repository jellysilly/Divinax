import { tr } from './i18n';
// Импорт/экспорт карточек персонажей: PNG (tEXt chara / ccv3) и JSON (spec v1/v2/v3).
import type { Character, Lorebook } from '../types';
import { entriesFromST, lorebookToCharacterBook } from './worldinfo';
import { readDataUrl, uid } from './util';

type Raw = Record<string, any>;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function b64decodeUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64encodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function readPngTextChunks(buf: ArrayBuffer): Record<string, string> {
  const v = new DataView(buf);
  const out: Record<string, string> = {};
  if (v.getUint32(0) !== 0x89504e47) throw new Error(tr('Это не PNG-файл'));
  let p = 8;
  const dec = new TextDecoder('latin1');
  while (p < buf.byteLength) {
    const len = v.getUint32(p);
    const type = dec.decode(new Uint8Array(buf, p + 4, 4));
    if (type === 'tEXt') {
      const data = new Uint8Array(buf, p + 8, len);
      const zero = data.indexOf(0);
      const key = dec.decode(data.subarray(0, zero));
      out[key.toLowerCase()] = dec.decode(data.subarray(zero + 1));
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return out;
}

export function writePngTextChunks(buf: ArrayBuffer, chunks: Record<string, string>): Uint8Array {
  const src = new Uint8Array(buf);
  const v = new DataView(buf);
  const parts: Uint8Array[] = [src.subarray(0, 8)];
  let p = 8;
  const dec = new TextDecoder('latin1');
  const keys = new Set(Object.keys(chunks).map((k) => k.toLowerCase()));
  while (p < buf.byteLength) {
    const len = v.getUint32(p);
    const type = dec.decode(src.subarray(p + 4, p + 8));
    const whole = src.subarray(p, p + 12 + len);
    if (type === 'tEXt') {
      const data = src.subarray(p + 8, p + 8 + len);
      const key = dec.decode(data.subarray(0, data.indexOf(0))).toLowerCase();
      if (!keys.has(key)) parts.push(whole);
    } else if (type === 'IEND') {
      for (const [k, val] of Object.entries(chunks)) {
        // ключ \0 значение — только ASCII (значение в base64)
        const text = new Uint8Array(k.length + 1 + val.length);
        for (let i = 0; i < k.length; i++) text[i] = k.charCodeAt(i);
        for (let i = 0; i < val.length; i++) text[k.length + 1 + i] = val.charCodeAt(i);
        const chunk = new Uint8Array(12 + text.length);
        const cv = new DataView(chunk.buffer);
        cv.setUint32(0, text.length);
        chunk.set([0x74, 0x45, 0x58, 0x74], 4); // tEXt
        chunk.set(text, 8);
        cv.setUint32(8 + text.length, crc32(chunk.subarray(4, 8 + text.length)));
        parts.push(chunk);
      }
      parts.push(whole);
      break;
    } else parts.push(whole);
    p += 12 + len;
  }
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

export function blankCharacter(name = tr('Новый персонаж')): Character {
  const now = Date.now();
  return {
    id: uid(),
    name,
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    alternate_greetings: [],
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    creator: '',
    character_version: '',
    tags: [],
    fav: false,
    talkativeness: 0.5,
    depth_prompt: { prompt: '', depth: 4, role: 'system' },
    gallery: [],
    extensions: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function characterFromJson(json: Raw): { char: Character; book?: Lorebook } {
  const d: Raw = json.data && (json.spec === 'chara_card_v2' || json.spec === 'chara_card_v3' || json.data.name) ? json.data : json;
  const c = blankCharacter(String(d.name ?? d.char_name ?? tr('Без имени')));
  c.description = String(d.description ?? d.char_persona ?? '');
  c.personality = String(d.personality ?? '');
  c.scenario = String(d.scenario ?? d.world_scenario ?? '');
  c.first_mes = String(d.first_mes ?? d.char_greeting ?? '');
  c.mes_example = String(d.mes_example ?? d.example_dialogue ?? '');
  c.alternate_greetings = Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String) : [];
  c.creator_notes = String(d.creator_notes ?? json.creatorcomment ?? '');
  c.system_prompt = String(d.system_prompt ?? '');
  c.post_history_instructions = String(d.post_history_instructions ?? '');
  c.creator = String(d.creator ?? '');
  c.character_version = String(d.character_version ?? '');
  c.tags = Array.isArray(d.tags) ? d.tags.map(String) : [];
  const ext: Raw = d.extensions ?? {};
  c.extensions = ext;
  c.fav = Boolean(ext.fav ?? json.fav);
  c.talkativeness = Number(ext.talkativeness ?? json.talkativeness ?? 0.5) || 0.5;
  const dp = ext.depth_prompt;
  if (dp && typeof dp === 'object') {
    c.depth_prompt = {
      prompt: String(dp.prompt ?? ''),
      depth: Number(dp.depth ?? 4),
      role: ['system', 'user', 'assistant'].includes(dp.role) ? dp.role : 'system',
    };
  }
  let book: Lorebook | undefined;
  if (d.character_book && typeof d.character_book === 'object') {
    const now = Date.now();
    book = {
      id: uid(),
      name: String(d.character_book.name || tr('{0} — лорбук', c.name)),
      description: String(d.character_book.description ?? ''),
      entries: entriesFromST(d.character_book),
      createdAt: now,
      updatedAt: now,
    };
    c.lorebookId = book.id;
  }
  return { char: c, book };
}

export async function importCharacterFile(file: File): Promise<{ char: Character; book?: Lorebook }> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.json')) {
    return characterFromJson(JSON.parse(await file.text()));
  }
  const buf = await file.arrayBuffer();
  const chunks = readPngTextChunks(buf);
  const raw = chunks.ccv3 ?? chunks.chara;
  if (!raw) throw new Error(tr('В PNG нет данных карточки (chara/ccv3)'));
  const res = characterFromJson(JSON.parse(b64decodeUtf8(raw)));
  res.char.avatar = await readDataUrl(file);
  return res;
}

export function characterToJson(c: Character, book?: Lorebook): Raw {
  const data: Raw = {
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.first_mes,
    mes_example: c.mes_example,
    creator_notes: c.creator_notes,
    system_prompt: c.system_prompt,
    post_history_instructions: c.post_history_instructions,
    alternate_greetings: c.alternate_greetings,
    tags: c.tags,
    creator: c.creator,
    character_version: c.character_version,
    extensions: {
      ...c.extensions,
      fav: c.fav,
      talkativeness: c.talkativeness,
      depth_prompt: c.depth_prompt,
    },
  };
  if (book) data.character_book = lorebookToCharacterBook(book);
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    // v1-поля для старых фронтендов
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.first_mes,
    mes_example: c.mes_example,
    data,
  };
}

async function avatarPngBuffer(c: Character): Promise<ArrayBuffer> {
  const img = new Image();
  img.src = c.avatar || './demo/judge-avatar.jpg';
  await img.decode().catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = img.width || 400;
  canvas.height = img.height || 600;
  const ctx = canvas.getContext('2d')!;
  if (img.width) ctx.drawImage(img, 0, 0);
  else {
    ctx.fillStyle = '#0b0b0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ebe9ee';
    ctx.font = '160px serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.name[0] ?? '?', 200, 360);
  }
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return blob.arrayBuffer();
}

export async function exportCharacterPng(c: Character, book?: Lorebook): Promise<Blob> {
  const json = characterToJson(c, book);
  const v3 = { ...json, spec: 'chara_card_v3', spec_version: '3.0' };
  const buf = await avatarPngBuffer(c);
  const out = writePngTextChunks(buf, {
    chara: b64encodeUtf8(JSON.stringify(json)),
    ccv3: b64encodeUtf8(JSON.stringify(v3)),
  });
  return new Blob([out as BlobPart], { type: 'image/png' });
}
