import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLookup, useStore } from '../app/store';
import { fmtLong, fmtMoney, isBefore } from '../domain/calendar';
import { derivedActions } from '../domain/derived';
import { DELIVERABLE_STATES, GOV_STATES, PROJECT_STATES } from '../domain/labels';
import { allows, holds } from '../domain/permissions';
import { projectProgress, startGate, visibleProjects } from '../domain/selectors';
import type { AppState, ProjectState, User } from '../domain/types';
import { Card, DateText, Empty, Id, Kpi, PageHeader, Pill, Progress, Rule, StatePill } from '../components/ui';

/** X-05 — one dashboard, its panels opened by what the person holds (never by a job title). */
export const Dashboard: React.FC = () => {
  const { state, me } = useStore();
  const actions = useMemo(() => derivedActions(state, me), [state, me]);
  const projects = useMemo(() => visibleProjects(state, me), [state, me]);
  const myTasks = state.tasks.filter((t) => t.ownerId === me.id && !['completed', 'cancelled'].includes(t.status));
  const overdueTasks = myTasks.filter((t) => isBefore(t.dueDate, state.now));
  const unread = state.notifications.filter((n) => n.userId === me.id && !n.read).length;
  const isFinance = holds(me, 'collection.confirm');
  const isPortfolio = allows(me, 'project.read') || me.roleId === 'dept_manager';
  const isGov = holds(me, 'gov_transaction.prepare') || holds(me, 'gov_transaction.assign') || holds(me, 'gov_transaction.follow_up');
  const isSales = holds(me, 'opportunity.work');

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={fmtLong(state.now)} title={`مرحبًا، ${me.name}`} subtitle={`${me.title} — هذه لوحتك حسب صلاحياتك ومشاريعك. بدّل المستخدم من الأعلى لرؤية لوحة دور آخر.`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="إجراءات بانتظارك" value={actions.length} hint="من سجلاتها مباشرة — لا تُخزَّن كمهام" tone={actions.length ? 'waiting' : undefined} />
        <Kpi label="مهامي المفتوحة" value={myTasks.length} hint={overdueTasks.length ? `${overdueTasks.length} متأخرة` : 'لا متأخر'} tone={overdueTasks.length ? 'danger' : undefined} />
        <Kpi label="مشاريع أراها" value={projects.length} hint={`${projects.filter((p) => p.status === 'in_progress').length} قيد التنفيذ`} />
        <Kpi label="إشعارات غير مقروءة" value={unread} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="ما ينتظرك الآن"
          subtitle="الإجراء المشتق يظهر هنا من وحدته ولا يتكرر كمهمة (TK-02)"
          actions={<Link to="/work" className="text-sm text-brand-700 hover:underline">كل الإجراءات</Link>}
        >
          {actions.length + myTasks.length === 0 ? (
            <Empty title="لا شيء ينتظرك" hint="جرّب مستخدمًا آخر من أعلى الشاشة، أو قدّم التاريخ لتظهر التذكيرات." />
          ) : (
            <ul className="divide-y divide-line">
              {actions.slice(0, 7).map((a) => (
                <li key={a.key}>
                  <Link to={a.link} className="flex items-center gap-3 py-2.5 hover:bg-page">
                    <Pill tone={a.kind === 'approval' ? 'waiting' : a.kind === 'finance' ? 'brand' : a.kind === 'review' ? 'progress' : 'new'}>
                      {a.kind === 'approval' ? 'قرار' : a.kind === 'finance' ? 'مالية' : a.kind === 'review' ? 'مراجعة' : a.kind === 'follow_up' ? 'متابعة' : 'عمل'}
                    </Pill>
                    <span className="min-w-0 grow">
                      <span className="block truncate text-sm font-medium text-ink">{a.title}</span>
                      <span className="block truncate text-xs text-muted">{a.detail}</span>
                    </span>
                    {a.projectId && <Id>{a.projectId}</Id>}
                    <ArrowLeft size={15} className="shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
              {myTasks.slice(0, Math.max(0, 7 - actions.length)).map((t) => (
                <li key={t.id}>
                  <Link to={`/work?task=${t.id}`} className="flex items-center gap-3 py-2.5 hover:bg-page">
                    <Pill tone="new">مهمة</Pill>
                    <span className="min-w-0 grow">
                      <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                      <span className="block text-xs text-muted">الموعد <DateText iso={t.dueDate} /></span>
                    </span>
                    {isBefore(t.dueDate, state.now) && <Pill tone="danger">متأخرة</Pill>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {isPortfolio ? <Portfolio state={state} me={me} /> : <MyDeliverables state={state} me={me} />}
      </div>

      {isPortfolio && <ProjectsBoard state={state} me={me} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {isFinance && <Money state={state} />}
        {isGov && <GovPanel state={state} me={me} />}
        {isSales && <Collections state={state} me={me} />}
        {!isPortfolio && <MyProjects state={state} me={me} />}
      </div>
    </div>
  );
};

const ORDER: ProjectState[] = ['awaiting_assignment', 'preparing', 'in_progress', 'suspended', 'technically_complete', 'closure_review', 'operationally_closed', 'cancellation_review', 'cancelled'];

/** One measure (projects per state), one hue, values printed — a bar list, not a chart. */
function Portfolio({ state, me }: { state: AppState; me: User }) {
  const projects = visibleProjects(state, me);
  const max = Math.max(1, ...ORDER.map((s) => projects.filter((p) => p.status === s).length));
  return (
    <Card title="المشاريع حسب الحالة" subtitle="قاموس حالات واحد (11-B1)">
      <ul className="space-y-2">
        {ORDER.map((s) => {
          const n = projects.filter((p) => p.status === s).length;
          return (
            <li key={s} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm">
              <span className="truncate text-ink-2">{PROJECT_STATES[s].label}</span>
              <span className="h-2.5 rounded-full bg-sunken">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-end tabular text-ink">{n}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ProjectsBoard({ state, me }: { state: AppState; me: User }) {
  const { userName, client } = useLookup();
  const projects = visibleProjects(state, me).filter((p) => !['operationally_closed', 'cancelled'].includes(p.status));
  return (
    <Card title="المشاريع المفتوحة" subtitle="الإنجاز بالعمل المنجز، والسبب الذي يوقف كل مشروع (SC-02)" pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-page text-xs text-muted">
              <th className="px-3 py-2 text-start font-medium">المشروع</th>
              <th className="px-3 py-2 text-start font-medium">الحالة</th>
              <th className="px-3 py-2 text-start font-medium">مدير المشروع</th>
              <th className="w-40 px-3 py-2 text-start font-medium">الإنجاز</th>
              <th className="px-3 py-2 text-start font-medium">ما يوقفه / التالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {projects.map((p) => {
              const gate = p.status === 'preparing' ? startGate(state, p) : [];
              const next = p.status === 'awaiting_assignment' ? (p.receivedAt ? (p.pmNomination?.status === 'pending' ? 'اعتماد مدير المشروع' : 'ترشيح مدير المشروع') : 'استلام مدير الأقسام')
                : gate.length ? gate.join(' · ') : p.status === 'suspended' ? p.suspension?.reason : p.status === 'technically_complete' ? 'طلب الإغلاق' : p.status === 'closure_review' ? 'سلسلة اعتماد الإغلاق' : '—';
              const progress = projectProgress(state, p);
              return (
                <tr key={p.id} className="hover:bg-page">
                  <td className="px-3 py-2.5">
                    <Link to={`/projects/${p.id}`} className="block">
                      <Id>{p.id}</Id>
                      <span className="block font-medium text-ink hover:text-brand-700">{p.title}</span>
                      <span className="block text-xs text-muted">{client(p.clientId)?.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5"><StatePill s={PROJECT_STATES[p.status]} /></td>
                  <td className="px-3 py-2.5 text-ink-2">{userName(p.pmId)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2"><Progress value={progress} /><span className="text-xs tabular text-muted">{progress}%</span></div>
                  </td>
                  <td className="max-w-xs px-3 py-2.5 text-xs text-ink-2">{next}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Money({ state }: { state: AppState }) {
  const sum = (f: (p: AppState['payments'][number]) => boolean, v: (p: AppState['payments'][number]) => number) => state.payments.filter(f).reduce((s, p) => s + v(p), 0);
  const due = sum((p) => p.entitlement === 'due' && p.collection !== 'fully_collected', (p) => p.amount - p.collected);
  const overdue = sum((p) => p.entitlement === 'overdue' && p.collection !== 'fully_collected', (p) => p.amount - p.collected);
  const collected = sum(() => true, (p) => p.collected);
  const notDue = sum((p) => p.entitlement === 'not_due', (p) => p.amount);
  const costs = state.costs.filter((c) => ['approved', 'partially_paid'].includes(c.status) || (c.status === 'service_received' && c.paid < c.amount)).reduce((s, c) => s + c.amount - c.paid, 0);
  return (
    <Card title="المالية" subtitle="الاستحقاق ≠ الفاتورة ≠ التحصيل (A5)" actions={<Link to="/finance" className="text-sm text-brand-700 hover:underline">مكتب المالية</Link>}>
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="مستحقة ضمن المهلة" value={fmtMoney(due)} tone={due ? 'waiting' : undefined} />
        <Kpi label="متأخرة بعد المهلة" value={fmtMoney(overdue)} tone={overdue ? 'danger' : undefined} />
        <Kpi label="محصّل" value={fmtMoney(collected)} />
        <Kpi label="لم تستحق بعد" value={fmtMoney(notDue)} />
        <Kpi label="تكاليف معتمدة لم تُصرف" value={fmtMoney(costs)} />
        <Kpi label="طلبات تفعيل بانتظار القرار" value={state.activations.filter((a) => a.status === 'pending_finance').length} />
      </div>
    </Card>
  );
}

function GovPanel({ state, me }: { state: AppState; me: User }) {
  const mine = state.gov.filter((g) => g.licensingOfficerId === me.id || g.expeditorId === me.id || holds(me, 'gov_transaction.assign'));
  const stale = mine.filter((g) => g.status === 'at_authority' && g.lastUpdateAt && Date.parse(state.now) - Date.parse(g.lastUpdateAt) >= state.settings.expeditorUpdateDays * 86_400_000);
  return (
    <Card title="المعاملات الحكومية" subtitle="انتظار الجهة يُحسب منفصلًا (GT-07)" actions={<Link to="/gov" className="text-sm text-brand-700 hover:underline">كل المعاملات</Link>}>
      {mine.length === 0 ? <Empty title="لا معاملات" /> : (
        <ul className="divide-y divide-line">
          {mine.map((g) => (
            <li key={g.id}>
              <Link to={`/gov?id=${g.id}`} className="flex items-center gap-2 py-2 hover:bg-page">
                <Id>{g.id}</Id>
                <span className="min-w-0 grow truncate text-sm text-ink">{g.procedureType} — {g.authority}</span>
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
  const pays = state.payments.filter((p) => (me.roleId === 'sales_manager' ? !!p.escalatedAt : owned.some((o) => o.id === p.projectId)) && p.invoicing === 'invoiced' && p.collection !== 'fully_collected');
  return (
    <Card title={me.roleId === 'sales_manager' ? 'تحصيل مصعّد إليك' : 'متابعة التحصيل'} subtitle="مسؤول الفرصة يتابع ولا يؤكد التحصيل (DL-12)">
      {pays.length === 0 ? <Empty title="لا مطالبات مفتوحة" /> : (
        <ul className="divide-y divide-line">
          {pays.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.projectId}?tab=payments&p=${p.id}`} className="flex items-center gap-2 py-2 hover:bg-page">
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm text-ink">{p.label}</span>
                  <span className="block text-xs text-muted">{p.projectId} — متبقٍ {fmtMoney(p.amount - p.collected)}</span>
                </span>
                {p.entitlement === 'overdue' ? <Pill tone="danger">متأخرة</Pill> : <Pill tone="waiting">ضمن المهلة</Pill>}
                {p.escalatedAt && <Rule>DL-13</Rule>}
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
    <Card title="مخرجاتي" subtitle="البنود التي أنا مسؤولها">
      {mine.length === 0 ? <Empty title="لا مخرجات مفتوحة" /> : (
        <ul className="divide-y divide-line">
          {mine.map((d) => (
            <li key={d.id}>
              <Link to={`/projects/${d.projectId}?tab=deliverables&d=${d.id}`} className="flex items-center gap-2 py-2 hover:bg-page">
                <span className="min-w-0 grow truncate text-sm text-ink">{d.title}</span>
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
    <Card title="مشاريعي" subtitle="الرؤية بالعضوية في المشروع (OD-14)">
      {projects.length === 0 ? <Empty title="لست عضوًا في أي مشروع" /> : (
        <ul className="divide-y divide-line">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="flex items-center gap-2 py-2 hover:bg-page">
                <Id>{p.id}</Id>
                <span className="min-w-0 grow truncate text-sm text-ink">{p.title}</span>
                <StatePill s={PROJECT_STATES[p.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
