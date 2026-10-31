/**
 * Supabase returns at most 1000 rows per request. This pages through a query
 * so lists with more than 1000 products/customers are never cut off.
 * `build` must return a NEW query builder each call.
 */
export async function fetchAllRows<T = any>(
  build: () => any,
  pageSize = 1000,
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    all.push(...((data as T[]) || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}
