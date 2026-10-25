import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarClock, CheckCircle2, ChevronsUpDown, FolderKanban, Inbox, Info, Landmark, LayoutDashboard, ListChecks, MapPin,
  Menu, RotateCcw, Search, Wallet, X, XCircle,
} from 'lucide-react';
import { useStore } from '../app/store';
import { derivedActions } from '../domain/derived';
import { fmtDateTime, fmtLong } from '../domain/calendar';
import { ROLE_NAMES, PROJECT_STATES } from '../domain/labels';
import { projectAccess } from '../domain/selectors';
import type { RoleId, User } from '../domain/types';
import { SCREEN_ACCESS } from './ScreenGuard';
import { Avatar, Button, cn, Modal, StatePill } from './ui';

interface NavItem { to: string; label: string; icon: React.ReactNode; show: (u: User) => boolean; badge?: number }

export const Logo = ({ height = 36, light = false }: { height?: number; light?: boolean }) => (
  <img src={light ? '/abak-logo-light.png' : '/abak-logo.png'} alt="أباك للاستشارات الهندسية" style={{ height, width: 'auto' }} className="block select-none object-contain" draggable={false} />
);

export const Layout: React.FC = () => {
  const { state, me } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const actions = useMemo(() => derivedActions(state, me), [state, me]);
  const myOpenTasks = state.tasks.filter((t) => !['completed', 'cancelled'].includes(t.status) && (t.ownerId === me.id || (t.reviewerId === me.id && t.status === 'in_review'))).length;

  const nav: NavItem[] = [
    { to: '/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={20} />, show: () => true },
    { to: '/work', label: 'مهامي', icon: <ListChecks size={20} />, show: () => true, badge: actions.length + myOpenTasks },
    { to: '/projects', label: 'المشاريع', icon: <FolderKanban size={20} />, show: () => true },
    { to: '/intake', label: 'التفعيل والاستلام', icon: <Inbox size={20} />, show: SCREEN_ACCESS.intake },
    { to: '/gov', label: 'المعاملات الحكومية', icon: <Landmark size={20} />, show: SCREEN_ACCESS.gov },
    { to: '/visits', label: 'الزيارات', icon: <MapPin size={20} />, show: SCREEN_ACCESS.visits },
    { to: '/finance', label: 'المالية', icon: <Wallet size={20} />, show: SCREEN_ACCESS.finance },
  ];
  const items = nav.filter((n) => n.show(me));

  const sidebar = (onNavigate: () => void) => (
    <>
      <nav className="flex grow flex-col gap-1 overflow-y-auto px-3 py-6">
        {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-600 text-white shadow-md' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white',
              )}
            >
              {n.icon}
              <span className="grow truncate">{n.label}</span>
              {!!n.badge && <span className="rounded-full bg-white/15 px-2 text-xs font-semibold text-white tabular">{n.badge}</span>}
            </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-line p-3">
        <ActorSwitcher />
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      <aside className={cn('hidden shrink-0 flex-col bg-sidebar text-white lg:flex', collapsed ? 'lg:hidden' : 'w-64')}>
        <div className="flex h-16 items-center border-b border-sidebar-line px-5">
          <Logo light height={44} />
        </div>
        {sidebar(() => undefined)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="flex h-full w-72 flex-col bg-sidebar text-white shadow-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center justify-between border-b border-sidebar-line px-6">
              <Logo light height={36} />
              <button className="rounded-lg p-1 text-sidebar-muted hover:bg-sidebar-hover hover:text-white" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة">
                <X size={20} />
              </button>
            </div>
            {sidebar(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 grow flex-col">
        <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-card px-4 shadow-sm md:px-6">
          <div className="flex max-w-xl grow items-center gap-3">
            <button
              className="rounded-lg p-2 text-ink-2 hover:bg-sunken"
              onClick={() => (window.matchMedia('(min-width: 1024px)').matches ? setCollapsed((c) => !c) : setMobileOpen(true))}
              aria-label="القائمة"
            >
              <Menu size={22} />
            </button>
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <DemoClock />
            <NotificationsBell />
          </div>
        </header>

        <main key={location.pathname} className="min-w-0 grow overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  );
};

/** Projects the current person can open, by number, name or client. */
function GlobalSearch() {
  const { state, me } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const term = q.trim();
  const results = term
    ? state.projects
      .filter((p) => projectAccess(state, me, p))
      .filter((p) => p.id.toLowerCase().includes(term.toLowerCase()) || p.title.includes(term) || (state.clients.find((c) => c.id === p.clientId)?.name ?? '').includes(term))
      .slice(0, 6)
    : [];
  const go = (id: string) => {
    navigate(`/projects/${id}`);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="relative hidden grow sm:block">
      <Search size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-faint" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].id); if (e.key === 'Escape') setOpen(false); }}
        placeholder="ابحث عن مشروع بالرقم أو الاسم أو العميل…"
        aria-label="بحث"
        className="h-10 w-full rounded-md border border-transparent bg-page ps-10 pe-3 text-sm text-ink placeholder:text-faint focus:border-brand-300 focus:bg-card focus:outline-none"
      />
      {open && term && (
        <div className="absolute inset-x-0 z-50 mt-1 overflow-hidden rounded-lg border border-line bg-card shadow-overlay">
          {results.map((p) => (
            <button key={p.id} onMouseDown={() => go(p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start hover:bg-page">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                <span className="ltr-iso text-xs text-muted">{p.id}</span>
              </span>
              <StatePill s={PROJECT_STATES[p.status]} />
            </button>
          ))}
          {!results.length && <p className="px-4 py-3 text-sm text-muted">لا توجد نتائج</p>}
        </div>
      )}
    </div>
  );
}

/** The prototype's own date: moving it forward runs reminders, deadlines and escalations. */
function DemoClock() {
  const { state, advance, reset } = useStore();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEscape(open, () => setOpen(false));
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-lg px-2 py-2 text-ink-2 hover:bg-sunken" onClick={() => setOpen((o) => !o)} title="تاريخ النموذج" aria-label="تاريخ النموذج">
        <CalendarClock size={20} />
        <span className="hidden text-sm md:inline">{fmtLong(state.now)}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-72 rounded-lg border border-line bg-card p-4 shadow-overlay">
            <p className="text-xs text-muted">تاريخ النموذج</p>
            <p className="text-base font-semibold text-ink">{fmtLong(state.now)}</p>
            <p className="mt-1 text-xs text-muted">قدّم التاريخ لتجربة التذكيرات والمهل والتصعيد.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => advance(1)}>+ يوم</Button>
              <Button size="sm" variant="secondary" onClick={() => advance(7)}>+ أسبوع</Button>
              <Button size="sm" variant="ghost" className="ms-auto" icon={<RotateCcw size={14} />} onClick={() => { setOpen(false); setConfirmReset(true); }}>إعادة البيانات</Button>
            </div>
          </div>
        </>
      )}
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
        <p className="text-sm text-ink-2">تُمسح كل التغييرات في هذا المتصفح ويعود النموذج إلى بياناته الأولى.</p>
      </Modal>
    </div>
  );
}

/** Escape closes an open popover. */
function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, close]);
}

