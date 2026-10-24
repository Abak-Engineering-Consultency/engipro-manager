import { addCalendarDays, addHours, fmtDateTime } from '../calendar';
import { visitTypeName } from '../catalog';
import type { ISO, PaymentItem, RecordLink, UserId, Visit, VisitBilling, VisitType } from '../types';
import { Ctx } from './core';

const vlink = (v: Visit) => `/visits?id=${v.id}`;

/** VS-02: nobody can be in two places at once — owner and participants are checked. */
function conflicts(ctx: Ctx, people: UserId[], start: ISO, end: ISO, exceptId?: string) {
  const s = Date.parse(start);
  const e = Date.parse(end);
  return ctx.s.visits.filter((v) => v.id !== exceptId && ['proposed', 'confirmed'].includes(v.status)
    && [v.ownerId, ...v.participants].some((u) => people.includes(u))
    && Date.parse(v.plannedStart) < e && Date.parse(v.plannedEnd) > s);
}

function assertFree(ctx: Ctx, people: UserId[], start: ISO, end: ISO, exceptId?: string) {
  const c = conflicts(ctx, people, start, end, exceptId);
  if (!c.length) return;
  const who = [...new Set(c.flatMap((v) => [v.ownerId, ...v.participants]).filter((u) => people.includes(u)))].map((u) => ctx.user(u).name);
  ctx.fail(`تعارض مواعيد: ${who.join('، ')} لديه ${c[0].id} (${fmtDateTime(c[0].plannedStart)}) — اختر وقتًا آخر`);
}

/** Who approves a supervision report: the PM, or the department manager when the PM did the visit (VS-06, AC-11). */
function reportApprover(ctx: Ctx, v: Visit): UserId {
  const proj = v.link?.projectId ? ctx.s.projects.find((p) => p.id === v.link!.projectId) : undefined;
  if (proj?.pmId && proj.pmId !== v.ownerId) return proj.pmId;
  const owner = ctx.user(v.ownerId);
  return ctx.deptManager(owner.deptCode) ?? ctx.deptManager(proj?.leadDept) ?? ctx.directors()[0];
}

