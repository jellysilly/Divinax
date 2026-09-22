import { tr } from '../lib/i18n';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { initials } from '../lib/util';
import type { Background } from '../types';

export const STAR_PATH = 'M12 0C12.7 8.2 15.8 11.3 24 12C15.8 12.7 12.7 15.8 12 24C11.3 15.8 8.2 12.7 0 12C8.2 11.3 11.3 8.2 12 0Z';

export function Star({ size = 16, glow = true, style }: { size?: number; glow?: boolean; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={glow ? 'star-glow' : undefined} style={style}>
      <path d={STAR_PATH} fill="#f4f4f8" />
    </svg>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = '',
  style,
  star = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  star?: boolean;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      {star && (
        <div className="panel-star">
          <Star />
        </div>
      )}
      {(title || actions) && (
        <div className="panel-head">
          {typeof title === 'string' ? <h2 className="h2">{title}</h2> : title}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function IconBtn({
  icon,
  label,
  onClick,
  size = '',
  active,
  className = '',
  disabled,
  bare,
}: {
  icon: ReactNode;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: '' | 'sm' | 'lg' | 'xl';
  active?: boolean;
  className?: string;
  disabled?: boolean;
  bare?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${size} ${bare ? 'bare' : ''} ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const input = (
    <input
      type="checkbox"
      className="sw"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={typeof label === 'string' ? label : undefined}
    />
  );
  if (!label) return input;
  return (
    <label className="toggle">
      {input}
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Field({ label, hint, children, className = '', style }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`field ${className}`} style={style}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  className = '',
  style,
  small,
  placeholder,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  style?: CSSProperties;
  small?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={`select-wrap ${className}`} style={style}>
      <select
        className="select"
        style={small ? { height: 36 } : undefined}
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const opt = options.find((o) => String(o.value) === raw);
          onChange((opt ? opt.value : raw) as T);
        }}
      >
        {placeholder && !options.some((o) => String(o.value) === String(value)) && <option value={String(value)}>{placeholder}</option>}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="chev" />
    </div>
  );
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
  large,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  large?: boolean;
}) {
  return (
    <div className={`seg ${large ? 'lg' : ''}`} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Ползунок с числовым полем, как в макете. */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
  digits,
  hint,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  digits?: number;
  hint?: string;
}) {
  const d = digits ?? (step < 1 ? String(step).split('.')[1]?.length ?? 2 : 0);
  const [text, setText] = useState(value.toFixed(d));
  const [focused, setFocused] = useState(false);
  useEffect(() => setText(value.toFixed(d)), [value, d]);
  const p = `${((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100}%`;
  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(n)) onChange(n);
    else setText(value.toFixed(d));
  };
  return (
    <div className="slider" title={hint}>
      <div className="slider-top">
        <span>{label}</span>
        <input
          className="input num"
          value={focused ? text : text + suffix}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <input
        type="range"
        className="rg"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        style={{ ['--p' as string]: p }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function Avatar({ src, name, size = 44, className = '', glow }: { src?: string; name: string; size?: number; className?: string; glow?: boolean }) {
  return (
    <div className={`avatar ${glow ? 'glow' : ''} ${className}`} style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {src ? <img src={src} alt="" loading="lazy" /> : initials(name)}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search-wrap">
      <Search size={16} className="ico" />
      <input type="search" className="input" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Divider({ title }: { title?: string }) {
  return (
    <div className="divider" aria-hidden={!title}>
      <div className="ln" />
      <Star size={10} />
      {title && <span>{title}</span>}
      {title && <Star size={10} />}
      <div className="ln r" />
    </div>
  );
}

export function TagInput({
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...values, ...parts.filter((p) => !values.includes(p))]);
    setText('');
  };
  const listId = useRef('tl' + Math.random().toString(36).slice(2)).current;
  return (
    <div className="tag-input">
      {values.map((v) => (
        <span className="chip" key={v}>
          {v}
          <button type="button" className="x" aria-label={tr('Убрать {0}', v)} onClick={() => onChange(values.filter((x) => x !== v))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={text}
        list={suggestions ? listId : undefined}
        placeholder={placeholder}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) add(e.target.value);
          else setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={() => add(text)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Panel
        className={`modal scroll ${wide ? 'wide' : ''}`}
        title={title}
        actions={<IconBtn icon={<X size={16} />} label={tr('Закрыть')} onClick={onClose} />}
      >
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </Panel>
    </div>
  );
}

/** Поле с локальным состоянием: сохраняет по blur, чтобы не писать в хранилище на каждый символ. */
export function LazyTextarea({
  value,
  onCommit,
  className = 'textarea',
  rows,
  placeholder,
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  rows?: number;
  placeholder?: string;
  style?: CSSProperties;
}) {
  const [v, setV] = useState(value);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setV(value);
  }, [value]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      onCommit(v);
    }, 500);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <textarea
      className={`${className} scroll`}
      rows={rows}
      placeholder={placeholder}
      style={style}
      value={v}
      onChange={(e) => {
        dirty.current = true;
        setV(e.target.value);
      }}
      onBlur={() => {
        if (dirty.current) {
          dirty.current = false;
          onCommit(v);
        }
      }}
    />
  );
}

export function LazyInput({
  value,
  onCommit,
  className = 'input',
  placeholder,
  type = 'text',
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  type?: string;
  style?: CSSProperties;
}) {
  const [v, setV] = useState(value);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setV(value);
  }, [value]);
  const commit = () => {
    if (dirty.current) {
      dirty.current = false;
      onCommit(v);
    }
  };
  return (
    <input
      className={className}
      type={type}
      placeholder={placeholder}
      style={style}
      value={v}
      onChange={(e) => {
        dirty.current = true;
        setV(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

export function NumInput({ value, onChange, min, max, step = 1, className = 'input', style }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; style?: CSSProperties }) {
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  const commit = () => {
    let n = parseFloat(t.replace(',', '.'));
    if (!Number.isFinite(n)) return setT(String(value));
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
  };
  return (
    <input
      className={className}
      style={style}
      inputMode="decimal"
      value={t}
      step={step}
      onChange={(e) => setT(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

/** Превью фона: картинка или цветная плашка (прозрачный — шахматка). */
export function BgThumb({ bg }: { bg: Background }) {
  if (bg.color) return <div className={`bg-swatch ${bg.color === 'transparent' ? 'checker' : ''}`} style={bg.color === 'transparent' ? undefined : { background: bg.color }} />;
  return <img src={bg.url} alt="" loading="lazy" />;
}

export function useConfirm() {
  return (text: string) => window.confirm(text);
}
