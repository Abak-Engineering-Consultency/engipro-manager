import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../app/store';
import { govTimes } from '../../domain/selectors';
import { GovDrawer, GovTable } from '../../components/gov/GovViews';
import { Fact, Rule } from '../../components/ui';
import type { TabProps } from './ProjectPage';

/** 11-B4 for one project: its transactions, with office time and authority waiting kept apart. */
export const ProjectGovTab: React.FC<TabProps> = ({ project }) => {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const items = state.gov.filter((g) => g.projectId === project.id);
  const totals = items.map((g) => govTimes(state.now, g));
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('g', id);
    else next.delete('g');
    setParams(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-2">
          تُنشأ المعاملة من قالب الخدمة المعتمد عند بدء التنفيذ لكل مخرج يتطلب إجراءً حكوميًا، وصدورها يعتمد المخرج ويفحص شرط الدفعة. <Rule>GT-01</Rule> <Rule>GT-11</Rule>
        </p>
        <dl className="flex gap-6">
          <Fact label="وقت المكتب (كل المعاملات)"><span className="tabular">{totals.reduce((s, t) => s + t.office, 0)} يوم</span></Fact>
          <Fact label="انتظار الجهة"><span className="tabular">{totals.reduce((s, t) => s + t.authority, 0)} يوم</span> <Rule>F10</Rule></Fact>
        </dl>
      </div>
      <div className="rounded-lg border border-line">
        <GovTable items={items} onOpen={setOpen} showProject={false} />
      </div>
      <GovDrawer govId={params.get('g')} onClose={() => setOpen(null)} />
    </div>
  );
};
