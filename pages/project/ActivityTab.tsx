import React, { useState } from 'react';
import { useLookup, useStore } from '../../app/store';
import { fmtDateTime } from '../../domain/calendar';
import { Pill, Rule, Select } from '../../components/ui';
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

/** F12 / X-03 — every decision with its actor, time and reason, never edited. */
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">سجل لا يُعدَّل ولا يُحذف منه: من فعل ماذا ومتى ولماذا. <Rule>F12</Rule> <Rule>X-03</Rule></p>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="max-w-56">
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </Select>
      </div>
      <ol className="divide-y divide-line rounded-lg border border-line">
        {events.map((e) => (
          <li key={e.id} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
            <span className="text-xs tabular text-muted">{fmtDateTime(e.at)}</span>
            <span className="text-sm text-ink">
              {e.summary}
              <span className="block text-xs text-muted">{e.actorId === 'system' ? 'النظام' : userName(e.actorId)}</span>
            </span>
            <Pill tone="muted"><code dir="ltr" className="text-[11px]">{e.type}</code></Pill>
          </li>
        ))}
        {!events.length && <li className="px-3 py-6 text-center text-sm text-muted">لا أحداث.</li>}
      </ol>
    </div>
  );
};
