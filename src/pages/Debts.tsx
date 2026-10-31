import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Users,
  Search,
  Plus,
  CreditCard,
  Download,
  FileSpreadsheet,
  PlusCircle,
  History,
  MessageCircle,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Printer,
  ArrowDownLeft,
  ArrowUpRight,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import type { Customer } from '../types';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLogger';
import { useAppStore } from '../store/useAppStore';

export const Debts: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'debtors' | 'cleared' | 'high_debt'>('all');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUser = useAppStore(state => state.currentUser);
  const settings = useAppStore(state => state.settings);
  const usdRate = settings?.usdRate || 150000;

  // Add / Edit Customer Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [isAdding, setIsAdding] = useState(false);

  // Payment Modal State (Receive Payment)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Add Debt Modal State (Record New Debt)
  const [showAddDebtModal, setShowAddDebtModal] = useState(false);
  const [addDebtCustomer, setAddDebtCustomer] = useState('');
  const [addDebtAmount, setAddDebtAmount] = useState('');
  const [addDebtNotes, setAddDebtNotes] = useState('');
  const [isAddingDebt, setIsAddingDebt] = useState(false);

  // History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Overall Debts A4 Report Modal State
  const [showAllDebtsA4Modal, setShowAllDebtsA4Modal] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('remaining_debt', { ascending: false });
        
      if (error) throw error;
      
      const formatted = (data || []).map(c => ({
        id: c.id, 
        name: c.name || '', 
        phone: c.phone || '', 
        totalPurchases: Number(c.total_purchases) || 0, 
        totalPaid: Number(c.total_paid) || 0, 
        remainingDebt: Number(c.remaining_debt) || 0, 
        createdAt: c.created_at
      }));
      
      setCustomers(formatted);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsAdding(true);
    try {
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update({
          name: formData.name.trim(),
          phone: formData.phone.trim()
        }).eq('id', editingCustomer.id);
        if (error) throw error;

        await logActivity('CUSTOMER_UPDATED', `دەستکاریکردنی کڕیار: ${formData.name}`, { customerId: editingCustomer.id, name: formData.name });
        alert('زانیارییەکانی کڕیار بە سەرکەوتوویی نوێکرانەوە');
      } else {
        const { error } = await supabase.from('customers').insert({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          total_purchases: 0,
          total_paid: 0,
          remaining_debt: 0
        });
        if (error) throw error;

        await logActivity('CUSTOMER_ADDED', `زیادکردنی کڕیاری نوێ: ${formData.name}`, { name: formData.name, phone: formData.phone });
        alert('کڕیاری نوێ بە سەرکەوتوویی زیادکرا');
      }

      setShowAddForm(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '' });
      fetchCustomers();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (customer.remainingDebt > 0) {
      alert('ناتوانیت ئەم کڕیارە بسڕیتەوە چونکە قەرزی لەسەر ماوە! پێویستە سەرەتا قەرزەکەی پاکتاو بکرێت.');
      return;
    }

    if (!window.confirm(`دڵنیایت لە سڕینەوەی کڕیار (${customer.name})؟`)) return;

    try {
      const { error } = await supabase.from('customers').delete().eq('id', customer.id);
      if (error) throw error;

      await logActivity('CUSTOMER_DELETED', `سڕینەوەی کڕیار: ${customer.name}`, { customerId: customer.id, name: customer.name });
      alert('کڕیارەکە بە سەرکەوتوویی سڕدرایەوە');
      fetchCustomers();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا لە سڕینەوە: ' + error.message);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsProcessing(true);
    try {
      const { error: paymentError } = await supabase.from('debt_payments').insert({
        customer_id: selectedCustomer.id,
        amount: amount,
        notes: paymentNotes || 'وەرگرتنی قەرز'
      });
      if (paymentError) throw paymentError;

      const newPaid = selectedCustomer.totalPaid + amount;
      const newRemaining = Math.max(0, selectedCustomer.remainingDebt - amount);

      const { error: customerError } = await supabase.from('customers').update({
        total_paid: newPaid,
        remaining_debt: newRemaining
      }).eq('id', selectedCustomer.id);
      
      if (customerError) throw customerError;

      await logActivity('DEBT_PAYMENT', `وەرگرتنی قەرز: ${amount.toLocaleString()} IQD لە ${selectedCustomer.name}`, {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        amount,
        oldDebt: selectedCustomer.remainingDebt,
        newDebt: newRemaining
      });

      alert('پارەدانەکە بە سەرکەوتوویی تۆمارکرا!');
      setSelectedCustomer(null);
      setPaymentAmount('');
      setPaymentNotes('');
      fetchCustomers();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addDebtCustomer || !addDebtAmount) return;

    const amount = parseFloat(addDebtAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsAddingDebt(true);
    try {
      const customer = customers.find(c => c.id === addDebtCustomer);
      if (!customer) throw new Error("کڕیار نەدۆزرایەوە");

      const { error: historyError } = await supabase.from('debt_payments').insert({
        customer_id: addDebtCustomer,
        amount: -amount,
        notes: addDebtNotes || 'زیادکردنی قەرز بە دەستی'
      });
      if (historyError) throw historyError;

      const newPurchases = customer.totalPurchases + amount;
      const newRemaining = customer.remainingDebt + amount;

      const { error: customerError } = await supabase.from('customers').update({
        total_purchases: newPurchases,
        remaining_debt: newRemaining
      }).eq('id', addDebtCustomer);
      
      if (customerError) throw customerError;

      await logActivity('DEBT_ADDED_MANUALLY', `زیادکردنی قەرز: ${amount.toLocaleString()} IQD بۆ ${customer.name}`, {
        customerId: customer.id,
        customerName: customer.name,
        amount,
        oldDebt: customer.remainingDebt,
        newDebt: newRemaining
      });

      alert('قەرزە نوێیەکە بە سەرکەوتوویی خرایە سەر حیسابەکەی!');
      setShowAddDebtModal(false);
      setAddDebtCustomer('');
      setAddDebtAmount('');
      setAddDebtNotes('');
      fetchCustomers();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsAddingDebt(false);
    }
  };

  const exportToCSV = () => {
    logActivity('DATA_EXPORTED', `دابەزاندنی دەفتەری قەرز (CSV) — ${filteredCustomers.length} کڕیار`);
    const headers = ['کڕیار', 'مۆبایل', 'کۆی کڕین بە قەرز', 'پارەی دراو', 'قەرزی ماوە'];
    const rows = filteredCustomers.map(c => [
      c.name,
      c.phone || '',
      c.totalPurchases,
      c.totalPaid,
      c.remainingDebt
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += headers.join(',') + "\n";
    rows.forEach(row => {
      csvContent += row.join(',') + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `دەفتەری_قەرز_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchHistory = async (customer: Customer) => {
    setHistoryCustomer(customer);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const { data: salesData } = await supabase
        .from('sales')
        .select('*')
        .eq('debt_customer_id', customer.id)
        .order('created_at', { ascending: false });

      const { data: paymentsData } = await supabase
        .from('debt_payments')
        .select('*')
        .eq('customer_id', customer.id)
        .order('date', { ascending: false });

      const allTransactions = [
        ...(salesData || []).map(s => ({
          id: s.id,
          date: s.created_at,
          type: 'Sale',
          amount: Number(s.total_amount) || 0,
          notes: 'کڕینی کاڵا بە قەرز (وەسڵ #' + (s.id || '').slice(0, 6) + ')'
        })),
        ...(paymentsData || []).map(p => ({
          id: p.id,
          date: p.date || p.created_at,
          type: (Number(p.amount) || 0) > 0 ? 'Payment' : 'ManualDebt',
          amount: Math.abs(Number(p.amount) || 0),
          notes: p.notes || ((Number(p.amount) || 0) > 0 ? 'پارەدان بۆ قەرز' : 'زیادکردنی قەرز')
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openWhatsAppReminder = (customer: Customer) => {
    if (!customer.phone) {
      alert('ژمارەی مۆبایلی ئەم کڕیارە تۆمار نەکراوە!');
      return;
    }
    const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      `سڵاو کاک ${customer.name} بەڕێز،\nئاگادارت دەکەینەوە کە بڕی (${customer.remainingDebt.toLocaleString()} IQD) قەرزی ماوەت لە ${settings.shopName || 'سۆران هۆکە شۆپ'}.\nسوپاس بۆ هاوکاریت.`
    );
    window.open(`https://wa.me/${cleanPhone.startsWith('07') ? '964' + cleanPhone.slice(1) : cleanPhone}?text=${message}`, '_blank');
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.phone && c.phone.includes(searchTerm));
    if (!matchesSearch) return false;
    
    if (filter === 'debtors') return c.remainingDebt > 0;
    if (filter === 'cleared') return c.remainingDebt <= 0 && c.totalPurchases > 0;
    if (filter === 'high_debt') return c.remainingDebt >= 500000;
    return true;
  });

  const totalMarketDebt = customers.reduce((sum, c) => sum + (c.remainingDebt || 0), 0);
  const totalReceived = customers.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
  const totalPurchasesOverall = customers.reduce((sum, c) => sum + (c.totalPurchases || 0), 0);
  const debtorsCount = customers.filter(c => c.remainingDebt > 0).length;
  const clearedCount = customers.filter(c => c.remainingDebt <= 0 && c.totalPurchases > 0).length;
  
  const recoveryRate = totalPurchasesOverall > 0 ? Math.min(100, Math.round((totalReceived / totalPurchasesOverall) * 100)) : 100;
  const totalMarketDebtUSD = usdRate > 0 ? (totalMarketDebt / (usdRate / 100)) : 0;

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-200">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                دەفتەری قەرز و کڕیاران
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  {debtorsCount} کەس قەرزارن
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">بەڕێوەبردنی حیسابی کڕیاران</p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowAllDebtsA4Modal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-500 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/20 active:scale-95"
            title="ڕاپۆرتی گشتی قەرزەکان بە قەبارەی A4"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">ڕاپۆرتی گشتی قەرز (A4)</span>
            <span className="sm:hidden">ڕاپۆرتی A4</span>
          </button>

          <button 
            onClick={exportToCSV}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95"
            title="داگرتنی لیستی قەرز بە شێوەی ئێکسڵ"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">ئێکسڵ (CSV)</span>
          </button>

          <button 
            onClick={() => {
              setAddDebtCustomer(customers[0]?.id || '');
              setShowAddDebtModal(true);
            }}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">تۆمارکردنی قەرز</span>
          </button>

          <button 
            onClick={() => {
              setEditingCustomer(null);
              setFormData({ name: '', phone: '' });
              setShowAddForm(true);
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shadow-amber-200"
          >
            <Plus className="w-4 h-4" />
            کڕیاری نوێ
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* ─── Luxury Hero Financial Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* 1. Total Outstanding Debt (Hero Card) */}
          <div className="bg-gradient-to-br from-rose-500 via-rose-600 to-rose-700 p-5 rounded-3xl shadow-lg shadow-rose-200 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold opacity-90 block mb-1">کۆی قەرزی ماوە لە بازاڕ</span>
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl sm:text-3xl font-black font-mono tracking-tight" dir="ltr">
                    {totalMarketDebt.toLocaleString('en-US')}
                  </h3>
                  <span className="text-xs font-bold opacity-80">IQD</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <div className="pt-3 mt-3 border-t border-white/20 flex justify-between items-center text-[11px] font-mono text-rose-100 font-bold" dir="ltr">
              <span>≈ ${totalMarketDebtUSD.toFixed(2)} USD</span>
              <span className="font-kurdish opacity-90">{debtorsCount} کڕیار قەرزارن</span>
            </div>
          </div>

          {/* 2. Total Recovered / Paid Debt */}
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-emerald-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">کۆی پارەی وەرگیراوە</span>
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono tracking-tight" dir="ltr">
                    {totalReceived.toLocaleString('en-US')}
                  </h3>
                  <span className="text-xs font-bold text-slate-400">IQD</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-[11px] font-bold text-slate-400">
              <span>کڕیاری پاکتاوکراو:</span>
              <span className="text-emerald-700 font-mono font-bold">{clearedCount} کەس</span>
            </div>
          </div>

          {/* 3. All-Time Credit Purchases */}
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 hover:border-amber-300 transition-all flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">کۆی کڕینەکان بە قەرز</span>
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-800 font-mono tracking-tight" dir="ltr">
                    {totalPurchasesOverall.toLocaleString('en-US')}
                  </h3>
                  <span className="text-xs font-bold text-slate-400">IQD</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-[11px] font-bold text-slate-400">
              <span>کۆی گشتی کڕیاران:</span>
              <span className="text-slate-800 font-mono font-bold">{customers.length} کەس</span>
            </div>
          </div>

          {/* 4. Debt Recovery Rate % */}
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1">ڕێژەی وەرگرتنەوەی قەرز</span>
                <div className="flex items-baseline gap-1.5">
                  <h3 className="text-2xl sm:text-3xl font-black text-indigo-600 font-mono tracking-tight" dir="ltr">
                    {recoveryRate}%
                  </h3>
                  <span className="text-xs font-bold text-slate-400">سەرکەوتوو</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            {/* Progress bar */}
            <div className="pt-3 mt-3 border-t border-slate-100 space-y-1">
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${recoveryRate}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Filters & Search Bar ─── */}
        <div className="bg-white p-4 rounded-3xl shadow-xs border border-slate-200/80 flex flex-col md:flex-row gap-3 items-center justify-between">
          
          {/* Status Filter Chips */}
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                filter === 'all' 
                  ? 'bg-slate-800 text-white shadow-xs' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              هەموو کڕیاران ({customers.length})
            </button>

            <button 
              onClick={() => setFilter('debtors')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                filter === 'debtors' 
                  ? 'bg-rose-600 text-white shadow-xs' 
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              قەرزارەکان ({debtorsCount})
            </button>

            <button 
              onClick={() => setFilter('cleared')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                filter === 'cleared' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              پاکتاوکراو ({clearedCount})
            </button>

            <button 
              onClick={() => setFilter('high_debt')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                filter === 'high_debt' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              قەرزی زۆر (&ge; ٥٠٠ هەزار)
            </button>
          </div>

          {/* Search Field */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="گەڕان بەپێی ناوی کڕیار یان مۆبایل..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ─── Customers Table Directory ─── */}
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3.5 text-center w-12">#</th>
                  <th className="p-3.5">ناوی کڕیار</th>
                  <th className="p-3.5">ژمارەی مۆبایل / پەیوەندی</th>
                  <th className="p-3.5">کۆی کڕینەکان</th>
                  <th className="p-3.5 text-emerald-700">پارەی دراو</th>
                  <th className="p-3.5 text-rose-700">قەرزی ماوە</th>
                  <th className="p-3.5 text-center">دۆخ</th>
                  <th className="p-3.5 text-center w-64">کردارەکان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-500">بەدوای زانیاریدا دەگەڕێت...</td></tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-400">هیچ کڕیارێک نەدۆزرایەوە بەم مەرجانە</td></tr>
                ) : (
                  filteredCustomers.map((customer, index) => {
                    const hasDebt = customer.remainingDebt > 0;

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 text-slate-400 font-mono text-center">{index + 1}</td>
                        
                        {/* Customer Name with Avatar */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                              hasDebt ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {customer.name.slice(0, 1)}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block">{customer.name}</span>
                            </div>
                          </div>
                        </td>

                        {/* Phone with WhatsApp shortcut */}
                        <td className="p-3.5">
                          {customer.phone ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-600 text-xs" dir="ltr">{customer.phone}</span>
                              {hasDebt && (
                                <button 
                                  onClick={() => openWhatsAppReminder(customer)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="ناردنی ئاگاداری قەرز بە واتسئاپ"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        <td className="p-3.5 font-mono text-slate-700 font-bold" dir="ltr">
                          {customer.totalPurchases.toLocaleString('en-US')} IQD
                        </td>

                        <td className="p-3.5 font-mono text-emerald-600 font-bold" dir="ltr">
                          {customer.totalPaid.toLocaleString('en-US')} IQD
                        </td>

                        <td className={`p-3.5 font-mono font-black text-sm ${hasDebt ? 'text-rose-600' : 'text-slate-400'}`} dir="ltr">
                          {customer.remainingDebt.toLocaleString('en-US')} IQD
                        </td>

                        {/* Status Badge */}
                        <td className="p-3.5 text-center">
                          {hasDebt ? (
                            <span className="bg-rose-100 text-rose-700 text-xs px-2.5 py-0.5 rounded-full font-black border border-rose-200">
                              قەرزارە
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full font-black border border-emerald-200">
                              پاکتاوکراوە
                            </span>
                          )}
                        </td>

                        {/* Action Buttons */}
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            
                            {/* Receive Payment */}
                            <button 
                              disabled={!hasDebt}
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setPaymentAmount('');
                                setPaymentNotes('');
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors flex items-center gap-1 border shadow-2xs ${
                                hasDebt 
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' 
                                  : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                              }`}
                              title="وەرگرتنی پارەی قەرز"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              پارەدان
                            </button>

                            {/* Add Debt */}
                            <button 
                              onClick={() => {
                                setAddDebtCustomer(customer.id);
                                setShowAddDebtModal(true);
                              }}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs"
                              title="زیادکردنی قەرزی نوێ"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              قەرز
                            </button>

                            {/* History & Statement */}
                            <button 
                              onClick={() => fetchHistory(customer)}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs"
                              title="کەشف حیسابی کڕیار و چاپی A4"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              کەشف حیساب
                            </button>

                            {/* Edit */}
                            <button 
                              onClick={() => {
                                setEditingCustomer(customer);
                                setFormData({ name: customer.name, phone: customer.phone || '' });
                                setShowAddForm(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="دەستکاریکردنی زانیاری کڕیار"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete (if debt is 0) */}
                            <button 
                              onClick={() => handleDeleteCustomer(customer)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="سڕینەوەی کڕیار"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {/* ─── Receive Payment Modal (Fixed z-[100]) ─── */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            
            <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                وەرگرتنی قەرز
              </h2>
              <button onClick={() => setSelectedCustomer(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Customer Debt Card */}
            <div className="bg-rose-50 border border-rose-200/80 p-3.5 rounded-2xl mb-4 text-xs">
              <span className="text-slate-500 block">ناوی کڕیار:</span>
              <strong className="text-slate-900 text-sm font-bold block mt-0.5">{selectedCustomer.name}</strong>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-rose-200/60">
                <span className="font-bold text-slate-600">قەرزی ماوە:</span>
                <span className="font-black text-rose-700 font-mono text-base" dir="ltr">
                  {selectedCustomer.remainingDebt.toLocaleString('en-US')} IQD
                </span>
              </div>
            </div>

            {/* Quick Amount Preset Chips */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">بڕی خێرا:</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentAmount(selectedCustomer.remainingDebt.toString())}
                  className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-black text-[11px] px-3 py-1 rounded-lg border border-emerald-300"
                >
                  هەموو قەرزەکە
                </button>
                {[25000, 50000, 100000, 250000, 500000].map(amt => (
                  amt <= selectedCustomer.remainingDebt && (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPaymentAmount(amt.toString())}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-slate-200"
                    >
                      {(amt / 1000).toLocaleString()} هەزار
                    </button>
                  )
                ))}
              </div>
            </div>
            
            <form onSubmit={handlePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">بڕی پارەی وەرگیراو (IQD) *</label>
                <input 
                  type="number" 
                  required
                  min="250"
                  max={selectedCustomer.remainingDebt}
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 outline-none font-black text-xl text-center bg-slate-50 focus:bg-white text-slate-800"
                  dir="ltr"
                  placeholder="0"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">تێبینی (ئارەزوومەندانە)</label>
                <input 
                  type="text" 
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="نموونە: پارەی کاشی سندوق درا..."
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none text-xs font-bold"
                />
              </div>
              
              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setSelectedCustomer(null)} 
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-xs"
                >
                  پاشگەزبوونەوە
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessing} 
                  className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black transition-all text-xs shadow-md shadow-emerald-200 disabled:opacity-50 active:scale-98"
                >
                  {isProcessing ? 'خەریکی تۆمارکردنە...' : 'تۆمارکردنی پارەدان'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Add/Edit Customer Modal (Fixed z-[100]) ─── */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            
            <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-600" />
                {editingCustomer ? 'دەستکاریکردنی کڕیار' : 'زیادکردنی کڕیاری نوێ'}
              </h2>
              <button onClick={() => setShowAddForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی کڕیار *</label>
                <input 
                  required 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none text-xs font-bold" 
                  placeholder="ناوی چوارقۆڵی یان نازناو..."
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ژمارەی مۆبایل (واتسئاپ)</label>
                <input 
                  type="text" 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-amber-500 outline-none text-left text-xs font-bold font-mono" 
                  dir="ltr" 
                  placeholder="07500000000"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)} 
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-xs"
                >
                  پاشگەزبوونەوە
                </button>
                <button 
                  type="submit" 
                  disabled={isAdding} 
                  className="flex-[2] py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black transition-all text-xs shadow-md shadow-amber-200 disabled:opacity-50 active:scale-98"
                >
                  {isAdding ? 'چاوەڕێبە...' : (editingCustomer ? 'نوێکردنەوە' : 'تۆمارکردن')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Add Manual Debt Modal (Fixed z-[100]) ─── */}
      {showAddDebtModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            
            <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                تۆمارکردنی قەرزی نوێ
              </h2>
              <button onClick={() => setShowAddDebtModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDebt} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">هەڵبژاردنی کڕیار *</label>
                <select 
                  required
                  value={addDebtCustomer}
                  onChange={e => setAddDebtCustomer(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold bg-white"
                >
                  <option value="">کڕیارێک هەڵبژێرە...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (قەرز: {c.remainingDebt.toLocaleString()} IQD)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">بڕی قەرز (IQD) *</label>
                <input 
                  type="number" 
                  required
                  min="250"
                  value={addDebtAmount}
                  onChange={e => setAddDebtAmount(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 outline-none text-center text-xl font-black bg-slate-50 focus:bg-white text-slate-800"
                  dir="ltr"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">تێبینی / هۆکاری قەرز</label>
                <input 
                  type="text" 
                  value={addDebtNotes}
                  onChange={e => setAddDebtNotes(e.target.value)}
                  placeholder="نموونە: شیشە و دەرمان بردووە..."
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold"
                />
              </div>
              
              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddDebtModal(false)} 
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-xs"
                >
                  پاشگەزبوونەوە
                </button>
                <button 
                  type="submit" 
                  disabled={isAddingDebt} 
                  className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black transition-all text-xs shadow-md shadow-indigo-200 disabled:opacity-50 active:scale-98"
                >
                  {isAddingDebt ? 'چاوەڕێبە...' : 'تۆمارکردن لە حیساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Customer History & Statement Modal (Fixed z-[100]) ─── */}
      {showHistoryModal && historyCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col border border-slate-100">
            
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-black flex items-center gap-2 text-slate-800">
                  <History className="w-5 h-5 text-indigo-600" />
                  وەسڵی حیساب و مێژووی ({historyCustomer.name})
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">مۆبایل: {historyCustomer.phone || 'تۆمار نەکراوە'}</p>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()} 
                  className="px-3.5 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-200 active:scale-95"
                  title="چاپکردنی کەشف حیساب بە قەبارەی A4"
                >
                  <Printer className="w-4 h-4" />
                  <span>کەشف حیساب (A4)</span>
                </button>
                <button 
                  onClick={() => setShowHistoryModal(false)} 
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Overview Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-rose-50 border border-rose-200/80 p-3 rounded-2xl text-center">
                <span className="text-xs font-bold text-rose-600 block mb-0.5">قەرزی ماوە</span>
                <h4 className="text-lg font-black text-rose-700 font-mono" dir="ltr">
                  {historyCustomer.remainingDebt.toLocaleString('en-US')} IQD
                </h4>
              </div>

              <div className="bg-emerald-50 border border-emerald-200/80 p-3 rounded-2xl text-center">
                <span className="text-xs font-bold text-emerald-600 block mb-0.5">کۆی دراو</span>
                <h4 className="text-lg font-black text-emerald-700 font-mono" dir="ltr">
                  {historyCustomer.totalPaid.toLocaleString('en-US')} IQD
                </h4>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl text-center">
                <span className="text-xs font-bold text-slate-500 block mb-0.5">کۆی کڕینەکان</span>
                <h4 className="text-lg font-black text-slate-800 font-mono" dir="ltr">
                  {historyCustomer.totalPurchases.toLocaleString('en-US')} IQD
                </h4>
              </div>
            </div>

            {/* Transactions Timeline Table */}
            <div className="flex-1 overflow-y-auto min-h-[260px] border border-slate-200/80 rounded-2xl">
              <table className="w-full text-right text-xs md:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 font-bold text-slate-600">
                  <tr>
                    <th className="p-3">بەروار و کاتژمێر</th>
                    <th className="p-3">جۆری مامەڵە</th>
                    <th className="p-3 text-left">بڕی پارە (IQD)</th>
                    <th className="p-3">تێبینی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {loadingHistory ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-500">بەدوای زانیاریدا دەگەڕێت...</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">هیچ مامەڵەیەکی پێشوو تۆمار نەکراوە</td></tr>
                  ) : (
                    transactions.map((tx, idx) => (
                      <tr key={tx.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 text-slate-500 font-mono text-xs" dir="ltr">
                          {tx.date ? format(new Date(tx.date), 'yyyy-MM-dd hh:mm a') : '--'}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-black border inline-flex items-center gap-1 ${
                            tx.type === 'Payment' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {tx.type === 'Payment' ? <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> : <ArrowUpRight className="w-3 h-3 text-rose-600" />}
                            {tx.type === 'Payment' ? 'پارەدان' : tx.type === 'Sale' ? 'کڕین بە قەرز' : 'قەرزی نوێ'}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-black text-left text-sm" dir="ltr">
                          <span className={tx.type === 'Payment' ? 'text-emerald-600' : 'text-rose-600'}>
                            {tx.type === 'Payment' ? '-' : '+'}{tx.amount.toLocaleString('en-US')} IQD
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 text-xs font-medium">{tx.notes}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex gap-2">
              <button 
                onClick={() => setShowHistoryModal(false)} 
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-xs"
              >
                داخستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DEDICATED A4 PRINTABLE CUSTOMER ACCOUNT STATEMENT (Print Only) ─── */}
      {historyCustomer && (
        <div className="hidden print:block printable-a4 font-kurdish p-8 text-black bg-white">
          
          {/* Shop Header */}
          <div className="flex justify-between items-center border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex items-center gap-4">
              {settings.logoUrl && (
                <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 object-contain" />
              )}
              <div>
                <h1 className="text-2xl font-black text-slate-950">{settings.shopName || 'سۆران هۆکە شۆپ'}</h1>
                <p className="text-xs text-slate-600 font-bold mt-0.5">{settings.receiptHeader || 'سیستەمی بەڕێوەبردنی فرۆشتن و کۆگا'}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-1">
                  {settings.phone && <span>تەلەفۆن: {settings.phone}</span>}
                  {settings.address && <span>ناونیشان: {settings.address}</span>}
                </div>
              </div>
            </div>

            <div className="text-left bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-sm font-black block text-slate-900 mb-0.5">کەشف حیسابی فەرمی کڕیار (A4)</span>
              <span className="text-[11px] text-slate-600 block font-mono" dir="ltr">بەروار: {format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
              <span className="text-[11px] text-indigo-700 font-bold block">دەرکراوە لەلایەن: {currentUser?.name || 'بەڕێوەبەر'}</span>
            </div>
          </div>

          {/* Customer Profile & Balances */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/50">
              <h3 className="text-xs font-black text-slate-900 border-b pb-1 mb-2">زانیاری کڕیار:</h3>
              <div className="text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">ناوی کڕیار:</span>
                  <span className="font-black text-slate-900 text-sm">{historyCustomer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ژمارەی مۆبایل:</span>
                  <span className="font-mono font-bold text-slate-800" dir="ltr">{historyCustomer.phone || 'تۆمار نەکراوە'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">بارودۆخی حیساب:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                    historyCustomer.remainingDebt > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {historyCustomer.remainingDebt > 0 ? 'قەرزارە' : 'پاکتاوکراوە'}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/50">
              <h3 className="text-xs font-black text-slate-900 border-b pb-1 mb-2">پوختەی دارایی حیساب:</h3>
              <div className="text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">کۆی کڕین بە قەرز:</span>
                  <span className="font-mono font-bold text-slate-900">{historyCustomer.totalPurchases.toLocaleString('en-US')} IQD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">کۆی پارەی دراو:</span>
                  <span className="font-mono font-bold text-emerald-700">{historyCustomer.totalPaid.toLocaleString('en-US')} IQD</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="font-black text-rose-700 text-sm">قەرزی ماوەی کۆتایی:</span>
                  <span className="font-mono font-black text-rose-700 text-base" dir="ltr">
                    {historyCustomer.remainingDebt.toLocaleString('en-US')} IQD
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-900 border-r-4 border-indigo-600 pr-2 mb-2">
              تۆماری تەواوی مامەڵەکان و پارەدانەکان
            </h3>
            <table className="w-full text-right text-xs border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2.5 border-l border-slate-300 w-10 text-center">#</th>
                  <th className="p-2.5 border-l border-slate-300">بەروار و کات</th>
                  <th className="p-2.5 border-l border-slate-300">جۆری مامەڵە</th>
                  <th className="p-2.5 border-l border-slate-300 text-left">بڕی پارە (IQD)</th>
                  <th className="p-2.5">تێبینی و وردەکاری</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.map((tx, idx) => (
                  <tr key={tx.id || idx}>
                    <td className="p-2 text-center font-mono border-l border-slate-300 text-slate-500">{idx + 1}</td>
                    <td className="p-2 font-mono border-l border-slate-300" dir="ltr">
                      {tx.date ? format(new Date(tx.date), 'yyyy-MM-dd hh:mm a') : '--'}
                    </td>
                    <td className="p-2 border-l border-slate-300 font-bold">
                      {tx.type === 'Payment' ? 'پارەدان (دانەوەی قەرز)' : tx.type === 'Sale' ? 'کڕینی کاڵا بە قەرز' : 'زیادکردنی قەرز'}
                    </td>
                    <td className="p-2 font-mono font-black text-left border-l border-slate-300" dir="ltr">
                      <span className={tx.type === 'Payment' ? 'text-emerald-700' : 'text-rose-700'}>
                        {tx.type === 'Payment' ? '-' : '+'}{tx.amount.toLocaleString('en-US')} IQD
                      </span>
                    </td>
                    <td className="p-2 text-slate-700">{tx.notes || '-'}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">هیچ تۆمارێک نییە</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legal / Signatures */}
          <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center text-xs">
            <div>
              <p className="font-bold text-slate-900">پەسەندکردنی فرۆشگا: <span className="font-normal">{settings.shopName || 'سۆران هۆکە شۆپ'}</span></p>
              <p className="text-slate-500 text-[10px] mt-1">ئەم کەشف حیسابە بە شێوازی سیستەمی ئەلیکترۆنی دەرکراوە.</p>
            </div>
            
            <div className="text-center">
              <p className="font-bold text-slate-900 mb-8">واژوو و مۆری پەسەندکردنی کڕیار</p>
              <p className="text-slate-400 font-mono">...........................................</p>
            </div>
          </div>

        </div>
      )}

      {/* ─── INTERACTIVE A4 OVERALL DEBTS REPORT PREVIEW MODAL (Screen View) ─── */}
      {showAllDebtsA4Modal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-start p-4 overflow-y-auto print:hidden animate-in">
          
          {/* Modal Header Control Bar */}
          <div className="sticky top-0 z-10 w-full max-w-4xl bg-slate-900 text-white px-6 py-4 rounded-2xl flex items-center justify-between shadow-2xl mb-4 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black">ڕاپۆرتی گشتی قەرزەکانی بازاڕ (A4 Overall Debts Report)</h3>
                <p className="text-xs text-slate-400">کۆی قەرزاران: {debtorsCount} کەس | کۆی قەرز: {totalMarketDebt.toLocaleString('en-US')} IQD</p>
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
                onClick={() => setShowAllDebtsA4Modal(false)}
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
                  <p className="text-xs text-slate-600 font-bold mt-0.5">{settings.receiptHeader || 'سیستەمی بەڕێوەبردنی فرۆشتن و کۆگا'}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-1">
                    {settings.phone && <span>تەلەفۆن: {settings.phone}</span>}
                    {settings.address && <span>ناونیشان: {settings.address}</span>}
                  </div>
                </div>
              </div>

              <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-black block text-slate-900 mb-0.5">ڕاپۆرتی فەرمی گشتی قەرزەکان (A4)</span>
                <span className="text-[10px] text-slate-600 block font-mono" dir="ltr">بەروار: {format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
                <span className="text-[10px] text-indigo-700 font-bold block">دەرکراوە لەلایەن: {currentUser?.name || 'بەڕێوەبەر'}</span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mb-6">
              <h3 className="text-sm font-black text-slate-900 border-r-4 border-rose-600 pr-2 mb-2">
                پوختەی دارایی قەرزەکانی سەر بازاڕ
              </h3>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2.5 border-l border-slate-300">کۆی قەرزی ماوە (بازاڕ)</th>
                    <th className="p-2.5 border-l border-slate-300">بەهای بە دۆلار ($)</th>
                    <th className="p-2.5 border-l border-slate-300">ژمارەی قەرزاران</th>
                    <th className="p-2.5 border-l border-slate-300">کۆی دراو (دانەوە)</th>
                    <th className="p-2.5 border-l border-slate-300">ڕێژەی وەرگرتنەوە</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono font-bold">
                  <tr>
                    <td className="p-2.5 border-l border-slate-300 font-black text-rose-700">{totalMarketDebt.toLocaleString('en-US')} IQD</td>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">≈ ${totalMarketDebtUSD.toFixed(2)}</td>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{debtorsCount} کەس</td>
                    <td className="p-2.5 border-l border-slate-300 text-emerald-700">{totalReceived.toLocaleString('en-US')} IQD</td>
                    <td className="p-2.5 border-l border-slate-300 text-indigo-700">{recoveryRate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Debtors List Table */}
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-900 border-r-4 border-indigo-600 pr-2 mb-2">
                خشتەی وردەکاری قەرزی کڕیاران
              </h3>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                    <th className="p-2 border-l border-slate-300">ناوی کڕیار</th>
                    <th className="p-2 border-l border-slate-300">ژمارەی مۆبایل</th>
                    <th className="p-2 border-l border-slate-300">کۆی کڕین</th>
                    <th className="p-2 border-l border-slate-300">کۆی دراو</th>
                    <th className="p-2 border-l border-slate-300 font-black text-rose-700">قەرزی ماوە (باقی)</th>
                    <th className="p-2 text-center">بارودۆخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {customers.map((c, idx) => (
                    <tr key={c.id} className={c.remainingDebt > 0 ? 'bg-rose-50/30' : ''}>
                      <td className="p-2 text-center font-mono border-l border-slate-300 text-slate-500">{idx + 1}</td>
                      <td className="p-2 font-bold border-l border-slate-300 text-slate-900">{c.name}</td>
                      <td className="p-2 font-mono text-[11px] border-l border-slate-300 text-slate-600" dir="ltr">{c.phone || '-'}</td>
                      <td className="p-2 font-mono border-l border-slate-300" dir="ltr">{c.totalPurchases.toLocaleString()} IQD</td>
                      <td className="p-2 font-mono border-l border-slate-300 text-emerald-700" dir="ltr">{c.totalPaid.toLocaleString()} IQD</td>
                      <td className="p-2 font-mono font-black border-l border-slate-300 text-rose-700" dir="ltr">
                        {c.remainingDebt.toLocaleString()} IQD
                      </td>
                      <td className="p-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.remainingDebt > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {c.remainingDebt > 0 ? 'قەرزارە' : 'پاکتاوە'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Signature Box */}
            <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center text-xs">
              <div>
                <p className="font-bold text-slate-800">ئامادەکاری ڕاپۆرت: <span className="font-normal">{currentUser?.name || 'بەڕێوەبەر'}</span></p>
                <p className="text-slate-500 text-[10px] mt-1">ئەم ڕاپۆرتە فەرمییە و لە سیستەمی کۆمپیتەری فرۆشگاوە دەرکراوە.</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 mb-8">مۆر و واژووی ژمێریاری</p>
                <p className="text-slate-400 font-mono">...........................................</p>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─── DEDICATED A4 PRINTABLE OVERALL DEBTS (Print Media Engine) ─── */}
      {showAllDebtsA4Modal && (
        <div className="hidden print:block printable-a4 font-kurdish p-8 text-black bg-white">
          
          {/* Shop Header */}
          <div className="flex justify-between items-center border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex items-center gap-4">
              {settings.logoUrl && (
                <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 object-contain" />
              )}
              <div>
                <h1 className="text-2xl font-black text-slate-950">{settings.shopName || 'سۆران هۆکە شۆپ'}</h1>
                <p className="text-xs text-slate-600 font-bold mt-0.5">{settings.receiptHeader || 'سیستەمی بەڕێوەبردنی فرۆشتن و کۆگا'}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium mt-1">
                  {settings.phone && <span>تەلەفۆن: {settings.phone}</span>}
                  {settings.address && <span>ناونیشان: {settings.address}</span>}
                </div>
              </div>
            </div>

            <div className="text-left bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-sm font-black block text-slate-900 mb-0.5">ڕاپۆرتی فەرمی گشتی قەرزەکان (A4)</span>
              <span className="text-[11px] text-slate-600 block font-mono" dir="ltr">بەروار: {format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
              <span className="text-[11px] text-indigo-700 font-bold block">دەرکراوە لەلایەن: {currentUser?.name || 'بەڕێوەبەر'}</span>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="mb-6">
            <h3 className="text-sm font-black text-slate-900 border-r-4 border-rose-600 pr-2 mb-2">
              پوختەی دارایی قەرزەکانی سەر بازاڕ
            </h3>
            <table className="w-full text-right text-xs border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2.5 border-l border-slate-300">کۆی قەرزی ماوە (بازاڕ)</th>
                  <th className="p-2.5 border-l border-slate-300">بەهای بە دۆلار ($)</th>
                  <th className="p-2.5 border-l border-slate-300">ژمارەی قەرزاران</th>
                  <th className="p-2.5 border-l border-slate-300">کۆی دراو (دانەوە)</th>
                  <th className="p-2.5 border-l border-slate-300">ڕێژەی وەرگرتنەوە</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono font-bold">
                <tr>
                  <td className="p-2.5 border-l border-slate-300 font-black text-rose-700">{totalMarketDebt.toLocaleString('en-US')} IQD</td>
                  <td className="p-2.5 border-l border-slate-300 text-slate-900">≈ ${totalMarketDebtUSD.toFixed(2)}</td>
                  <td className="p-2.5 border-l border-slate-300 text-slate-900">{debtorsCount} کەس</td>
                  <td className="p-2.5 border-l border-slate-300 text-emerald-700">{totalReceived.toLocaleString('en-US')} IQD</td>
                  <td className="p-2.5 border-l border-slate-300 text-indigo-700">{recoveryRate}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Debtors List Table */}
          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-900 border-r-4 border-indigo-600 pr-2 mb-2">
              خشتەی وردەکاری قەرزی کڕیاران
            </h3>
            <table className="w-full text-right text-xs border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                  <th className="p-2 border-l border-slate-300">ناوی کڕیار</th>
                  <th className="p-2 border-l border-slate-300">ژمارەی مۆبایل</th>
                  <th className="p-2 border-l border-slate-300">کۆی کڕین</th>
                  <th className="p-2 border-l border-slate-300">کۆی دراو</th>
                  <th className="p-2 border-l border-slate-300 font-black text-rose-700">قەرزی ماوە (باقی)</th>
                  <th className="p-2 text-center">بارودۆخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {customers.map((c, idx) => (
                  <tr key={c.id} className={c.remainingDebt > 0 ? 'bg-rose-50/30' : ''}>
                    <td className="p-2 text-center font-mono border-l border-slate-300 text-slate-500">{idx + 1}</td>
                    <td className="p-2 font-bold border-l border-slate-300 text-slate-900">{c.name}</td>
                    <td className="p-2 font-mono text-[11px] border-l border-slate-300 text-slate-600" dir="ltr">{c.phone || '-'}</td>
                    <td className="p-2 font-mono border-l border-slate-300" dir="ltr">{c.totalPurchases.toLocaleString()} IQD</td>
                    <td className="p-2 font-mono border-l border-slate-300 text-emerald-700" dir="ltr">{c.totalPaid.toLocaleString()} IQD</td>
                    <td className="p-2 font-mono font-black border-l border-slate-300 text-rose-700" dir="ltr">
                      {c.remainingDebt.toLocaleString()} IQD
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.remainingDebt > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {c.remainingDebt > 0 ? 'قەرزارە' : 'پاکتاوە'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legal / Signatures */}
          <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center text-xs">
            <div>
              <p className="font-bold text-slate-900">پەسەندکردنی فرۆشگا: <span className="font-normal">{settings.shopName || 'سۆران هۆکە شۆپ'}</span></p>
              <p className="text-slate-500 text-[10px] mt-1">ئەم ڕاپۆرتە بە شێوازی سیستەمی ئەلیکترۆنی دەرکراوە.</p>
            </div>
            
            <div className="text-center">
              <p className="font-bold text-slate-900 mb-8">واژوو و مۆری ژمێریاری</p>
              <p className="text-slate-400 font-mono">...........................................</p>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
