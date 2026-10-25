import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, BadgeCheck, Briefcase, Building2, CalendarDays, Check, ClipboardList, Clock, Landmark, ListTodo, Users } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { fmtDate, fmtDateTime } from '../../domain/calendar';
import { DEPARTMENTS, deptName } from '../../domain/catalog';
import { derivedActions } from '../../domain/derived';
import { ACTIVATION_STATES, CAPACITY_NAMES, DELIVERABLE_STATES, GOV_STATES, PROJECT_STATES, TASK_STATES } from '../../domain/labels';
import { allows, hasRole, inDept } from '../../domain/permissions';
import { mayApprove, projectBar, seesProjectMoney } from '../../domain/selectors';
import type { DeliverableState, MemberCapacity, ProjectState } from '../../domain/types';
import { Card, cn, CommandButton, DateText, Empty, Money, Notice, Pill, PersonChip, Progress, StatePill, userOptions } from '../../components/ui';
import { CREATED_FROM, isLate } from '../../components/projects/shared';
import type { TabProps } from './ProjectPage';

const LIFECYCLE: ProjectState[] = ['awaiting_assignment', 'preparing', 'in_progress', 'technically_complete', 'closure_review', 'operationally_closed'];

export const OverviewTab: React.FC<TabProps> = ({ project: p, access }) => {
  const { state, me } = useStore();
  const { userName, user, client } = useLookup();
  const opp = state.opportunities.find((o) => o.id === p.opportunityId);
  const quotations = p.contracts.map((c) => ({ c, q: state.quotations.find((q) => q.id === c.quotationId) }));
  const activations = p.activationIds.map((id) => state.activations.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
  const exc = p.exceptionId ? state.exceptions.find((e) => e.id === p.exceptionId) : undefined;
  const payments = state.payments.filter((x) => x.projectId === p.id);
  const deliverables = state.deliverables.filter((d) => d.projectId === p.id && d.status !== 'excluded');
  const mine = useMemo(() => derivedActions(state, me).filter((a) => a.projectId === p.id), [state, me, p.id]);
  const myTasks = state.tasks.filter((t) => t.link?.projectId === p.id && t.ownerId === me.id && !['completed', 'cancelled'].includes(t.status));
  const itemDepts = [...new Set(p.scopeItems.map((i) => i.deptCode))];
  const isDirector = allows(me, 'project.assign_manager');
  const seesMoney = seesProjectMoney(state, me, p);
  const decidesPm = !!p.pmNomination && mayApprove(state, me, 'project.assign_manager', [p.pmNomination.nominatedBy, p.pmNomination.nomineeId]);
  const isLeadManager = hasRole(me, 'dept_manager') && inDept(me, p.leadDept);
  const members = groupBy(p.members, (m) => m.capacity);
  const bar = projectBar(state, p);
  const events = state.events.filter((e) => e.projectId === p.id).slice(-4).reverse();
  const clientName = client(p.clientId)?.name ?? '—';

  // Nothing waiting on this person: the progress panel takes the lead slot instead of an empty card.
  const hasWork = mine.length > 0 || myTasks.length > 0 || p.status === 'awaiting_assignment';
  const progressCard = (
    <Card className="lg:col-span-2 lg:self-start" title="تقدم المخرجات حسب القسم" icon={<Activity size={18} />} actions={<Link to={`/projects/${p.id}?tab=deliverables`} className="text-sm font-medium text-brand-700 hover:underline">كل المخرجات</Link>}>
        {deliverables.length ? (
          <>
          <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-4">
            {(Object.keys(DELIVERABLE_STATES) as DeliverableState[]).filter((k) => k !== 'excluded' && deliverables.some((d) => d.status === k)).map((k) => (
              <div key={k}>
                <p className="text-xs text-muted">{DELIVERABLE_STATES[k].label}</p>
                <p className={cn('text-lg font-semibold tabular', k === 'blocked_pending_payment' ? 'text-st-danger' : 'text-ink')}>{deliverables.filter((d) => d.status === k).length}</p>
              </div>
            ))}
          </div>
          <ul className="space-y-4">
            {[...new Set(deliverables.map((d) => d.deptCode))].map((code) => {
              const all = deliverables.filter((d) => d.deptCode === code);
              const done = all.filter((d) => d.status === 'client_approved').length;
              const pct = Math.round((done / all.length) * 100);
              return (
                <li key={code}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-ink">{deptName(code)}</span>
                    <span className="text-xs tabular text-muted">{done}/{all.length} معتمد</span>
                  </div>
                  <Progress value={pct} tone={pct === 100 ? 'success' : 'brand'} />
                </li>
              );
            })}
          </ul>
          </>
        ) : <Empty icon={<ClipboardList size={28} />} title="لا مخرجات بعد" hint="تُنشأ المخرجات من خدمات العرض المقبول مع بدء التنفيذ." />}
      </Card>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {!hasWork && progressCard}
      {hasWork && <Card className="lg:col-span-2 lg:self-start" title="ما المطلوب منك" icon={<ListTodo size={18} />}>
        {mine.length || myTasks.length ? (
          <ul className="space-y-2">
            {mine.map((a) => (
              <li key={a.key}>
                <Link to={a.link} className="group flex items-center gap-3 rounded-lg border border-line px-4 py-3 hover:border-brand-300 hover:bg-brand-50/40">
                  <span className="min-w-0 grow"><span className="block text-sm font-medium text-ink group-hover:text-brand-700">{a.title}</span><span className="block truncate text-xs text-muted">{a.detail}</span></span>
                  <ArrowLeft size={16} className="shrink-0 text-faint group-hover:text-brand-600" />
                </Link>
              </li>
            ))}
            {myTasks.map((t) => (
              <li key={t.id}>
                <Link to={`/work?task=${t.id}`} className="group flex items-center gap-3 rounded-lg border border-line px-4 py-3 hover:border-brand-300 hover:bg-brand-50/40">
                  <span className="min-w-0 grow"><span className="block text-sm font-medium text-ink group-hover:text-brand-700">{t.title}</span><span className="text-xs text-muted">مهمة · موعدها <DateText iso={t.dueDate} /></span></span>
                  <StatePill s={TASK_STATES[t.status]} />
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="flex items-center gap-2 text-sm text-muted"><BadgeCheck size={18} className="text-st-success" />لا إجراء ينتظرك على هذا المشروع الآن.</p>}

          {/* Receipt and PM assignment */}
          {p.status === 'awaiting_assignment' && (
            <div className="mt-5 space-y-3 border-t border-line pt-5">
              <h4 className="text-sm font-semibold text-ink">الاستلام وتعيين مدير المشروع</h4>
              {p.preSystem && !p.preSystem.financeReviewed && (
                <Notice tone="waiting">مشروع قائم قبل النظام — بانتظار مراجعة المالية للأرصدة السابقة دون إعادة فواتير، ثم يدخل التجهيز.</Notice>
              )}
              {!p.preSystem && !p.receivedAt && (
                isDirector ? (
                  <CommandButton
                    command="project.receive" base={{ projectId: p.id }} label="استلام المشروع وتحديد الأقسام" size="md" success="استُلم المشروع — بانتظار ترشيح مدير المشروع"
                    intro="حدّد الأقسام المشاركة فعليًا في التنفيذ ولو بخدمة واحدة، والقسم الرئيسي الذي يرشّح مدير المشروع."
                    fields={[
                      { name: 'leadDept', label: 'القسم الرئيسي', type: 'select', options: itemDepts.map((d) => ({ value: d, label: deptName(d) })), initial: itemDepts[0] },
                      { name: 'departments', label: 'الأقسام المشاركة', type: 'multiselect', options: DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })), initial: itemDepts },
                      { name: 'note', label: 'ملاحظة', type: 'textarea' },
                    ]}
                  />
                ) : <p className="text-sm text-muted">بانتظار استلام مدير الأقسام.</p>
              )}
              {p.receivedAt && !p.preSystem && (
                <p className="text-xs text-ink-2">استلمه {userName(p.receivedBy)} في <DateText iso={p.receivedAt} /> — القسم الرئيسي {deptName(p.leadDept)}، {p.multiDept ? 'متعدد الأقسام' : 'قسم واحد'}.</p>
              )}
              {p.pmNomination && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-page px-4 py-3 text-sm">
                  <span>المرشح:</span> <PersonChip user={user(p.pmNomination.nomineeId)} sub={`رشّحه ${userName(p.pmNomination.nominatedBy)}`} />
                  <Pill tone={p.pmNomination.status === 'pending' ? 'waiting' : p.pmNomination.status === 'approved' ? 'success' : 'danger'}>
                    {p.pmNomination.status === 'pending' ? 'بانتظار اعتماد مدير الأقسام' : p.pmNomination.status === 'approved' ? 'معتمد' : `معاد: ${p.pmNomination.note ?? ''}`}
                  </Pill>
                </div>
              )}
              {p.receivedAt && !p.preSystem && isLeadManager && (!p.pmNomination || p.pmNomination.status === 'returned') && (
                <CommandButton
                  command="project.nominate_pm" base={{ projectId: p.id }} label="ترشيح مدير المشروع" size="md" success="رُشّح مدير المشروع — بانتظار اعتماد مدير الأقسام"
                  intro="يجوز لمدير القسم ترشيح نفسه. الاعتماد لمدير الأقسام."
                  fields={[{ name: 'nomineeId', label: 'المرشح', type: 'select', options: userOptions(state.users, (u) => inDept(u, p.leadDept) && hasRole(u, 'engineer', 'dept_manager')) }]}
                />
              )}
              {p.pmNomination?.status === 'pending' && decidesPm && (
                <div className="flex flex-wrap gap-2">
                  <CommandButton command="project.decide_pm" base={{ projectId: p.id, decision: 'approved' }} label="اعتماد مدير المشروع" size="md" success="اعتُمد مدير المشروع — الحالة: تجهيز، ومساحة الملفات فُتحت بعد ضبط الصلاحيات" />
                  <CommandButton command="project.decide_pm" base={{ projectId: p.id, decision: 'returned' }} label="إعادة الترشيح" variant="secondary" size="md" success="أُعيد الترشيح"
                    fields={[{ name: 'note', label: 'سبب الإعادة', type: 'textarea', required: true }]} />
                </div>
              )}
            </div>
          )}
      </Card>}

      <Card title="مراحل المشروع" icon={<CalendarDays size={18} />}>
        <Stages p={p} />
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <dt className="text-xs text-muted">الموعد التعاقدي</dt>
            <dd className="text-sm font-medium text-ink"><DateText iso={p.contractEndDate} /></dd>
          </div>
          <div>
            <dt className="text-xs text-muted">الموعد المتوقع</dt>
            <dd className={cn('text-sm font-medium', isLate(p) ? 'text-st-waiting' : 'text-ink')}><DateText iso={p.expectedEndDate} /></dd>
          </div>
        </dl>
      </Card>

      <Card title="معلومات المشروع" icon={<Briefcase size={18} />}>
        <dl className="space-y-3 text-sm">
          <Row label="المصدر">{CREATED_FROM[p.createdFrom]}</Row>
          <Row label="بدء التنفيذ"><DateText iso={p.startedAt} /></Row>
          <Row label="الأيام في العقد">{p.dayType === 'working' ? 'أيام عمل' : 'أيام تقويمية'}</Row>
          <Row label="مهلة رد العميل">{p.responseDays} {p.dayType === 'working' ? 'يوم عمل' : 'يوم'}</Row>
          <Row label="الاجتماع الافتتاحي">{p.kickoff.status === 'held' ? 'عُقد' : p.kickoff.required ? 'إلزامي — لم يُعقد' : 'حسب الحاجة'}</Row>
          <Row label="ربط الدفعات">{{ draft: 'مسودة', submitted: 'بانتظار المالية', returned: 'أعادته المالية', confirmed: 'أكدته المالية' }[p.paymentMapping.status]}</Row>
        </dl>
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-xs text-muted">الأقسام</p>
          <div className="flex flex-wrap gap-1.5">
            {p.departments.map((d) => (
              <span key={d.deptCode} className={cn('rounded-full border px-2.5 py-0.5 text-xs', d.deptCode === p.leadDept ? 'border-brand-200 bg-brand-50 font-medium text-brand-700' : 'border-line bg-page text-ink-2')} title={`${userName(d.managerId)}${d.status === 'joining' ? ' — منضم، بانتظار تعيين المسؤولين' : ''}`}>
                {deptName(d.deptCode)}{d.deptCode === p.leadDept && ' · رئيسي'}{d.status === 'joining' && ' · منضم'}
              </span>
            ))}
          </div>
          {p.sites.length > 1 && (
            <>
              <p className="mt-3 mb-2 text-xs text-muted">المواقع</p>
              <ul className="space-y-1 text-sm">
                {p.sites.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink">{s.name}</span>
                    {s.suspended ? <Pill tone="waiting">معلّق</Pill> : <span className="text-xs text-muted">{p.scopeItems.filter((i) => i.siteId === s.id).length} بند</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <details className="group mt-4 border-t border-line pt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-brand-700 hover:underline">بند القبول الضمني في العقد</summary>
          <p className="mt-2 text-ink-2">{p.deemedAcceptanceClause ?? 'لا يوجد — لا قبول بالصمت'}</p>
        </details>
      </Card>

      <Card title="العميل والتعاقد" icon={<Building2 size={18} />}>
        <div className="flex items-center gap-3 rounded-lg bg-page p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">{clientName.trim().slice(0, 1)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{clientName}</p>
            <p className="text-xs text-muted">{opp ? `مسؤول الفرصة: ${userName(opp.ownerId)}` : `مسؤول المتابعة: ${userName(p.followUpOwnerId)}`}</p>
          </div>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          {opp && <Row label="الفرصة"><span className="ltr-iso">{opp.id}</span></Row>}
          {quotations.length ? quotations.map(({ c, q }) => (
            <Row key={c.quotationId} label={c.kind === 'original' ? 'العرض المقبول' : 'إضافة مدفوعة'}><span className="ltr-iso">{c.quotationId}</span>{q && <span className="text-xs text-muted"> · {q.revision}</span>}</Row>
          )) : <Row label="العقد">خارج النظام</Row>}
          {activations.map((a) => <Row key={a.id} label="التفعيل المالي"><StatePill s={ACTIVATION_STATES[a.status]} /></Row>)}
          {exc && <Row label="استثناء الرئيس التنفيذي">{exc.status === 'linked' ? <Pill tone="success">رُبط بالاعتماد المالي</Pill> : <Pill tone="danger">ساري حتى {fmtDate(exc.expiresAt)}</Pill>}</Row>}
          {seesMoney && (
            <Row label="جدول الدفعات">
              <Link to={`/projects/${p.id}?tab=payments`} className="text-brand-700 hover:underline">{payments.length} دفعة{payments.length > 0 && <> · <Money v={payments.reduce((s, x) => s + x.amount, 0)} /></>}</Link>
            </Row>
          )}
        </dl>
      </Card>

      {access === 'full' ? (
        <Card title="فريق المشروع" icon={<Users size={18} />} actions={<Link to={`/projects/${p.id}?tab=team`} className="text-sm font-medium text-brand-700 hover:underline">إدارة الفريق</Link>}>
          {p.members.length ? (
            <div className="space-y-4">
              {(Object.keys(members) as MemberCapacity[]).map((cap) => (
                <div key={cap}>
                  <p className="mb-1.5 text-xs text-muted">{CAPACITY_NAMES[cap]}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {[...new Set(members[cap].map((m) => m.userId))].map((id) => <PersonChip key={id} user={user(id)} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty title="لم يُعيَّن فريق بعد" />}
        </Card>
      ) : <div className="hidden lg:block" />}

      {hasWork && progressCard}

      {bar.gov ? (
        <Card title="المعاملة الحكومية الجارية" icon={<Landmark size={18} />} actions={<Link to={`/projects/${p.id}?tab=gov`} className="text-sm font-medium text-brand-700 hover:underline">التفاصيل</Link>}>
          <p className="text-sm font-semibold text-ink">{bar.gov.procedureType}</p>
          <p className="mb-4 flex items-center gap-2 text-xs text-muted">{bar.gov.authority} <StatePill s={GOV_STATES[bar.gov.status]} /></p>
          <dl className="space-y-3 text-sm">
            <Row label="انتظار الجهة الآن">{bar.waitingNow} يوم</Row>
            <Row label="وقت المكتب / وقت الجهة"><span className="tabular">{bar.officeDays} / {bar.authorityDays} يوم</span></Row>
            <Row label="المتابع">{userName(bar.gov.expeditorId)}</Row>
            <Row label="المتابعة التالية"><DateText iso={bar.nextFollowUp} /></Row>
          </dl>
        </Card>
      ) : (
        <Card title="النشاط الأخير" icon={<Clock size={18} />} actions={access !== 'client' ? <Link to={`/projects/${p.id}?tab=activity`} className="text-sm font-medium text-brand-700 hover:underline">السجل</Link> : undefined}>
          {events.length ? (
            <ul className="space-y-4">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-ink">{e.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">{e.actorId === 'system' ? 'النظام' : userName(e.actorId)} · {fmtDateTime(e.at)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">لا نشاط بعد.</p>}
        </Card>
      )}
    </div>
  );
};

/** The lifecycle as a vertical list: done stages tick, the current one leads, the rest recede. */
function Stages({ p }: { p: TabProps['project'] }) {
  const side = p.status === 'suspended' ? 'in_progress' : ['cancellation_review', 'cancelled'].includes(p.status) ? null : p.status;
  const idx = side ? LIFECYCLE.indexOf(side) : -1;
  return (
    <>
      <ol className="relative space-y-3 ps-1">
        {LIFECYCLE.map((s, i) => {
          const done = idx > i;
          const current = idx === i;
          return (
            <li key={s} className="flex items-center gap-3">
              <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-[11px]',
                current ? 'border-brand-600 bg-brand-600 text-white' : done ? 'border-brand-600 bg-card text-brand-600' : 'border-line-strong bg-card text-faint')}
              >
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('text-sm', current ? 'font-semibold text-ink' : done ? 'text-ink-2' : 'text-faint')}>{PROJECT_STATES[s].label}</span>
              {current && p.status === 'suspended' && <Pill tone="waiting">معلّق</Pill>}
            </li>
          );
        })}
      </ol>
      {idx === -1 && <div className="mt-3"><StatePill s={PROJECT_STATES[p.status]} /></div>}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end font-medium text-ink">{children}</dd>
    </div>
  );
}

function groupBy<T, K extends string>(list: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of list) (out[key(x)] ??= []).push(x);
  return out;
}
