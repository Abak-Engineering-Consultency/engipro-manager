import type { DeptCode, VisitType } from './types';

/** The 13 technical departments of the ABAK ERP service catalogue (domain/service-catalogue.ts). */
export const DEPARTMENTS: { code: DeptCode; name: string }[] = [
  { code: 'LIC', name: 'الرخص' },
  { code: 'ARC', name: 'التصميم' },
  { code: 'STR', name: 'الإنشائي' },
  { code: 'SUP', name: 'الإشراف وإدارة المشاريع' },
  { code: 'FLS', name: 'السلامة' },
  { code: 'MEP', name: 'الكهروميكانيك MEP' },
  { code: 'MOD', name: 'مدن' },
  { code: 'SUR', name: 'المساحة' },
  { code: 'PROP', name: 'الفرز العقاري' },
  { code: 'GEO', name: 'الدراسات والاختبارات' },
  { code: 'TRF', name: 'الدراسات المرورية' },
  { code: 'QTY', name: 'حساب الكميات' },
  { code: 'EXP', name: 'منصة خبرة' },
];

export const deptName = (code?: DeptCode) => DEPARTMENTS.find((d) => d.code === code)?.name ?? '—';

export interface ServiceDef {
  code: string;
  title: string;
  dept: DeptCode;
  authority?: string;
  platform?: string;
  procedureType?: string;
  /** Deliverables from the catalogue. `gov` marks the one issued by an authority (needs a transaction). */
  deliverables: { title: string; technical: boolean; gov?: boolean }[];
  requiredDocs?: string[];
}

/** A subset of the 75 catalogue services, with the catalogue's own deliverables and authorities. */
export const SERVICES: ServiceDef[] = [
  {
    code: 'ARC-001', title: 'التصميم المعماري للمبنى', dept: 'ARC',
    deliverables: [
      { title: 'المفهوم والتصور المعماري', technical: true },
      { title: 'المخططات المعمارية: مساقط/واجهات/قطاعات', technical: true },
    ],
  },
  {
    code: 'STR-001', title: 'التصميم الإنشائي والنوتة الحسابية', dept: 'STR',
    deliverables: [
      { title: 'المخططات الإنشائية التنفيذية', technical: true },
      { title: 'النوتة الحسابية الإنشائية', technical: true },
    ],
  },
  {
    code: 'FLS-001', title: 'تصميم مخططات الوقاية والحماية من الحريق', dept: 'FLS',
    deliverables: [
      { title: 'مخططات أنظمة مكافحة الحريق', technical: true },
      { title: 'مخططات ومسارات الإخلاء', technical: true },
    ],
  },
  {
    code: 'MEP-003', title: 'دراسة وحساب الأحمال الكهربائية', dept: 'MEP',
    deliverables: [
      { title: 'جدول الأحمال الكهربائية', technical: true },
      { title: 'تقرير أحمال مختوم', technical: true },
    ],
  },
  {
    code: 'LIC-002', title: 'إصدار رخصة بناء جديدة', dept: 'LIC',
    authority: 'منصة بلدي / الأمانة', platform: 'بلدي', procedureType: 'رخصة بناء جديدة',
    deliverables: [
      { title: 'طلب رخصة بناء مستكمل فنياً', technical: false },
      { title: 'رخصة بناء إلكترونية', technical: false, gov: true },
    ],
    requiredDocs: [
      'صك إلكتروني محدث / وثيقة ملكية نظامية',
      'هوية المالك / السجل التجاري للمالك',
      'تفويض المالك للمكتب الهندسي على منصة بلدي',
      'تقرير/قرار مساحي ساري',
      'تقرير تربة معتمد',
    ],
  },
  {
    code: 'FLS-003', title: 'تقديم ومتابعة اعتماد مخططات السلامة', dept: 'FLS',
    authority: 'الدفاع المدني', platform: 'بوابة سلامة', procedureType: 'اعتماد مخططات السلامة',
    deliverables: [
      { title: 'ملف تقديم مخططات السلامة', technical: false },
      { title: 'قرار اعتماد الدفاع المدني', technical: false, gov: true },
    ],
    requiredDocs: ['مخططات السلامة المعتمدة داخلياً', 'رخصة البناء أو رقم الطلب', 'تفويض المالك'],
  },
  {
    code: 'SUR-004', title: 'إصدار تقرير/قرار مساحي عبر منصة بلدي', dept: 'SUR',
    authority: 'منصة بلدي / الأمانة', platform: 'بلدي', procedureType: 'قرار مساحي',
    deliverables: [
      { title: 'رفع مساحي للموقع', technical: true },
      { title: 'القرار المساحي', technical: false, gov: true },
    ],
    requiredDocs: ['صك الملكية', 'هوية المالك', 'تفويض المالك'],
  },
  {
    code: 'SUP-001', title: 'الإشراف الهندسي على التنفيذ', dept: 'SUP',
    deliverables: [
      { title: 'تقارير إشراف دورية', technical: true },
      { title: 'محاضر استلام الأعمال والمراحل', technical: false },
    ],
  },
  {
    code: 'GEO-001', title: 'دراسة وتقرير التربة', dept: 'GEO',
    deliverables: [{ title: 'تقرير التربة النهائي', technical: true }],
  },
  {
    code: 'MOD-002', title: 'اعتماد المخططات المعمارية والإنشائية لدى مدن', dept: 'MOD',
    authority: 'مدن', platform: 'بوابة مدن', procedureType: 'اعتماد مخططات',
    deliverables: [
      { title: 'ملف تقديم المخططات لمدن', technical: false },
      { title: 'مخططات معتمدة من مدن', technical: false, gov: true },
    ],
    requiredDocs: ['عقد الأرض الصناعية', 'المخططات المعتمدة داخلياً', 'تفويض المنشأة'],
  },
];

