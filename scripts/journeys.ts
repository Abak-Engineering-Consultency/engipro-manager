/**
 * Headless check of the process engine: builds the seed, then plays the six test journeys of
 * FigJam section 08 and the acceptance criteria of section 11-I against the real commands.
 *
 *   npm run journeys
 */
import { advanceClock, run, type CommandName, type Payload } from '../domain/engine';
import { buildSeed } from '../domain/seed';
import { derivedActions } from '../domain/derived';
import { projectAccess, seesProjectMoney, startGate } from '../domain/selectors';
import type { AppState } from '../domain/types';

let s: AppState = buildSeed();
let failures = 0;
let passes = 0;

function ok<K extends CommandName>(actor: string, name: K, payload: Payload<K>): unknown {
  const r = run(s, actor, name, payload);
  if (!r.ok) throw new Error(`${name} by ${actor}: ${r.error}`);
  s = r.state;
  return r.value;
}
function refused<K extends CommandName>(actor: string, name: K, payload: Payload<K>, why: string) {
  const r = run(s, actor, name, payload);
  expect(!r.ok, `${why} (refused: ${r.ok ? 'NO — accepted' : r.error})`);
}
function expect(cond: unknown, label: string) {
  if (cond) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}`);
  }
}
const project = (id: string) => s.projects.find((p) => p.id === id)!;
const dl = (pid: string, t: string) => s.deliverables.find((d) => d.projectId === pid && d.title.includes(t))!;
const pay = (pid: string, t: string) => s.payments.find((p) => p.projectId === pid && p.label.includes(t))!;
const tick = (days: number) => {
  s = advanceClock(s, days);
};
const section = (t: string) => console.log(`\n${t}`);

section('Seed');
expect(s.projects.length === 5, `5 seeded projects (${s.projects.map((p) => `${p.id}:${p.status}`).join(', ')})`);

// ── Journey 1: multi-department design ──────────────────────────────────────────
section('Journey 1 — multi-department design (AC-01, AC-02, AC-04, AC-05, AC-07, AC-16)');
const j1 = ok('u_fin', 'activation.approve', { activationId: 'ACT-2026-0031' }) as string;
ok('u_fin', 'activation.replay', { activationId: 'ACT-2026-0031' });
expect(s.projects.filter((p) => p.opportunityId === 'OPP-2026-0142').length === 1, 'AC-01 replaying the approval creates no second project');
expect(s.notifications.filter((n) => n.eventType === 'project.created' && n.body?.startsWith(j1)).length === 1, 'AC-01 one notice to the Director');
refused('u_arc_m', 'project.nominate_pm', { projectId: j1, nomineeId: 'u_arc_e' }, 'nomination before the Director receives the project');
ok('u_dod', 'project.receive', { projectId: j1, leadDept: 'ARC', departments: ['ARC', 'STR', 'LIC'] });
refused('u_str_m', 'project.nominate_pm', { projectId: j1, nomineeId: 'u_str_e' }, 'only the lead department manager nominates');
ok('u_arc_m', 'project.nominate_pm', { projectId: j1, nomineeId: 'u_arc_e' });
refused('u_arc_m', 'project.decide_pm', { projectId: j1, decision: 'approved' }, 'a department manager cannot approve the PM');
ok('u_dod', 'project.decide_pm', { projectId: j1, decision: 'approved' });
expect(project(j1).status === 'preparing' && project(j1).nextcloud.status === 'open', 'PM approved → preparing; project space opened after ACL');
refused('u_arc_e', 'project.start', { projectId: j1 }, 'AC-02 start refused while items have no owner');
expect(startGate(s, project(j1)).some((r) => r.includes('بلا مسؤول')), 'AC-02 the reason is shown in the project bar');
const items = project(j1).scopeItems;
ok('u_arc_m', 'project.assign_owner', { projectId: j1, scopeItemId: items[0].id, ownerId: 'u_arc_e' });
ok('u_arc_m', 'project.assign_owner', { projectId: j1, scopeItemId: items[1].id, ownerId: 'u_arc_e2' });
refused('u_arc_m', 'project.assign_owner', { projectId: j1, scopeItemId: items[2].id, ownerId: 'u_str_e' }, 'a manager assigns only the items of their department');
ok('u_str_m', 'project.assign_owner', { projectId: j1, scopeItemId: items[2].id, ownerId: 'u_str_e' });
ok('u_dod', 'project.assign_owner', { projectId: j1, scopeItemId: items[3].id, ownerId: 'u_lic_o' });
ok('u_arc_e', 'project.plan_from_items', { projectId: j1 });
const concepts = s.deliverables.filter((d) => d.projectId === j1 && d.title.includes('المفهوم'));
refused('u_arc_e', 'project.submit_payment_links', { projectId: j1, links: [{ paymentId: pay(j1, 'مقدمة').id, kind: 'deliverables', ids: [concepts[0].id] }] }, 'a time-based payment cannot be linked to a deliverable');
ok('u_arc_e', 'project.submit_payment_links', {
  projectId: j1, links: [
    { paymentId: pay(j1, 'مقدمة').id, kind: 'none', ids: [] },
    { paymentId: pay(j1, 'المعماري').id, kind: 'deliverables', ids: concepts.map((d) => d.id) },
    { paymentId: pay(j1, 'الإنشائية').id, kind: 'items', ids: [items[2].id] },
    { paymentId: pay(j1, 'رخصة').id, kind: 'deliverables', ids: [dl(j1, 'رخصة بناء إلكترونية').id] },
  ],
});
ok('u_fin', 'project.decide_payment_links', { projectId: j1, decision: 'confirmed' });
refused('u_arc_e', 'project.start', { projectId: j1 }, 'start refused: kick-off required by contract');
ok('u_arc_e', 'project.hold_kickoff', { projectId: j1, minutes: 'محضر الاجتماع الافتتاحي', attendees: ['u_arc_e', 'u_str_e'], actions: [{ title: 'استلام الرفع المساحي من العميل', ownerId: 'u_arc_e2', dueDays: 3 }] });
ok('u_arc_e', 'project.hold_kickoff', { projectId: j1, minutes: 'محضر الاجتماع الافتتاحي (معدّل)', attendees: ['u_arc_e'], actions: [{ title: 'استلام الرفع المساحي من العميل', ownerId: 'u_arc_e2', dueDays: 3 }] });
expect(s.tasks.filter((t) => t.dedupeKey === `kickoff:${j1}:0`).length === 1, 'kick-off actions become tasks once (dedupe key)');
ok('u_arc_e', 'project.start', { projectId: j1 });
expect(project(j1).status === 'in_progress' && pay(j1, 'مقدمة').entitlement === 'due', 'started; the advance is due (start ≠ collection)');
expect(s.gov.some((g) => g.projectId === j1), 'the building permit transaction is created from the service template');
// Add the MEP department (journey 1).
ok('u_arc_e', 'change.request', { projectId: j1, kind: 'add_department', deptCode: 'MEP', reason: 'أحمال كهربائية للمجمع', scope: 'دراسة الأحمال الكهربائية', deliverableTitles: ['جدول الأحمال الكهربائية'] });
const crId = project(j1).changeRequests[0].id;
refused('u_arc_m', 'change.decide', { projectId: j1, requestId: crId, decision: 'approved', note: '' }, 'only the Director approves adding a department');
ok('u_dod', 'change.decide', { projectId: j1, requestId: crId, decision: 'approved', note: '' });
const mepItem = project(j1).scopeItems.find((i) => i.deptCode === 'MEP')!;
ok('u_mep_m', 'project.assign_owner', { projectId: j1, scopeItemId: mepItem.id, ownerId: 'u_mep_e' });
expect(project(j1).departments.find((d) => d.deptCode === 'MEP')?.status === 'active', 'the joining manager assigned owners → MEP active');
// Soil test cost request (journey 1).
const cr = ok('u_arc_e', 'cost.create', { projectId: j1, service: 'فحص تربة', reason: 'مطلوب للتصميم الإنشائي', kind: 'unplanned', justification: 'لم يوفره العميل', amount: 9_000, vendor: 'مختبر معتمد', quoteRef: 'QT-1', paymentTerms: 'مقدم', bearer: 'abak', payer: 'abak' }) as string;
ok('u_dod', 'cost.decide', { costId: cr, decision: 'approved', note: '' });
ok('u_fin', 'cost.pay', { costId: cr, amount: 9_000, proof: 'TRF-1' });
// Revision 1 → review → delivery → comments → revision 2 → accepted (AC-04, AC-16).
const c0 = concepts[0];
ok('u_arc_e', 'deliverable.upload', { deliverableId: c0.id, files: ['concept-A.pdf'] });
ok('u_arc_e', 'deliverable.submit', { deliverableId: c0.id });
refused('u_arc_e', 'deliverable.review', { deliverableId: c0.id, decision: 'accepted', note: '' }, 'AC-04 the preparer cannot review their own technical deliverable');
ok('u_arc_m', 'deliverable.review', { deliverableId: c0.id, decision: 'accepted', note: '' });
ok('u_arc_e', 'deliverable.deliver', { deliverableId: c0.id, channel: 'بريد', recipient: 'العميل', reference: 'TR-1' });
const rev0 = JSON.stringify(dl(j1, c0.title).revisions[0].files);
ok('u_arc_e', 'deliverable.client_response', { deliverableId: c0.id, kind: 'comments', note: 'تعديل المدخل' });
ok('u_arc_e', 'deliverable.upload', { deliverableId: c0.id, files: ['concept-A-r1.pdf'] });
expect(JSON.stringify(dl(j1, c0.title).revisions[0].files) === rev0 && dl(j1, c0.title).revisions.length === 2, 'AC-16 Rev 01 opened; Rev 00 file and checksum unchanged');
ok('u_arc_e', 'deliverable.submit', { deliverableId: c0.id });
ok('u_arc_m', 'deliverable.review', { deliverableId: c0.id, decision: 'accepted', note: '' });
ok('u_arc_e', 'deliverable.deliver', { deliverableId: c0.id, channel: 'بريد', recipient: 'العميل', reference: 'TR-2' });
ok('u_arc_e', 'deliverable.client_response', { deliverableId: c0.id, kind: 'accepted', note: 'معتمد', proof: 'خطاب' });
expect(pay(j1, 'المعماري').entitlement === 'not_due', 'payment not due while the second concept is not approved');
const c1 = concepts[1];
ok('u_arc_e2', 'deliverable.upload', { deliverableId: c1.id, files: ['concept-B.pdf'] });
ok('u_arc_e2', 'deliverable.submit', { deliverableId: c1.id });
ok('u_arc_m', 'deliverable.review', { deliverableId: c1.id, decision: 'accepted', note: '' });
ok('u_arc_e', 'deliverable.deliver', { deliverableId: c1.id, channel: 'بريد', recipient: 'العميل', reference: 'TR-3' });
// No response: no automatic acceptance (AC-06), deemed acceptance under the contract clause.
tick(15);
expect(dl(j1, c1.title).status === 'awaiting_client', 'AC-06 silence is not acceptance');
expect(s.notifications.some((n) => n.eventType === 'deliverable.follow_up_due' && n.userId === 'u_arc_e'), 'AC-06 periodic reminders to the PM');
ok('u_arc_e', 'deliverable.request_deemed', { deliverableId: c1.id, evidence: 'إثبات الاستلام + انقضاء 10 أيام عمل' });
ok('u_arc_m', 'deliverable.decide_deemed', { deliverableId: c1.id, decision: 'approved', note: '' });
expect(dl(j1, c1.title).revisions.at(-1)?.clientResponse?.kind === 'deemed', 'deemed acceptance kept distinct from explicit');
expect(pay(j1, 'المعماري').entitlement === 'due' && s.events.filter((e) => e.type === 'payment.entitlement_due' && e.entity.id === pay(j1, 'المعماري').id).length === 1, 'AC-07 due exactly once, finance told with evidence');
// Payment before the structural delivery (AC-05).
const strD = dl(j1, 'المخططات الإنشائية');
ok('u_str_e', 'deliverable.upload', { deliverableId: strD.id, files: ['str.pdf'] });
ok('u_str_e', 'deliverable.submit', { deliverableId: strD.id });
ok('u_str_m', 'deliverable.review', { deliverableId: strD.id, decision: 'accepted', note: '' });
ok('u_arc_e', 'deliverable.deliver', { deliverableId: strD.id, channel: 'بريد', recipient: 'العميل', reference: 'TR-4' });
expect(dl(j1, 'المخططات الإنشائية').status === 'blocked_pending_payment', 'AC-05 delivery blocked until finance confirms the payment');
ok('u_fin', 'payment.verify_evidence', { paymentId: pay(j1, 'المعماري').id, decision: 'accepted', note: '' });
ok('u_fin', 'payment.issue_claim', { paymentId: pay(j1, 'المعماري').id, invoiceRef: 'INV-9' });
expect(s.tasks.some((t) => t.dedupeKey === `collection:${pay(j1, 'المعماري').id}` && t.ownerId === 'u_sales'), 'collection task for the opportunity owner');
ok('u_sales', 'payment.log_follow_up', { paymentId: pay(j1, 'المعماري').id, response: 'وعد بالسداد', promise: 'خلال أسبوع' });
ok('u_sales', 'payment.claim_transfer', { paymentId: pay(j1, 'المعماري').id, proof: 'صورة التحويل' });
expect(pay(j1, 'المعماري').collection === 'unpaid', 'A5 proof of transfer is not a collection');
refused('u_sales', 'payment.record_collection', { paymentId: pay(j1, 'المعماري').id, amount: 106_000, ref: 'X' }, 'only finance confirms collection');
ok('u_fin', 'payment.record_collection', { paymentId: pay(j1, 'المعماري').id, amount: 106_000, ref: 'RCV-9' });
expect(dl(j1, 'المخططات الإنشائية').status === 'ready_for_delivery', 'collection unblocks the structural delivery');
expect(s.tasks.find((t) => t.dedupeKey === `collection:${pay(j1, 'المعماري').id}`)?.status === 'completed', 'the collection follow-up closes on finance confirmation');

// ── Journey 2: licensing service ────────────────────────────────────────────────
section('Journey 2 — licensing (AC-09)');
const villa = s.projects.find((p) => p.opportunityId === 'OPP-2026-0118')!.id;
const g = s.gov.find((x) => x.projectId === villa)!;
refused('u_lic_o', 'gov.submit', { govId: g.id, requestNo: 'B-1', feeInvoiceChecked: true }, 'submission refused while documents are missing');
ok('u_lic_o', 'gov.request_client_docs', { govId: g.id, note: '' });
ok('u_sales', 'gov.client_docs_received', { govId: g.id });
ok('u_lic_o', 'gov.submit', { govId: g.id, requestNo: 'BALADY-77812', feeInvoiceChecked: true, fees: { amount: 2_400, payer: 'abak' } });
const fee = s.gov.find((x) => x.id === g.id)!.fees!.costRequestId!;
ok('u_dod', 'cost.decide', { costId: fee, decision: 'approved', note: '' });
ok('u_fin', 'cost.pay', { costId: fee, amount: 2_400, proof: 'SADAD-1' });
refused('u_lic_o', 'gov.assign_expeditor', { govId: g.id, expeditorId: 'u_exp' }, 'only the transactions manager assigns the expeditor');
ok('u_gov_m', 'gov.assign_expeditor', { govId: g.id, expeditorId: 'u_exp' });
expect(s.gov.find((x) => x.id === g.id)!.status === 'at_authority', 'fees paid + expeditor → at the authority');
tick(8);
expect(s.notifications.some((n) => n.eventType === 'gov.weekly_update_missing' && n.userId === 'u_gov_m'), 'missing weekly update alerts the transactions manager');
ok('u_exp', 'gov.follow_up', { govId: g.id, outcome: 'قيد المراجعة الفنية', platformStatus: 'تحت الدراسة', nextRequirement: '—' });
tick(3);
ok('u_exp', 'gov.record_result', { govId: g.id, outcome: 'comments', note: 'تعديل الارتداد الأمامي' });
const commentsTask = s.tasks.find((t) => t.dedupeKey === `gov_round:${g.id}:1`)!;
expect(commentsTask && commentsTask.ownerId === 'u_arc_e', 'AC-09 a task for the technical department, once');
refused('u_lic_o', 'gov.submit', { govId: g.id, requestNo: 'BALADY-77812', feeInvoiceChecked: true }, 'resubmission waits for the comments task');
tick(2);
ok('u_arc_e', 'task.start', { taskId: commentsTask.id });
ok('u_arc_e', 'task.complete', { taskId: commentsTask.id, result: 'عُدّلت المخططات' });
ok('u_lic_o', 'gov.submit', { govId: g.id, requestNo: 'BALADY-77812', feeInvoiceChecked: true });
const gg = s.gov.find((x) => x.id === g.id)!;
expect(gg.rounds.length === 2 && gg.rounds[0].authorityEnd && gg.rounds[0].officeStart && gg.rounds[0].officeEnd, 'AC-09 round 2 opened, round 1 durations kept');
tick(5);
ok('u_exp', 'gov.record_result', { govId: g.id, outcome: 'issued', note: '', docNo: '4410023871', issuedAt: s.now, expiresAt: '2029-10-25T06:00:00.000Z' });
expect(pay(villa, 'رخصة').entitlement === 'due', 'licence issued → deliverable approved → payment due');
expect(project(villa).status === 'technically_complete', 'all deliverables approved → technically complete');

// ── Journey 3: supervision with visits ──────────────────────────────────────────
section('Journey 3 — supervision visits (AC-11, AC-12)');
const sup = s.projects.find((p) => p.opportunityId === 'OPP-2026-0097')!.id;
const v3 = s.visits.find((v) => v.ownerId === 'u_sup_e' && v.status === 'report_pending')!;
expect(v3.report?.approverId === 'u_str_m', 'AC-11 the PM did the visit → the department manager approves');
refused('u_sup_e', 'visit.decide_report', { visitId: v3.id, decision: 'approved', note: '' }, 'the executor cannot approve their own report');
ok('u_str_m', 'visit.decide_report', { visitId: v3.id, decision: 'approved', note: '' });
const tomorrow = s.visits.find((v) => v.status === 'confirmed' && v.participants.includes('u_str_e'))!;
refused('u_str_m', 'visit.schedule', { type: 'inspection', purpose: 'معاينة', expectedResult: '-', location: 'x', contact: '-', ownerId: 'u_str_m', participants: ['u_str_e'], plannedStart: tomorrow.plannedStart, durationHours: 2, billing: 'na' }, 'participant conflict is caught');
const billable = s.visits.filter((v) => v.link?.projectId === sup && v.billing === 'billable').map((v) => v.id);
ok('u_fin', 'visit.claim', { visitIds: billable, amount: 6_000, ref: 'CLM-1' });
refused('u_fin', 'visit.claim', { visitIds: [billable[0]], amount: 3_000, ref: 'CLM-2' }, 'AC-12 a claimed visit cannot be claimed twice');
ok('u_sup_e2', 'visit.check_in', { visitId: tomorrow.id });
ok('u_sup_e2', 'visit.inaccessible', { visitId: tomorrow.id, reason: 'الموقع مغلق', proof: 'صورة البوابة + الموقع الجغرافي' });
expect(s.visits.find((v) => v.id === tomorrow.id)!.status === 'inaccessible', 'inaccessible visit is not completed');

// ── Journey 4: standalone admin task ───────────────────────────────────────────
section('Journey 4 — standalone task');
const adminTask = s.tasks.find((t) => t.ownerId === 'u_admin')!;
ok('u_admin', 'task.start', { taskId: adminTask.id });
refused('u_admin', 'task.complete', { taskId: adminTask.id, result: '' }, 'completion needs a documented result');
ok('u_admin', 'task.complete', { taskId: adminTask.id, result: 'جُدّد الاشتراك حتى 2027-10' });
expect(s.tasks.find((t) => t.id === adminTask.id)!.status === 'completed', 'completed with a documented result');

// ── Journey 5: project existing before the system ──────────────────────────────
section('Journey 5 — pre-system project');
const pre = s.projects.find((p) => p.createdFrom === 'pre_system')!;
refused('u_arc_e2', 'project.start', { projectId: pre.id }, 'no work before the finance review');
ok('u_fin', 'project.finance_review_existing', { projectId: pre.id, note: 'رصيد سابق 40,000 مسدد بالكامل' });
for (const it of project(pre.id).scopeItems) ok('u_arc_m', 'project.assign_owner', { projectId: pre.id, scopeItemId: it.id, ownerId: 'u_arc_e2' });
ok('u_arc_e2', 'project.start', { projectId: pre.id });
expect(project(pre.id).status === 'in_progress' && !project(pre.id).opportunityId, 'enters preparation then execution, with no dummy opportunity');

// ── Journey 6: multi-site ───────────────────────────────────────────────────────
section('Journey 6 — one project, three sites');
const fuel = s.projects.find((p) => p.opportunityId === 'OPP-2026-0131')!;
expect(fuel.sites.length === 3 && s.projects.filter((p) => p.opportunityId === 'OPP-2026-0131').length === 1, 'one project with three sites');
const st3 = fuel.scopeItems.filter((i) => i.siteId === fuel.sites[2].id).map((i) => i.id);
ok('u_arc_e2', 'change.request', { projectId: fuel.id, kind: 'track', trackName: 'مسار محطة 3', scopeItemIds: st3, reason: 'جدول تنفيذ مستقل للمحطة 3' });
const tr = project(fuel.id).changeRequests.at(-1)!;
ok('u_dod', 'change.decide', { projectId: fuel.id, requestId: tr.id, decision: 'approved', note: '' });
expect(project(fuel.id).scopeItems.length === fuel.scopeItems.length && project(fuel.id).scopeItems.filter((i) => i.trackId).length === st3.length, 'items moved to the track, not copied');
expect(s.payments.filter((p) => p.projectId === fuel.id).length === 3, 'one contract payment schedule, no artificial split');
ok('u_arc_e2', 'project.suspend_site', { projectId: fuel.id, siteId: fuel.sites[1].id, reason: 'بانتظار صك الأرض من العميل' });
expect(project(fuel.id).status === 'in_progress', 'suspending one site does not suspend the others');
// F6 with a reviewer who holds the permission: the department manager prepares, so cannot review.
const flsItem = project(fuel.id).scopeItems.find((i) => i.deptCode === 'FLS')!;
ok('u_fls_m', 'project.assign_owner', { projectId: fuel.id, scopeItemId: flsItem.id, ownerId: 'u_fls_m' });
const flsD = s.deliverables.find((d) => d.projectId === fuel.id && d.scopeItemIds.includes(flsItem.id))!;
ok('u_fls_m', 'deliverable.upload', { deliverableId: flsD.id, files: ['fire.pdf'] });
ok('u_fls_m', 'deliverable.submit', { deliverableId: flsD.id });
refused('u_fls_m', 'deliverable.review', { deliverableId: flsD.id, decision: 'accepted', note: '' }, 'F6/AC-04 a reviewer who prepared the revision cannot review it');
// Task edit keeps one owner and logs the reason.
const tk = s.tasks.find((t) => t.source === 'kickoff' && t.status !== 'completed')!;
ok(tk.creatorId, 'task.update', { taskId: tk.id, priority: 'high', reason: 'أولوية الاستلام', reviewerId: '' });
expect(s.tasks.find((t) => t.id === tk.id)!.priority === 'high' && s.events.some((e) => e.type === 'task.updated'), 'task edit logged with a reason');

// ── Exception, closure, cancellation (AC-03, AC-08, AC-13, AC-14) ───────────────
section('CEO exception: allowed scope and cost cap (AC-03, F15)');
const excBase = { opportunityId: 'OPP-2026-0150', reason: 'موعد مدن', commitmentDoc: 'أمر شراء PO-7781', allowedScope: 'التصميم الإنشائي فقط', durationDays: 30, costCap: 10_000 };
refused('u_arc_e', 'exception.request', { ...excBase, allowedLineIds: ['Q022-L2'] }, 'an engineer cannot request an exception');
refused('u_str_m', 'exception.request', { ...excBase, allowedLineIds: [] }, 'the allowed scope must name quotation lines');
refused('u_str_m', 'exception.request', { ...excBase, allowedLineIds: ['Q003-L1'] }, 'allowed lines must belong to this opportunity');
const exc = ok('u_str_m', 'exception.request', { ...excBase, allowedLineIds: ['Q022-L2'] }) as string;
refused('u_dod', 'exception.decide', { exceptionId: exc, decision: 'granted', note: '' }, 'only the CEO grants the exception');
const ep = ok('u_ceo', 'exception.decide', { exceptionId: exc, decision: 'granted', note: 'مسموح بحدود السقف' }) as string;
ok('u_dod', 'project.receive', { projectId: ep, leadDept: 'STR', departments: ['STR', 'MOD'] });
ok('u_str_m', 'project.nominate_pm', { projectId: ep, nomineeId: 'u_str_e' });
ok('u_dod', 'project.decide_pm', { projectId: ep, decision: 'approved' });
const strItem = project(ep).scopeItems.find((i) => i.sourceLineId === 'Q022-L2')!.id;
const modItem = project(ep).scopeItems.find((i) => i.sourceLineId === 'Q022-L1')!.id;
const costBase = { projectId: ep, reason: 'x', kind: 'planned' as const, vendor: 'v', quoteRef: 'q', paymentTerms: 't', bearer: 'abak' as const, payer: 'abak' as const };
refused('u_str_e', 'cost.create', { ...costBase, service: 'رسوم مدن', amount: 3_000, scopeItemId: modItem }, 'F15 a cost outside the allowed scope is refused');
refused('u_str_e', 'cost.create', { ...costBase, service: 'بلا بند', amount: 3_000 }, 'F15 a cost with no item is refused under an exception');
ok('u_str_e', 'cost.create', { ...costBase, service: 'رفع مساحي', amount: 8_000, scopeItemId: strItem });
ok('u_dod', 'cost.decide', { costId: s.costs.at(-1)!.id, decision: 'approved', note: '' });
refused('u_str_e', 'cost.create', { ...costBase, service: 'مهندس مستقل', amount: 5_000, scopeItemId: strItem }, 'AC-03 above the exception cost cap');
ok('u_str_m', 'project.assign_owner', { projectId: ep, scopeItemId: strItem, ownerId: 'u_str_e' });
ok('u_dod', 'project.assign_owner', { projectId: ep, scopeItemId: modItem, ownerId: 'u_mod_e' });
ok('u_str_e', 'project.submit_payment_links', {
  projectId: ep, links: [
    { paymentId: pay(ep, 'مقدمة').id, kind: 'none', ids: [] },
    { paymentId: pay(ep, 'مدن').id, kind: 'deliverables', ids: [dl(ep, 'مخططات معتمدة من مدن').id] },
  ],
});
ok('u_fin', 'project.decide_payment_links', { projectId: ep, decision: 'confirmed' });
ok('u_str_e', 'project.start', { projectId: ep });
refused('u_mod_e', 'deliverable.upload', { deliverableId: dl(ep, 'ملف تقديم المخططات لمدن').id, files: ['modon.pdf'] }, 'F15 work outside the allowed scope waits for finance approval');
ok('u_str_e', 'deliverable.upload', { deliverableId: dl(ep, 'المخططات الإنشائية').id, files: ['str.pdf'] });
tick(7);
expect(s.notifications.some((n) => n.eventType === 'exception.weekly_alert' && n.userId === 'u_ceo'), 'weekly CEO alert while finance approval is pending');
ok('u_fin', 'activation.approve', { activationId: 'ACT-2026-0032' });
expect(s.projects.filter((p) => p.opportunityId === 'OPP-2026-0150').length === 1 && s.exceptions.find((e) => e.id === exc)!.status === 'linked', 'finance approval links to the same project');
ok('u_mod_e', 'deliverable.upload', { deliverableId: dl(ep, 'ملف تقديم المخططات لمدن').id, files: ['modon.pdf'] });
expect(dl(ep, 'ملف تقديم المخططات لمدن').revisions.at(-1)?.files[0]?.name === 'modon.pdf', 'F15 the scope limit lifts once finance approval is linked');

section('Task contributors and attachments (TK-03)');
refused('u_dod', 'task.create', { title: 'x', ownerId: 'u_arc_m', dueDate: s.now, priority: 'low', reviewerId: 'u_arc_m' }, 'reviewer cannot be the owner');
const ct = ok('u_dod', 'task.create', { title: 'تجهيز ملف تأهيل المكتب لمنافسة', ownerId: 'u_arc_m', dueDate: s.now, priority: 'medium', contributors: ['u_arc_e', 'u_arc_m', 'u_str_m'] }) as string;
const ctask = () => s.tasks.find((t) => t.id === ct)!;
expect(ctask().ownerId === 'u_arc_m' && ctask().contributors.join() === 'u_arc_e,u_str_m', 'one owner; the owner is not also a contributor');
expect(s.notifications.some((n) => n.userId === 'u_str_m' && n.eventType === 'task.contributor_added'), 'contributors are told');
ok('u_arc_e', 'task.attach', { taskId: ct, files: ['شهادة التصنيف.pdf', 'سابقة أعمال.pdf'] });
refused('u_fin', 'task.attach', { taskId: ct, files: ['x.pdf'] }, 'outsiders cannot attach');
expect(ctask().attachments.length === 2 && ctask().attachments.every((a) => a.fileId.startsWith('NC-') && a.by === 'u_arc_e'), 'attachments recorded with who and a file reference');
ok('u_dod', 'task.update', { taskId: ct, contributors: ['u_arc_e'], reason: 'لم يعد القسم الإنشائي مطلوبًا' });
expect(ctask().contributors.join() === 'u_arc_e' && s.events.some((e) => e.type === 'task.updated' && e.summary.includes('أُزيل من المساهمين')), 'contributor removal is logged');

section('Closure chain, collections after closure (AC-08, AC-13)');
const soil = s.projects.find((p) => p.opportunityId === 'OPP-2026-0076')!.id;
tick(10);
expect(pay(soil, 'قبول').entitlement === 'overdue', 'overdue only after the grace period');
tick(16);
expect(!!pay(soil, 'قبول').escalatedAt && s.notifications.filter((n) => n.eventType === 'payment.escalated' && n.userId === 'u_sm' && n.link?.includes(pay(soil, 'قبول').id)).length === 1, 'AC-08 one escalation to the sales manager');
ok('u_geo_e', 'closure.request', { projectId: soil, reason: 'سُلمت كل المخرجات' });
refused('u_dod', 'chain.decide', { projectId: soil, kind: 'closure', decision: 'approved', note: '' }, 'the Director waits for the department managers');
ok('u_geo_m', 'chain.decide', { projectId: soil, kind: 'closure', decision: 'approved', note: '' });
ok('u_dod', 'chain.decide', { projectId: soil, kind: 'closure', decision: 'approved', note: '' });
ok('u_fin', 'chain.decide', { projectId: soil, kind: 'closure', decision: 'approved', note: 'مستحق متبقٍ 17,500' });
ok('u_ceo', 'chain.decide', { projectId: soil, kind: 'closure', decision: 'approved', note: '' });
expect(project(soil).status === 'operationally_closed' && project(soil).financialState === 'open', 'operationally closed; financial closure separate');
ok('u_fin', 'payment.record_collection', { paymentId: pay(soil, 'قبول').id, amount: 17_500, ref: 'RCV-AFTER' });
expect(pay(soil, 'قبول').collection === 'fully_collected', 'AC-13 finance collects after closure');
ok('u_fin', 'project.settle', { projectId: soil, note: 'سويت الأرصدة' });
expect(project(soil).financialState === 'settled', 'financial closure after settlement');

section('Cancellation keeps receivables (AC-14)');
ok('u_sup_e', 'cancellation.request', { projectId: sup, reason: 'إيقاف المالك للمشروع' });
ok('u_dod', 'chain.decide', { projectId: sup, kind: 'cancellation', decision: 'approved', note: '' });
ok('u_fin', 'chain.decide', { projectId: sup, kind: 'cancellation', decision: 'approved', note: 'مستحقات قائمة' });
ok('u_ceo', 'chain.decide', { projectId: sup, kind: 'cancellation', decision: 'approved', note: '' });
expect(project(sup).status === 'cancelled' && s.payments.some((p) => p.projectId === sup && p.entitlement !== 'not_due' && p.collection !== 'fully_collected'), 'AC-14 cancelled; receivables stay open');
expect(s.tasks.some((t) => t.source === 'collection' && t.link?.projectId === sup && t.status !== 'completed'), 'AC-14 collection tasks stay open');

// ── Review findings (Abak_NEW_design docs/audit/projects-prototype/04): each starts from the seed ──
const user = (id: string) => s.users.find((u) => u.id === id);
const drive = (did: string, owner: string, reviewer: string, pm: string) => {
  ok(owner, 'deliverable.upload', { deliverableId: did, files: [`${did}.pdf`] });
  ok(owner, 'deliverable.submit', { deliverableId: did });
  if (s.deliverables.find((d) => d.id === did)!.status === 'internal_review') ok(reviewer, 'deliverable.review', { deliverableId: did, decision: 'accepted', note: '' });
  ok(pm, 'deliverable.deliver', { deliverableId: did, channel: 'بريد', recipient: 'العميل', reference: 'TR' });
  ok(pm, 'deliverable.client_response', { deliverableId: did, kind: 'accepted', note: 'معتمد', proof: 'خطاب' });
};
/** A pre-system ARC project with two deliverables, started by the given PM. */
const preSystemStarted = (pm: string) => {
  const id = ok('u_dod', 'project.register_existing', {
    title: 'مشروع قائم للتجربة', clientId: 'CNT-2026-0003', deptCode: 'ARC', pmId: pm, followUpOwnerId: 'u_sales',
    currentPhase: 'التصميم', remainingWork: 'مخططان', documents: 'العقد', scopeLines: ['مخطط أ', 'مخطط ب'],
  }) as string;
  ok('u_fin', 'project.finance_review_existing', { projectId: id, note: 'لا أرصدة' });
  ok('u_arc_m', 'project.assign_owner', { projectId: id, scopeItemId: project(id).scopeItems[0].id, ownerId: 'u_arc_e' });
  ok('u_arc_m', 'project.assign_owner', { projectId: id, scopeItemId: project(id).scopeItems[1].id, ownerId: 'u_arc_e2' });
  ok(pm, 'project.start', { projectId: id });
  return id;
};

section('One project per opportunity, whatever the order (F1, AC-01)');
s = buildSeed();
const exc1 = ok('u_str_m', 'exception.request', { ...excBase, allowedLineIds: ['Q022-L2'] }) as string;
ok('u_fin', 'activation.approve', { activationId: 'ACT-2026-0032' });
expect(s.exceptions.find((e) => e.id === exc1)!.status === 'linked', 'finance approval closes the exception still waiting for the CEO');
refused('u_ceo', 'exception.decide', { exceptionId: exc1, decision: 'granted', note: '' }, 'the CEO cannot grant it afterwards');
expect(s.projects.filter((p) => p.opportunityId === 'OPP-2026-0150').length === 1, 'still one project for the opportunity');

section('The approver is never the requester (F6)');
s = buildSeed();
const f6 = ok('u_fin', 'activation.approve', { activationId: 'ACT-2026-0031' }) as string;
ok('u_dod', 'project.receive', { projectId: f6, leadDept: 'LIC', departments: ['ARC', 'STR', 'LIC'] });
ok('u_dod', 'project.nominate_pm', { projectId: f6, nomineeId: 'u_dod' });
refused('u_dod', 'project.decide_pm', { projectId: f6, decision: 'approved' }, 'the only Director cannot approve their own nomination');
expect(derivedActions(s, user('u_ceo')).some((a) => a.key === `pm:${f6}`) && !derivedActions(s, user('u_dod')).some((a) => a.key === `pm:${f6}`), 'the decision goes up to the CEO');
ok('u_ceo', 'project.decide_pm', { projectId: f6, decision: 'approved' });
ok('u_dod', 'cost.create', { projectId: f6, service: 'مهندس مستقل', reason: 'نقص موارد', kind: 'unplanned', justification: 'غير مخطط', amount: 50_000, vendor: 'مكتب', quoteRef: 'Q', paymentTerms: 'مقدم', bearer: 'abak', payer: 'abak' });
refused('u_dod', 'cost.decide', { costId: s.costs.at(-1)!.id, decision: 'approved', note: '' }, 'the PM cannot approve their own cost request');
ok('u_ceo', 'cost.decide', { costId: s.costs.at(-1)!.id, decision: 'approved', note: '' });
const free = ok('u_dod', 'change.request', { projectId: f6, kind: 'free_addition', title: 'لوحة إضافية', deptCode: 'ARC', reason: 'طلب العميل' }) as string;
refused('u_dod', 'change.decide', { projectId: f6, requestId: free, decision: 'approved', note: '' }, 'nor their own free addition');
refused('u_arc_m', 'change.decide', { projectId: f6, requestId: free, decision: 'approved', note: '' }, 'a department manager does not take the Director\'s place');
ok('u_ceo', 'change.decide', { projectId: f6, requestId: free, decision: 'approved', note: '' });
s = buildSeed();
const t11 = ok('u_dod', 'task.create', { title: 'مراجعة الحسابات', ownerId: 'u_str_e', dueDate: s.now, priority: 'high', reviewerId: 'u_str_m' }) as string;
refused('u_dod', 'task.reassign', { taskId: t11, toId: 'u_str_m', reason: 'ضغط عمل' }, 'a task is not reassigned to its reviewer');

section('PM who is also the department manager (F6, AC-11)');
s = buildSeed();
const own = preSystemStarted('u_arc_m');
const v11 = ok('u_arc_m', 'visit.schedule', { type: 'supervision', purpose: 'إشراف', expectedResult: 'تقرير', location: 'الموقع', contact: '-', link: { type: 'project', id: own, label: own, projectId: own }, ownerId: 'u_arc_m', participants: [], plannedStart: new Date(Date.parse(s.now) + 86_400_000).toISOString(), durationHours: 2, billing: 'included' }) as string;
ok('u_arc_m', 'visit.confirm', { visitId: v11 });
ok('u_arc_m', 'visit.complete', { visitId: v11, summary: 'تمت', reportFile: 'report.pdf' });
const approver = s.visits.find((v) => v.id === v11)!.report!.approverId;
expect(approver && approver !== 'u_arc_m', `AC-11 the report goes to someone other than the executor (${approver})`);
ok(approver!, 'visit.decide_report', { visitId: v11, decision: 'approved', note: '' });
for (const d of s.deliverables.filter((x) => x.projectId === own)) drive(d.id, d.scopeItemIds.includes(project(own).scopeItems[0].id) ? 'u_arc_e' : 'u_arc_e2', 'u_arc_m', 'u_arc_m');
ok('u_arc_m', 'closure.request', { projectId: own, reason: 'سُلّمت المخرجات' });
expect(project(own).closure!.steps.every((st) => !st.approverIds.includes('u_arc_m')), 'the requester approves no step of their own closure');

section('Work finished while suspended still completes the project (AD-05)');
s = buildSeed();
const p5 = preSystemStarted('u_arc_e2');
const [d5a, d5b] = s.deliverables.filter((d) => d.projectId === p5).map((d) => d.id);
drive(d5a, 'u_arc_e', 'u_arc_m', 'u_arc_e2');
ok('u_arc_e2', 'deliverable.upload', { deliverableId: d5b, files: ['b.pdf'] });
ok('u_arc_e2', 'deliverable.submit', { deliverableId: d5b });
ok('u_arc_m', 'deliverable.review', { deliverableId: d5b, decision: 'accepted', note: '' });
ok('u_arc_e2', 'deliverable.deliver', { deliverableId: d5b, channel: 'بريد', recipient: 'العميل', reference: 'TR' });
ok('u_arc_e2', 'project.suspend', { projectId: p5, type: 'client', reason: 'توقف العميل' });
ok('u_arc_e2', 'deliverable.client_response', { deliverableId: d5b, kind: 'accepted', note: 'معتمد', proof: 'خطاب' });
ok('u_arc_e2', 'project.resume', { projectId: p5 });
expect(project(p5).status === 'technically_complete', 'resume finds every deliverable approved → technically complete');

section('A finance objection holds until the PM resubmits (DL-10, AC-07)');
s = buildSeed();
const fuel2 = s.projects.find((p) => p.opportunityId === 'OPP-2026-0131')!.id;
const fls2 = project(fuel2).scopeItems.find((i) => i.deptCode === 'FLS')!.id;
for (const d of s.deliverables.filter((x) => x.projectId === fuel2 && x.scopeItemIds.includes(fls2))) drive(d.id, 'u_fls_e', 'u_fls_m', 'u_arc_e2');
const safety = pay(fuel2, 'السلامة');
ok('u_fin', 'payment.verify_evidence', { paymentId: safety.id, decision: 'objected', note: 'الإثبات بلا ختم' });
const arc2 = s.deliverables.find((d) => d.projectId === fuel2 && d.status === 'internal_review')!.id;
ok('u_arc_m', 'deliverable.review', { deliverableId: arc2, decision: 'accepted', note: '' });
ok('u_arc_e2', 'deliverable.deliver', { deliverableId: arc2, channel: 'بريد', recipient: 'العميل', reference: 'TR' });
ok('u_arc_e2', 'deliverable.client_response', { deliverableId: arc2, kind: 'accepted', note: 'معتمد', proof: 'خطاب' });
expect(pay(fuel2, 'السلامة').entitlement === 'not_due' && pay(fuel2, 'السلامة').evidenceCheck === 'objected', 'another approval does not undo the objection');
ok('u_arc_e2', 'payment.resubmit_evidence', { paymentId: safety.id, note: 'أُرفق الإثبات المختوم' });
expect(pay(fuel2, 'السلامة').entitlement === 'due' && s.events.filter((e) => e.type === 'payment.entitlement_due' && e.entity.id === safety.id).length === 1, 'resubmission makes it due; the automatic entitlement fired once');

section('Scope added to a running or suspended project opens for work (AD-01, GT-11, PJ-07)');
s = buildSeed();
const villa2 = s.projects.find((p) => p.opportunityId === 'OPP-2026-0118')!.id;
for (const [svc, amount] of [['LIC-002', 20_000], ['MEP-003', 30_000]] as const) {
  const req = ok('u_arc_e', 'change.request', { projectId: villa2, kind: 'paid_addition', reason: `إضافة ${svc}` }) as string;
  ok('u_sales', 'paid_addition.accept_quotation', { projectId: villa2, requestId: req, serviceCode: svc, amount });
}
for (const a of s.activations.filter((x) => x.status === 'pending_finance' && x.opportunityId === 'OPP-2026-0118')) ok('u_fin', 'activation.approve', { activationId: a.id });
const addGov = s.deliverables.find((d) => d.projectId === villa2 && d.origin === 'paid_addition' && d.requiresGov)!;
expect(addGov.govTransactionId && s.gov.some((g) => g.id === addGov.govTransactionId), 'the addition\'s permit gets its government transaction');
const mep2 = project(villa2).scopeItems.find((i) => i.origin === 'paid_addition' && i.deptCode === 'MEP')!.id;
ok('u_mep_m', 'project.assign_owner', { projectId: villa2, scopeItemId: mep2, ownerId: 'u_mep_e' });
for (const d of s.deliverables.filter((x) => x.projectId === villa2 && x.scopeItemIds.includes(mep2))) drive(d.id, 'u_mep_e', 'u_mep_m', 'u_arc_e');
expect(s.payments.find((x) => x.projectId === villa2 && x.amount === 30_000)!.entitlement === 'due', 'the addition\'s payment falls due with its own deliverables');
s = buildSeed();
ok('u_arc_e2', 'project.suspend', { projectId: fuel2, type: 'client', reason: 'توقف' });
const dep = ok('u_arc_e2', 'change.request', { projectId: fuel2, kind: 'add_department', deptCode: 'MEP', scope: 'الأحمال', reason: 'أحمال', deliverableTitles: ['جدول الأحمال'] }) as string;
ok('u_dod', 'change.decide', { projectId: fuel2, requestId: dep, decision: 'approved', note: '' });
ok('u_arc_e2', 'project.resume', { projectId: fuel2 });
expect(s.deliverables.find((d) => d.projectId === fuel2 && d.deptCode === 'MEP')!.status === 'in_preparation', 'a department added while suspended starts on resume');

section('Removing someone removes their access (AC-15, OD-14)');
s = buildSeed();
expect(projectAccess(s, user('u_arc_e'), project(fuel2)) === 'full', 'an item owner sees the project');
expect(!seesProjectMoney(s, user('u_arc_e'), project(fuel2)) && seesProjectMoney(s, user('u_arc_e2'), project(fuel2)), 'an item owner does not see its money; the PM does');
for (const i of project(fuel2).scopeItems.filter((x) => x.ownerId === 'u_arc_e')) ok('u_arc_m', 'project.assign_owner', { projectId: fuel2, scopeItemId: i.id, ownerId: 'u_arc_e2' });
expect(projectAccess(s, user('u_arc_e'), project(fuel2)) === null, 'AC-15 reassigning their last item ends their access');
const villa3 = s.projects.find((p) => p.opportunityId === 'OPP-2026-0118')!.id;
const g3 = s.gov.find((x) => x.projectId === villa3)!;
ok('u_lic_o', 'gov.request_client_docs', { govId: g3.id, note: '' });
ok('u_sales', 'gov.client_docs_received', { govId: g3.id });
ok('u_lic_o', 'gov.submit', { govId: g3.id, requestNo: 'B-1', feeInvoiceChecked: true });
ok('u_gov_m', 'gov.assign_expeditor', { govId: g3.id, expeditorId: 'u_exp' });
expect(projectAccess(s, user('u_exp'), project(villa3)) === 'gov' && !seesProjectMoney(s, user('u_exp'), project(villa3)), 'the expeditor sees the transaction, not the money');
const pre2 = s.projects.find((p) => p.createdFrom === 'pre_system')!;
expect(!derivedActions(s, user('u_arc_m')).some((a) => a.key === `nom:${pre2.id}`), 'no «nominate the PM» for a pre-system project that has one');

section('Numbering follows the year');
s = advanceClock(buildSeed(), 70);
const y = ok('u_fin', 'activation.approve', { activationId: 'ACT-2026-0031' }) as string;
expect(y.startsWith(`PRJ-${s.now.slice(0, 4)}-`), `a project created in ${s.now.slice(0, 4)} is numbered ${y}`);

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
