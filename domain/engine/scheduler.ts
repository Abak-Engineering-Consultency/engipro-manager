import { addCalendarDays, addWorkingDays, isAfter, isBefore } from '../calendar';
import type { Task } from '../types';
import { Ctx } from './core';
import { suspendProject } from './projects';

const DAY = 86_400_000;
const daysSince = (ctx: Ctx, iso?: string) => (iso ? (Date.parse(ctx.now) - Date.parse(iso)) / DAY : Infinity);

const open = (t: Task) => !['completed', 'cancelled'].includes(t.status);

/**
 * Time-based rules from the board (11-D, 11-E). Runs as the system whenever the clock moves:
 * reminders, overdue and escalation once per level, the expeditor's weekly update, payment
 * grace and the 15-day collection escalation, the CEO's weekly exception alert and expiry.
 */
export function tick(ctx: Ctx) {
  const st = ctx.s.settings;

  // TK-05: reminder before the due date; escalation once per level.
  for (const t of ctx.s.tasks.filter(open)) {
    const due = Date.parse(t.dueDate);
    const now = Date.parse(ctx.now);
    if (!t.reminderSentAt && now < due && now >= due - st.taskReminderDays * DAY) {
      t.reminderSentAt = ctx.now;
      ctx.notify([t.ownerId], { title: `موعد المهمة قريب: ${t.title}`, link: `/work?task=${t.id}`, type: 'task.due_soon' });
    }
    if (now > due && !t.escalations.some((e) => e.level === 1)) {
      const proj = t.link?.projectId ? ctx.s.projects.find((p) => p.id === t.link!.projectId) : undefined;
      const to = t.creatorId !== t.ownerId ? t.creatorId : proj?.pmId && proj.pmId !== t.ownerId ? proj.pmId : undefined;
      t.escalations.push({ level: 1, at: ctx.now, to: to ?? t.ownerId });
      ctx.notify([t.ownerId, to], { title: `مهمة متأخرة: ${t.title}`, link: `/work?task=${t.id}`, type: 'task.overdue' });
    }
    if (now > due + 2 * DAY && !t.escalations.some((e) => e.level === 2)) {
      const owner = ctx.s.users.find((u) => u.id === t.ownerId);
      const mgr = ctx.deptManager(owner?.deptCode);
      const to = mgr && mgr !== t.ownerId ? mgr : ctx.directors()[0];
      t.escalations.push({ level: 2, at: ctx.now, to });
      ctx.notify([to], { title: `تصعيد مهمة متأخرة: ${t.title}`, body: `المسؤول: ${owner?.name ?? ''}`, link: `/work?task=${t.id}`, type: 'task.escalated' });
    }
  }

  // DL-06 / AC-06: no automatic acceptance for silence — periodic reminders only.
  for (const d of ctx.s.deliverables.filter((x) => x.status === 'awaiting_client' && x.nextFollowUpAt && !isAfter(x.nextFollowUpAt, ctx.now))) {
    const proj = ctx.project(d.projectId);
    const late = d.responseDueAt && !isAfter(d.responseDueAt, ctx.now);
    d.nextFollowUpAt = addCalendarDays(ctx.now, st.deliveryFollowUpDays);
    ctx.notify([proj.pmId, ctx.oppOwnerOf(proj)], {
      title: `${late ? 'انقضت مهلة الرد — لا قبول آلي' : 'تذكير متابعة'}: ${d.title}`,
      body: late ? (proj.deemedAcceptanceClause ? 'يمكن طلب إثبات القبول وفق بند العقد' : 'لا يوجد بند قبول ضمني — تابع العميل') : 'بانتظار رد العميل',
      link: `/projects/${proj.id}?tab=deliverables&d=${d.id}`, type: 'deliverable.follow_up_due',
    });
  }

  // DL-09, A5, AC-08: date-based due; overdue only after grace; one escalation after N days.
  for (const pay of ctx.s.payments) {
    const proj = ctx.s.projects.find((p) => p.id === pay.projectId);
    if (!proj) continue;
    if (pay.entitlement === 'not_due' && ['date', 'periodic'].includes(pay.condition) && pay.scheduledDate && !isAfter(pay.scheduledDate, ctx.now) && proj.startedAt) {
      pay.entitlement = 'due';
      pay.dueAt = pay.scheduledDate;
      pay.graceUntil = addCalendarDays(pay.scheduledDate, pay.graceDays);
      pay.evidence.push({ kind: 'حلول التاريخ التعاقدي', at: pay.scheduledDate, note: '' });
      ctx.event('payment.entitlement_due', { type: 'payment', id: pay.id }, `استحقت «${pay.label}» بالتاريخ`, proj.id);
      ctx.notify(ctx.finance(), { title: `دفعة مستحقة بالتاريخ: ${pay.label}`, link: `/projects/${proj.id}?tab=payments&p=${pay.id}`, type: 'payment.entitlement_due' });
    }
    if (pay.entitlement === 'due' && pay.collection !== 'fully_collected' && pay.graceUntil && isBefore(pay.graceUntil, ctx.now)) {
      pay.entitlement = 'overdue';
      pay.overdueAt = pay.graceUntil;
      ctx.event('payment.overdue', { type: 'payment', id: pay.id }, `«${pay.label}» متأخرة بعد انتهاء المهلة`, proj.id);
      ctx.notify([ctx.oppOwnerOf(proj), ...ctx.finance()], { title: `دفعة متأخرة: ${pay.label}`, body: proj.id, link: `/projects/${proj.id}?tab=payments&p=${pay.id}`, type: 'payment.overdue' });
    }
    if (pay.entitlement === 'overdue' && pay.collection !== 'fully_collected' && !pay.escalatedAt && daysSince(ctx, pay.overdueAt) >= st.collectionEscalationDays) {
      pay.escalatedAt = ctx.now;
      pay.escalation = 'auto';
      ctx.event('payment.escalated', { type: 'payment', id: pay.id }, `تصعيد آلي لمدير المبيعات بعد ${st.collectionEscalationDays} يومًا من التأخر`, proj.id);
      ctx.notify(ctx.salesManagers(), { title: `تصعيد تحصيل متأخر: ${pay.label}`, body: proj.id, link: `/projects/${proj.id}?tab=payments&p=${pay.id}`, type: 'payment.escalated' });
    }
  }

  // GT-08: mandatory weekly update; the transactions manager is alerted on delay.
  for (const g of ctx.s.gov.filter((x) => x.status === 'at_authority')) {
    const stale = daysSince(ctx, g.lastUpdateAt) >= st.expeditorUpdateDays;
    if (stale && daysSince(ctx, g.lastMissingAlertAt) >= st.expeditorUpdateDays) {
      g.lastMissingAlertAt = ctx.now;
      ctx.event('gov.weekly_update_missing', { type: 'gov', id: g.id }, 'مرّ أسبوع دون تحديث من المعقّب', g.projectId);
      ctx.notify([...ctx.holders('gov_transaction.assign'), g.expeditorId], { title: `تأخر تحديث المعقّب: ${g.id}`, body: g.authority, link: `/gov?id=${g.id}`, type: 'gov.weekly_update_missing' });
    }
  }
  // GT-11: expiry reminder; it never blocks closure.
  for (const g of ctx.s.gov.filter((x) => x.status === 'issued' && x.result?.expiresAt && !x.expiryReminderAt)) {
    if (daysSince(ctx, addCalendarDays(g.result!.expiresAt!, -st.expiryReminderDays)) >= 0) {
      g.expiryReminderAt = ctx.now;
      const proj = ctx.project(g.projectId);
      ctx.notify([proj.pmId, ctx.oppOwnerOf(proj)], { title: `تنتهي ${g.procedureType} قريبًا`, body: g.result!.docNo, link: `/gov?id=${g.id}`, type: 'gov.expiry_reminder' });
    }
  }

  // PJ-02 / A2 / F15: weekly CEO alert while finance approval is pending; expiry suspends.
  for (const e of ctx.s.exceptions.filter((x) => x.status === 'granted')) {
    if (e.expiresAt && !isAfter(e.expiresAt, ctx.now)) {
      e.status = 'expired';
      const proj = e.projectId ? ctx.project(e.projectId) : undefined;
      ctx.event('exception.expired', { type: 'exception', id: e.id }, 'انتهى الاستثناء دون اعتماد مالي', e.projectId);
      if (proj?.status === 'in_progress') suspendProject(ctx, proj, { type: 'payment', reason: 'انتهى استثناء الرئيس التنفيذي دون اعتماد مالي — يلزم تمديد معتمد', since: ctx.now, by: proj.pmId ?? '' });
      ctx.notify([...ctx.ceos(), ...ctx.directors(), ...ctx.finance(), proj?.pmId], { title: `انتهى استثناء ${e.projectId ?? e.id}`, body: 'تعليق أو تمديد معتمد', link: '/intake', type: 'exception.expired' });
    } else if (daysSince(ctx, e.lastCeoAlertAt) >= st.ceoExceptionAlertDays) {
      e.lastCeoAlertAt = ctx.now;
      ctx.notify(ctx.ceos(), { title: `تنبيه أسبوعي: مشروع ${e.projectId} يعمل باستثناء دون اعتماد مالي`, body: `ينتهي ${e.expiresAt?.slice(0, 10)}`, link: '/intake', type: 'exception.weekly_alert' });
    }
  }

  // Proposed intake SLA: the Director receives a new project within N working days.
  for (const p of ctx.s.projects.filter((x) => x.status === 'awaiting_assignment' && !x.receivedAt)) {
    const due = addWorkingDays(p.createdAt, st.intakeSlaWorkingDays, st);
    if (!isAfter(due, ctx.now) && !ctx.s.events.some((e) => e.type === 'project.intake_reminder' && e.projectId === p.id)) {
      ctx.event('project.intake_reminder', { type: 'project', id: p.id }, `تجاوز مدة الاستلام (${st.intakeSlaWorkingDays} يوم عمل)`, p.id);
      ctx.notify(ctx.directors(), { title: `تأخر استلام المشروع ${p.id}`, link: `/projects/${p.id}`, type: 'project.intake_overdue' });
    }
  }
}
