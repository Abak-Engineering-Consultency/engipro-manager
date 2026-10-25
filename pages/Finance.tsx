import React from 'react';
import { AlertTriangle, Clock, Coins, Receipt } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLookup, useStore } from '../app/store';
import { dateKey, fmtDate } from '../domain/calendar';
import { visitTypeName } from '../domain/catalog';
import { ACTIVATION_STATES, COST_STATES, PAYMENT_CONDITIONS, PROJECT_STATES, VISIT_STATES } from '../domain/labels';
import { allows } from '../domain/permissions';
import type { PaymentItem, Visit } from '../domain/types';
import { ThreeDims, paymentTotals } from '../components/finance/PaymentViews';
import { CommandButton, DateText, Empty, Kpi, Money, PageHeader, Pill, StatePill, Table, Td, Tabs } from '../components/ui';

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
      <Link className="text-sm font-medium text-ink hover:text-brand-700 hover:underline" to={payLink(p)}>{p.label}</Link>
      <p className="max-w-[280px] truncate text-xs text-muted">{project(p.projectId)?.title} · <span className="ltr-iso">{p.id}</span></p>
    </Td>
  );
  /** A record named first; its number recedes under it. */
  const named = (title: React.ReactNode, id: string, to?: string) => (
    <Td>
      {to ? <Link className="text-sm font-medium text-ink hover:text-brand-700 hover:underline" to={to}>{title}</Link> : <p className="text-sm font-medium text-ink">{title}</p>}
      <p className="ltr-iso text-xs text-muted">{id}</p>
    </Td>
  );
  const waiting = tabs.reduce((n, x) => n + x.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="المالية" subtitle={<>بانتظار المالية: <span className="font-semibold text-ink">{waiting}</span> بندًا</>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="متأخرة بعد المهلة" value={<Money v={t.overdue} />} icon={<AlertTriangle size={20} />} tone={t.overdue ? 'danger' : undefined} hint={`${overdue.length} دفعة`} />
        <Kpi label="مستحقة ضمن المهلة" value={<Money v={t.due} />} icon={<Clock size={20} />} tone={t.due ? 'waiting' : undefined} />
        <Kpi label="المحصل هذا الشهر" value={<Money v={collectedMonth} />} icon={<Coins size={20} />} />
        <Kpi label="تكاليف معتمدة غير مصروفة" value={<Money v={unpaidCosts} />} icon={<Receipt size={20} />} hint={`${costs.length} طلب`} />
      </div>

      <div className="rounded-xl border border-line bg-card shadow-card">
        <div className="px-5"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
        <div className="p-5">
          {tab === 'activations' && (activations.length ? (
            <Table head={['الفرصة', 'العرض', 'طلبه', 'الحالة', '']}>
              {activations.map((a) => (
                <tr key={a.id}>
                  {named(state.opportunities.find((o) => o.id === a.opportunityId)?.title, a.id)}
                  <Td><span className="ltr-iso text-xs text-muted">{a.quotationId}</span></Td>
                  <Td className="text-sm">{userName(a.requestedBy)} · <DateText iso={a.requestedAt} /></Td>
                  <Td><StatePill s={ACTIVATION_STATES[a.status]} /></Td>
                  <Td><Link className="text-sm font-medium text-brand-700 hover:underline" to="/intake">اتخاذ القرار</Link></Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا طلبات تفعيل بانتظار المالية" />)}

          {tab === 'mapping' && (mapping.length ? (
            <Table head={['المشروع', 'أُرسل', 'مدير المشروع', '']}>
              {mapping.map((p) => (
                <tr key={p.id}>
                  {named(p.title, p.id, `/projects/${p.id}?tab=payments`)}
                  <Td><DateText iso={p.paymentMapping.submittedAt} /></Td>
                  <Td className="text-sm">{userName(p.pmId)}</Td>
                  <Td><Link className="text-sm font-medium text-brand-700 hover:underline" to={`/projects/${p.id}?tab=payments`}>مراجعة الربط</Link></Td>
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
                  <Td><Money v={p.amount} className="font-medium text-ink" /></Td>
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
                  <Td><Money v={p.amount} className="font-medium text-ink" /></Td>
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
          ) : <Empty title="لا تحويلات بانتظار المطابقة" />)}

          {tab === 'overdue' && (overdue.length ? (
            <Table head={['الدفعة', 'الحالة', 'متأخرة منذ', 'المتبقي', 'التصعيد', 'آخر متابعة']}>
              {overdue.map((p) => (
                <tr key={p.id}>
                  {payCell(p)}
                  <Td><ThreeDims pay={p} /></Td>
                  <Td className="text-st-danger"><DateText iso={p.overdueAt} /></Td>
                  <Td><Money v={p.amount - p.collected} /></Td>
                  <Td>{p.escalatedAt ? <Pill tone="danger">{p.escalation === 'early' ? 'مبكر' : 'آلي'} — {fmtDate(p.escalatedAt)}</Pill> : <span className="text-xs text-muted">بعد {state.settings.collectionEscalationDays} يومًا</span>}</Td>
                  <Td className="text-xs">{p.followUps.at(-1) ? <>{p.followUps.at(-1)!.response}<span className="block text-muted">{fmtDate(p.followUps.at(-1)!.at)}</span></> : '—'}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا متأخرات" />)}

          {tab === 'costs' && (costs.length ? (
            <Table head={['الطلب', 'المشروع', 'الجهة', 'الحالة', 'المتبقي', '']}>
              {costs.map((c) => (
                <tr key={c.id}>
                  {named(c.service, c.id, `/projects/${c.projectId}?tab=costs&c=${c.id}`)}
                  <Td className="max-w-[220px] truncate text-sm text-ink-2">{project(c.projectId)?.title}</Td>
                  <Td className="text-sm">{c.vendor}</Td>
                  <Td><StatePill s={COST_STATES[c.status]} /></Td>
                  <Td><Money v={c.amount - c.paid} /></Td>
                  <Td>{allows(me, 'cost_request.pay') && <CommandButton command="cost.pay" base={{ costId: c.id }} label="صرف" fields={[{ name: 'amount', label: 'المبلغ', type: 'number', initial: c.amount - c.paid }, { name: 'proof', label: 'إثبات الصرف', type: 'text', required: true }]} success="سُجّل الصرف" />}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا تكاليف معتمدة بانتظار الصرف" />)}

          {tab === 'settlement' && (
            <div className="space-y-8">
              <section>
                <h3 className="mb-3 text-sm font-semibold text-ink">قرار المالية في الإغلاق أو الإلغاء</h3>
                {chains.length ? (
                  <Table head={['المشروع', 'الطلب', 'السبب', 'المستحقات المفتوحة', '']}>
                    {chains.map(({ p, c }) => {
                      const open = paymentTotals(state.payments.filter((x) => x.projectId === p.id && x.entitlement !== 'not_due'));
                      const mine = c.steps.find((s) => s.status === 'pending')?.approverIds.includes(me.id);
                      return (
                        <tr key={`${p.id}-${c.kind}`}>
                          {named(p.title, p.id, `/projects/${p.id}?tab=closure`)}
                          <Td className="text-sm">{c.kind === 'closure' ? 'إغلاق' : 'إلغاء'}</Td>
                          <Td className="text-xs">{c.reason}</Td>
                          <Td><Money v={open.remaining} className="font-medium text-ink" /></Td>
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
                <h3 className="mb-3 text-sm font-semibold text-ink">الإغلاق المالي</h3>
                {toSettle.length ? (
                  <Table head={['المشروع', 'الحالة', 'غير محصل', '']}>
                    {toSettle.map((p) => {
                      const open = paymentTotals(state.payments.filter((x) => x.projectId === p.id && x.entitlement !== 'not_due'));
                      return (
                        <tr key={p.id}>
                          {named(p.title, p.id, `/projects/${p.id}?tab=payments`)}
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
                  {named(p.title, p.id, `/projects/${p.id}`)}
                  <Td className="text-sm">{p.preSystem!.currentPhase}</Td>
                  <Td className="text-xs">{p.preSystem!.remainingWork}</Td>
                  <Td className="text-xs">{p.preSystem!.documents}</Td>
                  <Td>{allows(me, 'payment.verify_entitlement') && <CommandButton command="project.finance_review_existing" base={{ projectId: p.id }} label="مراجعة الأرصدة السابقة" intro="دون إعادة إصدار فواتير سابقة؛ بعدها يدخل المشروع التجهيز." fields={[{ name: 'note', label: 'نتيجة المراجعة', type: 'textarea', required: true }]} success="روجعت الأرصدة" />}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="لا مشاريع قائمة بانتظار مراجعة الأرصدة" />)}

          {tab === 'visits' && (visitGroups.length ? (
            <div className="space-y-8">
              {visitGroups.map(({ pid, visits }) => (
                <section key={pid || 'none'}>
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-ink">{pid ? project(pid)?.title : 'زيارات غير مرتبطة بمشروع'}</span>
                      {pid && <span className="ltr-iso text-xs text-muted">{pid}</span>}
                    </span>
                    {canAct && (
                      <CommandButton command="visit.claim" base={{}} label="مطالبة يدوية" title="مطالبة يدوية بزيارات قابلة للفوترة"
                        fields={[
                          { name: 'visitIds', label: 'الزيارات', type: 'multiselect', options: visits.map((v) => ({ value: v.id, label: `${v.id} — ${v.purpose}` })), initial: visits.map((v) => v.id) },
                          { name: 'amount', label: 'مبلغ المطالبة', type: 'number', required: true },
                          { name: 'ref', label: 'مرجع المطالبة', type: 'text', required: true },
                        ]} success="صدرت المطالبة — مهمة تحصيل لمسؤول الفرصة" />
                    )}
                  </header>
                  <div className="overflow-hidden rounded-lg border border-line">
                  <Table head={['الزيارة', 'النوع', 'التاريخ الفعلي', 'المسؤول', 'الحالة']}>
                    {visits.map((v) => (
                      <tr key={v.id}>
                        {named(v.purpose, v.id, `/visits?id=${v.id}`)}
                        <Td className="text-sm">{visitTypeName(v.type)}</Td>
                        <Td><DateText iso={v.actualEnd ?? v.plannedStart} /></Td>
                        <Td className="text-sm">{userName(v.ownerId)}</Td>
                        <Td><StatePill s={VISIT_STATES[v.status]} /></Td>
                      </tr>
                    ))}
                  </Table>
                  </div>
                </section>
              ))}
            </div>
          ) : <Empty title="لا زيارات قابلة للفوترة دون مطالبة" />)}
        </div>
      </div>
    </div>
  );
};
