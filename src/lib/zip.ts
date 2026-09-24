// Чтение ZIP-архивов в браузере без библиотек: центральный каталог + DecompressionStream('deflate-raw').
// Нужен, чтобы ставить регексы, карточки и лорбуки прямо из архива — без распаковки на телефоне.
import { tr } from './i18n';

export interface ZipEntry {
  name: string; // путь внутри архива
  data: Uint8Array;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error(tr('браузер не умеет распаковывать ZIP — обновите его'));
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const isZip = (buf: ArrayBuffer) => buf.byteLength >= 4 && new DataView(buf).getUint32(0, true) === 0x04034b50;

/** Файлы архива (без папок и служебного мусора macOS). */
export async function unzip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // конец центрального каталога ищем с конца файла (после него может идти комментарий до 64 КБ)
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(tr('это не ZIP-архив или он повреждён'));
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder('utf-8');
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = utf8.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const base = name.split('/').pop() ?? '';
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || base.startsWith('._') || base === '.DS_Store') continue;
    if (flags & 1) throw new Error(tr('архив защищён паролем — такие не поддерживаются'));
    // сжатые данные идут после локального заголовка (его длины полей могут отличаться от каталога)
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + size);
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: await inflateRaw(raw) });
    else throw new Error(tr('«{0}»: неподдерживаемый способ сжатия', name));
  }
  return out;
}

/** Содержимое архива как файлы — для общего импорта. Вложенные архивы тоже распаковываются. */
export async function zipToFiles(buf: ArrayBuffer, depth = 0): Promise<File[]> {
  const files: File[] = [];
  for (const e of await unzip(buf)) {
    const base = e.name.split('/').pop()!;
    const copy = e.data.slice().buffer;
    if (/\.zip$/i.test(base) && depth < 2) files.push(...(await zipToFiles(copy, depth + 1)));
    else files.push(new File([copy], base));
  }
  return files;
}
