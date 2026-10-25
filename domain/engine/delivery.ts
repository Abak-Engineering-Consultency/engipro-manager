import { addCalendarDays, addDays, isAfter } from '../calendar';
import { TIME_BASED } from '../labels';
import type { Deliverable, ISO, PaymentItem, Project, Revision, UserId } from '../types';
import { Ctx, randomHex } from './core';

const dlink = (d: Deliverable) => `/projects/${d.projectId}?tab=deliverables&d=${d.id}`;
const plink = (p: PaymentItem) => `/projects/${p.projectId}?tab=payments&p=${p.id}`;

const current = (d: Deliverable): Revision | undefined => d.revisions[d.revisions.length - 1];

/** The item owner(s) of a deliverable: whoever owns one of its scope items. */
export const deliverableOwners = (proj: Project, d: Deliverable) =>
  proj.scopeItems.filter((i) => d.scopeItemIds.includes(i.id)).map((i) => i.ownerId).filter((x): x is UserId => !!x);

/** Deliverables a payment is tied to (PJ-07): explicit deliverables, items, or a phase's items. */
export function linkedDeliverables(ctx: Ctx, pay: PaymentItem): Deliverable[] {
  const proj = ctx.project(pay.projectId);
  const all = ctx.s.deliverables.filter((d) => d.projectId === pay.projectId);
  if (pay.link.kind === 'deliverables') return all.filter((d) => pay.link.ids.includes(d.id));
  if (pay.link.kind === 'items') return all.filter((d) => d.scopeItemIds.some((i) => pay.link.ids.includes(i)));
  if (pay.link.kind === 'phase') {
    const items = new Set(proj.phases.filter((ph) => pay.link.ids.includes(ph.id)).flatMap((ph) => ph.tasks.map((t) => t.scopeItemId)).filter(Boolean));
    return all.filter((d) => d.scopeItemIds.some((i) => items.has(i)));
  }
  return [];
}

/**
 * DL-08 / AC-07: a payment becomes due once — when every linked deliverable is approved (an
 * excluded one no longer counts). Finance is told with the evidence; no duplicate entitlement.
 */
export function checkPaymentConditions(ctx: Ctx, proj: Project) {
  if (proj.paymentMapping.status !== 'confirmed') return;
  for (const pay of ctx.s.payments.filter((x) => x.projectId === proj.id && x.entitlement === 'not_due' && !TIME_BASED.includes(x.condition))) {
    const linked = linkedDeliverables(ctx, pay).filter((d) => d.status !== 'excluded');
    if (!linked.length || !linked.every((d) => d.status === 'client_approved')) continue;
    pay.entitlement = 'due';
    pay.dueAt = ctx.now;
    pay.graceUntil = addCalendarDays(ctx.now, pay.graceDays);
    pay.evidenceCheck = 'pending';
    pay.evidence = linked.map((d) => {
      const r = current(d);
      const kind = d.requiresGov ? 'صدور من الجهة' : r?.clientResponse?.kind === 'deemed' ? 'قبول ضمني وفق العقد' : 'قبول صريح من العميل';
      return { deliverableId: d.id, rev: r?.rev, kind, at: r?.clientResponse?.at ?? ctx.now, note: r?.clientResponse?.note ?? '' };
    });
    ctx.event('payment.entitlement_due', { type: 'payment', id: pay.id }, `تحقق شرط «${pay.label}» — مستحقة ضمن المهلة حتى ${pay.graceUntil.slice(0, 10)}`, proj.id);
    ctx.notify(ctx.finance(), { title: `دفعة مستحقة: ${pay.label}`, body: `${proj.id} — راجع الإثبات وأعدّ المطالبة`, link: plink(pay), type: 'payment.entitlement_due' });
  }
}

/** AD-05: all scope deliverables approved or excluded with consent → technically complete. */
export function checkTechnicalCompletion(ctx: Ctx, proj: Project) {
  if (proj.status !== 'in_progress') return;
  const ds = ctx.s.deliverables.filter((d) => d.projectId === proj.id);
  if (!ds.length || !ds.every((d) => d.status === 'client_approved' || d.status === 'excluded')) return;
  if (!ds.some((d) => d.status === 'client_approved')) return;
  proj.status = 'technically_complete';
  proj.technicallyCompleteAt = ctx.now;
  ctx.event('project.technically_complete', { type: 'project', id: proj.id }, 'كل مخرجات النطاق معتمدة أو مستبعدة بموافقة — مكتمل فنيًا (قد تبقى مستحقات)', proj.id);
  ctx.notify([proj.pmId], { title: `اكتمل ${proj.id} فنيًا — اطلب الإغلاق`, link: `/projects/${proj.id}?tab=closure`, type: 'project.technically_complete' });
}

