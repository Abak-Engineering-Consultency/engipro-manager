import React, { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, CheckSquare, Clock, ShieldAlert, UserRound } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { daysBetween, fmtDate } from '../../domain/calendar';
import { PROJECT_STATES, SUSPENSION_TYPES } from '../../domain/labels';
import { exceptionScope, projectAccess, projectProgress, startGate, type ProjectAccess } from '../../domain/selectors';
import type { Project } from '../../domain/types';
import { cn, Empty, Notice, Pill, Progress, StatePill, Tabs } from '../../components/ui';
import { attentionReason, isLate, nextStep } from '../../components/projects/shared';
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

/** One or two words each, so the whole row reads at a glance. */
const TAB_LABELS: Record<TabId, string> = {
  overview: 'نظرة عامة', tasks: 'المهام', deliverables: 'المخرجات', plan: 'الخطة', team: 'الفريق', gov: 'المعاملات',
  visits: 'الزيارات', payments: 'المالية', costs: 'المالية', changes: 'التغييرات', documents: 'الملفات', closure: 'الإغلاق', activity: 'السجل',
};

/** Payments and costs share one tab, «المالية», switched inside it. */
const MONEY: TabId[] = ['payments', 'costs'];

/** What each kind of access may open, in order of daily use. */
const TABS_BY_ACCESS: Record<Exclude<ProjectAccess, null>, TabId[]> = {
  full: ['overview', 'tasks', 'deliverables', 'plan', 'team', 'gov', 'visits', 'payments', 'costs', 'changes', 'documents', 'closure', 'activity'],
  finance: ['overview', 'payments', 'costs', 'closure', 'documents', 'activity'],
  client: ['overview', 'deliverables', 'payments', 'gov', 'visits', 'changes'],
};

