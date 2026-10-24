import React from 'react';
import { KeyRound } from 'lucide-react';
import { useLookup, useStore } from '../../app/store';
import { deptName } from '../../domain/catalog';
import { CAPACITY_NAMES, ROLE_NAMES } from '../../domain/labels';
import { allows, effectiveGrants, PERMISSIONS, SCOPE_NAMES } from '../../domain/permissions';
import { projectAccess } from '../../domain/selectors';
import type { DeptCode } from '../../domain/types';
import { Card, CommandButton, DateText, Empty, Notice, PersonChip, Pill, Rule, Table, Td, userOptions } from '../../components/ui';
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
    <div className="space-y-4">
      <Notice tone={unowned ? 'waiting' : 'success'}>
        {unowned ? `${unowned} بند بلا مسؤول — شرط في بوابة البدء.` : 'كل البنود لها مسؤول.'} مدير كل قسم يعيّن مسؤولي بنود قسمه، ويستطيع ذلك أثناء التجهيز والتنفيذ. <Rule>PJ-05</Rule> <Rule>PJ-09</Rule>
      </Notice>

      {depts.map((code) => {
        const da = p.departments.find((d) => d.deptCode === code);
        const items = p.scopeItems.filter((i) => i.deptCode === code);
        const canAssign = canStaffState && allows(me, 'project.staff', { depts: [code] });
        return (
          <Card key={code}
            title={<span className="flex flex-wrap items-center gap-2">قسم {deptName(code)} {code === p.leadDept && <Pill tone="brand">القسم الرئيسي</Pill>}
              {da && <Pill tone={da.status === 'active' ? 'success' : 'waiting'}>{da.status === 'active' ? 'نشط' : 'منضم — يعيّن المسؤولين'}</Pill>}</span>}
            subtitle={da ? `مدير القسم: ${userName(da.managerId)} · منذ ${da.joinedAt.slice(0, 10)}${da.viaRequestId ? ` · بطلب ${da.viaRequestId}` : ''}` : undefined}
            pad={false}
          >
            <Table head={['البند', 'المصدر', 'الموقع', 'المسار', 'المسؤول', '']}>
              {items.map((i) => (
                <tr key={i.id}>
                  <Td><p className="text-ink">{i.title}</p><p className="ltr-iso text-[11px] text-muted">{i.id}{i.serviceCode ? ` · ${i.serviceCode}` : ''}</p></Td>
                  <Td><Pill tone={i.origin === 'contract' ? 'muted' : 'brand'}>{ORIGIN[i.origin]}</Pill></Td>
                  <Td className="text-ink-2">{p.sites.find((s) => s.id === i.siteId)?.name ?? 'مشترك'}</Td>
                  <Td className="text-ink-2">{p.tracks.find((t) => t.id === i.trackId)?.name ?? '—'}</Td>
                  <Td>{i.ownerId ? <PersonChip user={user(i.ownerId)} sub={user(i.ownerId)?.title} /> : <Pill tone="waiting">بلا مسؤول</Pill>}</Td>
                  <Td>
                    {canAssign && (
                      <CommandButton command="project.assign_owner" base={{ projectId: p.id, scopeItemId: i.id }} label={i.ownerId ? 'تغيير' : 'تعيين مسؤول'} variant={i.ownerId ? 'ghost' : 'primary'}
                        success="عُيّن مسؤول البند"
                        fields={[{ name: 'ownerId', label: `مسؤول «${i.title}» من قسم ${deptName(code)}`, type: 'select', options: userOptions(state.users, (u) => u.deptCode === code && ['engineer', 'dept_manager'].includes(u.roleId)), initial: i.ownerId }]} />
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        );
      })}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="أعضاء المشروع" subtitle="العضوية تحدد نطاق «الخاص» في الصلاحيات ومن يصل لمساحة الملفات">
          <ul className="divide-y divide-line">
            {p.members.map((m, k) => (
              <li key={k} className="flex items-center justify-between gap-2 py-2">
                <PersonChip user={user(m.userId)} sub={`${ROLE_NAMES[user(m.userId)?.roleId ?? 'engineer']}${m.deptCode ? ` · ${deptName(m.deptCode)}` : ''}`} />
                <span className="flex items-center gap-2">
                  <Pill tone={m.capacity === 'project_manager' ? 'brand' : 'muted'}>{CAPACITY_NAMES[m.capacity]}</Pill>
                  <span className="text-[11px] text-muted"><DateText iso={m.since} /></span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><KeyRound size={16} className="text-brand-600" /> كيف تُحسب صلاحيتك هنا <Rule>X-02</Rule> <Rule>F16</Rule></span>}>
          <p className="text-sm text-ink-2">الصلاحية = <b>الدور</b> + <b>الصلاحيات المباشرة</b> + <b>العضوية في المشروع</b> + <b>نطاق السجل</b> (الخاص / القسم / الكل). يتحقق المحرك منها في كل أمر؛ إخفاء الزر ليس حماية.</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-xs text-muted">الدور</dt><dd>{ROLE_NAMES[me.roleId]}</dd></div>
            <div><dt className="text-xs text-muted">صلاحيات مباشرة</dt><dd>{me.grants.length ? me.grants.map((g) => g.perm).join('، ') : 'لا يوجد'}</dd></div>
            <div><dt className="text-xs text-muted">صفتك في المشروع</dt><dd>{myCaps.length ? myCaps.join('، ') : 'غير عضو'}</dd></div>
            <div><dt className="text-xs text-muted">مستوى الاطلاع</dt><dd>{access === 'full' ? 'كامل' : access === 'finance' ? 'المنطقة المالية' : access === 'client' ? 'مستندات العميل والمخرجات الجاهزة' : '—'}</dd></div>
          </dl>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-line pt-2 text-xs">
            {relevant.map((g, k) => (
              <li key={k} className="flex items-center justify-between gap-2">
                <span className="text-ink-2">{PERMISSIONS.find((x) => x.key === g.perm)?.label}</span>
                <span className="ltr-iso text-muted">{g.perm} · {SCOPE_NAMES[g.scope]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={<span className="flex items-center gap-2">مسارات التنفيذ المستقلة <Rule>PJ-13</Rule></span>} subtitle="تحت نفس العقد: البنود تُنقل ولا تُنسخ، والقيمة والدفعات في جدول العقد الواحد">
        {p.tracks.length ? (
          <ul className="space-y-2">
            {p.tracks.map((t) => (
              <li key={t.id} className="rounded-md border border-line px-3 py-2 text-sm">
                <p className="font-medium text-ink">{t.name} <span className="ltr-iso text-[11px] text-muted">{t.id}</span></p>
                <p className="text-xs text-muted">اعتمده {userName(t.approvedBy)} · <DateText iso={t.at} /> · {t.scopeItemIds.length} بند: {t.scopeItemIds.map((id) => p.scopeItems.find((i) => i.id === id)?.title).join('، ')}</p>
              </li>
            ))}
          </ul>
        ) : <Empty title="لا مسارات مستقلة" hint="يطلبها مدير المشروع من تبويب الإضافات والتغييرات." />}
      </Card>
    </div>
  );
};
