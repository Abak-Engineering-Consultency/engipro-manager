import type { CostRequest, Project } from '../types';
import { Ctx } from './core';

const clink = (c: CostRequest) => `/projects/${c.projectId}?tab=costs&c=${c.id}`;

/** Committed cost under a running pre-finance exception (F15). */
function exceptionUse(ctx: Ctx, proj: Project) {
  return ctx.s.costs.filter((c) => c.projectId === proj.id && ['approved', 'partially_paid', 'paid', 'service_received'].includes(c.status)).reduce((s, c) => s + c.amount, 0);
}

function capCheck(ctx: Ctx, proj: Project, amount: number) {
  if (!proj.exceptionId) return;
  const exc = ctx.s.exceptions.find((e) => e.id === proj.exceptionId);
  if (!exc || exc.status === 'linked') return; // finance approval arrived: the cap no longer applies
  ctx.check(exc.status === 'granted', 'الاستثناء غير سارٍ — لا طلبات تكلفة حتى تمديد معتمد');
  const used = exceptionUse(ctx, proj);
  ctx.check(used + amount <= exc.costCap, `يتجاوز سقف الاستثناء (${exc.costCap} ر.س، المستخدم ${used}) — يتطلب تمديدًا معتمدًا من الرئيس التنفيذي`);
}

/** The scope items a cost belongs to: its own item, or the item behind its government transaction. */
function costItems(ctx: Ctx, c: Pick<CostRequest, 'scopeItemId' | 'govTransactionId'>) {
  if (c.scopeItemId) return [c.scopeItemId];
  const g = c.govTransactionId ? ctx.s.gov.find((x) => x.id === c.govTransactionId) : undefined;
  const d = g?.deliverableId ? ctx.s.deliverables.find((x) => x.id === g.deliverableId) : undefined;
  return d?.scopeItemIds ?? [];
}

