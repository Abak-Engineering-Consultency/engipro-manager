import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLookup, useStore } from '../app/store';
import { dateKey, fmtDate } from '../domain/calendar';
import { visitTypeName } from '../domain/catalog';
import { ACTIVATION_STATES, COST_STATES, PAYMENT_CONDITIONS, PROJECT_STATES, VISIT_STATES } from '../domain/labels';
import { allows } from '../domain/permissions';
import type { PaymentItem, Visit } from '../domain/types';
import { ThreeDims, paymentTotals } from '../components/finance/PaymentViews';
import { CommandButton, DateText, Empty, Id, Kpi, Money, PageHeader, Pill, Rule, StatePill, Table, Td, Tabs } from '../components/ui';

type TabId = 'activations' | 'mapping' | 'evidence' | 'claims' | 'transfers' | 'overdue' | 'costs' | 'settlement' | 'presystem' | 'visits';

const BILLABLE_DONE: Visit['status'][] = ['executed', 'report_pending', 'report_approved', 'inaccessible'];

/** X-05 — the finance desk: every step of the projects process that waits on finance. */
export const Finance: React.FC = () => {
  const { state, me } = useStore();
  const { userName, project } = useLookup();
  const [params, setParams] = useSearchParams();
  const canAct = allows(me, 'collection.confirm');

  const activations = state.activations.filter((a) => a.status === 'pending_finance');
  const mapping = state.projects.filter((p) => p.paymentMapping.status === 'submitted');
  const evidence = state.payments.filter((p) => p.evidenceCheck === 'pending');
  const claims = state.payments.filter((p) => p.entitlement !== 'not_due' && p.invoicing === 'not_invoiced' && ['accepted', 'none'].includes(p.evidenceCheck));
  const transfers = state.payments.filter((p) => p.transferClaim && p.collection !== 'fully_collected');
  const overdue = state.payments.filter((p) => p.entitlement === 'overdue' && p.collection !== 'fully_collected');
  const costs = state.costs.filter((c) => ['approved', 'partially_paid'].includes(c.status) || (c.status === 'service_received' && c.paid < c.amount));
  const chains = state.projects.flatMap((p) => [p.closure, p.cancellation].filter((c) => c?.status === 'pending' && c.steps.find((s) => s.status === 'pending')?.key === 'finance').map((c) => ({ p, c: c! })));
  const toSettle = state.projects.filter((p) => ['operationally_closed', 'cancelled'].includes(p.status) && p.financialState === 'open');
  const presystem = state.projects.filter((p) => p.preSystem && !p.preSystem.financeReviewed);
  const billable = state.visits.filter((v) => v.billing === 'billable' && !v.claimId && BILLABLE_DONE.includes(v.status));
  const visitGroups = [...new Set(billable.map((v) => v.link?.projectId ?? ''))].map((pid) => ({ pid, visits: billable.filter((v) => (v.link?.projectId ?? '') === pid) }));

  const t = paymentTotals(state.payments);
  const month = dateKey(state.now).slice(0, 7);
  const collectedMonth = state.payments.flatMap((p) => p.receipts).filter((r) => dateKey(r.at).slice(0, 7) === month).reduce((s, r) => s + r.amount, 0);
  const unpaidCosts = costs.reduce((s, c) => s + c.amount - c.paid, 0);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'activations', label: 'طلبات التفعيل', count: activations.length },
    { id: 'mapping', label: 'ربط الدفعات', count: mapping.length },
    { id: 'evidence', label: 'إثبات الاستحقاق', count: evidence.length },
    { id: 'claims', label: 'مطالبات للإصدار', count: claims.length },
    { id: 'transfers', label: 'تحويلات للمطابقة', count: transfers.length },
    { id: 'overdue', label: 'متأخرات', count: overdue.length },
    { id: 'costs', label: 'تكاليف للصرف', count: costs.length },
    { id: 'settlement', label: 'الإغلاق والتسوية', count: chains.length + toSettle.length },
    { id: 'presystem', label: 'مشاريع قائمة', count: presystem.length },
    { id: 'visits', label: 'زيارات للفوترة', count: billable.length },
  ];
  const tab = (tabs.some((x) => x.id === params.get('tab')) ? params.get('tab') : (tabs.find((x) => x.count)?.id ?? 'activations')) as TabId;
  const setTab = (id: TabId) => setParams({ tab: id }, { replace: true });

  const payLink = (p: PaymentItem) => `/projects/${p.projectId}?tab=payments&p=${p.id}`;
  const payCell = (p: PaymentItem) => (
    <Td>
      <Link className="hover:underline" to={payLink(p)}><Id>{p.id}</Id></Link>
      <p className="text-sm font-medium text-ink">{p.label}</p>
      <p className="max-w-[260px] truncate text-xs text-muted">{project(p.projectId)?.title}</p>
    </Td>
  );

  return (
    <div>
      <PageHeader title="المالية" subtitle={<>كل خطوة في مسار المشاريع تنتظر المالية — الاستحقاق والفاتورة والتحصيل أبعاد منفصلة <Rule>A5</Rule> <Rule>X-05</Rule></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="مستحقة ضمن المهلة" value={<Money v={t.due} />} tone={t.due ? 'waiting' : undefined} />
        <Kpi label="متأخرة" value={<Money v={t.overdue} />} tone={t.overdue ? 'danger' : undefined} hint={`${overdue.length} دفعة`} />
        <Kpi label="المحصل هذا الشهر" value={<Money v={collectedMonth} />} />
        <Kpi label="تكاليف معتمدة غير مصروفة" value={<Money v={unpaidCosts} />} hint={`${costs.length} طلب`} />
      </div>

      <div className="rounded-lg border border-line bg-card shadow-card">
        <div className="px-2"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
        <div className="p-4">
          {tab === 'activations' && (activations.length ? (
            <Table head={['الطلب', 'الفرصة', 'العرض', 'طلبه', 'الحالة', '']}>
              {activations.map((a) => (
                <tr key={a.id}>
                  <Td><Id>{a.id}</Id></Td>
                  <Td className="text-sm">{state.opportunities.find((o) => o.id === a.opportunityId)?.title}</Td>
                  <Td><span className="ltr-iso text-xs">{a.quotationId}</span></Td>
                  <Td className="text-sm">{userName(a.requestedBy)} · <DateText iso={a.requestedAt} /></Td>
                  <Td><StatePill s={ACTIVATION_STATES[a.status]} /></Td>
                  <Td><Link className="text-sm text-brand-700 hover:underline" to="/intake">القرار في «التفعيل والاستلام»</Link></Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا طلبات تفعيل بانتظار المالية" />)}

          {tab === 'mapping' && (mapping.length ? (
            <Table head={['المشروع', 'أُرسل', 'مدير المشروع', '']}>
              {mapping.map((p) => (
                <tr key={p.id}>
                  <Td><Id>{p.id}</Id><p className="text-sm">{p.title}</p></Td>
                  <Td><DateText iso={p.paymentMapping.submittedAt} /></Td>
                  <Td className="text-sm">{userName(p.pmId)}</Td>
                  <Td><Link className="text-sm text-brand-700 hover:underline" to={`/projects/${p.id}?tab=payments`}>مراجعة الربط والقرار <Rule>PJ-07</Rule></Link></Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا ربط دفعات بانتظار التحقق" />)}

          {tab === 'evidence' && (evidence.length ? (
            <Table head={['الدفعة', 'الإثبات', 'المبلغ', '']}>
              {evidence.map((p) => (
                <tr key={p.id}>
                  {payCell(p)}
                  <Td><ul className="text-xs text-ink-2">{p.evidence.map((e, i) => <li key={i}>{e.kind}{e.note && ` — ${e.note}`}</li>)}</ul></Td>
                  <Td><Money v={p.amount} /></Td>
                  <Td>{allows(me, 'payment.verify_entitlement') && (
                    <CommandButton command="payment.verify_evidence" base={{ paymentId: p.id }} label="تحقق"
                      fields={[{ name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'accepted', label: 'قبول الإثبات' }, { value: 'objected', label: 'اعتراض قبل الفاتورة' }] }, { name: 'note', label: 'ملاحظة', type: 'textarea' }]} success="سُجّل التحقق" />
                  )}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا إثباتات بانتظار التحقق" />)}

          {tab === 'claims' && (claims.length ? (
            <Table head={['الدفعة', 'الشرط', 'المبلغ', 'المهلة حتى', '']}>
              {claims.map((p) => (
                <tr key={p.id}>
                  {payCell(p)}
                  <Td className="text-sm">{PAYMENT_CONDITIONS[p.condition]}</Td>
                  <Td><Money v={p.amount} /></Td>
                  <Td><DateText iso={p.graceUntil} /></Td>
                  <Td>{canAct && <CommandButton command="payment.issue_claim" base={{ paymentId: p.id }} label="إصدار المطالبة" fields={[{ name: 'invoiceRef', label: 'مرجع الفاتورة', type: 'text', required: true }]} success="صدرت المطالبة — مهمة تحصيل لمسؤول الفرصة" />}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا مطالبات بانتظار الإصدار" />)}

          {tab === 'transfers' && (transfers.length ? (
            <Table head={['الدفعة', 'الإثبات المرفوع', 'المتبقي', '']}>
              {transfers.map((p) => (
                <tr key={p.id}>
                  {payCell(p)}
                  <Td className="text-sm">{p.transferClaim!.proof}<p className="text-xs text-muted">{userName(p.transferClaim!.by)} · {fmtDate(p.transferClaim!.at)}</p></Td>
                  <Td><Money v={p.amount - p.collected} /></Td>
                  <Td>{canAct && <CommandButton command="payment.record_collection" base={{ paymentId: p.id }} label="مطابقة وتسجيل التحصيل" fields={[{ name: 'amount', label: 'المبلغ', type: 'number', initial: p.amount - p.collected }, { name: 'ref', label: 'رقم السند', type: 'text', required: true }]} success="سُجّل التحصيل" />}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا تحويلات بانتظار المطابقة" hint="إفادة العميل بالتحويل تُحال هنا؛ لا تُعد الدفعة محصلة قبل تأكيد المالية." />)}

          {tab === 'overdue' && (overdue.length ? (
            <Table head={['الدفعة', 'الأبعاد', 'متأخرة منذ', 'المتبقي', 'التصعيد', 'آخر متابعة']}>
              {overdue.map((p) => (
                <tr key={p.id}>
                  {payCell(p)}
                  <Td><ThreeDims pay={p} /></Td>
                  <Td className="text-st-danger"><DateText iso={p.overdueAt} /></Td>
                  <Td><Money v={p.amount - p.collected} /></Td>
                  <Td>{p.escalatedAt ? <Pill tone="danger">{p.escalation === 'early' ? 'مبكر' : 'آلي'} — {fmtDate(p.escalatedAt)}</Pill> : <span className="text-xs text-muted">بعد {state.settings.collectionEscalationDays} يومًا <Rule>DL-13</Rule></span>}</Td>
                  <Td className="text-xs">{p.followUps.at(-1) ? <>{p.followUps.at(-1)!.response}<span className="block text-muted">{fmtDate(p.followUps.at(-1)!.at)}</span></> : '—'}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا متأخرات" hint="الدفعة لا تُعد متأخرة قبل انتهاء المهلة (grace_until)." />)}

          {tab === 'costs' && (costs.length ? (
            <Table head={['الطلب', 'المشروع', 'الجهة', 'الحالة', 'المتبقي', '']}>
              {costs.map((c) => (
                <tr key={c.id}>
                  <Td><Link className="hover:underline" to={`/projects/${c.projectId}?tab=costs&c=${c.id}`}><Id>{c.id}</Id></Link><p className="text-sm">{c.service}</p></Td>
                  <Td><Id>{c.projectId}</Id></Td>
                  <Td className="text-sm">{c.vendor}</Td>
                  <Td><StatePill s={COST_STATES[c.status]} /></Td>
                  <Td><Money v={c.amount - c.paid} /></Td>
                  <Td>{allows(me, 'cost_request.pay') && <CommandButton command="cost.pay" base={{ costId: c.id }} label="صرف" fields={[{ name: 'amount', label: 'المبلغ', type: 'number', initial: c.amount - c.paid }, { name: 'proof', label: 'إثبات الصرف', type: 'text', required: true }]} success="سُجّل الصرف" />}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا تكاليف معتمدة بانتظار الصرف" />)}

          {tab === 'settlement' && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">مراجعة مالية في سلسلة الإغلاق أو الإلغاء <Rule>AD-06</Rule> <Rule>AD-07</Rule></h3>
                {chains.length ? (
                  <Table head={['المشروع', 'الطلب', 'السبب', 'المستحقات المفتوحة', '']}>
                    {chains.map(({ p, c }) => {
                      const open = paymentTotals(state.payments.filter((x) => x.projectId === p.id && x.entitlement !== 'not_due'));
                      const mine = c.steps.find((s) => s.status === 'pending')?.approverIds.includes(me.id);
                      return (
                        <tr key={`${p.id}-${c.kind}`}>
                          <Td><Link className="hover:underline" to={`/projects/${p.id}?tab=closure`}><Id>{p.id}</Id></Link><p className="text-sm">{p.title}</p></Td>
                          <Td>{c.kind === 'closure' ? 'إغلاق' : 'إلغاء'}</Td>
                          <Td className="text-xs">{c.reason}</Td>
                          <Td><Money v={open.remaining} /><p className="text-xs text-muted">الإغلاق لا يُسقط المستحقات</p></Td>
                          <Td>{mine && (
                            <CommandButton command="chain.decide" base={{ projectId: p.id, kind: c.kind }} label="قرار المالية"
                              fields={[{ name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'approved', label: 'اعتماد (الأرصدة والتكاليف والالتزامات مراجعة)' }, { value: 'returned', label: 'إعادة بملاحظة' }] }, { name: 'note', label: 'ملاحظة', type: 'textarea' }]} success="سُجّل القرار" />
                          )}</Td>
                        </tr>
                      );
                    })}
                  </Table>
                ) : <p className="text-sm text-muted">لا طلبات إغلاق أو إلغاء بانتظار المالية.</p>}
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">الإغلاق المالي (مستقل عن التشغيلي) <Rule>A4</Rule></h3>
                {toSettle.length ? (
                  <Table head={['المشروع', 'الحالة', 'غير محصل', '']}>
                    {toSettle.map((p) => {
                      const open = paymentTotals(state.payments.filter((x) => x.projectId === p.id && x.entitlement !== 'not_due'));
                      return (
                        <tr key={p.id}>
                          <Td><Link className="hover:underline" to={`/projects/${p.id}?tab=payments`}><Id>{p.id}</Id></Link><p className="text-sm">{p.title}</p></Td>
                          <Td><StatePill s={PROJECT_STATES[p.status]} /></Td>
                          <Td><Money v={open.remaining} className={open.remaining ? 'text-st-waiting' : ''} /></Td>
                          <Td>{allows(me, 'project.review_settlement') && <CommandButton command="project.settle" base={{ projectId: p.id }} variant="secondary" label="تسوية وإغلاق مالي" fields={[{ name: 'note', label: 'ملاحظة التسوية', type: 'textarea', required: true }]} success="أُغلق ماليًا" />}</Td>
                        </tr>
                      );
                    })}
                  </Table>
                ) : <p className="text-sm text-muted">لا مشاريع مغلقة بانتظار التسوية المالية.</p>}
              </section>
            </div>
          )}

          {tab === 'presystem' && (presystem.length ? (
            <Table head={['المشروع', 'المرحلة الحالية', 'المتبقي', 'المستندات', '']}>
              {presystem.map((p) => (
                <tr key={p.id}>
                  <Td><Link className="hover:underline" to={`/projects/${p.id}`}><Id>{p.id}</Id></Link><p className="text-sm">{p.title}</p></Td>
                  <Td className="text-sm">{p.preSystem!.currentPhase}</Td>
                  <Td className="text-xs">{p.preSystem!.remainingWork}</Td>
                  <Td className="text-xs">{p.preSystem!.documents}</Td>
                  <Td>{allows(me, 'payment.verify_entitlement') && <CommandButton command="project.finance_review_existing" base={{ projectId: p.id }} label="مراجعة الأرصدة السابقة" intro="دون إعادة إصدار فواتير سابقة؛ بعدها يدخل المشروع التجهيز (AD-08)." fields={[{ name: 'note', label: 'نتيجة المراجعة', type: 'textarea', required: true }]} success="روجعت الأرصدة" />}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا مشاريع قائمة بانتظار مراجعة الأرصدة" />)}

          {tab === 'visits' && (visitGroups.length ? (
            <div className="space-y-4">
              <p className="text-xs text-muted">مطالبة يدوية حسب العقد قد تجمع عدة زيارات؛ الزيارة المطالب بها تُعلَّم ولا تُحتسب مرتين، والسداد ≠ الإنجاز. <Rule>VS-08</Rule> <Rule>AC-12</Rule></p>
              {visitGroups.map(({ pid, visits }) => (
                <section key={pid || 'none'} className="rounded-lg border border-line">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page px-3 py-2">
                    <span className="text-sm font-semibold text-ink">{pid ? <>{pid} — {project(pid)?.title}</> : 'زيارات غير مرتبطة بمشروع'}</span>
                    {canAct && (
                      <CommandButton command="visit.claim" base={{}} label="مطالبة يدوية" title="مطالبة يدوية بزيارات قابلة للفوترة"
                        fields={[
                          { name: 'visitIds', label: 'الزيارات', type: 'multiselect', options: visits.map((v) => ({ value: v.id, label: `${v.id} — ${v.purpose}` })), initial: visits.map((v) => v.id) },
                          { name: 'amount', label: 'مبلغ المطالبة', type: 'number', required: true },
                          { name: 'ref', label: 'مرجع المطالبة', type: 'text', required: true },
                        ]} success="صدرت المطالبة — مهمة تحصيل لمسؤول الفرصة" />
                    )}
                  </header>
                  <Table head={['الزيارة', 'النوع', 'التاريخ الفعلي', 'المسؤول', 'الحالة']}>
                    {visits.map((v) => (
                      <tr key={v.id}>
                        <Td><Link className="hover:underline" to={`/visits?id=${v.id}`}><Id>{v.id}</Id></Link><p className="text-sm">{v.purpose}</p></Td>
                        <Td className="text-sm">{visitTypeName(v.type)}</Td>
                        <Td><DateText iso={v.actualEnd ?? v.plannedStart} /></Td>
                        <Td className="text-sm">{userName(v.ownerId)}</Td>
                        <Td><StatePill s={VISIT_STATES[v.status]} /></Td>
                      </tr>
                    ))}
                  </Table>
                </section>
              ))}
            </div>
          ) : <Empty title="لا زيارات قابلة للفوترة دون مطالبة" />)}
        </div>
      </div>
    </div>
  );
};
