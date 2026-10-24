import { addCalendarDays, addHours } from './calendar';
import { run, type CommandName, type Payload } from './engine';
import { Ctx } from './engine/core';
import { tick } from './engine/scheduler';
import type { AppState, Deliverable, Grant, PaymentItem, Quotation, RoleId, Settings, User } from './types';

export const SEED_VERSION = 3;
export const BASE_NOW = '2026-10-25T06:00:00.000Z'; // Sunday 09:00, Riyadh

const user = (id: string, name: string, title: string, roleId: RoleId, deptCode?: User['deptCode'], grants: Grant[] = []): User => ({
  id, name, title, roleId, deptCode, grants, initials: name.replace(/^م\.\s*/, '').split(' ').map((w) => w[0]).slice(0, 2).join(' '),
});

const USERS: User[] = [
  user('u_ceo', 'م. خالد الزهراني', 'الرئيس التنفيذي', 'ceo'),
  user('u_dod', 'م. سامي القحطاني', 'مدير الأقسام / مكتب المشاريع', 'main_dept_manager'),
  user('u_arc_m', 'م. ريم الشهري', 'مديرة قسم التصميم', 'dept_manager', 'ARC'),
  user('u_str_m', 'م. فهد الدوسري', 'مدير القسم الإنشائي', 'dept_manager', 'STR'),
  user('u_fls_m', 'م. ماجد الحربي', 'مدير قسم السلامة', 'dept_manager', 'FLS'),
  user('u_mep_m', 'م. نايف العنزي', 'مدير قسم MEP', 'dept_manager', 'MEP'),
  user('u_sup_m', 'م. تركي السبيعي', 'مدير قسم الإشراف', 'dept_manager', 'SUP'),
  user('u_lic_m', 'م. هالة المطيري', 'مديرة قسم الرخص', 'dept_manager', 'LIC'),
  user('u_geo_m', 'م. عادل الشمراني', 'مدير قسم الدراسات والاختبارات', 'dept_manager', 'GEO'),
  user('u_mod_m', 'م. سلطان الغامدي', 'مدير قسم مدن', 'dept_manager', 'MOD'),
  user('u_arc_e', 'م. سارة الغامدي', 'مهندسة معمارية', 'engineer', 'ARC'),
  user('u_arc_e2', 'م. يوسف البقمي', 'مهندس معماري', 'engineer', 'ARC'),
  user('u_str_e', 'م. عمر الشمري', 'مهندس إنشائي', 'engineer', 'STR'),
  user('u_fls_e', 'م. لمى العتيبي', 'مهندسة سلامة', 'engineer', 'FLS'),
  user('u_mep_e', 'م. بدر القرني', 'مهندس كهرباء', 'engineer', 'MEP'),
  user('u_sup_e', 'م. أحمد العمري', 'مهندس إشراف', 'engineer', 'SUP'),
  user('u_sup_e2', 'م. خالد المالكي', 'مهندس إشراف', 'engineer', 'SUP'),
  user('u_geo_e', 'م. ياسر البلوي', 'مهندس جيوتقني', 'engineer', 'GEO'),
  user('u_mod_e', 'م. هيفاء الرشيد', 'مهندسة — مدن', 'engineer', 'MOD'),
  // OD-01: the three transaction roles are direct grants on existing employees, not new roles.
  user('u_lic_o', 'نورة السالم', 'مسؤولة قسم الرخص', 'engineer', 'LIC', [{ perm: 'gov_transaction.prepare', scope: 'department' }, { perm: 'cost_request.create', scope: 'own' }]),
  user('u_gov_m', 'عبدالرحمن الحربي', 'مدير المعاملات الحكومية', 'engineer', 'LIC', [{ perm: 'gov_transaction.assign', scope: 'all' }]),
  user('u_exp', 'محمد الشهري', 'معقّب', 'engineer', 'LIC', [{ perm: 'gov_transaction.follow_up', scope: 'own' }]),
  user('u_fin', 'منى العتيبي', 'المالية — محاسبة', 'accountant'),
  user('u_sales', 'علي القحطاني', 'مندوب مبيعات (مسؤول الفرصة)', 'sales_rep'),
  user('u_sm', 'وليد الحربي', 'مدير المبيعات', 'sales_manager'),
  user('u_admin', 'مدير النظام', 'مدير النظام', 'admin'),
];

