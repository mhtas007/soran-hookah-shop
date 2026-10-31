import { supabase } from './supabase';
import { useAppStore } from '../store/useAppStore';

/**
 * Staff / auth API.
 * Uses the secure RPC functions from supabase/01_security_and_sales_upgrade.sql.
 * If that migration has not been run yet, it falls back to the old direct-table
 * behaviour so the shop never gets locked out during deployment.
 */

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Manager' | 'Cashier';
  permissions: string[];
  is_active?: boolean;
  created_at?: string;
}

const isMissingFunction = (err: any) =>
  !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message || ''));

const token = () => useAppStore.getState().currentUser?.sessionToken || null;

const normalize = (row: any): StaffRow => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  permissions: Array.isArray(row.permissions) ? row.permissions : [],
  is_active: row.is_active,
  created_at: row.created_at,
});

/** Returns the user (with sessionToken when secure mode is active) or null when credentials are wrong. */
export async function staffLogin(email: string, password: string) {
  const { data, error } = await supabase.rpc('staff_login', { p_email: email, p_password: password });
  if (!error) {
    if (!data) return null;
    return { ...normalize(data), sessionToken: data.session_token as string };
  }
  if (!isMissingFunction(error)) throw error;

  // Legacy fallback (before SQL migration)
  const { data: row, error: e2 } = await supabase
    .from('staff_users').select('*')
    .eq('email', email).eq('password', password).maybeSingle();
  if (e2) throw e2;
  return row ? { ...normalize(row), sessionToken: undefined } : null;
}

export async function staffVerifySecret(userId: string, secret: string): Promise<boolean> {
  const t = token();
  if (t) {
    const { data, error } = await supabase.rpc('staff_verify_secret', { p_token: t, p_secret: secret });
    if (!error) return !!data;
    if (!isMissingFunction(error)) throw error;
  }
  const { data } = await supabase.from('staff_users').select('password, pin_code').eq('id', userId).maybeSingle();
  return !!data && (data.password === secret || data.pin_code === secret);
}

/** 'invalid' = session expired / revoked → must log out. */
export async function staffMe(userId: string): Promise<StaffRow | null | 'invalid'> {
  const t = token();
  if (t) {
    const { data, error } = await supabase.rpc('staff_me', { p_token: t });
    if (!error) return data ? normalize(data) : 'invalid';
    if (!isMissingFunction(error)) return null;
  } else {
    // No token: if secure mode exists the user must log in again.
    const probe = await supabase.rpc('staff_me', { p_token: '00000000-0000-0000-0000-000000000000' });
    if (!probe.error) return 'invalid';
  }
  const { data } = await supabase.from('staff_users').select('id, name, email, role, permissions').eq('id', userId).maybeSingle();
  return data ? normalize(data) : null;
}

export async function staffLogout() {
  const t = token();
  if (t) await supabase.rpc('staff_logout', { p_token: t });
}

export async function staffList(): Promise<StaffRow[]> {
  const t = token();
  if (t) {
    const { data, error } = await supabase.rpc('staff_list', { p_token: t });
    if (!error) return (data || []).map(normalize);
    if (!isMissingFunction(error)) throw error;
  }
  const { data, error } = await supabase
    .from('staff_users').select('id, name, email, role, permissions, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalize);
}

export interface StaffSaveInput {
  id?: string | null;
  name: string;
  email: string;
  password?: string; // empty = keep current
  pin?: string;      // empty = keep current
  role: string;
  permissions: string[];
}

export async function staffSave(input: StaffSaveInput) {
  const t = token();
  if (t) {
    const { error } = await supabase.rpc('staff_save', {
      p_token: t,
      p_id: input.id || null,
      p_name: input.name,
      p_email: input.email,
      p_password: input.password || null,
      p_pin: input.pin || null,
      p_role: input.role,
      p_permissions: input.permissions,
    });
    if (!error) return;
    if (!isMissingFunction(error)) throw error;
  }
  const payload: any = {
    name: input.name, email: input.email, role: input.role, permissions: input.permissions,
  };
  if (input.password) payload.password = input.password;
  if (input.pin) payload.pin_code = input.pin;
  const { error } = input.id
    ? await supabase.from('staff_users').update(payload).eq('id', input.id)
    : await supabase.from('staff_users').insert(payload);
  if (error) throw error;
}

export async function staffDelete(id: string) {
  const t = token();
  if (t) {
    const { error } = await supabase.rpc('staff_delete', { p_token: t, p_id: id });
    if (!error) return;
    if (!isMissingFunction(error)) throw error;
  }
  const { error } = await supabase.from('staff_users').delete().eq('id', id);
  if (error) throw error;
}

/** Friendly Kurdish message for RPC errors. */
export function staffErrorMessage(err: any): string {
  const m = String(err?.message || err || '');
  if (m.includes('NOT_ADMIN')) return 'تەنها ئەدمین دەتوانێت ئەم کارە بکات';
  if (m.includes('SESSION_INVALID')) return 'کاتی چوونەژوورەوەت تەواو بووە، تکایە دووبارە بچۆ ژوورەوە';
  if (m.includes('CANNOT_DELETE_SELF')) return 'ناتوانیت هەژماری خۆت بسڕیتەوە';
  if (m.includes('LAST_USER')) return 'ناتوانیت کۆتا بەکارهێنەر بسڕیتەوە';
  if (m.includes('PASSWORD_AND_PIN_REQUIRED')) return 'پاسۆرد و پین کۆد پێویستن بۆ بەکارهێنەری نوێ';
  if (m.includes('duplicate key') || m.includes('23505')) return 'ئەم ئیمەیڵە پێشتر بەکارهاتووە';
  return m;
}
