import { Link } from 'react-router-dom';
import { Ban, CalendarClock, CheckCircle2, ClipboardCheck, ListPlus, LogIn, MapPinOff, Receipt, Upload } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { fmtDateTime } from '../../domain/calendar';
import { visitTypeName } from '../../domain/catalog';
import { VISIT_BILLING, VISIT_STATES } from '../../domain/labels';
import type { Visit } from '../../domain/types';
import { CommandButton, Drawer, Fact, Id, Notice, PersonChip, Pill, StatePill, Timeline, userOptions, type FieldSpec } from '../ui';
import { recordHref, RECORD_TYPE_NAMES } from '../work/records';
import { toLocalInput, visitHours } from './VisitParts';

/** What a visit's result must record depends on its type. */
function completeFields(v: Visit): FieldSpec[] {
  const summary: FieldSpec = { name: 'summary', label: 'ملخص النتيجة', type: 'textarea', required: true };
  switch (v.type) {
    case 'supervision':
      return [summary, { name: 'notes', label: 'الملاحظات', type: 'textarea' }, { name: 'photos', label: 'عدد الصور', type: 'number', initial: 0 }, { name: 'reportFile', label: 'ملف تقرير الإشراف (إلزامي)', type: 'text', required: true, placeholder: 'SUP-REP-04.pdf' }];
    case 'introduction':
    case 'pricing':
      return [summary, { name: 'nextStep', label: 'الخطوة التالية (تُسجل في سجل التواصل)', type: 'text', required: true }];
    case 'expeditor':
      return [summary, { name: 'notes', label: 'حالة المنصة', type: 'text' }, { name: 'documents', label: 'المستندات المستلمة/المقدمة', type: 'text' }, { name: 'nextRequirement', label: 'المتطلب التالي', type: 'text' }];
    case 'inspection':
      return [summary, { name: 'notes', label: 'الملاحظات', type: 'textarea' }, { name: 'photos', label: 'عدد الصور', type: 'number', initial: 0 }];
    default:
      return [summary, { name: 'notes', label: 'الملاحظات', type: 'textarea' }, { name: 'documents', label: 'المستندات', type: 'text' }];
  }
}