const SETTINGS: Settings = {
  clientResponseDays: 10,
  deliveryFollowUpDays: 3,
  collectionEscalationDays: 15,
  defaultGraceDays: 14,
  expeditorUpdateDays: 7,
  ceoExceptionAlertDays: 7,
  taskReminderDays: 1,
  intakeSlaWorkingDays: 2,
  expiryReminderDays: 30,
  workWeek: [0, 1, 2, 3, 4],
  holidays: [
    { date: '2027-02-22', name: 'يوم التأسيس' },
    { date: '2027-09-23', name: 'اليوم الوطني' },
  ],
};

const d = (days: number, hour = 9) => addHours(addCalendarDays(BASE_NOW, days), hour - 9);

const Q = (q: Omit<Quotation, 'revision' | 'dayType' | 'kickoffRequired' | 'acceptedAt'> & Partial<Quotation>): Quotation => ({
  revision: 'Rev 01', dayType: 'working', kickoffRequired: false, acceptedAt: d(-70), ...q,
});

function base(): AppState {
  return {
    version: SEED_VERSION,
    now: BASE_NOW,
    users: USERS,
    clients: [
      { id: 'CNT-2026-0012', name: 'شركة النرجس للتطوير العقاري', kind: 'company', contact: 'م. عبدالعزيز الراشد', phone: '+966 11 455 2210', email: 'projects@narjis.example', city: 'الرياض' },
      { id: 'CNT-2026-0018', name: 'أ. فهد العبدالله', kind: 'individual', contact: 'أ. فهد العبدالله', phone: '+966 55 120 4410', email: 'fahad@example.com', city: 'الرياض' },
      { id: 'CNT-2026-0021', name: 'شركة السلي للخدمات اللوجستية', kind: 'company', contact: 'أ. ماجد السبيعي', phone: '+966 11 498 7700', email: 'ops@sulai.example', city: 'الرياض' },
      { id: 'CNT-2026-0025', name: 'شركة وقود الشمال', kind: 'company', contact: 'أ. نواف العنزي', phone: '+966 14 820 1188', email: 'stations@wqood.example', city: 'المدينة المنورة' },
      { id: 'CNT-2026-0030', name: 'مصنع الحديد الوطني', kind: 'company', contact: 'م. حسن الخالدي', phone: '+966 13 812 4400', email: 'eng@steel.example', city: 'الدمام' },
      { id: 'CNT-2026-0007', name: 'شركة الرمال للاستثمار', kind: 'company', contact: 'أ. سعد المري', phone: '+966 13 899 1020', email: 'info@rimal.example', city: 'الخبر' },
      { id: 'CNT-2026-0003', name: 'مجموعة العليا التجارية', kind: 'company', contact: 'أ. ريان الفيصل', phone: '+966 11 465 3300', email: 'admin@olaya.example', city: 'الرياض' },
    ],
    opportunities: [
      { id: 'OPP-2026-0142', clientId: 'CNT-2026-0012', title: 'مجمع النرجس التجاري — تصميم وترخيص', ownerId: 'u_sales', stage: 'won' },
      { id: 'OPP-2026-0118', clientId: 'CNT-2026-0018', title: 'فيلا حي الياسمين — تصميم ورخصة بناء', ownerId: 'u_sales', stage: 'won' },
      { id: 'OPP-2026-0097', clientId: 'CNT-2026-0021', title: 'إشراف — مستودعات السلي', ownerId: 'u_sales', stage: 'won' },
      { id: 'OPP-2026-0131', clientId: 'CNT-2026-0025', title: 'محطات وقود الشمال — ثلاثة مواقع', ownerId: 'u_sales', stage: 'won' },
      { id: 'OPP-2026-0150', clientId: 'CNT-2026-0030', title: 'مصنع الحديد الوطني — اعتماد مدن', ownerId: 'u_sales', stage: 'won' },
      { id: 'OPP-2026-0076', clientId: 'CNT-2026-0007', title: 'تقرير تربة — مخطط الرمال', ownerId: 'u_sales', stage: 'won' },
    ],
    quotations: [
      Q({
        id: 'Q-261012-003', opportunityId: 'OPP-2026-0142', kind: 'original', kickoffRequired: true, durationDays: 120, responseDays: 10,
        deemedAcceptanceClause: 'البند 7.3: يُعد المخرج مقبولًا إذا لم يرد العميل كتابيًا خلال 10 أيام عمل من الاستلام الموثق',
        lines: [
          { id: 'Q003-L1', serviceCode: 'ARC-001', title: 'التصميم المعماري — المبنى A', deptCode: 'ARC', amount: 180_000, siteName: 'المبنى A' },
          { id: 'Q003-L2', serviceCode: 'ARC-001', title: 'التصميم المعماري — المبنى B', deptCode: 'ARC', amount: 150_000, siteName: 'المبنى B' },
          { id: 'Q003-L3', serviceCode: 'STR-001', title: 'التصميم الإنشائي (مشترك)', deptCode: 'STR', amount: 160_000 },
          { id: 'Q003-L4', serviceCode: 'LIC-002', title: 'إصدار رخصة البناء', deptCode: 'LIC', amount: 40_000 },
        ],
        payments: [
          { id: 'Q003-P1', label: 'دفعة مقدمة 30%', amount: 159_000, condition: 'advance', graceDays: 7 },
          { id: 'Q003-P2', label: 'عند قبول التصميم المعماري', amount: 106_000, condition: 'acceptance', graceDays: 14, beforeDeliveryOfLineId: 'Q003-L3' },
          { id: 'Q003-P3', label: 'عند تسليم المخططات الإنشائية', amount: 159_000, condition: 'delivery', graceDays: 14 },
          { id: 'Q003-P4', label: 'عند صدور رخصة البناء', amount: 106_000, condition: 'licence', graceDays: 14 },
        ],
      }),
      Q({
        id: 'Q-260920-011', opportunityId: 'OPP-2026-0118', kind: 'original', durationDays: 60, responseDays: 7,
        lines: [
          { id: 'Q011-L1', serviceCode: 'ARC-001', title: 'التصميم المعماري للفيلا', deptCode: 'ARC', amount: 60_000 },
          { id: 'Q011-L2', serviceCode: 'LIC-002', title: 'إصدار رخصة بناء جديدة', deptCode: 'LIC', amount: 15_000 },
        ],
        payments: [
          { id: 'Q011-P1', label: 'دفعة مقدمة 50%', amount: 37_500, condition: 'advance', graceDays: 7 },
          { id: 'Q011-P2', label: 'عند صدور رخصة البناء', amount: 37_500, condition: 'licence', graceDays: 14 },
        ],
      }),
      Q({
        id: 'Q-260830-007', opportunityId: 'OPP-2026-0097', kind: 'original', kickoffRequired: true, durationDays: 180, dayType: 'calendar',
        lines: [{ id: 'Q007-L1', serviceCode: 'SUP-001', title: 'الإشراف الهندسي — 6 أشهر', deptCode: 'SUP', amount: 240_000 }],
        payments: [
          { id: 'Q007-P1', label: 'دفعة الشهر 1', amount: 40_000, condition: 'date', dueDate: d(-10), graceDays: 10 },
          { id: 'Q007-P2', label: 'دفعة الشهر 2', amount: 40_000, condition: 'date', dueDate: d(20), graceDays: 10 },
          { id: 'Q007-P3', label: 'دفعة الشهر 3', amount: 40_000, condition: 'date', dueDate: d(50), graceDays: 10 },
          { id: 'Q007-P4', label: 'دفعة الشهر 4', amount: 40_000, condition: 'date', dueDate: d(80), graceDays: 10 },
          { id: 'Q007-P5', label: 'دفعة الشهر 5', amount: 40_000, condition: 'date', dueDate: d(110), graceDays: 10 },
          { id: 'Q007-P6', label: 'دفعة الشهر 6', amount: 40_000, condition: 'date', dueDate: d(140), graceDays: 10 },
        ],
      }),
      Q({
        id: 'Q-261001-019', opportunityId: 'OPP-2026-0131', kind: 'original', durationDays: 75,
        lines: [
          { id: 'Q019-L1', serviceCode: 'ARC-001', title: 'تصميم محطة 1', deptCode: 'ARC', amount: 55_000, siteName: 'محطة 1 — طريق الهجرة' },
          { id: 'Q019-L2', serviceCode: 'ARC-001', title: 'تصميم محطة 2', deptCode: 'ARC', amount: 55_000, siteName: 'محطة 2 — العزيزية' },
          { id: 'Q019-L3', serviceCode: 'ARC-001', title: 'تصميم محطة 3', deptCode: 'ARC', amount: 55_000, siteName: 'محطة 3 — طريق الملك عبدالله' },
          { id: 'Q019-L4', serviceCode: 'FLS-001', title: 'مخططات السلامة (مشتركة للمحطات)', deptCode: 'FLS', amount: 45_000 },
        ],
        payments: [
          { id: 'Q019-P1', label: 'دفعة مقدمة 30%', amount: 63_000, condition: 'advance', graceDays: 7 },
          { id: 'Q019-P2', label: 'عند قبول تصاميم المحطات', amount: 84_000, condition: 'acceptance', graceDays: 14 },
          { id: 'Q019-P3', label: 'عند إنجاز مخططات السلامة', amount: 63_000, condition: 'completion', graceDays: 14 },
        ],
      }),
      Q({
        id: 'Q-261015-022', opportunityId: 'OPP-2026-0150', kind: 'original', durationDays: 45, dayType: 'calendar',
        lines: [
          { id: 'Q022-L1', serviceCode: 'MOD-002', title: 'اعتماد المخططات لدى مدن', deptCode: 'MOD', amount: 90_000 },
          { id: 'Q022-L2', serviceCode: 'STR-001', title: 'التصميم الإنشائي للمصنع', deptCode: 'STR', amount: 70_000 },
        ],
        payments: [
          { id: 'Q022-P1', label: 'دفعة مقدمة 40%', amount: 64_000, condition: 'advance', graceDays: 7 },
          { id: 'Q022-P2', label: 'عند اعتماد مدن', amount: 96_000, condition: 'licence', graceDays: 14 },
        ],
      }),
      Q({
        id: 'Q-260801-004', opportunityId: 'OPP-2026-0076', kind: 'original', durationDays: 30,
        lines: [{ id: 'Q004-L1', serviceCode: 'GEO-001', title: 'دراسة وتقرير التربة', deptCode: 'GEO', amount: 35_000 }],
        payments: [
          { id: 'Q004-P1', label: 'دفعة مقدمة 50%', amount: 17_500, condition: 'advance', graceDays: 7 },
          { id: 'Q004-P2', label: 'عند قبول تقرير التربة', amount: 17_500, condition: 'acceptance', graceDays: 14 },
        ],
      }),
    ],
    activations: [
      { id: 'ACT-2026-0024', opportunityId: 'OPP-2026-0076', quotationId: 'Q-260801-004', status: 'pending_finance', requestedBy: 'u_sales', requestedAt: d(-61) },
      { id: 'ACT-2026-0026', opportunityId: 'OPP-2026-0097', quotationId: 'Q-260830-007', status: 'pending_finance', requestedBy: 'u_sales', requestedAt: d(-46) },
      { id: 'ACT-2026-0027', opportunityId: 'OPP-2026-0118', quotationId: 'Q-260920-011', status: 'pending_finance', requestedBy: 'u_sales', requestedAt: d(-41) },
      { id: 'ACT-2026-0029', opportunityId: 'OPP-2026-0131', quotationId: 'Q-261001-019', status: 'pending_finance', requestedBy: 'u_sales', requestedAt: d(-26) },
      { id: 'ACT-2026-0031', opportunityId: 'OPP-2026-0142', quotationId: 'Q-261012-003', status: 'pending_finance', requestedBy: 'u_sales', requestedAt: d(-1) },
      { id: 'ACT-2026-0032', opportunityId: 'OPP-2026-0150', quotationId: 'Q-261015-022', status: 'pending_finance', requestedBy: 'u_sales', requestedAt: d(-3) },
    ],
    exceptions: [],
    projects: [],
    deliverables: [],
    payments: [],
    gov: [],
    tasks: [],
    visits: [],
    visitClaims: [],
    costs: [],
    events: [],
    notifications: [],
    settings: SETTINGS,
    seq: { 'ACT-2026': 40, 'GOV-2026': 10, 'TSK-2026': 100, 'VST-2026': 20, 'CR-2026': 5, 'EXC-2026': 2 },
  };
}

