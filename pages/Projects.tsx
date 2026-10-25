import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Inbox, LayoutGrid, List, Search, X } from 'lucide-react';
import { useLookup, useStore } from '../app/store';
import { DEPARTMENTS, deptName } from '../domain/catalog';
import { PROJECT_STATES } from '../domain/labels';
import { hasRole } from '../domain/permissions';
import { projectProgress, visibleProjects } from '../domain/selectors';
import type { DeptCode, ProjectState } from '../domain/types';
import { Card, cn, DateText, Empty, Input, PageHeader, Progress, Select, StatePill, Table, Td } from '../components/ui';
import { attentionReason, isLate, nextStep } from '../components/projects/shared';

export const Projects: React.FC = () => {
  const { state, me } = useStore();
  const { userName, client } = useLookup();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [dept, setDept] = useState<DeptCode | 'all'>('all');
  const [pm, setPm] = useState<string>('all');
  const [q, setQ] = useState('');
  // The status filter lives in the URL so dashboard tiles can open a filtered list.
  const status = (params.get('view') === 'attention' ? 'attention' : (params.get('status') as ProjectState | null) ?? 'all') as ProjectState | 'all' | 'attention';
  const setStatus = (s: ProjectState | 'all' | 'attention') => {
    const next = new URLSearchParams();
    if (s === 'attention') next.set('view', 'attention');
    else if (s !== 'all') next.set('status', s);
    setParams(next, { replace: true });
  };

  const mine = useMemo(() => visibleProjects(state, me), [state, me]);
  const pms = [...new Set(mine.map((p) => p.pmId).filter((x): x is string => !!x))];
  const counts = useMemo(() => {
    const c: Partial<Record<ProjectState, number>> = {};
    for (const p of mine) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [mine]);
  const attentionCount = mine.filter((p) => attentionReason(state, p)).length;

  const rows = mine.filter((p) => {
    if (status === 'attention' ? !attentionReason(state, p) : status !== 'all' && p.status !== status) return false;
    if (dept !== 'all' && !p.departments.some((d) => d.deptCode === dept)) return false;
    if (pm !== 'all' && p.pmId !== pm) return false;
    if (q.trim()) {
      const hay = `${p.id} ${p.title} ${client(p.clientId)?.name ?? ''}`;
      if (!hay.toLowerCase().includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });
  const filtered = dept !== 'all' || pm !== 'all' || !!q.trim();
  const canIntake = hasRole(me, 'accountant', 'ceo', 'main_dept_manager', 'dept_manager', 'sales_rep', 'sales_manager', 'admin');

  return (
    <div className="space-y-6">
      <PageHeader
        title="المشاريع"
        subtitle={<>إجمالي المشاريع: <span className="font-semibold text-ink">{mine.length}</span></>}
        actions={
          <>
            <div className="flex rounded-lg border border-line bg-sunken p-1" role="group" aria-label="طريقة العرض">
              <button onClick={() => setView('list')} aria-pressed={view === 'list'} className={cn('rounded-md p-1.5 transition-all', view === 'list' ? 'bg-card text-brand-600 shadow-sm' : 'text-muted hover:text-ink')} aria-label="قائمة"><List size={18} /></button>
              <button onClick={() => setView('grid')} aria-pressed={view === 'grid'} className={cn('rounded-md p-1.5 transition-all', view === 'grid' ? 'bg-card text-brand-600 shadow-sm' : 'text-muted hover:text-ink')} aria-label="بطاقات"><LayoutGrid size={18} /></button>
            </div>
            {canIntake && (
              <Link to="/intake" title="تُنشأ المشاريع بعد اعتماد المالية لطلب التفعيل" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                <Inbox size={16} /> طلبات التفعيل
              </Link>
            )}
          </>
        }
      />

      <div className="space-y-4 rounded-xl border border-line bg-card p-4 shadow-card">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="الحالة">
          <StatusChip active={status === 'all'} onClick={() => setStatus('all')} label="الكل" count={mine.length} />
          {attentionCount > 0 && <StatusChip active={status === 'attention'} onClick={() => setStatus('attention')} label="تحتاج انتباهًا" count={attentionCount} warn />}
          {(Object.keys(PROJECT_STATES) as ProjectState[]).filter((s) => counts[s]).map((s) => (
            <StatusChip key={s} active={status === s} onClick={() => setStatus(s)} label={PROJECT_STATES[s].label} count={counts[s] ?? 0} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <div className="relative min-w-[240px] grow">
            <Search size={16} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالرقم أو الاسم أو العميل" className="ps-9" aria-label="بحث في المشاريع" />
          </div>
          <Select value={dept} onChange={(e) => setDept(e.target.value as DeptCode | 'all')} className="!w-auto" aria-label="القسم">
            <option value="all">القسم: الكل</option>
            {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </Select>
          <Select value={pm} onChange={(e) => setPm(e.target.value)} className="!w-auto" aria-label="مدير المشروع">
            <option value="all">مدير المشروع: الكل</option>
            {pms.map((id) => <option key={id} value={id}>{userName(id)}</option>)}
          </Select>
          {filtered && (
            <button onClick={() => { setDept('all'); setPm('all'); setQ(''); }} className="inline-flex items-center gap-1 px-2 text-sm font-medium text-st-danger hover:underline">
              <X size={14} /> مسح التصفية
            </button>
          )}
        </div>
      </div>

      {!rows.length ? (
        <Empty title="لا توجد مشاريع مطابقة" hint="غيّر عوامل التصفية أو اختر حالة أخرى." />
      ) : view === 'list' ? (
        <Card pad={false}>
          <Table head={['المشروع', 'الأقسام / المدير', 'الحالة', 'الإنجاز', 'الخطوة التالية', 'الموعد التعاقدي']}>
            {rows.map((p) => {
              const step = nextStep(state, p);
              const why = attentionReason(state, p);
              const progress = projectProgress(state, p);
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-page" onClick={() => navigate(`/projects/${p.id}`)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-page text-sm font-bold text-brand-700">{p.title.trim().slice(0, 1)}</span>
                      <div className="min-w-0">
                        <Link to={`/projects/${p.id}`} className="block max-w-[280px] truncate font-medium text-ink hover:text-brand-700" onClick={(e) => e.stopPropagation()}>{p.title}</Link>
                        <p className="text-xs text-muted"><span className="ltr-iso">{p.id}</span> · {client(p.clientId)?.name}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {p.departments.slice(0, 2).map((d) => <span key={d.deptCode} className="rounded-full border border-line bg-page px-2 py-0.5 text-xs text-ink-2">{deptName(d.deptCode)}</span>)}
                      {p.departments.length > 2 && <span className="text-xs text-muted">+{p.departments.length - 2}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">{userName(p.pmId)}</p>
                  </Td>
                  <Td><StatePill s={PROJECT_STATES[p.status]} /></Td>
                  <Td className="w-36">
                    <Progress value={progress} tone={progress === 100 ? 'success' : 'brand'} />
                    <span className="mt-1 block text-xs tabular text-muted">{progress}%</span>
                  </Td>
                  <Td className="max-w-[260px]">
                    <span className="block text-sm text-ink-2">{step.text}</span>
                    {why && <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-st-waiting"><AlertTriangle size={12} />{why}</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-sm">
                    <DateText iso={p.contractEndDate} />
                    {isLate(p) && <span className="block text-xs text-st-waiting">متوقع <DateText iso={p.expectedEndDate} /></span>}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <div className="border-t border-line bg-page px-4 py-3 text-sm text-muted">عرض <span className="font-medium text-ink">{rows.length}</span> من {mine.length}</div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const step = nextStep(state, p);
            const why = attentionReason(state, p);
            const progress = projectProgress(state, p);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="flex flex-col rounded-xl border border-line bg-card p-5 shadow-card transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{p.title}</h3>
                    <p className="text-xs text-muted"><span className="ltr-iso">{p.id}</span> · {client(p.clientId)?.name}</p>
                  </div>
                  <StatePill s={PROJECT_STATES[p.status]} />
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted"><span>الإنجاز</span><span className="tabular">{progress}%</span></div>
                  <Progress value={progress} tone={progress === 100 ? 'success' : 'brand'} />
                </div>
                <div className="mt-4 grow">
                  <p className="text-xs text-muted">الخطوة التالية</p>
                  <p className="text-sm text-ink">{step.text}</p>
                  {why && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-st-waiting"><AlertTriangle size={12} />{why}</p>}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                  <span>{userName(p.pmId)}</span>
                  <span className="flex items-center gap-1"><CalendarClock size={13} /><DateText iso={p.contractEndDate} /></span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

function StatusChip({ active, onClick, label, count, warn }: { active: boolean; onClick: () => void; label: string; count: number; warn?: boolean }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick} className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
      active ? 'border-brand-600 bg-brand-600 text-white' : warn ? 'border-st-waiting/40 bg-st-waiting-bg text-st-waiting hover:border-st-waiting' : 'border-line bg-card text-ink-2 hover:border-brand-300')}
    >
      {warn && !active && <AlertTriangle size={13} />}
      {label}
      <span className={cn('rounded-full px-1.5 text-xs tabular', active ? 'bg-white/20' : 'bg-sunken text-muted')}>{count}</span>
    </button>
  );
}
