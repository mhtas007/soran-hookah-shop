import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Search,
  Plus,
  Trash2,
  Edit2,
  Phone,
  MessageCircle,
  Package,
  X,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';
import type { Supplier, Product } from '../types';
import { supabase } from '../lib/supabase';

// DB rows are snake_case; the UI uses camelCase Product fields
const mapProductRows = (rows: any[] | null): Product[] =>
  (rows || []).map((p: any) => ({
    ...p,
    sellingPrice: Number(p.selling_price) || 0,
    stockLevel: Number(p.stock_level) || 0,
  })) as unknown as Product[];
import { logActivity } from '../lib/activityLogger';
import { useAppStore } from '../store/useAppStore';

export const Companies: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit Supplier Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  // View Company Products Modal State
  const [viewingCompany, setViewingCompany] = useState<Supplier | null>(null);

  const currentUser = useAppStore(state => state.currentUser);
  const isCashier = currentUser?.role === 'Cashier';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [suppliersRes, productsRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name', { ascending: true }),
        supabase.from('products').select('id, name, barcode, selling_price, stock_level, company, section, category')
      ]);
        
      if (suppliersRes.error) throw suppliersRes.error;
      
      const formattedSuppliers = (suppliersRes.data || []).map(s => ({
        id: s.id, 
        name: s.name || '', 
        phone: s.phone || '', 
        totalPurchases: Number(s.total_purchases) || 0, 
        totalPaid: Number(s.total_paid) || 0, 
        remainingDebt: Number(s.remaining_debt) || 0, 
        createdAt: s.created_at
      }));
      
      setSuppliers(formattedSuppliers);
      setProducts(mapProductRows(productsRes.data));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsAdding(true);
    try {
      if (editSupplier) {
        const oldName = editSupplier.name;
        const newName = formData.name.trim();

        const { error } = await supabase.from('suppliers').update({
          name: newName,
          phone: formData.phone.trim()
        }).eq('id', editSupplier.id);
        if (error) throw error;

        // Cascade update company name in products
        if (oldName !== newName) {
          await supabase.from('products').update({ company: newName }).eq('company', oldName);
        }

        await logActivity('SUPPLIER_UPDATED', `دەستکاریکردنی کۆمپانیا: ${newName}`, { id: editSupplier.id, name: newName });
        alert('زانیارییەکانی کۆمپانیا بە سەرکەوتوویی نوێکرانەوە');
      } else {
        const { error } = await supabase.from('suppliers').insert({
          name: formData.name.trim(),
          phone: formData.phone.trim()
        });
        if (error) throw error;

        await logActivity('SUPPLIER_ADDED', `زیادکردنی کۆمپانیای نوێ: ${formData.name}`, { name: formData.name });
        alert('کۆمپانیای نوێ بە سەرکەوتوویی زیادکرا');
      }

      setShowAddForm(false);
      setFormData({ name: '', phone: '' });
      setEditSupplier(null);
      fetchData();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    const productCount = products.filter(p => p.company === supplier.name).length;
    if (productCount > 0) {
      if (!window.confirm(`ئەم کۆمپانیایە (${productCount}) کاڵای لەسەر تۆمارکراوە. دڵنیایت لە سڕینەوەی؟`)) return;
    } else {
      if (!window.confirm(`دڵنیایت لە سڕینەوەی کۆمپانیای (${supplier.name})؟`)) return;
    }

    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', supplier.id);
      if (error) throw error;

      await logActivity('SUPPLIER_DELETED', `سڕینەوەی کۆمپانیا: ${supplier.name}`, { id: supplier.id, name: supplier.name });
      alert('کۆمپانیاکە بە سەرکەوتوویی سڕدرایەوە');
      fetchData();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    }
  };

  const openWhatsApp = (phone: string, name: string) => {
    if (!phone) return;
    const clean = phone.replace(/[^0-9]/g, '');
    const formatted = clean.startsWith('07') ? '964' + clean.slice(1) : clean;
    window.open(`https://wa.me/${formatted}`, '_blank');
  };

  const filteredSuppliers = suppliers.filter(s => 
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.phone && s.phone.includes(searchTerm))
  );

  const totalProductsCount = products.filter(p => p.company).length;
  const companyWithMostProducts = suppliers.reduce((prev, current) => {
    const prevCount = products.filter(p => p.company === prev.name).length;
    const currentCount = products.filter(p => p.company === current.name).length;
    return currentCount > prevCount ? current : prev;
  }, suppliers[0] || null);

  const companyProducts = viewingCompany 
    ? products.filter(p => p.company === viewingCompany.name)
    : [];

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-orange-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                کۆمپانیاکان (Suppliers)
                <span className="text-[10px] font-bold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full border border-orange-200">
                  {suppliers.length} کۆمپانیا
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">سۆران هۆکە شۆپ</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => {
            setEditSupplier(null);
            setFormData({ name: '', phone: '' });
            setShowAddForm(true);
          }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shadow-orange-200"
        >
          <Plus className="w-4 h-4" />
          زیادکردنی کۆمپانیای نوێ
        </button>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* ─── Metric Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی کۆمپانیاکان</span>
              <h3 className="text-2xl font-black text-slate-800 font-mono" dir="ltr">{suppliers.length}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">کۆمپانیای هاوبەش</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی کاڵاکانی بەستراوە</span>
              <h3 className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">{totalProductsCount}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">کاڵا خاوەن کۆمپانیان</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">پڕکاڵاترین کۆمپانیا</span>
              <h3 className="text-lg font-black text-indigo-600 truncate max-w-[170px]">
                {companyWithMostProducts?.name || 'نییە'}
              </h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">
                {companyWithMostProducts ? `${products.filter(p => p.company === companyWithMostProducts.name).length} کاڵا` : '-'}
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ─── Search Bar ─── */}
        <div className="bg-white p-4 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="گەڕان بۆ کۆمپانیا یان ژمارەی مۆبایل..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ─── Companies Grid Cards View ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full py-16 text-center text-slate-500">خەریکی هێنانی زانیارییەکانە...</div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              هیچ کۆمپانیایەک نەدۆزرایەوە
            </div>
          ) : (
            filteredSuppliers.map((supplier, idx) => {
              const productCount = products.filter(p => p.company === supplier.name).length;

              return (
                <div 
                  key={supplier.id}
                  className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 hover:border-orange-300 hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l from-orange-400 to-amber-500"></div>

                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-black text-sm">
                          {supplier.name.slice(0, 1)}
                        </div>
                        <div>
                          <h3 className="font-black text-slate-900 text-base group-hover:text-orange-600 transition-colors">
                            {supplier.name}
                          </h3>
                          <span className="text-[11px] font-bold text-slate-400 block mt-0.5">
                            کۆمپانیای ژمارە #{idx + 1}
                          </span>
                        </div>
                      </div>

                      {/* View Products count badge */}
                      <button 
                        onClick={() => setViewingCompany(supplier)}
                        className="bg-slate-100 hover:bg-orange-50 hover:text-orange-700 text-slate-600 px-2.5 py-1 rounded-xl text-xs font-black transition-colors flex items-center gap-1 border border-slate-200"
                        title="پیشاندانی کاڵاکانی ئەم کۆمپانیایە"
                      >
                        <Package className="w-3.5 h-3.5" />
                        {productCount} کاڵا
                      </button>
                    </div>

                    {/* Phone & Contact */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 my-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-700 font-bold" dir="ltr">
                          {supplier.phone || 'مۆبایل نییە'}
                        </span>
                      </div>

                      {supplier.phone && (
                        <div className="flex gap-1">
                          <button 
                            onClick={() => openWhatsApp(supplier.phone, supplier.name)}
                            className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                            title="پەیوەندی بە واتسئاپ"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <a 
                            href={`tel:${supplier.phone}`}
                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            title="تەلەفۆن کردن"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <button 
                      onClick={() => setViewingCompany(supplier)}
                      className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
                    >
                      پیشاندانی کاڵاکان <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setEditSupplier(supplier);
                          setFormData({ name: supplier.name, phone: supplier.phone || '' });
                          setShowAddForm(true);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                        title="دەستکاریکردن"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(supplier)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="سڕینەوە"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* ─── Add/Edit Modal (Fixed z-[100]) ─── */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-600" />
                {editSupplier ? 'دەستکاریکردنی کۆمپانیا' : 'زیادکردنی کۆمپانیای نوێ'}
              </h2>
              <button onClick={() => setShowAddForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی کۆمپانیا / براند *</label>
                <input 
                  required 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-xs font-bold" 
                  placeholder="نموونە: کۆمپانیای ئەلباشا..."
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ژمارەی مۆبایل / بریکار</label>
                <input 
                  type="text" 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})} 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-left text-xs font-bold font-mono" 
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
                  className="flex-[2] py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black transition-all text-xs shadow-md shadow-orange-200 disabled:opacity-50 active:scale-98"
                >
                  {isAdding ? 'چاوەڕێبە...' : (editSupplier ? 'نوێکردنەوە' : 'تۆمارکردن')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Viewing Company Products Modal (Fixed z-[100]) ─── */}
      {viewingCompany && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col border border-slate-100">
            
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black flex items-center gap-2 text-slate-800">
                  <Package className="w-5 h-5 text-orange-600" />
                  کاڵاکانی کۆمپانیای ({viewingCompany.name})
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  کۆی گشتی: {companyProducts.length} کاڵا تۆمارکراوە
                </p>
              </div>
              
              <button 
                onClick={() => setViewingCompany(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Products List Table */}
            <div className="flex-1 overflow-y-auto min-h-[220px] border border-slate-200/80 rounded-2xl">
              <table className="w-full text-right text-xs md:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 font-bold text-slate-600">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">ناوی کاڵا</th>
                    <th className="p-3">جۆر</th>
                    <th className="p-3 text-center">مەوجوود</th>
                    <th className="p-3 text-emerald-700">نرخی فرۆشتن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {companyProducts.length === 0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400">هیچ کاڵایەک بۆ ئەم کۆمپانیایە دیاری نەکراوە</td></tr>
                  ) : (
                    companyProducts.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900">{p.name}</td>
                        <td className="p-3">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-xs font-semibold">
                            {p.category}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold font-mono">
                          {p.stockLevel} دانە
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-700" dir="ltr">
                          {p.sellingPrice?.toLocaleString('en-US')} IQD
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100">
              <button 
                onClick={() => setViewingCompany(null)} 
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-xs"
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