/** Build the demo state by running the real commands — the seed obeys every rule the UI does. */
export function buildSeed(): AppState {
  let s = base();
  const at = (iso: string) => {
    s.now = iso;
  };
  const step = <K extends CommandName>(actor: string, name: K, payload: Payload<K>): unknown => {
    const r = run(s, actor, name, payload);
    if (!r.ok) throw new Error(`seed: ${name} by ${actor} failed: ${r.error}`);
    s = r.state;
    return r.value;
  };
  const dl = (pid: string, title: string): Deliverable => {
    const x = s.deliverables.find((y) => y.projectId === pid && y.title.includes(title));
    if (!x) throw new Error(`seed: deliverable ${title} not found in ${pid}`);
    return x;
  };
  const pay = (pid: string, label: string): PaymentItem => {
    const x = s.payments.find((y) => y.projectId === pid && y.label.includes(label));
    if (!x) throw new Error(`seed: payment ${label} not found in ${pid}`);
    return x;
  };
  const item = (pid: string, title: string) => {
    const x = s.projects.find((p) => p.id === pid)!.scopeItems.find((i) => i.title.includes(title));
    if (!x) throw new Error(`seed: item ${title} not found in ${pid}`);
    return x.id;
  };
  const deliver = (pid: string, title: string, owner: string, reviewer: string | null, pm: string, accept: boolean) => {
    const x = dl(pid, title);
    step(owner, 'deliverable.upload', { deliverableId: x.id, files: [`${x.id}-Rev00.pdf`, `${x.id}-Rev00.dwg`] });
    step(owner, 'deliverable.submit', { deliverableId: x.id });
    if (reviewer) step(reviewer, 'deliverable.review', { deliverableId: x.id, decision: 'accepted', note: 'مطابق' });
    step(pm, 'deliverable.deliver', { deliverableId: x.id, channel: 'البريد الإلكتروني', recipient: 'ممثل العميل', reference: `TR-${x.id}` });
    if (accept) step(pm, 'deliverable.client_response', { deliverableId: x.id, kind: 'accepted', note: 'اعتماد العميل', proof: `خطاب اعتماد ${x.id}` });
  };

  // ── 1) Soil report — technically complete, ready for the closure chain (journey 1 end) ──
  at(d(-60));
  const soil = step('u_fin', 'activation.approve', { activationId: 'ACT-2026-0024' }) as string;
  step('u_dod', 'project.receive', { projectId: soil, leadDept: 'GEO', departments: ['GEO'] });
  step('u_geo_m', 'project.nominate_pm', { projectId: soil, nomineeId: 'u_geo_e' });
  step('u_dod', 'project.decide_pm', { projectId: soil, decision: 'approved' });
  step('u_geo_m', 'project.assign_owner', { projectId: soil, scopeItemId: item(soil, 'التربة'), ownerId: 'u_geo_e' });
  step('u_geo_e', 'project.plan_from_items', { projectId: soil });
  step('u_geo_e', 'project.submit_payment_links', {
    projectId: soil, links: [
      { paymentId: pay(soil, 'مقدمة').id, kind: 'none', ids: [] },
      { paymentId: pay(soil, 'قبول').id, kind: 'deliverables', ids: [dl(soil, 'تقرير التربة').id] },
    ],
  });
  step('u_fin', 'project.decide_payment_links', { projectId: soil, decision: 'confirmed' });
  at(d(-55));
  step('u_geo_e', 'project.start', { projectId: soil });
  step('u_fin', 'payment.issue_claim', { paymentId: pay(soil, 'مقدمة').id, invoiceRef: 'INV-2026-0411' });
  step('u_fin', 'payment.record_collection', { paymentId: pay(soil, 'مقدمة').id, amount: 17_500, ref: 'RCV-2026-0388' });
  const soilCost = step('u_geo_e', 'cost.create', {
    projectId: soil, service: 'جسات حقلية واختبارات معملية — مختبر معتمد', reason: 'متطلب لتقرير التربة', kind: 'planned', amount: 12_000,
    plannedEstimate: 12_000, vendor: 'مختبر الخليج للتربة', quoteRef: 'QT-GL-5521', paymentTerms: '50% مقدم و50% عند التسليم', bearer: 'abak', payer: 'abak',
  }) as string;
  step('u_dod', 'cost.decide', { costId: soilCost, decision: 'approved', note: '' });
  step('u_fin', 'cost.pay', { costId: soilCost, amount: 6_000, proof: 'TRF-55120' });
  at(d(-40));
  step('u_geo_e', 'cost.receive_service', { costId: soilCost, note: 'استلام نتائج الجسات' });
  step('u_fin', 'cost.pay', { costId: soilCost, amount: 6_000, proof: 'TRF-55871' });
  at(d(-22));
  deliver(soil, 'تقرير التربة', 'u_geo_e', 'u_geo_m', 'u_geo_e', false);
  at(d(-20));
  step('u_geo_e', 'deliverable.client_response', { deliverableId: dl(soil, 'تقرير التربة').id, kind: 'accepted', note: 'اعتمد العميل التقرير', proof: 'بريد العميل 2026-10-05' });
  step('u_fin', 'payment.verify_evidence', { paymentId: pay(soil, 'قبول').id, decision: 'accepted', note: '' });
  step('u_fin', 'payment.issue_claim', { paymentId: pay(soil, 'قبول').id, invoiceRef: 'INV-2026-0502' });
  step('u_sales', 'payment.log_follow_up', { paymentId: pay(soil, 'قبول').id, response: 'العميل طلب نسخة الفاتورة الضريبية', promise: 'السداد خلال أسبوعين', nextFollowUp: d(-8) });

  // ── 2) Supervision with visits (journey 3) ──
  at(d(-45));
  const sup = step('u_fin', 'activation.approve', { activationId: 'ACT-2026-0026' }) as string;
  step('u_dod', 'project.receive', { projectId: sup, leadDept: 'SUP', departments: ['SUP'] });
  step('u_sup_m', 'project.nominate_pm', { projectId: sup, nomineeId: 'u_sup_e' });
  step('u_dod', 'project.decide_pm', { projectId: sup, decision: 'approved' });
  step('u_sup_m', 'project.assign_owner', { projectId: sup, scopeItemId: item(sup, 'الإشراف'), ownerId: 'u_sup_e2' });
  step('u_sup_e', 'project.apply_template', { projectId: sup, templateId: 'supervision' });
  step('u_sup_e', 'project.submit_payment_links', { projectId: sup, links: s.payments.filter((p) => p.projectId === sup).map((p) => ({ paymentId: p.id, kind: 'none' as const, ids: [] })) });
  step('u_fin', 'project.decide_payment_links', { projectId: sup, decision: 'confirmed' });
  step('u_sup_e', 'project.hold_kickoff', {
    projectId: sup, minutes: 'اجتماع افتتاحي مع المقاول والمالك: برنامج الزيارات أسبوعي، قناة التواصل الرسمية البريد، ومحاضر الاستلام بالمرحلة.', attendees: ['u_sup_e', 'u_sup_e2', 'u_sales'],
    actions: [{ title: 'اعتماد برنامج زيارات الإشراف الأسبوعي', ownerId: 'u_sup_e2', dueDays: 3 }, { title: 'استلام مخططات المقاول المعتمدة', ownerId: 'u_sup_e2', dueDays: 5 }],
  });
  at(d(-40));
  step('u_sup_e', 'project.start', { projectId: sup });
  for (const t of s.tasks.filter((x) => x.source === 'kickoff' && x.link?.projectId === sup)) {
    step('u_sup_e2', 'task.start', { taskId: t.id });
    step('u_sup_e2', 'task.complete', { taskId: t.id, result: 'أُنجز واعتُمد مع المالك' });
  }
  const visit = (owner: string, when: number, hour: number, participants: string[], billing: 'included' | 'billable', purpose: string) =>
    step(owner, 'visit.schedule', {
      type: 'supervision', purpose, expectedResult: 'تقرير إشراف ومحضر ملاحظات', location: 'مستودعات السلي — المنطقة الصناعية', contact: 'أ. ماجد السبيعي',
      link: { type: 'project', id: sup, label: 'إشراف — مستودعات السلي', projectId: sup }, ownerId: owner, participants, plannedStart: d(when, hour), durationHours: 3, billing,
    }) as string;
  at(d(-21));
  const v1 = visit('u_sup_e2', -20, 10, [], 'included', 'زيارة إشراف أسبوعية — أعمال الحفر');
  step('u_sup_e2', 'visit.confirm', { visitId: v1 });
  at(d(-20, 14));
  step('u_sup_e2', 'visit.complete', { visitId: v1, summary: 'الحفر مطابق للمخططات', notes: 'ملاحظة على تصريف المياه', photos: 6, reportFile: 'SUP-REP-01.pdf' });
  at(d(-19));
  step('u_sup_e', 'visit.decide_report', { visitId: v1, decision: 'approved', note: '' });
  at(d(-10));
  tick(new Ctx(s, 'system'));
  step('u_fin', 'payment.issue_claim', { paymentId: pay(sup, 'الشهر 1').id, invoiceRef: 'INV-2026-0533' });
  at(d(-9));
  const v2 = visit('u_sup_e2', -8, 10, [], 'billable', 'زيارة إضافية بطلب المالك — صب القواعد');
  step('u_sup_e2', 'visit.confirm', { visitId: v2 });
  at(d(-8, 14));
  step('u_sup_e2', 'visit.complete', { visitId: v2, summary: 'صب القواعد مطابق', photos: 9, reportFile: 'SUP-REP-02.pdf' });
  step('u_sup_e', 'visit.decide_report', { visitId: v2, decision: 'approved', note: '' });
  at(d(-5));
  step('u_fin', 'payment.record_collection', { paymentId: pay(sup, 'الشهر 1').id, amount: 20_000, ref: 'RCV-2026-0450' });
  step('u_sales', 'payment.log_follow_up', { paymentId: pay(sup, 'الشهر 1').id, response: 'سُدد نصف الدفعة؛ الباقي بعد اعتماد المالك', promise: 'الباقي قبل نهاية الشهر', nextFollowUp: d(2) });
  at(d(-4));
  const v3 = visit('u_sup_e', -3, 10, ['u_sup_e2'], 'billable', 'زيارة إشراف — الأعمدة (المنفّذ مدير المشروع)');
  step('u_sup_e', 'visit.confirm', { visitId: v3 });
  at(d(-3, 14));
  step('u_sup_e', 'visit.complete', { visitId: v3, summary: 'تنفيذ الأعمدة مطابق مع ملاحظتين', photos: 7, reportFile: 'SUP-REP-03.pdf' });
  at(d(-1));
  const v4 = visit('u_sup_e2', 1, 10, ['u_str_e'], 'included', 'زيارة إشراف أسبوعية — سقف الدور الأرضي');
  step('u_sup_e2', 'visit.confirm', { visitId: v4 });
  visit('u_sup_e2', 3, 10, [], 'included', 'زيارة استلام حديد التسليح');

  // ── 3) Villa: design done, building permit transaction in preparation (journey 2) ──
  at(d(-40));
  const villa = step('u_fin', 'activation.approve', { activationId: 'ACT-2026-0027' }) as string;
  step('u_dod', 'project.receive', { projectId: villa, leadDept: 'ARC', departments: ['ARC', 'LIC'] });
  step('u_arc_m', 'project.nominate_pm', { projectId: villa, nomineeId: 'u_arc_e' });
  step('u_dod', 'project.decide_pm', { projectId: villa, decision: 'approved' });
  step('u_arc_m', 'project.assign_owner', { projectId: villa, scopeItemId: item(villa, 'التصميم'), ownerId: 'u_arc_e' });
  step('u_lic_m', 'project.assign_owner', { projectId: villa, scopeItemId: item(villa, 'رخصة'), ownerId: 'u_lic_o' });
  step('u_arc_e', 'project.apply_template', { projectId: villa, templateId: 'design_permit' });
  step('u_arc_e', 'project.submit_payment_links', {
    projectId: villa, links: [
      { paymentId: pay(villa, 'مقدمة').id, kind: 'none', ids: [] },
      { paymentId: pay(villa, 'رخصة').id, kind: 'deliverables', ids: [dl(villa, 'رخصة بناء إلكترونية').id] },
    ],
  });
  step('u_fin', 'project.decide_payment_links', { projectId: villa, decision: 'confirmed' });
  at(d(-38));
  step('u_arc_e', 'project.start', { projectId: villa });
  step('u_fin', 'payment.issue_claim', { paymentId: pay(villa, 'مقدمة').id, invoiceRef: 'INV-2026-0470' });
  step('u_fin', 'payment.record_collection', { paymentId: pay(villa, 'مقدمة').id, amount: 37_500, ref: 'RCV-2026-0402' });
  at(d(-30));
  deliver(villa, 'المفهوم', 'u_arc_e', 'u_arc_m', 'u_arc_e', true);
  at(d(-15));
  deliver(villa, 'مساقط', 'u_arc_e', 'u_arc_m', 'u_arc_e', true);
  deliver(villa, 'طلب رخصة', 'u_lic_o', null, 'u_arc_e', true);
  at(d(-2));
  const villaGov = s.gov.find((g) => g.projectId === villa)!;
  for (const doc of villaGov.requiredDocs.slice(0, 3)) step('u_lic_o', 'gov.toggle_doc', { govId: villaGov.id, name: doc.name, received: true });

  // ── 4) Fuel stations: one project, three sites (journey 6) ──
  at(d(-25));
  const fuel = step('u_fin', 'activation.approve', { activationId: 'ACT-2026-0029' }) as string;
  step('u_dod', 'project.receive', { projectId: fuel, leadDept: 'ARC', departments: ['ARC', 'FLS'] });
  step('u_arc_m', 'project.nominate_pm', { projectId: fuel, nomineeId: 'u_arc_e2' });
  step('u_dod', 'project.decide_pm', { projectId: fuel, decision: 'approved' });
  step('u_arc_m', 'project.assign_owner', { projectId: fuel, scopeItemId: item(fuel, 'محطة 1'), ownerId: 'u_arc_e2' });
  step('u_arc_m', 'project.assign_owner', { projectId: fuel, scopeItemId: item(fuel, 'محطة 2'), ownerId: 'u_arc_e2' });
  step('u_arc_m', 'project.assign_owner', { projectId: fuel, scopeItemId: item(fuel, 'محطة 3'), ownerId: 'u_arc_e' });
  step('u_fls_m', 'project.assign_owner', { projectId: fuel, scopeItemId: item(fuel, 'السلامة'), ownerId: 'u_fls_e' });
  step('u_arc_e2', 'project.plan_from_items', { projectId: fuel });
  const fuelItems = s.projects.find((p) => p.id === fuel)!.scopeItems;
  step('u_arc_e2', 'project.submit_payment_links', {
    projectId: fuel, links: [
      { paymentId: pay(fuel, 'مقدمة').id, kind: 'none', ids: [] },
      { paymentId: pay(fuel, 'تصاميم').id, kind: 'items', ids: fuelItems.filter((i) => i.deptCode === 'ARC').map((i) => i.id) },
      { paymentId: pay(fuel, 'السلامة').id, kind: 'items', ids: fuelItems.filter((i) => i.deptCode === 'FLS').map((i) => i.id) },
    ],
  });
  step('u_fin', 'project.decide_payment_links', { projectId: fuel, decision: 'confirmed' });
  at(d(-20));
  step('u_arc_e2', 'project.start', { projectId: fuel });
  step('u_fin', 'payment.issue_claim', { paymentId: pay(fuel, 'مقدمة').id, invoiceRef: 'INV-2026-0521' });
  step('u_fin', 'payment.record_collection', { paymentId: pay(fuel, 'مقدمة').id, amount: 63_000, ref: 'RCV-2026-0431' });
  at(d(-6));
  const st1 = dl(fuel, 'المفهوم والتصور المعماري — محطة 1');
  step('u_arc_e2', 'deliverable.upload', { deliverableId: st1.id, files: ['ST1-concept-Rev00.pdf'] });
  step('u_arc_e2', 'deliverable.submit', { deliverableId: st1.id });

  // ── 5) A project that existed before the system (journey 5) ──
  at(d(-2));
  step('u_dod', 'project.register_existing', {
    title: 'مبنى إداري — العليا (قائم قبل النظام)', clientId: 'CNT-2026-0003', deptCode: 'ARC', pmId: 'u_arc_e2', followUpOwnerId: 'u_sales',
    currentPhase: 'التصميم التفصيلي — 60%', remainingWork: 'استكمال المخططات التنفيذية وتسليمها', documents: 'العقد الموقع، المخططات المعتمدة حتى Rev 03',
    scopeLines: ['المخططات المعمارية التنفيذية', 'جداول التشطيبات والمواصفات'],
  });

  // ── Standalone admin task (journey 4) and the pre-pricing visit (journey 1 start) ──
  at(d(-35));
  const pv = step('u_sales', 'visit.schedule', {
    type: 'pricing', purpose: 'معاينة موقع مجمع النرجس قبل التسعير', expectedResult: 'تحديد نطاق التصميم والمباني', location: 'حي النرجس — الرياض', contact: 'م. عبدالعزيز الراشد',
    link: { type: 'opportunity', id: 'OPP-2026-0142', label: 'مجمع النرجس التجاري' }, ownerId: 'u_sales', participants: ['u_arc_m'], plannedStart: d(-34, 10), durationHours: 2, billing: 'free',
  }) as string;
  step('u_sales', 'visit.confirm', { visitId: pv });
  at(d(-34, 13));
  step('u_sales', 'visit.complete', { visitId: pv, summary: 'مبنيان على أرض واحدة، ترخيص مشترك', nextStep: 'إرسال طلب التسعير لقسم التصميم' });
  at(d(-1));
  step('u_dod', 'task.create', { title: 'تجديد اشتراك برنامج التصميم للأقسام الفنية', ownerId: 'u_admin', dueDate: d(4), priority: 'medium' });

  // ── Back to today: the scheduler applies everything time-based ──
  at(BASE_NOW);
  tick(new Ctx(s, 'system'));
  // Notices older than two days are history: shown as read.
  for (const n of s.notifications) if (Date.parse(n.at) < Date.parse(d(-2))) n.read = true;
  return s;
}
