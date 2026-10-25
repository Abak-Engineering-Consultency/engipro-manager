import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ChevronDown, CircleDashed, GanttChartSquare, MapPin, PauseCircle, PlayCircle, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { dateKey, fmtShort, isAfter, isWorkingDay, weekday } from '../../domain/calendar';
import { deptName, PLAN_TEMPLATES } from '../../domain/catalog';
import { SUSPENSION_TYPES, TASK_STATES } from '../../domain/labels';
import { allows, deptsOf, hasRole } from '../../domain/permissions';
import { schedulePhases } from '../../domain/schedule';
import type { AppState, Phase, PlanTask, Project } from '../../domain/types';
import {
  Button, Card, cn, CommandButton, DateText, Empty, Input, Notice, Pill, Select, StatePill, Timeline, userOptions,
} from '../../components/ui';
import type { TabProps } from './ProjectPage';

const CLOSED = ['operationally_closed', 'cancelled', 'closure_review', 'cancellation_review'];
const DAY = 86_400_000;

export const PlanTab: React.FC<TabProps> = ({ project: p }) => {
  const { me } = useStore();
  const isPm = p.pmId === me.id;
  const canPrepare = allows(me, 'project.prepare', { own: isPm }) && !CLOSED.includes(p.status);
  const canRun = allows(me, 'project.run', { own: isPm });

  if (p.status === 'awaiting_assignment') {
    return <Empty title="التجهيز يبدأ بعد اعتماد مدير المشروع" hint="مدير الأقسام يستلم المشروع، ومدير القسم الرئيسي يرشّح، ومدير الأقسام يعتمد — ثم يجهّز مدير المشروع المواقع والخطة." />;
  }
  return (
    <div className="space-y-6">
      {p.status === 'preparing' && <StartGateCard p={p} canRun={canRun} />}
      {p.startedAt && <ExecutionCard p={p} canRun={canRun} />}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SitesCard p={p} canPrepare={canPrepare} canRun={canRun} />
        <KickoffCard p={p} canPrepare={canPrepare} />
      </div>
      <PlanEditor p={p} canEdit={canPrepare} />
    </div>
  );
};

// ── PJ-09 start gate ───────────────────────────────────────────────────────────

function gateChecks(s: AppState, p: Project) {
  const financeOk = p.activationIds.some((id) => s.activations.find((a) => a.id === id)?.status === 'approved');
  const exc = p.exceptionId ? s.exceptions.find((e) => e.id === p.exceptionId) : undefined;
  const excOk = exc?.status === 'granted' && isAfter(exc.expiresAt, s.now);
  const preOk = p.createdFrom === 'pre_system' && !!p.preSystem?.financeReviewed;
  const unowned = p.scopeItems.filter((i) => !i.ownerId).length;
  const hasPayments = s.payments.some((x) => x.projectId === p.id);
  const mapping = { draft: 'لم يُرسل للمالية', submitted: 'بانتظار تحقق المالية', returned: 'أعادته المالية بملاحظة', confirmed: 'أكدته المالية' }[p.paymentMapping.status];
  return [
    { ok: financeOk || excOk || preOk, label: 'اعتماد مالي أو استثناء ساري', detail: financeOk ? 'معتمد ماليًا' : excOk ? `استثناء الرئيس التنفيذي حتى ${exc?.expiresAt?.slice(0, 10)}` : preOk ? 'روجعت الأرصدة السابقة' : 'لا اعتماد مالي ولا استثناء ساري' },
    { ok: !!p.pmId, label: 'مدير المشروع معتمد', detail: p.pmId ? 'معتمد من مدير الأقسام' : '—' },
    { ok: unowned === 0, label: 'مسؤول لكل بند', detail: unowned ? `${unowned} بند بلا مسؤول` : `${p.scopeItems.length} بند`, tab: 'team' },
    { ok: !hasPayments || p.paymentMapping.status === 'confirmed', label: 'ربط الدفعات بشروطها التعاقدية', detail: hasPayments ? mapping : 'لا جدول دفعات', tab: 'payments' },
    { ok: !p.kickoff.required || p.kickoff.status === 'held', label: 'الاجتماع الافتتاحي', detail: p.kickoff.required ? (p.kickoff.status === 'held' ? 'عُقد' : 'إلزامي بحسب العقد') : 'حسب الحاجة' },
  ];
}

