import React from 'react';
import { Link } from 'react-router-dom';
import { useLookup, useStore } from '../../app/store';
import { DEPARTMENTS, deptName, SERVICES } from '../../domain/catalog';
import { ACTIVATION_STATES } from '../../domain/labels';
import { allows } from '../../domain/permissions';
import type { ChangeKind, ChangeRequest, Project } from '../../domain/types';
import { Card, CommandButton, DateText, Empty, Id, Money, Notice, Pill, Rule, StatePill } from '../../components/ui';
import { CHANGE_KINDS, CHANGE_STATUS } from '../../components/projects/shared';
import type { TabProps } from './ProjectPage';

export const ChangesTab: React.FC<TabProps> = ({ project: p }) => {
  const { state, me } = useStore();
  const isPm = p.pmId === me.id;
  const canRequest = allows(me, 'project.request_change', { own: isPm }) && ['preparing', 'in_progress', 'suspended'].includes(p.status);
  const deliverables = state.deliverables.filter((d) => d.projectId === p.id && !['client_approved', 'excluded'].includes(d.status));
  const otherDepts = DEPARTMENTS.filter((d) => !p.departments.some((x) => x.deptCode === d.code));
  const list = [...p.changeRequests].reverse();

  return (
    <div className="space-y-4">
      <Notice tone="brand">
        كل طلب: يرفعه مدير المشروع بسبب، ويقرر صاحبه بالاعتماد أو الإعادة بملاحظة أو الرفض بسبب، ويُحفظ القرار باسم صاحبه ووقته. الإضافة بمقابل لا تنشئ مشروعًا جديدًا: عرض ودفعات مستقلة تُربط بنفس المشروع، والعرض الأصلي لا يتغير. <Rule>11-B8</Rule> <Rule>F2</Rule>
      </Notice>

      {canRequest && (
        <Card title="طلب تغيير" subtitle="مدير المشروع">
          <div className="flex flex-wrap gap-2">
            <CommandButton command="change.request" base={{ projectId: p.id, kind: 'add_department' }} label="إضافة قسم" variant="secondary" success="رُفع طلب إضافة القسم لمدير الأقسام"
              intro="داخل الاتفاق: مدير الأقسام يعتمد ثم يعيّن مدير القسم المنضم مسؤولي البنود. خارج الاتفاق → إضافة بمقابل."
              fields={[
                { name: 'deptCode', label: 'القسم', type: 'select', options: otherDepts.map((d) => ({ value: d.code, label: d.name })) },
                { name: 'reason', label: 'السبب', type: 'textarea', required: true },
                { name: 'scope', label: 'النطاق', type: 'textarea', required: true },
                { name: 'deliverableTitles', label: 'المخرجات (سطر لكل مخرج)', type: 'lines' },
              ]} />
            <CommandButton command="change.request" base={{ projectId: p.id, kind: 'free_addition' }} label="إضافة دون مقابل" variant="secondary" success="رُفع طلب الإضافة لمدير الأقسام"
              intro="بند نطاق دون إيراد يدخل الخطة بعد اعتماد مدير الأقسام."
              fields={[
                { name: 'title', label: 'الإضافة', type: 'text', required: true },
                { name: 'deptCode', label: 'القسم المنفذ', type: 'select', options: DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })), initial: p.leadDept },
                { name: 'reason', label: 'السبب', type: 'textarea', required: true },
                { name: 'timeEffectDays', label: 'الأثر على المدة (يوم)', type: 'number', initial: 0 },
                { name: 'costEffect', label: 'الأثر على التكلفة (ر.س)', type: 'number', initial: 0 },
                { name: 'deliverableTitles', label: 'المخرجات (سطر لكل مخرج)', type: 'lines' },
              ]} />
            <CommandButton command="change.request" base={{ projectId: p.id, kind: 'paid_addition' }} label="إضافة بمقابل" variant="secondary" success="أُحيل الطلب لمسؤول الفرصة عبر المبيعات"
              intro="تُحال لمسؤول الفرصة: عرض إضافي عبر المبيعات ← تعميد ← اعتماد المالية ← يُربط بنفس المشروع."
              fields={[{ name: 'title', label: 'الإضافة المطلوبة', type: 'text', required: true }, { name: 'reason', label: 'السبب وطلب العميل', type: 'textarea', required: true }]} />
            <CommandButton command="change.request" base={{ projectId: p.id, kind: 'exclusion' }} label="استبعاد مخرج" variant="secondary" disabled={!deliverables.length} success="رُفع طلب الاستبعاد لمدير الأقسام"
              intro="باتفاق العميل واعتماد مدير الأقسام؛ يُبلَّغ مسؤول الفرصة والمالية، وأثر القيمة عبر المبيعات والمالية."
              fields={[
                { name: 'deliverableId', label: 'المخرج', type: 'select', options: deliverables.map((d) => ({ value: d.id, label: `${d.title} (${d.id})` })) },
                { name: 'reason', label: 'السبب', type: 'textarea', required: true },
                { name: 'clientAgreement', label: 'موافقة العميل (المرجع)', type: 'text', required: true },
              ]} />
            <CommandButton command="change.request" base={{ projectId: p.id, kind: 'track' }} label="مسار تنفيذ مستقل" variant="secondary" success="رُفع طلب المسار"
              intro={`البنود تُنقل ولا تُنسخ، والقيمة والدفعات تبقى في جدول العقد الواحد. يعتمده ${p.multiDept ? 'مدير الأقسام (متعدد الأقسام)' : 'مدير القسم (قسم واحد)'}.`}
              fields={[
                { name: 'trackName', label: 'اسم المسار', type: 'text', required: true },
                { name: 'scopeItemIds', label: 'البنود المنقولة', type: 'multiselect', options: p.scopeItems.filter((i) => !i.trackId).map((i) => ({ value: i.id, label: `${i.title}${i.siteId ? ` — ${p.sites.find((s) => s.id === i.siteId)?.name}` : ''}` })) },
                { name: 'reason', label: 'السبب', type: 'textarea', required: true },
              ]} />
          </div>
        </Card>
      )}

      {!list.length ? <Empty title="لا توجد طلبات تغيير" hint="إضافة قسم، إضافة بمقابل أو دونه، استبعاد مخرج، أو مسار تنفيذ مستقل." /> : list.map((c) => <ChangeCard key={c.id} p={p} c={c} />)}
    </div>
  );
};