/** Tabs whose content is plain lists and tables: they sit on one white panel. Tabs made of cards sit on the page. */
const PANEL_TABS: TabId[] = ['tasks', 'deliverables', 'gov', 'visits', 'payments', 'costs', 'activity'];

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
    return <Empty icon={<ShieldAlert size={28} />} title="لا تملك صلاحية الاطلاع على هذا المشروع" hint="يظهر المشروع لأعضائه ولمديري أقسامه وللإدارة. بدّل المستخدم لتجربة دور آخر." />;
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
  const progress = projectProgress(state, project);
  const gate = project.status === 'preparing' ? startGate(state, project) : [];
  const exc = project.exceptionId ? state.exceptions.find((e) => e.id === project.exceptionId) : undefined;
  const step = nextStep(state, project);
  const why = attentionReason(state, project);
  const ds = state.deliverables.filter((d) => d.projectId === project.id && d.status !== 'excluded');
  const approved = ds.filter((d) => d.status === 'client_approved').length;
  const closed = ['operationally_closed', 'cancelled'].includes(project.status);
  const remaining = project.contractEndDate ? daysBetween(state.now, project.contractEndDate, 'calendar', state.settings) : undefined;
  const props: TabProps = { project, access };

  const content = (
    <>
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
    </>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-card shadow-card">
        <nav className="flex items-center gap-2 border-b border-line px-6 py-3 text-sm text-muted" aria-label="مسار التنقل">
          <Link to="/projects" className="flex items-center gap-1 hover:text-brand-700"><ArrowRight size={16} /> المشاريع</Link>
          <span>/</span>
          <span className="truncate font-medium text-ink">{project.title}</span>
        </nav>

        <div className="flex flex-col justify-between gap-5 px-6 py-5 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-ink">{project.title}</h1>
              <span className="ltr-iso rounded border border-line bg-page px-2 py-0.5 text-xs text-muted">{project.id}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{client(project.clientId)?.name} · مدير المشروع: {userName(project.pmId)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatePill s={PROJECT_STATES[project.status]} />
              {project.createdFrom === 'exception' && exc?.status !== 'linked' && <Pill tone="danger">باستثناء الرئيس التنفيذي</Pill>}
              {project.createdFrom === 'pre_system' && <Pill tone="muted">قائم قبل النظام</Pill>}
              {closed && (project.financialState === 'settled' ? <Pill tone="success">مسوّى ماليًا</Pill> : <Pill tone="waiting">الإغلاق المالي مفتوح</Pill>)}
              <div className="flex w-56 items-center gap-2" title="الإنجاز محسوب بالعمل المنجز لا بالوقت">
                <Progress value={progress} tone={progress === 100 ? 'success' : 'brand'} />
                <span className="text-xs font-medium tabular text-ink-2">{progress}%</span>
              </div>
            </div>
          </div>

          <dl className="flex w-full shrink-0 rounded-lg lg:w-auto [&>div+div]:border-s [&>div+div]:border-line border border-line bg-page py-3 text-center">
            <QuickStat icon={<CalendarDays size={14} className="text-brand-600" />} label="الموعد التعاقدي">{fmtDate(project.contractEndDate)}</QuickStat>
            <QuickStat icon={<Clock size={14} className={isLate(project) ? 'text-st-waiting' : 'text-brand-600'} />} label={isLate(project) ? 'التأخر المتوقع' : 'الأيام المتبقية'}>
              {isLate(project)
                ? <span className="text-st-waiting">{daysBetween(project.contractEndDate!, project.expectedEndDate!, 'calendar', state.settings)} يوم</span>
                : remaining === undefined || closed ? '—' : `${Math.max(0, remaining)} يوم`}
            </QuickStat>
            <QuickStat icon={<CheckSquare size={14} className="text-st-success" />} label="المخرجات المعتمدة">{approved}/{ds.length}</QuickStat>
          </dl>
        </div>

        {!closed && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-page px-6 py-3 text-sm">
            <span className="text-muted">الخطوة التالية</span>
            <span className="font-semibold text-ink">{step.text}</span>
            {step.who && <span className="flex items-center gap-1.5 text-ink-2"><UserRound size={15} className="text-muted" />{step.who}</span>}
            {why && <span className="ms-auto flex items-center gap-1.5 font-medium text-st-waiting"><AlertTriangle size={15} />{why}</span>}
          </div>
        )}

        <div className="border-t border-line px-6">
          <Tabs
            tabs={tabs.filter((t) => t !== 'costs' || !tabs.includes('payments')).map((t) => ({ id: t, label: TAB_LABELS[t], count: t === 'payments' ? counts.costs : counts[t] }))}
            value={tab === 'costs' && tabs.includes('payments') ? 'payments' : tab}
            onChange={setTab}
          />
        </div>
      </div>

      {(project.status === 'suspended' && project.suspension) || gate.length > 0 || (exc && exc.status !== 'linked') ? (
        <div className="space-y-3">
          {project.status === 'suspended' && project.suspension && (
            <Notice tone="waiting" title={`معلّق: ${SUSPENSION_TYPES[project.suspension.type]}`}>
              {project.suspension.reason} — منذ {fmtDate(project.suspension.since)}. الموعد التعاقدي لا يتغير.
            </Notice>
          )}
          {gate.length > 0 && <Notice tone="waiting" title="بوابة البدء غير مستوفاة">{gate.join(' · ')}</Notice>}
          {exc && exc.status !== 'linked' && (
            <Notice tone="danger" title={`يعمل باستثناء الرئيس التنفيذي حتى ${fmtDate(exc.expiresAt)}`}>
              البنود المسموحة: {project.scopeItems.filter((i) => exceptionScope(state, project).allowedItemIds.includes(i.id)).map((i) => i.title).join('، ') || '—'} · سقف التكلفة {exc.costCap.toLocaleString('en')} ر.س. ما عداها ينتظر الاعتماد المالي.
            </Notice>
          )}
        </div>
      ) : null}

      {PANEL_TABS.includes(tab) ? (
        <div className="rounded-xl border border-line bg-card p-5 shadow-card">
          {MONEY.includes(tab) && tabs.includes('costs') && tabs.includes('payments') && (
            <div className="mb-5 inline-flex rounded-lg border border-line bg-sunken p-1" role="tablist" aria-label="المالية">
              {MONEY.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-all', tab === t ? 'bg-card text-brand-700 shadow-sm' : 'text-muted hover:text-ink')}>
                  {t === 'payments' ? 'الدفعات والتحصيل' : 'طلبات التكلفة'}
                  {t === 'costs' && !!counts.costs && <span className="ms-1.5 rounded-full bg-brand-100 px-1.5 text-xs text-brand-700 tabular">{counts.costs}</span>}
                </button>
              ))}
            </div>
          )}
          {content}
        </div>
      ) : content}
    </div>
  );
};

function QuickStat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 px-3 sm:px-5">
      <dt className="mb-1 whitespace-nowrap text-xs font-medium text-muted">{label}</dt>
      <dd className={cn('flex items-center justify-center gap-1.5 text-sm font-semibold text-ink tabular')}>{icon}{children}</dd>
    </div>
  );
}
