import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Landmark, Lock } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { fmtDate, isAfter } from '../../domain/calendar';
import { deptName } from '../../domain/catalog';
import { deliverableOwners, revLabel } from '../../domain/engine/delivery';
import { DELIVERABLE_STATES } from '../../domain/labels';
import type { Deliverable, DeliverableState } from '../../domain/types';
import { DeliverableDrawer, clientVisible } from '../../components/delivery/DeliverableDrawer';
import { Empty, Id, Pill, Rule, Select, StatePill, Table, Td, cn } from '../../components/ui';
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill tone="success">معتمد {approved}</Pill>
          <Pill tone="waiting">مراجعة داخلية {counts('internal_review')}</Pill>
          <Pill tone="brand">جاهز للتسليم {counts('ready_for_delivery')}</Pill>
          <Pill tone="waiting">بانتظار العميل {counts('awaiting_client')}</Pill>
          {counts('blocked_pending_payment') > 0 && <Pill tone="danger">ممنوع حتى السداد {counts('blocked_pending_payment')}</Pill>}
          {excluded > 0 && <Pill tone="muted">مستبعد {excluded}</Pill>}
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!w-auto">
          <option value="all">كل المخرجات</option>
          <option value="open">غير المكتملة</option>
          {(Object.keys(DELIVERABLE_STATES) as DeliverableState[]).map((s) => <option key={s} value={s}>{DELIVERABLE_STATES[s].label}</option>)}
        </Select>
      </div>
      <p className="text-xs text-muted">
        المخرج الفني يُراجع داخليًا من غير معدّه، والإصدار الصادر ثابت بمعرّفه وبصمته، وملاحظات العميل تفتح إصدارًا جديدًا. <Rule>DL-02</Rule> <Rule>NX-04</Rule> <Rule>AC-16</Rule>
        {access === 'client' && ' — تظهر للمبيعات المخرجات الجاهزة والمرسلة والمعتمدة فقط.'}
      </p>

      {!groups.length && <Empty title={access === 'client' ? 'لا مخرجات جاهزة للإرسال بعد' : 'لا توجد مخرجات'} hint="تُنشأ المخرجات من خدمات العرض المقبول (11-A)، وتبدأ «قيد الإعداد» مع بدء التنفيذ." />}

      {groups.map((g) => (
        <section key={g.key} className="rounded-lg border border-line">
          <header className="flex items-center justify-between gap-2 border-b border-line bg-page px-3 py-2">
            <h3 className="text-sm font-semibold text-ink">{g.title}</h3>
            {g.suspended && <Pill tone="waiting">الموقع معلّق: {g.suspended.reason}</Pill>}
          </header>
          <Table head={['المخرج', 'القسم', 'مسؤول البند', 'النوع', 'الإصدار', 'الحالة', 'المهلة / المتابعة']}>
            {g.items.map((d) => <Row key={d.id} d={d} onOpen={open} owners={deliverableOwners(project, d).map((o) => userName(o)).join('، ')} />)}
          </Table>
        </section>
      ))}

      <DeliverableDrawer project={project} id={params.get('d')} access={access} onClose={() => open(null)} />
    </div>
  );
};

function Row({ d, onOpen, owners }: { d: Deliverable; onOpen: (id: string) => void; owners: string }) {
  const { state } = useStore();
  const cur = d.revisions[d.revisions.length - 1];
  const late = d.status === 'awaiting_client' && d.responseDueAt && !isAfter(d.responseDueAt, state.now);
  return (
    <tr className="cursor-pointer hover:bg-sunken" onClick={() => onOpen(d.id)}>
      <Td>
        <Id>{d.id}</Id>
        <p className="text-sm font-medium text-ink">{d.title}</p>
      </Td>
      <Td className="text-sm">{deptName(d.deptCode)}</Td>
      <Td className="text-sm">{owners || <span className="text-xs text-st-waiting">لم يُعيّن</span>}</Td>
      <Td>
        {d.requiresGov ? <Pill tone="progress"><Landmark size={11} /> بإجراء حكومي</Pill> : d.technical ? <Pill tone="brand">فني</Pill> : <Pill tone="muted">غير فني</Pill>}
      </Td>
      <Td>
        {cur ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <span className="ltr-iso font-medium text-brand-700">{revLabel(cur.rev)}</span>
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
