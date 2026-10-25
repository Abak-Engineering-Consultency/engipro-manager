import type {
  ActivationStatus, Collection, CostState, DeliverableState, Entitlement, GovState, Invoicing,
  MemberCapacity, PaymentCondition, ProjectState, RoleId, TaskState, User, VisitBilling, VisitState,
} from './types';

/** Status tones follow the ABAK status palette: new / progress / waiting / success / danger / muted. */
export type Tone = 'new' | 'progress' | 'waiting' | 'success' | 'danger' | 'muted' | 'brand';

export interface StateLabel { label: string; tone: Tone }

/** 11-B1 — one dictionary of project states (R1). */
export const PROJECT_STATES: Record<ProjectState, StateLabel> = {
  awaiting_assignment: { label: 'بانتظار التعيين', tone: 'waiting' },
  preparing: { label: 'تجهيز', tone: 'new' },
  in_progress: { label: 'قيد التنفيذ', tone: 'progress' },
  suspended: { label: 'معلّق', tone: 'waiting' },
  technically_complete: { label: 'مكتمل فنيًا', tone: 'success' },
  closure_review: { label: 'قيد الإغلاق', tone: 'progress' },
  operationally_closed: { label: 'مغلق تشغيليًا', tone: 'muted' },
  cancellation_review: { label: 'قيد الإلغاء', tone: 'danger' },
  cancelled: { label: 'ملغى', tone: 'muted' },
};

export const DELIVERABLE_STATES: Record<DeliverableState, StateLabel> = {
  not_started: { label: 'لم يبدأ', tone: 'muted' },
  in_preparation: { label: 'قيد الإعداد', tone: 'progress' },
  internal_review: { label: 'مراجعة داخلية', tone: 'waiting' },
  ready_for_delivery: { label: 'جاهز للتسليم', tone: 'brand' },
  blocked_pending_payment: { label: 'ممنوع حتى السداد', tone: 'danger' },
  awaiting_client: { label: 'بانتظار رد العميل', tone: 'waiting' },
  deemed_acceptance_review: { label: 'إثبات قبول وفق العقد', tone: 'waiting' },
  client_approved: { label: 'معتمد من العميل', tone: 'success' },
  excluded: { label: 'مستبعد بموافقة', tone: 'muted' },
};

export const ENTITLEMENT: Record<Entitlement, StateLabel> = {
  not_due: { label: 'لم تستحق', tone: 'muted' },
  due: { label: 'مستحقة — ضمن المهلة', tone: 'waiting' },
  overdue: { label: 'متأخرة', tone: 'danger' },
};

export const INVOICING: Record<Invoicing, StateLabel> = {
  not_invoiced: { label: 'لم تصدر فاتورة', tone: 'muted' },
  invoiced: { label: 'صدرت المطالبة', tone: 'progress' },
};

export const COLLECTION: Record<Collection, StateLabel> = {
  unpaid: { label: 'غير محصلة', tone: 'muted' },
  partially_collected: { label: 'محصلة جزئيًا', tone: 'waiting' },
  fully_collected: { label: 'محصلة بالكامل', tone: 'success' },
};

export const PAYMENT_CONDITIONS: Record<PaymentCondition, string> = {
  advance: 'دفعة مقدمة',
  completion: 'عند الإنجاز',
  delivery: 'عند التسليم',
  acceptance: 'عند القبول',
  licence: 'عند صدور الترخيص',
  periodic: 'دورية (شهرية)',
  date: 'بتاريخ محدد',
};

/** Conditions tied to time, not to a deliverable (PJ-07: never linked to an unsuitable deliverable). */
export const TIME_BASED: PaymentCondition[] = ['advance', 'periodic', 'date'];

