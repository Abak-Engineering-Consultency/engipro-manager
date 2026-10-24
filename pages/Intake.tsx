import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpLeft, RefreshCcw } from 'lucide-react';
import { useLookup, useStore } from '../app/store';
import { isAfter } from '../domain/calendar';
import { DEPARTMENTS, deptName } from '../domain/catalog';
import { ACTIVATION_STATES, PAYMENT_CONDITIONS, PROJECT_STATES } from '../domain/labels';
import { allows } from '../domain/permissions';
import type { Activation, CeoException, Project } from '../domain/types';
import {
  Card, CommandButton, DateText, Empty, Fact, Id, Money, Notice, PageHeader, Pill, Rule, StatePill, Table, Tabs, Td, userOptions,
} from '../components/ui';
import { CREATED_FROM, nextStep, StepBadge } from '../components/projects/shared';

type TabId = 'activations' | 'exceptions' | 'receipt' | 'existing';

const EXC_STATUS: Record<CeoException['status'], { label: string; tone: 'waiting' | 'success' | 'danger' | 'muted' | 'progress' }> = {
  requested: { label: 'بانتظار قرار الرئيس التنفيذي', tone: 'waiting' },
  granted: { label: 'ساري', tone: 'progress' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  expired: { label: 'منتهٍ — يلزم تمديد أو اعتماد مالي', tone: 'danger' },
  linked: { label: 'اكتمل الاعتماد المالي — رُبط بنفس المشروع', tone: 'success' },
};

export const Intake: React.FC = () => {
  const { state, me } = useStore();
  const [tab, setTab] = useState<TabId>('activations');
  const pendingActs = state.activations.filter((a) => a.status === 'pending_finance');
  const awaiting = state.projects.filter((p) => p.status === 'awaiting_assignment');
  const preSystem = state.projects.filter((p) => p.createdFrom === 'pre_system');

  return (
    <div>
      <PageHeader
        title="التفعيل والاستلام"
        subtitle="من قرار المالية أو استثناء الرئيس التنفيذي إلى استلام مدير الأقسام — نقطة دخول كل مشروع"
      />
      <Card pad={false}>
        <div className="px-2">
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'activations', label: 'طلبات التفعيل', count: pendingActs.length },
              { id: 'exceptions', label: 'استثناء البدء قبل الاعتماد المالي', count: state.exceptions.filter((e) => ['requested', 'granted', 'expired'].includes(e.status)).length },
              { id: 'receipt', label: 'بانتظار الاستلام والتعيين', count: awaiting.length },
              { id: 'existing', label: 'مشاريع قائمة قبل النظام', count: preSystem.filter((p) => !p.preSystem?.financeReviewed).length },
            ]}
          />
        </div>
        <div className="space-y-4 p-4">
          {tab === 'activations' && <Activations />}
          {tab === 'exceptions' && <Exceptions />}
          {tab === 'receipt' && <Receipt projects={awaiting} />}
          {tab === 'existing' && <Existing projects={preSystem} canRegister={allows(me, 'project.register_existing')} />}
        </div>
      </Card>
    </div>
  );
};

// ── (1) Activations: finance decides, the system creates or links the project ─────────────────