/** 11-B7 — project cost requests (AD-03, D14, A6). */
export const costCommands = {
  'cost.create'(ctx: Ctx, p: Omit<CostRequest, 'id' | 'requestedBy' | 'requestedAt' | 'status' | 'decisions' | 'paid' | 'payments'>) {
    const proj = ctx.project(p.projectId);
    const isOfficer = !!p.govTransactionId && ctx.s.gov.some((g) => g.id === p.govTransactionId && g.licensingOfficerId === ctx.actorId);
    if (!isOfficer) ctx.require('cost_request.create', { own: ctx.isPm(proj) });
    ctx.check(['preparing', 'in_progress', 'suspended', 'technically_complete'].includes(proj.status), 'لا طلبات تكلفة في هذه الحالة');
    ctx.check(p.service.trim() && p.reason.trim() && p.vendor.trim(), 'الخدمة والسبب والجهة المنفذة مطلوبة');
    ctx.check(p.amount > 0, 'المبلغ مطلوب');
    if (p.kind !== 'planned') ctx.check(p.justification?.trim(), 'التكلفة غير المخططة أو تجاوز التقدير تحتاج مبررًا');
    ctx.requireExceptionScope(proj, costItems(ctx, p), 'طلب التكلفة');
    capCheck(ctx, proj, p.amount);
    const c: CostRequest = { ...p, id: ctx.nextId('CR'), requestedBy: ctx.actorId as string, requestedAt: ctx.now, status: 'submitted', decisions: [], paid: 0, payments: [] };
    ctx.s.costs.push(c);
    ctx.event('cost.submitted', { type: 'cost', id: c.id }, `طلب تكلفة: ${c.service} (${c.amount} ر.س، ${c.kind === 'planned' ? 'مخطط' : c.kind === 'unplanned' ? 'غير مخطط' : 'تجاوز تقدير'})`, proj.id);
    ctx.notify(ctx.directors(), { title: `طلب تكلفة بانتظار قرارك: ${c.service}`, body: `${proj.id} — ${c.amount} ر.س`, link: clink(c), type: 'cost_request.submitted' });
    return c.id;
  },

  'cost.decide'(ctx: Ctx, p: { costId: string; decision: 'approved' | 'returned' | 'rejected'; note: string }) {
    ctx.require('cost_request.approve');
    const c = ctx.cost(p.costId);
    ctx.check(c.status === 'submitted', 'الطلب ليس بانتظار القرار');
    if (p.decision !== 'approved') ctx.check(p.note.trim(), 'السبب مطلوب');
    const proj = ctx.project(c.projectId);
    if (p.decision === 'approved') {
      ctx.check(c.kind === 'planned' || c.justification?.trim(), 'لا اعتماد لتكلفة غير مخططة دون مبرر — أعدها للاستكمال');
      ctx.requireExceptionScope(proj, costItems(ctx, c), 'طلب التكلفة');
      capCheck(ctx, proj, c.amount);
    }
    c.decisions.push({ by: ctx.actorId as string, decision: p.decision, note: p.note, at: ctx.now });
    c.status = p.decision;
    ctx.event(`cost.${p.decision}`, { type: 'cost', id: c.id }, `${p.decision === 'approved' ? 'اعتمد' : p.decision === 'returned' ? 'أعاد' : 'رفض'} مدير الأقسام طلب التكلفة${p.note ? `: ${p.note}` : ''}`, proj.id);
    if (p.decision === 'approved') ctx.notify(ctx.finance(), { title: `اصرف تكلفة معتمدة: ${c.service}`, body: `${c.amount} ر.س — ${c.vendor}`, link: clink(c), type: 'cost_request.approved' });
    ctx.notify([c.requestedBy], { title: `قرار طلب التكلفة ${c.id}`, body: p.note, link: clink(c), type: 'cost_request.decided' });
  },

  'cost.resubmit'(ctx: Ctx, p: { costId: string; justification: string; note: string }) {
    const c = ctx.cost(p.costId);
    ctx.check(c.requestedBy === ctx.actorId, 'يعيد التقديم صاحب الطلب');
    ctx.check(c.status === 'returned', 'الطلب غير معاد');
    ctx.check(p.justification.trim(), 'المبرر مطلوب');
    c.justification = p.justification;
    c.decisions.push({ by: ctx.actorId as string, decision: 'resubmitted', note: p.note, at: ctx.now });
    c.status = 'submitted';
    ctx.event('cost.resubmitted', { type: 'cost', id: c.id }, `أعيد تقديم الطلب: ${p.note}`, c.projectId);
    ctx.notify(ctx.directors(), { title: `طلب تكلفة معدّل: ${c.service}`, link: clink(c), type: 'cost_request.submitted' });
  },

  'cost.pay'(ctx: Ctx, p: { costId: string; amount: number; proof: string }) {
    ctx.require('cost_request.pay');
    const c = ctx.cost(p.costId);
    ctx.check(['approved', 'partially_paid', 'service_received'].includes(c.status) && c.paid < c.amount, 'لا يوجد مبلغ معتمد بانتظار الصرف');
    ctx.check(p.amount > 0 && c.paid + p.amount <= c.amount, 'المبلغ يتجاوز المتبقي');
    ctx.check(p.proof.trim(), 'إثبات الصرف مطلوب');
    c.paid += p.amount;
    c.payments.push({ amount: p.amount, at: ctx.now, by: ctx.actorId as string, proof: p.proof });
    if (c.status !== 'service_received') c.status = c.paid >= c.amount ? 'paid' : 'partially_paid';
    ctx.event('cost.paid', { type: 'cost', id: c.id }, `صرفت المالية ${p.amount} ر.س (المتبقي ${c.amount - c.paid}) — ${p.proof}`, c.projectId);
    const proj = ctx.project(c.projectId);
    if (c.govTransactionId && c.paid >= c.amount) {
      const g = ctx.gov(c.govTransactionId);
      if (g.fees && g.status === 'awaiting_fees') {
        g.fees.status = 'paid';
        if (g.expeditorId) {
          g.status = 'at_authority';
          const r = g.rounds[g.rounds.length - 1];
          if (r && !r.authorityStart) r.authorityStart = ctx.now;
          g.lastUpdateAt = ctx.now;
          ctx.notify([g.expeditorId], { title: `سُددت الرسوم — المعاملة لدى الجهة: ${g.id}`, link: `/gov?id=${g.id}`, type: 'gov.at_authority' });
        } else {
          g.status = 'submitted';
          ctx.notify(ctx.holders('gov_transaction.assign'), { title: `أسند متابعة ${g.id} لمعقّب`, link: `/gov?id=${g.id}`, type: 'gov.submitted' });
        }
        ctx.event('gov.fees_paid', { type: 'gov', id: g.id }, 'صرفت المالية رسوم الجهة عبر طلب التكلفة', proj.id);
      }
    }
    ctx.notify([c.requestedBy, proj.pmId], { title: `صُرفت تكلفة ${c.id}`, body: `${p.amount} ر.س`, link: clink(c), type: 'cost_request.paid' });
  },

  /** AD-04: receiving the service is the PM's follow-up; an advance payment does not close it. */
  'cost.receive_service'(ctx: Ctx, p: { costId: string; note: string }) {
    const c = ctx.cost(p.costId);
    const proj = ctx.project(c.projectId);
    ctx.require('project.run', { own: ctx.isPm(proj) });
    ctx.check(['approved', 'partially_paid', 'paid'].includes(c.status), 'لا يمكن تسجيل الاستلام في هذه الحالة');
    c.status = 'service_received';
    c.serviceReceivedAt = ctx.now;
    ctx.event('cost.service_received', { type: 'cost', id: c.id }, `استُلمت الخدمة${c.paid < c.amount ? ` — المتبقي للصرف ${c.amount - c.paid} (الاستلام ≠ الدفع)` : ''}: ${p.note}`, proj.id);
  },
};
