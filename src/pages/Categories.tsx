import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Trash2, Edit2, Tags, Sparkles, Package, Search, X, Check, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

// DB rows are snake_case; the UI uses camelCase Product fields
const mapProductRows = (rows: any[] | null): Product[] =>
  (rows || []).map((p: any) => ({
    ...p,
    sellingPrice: Number(p.selling_price) || 0,
    stockLevel: Number(p.stock_level) || 0,
  })) as unknown as Product[];
import { useAppStore } from '../store/useAppStore';
import type { Category, Product } from '../types';
import { logActivity } from '../lib/activityLogger';

export const Categories: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAppStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('from-blue-500 to-indigo-600');
  const [isProcessing, setIsProcessing] = useState(false);

  // View Category Products Modal
  const [viewingCategory, setViewingCategory] = useState<string | null>(null);

  const colorPalettes = [
    { label: 'شین', gradient: 'from-blue-500 to-indigo-600', border: 'border-blue-200 hover:border-blue-400', bgPill: 'bg-blue-50 text-blue-700' },
    { label: 'مۆر', gradient: 'from-purple-500 to-indigo-600', border: 'border-purple-200 hover:border-purple-400', bgPill: 'bg-purple-50 text-purple-700' },
    { label: 'پەمەیی', gradient: 'from-pink-500 to-rose-600', border: 'border-pink-200 hover:border-pink-400', bgPill: 'bg-pink-50 text-pink-700' },
    { label: 'سەوز', gradient: 'from-emerald-400 to-teal-600', border: 'border-emerald-200 hover:border-emerald-400', bgPill: 'bg-emerald-50 text-emerald-700' },
    { label: 'پرتەقاڵی', gradient: 'from-amber-400 to-orange-600', border: 'border-orange-200 hover:border-orange-400', bgPill: 'bg-orange-50 text-orange-700' },
    { label: 'سوور', gradient: 'from-rose-500 to-red-600', border: 'border-rose-200 hover:border-rose-400', bgPill: 'bg-rose-50 text-rose-700' },
    { label: 'تاریک', gradient: 'from-slate-700 to-slate-900', border: 'border-slate-300 hover:border-slate-500', bgPill: 'bg-slate-100 text-slate-800' },
    { label: 'فیرۆزەیی', gradient: 'from-cyan-400 to-blue-600', border: 'border-cyan-200 hover:border-cyan-400', bgPill: 'bg-cyan-50 text-cyan-700' },
  ];

  useEffect(() => {
    if (currentUser && !currentUser.permissions?.includes('/categories') && currentUser.role !== 'Admin') {
      navigate('/');
      return;
    }
    fetchData();
  }, [currentUser, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, prodRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('products').select('id, name, barcode, selling_price, stock_level, category, section, company')
      ]);

      if (catRes.error) throw catRes.error;
      const cats = catRes.data || [];
      const prods = mapProductRows(prodRes.data);

      setCategories(cats);
      setProducts(prods);

      // Map counts
      const counts: Record<string, number> = {};
      prods.forEach(p => {
        if (p.category) {
          counts[p.category] = (counts[p.category] || 0) + 1;
        }
      });
      setCategoryCounts(counts);

    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("تکایە ناوی کەتەگۆری بنووسە");
      return;
    }

    setIsProcessing(true);
    try {
      const payload = { name: name.trim(), color };

      if (editingId) {
        const oldCategory = categories.find(c => c.id === editingId);
        
        const { error } = await supabase.from('categories').update(payload).eq('id', editingId);
        if (error) throw error;

        // If category name changed, update all products that had the old category name
        if (oldCategory && oldCategory.name !== payload.name) {
          await supabase.from('products').update({ category: payload.name }).eq('category', oldCategory.name);
        }

        await logActivity('CATEGORY_UPDATED', `دەستکاریکردنی کەتەگۆری: ${payload.name}`, { id: editingId, ...payload });
        alert('کەتەگۆرییەکە بە سەرکەوتوویی نوێکرایەوە');
      } else {
        const { error } = await supabase.from('categories').insert(payload);
        if (error) throw error;

        await logActivity('CATEGORY_ADDED', `زیادکردنی کەتەگۆری نوێ: ${payload.name}`, payload);
        alert('کەتەگۆرییەکە بە سەرکەوتوویی زیادکرا');
      }

      setShowForm(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      alert('کێشەیەک ڕوویدا: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (category: Category) => {
    const count = categoryCounts[category.name] || 0;
    if (count > 0) {
      if (!window.confirm(`ئەم کەتەگۆرییە (${count}) کاڵای لەسەرە. دڵنیایت لە سڕینەوەی؟`)) return;
    } else {
      if (!window.confirm(`دڵنیایت لە سڕینەوەی کەتەگۆری (${category.name})؟`)) return;
    }

    try {
      const { error } = await supabase.from('categories').delete().eq('id', category.id);
      if (error) throw error;

      await logActivity('CATEGORY_DELETED', `سڕینەوەی کەتەگۆری: ${category.name}`, { id: category.id, name: category.name });
      alert('کەتەگۆرییەکە بە سەرکەوتوویی سڕدرایەوە');
      fetchData();
    } catch (err: any) {
      alert('کێشەیەک ڕوویدا: ' + err.message);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setName(category.name);
    setColor(category.color || 'from-blue-500 to-indigo-600');
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setColor('from-blue-500 to-indigo-600');
  };

  // Merge categories from DB and any distinct categories from products
  const productCats = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const allCategoryNames = Array.from(new Set([...categories.map(c => c.name), ...productCats])).sort();

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCategorizedProducts = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  
  const topCategoryName = Object.keys(categoryCounts).reduce((a, b) => 
    (categoryCounts[a] || 0) > (categoryCounts[b] || 0) ? a : b, ''
  );

  const categoryProducts = viewingCategory 
    ? products.filter(p => p.category === viewingCategory)
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-fuchsia-200">
              <Tags className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                جۆرەکانی کاڵا (Categories)
                <span className="text-[10px] font-bold bg-fuchsia-100 text-fuchsia-800 px-2 py-0.5 rounded-full border border-fuchsia-200">
                  {categories.length} کەتەگۆری
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">پۆلێنکردنی کاڵاکانی فرۆشگا</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shadow-fuchsia-200"
        >
          <Plus className="w-4 h-4" />
          زیادکردنی جۆری نوێ
        </button>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* ─── Metric Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی کەتەگۆرییەکان</span>
              <h3 className="text-2xl font-black text-slate-800 font-mono" dir="ltr">{categories.length}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">جۆری جیاواز</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center">
              <Tags className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی کاڵا پۆلێنکراوەکان</span>
              <h3 className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">{totalCategorizedProducts}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">کاڵا لە ناو کەتەگۆرییەکان</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">پڕکاڵاترین کەتەگۆری</span>
              <h3 className="text-lg font-black text-indigo-600 truncate max-w-[170px]">
                {topCategoryName || 'نییە'}
              </h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">
                {topCategoryName ? `${categoryCounts[topCategoryName] || 0} کاڵا` : '-'}
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
              placeholder="گەڕان بۆ ناوی کەتەگۆری..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-fuchsia-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ─── Categories Interactive Grid View ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full py-16 text-center text-slate-500">خەریکی هێنانی داتاکانە...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              هیچ کەتەگۆرییەک نەدۆزرایەوە
            </div>
          ) : (
            filteredCategories.map((category, idx) => {
              const count = categoryCounts[category.name] || 0;
              const grad = category.color?.includes('from-') ? category.color : 'from-blue-500 to-indigo-600';

              return (
                <div 
                  key={category.id}
                  className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 hover:border-fuchsia-300 hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  {/* Top Gradient Bar */}
                  <div className={`absolute top-0 right-0 w-full h-2 bg-gradient-to-l ${grad}`}></div>

                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${grad} text-white flex items-center justify-center font-black text-sm shadow-sm`}>
                          {idx + 1}
                        </div>
                        <div>
                          <h3 className="font-black text-slate-900 text-base group-hover:text-fuchsia-600 transition-colors">
                            {category.name}
                          </h3>
                        </div>
                      </div>

                      <button 
                        onClick={() => setViewingCategory(category.name)}
                        className="bg-slate-100 hover:bg-fuchsia-50 hover:text-fuchsia-700 text-slate-600 px-2.5 py-1 rounded-xl text-xs font-black transition-colors flex items-center gap-1 border border-slate-200"
                        title="پیشاندانی کاڵاکانی ئەم جۆرە"
                      >
                        <Package className="w-3.5 h-3.5" />
                        {count} کاڵا
                      </button>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                    <button 
                      onClick={() => setViewingCategory(category.name)}
                      className="text-xs font-bold text-fuchsia-600 hover:underline flex items-center gap-1"
                    >
                      پیشاندانی کاڵاکان <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleEdit(category)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                        title="دەستکاریکردن"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(category)}
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

      {/* ─── Add/Edit Category Modal (Fixed z-[100]) ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Tags className="w-5 h-5 text-fuchsia-600" />
                {editingId ? 'دەستکاریکردنی کەتەگۆری' : 'زیادکردنی کەتەگۆری نوێ'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی کەتەگۆری / جۆر *</label>
                <input 
                  required 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full p-3.5 rounded-xl border border-slate-200 focus:border-fuchsia-500 outline-none text-xs font-bold" 
                  placeholder="نموونە: دەرمان، شیشە، تەماشا..."
                  autoFocus
                />
              </div>

              {/* Color Palette Gradient Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">ڕەنگی کەتەگۆری</label>
                <div className="grid grid-cols-4 gap-2.5">
                  {colorPalettes.map(p => (
                    <button
                      key={p.gradient}
                      type="button"
                      onClick={() => setColor(p.gradient)}
                      className={`h-10 rounded-xl bg-gradient-to-r ${p.gradient} flex items-center justify-center transition-all ${
                        color === p.gradient ? 'ring-3 ring-offset-2 ring-fuchsia-600 scale-105 shadow-md' : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      {color === p.gradient && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs flex items-center justify-between">
                <span className="text-slate-500 font-bold">پێشبینین (Preview):</span>
                <span className={`px-3 py-1 rounded-xl text-white font-black bg-gradient-to-r ${color} shadow-xs text-xs`}>
                  {name || 'ناوی کەتەگۆری'}
                </span>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)} 
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-xs"
                >
                  پاشگەزبوونەوە
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessing} 
                  className="flex-[2] py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl font-black transition-all text-xs shadow-md shadow-fuchsia-200 disabled:opacity-50 active:scale-98"
                >
                  {isProcessing ? 'چاوەڕێبە...' : (editingId ? 'نوێکردنەوە' : 'تۆمارکردن')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Viewing Category Products Modal (Fixed z-[100]) ─── */}
      {viewingCategory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col border border-slate-100">
            
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black flex items-center gap-2 text-slate-800">
                  <Package className="w-5 h-5 text-fuchsia-600" />
                  کاڵاکانی جۆری ({viewingCategory})
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  کۆی گشتی: {categoryProducts.length} کاڵا تۆمارکراوە
                </p>
              </div>
              
              <button 
                onClick={() => setViewingCategory(null)} 
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
                    <th className="p-3">شەریکە</th>
                    <th className="p-3 text-center">مەوجوود</th>
                    <th className="p-3 text-emerald-700">نرخی فرۆشتن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {categoryProducts.length === 0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400">هیچ کاڵایەک لەم کەتەگۆرییەدا نییە</td></tr>
                  ) : (
                    categoryProducts.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900">{p.name}</td>
                        <td className="p-3 text-slate-500 font-medium">{p.company || '-'}</td>
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
                onClick={() => setViewingCategory(null)} 
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