function onClientApproved(ctx: Ctx, d: Deliverable) {
  const proj = ctx.project(d.projectId);
  ctx.event('deliverable.client_approved', { type: 'deliverable', id: d.id }, `اعتُمد «${d.title}» ${revLabel(current(d)?.rev)}`, proj.id);
  ctx.notify([proj.pmId, ...deliverableOwners(proj, d)], { title: `اعتُمد المخرج: ${d.title}`, link: dlink(d), type: 'deliverable.client_approved' });
  checkPaymentConditions(ctx, proj);
  checkTechnicalCompletion(ctx, proj);
}

export const revLabel = (n?: number) => `Rev ${String(n ?? 0).padStart(2, '0')}`;

function unblockDeliveries(ctx: Ctx, pay: PaymentItem) {
  for (const id of pay.beforeDeliveryOf ?? []) {
    const d = ctx.s.deliverables.find((x) => x.id === id);
    if (d?.status === 'blocked_pending_payment') {
      d.status = 'ready_for_delivery';
      const proj = ctx.project(d.projectId);
      ctx.event('deliverable.unblocked', { type: 'deliverable', id: d.id }, `أكدت المالية السداد — «${d.title}» جاهز للتسليم`, proj.id);
      ctx.notify([proj.pmId], { title: `يمكن تسليم «${d.title}» الآن`, link: dlink(d), type: 'deliverable.unblocked' });
    }
  }
}

