import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { COST_STATES } from '../../domain/labels';
import { exceptionScope } from '../../domain/selectors';
import { COST_KINDS, CostDrawer, committed, exceptionCap } from '../../components/finance/CostViews';
import { CommandButton, Empty, Money, Notice, Progress, StatePill, Table, Td, cn } from '../../components/ui';
import type { TabProps } from './ProjectPage';

/** 11-B7 — project cost requests: PM (or licensing officer for fees) → Director → finance → service receipt. */
function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'waiting' }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('mt-0.5 text-lg font-semibold', tone === 'waiting' ? 'text-st-waiting' : 'text-ink')}>{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

export const CostsTab: React.FC<TabProps> = ({ project }) => {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const [params, setParams] = useSearchParams();
  const costs = state.costs.filter((c) => c.projectId === project.id);
  const contractValue = project.contracts.reduce((s, k) => s + (state.quotations.find((q) => q.id === k.quotationId)?.lines.reduce((a, l) => a + l.amount, 0) ?? 0), 0);
  const approved = costs.filter(committed).reduce((s, c) => s + c.amount, 0);
  const paid = costs.reduce((s, c) => s + c.paid, 0);
  const planned = costs.filter((c) => committed(c) && c.plannedEstimate).reduce((s, c) => s + (c.amount - (c.plannedEstimate ?? 0)), 0);
  const cap = exceptionCap(state, project);
  const scope = exceptionScope(state, project);
  const isPm = project.pmId === me.id;
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id);
    else next.delete('c');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg bg-page px-5 py-4 md:grid-cols-4">
        <Stat label="قيمة العقود" value={<Money v={contractValue} />} />
        <Stat label="التكاليف المعتمدة" value={<Money v={approved} />} hint={planned ? `تجاوز التقدير ${planned.toLocaleString('en')} ر.س` : undefined} tone={planned > 0 ? 'waiting' : undefined} />
        <Stat label="المصروف فعليًا" value={<Money v={paid} />} />
        <Stat label="الهامش التقديري" value={<Money v={contractValue - approved} />} hint={contractValue ? `${Math.round(((contractValue - approved) / contractValue) * 100)}%` : undefined} />
      </dl>

      {cap && (
        <Notice tone={cap.used >= cap.exc.costCap ? 'danger' : 'waiting'} title={`المشروع يعمل باستثناء الرئيس التنفيذي — سقف التكلفة ${cap.exc.costCap.toLocaleString('en')} ر.س`}>
          <div className="my-1 max-w-sm"><Progress value={(cap.used / cap.exc.costCap) * 100} tone="waiting" /></div>
          المستخدم {cap.used.toLocaleString('en')} ر.س — لا يُقبل طلب يتجاوز السقف قبل تمديد معتمد.
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{costs.length ? `${costs.length} طلب تكلفة` : ''}</p>
        {isPm && ['preparing', 'in_progress', 'suspended', 'technically_complete'].includes(project.status) && (
          <CommandButton command="cost.create" base={{ projectId: project.id }} label="طلب تكلفة" icon={<Plus size={14} />} title="طلب تكلفة مشروع"
            fields={[
              { name: 'service', label: 'الخدمة', type: 'text', required: true, placeholder: 'فحص تربة / تصميم خارجي / مهندس مستقل…' },
              { name: 'scopeItemId', label: 'البند المرتبط', type: 'select', options: [{ value: '', label: '— بلا بند —' }, ...project.scopeItems.map((i) => ({ value: i.id, label: i.title }))],
                hint: scope.active ? `المشروع باستثناء: التكلفة تُقبل على البنود المسموحة فقط قبل الاعتماد المالي — ${project.scopeItems.filter((i) => scope.allowedItemIds.includes(i.id)).map((i) => i.title).join('، ')}.` : undefined },
              { name: 'reason', label: 'السبب', type: 'textarea', required: true },
              { name: 'kind', label: 'النوع', type: 'select', options: [{ value: 'planned', label: 'مخططة (ضمن التقدير)' }, { value: 'unplanned', label: 'غير مخططة' }, { value: 'over_estimate', label: 'تجاوز تقدير' }] },
              { name: 'justification', label: 'المبرر (إلزامي لغير المخطط وتجاوز التقدير)', type: 'textarea' },
              { name: 'amount', label: 'المبلغ', type: 'number', required: true },
              { name: 'plannedEstimate', label: 'التقدير الأصلي في العرض (إن وجد)', type: 'number' },
              { name: 'vendor', label: 'الجهة المنفذة / المورد', type: 'text', required: true },
              { name: 'quoteRef', label: 'مرجع عرض السعر أو الفاتورة', type: 'text', required: true },
              { name: 'paymentTerms', label: 'شروط الدفع', type: 'text', placeholder: 'مقدم 50% والباقي عند التسليم' },
              { name: 'bearer', label: 'من يتحمل التكلفة', type: 'select', options: [{ value: 'abak', label: 'أباك' }, { value: 'client', label: 'العميل' }] },
              { name: 'payer', label: 'من يدفع', type: 'select', options: [{ value: 'abak', label: 'أباك' }, { value: 'client', label: 'العميل' }] },
            ]}
            transform={(v) => ({ ...v, scopeItemId: v.scopeItemId || undefined, justification: (v.justification as string) || undefined, plannedEstimate: Number(v.plannedEstimate) || undefined })}
            success="رُفع طلب التكلفة لمدير الأقسام" />
        )}
      </div>

      {!costs.length ? <Empty title="لا طلبات تكلفة" hint="يرفعها مدير المشروع، ويعتمدها مدير الأقسام، وتصرفها المالية." /> : (
        <div className="overflow-hidden rounded-lg border border-line">
          <Table head={['الطلب', 'المبلغ', 'الجهة المنفذة', 'الحالة', 'المدفوع / المتبقي', 'الطالب']}>
            {costs.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-page" onClick={() => open(c.id)}>
                <Td>
                  <p className="text-sm font-medium text-ink">{c.service}</p>
                  <p className="text-xs text-muted">{COST_KINDS[c.kind]} · <span className="ltr-iso">{c.id}</span>{c.govTransactionId && <> · رسوم <span className="ltr-iso">{c.govTransactionId}</span></>}</p>
                </Td>
                <Td><Money v={c.amount} className="font-medium text-ink" />{c.plannedEstimate ? <p className="text-xs text-muted">تقدير {c.plannedEstimate.toLocaleString('en')}</p> : null}</Td>
                <Td className="text-sm">{c.vendor}</Td>
                <Td><StatePill s={COST_STATES[c.status]} /></Td>
                <Td className="whitespace-nowrap"><Money v={c.paid} /> <span className="text-muted">/</span> <Money v={c.amount - c.paid} className="text-muted" /></Td>
                <Td className="text-sm">{userName(c.requestedBy)}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <CostDrawer project={project} id={params.get('c')} onClose={() => open(null)} />
    </div>
  );
};