export const GOV_STATES: Record<GovState, StateLabel> = {
  preparing: { label: 'تجهيز', tone: 'new' },
  awaiting_client: { label: 'بانتظار العميل', tone: 'waiting' },
  submitted: { label: 'مقدّمة', tone: 'progress' },
  awaiting_fees: { label: 'بانتظار الرسوم', tone: 'waiting' },
  at_authority: { label: 'لدى الجهة', tone: 'progress' },
  comments_processing: { label: 'معالجة ملاحظات فنية', tone: 'waiting' },
  final_rejection_decision: { label: 'رفض نهائي: إعادة أم إغلاق', tone: 'danger' },
  issued: { label: 'صدرت', tone: 'success' },
  closed_not_issued: { label: 'مغلقة دون صدور', tone: 'muted' },
};

export const TASK_STATES: Record<TaskState, StateLabel> = {
  new: { label: 'جديدة', tone: 'new' },
  in_progress: { label: 'قيد العمل', tone: 'progress' },
  blocked: { label: 'معطّلة / بانتظار', tone: 'waiting' },
  in_review: { label: 'بانتظار المراجعة', tone: 'waiting' },
  completed: { label: 'مكتملة', tone: 'success' },
  cancelled: { label: 'ملغاة', tone: 'muted' },
};

export const VISIT_STATES: Record<VisitState, StateLabel> = {
  proposed: { label: 'مقترحة', tone: 'new' },
  confirmed: { label: 'مؤكدة', tone: 'progress' },
  executed: { label: 'منفذة', tone: 'success' },
  inaccessible: { label: 'متعذرة', tone: 'danger' },
  report_pending: { label: 'التقرير بانتظار الاعتماد', tone: 'waiting' },
  report_approved: { label: 'منفذة — تقرير معتمد', tone: 'success' },
  cancelled: { label: 'ملغاة', tone: 'muted' },
};

export const VISIT_BILLING: Record<VisitBilling, string> = {
  included: 'مشمولة في العقد',
  free: 'مجانية',
  billable: 'قابلة للفوترة',
  na: 'لا ينطبق',
};

export const COST_STATES: Record<CostState, StateLabel> = {
  submitted: { label: 'مرفوع للاعتماد', tone: 'waiting' },
  returned: { label: 'مُعاد للاستكمال', tone: 'waiting' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  approved: { label: 'معتمد — بانتظار الصرف', tone: 'progress' },
  partially_paid: { label: 'مصروف جزئيًا', tone: 'progress' },
  paid: { label: 'مصروف بالكامل', tone: 'success' },
  service_received: { label: 'الخدمة مستلمة', tone: 'success' },
};

export const ACTIVATION_STATES: Record<ActivationStatus, StateLabel> = {
  pending_finance: { label: 'بانتظار قرار المالية', tone: 'waiting' },
  approved: { label: 'معتمد ماليًا', tone: 'success' },
  returned: { label: 'معاد للمبيعات', tone: 'danger' },
};

export const ROLE_NAMES: Record<RoleId, string> = {
  ceo: 'الرئيس التنفيذي',
  main_dept_manager: 'مدير الأقسام',
  dept_manager: 'مدير القسم',
  engineer: 'مهندس',
  accountant: 'محاسب',
  sales_rep: 'مندوب مبيعات',
  sales_manager: 'مدير المبيعات',
  admin: 'مدير النظام',
};

/** Every role the person holds, in the order they were given: «مدير القسم، مهندس». */
export const roleLabel = (u: User) => [u.roleId, ...(u.extraRoles ?? [])].map((r) => ROLE_NAMES[r]).join('، ');

export const CAPACITY_NAMES: Record<MemberCapacity, string> = {
  project_manager: 'مدير المشروع',
  dept_manager: 'مدير قسم مشارك',
  item_owner: 'مسؤول بند',
  reviewer: 'مراجع',
  licensing_officer: 'مسؤول الرخص',
  expeditor: 'المعقّب',
  opportunity_owner: 'مسؤول الفرصة',
  member: 'عضو',
};

export const SUSPENSION_TYPES = { client: 'العميل', authority: 'الجهة', payment: 'السداد', internal: 'داخلي' } as const;

export const BLOCK_TYPES = { client: 'العميل', authority: 'الجهة', task: 'مهمة أخرى', payment: 'سداد', other: 'أخرى' } as const;
