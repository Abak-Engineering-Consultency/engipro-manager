import React, { useState } from 'react';
import { useLookup, useStore } from '../../app/store';
import { fmtDateTime } from '../../domain/calendar';
import { cn, Empty, Select } from '../../components/ui';
import type { TabProps } from './ProjectPage';

const KINDS: { id: string; label: string }[] = [
  { id: '', label: 'كل الأحداث' },
  { id: 'project', label: 'المشروع والتعيين' },
  { id: 'deliverable', label: 'المخرجات' },
  { id: 'payment', label: 'الدفعات' },
  { id: 'gov', label: 'المعاملات' },
  { id: 'task', label: 'المهام' },
  { id: 'visit', label: 'الزيارات' },
  { id: 'cost', label: 'التكاليف' },
  { id: 'change', label: 'التغييرات' },
  { id: 'closure', label: 'الإغلاق' },
];

/** Every decision with its actor, time and reason, never edited. */
export const ActivityTab: React.FC<TabProps> = ({ project, access }) => {
  const { state } = useStore();
  const { userName } = useLookup();
  const [kind, setKind] = useState('');
  const financeTypes = ['payment', 'cost', 'project.settled', 'closure', 'cancellation', 'activation'];
  const events = state.events
    .filter((e) => e.projectId === project.id)
    .filter((e) => access !== 'finance' || financeTypes.some((t) => e.type.startsWith(t)))
    .filter((e) => !kind || e.type.startsWith(kind) || (kind === 'closure' && e.type.startsWith('cancellation')))
    .slice()
    .reverse();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{events.length} حدث · من فعل ماذا ومتى ولماذا</p>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="max-w-56" aria-label="نوع الحدث">
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </Select>
      </div>
      {events.length ? (
        <ol className="relative space-y-5 border-s border-line ps-6">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className={cn('absolute -start-[31px] top-1 h-3 w-3 rounded-full border-2 border-card', e.actorId === 'system' ? 'bg-line-strong' : 'bg-brand-500')} />
              <p className="text-sm text-ink">{e.summary}</p>
              <p className="mt-0.5 text-xs text-muted">
                {e.actorId === 'system' ? 'النظام' : userName(e.actorId)} · <span className="tabular">{fmtDateTime(e.at)}</span>
              </p>
            </li>
          ))}
        </ol>
      ) : <Empty title="لا أحداث" />}
    </div>
  );
};
