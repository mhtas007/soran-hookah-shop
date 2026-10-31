import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  Package,
  Plus,
  Minus,
  Receipt,
  Clock,
  CheckCircle2,
  RefreshCcw,
  RotateCcw,
  Camera,
  ScanLine,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { adjustStock } from '../lib/salesApi';
import { useAppStore } from '../store/useAppStore';
import { logActivity } from '../lib/activityLogger';
import { CameraBarcodeScanner } from '../components/CameraBarcodeScanner';

const playScanBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6 tone
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
    if (navigator.vibrate) navigator.vibrate(80);
  } catch (e) {
    // Audio restricted
  }
};

export const Returns: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const settings = useAppStore(state => state.settings);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [sales, setSales] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected Sale State
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [returnItems, setReturnItems] = useState<{ [key: string]: number }>({});
  
  const [isProcessing, setIsProcessing] = useState(false);

  // Auto focus input on mount for physical scanner guns
  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Global Barcode Scanner Gun Listener (captures rapid keyboard inputs from barcode readers)
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = async (e: KeyboardEvent) => {
      const now = Date.now();
      
      // If typing in a textarea, skip
      if (document.activeElement?.tagName === 'TEXTAREA') return;

      // Physical scanners send keys in < 60ms intervals
      if (now - lastKeyTime > 80) {
        scanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (scanBuffer.length >= 4) {
          e.preventDefault();
          const code = scanBuffer.replace(/^REC-/i, '').replace(/#/g, '').trim();
          setSearchQuery(code);
          await lookupAndSelectSale(code);
          scanBuffer = '';
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch recent sales initially or search by ID
  useEffect(() => {
    fetchSales();
  }, [searchQuery]);

  const lookupAndSelectSale = async (code: string) => {
    if (!code || !code.trim()) return;
    const clean = code.replace(/^REC-/i, '').replace(/#/g, '').trim().toLowerCase();

    try {
      setIsSearching(true);
      let data: any[] = [];
      const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
      const isHexPrefix = /^[0-9a-f]{1,8}$/i.test(clean);

      if (isFullUuid) {
        const res = await supabase
          .from('sales')
          .select('*, customer:debt_customer_id(name, phone)')
          .eq('id', clean);
        data = res.data || [];
      } else if (isHexPrefix) {
        const minUuid = clean.padEnd(8, '0') + '-0000-0000-0000-000000000000';
        const maxUuid = clean.padEnd(8, 'f') + '-ffff-ffff-ffff-ffffffffffff';
        const res = await supabase
          .from('sales')
          .select('*, customer:debt_customer_id(name, phone)')
          .gte('id', minUuid)
          .lte('id', maxUuid)
          .order('created_at', { ascending: false })
          .limit(10);
        data = res.data || [];
      }

      // Fallback: check in loaded sales
      if (!data || data.length === 0) {
        const found = sales.find((s: any) => {
          const shortId = (s.id || '').substring(0, 8).toLowerCase();
          const fullId = (s.id || '').toLowerCase();
          const custName = (s.customer?.name || '').toLowerCase();
          const custPhone = (s.customer?.phone || '');
          return shortId === clean || shortId.includes(clean) || fullId.includes(clean) || custName.includes(clean) || custPhone.includes(clean);
        });
        if (found) {
          data = [found];
        }
      }

      if (data && data.length > 0) {
        playScanBeep();
        await handleSelectSale(data[0]);
        showToast(`وەسڵی #${data[0].id.substring(0, 8).toUpperCase()} بە سەرکەوتوویی دۆزرایەوە`);
      } else {
        alert(`هیچ وەسڵێک بە ژمارە یان بارکۆدی (${code}) نەدۆزرایەوە.`);
      }
    } catch (err) {
      console.error('Auto scan lookup error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchSales = async () => {
    setIsSearching(true);
    try {
      const clean = searchQuery.replace(/^REC-/i, '').replace(/#/g, '').trim().toLowerCase();
      let query = supabase
        .from('sales')
        .select('*, customer:debt_customer_id(name, phone)')
        .eq('status', 'Completed')
        .order('created_at', { ascending: false });

      const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
      const isHexPrefix = /^[0-9a-f]{1,8}$/i.test(clean);

      if (clean) {
        if (isFullUuid) {
          query = query.eq('id', clean);
        } else if (isHexPrefix) {
          const minUuid = clean.padEnd(8, '0') + '-0000-0000-0000-000000000000';
          const maxUuid = clean.padEnd(8, 'f') + '-ffff-ffff-ffff-ffffffffffff';
          query = query.gte('id', minUuid).lte('id', maxUuid).limit(30);
        } else {
          query = query.limit(100);
        }
      } else {
        query = query.limit(40);
      }

      const { data, error } = await query;
      if (error) throw error;

      let finalSales = data || [];
      if (clean && !isFullUuid && !isHexPrefix) {
        finalSales = finalSales.filter((s: any) => {
          const shortId = (s.id || '').substring(0, 8).toLowerCase();
          const custName = (s.customer?.name || '').toLowerCase();
          const custPhone = (s.customer?.phone || '');
          const dateStr = s.created_at ? format(new Date(s.created_at), 'yyyy-MM-dd') : '';
          return (
            shortId.includes(clean) ||
            custName.includes(clean) ||
            custPhone.includes(clean) ||
            dateStr.includes(clean)
          );
        });
      }

      setSales(finalSales);

      // If exact 1 match found during scan or manual typing
      if (finalSales && finalSales.length === 1 && (isFullUuid || clean.length === 8)) {
        handleSelectSale(finalSales[0]);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSale = async (sale: any) => {
    setSelectedSale(sale);
    setReturnItems({});
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id);
      
      if (error) throw error;
      setSaleItems(data || []);
    } catch (error) {
      console.error('Error fetching sale items:', error);
    }
  };

  const handleReturnQuantityChange = (itemId: string, maxQuantity: number, delta: number) => {
    setReturnItems(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, Math.min(maxQuantity, current + delta));
      if (next === 0) {
        const newObj = { ...prev };
        delete newObj[itemId];
        return newObj;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const handleReturnAll = (item: any) => {
    setReturnItems(prev => ({
      ...prev,
      [item.id]: item.quantity
    }));
  };

  // Calculate total refund based on returnItems
  const totalRefund = saleItems.reduce((sum, item) => {
    const returnQty = returnItems[item.id] || 0;
    return sum + (item.price * returnQty);
  }, 0);

  const itemsToReturnCount = Object.values(returnItems).reduce((sum, qty) => sum + qty, 0);

  const handleCompleteReturn = async () => {
    if (itemsToReturnCount === 0) return;
    
    if (!confirm(`دڵنیایت لە گەڕاندنەوەی ${itemsToReturnCount} دانە کاڵا؟\nکۆی پارەی گەڕاوە بۆ کڕیار: ${totalRefund.toLocaleString('en-US')} IQD`)) {
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Update Product Stocks and Sale Items
      for (const item of saleItems) {
        const returnQty = returnItems[item.id];
        if (!returnQty) continue;

        // Add back to product stock — convert تەک / نیو تەک back to pieces
        const { data: currentProduct } = await supabase
          .from('products')
          .select('bulk_size')
          .eq('id', item.product_id)
          .maybeSingle();
        const bulkSize = Number(currentProduct?.bulk_size) || 1;
        const itemName: string = item.name || '';
        const perUnit = itemName.endsWith(' (نیو تەک)') ? bulkSize / 2 : itemName.endsWith(' (تەک)') ? bulkSize : 1;
        if (item.product_id) {
          await adjustStock([{ id: item.product_id, delta: returnQty * perUnit }]);
        }

        // Deduct from sale_items to reflect in reports
        const newQty = item.quantity - returnQty;
        if (newQty <= 0) {
          await supabase.from('sale_items').delete().eq('id', item.id);
        } else {
          await supabase.from('sale_items').update({ quantity: newQty }).eq('id', item.id);
        }
      }

      // 2. Handle Money Return & Sales Update
      if (totalRefund > 0) {
        const newSaleTotal = Math.max(0, selectedSale.total_amount - totalRefund);
        await supabase.from('sales').update({ total_amount: newSaleTotal }).eq('id', selectedSale.id);

        if (selectedSale.payment_method === 'Debt' && selectedSale.debt_customer_id) {
          // Decrease Customer Debt
          const { data: customer } = await supabase.from('customers').select('*').eq('id', selectedSale.debt_customer_id).single();
          if (customer) {
            await supabase.from('customers').update({
              total_purchases: Math.max(0, customer.total_purchases - totalRefund),
              remaining_debt: Math.max(0, customer.remaining_debt - totalRefund)
            }).eq('id', selectedSale.debt_customer_id);
          }
        }
      }

      await logActivity(
        'SALE_RETURNED',
        `گەڕاندنەوەی وەسڵی #${selectedSale.id.substring(0, 8)}. کۆی پارەی گەڕاوە: ${totalRefund.toLocaleString('en-US')} IQD (${itemsToReturnCount} دانە)`,
        { saleId: selectedSale.id, totalRefund, itemsCount: itemsToReturnCount }
      );

      alert('گەڕاندنەوەکە بە سەرکەوتوویی جێبەجێ کرا! مەوجوودی کۆگا نوێکرایەوە و پارەکە دەرهێنرا.');
      
      // Refresh list
      fetchSales();
      setSelectedSale(null);
      setSaleItems([]);
      setReturnItems({});
      searchInputRef.current?.focus();
    } catch (error: any) {
      console.error('Error completing return:', error);
      alert('کێشەیەک ڕوویدا لە کاتی گەڕاندنەوەدا: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-kurdish animate-in select-none">
      
      {/* ─── Notification Toast ─── */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 font-bold text-xs animate-in border border-emerald-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-100" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─── Header ─── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 hover:bg-slate-100 rounded-full transition-colors border border-slate-200/60"
            title="گەڕانەوە بۆ داشبۆرد"
          >
            <ArrowRight className="w-5 h-5 text-slate-600" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center text-white shadow-md shadow-rose-200">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight">
                گەڕاندنەوەی کاڵا بەپێی وەسڵ (Returns)
              </h1>
              <p className="text-xs text-slate-400 font-medium">گەڕان بە ژمارەی وەسڵ (#)، بارکۆد، ناوی کڕیار، یان کامێرا و سکانەر</p>
            </div>
          </div>
        </div>

        {/* Quick Nav to Exchanges */}
        <button 
          onClick={() => navigate('/exchanges')} 
          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-2xs active:scale-95"
        >
          <RefreshCcw className="w-4 h-4" />
          <span>پەڕەی گۆڕینەوەی کاڵا (Exchange)</span>
        </button>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Recent / Searched Invoices */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 p-5 flex flex-col h-[calc(100vh-140px)] sticky top-24">
            
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-600" />
                گەڕان بە ژمارەی وەسڵ یان بارکۆد
              </h2>
              <span className="text-[11px] font-bold text-slate-400 font-mono">
                {sales.length} وەسڵ
              </span>
            </div>
            
            {/* Search Input & Camera Button */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      lookupAndSelectSale(searchQuery);
                    }
                  }}
                  placeholder="ژمارەی وەسڵ (وەک 76FA64C7#) یان بارکۆد..."
                  className="w-full bg-slate-50 pl-9 pr-10 py-2.5 rounded-2xl border border-slate-200 focus:border-rose-500 focus:bg-white outline-none transition-all text-xs font-bold font-mono text-slate-800"
                  dir="ltr"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                    title="سڕینەوە"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowCameraScanner(true)}
                className="px-3 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-2xl transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-2xs active:scale-95 font-bold text-xs"
                title="سکانکردنی وەسڵ بە کامێرا"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">کامێرا</span>
              </button>
            </div>

            {/* Hint Badge for Barcode Scanner Gun and Receipt Number */}
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-2.5 mb-3 flex items-start gap-2 text-[11px] text-rose-800 font-medium leading-relaxed">
              <ScanLine className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>ژمارەی ٨ پیتی سەر وەسڵەکە بنووسە (وەک <b className="font-mono" dir="ltr">#76FA64C7</b>) یان بە بارکۆدخوان ڕاستەوخۆ لێی بدە.</span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {isSearching ? (
                <div className="text-center py-12 text-slate-400 text-xs">خەریکی گەڕانە...</div>
              ) : sales.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">هیچ وەصڵێک نەدۆزرایەوە</div>
              ) : (
                sales.map(sale => {
                  const isSelected = selectedSale?.id === sale.id;
                  return (
                    <button
                      key={sale.id}
                      onClick={() => handleSelectSale(sale)}
                      className={`w-full text-right p-3.5 rounded-2xl border transition-all ${
                        isSelected 
                          ? 'bg-rose-50 border-rose-300 shadow-xs' 
                          : 'bg-white border-slate-200/70 hover:border-rose-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-mono text-xs font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200" dir="ltr">
                          #{sale.id.substring(0, 8)}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(sale.created_at), 'hh:mm a')}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800">
                          {sale.customer?.name || 'کڕیاری گشتی'}
                        </span>
                        <span className="font-mono font-black text-rose-600" dir="ltr">
                          {sale.total_amount.toLocaleString('en-US')} IQD
                        </span>
                      </div>

                      <div className="mt-1.5 flex justify-between items-center text-[10px] text-slate-400">
                        <span>شێواز: {sale.payment_method === 'Cash' ? 'نەقد' : sale.payment_method === 'FIB' ? 'FIB' : 'قەرز'}</span>
                        <span>{format(new Date(sale.created_at), 'yyyy-MM-dd')}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Selected Invoice Items & Return Manager */}
        <div className="lg:col-span-2">
          {!selectedSale ? (
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 p-12 h-full min-h-[450px] flex flex-col items-center justify-center text-slate-400 text-center">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mb-4 border border-rose-100">
                <Receipt className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-1">ژمارەی وەسڵ بنووسە یان بارکۆدەکەی سکان بکە</h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                ژمارەی سەرەوەی وەسڵ (نموونە: <span className="font-mono font-bold text-rose-600" dir="ltr">#76FA64C7</span>) لە خانەی گەڕان بنووسە یان بە بارکۆدخوان سکانی بکە تا وەسڵەکە و کاڵاکانی پێشان بدات.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden flex flex-col h-full">
              
              {/* Invoice Header Details */}
              <div className="p-5 bg-gradient-to-r from-slate-50 to-rose-50/40 border-b border-slate-200/80 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-black bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-lg border border-rose-200" dir="ltr">
                      وەسڵ #{selectedSale.id.substring(0, 8)}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      {selectedSale.customer?.name || 'کڕیاری گشتی'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono" dir="ltr">
                    بەروار: {format(new Date(selectedSale.created_at), 'yyyy-MM-dd hh:mm a')} | شێواز: {selectedSale.payment_method}
                  </p>
                </div>

                <div className="text-left">
                  <span className="text-xs font-bold text-slate-500 block mb-0.5">کۆی پێشووی وەسڵ:</span>
                  <span className="text-lg font-black font-mono text-slate-900" dir="ltr">
                    {selectedSale.total_amount.toLocaleString('en-US')} IQD
                  </span>
                </div>
              </div>

              {/* Items in Invoice */}
              <div className="flex-1 p-5 overflow-y-auto space-y-3">
                <h3 className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" />
                  کاڵاکانی ناو ئەم وەصڵە (بڕی گەڕاوە دیاریبکە):
                </h3>

                {saleItems.map(item => {
                  const returnQty = returnItems[item.id] || 0;
                  const itemTotal = item.price * item.quantity;
                  const itemRefund = item.price * returnQty;

                  return (
                    <div 
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        returnQty > 0 
                          ? 'bg-rose-50/70 border-rose-300 shadow-xs' 
                          : 'bg-slate-50/60 border-slate-200/70 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex-1">
                          <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                          <div className="flex items-center gap-3 text-xs text-slate-500 font-mono mt-1" dir="ltr">
                            <span>نرخ: {item.price.toLocaleString()} IQD</span>
                            <span>|</span>
                            <span>کڕدراو: {item.quantity} دانە</span>
                            <span>|</span>
                            <span className="font-bold text-slate-800">کۆی گشتی: {itemTotal.toLocaleString()} IQD</span>
                          </div>
                        </div>

                        {/* Return Stepper Controls */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => handleReturnAll(item)}
                            className="text-[10px] font-bold px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                          >
                            هەمووی ({item.quantity})
                          </button>

                          <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                            <button
                              onClick={() => handleReturnQuantityChange(item.id, item.quantity, -1)}
                              disabled={returnQty === 0}
                              className="p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <span className="px-3 font-mono font-black text-sm text-slate-800 min-w-8 text-center">
                              {returnQty}
                            </span>

                            <button
                              onClick={() => handleReturnQuantityChange(item.id, item.quantity, 1)}
                              disabled={returnQty >= item.quantity}
                              className="p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {returnQty > 0 && (
                            <span className="font-mono font-black text-rose-600 text-xs min-w-20 text-left" dir="ltr">
                              -{itemRefund.toLocaleString()} IQD
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Refund Summary & Confirmation Bar */}
              <div className="p-5 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-0.5">کۆی پارەی گێڕدراوە بۆ کڕیار:</span>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-black text-rose-600 font-mono" dir="ltr">
                      {totalRefund.toLocaleString('en-US')} IQD
                    </h3>
                    <span className="text-xs font-bold text-slate-400 font-mono">
                      ({itemsToReturnCount} دانە کاڵا)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setSelectedSale(null);
                      setReturnItems({});
                    }}
                    className="flex-1 sm:flex-none px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    پاشگەزبوونەوە
                  </button>

                  <button
                    disabled={itemsToReturnCount === 0 || isProcessing}
                    onClick={handleCompleteReturn}
                    className="flex-1 sm:flex-none px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isProcessing ? 'خەریکی گەڕاندنەوەیە...' : 'پەسەندکردنی گەڕاندنەوە'}</span>
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>

      </main>

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={async (scannedCode) => {
          const clean = scannedCode.replace(/^REC-/i, '').replace(/#/g, '').trim();
          setSearchQuery(clean);
          await lookupAndSelectSale(clean);
        }}
        title="سکانکردنی بارکۆدی وەسڵ بە کامێرا"
      />

    </div>
  );
};
