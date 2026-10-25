import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, CircleDot } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { DEPARTMENTS, deptName } from '../../domain/catalog';
import { derivedActions } from '../../domain/derived';
import { ACTIVATION_STATES, CAPACITY_NAMES, PROJECT_STATES, TASK_STATES } from '../../domain/labels';
import { allows } from '../../domain/permissions';
import type { MemberCapacity } from '../../domain/types';
import { Card, cn, CommandButton, DateText, Fact, Id, Money, Notice, Pill, PersonChip, Rule, StatePill, userOptions } from '../../components/ui';
import { CREATED_FROM, nextStep, StepBadge } from '../../components/projects/shared';
import type { TabProps } from './ProjectPage';

export const OverviewTab: React.FC<TabProps> = ({ project: p, access }) => {
  const { state, me } = useStore();
  const { userName, user, client } = useLookup();
  const opp = state.opportunities.find((o) => o.id === p.opportunityId);
  const quotations = p.contracts.map((c) => ({ c, q: state.quotations.find((q) => q.id === c.quotationId) }));
  const activations = p.activationIds.map((id) => state.activations.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
  const exc = p.exceptionId ? state.exceptions.find((e) => e.id === p.exceptionId) : undefined;
  const payments = state.payments.filter((x) => x.projectId === p.id);
  const deliverables = state.deliverables.filter((d) => d.projectId === p.id);
  const gov = state.gov.filter((g) => g.projectId === p.id);
  const step = nextStep(state, p);
  const mine = useMemo(() => derivedActions(state, me).filter((a) => a.projectId === p.id), [state, me, p.id]);
  const myTasks = state.tasks.filter((t) => t.link?.projectId === p.id && t.ownerId === me.id && !['completed', 'cancelled'].includes(t.status));
  const itemDepts = [...new Set(p.scopeItems.map((i) => i.deptCode))];
  const isDirector = allows(me, 'project.assign_manager');
  const isLeadManager = me.roleId === 'dept_manager' && me.deptCode === p.leadDept;
  const members = groupBy(p.members, (m) => m.capacity);

  return (
    <div className="space-y-4">
      {/* X-01 — the identity chain: stable ids and explicit links, no copied contract data */}
      <Card title={<span className="flex items-center gap-2">سلسلة الهوية والروابط <Rule>X-01</Rule></span>} subtitle="معرّفات ثابتة وروابط صريحة — المشروع يربط ولا ينسخ بيانات التعاقد">
        <div className="flex flex-wrap items-stretch gap-1.5">
          <Chain label="العميل" id={p.clientId} title={client(p.clientId)?.name} />
          <Arrow />
          {opp ? (
            <Chain label="الفرصة" id={opp.id} title={opp.title} sub={`مسؤول الفرصة: ${userName(opp.ownerId)}`} />
          ) : (
            <Chain label="لا فرصة صورية" title="مشروع قائم قبل النظام" sub={`مسؤول المتابعة: ${userName(p.followUpOwnerId)}`} muted />
          )}
          <Arrow />
          <div className="flex flex-col gap-1">
            {quotations.length ? quotations.map(({ c, q }) => (
              <Chain key={c.quotationId} label={c.kind === 'original' ? 'العرض المقبول' : 'إضافة مدفوعة'} id={c.quotationId} title={q?.revision} sub={q ? `${q.lines.length} بند` : undefined} />
            )) : <Chain label="العقد" title="خارج النظام" muted />}
          </div>
          <Arrow />
          <div className="flex flex-col gap-1">
            {activations.map((a) => <Chain key={a.id} label="التفعيل المالي" id={a.id} title={ACTIVATION_STATES[a.status].label} />)}
            {exc && <Chain label="استثناء الرئيس التنفيذي" id={exc.id} title={exc.status === 'linked' ? 'رُبط بالاعتماد المالي' : `سقف ${exc.costCap.toLocaleString('en')} ر.س`} danger={exc.status !== 'linked'} />}
            {!activations.length && !exc && <Chain label="التفعيل" title={p.preSystem?.financeReviewed ? 'مراجعة الأرصدة السابقة' : 'بانتظار المالية'} muted />}
          </div>
          <Arrow />
          <Chain label="جدول الدفعات" title={`${payments.length} دفعة`} sub={payments.length ? <Money v={payments.reduce((s, x) => s + x.amount, 0)} /> : undefined} to={`/projects/${p.id}?tab=payments`} />
          <Arrow />
          <Chain label="المشروع" id={p.id} title={PROJECT_STATES[p.status].label} strong />
          <Arrow />
          <div className="flex flex-col gap-1">
            <Chain label="المخرجات" title={`${deliverables.length} مخرج`} to={`/projects/${p.id}?tab=deliverables`} />
            <Chain label="المعاملات" title={`${gov.length} معاملة`} to={`/projects/${p.id}?tab=gov`} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card title="ما المطلوب الآن" subtitle="صاحب الإجراء الحالي — الإشعار له وللمعنيين فقط (X-02, F13)">
          <div className="rounded-md border border-line bg-page p-3">
            <p className="text-xs text-muted">الخطوة التالية في المشروع</p>
            <div className="mt-0.5"><StepBadge tone={step.tone}>{step.text}</StepBadge></div>
            {step.who && <p className="mt-1 text-xs text-ink-2">صاحب الإجراء: {step.who}</p>}
          </div>
          <p className="mt-3 text-xs font-medium text-muted">إجراءاتك أنت ({me.name}) على هذا المشروع</p>
          {mine.length || myTasks.length ? (
            <ul className="mt-1 space-y-1.5">
              {mine.map((a) => (
                <li key={a.key}>
                  <Link to={a.link} className="flex items-start gap-2 rounded-md border border-line px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40">
                    <CircleDot size={15} className="mt-0.5 shrink-0 text-brand-600" />
                    <span className="min-w-0"><span className="block text-sm text-ink">{a.title}</span><span className="block truncate text-xs text-muted">{a.detail}</span></span>
                  </Link>
                </li>
              ))}
              {myTasks.map((t) => (
                <li key={t.id}>
                  <Link to={`/work?task=${t.id}`} className="flex items-start gap-2 rounded-md border border-line px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40">
                    <CircleDot size={15} className="mt-0.5 shrink-0 text-accent-500" />
                    <span className="min-w-0 grow"><span className="block text-sm text-ink">{t.title}</span><span className="text-xs text-muted">مهمة · موعدها <DateText iso={t.dueDate} /></span></span>
                    <StatePill s={TASK_STATES[t.status]} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-muted">لا إجراء ينتظرك على هذا المشروع الآن.</p>}

          {/* Receipt and PM assignment (PJ-04, PJ-05, A1) */}
          {p.status === 'awaiting_assignment' && (
            <div className="mt-4 space-y-2 border-t border-line pt-3">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">الاستلام وتعيين مدير المشروع <Rule>PJ-05</Rule> <Rule>A1</Rule></p>
              {p.preSystem && !p.preSystem.financeReviewed && (
                <Notice tone="waiting">مشروع قائم قبل النظام — بانتظار مراجعة المالية للأرصدة السابقة دون إعادة فواتير، ثم يدخل التجهيز. <Rule>AD-08</Rule></Notice>
              )}
              {!p.preSystem && !p.receivedAt && (
                isDirector ? (
                  <CommandButton
                    command="project.receive" base={{ projectId: p.id }} label="استلام المشروع وتحديد الأقسام" size="md" success="استُلم المشروع — بانتظار ترشيح مدير المشروع"
                    intro="حدّد الأقسام المشاركة فعليًا في التنفيذ ولو بخدمة واحدة، والقسم الرئيسي الذي يرشّح مدير المشروع (PJ-04)."
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
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-page px-3 py-2 text-sm">
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
                  fields={[{ name: 'nomineeId', label: 'المرشح', type: 'select', options: userOptions(state.users, (u) => u.deptCode === p.leadDept && ['engineer', 'dept_manager'].includes(u.roleId)) }]}
                />
              )}
              {p.pmNomination?.status === 'pending' && isDirector && (
                <div className="flex flex-wrap gap-2">
                  <CommandButton command="project.decide_pm" base={{ projectId: p.id, decision: 'approved' }} label="اعتماد مدير المشروع" size="md" success="اعتُمد مدير المشروع — الحالة: تجهيز، ومساحة الملفات فُتحت بعد ضبط الصلاحيات" />
                  <CommandButton command="project.decide_pm" base={{ projectId: p.id, decision: 'returned' }} label="إعادة الترشيح" variant="secondary" size="md" success="أُعيد الترشيح"
                    fields={[{ name: 'note', label: 'سبب الإعادة', type: 'textarea', required: true }]} />
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="بيانات المشروع">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Fact label="المصدر">{CREATED_FROM[p.createdFrom]}</Fact>
            <Fact label="أُنشئ"><DateText iso={p.createdAt} /></Fact>
            <Fact label="بدء التنفيذ"><DateText iso={p.startedAt} /></Fact>
            <Fact label="الموعد التعاقدي (الأصلي)"><DateText iso={p.contractEndDate} /></Fact>
            <Fact label="الموعد المتوقع"><DateText iso={p.expectedEndDate} /></Fact>
            <Fact label="نوع الأيام حسب العقد">{p.dayType === 'working' ? 'أيام عمل (الأحد–الخميس)' : 'أيام تقويمية'}</Fact>
            <Fact label="مهلة رد العميل">{p.responseDays} {p.dayType === 'working' ? 'يوم عمل' : 'يوم'}</Fact>
            <Fact label="الاجتماع الافتتاحي">{p.kickoff.required ? 'إلزامي' : 'حسب الحاجة'} · {p.kickoff.status === 'held' ? 'عُقد' : 'لم يُعقد'}</Fact>
            <Fact label="ربط الدفعات">{{ draft: 'مسودة', submitted: 'بانتظار المالية', returned: 'أعادته المالية', confirmed: 'أكدته المالية' }[p.paymentMapping.status]}</Fact>
          </dl>
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs text-muted">بند القبول الضمني في العقد</p>
            <p className="text-sm text-ink">{p.deemedAcceptanceClause ?? 'لا يوجد — لا قبول بالصمت (F8)'}</p>
          </div>
          <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted">الأقسام</p>
              <ul className="space-y-1">
                {p.departments.map((d) => (
                  <li key={d.deptCode} className="flex items-center justify-between gap-2 text-sm">
                    <span>{deptName(d.deptCode)}{d.deptCode === p.leadDept && <span className="ms-1 text-[11px] text-brand-700">(رئيسي)</span>}</span>
                    <span className="flex items-center gap-1.5 text-xs text-ink-2">{userName(d.managerId)} <Pill tone={d.status === 'active' ? 'success' : 'waiting'}>{d.status === 'active' ? 'نشط' : 'منضم — بانتظار تعيين المسؤولين'}</Pill></span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">المواقع</p>
              <ul className="space-y-1">
                {p.sites.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{s.name}</span>
                    {s.suspended ? <Pill tone="waiting">معلّق</Pill> : <span className="text-xs text-muted">{p.scopeItems.filter((i) => i.siteId === s.id).length} بند</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {access === 'full' && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs text-muted">أعضاء المشروع بالصفة</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(Object.keys(members) as MemberCapacity[]).map((cap) => (
                  <div key={cap} className="min-w-0">
                    <p className="text-[11px] text-muted">{CAPACITY_NAMES[cap]}</p>
                    <div className="flex flex-wrap gap-2">
                      {[...new Set(members[cap].map((m) => m.userId))].map((id) => <PersonChip key={id} user={user(id)} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

function groupBy<T, K extends string>(list: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of list) (out[key(x)] ??= []).push(x);
  return out;
}

const Arrow = () => <ChevronLeft size={16} className="shrink-0 self-center text-faint" />;

function Chain({ label, id, title, sub, to, muted, danger, strong }: { label: string; id?: string; title?: React.ReactNode; sub?: React.ReactNode; to?: string; muted?: boolean; danger?: boolean; strong?: boolean }) {
  const body = (
    <div className={cn('min-w-[120px] rounded-md border px-2.5 py-1.5',
      strong ? 'border-brand-600 bg-brand-50' : danger ? 'border-st-danger/30 bg-st-danger-bg' : muted ? 'border-dashed border-line-strong bg-page' : 'border-line bg-card',
      to && 'hover:border-brand-300')}
    >
      <p className="text-[10px] text-muted">{label}</p>
      {id && <Id>{id}</Id>}
      {title && <p className="truncate text-xs text-ink">{title}</p>}
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
