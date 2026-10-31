import { createClient } from '@supabase/supabase-js';
import { useAppStore } from '../store/useAppStore';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Accept both names (older .env uses ANON_KEY, newer Supabase dashboards call it PUBLISHABLE_KEY)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials are not provided in environment variables!");
}

/**
 * Every request carries the staff session token, so the database's activity
 * log knows WHO made each change (see supabase/02_activity_audit.sql).
 */
let headerBlocked = false;
const fetchWithStaff: typeof fetch = async (input, init = {}) => {
  const token = useAppStore.getState().currentUser?.sessionToken;
  if (!token || headerBlocked) return fetch(input, init);
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('x-staff-token', token);
  try {
    return await fetch(input, { ...init, headers });
  } catch (e) {
    // If the server ever refuses the extra header (CORS), keep the shop working:
    // check without it; if that works, stop sending the header for this session.
    if (e instanceof TypeError) {
      const method = (init.method || 'GET').toUpperCase();
      const probe = await fetch(input, method === 'GET' || method === 'HEAD' ? init : { method: 'HEAD', headers: init.headers }).catch(() => null);
      if (probe) {
        headerBlocked = true;
        console.warn('x-staff-token header refused; continuing without it');
        // Only reads are retried automatically — a write is never sent twice.
        if (method === 'GET' || method === 'HEAD') return probe;
      }
    }
    throw e;
  }
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder_key',
  { global: { fetch: fetchWithStaff } }
);
