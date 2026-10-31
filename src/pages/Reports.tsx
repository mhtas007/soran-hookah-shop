import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  TrendingUp,
  Calendar,
  Layers,
  Activity,
  Award,
  ShoppingBag,
  DollarSign,
  ArrowDownToLine,
  Target,
  FileText,
  Printer,
  FileSpreadsheet,
  Building2,
  PieChart,
  RefreshCw,
  Sparkles,
  CreditCard,
  Banknote,
  Clock,
  X,
  Eye
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLogger';
import { startOfDay, endOfDay, format, startOfMonth, endOfMonth, subDays, startOfYear, subMonths } from 'date-fns';
import { useAppStore } from '../store/useAppStore';

interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  sales: number;
  profit: number;
}

interface TopCompany {
  name: string;
  sales: number;
  itemsCount: number;
}

interface Receipt {
  id: string;
  created_at: string;
  payment_method: string;
  discount: number;
  total_amount: number;
  customer_name?: string;
}

interface Metrics {
  totalSales: number;
  receivedMoney: number;
  returnedDebts: number;
  remainingDebt: number;
  bulkSales: number;
  retailSales: number;
  totalCost: number;
  expenses: number;
  netProfit: number;
  totalDiscount: number;
  receiptCount: number;
  avgReceiptValue: number;
  itemsSold: number;
  topProductName: string;
  topProducts: TopProduct[];
  topCompanies: TopCompany[];
  receipts: Receipt[];
  cashSales: number;
  fibSales: number;
  debtSales: number;
}

