import { serviceByCode } from '../catalog';
import type { Deliverable, GovTransaction, ISO, Project, UserId } from '../types';
import { approverIds } from '../selectors';
import { Ctx } from './core';
import { checkPaymentConditions, checkTechnicalCompletion } from './delivery';

const glink = (g: GovTransaction) => `/gov?id=${g.id}`;

/** GT-01/GT-02: created from the approved service template when the deliverable needs a procedure. */
export function createGovForDeliverable(ctx: Ctx, proj: Project, d: Deliverable): GovTransaction | undefined {
  if (d.govTransactionId) return ctx.s.gov.find((g) => g.id === d.govTransactionId);
  const item = proj.scopeItems.find((i) => d.scopeItemIds.includes(i.id));
  const svc = serviceByCode(item?.serviceCode);
  const officer = ctx.s.users.find((u) => u.grants.some((g) => g.perm === 'gov_transaction.prepare'));
  if (!officer) return undefined;
  const g: GovTransaction = {
    id: ctx.nextId('GOV'),
    projectId: proj.id,
    deliverableId: d.id,
    serviceCode: svc?.code ?? '',
    title: d.title,
    authority: svc?.authority ?? 'الجهة المختصة',
    platform: svc?.platform ?? '—',
    procedureType: svc?.procedureType ?? d.title,
    requiredDocs: (svc?.requiredDocs ?? []).map((name) => ({ name, received: false })),
    status: 'preparing',
    licensingOfficerId: officer.id,
    rounds: [],
    feeInvoiceChecked: false,
    followUps: [],
    createdAt: ctx.now,
  };
  ctx.s.gov.push(g);
  d.govTransactionId = g.id;
  d.status = 'in_preparation';
  ctx.addMember(proj, officer.id, 'licensing_officer', officer.deptCode);
  ctx.event('gov.created', { type: 'gov', id: g.id }, `معاملة ${g.procedureType} لدى ${g.authority} من قالب الخدمة`, proj.id);
  ctx.notify([officer.id], { title: `جهّز معاملة: ${g.procedureType}`, body: `${proj.id} — ${g.authority}`, link: glink(g), type: 'gov.created' });
  return g;
}

const officerScope = (ctx: Ctx, g: GovTransaction) => ({ depts: ['LIC' as const], own: g.licensingOfficerId === ctx.actorId });

/** Move on from submission once fees are settled: to the authority if an expeditor follows it. */
function afterFees(ctx: Ctx, g: GovTransaction) {
  if (g.expeditorId) {
    g.status = 'at_authority';
    const r = g.rounds[g.rounds.length - 1];
    if (r && !r.authorityStart) r.authorityStart = ctx.now;
    g.lastUpdateAt = ctx.now;
    ctx.notify([g.expeditorId], { title: `المعاملة لدى الجهة — تابعها: ${g.procedureType}`, link: glink(g), type: 'gov.at_authority' });
  } else {
    g.status = 'submitted';
    ctx.notify(ctx.holders('gov_transaction.assign'), { title: `أسند متابعة المعاملة ${g.id} لمعقّب`, body: g.authority, link: glink(g), type: 'gov.submitted' });
  }
}

