import React, { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { CAPACITY_NAMES, ROLE_NAMES } from '../domain/labels';
import { effectiveGrants, PERMISSIONS, ROLE_GRANTS, SCOPE_NAMES } from '../domain/permissions';
import { projectAccess } from '../domain/selectors';
import type { RoleId } from '../domain/types';
import { Card, cn, Id, PageHeader, Pill, PersonChip, Select, Table, Tabs, Td } from '../components/ui';

const ROLES: RoleId[] = ['ceo', 'main_dept_manager', 'dept_manager', 'engineer', 'accountant', 'sales_rep', 'sales_manager', 'admin'];
const ACCESS_LABEL = { full: 'كامل', finance: 'المالية فقط', client: 'مستندات العميل' } as const;
type View = 'matrix' | 'direct' | 'check';

/** One hue, darker for wider scope: own → department → all. */
const SCOPE_CLS = {
  own: 'border border-brand-200 text-brand-700',
  department: 'bg-brand-100 text-brand-800',
  all: 'bg-brand-600 text-white',
} as const;

function ScopeTag({ scope, short }: { scope: keyof typeof SCOPE_CLS; short?: boolean }) {
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', SCOPE_CLS[scope])}>{short && scope === 'own' ? 'الخاص' : SCOPE_NAMES[scope]}</span>;
}

/** Permission = role + direct grants + project membership + record scope. */
export const Access: React.FC = () => {
  const { state, me } = useStore();
  const [view, setView] = useState<View>('matrix');
  const [userId, setUserId] = useState(me.id);
  const user = state.users.find((u) => u.id === userId) ?? me;
  const groups = useMemo(() => [...new Set(PERMISSIONS.map((p) => p.group))], []);
  const direct = state.users.filter((u) => u.grants.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الأدوار والصلاحيات"
        subtitle="الصلاحية = الدور + الصلاحيات المباشرة + عضوية المشروع ونطاق السجل"
      />

      <Card pad={false}>
        <div className="px-5">
          <Tabs<View>
            tabs={[{ id: 'matrix', label: 'مصفوفة الأدوار' }, { id: 'direct', label: 'الصلاحيات المباشرة', count: direct.length }, { id: 'check', label: 'فحص وصول موظف' }]}
            value={view}
            onChange={setView}
          />
        </div>

        {view === 'matrix' && (
          <>
            <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3 text-xs text-muted">
              <span>النطاق:</span>
              <span className="flex items-center gap-1.5"><ScopeTag scope="own" short /> عضو المشروع بالصفة المطلوبة</span>
              <span className="flex items-center gap-1.5"><ScopeTag scope="department" /> سجلات قسمه</span>
              <span className="flex items-center gap-1.5"><ScopeTag scope="all" /> كل السجلات</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-page text-xs text-muted">
                    <th className="sticky start-0 bg-page px-4 py-3 text-start font-medium">الصلاحية</th>
                    {ROLES.map((r) => <th key={r} className="whitespace-nowrap px-2 py-3 text-center font-medium">{ROLE_NAMES[r]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <React.Fragment key={g}>
                      <tr className="border-b border-line bg-page"><td colSpan={ROLES.length + 1} className="px-4 py-2 text-xs font-semibold text-ink-2">{g}</td></tr>
                      {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                        <tr key={p.key} className="border-b border-line hover:bg-page">
                          <td className="sticky start-0 bg-card px-4 py-2.5">
                            <span className="block text-ink">{p.label}</span>
                            <code className="text-[11px] text-faint" dir="ltr">{p.key}</code>
                          </td>
                          {ROLES.map((r) => {
                            const gr = ROLE_GRANTS[r].find((x) => x.perm === p.key);
                            return (
                              <td key={r} className="px-2 py-2.5 text-center">
                                {gr ? <ScopeTag scope={gr.scope} short /> : <span className="text-faint">—</span>}
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
          </>
        )}

        {view === 'direct' && (
          <Table head={['الموظف', 'الدور', 'الصلاحيات المباشرة']}>
            {direct.map((u) => (
              <tr key={u.id} className="hover:bg-page">
                <Td><PersonChip user={u} sub={u.title} /></Td>
                <Td className="whitespace-nowrap text-sm text-ink-2">{ROLE_NAMES[u.roleId]}</Td>
                <Td>
                  <ul className="space-y-1">
                    {u.grants.map((g) => (
                      <li key={g.perm} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-ink">{PERMISSIONS.find((p) => p.key === g.perm)?.label ?? g.perm}</span>
                        <ScopeTag scope={g.scope} />
                      </li>
                    ))}
                  </ul>
                </Td>
              </tr>
            ))}
          </Table>
        )}

        {view === 'check' && (
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-2">الموظف</span>
                <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                  {state.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.title}</option>)}
                </Select>
              </label>
              <div>
                <p className="mb-2 text-xs text-muted">صلاحياته الفعلية ({effectiveGrants(user).length})</p>
                <ul className="space-y-1.5">
                  {effectiveGrants(user).map((g, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-ink-2">{PERMISSIONS.find((p) => p.key === g.perm)?.label ?? g.perm}</span>
                      <ScopeTag scope={g.scope} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="rounded-lg border border-line">
              <p className="border-b border-line bg-page px-4 py-3 text-xs font-medium text-muted">وصوله إلى كل مشروع</p>
              <ul className="divide-y divide-line">
                {state.projects.map((p) => {
                  const a = projectAccess(state, user, p);
                  const caps = p.members.filter((m) => m.userId === user.id).map((m) => CAPACITY_NAMES[m.capacity]);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 grow">
                        <span className="block truncate text-ink">{p.title}</span>
                        <span className="text-xs text-muted"><Id>{p.id}</Id>{caps.length > 0 && <> · عضو: {caps.join('، ')}</>}</span>
                      </span>
                      {a ? <Pill tone={a === 'full' ? 'success' : 'waiting'}>{ACCESS_LABEL[a]}</Pill> : <span className="text-xs text-faint">لا وصول</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