export const Reports: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const settings = useAppStore(state => state.settings);
  const usdRate = settings.usdRate || 150000;
  const isCashier = currentUser?.role === 'Cashier';

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'Overview' | 'General' | 'V'>('Overview');
  
  // A4 Modal Preview State
  const [showA4Modal, setShowA4Modal] = useState(false);

  // Date Presets filter
  const [quickFilter, setQuickFilter] = useState<'Today' | 'Yesterday' | 'Week' | 'Month' | 'LastMonth' | 'Year' | 'All' | 'Custom'>('Today');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [reportData, setReportData] = useState<{ Overall: Metrics; General: Metrics; V: Metrics }>({
    Overall: createEmptyMetrics(),
    General: createEmptyMetrics(),
    V: createEmptyMetrics()
  });

  function createEmptyMetrics(): Metrics {
    return {
      totalSales: 0, receivedMoney: 0, returnedDebts: 0, remainingDebt: 0,
      bulkSales: 0, retailSales: 0, totalCost: 0, expenses: 0, netProfit: 0,
      totalDiscount: 0, receiptCount: 0, avgReceiptValue: 0, itemsSold: 0,
      topProductName: '-', topProducts: [], topCompanies: [], receipts: [],
      cashSales: 0, fibSales: 0, debtSales: 0
    };
  }

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const handleQuickFilter = (type: 'Today' | 'Yesterday' | 'Week' | 'Month' | 'LastMonth' | 'Year' | 'All') => {
    setQuickFilter(type);
    const now = new Date();
    if (type === 'Today') {
      setStartDate(format(now, 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (type === 'Yesterday') {
      const y = subDays(now, 1);
      setStartDate(format(y, 'yyyy-MM-dd'));
      setEndDate(format(y, 'yyyy-MM-dd'));
    } else if (type === 'Week') {
      setStartDate(format(subDays(now, 7), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (type === 'Month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (type === 'LastMonth') {
      const prevMonth = subMonths(now, 1);
      setStartDate(format(startOfMonth(prevMonth), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(prevMonth), 'yyyy-MM-dd'));
    } else if (type === 'Year') {
      setStartDate(format(startOfYear(now), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (type === 'All') {
      setStartDate('2023-01-01');
      setEndDate(format(now, 'yyyy-MM-dd'));
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    setIsRefreshing(true);
    try {
      const start = startOfDay(new Date(startDate)).toISOString();
      const end = endOfDay(new Date(endDate)).toISOString();

      // Fetch Sales
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*, customer:debt_customer_id(name)')
        .gte('created_at', start)
        .lte('created_at', end)
        .eq('status', 'Completed');

      if (salesError) throw salesError;

      // Fetch Sale Items
      const saleIds = sales?.map(s => s.id) || [];
      let saleItems: any[] = [];
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('*, product:product_id (section, bulk_size, company, barcode)')
          .in('sale_id', saleIds);
        if (items) saleItems = items;
      }

      // Fetch Expenses
      const { data: expenses, error: expensesError } = await supabase
        .from('expenses')
        .select('amount')
        .gte('date', start)
        .lte('date', end);

      if (expensesError) throw expensesError;

      // Fetch Debt Payments
      const { data: debtPayments, error: dpError } = await supabase
        .from('debt_payments')
        .select('amount')
        .gte('date', start)
        .lte('date', end);

      if (dpError) throw dpError;

      // Aggregate Metrics
      let ov = createEmptyMetrics();
      let gen = createEmptyMetrics();
      let v = createEmptyMetrics();

      // Process Sales
      sales?.forEach((sale: any) => {
        const rcpt: Receipt = {
          id: sale.id, 
          created_at: sale.created_at, 
          payment_method: sale.payment_method,
          discount: sale.discount || 0, 
          total_amount: sale.total_amount,
          customer_name: sale.customer?.name
        };
        ov.receipts.push(rcpt);
        ov.receiptCount++;
        ov.totalDiscount += sale.discount || 0;

        if (sale.payment_method === 'Cash') {
          ov.cashSales += sale.total_amount;
          ov.receivedMoney += sale.total_amount;
        } else if (sale.payment_method === 'FIB') {
          ov.fibSales += sale.total_amount;
          ov.receivedMoney += sale.total_amount;
        } else if (sale.payment_method === 'Debt') {
          const paid = sale.payment_amount || 0;
          ov.debtSales += sale.total_amount;
          ov.receivedMoney += paid;
          ov.remainingDebt += Math.max(0, sale.total_amount - paid);
        }
      });

      // Process Debt Payments
      ov.returnedDebts = debtPayments?.reduce((sum, dp) => sum + (dp.amount || 0), 0) || 0;
      ov.receivedMoney += ov.returnedDebts;

      // Process Expenses
      ov.expenses = expenses?.reduce((sum, exp) => sum + (exp.amount || 0), 0) || 0;

      // Process Sale Items
      const genProdMap: Record<string, TopProduct> = {};
      const vProdMap: Record<string, TopProduct> = {};
      
      const ovCompMap: Record<string, TopCompany> = {};
      const genCompMap: Record<string, TopCompany> = {};
      const vCompMap: Record<string, TopCompany> = {};

      saleItems.forEach(item => {
        const section = item.product?.section || 'General';
        const isWgt = item.product?.barcode?.startsWith('WGT-') || false;
        const isMtr = item.product?.barcode?.startsWith('MTR-') || false;
        const baseQty = isWgt ? item.quantity / 1000 : isMtr ? item.quantity / 100 : item.quantity;
        const bSize = item.product?.bulk_size || 1;
        const isBulk = bSize > 1 && baseQty >= bSize;
        
        const saleAmount = item.price * baseQty;
        const costAmount = item.cost * baseQty;
        const profit = saleAmount - costAmount;
        const companyName = item.product?.company || 'نەزانراو';

        // Overall additions
        ov.totalSales += saleAmount;
        ov.totalCost += costAmount;
        ov.itemsSold += item.quantity;
        if (isBulk) ov.bulkSales += saleAmount; else ov.retailSales += saleAmount;
        
        if (!ovCompMap[companyName]) ovCompMap[companyName] = { name: companyName, sales: 0, itemsCount: 0 };
        ovCompMap[companyName].sales += saleAmount;
        ovCompMap[companyName].itemsCount += item.quantity;

        // Section Additions
        if (section === 'V') {
          v.totalSales += saleAmount;
          v.totalCost += costAmount;
          v.itemsSold += item.quantity;
          if (isBulk) v.bulkSales += saleAmount; else v.retailSales += saleAmount;
          
          if (!vProdMap[item.product_id]) vProdMap[item.product_id] = { id: item.product_id, name: item.name, quantity: 0, sales: 0, profit: 0 };
          vProdMap[item.product_id].quantity += item.quantity;
          vProdMap[item.product_id].sales += saleAmount;
          vProdMap[item.product_id].profit += profit;

          if (!vCompMap[companyName]) vCompMap[companyName] = { name: companyName, sales: 0, itemsCount: 0 };
          vCompMap[companyName].sales += saleAmount;
          vCompMap[companyName].itemsCount += item.quantity;
        } else {
          gen.totalSales += saleAmount;
          gen.totalCost += costAmount;
          gen.itemsSold += item.quantity;
          if (isBulk) gen.bulkSales += saleAmount; else gen.retailSales += saleAmount;
          
          if (!genProdMap[item.product_id]) genProdMap[item.product_id] = { id: item.product_id, name: item.name, quantity: 0, sales: 0, profit: 0 };
          genProdMap[item.product_id].quantity += item.quantity;
          genProdMap[item.product_id].sales += saleAmount;
          genProdMap[item.product_id].profit += profit;

          if (!genCompMap[companyName]) genCompMap[companyName] = { name: companyName, sales: 0, itemsCount: 0 };
          genCompMap[companyName].sales += saleAmount;
          genCompMap[companyName].itemsCount += item.quantity;
        }
      });

      // Calculations
      ov.avgReceiptValue = ov.receiptCount > 0 ? (ov.totalSales / ov.receiptCount) : 0;
      ov.netProfit = (ov.totalSales - ov.totalCost) - ov.expenses - ov.totalDiscount;

      gen.netProfit = gen.totalSales - gen.totalCost;
      v.netProfit = v.totalSales - v.totalCost;

      // Top Products
      gen.topProducts = Object.values(genProdMap).sort((a, b) => b.sales - a.sales);
      v.topProducts = Object.values(vProdMap).sort((a, b) => b.sales - a.sales);
      
      ov.topCompanies = Object.values(ovCompMap).sort((a, b) => b.sales - a.sales);
      gen.topCompanies = Object.values(genCompMap).sort((a, b) => b.sales - a.sales);
      v.topCompanies = Object.values(vCompMap).sort((a, b) => b.sales - a.sales);
      
      const allProds = [...gen.topProducts, ...v.topProducts].sort((a, b) => b.sales - a.sales);
      ov.topProducts = allProds;
      ov.topProductName = allProds.length > 0 ? allProds[0].name : '-';
      gen.topProductName = gen.topProducts.length > 0 ? gen.topProducts[0].name : '-';
      v.topProductName = v.topProducts.length > 0 ? v.topProducts[0].name : '-';

      setReportData({ Overall: ov, General: gen, V: v });

    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const activeMetrics = activeTab === 'Overview' ? reportData.Overall : (activeTab === 'General' ? reportData.General : reportData.V);

  // Export to Excel / CSV
  const exportToExcel = () => {
    logActivity('DATA_EXPORTED', `دابەزاندنی ڕاپۆرت (Excel/CSV) — ${startDate} بۆ ${endDate}`);
    const headers = ['ژمارەی پسوڵە', 'بەروار و کات', 'شێوازی پارەدان', 'کڕیار', 'داشکاندن (IQD)', 'کۆی گشتی (IQD)'];
    const rows = activeMetrics.receipts.map((r, i) => [
      i + 1,
      format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
      r.payment_method === 'Cash' ? 'نەقد' : r.payment_method === 'FIB' ? 'FIB' : 'قەرز',
      r.customer_name || 'کڕیاری گشتی',
      r.discount,
      r.total_amount
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + headers.join(",") + "\n" 
      + rows.map(e => e.map(val => `"${val}"`).join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Soran_Report_${activeTab}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-kurdish pb-12 animate-in select-none">
      
      {/* ─── Top Header (Screen Only) ─── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-xs print:hidden">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 hover:bg-slate-100 rounded-full transition-colors border border-slate-200/60"
            title="گەڕانەوە بۆ داشبۆرد"
          >
            <ArrowRight className="w-5 h-5 text-slate-600" />
          </button>
          
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-violet-200">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                ڕاپۆرتە گشتگیرەکان و شیکاری دارایی
              </h1>
              <p className="text-xs text-slate-400 font-medium">شیکاری فرۆشتن، قازانج، خەرجی و وردبینی داهات</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchReport}
            disabled={isRefreshing}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all border border-slate-200 active:scale-95 shadow-2xs"
            title="نوێکردنەوەی داتا"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">نوێکردنەوە</span>
          </button>

          <button 
            onClick={exportToExcel} 
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all border border-emerald-200 active:scale-95 shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel / CSV</span>
          </button>

          <button 
            onClick={() => setShowA4Modal(true)} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-indigo-500/20 active:scale-95"
            title="پیشاندان و چاپکردنی ڕاپۆرت بە قەبارەی فەرمی A4"
          >
            <Eye className="w-4 h-4" />
            <span>ڕاپۆرتی فەرمی (A4 PDF)</span>
          </button>
        </div>
      </header>

      {/* ─── Screen Main UI ─── */}
      <main className="p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6 print:hidden">
        
        {/* ─── Filter Suite Bar ─── */}
        <div className="bg-white p-4 rounded-3xl shadow-xs border border-slate-200/80 space-y-4">
          
          {/* Section Tabs */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-center">
            <div className="flex bg-slate-100/90 p-1.5 rounded-2xl w-full sm:w-auto border border-slate-200/60">
              <button 
                onClick={() => setActiveTab('Overview')}
                className={`flex-1 sm:flex-none px-5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'Overview' 
                    ? 'bg-indigo-600 text-white shadow-sm font-black' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Activity className="w-4 h-4" /> 
                هەموو فرۆشگا (Overview)
              </button>
              
              <button 
                onClick={() => setActiveTab('General')}
                className={`flex-1 sm:flex-none px-5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'General' 
                    ? 'bg-blue-600 text-white shadow-sm font-black' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" /> 
                بەشی گشتی
              </button>
              
              <button 
                onClick={() => setActiveTab('V')}
                className={`flex-1 sm:flex-none px-5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'V' 
                    ? 'bg-purple-600 text-white shadow-sm font-black' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4" /> 
                بەشی V (Vape)
              </button>
            </div>

            {/* Live Period Label */}
            <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>ماوەی دیاریکراو:</span>
              <span className="font-mono text-slate-700 font-bold" dir="ltr">{startDate} → {endDate}</span>
            </div>
          </div>

          {/* Quick Date Presets & Custom Range */}
          <div className="flex flex-wrap gap-2 items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'Today', label: 'ئەمڕۆ' },
                { id: 'Yesterday', label: 'دوێنێ' },
                { id: 'Week', label: '٧ ڕۆژ' },
                { id: 'Month', label: 'ئەم مانگە' },
                { id: 'LastMonth', label: 'مانگی پێشوو' },
                { id: 'Year', label: 'ئەمساڵ' },
                { id: 'All', label: 'هەمووی' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => handleQuickFilter(p.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    quickFilter === p.id 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs' 
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Range Inputs */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 text-xs font-bold">
              <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
              <input 
                type="date" 
                value={startDate} 
                onChange={e => { setStartDate(e.target.value); setQuickFilter('Custom'); }} 
                className="bg-transparent border-none outline-none text-slate-700 font-mono text-xs cursor-pointer" 
              />
              <span className="text-slate-300">تا</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => { setEndDate(e.target.value); setQuickFilter('Custom'); }} 
                className="bg-transparent border-none outline-none text-slate-700 font-mono text-xs cursor-pointer" 
              />
            </div>
          </div>

        </div>

        {/* ─── Loading State ─── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-indigo-500 animate-pulse">
            <RefreshCw className="w-12 h-12 mb-3 animate-spin text-indigo-600" />
            <p className="font-black text-slate-700 text-sm">خەریکی شیکردنەوە و کۆکردنەوەی داتاکانە...</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* ─── Hero Net Profit Banner (Admin/Manager only) ─── */}
            {!isCashier && (
              <div className={`p-6 sm:p-8 rounded-[2rem] shadow-xl flex flex-col justify-between relative overflow-hidden text-white transition-all ${
                activeMetrics.netProfit >= 0 
                  ? 'bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 shadow-emerald-900/20' 
                  : 'bg-gradient-to-br from-rose-600 via-rose-700 to-red-900 shadow-rose-900/20'
              }`}>
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 relative z-10">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white/15 backdrop-blur-md mb-3 border border-white/20">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{activeTab === 'Overview' ? 'پوختەی قازانجی سافی فرۆشگا' : 'قازانجی بەشی دیاریکراو'}</span>
                    </div>

                    <h2 className="text-3xl sm:text-5xl font-black font-mono tracking-tight" dir="ltr">
                      {activeMetrics.netProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}{' '}
                      <span className="text-xl sm:text-2xl font-kurdish font-normal opacity-80">IQD</span>
                    </h2>

                    <p className="text-xs sm:text-sm text-emerald-100/90 font-medium mt-2">
                      ≈ ${(activeMetrics.netProfit / (usdRate / 100)).toFixed(2)} دۆلار (دوای تێچوو و داشکاندن و خەرجی)
                    </p>
                  </div>

                  <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shrink-0">
                    <Award className="w-9 h-9 text-amber-300" />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Financial KPI Cards Grid ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Total Sales */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">کۆی گشتی فرۆشتن</span>
                  <h3 className="text-2xl font-black text-indigo-600 font-mono" dir="ltr">
                    {activeMetrics.totalSales.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">
                    ≈ ${(activeMetrics.totalSales / (usdRate / 100)).toFixed(2)} USD
                  </span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>

              {/* Received Money */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">پارەی وەرگیراو (نەقد + FIB)</span>
                  <h3 className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">
                    {activeMetrics.receivedMoney.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </h3>
                  <span className="text-[11px] text-emerald-600 font-bold mt-0.5 block">
                    داهاتی هاتووە ناو سندوق
                  </span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>

              {/* Remaining Debt */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">قەرزی نوێی دراو (باقی)</span>
                  <h3 className="text-2xl font-black text-amber-600 font-mono" dir="ltr">
                    {activeMetrics.remainingDebt.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </h3>
                  <span className="text-[11px] text-amber-600 font-medium mt-0.5 block">
                    قەرزی دراو لەم ماوەیەدا
                  </span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
              </div>

              {/* Returned Debts */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">قەرزی گەڕاوە</span>
                  <h3 className="text-2xl font-black text-teal-600 font-mono" dir="ltr">
                    {activeMetrics.returnedDebts.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </h3>
                  <span className="text-[11px] text-teal-600 font-bold mt-0.5 block">
                    پارەی وەرگیراوی کۆن
                  </span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>

              {/* Bulk Sales */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">فرۆشتنی جوملە (کۆتە)</span>
                  <h3 className="text-xl font-black text-purple-600 font-mono" dir="ltr">
                    {activeMetrics.bulkSales.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">بڕی کۆتەی فرۆشراو</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
              </div>

              {/* Retail Sales */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">فرۆشتنی تاک (دانە)</span>
                  <h3 className="text-xl font-black text-cyan-600 font-mono" dir="ltr">
                    {activeMetrics.retailSales.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">بڕی تاکی فرۆشراو</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              </div>

              {/* Total Cost (Hidden from Cashier) */}
              {!isCashier && (
                <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">کۆی تێچووی کاڵا</span>
                    <h3 className="text-xl font-black text-slate-700 font-mono" dir="ltr">
                      {activeMetrics.totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </h3>
                    <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">نرخی کڕینی سەرەتایی</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
              )}

              {/* Expenses (Overview only) */}
              {activeTab === 'Overview' && (
                <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">کۆی خەرجییەکان</span>
                    <h3 className="text-xl font-black text-rose-600 font-mono" dir="ltr">
                      {activeMetrics.expenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </h3>
                    <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">خەرجی تۆمارکراو</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <PieChart className="w-5 h-5" />
                  </div>
                </div>
              )}

              {/* Discounts */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">کۆی داشکاندنەکان</span>
                  <h3 className="text-xl font-black text-fuchsia-600 font-mono" dir="ltr">
                    {activeMetrics.totalDiscount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">داشکاندنی سەر وەسڵ</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center">
                  <Target className="w-5 h-5" />
                </div>
              </div>

              {/* Receipts Count */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">ژمارەی وەسڵەکان</span>
                  <h3 className="text-xl font-black text-blue-600 font-mono" dir="ltr">
                    {activeMetrics.receiptCount}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">وەسڵی تەواوکراو</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
              </div>

              {/* Average Receipt Value */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">تێکڕای وەسڵ</span>
                  <h3 className="text-xl font-black text-slate-800 font-mono" dir="ltr">
                    {Math.round(activeMetrics.avgReceiptValue).toLocaleString('en-US')}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">تێکڕای پارە بۆ هەر وەسڵێک</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
              </div>

              {/* Total Items Sold */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">کاڵا فرۆشراوەکان</span>
                  <h3 className="text-xl font-black text-teal-600 font-mono" dir="ltr">
                    {activeMetrics.itemsSold}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">کۆی گشتی پارچە و کێش</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              </div>

            </div>

            {/* ─── Payment Methods Breakdown Bar ─── */}
            <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                شیکاری شێوازی پارەدان (Payment Methods)
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-800 block">نەقد (Cash)</span>
                    <span className="text-base font-black text-emerald-900 font-mono" dir="ltr">
                      {activeMetrics.cashSales.toLocaleString('en-US')} IQD
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-white px-2 py-1 rounded-xl shadow-2xs">
                    {activeMetrics.totalSales > 0 ? Math.round((activeMetrics.cashSales / activeMetrics.totalSales) * 100) : 0}%
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-indigo-800 block">ئۆنلاین (FIB)</span>
                    <span className="text-base font-black text-indigo-900 font-mono" dir="ltr">
                      {activeMetrics.fibSales.toLocaleString('en-US')} IQD
                    </span>
                  </div>
                  <span className="text-xs font-bold text-indigo-700 bg-white px-2 py-1 rounded-xl shadow-2xs">
                    {activeMetrics.totalSales > 0 ? Math.round((activeMetrics.fibSales / activeMetrics.totalSales) * 100) : 0}%
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-800 block">قەرز (Debt)</span>
                    <span className="text-base font-black text-amber-900 font-mono" dir="ltr">
                      {activeMetrics.debtSales.toLocaleString('en-US')} IQD
                    </span>
                  </div>
                  <span className="text-xs font-bold text-amber-700 bg-white px-2 py-1 rounded-xl shadow-2xs">
                    {activeMetrics.totalSales > 0 ? Math.round((activeMetrics.debtSales / activeMetrics.totalSales) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* ─── Top Selling Products & Suppliers ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Top Products */}
              <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-2.5">
                    <Award className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-slate-800 text-sm">پڕفرۆشترین کاڵاکان</h3>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-100">
                    {activeMetrics.topProducts.length} کاڵا
                  </span>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                      <tr>
                        <th className="p-3.5 text-center w-10">#</th>
                        <th className="p-3.5">ناوی کاڵا</th>
                        <th className="p-3.5 text-center">دانە</th>
                        <th className="p-3.5">کۆی فرۆشتن</th>
                        {!isCashier && <th className="p-3.5">قازانج</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {activeMetrics.topProducts.slice(0, 10).map((prod, idx) => (
                        <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-center font-mono text-slate-400">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                          </td>
                          <td className="p-3.5 font-bold text-slate-900">{prod.name}</td>
                          <td className="p-3.5 text-center font-mono font-bold text-slate-600">{prod.quantity}</td>
                          <td className="p-3.5 font-mono font-black text-indigo-600" dir="ltr">
                            {prod.sales.toLocaleString('en-US')} IQD
                          </td>
                          {!isCashier && (
                            <td className="p-3.5 font-mono font-bold text-emerald-600" dir="ltr">
                              {prod.profit.toLocaleString('en-US')} IQD
                            </td>
                          )}
                        </tr>
                      ))}
                      {activeMetrics.topProducts.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-slate-400">هیچ کاڵایەک نەفرۆشراوە لەم ماوەیەدا</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top Companies / Brands */}
              <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-5 h-5 text-orange-500" />
                    <h3 className="font-bold text-slate-800 text-sm">فرۆشتن بەپێی کۆمپانیا و براند</h3>
                  </div>
                  <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-xl border border-orange-100">
                    {activeMetrics.topCompanies.length} کۆمپانیا
                  </span>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                      <tr>
                        <th className="p-3.5 text-center w-10">#</th>
                        <th className="p-3.5">ناوی کۆمپانیا</th>
                        <th className="p-3.5 text-center">دانە</th>
                        <th className="p-3.5">کۆی فرۆشتن</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {activeMetrics.topCompanies.slice(0, 10).map((comp, idx) => (
                        <tr key={comp.name} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-center font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-3.5 font-bold text-slate-900">{comp.name}</td>
                          <td className="p-3.5 text-center font-mono font-bold text-slate-600">{comp.itemsCount}</td>
                          <td className="p-3.5 font-mono font-black text-orange-600" dir="ltr">
                            {comp.sales.toLocaleString('en-US')} IQD
                          </td>
                        </tr>
                      ))}
                      {activeMetrics.topCompanies.length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-slate-400">هیچ داتایەکی کۆمپانیا نییە لەم بەروارەدا</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* ─── Receipts Archive Table ─── */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 text-sm">ئەرشیفی پسوڵەکانی ئەم بەروارە</h3>
                </div>
                <span className="text-xs font-bold text-slate-500 font-mono">
                  {activeMetrics.receipts.length} پسوڵە
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">بەروار و کات</th>
                      <th className="p-3.5">کڕیار</th>
                      <th className="p-3.5 text-center">شێوازی پارەدان</th>
                      <th className="p-3.5">داشکاندن</th>
                      <th className="p-3.5">کۆی گشتی</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {activeMetrics.receipts.map((r, i) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 text-center font-mono text-slate-400">{i + 1}</td>
                        <td className="p-3.5 font-mono text-slate-700" dir="ltr">
                          {format(new Date(r.created_at), 'yyyy-MM-dd hh:mm a')}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {r.customer_name || 'کڕیاری گشتی'}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                            r.payment_method === 'Cash' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : r.payment_method === 'FIB' 
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {r.payment_method === 'Cash' ? 'نەقد' : r.payment_method === 'FIB' ? 'FIB' : 'قەرز'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-rose-500" dir="ltr">
                          {r.discount > 0 ? `${r.discount.toLocaleString('en-US')} IQD` : '-'}
                        </td>
                        <td className="p-3.5 font-mono font-black text-indigo-600" dir="ltr">
                          {r.total_amount.toLocaleString('en-US')} IQD
                        </td>
                      </tr>
                    ))}
                    {activeMetrics.receipts.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-400">هیچ پسوڵەیەک نییە لەم بەروارەدا</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* ─── INTERACTIVE A4 REPORT PREVIEW MODAL (Screen View) ─── */}
      {showA4Modal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-start p-4 overflow-y-auto print:hidden animate-in">
          
          {/* Modal Header Control Bar */}
          <div className="sticky top-0 z-10 w-full max-w-4xl bg-slate-900 text-white px-6 py-4 rounded-2xl flex items-center justify-between shadow-2xl mb-4 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black">پیشبینینی دۆکیومێنتی A4 (Official Report Preview)</h3>
                <p className="text-xs text-slate-400">بەروار: {startDate} تا {endDate}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>چاپکردن / داگرتنی PDF</span>
              </button>

              <button
                onClick={() => setShowA4Modal(false)}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
                title="داخستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Paper Sheet Preview Container */}
          <div className="w-full max-w-4xl bg-white text-slate-900 rounded-2xl shadow-2xl p-8 sm:p-12 mb-8 border border-slate-200 select-text">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-slate-900 pb-5 mb-6">
              <div className="flex items-center gap-4">
                {settings.logoUrl && (
                  <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-xl border p-1" />
                )}
                <div>
                  <h1 className="text-2xl font-black text-slate-950">{settings.shopName || 'سۆران هۆکە شۆپ'}</h1>
                  <p className="text-xs text-slate-600 font-bold mt-0.5">{settings.receiptHeader || 'نێرگەلە و پێداویستییەکانی نێرگەلە'}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-1">
                    {settings.phone && <span>تەلەفۆن: {settings.phone}</span>}
                    {settings.address && <span>ناونیشان: {settings.address}</span>}
                  </div>
                </div>
              </div>

              <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-black block text-slate-900 mb-0.5">ڕاپۆرتی فەرمی دارایی (A4)</span>
                <span className="text-[10px] text-slate-600 block font-mono" dir="ltr">بەروار: {startDate} تا {endDate}</span>
                <span className="text-[10px] text-slate-600 block font-mono" dir="ltr">چاپکراوە: {format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
                <span className="text-[10px] text-indigo-700 font-bold block">کارمەند: {currentUser?.name || 'سەرەکی'}</span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mb-6">
              <h3 className="text-sm font-black text-slate-900 border-r-4 border-indigo-600 pr-2 mb-2">
                پوختەی دارایی و فرۆشتنی ئەم ماوەیە
              </h3>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2.5 border-l border-slate-300">کۆی گشتی فرۆشتن</th>
                    <th className="p-2.5 border-l border-slate-300">پارەی وەرگیراو</th>
                    <th className="p-2.5 border-l border-slate-300">قەرزی دراو (باقی)</th>
                    <th className="p-2.5 border-l border-slate-300">قەرزی گەڕاوە</th>
                    <th className="p-2.5 border-l border-slate-300">خەرجییەکان</th>
                    {!isCashier && <th className="p-2.5 bg-slate-200">قازانجی سافی</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono font-bold">
                  <tr>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.totalSales.toLocaleString('en-US')} IQD</td>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.receivedMoney.toLocaleString('en-US')} IQD</td>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.remainingDebt.toLocaleString('en-US')} IQD</td>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.returnedDebts.toLocaleString('en-US')} IQD</td>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.expenses.toLocaleString('en-US')} IQD</td>
                    {!isCashier && <td className="p-2.5 bg-slate-100 font-black text-slate-950">{activeMetrics.netProfit.toLocaleString('en-US')} IQD</td>}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Split Metrics */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                <h4 className="text-xs font-black text-slate-900 mb-2 border-b pb-1">شێوازی پارەدان:</h4>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>نەقد (Cash):</span>
                    <span className="font-mono font-bold text-emerald-700">{activeMetrics.cashSales.toLocaleString('en-US')} IQD</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ئۆنلاین (FIB):</span>
                    <span className="font-mono font-bold text-indigo-700">{activeMetrics.fibSales.toLocaleString('en-US')} IQD</span>
                  </div>
                  <div className="flex justify-between">
                    <span>قەرز (Debt):</span>
                    <span className="font-mono font-bold text-amber-700">{activeMetrics.debtSales.toLocaleString('en-US')} IQD</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                <h4 className="text-xs font-black text-slate-900 mb-2 border-b pb-1">قەبارەی فرۆشتن و پسوڵە:</h4>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>ژمارەی وەسڵەکان:</span>
                    <span className="font-mono font-bold">{activeMetrics.receiptCount} پسوڵە</span>
                  </div>
                  <div className="flex justify-between">
                    <span>کۆی کاڵای فرۆشراو:</span>
                    <span className="font-mono font-bold">{activeMetrics.itemsSold} دانە</span>
                  </div>
                  <div className="flex justify-between">
                    <span>کۆی داشکاندن:</span>
                    <span className="font-mono font-bold text-rose-600">{activeMetrics.totalDiscount.toLocaleString('en-US')} IQD</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Products */}
            {activeMetrics.topProducts.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-black text-slate-900 border-r-4 border-amber-500 pr-2 mb-2">
                  پڕفرۆشترین کاڵاکان لەم ماوەیەدا
                </h3>
                <table className="w-full text-right text-xs border border-slate-300">
                  <thead className="bg-slate-100 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                      <th className="p-2 border-l border-slate-300">ناوی کاڵا</th>
                      <th className="p-2 border-l border-slate-300 text-center">ژمارەی فرۆشراو</th>
                      <th className="p-2">کۆی پارەی فرۆشتن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeMetrics.topProducts.slice(0, 5).map((p, idx) => (
                      <tr key={p.id}>
                        <td className="p-2 text-center font-mono border-l border-slate-300">{idx + 1}</td>
                        <td className="p-2 font-bold border-l border-slate-300">{p.name}</td>
                        <td className="p-2 text-center font-mono font-bold border-l border-slate-300">{p.quantity}</td>
                        <td className="p-2 font-mono font-bold" dir="ltr">{p.sales.toLocaleString('en-US')} IQD</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Receipts */}
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-900 border-r-4 border-blue-600 pr-2 mb-2">
                لیستی پسوڵەکانی فرۆشتن
              </h3>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                    <th className="p-2 border-l border-slate-300">کات</th>
                    <th className="p-2 border-l border-slate-300">کڕیار</th>
                    <th className="p-2 border-l border-slate-300 text-center">شێواز</th>
                    <th className="p-2 border-l border-slate-300">داشکاندن</th>
                    <th className="p-2">کۆی گشتی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeMetrics.receipts.slice(0, 30).map((r, idx) => (
                    <tr key={r.id}>
                      <td className="p-1.5 text-center font-mono border-l border-slate-300">{idx + 1}</td>
                      <td className="p-1.5 font-mono border-l border-slate-300" dir="ltr">{format(new Date(r.created_at), 'yyyy-MM-dd HH:mm')}</td>
                      <td className="p-1.5 font-bold border-l border-slate-300">{r.customer_name || 'گشتی'}</td>
                      <td className="p-1.5 text-center border-l border-slate-300">{r.payment_method === 'Cash' ? 'نەقد' : r.payment_method === 'FIB' ? 'FIB' : 'قەرز'}</td>
                      <td className="p-1.5 font-mono border-l border-slate-300" dir="ltr">{r.discount > 0 ? r.discount.toLocaleString() : '-'}</td>
                      <td className="p-1.5 font-mono font-bold" dir="ltr">{r.total_amount.toLocaleString()} IQD</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {activeMetrics.receipts.length > 30 && (
                <p className="text-[10px] text-slate-500 mt-1 italic text-left" dir="ltr">* Showing first 30 of {activeMetrics.receipts.length} invoices. Export to Excel for full raw ledger.</p>
              )}
            </div>

            {/* Signature */}
            <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center text-xs">
              <div>
                <p className="font-bold text-slate-800">ئامادەکاری ڕاپۆرت: <span className="font-normal">{currentUser?.name || 'بەڕێوەبەر'}</span></p>
                <p className="text-slate-500 text-[10px] mt-1">ئەم دۆکیومێنتە فەرمییە و لە سیستەمی کۆمپیتەری فرۆشگاوە دەرکراوە.</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 mb-8">مۆر و واژووی پەسەندکردن</p>
                <p className="text-slate-400 font-mono">...........................................</p>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─── DEDICATED LUXURY A4 PRINTABLE DOCUMENT (Print Media Engine) ─── */}
      <div className="hidden print:block printable-a4 font-kurdish text-black bg-white">
        
        {/* Official Header */}
        <div className="flex justify-between items-center border-b-2 border-slate-900 pb-5 mb-6">
          <div className="flex items-center gap-4">
            {settings.logoUrl && (
              <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-black text-slate-950">{settings.shopName || 'سۆران هۆکە شۆپ'}</h1>
              <p className="text-xs text-slate-600 font-bold mt-0.5">{settings.receiptHeader || 'نێرگەلە و پێداویستییەکانی نێرگەلە'}</p>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-1">
                {settings.phone && <span>تەلەفۆن: {settings.phone}</span>}
                {settings.address && <span>ناونیشان: {settings.address}</span>}
              </div>
            </div>
          </div>

          <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-xs font-black block text-slate-900 mb-0.5">ڕاپۆرتی فەرمی دارایی (A4)</span>
            <span className="text-[10px] text-slate-500 block font-mono" dir="ltr">بەروار: {startDate} تا {endDate}</span>
            <span className="text-[10px] text-slate-500 block font-mono" dir="ltr">چاپکراوە: {format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
            <span className="text-[10px] text-indigo-700 font-bold block">کارمەند: {currentUser?.name || 'سەرەکی'}</span>
          </div>
        </div>

        {/* Financial KPI Summary Table */}
        <div className="mb-6">
          <h3 className="text-sm font-black text-slate-900 border-r-4 border-indigo-600 pr-2 mb-2">
            پوختەی دارایی و فرۆشتنی ئەم ماوەیە
          </h3>
          <table className="w-full text-right text-xs border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2.5 border-l border-slate-300">کۆی گشتی فرۆشتن</th>
                <th className="p-2.5 border-l border-slate-300">پارەی وەرگیراو</th>
                <th className="p-2.5 border-l border-slate-300">قەرزی دراو (باقی)</th>
                <th className="p-2.5 border-l border-slate-300">قەرزی گەڕاوە</th>
                <th className="p-2.5 border-l border-slate-300">خەرجییەکان</th>
                {!isCashier && <th className="p-2.5 bg-slate-200">قازانجی سافی</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono font-bold">
              <tr>
                <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.totalSales.toLocaleString('en-US')} IQD</td>
                <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.receivedMoney.toLocaleString('en-US')} IQD</td>
                <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.remainingDebt.toLocaleString('en-US')} IQD</td>
                <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.returnedDebts.toLocaleString('en-US')} IQD</td>
                <td className="p-2.5 border-l border-slate-300 text-slate-900">{activeMetrics.expenses.toLocaleString('en-US')} IQD</td>
                {!isCashier && <td className="p-2.5 bg-slate-100 font-black text-slate-950">{activeMetrics.netProfit.toLocaleString('en-US')} IQD</td>}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Details Split: Payment Methods & Volumes */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-slate-300 rounded-lg p-3">
            <h4 className="text-xs font-black text-slate-900 mb-2 border-b pb-1">شێوازی پارەدان:</h4>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span>نەقد (Cash):</span>
                <span className="font-mono font-bold">{activeMetrics.cashSales.toLocaleString('en-US')} IQD</span>
              </div>
              <div className="flex justify-between">
                <span>ئۆنلاین (FIB):</span>
                <span className="font-mono font-bold">{activeMetrics.fibSales.toLocaleString('en-US')} IQD</span>
              </div>
              <div className="flex justify-between">
                <span>قەرز (Debt):</span>
                <span className="font-mono font-bold">{activeMetrics.debtSales.toLocaleString('en-US')} IQD</span>
              </div>
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg p-3">
            <h4 className="text-xs font-black text-slate-900 mb-2 border-b pb-1">قەبارەی فرۆشتن و داشکاندن:</h4>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span>ژمارەی وەسڵەکان:</span>
                <span className="font-mono font-bold">{activeMetrics.receiptCount} پسوڵە</span>
              </div>
              <div className="flex justify-between">
                <span>کۆی کاڵای فرۆشراو:</span>
                <span className="font-mono font-bold">{activeMetrics.itemsSold} دانە</span>
              </div>
              <div className="flex justify-between">
                <span>کۆی داشکاندن:</span>
                <span className="font-mono font-bold">{activeMetrics.totalDiscount.toLocaleString('en-US')} IQD</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top 5 Products Table */}
        {activeMetrics.topProducts.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-black text-slate-900 border-r-4 border-amber-500 pr-2 mb-2">
              پڕفرۆشترین کاڵاکان لەم ماوەیەدا
            </h3>
            <table className="w-full text-right text-xs border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                  <th className="p-2 border-l border-slate-300">ناوی کاڵا</th>
                  <th className="p-2 border-l border-slate-300 text-center">ژمارەی فرۆشراو</th>
                  <th className="p-2">کۆی پارەی فرۆشتن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activeMetrics.topProducts.slice(0, 5).map((p, idx) => (
                  <tr key={p.id}>
                    <td className="p-2 text-center font-mono border-l border-slate-300">{idx + 1}</td>
                    <td className="p-2 font-bold border-l border-slate-300">{p.name}</td>
                    <td className="p-2 text-center font-mono font-bold border-l border-slate-300">{p.quantity}</td>
                    <td className="p-2 font-mono font-bold" dir="ltr">{p.sales.toLocaleString('en-US')} IQD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Receipts List */}
        <div className="mb-8">
          <h3 className="text-sm font-black text-slate-900 border-r-4 border-blue-600 pr-2 mb-2">
            لیستی پسوڵەکانی فرۆشتن
          </h3>
          <table className="w-full text-right text-xs border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                <th className="p-2 border-l border-slate-300">کات</th>
                <th className="p-2 border-l border-slate-300">کڕیار</th>
                <th className="p-2 border-l border-slate-300 text-center">شێواز</th>
                <th className="p-2 border-l border-slate-300">داشکاندن</th>
                <th className="p-2">کۆی گشتی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {activeMetrics.receipts.slice(0, 30).map((r, idx) => (
                <tr key={r.id}>
                  <td className="p-1.5 text-center font-mono border-l border-slate-300">{idx + 1}</td>
                  <td className="p-1.5 font-mono border-l border-slate-300" dir="ltr">{format(new Date(r.created_at), 'yyyy-MM-dd HH:mm')}</td>
                  <td className="p-1.5 font-bold border-l border-slate-300">{r.customer_name || 'گشتی'}</td>
                  <td className="p-1.5 text-center border-l border-slate-300">{r.payment_method === 'Cash' ? 'نەقد' : r.payment_method === 'FIB' ? 'FIB' : 'قەرز'}</td>
                  <td className="p-1.5 font-mono border-l border-slate-300" dir="ltr">{r.discount > 0 ? r.discount.toLocaleString() : '-'}</td>
                  <td className="p-1.5 font-mono font-bold" dir="ltr">{r.total_amount.toLocaleString()} IQD</td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeMetrics.receipts.length > 30 && (
            <p className="text-[10px] text-slate-500 mt-1 italic text-left" dir="ltr">* Showing first 30 of {activeMetrics.receipts.length} invoices. Export to Excel for full raw ledger.</p>
          )}
        </div>

        {/* Official Signature Box */}
        <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center text-xs">
          <div>
            <p className="font-bold text-slate-800">ئامادەکاری ڕاپۆرت: <span className="font-normal">{currentUser?.name || 'بەڕێوەبەر'}</span></p>
            <p className="text-slate-500 text-[10px] mt-1">ئەم دۆکیومێنتە فەرمییە و لە سیستەمی کۆمپیتەری فرۆشگاوە دەرکراوە.</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-800 mb-8">مۆر و واژووی پەسەندکردن</p>
            <p className="text-slate-400 font-mono">...........................................</p>
          </div>
        </div>

      </div>

    </div>
  );
};
