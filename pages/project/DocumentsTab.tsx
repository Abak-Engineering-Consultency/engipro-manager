import React from 'react';
import { CheckCircle2, Circle, FileStack, FileText, Folder, FolderTree, HardDrive, Lock } from 'lucide-react';
import { useStore } from '../../app/store';
import { fmtDateTime } from '../../domain/calendar';
import { DEPARTMENTS } from '../../domain/catalog';
import { revLabel } from '../../domain/engine/delivery';
import type { Project, User } from '../../domain/types';
import { Card, cn, Notice } from '../../components/ui';
import type { TabProps } from './ProjectPage';

interface Node { name: string; files?: string[]; children?: Node[]; visible: boolean; why: string; restricted?: boolean }

/** NX-03: what this person may open, decided by role, capacity and membership. */
function folderAccess(p: Project, u: User, access: TabProps['access']) {
  const caps = p.members.filter((m) => m.userId === u.id).map((m) => m.capacity);
  const isPm = p.pmId === u.id;
  const tech = ['dept_manager', 'item_owner', 'reviewer', 'project_manager'].some((c) => caps.includes(c as never)) || ['main_dept_manager', 'ceo', 'admin'].includes(u.roleId);
  const transactionsOnly = caps.length > 0 && caps.every((c) => ['licensing_officer', 'expeditor'].includes(c));
  return {
    client: access !== 'finance' && !transactionsOnly,
    engineering: (dept?: string) => access === 'full' && !transactionsOnly && (isPm || ['main_dept_manager', 'ceo', 'admin'].includes(u.roleId) || u.deptCode === dept),
    review: access === 'full' && tech,
    issued: !transactionsOnly,
    gov: access === 'full' || caps.includes('licensing_officer') || caps.includes('expeditor'),
    visits: access === 'full' && !transactionsOnly,
    closeout: access === 'full' && !transactionsOnly,
    finance: u.roleId === 'accountant' || u.roleId === 'admin',
  };
}