export const govCommands = {
  'gov.toggle_doc'(ctx: Ctx, p: { govId: string; name: string; received: boolean }) {
    const g = ctx.gov(p.govId);
    ctx.require('gov_transaction.prepare', officerScope(ctx, g));
    ctx.check(['preparing', 'awaiting_client'].includes(g.status), 'المستندات تُستكمل أثناء التجهيز');
    const doc = g.requiredDocs.find((d) => d.name === p.name) ?? ctx.fail('مستند غير موجود');
    doc.received = p.received;
  },

  /** GT-03: documents or authorisation are requested from the client through the opportunity owner. */
  'gov.request_client_docs'(ctx: Ctx, p: { govId: string; note: string }) {
    const g = ctx.gov(p.govId);
    ctx.require('gov_transaction.prepare', officerScope(ctx, g));
    ctx.check(g.status === 'preparing', 'الطلب متاح أثناء التجهيز');
    g.status = 'awaiting_client';
    g.clientDocsRequestedAt = ctx.now;
    const proj = ctx.project(g.projectId);
    const missing = g.requiredDocs.filter((d) => !d.received).map((d) => d.name);
    ctx.event('gov.client_docs_requested', { type: 'gov', id: g.id }, `طُلبت من العميل عبر مسؤول الفرصة: ${missing.join('، ') || p.note}`, proj.id);
    ctx.notify([ctx.oppOwnerOf(proj)], { title: `اطلب من العميل مستندات المعاملة ${g.id}`, body: missing.join('، ') || p.note, link: glink(g), type: 'gov.client_docs_requested' });
  },

  'gov.client_docs_received'(ctx: Ctx, p: { govId: string }) {
    const g = ctx.gov(p.govId);
    const proj = ctx.project(g.projectId);
    ctx.check(ctx.oppOwnerOf(proj) === ctx.actorId || g.licensingOfficerId === ctx.actorId, 'يسجلها مسؤول الفرصة أو مسؤول الرخص');
    ctx.check(g.status === 'awaiting_client', 'لا يوجد طلب مستندات مفتوح');
    for (const d of g.requiredDocs) d.received = true;
    g.status = 'preparing';
    ctx.event('gov.client_docs_received', { type: 'gov', id: g.id }, 'وصلت مستندات العميل وتفويضه', proj.id);
    ctx.notify([g.licensingOfficerId], { title: `وصلت مستندات العميل — ${g.id}`, link: glink(g), type: 'gov.client_docs_received' });
  },

  /** GT-04/GT-05/GT-09: submission opens round N; fees are the client's by default, ABAK's only via a cost request. */
  'gov.submit'(ctx: Ctx, p: { govId: string; requestNo: string; feeInvoiceChecked: boolean; fees?: { amount: number; payer: 'client' | 'abak'; vendorRef?: string } }) {
    const g = ctx.gov(p.govId);
    ctx.require('gov_transaction.prepare', officerScope(ctx, g));
    ctx.check(['preparing', 'comments_processing'].includes(g.status), 'التقديم من التجهيز أو بعد معالجة الملاحظات');
    ctx.check(g.requiredDocs.every((d) => d.received), 'استكمل المستندات المطلوبة قبل التقديم');
    ctx.check(p.requestNo.trim(), 'رقم الطلب في المنصة مطلوب');
    const proj = ctx.project(g.projectId);
    const d = g.deliverableId ? ctx.s.deliverables.find((x) => x.id === g.deliverableId) : undefined;
    ctx.requireExceptionScope(proj, d?.scopeItemIds ?? [], 'تقديم هذه المعاملة');
    const prev = g.rounds[g.rounds.length - 1];
    if (prev && !prev.officeEnd && prev.officeStart) prev.officeEnd = ctx.now;
    if (g.status === 'comments_processing' && prev?.commentsTaskId) {
      const t = ctx.s.tasks.find((x) => x.id === prev.commentsTaskId);
      ctx.check(!t || t.status === 'completed', 'أكمل مهمة معالجة الملاحظات قبل إعادة التقديم');
    }
    g.rounds.push({ n: g.rounds.length + 1, submittedAt: ctx.now, requestNo: p.requestNo });
    g.feeInvoiceChecked = p.feeInvoiceChecked;
    ctx.event('gov.submitted', { type: 'gov', id: g.id }, `قُدّمت — جولة ${g.rounds.length}، رقم الطلب ${p.requestNo}`, proj.id);
    if (p.fees && p.fees.amount > 0) {
      g.fees = { amount: p.fees.amount, payer: p.fees.payer, status: 'pending' };
      g.status = 'awaiting_fees';
      if (p.fees.payer === 'abak') {
        const id = ctx.nextId('CR');
        ctx.s.costs.push({
          id, projectId: proj.id, govTransactionId: g.id, service: `رسوم ${g.procedureType} — ${g.authority}`, reason: 'رسوم حكومية تدفعها أباك استثنائيًا',
          kind: 'unplanned', justification: 'رسوم مطلوبة لاستكمال المعاملة ودفعها العميل غير متاح في الوقت المحدد', amount: p.fees.amount,
          vendor: g.authority, quoteRef: p.fees.vendorRef || `فاتورة رسوم ${p.requestNo}`, paymentTerms: 'سداد فوري عبر المنصة', bearer: 'client', payer: 'abak',
          requestedBy: ctx.actorId as UserId, requestedAt: ctx.now, status: 'submitted', decisions: [], paid: 0, payments: [],
        });
        g.fees.costRequestId = id;
        ctx.event('cost.submitted', { type: 'cost', id }, `طلب تكلفة لرسوم الجهة (${p.fees.amount}) — مدير الأقسام ثم المالية`, proj.id);
        ctx.notify(approverIds(ctx.s, 'cost_request.approve', [ctx.actorId as UserId]), { title: `طلب تكلفة رسوم: ${g.id}`, body: `${p.fees.amount} ر.س`, link: `/projects/${proj.id}?tab=costs`, type: 'cost_request.submitted' });
      } else {
        ctx.notify([ctx.oppOwnerOf(proj)], { title: `رسوم الجهة على العميل: ${g.id}`, body: `${p.fees.amount} ر.س — بلّغ العميل`, link: glink(g), type: 'gov.fees_due' });
      }
      return;
    }
    afterFees(ctx, g);
  },

  'gov.record_client_fees'(ctx: Ctx, p: { govId: string; receipt: string }) {
    const g = ctx.gov(p.govId);
    ctx.require('gov_transaction.prepare', officerScope(ctx, g));
    ctx.check(g.status === 'awaiting_fees' && g.fees?.payer === 'client', 'لا توجد رسوم على العميل بانتظار السداد');
    ctx.check(p.receipt.trim(), 'إيصال السداد مطلوب');
    g.fees!.status = 'paid';
    g.fees!.recordedBy = ctx.actorId as UserId;
    ctx.event('gov.fees_paid', { type: 'gov', id: g.id }, `سدد العميل الرسوم — سجلها مسؤول الرخص (${p.receipt})`, g.projectId);
    afterFees(ctx, g);
  },

  /** GT-06: the transactions manager assigns the expeditor (a direct grant, OD-01). */
  'gov.assign_expeditor'(ctx: Ctx, p: { govId: string; expeditorId: UserId }) {
    ctx.require('gov_transaction.assign');
    const g = ctx.gov(p.govId);
    ctx.check(['submitted', 'awaiting_fees', 'at_authority', 'comments_processing', 'preparing'].includes(g.status), 'لا يمكن الإسناد في هذه الحالة');
    const exp = ctx.user(p.expeditorId);
    ctx.check(exp.grants.some((gr) => gr.perm === 'gov_transaction.follow_up'), 'الموظف لا يحمل صلاحية المعقّب');
    const prev = g.expeditorId;
    g.expeditorId = p.expeditorId;
    const proj = ctx.project(g.projectId);
    ctx.addMember(proj, p.expeditorId, 'expeditor', exp.deptCode);
    if (prev && prev !== p.expeditorId && !ctx.s.gov.some((x) => x.projectId === proj.id && x.expeditorId === prev)) ctx.dropMember(proj, prev, 'expeditor', `أُعيد إسناد ${g.id}`);
    ctx.event('gov.assigned', { type: 'gov', id: g.id }, `${prev ? 'أعيد إسناد' : 'أُسندت'} المتابعة إلى ${exp.name}`, proj.id);
    if (g.status === 'submitted') afterFees(ctx, g);
    else ctx.notify([p.expeditorId], { title: `أُسندت إليك متابعة ${g.id}`, body: g.authority, link: glink(g), type: 'gov.assigned' });
  },

  /** GT-08: the expeditor's mandatory weekly update. */
  'gov.follow_up'(ctx: Ctx, p: { govId: string; outcome: string; platformStatus: string; nextRequirement: string; visitId?: string }) {
    const g = ctx.gov(p.govId);
    ctx.require('gov_transaction.follow_up', { own: g.expeditorId === ctx.actorId });
    ctx.check(g.status === 'at_authority', 'المتابعة والمعاملة لدى الجهة');
    ctx.check(p.outcome.trim() && p.platformStatus.trim(), 'النتيجة وحالة المنصة مطلوبتان');
    g.followUps.push({ at: ctx.now, by: ctx.actorId as UserId, outcome: p.outcome, platformStatus: p.platformStatus, nextRequirement: p.nextRequirement, visitId: p.visitId });
    g.lastUpdateAt = ctx.now;
    ctx.event('gov.follow_up', { type: 'gov', id: g.id }, `متابعة: ${p.outcome} — المنصة: ${p.platformStatus}`, g.projectId);
  },

  /** GT-09…GT-11: the authority's result closes the authority wait of the current round. */
  'gov.record_result'(ctx: Ctx, p: { govId: string; outcome: 'comments' | 'docs_request' | 'rejected' | 'issued'; note: string; docNo?: string; issuedAt?: ISO; expiresAt?: ISO }) {
    const g = ctx.gov(p.govId);
    const own = g.expeditorId === ctx.actorId || g.licensingOfficerId === ctx.actorId;
    ctx.check(own, 'يسجل النتيجة المعقّب أو مسؤول الرخص');
    ctx.check(g.status === 'at_authority', 'المعاملة ليست لدى الجهة');
    const proj = ctx.project(g.projectId);
    const r = g.rounds[g.rounds.length - 1];
    r.authorityEnd = ctx.now;
    r.outcome = p.outcome;
    r.outcomeNote = p.note;
    g.lastUpdateAt = ctx.now;
    if (p.outcome === 'comments') {
      ctx.check(p.note.trim(), 'نص الملاحظات مطلوب');
      g.status = 'comments_processing';
      r.officeStart = ctx.now;
      // Technical comments go to the technical department that owns the work, not to licensing.
      const techItem = proj.scopeItems.find((i) => i.deptCode !== 'LIC' && i.ownerId);
      const owner = techItem?.ownerId ?? proj.pmId!;
      const t = ctx.generateTask({
        dedupeKey: `gov_round:${g.id}:${r.n}`, title: `معالجة ملاحظات الجهة — ${g.procedureType} (جولة ${r.n})`, ownerId: owner, dueDays: 5, source: 'gov_comments',
        link: { type: 'gov', id: g.id, label: `${g.id} — ${g.authority}`, projectId: proj.id }, priority: 'high',
      });
      r.commentsTaskId = t.id;
      ctx.event('gov.comments_received', { type: 'gov', id: g.id }, `ملاحظات فنية في الجولة ${r.n}: توقف عداد الجهة وبدأ وقت المكتب`, proj.id);
      ctx.notify([proj.pmId, g.licensingOfficerId, ctx.deptManager(techItem?.deptCode)], { title: `ملاحظات الجهة على ${g.id}`, body: p.note, link: glink(g), type: 'gov.comments_received' });
    } else if (p.outcome === 'docs_request') {
      g.status = 'awaiting_client';
      g.clientDocsRequestedAt = ctx.now;
      g.requiredDocs.push({ name: p.note || 'مستند إضافي طلبته الجهة', received: false });
      ctx.event('gov.docs_requested', { type: 'gov', id: g.id }, `الجهة طلبت مستندًا من العميل: ${p.note}`, proj.id);
      ctx.notify([ctx.oppOwnerOf(proj), proj.pmId], { title: `الجهة تطلب مستندًا من العميل — ${g.id}`, body: p.note, link: glink(g), type: 'gov.docs_requested' });
    } else if (p.outcome === 'rejected') {
      g.status = 'final_rejection_decision';
      ctx.event('gov.rejected', { type: 'gov', id: g.id }, `رفض نهائي من الجهة: ${p.note}`, proj.id);
      ctx.notify([proj.pmId, g.licensingOfficerId], { title: `رفض نهائي — قرر: إعادة أم إغلاق (${g.id})`, body: p.note, link: glink(g), type: 'gov.rejected' });
    } else {
      ctx.check(p.docNo?.trim() && p.issuedAt, 'رقم الوثيقة وتاريخ الإصدار مطلوبان');
      g.status = 'issued';
      g.result = { docNo: p.docNo!, issuedAt: p.issuedAt!, expiresAt: p.expiresAt };
      const d = g.deliverableId ? ctx.s.deliverables.find((x) => x.id === g.deliverableId) : undefined;
      if (d && d.status !== 'client_approved') {
        d.revisions.push({
          rev: d.revisions.length, files: [{ name: `${p.docNo}.pdf`, fileId: `NC-${g.id}`, checksum: `sha256:${g.id.toLowerCase()}`, size: '0.4 MB' }],
          createdAt: ctx.now, createdBy: ctx.actorId as UserId, reason: 'initial', reviewRounds: [], approvedInternallyAt: ctx.now,
          issued: { at: p.issuedAt!, by: ctx.actorId as UserId, channel: g.platform, recipient: g.authority, reference: p.docNo! },
          clientResponse: { kind: 'accepted', at: ctx.now, note: `صدرت من ${g.authority} برقم ${p.docNo}`, proof: p.docNo, by: ctx.actorId as UserId },
        });
        d.status = 'client_approved';
        ctx.event('deliverable.client_approved', { type: 'deliverable', id: d.id }, `«${d.title}» معتمد بصدور الوثيقة ${p.docNo}`, proj.id);
      }
      ctx.event('gov.issued', { type: 'gov', id: g.id }, `صدرت: ${p.docNo}${p.expiresAt ? ` — تنتهي ${p.expiresAt.slice(0, 10)}` : ''}`, proj.id);
      ctx.notify([proj.pmId, ctx.oppOwnerOf(proj), ...ctx.finance()], { title: `صدرت ${g.procedureType} — ${p.docNo}`, body: proj.id, link: glink(g), type: 'gov.issued' });
      checkPaymentConditions(ctx, proj);
      checkTechnicalCompletion(ctx, proj);
    }
  },

  /** GT-10: after a final rejection, the PM and licensing officer decide to resubmit or close. */
  'gov.final_decision'(ctx: Ctx, p: { govId: string; decision: 'resubmit' | 'close'; reason: string }) {
    const g = ctx.gov(p.govId);
    const proj = ctx.project(g.projectId);
    ctx.check(ctx.isPm(proj) || g.licensingOfficerId === ctx.actorId, 'القرار لمدير المشروع ومسؤول الرخص');
    ctx.check(g.status === 'final_rejection_decision', 'لا يوجد رفض نهائي');
    ctx.check(p.reason.trim(), 'السبب الموثق مطلوب');
    if (p.decision === 'resubmit') {
      g.status = 'preparing';
      ctx.event('gov.resubmit_decided', { type: 'gov', id: g.id }, `قرار إعادة التقديم: ${p.reason}`, proj.id);
      ctx.notify([g.licensingOfficerId], { title: `أعد تجهيز ${g.id} للتقديم`, body: p.reason, link: glink(g), type: 'gov.resubmit' });
      return;
    }
    g.status = 'closed_not_issued';
    g.closedReason = p.reason;
    ctx.event('gov.closed_not_issued', { type: 'gov', id: g.id }, `أُغلقت دون صدور: ${p.reason}`, proj.id);
    ctx.notify([proj.pmId, ctx.oppOwnerOf(proj)], { title: `أُغلقت المعاملة دون صدور — ${g.id}`, body: p.reason, link: glink(g), type: 'gov.closed_not_issued' });
  },
};
