import React, { useState } from 'react';
import { useStore } from '../app/store';
import { fmtDate, fromInputDate, toInputDate } from '../domain/calendar';
import { allows } from '../domain/permissions';
import type { Settings } from '../domain/types';
import { Button, Card, Field, Input, Notice, PageHeader, Code } from '../components/ui';

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

const NUMBERS: { key: NumKey; label: string; unit: string; source: string }[] = [
  { key: 'clientResponseDays', label: 'مهلة رد العميل على التسليم (عند غياب نص العقد)', unit: 'يوم', source: '6008:1270 · OD-15' },
  { key: 'deliveryFollowUpDays', label: 'دورية متابعة التسليم حتى الرد', unit: 'يوم', source: '6008:1278' },
  { key: 'collectionEscalationDays', label: 'تصعيد التحصيل لمدير المبيعات بعد التأخر', unit: 'يوم', source: '6008:1462 · D10' },
  { key: 'defaultGraceDays', label: 'مهلة السداد الافتراضية (عند غياب شرط العقد)', unit: 'يوم', source: 'A5 · OD-05' },
  { key: 'expeditorUpdateDays', label: 'التحديث الإلزامي للمعقّب', unit: 'يوم', source: '6012:1738' },
  { key: 'ceoExceptionAlertDays', label: 'تنبيه الرئيس التنفيذي أثناء الاستثناء', unit: 'يوم', source: '6007:970' },
  { key: 'taskReminderDays', label: 'التذكير قبل موعد المهمة', unit: 'يوم', source: '6013:1845' },
  { key: 'intakeSlaWorkingDays', label: 'مدة استلام المشروع وتعيين مديره (مقترح)', unit: 'يوم عمل', source: '11-E' },
  { key: 'expiryReminderDays', label: 'التذكير قبل انتهاء الرخصة الصادرة', unit: 'يوم', source: 'GT-11' },
];

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** Company default values. Contract terms take precedence. */
export const SettingsPage: React.FC = () => {
  const { state, me, dispatch } = useStore();
  const canEdit = allows(me, 'admin.settings');
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإعدادات"
        subtitle="القيم الافتراضية للشركة — شروط العقد تتقدم عليها دائمًا"
        actions={canEdit && <Button disabled={!dirty} onClick={() => dispatch('settings.update', { patch: draft }, 'حُفظت الإعدادات')}>حفظ</Button>}
      />
      {!canEdit && <Notice tone="muted">للاطلاع فقط — التعديل لمدير النظام.</Notice>}

      <Card title="المهل والتذكيرات والتصعيد">
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {NUMBERS.map((n) => (
            <Field key={n.key} label={n.label} hint={<span className="flex items-center gap-1">المرجع <Code>{n.source}</Code></span>}>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} dir="ltr" disabled={!canEdit} value={draft[n.key]} onChange={(e) => setDraft({ ...draft, [n.key]: Number(e.target.value) })} className="max-w-28" />
                <span className="text-sm text-muted">{n.unit}</span>
              </div>
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="تقويم العمل" subtitle="أيام العمل التي يُحسب بها «يوم عمل»">
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label key={d} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${draft.workWeek.includes(i) ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-line text-ink-2'}`}>
                <input type="checkbox" className="accent-brand-600" disabled={!canEdit} checked={draft.workWeek.includes(i)}
                  onChange={(e) => setDraft({ ...draft, workWeek: e.target.checked ? [...draft.workWeek, i].sort() : draft.workWeek.filter((x) => x !== i) })} />
                {d}
              </label>
            ))}
          </div>
        </Card>
        <Card title="الإجازات الرسمية">
          {!draft.holidays.length && <p className="mb-4 text-sm text-muted">لا إجازات مسجّلة.</p>}
          <ul className="mb-4 divide-y divide-line">
            {draft.holidays.map((h) => (
              <li key={h.date} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{h.name}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular text-muted">{fmtDate(fromInputDate(h.date))}</span>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, holidays: draft.holidays.filter((x) => x.date !== h.date) })}>إزالة</Button>}
                </span>
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
              <Field label="التاريخ"><Input type="date" dir="ltr" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} /></Field>
              <Field label="الاسم"><Input value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} /></Field>
              <Button variant="secondary" disabled={!holiday.date || !holiday.name.trim()} onClick={() => { setDraft({ ...draft, holidays: [...draft.holidays, { date: toInputDate(fromInputDate(holiday.date)), name: holiday.name.trim() }] }); setHoliday({ date: '', name: '' }); }}>إضافة</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
