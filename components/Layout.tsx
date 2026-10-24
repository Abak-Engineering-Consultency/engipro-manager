import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarClock, CheckCircle2, ChevronDown, FolderKanban, Inbox, Info, Landmark, LayoutDashboard, ListChecks, MapPin,
  Menu, RotateCcw, Settings, ShieldCheck, Users, Wallet, Workflow, X, XCircle,
} from 'lucide-react';
import { useStore } from '../app/store';
import { derivedActions } from '../domain/derived';
import { fmtDateTime, fmtLong } from '../domain/calendar';
import { ROLE_NAMES } from '../domain/labels';
import { holds } from '../domain/permissions';
import type { RoleId, User } from '../domain/types';
import { Avatar, Button, cn, Modal } from './ui';

interface NavItem { to: string; label: string; icon: React.ReactNode; show: (u: User) => boolean; badge?: number; group?: 'main' | 'admin' }

export const Logo = ({ height = 36 }: { height?: number }) => (
  <img src="/abak-logo.png" alt="أباك للاستشارات الهندسية" style={{ height, width: 'auto' }} className="block select-none object-contain" draggable={false} />
);

export const Layout: React.FC = () => {
  const { state, me } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const actions = useMemo(() => derivedActions(state, me), [state, me]);
  const myOpenTasks = state.tasks.filter((t) => !['completed', 'cancelled'].includes(t.status) && (t.ownerId === me.id || (t.reviewerId === me.id && t.status === 'in_review'))).length;

  const nav: NavItem[] = [
    { to: '/dashboard', label: 'لوحة المتابعة', icon: <LayoutDashboard size={19} />, show: () => true },
    { to: '/work', label: 'إجراءاتي ومهامي', icon: <ListChecks size={19} />, show: () => true, badge: actions.length + myOpenTasks },
    { to: '/projects', label: 'المشاريع', icon: <FolderKanban size={19} />, show: () => true },
    { to: '/intake', label: 'التفعيل والاستلام', icon: <Inbox size={19} />, show: (u) => ['accountant', 'ceo', 'main_dept_manager', 'dept_manager', 'sales_rep', 'sales_manager', 'admin'].includes(u.roleId) },
    { to: '/gov', label: 'المعاملات الحكومية', icon: <Landmark size={19} />, show: (u) => holds(u, 'gov_transaction.prepare') || holds(u, 'gov_transaction.assign') || holds(u, 'gov_transaction.follow_up') || ['main_dept_manager', 'ceo', 'dept_manager', 'engineer', 'sales_rep', 'admin'].includes(u.roleId) },
    { to: '/visits', label: 'الزيارات', icon: <MapPin size={19} />, show: (u) => holds(u, 'visit.manage') },
    { to: '/finance', label: 'المالية', icon: <Wallet size={19} />, show: (u) => ['accountant', 'ceo'].includes(u.roleId) },
    { to: '/team', label: 'الفريق وعبء العمل', icon: <Users size={19} />, show: (u) => ['main_dept_manager', 'dept_manager', 'ceo', 'admin'].includes(u.roleId) },
    { to: '/process', label: 'مسار العمل (الفلوتشارت)', icon: <Workflow size={19} />, show: () => true, group: 'admin' },
    { to: '/access', label: 'الصلاحيات', icon: <ShieldCheck size={19} />, show: () => true, group: 'admin' },
    { to: '/settings', label: 'الإعدادات', icon: <Settings size={19} />, show: () => true, group: 'admin' },
  ];
  const items = nav.filter((n) => n.show(me));

  const sidebar = (
    <nav className="flex grow flex-col gap-0.5 overflow-y-auto p-2">
      {items.map((n, i) => (
        <React.Fragment key={n.to}>
          {n.group === 'admin' && items[i - 1]?.group !== 'admin' && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="px-3 pb-1 text-[11px] font-medium text-muted">المرجع والإعدادات</p>
            </div>
          )}
          <NavLink
            to={n.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
              isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-brand-600" />}
                <span className={isActive ? '' : 'text-muted'}>{n.icon}</span>
                <span className="grow truncate">{n.label}</span>
                {!!n.badge && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white tabular">{n.badge}</span>}
              </>
            )}
          </NavLink>
        </React.Fragment>
      ))}
    </nav>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-page">
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-3 lg:px-4">
        <button className="rounded-md p-2 text-ink-2 hover:bg-sunken lg:hidden" onClick={() => setMobileOpen(true)} aria-label="القائمة">
          <Menu size={20} />
        </button>
        <div className="hidden sm:block lg:hidden">
          <Logo height={30} />
        </div>
        <span className="hidden items-center gap-2 rounded-md border border-accent-200 bg-accent-50 px-2 py-1 text-xs text-accent-700 xl:inline-flex">
          نموذج تفاعلي لمسار المشاريع — البيانات في هذا المتصفح فقط
        </span>
        <div className="ms-auto flex items-center gap-1.5">
          <DemoClock />
          <NotificationsBell />
          <ActorSwitcher />
        </div>
      </header>

      <div className="flex min-h-0 grow">
        <aside className="hidden w-64 shrink-0 flex-col border-e border-line bg-card lg:flex">
          <div className="flex h-16 items-center border-b border-line px-4">
            <Logo height={40} />
          </div>
          {sidebar}
          <div className="border-t border-line p-3 text-[11px] leading-5 text-muted">
            المرجع: لوحة FigJam «ABAK ERP — Full Process Flowchart» الأقسام 01–10 والقسم 11.
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 bg-brand-900/40 lg:hidden" onClick={() => setMobileOpen(false)}>
            <aside className="flex h-full w-72 flex-col bg-card shadow-overlay" onClick={(e) => e.stopPropagation()}>
              <div className="flex h-16 items-center justify-between border-b border-line px-4">
                <Logo height={36} />
                <button className="rounded p-1 text-muted hover:bg-sunken" onClick={() => setMobileOpen(false)} aria-label="إغلاق">
                  <X size={18} />
                </button>
              </div>
              {sidebar}
            </aside>
          </div>
        )}

        <main key={location.pathname} className="min-w-0 grow overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px] px-4 py-5 lg:px-6">
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  );
};

