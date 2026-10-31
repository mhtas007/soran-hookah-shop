import { supabase } from './supabase';

const isMissingFunction = (err: any) =>
  !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message || ''));

/**
 * The database answered with an error → the RPC ran in a transaction that was
 * rolled back, so nothing was saved and the old method can safely be used.
 * (A network failure has no code: the sale may have been saved, so we never retry it.)
 */
const isServerRejection = (err: any) => !!err && typeof err.code === 'string' && err.code !== '';

export interface SalePayload {
  total_amount: number;
  total_profit: number;
  payment_method: string;
  payment_amount: number;
  debt_customer_id: string | null;
  discount: number;
}
export interface SaleItemPayload {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
}

/**
 * Saves a complete sale in ONE database transaction (sale + items + stock + debt).
 * Stock is decremented on the server, so two devices selling at once stay correct.
 * Falls back to the old step-by-step method if the SQL upgrade is not installed yet.
 */
export async function processSale(
  sale: SalePayload,
  items: SaleItemPayload[],
  stock: { id: string; qty: number }[],
  debt?: { customerId: string; amount: number } | null,
): Promise<any> {
  const { data, error } = await supabase.rpc('process_sale', {
    p_sale: sale,
    p_items: items,
    p_stock: stock,
    p_customer_id: debt?.customerId ?? null,
    p_debt_amount: debt?.amount ?? 0,
  });
  if (!error) return data;
  if (!isMissingFunction(error)) {
    if (!isServerRejection(error)) throw error;
    console.warn('process_sale failed, using step-by-step fallback:', error);
  }

  // ── Legacy fallback ──
  const { data: saleData, error: saleError } = await supabase.from('sales').insert(sale).select().single();
  if (saleError) throw saleError;

  const { error: itemsError } = await supabase.from('sale_items').insert(items.map(i => ({ ...i, sale_id: saleData.id })));
  if (itemsError) {
    await supabase.from('sales').delete().eq('id', saleData.id); // don't leave a half sale behind
    throw itemsError;
  }

  await adjustStock(stock.map(s => ({ id: s.id, delta: -s.qty })));

  if (debt && debt.amount) {
    const { data: c } = await supabase.from('customers').select('total_purchases, remaining_debt').eq('id', debt.customerId).single();
    if (c) {
      await supabase.from('customers').update({
        total_purchases: (Number(c.total_purchases) || 0) + debt.amount,
        remaining_debt: (Number(c.remaining_debt) || 0) + debt.amount,
      }).eq('id', debt.customerId);
    }
  }
  return saleData;
}

/** Atomic stock change. delta > 0 adds stock, delta < 0 removes it. */
export async function adjustStock(changes: { id: string; delta: number }[], floorZero = false) {
  const list = changes.filter(c => c.id && c.delta);
  if (!list.length) return;
  const { error } = await supabase.rpc('adjust_stock', { p_changes: list, p_floor_zero: floorZero });
  if (!error) return;
  if (!isMissingFunction(error) && !isServerRejection(error)) throw error;

  // Legacy fallback: read the CURRENT value right before writing
  for (const c of list) {
    const { data } = await supabase.from('products').select('stock_level').eq('id', c.id).single();
    if (!data) continue;
    let next = (Number(data.stock_level) || 0) + c.delta;
    if (floorZero) next = Math.max(0, next);
    await supabase.from('products').update({ stock_level: next }).eq('id', c.id);
  }
}
