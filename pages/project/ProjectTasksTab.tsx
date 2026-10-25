import React, { useState } from 'react';
import { useStore } from '../../app/store';
import { Kpi, Rule, Tabs } from '../../components/ui';
import { NewTaskButton, TaskDrawer } from '../../components/work/TaskDrawer';
import { isOpen, isOverdue, TaskBoard, TaskList } from '../../components/work/TaskViews';
import type { TabProps } from './ProjectPage';

type Filter = 'open' | 'generated' | 'all';

/** The project's shared tasks (TK-01…TK-11) — manual, kick-off actions, authority comments, collections. */
export const ProjectTasksTab: React.FC<TabProps> = ({ project }) => {
  const { state } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [board, setBoard] = useState(false);
  const all = state.tasks.filter((t) => t.link?.projectId === project.id);
  const shown = all
    .filter((t) => (filter === 'open' ? isOpen(t) : filter === 'generated' ? t.source !== 'manual' : true))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="مفتوحة" value={all.filter(isOpen).length} />
        <Kpi label="متأخرة" value={all.filter((t) => isOverdue(t, state.now)).length} tone={all.some((t) => isOverdue(t, state.now)) ? 'danger' : undefined} />
        <Kpi label="معطّلة" value={all.filter((t) => t.status === 'blocked').length} tone={all.some((t) => t.status === 'blocked') ? 'waiting' : undefined} />
        <Kpi label="مولّدة من مسارات أخرى" value={all.filter((t) => t.source !== 'manual').length} hint="بمفتاح منع تكرار (TK-11)" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 grow">
          <Tabs<Filter>
            tabs={[{ id: 'open', label: 'المفتوحة' }, { id: 'generated', label: 'المولّدة' }, { id: 'all', label: 'الكل' }]}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" className="accent-brand-600" checked={board} onChange={(e) => setBoard(e.target.checked)} />
            عرض اللوحة
          </label>
          <NewTaskButton presetLink={{ type: 'project', id: project.id, label: `${project.id} — ${project.title}`, projectId: project.id }} onCreated={setOpen} />
        </div>
      </div>
      <p className="text-xs text-muted">
        الإجراءات الرسمية (اعتماد، مراجعة، تسليم، تحصيل) لا تظهر هنا كمهام؛ تظهر في «إجراءاتي» لأصحابها من سجلاتها <Rule>TK-02</Rule>
      </p>
      {board ? <TaskBoard tasks={shown} onOpen={setOpen} /> : <TaskList tasks={shown} onOpen={setOpen} />}
      <TaskDrawer taskId={open} onClose={() => setOpen(null)} />
    </div>
  );
};
