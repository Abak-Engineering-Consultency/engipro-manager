import { CalendarPlus, Clock, LogIn, MapPin, Users } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { addCalendarDays, dateKey, weekday } from '../../domain/calendar';
import { VISIT_TYPES, visitTypeName } from '../../domain/catalog';
import { VISIT_BILLING, VISIT_STATES } from '../../domain/labels';
import { holds } from '../../domain/permissions';
import type { ISO, RecordLink, Visit } from '../../domain/types';
import { Avatar, cn, CommandButton, Id, Pill, Rule, StatePill, userOptions } from '../ui';
import { recordOptions, RECORD_TYPE_NAMES, toRecordLink } from '../work/records';

const timeFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
export const fmtTime = (iso?: ISO) => (iso ? timeFmt.format(new Date(iso)) : '—');

/** `datetime-local` value in Riyadh time. */
export const toLocalInput = (iso: ISO) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 16);

export const visitHours = (v: Visit) => Math.max(1, Math.round((Date.parse(v.plannedEnd) - Date.parse(v.plannedStart)) / 3600_000));

export const isMine = (v: Visit, me: string) => v.ownerId === me || v.participants.includes(me);

export function VisitCard({ visit, onOpen, compact }: { visit: Visit; onOpen: (id: string) => void; compact?: boolean }) {
  const { me } = useStore();
  const { user } = useLookup();
  const owner = visit.ownerId === me.id;
  return (
    <div className="rounded-lg border border-line bg-card p-3 shadow-card">
      <button className="block w-full text-start" onClick={() => onOpen(visit.id)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink tabular"><Clock size={12} className="text-muted" />{fmtTime(visit.plannedStart)} – {fmtTime(visit.plannedEnd)}</span>
          <StatePill s={VISIT_STATES[visit.status]} />
          <Pill tone="brand">{visitTypeName(visit.type)}</Pill>
          {visit.billing === 'billable' && <Pill tone={visit.claimId ? 'success' : 'waiting'}>{visit.claimId ? 'طولب بها' : 'قابلة للفوترة'}</Pill>}
        </div>
        <p className="mt-1.5 text-sm font-medium text-ink">{visit.purpose}</p>
        {!compact && (
          <>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin size={12} />{visit.location}</p>
            {visit.link && <p className="mt-0.5 truncate text-xs text-ink-2">{RECORD_TYPE_NAMES[visit.link.type]}: {visit.link.label}</p>}
          </>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Id>{visit.id}</Id>
          <span className="ms-auto flex gap-0.5">
            {[visit.ownerId, ...visit.participants].map((u) => <Avatar key={u} user={user(u)} size={22} />)}
          </span>
        </div>
      </button>
      {owner && !compact && (visit.status === 'proposed' || (visit.status === 'confirmed' && !visit.actualStart)) && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-2">
          {visit.status === 'proposed' && <CommandButton command="visit.confirm" base={{ visitId: visit.id }} label="تأكيد الموعد" success="تأكدت الزيارة" />}
          {visit.status === 'confirmed' && !visit.actualStart && <CommandButton command="visit.check_in" base={{ visitId: visit.id }} label="تسجيل الوصول" icon={<LogIn size={14} />} success="سُجّل الوصول" />}
          <button className="text-xs text-brand-700 hover:underline" onClick={() => onOpen(visit.id)}>توثيق النتيجة…</button>
        </div>
      )}
    </div>
  );
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dayFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short' });

/** VS-09 — a simple Sunday–Saturday week around the demo date. */
export function WeekView({ visits, now, onOpen }: { visits: Visit[]; now: ISO; onOpen: (id: string) => void }) {
  const start = addCalendarDays(now, -weekday(now));
  const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(start, i));
  const today = dateKey(now);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((d, i) => {
        const key = dateKey(d);
        const items = visits.filter((v) => dateKey(v.plannedStart) === key).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
        return (
          <div key={key} className={cn('min-h-[120px] rounded-lg border p-2', key === today ? 'border-brand-300 bg-brand-50/50' : 'border-line bg-page')}>
            <p className={cn('mb-2 flex items-center justify-between text-xs', key === today ? 'font-semibold text-brand-700' : 'text-muted')}>
              <span>{DAY_NAMES[i]}</span>
              <span className="tabular">{dayFmt.format(new Date(d))}</span>
            </p>
            <div className="space-y-1.5">
              {items.map((v) => (
                <button key={v.id} onClick={() => onOpen(v.id)} className="block w-full rounded border border-line bg-card px-2 py-1.5 text-start hover:border-brand-300">
                  <span className="block text-[11px] text-muted tabular">{fmtTime(v.plannedStart)} · {VISIT_STATES[v.status].label}</span>
                  <span className="block truncate text-xs font-medium text-ink">{v.purpose}</span>
                </button>
              ))}
              {!items.length && <p className="py-2 text-center text-[11px] text-faint">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** VS-01/VS-02 — request, assign and schedule a visit; the engine checks participant conflicts. */
export function ScheduleVisitButton({ presetLink, label = 'جدولة زيارة', variant = 'primary', onCreated }: { presetLink?: RecordLink; label?: string; variant?: 'primary' | 'secondary'; onCreated?: (id: string) => void }) {
  const { state, me } = useStore();
  if (!holds(me, 'visit.manage')) return null;
  const options = recordOptions(state, me, ['project', 'opportunity', 'gov']);
  options[0] = { value: 'none', label: '— دون سجل مرتبط —' };
  const preset = presetLink ? `${presetLink.type}:${presetLink.id}` : 'none';
  if (presetLink && !options.some((o) => o.value === preset)) options.push({ value: preset, label: `${RECORD_TYPE_NAMES[presetLink.type]} — ${presetLink.label}` });
  const tomorrow10 = toLocalInput(addCalendarDays(state.now, 1)).slice(0, 11) + '10:00';
  return (
    <CommandButton
      command="visit.schedule"
      base={{}}
      label={label}
      title="طلب زيارة وجدولتها"
      variant={variant}
      size="md"
      icon={<CalendarPlus size={16} />}
      success="جُدولت الزيارة (مقترحة) وأُبلغ المشاركون"
      intro={<>سجل واحد للزيارة عبر المبيعات والتنفيذ والجهات <Rule>VS-01</Rule>. يُفحص تعارض المسؤول والمشاركين قبل الحفظ <Rule>VS-02</Rule>.</>}
      fields={[
        { name: 'type', label: 'نوع الزيارة', type: 'select', options: VISIT_TYPES.map((t) => ({ value: t.id, label: t.needsReport ? `${t.name} (تقرير إلزامي)` : t.name })), initial: presetLink?.type === 'gov' ? 'expeditor' : presetLink?.type === 'project' ? 'supervision' : 'inspection' },
        { name: 'purpose', label: 'الغرض', type: 'text', required: true },
        { name: 'expectedResult', label: 'النتيجة المطلوبة', type: 'text' },
        { name: 'location', label: 'الموقع', type: 'text', required: true },
        { name: 'contact', label: 'جهة الاتصال', type: 'text' },
        { name: 'record', label: 'مرتبطة بـ', type: 'select', options, initial: preset },
        { name: 'ownerId', label: 'مسؤول الزيارة', type: 'select', options: userOptions(state.users), initial: me.id },
        { name: 'participants', label: 'المشاركون', type: 'multiselect', options: userOptions(state.users) },
        { name: 'plannedStart', label: 'الموعد المخطط', type: 'datetime', initial: tomorrow10, required: true },
        { name: 'durationHours', label: 'المدة (ساعات)', type: 'number', initial: 2 },
        { name: 'billing', label: 'تصنيف الفوترة', type: 'select', options: Object.entries(VISIT_BILLING).map(([value, l]) => ({ value, label: l })), initial: 'included' },
      ]}
      transform={(v) => ({
        type: v.type,
        purpose: v.purpose ?? '',
        expectedResult: v.expectedResult ?? '',
        location: v.location ?? '',
        contact: v.contact ?? '',
        link: toRecordLink(state, v.record),
        ownerId: v.ownerId,
        participants: (v.participants as string[]) ?? [],
        plannedStart: v.plannedStart,
        durationHours: Number(v.durationHours) || 1,
        billing: v.billing,
      })}
      onDone={(id) => onCreated?.(String(id))}
    />
  );
}

export function VisitPeople({ visit }: { visit: Visit }) {
  const { user } = useLookup();
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-2">
      <Users size={12} className="text-muted" />
      {[visit.ownerId, ...visit.participants].map((u) => user(u)?.name).join('، ')}
    </span>
  );
}
