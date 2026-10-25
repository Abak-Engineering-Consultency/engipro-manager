import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, ClipboardCheck, Coins, Columns3, FileSearch, Gavel, Inbox, List, ListTodo, RefreshCw, UserCheck } from 'lucide-react';
import { useStore } from '../app/store';
import { addCalendarDays, dateKey, fmtDate, weekday } from '../domain/calendar';
import { derivedActions, type DerivedAction } from '../domain/derived';
import type { Task } from '../domain/types';
import { Card, cn, Empty, Kpi, PageHeader, Tabs } from '../components/ui';
import { NewTaskButton, TaskDrawer } from '../components/work/TaskDrawer';
import { isOpen, isOverdue, TaskBoard, TaskCalendar, TaskList } from '../components/work/TaskViews';
import { VisitCard, isMine } from '../components/visits/VisitParts';
import { VisitDrawer } from '../components/visits/VisitDrawer';

const KIND: Record<DerivedAction['kind'], { label: string; icon: React.ReactNode }> = {
  approval: { label: 'قرار', icon: <Gavel size={16} /> },
  work: { label: 'عمل', icon: <ClipboardCheck size={16} /> },
  follow_up: { label: 'متابعة', icon: <RefreshCw size={16} /> },
  finance: { label: 'مالية', icon: <Coins size={16} /> },
  review: { label: 'مراجعة', icon: <FileSearch size={16} /> },
};

type TaskTab = 'mine' | 'created' | 'review' | 'contributing' | 'overdue';
type View = 'list' | 'board' | 'calendar';

const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'list', label: 'قائمة', icon: <List size={18} /> },
  { id: 'board', label: 'لوحة', icon: <Columns3 size={18} /> },
  { id: 'calendar', label: 'تقويم', icon: <CalendarDays size={18} /> },
];

