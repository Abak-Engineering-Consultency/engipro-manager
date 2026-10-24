import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { fmtDate } from '../../domain/calendar';
import { PAYMENT_CONDITIONS } from '../../domain/labels';
import { allows } from '../../domain/permissions';
import { MappingEditor, MAPPING_STATUS, PaymentDrawer, ThreeDims, dueCls, linkSummary, paymentTotals } from '../../components/finance/PaymentViews';
import { Button, CommandButton, Empty, Id, Kpi, Money, Notice, Pill, Rule, Table, Td } from '../../components/ui';
import type { TabProps } from './ProjectPage';

/** 11-B3 — the contract's payment schedule, linked by the PM, verified and collected by finance. */
export const PaymentsTab: React.FC<TabProps> = ({ project }) => {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const pays = state.payments.filter((p) => p.projectId === project.id);
  const contract = pays.filter((p) => !p.visitIds?.length);
  const t = paymentTotals(pays);
  const m = project.paymentMapping;
  const isPm = project.pmId === me.id;
  const canMap = isPm && m.status !== 'submitted' && ['preparing', 'in_progress', 'suspended'].includes(project.status) && contract.length > 0;
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('p', id);
    else next.delete('p');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="قيمة جدول الدفعات" value={<Money v={t.value} />} hint={`${project.contracts.length} عقد/ملحق — جدول واحد بلا توزيع مصطنع`} />
        <Kpi label="مستحقة ضمن المهلة" value={<Money v={t.due} />} tone={t.due ? 'waiting' : undefined} />
        <Kpi label="متأخرة" value={<Money v={t.overdue} />} tone={t.overdue ? 'danger' : undefined} />
        <Kpi label="المحصل (بتأكيد المالية)" value={<Money v={t.collected} />} />
        <Kpi label="المتبقي" value={<Money v={t.remaining} />} />
      </div>

      {contract.length > 0 && (
        <section className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link2 size={16} className="text-muted" />
              <span className="text-sm font-semibold text-ink">ربط الدفعات بالمخرجات</span>
              <Pill tone={MAPPING_STATUS[m.status].tone}>{MAPPING_STATUS[m.status].label}</Pill>
              <Rule>PJ-07</Rule>
              {m.decidedBy && <span className="text-xs text-muted">{userName(m.decidedBy)} · {fmtDate(m.decidedAt)}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {canMap && <Button size="sm" variant={m.status === 'confirmed' ? 'secondary' : 'primary'} onClick={() => setEditing(true)}>{m.status === 'confirmed' ? 'تعديل الربط (يعود للمالية)' : 'تحرير الربط وإرساله'}</Button>}
              {allows(me, 'payment.verify_entitlement') && m.status === 'submitted' && (
                <>
                  <CommandButton command="project.decide_payment_links" base={{ projectId: project.id, decision: 'confirmed' }} label="مطابق للاتفاق — تأكيد" confirm="تأكيد أن الربط يطابق شروط العقد دون دفعات جديدة أو تغيير قيم." success="أُكّد الربط" />
                  <CommandButton command="project.decide_payment_links" base={{ projectId: project.id, decision: 'returned' }} variant="secondary" label="إعادة بملاحظة" fields={[{ name: 'note', label: 'الملاحظة', type: 'textarea', required: true }]} success="أُعيد الربط" />
                </>
              )}
            </div>
          </div>
          {m.note && <p className="mt-2 text-sm text-st-danger">ملاحظة المالية: {m.note}</p>}
          {m.status !== 'confirmed' && project.status === 'preparing' && <p className="mt-1 text-xs text-muted">تأكيد المالية للربط شرط في بوابة البدء (PJ-09).</p>}
        </section>
      )}

      {!pays.length ? <Empty title="لا يوجد جدول دفعات في النظام" hint={project.createdFrom === 'pre_system' ? 'مشروع قائم قبل النظام: راجعت المالية الأرصدة السابقة دون إعادة إصدار فواتير (AD-08).' : undefined} /> : (
        <div className="rounded-lg border border-line">
          <Table head={['الدفعة', 'الشرط', 'الربط', 'المبلغ', 'الأبعاد الثلاثة', 'الاستحقاق / المهلة', 'المحصل']}>
            {pays.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-sunken" onClick={() => open(p.id)}>
                <Td><Id>{p.id}</Id><p className="text-sm font-medium text-ink">{p.label}</p></Td>
                <Td className="text-sm">{PAYMENT_CONDITIONS[p.condition]}</Td>
                <Td><p className="max-w-[240px] text-xs text-ink-2">{linkSummary(state, project, p)}</p></Td>
                <Td><Money v={p.amount} /></Td>
                <Td><ThreeDims pay={p} /></Td>
                <Td>
                  <span className={dueCls(p)}>
                    <span className="block text-xs">{p.dueAt ? <>استحقت {fmtDate(p.dueAt)}</> : p.scheduledDate ? <>مجدولة {fmtDate(p.scheduledDate)}</> : '—'}</span>
                    {p.graceUntil && <span className="block text-xs">المهلة حتى {fmtDate(p.graceUntil)}</span>}
                    {p.escalatedAt && <span className="block text-xs text-st-danger">مصعّدة لمدير المبيعات</span>}
                  </span>
                </Td>
                <Td><Money v={p.collected} />{p.transferClaim && p.collection !== 'fully_collected' && <span className="block text-xs text-st-waiting">أفاد العميل بالتحويل</span>}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {['operationally_closed', 'cancelled'].includes(project.status) && t.remaining > 0 && (
        <Notice tone="waiting">المشروع {project.status === 'cancelled' ? 'ملغى' : 'مغلق تشغيليًا'} ولا تسقط المستحقات: المالية تواصل المطالبة والتحصيل حتى التسوية. <Rule>A4</Rule> <Rule>AC-13</Rule> <Rule>AC-14</Rule></Notice>
      )}

      {editing && <MappingEditor project={project} onClose={() => setEditing(false)} />}
      <PaymentDrawer project={project} id={params.get('p')} onClose={() => open(null)} />
    </div>
  );
};
