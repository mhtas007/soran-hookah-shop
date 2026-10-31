import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Receipt,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  FileText,
  DollarSign,
  Edit2,
  X,
  Tag,
  PieChart,
  Coffee,
  Zap,
  Home,
  Users,
  Wrench,
  Package,
  Wifi,
  Truck,
  MoreHorizontal
} from 'lucide-react';
import type { Expense } from '../types';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLogger';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { useAppStore } from '../store/useAppStore';

const DEFAULT_CATEGORIES = [
  { name: 'کرێی دوکان', icon: Home, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { name: 'کارەبا و مۆلیدە', icon: Zap, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { name: 'مووچەی کارمەندان', icon: Users, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { name: 'چای و میوانداری', icon: Coffee, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { name: 'گواستنەوە و بەنزین', icon: Truck, color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { name: 'چاککردنەوە و وەستا', icon: Wrench, color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { name: 'زەرف و پاکێجین', icon: Package, color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { name: 'ئینتەرنێت و پەیوەندی', icon: Wifi, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { name: 'خەرجی گشتی', icon: MoreHorizontal, color: 'bg-slate-100 text-slate-700 border-slate-200' }
];

export const Expenses: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const usdRate = useAppStore(state => state.settings.usdRate) || 150000;
  const canDelete = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  
  // Date Filters
  const [dateRangePreset, setDateRangePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Form State (Modal)
  const [showForm, setShowForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, [startDate, endDate]);

  const handleDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'custom') => {
    setDateRangePreset(preset);
    const today = new Date();
    if (preset === 'today') {
      setStartDate(format(today, 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'yesterday') {
      const y = subDays(today, 1);
      setStartDate(format(y, 'yyyy-MM-dd'));
      setEndDate(format(y, 'yyyy-MM-dd'));
    } else if (preset === 'week') {
      const w = subDays(today, 7);
      setStartDate(format(w, 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('date', startOfDay(new Date(startDate)).toISOString())
        .lte('date', endOfDay(new Date(endDate)).toISOString())
        .order('date', { ascending: false });
        
      if (error) throw error;
      setExpenses(data as Expense[]);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCat = category === 'custom' ? customCategory.trim() : category;
    if (!amount || !finalCat) {
      alert('تکایە بڕی پارە و جۆری خەرجی دیاری بکە');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('تکایە بڕێکی دروست بنووسە');
      return;
    }

    setIsProcessing(true);
    try {
      if (editingExpenseId) {
        const { error } = await supabase.from('expenses').update({
          amount: numAmount,
          category: finalCat,
          notes: notes.trim(),
          date: new Date(expenseDate).toISOString()
        }).eq('id', editingExpenseId);

        if (error) throw error;

        await logActivity(
          'EXPENSE_UPDATED',
          `دەستکاریکردنی خەرجی: ${numAmount.toLocaleString('en-US')} IQD (${finalCat})`,
          { expenseId: editingExpenseId, amount: numAmount, category: finalCat }
        );

        alert('خەرجیەکە بە سەرکەوتوویی نوێکرایەوە');
      } else {
        const { error } = await supabase.from('expenses').insert({
          amount: numAmount,
          category: finalCat,
          notes: notes.trim(),
          date: expenseDate ? new Date(expenseDate).toISOString() : new Date().toISOString()
        });

        if (error) throw error;

        await logActivity(
          'EXPENSE_ADDED',
          `تۆمارکردنی خەرجی: ${numAmount.toLocaleString('en-US')} IQD بۆ جۆری (${finalCat})`,
          { amount: numAmount, category: finalCat, notes }
        );

        alert('خەرجیەکە بە سەرکەوتوویی تۆمارکرا');
      }

      setShowForm(false);
      resetForm();
      fetchExpenses();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setAmount(expense.amount.toString());
    const isPreset = DEFAULT_CATEGORIES.some(c => c.name === expense.category);
    if (isPreset) {
      setCategory(expense.category);
      setCustomCategory('');
    } else {
      setCategory('custom');
      setCustomCategory(expense.category);
    }
    setNotes(expense.notes || '');
    setExpenseDate(format(new Date(expense.date), 'yyyy-MM-dd'));
    setShowForm(true);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('دڵنیایت لە سڕینەوەی ئەم خەرجییە؟')) return;
    try {
      const expense = expenses.find(e => e.id === id);
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      
      if (expense) {
        await logActivity(
          'EXPENSE_DELETED',
          `سڕینەوەی خەرجی: ${expense.amount.toLocaleString('en-US')} IQD (${expense.category})`,
          { expenseId: id, amount: expense.amount, category: expense.category }
        );
      }
      fetchExpenses();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا لە کاتی سڕینەوە: ' + error.message);
    }
  };

  const resetForm = () => {
    setEditingExpenseId(null);
    setAmount('');
    setCategory('');
    setCustomCategory('');
    setNotes('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (expense.notes && expense.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategoryFilter === 'all' || expense.category === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  const totalPeriodExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalExpensesUSD = totalPeriodExpenses / (usdRate / 100);

  // Group by category to find top expense category
  const categoryTotals: { [key: string]: number } = {};
  filteredExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });
  
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0] ? sortedCategories[0][0] : 'نییە';
  const topCategoryAmount = sortedCategories[0] ? sortedCategories[0][1] : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-kurdish animate-in select-none">
      
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-md shadow-rose-200">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                بەڕێوەبردنی خەرجییەکان (Expenses)
                <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200">
                  {expenses.length} خەرجی
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">سۆران هۆکە شۆپ</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all shadow-md shadow-rose-200 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          تۆمارکردنی خەرجی نوێ
        </button>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* ─── Financial Metric Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی گشتی خەرجی (IQD)</span>
              <h3 className="text-2xl font-black text-rose-600 font-mono" dir="ltr">
                {totalPeriodExpenses.toLocaleString('en-US')} <span className="text-xs font-kurdish font-normal text-slate-400">IQD</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">لە ماوەی دیاریکراودا</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">هاوتای بە دۆلار ($ USD)</span>
              <h3 className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">
                ${totalExpensesUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">بەپێی نرخی $100={usdRate.toLocaleString()}</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">زۆرترین جۆری خەرجی</span>
              <h3 className="text-lg font-black text-slate-800 truncate max-w-[150px]">
                {topCategory}
              </h3>
              <span className="text-[11px] text-rose-600 font-mono font-bold mt-0.5 block" dir="ltr">
                {topCategoryAmount.toLocaleString('en-US')} IQD
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <PieChart className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">ژمارەی خەرجییەکان</span>
              <h3 className="text-2xl font-black text-slate-800 font-mono" dir="ltr">
                {filteredExpenses.length}
              </h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">تۆمار لەم ماوەیەدا</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ─── Filter Bar: Date Presets, Range & Search ─── */}
        <div className="bg-white p-4 rounded-3xl shadow-xs border border-slate-200/80 space-y-3">
          
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Quick Date Presets */}
            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200/70">
              {[
                { id: 'today', label: 'ئەمڕۆ' },
                { id: 'yesterday', label: 'دوێنێ' },
                { id: 'week', label: '٧ ڕۆژی ڕابردوو' },
                { id: 'month', label: 'ئەم مانگە' },
                { id: 'custom', label: 'دیاریکراو' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => handleDatePreset(p.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    dateRangePreset === p.id 
                      ? 'bg-white text-rose-600 shadow-xs font-black' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Date Pickers */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500">لە:</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setDateRangePreset('custom'); }}
                  className="outline-none bg-transparent text-xs font-bold font-mono"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500">تا:</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setDateRangePreset('custom'); }}
                  className="outline-none bg-transparent text-xs font-bold font-mono"
                />
              </div>
            </div>
          </div>

          {/* Search & Category Filter Pills */}
          <div className="flex flex-col sm:flex-row gap-3 items-center pt-2 border-t border-slate-100">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="گەڕان بەپێی جۆری خەرجی، تێبینی..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-9 py-2.5 rounded-xl border border-slate-200 focus:border-rose-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
              />
            </div>

            {/* Category Filter Dropdown */}
            <div className="w-full sm:w-auto">
              <select
                value={selectedCategoryFilter}
                onChange={e => setSelectedCategoryFilter(e.target.value)}
                className="w-full sm:w-auto p-2.5 rounded-xl border border-slate-200 focus:border-rose-500 outline-none text-xs font-bold bg-slate-50"
              >
                <option value="all">هەموو جۆرەکانی خەرجی</option>
                {DEFAULT_CATEGORIES.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

        </div>

        {/* ─── Expenses Table ─── */}
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3.5 text-center w-12">#</th>
                  <th className="p-3.5">بەروار و کات</th>
                  <th className="p-3.5">جۆری خەرجی</th>
                  <th className="p-3.5">تێبینی و ڕوونکردنەوە</th>
                  <th className="p-3.5 text-rose-700 font-black">بڕی پارە (IQD)</th>
                  <th className="p-3.5 text-emerald-700 font-bold">هاوتا ($)</th>
                  <th className="p-3.5 text-center w-28">کردارەکان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">بەدوای زانیاریدا دەگەڕێت...</td></tr>
                ) : filteredExpenses.length === 0 ? (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-400">هیچ خەرجییەک نەدۆزرایەوە لەم ماوەیەدا</td></tr>
                ) : (
                  filteredExpenses.map((expense, idx) => {
                    const presetMatch = DEFAULT_CATEGORIES.find(c => c.name === expense.category);
                    const IconComp = presetMatch?.icon || Tag;
                    const badgeClass = presetMatch?.color || 'bg-slate-100 text-slate-700 border-slate-200';
                    const expenseUSD = expense.amount / (usdRate / 100);

                    return (
                      <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 text-slate-400 font-mono text-center">{idx + 1}</td>
                        
                        <td className="p-3.5 font-mono text-slate-500 text-xs" dir="ltr">
                          {format(new Date(expense.date), 'yyyy-MM-dd hh:mm a')}
                        </td>
                        
                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${badgeClass}`}>
                            <IconComp className="w-3.5 h-3.5" />
                            {expense.category}
                          </span>
                        </td>
                        
                        <td className="p-3.5 text-slate-600 font-medium">
                          {expense.notes ? expense.notes : <span className="text-slate-300">-</span>}
                        </td>
                        
                        <td className="p-3.5 font-mono font-black text-rose-600 text-sm" dir="ltr">
                          {expense.amount.toLocaleString('en-US')} IQD
                        </td>

                        <td className="p-3.5 font-mono font-bold text-emerald-700 text-xs" dir="ltr">
                          ${expenseUSD.toFixed(2)}
                        </td>
                        
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button 
                              onClick={() => handleEditExpense(expense)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="دەستکاریکردن"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {canDelete && (
                              <button 
                                onClick={() => handleDeleteExpense(expense.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                                title="سڕینەوە"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ─── Add / Edit Expense Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl flex flex-col border border-slate-100">
            
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-rose-500" />
                {editingExpenseId ? 'دەستکاریکردنی خەرجی' : 'تۆمارکردنی خەرجی نوێ'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4">
              
              {/* Category Quick Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">جۆری خەرجی دیاری بکە *</label>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {DEFAULT_CATEGORIES.map(cat => {
                    const isSelected = category === cat.name;
                    const IconComp = cat.icon;
                    return (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => { setCategory(cat.name); setCustomCategory(''); }}
                        className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                          isSelected 
                            ? 'border-rose-500 bg-rose-50/80 text-rose-800 font-bold shadow-2xs' 
                            : 'border-slate-200 bg-slate-50/60 hover:bg-white text-slate-700'
                        }`}
                      >
                        <IconComp className={`w-4 h-4 ${isSelected ? 'text-rose-600' : 'text-slate-500'}`} />
                        <span className="text-[10px] leading-tight">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Category Option */}
                <button
                  type="button"
                  onClick={() => setCategory('custom')}
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                    category === 'custom' 
                      ? 'border-rose-500 bg-rose-50 text-rose-700 font-bold' 
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  + جۆری تر (نووسینی بە دڵی خۆت)
                </button>

                {category === 'custom' && (
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    placeholder="ناوی جۆری خەرجی بنووسە..."
                    className="w-full mt-2 p-2.5 rounded-xl border-2 border-rose-300 focus:border-rose-500 outline-none text-xs font-bold"
                    autoFocus
                  />
                )}
              </div>

              {/* Amount & Quick Pills */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">بڕی پارە (بە دیناری عێراقی IQD) *</label>
                <input 
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="بڕی پارەی خەرجکراو بنووسە..."
                  className="w-full p-3.5 rounded-2xl border-2 border-slate-200 focus:border-rose-500 outline-none font-black text-xl text-rose-600 font-mono text-center"
                  dir="ltr"
                />

                {/* Quick Amount Preset Pills */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[5000, 10000, 25000, 50000, 100000, 250000, 500000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmount(val.toString())}
                      className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition-colors border border-slate-200 font-mono"
                    >
                      {val.toLocaleString()} IQD
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">بەرواری خەرجی</label>
                  <input 
                    type="date"
                    value={expenseDate}
                    onChange={e => setExpenseDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-rose-500 outline-none text-xs font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تێبینی و وردەکاری</label>
                  <input 
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="نموونە: بۆ چاککردنەوەی گڵۆپەکان..."
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-rose-500 outline-none text-xs font-bold"
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShowForm(false)} 
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  پاشگەزبوونەوە
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessing} 
                  className="flex-[2] py-3 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-black rounded-xl text-xs disabled:opacity-50 transition-all shadow-md shadow-rose-200 active:scale-98"
                >
                  {isProcessing ? 'خەریکی تۆمارکردنە...' : (editingExpenseId ? 'نوێکردنەوەی خەرجی' : 'تۆمارکردنی خەرجی')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
