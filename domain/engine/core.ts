import { allows, hasRole, inDept, isActive, PERMISSIONS, type ScopeContext } from '../permissions';
import { approverIds, exceptionScope } from '../selectors';
import type {
  AppState, CostRequest, Deliverable, DeptCode, GovTransaction, ISO, PaymentItem, Perm, Project, RecordLink, Task, User, UserId, Visit,
} from '../types';
import { addCalendarDays, dateKey } from '../calendar';

/** A rule of the process refused the command. The message is shown to the user as is. */
export class ProcessError extends Error {}

export interface NoteInput { title: string; body?: string; link?: string; type: string }

/**
 * One command's working context. Every transition goes through here, so permission checks,
 * the append-only event log (F12) and notifications to the current action owner (F13)
 * are applied the same way everywhere.
 */
export class Ctx {
  readonly s: AppState;
  readonly actorId: UserId | 'system';
  constructor(s: AppState, actorId: UserId | 'system') {
    this.s = s;
    this.actorId = actorId;
  }

  get now(): ISO {
    return this.s.now;
  }

  get me(): User {
    if (this.actorId === 'system') throw new ProcessError('هذا الإجراء يتطلب مستخدمًا');
    return this.user(this.actorId);
  }

  user(id: UserId): User {
    const u = this.s.users.find((x) => x.id === id);
    if (!u) throw new ProcessError(`مستخدم غير معروف: ${id}`);
    return u;
  }

  fail(message: string): never {
    throw new ProcessError(message);
  }

  check(cond: unknown, message: string): asserts cond {
    if (!cond) throw new ProcessError(message);
  }

  /** Permission → scope → (caller checks the workflow rule). Hiding a button is never the guard (F5). */
  require(perm: Perm, scope: ScopeContext = {}) {
    if (this.actorId === 'system') return;
    if (!allows(this.me, perm, scope)) {
      const label = PERMISSIONS.find((p) => p.key === perm)?.label ?? perm;
      this.fail(`لا تملك صلاحية «${label}» على هذا السجل (${perm})`);
    }
  }

  /** F6: the decision belongs to a holder of `perm` who is not a party to the request (else the CEO). */
  requireApprover(perm: Perm, parties: (UserId | undefined)[], scope: ScopeContext = {}) {
    if (this.actorId === 'system') return;
    this.check(!parties.includes(this.actorId), 'لا يعتمد أحد طلبه بنفسه — القرار لمعتمد آخر (F6)');
    if (approverIds(this.s, perm, parties, scope).includes(this.actorId)) return;
    this.require(perm, scope);
    this.fail('ليس دورك في اعتماد هذا الطلب');
  }

  /** Next number from the shared numbering, e.g. PRJ-2026-0007; a yearly series restarts with the Riyadh year. */
  nextId(prefix: string, width = 4, yearly = true): string {
    const key = yearly ? `${prefix}-${dateKey(this.now).slice(0, 4)}` : prefix;
    const n = (this.s.seq[key] ?? 0) + 1;
    this.s.seq[key] = n;
    return `${key}-${String(n).padStart(width, '0')}`;
  }

  event(type: string, entity: { type: string; id: string }, summary: string, projectId?: string) {
    this.s.events.push({
      id: this.nextId('EVT', 6, false),
      at: this.now,
      actorId: this.actorId,
      type,
      entity,
      projectId,
      summary,
    });
  }

  /** Tell the people who must act, never the actor; an inactive or unknown id is dropped. */
  notify(userIds: (UserId | undefined)[], n: NoteInput) {
    const ids = [...new Set(userIds.filter((u): u is UserId => !!u && u !== this.actorId))];
    for (const userId of ids) {
      if (!this.s.users.some((u) => u.id === userId)) continue;
      this.s.notifications.unshift({
        id: this.nextId('NTF', 6, false),
        userId,
        at: this.now,
        title: n.title,
        body: n.body,
        link: n.link,
        eventType: n.type,
        read: false,
      });
    }
  }

  /** Holders of a permission at any scope that reaches the given departments. */
  holders(perm: Perm, depts?: (string | undefined)[]): UserId[] {
    return this.s.users
      .filter((u) => allows(u, perm, { depts: depts as ScopeContext['depts'] }))
      .map((u) => u.id);
  }

  deptManager(dept?: string): UserId | undefined {
    return this.s.users.find((u) => isActive(u) && hasRole(u, 'dept_manager') && inDept(u, dept as DeptCode))?.id;
  }

  directors(): UserId[] {
    return this.s.users.filter((u) => isActive(u) && hasRole(u, 'main_dept_manager')).map((u) => u.id);
  }

  ceos(): UserId[] {
    return this.s.users.filter((u) => isActive(u) && hasRole(u, 'ceo')).map((u) => u.id);
  }

  finance(): UserId[] {
    return this.s.users.filter((u) => isActive(u) && hasRole(u, 'accountant')).map((u) => u.id);
  }

  salesManagers(): UserId[] {
    return this.s.users.filter((u) => isActive(u) && hasRole(u, 'sales_manager')).map((u) => u.id);
  }