function DemoClock() {
  const { state, advance, reset } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-page px-1.5 py-1">
      <CalendarClock size={16} className="ms-1 hidden text-muted sm:block" />
      <span className="hidden px-1 text-xs text-ink-2 md:inline" title="تاريخ النموذج — قدّمه لتجربة التذكيرات والمهل والتصعيد">{fmtLong(state.now)}</span>
      <Button size="sm" variant="ghost" onClick={() => advance(1)} title="تقديم يوم">+يوم</Button>
      <Button size="sm" variant="ghost" onClick={() => advance(7)} title="تقديم أسبوع">+أسبوع</Button>
      <button className="rounded p-1.5 text-muted hover:bg-sunken" onClick={() => setConfirmReset(true)} title="إعادة البيانات" aria-label="إعادة البيانات">
        <RotateCcw size={15} />
      </button>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="إعادة بيانات النموذج"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>إلغاء</Button>
            <Button variant="danger" onClick={() => { reset(); setConfirmReset(false); }}>إعادة</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">تُمسح كل التغييرات في هذا المتصفح ويعود النموذج إلى بياناته الأولى (خمسة مشاريع في مراحل مختلفة وطلبا تفعيل).</p>
      </Modal>
    </div>
  );
}

function NotificationsBell() {
  const { state, me, markRead } = useStore();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const mine = state.notifications.filter((n) => n.userId === me.id);
  const unread = mine.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button className="relative rounded-md p-2 text-ink-2 hover:bg-sunken" onClick={() => setOpen((o) => !o)} aria-label="الإشعارات">
        <Bell size={19} />
        {unread > 0 && <span className="absolute -top-0.5 end-0 min-w-4 rounded-full bg-st-danger px-1 text-center text-[10px] font-semibold leading-4 text-white tabular">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-1 w-[min(92vw,380px)] rounded-lg border border-line bg-card shadow-overlay">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <p className="text-sm font-semibold text-ink">الإشعارات — {me.name}</p>
              {unread > 0 && <button className="text-xs text-brand-700 hover:underline" onClick={() => markRead()}>تعليم الكل كمقروء</button>}
            </div>
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {mine.slice(0, 25).map((n) => (
                <li key={n.id}>
                  <button
                    className={cn('block w-full px-3 py-2 text-start hover:bg-sunken', !n.read && 'bg-brand-50/60')}
                    onClick={() => { markRead([n.id]); setOpen(false); if (n.link) navigate(n.link); }}
                  >
                    <p className={cn('text-sm', n.read ? 'text-ink-2' : 'font-medium text-ink')}>{n.title}</p>
                    {n.body && <p className="truncate text-xs text-muted">{n.body}</p>}
                    <p className="text-[11px] text-faint">{fmtDateTime(n.at)}</p>
                  </button>
                </li>
              ))}
              {!mine.length && <li className="px-3 py-6 text-center text-sm text-muted">لا توجد إشعارات. الإشعار يصل لصاحب الإجراء الحالي والمعنيين فقط (F13).</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const ROLE_ORDER: RoleId[] = ['ceo', 'main_dept_manager', 'dept_manager', 'engineer', 'accountant', 'sales_rep', 'sales_manager', 'admin'];

function ActorSwitcher() {
  const { state, me, setActor } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const groups = ROLE_ORDER.map((r) => ({ role: r, users: state.users.filter((u) => u.roleId === r && (!q || u.name.includes(q) || u.title.includes(q))) })).filter((g) => g.users.length);
  return (
    <div className="relative">
      <button className="flex h-9 items-center gap-2 rounded-md ps-1 pe-2 hover:bg-sunken" onClick={() => setOpen((o) => !o)} title="تبديل المستخدم لتجربة دوره في المسار">
        <Avatar user={me} size={28} />
        <span className="hidden text-start leading-tight sm:block">
          <span className="block max-w-[160px] truncate text-[13px] font-medium text-ink">{me.name}</span>
          <span className="block max-w-[160px] truncate text-[11px] text-muted">{me.title}</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-1 w-[min(92vw,340px)] rounded-lg border border-line bg-card shadow-overlay">
            <div className="border-b border-line p-2">
              <p className="px-1 pb-1 text-xs text-muted">تصرّف بصفة… (كل موظف يرى ويفعل ما تسمح به صلاحياته فقط)</p>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو المسمى" className="h-8 w-full rounded border border-line px-2 text-sm" />
            </div>
            <div className="max-h-[65vh] overflow-y-auto py-1">
              {groups.map((g) => (
                <div key={g.role}>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted">{ROLE_NAMES[g.role]}</p>
                  {g.users.map((u) => (
                    <button key={u.id} onClick={() => { setActor(u.id); setOpen(false); setQ(''); }} className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-sunken', u.id === me.id && 'bg-brand-50')}>
                      <Avatar user={u} size={24} />
                      <span className="min-w-0 grow">
                        <span className="block truncate text-sm text-ink">{u.name}</span>
                        <span className="block truncate text-[11px] text-muted">{u.title}{u.grants.length ? ' · صلاحية مباشرة' : ''}</span>
                      </span>
                      {u.id === me.id && <CheckCircle2 size={15} className="text-brand-600" />}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-4 start-4 z-[70] flex w-[min(92vw,420px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={cn('pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-overlay',
          t.kind === 'error' ? 'border-st-danger/30 bg-st-danger-bg text-st-danger' : t.kind === 'success' ? 'border-st-success/30 bg-st-success-bg text-st-success' : 'border-line bg-card text-ink-2')}
        >
          {t.kind === 'error' ? <XCircle size={17} className="mt-0.5 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <Info size={17} className="mt-0.5 shrink-0" />}
          <span className="grow">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100" aria-label="إغلاق"><X size={15} /></button>
        </div>
      ))}
    </div>
  );
}
