import type { DeptCode, Grant, Perm, RoleId, Scope, User } from './types';

/**
 * 11-C — proposed permission keys, named and scoped like the ERP's domain/permissions.ts.
 * Permission = Role + direct User Grants + Project Membership + Record Scope (X-02, F16).
 * «own» in projects means: a member of this project in the capacity the action needs.
 */
export const PERMISSIONS: { key: Perm; label: string; group: string }[] = [
  { key: 'project.read', label: 'قراءة المشروع ومحتواه غير المالي', group: 'المشروع' },
  { key: 'project.assign_manager', label: 'استلام المشروع واعتماد مدير المشروع', group: 'المشروع' },
  { key: 'project.staff', label: 'ترشيح مدير المشروع وتعيين مسؤولي البنود', group: 'المشروع' },
  { key: 'project.prepare', label: 'تجهيز المشروع: المواقع والخطة وطلب ربط الدفعات', group: 'المشروع' },
  { key: 'project.run', label: 'بدء التنفيذ، تعليق، استئناف', group: 'المشروع' },
  { key: 'project.request_change', label: 'طلب إضافة قسم/إضافة/استبعاد/إغلاق/إلغاء', group: 'المشروع' },
  { key: 'project.approve_change', label: 'اعتماد إضافة قسم/إضافة دون مقابل/استبعاد', group: 'المشروع' },
  { key: 'project.approve_closure', label: 'اعتماد الإغلاق والإلغاء', group: 'المشروع' },
  { key: 'project.review_settlement', label: 'مراجعة مالية للإغلاق والإلغاء', group: 'المالية' },
  { key: 'project.grant_exception', label: 'استثناء البدء قبل الاعتماد المالي', group: 'المشروع' },
  { key: 'project.register_existing', label: 'تسجيل مشروع قائم قبل النظام', group: 'المشروع' },
  { key: 'activation.approve', label: 'قرار المالية على طلب التفعيل (قائم)', group: 'المالية' },
  { key: 'payment.verify_entitlement', label: 'التحقق من ربط الدفعات وإثبات الاستحقاق', group: 'المالية' },
  { key: 'collection.confirm', label: 'إصدار المطالبة وتأكيد التحصيل (قائم)', group: 'المالية' },
  { key: 'deliverable.prepare', label: 'إعداد إصدار مخرج ورفعه للمراجعة', group: 'المخرجات' },
  { key: 'deliverable.review', label: 'المراجعة الداخلية واعتماد القبول الضمني', group: 'المخرجات' },
  { key: 'deliverable.deliver', label: 'الإرسال الموثق للعميل وتسجيل رده', group: 'المخرجات' },
  { key: 'gov_transaction.prepare', label: 'تجهيز المعاملة وتقديمها', group: 'المعاملات الحكومية' },
  { key: 'gov_transaction.assign', label: 'إسناد المتابعة ومراقبة التأخر', group: 'المعاملات الحكومية' },
  { key: 'gov_transaction.follow_up', label: 'متابعة الجهة وتحديث الحالة', group: 'المعاملات الحكومية' },
  { key: 'cost_request.create', label: 'طلب تكلفة', group: 'التكاليف' },
  { key: 'cost_request.approve', label: 'اعتماد طلب تكلفة', group: 'التكاليف' },
  { key: 'cost_request.pay', label: 'صرف وتسجيل المدفوع', group: 'التكاليف' },
  { key: 'task.manage', label: 'إنشاء مهمة وتنفيذ مهامي', group: 'المهام والزيارات' },
  { key: 'visit.manage', label: 'جدولة زيارة وتنفيذها', group: 'المهام والزيارات' },
  { key: 'visit.approve_report', label: 'اعتماد تقرير الإشراف', group: 'المهام والزيارات' },
  { key: 'opportunity.work', label: 'متابعة العميل والتحصيل بعد الفوز (قائم)', group: 'المبيعات' },
  { key: 'admin.settings', label: 'إعدادات النظام', group: 'الإدارة' },
];

const g = (perm: Perm, scope: Scope): Grant => ({ perm, scope });

