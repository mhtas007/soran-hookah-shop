import { supabase } from './supabase';
import { useAppStore } from '../store/useAppStore';

export type ActivityAction = 
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'SCREEN_LOCKED'
  | 'SCREEN_UNLOCKED'
  | 'SALE_COMPLETED' 
  | 'SALE_RETURNED' 
  | 'STOCK_ADJUSTED'
  | 'PRODUCT_ADDED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'EXPENSE_ADDED'
  | 'EXPENSE_UPDATED'
  | 'EXPENSE_DELETED'
  | 'DEBT_PAYMENT'
  | 'CUSTOMER_ADDED'
  | 'CUSTOMER_UPDATED'
  | 'CUSTOMER_DELETED'
  | 'SUPPLIER_ADDED'
  | 'SUPPLIER_UPDATED'
  | 'SUPPLIER_DELETED'
  | 'CATEGORY_ADDED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_DELETED'
  | 'INVOICE_ADDED'
  | 'INVOICE_UPDATED'
  | 'INVOICE_DELETED'
  | 'SETTINGS_UPDATED'
  | 'SETTINGS_WIPED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'LOGIN_FAILED'
  | 'PRINTED'
  | 'DATA_EXPORTED'
  | 'DATABASE_BACKUP'
  | string;

/**
 * When the database audit (02_activity_audit.sql) is installed, it records every
 * insert / edit / delete itself — with old → new values. These app-side actions
 * would then appear twice, so they are skipped.
 */
const DB_COVERED = new Set<string>([
  'SALE_COMPLETED', 'PRODUCT_ADDED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED',
  'EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'DEBT_PAYMENT', 'DEBT_ADDED_MANUALLY',
  'CUSTOMER_ADDED', 'CUSTOMER_UPDATED', 'CUSTOMER_DELETED',
  'SUPPLIER_ADDED', 'SUPPLIER_UPDATED', 'SUPPLIER_DELETED',
  'CATEGORY_ADDED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED',
  'INVOICE_ADDED', 'INVOICE_UPDATED', 'INVOICE_DELETED', 'INVOICE_UPLOADED',
  'SETTINGS_UPDATED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
]);

let auditCheck: Promise<boolean> | null = null;
export const isDbAuditEnabled = (): Promise<boolean> => {
  if (!auditCheck) {
    auditCheck = Promise.resolve(supabase.rpc('audit_enabled'))
      .then(({ data, error }) => !error && data === true)
      .catch(() => false);
  }
  return auditCheck;
};

export const logActivity = async (
  action: ActivityAction,
  details: string,
  metadata?: any,
  opts?: { userName?: string; force?: boolean },
) => {
  try {
    if (!opts?.force && DB_COVERED.has(action) && (await isDbAuditEnabled())) return;
    const user = useAppStore.getState().currentUser;
    
    // Check if user.id is a valid UUID
    const isValidUUID = (id?: string) => 
      id ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) : false;
    
    const userId = (user?.id && isValidUUID(user.id)) ? user.id : null;
    const userName = opts?.userName || (user?.name ? user.name.trim() : (user?.role === 'Admin' ? 'ئەدمین' : 'کاشێر'));

    const basePayload = {
      user_name: userName,
      action,
      details,
      metadata: metadata || null,
      created_at: new Date().toISOString()
    };

    // First attempt: with user_id if valid
    const firstPayload = userId ? { ...basePayload, user_id: userId } : basePayload;
    
    const { error: firstError } = await supabase.from('activity_logs').insert(firstPayload);

    // Fallback attempt: if first attempt errored (e.g. FK constraint or UUID type mismatch), insert without user_id
    if (firstError) {
      console.warn('First log attempt failed, retrying without user_id FK:', firstError.message);
      const { error: secondError } = await supabase.from('activity_logs').insert(basePayload);
      if (secondError) {
        console.error('Activity log failed completely:', secondError.message);
      }
    }
  } catch (error) {
    console.error('Error in logActivity execution:', error);
  }
};
