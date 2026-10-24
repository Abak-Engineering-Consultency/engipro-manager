import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLookup, useStore } from '../app/store';
import { addCalendarDays, dateKey, fmtDateTime, weekday } from '../domain/calendar';
import { visitTypeName } from '../domain/catalog';
import { VISIT_BILLING, VISIT_STATES } from '../domain/labels';
import { allows } from '../domain/permissions';
import type { VisitState } from '../domain/types';
import { Card, cn, Empty, Id, Kpi, PageHeader, Pill, Rule, Select, StatePill, Table, Tabs, Td } from '../components/ui';
import { ScheduleVisitButton, VisitCard, WeekView, isMine } from '../components/visits/VisitParts';
import { VisitDrawer } from '../components/visits/VisitDrawer';
import { RECORD_TYPE_NAMES } from '../components/work/records';

type Scope = 'mine' | 'all';

/** VS-09 — «زياراتي»: today, the week, and every visit with its state; mobile-friendly cards. */
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
    <div className="space-y-5">
      <PageHeader
        title="الزيارات"
        subtitle={<>سجل واحد للزيارة عبر المبيعات والتنفيذ والجهات: جدولة وتأكيد وتسجيل وصول وتوثيق وتقرير <Rule>VS-09</Rule> <Rule>D12</Rule></>}
        actions={<ScheduleVisitButton onCreated={open} />}
      />

      {canAll && (
        <div className="-mt-2">
          <Tabs<Scope> tabs={[{ id: 'mine', label: 'زياراتي' }, { id: 'all', label: 'كل الزيارات' }]} value={scope} onChange={setScope} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="اليوم" value={todays.length} />
        <Kpi label="هذا الأسبوع" value={weekVisits.length} />
        <Kpi label="بانتظار تأكيدي / توثيقي" value={toConfirm.length + toDocument.length} tone={toConfirm.length + toDocument.length ? 'waiting' : undefined} />
        <Kpi label="تقارير بانتظار اعتمادي" value={myReports.length} tone={myReports.length ? 'waiting' : undefined} />
      </div>

      {(myReports.length > 0 || toDocument.length > 0) && (
        <Card title="تحتاج إجراءً منك">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...myReports, ...toDocument].map((v) => <VisitCard key={v.id} visit={v} onOpen={open} />)}
          </div>
        </Card>
      )}

      <Card title={`اليوم — ${todays.length} زيارة`} subtitle="قائمة يومية: تأكيد، تسجيل وصول، تنفيذ أو تعذّر، ورفع التقرير">
        {todays.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {todays.map((v) => <VisitCard key={v.id} visit={v} onOpen={open} />)}
          </div>
        ) : (
          <Empty title="لا زيارات اليوم" hint="قدّم تاريخ النموذج من أعلى الشاشة (+يوم) لترى زيارات الغد." />
        )}
      </Card>

      <Card title="الأسبوع" subtitle="عرض أسبوعي بسيط من الأحد إلى السبت — تنبيه التعارض يظهر عند الجدولة (VS-02)">
        <WeekView visits={weekVisits} now={state.now} onOpen={open} />
      </Card>

      <Card
        title="كل الزيارات"
        pad={false}
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value as VisitState | '')} className="!h-8 !w-auto !py-0 text-xs">
            <option value="">كل الحالات</option>
            {Object.entries(VISIT_STATES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
        }
      >
        <div className="hidden md:block">
          <Table head={['الزيارة', 'النوع', 'مرتبطة بـ', 'الموعد المخطط', 'المسؤول', 'الفوترة', 'الحالة']} empty={<Empty title="لا توجد زيارات" />}>
            {all.map((v) => (
              <tr key={v.id} className="cursor-pointer hover:bg-sunken" onClick={() => open(v.id)}>
                <Td>
                  <p className="font-medium text-ink">{v.purpose}</p>
                  <Id>{v.id}</Id>
                </Td>
                <Td>{visitTypeName(v.type)}</Td>
                <Td><span className="text-xs text-ink-2">{v.link ? `${RECORD_TYPE_NAMES[v.link.type]}: ${v.link.label}` : '—'}</span></Td>
                <Td><span className="whitespace-nowrap text-xs tabular">{fmtDateTime(v.plannedStart)}</span></Td>
                <Td><span className="text-xs">{userName(v.ownerId)}</span></Td>
                <Td>
                  <span className={cn('text-xs', v.billing === 'billable' ? 'text-st-waiting' : 'text-muted')}>{VISIT_BILLING[v.billing]}</span>
                  {v.claimId && <Pill tone="success" className="ms-1">{v.claimId}</Pill>}
                </Td>
                <Td><StatePill s={VISIT_STATES[v.status]} /></Td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="grid grid-cols-1 gap-3 p-3 md:hidden">
          {all.map((v) => <VisitCard key={v.id} visit={v} onOpen={open} />)}
          {!all.length && <Empty title="لا توجد زيارات" />}
        </div>
      </Card>

      <VisitDrawer visitId={visitId} onClose={close} />
    </div>
  );
};
