import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import { isAfter } from '../domain/calendar';
import { DEPARTMENTS } from '../domain/catalog';
import { CAPACITY_NAMES, ROLE_NAMES } from '../domain/labels';
import type { User } from '../domain/types';
import { Card, Id, PageHeader, PersonChip, Pill } from '../components/ui';

/** Workload fed by real assignments (the prototype's workload view, now from the process records). */
export const Team: React.FC = () => {
  const { state, me } = useStore();
  const scopeAll = ['main_dept_manager', 'ceo', 'admin'].includes(me.roleId);
  const weekEnd = Date.parse(state.now) + 7 * 86_400_000;

  const load = useMemo(() => {
    const rows = state.users.map((u) => {
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
    });
    return rows;
  }, [state]);
  const max = Math.max(1, ...load.map((r) => r.total));
  const depts = DEPARTMENTS.filter((d) => scopeAll || d.code === me.deptCode).filter((d) => state.users.some((u) => u.deptCode === d.code));
  const others = scopeAll ? load.filter((r) => !r.u.deptCode) : [];

  const Row = ({ r }: { r: (typeof load)[number] }) => (
    <li className="grid gap-2 py-2.5 md:grid-cols-[minmax(0,15rem)_1fr_minmax(0,16rem)] md:items-center">
      <PersonChip user={r.u} sub={`${r.u.title} · ${ROLE_NAMES[r.u.roleId]}`} />
      <div className="flex items-center gap-2">
        <span className="h-2.5 grow rounded-full bg-sunken"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${(r.total / max) * 100}%` }} /></span>
        <span className="w-44 text-xs text-muted tabular">{r.deliverables} مخرج · {r.tasks} مهمة · {r.visits} زيارة · {r.gov} معاملة</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {r.projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} title={p.title}>
            <Pill tone="brand"><Id className="text-[11px]">{p.id.slice(-4)}</Id> {p.members.filter((m) => m.userId === r.u.id).map((m) => CAPACITY_NAMES[m.capacity]).join('، ')}</Pill>
          </Link>
        ))}
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="الفريق وعبء العمل" subtitle={scopeAll ? 'كل الأقسام — من التكليفات الفعلية: المخرجات والمهام والزيارات خلال 7 أيام والمعاملات' : 'قسمك — من التكليفات الفعلية'} />
      {depts.map((d) => {
        const rows = load.filter((r) => r.u.deptCode === d.code);
        return (
          <Card key={d.code} title={d.name} subtitle={`${rows.length} موظف`}>
            <ul className="divide-y divide-line">{rows.map((r) => <Row key={r.u.id} r={r} />)}</ul>
          </Card>
        );
      })}
      {others.length > 0 && (
        <Card title="الإدارة والمالية والمبيعات">
          <ul className="divide-y divide-line">{others.map((r: { u: User } & (typeof load)[number]) => <Row key={r.u.id} r={r} />)}</ul>
        </Card>
      )}
    </div>
  );
};
