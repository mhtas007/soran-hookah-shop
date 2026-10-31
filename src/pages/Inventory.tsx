import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  PackageSearch,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  PackagePlus,
  Plus,
  Minus,
  Search,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Sparkles,
  Layers,
  Package,
  X,
  Printer,
  FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { logActivity } from '../lib/activityLogger';
import type { Product } from '../types';
import { useAppStore } from '../store/useAppStore';

export const Inventory: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'inventory' | 'expiries'>('inventory');
  const [activeSection, setActiveSection] = useState<'General' | 'V'>('General');
  
  // A4 Audit Modal State
  const [showAuditModal, setShowAuditModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expired' | 'month1' | 'month3' | 'safe'>('all');
  
  // Adjust Stock Modal
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockOperation, setStockOperation] = useState<'add' | 'reduce'>('add');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockAmount, setStockAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const currentUser = useAppStore(state => state.currentUser);
  const isCashier = currentUser?.role === 'Cashier';

  const settings = useAppStore(state => state.settings);
  const usdRate = settings?.usdRate || 150000;

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const { data, error } = await fetchAllRows<any>(() => supabase
        .from('products')
        .select('*')
        .order('stock_level', { ascending: true }));
        
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
        currency: p.currency || 'IQD',
        costCurrency: p.cost_currency || 'IQD',
        expiryDate: p.expiry_date || '',
        createdAt: p.created_at,
        updatedAt: p.updated_at
      })) as Product[];
      
      setProducts(formattedProducts);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !stockAmount) return;

    setIsProcessing(true);
    try {
      const isWeight = (selectedProduct.barcode || '').startsWith('WGT-');
      const isMeter = (selectedProduct.barcode || '').startsWith('MTR-');

      const amount = isWeight 
        ? Math.round(parseFloat(stockAmount) * 1000) 
        : isMeter 
        ? Math.round(parseFloat(stockAmount) * 100) 
        : parseInt(stockAmount);
      
      let newStock = selectedProduct.stockLevel;
      if (stockOperation === 'add') {
        newStock += amount;
      } else {
        newStock = Math.max(0, newStock - amount);
      }
      
      const { error } = await supabase
        .from('products')
        .update({ stock_level: newStock })
        .eq('id', selectedProduct.id);
        
      if (error) throw error;
      
      await logActivity(
        'STOCK_ADJUSTED',
        `${stockOperation === 'add' ? 'زیادکردن' : 'کەمکردن'}: ${stockAmount} بۆ کاڵای ${selectedProduct.name}`,
        { productId: selectedProduct.id, productName: selectedProduct.name, operation: stockOperation, amount, oldStock: selectedProduct.stockLevel, newStock }
      );
      
      alert(stockOperation === 'add' ? 'بڕی کاڵا بە سەرکەوتوویی زیاد کرا!' : 'بڕی کاڵا بە سەرکەوتوویی کەم کرا!');
      setShowStockModal(false);
      setStockAmount('');
      setSelectedProduct(null);
      fetchInventory();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter products by section
  const sectionProducts = products.filter(p => p.section === activeSection);

  // Financial calculations
  const totalCost = sectionProducts.reduce((sum, p) => {
    const isWgt = (p.barcode || '').startsWith('WGT-');
    const isMtr = (p.barcode || '').startsWith('MTR-');
    const qty = isWgt ? (p.stockLevel / 1000) : isMtr ? (p.stockLevel / 100) : p.stockLevel;
    const exchange = (p.costCurrency || 'IQD') === 'USD' ? (usdRate / 100) : 1;
    return sum + ((p.costPrice || 0) * exchange * qty);
  }, 0);

  const totalSellingValue = sectionProducts.reduce((sum, p) => {
    const isWgt = (p.barcode || '').startsWith('WGT-');
    const isMtr = (p.barcode || '').startsWith('MTR-');
    const qty = isWgt ? (p.stockLevel / 1000) : isMtr ? (p.stockLevel / 100) : p.stockLevel;
    const exchange = (p.currency || 'IQD') === 'USD' ? (usdRate / 100) : 1;
    return sum + ((p.sellingPrice || 0) * exchange * qty);
  }, 0);

  const expectedProfit = totalSellingValue - totalCost;
  const totalStockCount = sectionProducts.reduce((sum, p) => sum + (p.stockLevel || 0), 0);
  const totalCostValueIQD = totalCost;
  const totalCostValueUSD = usdRate > 0 ? (totalCost / (usdRate / 100)) : 0;

  // Low stock products
  const lowStockProducts = sectionProducts.filter(p => (p.stockLevel || 0) <= (p.minStockAlert || 5));

  // Expiry Calculations & Filtering (strictly items that have an expiryDate or are in Darman)
  const getExpiryDetails = (p: Product) => {
    if (!p.expiryDate) return null;
    const exp = new Date(p.expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    const isWgt = (p.barcode || '').startsWith('WGT-');
    const isMtr = (p.barcode || '').startsWith('MTR-');
    const qty = isWgt ? (p.stockLevel / 1000) : isMtr ? (p.stockLevel / 100) : p.stockLevel;
    const exchange = (p.costCurrency || 'IQD') === 'USD' ? (usdRate / 100) : 1;
    const costTotal = (p.costPrice || 0) * exchange * qty;

    if (diffDays < 0) {
      return { status: 'expired', days: diffDays, costTotal, label: `بەسەرچووە (${Math.abs(diffDays)} ڕۆژ لەمەوبەر)`, color: 'bg-rose-100 text-rose-800 border-rose-300' };
    } else if (diffDays <= 30) {
      return { status: 'month1', days: diffDays, costTotal, label: `مەترسیدارە (${diffDays} ڕۆژ ماوە)`, color: 'bg-rose-50 text-rose-700 border-rose-200' };
    } else if (diffDays <= 90) {
      return { status: 'month3', days: diffDays, costTotal, label: `نزیکە (${diffDays} ڕۆژ ماوە)`, color: 'bg-amber-100 text-amber-800 border-amber-300' };
    } else {
      return { status: 'safe', days: diffDays, costTotal, label: `${Math.round(diffDays / 30)} مانگ ماوە`, color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
  };

  const expiryProducts = sectionProducts
    .map(p => ({ ...p, expiryInfo: getExpiryDetails(p) }))
    .filter(p => p.expiryInfo !== null);

  const expiredCount = expiryProducts.filter(p => p.expiryInfo?.status === 'expired').length;
  const expiredLossIQD = expiryProducts.filter(p => p.expiryInfo?.status === 'expired').reduce((sum, p) => sum + (p.expiryInfo?.costTotal || 0), 0);
  
  const nearExpiryCount = expiryProducts.filter(p => p.expiryInfo?.status === 'month1' || p.expiryInfo?.status === 'month3').length;
  const nearExpiryValueIQD = expiryProducts.filter(p => p.expiryInfo?.status === 'month1' || p.expiryInfo?.status === 'month3').reduce((sum, p) => sum + (p.expiryInfo?.costTotal || 0), 0);
  
  const safeCount = expiryProducts.filter(p => p.expiryInfo?.status === 'safe').length;

  const categories = ['all', ...Array.from(new Set(sectionProducts.map(p => p.category).filter(Boolean)))];
  const companies = ['all', ...Array.from(new Set(sectionProducts.filter(p => p.company).map(p => p.company!)))];

  // Filtered list for main inventory
  const filteredProducts = sectionProducts.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesCompany = selectedCompany === 'all' || p.company === selectedCompany;
    return matchesSearch && matchesCategory && matchesCompany;
  });

  // Filtered list for expiries tab
  const filteredExpiryProducts = expiryProducts.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    
    let matchesFilter = true;
    if (expiryFilter === 'expired') matchesFilter = p.expiryInfo?.status === 'expired';
    else if (expiryFilter === 'month1') matchesFilter = p.expiryInfo?.status === 'month1';
    else if (expiryFilter === 'month3') matchesFilter = p.expiryInfo?.status === 'month1' || p.expiryInfo?.status === 'month3';
    else if (expiryFilter === 'safe') matchesFilter = p.expiryInfo?.status === 'safe';

    return matchesSearch && matchesCategory && matchesFilter;
  });

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
            <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center text-white shadow-md shadow-teal-200">
              <PackageSearch className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight">
                کۆگا و ئیکسپایەر (Inventory)
              </h1>
              <p className="text-xs text-slate-400 font-medium">سۆران هۆکە شۆپ</p>
            </div>
          </div>
        </div>

        {/* Actions & Navigation Tabs */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAuditModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/20 active:scale-95"
            title="جەردی گشتی کۆگا بە قەبارەی فەرمی A4"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">جەردی کۆگا (A4 PDF)</span>
            <span className="sm:hidden">جەرد</span>
          </button>

          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
            <button 
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-2 ${
                activeTab === 'inventory' 
                  ? 'bg-white text-teal-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              کۆگا
            </button>
            
            <button 
              onClick={() => setActiveTab('expiries')}
              className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-2 relative ${
                activeTab === 'expiries' 
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              ئیکسپایەر
              {(expiredCount > 0 || nearExpiryCount > 0) && (
                <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                  activeTab === 'expiries' ? 'bg-white text-rose-600' : 'bg-rose-500 text-white'
                }`}>
                  {expiredCount + nearExpiryCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* ─── Section Tabs (General / V) ─── */}
        <div className="flex gap-3 bg-slate-200/70 p-1.5 rounded-2xl">
          <button 
            onClick={() => setActiveSection('General')}
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
            onClick={() => setActiveSection('V')}
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

        {/* ═══════════════════════════════════════════════════════════════
            TAB 1: MAIN INVENTORY
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'inventory' && (
          <>
            {/* Financial Overview Metrics Cards */}
            <div className={`grid grid-cols-1 ${isCashier ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
              {!isCashier && (
                <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80">
                  <div className="flex items-center gap-2.5 mb-1.5 text-slate-500 text-xs font-bold">
                    <DollarSign className="w-4 h-4 text-blue-500" />
                    <h3>کۆی گشتی تێچووی کۆگا</h3>
                  </div>
                  <p className="text-2xl font-black text-slate-900 font-mono" dir="ltr">
                    {totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-xs text-slate-400 font-kurdish font-normal">IQD</span>
                  </p>
                </div>
              )}
              
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80">
                <div className="flex items-center gap-2.5 mb-1.5 text-slate-500 text-xs font-bold">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <h3>کۆی گشتی نرخی فرۆشتن</h3>
                </div>
                <p className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">
                  {totalSellingValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-xs text-slate-400 font-kurdish font-normal">IQD</span>
                </p>
              </div>
              
              {!isCashier ? (
                <div className="bg-emerald-50/70 p-5 rounded-3xl shadow-xs border border-emerald-200/80">
                  <div className="flex items-center gap-2.5 mb-1.5 text-emerald-800 text-xs font-black">
                    <PackagePlus className="w-4 h-4 text-emerald-600" />
                    <h3>قازانجی پێشبینیکراوی کۆگا</h3>
                  </div>
                  <p className="text-2xl font-black text-emerald-700 font-mono" dir="ltr">
                    {expectedProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-xs opacity-70 font-kurdish font-normal">IQD</span>
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50/70 p-5 rounded-3xl shadow-xs border border-blue-200/80">
                  <div className="flex items-center gap-2.5 mb-1.5 text-blue-800 text-xs font-black">
                    <Package className="w-4 h-4 text-blue-600" />
                    <h3>کۆی گشتی کاڵاکانی ئەم بەشە</h3>
                  </div>
                  <p className="text-2xl font-black text-blue-700 font-mono" dir="ltr">
                    {sectionProducts.length} <span className="text-xs opacity-70 font-kurdish font-normal">کاڵا</span>
                  </p>
                </div>
              )}
            </div>

            {/* Low Stock Alert Box */}
            {lowStockProducts.length > 0 && (
              <div className="bg-rose-50/70 border border-rose-200 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center gap-2 text-rose-800 font-black text-sm mb-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <h2>ئاگاداری کەمبوونی کاڵا ({lowStockProducts.length} کاڵا مەوجوودیان کەمە)</h2>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-h-48 overflow-y-auto">
                  {lowStockProducts.map(p => (
                    <div key={p.id} className="bg-white p-3 rounded-2xl border border-rose-100 shadow-2xs flex justify-between items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-slate-800 truncate text-xs">{p.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{p.barcode}</p>
                      </div>
                      <div className="bg-rose-100 text-rose-700 font-black text-xs px-2.5 py-1 rounded-xl mr-2">
                        {p.stockLevel}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search & Filters */}
            <div className="bg-white p-4 rounded-3xl shadow-xs border border-slate-200/80 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="گەڕان بەپێی ناو یان بارکۆد لە کۆگا..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="min-w-[180px]">
                <select 
                  value={selectedCategory} 
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-teal-500 outline-none bg-slate-50 text-xs font-bold text-slate-700"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c === 'all' ? 'هەموو کەتەگۆرییەکان' : c}</option>
                  ))}
                </select>
              </div>

              <div className="min-w-[180px]">
                <select 
                  value={selectedCompany} 
                  onChange={e => setSelectedCompany(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-teal-500 outline-none bg-slate-50 text-xs font-bold text-slate-700"
                >
                  <option value="all">هەموو کۆمپانیاکان</option>
                  {companies.filter(c => c !== 'all').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Main Inventory Table */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs md:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">ناوی کاڵا</th>
                      <th className="p-3.5">جۆر</th>
                      <th className="p-3.5">کۆمپانیا</th>
                      {!isCashier && <th className="p-3.5 text-blue-700">تێچوو</th>}
                      <th className="p-3.5 text-emerald-700">فرۆشتن</th>
                      <th className="p-3.5 text-center">مەوجوودی کۆگا</th>
                      <th className="p-3.5">بارکۆد</th>
                      <th className="p-3.5 text-center w-36">دەستکاری ستۆک</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {loading ? (
                      <tr><td colSpan={isCashier ? 8 : 9} className="p-8 text-center text-slate-500">بەدوای زانیاریدا دەگەڕێت...</td></tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr><td colSpan={isCashier ? 8 : 9} className="p-10 text-center text-slate-400">هیچ کاڵایەک نەدۆزرایەوە</td></tr>
                    ) : (
                      filteredProducts.map((p, index) => {
                        const isWeight = (p.barcode || '').startsWith('WGT-');
                        const isMeter = (p.barcode || '').startsWith('MTR-');
                        const isLowStock = (p.stockLevel || 0) <= (p.minStockAlert || 5);
                        
                        return (
                          <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${isLowStock ? 'bg-rose-50/20' : ''}`}>
                            <td className="p-3.5 text-slate-400 font-mono text-center">{index + 1}</td>
                            <td className="p-3.5 font-bold text-slate-900">{p.name}</td>
                            <td className="p-3.5">
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-xs font-semibold">
                                {p.category}
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-500 font-medium">{p.company || '-'}</td>
                            {!isCashier && (
                              <td className="p-3.5 font-mono text-blue-700 font-bold" dir="ltr">
                                {p.costPrice?.toLocaleString('en-US')} {p.costCurrency === 'USD' ? '$' : 'IQD'}
                              </td>
                            )}
                            <td className="p-3.5 font-mono text-emerald-700 font-bold" dir="ltr">
                              {p.sellingPrice?.toLocaleString('en-US')} {p.currency === 'USD' ? '$' : 'IQD'}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border ${
                                isLowStock 
                                  ? 'bg-rose-100 text-rose-700 border-rose-200' 
                                  : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              }`}>
                                {isWeight 
                                  ? `${((p.stockLevel || 0) / 1000).toFixed(2)} کگم` 
                                  : isMeter 
                                  ? `${((p.stockLevel || 0) / 100).toFixed(2)} م` 
                                  : `${p.stockLevel || 0} دانە`}
                              </span>
                            </td>
                            <td className="p-3.5 font-mono text-xs text-slate-500" dir="ltr">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                                {(p.barcode || '').replace('WGT-', '').replace('MTR-', '')}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => { setSelectedProduct(p); setStockOperation('add'); setShowStockModal(true); }}
                                  className="bg-teal-50 hover:bg-teal-100 text-teal-700 px-2.5 py-1 rounded-lg font-bold text-xs inline-flex items-center gap-1 transition-colors border border-teal-200 shadow-2xs"
                                  title="زیادکردنی ستۆک"
                                >
                                  <Plus className="w-3.5 h-3.5" /> زیادکردن
                                </button>
                                <button 
                                  onClick={() => { setSelectedProduct(p); setStockOperation('reduce'); setShowStockModal(true); }}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded-lg font-bold text-xs inline-flex items-center gap-1 transition-colors border border-rose-200 shadow-2xs"
                                  title="کەمکردنی ستۆک"
                                >
                                  <Minus className="w-3.5 h-3.5" /> کەمکردن
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
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 2: EXPIRIES TRACKER (ئیکسپایەرەکان)
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'expiries' && (
          <div className="space-y-6">
            
            {/* Expiry Overview Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Expired Card */}
              <div className="bg-rose-500 text-white p-5 rounded-3xl shadow-lg shadow-rose-200 flex flex-col justify-between">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold opacity-90">بەسەرچووەکان (Expired)</span>
                  <AlertCircle className="w-5 h-5 text-rose-200" />
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black font-mono">{expiredCount}</span>
                  <span className="text-xs mr-1 opacity-80">کاڵا بەسەرچووە</span>
                  {!isCashier && (
                    <p className="text-xs font-bold mt-1 text-rose-100" dir="ltr">
                      زەرەری تێچوو: ≈ {expiredLossIQD.toLocaleString()} IQD
                    </p>
                  )}
                </div>
              </div>

              {/* Less than 3 Months / Near Expiry Card */}
              <div className="bg-amber-500 text-white p-5 rounded-3xl shadow-lg shadow-amber-200 flex flex-col justify-between">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold opacity-90">کەمتر لە ٣ مانگ ماوە</span>
                  <Clock className="w-5 h-5 text-amber-200" />
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black font-mono">{nearExpiryCount}</span>
                  <span className="text-xs mr-1 opacity-80">کاڵا نزیکە</span>
                  {!isCashier && (
                    <p className="text-xs font-bold mt-1 text-amber-100" dir="ltr">
                      بڕی پارە: ≈ {nearExpiryValueIQD.toLocaleString()} IQD
                    </p>
                  )}
                </div>
              </div>

              {/* Safe / Long Term Card */}
              <div className="bg-emerald-600 text-white p-5 rounded-3xl shadow-lg shadow-emerald-200 flex flex-col justify-between">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold opacity-90">ماوەی تەواو (&gt; ٣ مانگ)</span>
                  <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black font-mono">{safeCount}</span>
                  <span className="text-xs mr-1 opacity-80">کاڵای تەندروست</span>
                  <p className="text-xs font-bold mt-1 text-emerald-100">بێ کێشەیە</p>
                </div>
              </div>

              {/* Total Tracked Items */}
              <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex flex-col justify-between">
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-xs font-bold">کۆی کاڵا تۆمارکراوەکان</span>
                  <Calendar className="w-5 h-5 text-blue-500" />
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black text-slate-800 font-mono">{expiryProducts.length}</span>
                  <span className="text-xs mr-1 text-slate-400">کاڵا لە بەشی دەرمان</span>
                  <p className="text-xs text-slate-500 mt-1 font-bold">بەرواری بەسەرچوونیان هەیە</p>
                </div>
              </div>
            </div>

            {/* Filter Buttons for Expiries */}
            <div className="bg-white p-3.5 rounded-3xl shadow-xs border border-slate-200/80 flex flex-wrap gap-2 items-center justify-between">
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => setExpiryFilter('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                    expiryFilter === 'all' 
                      ? 'bg-slate-800 text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  هەمووی ({expiryProducts.length})
                </button>

                <button 
                  onClick={() => setExpiryFilter('expired')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                    expiryFilter === 'expired' 
                      ? 'bg-rose-600 text-white shadow-xs' 
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  بەسەرچووەکان ({expiredCount})
                </button>

                <button 
                  onClick={() => setExpiryFilter('month3')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                    expiryFilter === 'month3' 
                      ? 'bg-amber-500 text-white shadow-xs' 
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  کەمتر لە ٣ مانگ ({nearExpiryCount})
                </button>

                <button 
                  onClick={() => setExpiryFilter('safe')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                    expiryFilter === 'safe' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تەندروستەکان ({safeCount})
                </button>
              </div>

              {/* Quick Search */}
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="گەڕان بەپێی ناو..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-3 pr-9 py-1.5 rounded-xl border border-slate-200 focus:border-rose-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            {/* Expiries Table */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs md:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">ناوی دەرمان</th>
                      <th className="p-3.5">کۆمپانیا</th>
                      <th className="p-3.5 text-center">مەوجوود</th>
                      {!isCashier && <th className="p-3.5 text-blue-700">تێچوو</th>}
                      <th className="p-3.5 text-center">بەرواری بەسەرچوون</th>
                      <th className="p-3.5 text-center">ماوەی بەسەرچوون</th>
                      <th className="p-3.5 text-center w-36">دەستکاری ستۆک</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {filteredExpiryProducts.length === 0 ? (
                      <tr>
                        <td colSpan={isCashier ? 7 : 8} className="p-12 text-center text-slate-400">
                          هیچ کاڵایەک نەدۆزرایەوە لەم فلتەرەدا
                        </td>
                      </tr>
                    ) : (
                      filteredExpiryProducts.map((p, index) => {
                        const isWeight = (p.barcode || '').startsWith('WGT-');
                        const isMeter = (p.barcode || '').startsWith('MTR-');
                        const expInfo = p.expiryInfo;

                        return (
                          <tr 
                            key={p.id} 
                            className={`hover:bg-slate-50 transition-colors ${
                              expInfo?.status === 'expired' 
                                ? 'bg-rose-50/40' 
                                : expInfo?.status === 'month1' 
                                ? 'bg-rose-50/20' 
                                : expInfo?.status === 'month3' 
                                ? 'bg-amber-50/30' 
                                : ''
                            }`}
                          >
                            <td className="p-3.5 text-slate-400 font-mono text-center">{index + 1}</td>
                            <td className="p-3.5 font-bold text-slate-900">{p.name}</td>
                            <td className="p-3.5 text-slate-500 font-medium">{p.company || '-'}</td>
                            
                            <td className="p-3.5 text-center">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-200">
                                {isWeight 
                                  ? `${((p.stockLevel || 0) / 1000).toFixed(2)} کگم` 
                                  : isMeter 
                                  ? `${((p.stockLevel || 0) / 100).toFixed(2)} م` 
                                  : `${p.stockLevel || 0} دانە`}
                              </span>
                            </td>

                            {!isCashier && (
                              <td className="p-3.5 font-mono text-blue-700 font-bold" dir="ltr">
                                {p.costPrice?.toLocaleString('en-US')} {p.costCurrency === 'USD' ? '$' : 'IQD'}
                              </td>
                            )}

                            {/* Date */}
                            <td className="p-3.5 text-center font-mono font-bold text-slate-700" dir="ltr">
                              {p.expiryDate}
                            </td>

                            {/* Status Pill */}
                            <td className="p-3.5 text-center">
                              {expInfo && (
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-black border ${expInfo.color}`}>
                                  {expInfo.label}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => { setSelectedProduct(p); setStockOperation('add'); setShowStockModal(true); }}
                                  className="bg-teal-50 hover:bg-teal-100 text-teal-700 px-2 py-1 rounded-lg font-bold text-xs inline-flex items-center gap-1 transition-colors border border-teal-200"
                                  title="زیادکردنی ستۆک"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => { setSelectedProduct(p); setStockOperation('reduce'); setShowStockModal(true); }}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2 py-1 rounded-lg font-bold text-xs inline-flex items-center gap-1 transition-colors border border-rose-200"
                                  title="کەمکردنی ستۆک"
                                >
                                  <Minus className="w-3.5 h-3.5" />
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
          </div>
        )}

      </main>

      {/* ─── Adjust Stock Modal (Fixed z-[100]) ─── */}
      {showStockModal && selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100">
            
            <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800">
                {stockOperation === 'add' ? 'زیادکردنی بڕی کاڵا' : 'کەمکردنی بڕی کاڵا'}
              </h2>
              <button 
                onClick={() => setShowStockModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="text-slate-600 mb-5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-xs">
              <span className="text-slate-400 block font-medium">ناوی کاڵا:</span>
              <strong className="text-slate-900 block text-sm font-bold mt-0.5">{selectedProduct.name}</strong>
              <span className="text-slate-500 block mt-1 font-bold">
                مەوجوودی ئێستا: {((selectedProduct.barcode || '').startsWith('WGT-')) ? `${(selectedProduct.stockLevel / 1000).toFixed(2)} کگم` : ((selectedProduct.barcode || '').startsWith('MTR-')) ? `${(selectedProduct.stockLevel / 100).toFixed(2)} مەتر` : `${selectedProduct.stockLevel} دانە`}
              </span>
            </div>
            
            <form onSubmit={handleStockAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  بڕی {stockOperation === 'add' ? 'هاتووی نوێ' : 'کەمکراوە'} {((selectedProduct.barcode || '').startsWith('WGT-')) ? '(بە کگم، نموونە: ١.٥)' : ((selectedProduct.barcode || '').startsWith('MTR-')) ? '(بە مەتر، نموونە: ١.٥)' : '(دانە)'}
                </label>
                <input 
                  type="number" 
                  step="any" 
                  min="0.01" 
                  required 
                  autoFocus 
                  value={stockAmount} 
                  onChange={e => setStockAmount(e.target.value)} 
                  className="w-full p-3.5 rounded-2xl border-2 border-slate-200 focus:border-teal-500 outline-none text-center text-xl font-black bg-slate-50 focus:bg-white text-slate-800" 
                  dir="ltr" 
                  placeholder="بڕ بنووسە..."
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowStockModal(false)} 
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-xs"
                >
                  پاشگەزبوونەوە
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessing} 
                  className={`flex-[2] py-3 text-white rounded-xl font-black transition-all text-xs shadow-md disabled:opacity-50 active:scale-98 ${
                    stockOperation === 'add' 
                      ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-200' 
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                  }`}
                >
                  {isProcessing ? 'خەریکە...' : (stockOperation === 'add' ? 'زیادکردنی مەوجوود' : 'کەمکردنی مەوجوود')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── INTERACTIVE A4 INVENTORY AUDIT PREVIEW MODAL (Screen View) ─── */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-start p-4 overflow-y-auto print:hidden animate-in">
          
          {/* Modal Header Control Bar */}
          <div className="sticky top-0 z-10 w-full max-w-4xl bg-slate-900 text-white px-6 py-4 rounded-2xl flex items-center justify-between shadow-2xl mb-4 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black">جەردی فەرمی کۆگا (A4 Stock Audit Preview)</h3>
                <p className="text-xs text-slate-400">کۆی کاڵاکان: {products.length} کاڵا | بەشی: {activeSection === 'General' ? 'گشتی' : 'ڤەیپ (V)'}</p>
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
                onClick={() => setShowAuditModal(false)}
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
                <span className="text-xs font-black block text-slate-900 mb-0.5">فۆرمی فەرمی جەردی کۆگا (A4)</span>
                <span className="text-[10px] text-slate-600 block font-mono" dir="ltr">بەروار: {new Date().toLocaleDateString('en-CA')}</span>
                <span className="text-[10px] text-indigo-700 font-bold block">کارمەند: {currentUser?.name || 'بەڕێوەبەر'}</span>
              </div>
            </div>

            {/* Audit Summary Box */}
            <div className="mb-6">
              <h3 className="text-sm font-black text-slate-900 border-r-4 border-teal-600 pr-2 mb-2">
                پوختەی کۆگای سەرەکی ({activeSection === 'General' ? 'بەشی گشتی' : 'بەشی V'})
              </h3>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2.5 border-l border-slate-300">کۆی جۆری کاڵاکان</th>
                    <th className="p-2.5 border-l border-slate-300">کۆی مەوجوود (پارچە)</th>
                    <th className="p-2.5 border-l border-slate-300">کاڵای بەرەو نەمان</th>
                    {!isCashier && <th className="p-2.5 bg-slate-200">کۆی بەهای تێچووی کۆگا</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono font-bold">
                  <tr>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{sectionProducts.length} کاڵا</td>
                    <td className="p-2.5 border-l border-slate-300 text-slate-900">{totalStockCount} دانە</td>
                    <td className="p-2.5 border-l border-slate-300 text-amber-700">{lowStockProducts.length} کاڵا</td>
                    {!isCashier && (
                      <td className="p-2.5 bg-slate-100 font-black text-slate-950">
                        {totalCostValueIQD.toLocaleString('en-US')} IQD (≈ ${totalCostValueUSD.toFixed(2)})
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Full Stock List Table */}
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-900 border-r-4 border-indigo-600 pr-2 mb-2">
                خشتەی جەردی کاڵاکانی مەوجوود لە کۆگا
              </h3>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-100 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                    <th className="p-2 border-l border-slate-300">بارکۆد</th>
                    <th className="p-2 border-l border-slate-300">ناوی کاڵا</th>
                    <th className="p-2 border-l border-slate-300">کۆمپانیا / بەش</th>
                    <th className="p-2 border-l border-slate-300 text-center">مەوجوود</th>
                    {!isCashier && <th className="p-2 border-l border-slate-300">تێچوو</th>}
                    <th className="p-2">نرخی فرۆشتن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sectionProducts.map((p, idx) => (
                    <tr key={p.id} className={p.stockLevel <= p.minStockAlert ? 'bg-amber-50/50' : ''}>
                      <td className="p-2 text-center font-mono border-l border-slate-300 text-slate-500">{idx + 1}</td>
                      <td className="p-2 font-mono text-[11px] border-l border-slate-300 text-slate-600" dir="ltr">{p.barcode || '-'}</td>
                      <td className="p-2 font-bold border-l border-slate-300 text-slate-900">{p.name}</td>
                      <td className="p-2 text-slate-600 border-l border-slate-300">{p.company || p.category || '-'}</td>
                      <td className="p-2 text-center font-mono font-black border-l border-slate-300">
                        <span className={p.stockLevel <= p.minStockAlert ? 'text-amber-700' : 'text-slate-900'}>
                          {p.stockLevel}
                        </span>
                      </td>
                      {!isCashier && (
                        <td className="p-2 font-mono border-l border-slate-300" dir="ltr">
                          {p.costPrice.toLocaleString()} {p.costCurrency || 'IQD'}
                        </td>
                      )}
                      <td className="p-2 font-mono font-bold text-indigo-700" dir="ltr">
                        {p.sellingPrice.toLocaleString()} IQD
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Signature & Confirmation */}
            <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center text-xs">
              <div>
                <p className="font-bold text-slate-800">لێپرسراوی جەرد: <span className="font-normal">{currentUser?.name || 'سەرپەرشتیار'}</span></p>
                <p className="text-slate-500 text-[10px] mt-1">ئەم جەردە فەرمییە و بۆ کۆنترۆڵکردنی کۆگا و مەوجوود دەرکراوە.</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 mb-8">مۆر و واژووی لێپرسراوی کۆگا</p>
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
            <span className="text-xs font-black block text-slate-900 mb-0.5">فۆرمی فەرمی جەردی کۆگا (A4)</span>
            <span className="text-[10px] text-slate-600 block font-mono" dir="ltr">بەروار: {new Date().toLocaleDateString('en-CA')}</span>
            <span className="text-[10px] text-indigo-700 font-bold block">کارمەند: {currentUser?.name || 'سەرپەرشتیار'}</span>
          </div>
        </div>

        {/* Audit Summary Box */}
        <div className="mb-6">
          <h3 className="text-sm font-black text-slate-900 border-r-4 border-teal-600 pr-2 mb-2">
            پوختەی کۆگای سەرەکی ({activeSection === 'General' ? 'بەشی گشتی' : 'بەشی V'})
          </h3>
          <table className="w-full text-right text-xs border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2.5 border-l border-slate-300">کۆی جۆری کاڵاکان</th>
                <th className="p-2.5 border-l border-slate-300">کۆی مەوجوود (پارچە)</th>
                <th className="p-2.5 border-l border-slate-300">کاڵای بەرەو نەمان</th>
                {!isCashier && <th className="p-2.5 bg-slate-200">کۆی بەهای تێچووی کۆگا</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono font-bold">
              <tr>
                <td className="p-2.5 border-l border-slate-300 text-slate-900">{sectionProducts.length} کاڵا</td>
                <td className="p-2.5 border-l border-slate-300 text-slate-900">{totalStockCount} دانە</td>
                <td className="p-2.5 border-l border-slate-300 text-amber-700">{lowStockProducts.length} کاڵا</td>
                {!isCashier && (
                  <td className="p-2.5 bg-slate-100 font-black text-slate-950">
                    {totalCostValueIQD.toLocaleString('en-US')} IQD (≈ ${totalCostValueUSD.toFixed(2)})
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Full Stock List Table */}
        <div className="mb-8">
          <h3 className="text-sm font-black text-slate-900 border-r-4 border-indigo-600 pr-2 mb-2">
            خشتەی جەردی کاڵاکانی مەوجوود لە کۆگا
          </h3>
          <table className="w-full text-right text-xs border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 border-l border-slate-300 w-10 text-center">#</th>
                <th className="p-2 border-l border-slate-300">بارکۆد</th>
                <th className="p-2 border-l border-slate-300">ناوی کاڵا</th>
                <th className="p-2 border-l border-slate-300">کۆمپانیا / بەش</th>
                <th className="p-2 border-l border-slate-300 text-center">مەوجوود</th>
                {!isCashier && <th className="p-2 border-l border-slate-300">تێچوو</th>}
                <th className="p-2">نرخی فرۆشتن</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sectionProducts.map((p, idx) => (
                <tr key={p.id} className={p.stockLevel <= p.minStockAlert ? 'bg-amber-50/50' : ''}>
                  <td className="p-2 text-center font-mono border-l border-slate-300 text-slate-500">{idx + 1}</td>
                  <td className="p-2 font-mono text-[11px] border-l border-slate-300 text-slate-600" dir="ltr">{p.barcode || '-'}</td>
                  <td className="p-2 font-bold border-l border-slate-300 text-slate-900">{p.name}</td>
                  <td className="p-2 text-slate-600 border-l border-slate-300">{p.company || p.category || '-'}</td>
                  <td className="p-2 text-center font-mono font-black border-l border-slate-300">
                    <span className={p.stockLevel <= p.minStockAlert ? 'text-amber-700' : 'text-slate-900'}>
                      {p.stockLevel}
                    </span>
                  </td>
                  {!isCashier && (
                    <td className="p-2 font-mono border-l border-slate-300" dir="ltr">
                      {p.costPrice.toLocaleString()} {p.costCurrency || 'IQD'}
                    </td>
                  )}
                  <td className="p-2 font-mono font-bold text-indigo-700" dir="ltr">
                    {p.sellingPrice.toLocaleString()} IQD
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signature & Confirmation */}
        <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center text-xs">
          <div>
            <p className="font-bold text-slate-800">لێپرسراوی جەرد: <span className="font-normal">{currentUser?.name || 'سەرپەرشتیار'}</span></p>
            <p className="text-slate-500 text-[10px] mt-1">ئەم جەردە فەرمییە و بۆ کۆنترۆڵکردنی کۆگا و مەوجوود دەرکراوە.</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-800 mb-8">مۆر و واژووی لێپرسراوی کۆگا</p>
            <p className="text-slate-400 font-mono">...........................................</p>
          </div>
        </div>

      </div>

    </div>
  );
};
