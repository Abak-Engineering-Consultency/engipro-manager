import { Children, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLookup, useStore } from '../../app/store';
import { fmtDate } from '../../domain/calendar';
import { revLabel } from '../../domain/engine/delivery';
import { COLLECTION, ENTITLEMENT, INVOICING, PAYMENT_CONDITIONS, TIME_BASED } from '../../domain/labels';
import { allows } from '../../domain/permissions';
import { oppOwner } from '../../domain/selectors';
import type { AppState, PaymentItem, Project } from '../../domain/types';
import { Button, CommandButton, DateText, Drawer, Fact, Modal, Money, Notice, Pill, Select, StatePill, Table, Td, Timeline, cn } from '../ui';

const KIND_LABELS: Record<PaymentItem['link']['kind'], string> = { deliverables: 'مخرجات', items: 'بنود', phase: 'مرحلة', none: 'بلا ربط (زمنية)' };

/** What a payment is tied to, by name. */
export function linkSummary(s: AppState, p: Project, pay: PaymentItem): string {
  if (pay.visitIds?.length) return `زيارات: ${pay.visitIds.join('، ')}`;
  if (pay.link.kind === 'none') return TIME_BASED.includes(pay.condition) ? 'شرط زمني — بلا ربط بمخرج' : 'لم يُربط بعد';
  const names = pay.link.kind === 'deliverables' ? s.deliverables.filter((d) => pay.link.ids.includes(d.id)).map((d) => d.title)
    : pay.link.kind === 'items' ? p.scopeItems.filter((i) => pay.link.ids.includes(i.id)).map((i) => i.title)
      : p.phases.filter((ph) => pay.link.ids.includes(ph.id)).map((ph) => ph.name);
  return `${KIND_LABELS[pay.link.kind]}: ${names.join('، ')}`;
}

/** A5: entitlement, invoicing and collection are separate — until it is fully collected, which settles all three. */
export function ThreeDims({ pay }: { pay: PaymentItem }) {
  if (pay.collection === 'fully_collected') return <StatePill s={COLLECTION.fully_collected} />;
  return (
    <span className="flex flex-wrap gap-1">
      <StatePill s={ENTITLEMENT[pay.entitlement]} />
      <StatePill s={INVOICING[pay.invoicing]} />
      <StatePill s={COLLECTION[pay.collection]} />
    </span>
  );
}

export const MAPPING_STATUS = {
  draft: { label: 'مسودة — لم يُرسل', tone: 'muted' as const },
  submitted: { label: 'بانتظار تحقق المالية', tone: 'waiting' as const },
  returned: { label: 'أعادته المالية', tone: 'danger' as const },
  confirmed: { label: 'أكدته المالية', tone: 'success' as const },
};

