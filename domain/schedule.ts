import { addDays } from './calendar';
import type { ISO, Phase, Settings } from './types';

/**
 * Forward pass over the plan (kept from the EngiPro prototype's scheduler) extended for the
 * flowchart: working or calendar days per contract (D07), holidays, and cycle protection.
 * A task starts after its latest dependency ends; with no dependency it starts with the project.
 */
export function schedulePhases(start: ISO | undefined, phases: Phase[], dayType: 'working' | 'calendar', s: Settings): Phase[] {
  if (!start) return phases;
  const all = new Map(phases.flatMap((p) => p.tasks).map((t) => [t.id, t]));
  const done = new Map<string, { start: ISO; end: ISO }>();
  const visiting = new Set<string>();

  const resolve = (id: string): { start: ISO; end: ISO } => {
    const known = done.get(id);
    if (known) return known;
    const task = all.get(id);
    if (!task || visiting.has(id)) return { start, end: start };
    visiting.add(id);
    let begin = start;
    for (const dep of task.dependencies) {
      const r = resolve(dep);
      if (Date.parse(r.end) > Date.parse(begin)) begin = r.end;
    }
    const end = addDays(begin, Math.max(1, task.duration), dayType, s);
    visiting.delete(id);
    const r = { start: begin, end };
    done.set(id, r);
    return r;
  };

  return phases.map((p) => ({
    ...p,
    tasks: p.tasks.map((t) => {
      const r = resolve(t.id);
      return { ...t, startDate: r.start, endDate: r.end };
    }),
  }));
}

export function planEnd(phases: Phase[]): ISO | undefined {
  let end: ISO | undefined;
  for (const t of phases.flatMap((p) => p.tasks)) if (t.endDate && (!end || Date.parse(t.endDate) > Date.parse(end))) end = t.endDate;
  return end;
}
