import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  Calendar,
  Sparkles,
  TrendingUp,
  DollarSign,
  Layers,
  ShoppingBag,
  ArrowUpDown,
  Eye,
  RefreshCw,
  Printer,
  X,
  Clock,
  BarChart3
} from 'lucide-react';
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  parseISO
} from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

interface SoldProductItem {
  productId: string;
  name: string;
  barcode: string;
  category: string;
  company: string;
  section: string;
  bulkSize: number;
  totalQuantity: number;
  baseQuantity: number; // for kg / meters calculation
  unitLabel: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  receiptsCount: number;
  transactions: {
    saleId: string;
    createdAt: string;
    quantity: number;
    price: number;
    cost: number;
    paymentMethod: string;
    customerName?: string;
  }[];
}

interface PeriodSummary {
  quantity: number;
  unitLabel: string;
  revenue: number;
  profit: number;
  receiptsCount: number;
}

export const SoldProducts: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const settings = useAppStore(state => state.settings);
  const usdRate = settings.usdRate || 150000;

  // Access Control: Admin only
  useEffect(() => {
    if (currentUser && currentUser.role !== 'Admin') {
      navigate('/');
    }
  }, [currentUser, navigate]);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSection, setSelectedSection] = useState<'All' | 'General' | 'V'>('All');
  const [quickFilter, setQuickFilter] = useState<'Today' | 'Yesterday' | 'Week' | 'Month' | 'Year' | 'All' | 'Custom'>('Month');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  // Sorting State
  const [sortBy, setSortBy] = useState<'quantity' | 'revenue' | 'profit' | 'name'>('revenue');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Loading & Data State
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [rawSales, setRawSales] = useState<any[]>([]);
  const [rawSaleItems, setRawSaleItems] = useState<any[]>([]);

  // Selected Product for Drilldown Modal
  const [selectedProductForModal, setSelectedProductForModal] = useState<SoldProductItem | null>(null);

  // Fetch Categories on Mount
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const { data } = await supabase.from('categories').select('name').order('name');
        if (data) {
          setCategories(data.map((c: any) => c.name));
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCats();
  }, []);

  // Sync quickFilter changes to date pickers
  const handleQuickFilterChange = (filter: 'Today' | 'Yesterday' | 'Week' | 'Month' | 'Year' | 'All' | 'Custom') => {
    setQuickFilter(filter);
    const now = new Date();

    if (filter === 'Today') {
      setStartDate(format(now, 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (filter === 'Yesterday') {
      const y = subDays(now, 1);
      setStartDate(format(y, 'yyyy-MM-dd'));
      setEndDate(format(y, 'yyyy-MM-dd'));
    } else if (filter === 'Week') {
      setStartDate(format(startOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'));
      setEndDate(format(endOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'));
    } else if (filter === 'Month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else if (filter === 'Year') {
      setStartDate(format(startOfYear(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfYear(now), 'yyyy-MM-dd'));
    } else if (filter === 'All') {
      setStartDate('2020-01-01');
      setEndDate(format(now, 'yyyy-MM-dd'));
    }
  };

  // Main Data Fetch
  const fetchData = async () => {
    setLoading(true);
    try {
      // Calculate date boundary for sales query
      // To support the comparison breakdown (Today, Week, Month, Year),
      // we query sales from the start of the current year or the custom startDate, whichever is earlier.
      const yearStart = startOfYear(new Date()).toISOString();
      const customStart = startOfDay(parseISO(startDate)).toISOString();
      const queryStart = customStart < yearStart ? customStart : yearStart;
      const queryEnd = endOfDay(parseISO(endDate)).toISOString();

      const { data: sales, error: salesErr } = await supabase
        .from('sales')
        .select('id, created_at, payment_method, total_amount, discount, customer:debt_customer_id(name)')
        .gte('created_at', queryStart)
        .lte('created_at', queryEnd)
        .eq('status', 'Completed')
        .order('created_at', { ascending: false });

      if (salesErr) throw salesErr;

      const salesList = sales || [];
      setRawSales(salesList);

      const saleIds = salesList.map(s => s.id);
      if (saleIds.length > 0) {
        // Fetch items in batches if large
        const { data: items, error: itemsErr } = await supabase
          .from('sale_items')
          .select('id, sale_id, product_id, name, quantity, price, cost, product:product_id(name, category, company, section, barcode, bulk_size)')
          .in('sale_id', saleIds);

        if (itemsErr) throw itemsErr;
        setRawSaleItems(items || []);
      } else {
        setRawSaleItems([]);
      }
    } catch (err) {
      console.error('Error fetching sold products data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  // Map Sales for Quick Lookup
  const salesMap = useMemo(() => {
    const map = new Map<string, any>();
    rawSales.forEach(s => map.set(s.id, s));
    return map;
  }, [rawSales]);

  // Aggregate Products Sold for the selected Date Range
  const aggregatedProducts = useMemo(() => {
    const startRange = startOfDay(parseISO(startDate)).getTime();
    const endRange = endOfDay(parseISO(endDate)).getTime();

    const productMap = new Map<string, SoldProductItem>();

    rawSaleItems.forEach(item => {
      const sale = salesMap.get(item.sale_id);
      if (!sale) return;

      const saleTime = new Date(sale.created_at).getTime();
      // Check if within selected date range
      if (saleTime < startRange || saleTime > endRange) return;

      const prod = item.product || {};
      const key = item.product_id || item.name;
      const barcode = prod.barcode || '';
      const isWgt = barcode.startsWith('WGT-');
      const isMtr = barcode.startsWith('MTR-');
      const unitLabel = isWgt ? 'کگم' : isMtr ? 'مەتر' : 'دانە';
      const baseQty = isWgt ? item.quantity / 1000 : isMtr ? item.quantity / 100 : item.quantity;
      const revenue = Math.round(item.price * baseQty);
      const cost = Math.round(item.cost * baseQty);
      const profit = revenue - cost;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: item.product_id,
          name: prod.name || item.name,
          barcode: barcode,
          category: prod.category || 'نەزانراو',
          company: prod.company || 'نەزانراو',
          section: prod.section || 'General',
          bulkSize: prod.bulk_size || 1,
          totalQuantity: item.quantity,
          baseQuantity: baseQty,
          unitLabel,
          totalRevenue: revenue,
          totalCost: cost,
          totalProfit: profit,
          receiptsCount: 1,
          transactions: [{
            saleId: item.sale_id,
            createdAt: sale.created_at,
            quantity: item.quantity,
            price: item.price,
            cost: item.cost,
            paymentMethod: sale.payment_method,
            customerName: sale.customer?.name
          }]
        });
      } else {
        const existing = productMap.get(key)!;
        existing.totalQuantity += item.quantity;
        existing.baseQuantity += baseQty;
        existing.totalRevenue += revenue;
        existing.totalCost += cost;
        existing.totalProfit += profit;
        existing.receiptsCount += 1;
        existing.transactions.push({
          saleId: item.sale_id,
          createdAt: sale.created_at,
          quantity: item.quantity,
          price: item.price,
          cost: item.cost,
          paymentMethod: sale.payment_method,
          customerName: sale.customer?.name
        });
      }
    });

    return Array.from(productMap.values());
  }, [rawSaleItems, salesMap, startDate, endDate]);

  // Filtered & Sorted List
  const filteredProducts = useMemo(() => {
    let result = [...aggregatedProducts];

    // Search filter (name, flavor, company, barcode)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.company.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category === selectedCategory);
    }

    // Section filter
    if (selectedSection !== 'All') {
      result = result.filter(p => p.section === selectedSection);
    }

    // Sorting
    result.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortBy === 'quantity') {
        valA = a.baseQuantity;
        valB = b.baseQuantity;
      } else if (sortBy === 'revenue') {
        valA = a.totalRevenue;
        valB = b.totalRevenue;
      } else if (sortBy === 'profit') {
        valA = a.totalProfit;
        valB = b.totalProfit;
      } else if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    return result;
  }, [aggregatedProducts, searchTerm, selectedCategory, selectedSection, sortBy, sortOrder]);

  // Summary Metrics for the current filtered view
  const summaryMetrics = useMemo(() => {
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalPieces = 0;
    let totalWeightKg = 0;

    filteredProducts.forEach(p => {
      totalRevenue += p.totalRevenue;
      totalProfit += p.totalProfit;
      if (p.unitLabel === 'کگم') {
        totalWeightKg += p.baseQuantity;
      } else {
        totalPieces += p.baseQuantity;
      }
    });

    const totalRevenueUSD = usdRate > 0 ? totalRevenue / (usdRate / 100) : 0;
    const totalProfitUSD = usdRate > 0 ? totalProfit / (usdRate / 100) : 0;

    return {
      totalRevenue,
      totalRevenueUSD,
      totalProfit,
      totalProfitUSD,
      totalPieces,
      totalWeightKg,
      distinctProducts: filteredProducts.length
    };
  }, [filteredProducts, usdRate]);

  // Multi-Period Comparison Spotlight (ئەگەر سێرچ کرابێت بۆ نموونە: "فاخر" یان کلیک لە کاڵایەک کرابێت)
  const comparisonData = useMemo(() => {
    if (!searchTerm.trim()) return null;

    const q = searchTerm.toLowerCase().trim();
    const now = new Date();

    const periods = {
      today: { start: startOfDay(now).getTime(), end: endOfDay(now).getTime() },
      week: { start: startOfWeek(now, { weekStartsOn: 6 }).getTime(), end: endOfWeek(now, { weekStartsOn: 6 }).getTime() },
      month: { start: startOfMonth(now).getTime(), end: endOfMonth(now).getTime() },
      year: { start: startOfYear(now).getTime(), end: endOfYear(now).getTime() },
    };

    type PeriodKey = 'today' | 'week' | 'month' | 'year';
    const results: Record<PeriodKey, PeriodSummary> = {
      today: { quantity: 0, unitLabel: 'دانە', revenue: 0, profit: 0, receiptsCount: 0 },
      week: { quantity: 0, unitLabel: 'دانە', revenue: 0, profit: 0, receiptsCount: 0 },
      month: { quantity: 0, unitLabel: 'دانە', revenue: 0, profit: 0, receiptsCount: 0 },
      year: { quantity: 0, unitLabel: 'دانە', revenue: 0, profit: 0, receiptsCount: 0 },
    };

    let detectedUnit = 'دانە';

    rawSaleItems.forEach(item => {
      const sale = salesMap.get(item.sale_id);
      if (!sale) return;

      const prod = item.product || {};
      const matchesSearch = 
        (item.name && item.name.toLowerCase().includes(q)) ||
        (prod.name && prod.name.toLowerCase().includes(q)) ||
        (prod.company && prod.company.toLowerCase().includes(q)) ||
        (prod.category && prod.category.toLowerCase().includes(q)) ||
        (prod.barcode && prod.barcode.toLowerCase().includes(q));

      if (!matchesSearch) return;

      const isWgt = prod.barcode?.startsWith('WGT-');
      const isMtr = prod.barcode?.startsWith('MTR-');
      detectedUnit = isWgt ? 'کگم' : isMtr ? 'مەتر' : 'دانە';
      const baseQty = isWgt ? item.quantity / 1000 : isMtr ? item.quantity / 100 : item.quantity;
      const rev = Math.round(item.price * baseQty);
      const prof = rev - Math.round(item.cost * baseQty);
      const saleTime = new Date(sale.created_at).getTime();

      Object.entries(periods).forEach(([key, range]) => {
        if (saleTime >= range.start && saleTime <= range.end) {
          const r = results[key as PeriodKey];
          r.quantity += baseQty;
          r.unitLabel = detectedUnit;
          r.revenue += rev;
          r.profit += prof;
          r.receiptsCount += 1;
        }
      });
    });

    return {
      query: searchTerm,
      unit: detectedUnit,
      ...results
    };
  }, [searchTerm, rawSaleItems, salesMap]);

  return (
    <div className="min-h-screen bg-slate-50 font-kurdish pb-16">
      
      {/* ─── Top Header Bar ─── */}
      <header className="bg-white border-b border-slate-200/80 px-4 md:px-8 py-4 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button 
              onClick={() => navigate('/')} 
              className="p-2.5 rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors shadow-2xs"
              title="گەڕانەوە بۆ سەرەکی"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900">شیکاری کاڵا فرۆشراوەکان</h1>
                <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                  تایبەت بە ئەدمین
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                چاودێری وردی کاڵا فرۆشراوەکان بەپێی کات، بڕ، داهات و قازانج
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2.5 rounded-2xl text-xs transition-colors shadow-2xs"
            >
              <Printer className="w-4 h-4" />
              <span>چاپکردنی خشتە</span>
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-2xl text-xs transition-all shadow-indigo-500/20 shadow-md active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>نوێکردنەوە</span>
            </button>
          </div>

        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">

        {/* ─── Filter Section ─── */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          
          {/* Quick Date Range Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">دیاریکردنی ماوە:</span>
            </div>
            
            <div className="flex flex-wrap gap-1.5 bg-slate-100/80 p-1 rounded-2xl">
              {[
                { id: 'Today', label: 'ئەمڕۆ' },
                { id: 'Yesterday', label: 'دوێنێ' },
                { id: 'Week', label: 'ئەم هەفتەیە' },
                { id: 'Month', label: 'ئەم مانگە' },
                { id: 'Year', label: 'ئەمساڵ' },
                { id: 'All', label: 'هەمووی' },
                { id: 'Custom', label: 'بەرواری تایبەت' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleQuickFilterChange(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    quickFilter === tab.id
                      ? 'bg-white text-indigo-700 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Pickers & Search Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            
            {/* Search Input */}
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="سێرچ بەپێی ناوی کاڵا، تام، کۆمپانیا (بۆ نموونە: فاخر)..."
                className="w-full pr-10 pl-9 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Dropdown */}
            <div>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-700"
              >
                <option value="All">هەموو جۆرەکان (کەتەگۆری)</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <select
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-700"
              >
                <option value="All">هەموو بەشەکان (گشتی و V)</option>
                <option value="General">بەشی گشتی (General)</option>
                <option value="V">بەشی ڤی (V)</option>
              </select>
            </div>

          </div>

          {/* Date Pickers (Active when Custom or visible for review) */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs text-slate-600">
            <span className="font-bold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              مەودای بەروار:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">لە:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setQuickFilter('Custom');
                }}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-400">بۆ:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setQuickFilter('Custom');
                }}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

        </div>

        {/* ─── Multi-Period Search Spotlight Comparison Card ─── */}
        {comparisonData && (
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-500/20 relative overflow-hidden animate-in fade-in">
            <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="relative z-10 space-y-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-indigo-300 font-bold block">شیکاری بەراوردی قۆناغەکانی فرۆشتن بۆ:</span>
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      «{comparisonData.query}»
                    </h3>
                  </div>
                </div>
                <span className="text-xs bg-white/10 px-3 py-1 rounded-full font-bold self-start sm:self-auto">
                  بەپێی تام و مارکە
                </span>
              </div>

              {/* 4 Cards: Today, This Week, This Month, This Year */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                
                {/* Today */}
                <div className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 transition-all">
                  <div className="flex items-center justify-between text-xs text-indigo-200 font-bold mb-2">
                    <span>فرۆشراوی ئەمڕۆ</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md font-mono">
                      {comparisonData.today.receiptsCount} وەسڵ
                    </span>
                  </div>
                  <div className="text-2xl font-black text-emerald-400 font-mono" dir="ltr">
                    {comparisonData.today.quantity.toLocaleString('en-US')} {comparisonData.unit}
                  </div>
                  <div className="text-xs text-slate-300 font-mono mt-1" dir="ltr">
                    {comparisonData.today.revenue.toLocaleString('en-US')} IQD
                  </div>
                  <div className="text-[11px] text-amber-300 font-bold mt-1">
                    قازانج: {comparisonData.today.profit.toLocaleString('en-US')} IQD
                  </div>
                </div>

                {/* This Week */}
                <div className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 transition-all">
                  <div className="flex items-center justify-between text-xs text-indigo-200 font-bold mb-2">
                    <span>فرۆشراوی ئەم هەفتەیە</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-md font-mono">
                      {comparisonData.week.receiptsCount} وەسڵ
                    </span>
                  </div>
                  <div className="text-2xl font-black text-blue-400 font-mono" dir="ltr">
                    {comparisonData.week.quantity.toLocaleString('en-US')} {comparisonData.unit}
                  </div>
                  <div className="text-xs text-slate-300 font-mono mt-1" dir="ltr">
                    {comparisonData.week.revenue.toLocaleString('en-US')} IQD
                  </div>
                  <div className="text-[11px] text-amber-300 font-bold mt-1">
                    قازانج: {comparisonData.week.profit.toLocaleString('en-US')} IQD
                  </div>
                </div>

                {/* This Month */}
                <div className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 transition-all">
                  <div className="flex items-center justify-between text-xs text-indigo-200 font-bold mb-2">
                    <span>فرۆشراوی ئەم مانگە</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-md font-mono">
                      {comparisonData.month.receiptsCount} وەسڵ
                    </span>
                  </div>
                  <div className="text-2xl font-black text-purple-400 font-mono" dir="ltr">
                    {comparisonData.month.quantity.toLocaleString('en-US')} {comparisonData.unit}
                  </div>
                  <div className="text-xs text-slate-300 font-mono mt-1" dir="ltr">
                    {comparisonData.month.revenue.toLocaleString('en-US')} IQD
                  </div>
                  <div className="text-[11px] text-amber-300 font-bold mt-1">
                    قازانج: {comparisonData.month.profit.toLocaleString('en-US')} IQD
                  </div>
                </div>

                {/* This Year */}
                <div className="bg-white/5 hover:bg-white/10 p-4 rounded-2xl border border-white/10 transition-all">
                  <div className="flex items-center justify-between text-xs text-indigo-200 font-bold mb-2">
                    <span>فرۆشراوی ئەمساڵ</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md font-mono">
                      {comparisonData.year.receiptsCount} وەسڵ
                    </span>
                  </div>
                  <div className="text-2xl font-black text-amber-400 font-mono" dir="ltr">
                    {comparisonData.year.quantity.toLocaleString('en-US')} {comparisonData.unit}
                  </div>
                  <div className="text-xs text-slate-300 font-mono mt-1" dir="ltr">
                    {comparisonData.year.revenue.toLocaleString('en-US')} IQD
                  </div>
                  <div className="text-[11px] text-amber-300 font-bold mt-1">
                    قازانج: {comparisonData.year.profit.toLocaleString('en-US')} IQD
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* ─── Financial KPI Cards for Filtered Range ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Total Revenue */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی داهاتی فرۆشتن</span>
              <h3 className="text-xl font-black text-emerald-600 font-mono" dir="ltr">
                {summaryMetrics.totalRevenue.toLocaleString('en-US')} IQD
              </h3>
              <span className="text-[11px] text-emerald-700/80 font-bold font-mono mt-0.5 block" dir="ltr">
                ≈ ${summaryMetrics.totalRevenueUSD.toFixed(2)}
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>

          {/* Total Profit */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی قازانجی بەدەستهاتوو</span>
              <h3 className="text-xl font-black text-indigo-600 font-mono" dir="ltr">
                {summaryMetrics.totalProfit.toLocaleString('en-US')} IQD
              </h3>
              <span className="text-[11px] text-indigo-700/80 font-bold font-mono mt-0.5 block" dir="ltr">
                ≈ ${summaryMetrics.totalProfitUSD.toFixed(2)}
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          {/* Total Items Sold */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی ژمارەی فرۆشراو</span>
              <h3 className="text-xl font-black text-slate-900 font-mono" dir="ltr">
                {summaryMetrics.totalPieces.toLocaleString('en-US')} دانە
              </h3>
              {summaryMetrics.totalWeightKg > 0 && (
                <span className="text-[11px] text-amber-600 font-bold font-mono mt-0.5 block" dir="ltr">
                  + {summaryMetrics.totalWeightKg.toFixed(2)} کگم دەرمان/خەڵووز
                </span>
              )}
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <ShoppingBag className="w-6 h-6" />
            </div>
          </div>

          {/* Distinct Products */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">جۆری کاڵای جیاواز</span>
              <h3 className="text-xl font-black text-purple-600 font-mono" dir="ltr">
                {summaryMetrics.distinctProducts} جۆر
              </h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">
                لە تەواوی وەسڵەکاندا
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <Layers className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* ─── Products Table ─── */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          
          {/* Table Header with Sorting */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm font-black text-slate-800">
                لیستی کاڵا فرۆشراوەکان ({filteredProducts.length} کاڵا)
              </h2>
            </div>

            {/* Sorting Controls */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">ڕیزبەندی:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="revenue">زۆرترین داهات</option>
                <option value="quantity">زۆرترین بڕی فرۆشراو</option>
                <option value="profit">زۆرترین قازانج</option>
                <option value="name">ناوی کاڵا (ئەلفوبێ)</option>
              </select>
              <button
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                title="گۆڕینی ئاراستەی ڕیزبەندی"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table View */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 text-slate-600 font-black border-b border-slate-200/80">
                <tr>
                  <th className="p-3.5 text-center w-12">#</th>
                  <th className="p-3.5">ناوی کاڵا و تام</th>
                  <th className="p-3.5">کەتەگۆری / کۆمپانیا</th>
                  <th className="p-3.5 text-center">بڕی فرۆشراو</th>
                  <th className="p-3.5 text-center">تێکڕای نرخ</th>
                  <th className="p-3.5 text-left font-mono">کۆی داهات (IQD)</th>
                  <th className="p-3.5 text-left font-mono">قازانج (IQD)</th>
                  <th className="p-3.5 text-center w-24">مێژوو</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-bold">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                        <span>خەریکی بارکردنی شیکارییەکانە...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-bold">
                      هیچ کاڵایەکی فرۆشراو لەم ماوەیە یان بەم فلتەرانە نەدۆزرایەوە!
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod, idx) => {
                    const avgPrice = prod.baseQuantity > 0 ? Math.round(prod.totalRevenue / prod.baseQuantity) : 0;
                    return (
                      <tr 
                        key={prod.productId || prod.name} 
                        className="hover:bg-indigo-50/40 transition-colors"
                      >
                        <td className="p-3.5 text-center font-mono font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="p-3.5">
                          <div className="font-black text-slate-900 text-xs">
                            {prod.name}
                          </div>
                          {prod.barcode && (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block" dir="ltr">
                              {prod.barcode}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] ml-1">
                            {prod.category}
                          </span>
                          {prod.company !== 'نەزانراو' && (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">
                              {prod.company}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-black text-slate-900 font-mono" dir="ltr">
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-100">
                            {prod.baseQuantity.toLocaleString('en-US')} {prod.unitLabel}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-700" dir="ltr">
                          {avgPrice.toLocaleString('en-US')}
                        </td>
                        <td className="p-3.5 text-left font-mono font-black text-emerald-600 text-sm" dir="ltr">
                          {prod.totalRevenue.toLocaleString('en-US')}
                        </td>
                        <td className="p-3.5 text-left font-mono font-black text-indigo-600" dir="ltr">
                          {prod.totalProfit.toLocaleString('en-US')}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => setSelectedProductForModal(prod)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 transition-colors shadow-2xs"
                            title="بینینی وەسڵەکان"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      {/* ─── Product Sales History Drilldown Modal ─── */}
      {selectedProductForModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-[11px] font-bold text-indigo-600 block">وردەکاری فرۆشتنی ئەم کاڵایە</span>
                <h3 className="text-base font-black text-slate-900">
                  {selectedProductForModal.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedProductForModal(null)}
                className="p-2 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics of this Product */}
            <div className="grid grid-cols-3 gap-2 p-4 bg-indigo-50/50 border-b border-indigo-100/50 text-center">
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">کۆی بڕ</span>
                <span className="text-sm font-black text-indigo-700 font-mono" dir="ltr">
                  {selectedProductForModal.baseQuantity} {selectedProductForModal.unitLabel}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">کۆی داهات</span>
                <span className="text-sm font-black text-emerald-700 font-mono" dir="ltr">
                  {selectedProductForModal.totalRevenue.toLocaleString('en-US')} IQD
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">قازانج</span>
                <span className="text-sm font-black text-amber-700 font-mono" dir="ltr">
                  {selectedProductForModal.totalProfit.toLocaleString('en-US')} IQD
                </span>
              </div>
            </div>

            {/* Transactions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-600 mb-2">
                لیستی پسوڵەکان ({selectedProductForModal.transactions.length} جار فرۆشراوە):
              </h4>
              {selectedProductForModal.transactions.map((tx, i) => {
                const isWgt = selectedProductForModal.barcode.startsWith('WGT-');
                const isMtr = selectedProductForModal.barcode.startsWith('MTR-');
                const base = isWgt ? tx.quantity / 1000 : isMtr ? tx.quantity / 100 : tx.quantity;
                const totalIQD = Math.round(tx.price * base);

                return (
                  <div 
                    key={i} 
                    className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800">
                        بەروار: {format(new Date(tx.createdAt), 'yyyy/MM/dd - hh:mm a')}
                      </div>
                      <div className="text-slate-500 mt-0.5 flex items-center gap-2 text-[11px]">
                        <span>شێواز: {tx.paymentMethod === 'Debt' ? `قەرز (${tx.customerName || 'نەزانراو'})` : tx.paymentMethod}</span>
                      </div>
                    </div>

                    <div className="text-left font-mono">
                      <div className="font-black text-slate-900" dir="ltr">
                        {base.toLocaleString('en-US')} {selectedProductForModal.unitLabel}
                      </div>
                      <div className="text-emerald-600 font-bold text-[11px]" dir="ltr">
                        {totalIQD.toLocaleString('en-US')} IQD
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button
                onClick={() => setSelectedProductForModal(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
              >
                داخستن
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
