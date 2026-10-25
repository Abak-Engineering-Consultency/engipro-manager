import React from 'react';
import { Building2, GitFork, KeyRound, Users } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { deptName } from '../../domain/catalog';
import { CAPACITY_NAMES, roleLabel } from '../../domain/labels';
import { allows, effectiveGrants, hasRole, inDept, PERMISSIONS, SCOPE_NAMES } from '../../domain/permissions';
import { projectAccess } from '../../domain/selectors';
import type { DeptCode } from '../../domain/types';
import { Card, CommandButton, DateText, Notice, PersonChip, Pill, Table, Td, userOptions } from '../../components/ui';
import type { TabProps } from './ProjectPage';

const ORIGIN = { contract: 'العقد', paid_addition: 'إضافة مدفوعة', free_addition: 'إضافة دون مقابل', pre_system: 'قائم قبل النظام' } as const;

export const TeamTab: React.FC<TabProps> = ({ project: p }) => {
  const { state, me } = useStore();
  const { user, userName } = useLookup();
  const canStaffState = ['preparing', 'in_progress', 'suspended'].includes(p.status);
  const depts = [...new Set([...p.departments.map((d) => d.deptCode), ...p.scopeItems.map((i) => i.deptCode)])] as DeptCode[];
  const unowned = p.scopeItems.filter((i) => !i.ownerId).length;
  const myCaps = p.members.filter((m) => m.userId === me.id).map((m) => CAPACITY_NAMES[m.capacity]);
  const access = projectAccess(state, me, p);
  const relevant = effectiveGrants(me).filter((g) => g.perm.startsWith('project.') || g.perm.startsWith('deliverable.') || g.perm.startsWith('gov_transaction.'));

  return (
    <div className="space-y-6">
      <Notice tone={unowned ? 'waiting' : 'success'}>
        {unowned ? `${unowned} بند بلا مسؤول — يلزم تعيينهم قبل بدء التنفيذ. يعيّنهم مدير كل قسم.` : 'كل البنود لها مسؤول.'}
      </Notice>

      {depts.map((code) => {
        const da = p.departments.find((d) => d.deptCode === code);
        const items = p.scopeItems.filter((i) => i.deptCode === code);
        const canAssign = canStaffState && allows(me, 'project.staff', { depts: [code] });
        return (
          <Card key={code}
            icon={<Building2 size={18} />}
            title={<span className="flex flex-wrap items-center gap-2">قسم {deptName(code)} {code === p.leadDept && <Pill tone="brand">القسم الرئيسي</Pill>}
              {da?.status === 'joining' && <Pill tone="waiting">منضم — يعيّن المسؤولين</Pill>}</span>}
            subtitle={da ? `مدير القسم: ${userName(da.managerId)}${da.viaRequestId ? ` · انضم بطلب ${da.viaRequestId}` : ''}` : undefined}
            pad={false}
          >
            <Table head={['البند', 'المصدر', 'الموقع', 'المسار', 'المسؤول', '']}>
              {items.map((i) => (
                <tr key={i.id}>
                  <Td><p className="text-ink">{i.title}</p><p className="ltr-iso text-xs text-muted">{i.id}{i.serviceCode ? ` · ${i.serviceCode}` : ''}</p></Td>
                  <Td><Pill tone={i.origin === 'contract' ? 'muted' : 'brand'}>{ORIGIN[i.origin]}</Pill></Td>
                  <Td className="text-ink-2">{p.sites.find((s) => s.id === i.siteId)?.name ?? 'مشترك'}</Td>
                  <Td className="text-ink-2">{p.tracks.find((t) => t.id === i.trackId)?.name ?? '—'}</Td>
                  <Td>{i.ownerId ? <PersonChip user={user(i.ownerId)} sub={user(i.ownerId)?.title} /> : <Pill tone="waiting">بلا مسؤول</Pill>}</Td>
                  <Td>
                    {canAssign && (
                      <CommandButton command="project.assign_owner" base={{ projectId: p.id, scopeItemId: i.id }} label={i.ownerId ? 'تغيير' : 'تعيين مسؤول'} variant={i.ownerId ? 'ghost' : 'primary'}
                        success="عُيّن مسؤول البند"
                        fields={[{ name: 'ownerId', label: `مسؤول «${i.title}» من قسم ${deptName(code)}`, type: 'select', options: userOptions(state.users, (u) => inDept(u, code) && hasRole(u, 'engineer', 'dept_manager')), initial: i.ownerId }]} />
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        );
      })}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="أعضاء المشروع" icon={<Users size={18} />} subtitle={`${new Set(p.members.map((m) => m.userId)).size} عضو`}>
          <ul className="divide-y divide-line">
            {p.members.map((m, k) => (
              <li key={k} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <PersonChip user={user(m.userId)} sub={user(m.userId)?.title} />
                <span className="flex items-center gap-2">
                  <Pill tone={m.capacity === 'project_manager' ? 'brand' : 'muted'}>{CAPACITY_NAMES[m.capacity]}</Pill>
                  <span className="text-xs text-muted"><DateText iso={m.since} /></span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="صلاحيتك في هذا المشروع" icon={<KeyRound size={18} />}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div><dt className="text-xs text-muted">الدور</dt><dd className="mt-0.5 font-medium text-ink">{roleLabel(me)}</dd></div>
            <div><dt className="text-xs text-muted">صفتك في المشروع</dt><dd className="mt-0.5 font-medium text-ink">{myCaps.length ? myCaps.join('، ') : 'غير عضو'}</dd></div>
            <div><dt className="text-xs text-muted">مستوى الاطلاع</dt><dd className="mt-0.5 font-medium text-ink">{access === 'full' ? 'كامل' : access === 'finance' ? 'المنطقة المالية' : access === 'client' ? 'مستندات العميل والمخرجات الجاهزة' : '—'}</dd></div>
            <div><dt className="text-xs text-muted">صلاحيات مباشرة</dt><dd className="mt-0.5 font-medium text-ink">{me.grants.length ? me.grants.map((g) => PERMISSIONS.find((x) => x.key === g.perm)?.label ?? g.perm).join('، ') : 'لا يوجد'}</dd></div>
          </dl>
          <details className="mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer text-xs font-medium text-brand-700 hover:underline">ما يمكنك فعله ({relevant.length})</summary>
            <p className="mt-2 text-xs text-muted">الصلاحية = الدور + الصلاحيات المباشرة + العضوية + نطاق السجل، ويتحقق النظام منها في كل إجراء.</p>
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs">
              {relevant.map((g, k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="text-ink-2">{PERMISSIONS.find((x) => x.key === g.perm)?.label}</span>
                  <span className="text-muted">{SCOPE_NAMES[g.scope]}</span>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      </div>

      <Card title="مسارات التنفيذ المستقلة" icon={<GitFork size={18} />}>
        {p.tracks.length ? (
          <ul className="divide-y divide-line">
            {p.tracks.map((t) => (
              <li key={t.id} className="py-3 text-sm first:pt-0 last:pb-0">
                <p className="font-medium text-ink">{t.name} <span className="ltr-iso text-xs text-muted">{t.id}</span></p>
                <p className="text-xs text-muted">اعتمده {userName(t.approvedBy)} · <DateText iso={t.at} /> · {t.scopeItemIds.length} بند: {t.scopeItemIds.map((id) => p.scopeItems.find((i) => i.id === id)?.title).join('، ')}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">لا مسارات مستقلة. يطلبها مدير المشروع من تبويب «التغييرات».</p>}
      </Card>
    </div>
  );
};
