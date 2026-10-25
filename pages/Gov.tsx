import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../app/store';
import { GOV_STATES } from '../domain/labels';
import { holds } from '../domain/permissions';
import { govTimes, projectAccess } from '../domain/selectors';
import type { GovState } from '../domain/types';
import { Clock, Hourglass, Landmark, UserPlus } from 'lucide-react';
import { GovDrawer, GovTable, visibleGov, weeklyUpdate } from '../components/gov/GovViews';
import { Card, Input, Kpi, PageHeader, Select } from '../components/ui';

type Filter = 'mine' | 'open' | 'all' | GovState;

export const Gov: React.FC = () => {
  const { state, me } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const visible = useMemo(() => visibleGov(state, me, (pid) => {
    const p = state.projects.find((x) => x.id === pid);
    return !!p && !!projectAccess(state, me, p);
  }), [state, me]);
  const mineDefault = visible.some((g) => g.licensingOfficerId === me.id || g.expeditorId === me.id);
  const [filter, setFilter] = useState<Filter>(mineDefault ? 'mine' : 'open');

  const open = visible.filter((g) => !['issued', 'closed_not_issued'].includes(g.status));
  const items = visible.filter((g) => {
    if (filter === 'mine') return g.licensingOfficerId === me.id || g.expeditorId === me.id;
    if (filter === 'open') return !['issued', 'closed_not_issued'].includes(g.status);
    if (filter === 'all') return true;
    return g.status === filter;
  }).filter((g) => !q || [g.id, g.procedureType, g.authority, g.projectId, ...g.rounds.map((r) => r.requestNo)].some((x) => x.includes(q)));

  const atAuthority = open.filter((g) => g.status === 'at_authority');
  const late = atAuthority.filter((g) => weeklyUpdate(state, g).late).length;
  const avgWait = atAuthority.length ? Math.round(atAuthority.reduce((s, g) => s + govTimes(state.now, g).waitingNow, 0) / atAuthority.length) : 0;

  const openId = params.get('id');
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('id', id);
    else next.delete('id');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="المعاملات الحكومية"
        subtitle={<>المفتوحة: <span className="font-semibold text-ink">{open.length}</span>{holds(me, 'gov_transaction.assign') ? ' · أنت مدير المعاملات' : ''}</>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="معاملات مفتوحة" value={open.length} icon={<Landmark size={20} />} />
        <Kpi label="لدى الجهة الآن" value={atAuthority.length} hint={atAuthority.length ? `متوسط الانتظار ${avgWait} يوم` : undefined} icon={<Hourglass size={20} />} />
        <Kpi label="تحديث أسبوعي متأخر" value={late} icon={<Clock size={20} />} tone={late ? 'danger' : undefined} />
        {(() => {
          const unassigned = open.filter((g) => g.status === 'submitted' && !g.expeditorId).length;
          return <Kpi label="بانتظار إسناد معقّب" value={unassigned} icon={<UserPlus size={20} />} tone={unassigned ? 'waiting' : undefined} />;
        })()}
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="!w-auto" aria-label="تصفية">
            <option value="mine">المسندة إليّ</option>
            <option value="open">المفتوحة</option>
            <option value="all">الكل</option>
            {(Object.keys(GOV_STATES) as GovState[]).map((s) => <option key={s} value={s}>{GOV_STATES[s].label}</option>)}
          </Select>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث برقم المعاملة أو الطلب أو الجهة أو المشروع" className="!w-80 max-w-full" aria-label="بحث" />
          <span className="ms-auto text-sm text-muted">{items.length} معاملة</span>
        </div>
        <GovTable items={items} onOpen={setOpen} />
      </Card>
      <GovDrawer govId={openId} onClose={() => setOpen(null)} />
    </div>
  );
};
