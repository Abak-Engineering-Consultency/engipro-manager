import { addCalendarDays, addDays, daysBetween, isAfter } from '../calendar';
import { serviceByCode, PLAN_TEMPLATES, deptName } from '../catalog';
import { TIME_BASED } from '../labels';
import { schedulePhases } from '../schedule';
import { startGate } from '../selectors';
import type {
  ApprovalChain, ApprovalDecision, ChainStep, ChangeRequest, DeptCode, Deliverable, ISO, PaymentItem, Phase,
  Project, ProjectState, Quotation, ScopeItem, Suspension, UserId,
} from '../types';
import { Ctx } from './core';
import { checkPaymentConditions, checkTechnicalCompletion } from './delivery';
import { createGovForDeliverable } from './gov';

const link = (p: Project) => `/projects/${p.id}`;

// ── Creation: activation, CEO exception, paid additions (PJ-01…03, F1, F2, AD-01) ─────────────

function scopeAndDeliverables(ctx: Ctx, p: Project, q: Quotation, origin: ScopeItem['origin']) {
  for (const line of q.lines) {
    const site = line.siteName ? p.sites.find((s) => s.name === line.siteName) : undefined;
    const item: ScopeItem = {
      id: `${p.id}-I${p.scopeItems.length + 1}`,
      sourceLineId: line.id,
      quotationId: q.id,
      title: line.title,
      serviceCode: line.serviceCode,
      deptCode: line.deptCode,
      siteId: site?.id,
      origin,
    };
    p.scopeItems.push(item);
    const svc = serviceByCode(line.serviceCode);
    for (const d of svc?.deliverables ?? [{ title: line.title, technical: true }]) {
      ctx.s.deliverables.push({
        id: `DLV-${p.id.slice(4)}-${String(ctx.s.deliverables.filter((x) => x.projectId === p.id).length + 1).padStart(2, '0')}`,
        projectId: p.id,
        title: site ? `${d.title} — ${site.name}` : d.title,
        scopeItemIds: [item.id],
        deptCode: line.deptCode,
        siteId: site?.id,
        technical: d.technical,
        requiresGov: !!d.gov,
        status: p.status === 'in_progress' ? 'in_preparation' : 'not_started',
        revisions: [],
        origin,
      });
    }
  }
  for (const pay of q.payments) {
    const lineItem = pay.beforeDeliveryOfLineId ? p.scopeItems.find((i) => i.sourceLineId === pay.beforeDeliveryOfLineId) : undefined;
    const before = lineItem ? ctx.s.deliverables.filter((d) => d.scopeItemIds.includes(lineItem.id)).map((d) => d.id) : undefined;
    const item: PaymentItem = {
      id: `FPS-${p.id.slice(4)}-${ctx.s.payments.filter((x) => x.projectId === p.id).length + 1}`,
      projectId: p.id,
      quotationId: q.id,
      label: pay.label,
      amount: pay.amount,
      condition: pay.condition,
      link: { kind: 'none', ids: [] },
      scheduledDate: pay.dueDate,
      graceDays: pay.graceDays,
      beforeDeliveryOf: before,
      entitlement: 'not_due',
      evidence: [],
      evidenceCheck: 'none',
      invoicing: 'not_invoiced',
      collection: 'unpaid',
      collected: 0,
      receipts: [],
      followUps: [],
    };
    ctx.s.payments.push(item);
  }
}

function createProject(ctx: Ctx, opportunityId: string, q: Quotation, from: Project['createdFrom'], extra: Partial<Project>): Project {
  const opp = ctx.s.opportunities.find((o) => o.id === opportunityId) ?? ctx.fail('فرصة غير موجودة');
  const client = ctx.s.clients.find((c) => c.id === opp.clientId);
  const depts = [...new Set(q.lines.map((l) => l.deptCode))];
  const siteNames = [...new Set(q.lines.map((l) => l.siteName).filter((x): x is string => !!x))];
  const id = ctx.nextId('PRJ');
  const p: Project = {
    id,
    title: opp.title,
    clientId: opp.clientId,
    opportunityId: opp.id,
    contracts: [{ quotationId: q.id, kind: 'original', linkedAt: ctx.now }],
    activationIds: [],
    createdFrom: from,
    createdAt: ctx.now,
    status: 'awaiting_assignment',
    financialState: 'open',
    multiDept: depts.length > 1,
    departments: depts.map((d) => ({ deptCode: d, managerId: ctx.deptManager(d) ?? '', status: 'active', joinedAt: ctx.now })),
    members: [{ userId: opp.ownerId, capacity: 'opportunity_owner', since: ctx.now }],
    sites: (siteNames.length ? siteNames : [`الموقع الرئيسي — ${client?.city ?? ''}`]).map((name, i) => ({ id: `${id}-S${i + 1}`, name, city: client?.city ?? '' })),
    scopeItems: [],
    phases: [],
    tracks: [],
    dayType: q.dayType,
    kickoff: { required: q.kickoffRequired, status: 'not_held' },
    paymentMapping: { status: 'draft' },
    suspensions: [],
    dateChanges: [],
    changeRequests: [],
    nextcloud: { status: 'not_created' },
    responseDays: q.responseDays ?? ctx.s.settings.clientResponseDays,
    deemedAcceptanceClause: q.deemedAcceptanceClause,
    ...extra,
  };
  ctx.s.projects.push(p);
  scopeAndDeliverables(ctx, p, q, 'contract');
  ctx.event('project.created', { type: 'project', id }, `أُنشئ المشروع آليًا (${from === 'exception' ? 'باستثناء الرئيس التنفيذي' : 'بعد الاعتماد المالي'}) من العرض ${q.id} ${q.revision}`, id);
  ctx.notify(ctx.directors(), { title: `مشروع جديد بانتظار الاستلام: ${p.title}`, body: `${id} — من العرض ${q.id}`, link: link(p), type: 'project.created' });
  return p;
}

/** F1: one project per contract; a repeated event links instead of creating a second project. */
export function ensureProjectForActivation(ctx: Ctx, activationId: string): Project {
  const act = ctx.s.activations.find((a) => a.id === activationId) ?? ctx.fail('طلب تفعيل غير موجود');
  ctx.check(act.status === 'approved', 'التفعيل غير معتمد ماليًا');
  if (act.projectId) return ctx.project(act.projectId);
  const q = ctx.s.quotations.find((x) => x.id === act.quotationId) ?? ctx.fail('عرض غير موجود');

  if (q.kind === 'paid_addition') {
    const p = ctx.s.projects.find((x) => x.opportunityId === act.opportunityId) ?? ctx.fail('لا يوجد مشروع مرتبط بالإضافة');
    p.contracts.push({ quotationId: q.id, kind: 'paid_addition', linkedAt: ctx.now });
    p.activationIds.push(act.id);
    scopeAndDeliverables(ctx, p, q, 'paid_addition');
    for (const ni of p.scopeItems.filter((i) => i.quotationId === q.id)) {
      if (!p.departments.some((d) => d.deptCode === ni.deptCode)) {
        p.departments.push({ deptCode: ni.deptCode, managerId: ctx.deptManager(ni.deptCode) ?? '', status: 'joining', joinedAt: ctx.now });
        p.multiDept = true;
      }
    }
    const cr = p.changeRequests.find((c) => c.kind === 'paid_addition' && c.quotationId === q.id);
    if (cr) cr.status = 'linked';
    act.projectId = p.id;
    ctx.event('project.contract_linked', { type: 'project', id: p.id }, `رُبطت الإضافة المدفوعة ${q.id} بنفس المشروع — عرض ودفعات مستقلة، والعرض الأصلي لم يتغير`, p.id);
    ctx.notify([p.pmId, ...ctx.directors(), ...p.departments.map((d) => d.managerId)], {
      title: `إضافة مدفوعة رُبطت بالمشروع ${p.id}`, body: 'بنود جديدة تحتاج تعيين مسؤولين', link: link(p), type: 'project.contract_linked',
    });
    return p;
  }

  const existing = ctx.s.projects.find((x) => x.opportunityId === act.opportunityId && x.contracts.some((c) => c.quotationId === q.id));
  if (existing) {
    existing.activationIds.push(act.id);
    act.projectId = existing.id;
    const exc = existing.exceptionId ? ctx.s.exceptions.find((e) => e.id === existing.exceptionId) : undefined;
    if (exc) exc.status = 'linked';
    ctx.event('project.activation_linked', { type: 'project', id: existing.id }, `اعتماد المالية رُبط بنفس المشروع (لا مشروع ثانٍ)`, existing.id);
    ctx.notify([existing.pmId, ...ctx.directors(), ...ctx.ceos()], { title: `اكتمل الاعتماد المالي للمشروع ${existing.id}`, body: 'انتهى العمل بالاستثناء', link: link(existing), type: 'exception.linked' });
    return existing;
  }
  const p = createProject(ctx, act.opportunityId, q, 'activation', {});
  p.activationIds.push(act.id);
  act.projectId = p.id;
  return p;
}

