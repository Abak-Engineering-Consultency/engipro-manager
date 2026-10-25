import React, { useState } from 'react';
import { Columns3, List } from 'lucide-react';
import { useStore } from '../../app/store';
import { cn, Tabs } from '../../components/ui';
import { NewTaskButton, TaskDrawer } from '../../components/work/TaskDrawer';
import { isOpen, isOverdue, TaskBoard, TaskList } from '../../components/work/TaskViews';
import type { TabProps } from './ProjectPage';

type Filter = 'open' | 'generated' | 'all';

/** The project's shared tasks — manual, kick-off actions, authority comments, collections. */
export const ProjectTasksTab: React.FC<TabProps> = ({ project }) => {
  const { state } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [board, setBoard] = useState(false);
  const all = state.tasks.filter((t) => t.link?.projectId === project.id);
  const shown = all
    .filter((t) => (filter === 'open' ? isOpen(t) : filter === 'generated' ? t.source !== 'manual' : true))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const overdue = all.filter((t) => isOverdue(t, state.now)).length;
  const blocked = all.filter((t) => t.status === 'blocked').length;
  const stats: { label: string; value: number; tone?: string }[] = [
    { label: 'مفتوحة', value: all.filter(isOpen).length },
    { label: 'متأخرة', value: overdue, tone: overdue ? 'text-st-danger' : undefined },
    { label: 'معطّلة', value: blocked, tone: blocked ? 'text-st-waiting' : undefined },
    { label: 'مولّدة من مسارات أخرى', value: all.filter((t) => t.source !== 'manual').length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className={cn('text-xl font-bold tabular text-ink', s.tone)}>{s.value}</dd>
            </div>
          ))}
        </dl>
        <NewTaskButton presetLink={{ type: 'project', id: project.id, label: `${project.id} — ${project.title}`, projectId: project.id }} onCreated={setOpen} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 grow">
          <Tabs<Filter>
            tabs={[{ id: 'open', label: 'المفتوحة' }, { id: 'generated', label: 'المولّدة' }, { id: 'all', label: 'الكل' }]}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <div className="mb-2 flex rounded-lg border border-line bg-sunken p-1" role="group" aria-label="طريقة العرض">
          <button onClick={() => setBoard(false)} aria-pressed={!board} title="قائمة" aria-label="قائمة" className={cn('rounded-md p-1.5 transition-all', !board ? 'bg-card text-brand-700 shadow-sm' : 'text-muted hover:text-ink')}><List size={18} /></button>
          <button onClick={() => setBoard(true)} aria-pressed={board} title="لوحة" aria-label="لوحة" className={cn('rounded-md p-1.5 transition-all', board ? 'bg-card text-brand-700 shadow-sm' : 'text-muted hover:text-ink')}><Columns3 size={18} /></button>
        </div>
      </div>
      {board ? <TaskBoard tasks={shown} onOpen={setOpen} /> : <TaskList tasks={shown} onOpen={setOpen} />}
      <TaskDrawer taskId={open} onClose={() => setOpen(null)} />
    </div>
  );
};
