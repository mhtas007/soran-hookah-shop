import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  Printer,
  CreditCard,
  Banknote,
  ArrowDownToLine,
  Gift,
  Lock,
  X,
  Package,
  DollarSign,
  User,
  Sparkles,
  Layers,
  CheckCircle2
} from 'lucide-react';
import type { Product, CartItem, PaymentMethod, Customer } from '../types';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { processSale } from '../lib/salesApi';
import { useAppStore } from '../store/useAppStore';
import { logActivity } from '../lib/activityLogger';
import { ThermalReceipt, type ReceiptData } from '../components/ThermalReceipt';

const playScanBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6 tone
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) {}
};

export const POS: React.FC = () => {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const refocusSearch = () => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [activeSection, setActiveSection] = useState<'General' | 'V'>('General');
  
  const usdRate = useAppStore(state => state.settings.usdRate) || 150000;
  const currentUser = useAppStore(state => state.currentUser);
  const isAdminOrManager = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';
  
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  
  // Weight / Meter Modal State
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [selectedWeightProduct, setSelectedWeightProduct] = useState<Product | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightInputType, setWeightInputType] = useState<'grams' | 'money'>('grams');

  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [completedReceiptData, setCompletedReceiptData] = useState<ReceiptData | null>(null);
  
  // Duplicate Barcode Modal State
  const [duplicateMatches, setDuplicateMatches] = useState<{ product: Product; unit: 'Piece' | 'Taka' }[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  
  // New Customer State
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Real-time Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  // Global Barcode Scanner Gun Listener
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const activeTag = document.activeElement?.tagName;
      const isInputActive = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      // Physical scanners send keys in rapid succession (< 80ms)
      if (now - lastKeyTime > 80) {
        scanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (scanBuffer.length >= 3) {
          e.preventDefault();
          const code = scanBuffer.trim();
          handleScannedBarcode(code);
          scanBuffer = '';
          setSearchTerm('');
        }
      } else if (e.key.length === 1 && !isInputActive) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products]);

  const fetchData = async () => {
    try {
      const [productsRes, customersRes] = await Promise.all([
        fetchAllRows(() => supabase.from('products').select('*').order('created_at', { ascending: false })),
        fetchAllRows(() => supabase.from('customers').select('*').order('name', { ascending: true }))
      ]);

      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;

      setProducts(productsRes.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        costPrice: p.cost_price,
        sellingPrice: p.selling_price,
        category: p.category,
        stockLevel: p.stock_level,
        minStockAlert: p.min_stock_alert,
        section: p.section || 'General',
        company: p.company,
        bulkCost: p.bulk_cost || 0,
        bulkPrice: p.bulk_price || 0,
        halfBulkCost: p.half_bulk_cost || 0,
        halfBulkPrice: p.half_bulk_price || 0,
        bulkSize: p.bulk_size || 1,
        bulkBarcode: p.bulk_barcode || '',
        currency: p.currency || 'IQD',
        costCurrency: p.cost_currency || 'IQD',
        expiryDate: p.expiry_date || '',
        createdAt: p.created_at,
        updatedAt: p.updated_at
      })));

      setCustomers(customersRes.data.map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone, totalPurchases: c.total_purchases,
        totalPaid: c.total_paid, remainingDebt: c.remaining_debt, createdAt: c.created_at
      })));

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScannedBarcode = (code: string) => {
    const searchVal = code.trim().toUpperCase();
    if (!searchVal) return;

    // 1. Matches piece barcode
    const matchesPiece = products.filter(p => p.barcode?.toUpperCase() === searchVal);
    // 2. Matches carton / bulk barcode
    const matchesBulk = products.filter(p => p.bulkBarcode && p.bulkBarcode.toUpperCase() === searchVal);

    if (matchesBulk.length === 1 && matchesPiece.length === 0) {
      // Scanned carton barcode -> Add 1 Taka / Carton!
      addToCart(matchesBulk[0], 1, 'Taka');
      playScanBeep();
      refocusSearch();
    } else if (matchesPiece.length === 1 && matchesBulk.length === 0) {
      // Scanned piece barcode -> Add Piece (or open weight modal)
      handleProductClick(matchesPiece[0]);
      playScanBeep();
      refocusSearch();
    } else if (matchesPiece.length === 1 && matchesBulk.length === 1 && matchesPiece[0].id === matchesBulk[0].id) {
      // Same product has identical barcode on piece & carton
      handleProductClick(matchesPiece[0]);
      playScanBeep();
      refocusSearch();
    } else if (matchesPiece.length + matchesBulk.length > 1) {
      // Multiple items match
      const allMatches: { product: Product; unit: 'Piece' | 'Taka' }[] = [
        ...matchesPiece.map(p => ({ product: p, unit: 'Piece' as const })),
        ...matchesBulk.map(p => ({ product: p, unit: 'Taka' as const }))
      ];
      setDuplicateMatches(allMatches);
      setShowDuplicateModal(true);
    } else {
      // Try matching filtered items by name / substring
      const filtered = filteredProducts;
      if (filtered.length === 1) {
        handleProductClick(filtered[0]);
        playScanBeep();
        refocusSearch();
      }
    }
  };

  const categories = Array.from(new Set(products.filter(p => p.section === activeSection).map(p => p.category).filter(Boolean)));

  const filteredProducts = products.filter(p => {
    const matchesSection = p.section === activeSection;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.barcode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
    
    if (searchTerm) {
      return matchesSection && matchesSearch;
    }
    
    return matchesSection && matchesSearch && matchesCategory;
  });

  const handleProductClick = (product: Product) => {
    if (product.stockLevel <= 0) return;
    if (product.barcode.startsWith('WGT-') || product.barcode.startsWith('MTR-')) {
      setSelectedWeightProduct(product);
      setWeightInput('');
      setWeightInputType('grams');
      setShowWeightModal(true);
    } else {
      addToCart(product, 1);
    }
    refocusSearch();
  };

  const addToCart = (product: Product, quantityToAdd: number, unit: 'Piece' | 'HalfTaka' | 'Taka' = 'Piece') => {
    setCart(prev => {
      const deductionPerUnit = unit === 'Taka' ? product.bulkSize : (unit === 'HalfTaka' ? (product.bulkSize / 2) : 1);
      const quantityInPieces = quantityToAdd * deductionPerUnit;

      const currentCartStockInPieces = prev.filter(i => i.id === product.id).reduce((acc, i) => {
        const mult = i.sellUnit === 'Taka' ? i.bulkSize : (i.sellUnit === 'HalfTaka' ? (i.bulkSize / 2) : 1);
        return acc + i.quantity * mult;
      }, 0);

      if (currentCartStockInPieces + quantityInPieces > product.stockLevel) {
        alert(`بڕی پێویست لە کۆگا نییە. تەنها ${product.stockLevel} دانە ماوە.`);
        return prev;
      }

      const existing = prev.find(item => item.id === product.id && item.sellUnit === unit);
      if (existing) {
        return prev.map(item => 
          (item.id === product.id && item.sellUnit === unit) ? { ...item, quantity: item.quantity + quantityToAdd } : item
        );
      }
      return [...prev, { ...product, quantity: quantityToAdd, sellUnit: unit }];
    });
  };

  const updateQuantity = (id: string, sellUnit: 'Piece'|'HalfTaka'|'Taka'|undefined, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id && item.sellUnit === sellUnit) {
        const newQ = item.quantity + delta;
        const product = products.find(p => p.id === id);
        if (product) {
          const currentCartStockInPieces = prev.filter(i => i.id === product.id && i.sellUnit !== sellUnit).reduce((acc, i) => {
            const mult = i.sellUnit === 'Taka' ? i.bulkSize : (i.sellUnit === 'HalfTaka' ? (i.bulkSize / 2) : 1);
            return acc + i.quantity * mult;
          }, 0);
          const thisItemMult = sellUnit === 'Taka' ? product.bulkSize : (sellUnit === 'HalfTaka' ? (product.bulkSize / 2) : 1);
          if (currentCartStockInPieces + (newQ * thisItemMult) > product.stockLevel) return item;
        }
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const setExactQuantity = (id: string, sellUnit: 'Piece'|'HalfTaka'|'Taka'|undefined, qty: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id && item.sellUnit === sellUnit) {
        const product = products.find(p => p.id === id);
        if (product) {
          const currentCartStockInPieces = prev.filter(i => i.id === product.id && i.sellUnit !== sellUnit).reduce((acc, i) => {
            const mult = i.sellUnit === 'Taka' ? i.bulkSize : (i.sellUnit === 'HalfTaka' ? (i.bulkSize / 2) : 1);
            return acc + i.quantity * mult;
          }, 0);
          const thisItemMult = sellUnit === 'Taka' ? product.bulkSize : (sellUnit === 'HalfTaka' ? (product.bulkSize / 2) : 1);
          if (currentCartStockInPieces + (qty * thisItemMult) > product.stockLevel) return item;
        }
        return qty > 0 ? { ...item, quantity: qty } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id: string, sellUnit: 'Piece'|'HalfTaka'|'Taka'|undefined) => {
    setCart(prev => prev.filter(item => !(item.id === id && item.sellUnit === sellUnit)));
    refocusSearch();
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm("ئایا دڵنیایت لە بەتاڵکردنەوەی هەموو سەبەتەکە؟")) {
      setCart([]);
      refocusSearch();
    }
  };

  const toggleGift = (id: string, sellUnit: 'Piece'|'HalfTaka'|'Taka'|undefined) => {
    setCart(prev => prev.map(item => (item.id === id && item.sellUnit === sellUnit) ? { ...item, isGift: !item.isGift } : item));
  };

  const getItemTotals = (item: CartItem) => {
    if (item.isGift) return { amount: 0, rawAmount: 0, surplus: 0, profit: 0, isBulkActivated: false, unitLabel: '', unitPrice: 0 };
    
    const isWgt = item.barcode.startsWith('WGT-');
    const isMtr = item.barcode.startsWith('MTR-');
    const baseQty = isWgt ? item.quantity / 1000 : isMtr ? item.quantity / 100 : item.quantity;
    
    let saleAmountIQD = 0;
    let costAmountIQD = 0;
    let isBulkActivated = false;
    let unitLabel = '';

    const saleExchange = item.currency === 'USD' ? (usdRate / 100) : 1;
    const costExchange = (item.costCurrency || 'IQD') === 'USD' ? (usdRate / 100) : 1;
    
    if (item.sellUnit === 'Taka') {
      isBulkActivated = true;
      unitLabel = 'تەک';
      saleAmountIQD = (baseQty * item.bulkPrice) * saleExchange;
      costAmountIQD = (baseQty * item.bulkCost) * costExchange;
    } else if (item.sellUnit === 'HalfTaka') {
      isBulkActivated = false;
      unitLabel = 'نیو تەک';
      saleAmountIQD = (baseQty * (item.halfBulkPrice || (item.bulkPrice / 2))) * saleExchange;
      costAmountIQD = (baseQty * (item.halfBulkCost || (item.bulkCost / 2))) * costExchange;
    } else {
      unitLabel = isWgt ? 'کگم' : isMtr ? 'مەتر' : 'دانە';
      if (item.bulkSize > 1 && baseQty >= item.bulkSize) {
        isBulkActivated = true;
        const bulkCount = Math.floor(baseQty / item.bulkSize);
        const pieceCount = baseQty % item.bulkSize;
        
        saleAmountIQD = (bulkCount * item.bulkPrice + pieceCount * item.sellingPrice) * saleExchange;
        costAmountIQD = (bulkCount * item.bulkCost + pieceCount * item.costPrice) * costExchange;
      } else {
        saleAmountIQD = (baseQty * item.sellingPrice) * saleExchange;
        costAmountIQD = (baseQty * item.costPrice) * costExchange;
      }
    }

    const finalAmount = Math.round(saleAmountIQD);

    return { 
      amount: finalAmount, 
      profit: finalAmount - costAmountIQD, 
      isBulkActivated, 
      unitLabel,
      unitPrice: isWgt ? item.sellingPrice : isMtr ? item.sellingPrice : (item.sellUnit === 'Taka' ? item.bulkPrice : (item.sellUnit === 'HalfTaka' ? (item.halfBulkPrice || item.bulkPrice/2) : item.sellingPrice))
    };
  };

  const totalAmount = cart.reduce((sum, item) => sum + getItemTotals(item).amount, 0);
  const totalProfit = cart.reduce((sum, item) => sum + getItemTotals(item).profit, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + (item.barcode.startsWith('WGT-') ? 1 : item.barcode.startsWith('MTR-') ? 1 : item.quantity), 0);
  const totalAmountUSD = usdRate > 0 ? (totalAmount / (usdRate / 100)) : 0;

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName) return;
    setIsCreatingCustomer(true);
    try {
      const { data, error } = await supabase.from('customers').insert({
        name: newCustomerName,
        phone: newCustomerPhone
      }).select().single();
      
      if (error) throw error;
      
      setCustomers([...customers, {
        id: data.id, name: data.name, phone: data.phone, totalPurchases: 0, totalPaid: 0, remainingDebt: 0, createdAt: data.created_at
      }]);
      setSelectedCustomer(data.id);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
    } catch (error: any) {
      alert("کێشەیەک ڕوویدا لە دروستکردنی کڕیار: " + error.message);
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'Debt' && !selectedCustomer) {
      alert("تکایە کڕیارێک هەڵبژێرە بۆ فرۆشتنی بە قەرز");
      return;
    }
    
    setIsProcessing(true);
    
    const finalAmount = totalAmount - Number(discountAmount || 0);
    const finalProfit = totalProfit - Number(discountAmount || 0);
    
    try {
      // 1. Build the sale
      const salePayload = {
        total_amount: finalAmount,
        total_profit: finalProfit,
        payment_method: paymentMethod,
        // Debt sales have no upfront payment in this screen; cash/FIB are paid in full
        payment_amount: paymentMethod === 'Debt' ? 0 : finalAmount,
        debt_customer_id: paymentMethod === 'Debt' ? selectedCustomer : null,
        discount: Number(discountAmount || 0),
      };

      // 2. Sale items
      const saleItems = cart.map(item => {
        const totals = getItemTotals(item);
        const isWgt = item.barcode.startsWith('WGT-');
        const isMtr = item.barcode.startsWith('MTR-');
        const baseQty = isWgt ? (item.quantity / 1000) : isMtr ? (item.quantity / 100) : item.quantity;
        
        let unitSuffix = '';
        if (item.sellUnit === 'Taka') unitSuffix = ' (تەک)';
        else if (item.sellUnit === 'HalfTaka') unitSuffix = ' (نیو تەک)';

        return {
          product_id: item.id,
          name: item.name + unitSuffix,
          quantity: item.quantity,
          price: (isWgt || isMtr) ? totals.unitPrice : (totals.amount / (baseQty || 1)),
          cost: (isWgt || isMtr) ? item.costPrice : ((totals.amount - totals.profit) / (baseQty || 1))
        };
      });

      // 3. Stock to deduct (in pieces) — summed per product
      const stockMap = new Map<string, number>();
      for (const item of cart) {
        const deductionPerUnit = item.sellUnit === 'Taka' ? item.bulkSize : (item.sellUnit === 'HalfTaka' ? (item.bulkSize / 2) : 1);
        stockMap.set(item.id, (stockMap.get(item.id) || 0) + item.quantity * deductionPerUnit);
      }
      const stockChanges = Array.from(stockMap, ([id, qty]) => ({ id, qty }));

      // 4. Save everything in one transaction
      const saleData = await processSale(
        salePayload,
        saleItems,
        stockChanges,
        paymentMethod === 'Debt' && selectedCustomer ? { customerId: selectedCustomer, amount: finalAmount } : null,
      );

      // 5. Activity Logger
      await logActivity(
        'SALE_COMPLETED',
        `بڕی: ${finalAmount.toLocaleString('en-US').replace(/,/g, '.')} IQD`,
        { saleId: saleData.id, paymentMethod, discount: discountAmount }
      );

      // Prepare Thermal Receipt
      const receiptItemsData = cart.map(item => {
        const totals = getItemTotals(item);
        let unitLabel = '';
        if (item.sellUnit === 'Taka') unitLabel = 'تەک';
        else if (item.sellUnit === 'HalfTaka') unitLabel = 'نیو تەک';

        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: totals.unitPrice,
          isGift: item.isGift,
          unitLabel: unitLabel,
          barcode: item.barcode
        };
      });

      const customerObj = customers.find(c => c.id === selectedCustomer);

      setCompletedReceiptData({
        id: saleData.id,
        saleId: saleData.id,
        date: saleData.created_at,
        cashierName: currentUser?.name || 'کاشێر',
        customerName: customerObj?.name,
        paymentMethod: paymentMethod,
        items: receiptItemsData as any,
        subtotal: totalAmount,
        discount: Number(discountAmount || 0),
        totalAmount: finalAmount,
        amountPaid: amountPaid ? Number(amountPaid) : undefined,
        change: amountPaid ? Math.max(0, Number(amountPaid) - finalAmount) : undefined
      });

      setCart([]);
      setPaymentMethod('Cash');
      setSelectedCustomer('');
      setDiscountAmount('');
      setAmountPaid('');
      setShowCheckoutModal(false);
      fetchData();

    } catch (error: any) {
      console.error("Checkout Error:", error);
      alert("کێشەیەک ڕوویدا لە کاتی فرۆشتن: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen bg-slate-100 flex flex-col font-kurdish animate-in select-none overflow-hidden">
      
      {/* ─── Top Header Bar ─── */}
      <header className="bg-white border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl transition-all active:scale-95 border border-slate-200/60"
            title="گەڕانەوە بۆ داشبۆرد"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-tight flex items-center gap-2">
                سیستەمی فرۆشتن (POS)
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                  چالاکە
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">سۆران هۆکە شۆپ</p>
            </div>
          </div>
        </div>

        {/* Center/Right Metrics & Actions */}
        <div className="flex items-center gap-3">
          {/* Live USD Rate Pill */}
          <div className="hidden md:flex items-center gap-1.5 bg-emerald-50/80 border border-emerald-200/60 px-3 py-1.5 rounded-xl text-emerald-800 text-xs font-bold shadow-xs">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>نرخی ١٠٠ دۆلار:</span>
            <span className="font-mono text-emerald-700 font-black" dir="ltr">{usdRate.toLocaleString()} IQD</span>
          </div>

          {/* User Role Pill */}
          {currentUser && (
            <div className="hidden sm:flex items-center gap-2 bg-slate-100/80 border border-slate-200/70 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>{currentUser.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-indigo-600 font-bold border border-slate-200/60">
                {currentUser.role === 'Admin' ? 'ئەدمین' : currentUser.role === 'Manager' ? 'بەڕێوەبەر' : 'کاشێر'}
              </span>
            </div>
          )}

          {/* Live Clock */}
          <div className="text-slate-600 text-xs font-bold font-mono bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/60 flex items-center gap-2" dir="ltr">
            <span>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>

          {/* Mobile Cart Toggle */}
          <button 
            onClick={() => setIsMobileCartOpen(true)}
            className="md:hidden relative p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-all border border-indigo-200"
            title="سەبەتەی کڕین"
          >
            <ShoppingCart className="w-5 h-5" />
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                {cart.length}
              </span>
            )}
          </button>

          {/* Lock Screen */}
          <button 
            onClick={() => useAppStore.getState().setLocked(true)}
            title="قوفڵکردنی شاشە"
            className="flex items-center justify-center p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all border border-slate-200 active:scale-95"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── Main Content Workspace ─── */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* ─── Left Section: Catalog & Products ─── */}
        <section className="flex-1 flex flex-col border-l border-slate-200 bg-slate-50 overflow-hidden">
          
          {/* Top Filter Bar: Section Switcher + Search Bar */}
          <div className="p-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-center shadow-xs">
            
            {/* Section Switcher Segmented Control */}
            <div className="flex w-full sm:w-auto bg-slate-100 p-1 rounded-2xl shadow-inner border border-slate-200/80">
              <button 
                onClick={() => {
                  setActiveSection('General');
                  setSelectedCategory(null);
                  refocusSearch();
                }}
                className={`flex-1 sm:flex-none px-5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                  activeSection === 'General' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-black' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Package className="w-4 h-4" />
                بەشی گشتی
              </button>
              
              <button 
                onClick={() => {
                  setActiveSection('V');
                  setSelectedCategory(null);
                  refocusSearch();
                }}
                className={`flex-1 sm:flex-none px-5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                  activeSection === 'V' 
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20 font-black' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                بەشی V (Vape)
              </button>
            </div>

            {/* Search & Barcode Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="گەڕان بەپێی ناوی کاڵا یان لێدانی بارکۆد..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim() !== '') {
                    e.preventDefault();
                    handleScannedBarcode(searchTerm);
                    setSearchTerm('');
                  }
                }}
                className="w-full pl-24 pr-11 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all bg-slate-50 focus:bg-white text-sm font-medium"
                autoFocus
              />

              {/* Clear button if text exists */}
              {searchTerm && (
                <button 
                  onClick={() => { setSearchTerm(''); refocusSearch(); }}
                  className="absolute left-16 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Enter badge helper */}
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:flex items-center gap-1 bg-slate-200/80 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-500">
                <span>Enter ↵</span>
              </div>
            </div>
          </div>

          {/* Breadcrumb / Category Status Bar */}
          {selectedCategory && (
            <div className="px-4 py-2 bg-indigo-50/80 border-b border-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>جۆری هەڵبژێردراو:</span>
                <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg shadow-xs">{selectedCategory}</span>
                <span className="text-indigo-400 font-normal">({filteredProducts.length} کاڵا)</span>
              </div>
              <button 
                onClick={() => { setSelectedCategory(null); refocusSearch(); }}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-100/80 px-3 py-1 rounded-xl border border-indigo-200 transition-all flex items-center gap-1 shadow-xs"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                گەڕانەوە بۆ هەموو جۆرەکان
              </button>
            </div>
          )}

          {/* Catalog Grid Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 relative">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-500 flex-col gap-3">
                <div className="animate-spin rounded-full h-9 w-9 border-3 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm font-bold text-slate-600">خەریکی هێنانی زانیاری کاڵاکانە...</p>
              </div>
            ) : (
              <>
                {/* 1. Category Tiles View (When no search & no category selected) */}
                {!searchTerm && !selectedCategory ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        جۆرەکانی کاڵا ({categories.length})
                      </h2>
                      <span className="text-xs text-slate-400">کلیک بکە بۆ بینینی کاڵاکانی ئەو جۆرە</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                      {categories.map((cat, idx) => {
                        const count = products.filter(p => p.category === cat && p.section === activeSection).length;
                        if (count === 0) return null;
                        
                        const gradients = [
                          { from: 'from-blue-600', to: 'to-indigo-600', text: 'text-blue-600', border: 'hover:border-blue-300', bg: 'group-hover:bg-blue-50/50' },
                          { from: 'from-emerald-500', to: 'to-teal-600', text: 'text-emerald-600', border: 'hover:border-emerald-300', bg: 'group-hover:bg-emerald-50/50' },
                          { from: 'from-purple-600', to: 'to-indigo-600', text: 'text-purple-600', border: 'hover:border-purple-300', bg: 'group-hover:bg-purple-50/50' },
                          { from: 'from-amber-500', to: 'to-orange-600', text: 'text-amber-600', border: 'hover:border-amber-300', bg: 'group-hover:bg-amber-50/50' },
                          { from: 'from-rose-500', to: 'to-pink-600', text: 'text-rose-600', border: 'hover:border-rose-300', bg: 'group-hover:bg-rose-50/50' },
                          { from: 'from-cyan-500', to: 'to-blue-600', text: 'text-cyan-600', border: 'hover:border-cyan-300', bg: 'group-hover:bg-cyan-50/50' },
                        ];
                        const theme = gradients[idx % gradients.length];
                        
                        return (
                          <button
                            key={cat}
                            onClick={() => {
                              setSelectedCategory(cat);
                              refocusSearch();
                            }}
                            className={`bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 ${theme.border} hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group text-right relative overflow-hidden flex flex-col justify-between min-h-[110px] active:scale-95`}
                          >
                            <div className={`absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l ${theme.from} ${theme.to}`}></div>
                            
                            <div className="flex justify-between items-start w-full">
                              <span className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center font-black text-xs text-slate-400 group-hover:text-indigo-600 transition-colors border border-slate-100">
                                {idx + 1}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                {count} کاڵا
                              </span>
                            </div>
                            
                            <div className="mt-2">
                              <h3 className="font-black text-slate-800 text-sm md:text-base group-hover:text-indigo-600 transition-colors line-clamp-1">
                                {cat}
                              </h3>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {categories.length === 0 && (
                      <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="font-bold text-slate-700 text-base">هیچ جۆرێک نەدۆزرایەوە لەم بەشەدا</h3>
                        <p className="text-xs text-slate-400 mt-1">تکایە لە بەشی کاڵاکان جۆری نوێ تۆمار بکە</p>
                      </div>
                    )}
                  </div>
                ) : (
                  
                  /* 2. Products Grid View */
                  <div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                      {filteredProducts.map(product => {
                        const outOfStock = product.stockLevel <= 0;
                        const lowStock = product.stockLevel > 0 && product.stockLevel <= (product.minStockAlert || 5);
                        
                        const isWeight = product.barcode.startsWith('WGT-');
                        const isMeter = product.barcode.startsWith('MTR-');

                        const displayStock = isWeight 
                          ? `${(product.stockLevel / 1000).toFixed(2)} کگم` 
                          : isMeter 
                          ? `${(product.stockLevel / 100).toFixed(2)} م` 
                          : `${product.stockLevel}`;

                        const priceInIQD = product.currency === 'USD' 
                          ? Math.round(product.sellingPrice * (usdRate / 100)) 
                          : product.sellingPrice;

                        return (
                          <div 
                            key={product.id}
                            className={`bg-white rounded-2xl shadow-xs border transition-all duration-200 text-right group flex flex-col justify-between relative overflow-hidden ${
                              outOfStock 
                                ? 'opacity-50 border-slate-200 bg-slate-50/50' 
                                : 'border-slate-200/90 hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5'
                            }`}
                          >
                            <button 
                              onClick={() => handleProductClick(product)}
                              disabled={outOfStock}
                              className="p-3 flex-1 w-full flex flex-col justify-between text-right outline-none active:scale-95 transition-transform"
                            >
                              {/* Stock status indicator pill */}
                              <div className="flex justify-between items-start w-full gap-1 mb-2">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                  outOfStock 
                                    ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                    : lowStock 
                                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                  {outOfStock ? 'نەماوە' : displayStock}
                                </span>

                                {product.currency === 'USD' && (
                                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-md">
                                    USD
                                  </span>
                                )}
                              </div>

                              {/* Product Name */}
                              <div className="w-full my-1">
                                <h3 className="font-bold text-slate-800 text-xs md:text-sm line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                                  {product.name}
                                </h3>
                                {product.company && (
                                  <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                    {product.company}
                                  </span>
                                )}
                              </div>

                              {/* Price Display */}
                              <div className="w-full mt-2 pt-2 border-t border-slate-100 flex flex-col text-right">
                                {product.currency === 'USD' ? (
                                  <>
                                    <span className="text-indigo-600 font-black text-sm md:text-base leading-none" dir="ltr">
                                      ${product.sellingPrice.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] font-semibold text-slate-400 mt-0.5" dir="ltr">
                                      ≈ {priceInIQD.toLocaleString()} IQD
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-indigo-600 font-black text-sm md:text-base leading-none" dir="ltr">
                                    {product.sellingPrice.toLocaleString('en-US')} <span className="text-[10px] font-bold text-indigo-400">IQD</span>
                                  </span>
                                )}
                              </div>
                            </button>

                            {/* Bulk quick sale button if available */}
                            {product.bulkSize > 1 && !outOfStock && (
                              <div className="px-2.5 pb-2.5 pt-1 bg-slate-50/80 border-t border-slate-100 flex gap-1.5">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); addToCart(product, 1, 'Taka'); }}
                                  title="فرۆشتنی ١ تەک"
                                  className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-black py-1.5 rounded-lg border border-purple-200/80 transition-colors text-center shadow-2xs"
                                >
                                  تەک
                                </button>
                                {product.bulkSize > 1 && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); addToCart(product, 1, 'HalfTaka'); }}
                                    title="فرۆشتنی نیو تەک"
                                    className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black py-1.5 rounded-lg border border-indigo-200/80 transition-colors text-center shadow-2xs"
                                  >
                                    ½ تەک
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {filteredProducts.length === 0 && (
                      <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="font-bold text-slate-700 text-base">هیچ کاڵایەک نەدۆزرایەوە</h3>
                        <p className="text-xs text-slate-400 mt-1">بەدوای وشەیەکی تردا بگەڕێ یان جۆری تر هەڵبژێرە</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ─── Mobile Cart Backdrop Overlay ─── */}
        {isMobileCartOpen && (
          <div 
            onClick={() => setIsMobileCartOpen(false)}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden animate-in fade-in"
          />
        )}

        {/* ─── Right Section: Modern Cart Sidebar & Mobile Drawer ─── */}
        <section className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white flex flex-col shadow-2xl transition-transform duration-300 md:static md:w-[400px] xl:w-[440px] md:translate-x-0 border-r border-slate-200/60 ${isMobileCartOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
          
          {/* Cart Header */}
          <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsMobileCartOpen(false)}
                className="md:hidden p-1.5 hover:bg-slate-200 rounded-xl text-slate-600 transition-colors ml-1"
                title="داخستن"
              >
                <X className="w-5 h-5" />
              </button>
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              <h2 className="font-black text-slate-800 text-sm">سەبەتەی کڕین</h2>
              {cart.length > 0 && (
                <span className="bg-indigo-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                  {cart.length}
                </span>
              )}
            </div>

            {cart.length > 0 && (
              <button 
                onClick={clearCart}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 border border-rose-200/60"
                title="پاککردنەوەی هەموو سەبەتەکە"
              >
                <Trash2 className="w-3.5 h-3.5" />
                خاوێنکردنەوە
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/40">
            {cart.map((item, index) => {
              const totals = getItemTotals(item);
              const isWgt = item.barcode.startsWith('WGT-');
              const isMtr = item.barcode.startsWith('MTR-');

              return (
                <div 
                  key={`${item.id}-${item.sellUnit}`} 
                  className={`bg-white border rounded-2xl p-3 shadow-xs transition-all ${
                    item.isGift 
                      ? 'border-rose-300 bg-rose-50/40' 
                      : totals.isBulkActivated 
                      ? 'border-purple-200 bg-purple-50/30' 
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* Item Index & Name */}
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="w-5 h-5 flex shrink-0 items-center justify-center bg-slate-100 text-slate-500 rounded-md text-[11px] font-bold font-mono mt-0.5">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-slate-800 text-xs truncate leading-snug">
                          {item.name}
                        </h4>
                        
                        <div className="flex items-center gap-1.5 mt-1">
                          {totals.isBulkActivated && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-bold border border-purple-200">
                              کۆتە ({totals.unitLabel})
                            </span>
                          )}
                          {item.isGift && (
                            <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded font-bold border border-rose-200">
                              دیاری
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-indigo-600" dir="ltr">
                            {item.isGift ? '0 IQD' : `${totals.amount.toLocaleString('en-US')} IQD`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions: Gift Toggle & Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={() => toggleGift(item.id, item.sellUnit)} 
                        title="دیاری / هەدیە"
                        className={`p-1.5 rounded-lg transition-colors ${
                          item.isGift 
                            ? 'bg-rose-500 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                        }`}
                      >
                        <Gift className="w-3.5 h-3.5" />
                      </button>

                      <button 
                        onClick={() => removeFromCart(item.id, item.sellUnit)} 
                        title="سڕینەوە"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quantity Stepper & Price Breakdown */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">
                      {isWgt 
                        ? `${(item.quantity / 1000).toFixed(2)} کگم` 
                        : isMtr 
                        ? `${(item.quantity / 100).toFixed(2)} مەتر` 
                        : `${item.quantity} دانە`}
                    </span>

                    {/* Quantity controls */}
                    {!isWgt && !isMtr ? (
                      <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/70">
                        {item.sellUnit === 'Piece' && (
                          <button 
                            onClick={() => updateQuantity(item.id, item.sellUnit, 0.5)} 
                            title="زیادکردنی 0.5" 
                            className="px-1.5 py-0.5 text-[10px] font-black text-indigo-600 hover:bg-indigo-50 bg-white border border-indigo-100 rounded-lg shadow-2xs"
                          >
                            +½
                          </button>
                        )}
                        
                        <button 
                          onClick={() => updateQuantity(item.id, item.sellUnit, 1)} 
                          title="زیادکردن" 
                          className="p-1 hover:bg-white rounded-lg text-slate-700 shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        
                        <input 
                          type="number" 
                          step={item.sellUnit === 'Piece' ? "0.5" : "1"} 
                          min={item.sellUnit === 'Piece' ? "0.5" : "1"}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setExactQuantity(item.id, item.sellUnit, val);
                          }}
                          className="font-black text-slate-800 w-11 text-center text-xs bg-white border border-slate-200 py-0.5 outline-none focus:border-indigo-500 rounded-md"
                          dir="ltr"
                        />

                        <button 
                          onClick={() => updateQuantity(item.id, item.sellUnit, -1)} 
                          title="کەمکردن" 
                          className="p-1 hover:bg-white rounded-lg text-slate-700 shadow-2xs"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        {item.sellUnit === 'Piece' && (
                          <button 
                            onClick={() => updateQuantity(item.id, item.sellUnit, -0.5)} 
                            title="کەمکردنی 0.5" 
                            className="px-1.5 py-0.5 text-[10px] font-black text-rose-600 hover:bg-rose-50 bg-white border border-rose-100 rounded-lg shadow-2xs"
                          >
                            -½
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
                        {isWgt ? `${(item.quantity / 1000).toFixed(2)} کگم` : `${(item.quantity / 100).toFixed(2)} مەتر`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {cart.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 py-16">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                  <ShoppingCart className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-600 text-sm">سەبەتەکە هێشتا بەتاڵە</p>
                  <p className="text-xs text-slate-400 mt-1">کلیک لەسەر هەر کاڵایەک بکە بۆ زیادکردن</p>
                </div>
              </div>
            )}
          </div>

          {/* Cart Bottom Summary & Checkout */}
          <div className="p-4 border-t border-slate-200 bg-white space-y-3.5 shadow-lg">
            
            {/* Financial Details */}
            <div className="space-y-1.5 text-xs text-slate-600 font-medium">
              <div className="flex justify-between items-center">
                <span>ژمارەی کاڵاکان:</span>
                <span className="font-bold text-slate-800 font-mono">{totalItemsCount} دانە</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span>کۆی گشتی بە دۆلار:</span>
                <span className="font-bold text-emerald-600 font-mono" dir="ltr">≈ ${totalAmountUSD.toFixed(2)}</span>
              </div>

              {isAdminOrManager && (
                <div className="flex justify-between items-center text-indigo-700 font-bold bg-indigo-50/80 px-2.5 py-1 rounded-lg border border-indigo-100">
                  <span>قازانجی خەمڵێنراو:</span>
                  <span className="font-mono" dir="ltr">{totalProfit.toLocaleString('en-US')} IQD</span>
                </div>
              )}
            </div>

            {/* Grand Total Display Box */}
            <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex justify-between items-center shadow-inner">
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">کۆی کۆتایی بۆ پارەدان</span>
                <span className="text-2xl font-black text-emerald-400 font-mono" dir="ltr">
                  {totalAmount.toLocaleString('en-US')}
                </span>
              </div>
              <span className="text-sm font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded-lg">IQD</span>
            </div>

            {/* Primary Action Button */}
            <button 
              onClick={() => setShowCheckoutModal(true)}
              disabled={cart.length === 0}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md shadow-indigo-200"
            >
              <Printer className="w-5 h-5" />
              تەواوکردنی فرۆشتن و چاپکردن
            </button>
          </div>
        </section>
      </main>

      {/* ─── Floating Mobile Cart Quick Bar ─── */}
      {cart.length > 0 && !isMobileCartOpen && (
        <div className="md:hidden fixed bottom-3 inset-x-3 z-30 animate-in fade-in slide-in-from-bottom duration-200">
          <button
            onClick={() => setIsMobileCartOpen(true)}
            className="w-full bg-slate-900 text-white px-4 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-700/80 active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                {cart.length}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-medium">سەبەتەی کڕین</span>
                <span className="text-sm font-black text-emerald-400 font-mono" dir="ltr">
                  {totalAmount.toLocaleString('en-US')} IQD
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-black bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 rounded-xl text-white shadow-sm">
              <span>تەواوکردن</span>
              <ShoppingCart className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* ─── Duplicate Barcode Modal ─── */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100">
            <h2 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              هەڵبژاردنی کاڵا
            </h2>
            <p className="text-xs text-slate-500 mb-4">چەند کاڵایەک بەم بارکۆدە دۆزرانەوە، تکایە یەکێکیان هەڵبژێرە:</p>
            
            <div className="space-y-2.5 mb-6">
              {duplicateMatches.map((matchItem, index) => {
                const p = matchItem.product;
                const isTaka = matchItem.unit === 'Taka';
                const displayPrice = isTaka ? p.bulkPrice : p.sellingPrice;
                return (
                  <button
                    key={index}
                    onClick={() => {
                      if (isTaka) {
                        addToCart(p, 1, 'Taka');
                      } else {
                        handleProductClick(p);
                      }
                      playScanBeep();
                      setShowDuplicateModal(false);
                      refocusSearch();
                    }}
                    className="w-full text-right p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all flex justify-between items-center group active:scale-98"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm group-hover:text-indigo-700">
                          {p.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                          isTaka ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {isTaka ? `کارتۆن / تەک (${p.bulkSize} دانە)` : 'تاک (دانە)'}
                        </span>
                      </div>
                      <div className="flex gap-1.5 text-xs text-slate-400 mt-1">
                        {p.company && <span className="bg-slate-100 px-2 py-0.5 rounded-md">{p.company}</span>}
                        {p.category && <span className="bg-slate-100 px-2 py-0.5 rounded-md">{p.category}</span>}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-black text-emerald-600 text-base" dir="ltr">
                        {displayPrice?.toLocaleString()} {p.currency === 'USD' ? '$' : 'IQD'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                        مەوجوود: {p.stockLevel} دانە
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button 
              onClick={() => {
                setShowDuplicateModal(false);
                refocusSearch();
              }}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
            >
              داخستن
            </button>
          </div>
        </div>
      )}

      {/* ─── Checkout Modal (پوختەی پارەدان) ─── */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Banknote className="w-6 h-6 text-emerald-600" />
                پوختەی پارەدان و وەسڵ
              </h2>
              <button 
                onClick={() => setShowCheckoutModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Amount Summary Box */}
            <div className="bg-slate-50 p-4 rounded-2xl mb-5 space-y-3 border border-slate-200/70">
              <div className="flex justify-between text-slate-600 text-sm font-semibold">
                <span>کۆی گشتی کاڵاکان:</span>
                <span className="font-bold text-slate-800 font-mono" dir="ltr">{totalAmount.toLocaleString('en-US')} IQD</span>
              </div>
              
              {/* Discount Input & Quick Discount Pills */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">داشکاندن (Discount):</span>
                  <input 
                    type="number"
                    value={discountAmount}
                    onChange={e => setDiscountAmount(e.target.value)}
                    placeholder="بڕی داشکاندن بە دینار..."
                    className="w-44 p-2 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none text-left font-black text-rose-600 text-sm bg-white"
                    dir="ltr"
                  />
                </div>

                {/* Quick Discount Shortcuts */}
                <div className="flex justify-end gap-1.5">
                  {[1000, 2000, 5000, 10000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDiscountAmount(val.toString())}
                      className="text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200 transition-colors"
                    >
                      {val.toLocaleString()} IQD
                    </button>
                  ))}
                  {discountAmount && (
                    <button
                      type="button"
                      onClick={() => setDiscountAmount('')}
                      className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md"
                    >
                      سڕینەوە
                    </button>
                  )}
                </div>
              </div>

              {/* Net Total */}
              <div className="flex justify-between text-indigo-700 text-base pt-3 border-t border-slate-200 font-black">
                <span>کۆی کۆتایی بۆ پارەدان:</span>
                <div className="text-left font-mono" dir="ltr">
                  <span className="text-xl">{(totalAmount - Number(discountAmount || 0)).toLocaleString('en-US')} IQD</span>
                  <span className="text-xs text-slate-400 font-normal block">
                    (≈ ${usdRate > 0 ? ((totalAmount - Number(discountAmount || 0)) / (usdRate / 100)).toFixed(2) : 0})
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Method Cards */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 mb-2">شێوازی پارەدان</label>
              <div className="grid grid-cols-3 gap-2.5">
                
                <button 
                  type="button"
                  onClick={() => setPaymentMethod('Cash')} 
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                    paymentMethod === 'Cash' 
                      ? 'border-emerald-500 bg-emerald-50/60 text-emerald-800 shadow-sm font-black' 
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="w-5 h-5 mb-1 text-emerald-600" />
                  <span className="text-xs">نەقد (کاش)</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setPaymentMethod('FIB')} 
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                    paymentMethod === 'FIB' 
                      ? 'border-indigo-500 bg-indigo-50/60 text-indigo-800 shadow-sm font-black' 
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-5 h-5 mb-1 text-indigo-600" />
                  <span className="text-xs">کارتی بانکی / FIB</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setPaymentMethod('Debt')} 
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                    paymentMethod === 'Debt' 
                      ? 'border-amber-500 bg-amber-50/60 text-amber-800 shadow-sm font-black' 
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <ArrowDownToLine className="w-5 h-5 mb-1 text-amber-600" />
                  <span className="text-xs">قەرز</span>
                </button>
              </div>
            </div>

            {/* If Debt Selected: Customer Selector */}
            {paymentMethod === 'Debt' && (
              <div className="mb-5 p-4 border border-amber-200 bg-amber-50/60 rounded-2xl">
                {!showNewCustomerForm ? (
                  <>
                    <div className="flex justify-between items-center mb-2.5">
                      <label className="text-xs font-black text-amber-900">هەڵبژاردنی کڕیار بۆ قەرز</label>
                      <button 
                        type="button"
                        onClick={() => setShowNewCustomerForm(true)} 
                        className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> کڕیاری نوێ
                      </button>
                    </div>
                    <select 
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                      className="w-full p-3 rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-400 outline-none text-slate-800 bg-white font-bold text-xs"
                    >
                      <option value="">تکایە کڕیارێک هەڵبژێرە...</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''} - [قەرزی پێشوو: {c.remainingDebt.toLocaleString()} IQD]
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <form onSubmit={handleCreateCustomer}>
                    <div className="flex justify-between items-center mb-2.5">
                      <label className="text-xs font-black text-amber-900">تۆمارکردنی کڕیاری نوێ</label>
                      <button 
                        type="button" 
                        onClick={() => setShowNewCustomerForm(false)} 
                        className="text-xs text-amber-700 hover:underline font-bold"
                      >
                        گەڕانەوە بۆ لیست
                      </button>
                    </div>
                    <div className="space-y-2">
                      <input 
                        required 
                        type="text" 
                        placeholder="ناوی تەواوی کڕیار..." 
                        value={newCustomerName}
                        onChange={e => setNewCustomerName(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-400 outline-none bg-white text-xs font-bold"
                      />
                      <input 
                        type="text" 
                        placeholder="ژمارەی مۆبایل (ئارەزوومەندانە)..." 
                        value={newCustomerPhone}
                        onChange={e => setNewCustomerPhone(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-400 outline-none bg-white text-xs text-left font-bold" 
                        dir="ltr"
                      />
                      <button 
                        type="submit" 
                        disabled={isCreatingCustomer}
                        className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs disabled:opacity-50 transition-colors"
                      >
                        {isCreatingCustomer ? 'خەریکی تۆمارکردنە...' : 'تۆمارکردنی کڕیار'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* If Cash Selected: Cash Received & Change Calculation */}
            {paymentMethod === 'Cash' && (
              <div className="mb-6 space-y-2.5">
                <label className="block text-xs font-bold text-slate-700">بڕی پارەی دراو لەلایەن کڕیارەوە (بۆ باقی)</label>
                
                <input 
                  type="number"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  placeholder="بڕی پارەی پێدراو بنووسە..."
                  className="w-full p-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-left font-black text-lg text-slate-800"
                  dir="ltr"
                />

                {/* Quick Cash Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAmountPaid((totalAmount - Number(discountAmount || 0)).toString())}
                    className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition-colors border border-slate-200"
                  >
                    بڕی ڕێک
                  </button>
                  {[5000, 10000, 25000, 50000, 100000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmountPaid(val.toString())}
                      className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition-colors border border-slate-200 font-mono"
                    >
                      {val.toLocaleString()} IQD
                    </button>
                  ))}
                </div>

                {/* Change return output banner */}
                {amountPaid && Number(amountPaid) >= (totalAmount - Number(discountAmount || 0)) && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex justify-between items-center shadow-xs">
                    <span className="font-bold text-emerald-800 text-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      باقیی گەڕاوە بۆ کڕیار:
                    </span>
                    <span className="font-black text-emerald-700 text-lg font-mono" dir="ltr">
                      {(Number(amountPaid) - (totalAmount - Number(discountAmount || 0))).toLocaleString('en-US')} IQD
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors text-sm"
              >
                پاشگەزبوونەوە
              </button>
              
              <button 
                type="button"
                onClick={handleCheckout}
                disabled={isProcessing || (paymentMethod === 'Debt' && !selectedCustomer)}
                className="flex-[2] bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-slate-300 disabled:to-slate-300 text-white py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-98 shadow-lg shadow-indigo-200"
              >
                <Printer className="w-5 h-5" />
                {isProcessing ? 'خەریکی تەواوکردنە...' : 'تەواوکردن و چاپکردن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Weight / Meter Modal ─── */}
      {showWeightModal && selectedWeightProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-800">
                  فرۆشتن بە {selectedWeightProduct.barcode.startsWith('MTR-') ? 'مەتر' : 'کێش'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedWeightProduct.name} - (یەکەی: {selectedWeightProduct.sellingPrice.toLocaleString()} IQD)
                </p>
              </div>
              <button 
                onClick={() => setShowWeightModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Input Type Switcher */}
            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
              <button 
                type="button"
                onClick={() => { setWeightInputType('money'); setWeightInput(''); }} 
                className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                  weightInputType === 'money' 
                    ? 'bg-white text-indigo-700 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                بە پارە (دینار)
              </button>
              
              <button 
                type="button"
                onClick={() => { setWeightInputType('grams'); setWeightInput(''); }} 
                className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                  weightInputType === 'grams' 
                    ? 'bg-white text-indigo-700 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                بە {selectedWeightProduct.barcode.startsWith('MTR-') ? 'مەتر' : 'کێش (غرام)'}
              </button>
            </div>

            {weightInputType === 'money' ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[1000, 2000, 3000, 5000, 10000, 15000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        const multiplier = selectedWeightProduct.barcode.startsWith('MTR-') ? 100 : 1000;
                        const qty = Math.round((amt / selectedWeightProduct.sellingPrice) * multiplier);
                        addToCart(selectedWeightProduct, qty);
                        setShowWeightModal(false);
                        refocusSearch();
                      }}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black py-2.5 rounded-xl border border-emerald-200 transition-colors text-xs font-mono"
                      dir="ltr"
                    >
                      {amt.toLocaleString()} IQD
                    </button>
                  ))}
                </div>
                
                <div className="relative mb-5">
                  <input 
                    type="number" 
                    placeholder="بڕی پارە بە دینار بنووسە..." 
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    className="w-full p-3.5 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-center font-black text-base text-slate-800"
                    dir="ltr"
                    autoFocus
                  />
                  {weightInput && (
                    <div className="mt-2 p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
                      <p className="text-xs text-indigo-800 font-bold">
                        بڕی هاوتا: {selectedWeightProduct.barcode.startsWith('MTR-') ? 
                          `${(Number(weightInput) / selectedWeightProduct.sellingPrice).toFixed(2)} مەتر` : 
                          `${((Number(weightInput) / selectedWeightProduct.sellingPrice) * 1000).toFixed(0)} غرام (${(Number(weightInput) / selectedWeightProduct.sellingPrice).toFixed(3)} کگم)`}
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {selectedWeightProduct.barcode.startsWith('MTR-') ? (
                    [
                      { label: '0.5 مەتر', value: 50 },
                      { label: '١ مەتر', value: 100 },
                      { label: '١.٥ مەتر', value: 150 },
                      { label: '٢ مەتر', value: 200 },
                      { label: '٣ مەتر', value: 300 },
                      { label: '٥ مەتر', value: 500 },
                    ].map(btn => (
                      <button
                        key={btn.value}
                        type="button"
                        onClick={() => {
                          addToCart(selectedWeightProduct, btn.value);
                          setShowWeightModal(false);
                          refocusSearch();
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-black py-2.5 rounded-xl border border-indigo-200 transition-colors text-xs"
                      >
                        {btn.label}
                      </button>
                    ))
                  ) : (
                    [
                      { label: 'چارەگێک (250g)', value: 250 },
                      { label: 'نیو کیلۆ (500g)', value: 500 },
                      { label: '١ کیلۆ (1000g)', value: 1000 },
                      { label: '١.٥ کیلۆ', value: 1500 },
                      { label: '٢ کیلۆ', value: 2000 },
                      { label: '٣ کیلۆ', value: 3000 },
                    ].map(btn => (
                      <button
                        key={btn.value}
                        type="button"
                        onClick={() => {
                          addToCart(selectedWeightProduct, btn.value);
                          setShowWeightModal(false);
                          refocusSearch();
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-black py-2.5 rounded-xl border border-indigo-200 transition-colors text-xs"
                      >
                        {btn.label}
                      </button>
                    ))
                  )}
                </div>

                <div className="mb-5">
                  <input 
                    type="number" 
                    step="any"
                    placeholder={selectedWeightProduct.barcode.startsWith('MTR-') ? "بڕ بە مەتر بنووسە (نموونە: ١.٥)..." : "بڕ بە گرام بنووسە (نموونە: ٢٥٠)..."} 
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    className="w-full p-3.5 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-center font-black text-base text-slate-800"
                    dir="ltr"
                    autoFocus
                  />
                  {weightInput && (
                    <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                      <p className="text-xs text-emerald-800 font-bold">
                        کۆی نرخ: {Math.round((Number(weightInput) / (selectedWeightProduct.barcode.startsWith('MTR-') ? 1 : 1000)) * selectedWeightProduct.sellingPrice).toLocaleString('en-US')} IQD
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-2.5">
              <button 
                type="button"
                onClick={() => setShowWeightModal(false)} 
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-xs"
              >
                پاشگەزبوونەوە
              </button>
              <button 
                type="button"
                disabled={!weightInput}
                onClick={() => {
                  let qty = 0;
                  const isMeter = selectedWeightProduct.barcode.startsWith('MTR-');
                  const multiplier = isMeter ? 100 : 1000;
                  
                  if (weightInputType === 'money') {
                    qty = Math.round((Number(weightInput) / selectedWeightProduct.sellingPrice) * multiplier);
                  } else {
                    qty = Math.round(Number(weightInput) * (isMeter ? 100 : 1));
                  }
                  
                  if (qty > 0) {
                    addToCart(selectedWeightProduct, qty);
                    setShowWeightModal(false);
                    refocusSearch();
                  }
                }} 
                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black rounded-xl transition-colors text-xs shadow-md shadow-indigo-200"
              >
                زیادکردن بۆ سەبەتە
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Completed Thermal Receipt Modal ─── */}
      {completedReceiptData && (
        <ThermalReceipt 
          receipt={completedReceiptData} 
          onClose={() => {
            setCompletedReceiptData(null);
            refocusSearch();
          }} 
        />
      )}

    </div>
  );
};