  project(id: string): Project {
    return this.s.projects.find((p) => p.id === id) ?? this.fail(`مشروع غير موجود: ${id}`);
  }

  deliverable(id: string): Deliverable {
    return this.s.deliverables.find((d) => d.id === id) ?? this.fail(`مخرج غير موجود: ${id}`);
  }

  payment(id: string): PaymentItem {
    return this.s.payments.find((p) => p.id === id) ?? this.fail(`دفعة غير موجودة: ${id}`);
  }

  gov(id: string): GovTransaction {
    return this.s.gov.find((g) => g.id === id) ?? this.fail(`معاملة غير موجودة: ${id}`);
  }

  task(id: string): Task {
    return this.s.tasks.find((t) => t.id === id) ?? this.fail(`مهمة غير موجودة: ${id}`);
  }

  visit(id: string): Visit {
    return this.s.visits.find((v) => v.id === id) ?? this.fail(`زيارة غير موجودة: ${id}`);
  }

  cost(id: string): CostRequest {
    return this.s.costs.find((c) => c.id === id) ?? this.fail(`طلب تكلفة غير موجود: ${id}`);
  }

  oppOwnerOf(p: Project): UserId | undefined {
    if (p.opportunityId) return this.s.opportunities.find((o) => o.id === p.opportunityId)?.ownerId;
    return p.followUpOwnerId;
  }

  /** F15 / A2: under a CEO exception, work outside the allowed quotation lines waits for finance approval. */
  requireExceptionScope(p: Project, itemIds: (string | undefined)[], what: string) {
    const scope = exceptionScope(this.s, p);
    if (scope.inScope(itemIds)) return;
    const allowed = p.scopeItems.filter((i) => scope.allowedItemIds.includes(i.id)).map((i) => i.title).join('، ');
    this.fail(`${what} خارج النطاق المسموح في استثناء الرئيس التنفيذي (${scope.exception?.id}) — المسموح قبل الاعتماد المالي: ${allowed || '—'}`);
  }

  isPm(p: Project) {
    return this.actorId !== 'system' && p.pmId === this.actorId;
  }

  projectDepts(p: Project) {
    return p.departments.map((d) => d.deptCode);
  }

  addMember(p: Project, userId: UserId, capacity: Project['members'][number]['capacity'], deptCode?: Project['leadDept']) {
    if (!p.members.some((m) => m.userId === userId && m.capacity === capacity)) {
      p.members.push({ userId, capacity, deptCode, since: this.now });
    }
  }

  /**
   * AC-15 / F16: dropping a capacity drops the access it gave, from the next request — in the ERP
   * and, through the ACL sync, in the project space. Nothing else about the person changes.
   */
  dropMember(p: Project, userId: UserId | undefined, capacity: Project['members'][number]['capacity'], why: string) {
    if (!userId || !p.members.some((m) => m.userId === userId && m.capacity === capacity)) return;
    p.members = p.members.filter((m) => !(m.userId === userId && m.capacity === capacity));
    const gone = !p.members.some((m) => m.userId === userId);
    this.event('project.member_removed', { type: 'project', id: p.id }, `سُحبت صفة ${this.user(userId).name} في المشروع: ${why}${gone ? ' — لم يعد عضوًا' : ''}`, p.id);
    if (gone && p.nextcloud.status === 'open') {
      p.nextcloud.lastSyncAt = this.now;
      this.event('nextcloud.acl_synced', { type: 'project', id: p.id }, `مُزامنة الصلاحيات: سُحب وصول ${this.user(userId).name} إلى مساحة ${p.nextcloud.path}`, p.id);
    }
  }

  /**
   * A task generated by another flow, keyed by (source, id, purpose): replaying the source
   * returns the existing task instead of creating a second one (F11, TK-11, AC-10).
   */
  generateTask(input: {
    dedupeKey: string;
    title: string;
    ownerId: UserId;
    dueDays: number;
    link?: RecordLink;
    source: Task['source'];
    priority?: Task['priority'];
    creatorId?: UserId;
  }): Task {
    const existing = this.s.tasks.find((t) => t.dedupeKey === input.dedupeKey);
    if (existing) return existing;
    const t: Task = {
      id: this.nextId('TSK'),
      title: input.title,
      ownerId: input.ownerId,
      creatorId: input.creatorId ?? (this.actorId === 'system' ? input.ownerId : this.actorId),
      dueDate: addCalendarDays(this.now, input.dueDays),
      priority: input.priority ?? 'medium',
      status: 'new',
      link: input.link,
      contributors: [],
      comments: [],
      attachments: [],
      reassignLog: [],
      dedupeKey: input.dedupeKey,
      source: input.source,
      escalations: [],
      createdAt: this.now,
    };
    this.s.tasks.push(t);
    this.event('task.generated', { type: 'task', id: t.id }, `مهمة مولّدة: ${t.title}`, input.link?.projectId);
    this.notify([t.ownerId], { title: `مهمة جديدة: ${t.title}`, link: `/work?task=${t.id}`, type: 'task.created' });
    return t;
  }
}

export const randomHex = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
