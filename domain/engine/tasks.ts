import type { ISO, RecordLink, Task, UserId } from '../types';
import { Ctx } from './core';

const tlink = (t: Task) => `/work?task=${t.id}`;

const ownerOnly = (ctx: Ctx, t: Task) => ctx.check(t.ownerId === ctx.actorId, 'الإجراء لمسؤول المهمة فقط');

/** 11-B5 — one owner per task; a task never executes an approval nor confirms a collection (TK-07). */
export const taskCommands = {
  'task.create'(ctx: Ctx, p: { title: string; ownerId: UserId; dueDate: ISO; priority: Task['priority']; link?: RecordLink; reviewerId?: UserId; contributors?: UserId[] }) {
    ctx.require('task.manage', { own: true });
    ctx.check(p.title.trim(), 'عنوان المهمة مطلوب');
    ctx.check(p.ownerId, 'مسؤول واحد مطلوب');
    ctx.check(p.dueDate, 'الموعد مطلوب');
    if (p.link?.type === 'deliverable') {
      const d = ctx.deliverable(p.link.id);
      ctx.check(!d.technical || p.reviewerId, 'المراجع إلزامي لمهام المخرجات الفنية');
    }
    ctx.check(!p.reviewerId || p.reviewerId !== p.ownerId, 'المراجع غير مسؤول المهمة');
    const t: Task = {
      id: ctx.nextId('TSK'), title: p.title.trim(), ownerId: p.ownerId, creatorId: ctx.actorId as UserId, dueDate: p.dueDate,
      priority: p.priority, status: 'new', link: p.link && p.link.type !== 'none' ? p.link : undefined, reviewerId: p.reviewerId || undefined,
      contributors: p.contributors ?? [], comments: [], reassignLog: [], source: 'manual', escalations: [], createdAt: ctx.now,
    };
    ctx.s.tasks.push(t);
    ctx.event('task.created', { type: 'task', id: t.id }, `مهمة: ${t.title}`, t.link?.projectId);
    ctx.notify([t.ownerId], { title: `مهمة جديدة: ${t.title}`, link: tlink(t), type: 'task.created' });
    return t.id;
  },

  'task.start'(ctx: Ctx, p: { taskId: string }) {
    const t = ctx.task(p.taskId);
    ownerOnly(ctx, t);
    ctx.check(t.status === 'new', 'المهمة ليست جديدة');
    t.status = 'in_progress';
    ctx.event('task.started', { type: 'task', id: t.id }, 'بدأ العمل', t.link?.projectId);
  },

  'task.block'(ctx: Ctx, p: { taskId: string; type: NonNullable<Task['blockReason']>['type']; note: string }) {
    const t = ctx.task(p.taskId);
    ownerOnly(ctx, t);
    ctx.check(t.status === 'in_progress', 'التعطيل من حالة قيد العمل');
    ctx.check(p.note.trim(), 'سبب التعطيل مطلوب');
    t.status = 'blocked';
    t.blockReason = { type: p.type, note: p.note, since: ctx.now };
    ctx.event('task.blocked', { type: 'task', id: t.id }, `معطّلة: ${p.note} — مواعيد المتابعة لا تُلغى`, t.link?.projectId);
    ctx.notify([t.creatorId], { title: `مهمة معطّلة: ${t.title}`, body: p.note, link: tlink(t), type: 'task.blocked' });
  },

  'task.unblock'(ctx: Ctx, p: { taskId: string }) {
    const t = ctx.task(p.taskId);
    ownerOnly(ctx, t);
    ctx.check(t.status === 'blocked', 'المهمة غير معطّلة');
    t.status = 'in_progress';
    t.blockReason = undefined;
    ctx.event('task.unblocked', { type: 'task', id: t.id }, 'زال سبب التعطيل', t.link?.projectId);
  },

  'task.complete'(ctx: Ctx, p: { taskId: string; result: string }) {
    const t = ctx.task(p.taskId);
    ownerOnly(ctx, t);
    ctx.check(['new', 'in_progress'].includes(t.status), 'لا يمكن الإكمال في هذه الحالة');
    ctx.check(p.result.trim(), 'النتيجة الموثقة مطلوبة');
    t.result = p.result;
    if (t.reviewerId) {
      t.status = 'in_review';
      ctx.event('task.in_review', { type: 'task', id: t.id }, `أُنجزت وبانتظار المراجعة: ${p.result}`, t.link?.projectId);
      ctx.notify([t.reviewerId], { title: `راجع المهمة: ${t.title}`, body: p.result, link: tlink(t), type: 'task.in_review' });
      return;
    }
    finish(ctx, t);
  },

  'task.review'(ctx: Ctx, p: { taskId: string; decision: 'accepted' | 'returned'; note: string }) {
    const t = ctx.task(p.taskId);
    ctx.check(t.reviewerId === ctx.actorId, 'المراجعة للمراجع المحدد');
    ctx.check(t.status === 'in_review', 'المهمة ليست بانتظار المراجعة');
    t.reviewNote = p.note;
    if (p.decision === 'returned') {
      ctx.check(p.note.trim(), 'ملاحظة الإعادة مطلوبة');
      t.status = 'in_progress';
      ctx.event('task.returned', { type: 'task', id: t.id }, `أعادها المراجع: ${p.note}`, t.link?.projectId);
      ctx.notify([t.ownerId], { title: `أُعيدت المهمة: ${t.title}`, body: p.note, link: tlink(t), type: 'task.returned' });
      return;
    }
    finish(ctx, t);
  },

  /** TK-08: a clear log, both told, open follow-ups move with the task. */
  'task.reassign'(ctx: Ctx, p: { taskId: string; toId: UserId; reason: string }) {
    const t = ctx.task(p.taskId);
    const proj = t.link?.projectId ? ctx.s.projects.find((x) => x.id === t.link!.projectId) : undefined;
    ctx.check([t.ownerId, t.creatorId, proj?.pmId].includes(ctx.actorId as UserId), 'يغيّر المسؤول: المسؤول الحالي أو المنشئ أو مدير المشروع');
    ctx.check(!['completed', 'cancelled'].includes(t.status), 'المهمة منتهية');
    ctx.check(p.toId !== t.ownerId, 'اختر شخصًا آخر');
    ctx.check(p.reason.trim(), 'السبب مطلوب');
    t.reassignLog.push({ from: t.ownerId, to: p.toId, reason: p.reason, at: ctx.now, by: ctx.actorId as UserId });
    const from = t.ownerId;
    t.ownerId = p.toId;
    ctx.event('task.reassigned', { type: 'task', id: t.id }, `تغيير المسؤول من ${ctx.user(from).name} إلى ${ctx.user(p.toId).name}: ${p.reason}`, t.link?.projectId);
    ctx.notify([from, p.toId], { title: `تغيّر مسؤول المهمة: ${t.title}`, body: p.reason, link: tlink(t), type: 'task.reassigned' });
  },

  'task.cancel'(ctx: Ctx, p: { taskId: string; reason: string }) {
    const t = ctx.task(p.taskId);
    ctx.check([t.ownerId, t.creatorId].includes(ctx.actorId as UserId), 'يلغيها المسؤول أو المنشئ');
    ctx.check(!['completed', 'cancelled'].includes(t.status), 'المهمة منتهية');
    ctx.check(p.reason.trim(), 'سبب الإلغاء الموثق مطلوب');
    t.status = 'cancelled';
    t.cancelReason = p.reason;
    ctx.event('task.cancelled', { type: 'task', id: t.id }, `أُلغيت: ${p.reason}`, t.link?.projectId);
    ctx.notify([t.ownerId, t.creatorId], { title: `أُلغيت المهمة: ${t.title}`, body: p.reason, link: tlink(t), type: 'task.cancelled' });
  },

  'task.comment'(ctx: Ctx, p: { taskId: string; text: string }) {
    const t = ctx.task(p.taskId);
    ctx.check(p.text.trim(), 'التعليق فارغ');
    t.comments.push({ by: ctx.actorId as UserId, at: ctx.now, text: p.text.trim() });
    ctx.notify([t.ownerId, t.creatorId, t.reviewerId], { title: `تعليق على: ${t.title}`, body: p.text, link: tlink(t), type: 'task.comment' });
  },
};

function finish(ctx: Ctx, t: Task) {
  t.status = 'completed';
  t.completedAt = ctx.now;
  ctx.event('task.completed', { type: 'task', id: t.id }, `اكتملت بنتيجة موثقة: ${t.result}`, t.link?.projectId);
  ctx.notify([t.creatorId], { title: `اكتملت المهمة: ${t.title}`, body: t.result, link: tlink(t), type: 'task.completed' });
  if (t.source === 'gov_comments' && t.link?.type === 'gov') {
    const g = ctx.s.gov.find((x) => x.id === t.link!.id);
    if (g) ctx.notify([g.licensingOfficerId], { title: `عولجت ملاحظات الجهة — أعد تقديم ${g.id}`, link: `/gov?id=${g.id}`, type: 'gov.comments_resolved' });
  }
}