export const projectCommands = {
  /** Existing ERP step 16: finance decides on the activation request. */
  'activation.approve'(ctx: Ctx, p: { activationId: string; note?: string }) {
    ctx.require('activation.approve');
    const act = ctx.s.activations.find((a) => a.id === p.activationId) ?? ctx.fail('طلب تفعيل غير موجود');
    ctx.check(act.status === 'pending_finance', 'تم البت في هذا الطلب');
    act.status = 'approved';
    act.decidedBy = ctx.actorId as UserId;
    act.decidedAt = ctx.now;
    act.note = p.note;
    ctx.event('activation.approved', { type: 'activation', id: act.id }, 'اعتمدت المالية التفعيل');
    const opp = ctx.s.opportunities.find((o) => o.id === act.opportunityId);
    ctx.notify([opp?.ownerId], { title: `اعتمدت المالية تفعيل ${opp?.title ?? ''}`, type: 'activation.approved' });
    return ensureProjectForActivation(ctx, act.id).id;
  },

  'activation.return'(ctx: Ctx, p: { activationId: string; note: string }) {
    ctx.require('activation.approve');
    const act = ctx.s.activations.find((a) => a.id === p.activationId) ?? ctx.fail('طلب تفعيل غير موجود');
    ctx.check(act.status === 'pending_finance', 'تم البت في هذا الطلب');
    ctx.check(p.note?.trim(), 'سبب الإعادة مطلوب');
    act.status = 'returned';
    act.decidedBy = ctx.actorId as UserId;
    act.decidedAt = ctx.now;
    act.note = p.note;
    ctx.event('activation.returned', { type: 'activation', id: act.id }, `أعادت المالية الطلب: ${p.note}`);
    ctx.notify([act.requestedBy], { title: 'أعادت المالية طلب التفعيل', body: p.note, type: 'activation.returned' });
  },

  /** AC-01: processing the same approval twice must not create a second project. */
  'activation.replay'(ctx: Ctx, p: { activationId: string }) {
    ctx.require('activation.approve');
    const before = ctx.s.projects.length;
    const proj = ensureProjectForActivation(ctx, p.activationId);
    ctx.check(ctx.s.projects.length === before, 'خطأ: أُنشئ مشروع مكرر');
    ctx.event('activation.replayed', { type: 'activation', id: p.activationId }, `أُعيدت معالجة حدث الاعتماد — لم يُنشأ مشروع ثانٍ (${proj.id})`, proj.id);
    return proj.id;
  },

  'exception.request'(ctx: Ctx, p: { opportunityId: string; reason: string; commitmentDoc: string; allowedScope: string; allowedLineIds: string[]; durationDays: number; costCap: number }) {
    const me = ctx.me;
    ctx.check(me.roleId === 'dept_manager' || me.roleId === 'main_dept_manager', 'يرفع طلب الاستثناء مدير القسم أو مدير الأقسام');
    const act = ctx.s.activations.find((a) => a.opportunityId === p.opportunityId && a.status === 'pending_finance');
    ctx.check(act, 'لا يوجد طلب تفعيل بانتظار المالية لهذه الفرصة');
    ctx.check(!ctx.s.projects.some((x) => x.opportunityId === p.opportunityId), 'للفرصة مشروع قائم — لا استثناء ينشئ مشروعًا ثانيًا (F1)');
    ctx.check(!ctx.s.exceptions.some((e) => e.opportunityId === p.opportunityId && ['requested', 'granted'].includes(e.status)), 'يوجد استثناء قائم لهذه الفرصة');
    ctx.check(p.reason.trim() && p.commitmentDoc.trim() && p.allowedScope.trim(), 'السبب ومستند التعميد ووصف النطاق المسموح مطلوبة');
    const lines = ctx.s.quotations.find((q) => q.id === act.quotationId)?.lines ?? [];
    ctx.check(p.allowedLineIds?.length, 'حدد بنود العرض المسموح العمل عليها قبل الاعتماد المالي');
    ctx.check(p.allowedLineIds.every((id) => lines.some((l) => l.id === id)), 'البنود المسموحة يجب أن تكون من عرض نفس الفرصة');
    ctx.check(p.durationDays > 0 && p.costCap > 0, 'المدة وسقف التكلفة مطلوبان');
    const id = ctx.nextId('EXC');
    ctx.s.exceptions.push({
      id, opportunityId: p.opportunityId, quotationId: act.quotationId, requestedBy: me.id, requestedAt: ctx.now,
      reason: p.reason, commitmentDoc: p.commitmentDoc, allowedScope: p.allowedScope, allowedLineIds: p.allowedLineIds, durationDays: p.durationDays,
      costCap: p.costCap, status: 'requested', renewals: [],
    });
    ctx.event('exception.requested', { type: 'exception', id }, `طلب استثناء بدء قبل الاعتماد المالي: ${p.reason}`);
    ctx.notify(ctx.ceos(), { title: 'طلب استثناء بدء قبل الاعتماد المالي', body: p.reason, link: '/intake', type: 'exception.requested' });
    return id;
  },

  'exception.decide'(ctx: Ctx, p: { exceptionId: string; decision: 'granted' | 'rejected'; note: string }) {
    ctx.require('project.grant_exception');
    const exc = ctx.s.exceptions.find((e) => e.id === p.exceptionId) ?? ctx.fail('استثناء غير موجود');
    ctx.check(exc.status === 'requested', 'تم البت في هذا الاستثناء');
    exc.decidedBy = ctx.actorId as UserId;
    exc.decidedAt = ctx.now;
    exc.decisionNote = p.note;
    if (p.decision === 'rejected') {
      ctx.check(p.note.trim(), 'سبب الرفض مطلوب');
      exc.status = 'rejected';
      ctx.event('exception.rejected', { type: 'exception', id: exc.id }, `رفض الرئيس التنفيذي الاستثناء: ${p.note}`);
      ctx.notify([exc.requestedBy], { title: 'رُفض طلب الاستثناء', body: p.note, type: 'exception.rejected' });
      return;
    }
    exc.status = 'granted';
    exc.expiresAt = addCalendarDays(ctx.now, exc.durationDays);
    exc.lastCeoAlertAt = ctx.now;
    const q = ctx.s.quotations.find((x) => x.id === exc.quotationId) ?? ctx.fail('عرض غير موجود');
    const proj = createProject(ctx, exc.opportunityId, q, 'exception', { exceptionId: exc.id });
    exc.projectId = proj.id;
    ctx.event('exception.granted', { type: 'exception', id: exc.id }, `منح الرئيس التنفيذي استثناء ${exc.durationDays} يومًا بسقف تكلفة ${exc.costCap}`, proj.id);
    ctx.notify([...ctx.finance(), ...ctx.directors(), exc.requestedBy], { title: `استثناء بدء معتمد — ${proj.id}`, body: `ينتهي بعد ${exc.durationDays} يومًا`, link: link(proj), type: 'exception.granted' });
    return proj.id;
  },

  'exception.renew'(ctx: Ctx, p: { exceptionId: string; days: number; extraCap: number; note: string }) {
    ctx.require('project.grant_exception');
    const exc = ctx.s.exceptions.find((e) => e.id === p.exceptionId) ?? ctx.fail('استثناء غير موجود');
    ctx.check(['granted', 'expired'].includes(exc.status), 'الاستثناء ليس ساريًا ولا منتهيًا');
    ctx.check(p.note.trim(), 'سبب التمديد مطلوب');
    exc.renewals.push({ at: ctx.now, by: ctx.actorId as UserId, days: p.days, extraCap: p.extraCap, note: p.note });
    exc.expiresAt = addCalendarDays(isAfter(exc.expiresAt, ctx.now) ? exc.expiresAt! : ctx.now, p.days);
    exc.costCap += p.extraCap;
    exc.status = 'granted';
    const proj = exc.projectId ? ctx.project(exc.projectId) : undefined;
    if (proj?.status === 'suspended' && proj.suspension?.type === 'payment') resumeProject(ctx, proj, 'تمديد الاستثناء');
    ctx.event('exception.renewed', { type: 'exception', id: exc.id }, `مُدّد الاستثناء ${p.days} يومًا وزيد السقف ${p.extraCap}`, exc.projectId);
    ctx.notify([...ctx.finance(), ...ctx.directors(), proj?.pmId], { title: `مُدّد استثناء ${exc.projectId}`, body: p.note, type: 'exception.renewed' });
  },

  // ── Receipt and assignment (PJ-04, PJ-05, A1) ────────────────────────────────────

  'project.receive'(ctx: Ctx, p: { projectId: string; leadDept: DeptCode; departments: DeptCode[]; note?: string }) {
    ctx.require('project.assign_manager');
    const proj = ctx.project(p.projectId);
    ctx.check(proj.status === 'awaiting_assignment' && !proj.receivedAt, 'المشروع مستلم مسبقًا');
    ctx.check(p.departments.length > 0 && p.departments.includes(p.leadDept), 'حدد الأقسام المشاركة والقسم الرئيسي');
    proj.departments = p.departments.map((d) => proj.departments.find((x) => x.deptCode === d) ?? { deptCode: d, managerId: ctx.deptManager(d) ?? '', status: 'active', joinedAt: ctx.now });
    proj.multiDept = p.departments.length > 1;
    proj.leadDept = p.leadDept;
    proj.receivedAt = ctx.now;
    proj.receivedBy = ctx.actorId as UserId;
    const lead = ctx.deptManager(p.leadDept);
    ctx.event('project.received', { type: 'project', id: proj.id }, `استلم مدير الأقسام المشروع — ${proj.multiDept ? 'متعدد الأقسام' : 'قسم واحد'}، القسم الرئيسي: ${deptName(p.leadDept)}`, proj.id);
    ctx.notify([lead], { title: `رشّح مدير المشروع: ${proj.title}`, body: proj.id, link: link(proj), type: 'project.received' });
  },

  'project.nominate_pm'(ctx: Ctx, p: { projectId: string; nomineeId: UserId }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.staff', { depts: [proj.leadDept] });
    ctx.check(proj.status === 'awaiting_assignment' && proj.receivedAt, 'المشروع لم يُستلم بعد من مدير الأقسام');
    ctx.check(!proj.pmNomination || proj.pmNomination.status === 'returned', 'يوجد ترشيح بانتظار الاعتماد');
    const nominee = ctx.user(p.nomineeId);
    ctx.check(['engineer', 'dept_manager'].includes(nominee.roleId), 'المرشح يجب أن يكون مهندسًا أو مدير قسم');
    proj.pmNomination = { nomineeId: p.nomineeId, nominatedBy: ctx.actorId as UserId, at: ctx.now, status: 'pending' };
    ctx.event('project.manager_nominated', { type: 'project', id: proj.id }, `رُشّح ${nominee.name} مديرًا للمشروع`, proj.id);
    ctx.notify(ctx.directors(), { title: `اعتمد مدير المشروع: ${proj.title}`, body: `المرشح: ${nominee.name}`, link: link(proj), type: 'project.manager_nominated' });
  },

  'project.decide_pm'(ctx: Ctx, p: { projectId: string; decision: 'approved' | 'returned'; note?: string }) {
    ctx.require('project.assign_manager');
    const proj = ctx.project(p.projectId);
    const nom = proj.pmNomination;
    ctx.check(nom?.status === 'pending', 'لا يوجد ترشيح بانتظار الاعتماد');
    nom.status = p.decision;
    nom.note = p.note;
    if (p.decision === 'returned') {
      ctx.check(p.note?.trim(), 'سبب الإعادة مطلوب');
      ctx.event('project.manager_returned', { type: 'project', id: proj.id }, `أُعيد الترشيح: ${p.note}`, proj.id);
      ctx.notify([nom.nominatedBy], { title: `أُعيد ترشيح مدير المشروع ${proj.id}`, body: p.note, link: link(proj), type: 'project.manager_returned' });
      return;
    }
    proj.pmId = nom.nomineeId;
    const pmDept = ctx.user(nom.nomineeId).deptCode;
    ctx.addMember(proj, nom.nomineeId, 'project_manager', pmDept);
    for (const d of proj.departments) if (d.managerId) ctx.addMember(proj, d.managerId, 'dept_manager', d.deptCode);
    proj.status = 'preparing';
    // NX-01: create or link the project space with a stable id, set ACL, then open it.
    proj.nextcloud = { status: 'open', path: `ABAK Projects/${proj.id}`, folderId: `NC-${proj.id}`, lastSyncAt: ctx.now };
    ctx.event('project.manager_approved', { type: 'project', id: proj.id }, `اعتمد مدير الأقسام ${ctx.user(nom.nomineeId).name} مديرًا للمشروع — الحالة: تجهيز`, proj.id);
    ctx.event('nextcloud.space_opened', { type: 'project', id: proj.id }, `أُنشئت مساحة ${proj.nextcloud.path} وطُبّقت الصلاحيات قبل فتحها`, proj.id);
    ctx.notify([proj.pmId, ...proj.departments.map((d) => d.managerId), ctx.oppOwnerOf(proj)], {
      title: `تم تعيين مدير المشروع: ${proj.title}`, body: `${ctx.user(nom.nomineeId).name} — ابدأ التجهيز`, link: link(proj), type: 'project.manager_approved',
    });
  },

  'project.assign_owner'(ctx: Ctx, p: { projectId: string; scopeItemId: string; ownerId: UserId }) {
    const proj = ctx.project(p.projectId);
    const item = proj.scopeItems.find((i) => i.id === p.scopeItemId) ?? ctx.fail('بند غير موجود');
    ctx.require('project.staff', { depts: [item.deptCode] });
    ctx.check(['preparing', 'in_progress', 'suspended'].includes(proj.status), 'لا يمكن تعيين مسؤولين في هذه الحالة');
    const owner = ctx.user(p.ownerId);
    ctx.check(owner.deptCode === item.deptCode, 'مسؤول البند يجب أن يكون من نفس القسم');
    item.ownerId = p.ownerId;
    ctx.addMember(proj, p.ownerId, 'item_owner', item.deptCode);
    const da = proj.departments.find((d) => d.deptCode === item.deptCode);
    if (da?.status === 'joining' && proj.scopeItems.filter((i) => i.deptCode === item.deptCode).every((i) => i.ownerId)) da.status = 'active';
    ctx.event('project.owner_assigned', { type: 'scope_item', id: item.id }, `عُيّن ${owner.name} مسؤولًا عن «${item.title}»`, proj.id);
    ctx.notify([p.ownerId, proj.pmId], { title: `أنت مسؤول بند في ${proj.id}`, body: item.title, link: link(proj), type: 'project.owner_assigned' });
  },

  // ── Preparation (PJ-06…PJ-08) ─────────────────────────────────────────────────

  'project.add_site'(ctx: Ctx, p: { projectId: string; name: string; city: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    ctx.check(p.name.trim(), 'اسم الموقع مطلوب');
    proj.sites.push({ id: `${proj.id}-S${proj.sites.length + 1}`, name: p.name.trim(), city: p.city });
    ctx.event('project.site_added', { type: 'project', id: proj.id }, `أُضيف موقع: ${p.name}`, proj.id);
  },

  'project.set_item_site'(ctx: Ctx, p: { projectId: string; scopeItemId: string; siteId?: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    const item = proj.scopeItems.find((i) => i.id === p.scopeItemId) ?? ctx.fail('بند غير موجود');
    item.siteId = p.siteId || undefined;
    for (const d of ctx.s.deliverables.filter((x) => x.scopeItemIds.includes(item.id))) d.siteId = item.siteId;
  },

  'project.set_day_type'(ctx: Ctx, p: { projectId: string; dayType: 'working' | 'calendar' }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    ctx.check(proj.status === 'preparing', 'نوع الأيام يُحدد أثناء التجهيز');
    proj.dayType = p.dayType;
    ctx.event('project.day_type', { type: 'project', id: proj.id }, `نوع الأيام حسب العقد: ${p.dayType === 'working' ? 'أيام عمل' : 'أيام تقويمية'}`, proj.id);
  },

  'project.apply_template'(ctx: Ctx, p: { projectId: string; templateId: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    const tpl = PLAN_TEMPLATES.find((t) => t.id === p.templateId) ?? ctx.fail('قالب غير موجود');
    let prev: string | undefined;
    for (const ph of tpl.phases) {
      const phase: Phase = { id: `${proj.id}-P${proj.phases.length + 1}`, name: ph.name, order: proj.phases.length + 1, tasks: [] };
      ph.tasks.forEach((t, i) => {
        const id = `${phase.id}-T${i + 1}`;
        phase.tasks.push({ id, name: t.name, duration: t.duration, dependencies: prev ? [prev] : [], done: false });
        prev = id;
      });
      proj.phases.push(phase);
    }
    ctx.event('project.plan_template', { type: 'project', id: proj.id }, `طُبّق قالب الخطة «${tpl.name}» — القالب لا يغيّر النطاق التعاقدي`, proj.id);
  },

  'project.plan_from_items'(ctx: Ctx, p: { projectId: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    const groups = new Map<string, ScopeItem[]>();
    for (const i of proj.scopeItems) groups.set(i.siteId ?? '', [...(groups.get(i.siteId ?? '') ?? []), i]);
    for (const [siteId, items] of groups) {
      const site = proj.sites.find((s) => s.id === siteId);
      const phase: Phase = { id: `${proj.id}-P${proj.phases.length + 1}`, name: site ? `أعمال ${site.name}` : 'أعمال مشتركة', order: proj.phases.length + 1, siteId: siteId || undefined, tasks: [] };
      items.forEach((it, i) => phase.tasks.push({ id: `${phase.id}-T${i + 1}`, name: it.title, scopeItemId: it.id, ownerId: it.ownerId, duration: 10, dependencies: [], done: false }));
      proj.phases.push(phase);
    }
    ctx.event('project.plan_items', { type: 'project', id: proj.id }, 'أُنشئت الخطة من بنود العرض', proj.id);
  },

  'project.save_plan'(ctx: Ctx, p: { projectId: string; phases: Phase[] }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    ctx.check(!['operationally_closed', 'cancelled'].includes(proj.status), 'المشروع مغلق');
    const ids = new Set(p.phases.flatMap((ph) => ph.tasks.map((t) => t.id)));
    for (const t of p.phases.flatMap((ph) => ph.tasks)) {
      ctx.check(t.name.trim(), 'اسم المهمة مطلوب');
      ctx.check(t.dependencies.every((d) => ids.has(d) && d !== t.id), `اعتمادية غير صالحة في «${t.name}»`);
    }
    proj.phases = proj.startedAt ? schedulePhases(proj.startedAt, p.phases, proj.dayType, ctx.s.settings) : p.phases;
    ctx.event('project.plan_saved', { type: 'project', id: proj.id }, 'حُدّثت خطة التنفيذ', proj.id);
  },

  'project.submit_payment_links'(ctx: Ctx, p: { projectId: string; links: { paymentId: string; kind: PaymentItem['link']['kind']; ids: string[] }[] }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    ctx.check(['preparing', 'in_progress', 'suspended'].includes(proj.status), 'لا يمكن تعديل ربط الدفعات في هذه الحالة');
    ctx.check(proj.paymentMapping.status !== 'submitted', 'الربط بانتظار قرار المالية');
    for (const l of p.links) {
      const pay = ctx.payment(l.paymentId);
      ctx.check(pay.projectId === proj.id, 'دفعة لا تخص هذا المشروع');
      if (TIME_BASED.includes(pay.condition)) {
        ctx.check(l.kind !== 'deliverables', `«${pay.label}» دفعة زمنية — لا تُربط بمخرج`);
      } else {
        ctx.check(l.kind !== 'none' && l.ids.length > 0, `«${pay.label}» تحتاج ربطًا بمخرج أو بنود أو مرحلة حسب شرطها`);
      }
      const valid = l.kind === 'deliverables' ? l.ids.every((id) => ctx.s.deliverables.some((d) => d.id === id && d.projectId === proj.id))
        : l.kind === 'items' ? l.ids.every((id) => proj.scopeItems.some((i) => i.id === id))
          : l.kind === 'phase' ? l.ids.every((id) => proj.phases.some((ph) => ph.id === id)) : true;
      ctx.check(valid, 'ربط بسجل لا يخص المشروع');
      pay.link = { kind: l.kind, ids: l.ids };
    }
    proj.paymentMapping = { status: 'submitted', submittedAt: ctx.now };
    ctx.event('project.payment_links_submitted', { type: 'project', id: proj.id }, 'أُرسل ربط الدفعات للمالية — دون دفعات جديدة أو تغيير قيم', proj.id);
    ctx.notify(ctx.finance(), { title: `تحقق من ربط الدفعات: ${proj.id}`, body: proj.title, link: `${link(proj)}?tab=payments`, type: 'project.payment_links_submitted' });
  },

  'project.decide_payment_links'(ctx: Ctx, p: { projectId: string; decision: 'confirmed' | 'returned'; note?: string }) {
    ctx.require('payment.verify_entitlement');
    const proj = ctx.project(p.projectId);
    ctx.check(proj.paymentMapping.status === 'submitted', 'لا يوجد ربط بانتظار التحقق');
    if (p.decision === 'returned') ctx.check(p.note?.trim(), 'ملاحظة الإعادة مطلوبة');
    proj.paymentMapping = { ...proj.paymentMapping, status: p.decision, decidedBy: ctx.actorId as UserId, decidedAt: ctx.now, note: p.note };
    ctx.event(`project.payment_links_${p.decision}`, { type: 'project', id: proj.id }, p.decision === 'confirmed' ? 'أكدت المالية ربط الدفعات بالاتفاق' : `أعادت المالية ربط الدفعات: ${p.note}`, proj.id);
    ctx.notify([proj.pmId], { title: p.decision === 'confirmed' ? `المالية أكدت ربط الدفعات — ${proj.id}` : `المالية أعادت ربط الدفعات — ${proj.id}`, body: p.note, link: `${link(proj)}?tab=payments`, type: 'project.payment_links' });
    if (p.decision === 'confirmed' && proj.status === 'in_progress') checkPaymentConditions(ctx, proj);
  },

  'project.hold_kickoff'(ctx: Ctx, p: { projectId: string; minutes: string; attendees: UserId[]; actions: { title: string; ownerId: UserId; dueDays: number }[] }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.prepare', { own: ctx.isPm(proj) });
    ctx.check(p.minutes.trim(), 'محضر الاجتماع مطلوب');
    proj.kickoff = { ...proj.kickoff, status: 'held', heldAt: ctx.now, minutes: p.minutes, attendees: p.attendees };
    p.actions.forEach((a, i) => {
      if (!a.title.trim()) return;
      ctx.generateTask({
        dedupeKey: `kickoff:${proj.id}:${i}`, title: a.title, ownerId: a.ownerId, dueDays: a.dueDays, source: 'kickoff',
        link: { type: 'project', id: proj.id, label: proj.title, projectId: proj.id },
      });
    });
    ctx.event('project.kickoff_held', { type: 'project', id: proj.id }, `عُقد الاجتماع الافتتاحي — ${p.actions.length} إجراء صار مهام`, proj.id);
  },

  /** PJ-09/PJ-10: the start gate is checked here, not only in the UI (AC-02). */
  'project.start'(ctx: Ctx, p: { projectId: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    ctx.check(proj.status === 'preparing', 'البدء متاح من حالة التجهيز فقط');
    const gate = startGate(ctx.s, proj);
    ctx.check(gate.length === 0, `بوابة البدء غير مستوفاة: ${gate.join(' · ')}`);
    proj.status = 'in_progress';
    proj.startedAt = ctx.now;
    proj.contractStart = ctx.now;
    const q = ctx.s.quotations.find((x) => x.id === proj.contracts[0]?.quotationId);
    if (q) {
      proj.contractEndDate = addDays(ctx.now, q.durationDays, proj.dayType, ctx.s.settings);
      proj.expectedEndDate = proj.contractEndDate;
    }
    proj.phases = schedulePhases(ctx.now, proj.phases, proj.dayType, ctx.s.settings);
    for (const d of ctx.s.deliverables.filter((x) => x.projectId === proj.id && x.status === 'not_started')) {
      if (d.requiresGov) createGovForDeliverable(ctx, proj, d);
      else d.status = 'in_preparation';
    }
    for (const pay of ctx.s.payments.filter((x) => x.projectId === proj.id && x.condition === 'advance' && x.entitlement === 'not_due')) {
      pay.entitlement = 'due';
      pay.dueAt = ctx.now;
      pay.graceUntil = addCalendarDays(ctx.now, pay.graceDays);
      pay.evidence.push({ kind: 'بدء التنفيذ (شرط الدفعة المقدمة)', at: ctx.now, note: 'تحقق الشرط ببدء التنفيذ' });
      pay.evidenceCheck = 'accepted';
    }
    ctx.event('project.started', { type: 'project', id: proj.id }, 'بدأ التنفيذ — البدء لا يعني تأكيد التحصيل', proj.id);
    ctx.notify([...proj.members.map((m) => m.userId), ...ctx.finance()], { title: `بدأ تنفيذ ${proj.title}`, body: proj.id, link: link(proj), type: 'project.started' });
  },

  'project.suspend'(ctx: Ctx, p: { projectId: string; type: Suspension['type']; reason: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    ctx.check(proj.status === 'in_progress', 'التعليق متاح أثناء التنفيذ فقط');
    ctx.check(p.reason.trim(), 'سبب التعليق مطلوب');
    suspendProject(ctx, proj, { type: p.type, reason: p.reason, since: ctx.now, by: ctx.actorId as UserId });
  },

  'project.resume'(ctx: Ctx, p: { projectId: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    ctx.check(proj.status === 'suspended', 'المشروع ليس معلّقًا');
    if (proj.exceptionId) {
      const exc = ctx.s.exceptions.find((e) => e.id === proj.exceptionId);
      ctx.check(exc?.status !== 'expired', 'الاستثناء منتهٍ — يلزم تمديد معتمد من الرئيس التنفيذي أو الاعتماد المالي');
    }
    resumeProject(ctx, proj, 'استئناف');
  },

  'project.suspend_site'(ctx: Ctx, p: { projectId: string; siteId: string; reason: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    const site = proj.sites.find((s) => s.id === p.siteId) ?? ctx.fail('موقع غير موجود');
    ctx.check(!site.suspended, 'الموقع معلّق مسبقًا');
    ctx.check(p.reason.trim(), 'السبب مطلوب');
    site.suspended = { reason: p.reason, since: ctx.now };
    ctx.event('project.site_suspended', { type: 'project', id: proj.id }, `عُلّق موقع «${site.name}»: ${p.reason} — بقية المواقع مستمرة`, proj.id);
    ctx.notify(proj.members.map((m) => m.userId), { title: `عُلّق موقع ${site.name}`, body: p.reason, link: link(proj), type: 'project.site_suspended' });
  },

  'project.resume_site'(ctx: Ctx, p: { projectId: string; siteId: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    const site = proj.sites.find((s) => s.id === p.siteId) ?? ctx.fail('موقع غير موجود');
    ctx.check(site.suspended, 'الموقع غير معلّق');
    const days = daysBetween(site.suspended.since, ctx.now, 'calendar', ctx.s.settings);
    site.suspended = undefined;
    ctx.event('project.site_resumed', { type: 'project', id: proj.id }, `استؤنف موقع «${site.name}» بعد ${days} يومًا`, proj.id);
  },

  'project.change_expected_date'(ctx: Ctx, p: { projectId: string; to: ISO; reason: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    ctx.check(p.reason.trim(), 'سبب التعديل مطلوب');
    ctx.check(proj.expectedEndDate, 'لا يوجد تاريخ متوقع بعد');
    proj.dateChanges.push({ from: proj.expectedEndDate, to: p.to, reason: p.reason, at: ctx.now, by: ctx.actorId as UserId });
    proj.expectedEndDate = p.to;
    ctx.event('project.expected_date', { type: 'project', id: proj.id }, `تعديل التاريخ المتوقع — الموعد التعاقدي الأصلي محفوظ: ${p.reason}`, proj.id);
  },

  // ── Changes: add department, free/paid addition, exclusion, separate track ───────

  'change.request'(ctx: Ctx, p: Omit<ChangeRequest, 'id' | 'requestedBy' | 'requestedAt' | 'status'> & { projectId: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.request_change', { own: ctx.isPm(proj) });
    ctx.check(['preparing', 'in_progress', 'suspended'].includes(proj.status), 'لا يمكن طلب تغيير في هذه الحالة');
    ctx.check(p.reason.trim(), 'السبب مطلوب');
    if (p.kind === 'add_department') {
      ctx.check(p.deptCode && !proj.departments.some((d) => d.deptCode === p.deptCode), 'اختر قسمًا غير مشارك');
      ctx.check(p.scope?.trim(), 'النطاق مطلوب');
    }
    if (p.kind === 'free_addition') ctx.check(p.title?.trim() && p.deptCode, 'عنوان الإضافة والقسم مطلوبان');
    if (p.kind === 'exclusion') {
      const d = ctx.deliverable(p.deliverableId ?? '');
      ctx.check(d.projectId === proj.id && !['client_approved', 'excluded'].includes(d.status), 'المخرج غير قابل للاستبعاد');
      ctx.check(p.clientAgreement?.trim(), 'موافقة العميل مطلوبة');
    }
    if (p.kind === 'track') ctx.check(p.trackName?.trim() && p.scopeItemIds?.length, 'اسم المسار والبنود المنقولة مطلوبة');
    const { projectId: _pid, ...fields } = p;
    void _pid;
    const cr: ChangeRequest = {
      ...fields, id: `${proj.id}-CR${proj.changeRequests.length + 1}`, requestedBy: ctx.actorId as UserId, requestedAt: ctx.now,
      status: p.kind === 'paid_addition' ? 'with_sales' : 'pending',
    };
    proj.changeRequests.push(cr);
    const names: Record<string, string> = { add_department: 'إضافة قسم', free_addition: 'إضافة دون مقابل', paid_addition: 'إضافة بمقابل', exclusion: 'استبعاد مخرج', track: 'مسار تنفيذ مستقل' };
    ctx.event(`change.${p.kind}.requested`, { type: 'change', id: cr.id }, `طلب ${names[p.kind]}: ${p.reason}`, proj.id);
    const to = p.kind === 'paid_addition' ? [ctx.oppOwnerOf(proj)]
      : p.kind === 'track' && !proj.multiDept ? [ctx.deptManager(proj.leadDept)] : ctx.directors();
    ctx.notify(to, { title: `${names[p.kind]} بانتظار قرارك — ${proj.id}`, body: p.reason, link: `${link(proj)}?tab=changes`, type: 'change.requested' });
    return cr.id;
  },

  'change.decide'(ctx: Ctx, p: { projectId: string; requestId: string; decision: ApprovalDecision; note: string }) {
    const proj = ctx.project(p.projectId);
    const cr = proj.changeRequests.find((c) => c.id === p.requestId) ?? ctx.fail('طلب غير موجود');
    ctx.check(cr.status === 'pending', 'تم البت في هذا الطلب');
    if (cr.kind === 'track' && !proj.multiDept) ctx.require('project.staff', { depts: [proj.leadDept] });
    else ctx.require('project.approve_change');
    if (p.decision !== 'approved') ctx.check(p.note.trim(), 'السبب مطلوب');
    cr.status = p.decision;
    cr.decidedBy = ctx.actorId as UserId;
    cr.decidedAt = ctx.now;
    cr.decisionNote = p.note;
    if (p.decision === 'approved') applyChange(ctx, proj, cr);
    ctx.event(`change.${cr.kind}.${p.decision}`, { type: 'change', id: cr.id }, `${p.decision === 'approved' ? 'اعتُمد' : p.decision === 'returned' ? 'أعيد' : 'رُفض'} الطلب ${cr.id}${p.note ? `: ${p.note}` : ''}`, proj.id);
    ctx.notify([cr.requestedBy], { title: `قرار على طلبك ${cr.id}`, body: p.note, link: `${link(proj)}?tab=changes`, type: 'change.decided' });
  },

  /** AD-01: the opportunity owner takes the paid addition through sales; finance approval links it. */
  'paid_addition.accept_quotation'(ctx: Ctx, p: { projectId: string; requestId: string; serviceCode: string; amount: number }) {
    const proj = ctx.project(p.projectId);
    ctx.require('opportunity.work', { own: ctx.oppOwnerOf(proj) === ctx.actorId });
    const cr = proj.changeRequests.find((c) => c.id === p.requestId && c.kind === 'paid_addition') ?? ctx.fail('طلب غير موجود');
    ctx.check(cr.status === 'with_sales' && !cr.quotationId, 'العرض الإضافي مسجل مسبقًا');
    const service = serviceByCode(p.serviceCode) ?? ctx.fail('خدمة غير معروفة');
    ctx.check(p.amount > 0, 'قيمة العرض مطلوبة');
    const qid = ctx.nextId('Q-ADD', 3);
    const base = ctx.s.quotations.find((q) => q.id === proj.contracts[0].quotationId);
    ctx.s.quotations.push({
      id: qid, opportunityId: proj.opportunityId!, revision: 'Rev 00', kind: 'paid_addition',
      lines: [{ id: `${qid}-L1`, serviceCode: service.code, title: service.title, deptCode: service.dept, amount: p.amount }],
      payments: [{ id: `${qid}-P1`, label: `دفعة الإضافة ${qid}`, amount: p.amount, condition: 'acceptance', graceDays: ctx.s.settings.defaultGraceDays }],
      dayType: proj.dayType, kickoffRequired: false, acceptedAt: ctx.now, durationDays: 30, responseDays: base?.responseDays,
    });
    cr.quotationId = qid;
    const actId = ctx.nextId('ACT');
    ctx.s.activations.push({ id: actId, opportunityId: proj.opportunityId!, quotationId: qid, status: 'pending_finance', requestedBy: ctx.actorId as UserId, requestedAt: ctx.now });
    ctx.event('paid_addition.quotation_accepted', { type: 'quotation', id: qid }, `قبل العميل العرض الإضافي ${qid} — أُرسل طلب التفعيل للمالية`, proj.id);
    ctx.notify(ctx.finance(), { title: `طلب تفعيل إضافة مدفوعة — ${proj.id}`, body: qid, link: '/intake', type: 'activation.requested' });
  },

  // ── Closure and cancellation chains (AD-05…AD-07, A4) ─────────────────────────

  'closure.request'(ctx: Ctx, p: { projectId: string; reason: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.request_change', { own: ctx.isPm(proj) });
    ctx.check(proj.status === 'technically_complete', 'الإغلاق يُطلب بعد الاكتمال الفني');
    proj.closure = newChain(ctx, proj, 'closure', p.reason, 'technically_complete');
    proj.status = 'closure_review';
    ctx.event('closure.requested', { type: 'project', id: proj.id }, 'طلب إغلاق — مديرو الأقسام بالتوازي', proj.id);
    notifyStep(ctx, proj, proj.closure);
  },

  'cancellation.request'(ctx: Ctx, p: { projectId: string; reason: string }) {
    const proj = ctx.project(p.projectId);
    ctx.require('project.request_change', { own: ctx.isPm(proj) });
    ctx.check(['preparing', 'in_progress', 'suspended'].includes(proj.status), 'لا يمكن طلب الإلغاء في هذه الحالة');
    ctx.check(p.reason.trim(), 'أسباب الإلغاء مطلوبة');
    proj.cancellation = newChain(ctx, proj, 'cancellation', p.reason, proj.status);
    proj.status = 'cancellation_review';
    ctx.event('cancellation.requested', { type: 'project', id: proj.id }, `طلب إلغاء: ${p.reason}`, proj.id);
    notifyStep(ctx, proj, proj.cancellation);
  },

  'chain.decide'(ctx: Ctx, p: { projectId: string; kind: 'closure' | 'cancellation'; decision: 'approved' | 'returned'; note: string }) {
    const proj = ctx.project(p.projectId);
    const chain = p.kind === 'closure' ? proj.closure : proj.cancellation;
    ctx.check(chain?.status === 'pending', 'لا يوجد طلب بانتظار القرار');
    const step = chain.steps.find((s) => s.status === 'pending')!;
    const me = ctx.me;
    ctx.check(step.approverIds.includes(me.id), 'ليس دورك في هذه المرحلة من سلسلة الاعتماد');
    if (step.key === 'finance') ctx.require('project.review_settlement');
    else ctx.require('project.approve_closure', { depts: [me.deptCode] });
    ctx.check(!step.decisions.some((d) => d.userId === me.id), 'سجلت قرارك مسبقًا');
    if (p.decision === 'returned') ctx.check(p.note.trim(), 'سبب الإعادة مطلوب');
    step.decisions.push({ userId: me.id, decision: p.decision, note: p.note, at: ctx.now });
    const names = { dept_managers: 'مديري الأقسام', director: 'مدير الأقسام', finance: 'المالية', ceo: 'الرئيس التنفيذي' };
    if (p.decision === 'returned') {
      step.status = 'returned';
      chain.status = 'returned';
      proj.status = chain.returnTo;
      ctx.event(`${p.kind}.returned`, { type: 'project', id: proj.id }, `أعاد ${names[step.key]} الطلب: ${p.note}`, proj.id);
      ctx.notify([chain.requestedBy], { title: `أُعيد طلب ${p.kind === 'closure' ? 'الإغلاق' : 'الإلغاء'} — ${proj.id}`, body: p.note, link: `${link(proj)}?tab=closure`, type: `${p.kind}.returned` });
      return;
    }
    const allIn = step.key === 'dept_managers'
      ? step.approverIds.every((id) => step.decisions.some((d) => d.userId === id && d.decision === 'approved'))
      : step.decisions.some((d) => d.decision === 'approved');
    ctx.event(`${p.kind}.step_approved`, { type: 'project', id: proj.id }, `اعتماد ${names[step.key]}${step.key === 'dept_managers' ? ` (${step.decisions.length}/${step.approverIds.length})` : ''}`, proj.id);
    if (!allIn) return;
    step.status = 'approved';
    const next = chain.steps.find((s) => s.status === 'waiting');
    if (next) {
      next.status = 'pending';
      notifyStep(ctx, proj, chain);
      return;
    }
    chain.status = 'approved';
    if (p.kind === 'closure') {
      proj.status = 'operationally_closed';
      proj.closedAt = ctx.now;
      ctx.event('project.operationally_closed', { type: 'project', id: proj.id }, 'أُغلق المشروع تشغيليًا — المخرجات للقراءة فقط، والمالية تواصل التحصيل حتى التسوية', proj.id);
    } else {
      proj.status = 'cancelled';
      proj.cancelledAt = ctx.now;
      ctx.event('project.cancelled', { type: 'project', id: proj.id }, 'أُلغي المشروع — المستحقات ومهام التحصيل تبقى مفتوحة', proj.id);
    }
    ctx.notify([...proj.members.map((m) => m.userId), ...ctx.finance()], { title: `${p.kind === 'closure' ? 'أُغلق تشغيليًا' : 'أُلغي'}: ${proj.title}`, link: link(proj), type: `project.${proj.status}` });
  },

  /** A4: the financial closure is separate — only after every receivable and cost is settled. */
  'project.settle'(ctx: Ctx, p: { projectId: string; note: string }) {
    ctx.require('project.review_settlement');
    const proj = ctx.project(p.projectId);
    ctx.check(['operationally_closed', 'cancelled'].includes(proj.status), 'التسوية المالية بعد الإغلاق التشغيلي أو الإلغاء');
    const open = ctx.s.payments.filter((x) => x.projectId === proj.id && x.entitlement !== 'not_due' && x.collection !== 'fully_collected');
    ctx.check(open.length === 0, `توجد ${open.length} دفعة مستحقة غير محصلة`);
    const costs = ctx.s.costs.filter((c) => c.projectId === proj.id && ['approved', 'partially_paid'].includes(c.status));
    ctx.check(costs.length === 0, 'توجد تكاليف معتمدة غير مصروفة');
    proj.financialState = 'settled';
    ctx.event('project.settled', { type: 'project', id: proj.id }, `الإغلاق المالي: ${p.note}`, proj.id);
  },

  // ── Project that existed before the system (AD-08, D17) ───────────────────────

  'project.register_existing'(ctx: Ctx, p: { title: string; clientId: string; deptCode: DeptCode; pmId: UserId; followUpOwnerId: UserId; currentPhase: string; remainingWork: string; documents: string; scopeLines: string[] }) {
    ctx.require('project.register_existing');
    ctx.check(p.title.trim() && p.clientId && p.pmId && p.followUpOwnerId, 'العميل والعنوان ومدير المشروع ومسؤول المتابعة مطلوبة');
    ctx.check(p.scopeLines.some((l) => l.trim()), 'النطاق المتبقي مطلوب');
    const client = ctx.s.clients.find((c) => c.id === p.clientId) ?? ctx.fail('عميل غير موجود');
    const id = ctx.nextId('PRJ');
    const proj: Project = {
      id, title: p.title, clientId: client.id, contracts: [], activationIds: [], createdFrom: 'pre_system', createdAt: ctx.now,
      status: 'awaiting_assignment', financialState: 'open', multiDept: false, leadDept: p.deptCode,
      receivedAt: ctx.now, receivedBy: ctx.actorId as UserId,
      departments: [{ deptCode: p.deptCode, managerId: ctx.deptManager(p.deptCode) ?? '', status: 'active', joinedAt: ctx.now }],
      pmId: p.pmId, followUpOwnerId: p.followUpOwnerId,
      members: [
        { userId: p.pmId, capacity: 'project_manager', deptCode: ctx.user(p.pmId).deptCode, since: ctx.now },
        { userId: p.followUpOwnerId, capacity: 'opportunity_owner', since: ctx.now },
      ],
      sites: [{ id: `${id}-S1`, name: `الموقع — ${client.city}`, city: client.city }],
      scopeItems: [], phases: [], tracks: [], dayType: 'working',
      kickoff: { required: false, status: 'not_held' }, paymentMapping: { status: 'confirmed', note: 'لا جدول دفعات في النظام لمشروع قائم' },
      suspensions: [], dateChanges: [], changeRequests: [], nextcloud: { status: 'not_created' },
      preSystem: { currentPhase: p.currentPhase, remainingWork: p.remainingWork, documents: p.documents, financeReviewed: false },
      responseDays: ctx.s.settings.clientResponseDays,
    };
    p.scopeLines.filter((l) => l.trim()).forEach((line, i) => {
      const item: ScopeItem = { id: `${id}-I${i + 1}`, title: line.trim(), deptCode: p.deptCode, origin: 'pre_system' };
      proj.scopeItems.push(item);
      ctx.s.deliverables.push({
        id: `DLV-${id.slice(4)}-${String(i + 1).padStart(2, '0')}`, projectId: id, title: line.trim(), scopeItemIds: [item.id],
        deptCode: p.deptCode, technical: true, requiresGov: false, status: 'not_started', revisions: [], origin: 'pre_system',
      });
    });
    ctx.s.projects.push(proj);
    ctx.event('project.registered_existing', { type: 'project', id }, 'سُجّل مشروع قائم قبل النظام — بلا فرصة صورية', id);
    ctx.notify(ctx.finance(), { title: `راجع الأرصدة السابقة لمشروع قائم: ${id}`, body: 'دون إعادة إصدار فواتير', link: link(proj), type: 'project.registered_existing' });
    return id;
  },

  'project.finance_review_existing'(ctx: Ctx, p: { projectId: string; note: string }) {
    ctx.require('payment.verify_entitlement');
    const proj = ctx.project(p.projectId);
    ctx.check(proj.preSystem && !proj.preSystem.financeReviewed, 'لا توجد مراجعة مالية معلّقة');
    ctx.check(p.note.trim(), 'ملاحظة المراجعة مطلوبة');
    proj.preSystem.financeReviewed = true;
    proj.preSystem.financeNote = p.note;
    proj.status = 'preparing';
    proj.nextcloud = { status: 'open', path: `ABAK Projects/${proj.id}`, folderId: `NC-${proj.id}`, lastSyncAt: ctx.now };
    ctx.event('project.existing_finance_reviewed', { type: 'project', id: proj.id }, `راجعت المالية الأرصدة السابقة دون إعادة فواتير: ${p.note} — يدخل التجهيز`, proj.id);
    ctx.notify([proj.pmId], { title: `ابدأ تجهيز المشروع القائم ${proj.id}`, link: link(proj), type: 'project.existing_ready' });
  },
};

function applyChange(ctx: Ctx, proj: Project, cr: ChangeRequest) {
  if (cr.kind === 'add_department' && cr.deptCode) {
    const mgr = ctx.deptManager(cr.deptCode) ?? '';
    proj.departments.push({ deptCode: cr.deptCode, managerId: mgr, status: 'joining', joinedAt: ctx.now, viaRequestId: cr.id });
    proj.multiDept = true;
    addItem(ctx, proj, cr.scope ?? `مشاركة ${deptName(cr.deptCode)}`, cr.deptCode, 'contract', cr.deliverableTitles);
    ctx.addMember(proj, mgr, 'dept_manager', cr.deptCode);
    ctx.notify([mgr], { title: `انضم قسمك للمشروع ${proj.id} — عيّن مسؤولي البنود`, body: cr.scope, link: `/projects/${proj.id}?tab=team`, type: 'project.department_joined' });
  }
  if (cr.kind === 'free_addition' && cr.deptCode) {
    addItem(ctx, proj, cr.title ?? 'إضافة', cr.deptCode, 'free_addition', cr.deliverableTitles);
    if (cr.timeEffectDays && proj.expectedEndDate) {
      const to = addDays(proj.expectedEndDate, cr.timeEffectDays, proj.dayType, ctx.s.settings);
      proj.dateChanges.push({ from: proj.expectedEndDate, to, reason: `إضافة دون مقابل ${cr.id}`, at: ctx.now, by: ctx.actorId as UserId });
      proj.expectedEndDate = to;
    }
    ctx.notify([ctx.deptManager(cr.deptCode)], { title: `بند إضافة دون مقابل في ${proj.id} يحتاج مسؤولًا`, link: `/projects/${proj.id}?tab=team`, type: 'project.free_addition' });
  }
  if (cr.kind === 'exclusion' && cr.deliverableId) {
    const d = ctx.deliverable(cr.deliverableId);
    d.status = 'excluded';
    d.exclusion = { reason: cr.reason, clientAgreement: cr.clientAgreement ?? '', approvedBy: ctx.actorId as UserId, at: ctx.now };
    ctx.notify([ctx.oppOwnerOf(proj), ...ctx.finance()], { title: `استُبعد مخرج من نطاق ${proj.id}`, body: `${d.title} — أثر القيمة عبر المبيعات والمالية`, link: `/projects/${proj.id}?tab=deliverables`, type: 'deliverable.excluded' });
    checkPaymentConditions(ctx, proj);
    checkTechnicalCompletion(ctx, proj);
  }
  if (cr.kind === 'track' && cr.scopeItemIds?.length) {
    const tr = { id: `${proj.id}-TR${proj.tracks.length + 1}`, name: cr.trackName ?? 'مسار مستقل', deptCodes: [...new Set(cr.scopeItemIds.map((i) => proj.scopeItems.find((x) => x.id === i)?.deptCode).filter((x): x is DeptCode => !!x))], approvedBy: ctx.actorId as UserId, at: ctx.now, scopeItemIds: cr.scopeItemIds };
    proj.tracks.push(tr);
    for (const i of proj.scopeItems.filter((x) => cr.scopeItemIds!.includes(x.id))) i.trackId = tr.id;
    ctx.event('project.track_created', { type: 'project', id: proj.id }, `نُقلت ${cr.scopeItemIds.length} بنود إلى «${tr.name}» — نُقلت ولم تُنسخ، والقيمة والدفعات في جدول العقد الواحد`, proj.id);
  }
}

function addItem(ctx: Ctx, proj: Project, title: string, dept: DeptCode, origin: ScopeItem['origin'], deliverables?: string[]) {
  const item: ScopeItem = { id: `${proj.id}-I${proj.scopeItems.length + 1}`, title, deptCode: dept, origin };
  proj.scopeItems.push(item);
  const titles = deliverables?.filter((t) => t.trim()).length ? deliverables.filter((t) => t.trim()) : [title];
  for (const t of titles) {
    const d: Deliverable = {
      id: `DLV-${proj.id.slice(4)}-${String(ctx.s.deliverables.filter((x) => x.projectId === proj.id).length + 1).padStart(2, '0')}`,
      projectId: proj.id, title: t, scopeItemIds: [item.id], deptCode: dept, technical: true, requiresGov: false,
      status: proj.status === 'in_progress' ? 'in_preparation' : 'not_started', revisions: [], origin,
    };
    ctx.s.deliverables.push(d);
  }
}

function newChain(ctx: Ctx, proj: Project, kind: ApprovalChain['kind'], reason: string, returnTo: ProjectState): ApprovalChain {
  const steps: ChainStep[] = [];
  if (kind === 'closure') {
    steps.push({ key: 'dept_managers', approverIds: [...new Set(proj.departments.map((d) => d.managerId).filter(Boolean))], decisions: [], status: 'pending' });
  }
  steps.push({ key: 'director', approverIds: ctx.directors(), decisions: [], status: kind === 'closure' ? 'waiting' : 'pending' });
  steps.push({ key: 'finance', approverIds: ctx.finance(), decisions: [], status: 'waiting' });
  steps.push({ key: 'ceo', approverIds: ctx.ceos(), decisions: [], status: 'waiting' });
  // Department managers decide in parallel and all must approve; the other steps need one holder.
  return { kind, requestedBy: ctx.actorId as UserId, requestedAt: ctx.now, reason, steps, status: 'pending', returnTo };
}

function notifyStep(ctx: Ctx, proj: Project, chain: ApprovalChain) {
  const step = chain.steps.find((s) => s.status === 'pending');
  if (!step) return;
  ctx.notify(step.approverIds, {
    title: `${chain.kind === 'closure' ? 'اعتماد إغلاق' : 'اعتماد إلغاء'}: ${proj.title}`,
    body: chain.reason, link: `/projects/${proj.id}?tab=closure`, type: `${chain.kind}.step`,
  });
}

export function suspendProject(ctx: Ctx, proj: Project, s: Suspension) {
  proj.status = 'suspended';
  proj.suspension = s;
  ctx.event('project.suspended', { type: 'project', id: proj.id }, `عُلّق المشروع (${s.type}): ${s.reason} — الموعد التعاقدي لا يتغير`, proj.id);
  ctx.notify([...proj.members.map((m) => m.userId), ...(s.type === 'payment' ? ctx.finance() : [])], { title: `عُلّق المشروع ${proj.id}`, body: s.reason, link: link(proj), type: 'project.suspended' });
}

export function resumeProject(ctx: Ctx, proj: Project, why: string) {
  const s = proj.suspension;
  if (!s) return;
  const days = daysBetween(s.since, ctx.now, proj.dayType, ctx.s.settings);
  proj.suspensions.push({ ...s, until: ctx.now });
  proj.suspension = undefined;
  proj.status = 'in_progress';
  if (days > 0 && proj.expectedEndDate) {
    const to = addDays(proj.expectedEndDate, days, proj.dayType, ctx.s.settings);
    proj.dateChanges.push({ from: proj.expectedEndDate, to, reason: `تعليق ${days} يوم (${s.reason})`, at: ctx.now, by: ctx.actorId === 'system' ? (proj.pmId ?? '') : ctx.actorId });
    proj.expectedEndDate = to;
  }
  ctx.event('project.resumed', { type: 'project', id: proj.id }, `${why} بعد ${days} يوم تعليق — التأخر ظاهر والموعد التعاقدي محفوظ`, proj.id);
  ctx.notify(proj.members.map((m) => m.userId), { title: `استؤنف المشروع ${proj.id}`, link: link(proj), type: 'project.resumed' });
}
