import { isAfter } from './calendar';
import { allows, deptsOf, hasRole, inDept } from './permissions';
import { startGate } from './selectors';
import type { AppState, ISO, User } from './types';

/**
 * TK-02 / F11 — derived actions: every official step that waits on this person, read from its own
 * record. They are shown in «مهامي» but never stored as tasks, so they cannot drift or duplicate.
 */
export interface DerivedAction {
  key: string;
  title: string;
  detail: string;
  link: string;
  kind: 'approval' | 'work' | 'follow_up' | 'finance' | 'review';
  since?: ISO;
  due?: ISO;
  projectId?: string;
}

export function derivedActions(s: AppState, u: User | undefined): DerivedAction[] {
  if (!u) return [];
  const out: DerivedAction[] = [];
  const add = (a: DerivedAction) => out.push(a);
  const project = (id: string) => s.projects.find((p) => p.id === id);
  const oppOwner = (pid: string) => {
    const p = project(pid);
    return p?.opportunityId ? s.opportunities.find((o) => o.id === p.opportunityId)?.ownerId : p?.followUpOwnerId;
  };
  const DAY = 86_400_000;

  // ── Finance ───────────────────────────────────────────────────────────────
  if (allows(u, 'activation.approve')) {
    for (const a of s.activations.filter((x) => x.status === 'pending_finance')) {
      const o = s.opportunities.find((x) => x.id === a.opportunityId);
      add({ key: `act:${a.id}`, title: 'قرار المالية على طلب تفعيل', detail: `${o?.title ?? ''} — ${a.quotationId}`, link: '/intake', kind: 'finance', since: a.requestedAt });
    }
  }
  if (allows(u, 'payment.verify_entitlement')) {
    for (const p of s.projects.filter((x) => x.paymentMapping.status === 'submitted')) {
      add({ key: `map:${p.id}`, title: 'تحقق من ربط الدفعات بالمخرجات', detail: `${p.id} — ${p.title}`, link: `/projects/${p.id}?tab=payments`, kind: 'finance', since: p.paymentMapping.submittedAt, projectId: p.id });
    }
    for (const pay of s.payments.filter((x) => x.evidenceCheck === 'pending')) {
      add({ key: `ev:${pay.id}`, title: 'تحقق من إثبات الاستحقاق', detail: `${pay.label} — ${pay.projectId}`, link: `/projects/${pay.projectId}?tab=payments&p=${pay.id}`, kind: 'finance', since: pay.dueAt, projectId: pay.projectId });
    }
    for (const p of s.projects.filter((x) => x.preSystem && !x.preSystem.financeReviewed)) {
      add({ key: `pre:${p.id}`, title: 'مراجعة أرصدة مشروع قائم قبل النظام', detail: `${p.id} — دون إعادة فواتير`, link: `/projects/${p.id}`, kind: 'finance', since: p.createdAt, projectId: p.id });
    }
  }
  if (allows(u, 'collection.confirm')) {
    for (const pay of s.payments.filter((x) => x.entitlement !== 'not_due' && x.invoicing === 'not_invoiced' && x.evidenceCheck !== 'pending' && x.evidenceCheck !== 'objected')) {
      add({ key: `claim:${pay.id}`, title: 'أصدر المطالبة / الفاتورة', detail: `${pay.label} — ${pay.projectId}`, link: `/projects/${pay.projectId}?tab=payments&p=${pay.id}`, kind: 'finance', since: pay.dueAt, due: pay.graceUntil, projectId: pay.projectId });
    }
    for (const pay of s.payments.filter((x) => x.transferClaim && x.collection !== 'fully_collected')) {
      add({ key: `tr:${pay.id}`, title: 'العميل أفاد بالتحويل — طابق وسجّل التحصيل', detail: `${pay.label} — ${pay.projectId}`, link: `/projects/${pay.projectId}?tab=payments&p=${pay.id}`, kind: 'finance', since: pay.transferClaim!.at, projectId: pay.projectId });
    }
    const billable = s.visits.filter((v) => v.billing === 'billable' && !v.claimId && ['executed', 'report_pending', 'report_approved', 'inaccessible'].includes(v.status));
    if (billable.length) add({ key: 'visits:billable', title: 'زيارات قابلة للفوترة دون مطالبة', detail: billable.map((v) => v.id).join('، '), link: '/finance?tab=visits', kind: 'finance' });
  }
  if (allows(u, 'cost_request.pay')) {
    for (const c of s.costs.filter((x) => ['approved', 'partially_paid'].includes(x.status) || (x.status === 'service_received' && x.paid < x.amount))) {
      add({ key: `pay:${c.id}`, title: 'اصرف تكلفة معتمدة', detail: `${c.service} — ${c.amount - c.paid} ر.س متبقية`, link: `/projects/${c.projectId}?tab=costs&c=${c.id}`, kind: 'finance', since: c.decisions[c.decisions.length - 1]?.at, projectId: c.projectId });
    }
  }

  // ── CEO ───────────────────────────────────────────────────────────────────
  if (allows(u, 'project.grant_exception')) {
    for (const e of s.exceptions.filter((x) => x.status === 'requested')) {
      const o = s.opportunities.find((x) => x.id === e.opportunityId);
      add({ key: `exc:${e.id}`, title: 'قرار استثناء البدء قبل الاعتماد المالي', detail: `${o?.title ?? ''} — سقف ${e.costCap} ر.س / ${e.durationDays} يومًا`, link: '/intake', kind: 'approval', since: e.requestedAt });
    }
    for (const d of s.deliverables.filter((x) => x.status === 'blocked_pending_payment')) {
      add({ key: `blk:${d.id}`, title: 'تسليم ممنوع حتى السداد (استثناء موثق ممكن)', detail: `${d.title} — ${d.projectId}`, link: `/projects/${d.projectId}?tab=deliverables&d=${d.id}`, kind: 'approval', projectId: d.projectId });
    }
  }

  // ── Approval chains (closure / cancellation) ───────────────────────────────
  for (const p of s.projects) {
    for (const chain of [p.closure, p.cancellation]) {
      if (chain?.status !== 'pending') continue;
      const step = chain.steps.find((x) => x.status === 'pending');
      if (step?.approverIds.includes(u.id) && !step.decisions.some((d) => d.userId === u.id)) {
        add({ key: `chain:${p.id}:${chain.kind}`, title: chain.kind === 'closure' ? 'اعتماد إغلاق مشروع' : 'اعتماد إلغاء مشروع', detail: `${p.id} — ${p.title}`, link: `/projects/${p.id}?tab=closure`, kind: 'approval', since: chain.requestedAt, projectId: p.id });
      }
    }
  }

  // ── Director of departments ───────────────────────────────────────────────
  if (allows(u, 'project.assign_manager')) {
    for (const p of s.projects.filter((x) => x.status === 'awaiting_assignment' && !x.receivedAt)) {
      add({ key: `recv:${p.id}`, title: 'استلم المشروع وحدد الأقسام', detail: `${p.id} — ${p.title}`, link: `/projects/${p.id}`, kind: 'approval', since: p.createdAt, projectId: p.id });
    }
    for (const p of s.projects.filter((x) => x.pmNomination?.status === 'pending')) {
      add({ key: `pm:${p.id}`, title: 'اعتمد مدير المشروع', detail: `${p.id} — ${s.users.find((x) => x.id === p.pmNomination!.nomineeId)?.name ?? ''}`, link: `/projects/${p.id}`, kind: 'approval', since: p.pmNomination!.at, projectId: p.id });
    }
  }
  if (allows(u, 'project.approve_change')) {
    for (const p of s.projects) for (const c of p.changeRequests.filter((x) => x.status === 'pending' && !(x.kind === 'track' && !p.multiDept))) {
      add({ key: `chg:${c.id}`, title: 'قرار طلب تغيير', detail: `${c.id} — ${c.reason}`, link: `/projects/${p.id}?tab=changes`, kind: 'approval', since: c.requestedAt, projectId: p.id });
    }
  }
  if (allows(u, 'cost_request.approve')) {
    for (const c of s.costs.filter((x) => x.status === 'submitted')) {
      add({ key: `cost:${c.id}`, title: 'قرار طلب تكلفة', detail: `${c.service} — ${c.amount} ر.س`, link: `/projects/${c.projectId}?tab=costs&c=${c.id}`, kind: 'approval', since: c.requestedAt, projectId: c.projectId });
    }
  }

  // ── Department manager ────────────────────────────────────────────────────
  if (hasRole(u, 'dept_manager')) {
    for (const p of s.projects.filter((x) => x.status === 'awaiting_assignment' && x.receivedAt && inDept(u, x.leadDept) && (!x.pmNomination || x.pmNomination.status === 'returned'))) {
      add({ key: `nom:${p.id}`, title: 'رشّح مدير المشروع', detail: `${p.id} — ${p.title}`, link: `/projects/${p.id}`, kind: 'work', since: p.receivedAt, projectId: p.id });
    }
    for (const p of s.projects.filter((x) => ['preparing', 'in_progress', 'suspended'].includes(x.status))) {
      const missing = p.scopeItems.filter((i) => inDept(u, i.deptCode) && !i.ownerId);
      if (missing.length) add({ key: `own:${p.id}`, title: 'عيّن مسؤولي بنود قسمك', detail: `${p.id} — ${missing.length} بند`, link: `/projects/${p.id}?tab=team`, kind: 'work', projectId: p.id });
      for (const c of p.changeRequests.filter((x) => x.status === 'pending' && x.kind === 'track' && !p.multiDept && inDept(u, p.leadDept))) {
        add({ key: `chg:${c.id}`, title: 'قرار مسار تنفيذ مستقل', detail: c.reason, link: `/projects/${p.id}?tab=changes`, kind: 'approval', projectId: p.id });
      }
    }
  }
  if (allows(u, 'deliverable.review', { depts: deptsOf(u) })) {
    for (const d of s.deliverables.filter((x) => inDept(u, x.deptCode) && x.status === 'internal_review' && x.revisions[x.revisions.length - 1]?.createdBy !== u.id)) {
      add({ key: `rev:${d.id}`, title: 'مراجعة داخلية لمخرج', detail: `${d.title} — ${d.projectId}`, link: `/projects/${d.projectId}?tab=deliverables&d=${d.id}`, kind: 'review', since: d.revisions[d.revisions.length - 1]?.reviewRounds.at(-1)?.submittedAt, projectId: d.projectId });
    }
    for (const d of s.deliverables.filter((x) => inDept(u, x.deptCode) && x.status === 'deemed_acceptance_review' && x.deemedRequest?.by !== u.id)) {
      add({ key: `deem:${d.id}`, title: 'اعتماد قبول ضمني وفق العقد', detail: `${d.title} — ${d.projectId}`, link: `/projects/${d.projectId}?tab=deliverables&d=${d.id}`, kind: 'review', since: d.deemedRequest?.at, projectId: d.projectId });
    }
  }
  for (const v of s.visits.filter((x) => x.status === 'report_pending' && x.report?.approverId === u.id)) {
    add({ key: `vrep:${v.id}`, title: 'اعتمد تقرير زيارة إشراف', detail: `${v.id} — ${v.purpose}`, link: `/visits?id=${v.id}`, kind: 'review', since: v.report!.submittedAt, projectId: v.link?.projectId });
  }

  // ── Project manager ───────────────────────────────────────────────────────
  for (const p of s.projects.filter((x) => x.pmId === u.id)) {
    if (p.status === 'preparing') {
      const gate = startGate(s, p);
      add({ key: `prep:${p.id}`, title: gate.length ? 'جهّز المشروع' : 'بوابة البدء مستوفاة — ابدأ التنفيذ', detail: gate.length ? gate.join(' · ') : p.title, link: `/projects/${p.id}?tab=plan`, kind: 'work', projectId: p.id });
    }
    if (p.paymentMapping.status === 'returned') add({ key: `mapret:${p.id}`, title: 'أعادت المالية ربط الدفعات', detail: p.paymentMapping.note ?? '', link: `/projects/${p.id}?tab=payments`, kind: 'work', projectId: p.id });
    if (p.status === 'technically_complete') add({ key: `close:${p.id}`, title: 'مكتمل فنيًا — اطلب الإغلاق', detail: p.title, link: `/projects/${p.id}?tab=closure`, kind: 'work', projectId: p.id });
    if (p.status === 'suspended') add({ key: `susp:${p.id}`, title: 'المشروع معلّق', detail: p.suspension?.reason ?? '', link: `/projects/${p.id}`, kind: 'follow_up', since: p.suspension?.since, projectId: p.id });
    for (const d of s.deliverables.filter((x) => x.projectId === p.id)) {
      if (d.status === 'ready_for_delivery') add({ key: `dlv:${d.id}`, title: 'سلّم للعميل (إرسال موثق)', detail: d.title, link: `/projects/${p.id}?tab=deliverables&d=${d.id}`, kind: 'work', projectId: p.id });
      if (d.status === 'awaiting_client' && d.responseDueAt && !isAfter(d.responseDueAt, s.now)) add({ key: `late:${d.id}`, title: 'انقضت مهلة رد العميل — تابع أو اطلب إثبات قبول وفق العقد', detail: d.title, link: `/projects/${p.id}?tab=deliverables&d=${d.id}`, kind: 'follow_up', due: d.responseDueAt, projectId: p.id });
    }
    for (const g of s.gov.filter((x) => x.projectId === p.id && x.status === 'final_rejection_decision')) {
      add({ key: `gfin:${g.id}`, title: 'رفض نهائي من الجهة: قرر إعادة أم إغلاق', detail: g.procedureType, link: `/gov?id=${g.id}`, kind: 'approval', projectId: p.id });
    }
    for (const c of s.costs.filter((x) => x.projectId === p.id && ['approved', 'partially_paid', 'paid'].includes(x.status))) {
      add({ key: `svc:${c.id}`, title: 'تابع استلام الخدمة', detail: `${c.service} — ${c.vendor}`, link: `/projects/${p.id}?tab=costs&c=${c.id}`, kind: 'follow_up', projectId: p.id });
    }
    for (const pay of s.payments.filter((x) => x.projectId === p.id && x.evidenceCheck === 'objected')) {
      add({ key: `obj:${pay.id}`, title: 'اعتراض المالية على إثبات الاستحقاق', detail: pay.label, link: `/projects/${p.id}?tab=payments&p=${pay.id}`, kind: 'work', projectId: p.id });
    }
  }

  // ── Item owner ────────────────────────────────────────────────────────────
  for (const d of s.deliverables.filter((x) => x.status === 'in_preparation')) {
    const p = project(d.projectId);
    if (!p || !['in_progress', 'suspended'].includes(p.status)) continue;
    if (d.requiresGov) continue;
    const owners = p.scopeItems.filter((i) => d.scopeItemIds.includes(i.id)).map((i) => i.ownerId);
    if (!owners.includes(u.id)) continue;
    const rev = d.revisions[d.revisions.length - 1];
    add({ key: `prep:${d.id}`, title: `أعدّ ${rev ? `Rev ${String(rev.rev).padStart(2, '0')}` : 'Rev 00'} وارفعه`, detail: `${d.title} — ${p.id}`, link: `/projects/${p.id}?tab=deliverables&d=${d.id}`, kind: 'work', projectId: p.id });
  }

  // ── Government transactions ───────────────────────────────────────────────
  for (const g of s.gov) {
    if (g.licensingOfficerId === u.id) {
      if (g.status === 'preparing') add({ key: `gprep:${g.id}`, title: 'جهّز المعاملة وقدّمها', detail: `${g.procedureType} — ${g.authority}`, link: `/gov?id=${g.id}`, kind: 'work', projectId: g.projectId });
      if (g.status === 'comments_processing') {
        const r = g.rounds[g.rounds.length - 1];
        const t = s.tasks.find((x) => x.id === r?.commentsTaskId);
        if (!t || t.status === 'completed') add({ key: `gre:${g.id}`, title: `أعد التقديم — جولة ${g.rounds.length + 1}`, detail: g.procedureType, link: `/gov?id=${g.id}`, kind: 'work', projectId: g.projectId });
      }
      if (g.status === 'awaiting_fees' && g.fees?.payer === 'client') add({ key: `gfee:${g.id}`, title: 'سجّل سداد العميل للرسوم', detail: `${g.fees.amount} ر.س`, link: `/gov?id=${g.id}`, kind: 'follow_up', projectId: g.projectId });
      if (g.status === 'final_rejection_decision') add({ key: `gfin2:${g.id}`, title: 'رفض نهائي: قرر مع مدير المشروع', detail: g.procedureType, link: `/gov?id=${g.id}`, kind: 'approval', projectId: g.projectId });
    }
    if (allows(u, 'gov_transaction.assign')) {
      if (g.status === 'submitted' && !g.expeditorId) add({ key: `gasg:${g.id}`, title: 'أسند المتابعة لمعقّب', detail: `${g.id} — ${g.authority}`, link: `/gov?id=${g.id}`, kind: 'approval', since: g.rounds.at(-1)?.submittedAt, projectId: g.projectId });
      if (g.status === 'at_authority' && g.lastUpdateAt && Date.parse(s.now) - Date.parse(g.lastUpdateAt) >= s.settings.expeditorUpdateDays * DAY) {
        add({ key: `gmiss:${g.id}`, title: 'تأخر التحديث الأسبوعي للمعقّب', detail: `${g.id} — ${s.users.find((x) => x.id === g.expeditorId)?.name ?? ''}`, link: `/gov?id=${g.id}`, kind: 'follow_up', projectId: g.projectId });
      }
    }
    if (g.expeditorId === u.id && g.status === 'at_authority') {
      const due = g.lastUpdateAt ? new Date(Date.parse(g.lastUpdateAt) + s.settings.expeditorUpdateDays * DAY).toISOString() : s.now;
      add({ key: `gfu:${g.id}`, title: 'متابعة لدى الجهة (تحديث أسبوعي إلزامي)', detail: `${g.procedureType} — ${g.authority}`, link: `/gov?id=${g.id}`, kind: 'follow_up', due, projectId: g.projectId });
    }
    if (g.status === 'awaiting_client' && oppOwner(g.projectId) === u.id) {
      add({ key: `gcl:${g.id}`, title: 'اطلب مستندات/تفويض المعاملة من العميل', detail: g.requiredDocs.filter((d) => !d.received).map((d) => d.name).join('، '), link: `/gov?id=${g.id}`, kind: 'follow_up', since: g.clientDocsRequestedAt, projectId: g.projectId });
    }
  }

  // ── Opportunity owner and sales management ────────────────────────────────
  for (const d of s.deliverables.filter((x) => x.status === 'awaiting_client' && oppOwner(x.projectId) === u.id)) {
    add({ key: `fol:${d.id}`, title: 'تابع رد العميل على التسليم', detail: `${d.title} — ${d.projectId}`, link: `/projects/${d.projectId}?tab=deliverables&d=${d.id}`, kind: 'follow_up', due: d.responseDueAt, projectId: d.projectId });
  }
  for (const p of s.projects) for (const c of p.changeRequests.filter((x) => x.kind === 'paid_addition' && x.status === 'with_sales' && !x.quotationId)) {
    if (oppOwner(p.id) === u.id) add({ key: `padd:${c.id}`, title: 'جهّز عرض الإضافة المدفوعة عبر المبيعات', detail: `${p.id} — ${c.reason}`, link: `/projects/${p.id}?tab=changes`, kind: 'work', since: c.requestedAt, projectId: p.id });
  }
  if (hasRole(u, 'sales_manager')) {
    for (const pay of s.payments.filter((x) => x.escalatedAt && x.collection !== 'fully_collected')) {
      add({ key: `esc:${pay.id}`, title: `تحصيل متأخر مصعّد (${pay.escalation === 'early' ? 'مبكر' : 'آلي'})`, detail: `${pay.label} — ${pay.projectId}`, link: `/projects/${pay.projectId}?tab=payments&p=${pay.id}`, kind: 'follow_up', since: pay.escalatedAt, projectId: pay.projectId });
    }
  }

  return out;
}
