import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ScrollText,
  Eye,
  Search,
  Camera,
  Upload,
  Plus,
  X,
  Edit,
  Trash2,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { startOfDay, endOfDay, format } from 'date-fns';
import { useAppStore } from '../store/useAppStore';
import { logActivity } from '../lib/activityLogger';
import { ThermalReceipt, type ReceiptData } from '../components/ThermalReceipt';

export const Receipts: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const isCashier = currentUser?.role === 'Cashier';
  const canManageInvoices = currentUser?.role === 'Admin' || currentUser?.permissions?.includes('manage_invoices');
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'system'|'physical'>('system');
  
  // Date Range filter
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');

  const [salesList, setSalesList] = useState<any[]>([]);
  const [customers, setCustomers] = useState<{id: string, name: string}[]>([]);

  // Thermal Receipt Modal State
  const [selectedReceiptData, setSelectedReceiptData] = useState<ReceiptData | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // Physical Invoices
  const [physicalInvoices, setPhysicalInvoices] = useState<any[]>([]);
  const [showPhysicalForm, setShowPhysicalForm] = useState(false);
  const [physicalType, setPhysicalType] = useState('incoming');
  const [physicalDetails, setPhysicalDetails] = useState('');
  const [physicalImageFile, setPhysicalImageFile] = useState<File | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchReceipts();
    fetchPhysicalInvoices();
  }, [startDate, endDate]);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const start = startOfDay(new Date(startDate)).toISOString();
      const end = endOfDay(new Date(endDate)).toISOString();

      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      const { data: customersData } = await supabase.from('customers').select('id, name');
      if (customersData) {
        setCustomers(customersData);
      }

      setSalesList(sales || []);
    } catch (error) {
      console.error('Error fetching receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPhysicalInvoices = async () => {
    try {
      const { data, error } = await supabase.from('physical_invoices').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setPhysicalInvoices(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUploadInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!physicalImageFile && !editingInvoiceId) return alert('تکایە وێنەیەک هەڵبژێرە');
    setIsUploading(true);
    try {
      let publicUrl = null;

      if (physicalImageFile) {
        const formData = new FormData();
        formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
        formData.append('action', 'upload');
        formData.append('source', physicalImageFile);

        try {
          const res = await fetch('https://freeimage.host/api/1/upload', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data?.image?.url) {
            publicUrl = data.image.url;
          }
        } catch (upErr) {
          console.warn('Freeimage upload error, fallback to base64', upErr);
        }

        if (!publicUrl) {
          publicUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(physicalImageFile);
          });
        }
      }

      if (editingInvoiceId) {
        const updateData: any = {
          invoice_type: physicalType,
          details: physicalDetails
        };
        if (publicUrl) updateData.image_url = publicUrl;

        const { error: dbError } = await supabase.from('physical_invoices').update(updateData).eq('id', editingInvoiceId);
        if (dbError) throw dbError;
        await logActivity('INVOICE_UPDATED', `نوێکردنەوەی وەسڵی فیزیکی (${physicalType})`, { invoiceId: editingInvoiceId, type: physicalType });
        alert('بە سەرکەوتوویی نوێکرایەوە');
      } else {
        const { error: dbError } = await supabase.from('physical_invoices').insert({
          invoice_type: physicalType,
          details: physicalDetails,
          image_url: publicUrl
        });
        if (dbError) throw dbError;
        await logActivity('INVOICE_UPLOADED', `تۆمارکردنی وەسڵی فیزیکی نوێ (${physicalType})`, { type: physicalType });
        alert('وەسڵە فیزیکییەکە بە سەرکەوتوویی بارکرا');
      }

      setShowPhysicalForm(false);
      setEditingInvoiceId(null);
      setPhysicalDetails('');
      setPhysicalImageFile(null);
      fetchPhysicalInvoices();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditInvoice = (inv: any) => {
    setEditingInvoiceId(inv.id);
    setPhysicalType(inv.invoice_type);
    setPhysicalDetails(inv.details || '');
    setPhysicalImageFile(null);
    setShowPhysicalForm(true);
  };

  const handleDeleteInvoice = async (id: string, imageUrl: string) => {
    if (!window.confirm('دڵنیایت لە سڕینەوەی ئەم وەسڵە؟')) return;
    try {
      const { error } = await supabase.from('physical_invoices').delete().eq('id', id);
      if (error) throw error;
      await logActivity('INVOICE_DELETED', `سڕینەوەی وەسڵی فیزیکی`, { invoiceId: id });
      fetchPhysicalInvoices();
    } catch (e: any) {
      alert('کێشەیەک ڕوویدا لە سڕینەوە: ' + e.message);
    }
  };

  const handleViewReceipt = async (sale: any) => {
    setLoadingItems(true);
    try {
      const { data: itemsData, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id);
        
      if (error) throw error;

      const customerObj = customers.find(c => c.id === sale.debt_customer_id);

      setSelectedReceiptData({
        id: sale.id,
        saleId: sale.id,
        date: sale.created_at,
        cashierName: sale.cashier_name || 'کاشێر',
        customerName: customerObj?.name,
        paymentMethod: sale.payment_method,
        items: (itemsData || []).map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          unitLabel: i.unit_label
        })),
        subtotal: sale.total_amount + (sale.discount || 0),
        discount: sale.discount || 0,
        totalAmount: sale.total_amount,
        amountPaid: sale.payment_amount,
        change: sale.payment_amount && sale.payment_amount > sale.total_amount ? (sale.payment_amount - sale.total_amount) : undefined
      });
    } catch (error) {
      console.error('Error fetching items for receipt:', error);
    } finally {
      setLoadingItems(false);
    }
  };

  const filteredSales = salesList.filter(s => {
    const customer = customers.find(c => c.id === s.debt_customer_id);
    const searchString = `${s.id} ${customer?.name || ''} ${s.payment_method}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  });

  const totalPeriodRevenue = salesList.reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const totalPeriodDiscounts = salesList.reduce((sum, s) => sum + (s.discount || 0), 0);
  const totalPeriodProfit = salesList.reduce((sum, s) => sum + (s.total_profit || 0), 0);

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-pink-200">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                وەسڵەکان (Receipts)
                <span className="text-[10px] font-bold bg-pink-100 text-pink-800 px-2 py-0.5 rounded-full border border-pink-200">
                  {salesList.length} وەسڵ
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">سۆران هۆکە شۆپ</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/70">
          <button 
            onClick={() => setActiveTab('system')}
            className={`px-5 py-2 rounded-xl font-black text-xs transition-all ${
              activeTab === 'system' 
                ? 'bg-white text-pink-600 shadow-sm font-black' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            وەسلەکانی سیستەم ({salesList.length})
          </button>
          <button 
            onClick={() => setActiveTab('physical')}
            className={`px-5 py-2 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 ${
              activeTab === 'physical' 
                ? 'bg-white text-indigo-600 shadow-sm font-black' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            وەسلی فیزیکی وێنەگیراو ({physicalInvoices.length})
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {activeTab === 'system' ? (
          <>
            {/* ─── Metric Cards ─── */}
            <div className={`grid grid-cols-1 ${!isCashier ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">کۆی داهاتی وەسڵەکان</span>
                  <h3 className="text-2xl font-black text-slate-800 font-mono" dir="ltr">
                    {totalPeriodRevenue.toLocaleString('en-US')} <span className="text-xs font-kurdish font-normal text-slate-400">IQD</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">{salesList.length} وەسڵ لەم بەروارەدا</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-pink-50 text-pink-600 flex items-center justify-center">
                  <ScrollText className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">کۆی داشکانە دراوەکان</span>
                  <h3 className="text-2xl font-black text-rose-600 font-mono" dir="ltr">
                    {totalPeriodDiscounts.toLocaleString('en-US')} <span className="text-xs font-kurdish font-normal text-slate-400">IQD</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">داشکانی ڕاستەوخۆ</span>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>

              {!isCashier && (
                <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1">کۆی قازانجی وەسڵەکان</span>
                    <h3 className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">
                      {totalPeriodProfit.toLocaleString('en-US')} <span className="text-xs font-kurdish font-normal text-slate-400">IQD</span>
                    </h3>
                    <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">پوختەی قازانج</span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
              )}
            </div>

            {/* ─── Filters Bar ─── */}
            <div className="bg-white p-4 rounded-3xl shadow-xs border border-slate-200/80 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">لە بەرواری:</span>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="p-2 rounded-xl border border-slate-200 focus:border-pink-500 outline-none text-xs font-bold font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">تا:</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="p-2 rounded-xl border border-slate-200 focus:border-pink-500 outline-none text-xs font-bold font-mono"
                  />
                </div>
              </div>

              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="گەڕان بەپێی وەسڵ، کڕیار یان جۆری پارەدان..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-pink-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            {/* ─── Sales / Receipts Table ─── */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs md:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">ژمارەی وەسڵ</th>
                      <th className="p-3.5">کات و بەروار</th>
                      <th className="p-3.5">شێوازی پارەدان</th>
                      <th className="p-3.5">کڕیار</th>
                      <th className="p-3.5 text-rose-700">داشکان</th>
                      <th className="p-3.5 text-slate-900">کۆی گشتی</th>
                      {!isCashier && <th className="p-3.5 text-emerald-700">قازانج</th>}
                      <th className="p-3.5 text-center w-32">کردار / چاپ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {loading ? (
                      <tr><td colSpan={isCashier ? 8 : 9} className="p-8 text-center text-slate-500">بەدوای زانیاریدا دەگەڕێت...</td></tr>
                    ) : filteredSales.length === 0 ? (
                      <tr><td colSpan={isCashier ? 8 : 9} className="p-10 text-center text-slate-400">هیچ وەسڵێک نەدۆزرایەوە لەم ماوەیەدا</td></tr>
                    ) : (
                      filteredSales.map((sale, idx) => {
                        const customer = customers.find(c => c.id === sale.debt_customer_id);

                        return (
                          <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 text-slate-400 font-mono text-center">{idx + 1}</td>
                            <td className="p-3.5 font-mono font-bold text-slate-900" dir="ltr">
                              #{sale.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="p-3.5 font-mono text-slate-500 text-xs" dir="ltr">
                              {format(new Date(sale.created_at), 'yyyy-MM-dd hh:mm a')}
                            </td>
                            <td className="p-3.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border inline-block ${
                                sale.payment_method === 'Cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                sale.payment_method === 'FIB' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {sale.payment_method === 'Cash' ? 'کاش (نەقد)' :
                                 sale.payment_method === 'FIB' ? 'FIB ئەلیکترۆنی' : 'قەرز'}
                              </span>
                            </td>
                            <td className="p-3.5 font-bold text-slate-700">
                              {customer?.name || (sale.payment_method === 'Debt' ? 'کڕیاری قەرز' : '-')}
                            </td>
                            <td className="p-3.5 font-mono font-bold text-rose-600" dir="ltr">
                              {sale.discount > 0 ? `-${sale.discount.toLocaleString('en-US')} IQD` : '-'}
                            </td>
                            <td className="p-3.5 font-mono font-black text-sm text-slate-900" dir="ltr">
                              {sale.total_amount.toLocaleString('en-US')} IQD
                            </td>
                            {!isCashier && (
                              <td className="p-3.5 font-mono font-bold text-emerald-600" dir="ltr">
                                {sale.total_profit?.toLocaleString('en-US')} IQD
                              </td>
                            )}
                            <td className="p-3.5 text-center">
                              <button 
                                onClick={() => handleViewReceipt(sale)}
                                className="bg-slate-100 hover:bg-pink-50 hover:text-pink-700 text-slate-700 px-3 py-1.5 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition-colors border border-slate-200 shadow-2xs"
                                title="پیشاندانی وەسڵ و چاپکردن"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                وەسڵ و چاپ
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
          </>
        ) : (
          
          /* ─── Physical Scanned Invoices Tab ─── */
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs">
              <div>
                <h2 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <Camera className="w-5 h-5 text-indigo-600" />
                  ئەرشیفی وەسڵە فیزیکی و کاغەزییەکان
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">گرتنی وێنەی وەسڵی کڕینی کاڵا یان گەڕانەوە بۆ پاراستن لە داتابەیس</p>
              </div>

              {canManageInvoices && (
                <button 
                  onClick={() => {
                    setEditingInvoiceId(null);
                    setPhysicalDetails('');
                    setPhysicalImageFile(null);
                    setShowPhysicalForm(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shadow-indigo-200"
                >
                  <Plus className="w-4 h-4" />
                  وێنەگرتنی وەسڵی نوێ
                </button>
              )}
            </div>

            {/* Physical Form Modal / Drawer */}
            {showPhysicalForm && (
              <div className="bg-white rounded-3xl p-6 shadow-xs border border-indigo-200 space-y-4">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-600" />
                  {editingInvoiceId ? 'دەستکاریکردنی زانیاری وەسڵ' : 'بارکردنی وەسڵی کاغەزی نوێ'}
                </h3>

                <form onSubmit={handleUploadInvoice} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50 rounded-2xl p-6 text-center cursor-pointer transition-colors"
                    >
                      {physicalImageFile ? (
                        <p className="text-xs font-black text-indigo-700">وێنە هەڵبژێردراوە: {physicalImageFile.name}</p>
                      ) : (
                        <div className="space-y-1">
                          <Camera className="w-8 h-8 text-indigo-500 mx-auto" />
                          <p className="text-xs font-bold text-slate-700">کلیک بکە بۆ وێنەگرتن بە کامێرا یان هەڵبژاردنی فایل</p>
                          <p className="text-[10px] text-slate-400">فایلی وێنەی JPG یان PNG</p>
                        </div>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            setPhysicalImageFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">جۆری وەسڵ</label>
                    <select 
                      value={physicalType} 
                      onChange={e => setPhysicalType(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold bg-white"
                    >
                      <option value="incoming">وەسلی هاتوو (کڕینی کۆمپانیا)</option>
                      <option value="returned">وەسلی گەڕاوە (گەڕانەوەی کاڵا)</option>
                      <option value="other">جۆری تر</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی کۆمپانیا / تێبینی زیاتر</label>
                    <input 
                      type="text" 
                      value={physicalDetails} 
                      onChange={e => setPhysicalDetails(e.target.value)}
                      placeholder="نموونە: وەسلی کۆمپانیای ئەلباشا..."
                      className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-2.5 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowPhysicalForm(false)} 
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                    >
                      پاشگەزبوونەوە
                    </button>
                    <button 
                      type="submit" 
                      disabled={isUploading || (!physicalImageFile && !editingInvoiceId)} 
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs disabled:opacity-50 transition-all shadow-md shadow-indigo-200"
                    >
                      {isUploading ? 'خەریکی بارکردنە...' : 'تۆمارکردنی وەسڵ'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Grid of Physical Scanned Receipts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {physicalInvoices.map(inv => (
                <div key={inv.id} className="bg-white rounded-3xl overflow-hidden shadow-xs border border-slate-200/80 hover:shadow-md transition-all group flex flex-col justify-between">
                  <div 
                    className="aspect-[4/3] w-full bg-slate-100 relative cursor-pointer overflow-hidden"
                    onClick={() => setSelectedImage(inv.image_url)}
                  >
                    <img src={inv.image_url} alt="Invoice" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Eye className="text-white opacity-0 group-hover:opacity-100 w-8 h-8 transition-opacity" />
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        inv.invoice_type === 'incoming' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        inv.invoice_type === 'returned' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {inv.invoice_type === 'incoming' ? 'وەسلی هاتوو' : inv.invoice_type === 'returned' ? 'وەسلی گەڕاوە' : 'تر'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 font-bold" dir="ltr">
                        {format(new Date(inv.created_at), 'yyyy-MM-dd')}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-800 line-clamp-1">{inv.details || 'بێ زانیاری'}</p>

                    {canManageInvoices && (
                      <div className="flex justify-end gap-1 pt-2 border-t border-slate-100">
                        <button onClick={() => handleEditInvoice(inv)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteInvoice(inv.id, inv.image_url)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {physicalInvoices.length === 0 && (
                <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                  هیچ وەسڵێکی کاغەزی وێنەگیراو نییە
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── Fullscreen Scanned Invoice Modal ─── */}
      {selectedImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <button 
            onClick={() => setSelectedImage(null)} 
            className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={selectedImage} alt="Fullscreen" className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" />
        </div>
      )}

      {/* ─── Thermal Receipt Print Modal ─── */}
      {selectedReceiptData && (
        <ThermalReceipt 
          receipt={selectedReceiptData}
          onClose={() => setSelectedReceiptData(null)}
        />
      )}

    </div>
  );
};
