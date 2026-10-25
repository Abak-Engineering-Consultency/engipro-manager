import React, { useEffect, useState, type ReactNode } from 'react';
import { X, Inbox, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import type { CommandName, Payload } from '../domain/engine';
import type { Tone } from '../domain/labels';
import { fmtDate, fmtDateTime, fmtMoney, fromInputDate, toInputDate } from '../domain/calendar';
import type { ISO, User } from '../domain/types';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ── Buttons ─────────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-gray-300 disabled:shadow-none',
  secondary: 'bg-card text-ink-2 border border-line-strong shadow-sm hover:bg-page disabled:text-faint',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-faint',
  danger: 'bg-st-danger text-white hover:opacity-90 disabled:bg-gray-300',
  accent: 'bg-accent-50 text-accent-700 border border-accent-200 hover:bg-accent-100',
};

export function Button({ variant = 'primary', size = 'md', className, icon, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Status and tags ─────────────────────────────────────────────────────────────

const TONES: Record<Tone, string> = {
  new: 'bg-st-new-bg text-st-new',
  progress: 'bg-st-progress-bg text-st-progress',
  waiting: 'bg-st-waiting-bg text-st-waiting',
  success: 'bg-st-success-bg text-st-success',
  danger: 'bg-st-danger-bg text-st-danger',
  muted: 'bg-st-muted-bg text-st-muted',
  brand: 'bg-brand-50 text-brand-700',
};

export function Pill({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export function StatePill({ s }: { s: { label: string; tone: Tone } }) {
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const Id = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('ltr-iso text-xs text-muted', className)}>{children}</span>;
export const Money = ({ v, className }: { v: number; className?: string }) => <span className={cn('ltr-iso', className)}>{fmtMoney(v)}</span>;
export const DateText = ({ iso, time }: { iso?: ISO; time?: boolean }) => <span className="tabular whitespace-nowrap">{time ? fmtDateTime(iso) : fmtDate(iso)}</span>;

export function Avatar({ user, size = 28 }: { user?: User; size?: number }) {
  return (
    <span title={user?.name} className="inline-grid shrink-0 place-items-center whitespace-nowrap rounded-full bg-brand-100 font-semibold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.36, letterSpacing: -0.5 }}>
      {user?.initials ?? '؟'}
    </span>
  );
}

export function PersonChip({ user, sub }: { user?: User; sub?: string }) {
  if (!user) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar user={user} size={24} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{user.name}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </span>
  );
}

// ── Layout pieces ───────────────────────────────────────────────────────────────

export function Card({ title, actions, children, className, pad = true, subtitle, icon }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; icon?: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-line bg-card shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="shrink-0 text-brand-600">{icon}</span>}
            <div className="min-w-0">
              {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A headline number. The tone is for numbers that need attention (late, waiting); everything else
 * stays neutral so the attention ones stand out. With `to` the whole tile opens the list behind it.
 */
export function Kpi({ label, value, hint, tone, icon, to }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode; to?: string }) {
  const alert = tone === 'danger' || tone === 'waiting';
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold tabular', tone === 'danger' ? 'text-st-danger' : tone === 'waiting' ? 'text-st-waiting' : 'text-ink')}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {icon && <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', alert ? TONES[tone!] : 'bg-brand-50 text-brand-600')}>{icon}</span>}
    </div>
  );
  const cls = cn('block rounded-xl border bg-card p-4 shadow-card transition-shadow', tone === 'danger' ? 'border-st-danger/30 bg-st-danger-bg/40' : tone === 'waiting' ? 'border-st-waiting/30' : 'border-line', to && 'hover:shadow-md');
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Empty({ title, hint, icon }: { title: string; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-card px-4 py-12 text-center">
      <span className="text-faint">{icon ?? <Inbox size={28} />}</span>
      <p className="font-medium text-ink-2">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="-mb-px flex gap-6 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3.5 text-sm font-medium transition-colors',
            value === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className={cn('rounded-full px-1.5 text-[11px] tabular', value === t.id ? 'bg-brand-100 text-brand-700' : 'bg-sunken text-muted')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** A reference code (rule, section) on the reference and settings pages. */
export function Code({ children }: { children: ReactNode }) {
  return <span className="ltr-iso inline-flex items-center rounded border border-line bg-page px-1.5 text-[11px] font-medium text-muted">{children}</span>;
}

const NOTICE_ICON: Partial<Record<Tone, ReactNode>> = {
  danger: <XCircle size={18} />, waiting: <AlertTriangle size={18} />, success: <CheckCircle2 size={18} />,
};

/** A message about this record's state. The icon repeats the tone so it survives without colour. */
export function Notice({ tone = 'progress', children, title }: { tone?: Tone; children: ReactNode; title?: ReactNode }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-lg px-4 py-3 text-sm', TONES[tone])}>
      <span className="mt-0.5 shrink-0">{NOTICE_ICON[tone] ?? <Info size={18} />}</span>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Timeline({ items }: { items: { at: ISO; title: ReactNode; by?: string; note?: ReactNode }[] }) {
  if (!items.length) return <p className="text-sm text-muted">لا يوجد سجل بعد.</p>;
  return (
    <ol className="relative space-y-3 border-s border-line ps-4">
      {items.map((i, k) => (
        <li key={k} className="relative">
          <span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-brand-500" />
          <p className="text-sm text-ink">{i.title}</p>
          <p className="text-xs text-muted">
            <DateText iso={i.at} time /> {i.by && <>· {i.by}</>}
          </p>
          {i.note && <p className="mt-0.5 text-xs text-ink-2">{i.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'success' | 'waiting' }) {
  const bar = tone === 'success' ? 'bg-st-success' : tone === 'waiting' ? 'bg-st-waiting' : 'bg-brand-600';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
      <div className={cn('h-full rounded-full', bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ── Modal and forms ─────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    // Capture phase: the dialog takes Escape before a drawer underneath can close too.
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-900/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('flex max-h-[92vh] w-full flex-col rounded-t-xl bg-card shadow-overlay sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-sunken" aria-label="إغلاق">
            <X size={18} />
          </button>
        </header>
        <div className="grow overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-line bg-page px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(inputCls, 'h-10', p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cn(inputCls, p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(inputCls, 'h-10', p.className)} />;

export function Field({ label, hint, children, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">
        {label}
        {required && <span className="text-st-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export type FieldSpec =
  | { name: string; label: string; type: 'text' | 'textarea' | 'number' | 'date' | 'datetime'; required?: boolean; hint?: string; placeholder?: string; initial?: unknown }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[]; required?: boolean; hint?: string; initial?: unknown }
  | { name: string; label: string; type: 'multiselect'; options: { value: string; label: string }[]; required?: boolean; hint?: string; initial?: unknown }
  | { name: string; label: string; type: 'checkbox'; hint?: string; initial?: unknown }
  | { name: string; label: string; type: 'lines'; required?: boolean; hint?: string; placeholder?: string; initial?: unknown };

function initialValue(f: FieldSpec): unknown {
  if (f.initial !== undefined) {
    if (f.type === 'date' && typeof f.initial === 'string') return toInputDate(f.initial);
    if (f.type === 'lines' && Array.isArray(f.initial)) return f.initial.join('\n');
    return f.initial;
  }
  if (f.type === 'multiselect') return [];
  if (f.type === 'checkbox') return false;
  if (f.type === 'select') return f.options[0]?.value ?? '';
  return '';
}

function convert(f: FieldSpec, v: unknown): unknown {
  if (f.type === 'number') return Number(v) || 0;
  if (f.type === 'date') return v ? fromInputDate(String(v)) : undefined;
  if (f.type === 'datetime') return v ? new Date(`${v}:00+03:00`).toISOString() : undefined;
  if (f.type === 'lines') return String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  return v;
}

export function FormFields({ fields, values, set }: { fields: FieldSpec[]; values: Record<string, unknown>; set: (name: string, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const v = values[f.name];
        if (f.type === 'checkbox') {
          return (
            <label key={f.name} className="flex items-start gap-2 text-sm text-ink-2">
              <input type="checkbox" className="mt-1 accent-brand-600" checked={!!v} onChange={(e) => set(f.name, e.target.checked)} />
              <span>
                {f.label}
                {f.hint && <span className="block text-xs text-muted">{f.hint}</span>}
              </span>
            </label>
          );
        }
        return (
          <Field key={f.name} label={f.label} hint={f.hint} required={'required' in f && f.required}>
            {f.type === 'textarea' || f.type === 'lines' ? (
              <Textarea value={String(v ?? '')} placeholder={'placeholder' in f ? f.placeholder : undefined} onChange={(e) => set(f.name, e.target.value)} rows={f.type === 'lines' ? 4 : 3} />
            ) : f.type === 'select' ? (
              <Select value={String(v ?? '')} onChange={(e) => set(f.name, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            ) : f.type === 'multiselect' ? (
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                {f.options.map((o) => {
                  const arr = (v as string[]) ?? [];
                  return (
                    <label key={o.value} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-brand-600" checked={arr.includes(o.value)} onChange={(e) => set(f.name, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            ) : (
              <Input
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'}
                value={String(v ?? '')}
                placeholder={'placeholder' in f ? f.placeholder : undefined}
                onChange={(e) => set(f.name, e.target.value)}
                dir={f.type === 'number' || f.type === 'date' || f.type === 'datetime' ? 'ltr' : undefined}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/**
 * One button = one engine command. Without fields it runs at once; with fields it opens a form.
 * The engine decides: a refused command shows its reason, nothing changes.
 */
export function CommandButton<K extends CommandName>({
  command, base, fields = [], label, title, success, variant = 'primary', size = 'sm', icon, confirm, disabled, intro, onDone, transform, className,
}: {
  command: K;
  base: Partial<Payload<K>> & Record<string, unknown>;
  fields?: FieldSpec[];
  label: ReactNode;
  title?: ReactNode;
  success?: string;
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  confirm?: ReactNode;
  disabled?: boolean;
  intro?: ReactNode;
  onDone?: (value: unknown) => void;
  transform?: (values: Record<string, unknown>) => Record<string, unknown>;
  className?: string;
}) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    if (!fields.length && !confirm) return submit({});
    setValues(Object.fromEntries(fields.map((f) => [f.name, initialValue(f)])));
    setError(null);
    setOpen(true);
  };
  const submit = (vals: Record<string, unknown>) => {
    let converted = Object.fromEntries(fields.map((f) => [f.name, convert(f, vals[f.name])]));
    if (transform) converted = transform(converted);
    const r = dispatch(command, { ...base, ...converted } as Payload<K>, success ?? 'تم');
    if (r.ok) {
      setOpen(false);
      onDone?.(r.value);
    } else setError(r.error);
  };
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={start} disabled={disabled} className={className}>
        {label}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={title ?? label}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={() => submit(values)}>{label}</Button>
            </>
          }
        >
          {intro && <div className="mb-4 text-sm text-ink-2">{intro}</div>}
          {confirm && <div className="mb-4 text-sm text-ink-2">{confirm}</div>}
          <FormFields fields={fields} values={values} set={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />
          {error && <p role="alert" className="mt-4 rounded-lg bg-st-danger-bg px-4 py-3 text-sm text-st-danger">{error}</p>}
        </Modal>
      )}
    </>
  );
}

export function Drawer({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    // Escape closes the topmost layer only: a form opened from the drawer closes first.
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-brand-900/30" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-card shadow-overlay" onMouseDown={(e) => e.stopPropagation()} style={{ marginInlineStart: 'auto' }}>
        <header className="flex items-start justify-between gap-2 border-b border-line px-6 py-4">
          <div className="min-w-0">{title}</div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-sunken" aria-label="إغلاق">
            <X size={18} />
          </button>
        </header>
        {actions && <div className="flex flex-wrap gap-2 border-b border-line bg-page px-6 py-3 empty:hidden">{actions}</div>}
        <div className="grow overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  const rows = React.Children.count(children);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-page text-start text-xs text-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-start font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {rows === 0 && empty && <div className="p-4">{empty}</div>}
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;

/** Options for a person picker, filtered by a predicate. */
export function userOptions(users: User[], filter: (u: User) => boolean = () => true) {
  return users.filter((u) => !u.deactivated && filter(u)).map((u) => ({ value: u.id, label: `${u.name} — ${u.title}` }));
}