/** Default grants per existing ERP role. No new roles (OD-01). */
export const ROLE_GRANTS: Record<RoleId, Grant[]> = {
  ceo: [
    g('project.read', 'all'), g('project.approve_closure', 'all'), g('project.grant_exception', 'all'),
    g('task.manage', 'own'), g('visit.manage', 'own'),
  ],
  main_dept_manager: [
    g('project.read', 'all'), g('project.assign_manager', 'all'), g('project.approve_change', 'all'),
    g('project.approve_closure', 'all'), g('cost_request.approve', 'all'), g('project.register_existing', 'all'),
    g('task.manage', 'own'), g('visit.manage', 'own'),
  ],
  dept_manager: [
    g('project.read', 'department'), g('project.staff', 'department'), g('project.approve_closure', 'department'),
    g('deliverable.review', 'department'), g('visit.approve_report', 'department'),
    g('project.prepare', 'own'), g('project.run', 'own'), g('project.request_change', 'own'),
    g('deliverable.deliver', 'own'), g('deliverable.prepare', 'own'), g('cost_request.create', 'own'),
    g('task.manage', 'own'), g('visit.manage', 'own'),
  ],
  engineer: [
    g('project.read', 'own'), g('deliverable.prepare', 'own'), g('project.prepare', 'own'), g('project.run', 'own'),
    g('project.request_change', 'own'), g('deliverable.deliver', 'own'), g('cost_request.create', 'own'),
    g('visit.approve_report', 'own'), g('task.manage', 'own'), g('visit.manage', 'own'),
  ],
  accountant: [
    g('activation.approve', 'all'), g('payment.verify_entitlement', 'all'), g('collection.confirm', 'all'),
    g('cost_request.pay', 'all'), g('project.review_settlement', 'all'), g('task.manage', 'own'),
  ],
  sales_rep: [g('opportunity.work', 'own'), g('project.read', 'own'), g('task.manage', 'own'), g('visit.manage', 'own')],
  sales_manager: [g('opportunity.work', 'all'), g('task.manage', 'own'), g('visit.manage', 'own')],
  admin: [g('admin.settings', 'all'), g('project.read', 'all'), g('task.manage', 'own')],
};

export const SCOPE_NAMES: Record<Scope, string> = { own: 'الخاص (العضوية)', department: 'القسم', all: 'الكل' };

export const rolesOf = (u: User): RoleId[] => [u.roleId, ...(u.extraRoles ?? [])];
export const hasRole = (u: User | undefined, ...roles: RoleId[]) => !!u && rolesOf(u).some((r) => roles.includes(r));
export const deptsOf = (u: User): DeptCode[] => (u.deptCode ? [u.deptCode, ...(u.extraDepts ?? [])] : []);
export const inDept = (u: User | undefined, code: DeptCode | undefined) => !!u && !!code && deptsOf(u).includes(code);
export const isActive = (u: User) => !u.deactivated;

/** Grants of every role the person holds plus their direct grants (OD-01). A deactivated account holds none. */
export const effectiveGrants = (u: User): Grant[] => (u.deactivated ? [] : [...rolesOf(u).flatMap((r) => ROLE_GRANTS[r]), ...u.grants]);

export interface ScopeContext {
  /** Departments the record belongs to (department scope). */
  depts?: (DeptCode | undefined)[];
  /** The person holds the needed capacity on this record (own scope). */
  own?: boolean;
}

/** Does this person hold `perm` with a scope that reaches this record? */
export function allows(u: User | undefined, perm: Perm, ctx: ScopeContext = {}): boolean {
  if (!u) return false;
  return effectiveGrants(u).some((gr) => {
    if (gr.perm !== perm) return false;
    if (gr.scope === 'all') return true;
    if (gr.scope === 'department') return deptsOf(u).some((d) => ctx.depts?.includes(d));
    return !!ctx.own;
  });
}

/** Holds the key at all, whatever the scope — used to show a screen, never to authorize. */
export const holds = (u: User | undefined, perm: Perm) => !!u && effectiveGrants(u).some((gr) => gr.perm === perm);
