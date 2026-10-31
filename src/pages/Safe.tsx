import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Wallet,
  Banknote,
  CreditCard,
  ArrowDownToLine,
  Receipt,
  Calendar,
  TrendingUp,
  Printer,
  Clock,
  Users,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { startOfDay, endOfDay, format, isToday, subDays } from 'date-fns';
import { useAppStore } from '../store/useAppStore';

interface SafeMovement {
  id: string;
  type: 'cash_sale' | 'fib_sale' | 'debt_sale' | 'debt_received' | 'expense';
  typeName: string;
  description: string;
  amount: number;
  time: string;
  isPositive: boolean;
}

export const Safe: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'cash_sale' | 'debt_received' | 'expense' | 'other'>('all');

  const settings = useAppStore(state => state.settings);
  const currentUser = useAppStore(state => state.currentUser);
  const usdRate = settings?.usdRate || 150000;

  const [stats, setStats] = useState({
    cashSales: 0,
    cashSalesCount: 0,
    fibSales: 0,
    fibSalesCount: 0,
    debtSales: 0,
    debtSalesCount: 0,
    debtReceived: 0,
    debtReceivedCount: 0,
    expenses: 0,
    expensesCount: 0,
    totalSafe: 0,
    totalRevenue: 0
  });

  const [movements, setMovements] = useState<SafeMovement[]>([]);

  useEffect(() => {
    fetchSafeData();
  }, [selectedDate]);

  const fetchSafeData = async () => {
    try {
      setLoading(true);
      const targetDate = new Date(selectedDate);
      const todayStart = startOfDay(targetDate).toISOString();
      const todayEnd = endOfDay(targetDate).toISOString();

      // 1. Fetch Sales for selected date
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      let cashSales = 0;
      let cashSalesCount = 0;
      let fibSales = 0;
      let fibSalesCount = 0;
      let debtSales = 0;
      let debtSalesCount = 0;

      const salesMovements: SafeMovement[] = [];

      (sales || []).forEach((sale: any) => {
        const timeStr = sale.created_at ? format(new Date(sale.created_at), 'hh:mm a') : '--:--';
        const saleAmt = Number(sale.total_amount) || 0;

        if (sale.payment_method === 'Cash') {
          cashSales += saleAmt;
          cashSalesCount++;
          salesMovements.push({
            id: `sale-${sale.id}`,
            type: 'cash_sale',
            typeName: 'فرۆشتنی نەقد',
            description: `فرۆشتن بە نەقد (وەسڵ #${(sale.id || '').slice(0, 6)})`,
            amount: saleAmt,
            time: timeStr,
            isPositive: true
          });
        } else if (sale.payment_method === 'FIB') {
          fibSales += saleAmt;
          fibSalesCount++;
          salesMovements.push({
            id: `sale-${sale.id}`,
            type: 'fib_sale',
            typeName: 'فرۆشتنی FIB',
            description: `پارەدان بە کارتی بانکی / FIB`,
            amount: saleAmt,
            time: timeStr,
            isPositive: true
          });
        } else if (sale.payment_method === 'Debt') {
          debtSales += saleAmt;
          debtSalesCount++;
          salesMovements.push({
            id: `sale-${sale.id}`,
            type: 'debt_sale',
            typeName: 'فرۆشتنی بە قەرز',
            description: `فرۆشتنی قەرزی تۆمارکراو`,
            amount: saleAmt,
            time: timeStr,
            isPositive: false
          });
        }
      });

      // 2. Fetch Debt Payments received on selected date
      const { data: debtPayments, error: debtError } = await supabase
        .from('debt_payments')
        .select('id, amount, date, created_at, customer_id')
        .gte('date', todayStart)
        .lte('date', todayEnd)
        .order('date', { ascending: false });

      if (debtError) throw debtError;

      let debtReceived = 0;
      let debtReceivedCount = 0;
      const debtMovements: SafeMovement[] = [];

      (debtPayments || []).forEach((dp: any) => {
        const pAmt = Number(dp.amount) || 0;
        debtReceived += pAmt;
        debtReceivedCount++;
        debtMovements.push({
          id: `debt-${dp.id}`,
          type: 'debt_received',
          typeName: 'وەرگرتنەوەی قەرز',
          description: `پارەی قەرزی هاتووە بۆ سندوق`,
          amount: pAmt,
          time: dp.date ? format(new Date(dp.date), 'hh:mm a') : (dp.created_at ? format(new Date(dp.created_at), 'hh:mm a') : '--:--'),
          isPositive: true
        });
      });

      // 3. Fetch Expenses on selected date
      const { data: expenses, error: expensesError } = await supabase
        .from('expenses')
        .select('id, amount, category, notes, date, created_at')
        .gte('date', todayStart)
        .lte('date', todayEnd)
        .order('date', { ascending: false });

      if (expensesError) throw expensesError;

      let totalExpenses = 0;
      let expensesCount = 0;
      const expenseMovements: SafeMovement[] = [];

      (expenses || []).forEach((exp: any) => {
        const eAmt = Number(exp.amount) || 0;
        totalExpenses += eAmt;
        expensesCount++;
        expenseMovements.push({
          id: `exp-${exp.id}`,
          type: 'expense',
          typeName: 'خەرجی',
          description: `${exp.category || 'خەرجی گشتی'} ${exp.notes ? `(${exp.notes})` : ''}`,
          amount: eAmt,
          time: exp.date ? format(new Date(exp.date), 'hh:mm a') : (exp.created_at ? format(new Date(exp.created_at), 'hh:mm a') : '--:--'),
          isPositive: false
        });
      });

      // Calculate Total Cash in Safe (Cash In Drawer)
      // Total Safe Cash = Cash Sales + Debt Payments Received - Cash Expenses
      const totalSafe = cashSales + debtReceived - totalExpenses;
      const totalRevenue = cashSales + fibSales + debtSales;

      setStats({
        cashSales,
        cashSalesCount,
        fibSales,
        fibSalesCount,
        debtSales,
        debtSalesCount,
        debtReceived,
        debtReceivedCount,
        expenses: totalExpenses,
        expensesCount,
        totalSafe,
        totalRevenue
      });

      // Merge and sort all movements
      const allMovements = [...salesMovements, ...debtMovements, ...expenseMovements];
      setMovements(allMovements);

    } catch (error) {
      console.error('Error fetching safe data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalSafeUSD = usdRate > 0 ? (stats.totalSafe / (usdRate / 100)) : 0;

  const filteredMovements = movements.filter(m => {
    const matchesSearch = (m.description || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (m.typeName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesType = true;
    if (activeFilter === 'cash_sale') matchesType = m.type === 'cash_sale';
    else if (activeFilter === 'debt_received') matchesType = m.type === 'debt_received';
    else if (activeFilter === 'expense') matchesType = m.type === 'expense';
    else if (activeFilter === 'other') matchesType = m.type === 'fib_sale' || m.type === 'debt_sale';

    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-kurdish animate-in select-none">
      
      {/* ─── Header ─── */}
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-200">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                سندوق و قاسەی دارایی
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                  {isToday(new Date(selectedDate)) ? 'ئەمڕۆ' : 'مێژووی پێشوو'}
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">سۆران هۆکە شۆپ</p>
            </div>
          </div>
        </div>

        {/* Date Selector & Print Actions */}
        <div className="flex items-center gap-2.5">
          {/* Quick Date Presets */}
          <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-bold">
            <button 
              onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedDate === format(new Date(), 'yyyy-MM-dd') 
                  ? 'bg-white text-emerald-700 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ئەمڕۆ
            </button>
            <button 
              onClick={() => setSelectedDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedDate === format(subDays(new Date(), 1), 'yyyy-MM-dd') 
                  ? 'bg-white text-emerald-700 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              دوێنێ
            </button>
          </div>

          {/* Custom Date Input */}
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-700">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-800 cursor-pointer"
            />
          </div>

          {/* Print Button */}
          <button 
            onClick={handlePrint}
            className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="چاپکردنی وەسڵی سندوق"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden md:inline">چاپکردنی ڕاپۆرت</span>
          </button>
        </div>
      </header>

      {/* ─── Printable Document (Visible only when printing) ─── */}
      <div className="hidden print:block p-8 bg-white text-slate-900 font-kurdish">
        <div className="text-center pb-4 border-b-2 border-slate-800 mb-6">
          <h1 className="text-2xl font-black">{settings.shopName || 'سۆران هۆکە شۆپ'}</h1>
          <p className="text-sm font-bold text-slate-600 mt-1">وەسڵی پوختەی ڕۆژانەی سندوق و قاسە</p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">بەروار: {selectedDate}</p>
        </div>

        <div className="space-y-3 mb-8 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-200">
            <span className="font-bold">١. فرۆشتنی نەقد:</span>
            <span className="font-mono font-bold" dir="ltr">{stats.cashSales.toLocaleString()} IQD</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200">
            <span className="font-bold">٢. پارەی وەرگیراوی قەرز:</span>
            <span className="font-mono font-bold" dir="ltr">+{stats.debtReceived.toLocaleString()} IQD</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 text-rose-700">
            <span className="font-bold">٣. خەرجییەکان:</span>
            <span className="font-mono font-bold" dir="ltr">-{stats.expenses.toLocaleString()} IQD</span>
          </div>
          <div className="flex justify-between py-3 border-b-2 border-slate-800 text-lg font-black bg-slate-50 px-3 rounded-xl">
            <span>کۆی نەقدی ناو سندوق:</span>
            <span className="font-mono" dir="ltr">{stats.totalSafe.toLocaleString()} IQD</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 text-indigo-700">
            <span className="font-bold">فرۆشتنی FIB (لە بانکە):</span>
            <span className="font-mono font-bold" dir="ltr">{stats.fibSales.toLocaleString()} IQD</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 text-slate-600">
            <span className="font-bold">فرۆشتنی بە قەرز (وەرنەگیراو):</span>
            <span className="font-mono font-bold" dir="ltr">{stats.debtSales.toLocaleString()} IQD</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 pt-8 mt-8 border-t border-slate-300 text-center text-xs">
          <div>
            <p className="font-bold text-slate-700 mb-8">ئیمزای کاشێر / ڕادەستکەر</p>
            <p className="border-t border-dashed border-slate-400 pt-2">{currentUser?.name || 'کاشێر'}</p>
          </div>
          <div>
            <p className="font-bold text-slate-700 mb-8">ئیمزای وەرگر / خاوەن کار</p>
            <p className="border-t border-dashed border-slate-400 pt-2">بەڕێوەبەر</p>
          </div>
        </div>
      </div>

      {/* ─── Main Content Screen ─── */}
      <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full space-y-6 print:hidden">
        
        {loading ? (
          <div className="text-center p-16 text-slate-500 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-9 w-9 border-3 border-emerald-600 border-t-transparent"></div>
            <p className="text-sm font-bold">خەریکی کۆکردنەوەی ژمێریاریی سندوقە...</p>
          </div>
        ) : (
          <>
            {/* ─── Master Hero Card: Total Cash in Safe ─── */}
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-emerald-500/20 border border-emerald-500/30">
              
              {/* Background ambient lighting */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-300/10 rounded-full blur-2xl -ml-20 -mb-20 pointer-events-none"></div>

              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse"></span>
                    <span className="text-emerald-100 text-xs md:text-sm font-black uppercase tracking-wider">
                      پارەی نەقدی ناو سندوق (قاسەی کاش)
                    </span>
                  </div>

                  <div className="flex items-baseline gap-3">
                    <h2 className="text-4xl sm:text-5xl font-black font-mono tracking-tight" dir="ltr">
                      {stats.totalSafe.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </h2>
                    <span className="text-xl font-black text-emerald-200">IQD</span>
                  </div>

                  <p className="text-emerald-100/80 text-xs font-mono font-bold mt-1.5 flex items-center gap-1.5" dir="ltr">
                    <span>≈ ${totalSafeUSD.toFixed(2)} USD</span>
                    <span className="text-emerald-300">($100 = {usdRate.toLocaleString()} IQD)</span>
                  </p>
                </div>

                {/* Accounting Formula Banner */}
                <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 text-xs space-y-1.5 w-full md:w-auto">
                  <span className="text-[11px] text-emerald-200 font-bold block">هاوکێشەی حیسابکردنی سندوق:</span>
                  <div className="flex items-center gap-2 font-mono text-emerald-100 font-bold text-xs" dir="ltr">
                    <span>+{stats.cashSales.toLocaleString()} (نەقد)</span>
                    <span>+{stats.debtReceived.toLocaleString()} (قەرز)</span>
                    <span className="text-rose-200">-{stats.expenses.toLocaleString()} (خەرجی)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Financial Overview 6 Luxury Metric Cards ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* 1. Cash Sales */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-emerald-300 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">فرۆشتنی نەقد</span>
                    <span className="text-2xl font-black text-slate-800 font-mono" dir="ltr">
                      {stats.cashSales.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-slate-400 mr-1">IQD</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Banknote className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                  <span>ژمارەی وەسڵە نەقدییەکان:</span>
                  <span className="text-slate-700 font-mono">{stats.cashSalesCount} وەسڵ</span>
                </div>
              </div>

              {/* 2. Debt Received */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-amber-300 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">پارەی وەرگیراوی قەرز</span>
                    <span className="text-2xl font-black text-amber-600 font-mono" dir="ltr">
                      +{stats.debtReceived.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-amber-400 mr-1">IQD</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ArrowDownToLine className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                  <span>ژمارەی وەرگیراوەکان:</span>
                  <span className="text-slate-700 font-mono">{stats.debtReceivedCount} جار</span>
                </div>
              </div>

              {/* 3. Expenses */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-rose-300 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">خەرجییەکانی سندوق</span>
                    <span className="text-2xl font-black text-rose-600 font-mono" dir="ltr">
                      -{stats.expenses.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-rose-400 mr-1">IQD</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Receipt className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                  <span>ژمارەی خەرجییەکان:</span>
                  <span className="text-slate-700 font-mono">{stats.expensesCount} دانە</span>
                </div>
              </div>

              {/* 4. FIB / Bank Sales */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-indigo-300 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">فرۆشتنی FIB (لە بانکە)</span>
                    <span className="text-2xl font-black text-indigo-600 font-mono" dir="ltr">
                      {stats.fibSales.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-indigo-400 mr-1">IQD</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CreditCard className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                  <span>ژمارەی فرۆشتنی FIB:</span>
                  <span className="text-slate-700 font-mono">{stats.fibSalesCount} دانە</span>
                </div>
              </div>

              {/* 5. Uncollected Debt Sales */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-purple-300 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">فرۆشتنی بە قەرز (وەرنەگیراو)</span>
                    <span className="text-2xl font-black text-slate-700 font-mono" dir="ltr">
                      {stats.debtSales.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-slate-400 mr-1">IQD</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                  <span>ژمارەی وەسڵی قەرز:</span>
                  <span className="text-slate-700 font-mono">{stats.debtSalesCount} وەسڵ</span>
                </div>
              </div>

              {/* 6. Total Gross Revenue */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-cyan-300 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">کۆی فرۆشتنی گشتی (Revenue)</span>
                    <span className="text-2xl font-black text-cyan-700 font-mono" dir="ltr">
                      {stats.totalRevenue.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-cyan-500 mr-1">IQD</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                  <span>کۆی هەموو فرۆشتنەکان:</span>
                  <span className="text-slate-700 font-mono">{stats.cashSalesCount + stats.fibSalesCount + stats.debtSalesCount} دانە</span>
                </div>
              </div>
            </div>

            {/* ─── Live Cashflow Timeline & Transaction Log ─── */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
              
              {/* Table Header & Filter Tabs */}
              <div className="p-4 border-b border-slate-200/80 flex flex-col md:flex-row justify-between items-center gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-black text-slate-800 text-sm">
                    تۆماری وردەکاریی جووڵەکانی سندوق ({filteredMovements.length})
                  </h3>
                </div>

                {/* Filter Chips */}
                <div className="flex flex-wrap gap-1.5">
                  <button 
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                      activeFilter === 'all' 
                        ? 'bg-slate-800 text-white' 
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    هەمووی ({movements.length})
                  </button>
                  <button 
                    onClick={() => setActiveFilter('cash_sale')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                      activeFilter === 'cash_sale' 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    نەقد ({stats.cashSalesCount})
                  </button>
                  <button 
                    onClick={() => setActiveFilter('debt_received')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                      activeFilter === 'debt_received' 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    قەرزی هاتووە ({stats.debtReceivedCount})
                  </button>
                  <button 
                    onClick={() => setActiveFilter('expense')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                      activeFilter === 'expense' 
                        ? 'bg-rose-600 text-white' 
                        : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    خەرجی ({stats.expensesCount})
                  </button>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs md:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">کاتژمێر</th>
                      <th className="p-3.5">جۆری جووڵە</th>
                      <th className="p-3.5">ڕوونکردنەوە و وردەکاری</th>
                      <th className="p-3.5 text-left pl-6">بڕی پارە (IQD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {filteredMovements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-slate-400">
                          هیچ جووڵەیەکی دارایی تۆمار نەکراوە لەم بەروارەدا
                        </td>
                      </tr>
                    ) : (
                      filteredMovements.map((m, index) => {
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 text-slate-400 font-mono text-center">{index + 1}</td>
                            <td className="p-3.5 font-mono text-slate-500 text-xs" dir="ltr">{m.time}</td>
                            <td className="p-3.5">
                              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black border inline-flex items-center gap-1 ${
                                m.type === 'cash_sale' 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                  : m.type === 'debt_received' 
                                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                  : m.type === 'expense' 
                                  ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                  : m.type === 'fib_sale' 
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>
                                {m.isPositive ? <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> : <ArrowUpRight className="w-3 h-3 text-rose-600" />}
                                {m.typeName}
                              </span>
                            </td>
                            <td className="p-3.5 font-bold text-slate-800">{m.description}</td>
                            <td className="p-3.5 text-left pl-6 font-mono font-black text-sm" dir="ltr">
                              <span className={m.isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                                {m.isPositive ? '+' : '-'}{m.amount.toLocaleString('en-US')} IQD
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
