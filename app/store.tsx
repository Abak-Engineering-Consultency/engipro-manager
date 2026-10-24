import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { advanceClock, run, type CommandName, type Payload } from '../domain/engine';
import { buildSeed, SEED_VERSION } from '../domain/seed';
import type { AppState, User } from '../domain/types';

const KEY = 'abak.projects.demo';

interface Saved { version: number; state: AppState; actorId: string }

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Saved;
      if (saved.version === SEED_VERSION && saved.state?.users) return saved;
    }
  } catch {
    // Private window or blocked storage: start from the seed.
  }
  return { version: SEED_VERSION, state: buildSeed(), actorId: 'u_dod' };
}

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }

export type DispatchResult = { ok: true; value?: unknown } | { ok: false; error: string };

interface Store {
  state: AppState;
  me: User;
  setActor: (id: string) => void;
  dispatch: <K extends CommandName>(name: K, payload: Payload<K>, success?: string) => DispatchResult;
  advance: (days: number) => void;
  reset: () => void;
  markRead: (ids?: string[]) => void;
  toasts: Toast[];
  toast: (kind: Toast['kind'], text: string) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

/**
 * The prototype's single source of truth. Every change goes through a command of the process
 * engine as the person currently acting — the same transitions and checks the ERP backend will
 * enforce — and the result is kept in this browser only.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(load, []);
  const [state, setState] = useState<AppState>(initial.state);
  const [actorId, setActorId] = useState(initial.actorId);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const seq = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: SEED_VERSION, state, actorId } satisfies Saved));
    } catch {
      // Storage full or blocked: the session still works in memory.
    }
  }, [state, actorId]);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const dispatch = useCallback(<K extends CommandName>(name: K, payload: Payload<K>, success?: string): DispatchResult => {
    const r = run(stateRef.current, actorId, name, payload);
    if (!r.ok) {
      toast('error', r.error);
      return r;
    }
    stateRef.current = r.state;
    setState(r.state);
    if (success) toast('success', success);
    return { ok: true, value: r.value };
  }, [actorId, toast]);

  const me = state.users.find((u) => u.id === actorId) ?? state.users[0];

  const value: Store = {
    state,
    me,
    setActor: (id) => setActorId(id),
    dispatch,
    advance: (days) => {
      const next = advanceClock(stateRef.current, days);
      stateRef.current = next;
      setState(next);
      toast('info', `تقدّم التاريخ ${days === 7 ? 'أسبوعًا' : days === 1 ? 'يومًا' : `${days} أيام`} — طُبّقت التذكيرات والتصعيدات`);
    },
    reset: () => {
      const s = buildSeed();
      stateRef.current = s;
      setState(s);
      toast('info', 'أُعيدت بيانات النموذج إلى حالتها الأولى');
    },
    markRead: (ids) => {
      setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.userId === me.id && (!ids || ids.includes(n.id)) ? { ...n, read: true } : n)) }));
    },
    toasts,
    toast,
    dismiss: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Look-ups used across screens. */
export function useLookup() {
  const { state } = useStore();
  return useMemo(() => {
    const users = new Map(state.users.map((u) => [u.id, u]));
    const clients = new Map(state.clients.map((c) => [c.id, c]));
    return {
      user: (id?: string) => (id ? users.get(id) : undefined),
      userName: (id?: string) => (id ? users.get(id)?.name ?? id : '—'),
      client: (id?: string) => (id ? clients.get(id) : undefined),
      project: (id?: string) => state.projects.find((p) => p.id === id),
    };
  }, [state]);
}
