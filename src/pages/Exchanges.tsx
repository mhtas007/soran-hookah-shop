import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  RefreshCcw,
  Search,
  Package,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Camera,
  ScanLine,
  X
} from 'lucide-react';
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

export const Exchanges: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const settings = useAppStore(state => state.settings);
  const usdRate = settings.usdRate || 150000;
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart States
  const [returnedItems, setReturnedItems] = useState<any[]>([]); // Items customer brings back
  const [newItems, setNewItems] = useState<any[]>([]); // Items customer takes

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

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global Barcode Scanner Gun Listener
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = async (e: KeyboardEvent) => {
      const now = Date.now();
      if (document.activeElement?.tagName === 'TEXTAREA') return;

      if (now - lastKeyTime > 80) {
        scanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (scanBuffer.length >= 3) {
          e.preventDefault();
          const code = scanBuffer.replace(/^REC-/i, '').replace(/#/g, '').trim();
          setSearchQuery(code);
          await handleBarcodeScanned(code);
          scanBuffer = '';
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBarcodeScanned = async (code: string) => {
    if (!code || !code.trim()) return;
    const clean = code.replace(/^REC-/i, '').replace(/#/g, '').trim().toLowerCase();

    try {
      setIsSearching(true);
      
      // 1. Check if it's a receipt barcode or receipt number first
      let saleData: any[] = [];
      const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
      const isHexPrefix = /^[0-9a-f]{1,8}$/i.test(clean);

      if (isFullUuid) {
        const res = await supabase
          .from('sales')
          .select('id, created_at, total_amount')
          .eq('id', clean)
          .limit(1);
        saleData = res.data || [];
      } else if (isHexPrefix) {
        const minUuid = clean.padEnd(8, '0') + '-0000-0000-0000-000000000000';
        const maxUuid = clean.padEnd(8, 'f') + '-ffff-ffff-ffff-ffffffffffff';
        const res = await supabase
          .from('sales')
          .select('id, created_at, total_amount')
          .gte('id', minUuid)
          .lte('id', maxUuid)
          .order('created_at', { ascending: false })
          .limit(1);
        saleData = res.data || [];
      }

      if (saleData && saleData.length > 0) {
        const foundSale = saleData[0];
        const { data: items } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', foundSale.id);

        if (items && items.length > 0) {
          playScanBeep();
          const formatted = items.map(it => ({
            id: it.product_id || it.id,
            name: it.name,
            selling_price: it.price,
            cost_price: it.cost || 0,
            quantity: it.quantity
          }));
          setReturnedItems(formatted);
          showToast(`وەسڵی #${foundSale.id.substring(0, 8).toUpperCase()} دۆزرایەوە! ${items.length} کاڵا خرانە بەشی گەڕاوە.`);
          setSearchQuery('');
          setSearchResults([]);
          return;
        }
      }

      // 2. Otherwise check if it's a single product barcode (exact or partial)
      let { data: product } = await supabase
        .from('products')
        .select('*')
        .or(`barcode.eq.${clean},id.eq.${clean}`)
        .limit(1);

      if (!product || product.length === 0) {
        const pRes = await supabase
          .from('products')
          .select('*')
          .or(`barcode.ilike.%${clean}%,name.ilike.%${clean}%`)
          .limit(1);
        product = pRes.data;
      }

      if (product && product.length > 0) {
        playScanBeep();
        addToList(product[0], 'new');
        showToast(`کاڵای (${product[0].name}) زیادکرا`);
      } else {
        alert(`هیچ کاڵا یان وەصڵێک بە کۆدی (${clean}) نەدۆزرایەوە.`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  // Search Products (Debounced for manual typing)
  useEffect(() => {
    const searchProducts = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const clean = searchQuery.replace(/^REC-/i, '').replace(/#/g, '').trim();
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .or(`name.ilike.%${clean}%,barcode.ilike.%${clean}%`)
          .limit(10);

        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error('Error searching products:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchProducts, 250);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const addToList = (product: any, listType: 'return' | 'new') => {
    const setList = listType === 'return' ? setReturnedItems : setNewItems;
    setList(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { 
        ...product, 
        selling_price: product.selling_price || 0,
        cost_price: product.cost_price || 0,
        quantity: 1 
      }];
    });
    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  const updateQuantity = (id: string, delta: number, listType: 'return' | 'new') => {
    const setList = listType === 'return' ? setReturnedItems : setNewItems;
    setList(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeItem = (id: string, listType: 'return' | 'new') => {
    const setList = listType === 'return' ? setReturnedItems : setNewItems;
    setList(prev => prev.filter(item => item.id !== id));
  };

  const totalReturnVal = returnedItems.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
  const totalNewVal = newItems.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
  const difference = totalNewVal - totalReturnVal;

  const handleCompleteExchange = async () => {
    if (returnedItems.length === 0 && newItems.length === 0) return;
    
    let confirmMsg = `دڵنیایت لە ئەنجامدانی ئەم گۆڕینەوەیە؟\n\n`;
    if (difference > 0) {
      confirmMsg += `کڕیار دەبێت بڕی (${difference.toLocaleString()} IQD) پارەی زیادە بدات.`;
    } else if (difference < 0) {
      confirmMsg += `فرۆشگا دەبێت بڕی (${Math.abs(difference).toLocaleString()} IQD) پارە بگەڕێنێتەوە بۆ کڕیار.`;
    } else {
      confirmMsg += `بەهای کاڵاکان یەکسانە و هیچ پارەیەک گۆڕینەوەی بۆ ناکرێت.`;
    }

    if (!confirm(confirmMsg)) return;

    setIsProcessing(true);
    try {
      // 1. Update Product Stocks
      // Returned items go back to stock (+)
      await adjustStock(returnedItems.map(item => ({ id: item.id, delta: item.quantity })));
      
      // New items go out of stock (-)
      await adjustStock(newItems.map(item => ({ id: item.id, delta: -item.quantity })), true);

      // 2. Handle Money Difference
      if (difference > 0) {
        // Customer needs to pay the difference -> Log as Sale
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .insert({
            cashier_id: currentUser?.id,
            total_amount: difference,
            total_profit: 0,
            payment_method: 'Cash',
            payment_amount: difference,
            status: 'Completed'
          })
          .select()
          .single();

        if (saleError) throw saleError;

        if (newItems.length > 0) {
          const saleItemsData = newItems.map(item => ({
            sale_id: saleData.id,
            product_id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.selling_price,
            cost: item.cost_price
          }));
          await supabase.from('sale_items').insert(saleItemsData);
        }

      } else if (difference < 0) {
        // We owe the customer money -> Log as Expense
        const { error: expenseError } = await supabase
          .from('expenses')
          .insert({
            amount: Math.abs(difference),
            category: 'گەڕانەوە و گۆڕین',
            notes: `پێدانەوەی جیاوازی پارە لە کاتی گۆڕینەوەی کاڵا. بەکارهێنەر: ${currentUser?.name || 'نەزانراو'}`
          });
        if (expenseError) throw expenseError;
      }

      await logActivity(
        'PRODUCT_EXCHANGED',
        `گۆڕینەوەی کاڵا ئەنجامدرا. کاڵای گەڕاوە: (${returnedItems.length} دانە)، کاڵای نوێ: (${newItems.length} دانە). جیاوازی: ${difference.toLocaleString()} IQD`,
        { returnedItems, newItems, difference }
      );

      alert('گۆڕینەوەکە بە سەرکەوتوویی جێبەجێ کرا و مەوجوودی کۆگا نوێکرایەوە!');
      setReturnedItems([]);
      setNewItems([]);
      searchInputRef.current?.focus();
    } catch (error: any) {
      console.error('Error completing exchange:', error);
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-kurdish animate-in select-none">
      
      {/* ─── Notification Toast ─── */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-cyan-700 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 font-bold text-xs animate-in border border-cyan-500">
          <CheckCircle2 className="w-4 h-4 text-cyan-200" />
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-200">
              <RefreshCcw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight">
                گۆڕینەوەی ڕاستەوخۆی کاڵا (Exchange)
              </h1>
              <p className="text-xs text-slate-400 font-medium">سکانکردن یان نووسینی ژمارەی وەسڵ (#)، بارکۆدی کاڵا بە سکانەر یان کامێرا</p>
            </div>
          </div>
        </div>

        {/* Quick Nav to Returns */}
        <button 
          onClick={() => navigate('/returns')} 
          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-2xs active:scale-95"
        >
          <RotateCcw className="w-4 h-4" />
          <span>گەڕاندنەوە بەپێی وەسڵ (Returns)</span>
        </button>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Search Bar Container */}
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 p-5 relative z-30" ref={searchRef}>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-xs font-black text-slate-700">
              سکان یان گەڕان بە ژمارەی وەسڵ، بارکۆدی کاڵا، یان ناوی کاڵا:
            </label>
            <span className="text-[11px] font-bold text-cyan-700 flex items-center gap-1 font-mono">
              <ScanLine className="w-3.5 h-3.5" />
              سکانەر ئامادەیە
            </span>
          </div>
          
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeScanned(searchQuery);
                  }
                }}
                placeholder="ژمارەی وەسڵ (وەک 76FA64C7#)، بارکۆد، یان ناوی کاڵا..."
                className="w-full bg-slate-50 pl-10 pr-12 py-3.5 rounded-2xl border border-slate-200 focus:border-cyan-500 focus:bg-white outline-none transition-all text-sm font-bold shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                  title="سڕینەوە"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {isSearching && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              className="px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl transition-all flex items-center justify-center gap-2 shrink-0 shadow-md shadow-cyan-600/20 active:scale-95 text-xs font-black"
              title="سکانکردنی بارکۆد یان وەسڵ بە کامێرا"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">سکان بە کامێرا</span>
            </button>
          </div>

          {/* Search Dropdown Results */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-40 max-h-80 overflow-y-auto divide-y divide-slate-100">
              {searchResults.map(product => (
                <div
                  key={product.id}
                  className="p-3.5 hover:bg-cyan-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors"
                >
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{product.name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5" dir="ltr">
                      <span className="font-bold text-cyan-700">{(product.selling_price || 0).toLocaleString()} IQD</span>
                      <span>|</span>
                      <span>مەوجوود: {product.stock_level} دانە</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button 
                      onClick={() => addToList(product, 'return')}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-black text-xs transition-colors flex items-center gap-1"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      کڕیار دەیهێنێتەوە
                    </button>
                    
                    <button 
                      onClick={() => addToList(product, 'new')}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-black text-xs transition-colors flex items-center gap-1"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      کڕیار دەیبات
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Two Columns Exchange Grid ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. Returned Items Card (Red) */}
          <div className="bg-white rounded-3xl shadow-xs border border-rose-200 p-5 space-y-4 flex flex-col h-full">
            <div className="flex justify-between items-center border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">کاڵای گەڕاوە (کڕیار دەیهێنێتەوە)</h3>
                  <p className="text-[11px] text-slate-400">دەگەڕێتەوە ناو مەوجوودی کۆگا (+)</p>
                </div>
              </div>
              <span className="font-mono font-black text-xs bg-rose-100 text-rose-800 px-2.5 py-1 rounded-xl">
                {returnedItems.length} کاڵا
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto min-h-[200px]">
              {returnedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300 text-center">
                  <Package className="w-10 h-10 mb-2 opacity-50" />
                  <p className="text-xs font-bold text-slate-400">هیچ کاڵایەکی گەڕاوە دیارینەکراوە</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">بارکۆدی وەسڵ لێبدە یان کاڵا هەڵبژێرە بە "کڕیار دەیهێنێتەوە"</p>
                </div>
              ) : (
                returnedItems.map(item => (
                  <div key={item.id} className="p-3 bg-rose-50/50 rounded-2xl border border-rose-100 flex justify-between items-center gap-2">
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 text-xs">{item.name}</p>
                      <p className="text-[11px] font-mono text-rose-700 font-bold" dir="ltr">
                        {(item.selling_price * item.quantity).toLocaleString()} IQD
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                        <button 
                          onClick={() => updateQuantity(item.id, -1, 'return')}
                          className="p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2.5 font-mono font-bold text-xs">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1, 'return')}
                          className="p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button 
                        onClick={() => removeItem(item.id, 'return')}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">کۆی بەهای کاڵای گەڕاوە:</span>
              <span className="text-lg font-black text-rose-600 font-mono" dir="ltr">
                {totalReturnVal.toLocaleString('en-US')} IQD
              </span>
            </div>
          </div>

          {/* 2. New Items Card (Green) */}
          <div className="bg-white rounded-3xl shadow-xs border border-emerald-200 p-5 space-y-4 flex flex-col h-full">
            <div className="flex justify-between items-center border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">کاڵای نوێ (کڕیار دەیبات)</h3>
                  <p className="text-[11px] text-slate-400">دەردەچێت لە مەوجوودی کۆگا (-)</p>
                </div>
              </div>
              <span className="font-mono font-black text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-xl">
                {newItems.length} کاڵا
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto min-h-[200px]">
              {newItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300 text-center">
                  <Package className="w-10 h-10 mb-2 opacity-50" />
                  <p className="text-xs font-bold text-slate-400">هیچ کاڵایەکی نوێ دیارینەکراوە</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">بارکۆدی کاڵای نوێ لێبدە یان کلیک لە "کڕیار دەیبات" بکە</p>
                </div>
              ) : (
                newItems.map(item => (
                  <div key={item.id} className="p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex justify-between items-center gap-2">
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 text-xs">{item.name}</p>
                      <p className="text-[11px] font-mono text-emerald-700 font-bold" dir="ltr">
                        {(item.selling_price * item.quantity).toLocaleString()} IQD
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                        <button 
                          onClick={() => updateQuantity(item.id, -1, 'new')}
                          className="p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2.5 font-mono font-bold text-xs">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1, 'new')}
                          className="p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button 
                        onClick={() => removeItem(item.id, 'new')}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">کۆی بەهای کاڵای نوێ:</span>
              <span className="text-lg font-black text-emerald-600 font-mono" dir="ltr">
                {totalNewVal.toLocaleString('en-US')} IQD
              </span>
            </div>
          </div>

        </div>

        {/* ─── Bottom Summary & Settlement Card ─── */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-6">
          
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
              difference > 0 ? 'bg-emerald-500 text-white' : difference < 0 ? 'bg-rose-500 text-white' : 'bg-slate-700 text-white'
            }`}>
              <Scale className="w-6 h-6" />
            </div>

            <div>
              <span className="text-xs text-slate-400 font-bold block mb-0.5">
                {difference > 0 
                  ? 'کڕیار دەبێت پارەی زیادە بدات (دەچێتە سندوق):' 
                  : difference < 0 
                  ? 'فرۆشگا دەبێت پارە بگەڕێنێتەوە بۆ کڕیار:' 
                  : 'جیاوازی نرخ (یەکسانە):'}
              </span>

              <h3 className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                difference > 0 ? 'text-emerald-400' : difference < 0 ? 'text-rose-400' : 'text-slate-200'
              }`} dir="ltr">
                {Math.abs(difference).toLocaleString('en-US')} IQD
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                setReturnedItems([]);
                setNewItems([]);
              }}
              className="flex-1 sm:flex-none px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
            >
              پاککردنەوە
            </button>

            <button
              disabled={(returnedItems.length === 0 && newItems.length === 0) || isProcessing}
              onClick={handleCompleteExchange}
              className="flex-1 sm:flex-none px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-600/30 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isProcessing ? 'خەریکی ئەنجامدانە...' : 'پەسەندکردنی گۆڕینەوە'}</span>
            </button>
          </div>

        </div>

      </main>

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={async (scannedCode) => {
          const clean = scannedCode.replace(/^REC-/i, '').replace(/#/g, '').trim();
          setSearchQuery(clean);
          await handleBarcodeScanned(clean);
        }}
        title="سکانکردنی وەسڵ یان بارکۆدی کاڵا بە کامێرا"
      />

    </div>
  );
};
