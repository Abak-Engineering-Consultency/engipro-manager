import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Flag, GitBranch } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { dateKey, fmtDate } from '../../domain/calendar';
import { TASK_STATES } from '../../domain/labels';
import type { ISO, Task, TaskState } from '../../domain/types';
import { Avatar, cn, Empty, Id, Pill, StatePill, Table, Td } from '../ui';
import { recordHref } from './records';

export const PRIORITY: Record<Task['priority'], { label: string; tone: 'danger' | 'new' | 'muted' }> = {
  high: { label: 'عالية', tone: 'danger' },
  medium: { label: 'متوسطة', tone: 'new' },
  low: { label: 'منخفضة', tone: 'muted' },
};

export const SOURCE_NAMES: Record<Task['source'], string> = {
  manual: 'يدوية',
  kickoff: 'من محضر الاجتماع الافتتاحي',
  gov_comments: 'من ملاحظات الجهة الحكومية',
  collection: 'متابعة تحصيل دفعة',
  visit_followup: 'متابعة بعد زيارة',
};

export const isOpen = (t: Task) => !['completed', 'cancelled'].includes(t.status);
export const isOverdue = (t: Task, now: ISO) => isOpen(t) && Date.parse(t.dueDate) < Date.parse(now);

export function DueText({ task }: { task: Task }) {
  const { state } = useStore();
  const late = isOverdue(task, state.now);
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs tabular', late ? 'font-medium text-st-danger' : 'text-muted')}>
      <Clock size={12} />
      {fmtDate(task.dueDate)}
      {late && ' · متأخرة'}
    </span>
  );
}

export function RecordLinkText({ task }: { task: Task }) {
  if (!task.link) return <span className="text-xs text-faint">مستقلة</span>;
  const href = recordHref(task.link);
  const body = <span className="truncate">{task.link.label}</span>;
  return href ? (
    <Link to={href} onClick={(e) => e.stopPropagation()} className="inline-flex max-w-[260px] items-center gap-1 text-xs text-brand-700 hover:underline">{body}</Link>
  ) : (
    <span className="inline-flex max-w-[260px] text-xs text-ink-2">{body}</span>
  );
}

export function TaskList({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { user } = useLookup();
  if (!tasks.length) return <Empty title="لا توجد مهام هنا" />;
  return (
    <Table head={['المهمة', 'السجل المرتبط', 'المسؤول', 'الموعد', 'الأولوية', 'الحالة']}>
      {tasks.map((t) => (
        <tr key={t.id} className="cursor-pointer hover:bg-sunken" onClick={() => onOpen(t.id)}>
          <Td>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-ink">{t.title}</span>
              <span className="flex items-center gap-2">
                <Id>{t.id}</Id>
                {t.source !== 'manual' && <span className="inline-flex items-center gap-1 text-[11px] text-muted"><GitBranch size={11} />{SOURCE_NAMES[t.source]}</span>}
              </span>
            </div>
          </Td>
          <Td><RecordLinkText task={t} /></Td>
          <Td>
            <span className="inline-flex items-center gap-2"><Avatar user={user(t.ownerId)} size={22} /><span className="text-xs">{user(t.ownerId)?.name}</span></span>
          </Td>
          <Td><DueText task={t} /></Td>
          <Td><Pill tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Pill></Td>
          <Td>
            <StatePill s={TASK_STATES[t.status]} />
            {t.status === 'blocked' && t.blockReason && <p className="mt-1 max-w-[200px] truncate text-[11px] text-st-waiting">{t.blockReason.note}</p>}
          </Td>
        </tr>
      ))}
    </Table>
  );
}

const BOARD: TaskState[] = ['new', 'in_progress', 'blocked', 'in_review', 'completed'];

export function TaskBoard({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { user } = useLookup();
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {BOARD.map((col) => {
        const items = tasks.filter((t) => t.status === col);
        return (
          <div key={col} className="flex w-72 shrink-0 flex-col rounded-lg border border-line bg-page">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <StatePill s={TASK_STATES[col]} />
              <span className="rounded bg-card px-1.5 text-xs text-muted tabular">{items.length}</span>
            </div>
            <div className="flex max-h-[520px] min-h-[120px] flex-col gap-2 overflow-y-auto p-2">
              {items.map((t) => (
                <button key={t.id} onClick={() => onOpen(t.id)} className="rounded-md border border-line bg-card p-3 text-start shadow-card hover:border-brand-300">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Id>{t.id}</Id>
                    <span className="flex items-center gap-1">
                      {t.priority === 'high' && <Flag size={13} className="text-st-danger" />}
                      {t.status === 'blocked' && <AlertCircle size={13} className="text-st-waiting" />}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink">{t.title}</p>
                  {t.link && <p className="mt-1 truncate text-[11px] text-muted">{t.link.label}</p>}
                  <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2"><Avatar user={user(t.ownerId)} size={20} />{user(t.ownerId)?.name}</span>
                    <DueText task={t} />
                  </div>
                </button>
              ))}
              {!items.length && <p className="py-6 text-center text-xs text-faint">لا شيء</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const monthFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function TaskCalendar({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { state } = useStore();
  const [offset, setOffset] = useState(0);
  const todayKey = dateKey(state.now);
  const [y0, m0] = todayKey.split('-').map(Number);
  const first = new Date(Date.UTC(y0, m0 - 1 + offset, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) map.set(dateKey(t.dueDate), [...(map.get(dateKey(t.dueDate)) ?? []), t]);
    return map;
  }, [tasks]);
  const tone = (t: Task) => (t.status === 'completed' ? 'bg-st-success-bg text-st-success' : t.status === 'blocked' ? 'bg-st-waiting-bg text-st-waiting' : isOverdue(t, state.now) ? 'bg-st-danger-bg text-st-danger' : 'bg-brand-50 text-brand-700');
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-page px-3 py-2">
        <p className="font-semibold text-ink">{monthFmt.format(first)}</p>
        <div className="flex gap-1">
          <button className="rounded p-1 hover:bg-sunken" onClick={() => setOffset((o) => o - 1)} aria-label="الشهر السابق"><ChevronRight size={18} /></button>
          <button className="rounded px-2 text-xs text-brand-700 hover:bg-sunken" onClick={() => setOffset(0)}>اليوم</button>
          <button className="rounded p-1 hover:bg-sunken" onClick={() => setOffset((o) => o + 1)} aria-label="الشهر التالي"><ChevronLeft size={18} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
        {DAY_NAMES.map((d) => <div key={d} className="border-b border-line bg-page py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} className="min-h-[84px] border-b border-e border-line bg-page/50" />)}
        {Array.from({ length: days }, (_, i) => {
          const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          const items = byDay.get(key) ?? [];
          return (
            <div key={key} className={cn('min-h-[84px] border-b border-e border-line p-1', key === todayKey && 'bg-brand-50/50')}>
              <span className={cn('mb-1 inline-grid h-5 w-5 place-items-center rounded-full text-[11px] tabular', key === todayKey ? 'bg-brand-600 text-white' : 'text-ink-2')}>{i + 1}</span>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((t) => (
                  <button key={t.id} onClick={() => onOpen(t.id)} title={t.title} className={cn('block w-full truncate rounded px-1 py-0.5 text-start text-[10px]', tone(t))}>{t.title}</button>
                ))}
                {items.length > 3 && <p className="text-[10px] text-muted">+{items.length - 3}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