/** PJ-07 — the PM links each existing payment to its contract condition; amounts never change here. */
export function MappingEditor({ project, onClose }: { project: Project; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const pays = state.payments.filter((p) => p.projectId === project.id && !p.visitIds?.length);
  const [links, setLinks] = useState(() => Object.fromEntries(pays.map((p) => [p.id, { kind: p.link.kind, ids: p.link.ids }])));
  const [error, setError] = useState<string | null>(null);
  const deliverables = state.deliverables.filter((d) => d.projectId === project.id && d.status !== 'excluded');
  const options = (kind: PaymentItem['link']['kind']) =>
    kind === 'deliverables' ? deliverables.map((d) => ({ value: d.id, label: d.title }))
      : kind === 'items' ? project.scopeItems.map((i) => ({ value: i.id, label: i.title }))
        : kind === 'phase' ? project.phases.map((ph) => ({ value: ph.id, label: ph.name })) : [];
  const submit = () => {
    const r = dispatch('project.submit_payment_links', { projectId: project.id, links: pays.map((p) => ({ paymentId: p.id, kind: links[p.id].kind, ids: links[p.id].kind === 'none' ? [] : links[p.id].ids })) }, 'أُرسل ربط الدفعات للمالية');
    if (r.ok) onClose();
    else setError(r.error);
  };
  return (
    <Modal open wide onClose={onClose} title="ربط الدفعات بشروطها التعاقدية"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button onClick={submit}>إرسال للمالية للتحقق</Button></>}
    >
      <p className="text-sm text-muted">اربط كل دفعة بما يحقق شرطها. القيم لا تتغير، والدفعات الزمنية لا تُربط بمخرج.</p>
      <div className="mt-4 space-y-3">
        {pays.map((p) => {
          const l = links[p.id];
          const kinds: PaymentItem['link']['kind'][] = TIME_BASED.includes(p.condition) ? ['none', 'phase'] : ['deliverables', 'items', 'phase'];
          return (
            <div key={p.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink">{p.label}</p>
                  <p className="text-xs text-muted">{PAYMENT_CONDITIONS[p.condition]} · <Money v={p.amount} /></p>
                </div>
                <Select className="!w-auto" value={l.kind} onChange={(e) => setLinks((s) => ({ ...s, [p.id]: { kind: e.target.value as PaymentItem['link']['kind'], ids: [] } }))}>
                  {!kinds.includes(l.kind) && <option value={l.kind}>— اختر —</option>}
                  {kinds.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </Select>
              </div>
              {l.kind !== 'none' && (
                <div className="mt-3 grid max-h-40 gap-1.5 overflow-y-auto rounded-lg bg-page p-3 sm:grid-cols-2">
                  {options(l.kind).map((o) => (
                    <label key={o.value} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-brand-600" checked={l.ids.includes(o.value)}
                        onChange={(e) => setLinks((s) => ({ ...s, [p.id]: { ...l, ids: e.target.checked ? [...l.ids, o.value] : l.ids.filter((x) => x !== o.value) } }))} />
                      <span className="truncate">{o.label}</span>
                    </label>
                  ))}
                  {!options(l.kind).length && <p className="text-xs text-muted">لا خيارات — {l.kind === 'phase' ? 'أنشئ الخطة أولًا' : 'لا سجلات'}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-st-danger-bg px-4 py-3 text-sm text-st-danger">{error}</p>}
    </Modal>
  );
}

export function PaymentDrawer({ project, id, onClose }: { project: Project; id?: string | null; onClose: () => void }) {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const pay = state.payments.find((p) => p.id === id && p.projectId === project.id);
  if (!pay) return null;
  const isFinanceVerify = allows(me, 'payment.verify_entitlement');
  const isFinance = allows(me, 'collection.confirm');
  const isPm = project.pmId === me.id;
  const isOpp = oppOwner(state, project) === me.id;
  const task = state.tasks.find((t) => t.dedupeKey === `collection:${pay.id}`);
  const blocks = state.deliverables.filter((d) => pay.beforeDeliveryOf?.includes(d.id));
  const remaining = pay.amount - pay.collected;
  const openFollowUp = pay.invoicing === 'invoiced' && pay.collection !== 'fully_collected';
  const base = { paymentId: pay.id };

  const actions = (
    <>
      {isFinanceVerify && pay.evidenceCheck === 'pending' && pay.invoicing === 'not_invoiced' && (
        <CommandButton command="payment.verify_evidence" base={base} label="التحقق من إثبات الاستحقاق"
          intro="قبل الفاتورة: الاعتراض يعيد البند للمراجعة. بعد الفاتورة أو التحصيل تكون المعالجة محاسبية لا إعادة آلية."
          fields={[
            { name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'accepted', label: 'قبول الإثبات' }, { value: 'objected', label: 'اعتراض قبل الفاتورة' }] },
            { name: 'note', label: 'ملاحظة', type: 'textarea' },
          ]} success="سُجّل التحقق" />
      )}
      {isPm && pay.evidenceCheck === 'objected' && (
        <CommandButton command="payment.resubmit_evidence" base={base} label="توضيح الإثبات وإعادته" fields={[{ name: 'note', label: 'التوضيح', type: 'textarea', required: true }]} success="أُعيد الإثبات للمالية" />
      )}
      {isFinance && pay.entitlement !== 'not_due' && pay.invoicing === 'not_invoiced' && ['accepted', 'none'].includes(pay.evidenceCheck) && (
        <CommandButton command="payment.issue_claim" base={base} label="إصدار المطالبة / الفاتورة"
          intro="تُنشأ مهمة متابعة تحصيل واحدة لمسؤول الفرصة."
          fields={[{ name: 'invoiceRef', label: 'مرجع الفاتورة في النظام المحاسبي', type: 'text', required: true }]} success="صدرت المطالبة" />
      )}
      {isFinance && (pay.invoicing === 'invoiced' || pay.condition === 'advance') && pay.collection !== 'fully_collected' && (
        <CommandButton command="payment.record_collection" base={base} label="تسجيل تحصيل (المالية فقط)"
          intro={['operationally_closed', 'cancelled'].includes(project.status) ? 'المشروع مغلق أو ملغى — التحصيل مستمر والمستحقات لا تسقط.' : 'المالية وحدها تؤكد التحصيل بعد مطابقة التحويل والسند.'}
          fields={[{ name: 'amount', label: 'المبلغ', type: 'number', initial: remaining }, { name: 'ref', label: 'رقم السند', type: 'text', required: true }]} success="سُجّل التحصيل" />
      )}
      {isOpp && openFollowUp && (
        <>
          <CommandButton command="payment.log_follow_up" base={base} variant="secondary" label="تسجيل متابعة تحصيل" title="سجل التواصل مع العميل"
            fields={[
              { name: 'response', label: 'رد العميل', type: 'textarea', required: true },
              { name: 'promise', label: 'وعد السداد', type: 'text' },
              { name: 'expectedDate', label: 'التاريخ المتوقع', type: 'date' },
              { name: 'nextFollowUp', label: 'المتابعة التالية', type: 'date' },
            ]} success="سُجّلت المتابعة" />
          {!pay.transferClaim && (
            <CommandButton command="payment.claim_transfer" base={base} variant="secondary" label="العميل أفاد بالتحويل"
              intro="يُحال للمالية مع الإثبات — لا تُعد الدفعة محصلة بمجرد إثبات التحويل."
              fields={[{ name: 'proof', label: 'إثبات التحويل', type: 'text', required: true }]} success="أُحيل للمالية" />
          )}
          {!pay.escalatedAt && (
            <CommandButton command="payment.escalate" base={base} variant="danger" label="تصعيد مبكر لمدير المبيعات" fields={[{ name: 'note', label: 'السبب', type: 'textarea', required: true }]} success="صُعّدت" />
          )}
        </>
      )}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div>
          <h2 className="text-lg font-semibold text-ink">{pay.label}</h2>
          <p className="text-xs text-muted"><span className="ltr-iso">{pay.id}</span> · {PAYMENT_CONDITIONS[pay.condition]}</p>
          <div className="mt-2"><ThreeDims pay={pay} /></div>
        </div>
      }
      actions={Children.toArray(actions.props.children).length ? actions : undefined}
    >
      <div className="space-y-5">
        {pay.entitlement === 'overdue' && (
          <Notice tone="danger" title="متأخرة بعد انتهاء المهلة">
            منذ {fmtDate(pay.overdueAt)} · {pay.escalatedAt ? `صُعّدت لمدير المبيعات ${pay.escalation === 'early' ? '(تصعيد مبكر)' : '(آليًا)'} في ${fmtDate(pay.escalatedAt)}` : `التصعيد الآلي بعد ${state.settings.collectionEscalationDays} يومًا من التأخر`}
          </Notice>
        )}
        {pay.evidenceCheck === 'objected' && <Notice tone="danger" title="اعترضت المالية على الإثبات قبل الفاتورة">عاد البند للمراجعة — على مدير المشروع توضيح الإثبات.</Notice>}
        {pay.transferClaim && pay.collection !== 'fully_collected' && (
          <Notice tone="waiting" title="العميل أفاد بالتحويل — بانتظار مطابقة المالية">{pay.transferClaim.proof} · {userName(pay.transferClaim.by)} · {fmtDate(pay.transferClaim.at)}</Notice>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="المبلغ"><Money v={pay.amount} /></Fact>
          <Fact label="المحصل / المتبقي"><Money v={pay.collected} /> / <Money v={remaining} className={remaining > 0 && pay.entitlement !== 'not_due' ? 'text-st-waiting' : ''} /></Fact>
          <Fact label="الشرط التعاقدي">{PAYMENT_CONDITIONS[pay.condition]}{pay.scheduledDate && <> — <DateText iso={pay.scheduledDate} /></>}</Fact>
          <Fact label="الربط">{linkSummary(state, project, pay)}</Fact>
          <Fact label="تاريخ الاستحقاق"><DateText iso={pay.dueAt} /></Fact>
          <Fact label="المهلة حتى"><DateText iso={pay.graceUntil} /> <span className="text-xs font-normal text-muted">({pay.graceDays} يوم)</span></Fact>
          <Fact label="الفاتورة">{pay.invoiceRef ? <><span className="ltr-iso">{pay.invoiceRef}</span> · <DateText iso={pay.invoicedAt} /></> : '—'}</Fact>
          <Fact label="مهمة متابعة التحصيل">{task ? <Link className="text-brand-700 hover:underline" to={`/work?task=${task.id}`}>{task.id} — {userName(task.ownerId)} ({task.status === 'completed' ? 'مغلقة' : 'مفتوحة'})</Link> : '—'}</Fact>
        </dl>

        {blocks.length > 0 && (
          <section className="rounded-lg bg-page px-4 py-3 text-sm">
            <p className="mb-1 font-semibold text-ink">يشترط العقد سدادها قبل تسليم:</p>
            {blocks.map((d) => <Link key={d.id} className="me-2 text-brand-700 hover:underline" to={`/projects/${project.id}?tab=deliverables&d=${d.id}`}>{d.title}</Link>)}
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">إثبات الاستحقاق {pay.evidenceCheck === 'pending' ? <Pill tone="waiting">بانتظار تحقق المالية</Pill> : pay.evidenceCheck === 'accepted' ? <Pill tone="success">قبلته المالية</Pill> : pay.evidenceCheck === 'objected' ? <Pill tone="danger">اعتراض</Pill> : null}</h3>
          {!pay.evidence.length ? <p className="text-sm text-muted">لم يتحقق الشرط بعد.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {pay.evidence.map((e, i) => {
                const d = state.deliverables.find((x) => x.id === e.deliverableId);
                return (
                  <li key={i} className="px-3 py-2">
                    <span className="font-medium">{e.kind}</span>
                    {d && <> — <Link className="text-brand-700 hover:underline" to={`/projects/${project.id}?tab=deliverables&d=${d.id}`}>{d.title}</Link> <span className="ltr-iso text-xs">{revLabel(e.rev)}</span></>}
                    <span className="text-xs text-muted"> · <DateText iso={e.at} /> {e.note}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">سندات التحصيل</h3>
          {!pay.receipts.length ? <p className="text-sm text-muted">لا تحصيل بعد.</p> : (
            <Table head={['المبلغ', 'السند', 'التاريخ', 'سجلها']}>
              {pay.receipts.map((r, i) => (
                <tr key={i}><Td><Money v={r.amount} /></Td><Td><span className="ltr-iso">{r.ref}</span></Td><Td><DateText iso={r.at} /></Td><Td>{userName(r.by)}</Td></tr>
              ))}
            </Table>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">متابعة التحصيل</h3>
          <Timeline items={pay.followUps.slice().reverse().map((f) => ({
            at: f.at, by: userName(f.by), title: f.response,
            note: <>{f.promise && <>وعد: {f.promise} · </>}{f.expectedDate && <>متوقع {fmtDate(f.expectedDate)} · </>}{f.nextFollowUp && <>المتابعة التالية {fmtDate(f.nextFollowUp)}</>}</>,
          }))} />
        </section>
      </div>
    </Drawer>
  );
}

/** Totals over a list of payments: due, overdue and collected are separate figures. */
export function paymentTotals(pays: PaymentItem[]) {
  const open = (p: PaymentItem) => p.amount - p.collected;
  return {
    value: pays.reduce((s, p) => s + p.amount, 0),
    due: pays.filter((p) => p.entitlement === 'due' && p.collection !== 'fully_collected').reduce((s, p) => s + open(p), 0),
    overdue: pays.filter((p) => p.entitlement === 'overdue' && p.collection !== 'fully_collected').reduce((s, p) => s + open(p), 0),
    collected: pays.reduce((s, p) => s + p.collected, 0),
    remaining: pays.reduce((s, p) => s + open(p), 0),
  };
}

export const dueCls = (pay: PaymentItem) => cn(pay.entitlement === 'overdue' && pay.collection !== 'fully_collected' && 'text-st-danger font-medium');
