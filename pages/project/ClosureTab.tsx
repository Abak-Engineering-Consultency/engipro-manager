import React from 'react';
import { CheckCircle2, Circle, CircleDot, ClipboardCheck, Coins, RotateCcw, Workflow } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { COLLECTION, DELIVERABLE_STATES, ENTITLEMENT, PROJECT_STATES } from '../../domain/labels';
import { allows } from '../../domain/permissions';
import type { ApprovalChain, Project } from '../../domain/types';
import { Card, cn, CommandButton, DateText, Money, Notice, Pill, StatePill, Table, Td } from '../../components/ui';
import { STEP_NAMES } from '../../components/projects/shared';
import type { TabProps } from './ProjectPage';

export const ClosureTab: React.FC<TabProps> = ({ project: p }) => {
  const { state, me } = useStore();
  const isPm = p.pmId === me.id;
  const canRequest = allows(me, 'project.request_change', { own: isPm });
  const ds = state.deliverables.filter((d) => d.projectId === p.id);
  const done = ds.filter((d) => d.status === 'client_approved').length;
  const excluded = ds.filter((d) => d.status === 'excluded').length;
  const open = ds.filter((d) => !['client_approved', 'excluded'].includes(d.status));
  const payments = state.payments.filter((x) => x.projectId === p.id);
  const receivable = payments.filter((x) => x.entitlement !== 'not_due' && x.collection !== 'fully_collected');
  const notDue = payments.filter((x) => x.entitlement === 'not_due');
  const unpaidCosts = state.costs.filter((c) => c.projectId === p.id && ['approved', 'partially_paid', 'service_received'].includes(c.status) && c.paid < c.amount);
  const finance = allows(me, 'project.review_settlement');

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="الاكتمال الفني" icon={<ClipboardCheck size={18} />} actions={<StatePill s={PROJECT_STATES[p.status]} />}>
          <dl className="grid grid-cols-3 gap-4">
            {[['معتمد', done], ['مستبعد', excluded], ['مفتوح', open.length]].map(([l, v], i) => (
              <div key={l as string}>
                <dt className="text-xs text-muted">{l}</dt>
                <dd className="text-xl font-bold tabular text-ink">{v}{i === 0 && <span className="text-sm font-normal text-muted"> من {ds.length}</span>}</dd>
              </div>
            ))}
          </dl>
          {p.technicallyCompleteAt && <p className="mt-3 text-xs text-muted">اكتمل فنيًا في <DateText iso={p.technicallyCompleteAt} /></p>}
          {open.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {open.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{d.title}</span>
                  <StatePill s={DELIVERABLE_STATES[d.status]} />
                </li>
              ))}
            </ul>
          )}
          {p.status === 'in_progress' && open.length > 0 && <p className="mt-3 text-xs text-muted">يكتمل فنيًا تلقائيًا عند اعتماد آخر مخرج أو استبعاده.</p>}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4 empty:hidden">
            {canRequest && p.status === 'technically_complete' && (
              <CommandButton command="closure.request" base={{ projectId: p.id }} label="طلب الإغلاق" success="رُفع طلب الإغلاق — مديرو الأقسام بالتوازي"
                fields={[{ name: 'reason', label: 'ملخص الإغلاق', type: 'textarea', required: true, initial: 'سُلمت كل المخرجات واعتُمدت' }]} />
            )}
            {canRequest && ['preparing', 'in_progress', 'suspended'].includes(p.status) && (
              <CommandButton command="cancellation.request" base={{ projectId: p.id }} label="طلب إلغاء المشروع" variant="danger" success="رُفع طلب الإلغاء لمدير الأقسام"
                intro="الإلغاء لا يُسقط الحقوق المالية: المستحقات ومهام التحصيل تبقى مفتوحة."
                fields={[{ name: 'reason', label: 'أسباب الإلغاء', type: 'textarea', required: true }]} />
            )}
          </div>
        </Card>

        <Card title="الإغلاق المالي" icon={<Coins size={18} />} subtitle="مستقل عن الإغلاق التشغيلي"
          actions={finance && ['operationally_closed', 'cancelled'].includes(p.status) && p.financialState === 'open' && (
            <CommandButton command="project.settle" base={{ projectId: p.id }} label="الإغلاق المالي" success="سُوّي المشروع ماليًا"
              fields={[{ name: 'note', label: 'ملخص التسوية', type: 'textarea', required: true }]} />
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <div><dt className="text-xs text-muted">مستحق غير محصل</dt><dd className="text-lg font-bold tabular text-ink"><Money v={receivable.reduce((s, x) => s + x.amount - x.collected, 0)} /></dd></div>
              <div><dt className="text-xs text-muted">لم تستحق بعد</dt><dd className="text-lg font-bold tabular text-ink"><Money v={notDue.reduce((s, x) => s + x.amount, 0)} /></dd></div>
            </dl>
            <Pill tone={p.financialState === 'settled' ? 'success' : 'waiting'}>{p.financialState === 'settled' ? 'مسوّى ماليًا' : 'مفتوح ماليًا'}</Pill>
          </div>
          {receivable.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-line">
              <Table head={['الدفعة', 'الاستحقاق', 'التحصيل', 'المتبقي']}>
                {receivable.map((x) => (
                  <tr key={x.id}>
                    <Td>{x.label}</Td>
                    <Td><StatePill s={ENTITLEMENT[x.entitlement]} /></Td>
                    <Td><StatePill s={COLLECTION[x.collection]} /></Td>
                    <Td><Money v={x.amount - x.collected} /></Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
          {unpaidCosts.length > 0 && (
            <p className="mt-3 text-xs text-st-waiting">تكاليف معتمدة غير مصروفة بالكامل: {unpaidCosts.map((c) => `${c.service} (${(c.amount - c.paid).toLocaleString('en')} ر.س)`).join('، ')}</p>
          )}
          {['closure_review', 'operationally_closed', 'cancellation_review', 'cancelled'].includes(p.status) && receivable.length > 0 && (
            <div className="mt-4"><Notice tone="progress" title="التحصيل مستمر">المالية تسجل التحصيل بعد الإغلاق، ومسؤول الفرصة يواصل المتابعة.</Notice></div>
          )}
        </Card>
      </div>

      {p.closure && <ChainCard p={p} chain={p.closure} />}
      {p.cancellation && <ChainCard p={p} chain={p.cancellation} />}
      {!p.closure && !p.cancellation && (
        <Card title="مراحل الاعتماد" icon={<Workflow size={18} />}>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-muted">الإغلاق</dt><dd className="mt-0.5 text-ink">مديرو الأقسام (بالتوازي) ← مدير الأقسام ← المالية ← الرئيس التنفيذي</dd></div>
            <div><dt className="text-xs text-muted">الإلغاء</dt><dd className="mt-0.5 text-ink">مدير الأقسام ← المالية ← الرئيس التنفيذي</dd></div>
          </dl>
        </Card>
      )}
    </div>
  );
};

function ChainCard({ p, chain }: { p: Project; chain: ApprovalChain }) {
  const { me } = useStore();
  const { userName } = useLookup();
  const step = chain.steps.find((s) => s.status === 'pending');
  const myTurn = chain.status === 'pending' && !!step && step.approverIds.includes(me.id) && !step.decisions.some((d) => d.userId === me.id);
  const title = chain.kind === 'closure' ? 'سلسلة اعتماد الإغلاق' : 'سلسلة اعتماد الإلغاء';
  const st = chain.status === 'approved' ? { label: chain.kind === 'closure' ? 'اعتُمد — مغلق تشغيليًا' : 'اعتُمد — ملغى', tone: 'success' as const }
    : chain.status === 'returned' ? { label: 'أُعيد', tone: 'waiting' as const } : { label: 'قيد الاعتماد', tone: 'progress' as const };
  return (
    <Card
      icon={<Workflow size={18} />}
      title={<span className="flex flex-wrap items-center gap-2">{title} <Pill tone={st.tone}>{st.label}</Pill></span>}
      subtitle={<>طلبه {userName(chain.requestedBy)} · <DateText iso={chain.requestedAt} /> · {chain.reason}</>}
      actions={myTurn && (
        <>
          <CommandButton command="chain.decide" base={{ projectId: p.id, kind: chain.kind, decision: 'approved' }} label="اعتماد" success="سُجّل اعتمادك"
            fields={[{ name: 'note', label: 'ملاحظة (اختيارية)', type: 'textarea' }]} />
          <CommandButton command="chain.decide" base={{ projectId: p.id, kind: chain.kind, decision: 'returned' }} label="إعادة" variant="secondary" icon={<RotateCcw size={14} />} success="أُعيد الطلب"
            fields={[{ name: 'note', label: 'سبب الإعادة', type: 'textarea', required: true }]} />
        </>
      )}
    >
      <ol className="space-y-0">
        {chain.steps.map((s, i) => {
          const icon = s.status === 'approved' ? <CheckCircle2 size={18} className="text-st-success" />
            : s.status === 'pending' ? <CircleDot size={18} className="text-brand-600" />
              : s.status === 'returned' ? <RotateCcw size={18} className="text-st-waiting" /> : <Circle size={18} className="text-faint" />;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < chain.steps.length - 1 && <span className={cn('absolute start-[8px] top-6 bottom-0 w-px', s.status === 'approved' ? 'bg-st-success/40' : 'bg-line')} />}
              <span className="relative z-10 mt-0.5 bg-card">{icon}</span>
              <div className="min-w-0 grow">
                <p className={cn('text-sm', s.status === 'pending' ? 'font-semibold text-ink' : s.status === 'waiting' ? 'text-muted' : 'font-medium text-ink')}>{STEP_NAMES[s.key]}</p>
                <ul className="mt-1 space-y-1">
                  {s.approverIds.map((id) => {
                    const d = s.decisions.find((x) => x.userId === id);
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-ink-2">{userName(id)}</span>
                        {d ? (
                          <>
                            <Pill tone={d.decision === 'approved' ? 'success' : 'waiting'}>{d.decision === 'approved' ? 'اعتمد' : 'أعاد'}</Pill>
                            <span className="text-muted"><DateText iso={d.at} time /></span>
                            {d.note && <span className="text-ink-2">— {d.note}</span>}
                          </>
                        ) : <span className="text-muted">{s.status === 'pending' ? 'بانتظار القرار' : s.status === 'waiting' ? 'بعد المرحلة السابقة' : '—'}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
