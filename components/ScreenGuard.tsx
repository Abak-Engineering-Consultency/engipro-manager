import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useStore } from '../app/store';
import { hasRole, holds } from '../domain/permissions';
import type { User } from '../domain/types';
import { Empty } from './ui';

/** Who may open each screen outside a project. The sidebar and the routes read the same rule. */
export const SCREEN_ACCESS = {
  intake: (u: User) => hasRole(u, 'accountant', 'ceo', 'main_dept_manager', 'dept_manager', 'sales_rep', 'sales_manager', 'admin'),
  gov: (u: User) => holds(u, 'gov_transaction.prepare') || holds(u, 'gov_transaction.assign') || holds(u, 'gov_transaction.follow_up') || hasRole(u, 'main_dept_manager', 'ceo', 'dept_manager', 'engineer', 'sales_rep', 'admin'),
  visits: (u: User) => holds(u, 'visit.manage'),
  finance: (u: User) => hasRole(u, 'accountant', 'ceo'),
} satisfies Record<string, (u: User) => boolean>;

/** Hiding the menu item is not the guard (F5): opening the address directly is refused the same way. */
export const ScreenGuard: React.FC<{ screen: keyof typeof SCREEN_ACCESS; children: React.ReactNode }> = ({ screen, children }) => {
  const { me } = useStore();
  if (SCREEN_ACCESS[screen](me)) return <>{children}</>;
  return <Empty icon={<ShieldAlert size={28} />} title="لا تملك صلاحية الاطلاع على هذه الصفحة" hint="تظهر لمن يحمل صلاحيتها. بدّل المستخدم لتجربة دور آخر." />;
};
