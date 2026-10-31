import React, { useMemo, useState } from 'react';
import { X, Percent, Equal, Plus, Minus, Check, Loader2, TrendingUp, AlertTriangle } from 'lucide-react';
import type { Product } from '../types';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLogger';

type FieldKey = 'sellingPrice' | 'costPrice' | 'bulkPrice' | 'bulkCost' | 'halfBulkPrice' | 'halfBulkCost';
type Mode = 'set' | 'pct_up' | 'pct_down' | 'amt_up' | 'amt_down';

const FIELDS: { key: FieldKey; column: string; label: string; isCost: boolean }[] = [
  { key: 'sellingPrice', column: 'selling_price', label: 'نرخی فرۆشتنی دانە', isCost: false },
  { key: 'bulkPrice', column: 'bulk_price', label: 'نرخی فرۆشتنی تەک (کۆ)', isCost: false },
  { key: 'halfBulkPrice', column: 'half_bulk_price', label: 'نرخی فرۆشتنی نیو تەک', isCost: false },
  { key: 'costPrice', column: 'cost_price', label: 'تێچووی دانە', isCost: true },
  { key: 'bulkCost', column: 'bulk_cost', label: 'تێچووی تەک (کۆ)', isCost: true },
  { key: 'halfBulkCost', column: 'half_bulk_cost', label: 'تێچووی نیو تەک', isCost: true },
];

const MODES: { id: Mode; label: string; icon: React.ElementType }[] = [
  { id: 'pct_up', label: 'زیادکردن ٪', icon: TrendingUp },
  { id: 'pct_down', label: 'کەمکردن ٪', icon: Percent },
  { id: 'amt_up', label: 'زیادکردنی بڕ', icon: Plus },
  { id: 'amt_down', label: 'کەمکردنی بڕ', icon: Minus },
  { id: 'set', label: 'دانانی نرخی نوێ', icon: Equal },
];

const ROUNDINGS = [0, 250, 500, 1000];

const fmt = (n: number, usd: boolean) =>
  `${usd ? '$' : ''}${n.toLocaleString('en-US', { maximumFractionDigits: usd ? 2 : 0 })}${usd ? '' : ' IQD'}`;

interface Props {
  products: Product[];
  showCost: boolean;
  onClose: () => void;
  onDone: () => void;
}