export const deliveryCommands = {
  'deliverable.upload'(ctx: Ctx, p: { deliverableId: string; files: string[] }) {
    const d = ctx.deliverable(p.deliverableId);
    const proj = ctx.project(d.projectId);
    ctx.require('deliverable.prepare', { own: deliverableOwners(proj, d).includes(ctx.actorId as UserId) });
    ctx.check(!d.requiresGov, 'هذا المخرج يُعتمد بصدور المعاملة الحكومية، لا برفع ملفات (GT-11)');
    ctx.check(d.status === 'in_preparation', 'الرفع متاح والمخرج قيد الإعداد');
    ctx.requireExceptionScope(proj, d.scopeItemIds, 'العمل على هذا المخرج');
    ctx.check(p.files.some((f) => f.trim()), 'أضف ملفًا واحدًا على الأقل');
    let r = current(d);
    if (!r || r.issued) {
      r = { rev: r ? r.rev + 1 : 0, files: [], createdAt: ctx.now, createdBy: ctx.actorId as UserId, reason: r ? 'client_comments' : 'initial', reviewRounds: [] };
      d.revisions.push(r);
    }
    // Working files stay editable until the revision is issued (NX-04); each upload is fingerprinted.
    r.files = p.files.filter((f) => f.trim()).map((name) => ({ name: name.trim(), fileId: `NC-${randomHex(6)}`, checksum: `sha256:${randomHex(12)}`, size: `${(1 + Math.random() * 9).toFixed(1)} MB` }));
    r.createdBy = ctx.actorId as UserId;
    ctx.event('deliverable.uploaded', { type: 'deliverable', id: d.id }, `رُفعت ملفات ${revLabel(r.rev)} (${r.files.length})`, proj.id);
  },

  'deliverable.submit'(ctx: Ctx, p: { deliverableId: string; withReview?: boolean }) {
    const d = ctx.deliverable(p.deliverableId);
    const proj = ctx.project(d.projectId);
    ctx.require('deliverable.prepare', { own: deliverableOwners(proj, d).includes(ctx.actorId as UserId) });
    ctx.check(!d.requiresGov, 'هذا المخرج يُعتمد بصدور المعاملة الحكومية (GT-11)');
    ctx.check(d.status === 'in_preparation', 'المخرج ليس قيد الإعداد');
    const r = current(d);
    ctx.check(r?.files.length, 'ارفع ملفات الإصدار أولًا');
    if (d.technical || p.withReview) {
      r.reviewRounds.push({ submittedAt: ctx.now });
      d.status = 'internal_review';
      ctx.event('deliverable.submitted', { type: 'deliverable', id: d.id }, `رُفع ${revLabel(r.rev)} للمراجعة الداخلية (جولة ${r.reviewRounds.length})`, proj.id);
      const reviewers = ctx.holders('deliverable.review', [d.deptCode]).filter((u) => u !== r.createdBy);
      ctx.notify(reviewers, { title: `مراجعة مخرج: ${d.title}`, body: `${proj.id} — ${revLabel(r.rev)}`, link: dlink(d), type: 'deliverable.submitted' });
    } else {
      r.approvedInternallyAt = ctx.now;
      d.status = 'ready_for_delivery';
      ctx.event('deliverable.ready', { type: 'deliverable', id: d.id }, `«${d.title}» جاهز للتسليم (غير فني — المراجعة اختيارية)`, proj.id);
      ctx.notify([proj.pmId], { title: `جاهز للتسليم: ${d.title}`, link: dlink(d), type: 'deliverable.ready' });
    }
  },

  /** DL-02 / F6 / AC-04: reviewer ≠ preparer. */
  'deliverable.review'(ctx: Ctx, p: { deliverableId: string; decision: 'accepted' | 'returned'; note: string }) {
    const d = ctx.deliverable(p.deliverableId);
    const proj = ctx.project(d.projectId);
    ctx.require('deliverable.review', { depts: [d.deptCode] });
    ctx.check(d.status === 'internal_review', 'المخرج ليس في المراجعة');
    const r = current(d)!;
    ctx.check(r.createdBy !== ctx.actorId, 'لا يراجع معدّ المخرج عمله (فصل الأدوار)');
    if (p.decision === 'returned') ctx.check(p.note.trim(), 'ملاحظة الإعادة مطلوبة');
    const round = r.reviewRounds[r.reviewRounds.length - 1];
    Object.assign(round, { reviewerId: ctx.actorId, decision: p.decision, note: p.note, at: ctx.now });
    if (p.decision === 'accepted') {
      r.approvedInternallyAt = ctx.now;
      d.status = 'ready_for_delivery';
      ctx.event('deliverable.ready', { type: 'deliverable', id: d.id }, `قبول داخلي لـ ${revLabel(r.rev)} — مربوط بالبصمة ${r.files[0]?.checksum ?? ''}`, proj.id);
      ctx.notify([proj.pmId], { title: `جاهز للتسليم: ${d.title}`, link: dlink(d), type: 'deliverable.ready' });
    } else {
      d.status = 'in_preparation';
      ctx.event('deliverable.returned', { type: 'deliverable', id: d.id }, `أُعيد للمعدّ (جولة جديدة): ${p.note}`, proj.id);
      ctx.notify(deliverableOwners(proj, d), { title: `أُعيد المخرج بملاحظة: ${d.title}`, body: p.note, link: dlink(d), type: 'deliverable.returned' });
    }
  },

  /** DL-03…DL-05: documented delivery; blocked until finance confirms when the contract requires payment first. */
  'deliverable.deliver'(ctx: Ctx, p: { deliverableId: string; channel: string; recipient: string; reference: string }) {
    const d = ctx.deliverable(p.deliverableId);
    const proj = ctx.project(d.projectId);
    ctx.require('deliverable.deliver', { own: ctx.isPm(proj) });
    ctx.check(d.status === 'ready_for_delivery', 'المخرج ليس جاهزًا للتسليم');
    ctx.check(proj.status === 'in_progress', 'التسليم أثناء التنفيذ فقط');
    ctx.requireExceptionScope(proj, d.scopeItemIds, 'تسليم هذا المخرج');
    ctx.check(p.channel.trim() && p.recipient.trim(), 'القناة والمستلم مطلوبان');
    const unpaid = ctx.s.payments.filter((x) => x.beforeDeliveryOf?.includes(d.id) && x.collection !== 'fully_collected');
    if (unpaid.length && !d.ceoRelease) {
      d.status = 'blocked_pending_payment';
      ctx.event('deliverable.delivery_blocked', { type: 'deliverable', id: d.id }, `منع التسليم: العقد يشترط سداد «${unpaid[0].label}» قبل هذا التسليم`, proj.id);
      ctx.notify([...ctx.finance(), proj.pmId], { title: `تسليم ممنوع حتى السداد: ${d.title}`, body: unpaid.map((u) => u.label).join('، '), link: dlink(d), type: 'deliverable.delivery_blocked' });
      return 'blocked';
    }
    const r = current(d)!;
    r.issued = { at: ctx.now, by: ctx.actorId as UserId, channel: p.channel, recipient: p.recipient, reference: p.reference || `${d.id}-${revLabel(r.rev)}` };
    d.status = 'awaiting_client';
    d.responseDueAt = addDays(ctx.now, proj.responseDays, proj.dayType, ctx.s.settings);
    d.nextFollowUpAt = addCalendarDays(ctx.now, ctx.s.settings.deliveryFollowUpDays);
    ctx.event('deliverable.delivered', { type: 'deliverable', id: d.id }, `سُلّم ${revLabel(r.rev)} عبر ${p.channel} إلى ${p.recipient} — الإصدار الصادر ثابت`, proj.id);
    ctx.notify([ctx.oppOwnerOf(proj)], { title: `سُلّم للعميل: ${d.title}`, body: `بانتظار الرد حتى ${d.responseDueAt.slice(0, 10)}`, link: dlink(d), type: 'deliverable.delivered' });
  },

  /** DL-04 exception: CEO only, documented; the amount stays due. */
  'deliverable.ceo_release'(ctx: Ctx, p: { deliverableId: string; reason: string }) {
    ctx.require('project.grant_exception');
    const d = ctx.deliverable(p.deliverableId);
    ctx.check(d.status === 'blocked_pending_payment', 'المخرج غير ممنوع');
    ctx.check(p.reason.trim(), 'سبب الاستثناء مطلوب');
    d.ceoRelease = { by: ctx.actorId as UserId, at: ctx.now, reason: p.reason };
    d.status = 'ready_for_delivery';
    const proj = ctx.project(d.projectId);
    ctx.event('deliverable.ceo_release', { type: 'deliverable', id: d.id }, `استثناء الرئيس التنفيذي للتسليم قبل السداد: ${p.reason} — المبلغ يبقى مستحقًا`, proj.id);
    ctx.notify([proj.pmId, ...ctx.finance()], { title: `استثناء تسليم قبل السداد: ${d.title}`, body: p.reason, link: dlink(d), type: 'deliverable.ceo_release' });
  },

  /** DL-07: comments create a new revision and never replace the issued one (AC-16). */
  'deliverable.client_response'(ctx: Ctx, p: { deliverableId: string; kind: 'comments' | 'accepted'; note: string; proof?: string }) {
    const d = ctx.deliverable(p.deliverableId);
    const proj = ctx.project(d.projectId);
    ctx.require('deliverable.deliver', { own: ctx.isPm(proj) });
    ctx.check(d.status === 'awaiting_client', 'المخرج ليس بانتظار رد العميل');
    const r = current(d)!;
    if (p.kind === 'accepted') {
      ctx.check(p.proof?.trim(), 'إثبات القبول مطلوب');
      r.clientResponse = { kind: 'accepted', at: ctx.now, note: p.note, proof: p.proof, by: ctx.actorId as UserId };
      d.status = 'client_approved';
      d.nextFollowUpAt = undefined;
      onClientApproved(ctx, d);
      return;
    }
    ctx.check(p.note.trim(), 'ملاحظات العميل مطلوبة');
    r.clientResponse = { kind: 'comments', at: ctx.now, note: p.note, by: ctx.actorId as UserId };
    d.revisions.push({ rev: r.rev + 1, files: [], createdAt: ctx.now, createdBy: ctx.actorId as UserId, reason: 'client_comments', reviewRounds: [] });
    d.status = 'in_preparation';
    d.nextFollowUpAt = undefined;
    ctx.event('deliverable.client_comments', { type: 'deliverable', id: d.id }, `ملاحظات العميل على ${revLabel(r.rev)} → فُتح ${revLabel(r.rev + 1)}؛ ملف ${revLabel(r.rev)} وبصمته لم يتغيرا`, proj.id);
    ctx.notify(deliverableOwners(proj, d), { title: `ملاحظات العميل — أعدّ ${revLabel(r.rev + 1)}: ${d.title}`, body: p.note, link: dlink(d), type: 'deliverable.client_comments' });
  },

  'deliverable.log_follow_up'(ctx: Ctx, p: { deliverableId: string; note: string }) {
    const d = ctx.deliverable(p.deliverableId);
    const proj = ctx.project(d.projectId);
    const own = ctx.isPm(proj) || ctx.oppOwnerOf(proj) === ctx.actorId;
    ctx.check(own, 'المتابعة لمدير المشروع أو مسؤول الفرصة');
    ctx.check(d.status === 'awaiting_client', 'لا توجد متابعة مفتوحة');
    d.nextFollowUpAt = addCalendarDays(ctx.now, ctx.s.settings.deliveryFollowUpDays);
    ctx.event('deliverable.follow_up', { type: 'deliverable', id: d.id }, `متابعة مع العميل: ${p.note}`, proj.id);
  },

  /** DL-07 / F8: no silent acceptance — only under a proven contract clause, approved by the dept manager. */
  'deliverable.request_deemed'(ctx: Ctx, p: { deliverableId: string; evidence: string }) {
    const d = ctx.deliverable(p.deliverableId);
    const proj = ctx.project(d.projectId);
    ctx.require('deliverable.deliver', { own: ctx.isPm(proj) });
    ctx.check(d.status === 'awaiting_client', 'المخرج ليس بانتظار رد العميل');
    ctx.check(proj.deemedAcceptanceClause, 'لا يوجد في العقد بند قبول ضمني — لا قبول بالصمت');
    ctx.check(d.responseDueAt && !isAfter(d.responseDueAt, ctx.now), 'مهلة الرد التعاقدية لم تنته بعد');
    ctx.check(p.evidence.trim(), 'الأدلة مطلوبة (إثبات الاستلام وانقضاء المهلة)');
    d.deemedRequest = { clause: proj.deemedAcceptanceClause, evidence: p.evidence, by: ctx.actorId as UserId, at: ctx.now };
    d.status = 'deemed_acceptance_review';
    ctx.event('deliverable.deemed_requested', { type: 'deliverable', id: d.id }, 'طلب إثبات قبول وفق بند العقد', proj.id);
    ctx.notify(ctx.holders('deliverable.review', [d.deptCode]), { title: `اعتماد قبول ضمني: ${d.title}`, body: proj.deemedAcceptanceClause, link: dlink(d), type: 'deliverable.deemed_requested' });
  },

  'deliverable.decide_deemed'(ctx: Ctx, p: { deliverableId: string; decision: 'approved' | 'returned'; note: string }) {
    const d = ctx.deliverable(p.deliverableId);
    ctx.require('deliverable.review', { depts: [d.deptCode] });
    ctx.check(d.status === 'deemed_acceptance_review' && d.deemedRequest, 'لا يوجد طلب قبول ضمني');
    ctx.check(d.deemedRequest.by !== ctx.actorId, 'المعتمد غير الطالب');
    Object.assign(d.deemedRequest, { decidedBy: ctx.actorId, decision: p.decision, note: p.note });
    if (p.decision === 'returned') {
      d.status = 'awaiting_client';
      ctx.event('deliverable.deemed_returned', { type: 'deliverable', id: d.id }, `رُفض إثبات القبول الضمني: ${p.note}`, d.projectId);
      return;
    }
    const r = current(d)!;
    r.clientResponse = { kind: 'deemed', at: ctx.now, note: `قبول وفق بند العقد: ${d.deemedRequest.clause}`, proof: d.deemedRequest.evidence, by: ctx.actorId as UserId };
    d.status = 'client_approved';
    d.nextFollowUpAt = undefined;
    onClientApproved(ctx, d);
  },

  // ── Payments (DL-08…DL-14) ───────────────────────────────────────────────────

  'payment.verify_evidence'(ctx: Ctx, p: { paymentId: string; decision: 'accepted' | 'objected'; note: string }) {
    ctx.require('payment.verify_entitlement');
    const pay = ctx.payment(p.paymentId);
    ctx.check(pay.evidenceCheck === 'pending', 'لا يوجد إثبات بانتظار التحقق');
    ctx.check(pay.invoicing === 'not_invoiced', 'بعد الفاتورة تكون المعالجة محاسبية لا إعادة');
    const proj = ctx.project(pay.projectId);
    if (p.decision === 'accepted') {
      pay.evidenceCheck = 'accepted';
      ctx.event('payment.evidence_accepted', { type: 'payment', id: pay.id }, 'المالية قبلت إثبات الاستحقاق', proj.id);
      return;
    }
    ctx.check(p.note.trim(), 'سبب الاعتراض مطلوب');
    pay.evidenceCheck = 'objected';
    pay.entitlement = 'not_due';
    pay.dueAt = undefined;
    pay.graceUntil = undefined;
    ctx.event('payment.evidence_objected', { type: 'payment', id: pay.id }, `اعترضت المالية قبل الفاتورة — يعود البند للمراجعة: ${p.note}`, proj.id);
    ctx.notify([proj.pmId], { title: `اعتراض المالية على استحقاق «${pay.label}»`, body: p.note, link: plink(pay), type: 'payment.evidence_objected' });
  },

  'payment.resubmit_evidence'(ctx: Ctx, p: { paymentId: string; note: string }) {
    const pay = ctx.payment(p.paymentId);
    const proj = ctx.project(pay.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    ctx.check(pay.evidenceCheck === 'objected', 'لا يوجد اعتراض');
    ctx.check(p.note.trim(), 'توضيح الإثبات مطلوب');
    pay.entitlement = 'due';
    pay.dueAt = ctx.now;
    pay.graceUntil = addCalendarDays(ctx.now, pay.graceDays);
    pay.evidenceCheck = 'pending';
    pay.evidence.push({ kind: 'توضيح مدير المشروع', at: ctx.now, note: p.note });
    ctx.event('payment.evidence_resubmitted', { type: 'payment', id: pay.id }, `أُعيد تقديم الإثبات: ${p.note}`, proj.id);
    ctx.notify(ctx.finance(), { title: `إثبات استحقاق معدّل: ${pay.label}`, link: plink(pay), type: 'payment.entitlement_due' });
  },

  /** DL-11: finance issues the claim; the opportunity owner gets one collection task per payment. */
  'payment.issue_claim'(ctx: Ctx, p: { paymentId: string; invoiceRef: string }) {
    ctx.require('collection.confirm');
    const pay = ctx.payment(p.paymentId);
    ctx.check(pay.entitlement !== 'not_due', 'الدفعة لم تستحق بعد');
    ctx.check(pay.invoicing === 'not_invoiced', 'صدرت المطالبة مسبقًا');
    ctx.check(pay.evidenceCheck === 'accepted' || pay.evidenceCheck === 'none', 'تحقق من إثبات الاستحقاق أولًا');
    ctx.check(p.invoiceRef.trim(), 'مرجع الفاتورة في النظام المحاسبي مطلوب');
    pay.invoicing = 'invoiced';
    pay.invoiceRef = p.invoiceRef;
    pay.invoicedAt = ctx.now;
    const proj = ctx.project(pay.projectId);
    ctx.event('payment.claim_issued', { type: 'payment', id: pay.id }, `صدرت المطالبة ${p.invoiceRef}`, proj.id);
    const owner = ctx.oppOwnerOf(proj);
    if (owner) {
      ctx.generateTask({
        dedupeKey: `collection:${pay.id}`, title: `متابعة تحصيل: ${pay.label}`, ownerId: owner, dueDays: pay.graceDays, source: 'collection',
        link: { type: 'payment', id: pay.id, label: `${pay.label} — ${proj.id}`, projectId: proj.id }, priority: 'high',
      });
    }
  },

  'payment.log_follow_up'(ctx: Ctx, p: { paymentId: string; response: string; promise?: string; expectedDate?: ISO; nextFollowUp?: ISO }) {
    const pay = ctx.payment(p.paymentId);
    const proj = ctx.project(pay.projectId);
    ctx.require('opportunity.work', { own: ctx.oppOwnerOf(proj) === ctx.actorId });
    ctx.check(pay.invoicing === 'invoiced' && pay.collection !== 'fully_collected', 'لا توجد متابعة تحصيل مفتوحة');
    ctx.check(p.response.trim(), 'رد العميل مطلوب');
    pay.followUps.push({ at: ctx.now, by: ctx.actorId as UserId, response: p.response, promise: p.promise, expectedDate: p.expectedDate, nextFollowUp: p.nextFollowUp });
    ctx.event('payment.follow_up', { type: 'payment', id: pay.id }, `متابعة تحصيل (سجل التواصل): ${p.response}${p.promise ? ` — وعد: ${p.promise}` : ''}`, proj.id);
  },

  /** DL-13 / A5: "the client says they transferred" is referred to finance; it is not a collection. */
  'payment.claim_transfer'(ctx: Ctx, p: { paymentId: string; proof: string }) {
    const pay = ctx.payment(p.paymentId);
    const proj = ctx.project(pay.projectId);
    ctx.require('opportunity.work', { own: ctx.oppOwnerOf(proj) === ctx.actorId });
    ctx.check(pay.collection !== 'fully_collected', 'الدفعة محصلة');
    ctx.check(p.proof.trim(), 'إثبات التحويل مطلوب');
    pay.transferClaim = { at: ctx.now, by: ctx.actorId as UserId, proof: p.proof };
    ctx.event('payment.transfer_claimed', { type: 'payment', id: pay.id }, `العميل أفاد بالتحويل — أُحيل للمالية مع الإثبات (${p.proof})`, proj.id);
    ctx.notify(ctx.finance(), { title: `العميل أفاد بالتحويل: ${pay.label}`, body: `${proj.id} — طابق التحويل والسند`, link: plink(pay), type: 'payment.transfer_claimed' });
  },

  'payment.escalate'(ctx: Ctx, p: { paymentId: string; note: string }) {
    const pay = ctx.payment(p.paymentId);
    const proj = ctx.project(pay.projectId);
    ctx.require('opportunity.work', { own: ctx.oppOwnerOf(proj) === ctx.actorId });
    ctx.check(!pay.escalatedAt, 'صُعّدت مسبقًا');
    ctx.check(p.note.trim(), 'سبب التصعيد مطلوب');
    pay.escalatedAt = ctx.now;
    pay.escalation = 'early';
    ctx.event('payment.escalated', { type: 'payment', id: pay.id }, `تصعيد مبكر لمدير المبيعات: ${p.note}`, proj.id);
    ctx.notify(ctx.salesManagers(), { title: `تصعيد تحصيل: ${pay.label}`, body: p.note, link: plink(pay), type: 'payment.escalated' });
  },

  /** DL-14: finance alone confirms collection — also after closure or cancellation (AC-13, AC-14). */
  'payment.record_collection'(ctx: Ctx, p: { paymentId: string; amount: number; ref: string }) {
    ctx.require('collection.confirm');
    const pay = ctx.payment(p.paymentId);
    ctx.check(pay.invoicing === 'invoiced' || pay.condition === 'advance', 'تُسجّل المبالغ بعد إصدار المطالبة');
    ctx.check(pay.collection !== 'fully_collected', 'الدفعة محصلة بالكامل');
    ctx.check(p.amount > 0 && pay.collected + p.amount <= pay.amount, 'المبلغ غير صحيح');
    ctx.check(p.ref.trim(), 'رقم السند مطلوب');
    pay.collected += p.amount;
    pay.receipts.push({ amount: p.amount, at: ctx.now, by: ctx.actorId as UserId, ref: p.ref });
    pay.collection = pay.collected >= pay.amount ? 'fully_collected' : 'partially_collected';
    const proj = ctx.project(pay.projectId);
    ctx.event('payment.collected', { type: 'payment', id: pay.id }, `${pay.collection === 'fully_collected' ? 'تحصيل كامل' : 'تحصيل جزئي'} — سند ${p.ref}`, proj.id);
    if (pay.collection === 'fully_collected') {
      const task = ctx.s.tasks.find((t) => t.dedupeKey === `collection:${pay.id}`);
      if (task && !['completed', 'cancelled'].includes(task.status)) {
        task.status = 'completed';
        task.result = `أكدت المالية التحصيل الكامل (سند ${p.ref})`;
        task.completedAt = ctx.now;
      }
      unblockDeliveries(ctx, pay);
    }
    ctx.notify([ctx.oppOwnerOf(proj), proj.pmId], { title: `تحصيل ${pay.collection === 'fully_collected' ? 'كامل' : 'جزئي'}: ${pay.label}`, body: proj.id, link: plink(pay), type: 'payment.paid' });
  },
};
