import React, { useState } from 'react';
import { useStore } from '../../app/store';
import { Empty, Rule } from '../../components/ui';
import { ScheduleVisitButton, VisitCard } from '../../components/visits/VisitParts';
import { VisitDrawer } from '../../components/visits/VisitDrawer';
import type { TabProps } from './ProjectPage';

/** The project's visits (VS-01…VS-08): supervision, start, handover and expeditor visits linked here. */
export const ProjectVisitsTab: React.FC<TabProps> = ({ project, access }) => {
  const { state } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const govIds = new Set(state.gov.filter((g) => g.projectId === project.id).map((g) => g.id));
  const visits = state.visits
    .filter((v) => v.link?.projectId === project.id || (v.link?.type === 'gov' && govIds.has(v.link.id)) || (v.link?.type === 'opportunity' && v.link.id === project.opportunityId))
    .sort((a, b) => b.plannedStart.localeCompare(a.plannedStart));
  const upcoming = visits.filter((v) => ['proposed', 'confirmed'].includes(v.status)).reverse();
  const past = visits.filter((v) => !['proposed', 'confirmed'].includes(v.status));
  const billable = visits.filter((v) => v.billing === 'billable');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          زيارات المشروع وزيارات الفرصة قبله ومعاملاته. القابلة للفوترة: {billable.length} (طولب بـ {billable.filter((v) => v.claimId).length}) <Rule>VS-08</Rule>
        </p>
        {access === 'full' && <ScheduleVisitButton presetLink={{ type: 'project', id: project.id, label: `${project.id} — ${project.title}`, projectId: project.id }} onCreated={setOpen} />}
      </div>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-ink">القادمة ({upcoming.length})</h4>
        {upcoming.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((v) => <VisitCard key={v.id} visit={v} onOpen={setOpen} />)}
          </div>
        ) : <Empty title="لا زيارات مجدولة" />}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-ink">السابقة ({past.length})</h4>
        {past.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {past.map((v) => <VisitCard key={v.id} visit={v} onOpen={setOpen} />)}
          </div>
        ) : <Empty title="لا زيارات سابقة" />}
      </section>

      <VisitDrawer visitId={open} onClose={() => setOpen(null)} />
    </div>
  );
};