export function VisitDrawer({ visitId, onClose }: { visitId?: string | null; onClose: () => void }) {
  const { state, me } = useStore();
  const { user, userName } = useLookup();
  if (!visitId) return null;
  const v = state.visits.find((x) => x.id === visitId);
  if (!v) {
    return (
      <Drawer open onClose={onClose} title={<span>زيارة غير موجودة</span>}>
        <p className="text-sm text-muted">لم يُعثر على {visitId}.</p>
      </Drawer>
    );
  }
  const proj = v.link?.projectId ? state.projects.find((p) => p.id === v.link!.projectId) : undefined;
  const isOwner = v.ownerId === me.id;
  const canCancel = ['proposed', 'confirmed'].includes(v.status) && [v.ownerId, v.createdBy].includes(me.id);
  const base = { visitId: v.id };
  const href = recordHref(v.link);
  const done = ['executed', 'report_pending', 'report_approved', 'inaccessible'].includes(v.status);

  const actions = (
    <>
      {isOwner && v.status === 'proposed' && <CommandButton command="visit.confirm" base={base} label="تأكيد الموعد مع العميل/الجهة" icon={<CheckCircle2 size={14} />} success="تأكدت الزيارة" fields={[{ name: 'note', label: 'ملاحظة التأكيد', type: 'text' }]} />}
      {isOwner && v.status === 'confirmed' && !v.actualStart && <CommandButton command="visit.check_in" base={base} label="تسجيل الوصول" icon={<LogIn size={14} />} success="سُجّل الوصول" />}
      {isOwner && v.status === 'confirmed' && (
        <CommandButton
          command="visit.complete" base={base} label="توثيق التنفيذ والنتيجة" icon={<ClipboardCheck size={14} />}
          success={v.type === 'supervision' ? 'نُفّذت — التقرير بانتظار الاعتماد' : 'وُثقت نتيجة الزيارة'}
          intro={v.type === 'supervision' ? <>تقرير الإشراف إلزامي، ويبقى بانتظار اعتماد مدير المشروع.</> : undefined}
          fields={completeFields(v)}
        />
      )}
      {isOwner && v.status === 'confirmed' && (
        <CommandButton
          command="visit.inaccessible" base={base} label="متعذرة" variant="secondary" icon={<MapPinOff size={14} />} success="سُجّلت الزيارة متعذرة — ليست مكتملة"
          intro={<>لا تُعد الزيارة مكتملة.</>}
          fields={[{ name: 'reason', label: 'سبب التعذر', type: 'textarea', required: true }, { name: 'proof', label: 'إثبات الحضور', type: 'text', required: true, placeholder: 'صورة + موقع جغرافي' }]}
        />
      )}
      {isOwner && ['proposed', 'confirmed'].includes(v.status) && (
        <CommandButton
          command="visit.reschedule" base={base} label="إعادة جدولة" variant="secondary" icon={<CalendarClock size={14} />} success="أعيدت الجدولة — محفوظة في تاريخ نفس الزيارة"
          intro={<>يُحفظ التغيير في تاريخ هذه الزيارة نفسها.</>}
          fields={[
            { name: 'plannedStart', label: 'الموعد الجديد', type: 'datetime', initial: toLocalInput(v.plannedStart), required: true },
            { name: 'durationHours', label: 'المدة (ساعات)', type: 'number', initial: visitHours(v) },
            { name: 'reason', label: 'السبب', type: 'textarea', required: true },
          ]}
        />
      )}
      {canCancel && <CommandButton command="visit.cancel" base={base} label="إلغاء" variant="secondary" icon={<Ban size={14} />} success="أُلغيت الزيارة" fields={[{ name: 'reason', label: 'سبب الإلغاء', type: 'textarea', required: true }]} />}
      {v.status === 'report_pending' && v.report?.approverId === me.id && (
        <CommandButton
          command="visit.decide_report" base={base} label="اعتماد تقرير الإشراف" icon={<ClipboardCheck size={14} />} success="سُجّل قرار التقرير"
          fields={[
            { name: 'decision', label: 'القرار', type: 'select', options: [{ value: 'approved', label: 'اعتماد التقرير' }, { value: 'returned', label: 'إعادة بملاحظة' }] },
            { name: 'note', label: 'ملاحظة', type: 'textarea' },
          ]}
        />
      )}
      {isOwner && v.type === 'supervision' && v.status === 'executed' && v.report?.decision === 'returned' && (
        <CommandButton command="visit.resubmit_report" base={base} label="رفع التقرير المعدّل" icon={<Upload size={14} />} success="أُعيد رفع التقرير" fields={[{ name: 'reportFile', label: 'ملف التقرير', type: 'text', required: true }]} />
      )}
      {(isOwner || proj?.pmId === me.id) && !v.claimId && v.status !== 'cancelled' && (
        <CommandButton
          command="visit.set_billing" base={base} label="تصنيف الفوترة" variant="secondary" icon={<Receipt size={14} />} success="حُدّث تصنيف الفوترة"
          intro={<>الزيارة القابلة للفوترة تصل للمالية لإصدار مطالبة.</>}
          fields={[{ name: 'billing', label: 'التصنيف', type: 'select', options: Object.entries(VISIT_BILLING).map(([value, label]) => ({ value, label })), initial: v.billing }]}
        />
      )}
      {isOwner && done && (
        <CommandButton
          command="visit.follow_up_task" base={base} label="متابعة بعد الزيارة" variant="secondary" icon={<ListPlus size={14} />} success="أُنشئت مهمة المتابعة"
          fields={[
            { name: 'title', label: 'المتابعة المطلوبة', type: 'text', required: true },
            { name: 'ownerId', label: 'المسؤول', type: 'select', options: userOptions(state.users), initial: me.id },
            { name: 'dueDays', label: 'خلال (أيام)', type: 'number', initial: 3 },
          ]}
        />
      )}
    </>
  );

  const followTasks = state.tasks.filter((t) => t.dedupeKey?.startsWith(`visit:${v.id}:`));
  const claim = v.claimId ? state.visitClaims.find((c) => c.id === v.claimId) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{v.purpose}</h2>
            <StatePill s={VISIT_STATES[v.status]} />
            {v.billing === 'billable' && <Pill tone="waiting">{VISIT_BILLING[v.billing]}</Pill>}
          </div>
          <p className="mt-0.5 text-sm text-muted">{visitTypeName(v.type)} · <Id>{v.id}</Id></p>
        </div>
      }
      actions={actions}
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="النتيجة المطلوبة">{v.expectedResult || '—'}</Fact>
          <Fact label="الموقع">{v.location}</Fact>
          <Fact label="جهة الاتصال">{v.contact || '—'}</Fact>
          <Fact label="مرتبطة بـ">
            {v.link ? (
              <span className="text-sm">
                <span className="text-xs text-muted">{RECORD_TYPE_NAMES[v.link.type]}: </span>
                {href ? <Link to={href} onClick={onClose} className="text-brand-700 hover:underline">{v.link.label}</Link> : v.link.label}
              </span>
            ) : '—'}
          </Fact>
          <Fact label="مسؤول الزيارة"><PersonChip user={user(v.ownerId)} sub={user(v.ownerId)?.title} /></Fact>
          <Fact label="المشاركون">{v.participants.length ? v.participants.map((p) => userName(p)).join('، ') : '—'}</Fact>
          <Fact label="الوقت المخطط">{fmtDateTime(v.plannedStart)} – {fmtDateTime(v.plannedEnd)}</Fact>
          <Fact label="الوقت الفعلي">{v.actualStart ? `${fmtDateTime(v.actualStart)} – ${v.actualEnd ? fmtDateTime(v.actualEnd) : '…'}` : '—'}</Fact>
        </dl>

        {v.result && (
          <Notice tone="success" title="نتيجة الزيارة">
            <p>{v.result.summary}</p>
            {v.result.nextStep && <p className="mt-1 text-xs">الخطوة التالية: {v.result.nextStep}</p>}
            {v.result.notes && <p className="mt-1 text-xs">ملاحظات: {v.result.notes}</p>}
            {!!v.result.photos && <p className="mt-1 text-xs">الصور: {v.result.photos}</p>}
            {v.result.documents && <p className="mt-1 text-xs">المستندات: {v.result.documents}</p>}
            {v.result.nextRequirement && <p className="mt-1 text-xs">المتطلب التالي: {v.result.nextRequirement}</p>}
          </Notice>
        )}
        {v.report && (
          <Notice tone={v.report.decision === 'approved' ? 'success' : v.report.decision === 'returned' ? 'danger' : 'waiting'} title="تقرير الإشراف">
            <p>الملف: <span className="ltr-iso">{v.report.file}</span> · رُفع {fmtDateTime(v.report.submittedAt)}</p>
            <p className="text-xs">المعتمد: {userName(v.report.approverId)}</p>
            {v.report.decision && <p className="text-xs">القرار: {v.report.decision === 'approved' ? 'معتمد' : 'معاد'}{v.report.note ? ` — ${v.report.note}` : ''}</p>}
          </Notice>
        )}
        {v.inaccessible && (
          <Notice tone="danger" title="زيارة متعذرة — ليست مكتملة">
            {v.inaccessible.reason} · إثبات الحضور: {v.inaccessible.proof}
          </Notice>
        )}
        {v.cancelReason && <Notice tone="muted" title="أُلغيت">{v.cancelReason}</Notice>}
        {claim && (
          <Notice tone="progress" title={`مطالبة المالية ${claim.id}`}>
            المرجع {claim.ref} · تغطي {claim.visitIds.join('، ')}
          </Notice>
        )}

        {followTasks.length > 0 && (
          <section>
            <h4 className="mb-3 text-sm font-semibold text-ink">مهام المتابعة</h4>
            <ul className="space-y-1 text-sm">
              {followTasks.map((t) => (
                <li key={t.id}><Link className="text-brand-700 hover:underline" to={`/work?task=${t.id}`} onClick={onClose}>{t.id}</Link> — {t.title} ({userName(t.ownerId)})</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="mb-3 text-sm font-semibold text-ink">تاريخ الزيارة</h4>
          <Timeline items={[...v.history].reverse().map((h) => ({ at: h.at, title: h.change, by: userName(h.by), note: h.note }))} />
        </section>
      </div>
    </Drawer>
  );
}
