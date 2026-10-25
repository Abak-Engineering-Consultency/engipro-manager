import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Landmark, Lock } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { fmtDate, isAfter } from '../../domain/calendar';
import { deptName } from '../../domain/catalog';
import { deliverableOwners, revLabel } from '../../domain/engine/delivery';
import { DELIVERABLE_STATES } from '../../domain/labels';
import { exceptionScope } from '../../domain/selectors';
import type { Deliverable, DeliverableState } from '../../domain/types';
import { DeliverableDrawer, clientVisible } from '../../components/delivery/DeliverableDrawer';
import { Empty, Id, Pill, Select, StatePill, Table, Td, cn } from '../../components/ui';
import type { TabProps } from './ProjectPage';

/** 11-B2 — deliverables and their revisions, grouped by execution site. */
export const DeliverablesTab: React.FC<TabProps> = ({ project, access }) => {
  const { state } = useStore();
  const { userName } = useLookup();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'open' | DeliverableState>('all');
  const all = useMemo(() => state.deliverables.filter((d) => d.projectId === project.id && (access !== 'client' || clientVisible(d))), [state, project.id, access]);
  const list = all.filter((d) => filter === 'all' || (filter === 'open' ? !['client_approved', 'excluded'].includes(d.status) : d.status === filter));

  const groups = [
    ...project.sites.map((s) => ({ key: s.id, title: s.name, suspended: s.suspended, items: list.filter((d) => d.siteId === s.id) })),
    { key: 'shared', title: project.sites.length > 1 ? 'أعمال مشتركة بين المواقع' : project.sites[0]?.name ?? 'المخرجات', suspended: undefined, items: list.filter((d) => !d.siteId || !project.sites.some((s) => s.id === d.siteId)) },
  ].filter((g) => g.items.length);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('d', id);
    else next.delete('d');
    setParams(next, { replace: true });
  };
  const counts = (s: DeliverableState) => all.filter((d) => d.status === s).length;
  const approved = all.filter((d) => d.status === 'client_approved').length;
  const excluded = all.filter((d) => d.status === 'excluded').length;
  const scope = exceptionScope(state, project);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {[
            { label: 'معتمد', value: approved, danger: false },
            { label: 'مراجعة داخلية', value: counts('internal_review'), danger: false },
            { label: 'جاهز للتسليم', value: counts('ready_for_delivery'), danger: false },
            { label: 'بانتظار العميل', value: counts('awaiting_client'), danger: false },
            ...(counts('blocked_pending_payment') > 0 ? [{ label: 'ممنوع حتى السداد', value: counts('blocked_pending_payment'), danger: true }] : []),
            ...(excluded > 0 ? [{ label: 'مستبعد', value: excluded, danger: false }] : []),
          ].map((x) => (
            <div key={x.label}>
              <dt className="text-xs text-muted">{x.label}</dt>
              <dd className={cn('text-xl font-bold tabular', x.danger ? 'text-st-danger' : 'text-ink')}>{x.value}</dd>
            </div>
          ))}
        </dl>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!w-auto" aria-label="تصفية المخرجات">
          <option value="all">كل المخرجات</option>
          <option value="open">غير المكتملة</option>
          {(Object.keys(DELIVERABLE_STATES) as DeliverableState[]).map((s) => <option key={s} value={s}>{DELIVERABLE_STATES[s].label}</option>)}
        </Select>
      </div>
      {access === 'client' && <p className="text-xs text-muted">تظهر للمبيعات المخرجات الجاهزة والمرسلة والمعتمدة فقط.</p>}

      {!groups.length && <Empty title={access === 'client' ? 'لا مخرجات جاهزة للإرسال بعد' : 'لا توجد مخرجات'} hint="تُنشأ المخرجات من خدمات العرض المقبول مع بدء التنفيذ." />}

      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-lg border border-line">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-page px-4 py-2.5">
            <h3 className="text-sm font-semibold text-ink">{g.title} <span className="font-normal text-muted">· {g.items.length}</span></h3>
            {g.suspended && <Pill tone="waiting">الموقع معلّق: {g.suspended.reason}</Pill>}
          </header>
          <Table head={['المخرج', 'القسم', 'مسؤول البند', 'النوع', 'الإصدار', 'الحالة', 'المهلة / المتابعة']}>
            {g.items.map((d) => <Row key={d.id} d={d} onOpen={open} outOfScope={!scope.inScope(d.scopeItemIds)} owners={deliverableOwners(project, d).map((o) => userName(o)).join('، ')} />)}
          </Table>
        </section>
      ))}

      <DeliverableDrawer project={project} id={params.get('d')} access={access} onClose={() => open(null)} />
    </div>
  );
};

function Row({ d, onOpen, owners, outOfScope }: { d: Deliverable; onOpen: (id: string) => void; owners: string; outOfScope: boolean }) {
  const { state } = useStore();
  const cur = d.revisions[d.revisions.length - 1];
  const late = d.status === 'awaiting_client' && d.responseDueAt && !isAfter(d.responseDueAt, state.now);
  return (
    <tr className="cursor-pointer hover:bg-page" onClick={() => onOpen(d.id)}>
      <Td>
        <p className="text-sm font-medium text-ink">{d.title}</p>
        <Id>{d.id}</Id>
        {outOfScope && <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-st-waiting"><AlertTriangle size={12} />خارج نطاق الاستثناء — ينتظر الاعتماد المالي</span>}
      </Td>
      <Td className="text-sm">{deptName(d.deptCode)}</Td>
      <Td className="text-sm">{owners || <span className="text-xs text-st-waiting">لم يُعيّن</span>}</Td>
      <Td>
        {d.requiresGov
          ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-ink-2"><Landmark size={14} className="text-muted" /> بإجراء حكومي</span>
          : <span className="text-sm text-ink-2">{d.technical ? 'فني' : 'غير فني'}</span>}
      </Td>
      <Td>
        {cur ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <span className="ltr-iso font-medium text-ink">{revLabel(cur.rev)}</span>
            {cur.issued && <Lock size={11} className="text-muted" />}
            <span className="text-muted">({cur.files.length} ملف)</span>
          </span>
        ) : <span className="text-xs text-muted">—</span>}
      </Td>
      <Td><StatePill s={DELIVERABLE_STATES[d.status]} /></Td>
      <Td>
        {d.status === 'awaiting_client' ? (
          <span className={cn('text-xs', late ? 'font-medium text-st-danger' : 'text-ink-2')}>
            الرد حتى {fmtDate(d.responseDueAt)}{late && ' — انقضت'}
            <span className="block text-muted">متابعة {fmtDate(d.nextFollowUpAt)}</span>
          </span>
        ) : <span className="text-xs text-muted">—</span>}
      </Td>
    </tr>
  );
}
