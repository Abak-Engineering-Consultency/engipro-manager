import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpLeft, RefreshCcw } from 'lucide-react';
import { useLookup, useStore } from '../app/store';
import { isAfter } from '../domain/calendar';
import { DEPARTMENTS, deptName } from '../domain/catalog';
import { ACTIVATION_STATES, PAYMENT_CONDITIONS, PROJECT_STATES } from '../domain/labels';
import { allows, hasRole } from '../domain/permissions';
import type { Activation, CeoException, Project } from '../domain/types';
import {
  Card, CommandButton, DateText, Empty, Fact, Money, Notice, PageHeader, Pill, StatePill, Table, Tabs, Td, userOptions,
} from '../components/ui';
import { CREATED_FROM, nextStep } from '../components/projects/shared';

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
    <div className="space-y-6">
      <PageHeader
        title="التفعيل والاستلام"
        subtitle="من قرار المالية إلى استلام المشروع وتعيين مديره"
      />
      <div className="rounded-xl border border-line bg-card px-5 shadow-card">
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
      <div className="space-y-6">
        {tab === 'activations' && <Activations />}
        {tab === 'exceptions' && <Exceptions />}
        {tab === 'receipt' && <Receipt projects={awaiting} />}
        {tab === 'existing' && <Existing projects={preSystem} canRegister={allows(me, 'project.register_existing')} />}
      </div>
    </div>
  );
};

// ── (1) Activations: finance decides, the system creates or links the project ─────────────────

function Activations() {
  const { state } = useStore();
  const list = [...state.activations].sort((a, b) => (a.status === 'pending_finance' ? -1 : 0) - (b.status === 'pending_finance' ? -1 : 0) || Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
  return (
    <>
      {!list.length && <Empty title="لا طلبات تفعيل" />}
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
      title={<span className="flex flex-wrap items-center gap-2">{opp?.title} <StatePill s={ACTIVATION_STATES[a.status]} />{q?.kind === 'paid_addition' && <Pill tone="brand">إضافة مدفوعة</Pill>}</span>}
      subtitle={<>{client(opp?.clientId)?.name ?? ''} · طلبه {userName(a.requestedBy)} · <DateText iso={a.requestedAt} /> · <span className="ltr-iso">{a.id}</span></>}
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
              success="أُعيدت المعالجة — لم يُنشأ مشروع ثانٍ" />
          )}
          {project && (
            <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
              <ArrowUpLeft size={15} /> فتح المشروع
            </Link>
          )}
        </>
      }
    >
      {q ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">بنود العرض المقبول <span className="ltr-iso text-xs font-normal text-muted">{q.id} {q.revision}</span></h4>
              <span className="text-sm text-muted">الإجمالي <Money v={total} className="font-semibold text-ink" /></span>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
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
          </div>
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">جدول الدفعات</h4>
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {q.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <span>
                      <span className="text-ink">{p.label}</span>
                      <span className="block text-xs text-muted">
                        {PAYMENT_CONDITIONS[p.condition]} · مهلة {p.graceDays} يوم
                        {p.beforeDeliveryOfLineId && ` · سداد قبل تسليم «${q.lines.find((l) => l.id === p.beforeDeliveryOfLineId)?.title}»`}
                      </span>
                    </span>
                    <Money v={p.amount} className="text-sm font-medium text-ink" />
                  </li>
                ))}
              </ul>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Fact label="نوع الأيام">{q.dayType === 'working' ? 'أيام عمل' : 'أيام تقويمية'}</Fact>
              <Fact label="المدة التعاقدية">{q.durationDays} يوم</Fact>
              <Fact label="الاجتماع الافتتاحي">{q.kickoffRequired ? 'إلزامي بحسب العقد' : 'حسب الحاجة'}</Fact>
              <Fact label="مهلة رد العميل">{q.responseDays ? `${q.responseDays} يوم` : 'من الإعدادات'}</Fact>
            </dl>
            {q.deemedAcceptanceClause && <p className="text-sm text-ink-2"><span className="text-xs text-muted">بند القبول الضمني: </span>{q.deemedAcceptanceClause}</p>}
            {a.note && <p className="text-sm text-ink-2"><span className="text-xs text-muted">ملاحظة المالية: </span>{a.note}</p>}
            {exc && <Notice tone="danger">يوجد استثناء للرئيس التنفيذي على هذه الفرصة — {EXC_STATUS[exc.status].label} <span className="ltr-iso text-xs">{exc.id}</span></Notice>}
          </div>
        </div>
      ) : <p className="text-sm text-muted">العرض غير موجود.</p>}
    </Card>
  );
}

