import type { User } from '../types';

/** Pages only an Admin may open, whatever permissions say. */
const ADMIN_ONLY = new Set(['/users', '/activity']);

/** Alternative permission keys that also grant a page. */
const ALIASES: Record<string, string[]> = {
  '/exchanges': ['/returns'],
};

export function canAccess(user: User | null | undefined, path: string): boolean {
  if (!user) return false;
  if (path === '/') return true;
  if (user.role === 'Admin') return true;
  if (ADMIN_ONLY.has(path)) return false;
  const perms = user.permissions || [];
  return perms.includes(path) || (ALIASES[path] || []).some(p => perms.includes(p));
}

export function hasPermission(user: User | null | undefined, key: string): boolean {
  if (!user) return false;
  return user.role === 'Admin' || (user.permissions || []).includes(key);
}
