import { isAfter } from './calendar';
import { allows } from './permissions';
import type { AppState, Deliverable, GovTransaction, Project, User } from './types';

/** PJ-09: why the project cannot start yet. Empty = the gate is met. */
export function startGate(s: AppState, p: Project): string[] {
  const reasons: string[] = [];
  const financeOk = p.activationIds.some((id) => s.activations.find((a) => a.id === id)?.status === 'approved');
  const exc = p.exceptionId ? s.exceptions.find((e) => e.id === p.exceptionId) : undefined;
  const excOk = exc?.status === 'granted' && isAfter(exc.expiresAt, s.now);
  const preOk = p.createdFrom === 'pre_system' && p.preSystem?.financeReviewed;
  if (!financeOk && !excOk && !preOk) reasons.push('لا اعتماد مالي ولا استثناء ساري');
  if (!p.pmId) reasons.push('لم يُعتمد مدير المشروع');
  const unowned = p.scopeItems.filter((i) => !i.ownerId).length;
  if (unowned) reasons.push(`${unowned} بند بلا مسؤول`);
  const hasPayments = s.payments.some((x) => x.projectId === p.id);
  if (hasPayments && p.paymentMapping.status !== 'confirmed') reasons.push('ربط الدفعات لم تؤكده المالية');
  if (p.kickoff.required && p.kickoff.status !== 'held') reasons.push('الاجتماع الافتتاحي إلزامي بحسب العقد');
  return reasons;
}

/**
 * F15 / A2: while a project runs on a CEO exception (finance approval not yet linked), only the
 * quotation lines the exception allows may be worked on. `inScope` answers for a set of items.
 */
export function exceptionScope(s: AppState, p: Project) {
  const exc = p.exceptionId ? s.exceptions.find((e) => e.id === p.exceptionId) : undefined;
  const active = !!exc && ['granted', 'expired'].includes(exc.status);
  const allowed = new Set(active ? p.scopeItems.filter((i) => i.sourceLineId && exc!.allowedLineIds.includes(i.sourceLineId)).map((i) => i.id) : []);
  return {
    active,
    exception: exc,
    allowedItemIds: [...allowed],
    inScope: (itemIds: (string | undefined)[]) => !active || (itemIds.length > 0 && itemIds.every((id) => !!id && allowed.has(id))),
  };
}

/** SC-02: progress is work done (deliverables), never elapsed time. */
export function projectProgress(s: AppState, p: Project): number {
  const ds = s.deliverables.filter((d) => d.projectId === p.id && d.status !== 'excluded');
  if (!ds.length) return 0;
  const w: Record<Deliverable['status'], number> = {
    not_started: 0, in_preparation: 0.2, internal_review: 0.5, ready_for_delivery: 0.7, blocked_pending_payment: 0.7,
    awaiting_client: 0.8, deemed_acceptance_review: 0.9, client_approved: 1, excluded: 0,
  };
  return Math.round((ds.reduce((sum, d) => sum + w[d.status] - (d.status === 'in_preparation' && !d.revisions.some((r) => r.files.length) ? 0.2 : 0), 0) / ds.length) * 100);
}

const DAY = 86_400_000;

export function govTimes(now: string, g: GovTransaction) {
  let authority = 0;
  let office = 0;
  for (const r of g.rounds) {
    if (r.authorityStart) authority += (Date.parse(r.authorityEnd ?? now) - Date.parse(r.authorityStart)) / DAY;
    if (r.officeStart) office += (Date.parse(r.officeEnd ?? now) - Date.parse(r.officeStart)) / DAY;
  }
  const first = g.rounds[0]?.submittedAt ?? (['preparing', 'awaiting_client'].includes(g.status) ? now : g.createdAt);
  office += Math.max(0, (Date.parse(first) - Date.parse(g.createdAt)) / DAY);
  const current = g.rounds[g.rounds.length - 1];
  const waitingNow = g.status === 'at_authority' && current?.authorityStart ? (Date.parse(now) - Date.parse(current.authorityStart)) / DAY : 0;
  return { authority: Math.floor(authority), office: Math.floor(office), waitingNow: Math.floor(waitingNow) };
}

/** SC-02 — the project bar: phase, authority, waiting time, owner, follow-ups, office time. */
export function projectBar(s: AppState, p: Project) {
  const phase = p.phases.find((ph) => ph.tasks.some((t) => !t.done)) ?? p.phases[p.phases.length - 1];
  const gov = s.gov.filter((g) => g.projectId === p.id && !['issued', 'closed_not_issued'].includes(g.status));
  const active = gov.find((g) => g.status === 'at_authority') ?? gov[0];
  const times = active ? govTimes(s.now, active) : undefined;
  const allTimes = s.gov.filter((g) => g.projectId === p.id).map((g) => govTimes(s.now, g));
  return {
    phase: phase?.name,
    gov: active,
    waitingNow: times?.waitingNow ?? 0,
    authorityDays: allTimes.reduce((a, t) => a + t.authority, 0),
    officeDays: allTimes.reduce((a, t) => a + t.office, 0),
    lastFollowUp: active?.lastUpdateAt,
    nextFollowUp: active?.lastUpdateAt ? new Date(Date.parse(active.lastUpdateAt) + s.settings.expeditorUpdateDays * DAY).toISOString() : undefined,
  };
}

export type ProjectAccess = 'full' | 'finance' | 'client' | null;

/**
 * OD-14 / NX-03: who sees the project, and how much. Members and their departments see the
 * work; finance sees the financial area; sales see client documents and ready outputs.
 */
export function projectAccess(s: AppState, u: User | undefined, p: Project): ProjectAccess {
  if (!u) return null;
  const member = p.members.some((m) => m.userId === u.id && m.capacity !== 'opportunity_owner');
  if (allows(u, 'project.read', { own: member, depts: p.departments.map((d) => d.deptCode) })) return 'full';
  if (member) return 'full';
  if (u.roleId === 'accountant') return 'finance';
  if (p.members.some((m) => m.userId === u.id && m.capacity === 'opportunity_owner') || u.roleId === 'sales_manager') return 'client';
  if (s.gov.some((g) => g.projectId === p.id && (g.licensingOfficerId === u.id || g.expeditorId === u.id))) return 'client';
  return null;
}

export const visibleProjects = (s: AppState, u: User | undefined) => s.projects.filter((p) => projectAccess(s, u, p));

export const userName = (s: AppState, id?: string) => s.users.find((u) => u.id === id)?.name ?? '—';
export const clientName = (s: AppState, id?: string) => s.clients.find((c) => c.id === id)?.name ?? '—';

export function pmOf(s: AppState, p: Project) {
  return s.users.find((u) => u.id === p.pmId);
}

export const oppOwner = (s: AppState, p: Project) =>
  p.opportunityId ? s.opportunities.find((o) => o.id === p.opportunityId)?.ownerId : p.followUpOwnerId;
