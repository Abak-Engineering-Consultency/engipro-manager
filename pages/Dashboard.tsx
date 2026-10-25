import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BadgeCheck, Briefcase, ClipboardCheck, Coins, FileSearch, FolderKanban, Gavel, Inbox, ListTodo, RefreshCw } from 'lucide-react';
import { useLookup, useStore } from '../app/store';
import { fmtLong, fmtMoney, isBefore } from '../domain/calendar';
import { derivedActions, type DerivedAction } from '../domain/derived';
import { DELIVERABLE_STATES, GOV_STATES, PROJECT_STATES } from '../domain/labels';
import { allows, hasRole, holds } from '../domain/permissions';
import { projectProgress, visibleProjects } from '../domain/selectors';
import type { AppState, ProjectState, User } from '../domain/types';
import { Card, cn, DateText, Empty, Kpi, Pill, Progress, StatePill, Table, Td } from '../components/ui';
import { attentionReason, nextStep } from '../components/projects/shared';

const KIND: Record<DerivedAction['kind'], { label: string; icon: React.ReactNode }> = {
  approval: { label: 'قرار', icon: <Gavel size={16} /> },
  finance: { label: 'مالية', icon: <Coins size={16} /> },
  review: { label: 'مراجعة', icon: <FileSearch size={16} /> },
  follow_up: { label: 'متابعة', icon: <RefreshCw size={16} /> },
  work: { label: 'عمل', icon: <ClipboardCheck size={16} /> },
};

