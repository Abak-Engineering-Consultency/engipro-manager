import React, { useState } from 'react';
import { useStore } from '../../app/store';
import { ScheduleVisitButton, VisitCard } from '../../components/visits/VisitParts';
import { VisitDrawer } from '../../components/visits/VisitDrawer';
import type { TabProps } from './ProjectPage';

/** The project's visits: supervision, start, handover and expeditor visits linked here. */
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div><dt className="text-xs text-muted">كل الزيارات</dt><dd className="text-sm font-medium text-ink tabular">{visits.length}</dd></div>
          <div><dt className="text-xs text-muted">قابلة للفوترة</dt><dd className="text-sm font-medium text-ink tabular">{billable.length} <span className="text-xs font-normal text-muted">· طولب بـ {billable.filter((v) => v.claimId).length}</span></dd></div>
        </dl>
        {access === 'full' && <ScheduleVisitButton presetLink={{ type: 'project', id: project.id, label: `${project.id} — ${project.title}`, projectId: project.id }} onCreated={setOpen} />}
      </div>

      <section>
        <h4 className="mb-3 text-sm font-semibold text-ink">القادمة <span className="font-normal text-muted">({upcoming.length})</span></h4>
        {upcoming.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((v) => <VisitCard key={v.id} visit={v} onOpen={setOpen} />)}
          </div>
        ) : <p className="text-sm text-muted">لا زيارات مجدولة.</p>}
      </section>

      <section>
        <h4 className="mb-3 text-sm font-semibold text-ink">السابقة <span className="font-normal text-muted">({past.length})</span></h4>
        {past.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {past.map((v) => <VisitCard key={v.id} visit={v} onOpen={setOpen} />)}
          </div>
        ) : <p className="text-sm text-muted">لا زيارات سابقة.</p>}
      </section>

      <VisitDrawer visitId={open} onClose={() => setOpen(null)} />
    </div>
  );
};