export const BulkPriceModal: React.FC<Props> = ({ products, showCost, onClose, onDone }) => {
  const available = FIELDS.filter(f => showCost || !f.isCost);
  const [fields, setFields] = useState<FieldKey[]>(['sellingPrice']);
  const [mode, setMode] = useState<Mode>('pct_up');
  const [value, setValue] = useState('');
  const [rounding, setRounding] = useState(250);
  const [skipZero, setSkipZero] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const num = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(num) && num >= 0 && fields.length > 0 &&
    !(mode === 'pct_down' && num > 100);

  const compute = (old: number, usd: boolean): number => {
    let next = old;
    switch (mode) {
      case 'set': next = num; break;
      case 'pct_up': next = old * (1 + num / 100); break;
      case 'pct_down': next = old * (1 - num / 100); break;
      case 'amt_up': next = old + num; break;
      case 'amt_down': next = old - num; break;
    }
    next = Math.max(0, next);
    if (usd) return Math.round(next * 100) / 100;            // dollars: 2 decimals
    if (rounding > 0) return Math.round(next / rounding) * rounding;
    return Math.round(next);
  };

  const plan = useMemo(() => {
    if (!valid) return [];
    return products.map(p => {
      const changes: { field: typeof FIELDS[number]; from: number; to: number; usd: boolean }[] = [];
      for (const f of FIELDS) {
        if (!fields.includes(f.key)) continue;
        const old = Number((p as any)[f.key]) || 0;
        if (skipZero && old === 0 && mode !== 'set') continue;  // don't invent prices for unused tiers
        const usd = (f.isCost ? p.costCurrency : p.currency) === 'USD';
        const to = compute(old, usd);
        if (to !== old) changes.push({ field: f, from: old, to, usd });
      }
      return { product: p, changes };
    }).filter(r => r.changes.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, fields, mode, num, rounding, skipZero, valid]);

  const priceBelowCost = plan.filter(r => {
    const sell = r.changes.find(c => c.field.key === 'sellingPrice')?.to ?? r.product.sellingPrice;
    const cost = r.changes.find(c => c.field.key === 'costPrice')?.to ?? r.product.costPrice;
    return showCost && r.product.currency === r.product.costCurrency && cost > 0 && sell < cost;
  }).length;

  const toggleField = (k: FieldKey) =>
    setFields(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));

  const apply = async () => {
    if (!plan.length) return;
    setSaving(true);
    setProgress(0);
    const failed: string[] = [];
    try {
      // 10 updates in parallel at a time
      for (let i = 0; i < plan.length; i += 10) {
        const batch = plan.slice(i, i + 10);
        const results = await Promise.all(batch.map(r => {
          const payload: Record<string, number> = {};
          r.changes.forEach(c => { payload[c.field.column] = c.to; });
          return supabase.from('products').update(payload).eq('id', r.product.id);
        }));
        results.forEach((res, j) => { if (res.error) failed.push(batch[j].product.name); });
        setProgress(Math.min(plan.length, i + batch.length));
      }

      const modeLabel = MODES.find(m => m.id === mode)?.label;
      await logActivity(
        'PRODUCT_BULK_PRICE',
        `گۆڕینی نرخی بە کۆمەڵ: ${plan.length - failed.length} کاڵا — ${modeLabel} ${num}${mode.startsWith('pct') ? '٪' : ''}`,
        { count: plan.length, failed: failed.length, mode, value: num, fields, rounding },
      );

      if (failed.length) {
        alert(`${plan.length - failed.length} کاڵا نوێکرایەوە، بەڵام ${failed.length} کاڵا کێشەی هەبوو:\n${failed.slice(0, 8).join('، ')}`);
      } else {
        alert(`نرخی ${plan.length} کاڵا بە سەرکەوتوویی نوێکرایەوە`);
      }
      onDone();
    } catch (e: any) {
      alert('کێشەیەک ڕوویدا لە گۆڕینی نرخەکان: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 font-kurdish" onClick={() => !saving && onClose()}>
      <div
        className="bg-white w-full sm:max-w-3xl max-h-[95vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100">
          <div>
            <h2 id="bulk-title" className="text-lg font-black text-slate-900">گۆڕینی نرخ بە کۆمەڵ</h2>
            <p className="text-xs text-slate-500 font-bold mt-0.5">{products.length} کاڵا هەڵبژێردراوە</p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="داخستن">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* 1. Which prices */}
          <section>
            <h3 className="text-xs font-black text-slate-500 mb-2">١. کام نرخ بگۆڕدرێت؟</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {available.map(f => {
                const on = fields.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleField(f.key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold text-right ${
                      on ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                      {on && <Check className="w-3 h-3 text-white" />}
                    </span>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. How */}
          <section>
            <h3 className="text-xs font-black text-slate-500 mb-2">٢. چۆن بگۆڕدرێت؟</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {MODES.map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold border ${
                      mode === m.id ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  autoFocus
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder={mode.startsWith('pct') ? 'بۆ نموونە 10' : 'بۆ نموونە 1000'}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-left font-black text-lg"
                  dir="ltr"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">
                  {mode.startsWith('pct') ? '٪' : 'IQD / $'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 shrink-0">نزیککردنەوە:</span>
                <div className="flex gap-1 flex-wrap">
                  {ROUNDINGS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRounding(r)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border font-mono ${
                        rounding === r ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {r === 0 ? 'هیچ' : r.toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {mode !== 'set' && (
              <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={skipZero} onChange={e => setSkipZero(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                نرخی سفر (بەکارنەهاتوو) دەست لێ نەدرێت
              </label>
            )}
            {mode === 'pct_down' && num > 100 && (
              <p className="mt-2 text-xs font-bold text-rose-600">ڕێژەی کەمکردن ناتوانێت لە ١٠٠٪ زیاتر بێت</p>
            )}
            <p className="mt-2 text-[11px] text-slate-400 font-bold">نزیککردنەوە تەنها بۆ نرخی دینار بەکاردێت؛ نرخی دۆلار بۆ دوو ژمارەی دوای فاریزە دەبڕدرێت.</p>
          </section>

          {/* 3. Preview */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black text-slate-500">٣. پێشبینینی گۆڕانکارییەکان</h3>
              {valid && <span className="text-xs font-black text-indigo-700">{plan.length} کاڵا دەگۆڕێت</span>}
            </div>

            {priceBelowCost > 0 && (
              <div className="mb-3 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                ئاگاداربە: {priceBelowCost} کاڵا نرخی فرۆشتنی لە تێچوو کەمتر دەبێت.
              </div>
            )}

            {!valid ? (
              <div className="p-6 text-center text-sm text-slate-400 font-bold border border-dashed border-slate-200 rounded-2xl">
                نرخ هەڵبژێرە و بڕێک بنووسە بۆ بینینی ئەنجامەکە
              </div>
            ) : plan.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400 font-bold border border-dashed border-slate-200 rounded-2xl">
                هیچ نرخێک ناگۆڕێت
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs sticky top-0">
                      <tr>
                        <th className="p-2.5 text-right font-black">کاڵا</th>
                        <th className="p-2.5 text-right font-black">نرخ</th>
                        <th className="p-2.5 text-left font-black">کۆن</th>
                        <th className="p-2.5 text-left font-black">نوێ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plan.slice(0, 200).flatMap(r =>
                        r.changes.map((c, idx) => (
                          <tr key={r.product.id + c.field.key}>
                            <td className="p-2.5 font-bold text-slate-800">{idx === 0 ? r.product.name : ''}</td>
                            <td className="p-2.5 text-xs text-slate-500 font-bold">{c.field.label}</td>
                            <td className="p-2.5 text-left font-mono text-slate-400 line-through" dir="ltr">{fmt(c.from, c.usd)}</td>
                            <td className={`p-2.5 text-left font-mono font-black ${c.to > c.from ? 'text-emerald-700' : 'text-rose-600'}`} dir="ltr">{fmt(c.to, c.usd)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {plan.length > 200 && (
                  <p className="p-2 text-center text-xs text-slate-400 font-bold bg-slate-50">… و {plan.length - 200} کاڵای تر</p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex gap-3 pb-safe">
          <button onClick={onClose} disabled={saving} className="flex-1 sm:flex-none sm:px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
            پاشگەزبوونەوە
          </button>
          <button
            onClick={apply}
            disabled={!valid || plan.length === 0 || saving}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black text-sm flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> نوێکردنەوە… {progress}/{plan.length}</>
            ) : (
              <><Check className="w-4 h-4" /> جێبەجێکردن بۆ {plan.length} کاڵا</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
