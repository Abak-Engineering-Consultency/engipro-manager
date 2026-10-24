import React, { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Clock, Landmark, PauseCircle, ShieldAlert } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { daysBetween, fmtDate } from '../../domain/calendar';
import { deptName } from '../../domain/catalog';
import { GOV_STATES, PROJECT_STATES, SUSPENSION_TYPES } from '../../domain/labels';
import { projectAccess, projectBar, projectProgress, startGate, type ProjectAccess } from '../../domain/selectors';
import type { Project, ProjectState } from '../../domain/types';
import { Card, cn, Empty, Id, Pill, Progress, Rule, StatePill, Tabs } from '../../components/ui';
import { OverviewTab } from './OverviewTab';
import { TeamTab } from './TeamTab';
import { PlanTab } from './PlanTab';
import { DeliverablesTab } from './DeliverablesTab';
import { PaymentsTab } from './PaymentsTab';
import { ProjectGovTab } from './ProjectGovTab';
import { ProjectVisitsTab } from './ProjectVisitsTab';
import { ProjectTasksTab } from './ProjectTasksTab';
import { CostsTab } from './CostsTab';
import { ChangesTab } from './ChangesTab';
import { ClosureTab } from './ClosureTab';
import { DocumentsTab } from './DocumentsTab';
import { ActivityTab } from './ActivityTab';

export interface TabProps { project: Project; access: Exclude<ProjectAccess, null> }

type TabId = 'overview' | 'team' | 'plan' | 'deliverables' | 'payments' | 'gov' | 'visits' | 'tasks' | 'costs' | 'changes' | 'closure' | 'documents' | 'activity';

const TAB_LABELS: Record<TabId, string> = {
  overview: 'نظرة عامة', team: 'التعيين والفريق', plan: 'التجهيز والخطة', deliverables: 'المخرجات والإصدارات', payments: 'الدفعات والتحصيل',
  gov: 'المعاملات الحكومية', visits: 'الزيارات', tasks: 'المهام', costs: 'طلبات التكلفة', changes: 'الإضافات والتغييرات',
  closure: 'الإغلاق والإلغاء', documents: 'الملفات (Nextcloud)', activity: 'سجل الأحداث',
};

/** OD-14 / NX-03: what each kind of access may open. */
const TABS_BY_ACCESS: Record<Exclude<ProjectAccess, null>, TabId[]> = {
  full: ['overview', 'team', 'plan', 'deliverables', 'payments', 'gov', 'visits', 'tasks', 'costs', 'changes', 'closure', 'documents', 'activity'],
  finance: ['overview', 'payments', 'costs', 'closure', 'documents', 'activity'],
  client: ['overview', 'deliverables', 'payments', 'gov', 'visits', 'changes'],
};

const LIFECYCLE: ProjectState[] = ['awaiting_assignment', 'preparing', 'in_progress', 'technically_complete', 'closure_review', 'operationally_closed'];

