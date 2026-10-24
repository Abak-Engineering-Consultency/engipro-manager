import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, LayoutGrid, List, Search } from 'lucide-react';
import { useLookup, useStore } from '../app/store';
import { DEPARTMENTS, deptName } from '../domain/catalog';
import { PROJECT_STATES } from '../domain/labels';
import { projectProgress, visibleProjects } from '../domain/selectors';
import type { DeptCode, Project, ProjectState } from '../domain/types';
import { Card, cn, DateText, Empty, Id, Input, Notice, PageHeader, Pill, Progress, Rule, Select, StatePill, Table, Td } from '../components/ui';
import { CREATED_FROM, nextStep, StepBadge } from '../components/projects/shared';

const isLate = (p: Project) => !!p.contractEndDate && !!p.expectedEndDate && Date.parse(p.expectedEndDate) > Date.parse(p.contractEndDate);

export const Projects: React.FC = () => {
  const { state, me } = useStore();
  const { userName, client } = useLookup();
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [status, setStatus] = useState<ProjectState | 'all'>('all');
  const [dept, setDept] = useState<DeptCode | 'all'>('all');
  const [pm, setPm] = useState<string>('all');
  const [q, setQ] = useState('');

  const mine = useMemo(() => visibleProjects(state, me), [state, me]);
  const pms = [...new Set(mine.map((p) => p.pmId).filter((x): x is string => !!x))];
  const counts = useMemo(() => {
    const c: Partial<Record<ProjectState, number>> = {};
    for (const p of mine) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [mine]);

  const rows = mine.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (dept !== 'all' && !p.departments.some((d) => d.deptCode === dept)) return false;
    if (pm !== 'all' && p.pmId !== pm) return false;
    if (q.trim()) {
      const hay = `${p.id} ${p.title} ${client(p.clientId)?.name ?? ''}`;
      if (!hay.includes(q.trim())) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        title="المشاريع"
        subtitle={`${mine.length} مشروع ظاهر لك — الرؤية بالعضوية ونطاق القسم والإدارة (OD-14)`}
        actions={
          <div className="flex rounded-md border border-line bg-card p-0.5">
            <button onClick={() => setView('list')} className={cn('rounded p-1.5', view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-muted')} aria-label="قائمة"><List size={17} /></button>
            <button onClick={() => setView('grid')} className={cn('rounded p-1.5', view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-muted')} aria-label="بطاقات"><LayoutGrid size={17} /></button>
          </div>
        }
      />

      <Notice tone="brand">
        <span className="font-medium">لا يُنشأ المشروع يدويًا.</span> يُنشئه النظام بعد اعتماد المالية لطلب التفعيل أو باستثناء الرئيس التنفيذي، ويُسجَّل المشروع القائم قبل النظام بنموذج مختصر — من شاشة{' '}
        <Link to="/intake" className="font-medium underline">التفعيل والاستلام</Link>. <Rule>PJ-01</Rule> <Rule>F1</Rule>
      </Notice>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <StatusChip active={status === 'all'} onClick={() => setStatus('all')} label="الكل" count={mine.length} />
        {(Object.keys(PROJECT_STATES) as ProjectState[]).filter((s) => counts[s]).map((s) => (
          <StatusChip key={s} active={status === s} onClick={() => setStatus(s)} label={PROJECT_STATES[s].label} count={counts[s] ?? 0} />
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute start-3 top-3 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالرقم أو الاسم أو العميل" className="ps-9" />
        </div>
        <Select value={dept} onChange={(e) => setDept(e.target.value as DeptCode | 'all')}>
          <option value="all">كل الأقسام</option>
          {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
        </Select>
        <Select value={pm} onChange={(e) => setPm(e.target.value)}>
          <option value="all">كل مديري المشاريع</option>
          {pms.map((id) => <option key={id} value={id}>{userName(id)}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectState | 'all')}>
          <option value="all">كل الحالات</option>
          {(Object.keys(PROJECT_STATES) as ProjectState[]).map((s) => <option key={s} value={s}>{PROJECT_STATES[s].label}</option>)}
        </Select>
      </div>

      <div className="mt-4">
        {!rows.length ? (
          <Empty title="لا توجد مشاريع مطابقة" hint="غيّر عوامل التصفية، أو بدّل المستخدم من أعلى الشاشة لرؤية مشاريع دور آخر." />
        ) : view === 'list' ? (
          <Card pad={false}>
            <Table head={['المشروع', 'العميل', 'الأقسام', 'مدير المشروع', 'الحالة', 'الإنجاز', 'الخطوة التالية / العائق', 'تعاقدي / متوقع']}>
              {rows.map((p) => {
                const step = nextStep(state, p);
                const progress = projectProgress(state, p);
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-page" onClick={() => navigate(`/projects/${p.id}`)}>
                    <Td>
                      <Id>{p.id}</Id>
                      <p className="max-w-[260px] truncate font-medium text-ink">{p.title}</p>
                      <p className="text-[11px] text-muted">{CREATED_FROM[p.createdFrom]}</p>
                    </Td>
                    <Td className="max-w-[180px] truncate text-ink-2">{client(p.clientId)?.name}</Td>
                    <Td>
                      <div className="flex max-w-[200px] flex-wrap gap-1">
                        {p.departments.map((d) => <Pill key={d.deptCode} tone={d.status === 'joining' ? 'waiting' : 'brand'}>{deptName(d.deptCode)}</Pill>)}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{userName(p.pmId)}</Td>
                    <Td><StatePill s={PROJECT_STATES[p.status]} /></Td>
                    <Td className="min-w-[110px]">
                      <span className="text-xs tabular text-muted">{progress}%</span>
                      <Progress value={progress} tone={progress === 100 ? 'success' : 'brand'} />
                    </Td>
                    <Td className="max-w-[260px]">
                      <StepBadge tone={step.tone}>{step.text}</StepBadge>
                      {step.who && <p className="mt-0.5 text-[11px] text-muted">{step.who}</p>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      <DateText iso={p.contractEndDate} />
                      <span className={cn('block', isLate(p) && 'font-medium text-st-waiting')}><DateText iso={p.expectedEndDate} /></span>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => {
              const step = nextStep(state, p);
              const progress = projectProgress(state, p);
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg border border-line bg-card p-4 shadow-card transition-shadow hover:shadow-overlay">
                  <div className="flex items-start justify-between gap-2">
                    <Id>{p.id}</Id>
                    <StatePill s={PROJECT_STATES[p.status]} />
                  </div>
                  <h3 className="mt-1 font-semibold text-ink">{p.title}</h3>
                  <p className="text-xs text-muted">{client(p.clientId)?.name} · {userName(p.pmId)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.departments.map((d) => <Pill key={d.deptCode} tone={d.status === 'joining' ? 'waiting' : 'brand'}>{deptName(d.deptCode)}</Pill>)}
                    {p.sites.length > 1 && <Pill tone="muted">{p.sites.length} مواقع</Pill>}
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted"><span>الإنجاز</span><span className="tabular">{progress}%</span></div>
                    <Progress value={progress} tone={progress === 100 ? 'success' : 'brand'} />
                  </div>
                  <div className="mt-3 border-t border-line pt-2 text-xs">
                    <p className="text-muted">الخطوة التالية</p>
                    <p className="text-ink">{step.text}{step.who ? ` — ${step.who}` : ''}</p>
                  </div>
                  <p className={cn('mt-2 flex items-center gap-1 text-xs', isLate(p) ? 'text-st-waiting' : 'text-muted')}>
                    <CalendarClock size={13} /> تعاقدي <DateText iso={p.contractEndDate} /> · متوقع <DateText iso={p.expectedEndDate} />
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

function StatusChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
      active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink-2 hover:border-brand-300')}
    >
      {label}
      <span className={cn('rounded-full px-1.5 tabular', active ? 'bg-white/20' : 'bg-sunken text-muted')}>{count}</span>
    </button>
  );
}
