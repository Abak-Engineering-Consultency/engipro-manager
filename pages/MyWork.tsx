import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Columns3, List } from 'lucide-react';
import { useStore } from '../app/store';
import { addCalendarDays, dateKey, fmtDate, weekday } from '../domain/calendar';
import { derivedActions, type DerivedAction } from '../domain/derived';
import type { Task } from '../domain/types';
import { Card, cn, Empty, Kpi, PageHeader, Pill, Rule, Tabs } from '../components/ui';
import { NewTaskButton, TaskDrawer } from '../components/work/TaskDrawer';
import { isOpen, isOverdue, TaskBoard, TaskCalendar, TaskList } from '../components/work/TaskViews';
import { VisitCard, isMine } from '../components/visits/VisitParts';
import { VisitDrawer } from '../components/visits/VisitDrawer';

const KIND: Record<DerivedAction['kind'], { label: string; tone: 'waiting' | 'progress' | 'new' | 'brand' }> = {
  approval: { label: 'قرار', tone: 'waiting' },
  work: { label: 'عمل', tone: 'progress' },
  follow_up: { label: 'متابعة', tone: 'new' },
  finance: { label: 'مالية', tone: 'brand' },
  review: { label: 'مراجعة', tone: 'waiting' },
};

type TaskTab = 'mine' | 'created' | 'review' | 'contributing' | 'overdue';
type View = 'list' | 'board' | 'calendar';

const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'list', label: 'قائمة', icon: <List size={15} /> },
  { id: 'board', label: 'لوحة', icon: <Columns3 size={15} /> },
  { id: 'calendar', label: 'تقويم', icon: <CalendarDays size={15} /> },
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="إجراءاتي ومهامي"
        subtitle={<>كل ما ينتظرك في مكان واحد: الإجراءات الرسمية المشتقة من سجلاتها، والمهام، والزيارات — دون تكرار <Rule>TK-10</Rule> <Rule>TK-02</Rule></>}
        actions={<NewTaskButton onCreated={openTask} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="إجراءات بانتظاري" value={actions.length} hint="من سجلاتها الرسمية" tone={actions.length ? 'waiting' : undefined} />
        <Kpi label="مهامي المفتوحة" value={state.tasks.filter((t) => t.ownerId === me.id && isOpen(t)).length} />
        <Kpi label="بانتظار مراجعتي" value={state.tasks.filter((t) => t.reviewerId === me.id && t.status === 'in_review').length} />
        <Kpi label="متأخرة" value={lists.overdue.length} tone={lists.overdue.length ? 'danger' : undefined} />
        <Kpi label="زياراتي هذا الأسبوع" value={myVisits.length} />
      </div>

      <Card
        title="إجراءات النظام بانتظارك"
        subtitle="تُقرأ من حالة كل سجل (اعتماد، مراجعة، تسليم، تحصيل…) ولا تُخزن كمهام، فتختفي تلقائيًا عند إنجازها (F11)"
        pad={false}
      >
        {actions.length ? (
          <ul className="divide-y divide-line">
            {actions.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-page">
                <Pill tone={KIND[a.kind].tone}>{KIND[a.kind].label}</Pill>
                <div className="min-w-0 grow basis-60">
                  <p className="text-sm font-medium text-ink">{a.title}</p>
                  <p className="truncate text-xs text-muted">{a.detail}</p>
                </div>
                <div className="text-xs text-muted tabular">
                  {a.due ? (
                    <span className={cn(Date.parse(a.due) < Date.parse(state.now) && 'font-medium text-st-danger')}>الموعد {fmtDate(a.due)}</span>
                  ) : a.since ? <span>منذ {fmtDate(a.since)}</span> : null}
                </div>
                <Link to={a.link} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
                  فتح <ArrowLeft size={14} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4"><Empty title="لا توجد إجراءات بانتظارك الآن" hint="بدّل المستخدم من أعلى الشاشة لترى ما ينتظر كل دور في المسار." /></div>
        )}
      </Card>

      <Card
        title="المهام"
        subtitle="مسؤول واحد لكل مهمة؛ المعطّلة تُظهر سببها، والمتأخرة تُصعَّد مرة لكل مستوى (TK-05)"
        actions={
          <>
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" className="accent-brand-600" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              إظهار المنتهية
            </label>
            <div className="flex rounded-md border border-line p-0.5">
              {VIEWS.map((v) => (
                <button key={v.id} onClick={() => setView(v.id)} className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-xs', view === v.id ? 'bg-brand-50 font-medium text-brand-700' : 'text-muted hover:text-ink')} title={v.label}>
                  {v.icon}
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
          </>
        }
        pad={false}
      >
        <div className="px-2">
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
        <div className="p-4">
          {view === 'list' && <TaskList tasks={tasks} onOpen={openTask} />}
          {view === 'board' && <TaskBoard tasks={tasks} onOpen={openTask} />}
          {view === 'calendar' && <TaskCalendar tasks={tasks} onOpen={openTask} />}
        </div>
      </Card>

      <Card
        title="زياراتي هذا الأسبوع"
        subtitle="بصفتي مسؤولًا أو مشاركًا"
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