function ChangeCard({ p, c }: { p: Project; c: ChangeRequest }) {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const kind = CHANGE_KINDS[c.kind as ChangeKind];
  const st = CHANGE_STATUS[c.status];
  const deciderOk = c.kind === 'track' && !p.multiDept ? allows(me, 'project.staff', { depts: [p.leadDept] }) && me.roleId === 'dept_manager' : allows(me, 'project.approve_change');
  const canDecide = c.status === 'pending' && deciderOk;
  const isOppOwner = (p.opportunityId ? state.opportunities.find((o) => o.id === p.opportunityId)?.ownerId : p.followUpOwnerId) === me.id;
  const q = c.quotationId ? state.quotations.find((x) => x.id === c.quotationId) : undefined;
  const act = c.quotationId ? state.activations.find((a) => a.quotationId === c.quotationId) : undefined;
  const d = c.deliverableId ? state.deliverables.find((x) => x.id === c.deliverableId) : undefined;
  return (
    <Card
      title={<span className="flex flex-wrap items-center gap-2"><Id>{c.id}</Id> {kind.label}{c.title ? `: ${c.title}` : ''} <Pill tone={st.tone}>{st.label}</Pill> <Rule>{kind.rule}</Rule></span>}
      subtitle={<>طلبه {userName(c.requestedBy)} · <DateText iso={c.requestedAt} /></>}
      actions={
        <>
          {canDecide && (
            <>
              <CommandButton command="change.decide" base={{ projectId: p.id, requestId: c.id, decision: 'approved' }} label="اعتماد" success="اعتُمد الطلب"
                fields={[{ name: 'note', label: 'ملاحظة (اختيارية)', type: 'textarea' }]} />
              <CommandButton command="change.decide" base={{ projectId: p.id, requestId: c.id, decision: 'returned' }} label="إعادة بملاحظة" variant="secondary" success="أُعيد الطلب"
                fields={[{ name: 'note', label: 'الملاحظة', type: 'textarea', required: true }]} />
              <CommandButton command="change.decide" base={{ projectId: p.id, requestId: c.id, decision: 'rejected' }} label="رفض" variant="secondary" success="رُفض الطلب"
                fields={[{ name: 'note', label: 'سبب الرفض', type: 'textarea', required: true }]} />
            </>
          )}
          {c.kind === 'paid_addition' && c.status === 'with_sales' && !c.quotationId && isOppOwner && (
            <CommandButton command="paid_addition.accept_quotation" base={{ projectId: p.id, requestId: c.id }} label="تسجيل العرض الإضافي المقبول" success="سُجّل العرض — أُرسل طلب التفعيل للمالية"
              intro="يمثّل مسار المبيعات القائم: عرض إضافي ← اعتمادات ← تعميد العميل. بعدها يذهب طلب التفعيل للمالية، واعتماده يربط الإضافة بنفس المشروع."
              fields={[
                { name: 'serviceCode', label: 'الخدمة', type: 'select', options: SERVICES.map((s) => ({ value: s.code, label: `${s.code} — ${s.title}` })) },
                { name: 'amount', label: 'قيمة العرض (ر.س)', type: 'number', required: true },
              ]} />
          )}
        </>
      }
    >
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div className="md:col-span-3"><dt className="text-xs text-muted">السبب</dt><dd>{c.reason}</dd></div>
        {c.deptCode && <div><dt className="text-xs text-muted">القسم</dt><dd>{deptName(c.deptCode)}</dd></div>}
        {c.scope && <div className="md:col-span-2"><dt className="text-xs text-muted">النطاق</dt><dd>{c.scope}</dd></div>}
        {!!c.deliverableTitles?.length && <div className="md:col-span-2"><dt className="text-xs text-muted">المخرجات</dt><dd>{c.deliverableTitles.join('، ')}</dd></div>}
        {c.kind === 'free_addition' && <div><dt className="text-xs text-muted">الأثر</dt><dd>{c.timeEffectDays ?? 0} يوم · <Money v={c.costEffect ?? 0} /> · دون إيراد</dd></div>}
        {d && <div><dt className="text-xs text-muted">المخرج</dt><dd>{d.title} <span className="ltr-iso text-[11px] text-muted">{d.id}</span></dd></div>}
        {c.clientAgreement && <div><dt className="text-xs text-muted">موافقة العميل</dt><dd>{c.clientAgreement}</dd></div>}
        {c.trackName && <div><dt className="text-xs text-muted">المسار</dt><dd>{c.trackName}</dd></div>}
        {!!c.scopeItemIds?.length && <div className="md:col-span-2"><dt className="text-xs text-muted">البنود المنقولة</dt><dd>{c.scopeItemIds.map((id) => p.scopeItems.find((i) => i.id === id)?.title).join('، ')}</dd></div>}
        {q && (
          <div className="md:col-span-3">
            <dt className="text-xs text-muted">العرض الإضافي المرتبط</dt>
            <dd className="flex flex-wrap items-center gap-2"><Id>{q.id}</Id> {q.revision} · <Money v={q.lines.reduce((s, l) => s + l.amount, 0)} />
              {act && <><span className="text-muted">· التفعيل</span> <Id>{act.id}</Id> <StatePill s={ACTIVATION_STATES[act.status]} /></>}
              {act?.status === 'pending_finance' && <Link to="/intake" className="text-xs text-brand-700 underline">لدى المالية</Link>}
            </dd>
          </div>
        )}
        {c.decidedBy && (
          <div className="md:col-span-3 border-t border-line pt-2">
            <dt className="text-xs text-muted">القرار</dt>
            <dd>{userName(c.decidedBy)} · <DateText iso={c.decidedAt} />{c.decisionNote ? ` — ${c.decisionNote}` : ''}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
