import { visibleProjects } from '../../domain/selectors';
import type { AppState, RecordLink, RecordType, User } from '../../domain/types';

/** Where a linked record opens in the prototype (TK-01: a task or visit may link to any record). */
export function recordHref(link?: RecordLink): string | undefined {
  if (!link || link.type === 'none') return undefined;
  const pid = link.projectId;
  switch (link.type) {
    case 'project': return `/projects/${link.id}`;
    case 'deliverable': return pid ? `/projects/${pid}?tab=deliverables&d=${link.id}` : undefined;
    case 'payment': return pid ? `/projects/${pid}?tab=payments&p=${link.id}` : undefined;
    case 'cost_request': return pid ? `/projects/${pid}?tab=costs&c=${link.id}` : undefined;
    case 'gov': return `/gov?id=${link.id}`;
    case 'visit': return `/visits?id=${link.id}`;
    default: return undefined;
  }
}

export const RECORD_TYPE_NAMES: Record<RecordType, string> = {
  project: 'مشروع', deliverable: 'مخرج', gov: 'معاملة حكومية', visit: 'زيارة', payment: 'دفعة',
  opportunity: 'فرصة', cost_request: 'طلب تكلفة', none: 'دون سجل',
};

/**
 * Records a task or visit may be linked to, as select options `type:id`. Only records the person
 * can see are offered; a standalone task stays possible (TK-01).
 */
export function recordOptions(s: AppState, me: User, types: RecordType[]): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [{ value: 'none', label: '— دون سجل مرتبط (مهمة مستقلة) —' }];
  const projects = visibleProjects(s, me).filter((p) => !['cancelled'].includes(p.status));
  const ids = new Set(projects.map((p) => p.id));
  if (types.includes('project')) for (const p of projects) out.push({ value: `project:${p.id}`, label: `مشروع — ${p.id} ${p.title}` });
  if (types.includes('deliverable')) {
    for (const d of s.deliverables.filter((x) => ids.has(x.projectId) && !['client_approved', 'excluded'].includes(x.status))) {
      out.push({ value: `deliverable:${d.id}`, label: `مخرج — ${d.title} (${d.projectId})${d.technical ? ' · فني' : ''}` });
    }
  }
  if (types.includes('gov')) for (const g of s.gov.filter((x) => ids.has(x.projectId))) out.push({ value: `gov:${g.id}`, label: `معاملة — ${g.id} ${g.procedureType}` });
  if (types.includes('visit')) for (const v of s.visits.filter((x) => x.ownerId === me.id || x.participants.includes(me.id))) out.push({ value: `visit:${v.id}`, label: `زيارة — ${v.id} ${v.purpose}` });
  if (types.includes('opportunity')) for (const o of s.opportunities) out.push({ value: `opportunity:${o.id}`, label: `فرصة — ${o.id} ${o.title}` });
  return out;
}

/** Turn a `type:id` option back into the link the engine stores. */
export function toRecordLink(s: AppState, value: unknown): RecordLink | undefined {
  const v = String(value ?? 'none');
  if (v === 'none' || !v.includes(':')) return undefined;
  const [type, id] = v.split(/:(.+)/) as [RecordType, string];
  if (type === 'project') {
    const p = s.projects.find((x) => x.id === id);
    return { type, id, label: p ? `${p.id} — ${p.title}` : id, projectId: id };
  }
  if (type === 'deliverable') {
    const d = s.deliverables.find((x) => x.id === id);
    return { type, id, label: d ? d.title : id, projectId: d?.projectId };
  }
  if (type === 'gov') {
    const g = s.gov.find((x) => x.id === id);
    return { type, id, label: g ? `${g.id} — ${g.authority}` : id, projectId: g?.projectId };
  }
  if (type === 'visit') {
    const vi = s.visits.find((x) => x.id === id);
    return { type, id, label: vi ? `${vi.id} — ${vi.purpose}` : id, projectId: vi?.link?.projectId };
  }
  if (type === 'opportunity') {
    const o = s.opportunities.find((x) => x.id === id);
    return { type, id, label: o ? o.title : id, projectId: s.projects.find((p) => p.opportunityId === id)?.id };
  }
  return undefined;
}
