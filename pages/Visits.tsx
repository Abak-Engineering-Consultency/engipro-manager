import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarRange, ClipboardCheck, FileCheck2 } from 'lucide-react';
import { useLookup, useStore } from '../app/store';
import { addCalendarDays, dateKey, fmtDateTime, weekday } from '../domain/calendar';
import { visitTypeName } from '../domain/catalog';
import { VISIT_BILLING, VISIT_STATES } from '../domain/labels';
import { allows } from '../domain/permissions';
import type { VisitState } from '../domain/types';
import { Card, Empty, Id, Kpi, PageHeader, Select, StatePill, Table, Tabs, Td } from '../components/ui';
import { ScheduleVisitButton, VisitCard, WeekView, isMine } from '../components/visits/VisitParts';
import { VisitDrawer } from '../components/visits/VisitDrawer';
import { RECORD_TYPE_NAMES } from '../components/work/records';

type Scope = 'mine' | 'all';

/** «زياراتي»: what needs me, today, the week, and every visit with its state; mobile-friendly cards. */
export const Visits: React.FC = () => {
  const { state, me } = useStore();
  const { userName } = useLookup();
  const [params, setParams] = useSearchParams();
  const canAll = allows(me, 'project.read');
  const [scope, setScope] = useState<Scope>('mine');
  const [status, setStatus] = useState<VisitState | ''>('');
  const visitId = params.get('id');
  const open = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('id', id);
    setParams(next);
  };
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('id');
    setParams(next, { replace: true });
  };

  const visits = useMemo(
    () => state.visits.filter((v) => (scope === 'all' && canAll) || isMine(v, me.id)),
    [state.visits, scope, canAll, me.id],
  );
  const today = dateKey(state.now);
  const todays = visits.filter((v) => dateKey(v.plannedStart) === today && v.status !== 'cancelled').sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const week = new Set(Array.from({ length: 7 }, (_, i) => dateKey(addCalendarDays(state.now, i - weekday(state.now)))));
  const weekVisits = visits.filter((v) => week.has(dateKey(v.plannedStart)) && v.status !== 'cancelled');
  const myReports = state.visits.filter((v) => v.status === 'report_pending' && v.report?.approverId === me.id);
  const toConfirm = visits.filter((v) => v.ownerId === me.id && v.status === 'proposed');
  const toDocument = visits.filter((v) => v.ownerId === me.id && v.status === 'confirmed' && Date.parse(v.plannedStart) <= Date.parse(state.now));
  const all = visits.filter((v) => !status || v.status === status).sort((a, b) => b.plannedStart.localeCompare(a.plannedStart));

  return (
    <div className="space-y-6">
      <PageHeader
        title="الزيارات"
        subtitle={<>هذا الأسبوع: <span className="font-semibold text-ink">{weekVisits.length}</span> زيارة</>}
        actions={<ScheduleVisitButton onCreated={open} />}
      />

      {canAll && (
        <Tabs<Scope> tabs={[{ id: 'mine', label: 'زياراتي' }, { id: 'all', label: 'كل الزيارات' }]} value={scope} onChange={setScope} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="اليوم" value={todays.length} icon={<CalendarDays size={20} />} />
        <Kpi label="هذا الأسبوع" value={weekVisits.length} icon={<CalendarRange size={20} />} />
        <Kpi label="بانتظار تأكيدي / توثيقي" value={toConfirm.length + toDocument.length} icon={<ClipboardCheck size={20} />} tone={toConfirm.length + toDocument.length ? 'waiting' : undefined} />
        <Kpi label="تقارير بانتظار اعتمادي" value={myReports.length} icon={<FileCheck2 size={20} />} tone={myReports.length ? 'waiting' : undefined} />
      </div>

      {(myReports.length > 0 || toDocument.length > 0) && (
        <Card title="تحتاج إجراءً منك" subtitle={`${myReports.length + toDocument.length} زيارة`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...myReports, ...toDocument].map((v) => <VisitCard key={v.id} visit={v} onOpen={open} />)}
          </div>
        </Card>
      )}

      {todays.length > 0 && (
        <Card title="اليوم" subtitle={`${todays.length} زيارة`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {todays.map((v) => <VisitCard key={v.id} visit={v} onOpen={open} />)}
          </div>
        </Card>
      )}

      <Card title="الأسبوع">
        <WeekView visits={weekVisits} now={state.now} onOpen={open} />
      </Card>

      <Card
        title="كل الزيارات"
        pad={false}
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value as VisitState | '')} className="!w-auto" aria-label="الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(VISIT_STATES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
        }
      >
        <div className="hidden md:block">
          <Table head={['الزيارة', 'النوع', 'مرتبطة بـ', 'الموعد المخطط', 'المسؤول', 'الفوترة', 'الحالة']} empty={<Empty title="لا توجد زيارات" />}>
            {all.map((v) => (
              <tr key={v.id} className="cursor-pointer hover:bg-page" onClick={() => open(v.id)}>
                <Td>
                  <p className="font-medium text-ink">{v.purpose}</p>
                  <Id>{v.id}</Id>
                </Td>
                <Td className="text-sm text-ink-2">{visitTypeName(v.type)}</Td>
                <Td className="max-w-[240px]"><span className="block truncate text-xs text-ink-2" title={v.link?.label}>{v.link ? `${RECORD_TYPE_NAMES[v.link.type]}: ${v.link.label}` : '—'}</span></Td>
                <Td><span className="whitespace-nowrap text-xs tabular">{fmtDateTime(v.plannedStart)}</span></Td>
                <Td className="whitespace-nowrap text-sm text-ink-2">{userName(v.ownerId)}</Td>
                <Td>
                  <span className="whitespace-nowrap text-xs text-muted">{VISIT_BILLING[v.billing]}</span>
                  {v.claimId && <span className="block text-xs text-st-success">طولب بها · <span className="ltr-iso">{v.claimId}</span></span>}
                </Td>
                <Td><StatePill s={VISIT_STATES[v.status]} /></Td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
          {all.map((v) => <VisitCard key={v.id} visit={v} onOpen={open} />)}
          {!all.length && <Empty title="لا توجد زيارات" />}
        </div>
      </Card>

      <VisitDrawer visitId={visitId} onClose={close} />
    </div>
  );
};