/** One dashboard; its panels open by what the person holds, never by a job title. */
export const Dashboard: React.FC = () => {
  const { state, me } = useStore();
  const actions = useMemo(() => derivedActions(state, me), [state, me]);
  const projects = useMemo(() => visibleProjects(state, me), [state, me]);
  const open = projects.filter((p) => !['operationally_closed', 'cancelled'].includes(p.status));
  const attention = open.filter((p) => attentionReason(state, p));
  const myTasks = state.tasks.filter((t) => t.ownerId === me.id && !['completed', 'cancelled'].includes(t.status));
  const overdueTasks = myTasks.filter((t) => isBefore(t.dueDate, state.now));
  const isFinance = holds(me, 'collection.confirm');
  const isPortfolio = allows(me, 'project.read') || hasRole(me, 'dept_manager');
  const isGov = holds(me, 'gov_transaction.prepare') || holds(me, 'gov_transaction.assign') || holds(me, 'gov_transaction.follow_up');
  const isSales = holds(me, 'opportunity.work');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">مرحبًا، {me.name}</h1>
          <p className="mt-1 text-sm text-muted">{me.title}</p>
        </div>
        <p className="text-sm font-medium text-muted">{fmtLong(state.now)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="إجراءات بانتظارك" value={actions.length} icon={<Inbox size={20} />} tone={actions.length ? 'waiting' : undefined} to="/work" />
        <Kpi label="مهامي المفتوحة" value={myTasks.length} hint={overdueTasks.length ? `${overdueTasks.length} متأخرة` : 'لا يوجد متأخر'} icon={<ListTodo size={20} />} tone={overdueTasks.length ? 'danger' : undefined} to="/work" />
        <Kpi label="المشاريع المفتوحة" value={open.length} hint={`${open.filter((p) => p.status === 'in_progress').length} قيد التنفيذ`} icon={<Briefcase size={20} />} to="/projects" />
        <Kpi label="تحتاج انتباهًا" value={attention.length} hint={attention.length ? 'معلّقة أو متأخرة أو متوقفة' : 'كل المشاريع على المسار'} icon={<AlertTriangle size={20} />} tone={attention.length ? 'waiting' : undefined} to="/projects?view=attention" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="ما ينتظرك الآن"
          actions={<Link to="/work" className="text-sm font-medium text-brand-700 hover:underline">عرض الكل</Link>}
          pad={false}
        >
          {actions.length + myTasks.length === 0 ? (
            <div className="p-5"><Empty icon={<BadgeCheck size={28} />} title="لا شيء ينتظرك" hint="ستظهر هنا القرارات والمهام المطلوبة منك." /></div>
          ) : (
            <ul className="divide-y divide-line">
              {actions.slice(0, 6).map((a) => (
                <li key={a.key}>
                  <Link to={a.link} className="group flex items-center gap-4 px-5 py-3 hover:bg-page">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600" title={KIND[a.kind].label}>{KIND[a.kind].icon}</span>
                    <span className="min-w-0 grow">
                      <span className="block truncate text-sm font-medium text-ink group-hover:text-brand-700">{a.title}</span>
                      <span className="block truncate text-xs text-muted">{KIND[a.kind].label} · {a.detail}</span>
                    </span>
                    {a.due && isBefore(a.due, state.now) && <Pill tone="danger">متأخر</Pill>}
                    <ArrowLeft size={16} className="shrink-0 text-faint group-hover:text-brand-600" />
                  </Link>
                </li>
              ))}
              {myTasks.slice(0, Math.max(0, 6 - actions.length)).map((t) => (
                <li key={t.id}>
                  <Link to={`/work?task=${t.id}`} className="group flex items-center gap-4 px-5 py-3 hover:bg-page">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2" title="مهمة"><ListTodo size={16} /></span>
                    <span className="min-w-0 grow">
                      <span className="block truncate text-sm font-medium text-ink group-hover:text-brand-700">{t.title}</span>
                      <span className="block text-xs text-muted">مهمة · الموعد <DateText iso={t.dueDate} /></span>
                    </span>
                    {isBefore(t.dueDate, state.now) && <Pill tone="danger">متأخرة</Pill>}
                    <ArrowLeft size={16} className="shrink-0 text-faint group-hover:text-brand-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {isPortfolio ? <Pipeline state={state} me={me} /> : <MyDeliverables state={state} me={me} />}
      </div>

      {isPortfolio && <ProjectsBoard state={state} me={me} />}
      {(isFinance || isGov || isSales || !isPortfolio) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {isFinance && <MoneyPanel state={state} />}
          {isGov && <GovPanel state={state} me={me} />}
          {isSales && <Collections state={state} me={me} />}
          {!isPortfolio && <MyProjects state={state} me={me} />}
        </div>
      )}
    </div>
  );
};

const LIFECYCLE: ProjectState[] = ['awaiting_assignment', 'preparing', 'in_progress', 'technically_complete', 'closure_review', 'operationally_closed'];
const SIDE: ProjectState[] = ['suspended', 'cancellation_review', 'cancelled'];

/** Projects per lifecycle stage, in process order; empty stages recede so the occupied ones read first. */
function Pipeline({ state, me }: { state: AppState; me: User }) {
  const projects = visibleProjects(state, me);
  const count = (s: ProjectState) => projects.filter((p) => p.status === s).length;
  const max = Math.max(1, ...LIFECYCLE.map(count));
  const side = SIDE.filter((s) => count(s));
  return (
    <Card title="المشاريع حسب المرحلة" icon={<FolderKanban size={18} />}>
      <ol className="space-y-3">
        {LIFECYCLE.map((s, i) => {
          const n = count(s);
          return (
            <li key={s}>
              <Link to={`/projects?status=${s}`} className="group grid grid-cols-[1.25rem_1fr_auto] items-center gap-3">
                <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[11px] tabular', n ? 'bg-brand-600 text-white' : 'bg-sunken text-faint')}>{i + 1}</span>
                <span className="min-w-0">
                  <span className={cn('block text-sm', n ? 'font-medium text-ink group-hover:text-brand-700' : 'text-faint')}>{PROJECT_STATES[s].label}</span>
                  <span className="mt-1 block h-1.5 rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                </span>
                <span className={cn('text-sm tabular', n ? 'font-semibold text-ink' : 'text-faint')}>{n}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {side.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {side.map((s) => (
            <Link key={s} to={`/projects?status=${s}`}><Pill tone={PROJECT_STATES[s].tone}>{PROJECT_STATES[s].label} {count(s)}</Pill></Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function ProjectsBoard({ state, me }: { state: AppState; me: User }) {
  const { userName, client } = useLookup();
  const projects = visibleProjects(state, me).filter((p) => !['operationally_closed', 'cancelled'].includes(p.status));
  return (
    <Card title="المشاريع المفتوحة" actions={<Link to="/projects" className="text-sm font-medium text-brand-700 hover:underline">كل المشاريع</Link>} pad={false}>
      <Table head={['المشروع', 'الحالة', 'مدير المشروع', 'الإنجاز', 'الخطوة التالية']}>
        {projects.map((p) => {
          const step = nextStep(state, p);
          const why = attentionReason(state, p);
          const progress = projectProgress(state, p);
          return (
            <tr key={p.id} className="hover:bg-page">
              <Td>
                <Link to={`/projects/${p.id}`} className="block">
                  <span className="block font-medium text-ink hover:text-brand-700">{p.title}</span>
                  <span className="block text-xs text-muted"><span className="ltr-iso">{p.id}</span> · {client(p.clientId)?.name}</span>
                </Link>
              </Td>
              <Td><StatePill s={PROJECT_STATES[p.status]} /></Td>
              <Td className="whitespace-nowrap text-ink-2">{userName(p.pmId)}</Td>
              <Td className="w-44">
                <div className="flex items-center gap-2"><Progress value={progress} tone={progress === 100 ? 'success' : 'brand'} /><span className="w-9 text-xs tabular text-muted">{progress}%</span></div>
              </Td>
              <Td className="max-w-xs">
                <span className="block text-sm text-ink-2">{step.text}</span>
                {why && <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-st-waiting"><AlertTriangle size={12} />{why}</span>}
              </Td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}

/** A label/value list: the amounts lead, their labels recede; only late money takes a colour. */
function MoneyPanel({ state }: { state: AppState }) {
  const sum = (f: (p: AppState['payments'][number]) => boolean, v: (p: AppState['payments'][number]) => number) => state.payments.filter(f).reduce((s, p) => s + v(p), 0);
  const due = sum((p) => p.entitlement === 'due' && p.collection !== 'fully_collected', (p) => p.amount - p.collected);
  const overdue = sum((p) => p.entitlement === 'overdue' && p.collection !== 'fully_collected', (p) => p.amount - p.collected);
  const collected = sum(() => true, (p) => p.collected);
  const notDue = sum((p) => p.entitlement === 'not_due', (p) => p.amount);
  const costs = state.costs.filter((c) => ['approved', 'partially_paid'].includes(c.status) || (c.status === 'service_received' && c.paid < c.amount)).reduce((s, c) => s + c.amount - c.paid, 0);
  const rows: { label: string; value: string; tone?: 'danger' | 'waiting' }[] = [
    { label: 'متأخرة بعد المهلة', value: fmtMoney(overdue), tone: overdue ? 'danger' : undefined },
    { label: 'مستحقة ضمن المهلة', value: fmtMoney(due), tone: due ? 'waiting' : undefined },
    { label: 'محصّل', value: fmtMoney(collected) },
    { label: 'لم تستحق بعد', value: fmtMoney(notDue) },
    { label: 'تكاليف معتمدة لم تُصرف', value: fmtMoney(costs) },
    { label: 'طلبات تفعيل بانتظار القرار', value: String(state.activations.filter((a) => a.status === 'pending_finance').length) },
  ];
  return (
    <Card title="المالية" icon={<Coins size={18} />} actions={<Link to="/finance" className="text-sm font-medium text-brand-700 hover:underline">مكتب المالية</Link>}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className={cn('mt-0.5 text-lg font-semibold tabular', r.tone === 'danger' ? 'text-st-danger' : r.tone === 'waiting' ? 'text-st-waiting' : 'text-ink')}><span className="ltr-iso">{r.value}</span></dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function GovPanel({ state, me }: { state: AppState; me: User }) {
  const mine = state.gov.filter((g) => g.licensingOfficerId === me.id || g.expeditorId === me.id || holds(me, 'gov_transaction.assign'));
  const stale = mine.filter((g) => g.status === 'at_authority' && g.lastUpdateAt && Date.parse(state.now) - Date.parse(g.lastUpdateAt) >= state.settings.expeditorUpdateDays * 86_400_000);
  return (
    <Card title="المعاملات الحكومية" actions={<Link to="/gov" className="text-sm font-medium text-brand-700 hover:underline">كل المعاملات</Link>} pad={false}>
      {mine.length === 0 ? <div className="p-5"><Empty title="لا معاملات" /></div> : (
        <ul className="divide-y divide-line">
          {mine.map((g) => (
            <li key={g.id}>
              <Link to={`/gov?id=${g.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-page">
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-medium text-ink">{g.procedureType}</span>
                  <span className="block text-xs text-muted">{g.authority} · <span className="ltr-iso">{g.id}</span></span>
                </span>
                {stale.includes(g) && <Pill tone="danger">تحديث متأخر</Pill>}
                <StatePill s={GOV_STATES[g.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Collections({ state, me }: { state: AppState; me: User }) {
  const owned = state.projects.filter((p) => (p.opportunityId ? state.opportunities.find((o) => o.id === p.opportunityId)?.ownerId === me.id : p.followUpOwnerId === me.id));
  const pays = state.payments.filter((p) => (hasRole(me, 'sales_manager') ? !!p.escalatedAt : owned.some((o) => o.id === p.projectId)) && p.invoicing === 'invoiced' && p.collection !== 'fully_collected');
  return (
    <Card title={hasRole(me, 'sales_manager') ? 'تحصيل مصعّد إليك' : 'متابعة التحصيل'} pad={false}>
      {pays.length === 0 ? <div className="p-5"><Empty title="لا مطالبات مفتوحة" /></div> : (
        <ul className="divide-y divide-line">
          {pays.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.projectId}?tab=payments&p=${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-page">
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-medium text-ink">{p.label}</span>
                  <span className="block text-xs text-muted"><span className="ltr-iso">{p.projectId}</span> · متبقٍ <span className="ltr-iso">{fmtMoney(p.amount - p.collected)}</span></span>
                </span>
                {p.entitlement === 'overdue' ? <Pill tone="danger">متأخرة</Pill> : <Pill tone="waiting">ضمن المهلة</Pill>}
                {p.escalatedAt && <Pill tone="danger">مصعّدة</Pill>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MyDeliverables({ state, me }: { state: AppState; me: User }) {
  const mine = state.deliverables.filter((d) => {
    const p = state.projects.find((x) => x.id === d.projectId);
    return p?.scopeItems.some((i) => d.scopeItemIds.includes(i.id) && i.ownerId === me.id) && !['client_approved', 'excluded'].includes(d.status);
  });
  return (
    <Card title="مخرجاتي" pad={false}>
      {mine.length === 0 ? <div className="p-5"><Empty title="لا مخرجات مفتوحة" /></div> : (
        <ul className="divide-y divide-line">
          {mine.map((d) => (
            <li key={d.id}>
              <Link to={`/projects/${d.projectId}?tab=deliverables&d=${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-page">
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-medium text-ink">{d.title}</span>
                  <span className="ltr-iso text-xs text-muted">{d.projectId}</span>
                </span>
                <StatePill s={DELIVERABLE_STATES[d.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MyProjects({ state, me }: { state: AppState; me: User }) {
  const projects = visibleProjects(state, me);
  return (
    <Card title="مشاريعي" pad={false}>
      {projects.length === 0 ? <div className="p-5"><Empty title="لست عضوًا في أي مشروع" /></div> : (
        <ul className="divide-y divide-line">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-page">
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                  <span className="ltr-iso text-xs text-muted">{p.id}</span>
                </span>
                <StatePill s={PROJECT_STATES[p.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