function StartGateCard({ p, canRun }: { p: Project; canRun: boolean }) {
  const { state } = useStore();
  const checks = gateChecks(state, p);
  const met = checks.every((c) => c.ok);
  return (
    <Card
      title="بوابة البدء"
      icon={<ShieldCheck size={18} />}
      subtitle={met ? 'كل الشروط مستوفاة' : `${checks.filter((c) => !c.ok).length} من ${checks.length} شروط غير مستوفاة`}
      actions={canRun && (
        <CommandButton command="project.start" base={{ projectId: p.id }} label="بدء التنفيذ" size="md" variant={met ? 'primary' : 'secondary'} icon={<PlayCircle size={16} />}
          success="بدأ التنفيذ — المخرجات قيد الإعداد، والمعاملات أُنشئت من قوالب الخدمات، والدفعة المقدمة مستحقة" />
      )}
    >
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2.5">
            {c.ok
              ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-st-success" aria-label="مستوفى" />
              : <CircleDashed size={18} className="mt-0.5 shrink-0 text-st-waiting" aria-label="غير مستوفى" />}
            <div className="min-w-0">
              <p className={cn('text-sm font-medium', c.ok ? 'text-ink' : 'text-st-waiting')}>{c.label}</p>
              <p className="text-xs text-muted">
                {c.detail}
                {c.tab && !c.ok && <> · <Link className="font-medium text-brand-700 hover:underline" to={`/projects/${p.id}?tab=${c.tab}`}>اذهب</Link></>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── PJ-12 suspend / resume, SC-01 original vs expected dates ───────────────────

function ExecutionCard({ p, canRun }: { p: Project; canRun: boolean }) {
  const { userName } = useLookup();
  const items = [
    ...p.dateChanges.map((c) => ({ at: c.at, title: <>المتوقع: <DateText iso={c.from} /> ← <DateText iso={c.to} /></>, by: userName(c.by), note: c.reason })),
    ...p.suspensions.map((s) => ({ at: s.since, title: <>تعليق ({SUSPENSION_TYPES[s.type]}) حتى <DateText iso={s.until} /></>, by: userName(s.by), note: s.reason })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <Card
      title="التنفيذ والمواعيد"
      icon={<CalendarClock size={18} />}
      actions={canRun && (
        <>
          {p.status === 'in_progress' && (
            <CommandButton command="project.suspend" base={{ projectId: p.id }} label="تعليق المشروع" variant="secondary" icon={<PauseCircle size={15} />} success="عُلّق المشروع"
              fields={[
                { name: 'type', label: 'نوع السبب', type: 'select', options: Object.entries(SUSPENSION_TYPES).map(([value, label]) => ({ value, label })) },
                { name: 'reason', label: 'السبب', type: 'textarea', required: true },
              ]} />
          )}
          {p.status === 'suspended' && (
            <CommandButton command="project.resume" base={{ projectId: p.id }} label="استئناف" icon={<PlayCircle size={15} />} success="استؤنف المشروع — مدة التعليق أُضيفت للموعد المتوقع" />
          )}
          {p.expectedEndDate && !['operationally_closed', 'cancelled'].includes(p.status) && (
            <CommandButton command="project.change_expected_date" base={{ projectId: p.id }} label="تعديل الموعد المتوقع" variant="secondary" success="عُدّل الموعد المتوقع"
              fields={[
                { name: 'to', label: 'الموعد المتوقع الجديد', type: 'date', required: true, initial: p.expectedEndDate },
                { name: 'reason', label: 'سبب التعديل', type: 'textarea', required: true },
              ]} />
          )}
        </>
      )}
    >
      <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
        <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-4 text-sm">
          <div><dt className="text-xs text-muted">بدء التنفيذ</dt><dd className="mt-0.5 font-medium text-ink"><DateText iso={p.startedAt} /></dd></div>
          <div><dt className="text-xs text-muted">الموعد التعاقدي (الأصلي)</dt><dd className="mt-0.5 font-medium text-ink"><DateText iso={p.contractEndDate} /></dd></div>
          <div><dt className="text-xs text-muted">الموعد المتوقع</dt><dd className={cn('mt-0.5 font-medium text-ink', p.expectedEndDate && p.contractEndDate && Date.parse(p.expectedEndDate) > Date.parse(p.contractEndDate) && 'text-st-waiting')}><DateText iso={p.expectedEndDate} /></dd></div>
          <div><dt className="text-xs text-muted">نوع الأيام</dt><dd className="mt-0.5 font-medium text-ink">{p.dayType === 'working' ? 'أيام عمل' : 'أيام تقويمية'}</dd></div>
        </dl>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-ink">سجل تغييرات المواعيد والتعليق</h4>
          <Timeline items={items} />
        </div>
      </div>
    </Card>
  );
}

// ── Sites and day type ─────────────────────────────────────────────────────────

function SitesCard({ p, canPrepare, canRun }: { p: Project; canPrepare: boolean; canRun: boolean }) {
  const { state, dispatch } = useStore();
  const { client } = useLookup();
  const editableItems = canPrepare && ['preparing', 'in_progress'].includes(p.status);
  return (
    <Card
      title="المواقع ونوع الأيام"
      icon={<MapPin size={18} />}
      actions={canPrepare && (
        <CommandButton command="project.add_site" base={{ projectId: p.id }} label="إضافة موقع" variant="secondary" icon={<Plus size={14} />} success="أُضيف الموقع"
          fields={[{ name: 'name', label: 'اسم الموقع', type: 'text', required: true }, { name: 'city', label: 'المدينة', type: 'text', initial: client(p.clientId)?.city ?? '' }]} />
      )}
    >
      <ul className="divide-y divide-line">
        {p.sites.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{s.name} <span className="text-xs text-muted">· {s.city}</span></p>
              <p className="text-xs text-muted">
                {p.scopeItems.filter((i) => i.siteId === s.id).length} بند · {state.deliverables.filter((d) => d.projectId === p.id && d.siteId === s.id).length} مخرج
                {s.suspended && <span className="text-st-waiting"> · معلّق منذ <DateText iso={s.suspended.since} />: {s.suspended.reason}</span>}
              </p>
            </div>
            {canRun && p.status === 'in_progress' && p.sites.length > 1 && (
              s.suspended
                ? <CommandButton command="project.resume_site" base={{ projectId: p.id, siteId: s.id }} label="استئناف الموقع" variant="ghost" success="استؤنف الموقع" />
                : <CommandButton command="project.suspend_site" base={{ projectId: p.id, siteId: s.id }} label="تعليق الموقع" variant="ghost" success="عُلّق الموقع — بقية المواقع مستمرة"
                    fields={[{ name: 'reason', label: 'السبب (مثلًا: بانتظار العميل)', type: 'textarea', required: true }]} />
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-line pt-4">
        <h4 className="mb-2 text-sm font-semibold text-ink">بنود النطاق والمواقع</h4>
        <ul className="space-y-2">
          {p.scopeItems.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{i.title} <span className="text-[11px] text-muted">· {deptName(i.deptCode)}</span></span>
              {editableItems ? (
                <Select className="h-8 w-44 py-0 text-xs" value={i.siteId ?? ''} onChange={(e) => dispatch('project.set_item_site', { projectId: p.id, scopeItemId: i.id, siteId: e.target.value || undefined })}>
                  <option value="">مشترك</option>
                  {p.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              ) : <span className="text-xs text-ink-2">{p.sites.find((s) => s.id === i.siteId)?.name ?? 'مشترك'}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div>
          <p className="text-xs text-muted">نوع الأيام حسب العقد</p>
          <p className="mt-0.5 text-sm font-medium text-ink">{p.dayType === 'working' ? 'أيام عمل — الأحد إلى الخميس مع الإجازات الرسمية' : 'أيام تقويمية'}</p>
        </div>
        {canPrepare && p.status === 'preparing' && (
          <div className="flex rounded-lg border border-line bg-sunken p-1" role="group" aria-label="نوع الأيام">
            {(['working', 'calendar'] as const).map((t) => (
              <button key={t} aria-pressed={p.dayType === t} onClick={() => dispatch('project.set_day_type', { projectId: p.id, dayType: t }, 'حُدّث نوع الأيام')}
                className={cn('rounded-md px-3 py-1 text-xs font-medium transition-all', p.dayType === t ? 'bg-card text-brand-700 shadow-sm' : 'text-muted hover:text-ink')}>
                {t === 'working' ? 'أيام عمل' : 'تقويمية'}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── PJ-08 kick-off meeting → its actions become tasks ──────────────────────────

function KickoffCard({ p, canPrepare }: { p: Project; canPrepare: boolean }) {
  const { state } = useStore();
  const { userName } = useLookup();
  const memberIds = new Set(p.members.map((m) => m.userId));
  const people = userOptions(state.users, (u) => memberIds.has(u.id));
  const tasks = state.tasks.filter((t) => t.source === 'kickoff' && t.link?.projectId === p.id);
  const row = (i: number) => [
    { name: `a${i}_title`, label: `إجراء ${i} — العنوان`, type: 'text' as const, placeholder: i === 1 ? 'مثال: استلام الرفع المساحي من العميل' : undefined },
    { name: `a${i}_owner`, label: `إجراء ${i} — المسؤول`, type: 'select' as const, options: people },
    { name: `a${i}_days`, label: `إجراء ${i} — المهلة (يوم)`, type: 'number' as const, initial: 3 },
  ];
  return (
    <Card
      title="الاجتماع الافتتاحي"
      icon={<Users size={18} />}
      subtitle={p.kickoff.required ? 'إلزامي بحسب العقد' : 'حسب الحاجة'}
      actions={canPrepare && !['operationally_closed', 'cancelled'].includes(p.status) && (
        <CommandButton
          command="project.hold_kickoff" base={{ projectId: p.id }} label={p.kickoff.status === 'held' ? 'تحديث المحضر' : 'تسجيل الاجتماع'} variant={p.kickoff.status === 'held' ? 'secondary' : 'primary'}
          success="سُجّل المحضر — الإجراءات صارت مهام (بمفتاح منع تكرار)"
          intro="كل إجراء في المحضر يصبح مهمة لصاحبه في «مهامي». إعادة التسجيل لا تكرر المهام."
          fields={[
            { name: 'minutes', label: 'المحضر', type: 'textarea', required: true, initial: p.kickoff.minutes ?? '' },
            { name: 'attendees', label: 'الحضور', type: 'multiselect', options: people, initial: p.kickoff.attendees ?? [] },
            ...row(1), ...row(2), ...row(3),
          ]}
          transform={(v) => ({
            minutes: v.minutes,
            attendees: v.attendees,
            actions: [1, 2, 3].map((i) => ({ title: String(v[`a${i}_title`] ?? '').trim(), ownerId: String(v[`a${i}_owner`] ?? ''), dueDays: Number(v[`a${i}_days`]) || 3 })).filter((a) => a.title),
          })}
        />
      )}
    >
      {p.kickoff.status === 'held' ? (
        <div className="space-y-4 text-sm">
          <p className="text-xs text-muted">عُقد في <DateText iso={p.kickoff.heldAt} time /> · الحضور: {(p.kickoff.attendees ?? []).map((id) => userName(id)).join('، ') || '—'}</p>
          <p className="whitespace-pre-line rounded-lg bg-page px-4 py-3 text-ink-2">{p.kickoff.minutes}</p>
          {tasks.length > 0 && (
            <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">الإجراءات المتولدة</h4>
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link to={`/work?task=${t.id}`} className="truncate text-brand-700 hover:underline">{t.title}</Link>
                  <span className="flex items-center gap-2 text-xs text-muted">{userName(t.ownerId)} <StatePill s={TASK_STATES[t.status]} /></span>
                </li>
              ))}
            </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{p.kickoff.required ? 'لم يُعقد بعد — البدء ممنوع حتى تسجيل المحضر.' : 'لم يُعقد — اختياري لهذا العقد.'}</p>
      )}
    </Card>
  );
}

// ── PJ-06 plan editor (from the prototype's wizard steps 3–4) + Gantt ───────────

const clone = (x: Phase[]): Phase[] => JSON.parse(JSON.stringify(x));
const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

function PlanEditor({ p, canEdit }: { p: Project; canEdit: boolean }) {
  const { state, dispatch } = useStore();
  // Every command clones the whole state, so reset the draft only when the saved plan really changed.
  const saved = JSON.stringify(p.phases);
  const [draft, setDraft] = useState<Phase[]>(() => clone(p.phases));
  useEffect(() => setDraft(JSON.parse(saved) as Phase[]), [saved]);
  const dirty = JSON.stringify(draft) !== saved;
  const scheduled = useMemo(() => schedulePhases(p.startedAt ?? state.now, draft, p.dayType, state.settings), [draft, p.startedAt, p.dayType, state.now, state.settings]);
  const deptCodes = new Set(p.departments.map((d) => d.deptCode));
  const memberIds = new Set(p.members.map((m) => m.userId));
  const owners = state.users.filter((u) => memberIds.has(u.id) || (!u.deactivated && deptsOf(u).some((d) => deptCodes.has(d)) && hasRole(u, 'engineer', 'dept_manager')));
  const allTasks = draft.flatMap((ph) => ph.tasks);
  const sched = new Map(scheduled.flatMap((ph) => ph.tasks).map((t) => [t.id, t]));
  const started = !!p.startedAt;

  const setTask = (phaseId: string, taskId: string, patch: Partial<PlanTask>) =>
    setDraft((d) => d.map((ph) => (ph.id !== phaseId ? ph : { ...ph, tasks: ph.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) })));
  const removeTask = (taskId: string) =>
    setDraft((d) => d.map((ph) => ({ ...ph, tasks: ph.tasks.filter((t) => t.id !== taskId).map((t) => ({ ...t, dependencies: t.dependencies.filter((x) => x !== taskId) })) })));
  const addTask = (phaseId: string) =>
    setDraft((d) => d.map((ph) => (ph.id !== phaseId ? ph : { ...ph, tasks: [...ph.tasks, { id: `${ph.id}-T${uid()}`, name: 'مهمة جديدة', duration: 5, dependencies: ph.tasks.length ? [ph.tasks[ph.tasks.length - 1].id] : [], done: false }] })));
  const addPhase = () => setDraft((d) => [...d, { id: `${p.id}-P${uid()}`, name: `مرحلة ${d.length + 1}`, order: d.length + 1, tasks: [] }]);
  const removePhase = (phaseId: string) => {
    const gone = new Set(draft.find((ph) => ph.id === phaseId)?.tasks.map((t) => t.id));
    setDraft((d) => d.filter((ph) => ph.id !== phaseId).map((ph) => ({ ...ph, tasks: ph.tasks.map((t) => ({ ...t, dependencies: t.dependencies.filter((x) => !gone.has(x)) })) })));
  };

  return (
    <Card
      title="خطة التنفيذ"
      icon={<GanttChartSquare size={18} />}
      subtitle={`المدد ب${p.dayType === 'working' ? 'أيام العمل' : 'الأيام التقويمية'}`}
      actions={canEdit && (
        <>
          <CommandButton command="project.apply_template" base={{ projectId: p.id }} label="من قالب" variant="secondary" success="أُضيفت مراحل القالب"
            fields={[{ name: 'templateId', label: 'القالب', type: 'select', options: PLAN_TEMPLATES.map((t) => ({ value: t.id, label: t.name })) }]}
            intro="تُضاف مراحل القالب ومهامه إلى الخطة (مع اعتماديات متسلسلة). احفظ تعديلاتك قبلها." />
          <CommandButton command="project.plan_from_items" base={{ projectId: p.id }} label="من بنود العرض" variant="secondary" success="أُنشئت الخطة من البنود" />
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addPhase}>مرحلة</Button>
          <Button size="sm" icon={<Save size={14} />} disabled={!dirty} onClick={() => dispatch('project.save_plan', { projectId: p.id, phases: draft }, 'حُفظت الخطة')}>حفظ الخطة</Button>
          {dirty && <Button variant="ghost" size="sm" onClick={() => setDraft(clone(p.phases))}>تراجع</Button>}
        </>
      )}
    >
      {!draft.length ? (
        <Empty title="لا توجد خطة بعد" hint={canEdit ? 'ابدأ من قالب أو من بنود العرض، أو أضف مرحلة يدويًا.' : 'يجهّزها مدير المشروع.'} />
      ) : (
        <div className="space-y-4">
          {dirty && <Notice tone="waiting">تعديلات غير محفوظة — الجدول الزمني أدناه محسوب منها.</Notice>}
          {draft.map((ph) => (
            <div key={ph.id} className="overflow-hidden rounded-lg border border-line">
              <div className="flex flex-wrap items-center gap-3 bg-page px-4 py-2.5">
                {canEdit ? (
                  <Input className="h-8 max-w-xs py-0 font-medium" value={ph.name} onChange={(e) => setDraft((d) => d.map((x) => (x.id === ph.id ? { ...x, name: e.target.value } : x)))} />
                ) : <p className="font-semibold text-ink">{ph.name}</p>}
                {ph.siteId && <Pill tone="brand">{p.sites.find((s) => s.id === ph.siteId)?.name}</Pill>}
                <span className="text-xs text-muted">{ph.tasks.length} مهمة</span>
                {canEdit && (
                  <span className="ms-auto flex gap-1">
                    <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => addTask(ph.id)}>مهمة</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => removePhase(ph.id)} aria-label="حذف المرحلة من المسودة">حذف</Button>
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-line text-xs text-muted">
                      {started && <th className="w-10 px-3 py-2 text-start font-medium">منجز</th>}
                      <th className="px-3 py-2 text-start font-medium">المهمة</th>
                      <th className="px-3 py-2 text-start font-medium">البند</th>
                      <th className="px-3 py-2 text-start font-medium">المسؤول</th>
                      <th className="w-20 px-3 py-2 text-start font-medium">المدة</th>
                      <th className="px-3 py-2 text-start font-medium">تعتمد على</th>
                      <th className="px-3 py-2 text-start font-medium">البداية ← النهاية</th>
                      {canEdit && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ph.tasks.map((t) => {
                      const sc = sched.get(t.id);
                      return (
                        <tr key={t.id} className="border-t border-line">
                          {started && (
                            <td className="px-3 py-2"><input type="checkbox" className="accent-brand-600" disabled={!canEdit} checked={t.done} onChange={(e) => setTask(ph.id, t.id, { done: e.target.checked })} /></td>
                          )}
                          <td className="px-3 py-2">
                            {canEdit ? <Input className="h-8 min-w-[180px] py-0" value={t.name} onChange={(e) => setTask(ph.id, t.id, { name: e.target.value })} /> : <span className={cn(t.done && 'text-muted line-through')}>{t.name}</span>}
                          </td>
                          <td className="px-3 py-2">
                            {canEdit ? (
                              <Select className="h-8 min-w-[150px] py-0 text-xs" value={t.scopeItemId ?? ''} onChange={(e) => setTask(ph.id, t.id, { scopeItemId: e.target.value || undefined })}>
                                <option value="">—</option>
                                {p.scopeItems.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                              </Select>
                            ) : <span className="text-xs text-ink-2">{p.scopeItems.find((i) => i.id === t.scopeItemId)?.title ?? '—'}</span>}
                          </td>
                          <td className="px-3 py-2">
                            {canEdit ? (
                              <Select className="h-8 min-w-[140px] py-0 text-xs" value={t.ownerId ?? ''} onChange={(e) => setTask(ph.id, t.id, { ownerId: e.target.value || undefined })}>
                                <option value="">—</option>
                                {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                              </Select>
                            ) : <span className="text-xs text-ink-2">{state.users.find((u) => u.id === t.ownerId)?.name ?? '—'}</span>}
                          </td>
                          <td className="px-3 py-2">
                            {canEdit ? <Input type="number" min={1} dir="ltr" className="h-8 w-16 py-0" value={t.duration} onChange={(e) => setTask(ph.id, t.id, { duration: Math.max(1, Number(e.target.value) || 1) })} /> : <span className="tabular">{t.duration}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <DepsPicker task={t} all={allTasks} disabled={!canEdit} onChange={(deps) => setTask(ph.id, t.id, { dependencies: deps })} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-2 tabular">{fmtShort(sc?.startDate)} ← {fmtShort(sc?.endDate)}</td>
                          {canEdit && (
                            <td className="px-1 py-1.5">
                              <button onClick={() => removeTask(t.id)} className="rounded p-1 text-faint hover:bg-sunken hover:text-st-danger" aria-label="حذف المهمة"><Trash2 size={14} /></button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {!ph.tasks.length && <tr><td colSpan={8} className="px-3 py-3 text-xs text-muted">لا مهام في هذه المرحلة.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <Gantt phases={scheduled} p={p} />
        </div>
      )}
    </Card>
  );
}

function DepsPicker({ task, all, disabled, onChange }: { task: PlanTask; all: PlanTask[]; disabled: boolean; onChange: (deps: string[]) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const names = task.dependencies.map((d) => all.find((t) => t.id === d)?.name).filter(Boolean);
  // The table scrolls sideways, so the list is placed on the viewport to avoid being clipped.
  const rtl = document.documentElement.dir === 'rtl';
  const place: React.CSSProperties | undefined = anchor
    ? { top: Math.min(anchor.bottom + 4, window.innerHeight - 250), insetInlineStart: rtl ? window.innerWidth - anchor.right : anchor.left }
    : undefined;
  return (
    <div>
      <button type="button" disabled={disabled} onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        className={cn('flex h-8 min-w-[130px] max-w-[200px] items-center justify-between gap-1 rounded-md border border-line px-2 text-xs', disabled ? 'text-ink-2' : 'bg-card hover:border-brand-300')}>
        <span className="truncate">{names.length ? names.join('، ') : 'لا شيء'}</span>
        {!disabled && <ChevronDown size={13} className="shrink-0 text-muted" />}
      </button>
      {anchor && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAnchor(null)} />
          <div className="fixed z-40 max-h-60 w-64 overflow-y-auto rounded-md border border-line bg-card p-2 shadow-overlay" style={place}>
            {all.filter((t) => t.id !== task.id).map((t) => (
              <label key={t.id} className="flex items-center gap-2 py-0.5 text-xs">
                <input type="checkbox" className="accent-brand-600" checked={task.dependencies.includes(t.id)}
                  onChange={(e) => onChange(e.target.checked ? [...task.dependencies, t.id] : task.dependencies.filter((x) => x !== t.id))} />
                <span className="truncate">{t.name}</span>
              </label>
            ))}
            {all.length <= 1 && <p className="text-xs text-muted">لا مهام أخرى.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** A Gantt that shows the calendar the plan is computed in: non-working days and holidays shaded. */
function Gantt({ phases, p }: { phases: Phase[]; p: Project }) {
  const { state } = useStore();
  const tasks = phases.flatMap((ph) => ph.tasks).filter((t) => t.startDate && t.endDate);
  if (!tasks.length) return null;
  const start = Math.min(...tasks.map((t) => Date.parse(t.startDate!)));
  const end = Math.max(...tasks.map((t) => Date.parse(t.endDate!)), p.contractEndDate ? Date.parse(p.contractEndDate) : 0);
  const totalDays = Math.max(1, Math.ceil((end - start) / DAY) + 1);
  const pct = (t: number) => ((t - start) / (totalDays * DAY)) * 100;
  const days = Array.from({ length: totalDays }, (_, i) => new Date(start + i * DAY).toISOString());
  const showDays = totalDays <= 200;
  const now = Date.parse(state.now);
  const holidays = new Set(state.settings.holidays.map((h) => h.date));

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page px-4 py-2.5">
        <p className="text-sm font-semibold text-ink">الجدول الزمني ({p.dayType === 'working' ? 'أيام عمل' : 'أيام تقويمية'}){!p.startedAt && ' — محسوب من اليوم حتى البدء'}</p>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-brand-500" /> مهمة</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-st-success" /> منجزة</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-st-waiting" /> بلا مسؤول</span>
          {showDays && <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-sunken" /> عطلة / إجازة</span>}
          <span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-st-danger" /> اليوم</span>
          {p.contractEndDate && <span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-brand-900" /> الموعد التعاقدي</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="flex border-b border-line text-[10px] text-muted">
            <div className="w-52 shrink-0 px-3 py-1.5">المهمة</div>
            <div className="relative h-7 grow">
              {days.map((d, i) => (weekday(d) === 0 || i === 0) && (
                <span key={d} className="absolute top-1.5 whitespace-nowrap ps-1" style={{ insetInlineStart: `${(i / totalDays) * 100}%` }}>{fmtShort(d)}</span>
              ))}
            </div>
          </div>
          {phases.map((ph) => (
            <React.Fragment key={ph.id}>
              <div className="flex border-b border-line bg-page/60">
                <div className="w-52 shrink-0 truncate px-3 py-1 text-xs font-medium text-ink-2">{ph.name}</div>
                <div className="grow" />
              </div>
              {ph.tasks.filter((t) => t.startDate && t.endDate).map((t) => {
                const s = Date.parse(t.startDate!);
                const e = Date.parse(t.endDate!);
                return (
                  <div key={t.id} className="flex border-b border-line/60">
                    <div className="w-52 shrink-0 truncate px-3 py-1.5 text-xs text-ink" title={t.name}>{t.name}</div>
                    <div className="relative h-8 grow">
                      {showDays && days.map((d, i) => (!isWorkingDay(d, state.settings) || holidays.has(dateKey(d))) && (
                        <span key={d} className="absolute inset-y-0 bg-sunken" style={{ insetInlineStart: `${(i / totalDays) * 100}%`, width: `${100 / totalDays}%` }} />
                      ))}
                      <span
                        title={`${t.name}: ${fmtShort(t.startDate)} ← ${fmtShort(t.endDate)} (${t.duration} ${p.dayType === 'working' ? 'يوم عمل' : 'يوم'})`}
                        className={cn('absolute top-1.5 flex h-5 items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-[10px] text-white',
                          t.done ? 'bg-st-success' : !t.ownerId ? 'bg-st-waiting' : 'bg-brand-500')}
                        style={{ insetInlineStart: `${pct(s)}%`, width: `${Math.max(0.8, pct(e) - pct(s))}%` }}
                      >
                        {t.duration}ي
                      </span>
                      {now >= start && now <= start + totalDays * DAY && <span className="absolute inset-y-0 w-0.5 bg-st-danger" style={{ insetInlineStart: `${pct(now)}%` }} />}
                      {p.contractEndDate && <span className="absolute inset-y-0 w-0.5 bg-brand-900" style={{ insetInlineStart: `${pct(Date.parse(p.contractEndDate))}%` }} />}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