/** TK-10 — «مهامي»: derived actions + tasks + visits, each with its next step and block reason. */
export const MyWork: React.FC = () => {
  const { state, me } = useStore();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TaskTab>('mine');
  const [view, setView] = useState<View>('list');
  const [showClosed, setShowClosed] = useState(false);
  const [visitId, setVisitId] = useState<string | null>(null);
  const taskId = params.get('task');
  const openTask = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('task', id);
    setParams(next);
  };
  const closeTask = () => {
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
  };

  const actions = useMemo(() => derivedActions(state, me).sort((a, b) => (a.due ?? a.since ?? '').localeCompare(b.due ?? b.since ?? '')), [state, me]);
  const lists = useMemo(() => {
    const keep = (t: Task) => showClosed || isOpen(t);
    return {
      mine: state.tasks.filter((t) => t.ownerId === me.id && keep(t)),
      created: state.tasks.filter((t) => t.creatorId === me.id && t.ownerId !== me.id && keep(t)),
      review: state.tasks.filter((t) => t.reviewerId === me.id && (t.status === 'in_review' || (showClosed && !isOpen(t)))),
      contributing: state.tasks.filter((t) => t.contributors.includes(me.id) && keep(t)),
      overdue: state.tasks.filter((t) => [t.ownerId, t.creatorId, t.reviewerId].includes(me.id) && isOverdue(t, state.now)),
    };
  }, [state, me, showClosed]);
  const tasks = [...lists[tab]].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const week = new Set(Array.from({ length: 7 }, (_, i) => dateKey(addCalendarDays(state.now, i - weekday(state.now)))));
  const myVisits = state.visits
    .filter((v) => isMine(v, me.id) && v.status !== 'cancelled' && week.has(dateKey(v.plannedStart)))
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const today = dateKey(state.now);

  const late = (iso?: string) => !!iso && Date.parse(iso) < Date.parse(state.now);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مهامي"
        subtitle={<>بانتظارك: <span className="font-semibold text-ink">{actions.length + lists.mine.filter(isOpen).length}</span> بين إجراء ومهمة</>}
        actions={<NewTaskButton onCreated={openTask} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="إجراءات بانتظاري" value={actions.length} icon={<Inbox size={20} />} tone={actions.length ? 'waiting' : undefined} />
        <Kpi label="مهامي المفتوحة" value={state.tasks.filter((t) => t.ownerId === me.id && isOpen(t)).length} icon={<ListTodo size={20} />} />
        <Kpi label="بانتظار مراجعتي" value={state.tasks.filter((t) => t.reviewerId === me.id && t.status === 'in_review').length} icon={<UserCheck size={20} />} />
        <Kpi label="متأخرة" value={lists.overdue.length} icon={<AlertTriangle size={20} />} tone={lists.overdue.length ? 'danger' : undefined} />
      </div>

      <Card title="إجراءات بانتظارك" icon={<Inbox size={18} />} pad={false}>
        {actions.length ? (
          <ul className="divide-y divide-line">
            {actions.map((a) => (
              <li key={a.key}>
                <Link to={a.link} className="group flex flex-wrap items-center gap-4 px-5 py-3 hover:bg-page">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600" title={KIND[a.kind].label}>{KIND[a.kind].icon}</span>
                  <span className="min-w-0 grow basis-60">
                    <span className="block text-sm font-medium text-ink group-hover:text-brand-700">{a.title}</span>
                    <span className="block truncate text-xs text-muted">{KIND[a.kind].label} · {a.detail}</span>
                  </span>
                  <span className="text-xs tabular text-muted">
                    {a.due ? (
                      <span className={cn(late(a.due) && 'font-medium text-st-danger')}>{late(a.due) ? 'متأخر — ' : ''}الموعد {fmtDate(a.due)}</span>
                    ) : a.since ? <span>منذ {fmtDate(a.since)}</span> : null}
                  </span>
                  <ArrowLeft size={16} className="shrink-0 text-faint group-hover:text-brand-600" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5"><Empty title="لا توجد إجراءات بانتظارك الآن" hint="ستظهر هنا القرارات والمراجعات المطلوبة منك." /></div>
        )}
      </Card>

      <Card
        title="المهام"
        icon={<ListTodo size={18} />}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" className="accent-brand-600" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              إظهار المنتهية
            </label>
            <div className="flex rounded-lg border border-line bg-sunken p-1" role="group" aria-label="طريقة العرض">
              {VIEWS.map((v) => (
                <button key={v.id} onClick={() => setView(v.id)} aria-pressed={view === v.id} className={cn('rounded-md p-1.5 transition-all', view === v.id ? 'bg-card text-brand-600 shadow-sm' : 'text-muted hover:text-ink')} title={v.label} aria-label={v.label}>
                  {v.icon}
                </button>
              ))}
            </div>
          </>
        }
        pad={false}
      >
        <div className="px-5">
          <Tabs
            tabs={[
              { id: 'mine', label: 'المسندة إليّ', count: lists.mine.filter(isOpen).length },
              { id: 'created', label: 'أنشأتها لغيري', count: lists.created.filter(isOpen).length },
              { id: 'review', label: 'أراجعها', count: lists.review.filter((t) => t.status === 'in_review').length },
              { id: 'contributing', label: 'أساهم فيها', count: lists.contributing.filter(isOpen).length },
              { id: 'overdue', label: 'المتأخرة', count: lists.overdue.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div className="p-5">
          {view === 'list' && <TaskList tasks={tasks} onOpen={openTask} />}
          {view === 'board' && <TaskBoard tasks={tasks} onOpen={openTask} />}
          {view === 'calendar' && <TaskCalendar tasks={tasks} onOpen={openTask} />}
        </div>
      </Card>

      <Card
        title="زياراتي هذا الأسبوع"
        actions={<Link to="/visits" className="text-sm font-medium text-brand-700 hover:underline">كل الزيارات</Link>}
      >
        {myVisits.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {myVisits.map((v) => (
              <div key={v.id}>
                <p className={cn('mb-1 text-xs', dateKey(v.plannedStart) === today ? 'font-semibold text-brand-700' : 'text-muted')}>
                  {dateKey(v.plannedStart) === today ? 'اليوم' : fmtDate(v.plannedStart)}
                </p>
                <VisitCard visit={v} onOpen={setVisitId} />
              </div>
            ))}
          </div>
        ) : (
          <Empty title="لا زيارات لك هذا الأسبوع" />
        )}
      </Card>

      <TaskDrawer taskId={taskId} onClose={closeTask} />
      <VisitDrawer visitId={visitId} onClose={() => setVisitId(null)} />
    </div>
  );
};