// ── (2) CEO exception ───────────────────────────────────────────

function Exceptions() {
  const { state, me } = useStore();
  const canRequest = hasRole(me, 'dept_manager', 'main_dept_manager');
  const opportunities = state.activations
    .filter((a) => a.status === 'pending_finance' && !state.exceptions.some((e) => e.opportunityId === a.opportunityId && ['requested', 'granted'].includes(e.status)))
    .map((a) => state.opportunities.find((o) => o.id === a.opportunityId))
    .filter((o, i, arr): o is NonNullable<typeof o> => !!o && arr.findIndex((x) => x?.id === o.id) === i)
    // An opportunity that already has its project (a paid addition waiting for finance) needs no exception.
    .filter((o) => !state.projects.some((p) => p.opportunityId === o.id));
  const lineOptions = opportunities.flatMap((o) => {
    const act = state.activations.find((a) => a.opportunityId === o.id && a.status === 'pending_finance');
    const q = state.quotations.find((x) => x.id === act?.quotationId);
    return (q?.lines ?? []).map((l) => ({ value: l.id, label: `${o.id} — ${l.title} (${deptName(l.deptCode)})` }));
  });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">البدء قبل الاعتماد المالي باستثناء من الرئيس التنفيذي وحده، بنطاق ومدة وسقف تكلفة محددة.</p>
      {canRequest && (
        <div className="flex items-center gap-2">
          <CommandButton
            command="exception.request" base={{}} label="طلب استثناء بدء" size="md" disabled={!opportunities.length} success="رُفع الطلب للرئيس التنفيذي"
            intro="للفرص التي لديها طلب تفعيل بانتظار المالية فقط."
            fields={[
              { name: 'opportunityId', label: 'الفرصة', type: 'select', options: opportunities.map((o) => ({ value: o.id, label: `${o.id} — ${o.title}` })), required: true },
              { name: 'reason', label: 'السبب', type: 'textarea', required: true },
              { name: 'commitmentDoc', label: 'مستند التعميد القائم', type: 'text', required: true, placeholder: 'أمر شراء / عقد موقع / خطاب تعميد' },
              { name: 'allowedLineIds', label: 'بنود العرض المسموح العمل عليها قبل الاعتماد المالي', type: 'multiselect', options: lineOptions, required: true, hint: 'اختر بنود الفرصة نفسها. التكاليف والعمل والمعاملات خارج هذه البنود تنتظر الاعتماد المالي.' },
              { name: 'allowedScope', label: 'وصف النطاق المسموح', type: 'text', required: true },
              { name: 'durationDays', label: 'المدة (يوم)', type: 'number', initial: 30, required: true },
              { name: 'costCap', label: 'سقف التكلفة (ر.س)', type: 'number', initial: 20000, required: true },
            ]}
          />
          {!opportunities.length && <span className="text-xs text-muted">لا فرص بطلب تفعيل معلّق.</span>}
        </div>
      )}
      </div>
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
      title={<span className="flex flex-wrap items-center gap-2">{opp?.title} <Pill tone={st.tone}>{st.label}</Pill></span>}
      subtitle={<>طلبه {userName(e.requestedBy)} · <span className="ltr-iso">{e.id}</span></>}
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
          {e.projectId && <Link to={`/projects/${e.projectId}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"><ArrowUpLeft size={15} /> فتح المشروع</Link>}
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        <Fact label="السبب">{e.reason}</Fact>
        <Fact label="مستند التعميد">{e.commitmentDoc}</Fact>
        <Fact label="النطاق المسموح">
          {e.allowedScope}
          <span className="block text-xs font-normal text-muted">
            {(state.quotations.find((q) => q.id === e.quotationId)?.lines ?? []).filter((l) => e.allowedLineIds.includes(l.id)).map((l) => l.title).join('، ')}
          </span>
        </Fact>
        <Fact label="المدة">{e.durationDays} يوم</Fact>
        <Fact label="سقف التكلفة / المستخدم">
          <span className={used > e.costCap * 0.8 ? 'text-st-waiting' : ''}><Money v={e.costCap} /> / <Money v={used} /></span>
        </Fact>
        <Fact label="ينتهي">{e.expiresAt ? <span className={!isAfter(e.expiresAt, state.now) ? 'text-st-danger' : ''}><DateText iso={e.expiresAt} /></span> : '—'}</Fact>
        <Fact label="آخر تنبيه للرئيس التنفيذي"><DateText iso={e.lastCeoAlertAt} /></Fact>
        <Fact label="القرار">{e.decidedBy ? `${userName(e.decidedBy)}${e.decisionNote ? ` — ${e.decisionNote}` : ''}` : '—'}</Fact>
      </dl>
      {e.renewals.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-ink-2">
          {e.renewals.map((r, i) => (
            <li key={i}>تمديد {r.days} يوم وزيادة السقف <Money v={r.extraCap} /> — {userName(r.by)} · <DateText iso={r.at} /> · {r.note}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── (3) Projects waiting for the Director ───────────────────────────────────

function Receipt({ projects }: { projects: Project[] }) {
  const { state } = useStore();
  const { client } = useLookup();
  if (!projects.length) return <Empty title="لا مشاريع بانتظار الاستلام أو التعيين" />;
  return (
    <>
      <Card pad={false}>
        <Table head={['المشروع', 'العميل', 'المصدر', 'أُنشئ', 'الخطوة التالية', '']}>
          {projects.map((p) => {
            const step = nextStep(state, p);
            return (
              <tr key={p.id}>
                <Td><p className="font-medium text-ink">{p.title}</p><p className="ltr-iso text-xs text-muted">{p.id}</p></Td>
                <Td className="text-ink-2">{client(p.clientId)?.name}</Td>
                <Td>{p.createdFrom === 'exception' ? <Pill tone="danger">{CREATED_FROM[p.createdFrom]}</Pill> : <span className="text-sm text-ink-2">{CREATED_FROM[p.createdFrom]}</span>}</Td>
                <Td><DateText iso={p.createdAt} /></Td>
                <Td><p className="text-sm text-ink">{step.text}</p>{step.who && <p className="text-xs text-muted">{step.who}</p>}</Td>
                <Td><Link className="text-sm font-medium text-brand-700 hover:underline" to={`/projects/${p.id}`}>فتح</Link></Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}

// ── (4) Projects that existed before the system ──────────────────────

function Existing({ projects, canRegister }: { projects: Project[]; canRegister: boolean }) {
  const { state, me } = useStore();
  const { userName, client } = useLookup();
  const finance = allows(me, 'payment.verify_entitlement');
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">مشاريع بدأت قبل النظام: تُسجَّل بنموذج مختصر، وتراجع المالية أرصدتها السابقة، ثم تدخل التجهيز.</p>
      {canRegister && (
        <CommandButton
          command="project.register_existing" base={{}} label="تسجيل مشروع قائم قبل النظام" size="md" success="سُجّل المشروع — بانتظار مراجعة المالية"
          fields={[
            { name: 'title', label: 'اسم المشروع', type: 'text', required: true },
            { name: 'clientId', label: 'العميل', type: 'select', options: state.clients.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` })), required: true },
            { name: 'deptCode', label: 'القسم', type: 'select', options: DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })), required: true },
            { name: 'pmId', label: 'مدير المشروع', type: 'select', options: userOptions(state.users, (u) => hasRole(u, 'engineer', 'dept_manager')), required: true },
            { name: 'followUpOwnerId', label: 'مسؤول متابعة العميل', type: 'select', options: userOptions(state.users, (u) => hasRole(u, 'sales_rep', 'sales_manager')), required: true },
            { name: 'currentPhase', label: 'المرحلة الحالية', type: 'text' },
            { name: 'remainingWork', label: 'العمل المتبقي', type: 'textarea' },
            { name: 'documents', label: 'المستندات المتوفرة', type: 'textarea' },
            { name: 'scopeLines', label: 'بنود النطاق المتبقي (سطر لكل بند)', type: 'lines', required: true },
          ]}
        />
      )}
      </div>
      {!projects.length ? <Empty title="لا مشاريع قائمة مسجلة" /> : projects.map((p) => (
        <Card key={p.id}
          title={<span className="flex flex-wrap items-center gap-2">{p.title} <StatePill s={PROJECT_STATES[p.status]} /></span>}
          subtitle={<>{client(p.clientId)?.name ?? ''} · مدير المشروع {userName(p.pmId)} · مسؤول المتابعة {userName(p.followUpOwnerId)} · <span className="ltr-iso">{p.id}</span></>}
          actions={
            <>
              {finance && p.preSystem && !p.preSystem.financeReviewed && (
                <CommandButton command="project.finance_review_existing" base={{ projectId: p.id }} label="مراجعة الأرصدة السابقة" success="روجعت الأرصدة — المشروع في التجهيز"
                  fields={[{ name: 'note', label: 'نتيجة المراجعة (دون إعادة إصدار فواتير)', type: 'textarea', required: true }]} />
              )}
              <Link to={`/projects/${p.id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"><ArrowUpLeft size={15} /> فتح</Link>
            </>
          }
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
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