export const serviceByCode = (code?: string) => SERVICES.find((s) => s.code === code);

export const VISIT_TYPES: { id: VisitType; name: string; needsReport?: boolean }[] = [
  { id: 'introduction', name: 'تعارف' },
  { id: 'inspection', name: 'معاينة' },
  { id: 'pricing', name: 'معاينة أثناء التسعير' },
  { id: 'project_start', name: 'بدء مشروع' },
  { id: 'supervision', name: 'إشراف', needsReport: true },
  { id: 'handover', name: 'تسليم' },
  { id: 'expeditor', name: 'متابعة لدى جهة (معقّب)' },
];

export const visitTypeName = (t: VisitType) => VISIT_TYPES.find((v) => v.id === t)?.name ?? t;

export const PLAN_TEMPLATES: { id: string; name: string; phases: { name: string; tasks: { name: string; duration: number }[] }[] }[] = [
  {
    id: 'design_permit', name: 'تصميم وترخيص',
    phases: [
      { name: 'التصميم المبدئي', tasks: [{ name: 'جمع البيانات والمعاينة', duration: 3 }, { name: 'المفهوم المعماري', duration: 7 }] },
      { name: 'التصميم التفصيلي', tasks: [{ name: 'المخططات المعمارية', duration: 10 }, { name: 'التصميم الإنشائي', duration: 10 }, { name: 'السلامة والكهروميكانيك', duration: 7 }] },
      { name: 'الترخيص', tasks: [{ name: 'تجهيز ملف الرخصة', duration: 3 }, { name: 'التقديم ومتابعة الجهة', duration: 15 }] },
    ],
  },
  {
    id: 'supervision', name: 'إشراف على التنفيذ',
    phases: [
      { name: 'بدء الإشراف', tasks: [{ name: 'زيارة بدء المشروع', duration: 1 }, { name: 'اعتماد برنامج الزيارات', duration: 2 }] },
      { name: 'الإشراف الدوري', tasks: [{ name: 'زيارات وتقارير إشراف', duration: 60 }] },
      { name: 'الاستلام', tasks: [{ name: 'محاضر الاستلام', duration: 5 }] },
    ],
  },
];
