import { Children } from 'react';
import { Link } from 'react-router-dom';
import { useLookup, useStore } from '../../app/store';
import { fmtDate } from '../../domain/calendar';
import { COST_STATES } from '../../domain/labels';
import { allows } from '../../domain/permissions';
import { mayApprove } from '../../domain/selectors';
import type { AppState, CostRequest, Project } from '../../domain/types';
import { CommandButton, DateText, Drawer, Fact, Money, Notice, Pill, StatePill, Table, Td, Timeline } from '../ui';

export const COST_KINDS: Record<CostRequest['kind'], string> = { planned: 'مخططة', unplanned: 'غير مخططة', over_estimate: 'تجاوز تقدير' };
const DECISIONS = { approved: 'اعتمد', returned: 'أعاد للاستكمال', rejected: 'رفض', resubmitted: 'أعاد التقديم' } as const;

/** Committed cost: approved, partly or fully paid, or received. */
export const committed = (c: CostRequest) => ['approved', 'partially_paid', 'paid', 'service_received'].includes(c.status);

export function exceptionCap(s: AppState, p: Project) {
  const exc = p.exceptionId ? s.exceptions.find((e) => e.id === p.exceptionId) : undefined;
  if (!exc || exc.status === 'linked') return undefined;
  const used = s.costs.filter((c) => c.projectId === p.id && committed(c)).reduce((a, c) => a + c.amount, 0);
  return { exc, used };
}

export function CostDrawer({ project, id, onClose }: { project: Project; id?: string | null; onClose: () => void }) {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const c = state.costs.find((x) => x.id === id && x.projectId === project.id);
  if (!c) return null;
  const item = project.scopeItems.find((i) => i.id === c.scopeItemId);
  const gov = c.govTransactionId ? state.gov.find((g) => g.id === c.govTransactionId) : undefined;
  const remaining = c.amount - c.paid;
  const base = { costId: c.id };
  const cap = exceptionCap(state, project);

  const actions = (
    <>
      {c.status === 'submitted' && mayApprove(state, me, 'cost_request.approve', [c.requestedBy]) && (
        <CommandButton command="cost.decide" base={base} label="قرار مدير الأقسام"
          intro={<>{c.kind !== 'planned' && !c.justification ? 'تكلفة غير مخططة دون مبرر: لا تُعتمد — أعدها للاستكمال. ' : ''}{cap ? `المشروع باستثناء: المستخدم ${cap.used.toLocaleString('en')} من سقف ${cap.exc.costCap.toLocaleString('en')} ر.س.` : ''}</>}
          fields={[
            { name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'approved', label: 'اعتماد' }, { value: 'returned', label: 'إعادة للاستكمال' }, { value: 'rejected', label: 'رفض بسبب موثق' }] },
            { name: 'note', label: 'ملاحظة / السبب', type: 'textarea' },
          ]} success="سُجّل القرار" />
      )}
      {c.requestedBy === me.id && c.status === 'returned' && (
        <CommandButton command="cost.resubmit" base={base} label="استكمال وإعادة التقديم"
          fields={[{ name: 'justification', label: 'المبرر', type: 'textarea', required: true, initial: c.justification ?? '' }, { name: 'note', label: 'ملاحظة', type: 'text' }]} success="أعيد التقديم" />
      )}
      {allows(me, 'cost_request.pay') && ['approved', 'partially_paid', 'service_received'].includes(c.status) && remaining > 0 && (
        <CommandButton command="cost.pay" base={base} label="صرف وتسجيل المدفوع"
          fields={[{ name: 'amount', label: 'المبلغ', type: 'number', initial: remaining }, { name: 'proof', label: 'إثبات الصرف', type: 'text', required: true }]} success="سُجّل الصرف" />
      )}
      {project.pmId === me.id && ['approved', 'partially_paid', 'paid'].includes(c.status) && (
        <CommandButton command="cost.receive_service" base={base} variant="secondary" label="تسجيل استلام الخدمة"
          intro="سجّل ما استُلم فعليًا؛ الاستلام منفصل عن الصرف."
          fields={[{ name: 'note', label: 'ما استُلم', type: 'textarea', required: true }]} success="سُجّل الاستلام" />
      )}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div>
          <h2 className="text-lg font-semibold text-ink">{c.service}</h2>
          <p className="text-xs text-muted"><span className="ltr-iso">{c.id}</span> · طلبه {userName(c.requestedBy)} · {fmtDate(c.requestedAt)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatePill s={COST_STATES[c.status]} />
            <Pill tone={c.kind === 'planned' ? 'muted' : 'waiting'}>{COST_KINDS[c.kind]}</Pill>
          </div>
        </div>
      }
      actions={Children.toArray(actions.props.children).length ? actions : undefined}
    >
      <div className="space-y-5">
        {c.status === 'service_received' && remaining > 0 && <Notice tone="waiting">استُلمت الخدمة، والمتبقي للصرف <Money v={remaining} />.</Notice>}
        {['approved', 'partially_paid', 'paid'].includes(c.status) && <Notice tone="progress">بانتظار تسجيل استلام الخدمة من مدير المشروع.</Notice>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="المبلغ"><Money v={c.amount} /></Fact>
          <Fact label="التقدير الأصلي">{c.plannedEstimate ? <><Money v={c.plannedEstimate} /> <span className={c.amount > c.plannedEstimate ? 'text-xs font-normal text-st-danger' : 'text-xs font-normal text-muted'}>(انحراف {(c.amount - c.plannedEstimate).toLocaleString('en')})</span></> : '—'}</Fact>
          <Fact label="المدفوع / المتبقي"><Money v={c.paid} /> / <Money v={remaining} /></Fact>
          <Fact label="البند / الخدمة">{item?.title ?? '—'}</Fact>
          <Fact label="الجهة المنفذة">{c.vendor}</Fact>
          <Fact label="عرض السعر / الفاتورة"><span className="ltr-iso">{c.quoteRef}</span></Fact>
          <Fact label="شروط الدفع">{c.paymentTerms}</Fact>
          <Fact label="من يتحمل / من يدفع">{c.bearer === 'abak' ? 'أباك' : 'العميل'} / {c.payer === 'abak' ? 'أباك' : 'العميل'}</Fact>
          <Fact label="السبب">{c.reason}</Fact>
          <Fact label="المبرر">{c.justification ?? '—'}</Fact>
          {gov && <Fact label="رسوم معاملة"><Link className="text-brand-700 hover:underline" to={`/gov?id=${gov.id}`}>{gov.authority} <span className="ltr-iso text-xs">{gov.id}</span></Link></Fact>}
          {c.serviceReceivedAt && <Fact label="استلام الخدمة"><DateText iso={c.serviceReceivedAt} /></Fact>}
        </dl>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">القرارات</h3>
          <Timeline items={c.decisions.slice().reverse().map((d) => ({ at: d.at, by: userName(d.by), title: DECISIONS[d.decision], note: d.note }))} />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">الصرف</h3>
          {!c.payments.length ? <p className="text-sm text-muted">لم يُصرف شيء.</p> : (
            <Table head={['المبلغ', 'الإثبات', 'التاريخ', 'سجّله']}>
              {c.payments.map((p, i) => <tr key={i}><Td><Money v={p.amount} /></Td><Td><span className="ltr-iso">{p.proof}</span></Td><Td><DateText iso={p.at} /></Td><Td>{userName(p.by)}</Td></tr>)}
            </Table>
          )}
        </section>
      </div>
    </Drawer>
  );
}
