import type { ReactNode } from 'react';
import type { Tone } from '../../domain/labels';
import { startGate } from '../../domain/selectors';
import type { AppState, ChainStep, ChangeKind, ChangeRequest, Project } from '../../domain/types';

const TONE_CLS: Record<Tone, string> = {
  new: 'bg-st-new-bg text-st-new',
  progress: 'bg-st-progress-bg text-st-progress',
  waiting: 'bg-st-waiting-bg text-st-waiting',
  success: 'bg-st-success-bg text-st-success',
  danger: 'bg-st-danger-bg text-st-danger',
  muted: 'bg-st-muted-bg text-st-muted',
  brand: 'bg-brand-50 text-brand-700',
};

/** A status tag that wraps: next-step texts can be a list of start-gate reasons. */
export function StepBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium leading-5 ${TONE_CLS[tone]}`}>{children}</span>;
}

/** Names of the closure/cancellation chain steps. */
export const STEP_NAMES: Record<ChainStep['key'], string> = {
  dept_managers: 'مديرو الأقسام (بالتوازي)',
  director: 'مدير الأقسام',
  finance: 'المالية — مراجعة التسوية',
  ceo: 'الرئيس التنفيذي',
};

export const CHANGE_KINDS: Record<ChangeKind, { label: string; rule: string }> = {
  add_department: { label: 'إضافة قسم', rule: 'PJ-11' },
  free_addition: { label: 'إضافة دون مقابل', rule: 'AD-02' },
  paid_addition: { label: 'إضافة بمقابل', rule: 'AD-01' },
  exclusion: { label: 'استبعاد مخرج', rule: 'DL-15' },
  track: { label: 'مسار تنفيذ مستقل', rule: 'PJ-13' },
};

export const CHANGE_STATUS: Record<ChangeRequest['status'], { label: string; tone: Tone }> = {
  pending: { label: 'بانتظار القرار', tone: 'waiting' },
  approved: { label: 'معتمد', tone: 'success' },
  returned: { label: 'معاد بملاحظة', tone: 'waiting' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  with_sales: { label: 'لدى المبيعات', tone: 'progress' },
  linked: { label: 'مرتبط بالمشروع', tone: 'success' },
};

export const CREATED_FROM: Record<Project['createdFrom'], string> = {
  activation: 'آليًا بعد الاعتماد المالي',
  exception: 'آليًا باستثناء الرئيس التنفيذي',
  pre_system: 'مشروع قائم قبل النظام',
};

/** Who holds the project's next step, and what it is — for lists and the overview. */
export function nextStep(s: AppState, p: Project): { text: string; who?: string; tone: Tone } {
  const name = (id?: string) => (id ? s.users.find((u) => u.id === id)?.name : undefined);
  const director = s.users.find((u) => u.roleId === 'main_dept_manager')?.id;
  const leadMgr = s.users.find((u) => u.roleId === 'dept_manager' && u.deptCode === p.leadDept)?.id;
  switch (p.status) {
    case 'awaiting_assignment':
      if (p.preSystem && !p.preSystem.financeReviewed) return { text: 'مراجعة المالية للأرصدة السابقة', who: 'المالية', tone: 'waiting' };
      if (!p.receivedAt) return { text: 'استلام المشروع وتحديد الأقسام', who: name(director), tone: 'waiting' };
      if (p.pmNomination?.status === 'pending') return { text: 'اعتماد مدير المشروع', who: name(director), tone: 'waiting' };
      return { text: p.pmNomination?.status === 'returned' ? 'إعادة ترشيح مدير المشروع' : 'ترشيح مدير المشروع', who: name(leadMgr), tone: 'waiting' };
    case 'preparing': {
      const gate = startGate(s, p);
      return gate.length ? { text: gate.join(' · '), who: name(p.pmId), tone: 'waiting' } : { text: 'بوابة البدء مستوفاة — بدء التنفيذ', who: name(p.pmId), tone: 'success' };
    }
    case 'in_progress': {
      const ds = s.deliverables.filter((d) => d.projectId === p.id);
      const blocked = ds.filter((d) => d.status === 'blocked_pending_payment').length;
      if (blocked) return { text: `${blocked} تسليم ممنوع حتى السداد`, who: 'المالية', tone: 'danger' };
      const open = ds.filter((d) => !['client_approved', 'excluded'].includes(d.status)).length;
      const suspendedSites = p.sites.filter((x) => x.suspended).length;
      return { text: `${open} مخرج مفتوح${suspendedSites ? ` · ${suspendedSites} موقع معلّق` : ''}`, who: name(p.pmId), tone: 'progress' };
    }
    case 'suspended':
      return { text: `معلّق: ${p.suspension?.reason ?? ''}`, who: name(p.pmId), tone: 'waiting' };
    case 'technically_complete':
      return { text: 'طلب الإغلاق', who: name(p.pmId), tone: 'progress' };
    case 'closure_review':
    case 'cancellation_review': {
      const chain = p.status === 'closure_review' ? p.closure : p.cancellation;
      const step = chain?.steps.find((x) => x.status === 'pending');
      if (!step) return { text: '—', tone: 'muted' };
      const waiting = step.approverIds.filter((id) => !step.decisions.some((d) => d.userId === id)).map(name).filter(Boolean);
      return { text: `اعتماد ${STEP_NAMES[step.key]}`, who: waiting.join('، '), tone: 'waiting' };
    }
    case 'operationally_closed':
    case 'cancelled':
      return p.financialState === 'settled'
        ? { text: 'مسوّى ماليًا', tone: 'success' }
        : { text: 'التحصيل والتسوية مستمران', who: 'المالية', tone: 'muted' };
  }
}

export const isLate = (p: Project) => !!p.contractEndDate && !!p.expectedEndDate && Date.parse(p.expectedEndDate) > Date.parse(p.contractEndDate);

/** Why an open project needs a manager's attention now, or null when it is on track. */
export function attentionReason(s: AppState, p: Project): string | null {
  if (['operationally_closed', 'cancelled'].includes(p.status)) return null;
  if (p.status === 'suspended') return 'معلّق';
  if (s.deliverables.some((d) => d.projectId === p.id && d.status === 'blocked_pending_payment')) return 'تسليم ممنوع حتى السداد';
  if (isLate(p)) return 'متأخر عن الموعد التعاقدي';
  if (p.status === 'preparing' && startGate(s, p).length) return 'بوابة البدء غير مستوفاة';
  const exc = p.exceptionId ? s.exceptions.find((e) => e.id === p.exceptionId) : undefined;
  if (exc && ['granted', 'expired'].includes(exc.status)) return 'يعمل باستثناء الرئيس التنفيذي';
  return null;
}