function NotificationsBell() {
  const { state, me, markRead } = useStore();
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false));
  const navigate = useNavigate();
  const mine = state.notifications.filter((n) => n.userId === me.id);
  const unread = mine.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button className="relative rounded-full p-2 text-ink-2 hover:bg-sunken" onClick={() => setOpen((o) => !o)} aria-label={unread ? `الإشعارات، ${unread} غير مقروءة` : 'الإشعارات'}>
        <Bell size={20} />
        {unread > 0 && <span className="absolute top-1 end-1 min-w-4 rounded-full bg-st-danger px-1 text-center text-[10px] font-semibold leading-4 text-white ring-2 ring-card tabular">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-lg border border-line bg-card shadow-overlay">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold text-ink">الإشعارات</p>
              {unread > 0 && <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => markRead()}>تعليم الكل كمقروء</button>}
            </div>
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {mine.slice(0, 25).map((n) => (
                <li key={n.id}>
                  <button
                    className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-page"
                    onClick={() => { markRead([n.id]); setOpen(false); if (n.link) navigate(n.link); }}
                  >
                    <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')} />
                    <span className="min-w-0">
                      <span className={cn('block text-sm', n.read ? 'text-ink-2' : 'font-medium text-ink')}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-faint">{fmtDateTime(n.at)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!mine.length && <li className="px-4 py-8 text-center text-sm text-muted">لا توجد إشعارات</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const ROLE_ORDER: RoleId[] = ['ceo', 'main_dept_manager', 'dept_manager', 'engineer', 'accountant', 'sales_rep', 'sales_manager', 'admin'];

/** The person acting: in this prototype anyone can switch, to try each role's view. */
function ActorSwitcher() {
  const { state, me, setActor } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const match = (u: User) => !q || u.name.includes(q) || u.title.includes(q) || u.email.includes(q.toLowerCase());
  const groups = ROLE_ORDER.map((r) => ({ role: r, users: state.users.filter((u) => u.roleId === r && match(u)) })).filter((g) => g.users.length);
  return (
    <div className="relative">
      <button className="flex w-full items-center gap-3 rounded-md p-2 text-start hover:bg-sidebar-hover" onClick={() => setOpen((o) => !o)} title="تبديل المستخدم لتجربة دوره في المسار">
        <Avatar user={me} size={36} />
        <span className="min-w-0 grow">
          <span className="block truncate text-sm font-medium text-white">{me.name}</span>
          <span className="block truncate text-xs text-sidebar-muted">{me.title}</span>
        </span>
        <ChevronsUpDown size={16} className="shrink-0 text-sidebar-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full start-0 z-50 mb-2 w-[min(88vw,320px)] rounded-lg border border-line bg-card text-ink shadow-overlay">
            <div className="border-b border-line p-3">
              <p className="pb-2 text-xs text-muted">تصرّف بصفة…</p>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو المسمى أو البريد" className="h-9 w-full rounded-md border border-line px-3 text-sm focus:border-brand-500 focus:outline-none" />
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {groups.map((g) => (
                <div key={g.role}>
                  <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted">{ROLE_NAMES[g.role]}</p>
                  {g.users.map((u) => (
                    <button
                      key={u.id}
                      disabled={u.deactivated}
                      title={u.email}
                      onClick={() => { setActor(u.id); setOpen(false); setQ(''); }}
                      className={cn('flex w-full items-center gap-3 px-4 py-2 text-start hover:bg-page disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent', u.id === me.id && 'bg-brand-50')}
                    >
                      <Avatar user={u} size={28} />
                      <span className="min-w-0 grow">
                        <span className="block truncate text-sm text-ink">{u.name}</span>
                        <span className="block truncate text-xs text-muted">{u.title}</span>
                      </span>
                      {u.deactivated && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">معطّل</span>}
                      {u.id === me.id && <CheckCircle2 size={16} className="text-brand-600" />}
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
        <div key={t.id} className={cn('pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-overlay',
          t.kind === 'error' ? 'border-st-danger/30 bg-st-danger-bg text-st-danger' : t.kind === 'success' ? 'border-st-success/30 bg-st-success-bg text-st-success' : 'border-line bg-card text-ink-2')}
        >
          {t.kind === 'error' ? <XCircle size={18} className="mt-0.5 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
          <span className="grow">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100" aria-label="إغلاق"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
