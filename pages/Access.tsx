import React, { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { CAPACITY_NAMES, ROLE_NAMES } from '../domain/labels';
import { effectiveGrants, PERMISSIONS, ROLE_GRANTS, SCOPE_NAMES } from '../domain/permissions';
import { projectAccess } from '../domain/selectors';
import type { RoleId } from '../domain/types';
import { Card, cn, Id, PageHeader, Pill, PersonChip, Rule, Select } from '../components/ui';

const ROLES: RoleId[] = ['ceo', 'main_dept_manager', 'dept_manager', 'engineer', 'accountant', 'sales_rep', 'sales_manager', 'admin'];
const ACCESS_LABEL = { full: 'كامل (عضو / قسم / إدارة)', finance: 'المنطقة المالية فقط', client: 'مستندات العميل والمخرجات الجاهزة' } as const;

/** 11-C and X-02: permission = role + direct grants + project membership + record scope. */
export const Access: React.FC = () => {
  const { state, me } = useStore();
  const [userId, setUserId] = useState(me.id);
  const user = state.users.find((u) => u.id === userId) ?? me;
  const groups = useMemo(() => [...new Set(PERMISSIONS.map((p) => p.group))], []);
  const direct = state.users.filter((u) => u.grants.length);

  return (
    <div className="space-y-4">
      <PageHeader
        title="الصلاحيات"
        subtitle="الصلاحية = الدور + الصلاحيات المباشرة + عضوية المشروع + نطاق السجل. الأدوار هي أدوار ABAK ERP الثمانية القائمة؛ لا أدوار جديدة (OD-01). المحرّك يفحص الصلاحية في كل أمر، وإخفاء الزر ليس حماية."
      />

      <Card title="مصفوفة الأدوار الافتراضية (مقترحة — 11-C)" subtitle="الخلية تبيّن النطاق: الخاص = عضو المشروع بالصفة المطلوبة · القسم · الكل" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-page text-xs text-muted">
                <th className="sticky start-0 bg-page px-3 py-2 text-start font-medium">الصلاحية</th>
                {ROLES.map((r) => <th key={r} className="whitespace-nowrap px-2 py-2 text-center font-medium">{ROLE_NAMES[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <React.Fragment key={g}>
                  <tr className="bg-sunken/60"><td colSpan={ROLES.length + 1} className="px-3 py-1.5 text-xs font-semibold text-ink-2">{g}</td></tr>
                  {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                    <tr key={p.key} className="border-b border-line">
                      <td className="sticky start-0 bg-card px-3 py-2">
                        <span className="block text-ink">{p.label}</span>
                        <code className="text-[11px] text-muted" dir="ltr">{p.key}</code>
                      </td>
                      {ROLES.map((r) => {
                        const gr = ROLE_GRANTS[r].find((x) => x.perm === p.key);
                        return (
                          <td key={r} className="px-2 py-2 text-center">
                            {gr ? <Pill tone={gr.scope === 'all' ? 'brand' : gr.scope === 'department' ? 'progress' : 'new'}>{SCOPE_NAMES[gr.scope]}</Pill> : <span className="text-faint">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="صلاحيات مباشرة لموظفين قائمين" subtitle="مدير المعاملات الحكومية ومسؤول الرخص والمعقّب — قرار OD-01 (24 أكتوبر 2026)">
          <ul className="divide-y divide-line">
            {direct.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <PersonChip user={u} sub={`${u.title} · الدور: ${ROLE_NAMES[u.roleId]}`} />
                <span className="flex flex-wrap gap-1">
                  {u.grants.map((g) => <Pill key={g.perm} tone="brand"><code dir="ltr">{g.perm}</code> · {SCOPE_NAMES[g.scope]}</Pill>)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">تُمنح من شاشة المستخدمين في ABAK ERP (تتطلب admin.roles)، والقائمة تظهر بالصلاحية لا بمساحة العمل. <Rule>OD-01</Rule></p>
        </Card>

        <Card title="لماذا يرى / لا يرى؟" subtitle="اختر موظفًا لرؤية صلاحياته الفعلية ونوع وصوله لكل مشروع (OD-14 / NX-03)">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="mb-3">
            {state.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.title}</option>)}
          </Select>
          <div className="mb-3 flex flex-wrap gap-1">
            {effectiveGrants(user).map((g, i) => <Pill key={i} tone="muted"><code dir="ltr">{g.perm}</code> · {SCOPE_NAMES[g.scope]}</Pill>)}
          </div>
          <ul className="divide-y divide-line">
            {state.projects.map((p) => {
              const a = projectAccess(state, user, p);
              const caps = p.members.filter((m) => m.userId === user.id).map((m) => CAPACITY_NAMES[m.capacity]);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Id>{p.id}</Id>
                  <span className="min-w-0 grow truncate text-ink">{p.title}</span>
                  {caps.length > 0 && <span className="text-xs text-muted">عضو: {caps.join('، ')}</span>}
                  <Pill tone={a === 'full' ? 'success' : a ? 'waiting' : 'muted'} className={cn(!a && 'opacity-80')}>{a ? ACCESS_LABEL[a] : 'لا وصول'}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
};
