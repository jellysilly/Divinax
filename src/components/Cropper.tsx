// Обрезка изображений прямо в браузере: перетаскивание, масштаб (щипок, колёсико, ползунок), поворот, пропорции.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, RotateCcw, RotateCw } from 'lucide-react';
import { tr } from '../lib/i18n';
import { pickFiles, readDataUrl, shrinkImage } from '../lib/util';
import { toast } from '../store';
import { IconBtn, Modal, Seg, Slider } from './ui';

export interface CropOptions {
  title: string;
  aspects: { value: number; label: string }[];
  size: number; // длинная сторона результата, px
  round?: boolean; // показать круглую подсказку (для круглых аватаров)
}

interface Request extends CropOptions {
  id: number;
  src: string;
  resolve: (v: string | null) => void;
}

export const AVATAR_CROP: CropOptions = {
  title: 'Обрезка аватара',
  aspects: [
    { value: 1, label: '1:1' },
    { value: 2 / 3, label: '2:3' },
  ],
  size: 768,
  round: true,
};

export const PERSONA_CROP: CropOptions = { ...AVATAR_CROP, size: 512 };

export const BANNER_CROP: CropOptions = {
  title: 'Обрезка обложки',
  aspects: [
    { value: 9 / 5, label: '9:5' },
    { value: 16 / 9, label: '16:9' },
    { value: 3, label: '3:1' },
  ],
  size: 1600,
};

let openCropper: ((r: Request) => void) | null = null;
let seq = 0;

/** Открывает окно обрезки; null — пользователь отменил. */
export function cropImage(src: string, opts: CropOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!openCropper) resolve(shrinkImage(src, opts.size));
    else openCropper({ ...opts, id: ++seq, src, resolve });
  });
}

/** Выбрать файл и обрезать его. */
export async function pickAndCrop(opts: CropOptions): Promise<string | null> {
  const [f] = await pickFiles('image/*');
  if (!f) return null;
  return cropImage(await readDataUrl(f), opts);
}

export function CropperHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    openCropper = (r) => setReq(r);
    return () => {
      openCropper = null;
    };
  }, []);
  if (!req) return null;
  return (
    <CropperModal
      key={req.id}
      req={req}
      onDone={(v) => {
        req.resolve(v);
        setReq((cur) => (cur?.id === req.id ? null : cur));
      }}
    />
  );
}

const clampN = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
const MAX_ZOOM = 8;

function CropperModal({ req, onDone }: { req: Request; onDone: (v: string | null) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [ai, setAi] = useState('0');
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0); // четверти оборота по часовой
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [stageW, setStageW] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const i = new Image();
    if (!req.src.startsWith('data:') && !req.src.startsWith('blob:')) i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.onerror = () => {
      toast(tr('Не удалось открыть изображение'), 'error');
      done.current(null);
    };
    i.src = req.src;
  }, [req.src]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const aspect = req.aspects[Number(ai)]?.value ?? 1;
  const stageH = Math.round(Math.min(440, Math.max(260, stageW * 0.8)));
  const pad = 22;
  const boxW = Math.max(40, Math.min(stageW - pad * 2, (stageH - pad * 2) * aspect));
  const boxH = boxW / aspect;
  const nw = img?.naturalWidth || 1;
  const nh = img?.naturalHeight || 1;
  const turned = rot % 2 === 1;
  const iw = turned ? nh : nw;
  const ih = turned ? nw : nh;
  const scale = Math.max(boxW / iw, boxH / ih) * zoom; // экранных px на пиксель картинки
  const limX = Math.max(0, (iw * scale - boxW) / 2);
  const limY = Math.max(0, (ih * scale - boxH) / 2);
  const o = { x: clampN(off.x, limX), y: clampN(off.y, limY) };

  // актуальные границы для обработчиков событий
  const lim = useRef({ x: limX, y: limY });
  lim.current = { x: limX, y: limY };
  const move = (dx: number, dy: number) => setOff((p) => ({ x: clampN(clampN(p.x, lim.current.x) + dx, lim.current.x), y: clampN(clampN(p.y, lim.current.y) + dy, lim.current.y) }));
  const zoomBy = (k: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z * k)));

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    if (pointers.current.size === 1) {
      move(e.clientX - p.x, e.clientY - p.y);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (pointers.current.size === 2) {
      const before = dist();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = dist();
      if (before > 0) zoomBy(after / before);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const apply = () => {
    if (!img) return;
    const outW = Math.round(aspect >= 1 ? req.size : req.size * aspect);
    const outH = Math.round(outW / aspect);
    const k = outW / boxW;
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(outW / 2 + o.x * k, outH / 2 + o.y * k);
    ctx.rotate((rot * Math.PI) / 2);
    ctx.scale(scale * k, scale * k);
    ctx.drawImage(img, -nw / 2, -nh / 2);
    try {
      onDone(c.toDataURL('image/webp', 0.9));
    } catch {
      // картинка с чужого сайта без CORS — обрезать нельзя
      toast(tr('Эту картинку нельзя обрезать: сайт запрещает. Сохраните её и загрузите файлом.'), 'error');
    }
  };

  const noCrop = async () => onDone(await shrinkImage(req.src, req.size));

  return (
    <Modal
      title={tr(req.title)}
      onClose={() => onDone(null)}
      footer={
        <>
          <button type="button" className="btn" onClick={() => onDone(null)}>
            {tr('Отмена')}
          </button>
          <button type="button" className="btn" onClick={() => void noCrop()}>
            {tr('Без обрезки')}
          </button>
          <button type="button" className="btn primary" disabled={!img} onClick={apply}>
            <Check size={15} /> {tr('Применить')}
          </button>
        </>
      }
    >
      <div
        ref={stage}
        className="crop-stage"
        style={{ height: stageH }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => {
          setZoom(1);
          setOff({ x: 0, y: 0 });
        }}
      >
        {img && (
          <img
            src={req.src}
            alt=""
            draggable={false}
            style={{
              width: nw * scale,
              height: nh * scale,
              transform: `translate(-50%, -50%) translate(${o.x}px, ${o.y}px) rotate(${rot * 90}deg)`,
            }}
          />
        )}
        <div className="crop-box" style={{ width: boxW, height: boxH }}>
          {req.round && aspect === 1 && <div className="crop-round" />}
        </div>
      </div>
      <div className="sub">{tr('Перетаскивайте картинку, масштаб — двумя пальцами, колёсиком или ползунком. Двойной щелчок — сброс.')}</div>
      <div className="row wrap" style={{ gap: 12 }}>
        {req.aspects.length > 1 && (
          <Seg
            value={ai}
            onChange={(v) => {
              setAi(v);
              setOff({ x: 0, y: 0 });
            }}
            options={req.aspects.map((a, i) => ({ value: String(i), label: a.label }))}
          />
        )}
        <IconBtn size="lg" icon={<RotateCcw size={16} />} label={tr('Повернуть влево')} onClick={() => setRot((r) => (r + 3) % 4)} />
        <IconBtn size="lg" icon={<RotateCw size={16} />} label={tr('Повернуть вправо')} onClick={() => setRot((r) => (r + 1) % 4)} />
      </div>
      <Slider label={tr('Масштаб')} value={zoom} min={1} max={MAX_ZOOM} step={0.01} onChange={(v) => setZoom(v)} />
    </Modal>
  );
}