export const DocumentsTab: React.FC<TabProps> = ({ project, access }) => {
  const { state, me } = useStore();
  const a = folderAccess(project, me, access);
  const ds = state.deliverables.filter((d) => d.projectId === project.id);
  const issued = ds.flatMap((d) => d.revisions.filter((r) => r.issued).map((r) => `${revLabel(r.rev)}/${d.id} — ${r.files[0]?.name ?? ''}`));
  const working = ds.flatMap((d) => d.revisions.filter((r) => !r.issued && r.files.length).map((r) => `${d.id} ${revLabel(r.rev)} — ${r.files.map((f) => f.name).join('، ')}`));
  const gov = state.gov.filter((g) => g.projectId === project.id && (access === 'full' || g.licensingOfficerId === me.id || g.expeditorId === me.id));
  const reports = state.visits.filter((v) => v.link?.projectId === project.id && v.report).map((v) => `${v.id} — ${v.report!.file}`);
  const depts = project.departments.map((d) => d.deptCode);
  const space = project.nextcloud;

  const tree: Node[] = [
    { name: '01_Client_Documents', visible: a.client, why: 'العميل والمبيعات والفريق', files: ['العقد والعرض المقبول (رابط من ERP — لا نسخ)', 'مستندات العميل والتفويضات'] },
    { name: '02_Engineering', visible: access === 'full', why: 'الاختصاصات المشاركة فقط', children: depts.map((d) => ({ name: `${d} — ${DEPARTMENTS.find((x) => x.code === d)?.name ?? ''}`, visible: a.engineering(d), why: 'القسم ومدير المشروع' })) },
    { name: '03_Internal_Review', visible: a.review, why: 'المراجعون ومديرو الأقسام', files: working },
    { name: '04_Issued_Deliverables', visible: a.issued, why: 'الصادر ثابت لا يُستبدل', files: issued },
    { name: '05_Government_Transactions', visible: a.gov, why: 'مسؤول الرخص والمعقّب لمعاملاتهم فقط', children: gov.map((g) => ({ name: `${g.id} — ${g.procedureType}`, visible: true, why: '', files: g.result ? [`${g.result.docNo}.pdf`] : [] })) },
    { name: '06_Visits_Reports', visible: a.visits, why: 'فريق المشروع', files: reports },
    { name: '07_Closeout', visible: a.closeout, why: 'بعد الإغلاق' },
    ...(project.sites.length > 1 ? [{ name: '08_Sites', visible: access === 'full', why: 'المشترك يبقى في المشروع', children: project.sites.map((s) => ({ name: s.name, visible: access === 'full', why: '' })) }] : []),
  ];

  return (
    <div className="space-y-6">
      <Notice tone="progress">هيكل مساحة المشروع في Nextcloud وصلاحياتها. الملفات تُحفظ في Nextcloud، والبيانات والاعتمادات في النظام.</Notice>

      <Card title="مساحة المشروع" icon={<HardDrive size={18} />} subtitle={space.status === 'open' ? 'مفتوحة' : 'لم تُفتح بعد — تُفتح بعد ضبط الصلاحيات'}>
        <ol className="grid gap-x-4 gap-y-3 sm:grid-cols-5">
          {[
            ['اعتماد التفعيل', project.activationIds.length > 0 || !!project.exceptionId || project.createdFrom === 'pre_system'],
            ['إنشاء / ربط بمعرف ثابت', space.status !== 'not_created'],
            ['تعيين مدير المشروع', !!project.pmId],
            ['تحديد العضوية', project.members.length > 1],
            ['ضبط الصلاحيات ثم الفتح', space.status === 'open'],
          ].map(([label, done], i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {done ? <CheckCircle2 size={18} className="shrink-0 text-st-success" aria-label="تم" /> : <Circle size={18} className="shrink-0 text-faint" aria-label="لم يتم" />}
              <span className={done ? 'text-ink' : 'text-muted'}>{label as string}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          المسار: <span className="ltr-iso">{space.path ?? `ABAK Projects/${project.id}`}</span> · المعرف: <span className="ltr-iso">{space.folderId ?? '—'}</span> · آخر مزامنة: {fmtDateTime(space.lastSyncAt)}
        </p>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_22rem]">
        <Card title={<span className="ltr-iso">ABAK Projects / {project.id}</span>} icon={<FolderTree size={18} />} subtitle="يظهر لك ما تسمح به صلاحيتك فقط">
          <ul className="space-y-1 text-sm">
            {tree.map((n) => <FolderRow key={n.name} node={n} depth={0} />)}
            <li className="mt-2 border-t border-line pt-2">
              <FolderRow node={{ name: 'FINANCE / RESTRICTED', visible: a.finance, why: 'مالية فقط — لا يرث صلاحيات فريق المشروع', restricted: true, files: state.payments.filter((p) => p.projectId === project.id && p.invoiceRef).map((p) => `${p.invoiceRef} — ${p.label}`) }} depth={0} />
            </li>
          </ul>
        </Card>
        <Card title="دورة المستند" icon={<FileStack size={18} />}>
          <ol className="space-y-3 text-sm">
            {[
              ['Working / Draft', 'ملف عمل قابل للتعديل'],
              ['Under Review', 'مدير القسم أو المراجع المفوّض يقرر'],
              ['Approved Internally', 'مربوط بمعرّف الملف وبصمته ونسخته'],
              ['Issued Rev 00/01…', 'نسخة ثابتة: من أرسلها ومتى ولمن'],
              ['Client Comments', 'إصدار جديد؛ لا يُستبدل ملف صادر'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 tabular">{i + 1}</span>
                <div className="min-w-0">
                  <p className="ltr-iso font-medium text-ink">{t}</p>
                  <p className="text-xs text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
};

function FolderRow({ node, depth }: { node: Node; depth: number }) {
  return (
    <>
      <div className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', node.visible && 'hover:bg-page')} style={{ paddingInlineStart: 8 + depth * 18 }}>
        {node.visible ? <Folder size={16} className={node.restricted ? 'text-st-danger' : 'text-brand-500'} /> : <Lock size={15} className="text-faint" />}
        <span className={cn('ltr-iso', node.visible ? 'font-medium text-ink' : 'text-faint')}>{node.name}</span>
        {!node.visible && <span className="text-xs text-faint">لا وصول</span>}
        {node.why && node.visible && <span className="truncate text-xs text-muted">· {node.why}</span>}
      </div>
      {node.visible && node.files?.map((f) => (
        <div key={f} className="flex items-center gap-2 px-2 py-0.5 text-xs text-ink-2" style={{ paddingInlineStart: 26 + depth * 18 }}>
          <FileText size={13} className="shrink-0 text-faint" /> <span className="truncate">{f}</span>
        </div>
      ))}
      {node.visible && node.children?.map((c) => <FolderRow key={c.name} node={c} depth={depth + 1} />)}
    </>
  );
}