export const visitCommands = {
  'visit.schedule'(ctx: Ctx, p: { type: VisitType; purpose: string; expectedResult: string; location: string; contact: string; link?: RecordLink; ownerId: UserId; participants: UserId[]; plannedStart: ISO; durationHours: number; billing: VisitBilling }) {
    ctx.require('visit.manage', { own: true });
    ctx.check(p.purpose.trim() && p.location.trim(), 'الغرض والموقع مطلوبان');
    ctx.check(p.ownerId && p.plannedStart, 'المسؤول والموعد مطلوبان');
    const end = addHours(p.plannedStart, Math.max(1, p.durationHours));
    const participants = p.participants.filter((u) => u !== p.ownerId);
    assertFree(ctx, [p.ownerId, ...participants], p.plannedStart, end);
    const v: Visit = {
      id: ctx.nextId('VST'), type: p.type, purpose: p.purpose, expectedResult: p.expectedResult, location: p.location, contact: p.contact,
      link: p.link && p.link.type !== 'none' ? p.link : undefined, ownerId: p.ownerId, participants, plannedStart: p.plannedStart, plannedEnd: end,
      status: 'proposed', history: [{ at: ctx.now, by: ctx.actorId as UserId, change: `جُدولت ${fmtDateTime(p.plannedStart)}` }],
      billing: p.billing, createdBy: ctx.actorId as UserId, createdAt: ctx.now,
    };
    ctx.s.visits.push(v);
    ctx.event('visit.scheduled', { type: 'visit', id: v.id }, `زيارة ${visitTypeName(v.type)}: ${v.purpose}`, v.link?.projectId);
    ctx.notify([v.ownerId, ...participants], { title: `زيارة مقترحة ${fmtDateTime(v.plannedStart)}`, body: v.purpose, link: vlink(v), type: 'visit.scheduled' });
    return v.id;
  },

  'visit.confirm'(ctx: Ctx, p: { visitId: string; note?: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.ownerId === ctx.actorId, 'يؤكدها مسؤول الزيارة');
    ctx.check(v.status === 'proposed', 'الزيارة ليست مقترحة');
    v.status = 'confirmed';
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: 'أُكّد الموعد مع العميل/الجهة', note: p.note });
    ctx.event('visit.confirmed', { type: 'visit', id: v.id }, 'تأكيد الموعد', v.link?.projectId);
    ctx.notify(v.participants, { title: `تأكدت الزيارة ${v.id}`, body: fmtDateTime(v.plannedStart), link: vlink(v), type: 'visit.confirmed' });
  },

  /** A reschedule stays in the same visit's history; it never creates a new visit. */
  'visit.reschedule'(ctx: Ctx, p: { visitId: string; plannedStart: ISO; durationHours: number; reason: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.ownerId === ctx.actorId, 'يعيد الجدولة مسؤول الزيارة');
    ctx.check(['proposed', 'confirmed'].includes(v.status), 'لا يمكن إعادة الجدولة');
    ctx.check(p.reason.trim(), 'سبب إعادة الجدولة مطلوب');
    const end = addHours(p.plannedStart, Math.max(1, p.durationHours));
    assertFree(ctx, [v.ownerId, ...v.participants], p.plannedStart, end, v.id);
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: `أعيدت الجدولة من ${fmtDateTime(v.plannedStart)} إلى ${fmtDateTime(p.plannedStart)}`, note: p.reason });
    v.plannedStart = p.plannedStart;
    v.plannedEnd = end;
    v.status = 'proposed';
    ctx.event('visit.rescheduled', { type: 'visit', id: v.id }, `إعادة جدولة: ${p.reason}`, v.link?.projectId);
    ctx.notify(v.participants, { title: `تغيّر موعد الزيارة ${v.id}`, body: p.reason, link: vlink(v), type: 'visit.rescheduled' });
  },

  'visit.cancel'(ctx: Ctx, p: { visitId: string; reason: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check([v.ownerId, v.createdBy].includes(ctx.actorId as UserId), 'يلغيها المسؤول أو المنشئ');
    ctx.check(['proposed', 'confirmed'].includes(v.status), 'لا يمكن الإلغاء');
    ctx.check(p.reason.trim(), 'سبب الإلغاء مطلوب');
    v.status = 'cancelled';
    v.cancelReason = p.reason;
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: 'أُلغيت', note: p.reason });
    ctx.event('visit.cancelled', { type: 'visit', id: v.id }, `أُلغيت: ${p.reason}`, v.link?.projectId);
    ctx.notify(v.participants, { title: `أُلغيت الزيارة ${v.id}`, body: p.reason, link: vlink(v), type: 'visit.cancelled' });
  },

  'visit.check_in'(ctx: Ctx, p: { visitId: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.ownerId === ctx.actorId, 'تسجيل الوصول لمسؤول الزيارة');
    ctx.check(v.status === 'confirmed' && !v.actualStart, 'الزيارة غير مؤكدة أو سُجّل الوصول');
    v.actualStart = ctx.now;
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: 'تسجيل الوصول' });
  },

  /** VS-05: result by type; actual time separate from the plan; supervision needs a report. */
  'visit.complete'(ctx: Ctx, p: { visitId: string; summary: string; nextStep?: string; notes?: string; photos?: number; documents?: string; nextRequirement?: string; reportFile?: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.ownerId === ctx.actorId, 'التوثيق لمسؤول الزيارة');
    ctx.check(v.status === 'confirmed', 'الزيارة غير مؤكدة');
    ctx.check(p.summary.trim(), 'ملخص النتيجة مطلوب');
    if (v.type === 'supervision') ctx.check(p.reportFile?.trim(), 'تقرير الإشراف إلزامي');
    if (v.type === 'introduction' || v.type === 'pricing') ctx.check(p.nextStep?.trim(), 'الخطوة التالية مطلوبة لزيارات المبيعات');
    v.actualStart = v.actualStart ?? addHours(ctx.now, -1);
    v.actualEnd = ctx.now;
    v.result = { summary: p.summary, nextStep: p.nextStep, notes: p.notes, photos: p.photos, documents: p.documents, nextRequirement: p.nextRequirement };
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: 'نُفّذت ووثقت النتيجة' });
    if (v.type === 'supervision') {
      const approver = reportApprover(ctx, v);
      v.report = { file: p.reportFile!, submittedAt: ctx.now, approverId: approver };
      v.status = 'report_pending';
      ctx.event('visit.report_submitted', { type: 'visit', id: v.id }, `نُفّذت — التقرير بانتظار اعتماد ${ctx.user(approver).name}`, v.link?.projectId);
      ctx.notify([approver], { title: `اعتمد تقرير الإشراف ${v.id}`, body: v.purpose, link: vlink(v), type: 'visit.report_submitted' });
    } else {
      v.status = 'executed';
      ctx.event('visit.executed', { type: 'visit', id: v.id }, `نُفّذت: ${p.summary}`, v.link?.projectId);
    }
    if (v.type === 'expeditor' && v.link?.type === 'gov') {
      const g = ctx.s.gov.find((x) => x.id === v.link!.id);
      if (g && g.status === 'at_authority') {
        g.followUps.push({ at: ctx.now, by: ctx.actorId as UserId, outcome: p.summary, platformStatus: p.notes || '—', nextRequirement: p.nextRequirement ?? '', visitId: v.id });
        g.lastUpdateAt = ctx.now;
      }
    }
    if (v.billing === 'billable') ctx.notify(ctx.finance(), { title: `زيارة قابلة للفوترة نُفذت: ${v.id}`, body: 'مطالبة يدوية حسب العقد', link: '/finance', type: 'visit.billable' });
  },

  'visit.inaccessible'(ctx: Ctx, p: { visitId: string; reason: string; proof: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.ownerId === ctx.actorId, 'لمسؤول الزيارة');
    ctx.check(v.status === 'confirmed', 'الزيارة غير مؤكدة');
    ctx.check(p.reason.trim() && p.proof.trim(), 'السبب وإثبات الحضور مطلوبان');
    v.status = 'inaccessible';
    v.inaccessible = { reason: p.reason, proof: p.proof };
    v.actualStart = v.actualStart ?? ctx.now;
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: 'متعذرة — ليست مكتملة', note: p.reason });
    ctx.event('visit.inaccessible', { type: 'visit', id: v.id }, `متعذرة: ${p.reason} (إثبات: ${p.proof}) — الاحتساب حسب العقد ومراجعة المالية`, v.link?.projectId);
    const proj = v.link?.projectId ? ctx.s.projects.find((x) => x.id === v.link!.projectId) : undefined;
    ctx.notify([proj?.pmId, ...(v.billing === 'billable' ? ctx.finance() : [])], { title: `زيارة متعذرة ${v.id}`, body: p.reason, link: vlink(v), type: 'visit.inaccessible' });
  },

  'visit.decide_report'(ctx: Ctx, p: { visitId: string; decision: 'approved' | 'returned'; note: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.status === 'report_pending' && v.report, 'لا يوجد تقرير بانتظار الاعتماد');
    ctx.check(v.report.approverId === ctx.actorId, 'الاعتماد لمعتمد التقرير المحدد');
    ctx.check(v.ownerId !== ctx.actorId, 'معتمد التقرير غير المنفّذ');
    const proj = v.link?.projectId ? ctx.s.projects.find((x) => x.id === v.link!.projectId) : undefined;
    ctx.require('visit.approve_report', { own: proj?.pmId === ctx.actorId, depts: [ctx.user(v.ownerId).deptCode] });
    Object.assign(v.report, { decision: p.decision, note: p.note, at: ctx.now });
    if (p.decision === 'returned') {
      ctx.check(p.note.trim(), 'ملاحظة الإعادة مطلوبة');
      v.status = 'executed';
      v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: 'أُعيد التقرير', note: p.note });
      ctx.notify([v.ownerId], { title: `أُعيد تقرير الإشراف ${v.id}`, body: p.note, link: vlink(v), type: 'visit.report_returned' });
      return;
    }
    v.status = 'report_approved';
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: 'اعتُمد التقرير' });
    ctx.event('visit.report_approved', { type: 'visit', id: v.id }, 'اعتُمد تقرير الإشراف («تم التنفيذ» ≠ «تم اعتماد التقرير»)', v.link?.projectId);
    ctx.notify([v.ownerId], { title: `اعتُمد تقرير ${v.id}`, link: vlink(v), type: 'visit.report_approved' });
  },

  'visit.resubmit_report'(ctx: Ctx, p: { visitId: string; reportFile: string }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.ownerId === ctx.actorId, 'لمسؤول الزيارة');
    ctx.check(v.type === 'supervision' && v.status === 'executed' && v.report?.decision === 'returned', 'لا يوجد تقرير معاد');
    ctx.check(p.reportFile.trim(), 'الملف مطلوب');
    v.report = { file: p.reportFile, submittedAt: ctx.now, approverId: v.report!.approverId };
    v.status = 'report_pending';
    ctx.notify([v.report.approverId], { title: `تقرير إشراف معدّل ${v.id}`, link: vlink(v), type: 'visit.report_submitted' });
  },

  'visit.set_billing'(ctx: Ctx, p: { visitId: string; billing: VisitBilling }) {
    const v = ctx.visit(p.visitId);
    const proj = v.link?.projectId ? ctx.s.projects.find((x) => x.id === v.link!.projectId) : undefined;
    ctx.check(v.ownerId === ctx.actorId || proj?.pmId === ctx.actorId, 'التصنيف لمسؤول الزيارة أو مدير المشروع');
    ctx.check(!v.claimId, 'طولب بالزيارة — لا يتغير تصنيفها');
    v.billing = p.billing;
    v.history.push({ at: ctx.now, by: ctx.actorId as UserId, change: `تصنيف الفوترة: ${p.billing}` });
  },

  /** VS-07: post-visit follow-ups become tasks, keyed so a repeat does not duplicate them. */
  'visit.follow_up_task'(ctx: Ctx, p: { visitId: string; title: string; ownerId: UserId; dueDays: number }) {
    const v = ctx.visit(p.visitId);
    ctx.check(v.ownerId === ctx.actorId, 'لمسؤول الزيارة');
    ctx.check(['executed', 'report_pending', 'report_approved', 'inaccessible'].includes(v.status), 'بعد تنفيذ الزيارة');
    ctx.check(p.title.trim(), 'عنوان المتابعة مطلوب');
    const n = ctx.s.tasks.filter((t) => t.dedupeKey?.startsWith(`visit:${v.id}:`)).length + 1;
    return ctx.generateTask({ dedupeKey: `visit:${v.id}:${n}`, title: p.title, ownerId: p.ownerId, dueDays: p.dueDays, source: 'visit_followup', link: { type: 'visit', id: v.id, label: `${v.id} — ${v.purpose}`, projectId: v.link?.projectId } }).id;
  },

  /** VS-08 / AC-12: one manual claim may cover several billable visits; none is claimed twice. */
  'visit.claim'(ctx: Ctx, p: { visitIds: string[]; amount: number; ref: string }) {
    ctx.require('collection.confirm');
    ctx.check(p.visitIds.length > 0, 'اختر زيارة واحدة على الأقل');
    ctx.check(p.amount > 0 && p.ref.trim(), 'المبلغ ومرجع المطالبة مطلوبان');
    const vs = p.visitIds.map((id) => ctx.visit(id));
    for (const v of vs) {
      ctx.check(v.billing === 'billable', `${v.id} ليست قابلة للفوترة`);
      ctx.check(!v.claimId, `${v.id} طولب بها مسبقًا — لا تُحتسب مرتين`);
      ctx.check(['executed', 'report_pending', 'report_approved', 'inaccessible'].includes(v.status), `${v.id} لم تُنفذ`);
    }
    const projectId = vs[0].link?.projectId;
    ctx.check(projectId && vs.every((v) => v.link?.projectId === projectId), 'المطالبة اليدوية لكل عقد: اختر زيارات مشروع واحد');
    const claimId = ctx.nextId('VCL');
    for (const v of vs) v.claimId = claimId;
    ctx.s.visitClaims.push({ id: claimId, projectId, visitIds: p.visitIds, amount: p.amount, at: ctx.now, by: ctx.actorId as UserId, ref: p.ref });
    if (projectId) {
      const proj = ctx.project(projectId);
      const pay: PaymentItem = {
        id: `FPS-${proj.id.slice(4)}-V${ctx.s.visitClaims.length}`, projectId, quotationId: proj.contracts[0]?.quotationId ?? '', label: `مطالبة زيارات (${p.visitIds.length})`,
        amount: p.amount, condition: 'completion', link: { kind: 'none', ids: [] }, graceDays: ctx.s.settings.defaultGraceDays,
        entitlement: 'due', dueAt: ctx.now, graceUntil: addCalendarDays(ctx.now, ctx.s.settings.defaultGraceDays),
        evidence: vs.map((v) => ({ kind: 'زيارة منفذة', at: v.actualEnd ?? ctx.now, note: v.id })), evidenceCheck: 'accepted',
        invoicing: 'invoiced', invoiceRef: p.ref, invoicedAt: ctx.now, collection: 'unpaid', collected: 0, receipts: [], followUps: [], visitIds: p.visitIds,
      };
      ctx.s.payments.push(pay);
      const owner = ctx.oppOwnerOf(proj);
      if (owner) ctx.generateTask({ dedupeKey: `collection:${pay.id}`, title: `متابعة تحصيل: ${pay.label}`, ownerId: owner, dueDays: pay.graceDays, source: 'collection', link: { type: 'payment', id: pay.id, label: `${pay.label} — ${proj.id}`, projectId }, priority: 'high' });
    }
    ctx.event('visit.claimed', { type: 'visit_claim', id: claimId }, `مطالبة يدوية ${p.ref} تغطي ${p.visitIds.join('، ')}`, projectId);
    return claimId;
  },
};
