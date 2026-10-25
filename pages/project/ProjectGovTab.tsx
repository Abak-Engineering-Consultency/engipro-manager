import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../app/store';
import { govTimes } from '../../domain/selectors';
import { GovDrawer, GovTable } from '../../components/gov/GovViews';
import { Fact } from '../../components/ui';
import type { TabProps } from './ProjectPage';

/** One project's transactions, with office time and authority waiting kept apart. */
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
      {items.length > 0 && (
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Fact label="المعاملات">{items.length}</Fact>
          <Fact label="وقت المكتب"><span className="tabular">{totals.reduce((s, t) => s + t.office, 0)} يوم</span></Fact>
          <Fact label="انتظار الجهة"><span className="tabular">{totals.reduce((s, t) => s + t.authority, 0)} يوم</span></Fact>
        </dl>
      )}
      {items.length ? (
        <div className="-mx-5 -mb-5 border-t border-line">
          <GovTable items={items} onOpen={setOpen} showProject={false} />
        </div>
      ) : <GovTable items={items} onOpen={setOpen} showProject={false} />}
      <GovDrawer govId={params.get('g')} onClose={() => setOpen(null)} />
    </div>
  );
};
