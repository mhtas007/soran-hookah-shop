import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Plus,
  Search,
  Edit2,
  Trash2,
  PackageSearch,
  Printer,
  Wand2,
  Layers,
  Package,
  X,
  Sparkles,
  Calendar,
  CheckSquare,
  Square,
  BadgeDollarSign
} from 'lucide-react';
import { BulkPriceModal } from '../components/BulkPriceModal';
import Barcode from 'react-barcode';
import type { Product } from '../types';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { logActivity } from '../lib/activityLogger';
import { useAppStore } from '../store/useAppStore';

export const Products: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const isCashier = currentUser?.role === 'Cashier';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'General' | 'V'>('General');

  // Add/Edit Product Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '', barcode: '', costPrice: '', sellingPrice: '', category: '', stockLevel: '', minStockAlert: '5', unitType: 'piece',
    section: 'General', company: '', bulkCost: '', bulkPrice: '', halfBulkCost: '', halfBulkPrice: '', bulkSize: '1', bulkBarcode: '', currency: 'IQD', costCurrency: 'IQD',
    expiryDate: ''
  });

  // Print Barcode State
  const [printProduct, setPrintProduct] = useState<Product | null>(null);

  // Bulk selection / bulk price change
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkPrice, setShowBulkPrice] = useState(false);
  const toggleSelected = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const { data } = await supabase.from('suppliers').select('name').order('name');
      if (data) setSuppliers(data);

      const { data: catData } = await supabase.from('categories').select('name').order('name');
      if (catData) setCategories(catData);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await fetchAllRows<any>(() => supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false }));
        
      if (error) throw error;
      
      const formattedProducts = (data || []).map(p => ({
        id: p.id,
        name: p.name || '',
        barcode: p.barcode || '',
        costPrice: p.cost_price || 0,
        sellingPrice: p.selling_price || 0,
        category: p.category || '',
        stockLevel: p.stock_level || 0,
        minStockAlert: p.min_stock_alert || 5,
        section: p.section || 'General',
        company: p.company || '',
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
      })) as Product[];
      
      setProducts(formattedProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to identify strictly Darman (not mixed)
  const isDarmanCategory = (cat: string) => {
    const c = (cat || '').trim();
    return c === 'دەرمان' || c.toLowerCase() === 'darman' || (c.includes('دەرمان') && !c.includes('خەلتە'));
  };

  // Helper to calculate days until expiry
  const getExpiryStatus = (dateStr?: string) => {
    if (!dateStr) return null;
    const exp = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { status: 'expired', label: 'بەسەرچووە', color: 'bg-rose-100 text-rose-700 border-rose-300', days: diffDays };
    } else if (diffDays <= 90) {
      return { status: 'warning', label: `${diffDays} ڕۆژ ماوە`, color: 'bg-amber-100 text-amber-800 border-amber-300', days: diffDays };
    } else {
      return { status: 'good', label: dateStr, color: 'bg-emerald-100 text-emerald-700 border-emerald-300', days: diffDays };
    }
  };

  // Combine categories from DB and existing products
  const productCategories = Array.from(new Set(products.map(p => (p.category || '').trim()).filter(Boolean)));
  const dbCategoryNames = categories.map(c => (typeof c === 'string' ? c : c.name || '').trim()).filter(Boolean);
  const allCategories = Array.from(new Set([...dbCategoryNames, ...productCategories])).sort();

  // Categories present in the current section
  const sectionCategories = Array.from(new Set(
    products.filter(p => p.section === activeSection).map(p => (p.category || '').trim()).filter(Boolean)
  ));

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCategory = (formData.category || '').trim();
    if (!cleanCategory) {
      alert("تکایە کەتەگۆری کاڵاکە دیاری بکە");
      return;
    }

    setIsProcessing(true);
    try {
      // If new category, also save into categories table so it persists cleanly
      if (!dbCategoryNames.includes(cleanCategory)) {
        await supabase.from('categories').insert({ name: cleanCategory, color: 'from-blue-500 to-indigo-600' });
      }

      let finalBarcode = formData.barcode.trim();
      if (formData.unitType === 'weight') {
        finalBarcode = finalBarcode.startsWith('WGT-') ? finalBarcode : `WGT-${finalBarcode}`;
      } else if (formData.unitType === 'meter') {
        finalBarcode = finalBarcode.startsWith('MTR-') ? finalBarcode : `MTR-${finalBarcode}`;
      } else {
        finalBarcode = finalBarcode.replace('WGT-', '').replace('MTR-', '');
      }
      
      const existingProduct = editingId ? products.find(p => p.id === editingId) : null;

      const payload: any = {
        name: formData.name.trim(),
        barcode: finalBarcode,
        cost_price: isCashier ? (existingProduct ? existingProduct.costPrice : 0) : (parseFloat(formData.costPrice) || 0),
        selling_price: parseFloat(formData.sellingPrice) || 0,
        category: cleanCategory,
        stock_level: formData.unitType === 'weight' 
          ? Math.round(parseFloat(formData.stockLevel) * 1000) 
          : formData.unitType === 'meter' 
          ? Math.round(parseFloat(formData.stockLevel) * 100) 
          : parseInt(formData.stockLevel) || 0,
        min_stock_alert: parseInt(formData.minStockAlert) || 5,
        section: formData.section || activeSection,
        company: (formData.company || '').trim(),
        bulk_cost: isCashier ? (existingProduct ? existingProduct.bulkCost : 0) : (parseFloat(formData.bulkCost) || 0),
        bulk_price: parseFloat(formData.bulkPrice) || 0,
        half_bulk_cost: isCashier ? (existingProduct ? (existingProduct.halfBulkCost || 0) : 0) : (parseFloat(formData.halfBulkCost) || 0),
        half_bulk_price: parseFloat(formData.halfBulkPrice) || 0,
        bulk_size: parseInt(formData.bulkSize) || 1,
        bulk_barcode: formData.bulkBarcode ? formData.bulkBarcode.trim() : null,
        currency: formData.currency || 'IQD',
        cost_currency: isCashier ? (existingProduct ? (existingProduct.costCurrency || 'IQD') : 'IQD') : (isDarmanCategory(cleanCategory) ? formData.costCurrency : 'IQD'),
        expiry_date: (isDarmanCategory(cleanCategory) && formData.expiryDate) ? formData.expiryDate : null
      };

      if (editingId) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingId);
        if (error) throw error;
        await logActivity('PRODUCT_UPDATED', `نوێکردنەوەی کاڵا: ${payload.name}`, { productId: editingId, ...payload });
        alert('کاڵاکە بە سەرکەوتوویی گۆڕدرا');
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
        await logActivity('PRODUCT_ADDED', `زیادکردنی کاڵای نوێ: ${payload.name}`, payload);
        alert('کاڵاکە بە سەرکەوتوویی زیادکرا');
      }
      
      setShowForm(false);
      setEditingId(null);
      setIsCustomCategory(false);
      setFormData({ 
        name: '', barcode: '', costPrice: '', sellingPrice: '', category: '', stockLevel: '', minStockAlert: '5', unitType: 'piece',
        section: activeSection, company: '', bulkCost: '', bulkPrice: '', halfBulkCost: '', halfBulkPrice: '', bulkSize: '1', bulkBarcode: '', currency: 'IQD', costCurrency: 'IQD',
        expiryDate: ''
      });
      fetchProducts();
      fetchSuppliers();
    } catch (error: any) {
      if (error.message?.includes('duplicate key value') || error.code === '23505') {
        alert('هەڵە: ئەم بارکۆدە پێشتر بەکارهاتووە بۆ کاڵایەکی تر. تکایە بارکۆدێکی تر بەکاربهێنە.');
      } else {
        alert('هەڵەیەک ڕوویدا: ' + error.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditClick = (product: Product) => {
    setEditingId(product.id);
    const isWeight = (product.barcode || '').startsWith('WGT-');
    const isMeter = (product.barcode || '').startsWith('MTR-');
    
    let displayBarcode = product.barcode || '';
    let displayStock = (product.stockLevel || 0).toString();
    let displayUnit = 'piece';

    if (isWeight) {
      displayBarcode = displayBarcode.replace('WGT-', '');
      displayStock = (product.stockLevel / 1000).toString();
      displayUnit = 'weight';
    } else if (isMeter) {
      displayBarcode = displayBarcode.replace('MTR-', '');
      displayStock = (product.stockLevel / 100).toString();
      displayUnit = 'meter';
    }

    const cat = (product.category || '').trim();
    setIsCustomCategory(false);

    setFormData({
      name: product.name || '',
      barcode: displayBarcode,
      costPrice: (product.costPrice || 0).toString(),
      sellingPrice: (product.sellingPrice || 0).toString(),
      category: cat,
      stockLevel: displayStock,
      minStockAlert: (product.minStockAlert || 5).toString(),
      unitType: displayUnit,
      section: product.section || activeSection,
      company: product.company || '',
      bulkCost: product.bulkCost ? product.bulkCost.toString() : '',
      bulkPrice: product.bulkPrice ? product.bulkPrice.toString() : '',
      halfBulkCost: product.halfBulkCost ? product.halfBulkCost.toString() : '',
      halfBulkPrice: product.halfBulkPrice ? product.halfBulkPrice.toString() : '',
      bulkSize: product.bulkSize ? product.bulkSize.toString() : '1',
      bulkBarcode: product.bulkBarcode || '',
      currency: product.currency || 'IQD',
      costCurrency: product.costCurrency || 'IQD',
      expiryDate: product.expiryDate || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('دڵنیایت لە سڕینەوەی ئەم کاڵایە؟')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        if (error.code === '23503' || error.message?.includes('sale_items_product_id_fkey')) {
          alert('ئەم کاڵایە پێشتر فرۆشراوە و ناکرێت بسڕدرێتەوە لەبەر ئەوەی بەستراوەتەوە بە ڕاپۆرتەکانی فرۆشتنەوە. تکایە بڕی ستۆکەکەی بکە بە سفر یان ناوەکەی بگۆڕە.');
          return;
        }
        throw error;
      }
      
      const product = products.find(p => p.id === id);
      if (product) {
        await logActivity('PRODUCT_DELETED', `سڕینەوەی کاڵا: ${product.name}`, { productId: id, productName: product.name });
      }
      
      fetchProducts();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا لە کاتی سڕینەوە: ' + error.message);
    }
  };

  const generateAutoBarcode = () => {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
    setFormData({ ...formData, barcode: `869${randomDigits}` });
  };

  const handlePrintBarcode = () => {
    window.print();
  };

  const openAddModal = (defaultCategory?: string) => {
    setEditingId(null);
    setIsCustomCategory(false);
    setFormData({ 
      name: '', barcode: '', costPrice: '', sellingPrice: '', 
      category: defaultCategory || (selectedCategory && selectedCategory !== '__ALL__' ? selectedCategory : (allCategories[0] || '')), 
      stockLevel: '', minStockAlert: '5', unitType: 'piece',
      section: activeSection, company: '', bulkCost: '', bulkPrice: '', 
      halfBulkCost: '', halfBulkPrice: '', bulkSize: '1', bulkBarcode: '', 
      currency: 'IQD', costCurrency: 'IQD',
      expiryDate: ''
    });
    setShowForm(true);
  };

  const filteredProducts = products.filter(p => {
    const matchesSection = p.section === activeSection;
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.barcode || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.category || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          ((p.company || '').toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCompany = selectedCompanyFilter === '' || p.company === selectedCompanyFilter;
    const matchesCategory = (!selectedCategory || selectedCategory === '__ALL__') ? true : p.category === selectedCategory;
    
    if (searchTerm) {
      return matchesSection && matchesSearch && matchesCompany;
    }
    
    return matchesSection && matchesSearch && matchesCompany && matchesCategory;
  });

  const allVisibleSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));
  const toggleSelectAllVisible = () =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredProducts.forEach(p => next.delete(p.id));
      else filteredProducts.forEach(p => next.add(p.id));
      return next;
    });
  const selectedProducts = products.filter(p => selectedIds.has(p.id));
  const canBulkEdit = !isCashier;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-kurdish animate-in">
      
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
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <PackageSearch className="w-6 h-6 text-blue-600" />
              بەڕێوەبردنی کاڵاکان
            </h1>
            <p className="text-xs text-slate-400">کۆی گشتی: {products.filter(p => p.section === activeSection).length} کاڵا</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canBulkEdit && (
            <button
              onClick={() => { if (!selectedCategory && !searchTerm) setSelectedCategory('__ALL__'); setSelectMode(true); }}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95"
              title="گۆڕینی نرخ بە کۆمەڵ"
            >
              <BadgeDollarSign className="w-5 h-5" />
              <span className="hidden sm:inline">گۆڕینی نرخ بە کۆمەڵ</span>
              <span className="sm:hidden">نرخ</span>
            </button>
          )}
          <button 
            onClick={() => openAddModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-sm active:scale-95 shadow-blue-200"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">زیادکردنی کاڵای نوێ</span>
            <span className="sm:hidden">نوێ</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        
        {/* ─── Section Tabs ─── */}
        <div className="flex gap-3 mb-6 bg-slate-200/70 p-1.5 rounded-2xl">
          <button 
            onClick={() => {
              setActiveSection('General');
              setSelectedCategory(null);
            }}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeSection === 'General' 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-black' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-5 h-5" />
            بەشی گشتی
          </button>
          
          <button 
            onClick={() => {
              setActiveSection('V');
              setSelectedCategory(null);
            }}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeSection === 'V' 
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20 font-black' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            بەشی V (Vape)
          </button>
        </div>

        {/* ─── Search & Filters ─── */}
        <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="گەڕان بەپێی ناوی کاڵا، بارکۆد، جۆر..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all bg-slate-50 focus:bg-white text-sm"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-1">
            <select
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white text-sm font-medium text-slate-700"
            >
              <option value="">هەموو کۆمپانیاکان</option>
              {suppliers.map(sup => (
                <option key={sup.name} value={sup.name}>{sup.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Products Display Area ─── */}
        {!searchTerm && !selectedCategory ? (
          
          /* Categories Box View */
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                جۆرەکانی کاڵا لە {activeSection === 'General' ? 'بەشی گشتی' : 'بەشی V'} ({sectionCategories.length})
              </h2>
              
              {/* Show All Products shortcut */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
              {canBulkEdit && (
                <button
                  onClick={() => { setSelectedCategory('__ALL__'); setSelectMode(true); }}
                  className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200 transition-all flex items-center gap-1"
                >
                  <BadgeDollarSign className="w-3.5 h-3.5" />
                  گۆڕینی نرخ بە کۆمەڵ
                </button>
              )}
              <button 
                onClick={() => setSelectedCategory('__ALL__')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all flex items-center gap-1 shadow-2xs"
              >
                <Package className="w-3.5 h-3.5" />
                پیشاندانی هەموو کاڵاکانی ئەم بەشە
              </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {sectionCategories.map((catName, idx) => {
                const count = products.filter(p => p.category === catName && p.section === activeSection).length;
                
                const gradients = [
                  { from: 'from-blue-500', to: 'to-indigo-600', border: 'hover:border-blue-300' },
                  { from: 'from-emerald-400', to: 'to-teal-600', border: 'hover:border-emerald-300' },
                  { from: 'from-purple-500', to: 'to-indigo-600', border: 'hover:border-purple-300' },
                  { from: 'from-amber-400', to: 'to-orange-600', border: 'hover:border-amber-300' },
                  { from: 'from-rose-400', to: 'to-pink-600', border: 'hover:border-rose-300' },
                  { from: 'from-cyan-400', to: 'to-blue-600', border: 'hover:border-cyan-300' },
                ];
                const gradient = gradients[idx % gradients.length];
                
                return (
                  <button
                    key={catName}
                    onClick={() => setSelectedCategory(catName)}
                    className={`bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 ${gradient.border} hover:shadow-lg hover:-translate-y-1 transition-all group text-right relative overflow-hidden h-32 flex flex-col justify-between active:scale-95`}
                  >
                    <div className={`absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l ${gradient.from} ${gradient.to}`}></div>
                    
                    <div className="flex justify-between items-center w-full">
                      <span className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center font-black text-xs text-slate-400 group-hover:text-blue-600">
                        {idx + 1}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full group-hover:bg-blue-50 group-hover:text-blue-600">
                        {count} کاڵا
                      </span>
                    </div>

                    <div>
                      <h3 className="font-black text-slate-800 text-sm md:text-base group-hover:text-blue-600 transition-colors line-clamp-1">
                        {catName}
                      </h3>
                    </div>
                  </button>
                );
              })}
            </div>

            {sectionCategories.length === 0 && (
              <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-700 text-base">هیچ کاڵایەک نەدۆزرایەوە لەم بەشەدا</h3>
                <button 
                  onClick={() => openAddModal()}
                  className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  زیادکردنی یەکەم کاڵا
                </button>
              </div>
            )}
          </div>
        ) : (
          
          /* Products Table View */
          <div>
            <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-2xl shadow-xs border border-slate-200/80">
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  {selectedCategory === '__ALL__' ? 'هەموو کاڵاکانی ئەم بەشە' : `جۆری کاڵا: ${selectedCategory || searchTerm}`}
                  <span className="text-xs font-bold text-slate-400">({filteredProducts.length} کاڵا)</span>
                </h2>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {canBulkEdit && (
                  <button
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1 ${
                      selectMode
                        ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                        : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {selectMode ? 'تەواو' : 'هەڵبژاردن و گۆڕینی نرخ'}
                  </button>
                )}
                <button 
                  onClick={() => openAddModal(selectedCategory !== '__ALL__' ? selectedCategory! : undefined)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all flex items-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  کالای نوێ لەم جۆرە
                </button>

                <button 
                  onClick={() => {
                    setSelectedCategory(null);
                    setSearchTerm('');
                  }}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl border border-slate-200 transition-all flex items-center gap-1"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  گەڕانەوە بۆ هەموو جۆرەکان
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs md:text-sm [&_td]:whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      {selectMode && (
                        <th className="p-3.5 text-center w-12">
                          <button onClick={toggleSelectAllVisible} className="text-indigo-600" title="هەڵبژاردنی هەموو" aria-label="هەڵبژاردنی هەموو">
                            {allVisibleSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-400" />}
                          </button>
                        </th>
                      )}
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">ناوی کاڵا</th>
                      <th className="p-3.5">جۆر (کەتەگۆری)</th>
                      <th className="p-3.5">شەریکە</th>
                      <th className="p-3.5 text-center">مەوجوود</th>
                      <th className="p-3.5 text-center">ئیکسپایەر</th>
                      {!isCashier && <th className="p-3.5 text-blue-700">تێچووی دانە</th>}
                      <th className="p-3.5 text-emerald-700">فرۆشتنی دانە</th>
                      {!isCashier && <th className="p-3.5 text-purple-700">تێچووی کۆ</th>}
                      <th className="p-3.5 text-purple-700">فرۆشتنی کۆ</th>
                      {!isCashier && <th className="p-3.5 text-emerald-700">قازانج (دانە)</th>}
                      <th className="p-3.5">بارکۆد</th>
                      <th className="p-3.5 text-center w-28">کردارەکان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {loading ? (
                      <tr><td colSpan={14} className="p-8 text-center text-slate-500">بەدوای زانیاریدا دەگەڕێت...</td></tr>
                    ) : filteredProducts.length > 0 ? (
                      filteredProducts.map((product, index) => {
                        const isWeight = (product.barcode || '').startsWith('WGT-');
                        const isMeter = (product.barcode || '').startsWith('MTR-');
                        const isLowStock = product.stockLevel <= product.minStockAlert;
                        const isOutOfStock = product.stockLevel <= 0;
                        const expInfo = getExpiryStatus(product.expiryDate);

                        return (
                          <tr 
                            key={product.id} 
                            onClick={() => (selectMode ? toggleSelected(product.id) : handleEditClick(product))}
                            className={`transition-colors cursor-pointer group ${
                              selectMode && selectedIds.has(product.id) ? 'bg-indigo-50/70 hover:bg-indigo-50' : 'hover:bg-blue-50/40'
                            }`}
                          >
                            {selectMode && (
                              <td className="p-3.5 text-center">
                                {selectedIds.has(product.id)
                                  ? <CheckSquare className="w-5 h-5 text-indigo-600 inline" />
                                  : <Square className="w-5 h-5 text-slate-300 inline" />}
                              </td>
                            )}
                            <td className="p-3.5 text-slate-400 font-mono text-center">{index + 1}</td>
                            <td className="p-3.5 font-bold text-slate-900 group-hover:text-blue-600 transition-colors !whitespace-normal min-w-[9rem]">
                              {product.name}
                            </td>
                            <td className="p-3.5">
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-xs font-semibold">
                                {product.category}
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-500 font-medium">
                              {product.company || '-'}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                                isOutOfStock 
                                  ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                  : isLowStock 
                                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {isWeight 
                                  ? `${(product.stockLevel / 1000).toFixed(2)} کگم` 
                                  : isMeter 
                                  ? `${(product.stockLevel / 100).toFixed(2)} م` 
                                  : `${product.stockLevel} دانە`}
                              </span>
                            </td>

                            {/* Expiry Date Column */}
                            <td className="p-3.5 text-center">
                              {expInfo ? (
                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black border font-mono ${expInfo.color}`}>
                                  {expInfo.label}
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs">-</span>
                              )}
                            </td>

                            {/* Cost Price */}
                            {!isCashier && (
                              <td className="p-3.5 font-bold text-blue-700 font-mono" dir="ltr">
                                {product.costCurrency === 'USD' ? '$' : ''}{product.costPrice.toLocaleString('en-US')} {product.costCurrency === 'USD' ? '' : 'IQD'}
                              </td>
                            )}

                            {/* Selling Price */}
                            <td className="p-3.5 font-bold text-emerald-700 font-mono" dir="ltr">
                              {product.currency === 'USD' ? '$' : ''}{product.sellingPrice.toLocaleString('en-US')} {product.currency === 'USD' ? '' : 'IQD'}
                            </td>

                            {/* Bulk Cost */}
                            {!isCashier && (
                              <td className="p-3.5 font-medium text-purple-700 font-mono" dir="ltr">
                                {product.bulkCost ? `${product.costCurrency === 'USD' ? '$' : ''}${product.bulkCost.toLocaleString('en-US')}` : '-'}
                              </td>
                            )}

                            {/* Bulk Price */}
                            <td className="p-3.5 font-medium text-purple-700 font-mono" dir="ltr">
                              {product.bulkPrice ? `${product.currency === 'USD' ? '$' : ''}${product.bulkPrice.toLocaleString('en-US')}` : '-'}
                            </td>

                            {/* Profit */}
                            {!isCashier && (
                              <td className="p-3.5 font-black text-emerald-600 font-mono" dir="ltr">
                                {(product.sellingPrice - product.costPrice).toLocaleString('en-US')}
                              </td>
                            )}

                            {/* Barcode */}
                            <td className="p-3.5 font-mono text-xs text-slate-500" dir="ltr">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                                {(product.barcode || '').startsWith('WGT-') 
                                  ? product.barcode.replace('WGT-', '') 
                                  : (product.barcode || '').startsWith('MTR-') 
                                  ? product.barcode.replace('MTR-', '') 
                                  : product.barcode}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="p-3.5 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-center items-center gap-1">
                                <button 
                                  onClick={() => setPrintProduct(product)} 
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" 
                                  title="چاپکردنی بارکۆد"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleEditClick(product)} 
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                  title="دەستکاریکردن"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDelete(product.id)} 
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                                  title="سڕینەوە"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan={14} className="p-12 text-center text-slate-400">هیچ کاڵایەک نەدۆزرایەوە بەم مەرجانە</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── Add/Edit Product Modal (Fixed z-[100]) ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100">
            
            <div className="flex justify-between items-center pb-4 mb-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Plus className="w-6 h-6 text-blue-600" />
                {editingId ? 'دەستکاریکردنی کاڵا' : 'تۆمارکردنی کاڵای نوێ'}
              </h2>
              <button 
                onClick={() => setShowForm(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-6">
              
              {/* Section Toggle inside Modal */}
              <div className="flex gap-3 p-1.5 bg-slate-100 rounded-2xl">
                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, section: 'General'})} 
                  className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${
                    formData.section === 'General' 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  بەشی گشتی
                </button>
                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, section: 'V'})} 
                  className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${
                    formData.section === 'V' 
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  بەشی V
                </button>
              </div>

              {/* Main Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی کاڵا *</label>
                  <input 
                    required 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none text-sm font-bold" 
                    placeholder="نموونە: شیشەی ڕەش..."
                  />
                </div>

                {/* Category Selection with All Categories + Custom Input option */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">جۆر (کەتەگۆری) *</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomCategory(!isCustomCategory)}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      {isCustomCategory ? 'هەڵبژاردن لە لیست' : '+ نووسینی جۆری نوێ'}
                    </button>
                  </div>

                  {isCustomCategory ? (
                    <input 
                      required 
                      type="text" 
                      value={formData.category} 
                      onChange={e => setFormData({...formData, category: e.target.value})} 
                      className="w-full p-3 rounded-xl border border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none text-sm font-bold bg-blue-50/30" 
                      placeholder="ناوی جۆری نوێ بنووسە..."
                      autoFocus
                    />
                  ) : (
                    <select 
                      required
                      value={formData.category} 
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomCategory(true);
                          setFormData({...formData, category: ''});
                        } else {
                          setFormData({...formData, category: e.target.value.trim()});
                        }
                      }} 
                      className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none text-sm font-bold bg-white"
                    >
                      <option value="">تکایە کەتەگۆرییەک هەڵبژێرە...</option>
                      {formData.category && !allCategories.includes(formData.category) && (
                        <option value={formData.category}>{formData.category}</option>
                      )}
                      {allCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__NEW__" className="text-blue-600 font-black">+ نووسینی کەتەگۆری نوێ...</option>
                    </select>
                  )}

                  {/* Quick category chips */}
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto">
                    {allCategories.slice(0, 6).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false);
                          setFormData({...formData, category: cat});
                        }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors ${
                          formData.category === cat 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">کۆمپانیا / بڕاند</label>
                  <input 
                    type="text" 
                    list="supplier-list" 
                    value={formData.company} 
                    onChange={e => setFormData({...formData, company: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none text-sm font-medium" 
                    placeholder="ئارەزوومەندانە..." 
                  />
                  <datalist id="supplier-list">
                    {suppliers.map((s, idx) => (
                      <option key={idx} value={s.name} />
                    ))}
                  </datalist>
                </div>

                {/* Barcode with Generator */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">بارکۆد *</label>
                  <div className="flex gap-2">
                    <input 
                      required 
                      type="text" 
                      value={formData.barcode} 
                      onChange={e => setFormData({...formData, barcode: e.target.value})} 
                      className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none text-left font-mono font-bold text-sm" 
                      dir="ltr" 
                      placeholder="869000000000"
                    />
                    <button 
                      type="button" 
                      onClick={generateAutoBarcode} 
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 rounded-xl flex items-center justify-center transition-colors border border-slate-200" 
                      title="دروستکردنی بارکۆدی ئۆتۆماتیکی"
                    >
                      <Wand2 className="w-5 h-5 text-blue-600" />
                    </button>
                  </div>
                </div>

                {/* Selling Unit Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">یەکەی فرۆشتن</label>
                  <select 
                    value={formData.unitType} 
                    onChange={e => setFormData({...formData, unitType: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold bg-white"
                  >
                    <option value="piece">بە دانە (Piece)</option>
                    <option value="weight">بە کێش (کیلۆ / غرام)</option>
                    <option value="meter">بە مەتر (Meter)</option>
                  </select>
                </div>

                {/* Bulk Barcode */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">بارکۆدی کۆ (کارتۆن)</label>
                  <input 
                    type="text" 
                    value={formData.bulkBarcode} 
                    onChange={e => setFormData({...formData, bulkBarcode: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-left font-mono text-sm" 
                    dir="ltr" 
                    placeholder="ئارەزوومەندانە" 
                  />
                </div>

                {/* Selling Currency */}
                <div>
                  <label className="block text-xs font-bold text-emerald-800 mb-1.5">دراوی فرۆشتن</label>
                  <select 
                    value={formData.currency} 
                    onChange={e => setFormData({...formData, currency: e.target.value})} 
                    className="w-full p-3 rounded-xl border-2 border-emerald-200 focus:border-emerald-500 bg-emerald-50/60 text-emerald-900 font-bold text-sm outline-none"
                  >
                    <option value="IQD">دیناری عێراقی (IQD)</option>
                    <option value="USD">دۆلاری ئەمریکی (USD)</option>
                  </select>
                </div>
                
                {/* STRICTLY DARMAN EXCLUSIVE: Cost Currency & Expiry Date */}
                {isDarmanCategory(formData.category) && (
                  <>
                    {!isCashier && (
                      <div>
                        <label className="block text-xs font-bold text-indigo-800 mb-1.5">دراوی تێچوو (بۆ دەرمان)</label>
                        <select 
                          value={formData.costCurrency} 
                          onChange={e => setFormData({...formData, costCurrency: e.target.value})} 
                          className="w-full p-3 rounded-xl border-2 border-indigo-200 focus:border-indigo-500 bg-indigo-50/60 text-indigo-900 font-bold text-sm outline-none"
                        >
                          <option value="IQD">دیناری عێراقی (IQD)</option>
                          <option value="USD">دۆلاری ئەمریکی (USD)</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-rose-800 mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-rose-600" />
                        بەرواری بەسەرچوون (ئیکسپایەر)
                      </label>
                      <input 
                        type="date"
                        value={formData.expiryDate} 
                        onChange={e => setFormData({...formData, expiryDate: e.target.value})} 
                        className="w-full p-2.5 rounded-xl border-2 border-rose-200 focus:border-rose-500 bg-rose-50/50 font-bold text-xs outline-none text-slate-800" 
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Unit Pricing Card */}
              <div className={`grid grid-cols-1 ${isCashier ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4 bg-blue-50/70 p-4 rounded-2xl border border-blue-200/80`}>
                <div className={isCashier ? 'md:col-span-3' : 'md:col-span-4'}>
                  <h3 className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    نرخی دانە (تەک) - بە {formData.currency}
                  </h3>
                </div>
                
                {!isCashier && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تێچووی دانە *</label>
                    <input 
                      required 
                      type="number" 
                      step="any" 
                      min="0" 
                      value={formData.costPrice} 
                      onChange={e => setFormData({...formData, costPrice: e.target.value})} 
                      className="w-full p-3 rounded-xl border border-white focus:border-blue-500 outline-none text-left font-mono font-bold text-sm bg-white" 
                      dir="ltr" 
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نرخی فرۆشتنی دانە *</label>
                  <input 
                    required 
                    type="number" 
                    step="any" 
                    min="0" 
                    value={formData.sellingPrice} 
                    onChange={e => setFormData({...formData, sellingPrice: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-white focus:border-blue-500 outline-none text-left font-mono font-black text-sm bg-white text-emerald-700" 
                    dir="ltr" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    مەوجوود ({formData.unitType === 'weight' ? 'کیلۆ' : formData.unitType === 'meter' ? 'مەتر' : 'دانە'}) *
                  </label>
                  <input 
                    required 
                    type="number" 
                    step="any" 
                    value={formData.stockLevel} 
                    onChange={e => setFormData({...formData, stockLevel: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-white focus:border-blue-500 outline-none text-left font-mono font-bold text-sm bg-white" 
                    dir="ltr" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ئاگاداری کەمبوون (Alert)</label>
                  <input 
                    type="number" 
                    value={formData.minStockAlert} 
                    onChange={e => setFormData({...formData, minStockAlert: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-white focus:border-blue-500 outline-none text-left font-mono text-sm bg-white" 
                    dir="ltr" 
                  />
                </div>
              </div>

              {/* Bulk Pricing Card */}
              <div className={`grid grid-cols-1 ${isCashier ? 'md:grid-cols-3' : 'md:grid-cols-5'} gap-4 bg-purple-50/70 p-4 rounded-2xl border border-purple-200/80`}>
                <div className={isCashier ? 'md:col-span-3' : 'md:col-span-5'}>
                  <h3 className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                    نرخی فرۆشتنی کۆ (تەک / نیو تەک)
                  </h3>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">دانە لە کارتۆن/تەک</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={formData.bulkSize} 
                    onChange={e => setFormData({...formData, bulkSize: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-white focus:border-purple-500 outline-none text-left font-mono font-bold text-sm bg-white" 
                    dir="ltr" 
                  />
                </div>

                {!isCashier && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تێچووی کۆ (تەک)</label>
                    <input 
                      type="number" 
                      step="any" 
                      min="0" 
                      value={formData.bulkCost} 
                      onChange={e => setFormData({...formData, bulkCost: e.target.value})} 
                      className="w-full p-3 rounded-xl border border-white focus:border-purple-500 outline-none text-left font-mono text-sm bg-white" 
                      dir="ltr" 
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نرخی فرۆشتنی کۆ (تەک)</label>
                  <input 
                    type="number" 
                    step="any" 
                    min="0" 
                    value={formData.bulkPrice} 
                    onChange={e => setFormData({...formData, bulkPrice: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-white focus:border-purple-500 outline-none text-left font-mono font-black text-sm bg-white text-purple-700" 
                    dir="ltr" 
                  />
                </div>

                {!isCashier && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تێچووی نیو تەک</label>
                    <input 
                      type="number" 
                      step="any" 
                      min="0" 
                      value={formData.halfBulkCost} 
                      onChange={e => setFormData({...formData, halfBulkCost: e.target.value})} 
                      className="w-full p-3 rounded-xl border border-white focus:border-purple-500 outline-none text-left font-mono text-sm bg-white" 
                      dir="ltr" 
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نرخی فرۆشتنی نیو تەک</label>
                  <input 
                    type="number" 
                    step="any" 
                    min="0" 
                    value={formData.halfBulkPrice} 
                    onChange={e => setFormData({...formData, halfBulkPrice: e.target.value})} 
                    className="w-full p-3 rounded-xl border border-white focus:border-purple-500 outline-none text-left font-mono font-black text-sm bg-white text-purple-700" 
                    dir="ltr" 
                  />
                </div>
              </div>
              
              {/* Form Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)} 
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-colors text-sm"
                >
                  پاشگەزبوونەوە
                </button>
                
                <button 
                  type="submit" 
                  disabled={isProcessing} 
                  className={`flex-1 py-3.5 text-white rounded-2xl font-black transition-all shadow-lg text-sm disabled:opacity-50 active:scale-98 ${
                    formData.section === 'V' 
                      ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200' 
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                  }`}
                >
                  {isProcessing ? 'خەریکی تۆمارکردنە...' : (editingId ? 'خەزنکردنی دەستکارییەکان' : 'تۆمارکردنی کاڵا')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Print Barcode Modal (Fixed z-[100]) ─── */}
      {printProduct && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-sm shadow-2xl flex flex-col items-center border border-slate-100">
            <div id="print-area" className="bg-white p-4 w-full flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl mb-6 print:border-none print:m-0 print:p-0">
              <h3 className="font-bold text-base text-center mb-1 leading-tight text-slate-800">{printProduct.name}</h3>
              <p className="font-black text-lg text-emerald-700 mb-2" dir="ltr">
                {printProduct.sellingPrice.toLocaleString('en-US')} {printProduct.currency === 'USD' ? '$' : 'IQD'}
              </p>
              <div className="scale-105 origin-top">
                <Barcode value={(printProduct.barcode || '').replace('WGT-', '').replace('MTR-', '')} width={1.5} height={48} fontSize={13} margin={0} displayValue={true} />
              </div>
            </div>

            <div className="flex gap-2.5 w-full print:hidden">
              <button 
                onClick={() => setPrintProduct(null)} 
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-xs"
              >
                داخستن
              </button>
              <button 
                onClick={handlePrintBarcode} 
                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 text-xs active:scale-98"
              >
                <Printer className="w-4 h-4" /> چاپکردن
              </button>
            </div>
            
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #print-area, #print-area * { visibility: visible; }
                #print-area { position: absolute; left: 0; top: 0; width: 100%; border: none; margin: 0; padding: 0; page-break-inside: avoid; }
                @page { size: 50mm 30mm; margin: 0; }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* ─── Bulk selection action bar ─── */}
      {selectMode && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 animate-in print:hidden">
          <div className="mx-auto max-w-xl bg-slate-900 text-white rounded-2xl shadow-2xl shadow-slate-900/30 px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black whitespace-nowrap">{selectedIds.size} کاڵا</p>
              <button onClick={toggleSelectAllVisible} className="text-[11px] font-bold text-indigo-300 hover:text-white whitespace-nowrap">
                {allVisibleSelected ? 'لابردنی هەموو' : `هەڵبژاردنی هەموو (${filteredProducts.length})`}
              </button>
            </div>
            {selectedIds.size > 0 && (
              <button onClick={() => setSelectedIds(new Set())} className="hidden sm:block px-3 py-2 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/10">
                پاککردنەوە
              </button>
            )}
            <button
              onClick={() => setShowBulkPrice(true)}
              disabled={selectedIds.size === 0}
              className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-400 text-sm font-black flex items-center gap-1.5 whitespace-nowrap"
            >
              <BadgeDollarSign className="w-4 h-4" />
              گۆڕینی نرخ
            </button>
            <button onClick={exitSelectMode} className="p-2 rounded-xl hover:bg-white/10 text-slate-300" aria-label="داخستن">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showBulkPrice && (
        <BulkPriceModal
          products={selectedProducts}
          showCost={!isCashier}
          onClose={() => setShowBulkPrice(false)}
          onDone={() => {
            setShowBulkPrice(false);
            exitSelectMode();
            fetchProducts();
          }}
        />
      )}

    </div>
  );
};