function Activations() {
  const { state } = useStore();
  const list = [...state.activations].sort((a, b) => (a.status === 'pending_finance' ? -1 : 0) - (b.status === 'pending_finance' ? -1 : 0) || Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
  return (
    <>
      <Notice tone="brand">
        المبيعات ترسل طلب التفعيل (المرحلة 15)، والمالية وحدها تقرر (16). عند الاعتماد يُنشئ النظام المشروع آليًا من العميل والفرصة والعرض المقبول وجدول الدفعات، أو يربط الإضافة بنفس المشروع.
        إعادة معالجة الحدث لا تُنشئ مشروعًا ثانيًا. <Rule>PJ-01</Rule> <Rule>PJ-03</Rule> <Rule>F1</Rule> <Rule>AC-01</Rule>
      </Notice>
      {list.map((a) => <ActivationCard key={a.id} a={a} />)}
    </>
  );
}

function ActivationCard({ a }: { a: Activation }) {
  const { state, me } = useStore();
  const { userName, client } = useLookup();
  const opp = state.opportunities.find((o) => o.id === a.opportunityId);
  const q = state.quotations.find((x) => x.id === a.quotationId);
  const total = q?.lines.reduce((s, l) => s + l.amount, 0) ?? 0;
  const project = a.projectId ? state.projects.find((p) => p.id === a.projectId) : undefined;
  const exc = state.exceptions.find((e) => e.opportunityId === a.opportunityId && e.status !== 'rejected');
  const finance = allows(me, 'activation.approve');
  return (
    <Card
      title={<span className="flex flex-wrap items-center gap-2"><Id>{a.id}</Id> {opp?.title} <StatePill s={ACTIVATION_STATES[a.status]} />{q?.kind === 'paid_addition' && <Pill tone="brand">إضافة مدفوعة</Pill>}</span>}
      subtitle={`${client(opp?.clientId)?.name ?? ''} · طلبه ${userName(a.requestedBy)} في ${new Date(a.requestedAt).toISOString().slice(0, 10)}`}
      actions={
        <>
          {finance && a.status === 'pending_finance' && (
            <>
              <CommandButton command="activation.approve" base={{ activationId: a.id }} label="اعتماد المالية" success="اعتُمد التفعيل — أنشأ النظام المشروع أو ربطه"
                fields={[{ name: 'note', label: 'ملاحظة (اختيارية)', type: 'textarea' }]} intro="الاعتماد يُنشئ المشروع آليًا بحالة «بانتظار التعيين» ويبلّغ مدير الأقسام." />
              <CommandButton command="activation.return" base={{ activationId: a.id }} label="إعادة للمبيعات" variant="secondary" success="أُعيد الطلب"
                fields={[{ name: 'note', label: 'سبب الإعادة', type: 'textarea', required: true }]} />
            </>
          )}
          {finance && a.status === 'approved' && (
            <CommandButton command="activation.replay" base={{ activationId: a.id }} label="إعادة معالجة الحدث" variant="secondary" icon={<RefreshCcw size={14} />}
              success="أُعيدت المعالجة — لم يُنشأ مشروع ثانٍ (AC-01)" />
          )}
          {project && (
            <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
              <ArrowUpLeft size={15} /> {project.id}
            </Link>
          )}
        </>
      }
    >
      {q ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="mb-1 text-xs font-medium text-muted">بنود العرض المقبول <Id>{q.id}</Id> {q.revision} — الإجمالي <Money v={total} /></p>
            <Table head={['البند', 'القسم', 'الموقع', 'القيمة']}>
              {q.lines.map((l) => (
                <tr key={l.id}>
                  <Td><span className="text-ink">{l.title}</span> <span className="ltr-iso text-[11px] text-muted">{l.serviceCode}</span></Td>
                  <Td>{deptName(l.deptCode)}</Td>
                  <Td className="text-ink-2">{l.siteName ?? 'مشترك'}</Td>
                  <Td><Money v={l.amount} /></Td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-muted">جدول الدفعات (من العرض — لا دفعات جديدة ولا تغيير قيم)</p>
              <ul className="space-y-1 text-sm">
                {q.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 rounded border border-line px-2 py-1">
                    <span>
                      {p.label}
                      <span className="block text-[11px] text-muted">
                        {PAYMENT_CONDITIONS[p.condition]} · مهلة {p.graceDays} يوم
                        {p.beforeDeliveryOfLineId && ` · سداد قبل تسليم «${q.lines.find((l) => l.id === p.beforeDeliveryOfLineId)?.title}»`}
                      </span>
                    </span>
                    <Money v={p.amount} className="text-xs" />
                  </li>
                ))}
              </ul>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <Fact label="نوع الأيام">{q.dayType === 'working' ? 'أيام عمل' : 'أيام تقويمية'}</Fact>
              <Fact label="المدة التعاقدية">{q.durationDays} يوم</Fact>
              <Fact label="الاجتماع الافتتاحي">{q.kickoffRequired ? 'إلزامي بحسب العقد' : 'حسب الحاجة'}</Fact>
              <Fact label="مهلة رد العميل">{q.responseDays ? `${q.responseDays} يوم` : 'من الإعدادات'}</Fact>
            </dl>
            {q.deemedAcceptanceClause && <p className="text-xs text-ink-2"><span className="text-muted">بند القبول الضمني: </span>{q.deemedAcceptanceClause}</p>}
            {a.note && <p className="text-xs text-ink-2"><span className="text-muted">ملاحظة المالية: </span>{a.note}</p>}
            {exc && <p className="text-xs text-st-danger">يوجد استثناء للرئيس التنفيذي على هذه الفرصة: <Id>{exc.id}</Id> ({EXC_STATUS[exc.status].label})</p>}
          </div>
        </div>
      ) : <p className="text-sm text-muted">العرض غير موجود.</p>}
    </Card>
  );
}

// ── (2) CEO exception (PJ-02, A2, F15) ───────────────────────────────────────────

function Exceptions() {
  const { state, me } = useStore();
  const canRequest = me.roleId === 'dept_manager' || me.roleId === 'main_dept_manager';
  const opportunities = state.activations
    .filter((a) => a.status === 'pending_finance' && !state.exceptions.some((e) => e.opportunityId === a.opportunityId && ['requested', 'granted'].includes(e.status)))
    .map((a) => state.opportunities.find((o) => o.id === a.opportunityId))
    .filter((o, i, arr): o is NonNullable<typeof o> => !!o && arr.findIndex((x) => x?.id === o.id) === i)
    // An opportunity that already has its project (a paid addition waiting for finance) needs no exception.
    .filter((o) => !state.projects.some((p) => p.opportunityId === o.id));
  return (
    <>
      <Notice tone="danger" title="الاستثناء الوحيد قبل الاعتماد المالي">
        يمنحه الرئيس التنفيذي وحده، بمستند تعميد قائم وسبب ونطاق مسموح ومدة وسقف تكلفة. تجاوز السقف يُمنع حتى تمديد معتمد، ويصل تنبيه أسبوعي للرئيس التنفيذي حتى اكتمال الاعتماد المالي، ثم يُربط الاعتماد بنفس المشروع.
        <span className="ms-1"><Rule>PJ-02</Rule> <Rule>A2</Rule> <Rule>F15</Rule> <Rule>AC-03</Rule></span>
      </Notice>
      {canRequest && (
        <div>
          <CommandButton
            command="exception.request" base={{}} label="طلب استثناء بدء" size="md" disabled={!opportunities.length} success="رُفع الطلب للرئيس التنفيذي"
            intro="للفرص التي لديها طلب تفعيل بانتظار المالية فقط."
            fields={[
              { name: 'opportunityId', label: 'الفرصة', type: 'select', options: opportunities.map((o) => ({ value: o.id, label: `${o.id} — ${o.title}` })), required: true },
              { name: 'reason', label: 'السبب', type: 'textarea', required: true },
              { name: 'commitmentDoc', label: 'مستند التعميد القائم', type: 'text', required: true, placeholder: 'أمر شراء / عقد موقع / خطاب تعميد' },
              { name: 'allowedScope', label: 'النطاق المسموح', type: 'text', required: true },
              { name: 'durationDays', label: 'المدة (يوم)', type: 'number', initial: 30, required: true },
              { name: 'costCap', label: 'سقف التكلفة (ر.س)', type: 'number', initial: 20000, required: true },
            ]}
          />
          {!opportunities.length && <span className="ms-2 text-xs text-muted">لا توجد فرص بطلب تفعيل معلّق دون استثناء.</span>}
        </div>
      )}
      {!state.exceptions.length && <Empty title="لا توجد استثناءات" hint="يرفع مدير القسم أو مدير الأقسام الطلب، ويقرر الرئيس التنفيذي." />}
      {[...state.exceptions].reverse().map((e) => <ExceptionCard key={e.id} e={e} />)}
    </>
  );
}

function ExceptionCard({ e }: { e: CeoException }) {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const opp = state.opportunities.find((o) => o.id === e.opportunityId);
  const used = state.costs.filter((c) => c.projectId === e.projectId && ['approved', 'partially_paid', 'paid', 'service_received'].includes(c.status)).reduce((s, c) => s + c.amount, 0);
  const ceo = allows(me, 'project.grant_exception');
  const st = EXC_STATUS[e.status];
  return (
    <Card
      title={<span className="flex flex-wrap items-center gap-2"><Id>{e.id}</Id> {opp?.title} <Pill tone={st.tone}>{st.label}</Pill></span>}
      subtitle={`طلبه ${userName(e.requestedBy)} · العرض ${e.quotationId}`}
      actions={
        <>
          {ceo && e.status === 'requested' && (
            <>
              <CommandButton command="exception.decide" base={{ exceptionId: e.id, decision: 'granted' }} label="منح الاستثناء" success="مُنح الاستثناء — أُنشئ المشروع"
                fields={[{ name: 'note', label: 'ملاحظة القرار', type: 'textarea' }]} intro={`سيُنشأ المشروع آليًا بسقف ${e.costCap.toLocaleString('en')} ر.س ومدة ${e.durationDays} يومًا.`} />
              <CommandButton command="exception.decide" base={{ exceptionId: e.id, decision: 'rejected' }} label="رفض" variant="secondary" success="رُفض الاستثناء"
                fields={[{ name: 'note', label: 'سبب الرفض', type: 'textarea', required: true }]} />
            </>
          )}
          {ceo && ['granted', 'expired'].includes(e.status) && (
            <CommandButton command="exception.renew" base={{ exceptionId: e.id }} label="تمديد / زيادة السقف" variant="secondary" success="مُدّد الاستثناء"
              fields={[
                { name: 'days', label: 'أيام إضافية', type: 'number', initial: 14 },
                { name: 'extraCap', label: 'زيادة السقف (ر.س)', type: 'number', initial: 0 },
                { name: 'note', label: 'السبب', type: 'textarea', required: true },
              ]} />
          )}
          {e.projectId && <Link to={`/projects/${e.projectId}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"><ArrowUpLeft size={15} /> {e.projectId}</Link>}
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fact label="السبب">{e.reason}</Fact>
        <Fact label="مستند التعميد">{e.commitmentDoc}</Fact>
        <Fact label="النطاق المسموح">{e.allowedScope}</Fact>
        <Fact label="المدة">{e.durationDays} يوم</Fact>
        <Fact label="سقف التكلفة / المستخدم">
          <span className={used > e.costCap * 0.8 ? 'text-st-waiting' : ''}><Money v={e.costCap} /> / <Money v={used} /></span>
        </Fact>
        <Fact label="ينتهي">{e.expiresAt ? <span className={!isAfter(e.expiresAt, state.now) ? 'text-st-danger' : ''}><DateText iso={e.expiresAt} /></span> : '—'}</Fact>
        <Fact label="آخر تنبيه أسبوعي للرئيس التنفيذي"><DateText iso={e.lastCeoAlertAt} /></Fact>
        <Fact label="القرار">{e.decidedBy ? `${userName(e.decidedBy)}${e.decisionNote ? ` — ${e.decisionNote}` : ''}` : '—'}</Fact>
      </dl>
      {e.renewals.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-ink-2">
          {e.renewals.map((r, i) => (
            <li key={i}>تمديد {r.days} يوم وزيادة السقف <Money v={r.extraCap} /> — {userName(r.by)} · <DateText iso={r.at} /> · {r.note}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── (3) Projects waiting for the Director (A1) ───────────────────────────────────

function Receipt({ projects }: { projects: Project[] }) {
  const { state } = useStore();
  const { client } = useLookup();
  if (!projects.length) return <Empty title="لا مشاريع بانتظار الاستلام أو التعيين" />;
  return (
    <>
      <Notice tone="brand">
        مدير الأقسام نقطة الاستلام الرسمية لكل مشروع: يستلم ويحدد الأقسام المشاركة فعليًا، ومدير القسم الرئيسي يرشّح مدير المشروع، ومدير الأقسام يعتمده. <Rule>PJ-04</Rule> <Rule>PJ-05</Rule> <Rule>A1</Rule>
      </Notice>
      <Card pad={false}>
        <Table head={['المشروع', 'العميل', 'المصدر', 'أُنشئ', 'الخطوة التالية', '']}>
          {projects.map((p) => {
            const step = nextStep(state, p);
            return (
              <tr key={p.id}>
                <Td><Id>{p.id}</Id><p className="font-medium text-ink">{p.title}</p></Td>
                <Td className="text-ink-2">{client(p.clientId)?.name}</Td>
                <Td><Pill tone={p.createdFrom === 'exception' ? 'danger' : 'brand'}>{CREATED_FROM[p.createdFrom]}</Pill></Td>
                <Td><DateText iso={p.createdAt} /></Td>
                <Td><StepBadge tone={step.tone}>{step.text}</StepBadge>{step.who && <p className="text-[11px] text-muted">{step.who}</p>}</Td>
                <Td><Link className="text-sm font-medium text-brand-700 hover:underline" to={`/projects/${p.id}`}>فتح</Link></Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}

// ── (4) Projects that existed before the system (AD-08, D17) ──────────────────────

function Existing({ projects, canRegister }: { projects: Project[]; canRegister: boolean }) {
  const { state, me } = useStore();
  const { userName, client } = useLookup();
  const finance = allows(me, 'payment.verify_entitlement');
  return (
    <>
      <Notice tone="brand">
        نموذج مختصر مع علامة «قائم قبل النظام»: العميل، النطاق، المسؤول، المرحلة الحالية، العمل المتبقي، المستندات. مسؤول متابعة للعميل دون فرصة صورية، والمالية تراجع الأرصدة السابقة دون إعادة إصدار فواتير، ثم يدخل التجهيز.
        <span className="ms-1"><Rule>AD-08</Rule> <Rule>D17</Rule></span>
      </Notice>
      {canRegister && (
        <CommandButton
          command="project.register_existing" base={{}} label="تسجيل مشروع قائم قبل النظام" size="md" success="سُجّل المشروع — بانتظار مراجعة المالية"
          fields={[
            { name: 'title', label: 'اسم المشروع', type: 'text', required: true },
            { name: 'clientId', label: 'العميل', type: 'select', options: state.clients.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` })), required: true },
            { name: 'deptCode', label: 'القسم', type: 'select', options: DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })), required: true },
            { name: 'pmId', label: 'مدير المشروع', type: 'select', options: userOptions(state.users, (u) => ['engineer', 'dept_manager'].includes(u.roleId)), required: true },
            { name: 'followUpOwnerId', label: 'مسؤول متابعة العميل', type: 'select', options: userOptions(state.users, (u) => ['sales_rep', 'sales_manager'].includes(u.roleId)), required: true },
            { name: 'currentPhase', label: 'المرحلة الحالية', type: 'text' },
            { name: 'remainingWork', label: 'العمل المتبقي', type: 'textarea' },
            { name: 'documents', label: 'المستندات المتوفرة', type: 'textarea' },
            { name: 'scopeLines', label: 'بنود النطاق المتبقي (سطر لكل بند)', type: 'lines', required: true },
          ]}
        />
      )}
      {!projects.length ? <Empty title="لا مشاريع قائمة مسجلة" /> : projects.map((p) => (
        <Card key={p.id}
          title={<span className="flex flex-wrap items-center gap-2"><Id>{p.id}</Id> {p.title} <StatePill s={PROJECT_STATES[p.status]} /> <Pill tone="brand">قائم قبل النظام</Pill></span>}
          subtitle={`${client(p.clientId)?.name ?? ''} · مدير المشروع ${userName(p.pmId)} · مسؤول المتابعة ${userName(p.followUpOwnerId)}`}
          actions={
            <>
              {finance && p.preSystem && !p.preSystem.financeReviewed && (
                <CommandButton command="project.finance_review_existing" base={{ projectId: p.id }} label="مراجعة الأرصدة السابقة" success="روجعت الأرصدة — المشروع في التجهيز"
                  fields={[{ name: 'note', label: 'نتيجة المراجعة (دون إعادة إصدار فواتير)', type: 'textarea', required: true }]} />
              )}
              <Link to={`/projects/${p.id}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"><ArrowUpLeft size={15} /> فتح</Link>
            </>
          }
        >
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Fact label="المرحلة الحالية">{p.preSystem?.currentPhase || '—'}</Fact>
            <Fact label="العمل المتبقي">{p.preSystem?.remainingWork || '—'}</Fact>
            <Fact label="المستندات">{p.preSystem?.documents || '—'}</Fact>
            <Fact label="مراجعة المالية">
              {p.preSystem?.financeReviewed ? <Pill tone="success">تمت{p.preSystem.financeNote ? ` — ${p.preSystem.financeNote}` : ''}</Pill> : <Pill tone="waiting">بانتظار المالية</Pill>}
            </Fact>
          </dl>
        </Card>
      ))}
    </>
  );
}
