import { supabase } from './supabase';

export const createDatabaseBackup = async () => {
  try {
    const tables = [
      'products', 'categories', 'customers', 'debt_payments', 'suppliers', 'sales', 'sale_items',
      'expenses', 'settings', 'activity_logs', 'mix_recipes', 'mix_recipe_ingredients',
    ];
    const backupData: any = {};
    
    for (const table of tables) {
      // Page through results — Supabase returns max 1000 rows per request
      const rows: any[] = [];
      let error: any = null;
      for (let from = 0; ; from += 1000) {
        const res = await supabase.from(table).select('*').range(from, from + 999);
        if (res.error) { error = res.error; break; }
        rows.push(...(res.data || []));
        if (!res.data || res.data.length < 1000) break;
      }
      const data = rows;
      if (error && rows.length === 0) {
        console.error(`Error fetching backup data for ${table}:`, error);
        continue;
      }
      backupData[table] = data || [];
    }

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soran_pos_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Failed to create backup:', error);
    return false;
  }
};