export const ProjectPage: React.FC = () => {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { state, me } = useStore();
  const { userName, client } = useLookup();
  const project = state.projects.find((p) => p.id === id);
  const access = project ? projectAccess(state, me, project) : null;
  const counts = useMemo(() => {
    if (!project) return {} as Record<string, number>;
    return {
      deliverables: state.deliverables.filter((d) => d.projectId === project.id && !['client_approved', 'excluded'].includes(d.status)).length,
      gov: state.gov.filter((g) => g.projectId === project.id && !['issued', 'closed_not_issued'].includes(g.status)).length,
      tasks: state.tasks.filter((t) => t.link?.projectId === project.id && !['completed', 'cancelled'].includes(t.status)).length,
      changes: project.changeRequests.filter((c) => ['pending', 'with_sales'].includes(c.status)).length,
      costs: state.costs.filter((c) => c.projectId === project.id && !['paid', 'service_received', 'rejected'].includes(c.status)).length,
    };
  }, [state, project]);

  if (!project) return <Empty title="المشروع غير موجود" hint={<Link className="text-brand-700 underline" to="/projects">العودة للمشاريع</Link>} />;
  if (!access) {
    return <Empty icon={<ShieldAlert size={28} />} title="لا تملك صلاحية الاطلاع على هذا المشروع" hint="الرؤية بالعضوية في المشروع أو نطاق القسم أو الإدارة (OD-14). بدّل المستخدم من أعلى الشاشة لتجربة دور آخر." />;
  }

  const tabs = TABS_BY_ACCESS[access];
  const tab = (tabs.includes(params.get('tab') as TabId) ? params.get('tab') : 'overview') as TabId;
  const setTab = (t: TabId) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    next.delete('d');
    next.delete('p');
    next.delete('c');
    setParams(next, { replace: true });
  };
  const bar = projectBar(state, project);
  const progress = projectProgress(state, project);
  const gate = project.status === 'preparing' ? startGate(state, project) : [];
  const exc = project.exceptionId ? state.exceptions.find((e) => e.id === project.exceptionId) : undefined;
  const lateDays = project.contractEndDate && project.expectedEndDate ? daysBetween(project.contractEndDate, project.expectedEndDate, 'calendar', state.settings) : 0;
  const props: TabProps = { project, access };

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link to="/projects" className="hover:text-brand-700">المشاريع</Link>
        <ChevronLeft size={14} className="mirror-rtl rotate-180" />
        <Id>{project.id}</Id>
      </nav>

      <Card pad={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Id className="text-sm">{project.id}</Id>
              <StatePill s={PROJECT_STATES[project.status]} />
              {project.financialState === 'settled' ? <Pill tone="success">مسوّى ماليًا</Pill> : ['operationally_closed', 'cancelled'].includes(project.status) && <Pill tone="waiting">الإغلاق المالي مفتوح</Pill>}
              {project.createdFrom === 'exception' && <Pill tone="danger">باستثناء الرئيس التنفيذي</Pill>}
              {project.createdFrom === 'pre_system' && <Pill tone="brand">قائم قبل النظام</Pill>}
              {project.multiDept && <Pill tone="brand">متعدد الأقسام</Pill>}
              {project.sites.length > 1 && <Pill tone="brand">{project.sites.length} مواقع</Pill>}
            </div>
            <h1 className="mt-1 text-xl font-semibold text-ink">{project.title}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {client(project.clientId)?.name} · مدير المشروع: {userName(project.pmId)} · القسم الرئيسي: {deptName(project.leadDept)}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>الإنجاز (بالعمل المنجز لا بالوقت)</span>
              <span className="tabular">{progress}%</span>
            </div>
            <Progress value={progress} tone={progress === 100 ? 'success' : 'brand'} />
          </div>
        </div>

        <LifecycleStepper status={project.status} />

        {/* SC-02 — the project bar */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line bg-page px-4 py-3 text-sm md:grid-cols-4 xl:grid-cols-7">
          <BarFact label="المرحلة الحالية">{bar.phase ?? '—'}</BarFact>
          <BarFact label="الجهة والمعاملة">
            {bar.gov ? (
              <span className="inline-flex items-center gap-1"><Landmark size={13} className="text-muted" />{bar.gov.authority} · <StatePill s={GOV_STATES[bar.gov.status]} /></span>
            ) : '—'}
          </BarFact>
          <BarFact label="انتظار الجهة الآن">{bar.gov ? `${bar.waitingNow} يوم` : '—'}</BarFact>
          <BarFact label="المتابع">{bar.gov?.expeditorId ? `${userName(bar.gov.expeditorId)} (تحت ${userName(state.users.find((u) => u.grants.some((g) => g.perm === 'gov_transaction.assign'))?.id)})` : '—'}</BarFact>
          <BarFact label="آخر / التالية">{bar.lastFollowUp ? `${fmtDate(bar.lastFollowUp)} / ${fmtDate(bar.nextFollowUp)}` : '—'}</BarFact>
          <BarFact label="وقت المكتب / وقت الجهة">
            <span className="tabular">{bar.officeDays} / {bar.authorityDays} يوم</span> <Rule>F10</Rule>
          </BarFact>
          <BarFact label="الموعد التعاقدي / المتوقع">
            <span className={cn('tabular', lateDays > 0 && 'text-st-waiting')}>{fmtDate(project.contractEndDate)} / {fmtDate(project.expectedEndDate)}</span>
          </BarFact>
        </div>

        {project.status === 'suspended' && project.suspension && (
          <div className="flex items-center gap-2 border-t border-line bg-st-waiting-bg px-4 py-2 text-sm text-st-waiting">
            <PauseCircle size={16} /> معلّق بسبب {SUSPENSION_TYPES[project.suspension.type]}: {project.suspension.reason} — منذ {fmtDate(project.suspension.since)}. الموعد التعاقدي لا يتغير والتأخر ظاهر.
          </div>
        )}
        {gate.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-st-waiting-bg px-4 py-2 text-sm text-st-waiting">
            <AlertTriangle size={16} /> بوابة البدء غير مستوفاة: {gate.join(' · ')} <Rule>PJ-09</Rule>
          </div>
        )}
        {exc && exc.status !== 'linked' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-st-danger-bg px-4 py-2 text-sm text-st-danger">
            <Clock size={16} /> يعمل باستثناء الرئيس التنفيذي ({exc.id}) حتى {fmtDate(exc.expiresAt)} — سقف التكلفة {exc.costCap.toLocaleString('en')} ر.س، النطاق: {exc.allowedScope} <Rule>F15</Rule>
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-2">
          <Tabs tabs={tabs.map((t) => ({ id: t, label: TAB_LABELS[t], count: counts[t] }))} value={tab} onChange={setTab} />
        </div>
        <div className="p-4">
          {tab === 'overview' && <OverviewTab {...props} />}
          {tab === 'team' && <TeamTab {...props} />}
          {tab === 'plan' && <PlanTab {...props} />}
          {tab === 'deliverables' && <DeliverablesTab {...props} />}
          {tab === 'payments' && <PaymentsTab {...props} />}
          {tab === 'gov' && <ProjectGovTab {...props} />}
          {tab === 'visits' && <ProjectVisitsTab {...props} />}
          {tab === 'tasks' && <ProjectTasksTab {...props} />}
          {tab === 'costs' && <CostsTab {...props} />}
          {tab === 'changes' && <ChangesTab {...props} />}
          {tab === 'closure' && <ClosureTab {...props} />}
          {tab === 'documents' && <DocumentsTab {...props} />}
          {tab === 'activity' && <ActivityTab {...props} />}
        </div>
      </Card>
    </div>
  );
};

function BarFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted">{label}</p>
      <div className="truncate text-[13px] text-ink">{children}</div>
    </div>
  );
}

function LifecycleStepper({ status }: { status: ProjectState }) {
  const side = status === 'suspended' ? 'in_progress' : status === 'cancellation_review' || status === 'cancelled' ? null : status;
  const idx = side ? LIFECYCLE.indexOf(side) : -1;
  return (
    <div className="overflow-x-auto border-t border-line px-4 py-3">
      <ol className="flex min-w-max items-center gap-1">
        {LIFECYCLE.map((s, i) => {
          const done = idx > i;
          const current = idx === i;
          return (
            <li key={s} className="flex items-center gap-1">
              <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
                current ? 'bg-brand-600 font-medium text-white' : done ? 'bg-brand-50 text-brand-700' : 'bg-sunken text-muted')}
              >
                <span className={cn('grid h-4 w-4 place-items-center rounded-full text-[10px] tabular', current ? 'bg-white/25' : done ? 'bg-brand-100' : 'bg-card')}>{i + 1}</span>
                {PROJECT_STATES[s].label}
              </span>
              {i < LIFECYCLE.length - 1 && <span className={cn('h-px w-5', done ? 'bg-brand-300' : 'bg-line-strong')} />}
            </li>
          );
        })}
        {(status === 'cancellation_review' || status === 'cancelled') && (
          <li className="ms-3"><StatePill s={PROJECT_STATES[status]} /></li>
        )}
        {status === 'suspended' && <li className="ms-3"><StatePill s={PROJECT_STATES.suspended} /></li>}
      </ol>
    </div>
  );
}
