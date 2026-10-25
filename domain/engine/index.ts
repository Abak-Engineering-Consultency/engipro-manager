import { addCalendarDays } from '../calendar';
import type { AppState, ISO, UserId } from '../types';
import { adminCommands } from './admin';
import { costCommands } from './costs';
import { Ctx, ProcessError } from './core';
import { deliveryCommands } from './delivery';
import { govCommands } from './gov';
import { projectCommands } from './projects';
import { tick } from './scheduler';
import { taskCommands } from './tasks';
import { visitCommands } from './visits';

export const commands = {
  ...projectCommands,
  ...deliveryCommands,
  ...govCommands,
  ...taskCommands,
  ...visitCommands,
  ...costCommands,
  ...adminCommands,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;
export type Payload<K extends CommandName> = Parameters<Commands[K]>[1];

export type RunResult = { ok: true; state: AppState; value?: unknown } | { ok: false; error: string };

/**
 * Run one command against a copy of the state. Either the whole command applies — state,
 * events and notifications — or nothing does, like a database transaction.
 */
export function run<K extends CommandName>(state: AppState, actorId: UserId, name: K, payload: Payload<K>): RunResult {
  const draft = structuredClone(state);
  const ctx = new Ctx(draft, actorId);
  try {
    const fn = commands[name] as (c: Ctx, p: Payload<K>) => unknown;
    const value = fn(ctx, payload);
    return { ok: true, state: draft, value };
  } catch (e) {
    if (e instanceof ProcessError) return { ok: false, error: e.message };
    throw e;
  }
}

/** The demo clock: move time forward and let the scheduler apply the time-based rules. */
export function advanceClock(state: AppState, days: number, hours = 0): AppState {
  const draft = structuredClone(state);
  const steps = Math.max(1, Math.ceil(days));
  for (let i = 0; i < steps; i++) {
    draft.now = addCalendarDays(draft.now, days / steps);
    tick(new Ctx(draft, 'system'));
  }
  if (hours) draft.now = new Date(Date.parse(draft.now) + hours * 3600_000).toISOString();
  return draft;
}

export function setClock(state: AppState, now: ISO): AppState {
  const draft = structuredClone(state);
  draft.now = now;
  tick(new Ctx(draft, 'system'));
  return draft;
}

export { ProcessError };
