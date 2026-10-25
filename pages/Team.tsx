import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Landmark, ListTodo, Search, Users } from 'lucide-react';
import { useStore } from '../app/store';
import { isAfter } from '../domain/calendar';
import { DEPARTMENTS, deptName } from '../domain/catalog';
import { CAPACITY_NAMES, ROLE_NAMES } from '../domain/labels';
import type { DeptCode } from '../domain/types';
import { Card, cn, Empty, Input, Kpi, PageHeader, PersonChip, Select, Table, Tabs, Td } from '../components/ui';

type View = 'people' | 'departments' | 'workload';

/** People, departments and workload — all fed by real assignments in the process records. */
export const Team: React.FC = () => {
  const { state, me } = useStore();
  const [view, setView] = useState<View>('people');
  const [dept, setDept] = useState<DeptCode | 'all'>('all');
  const [q, setQ] = useState('');
  const scopeAll = ['main_dept_manager', 'ceo', 'admin'].includes(me.roleId);
  const weekEnd = Date.parse(state.now) + 7 * 86_400_000;

  const load = useMemo(() => state.users
    .filter((u) => scopeAll || u.deptCode === me.deptCode)
    .map((u) => {
      const tasks = state.tasks.filter((t) => t.ownerId === u.id && !['completed', 'cancelled'].includes(t.status)).length;
      const deliverables = state.deliverables.filter((d) => {
        if (['client_approved', 'excluded', 'not_started'].includes(d.status)) return false;
        const p = state.projects.find((x) => x.id === d.projectId);
        return p?.scopeItems.some((i) => d.scopeItemIds.includes(i.id) && i.ownerId === u.id);
      }).length;
      const visits = state.visits.filter((v) => [v.ownerId, ...v.participants].includes(u.id) && ['proposed', 'confirmed'].includes(v.status) && Date.parse(v.plannedStart) < weekEnd && isAfter(v.plannedEnd, state.now)).length;
      const gov = state.gov.filter((g) => (g.licensingOfficerId === u.id || g.expeditorId === u.id) && !['issued', 'closed_not_issued'].includes(g.status)).length;
      const projects = state.projects.filter((p) => !['operationally_closed', 'cancelled'].includes(p.status) && p.members.some((m) => m.userId === u.id && m.capacity !== 'opportunity_owner'));
      return { u, tasks, deliverables, visits, gov, projects, total: tasks + deliverables + visits + gov };
    }), [state, scopeAll, me.deptCode, weekEnd]);
  const max = Math.max(1, ...load.map((r) => r.total));
  const depts = DEPARTMENTS.filter((d) => load.some((r) => r.u.deptCode === d.code));
  const rows = load
    .filter((r) => dept === 'all' || r.u.deptCode === dept)
    .filter((r) => !q.trim() || `${r.u.name} ${r.u.title}`.includes(q.trim()));
  const sum = (k: 'tasks' | 'visits' | 'gov') => load.reduce((s, r) => s + r[k], 0);
  const openProjects = state.projects.filter((p) => !['operationally_closed', 'cancelled'].includes(p.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفريق والموارد"
        subtitle={<>{scopeAll ? 'كل الأقسام' : deptName(me.deptCode!)} · <span className="font-semibold text-ink">{load.length}</span> موظف</>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="الموظفون" value={load.length} icon={<Users size={20} />} />
        <Kpi label="مهام مفتوحة" value={sum('tasks')} icon={<ListTodo size={20} />} />
        <Kpi label="زيارات خلال 7 أيام" value={sum('visits')} icon={<CalendarRange size={20} />} />
        <Kpi label="معاملات مفتوحة" value={sum('gov')} icon={<Landmark size={20} />} />
      </div>

      <Card pad={false}>
        <div className="px-5">
          <Tabs<View>
            tabs={[{ id: 'people', label: 'الموظفون', count: load.length }, { id: 'departments', label: 'الأقسام', count: depts.length }, { id: 'workload', label: 'عبء العمل' }]}
            value={view}
            onChange={setView}
          />
        </div>

        {view !== 'departments' && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <div className="relative min-w-[220px] grow sm:grow-0">
              <Search size={16} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو المسمى" className="ps-9" aria-label="بحث" />
            </div>
            {scopeAll && (
              <Select value={dept} onChange={(e) => setDept(e.target.value as DeptCode | 'all')} className="!w-auto" aria-label="القسم">
                <option value="all">القسم: الكل</option>
                {depts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </Select>
            )}
            <span className="ms-auto text-sm text-muted">{rows.length} موظف</span>
          </div>
        )}

        {view === 'people' && (
          <Table head={['الموظف', 'القسم', 'الدور', 'المشاريع الجارية', 'عبء العمل']} empty={<Empty title="لا يوجد موظفون مطابقون" />}>
            {rows.map((r) => (
              <tr key={r.u.id} className="hover:bg-page">
                <Td><PersonChip user={r.u} sub={r.u.title} /></Td>
                <Td className="text-sm text-ink-2">{r.u.deptCode ? deptName(r.u.deptCode) : '—'}</Td>
                <Td className="whitespace-nowrap text-sm text-ink-2">{ROLE_NAMES[r.u.roleId]}{r.u.grants.length > 0 && <span className="block text-xs text-muted">+ صلاحية مباشرة</span>}</Td>
                <Td>
                  {r.projects.length ? (
                    <div className="flex max-w-[280px] flex-wrap gap-x-3 gap-y-1">
                      {r.projects.map((p) => (
                        <Link key={p.id} to={`/projects/${p.id}`} className="text-sm text-brand-700 hover:underline" title={`${p.title} — ${p.members.filter((m) => m.userId === r.u.id).map((m) => CAPACITY_NAMES[m.capacity]).join('، ')}`}>
                          <span className="ltr-iso">{p.id.slice(-4)}</span>
                        </Link>
                      ))}
                    </div>
                  ) : <span className="text-xs text-faint">—</span>}
                </Td>
                <Td className="w-48"><LoadBar total={r.total} max={max} /></Td>
              </tr>
            ))}
          </Table>
        )}

        {view === 'departments' && (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {depts.map((d) => {
              const people = load.filter((r) => r.u.deptCode === d.code);
              const manager = people.find((r) => r.u.roleId === 'dept_manager')?.u;
              const projects = openProjects.filter((p) => p.departments.some((x) => x.deptCode === d.code));
              const openDl = state.deliverables.filter((x) => x.deptCode === d.code && !['client_approved', 'excluded'].includes(x.status)).length;
              return (
                <section key={d.code} className="rounded-lg border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-ink">{d.name}</h3>
                    <span className="ltr-iso text-xs text-muted">{d.code}</span>
                  </div>
                  <div className="mt-3">{manager ? <PersonChip user={manager} sub="مدير القسم" /> : <span className="text-sm text-muted">لا مدير مسجّل</span>}</div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-center">
                    <div><dt className="text-xs text-muted">الموظفون</dt><dd className="text-lg font-semibold text-ink tabular">{people.length}</dd></div>
                    <div><dt className="text-xs text-muted">المشاريع</dt><dd className="text-lg font-semibold text-ink tabular">{projects.length}</dd></div>
                    <div><dt className="text-xs text-muted">مخرجات مفتوحة</dt><dd className="text-lg font-semibold text-ink tabular">{openDl}</dd></div>
                  </dl>
                </section>
              );
            })}
            {!depts.length && <Empty title="لا أقسام" />}
          </div>
        )}

        {view === 'workload' && (
          <Table head={['الموظف', 'المخرجات', 'المهام', 'الزيارات (7 أيام)', 'المعاملات', 'الإجمالي']} empty={<Empty title="لا يوجد موظفون مطابقون" />}>
            {[...rows].sort((a, b) => b.total - a.total).map((r) => (
              <tr key={r.u.id} className="hover:bg-page">
                <Td><PersonChip user={r.u} sub={r.u.deptCode ? deptName(r.u.deptCode) : r.u.title} /></Td>
                <Td><Num n={r.deliverables} /></Td>
                <Td><Num n={r.tasks} /></Td>
                <Td><Num n={r.visits} /></Td>
                <Td><Num n={r.gov} /></Td>
                <Td className="w-56"><LoadBar total={r.total} max={max} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};

function LoadBar({ total, max }: { total: number; max: number }) {
  return (
    <div className="flex items-center gap-2" title="المخرجات + المهام + الزيارات + المعاملات">
      <span className="h-2 grow rounded-full bg-sunken"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${(total / max) * 100}%` }} /></span>
      <span className="w-6 text-end text-sm font-medium text-ink tabular">{total}</span>
    </div>
  );
}

const Num = ({ n }: { n: number }) => <span className={cn('text-sm tabular', n ? 'font-medium text-ink' : 'text-faint')}>{n}</span>;
