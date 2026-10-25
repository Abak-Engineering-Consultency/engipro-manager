import type { Settings } from '../types';
import { Ctx } from './core';

export const adminCommands = {
  /** 11-E — company values; contract terms take precedence over them (D18). */
  'settings.update'(ctx: Ctx, p: { patch: Partial<Settings> }) {
    ctx.require('admin.settings');
    for (const [k, v] of Object.entries(p.patch)) {
      if (typeof v === 'number') ctx.check(Number.isFinite(v) && v >= 0, `قيمة غير صالحة: ${k}`);
    }
    Object.assign(ctx.s.settings, p.patch);
    ctx.event('settings.updated', { type: 'settings', id: 'company' }, `تحديث الإعدادات: ${Object.keys(p.patch).join('، ')}`);
  },
};
