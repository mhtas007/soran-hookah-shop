import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Settings as SettingsIcon,
  Save,
  Database,
  Download,
  Upload,
  AlertTriangle,
  Store,
  Printer,
  Send,
  Shield,
  DollarSign,
  CheckCircle2,
  Lock,
  Clock,
  Info,
  FileText,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import type { Settings as SettingsType } from '../types';
import { testTelegramConnection } from '../lib/telegram';
import { logActivity } from '../lib/activityLogger';
import { createDatabaseBackup } from '../lib/backup';
import Barcode from 'react-barcode';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const updateStoreSettings = useAppStore(state => state.updateSettings);
  const currentUser = useAppStore(state => state.currentUser);
  
  const [activeTab, setActiveTab] = useState<'general' | 'receipt' | 'telegram' | 'security' | 'database' | 'danger'>('general');
  
  const [settings, setSettings] = useState<Partial<SettingsType>>({
    shopName: '', 
    phone: '', 
    address: '', 
    receiptFooter: '', 
    receiptHeader: '',
    logoUrl: '',
    usdRate: 150000,
    telegramBotToken: '',
    telegramChatId: '',
    autoBackupTime: useAppStore.getState().settings.autoBackupTime || '23:00',
    autoLogoutTime: useAppStore.getState().settings.autoLogoutTime || 15
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isProcessingDB, setIsProcessingDB] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Database stats for health overview
  const [dbStats, setDbStats] = useState({ products: 0, sales: 0, customers: 0, suppliers: 0 });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setSettings({
          shopName: data.shop_name || '',
          phone: data.phone || '',
          address: data.address || '',
          receiptFooter: data.receipt_footer || '',
          receiptHeader: data.receipt_header || '',
          logoUrl: data.logo_url || '',
          usdRate: Number(data.usd_rate) || 150000,
          telegramBotToken: data.telegram_bot_token || '',
          telegramChatId: data.telegram_chat_id || '',
          autoBackupTime: useAppStore.getState().settings.autoBackupTime || '23:00',
          autoLogoutTime: useAppStore.getState().settings.autoLogoutTime || 15
        });
      }

      // Fetch DB Stats
      const [prodRes, saleRes, custRes, suppRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('sales').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('suppliers').select('id', { count: 'exact', head: true })
      ]);

      setDbStats({
        products: prodRes.count || 0,
        sales: saleRes.count || 0,
        customers: custRes.count || 0,
        suppliers: suppRes.count || 0
      });

    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadLogo = async (file: File) => {
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      // First attempt upload to freeimage.host
      const formData = new FormData();
      formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
      formData.append('action', 'upload');
      formData.append('source', file);

      let publicUrl = '';
      try {
        const res = await fetch('https://freeimage.host/api/1/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data?.image?.url) {
          publicUrl = data.image.url;
        }
      } catch (uploadErr) {
        console.warn('Direct image host error, using base64 fallback:', uploadErr);
      }

      // If remote upload fails or no response, use Base64 data URL
      if (!publicUrl) {
        publicUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      setSettings(prev => ({ ...prev, logoUrl: publicUrl }));
      alert('لۆگۆ بە سەرکەوتوویی بارکرا! تکایە دوگمەی پاشەکەوتکردن دابگرە.');
    } catch (err: any) {
      alert('کێشەیەک ڕوویدا لە بارکردنی لۆگۆ: ' + err.message);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const updateData = {
        shop_name: settings.shopName,
        phone: settings.phone,
        address: settings.address,
        receipt_footer: settings.receiptFooter,
        receipt_header: settings.receiptHeader,
        logo_url: settings.logoUrl,
        usd_rate: settings.usdRate,
        telegram_bot_token: settings.telegramBotToken,
        telegram_chat_id: settings.telegramChatId
      };

      const { error } = await supabase.from('settings').upsert({ id: 1, ...updateData });
      if (error) {
        // If columns don't exist yet in Supabase, fallback to basic fields
        const basicData = {
          shop_name: settings.shopName,
          phone: settings.phone,
          address: settings.address,
          receipt_footer: settings.receiptFooter,
          usd_rate: settings.usdRate,
          telegram_bot_token: settings.telegramBotToken,
          telegram_chat_id: settings.telegramChatId
        };
        await supabase.from('settings').upsert({ id: 1, ...basicData });
      }

      updateStoreSettings({
        shopName: settings.shopName || '',
        phone: settings.phone || '',
        address: settings.address || '',
        receiptFooter: settings.receiptFooter || '',
        receiptHeader: settings.receiptHeader || '',
        logoUrl: settings.logoUrl || '',
        usdRate: settings.usdRate || 150000,
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        autoBackupTime: settings.autoBackupTime,
        autoLogoutTime: settings.autoLogoutTime
      });

      await logActivity('SETTINGS_UPDATED', 'نوێکردنەوەی ڕێکخستنەکانی سیستەم', { ...updateData });
      alert('ڕێکخستنەکان بە سەرکەوتوویی پاشەکەوت کران!');
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      alert('تکایە سەرەتا Bot Token و Chat ID بنووسە');
      return;
    }
    setIsTestingTelegram(true);
    setTelegramStatus(null);
    try {
      const res = await testTelegramConnection(settings.telegramBotToken, settings.telegramChatId);
      if (res.success) {
        setTelegramStatus({ success: true, message: 'پەیامی تاقیکاری بە سەرکەوتوویی بۆ گرووپ/کەناڵی تێلیگرام نێردرا!' });
      } else {
        setTelegramStatus({ success: false, message: res.error || 'نەتوانرا پەیامەکە بنێردرێت' });
      }
    } catch (err: any) {
      setTelegramStatus({ success: false, message: err.message });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // --- Database Operations ---
  const handleBackup = async () => {
    setIsProcessingDB(true);
    try {
      const success = await createDatabaseBackup();
      if (!success) {
        throw new Error('Backup creation failed');
      }
      await logActivity('DATABASE_BACKUP', 'وەرگرتنی باکئاپی تەواوەتی داتابەیس');
    } catch (error: any) {
      alert('کێشەیەک لە وەرگرتنی باکئاپ ڕوویدا: ' + error.message);
    } finally {
      setIsProcessingDB(false);
    }
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('ئاگاداربە! گەڕاندنەوەی باکئاپ هەموو داتاکانی ئێستای سیستەمەکە دەسڕێتەوە و داتای ناو فایلەکە جێگەی دەگرێتەوە. دڵنیایت؟')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsProcessingDB(true);
        const data = JSON.parse(event.target?.result as string);

        // 1. Validate the file BEFORE touching anything
        const known = ['suppliers', 'customers', 'products', 'expenses', 'sales', 'debt_payments', 'sale_items', 'categories'];
        if (!data || typeof data !== 'object' || !Array.isArray(data.products) || !known.some(t => Array.isArray(data[t]))) {
          throw new Error('ئەم فایلە باکئاپێکی دروستی سیستەم نییە');
        }

        // 2. Safety copy of the current data, downloaded automatically
        const safetyOk = await createDatabaseBackup();
        if (!safetyOk) throw new Error('نەتوانرا باکئاپی پاراستن لە داتای ئێستا وەربگیرێت، گەڕاندنەوە ڕاگیرا');

        // 3. Delete (stop on the first error)
        const deleteOrder = ['sale_items', 'sales', 'debt_payments', 'expenses', 'products', 'customers', 'suppliers'];
        for (const table of deleteOrder) {
          const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw new Error(`سڕینەوەی ${table}: ${error.message}`);
        }

        // 4. Insert in chunks and report any failure
        const insertOrder = ['categories', 'suppliers', 'customers', 'products', 'expenses', 'sales', 'debt_payments', 'sale_items'];
        const failures: string[] = [];
        for (const table of insertOrder) {
          const rows: any[] = Array.isArray(data[table]) ? data[table] : [];
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            const { error } = table === 'categories'
              ? await supabase.from(table).upsert(chunk, { onConflict: 'name' })
              : await supabase.from(table).insert(chunk);
            if (error) { failures.push(`${table}: ${error.message}`); break; }
          }
        }
        if (failures.length) {
          throw new Error('هەندێک خشتە نەگەڕێنرانەوە (باکئاپی پاراستن دابەزێنرا):\n' + failures.join('\n'));
        }

        await logActivity('DATABASE_RESTORE', 'گەڕاندنەوەی باکئاپی داتابەیس لە فایلەوە');
        alert('باکئاپەکە بە سەرکەوتوویی گەڕێندرایەوە!');
        fetchSettings();
      } catch (error: any) {
        alert('کێشەیەک ڕوویدا لە کاتی گەڕاندنەوەی باکئاپەکە: ' + error.message);
      } finally {
        setIsProcessingDB(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteReports = async () => {
    if (!window.confirm('ئایا دڵنیایت لە سڕینەوەی هەموو ڕاپۆرتەکان و وەصڵەکان؟ ئەم کارە پاشگەزبوونەوەی نییە!')) return;
    setIsProcessingDB(true);
    try {
      for (const t of ['sale_items', 'sales', 'expenses']) {
        const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
      }
      await logActivity('DANGER_RESET_REPORTS', 'سڕینەوەی هەموو ڕاپۆرت و فرۆشتنەکان');
      alert('ڕاپۆرتەکان بە سەرکەوتوویی سڕانەوە!');
      fetchSettings();
    } catch (e: any) { alert(e.message); } finally { setIsProcessingDB(false); }
  };

  const handleDeleteProducts = async () => {
    if (!window.confirm('ئایا دڵنیایت لە سڕینەوەی هەموو کاڵاکان؟ ئەم کارە پاشگەزبوونەوەی نییە!')) return;
    setIsProcessingDB(true);
    try {
      const { error } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw new Error(error.code === '23503' ? 'کاڵاکان بەستراونەتەوە بە فرۆشتنەکانەوە؛ سەرەتا ڕاپۆرتەکان بسڕەوە' : error.message);
      await logActivity('DANGER_RESET_PRODUCTS', 'سڕینەوەی هەموو کاڵاکان');
      alert('کاڵاکان بە سەرکەوتوویی سڕانەوە!');
      fetchSettings();
    } catch (e: any) { alert(e.message); } finally { setIsProcessingDB(false); }
  };

  const handleDeleteDebts = async () => {
    if (!window.confirm('ئایا دڵنیایت لە سڕینەوەی (سفرکردنەوەی) هەموو قەرزەکان؟ ئەم کارە پاشگەزبوونەوەی نییە!')) return;
    setIsProcessingDB(true);
    try {
      const { data: customers } = await supabase.from('customers').select('id');
      if (customers && customers.length > 0) {
        const { error } = await supabase.from('customers')
          .update({ remaining_debt: 0, total_purchases: 0, total_paid: 0 })
          .in('id', customers.map(c => c.id));
        if (error) throw error;
      }
      await supabase.from('debt_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await logActivity('DANGER_RESET_DEBTS', 'سفرکردنەوەی هەموو قەرزەکانی بازاڕ');
      alert('قەرزەکان بە سەرکەوتوویی سفر کرانەوە!');
      fetchSettings();
    } catch (e: any) { alert(e.message); } finally { setIsProcessingDB(false); }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('ئاگاداری مەترسیدار! تۆ هەموو داتاکانی سیستەمەکە دەسڕیتەوە (کاڵا، قەرز، وەصڵ، هتد). دڵنیایت؟')) return;
    if (!window.prompt('بۆ دڵنیابوونەوە، بنووسە "سڕینەوە" بۆ ئەوەی داتاکان بسڕێتەوە:')?.includes('سڕینەوە')) {
      alert('سڕینەوەکە هەڵوەشایەوە.');
      return;
    }

    setIsProcessingDB(true);
    try {
      const deleteOrder = ['sale_items', 'sales', 'debt_payments', 'expenses', 'products', 'customers', 'suppliers'];
      for (const table of deleteOrder) {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      await logActivity('DANGER_FACTORY_RESET', 'فۆرمات و پاککردنەوەی تەواوی سیستەم');
      alert('هەموو داتاکان بە یەکجاری سڕانەوە!');
      fetchSettings();
    } catch (e: any) { alert(e.message); } finally { setIsProcessingDB(false); }
  };

  const navItems = [
    { id: 'general', label: 'فرۆشگا و دراو', icon: Store, color: 'text-blue-600', activeBg: 'bg-blue-600' },
    { id: 'receipt', label: 'وەصڵ و چاپ', icon: Printer, color: 'text-teal-600', activeBg: 'bg-teal-600' },
    { id: 'telegram', label: 'تێلیگرام و ڕاپۆرت', icon: Send, color: 'text-sky-600', activeBg: 'bg-sky-600' },
    { id: 'security', label: 'سکیوریتی و کاتەکان', icon: Shield, color: 'text-indigo-600', activeBg: 'bg-indigo-600' },
    { id: 'database', label: 'باکئاپ و داتابەیس', icon: Database, color: 'text-purple-600', activeBg: 'bg-purple-600' },
    { id: 'danger', label: 'ناوچەی مەترسیدار', icon: AlertTriangle, color: 'text-rose-600', activeBg: 'bg-rose-600' },
  ];

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white shadow-md shadow-slate-200">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight">
                ڕێکخستنە گشتییەکان
              </h1>
              <p className="text-xs text-slate-400 font-medium">بەڕێوەبردنی سیستەم و فرۆشگا</p>
            </div>
          </div>
        </div>

        {/* Global Save Button */}
        <button 
          onClick={() => handleSave()}
          disabled={isSaving}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
        >
          <Save className="w-4 h-4 text-emerald-400" />
          {isSaving ? 'پاشەکەوت دەکرێت...' : 'پاشەکەوتکردنی هەمووی'}
        </button>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-6">
        
        {/* ─── Sidebar Navigation Tabs ─── */}
        <aside className="w-full md:w-64 space-y-1.5 shrink-0">
          <div className="bg-white p-2.5 rounded-3xl shadow-xs border border-slate-200/80 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all text-right ${
                    isActive 
                      ? `${item.activeBg} text-white shadow-md font-black` 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.color}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick System Summary Card */}
          <div className="bg-slate-100 p-4 rounded-3xl border border-slate-200/70 text-xs space-y-2">
            <div className="flex items-center gap-2 text-slate-700 font-bold">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>دۆخی سیستەم</span>
            </div>
            <div className="space-y-1 text-slate-500 text-[11px]">
              <p>وەشانی سیستەم: <strong className="text-slate-800 font-mono">v2.5.0 Pro</strong></p>
              <p>داتابەیس: <strong className="text-emerald-700 font-bold">پەیوەستە (Online)</strong></p>
              <p>بەرواری ئەمڕۆ: <strong className="text-slate-800 font-mono" dir="ltr">{new Date().toLocaleDateString('en-CA')}</strong></p>
            </div>
          </div>
        </aside>

        {/* ─── Tab Content Area ─── */}
        <div className="flex-1">
          {loading ? (
            <div className="bg-white p-12 rounded-3xl text-center text-slate-500 border border-slate-200/80">
              خەریکی هێنانی زانیارییەکانە...
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* ═══════════════════════════════════════════════════════════════
                  TAB 1: GENERAL & CURRENCY
              ═══════════════════════════════════════════════════════════════ */}
              {activeTab === 'general' && (
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xs border border-slate-200/80 space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                      <Store className="w-5 h-5 text-blue-600" />
                      زانیاری فرۆشگا و نرخی دراو
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">
                      زانیارییە سەرەکییەکانی دوکان و نرخی گۆڕینەوەی دۆلار بۆ دینار
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی فرۆشگا / دوکان *</label>
                      <input 
                        type="text" 
                        value={settings.shopName || ''} 
                        onChange={e => setSettings({...settings, shopName: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-xs font-bold" 
                        placeholder="سۆران هۆکە شۆپ"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">ژمارەی مۆبایل</label>
                      <input 
                        type="text" 
                        value={settings.phone || ''} 
                        onChange={e => setSettings({...settings, phone: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-left text-xs font-bold font-mono" 
                        dir="ltr"
                        placeholder="0750 000 0000"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">ناونیشانی فرۆشگا</label>
                      <input 
                        type="text" 
                        value={settings.address || ''} 
                        onChange={e => setSettings({...settings, address: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-xs font-bold" 
                        placeholder="سۆران - شەقامی سەرەکی"
                      />
                    </div>
                  </div>

                  {/* USD Exchange Rate Box */}
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                        <DollarSign className="w-5 h-5 text-emerald-600" />
                        <h3>نرخی گۆڕینەوەی ١٠٠ دۆلار ($100 USD)</h3>
                      </div>
                      <span className="bg-emerald-200/70 text-emerald-900 px-3 py-0.5 rounded-full text-xs font-mono font-black" dir="ltr">
                        $1 = {((settings.usdRate || 150000) / 100).toLocaleString()} IQD
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div>
                        <input 
                          type="number" 
                          min="1000"
                          value={settings.usdRate || 150000} 
                          onChange={e => setSettings({...settings, usdRate: parseFloat(e.target.value) || 150000})} 
                          className="w-full p-3.5 rounded-2xl border-2 border-emerald-300 focus:border-emerald-500 outline-none font-black text-2xl text-emerald-800 bg-white font-mono text-center" 
                          dir="ltr" 
                        />
                        <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                          ئەم نرخە بۆ هەموو کاڵا و کۆگاکان بەکاردێت کە بە دۆلار تێچوویان هەیە.
                        </p>
                      </div>

                      {/* Quick Rate Preset Pills */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-emerald-800 block">نرخە خێراکان:</span>
                        <div className="flex flex-wrap gap-2">
                          {[148000, 149000, 150000, 151000, 152000, 153000].map(rate => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => setSettings({...settings, usdRate: rate})}
                              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
                                settings.usdRate === rate 
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                                  : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              }`}
                              dir="ltr"
                            >
                              {rate.toLocaleString()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={() => handleSave()}
                      disabled={isSaving}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-blue-200"
                    >
                      <Save className="w-4 h-4" />
                      پاشەکەوتکردنی زانیاری فرۆشگا
                    </button>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  TAB 2: RECEIPT & PRINTING
              ═══════════════════════════════════════════════════════════════ */}
              {activeTab === 'receipt' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Receipt Controls */}
                  <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xs border border-slate-200/80 space-y-5">
                    <div className="border-b border-slate-100 pb-4">
                      <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <Printer className="w-5 h-5 text-teal-600" />
                        ڕێکخستنەکانی وەسڵی چاپکراو و لۆگۆ
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">
                        کۆنترۆڵی لۆگۆ، دەق و شێوازی ئەو وەسڵەی بۆ کڕیار چاپ دەکرێت
                      </p>
                    </div>

                    {/* Logo Upload Section */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                      <label className="block text-xs font-bold text-slate-800">لۆگۆی فرۆشگا لەسەر وەسڵ</label>
                      
                      <div className="flex items-center gap-3">
                        {settings.logoUrl ? (
                          <div className="w-16 h-16 rounded-2xl border-2 border-teal-500/40 bg-white p-1 flex items-center justify-center shrink-0 shadow-sm relative group overflow-hidden">
                            <img src={settings.logoUrl} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
                            <button
                              type="button"
                              onClick={() => setSettings({ ...settings, logoUrl: '' })}
                              className="absolute inset-0 bg-rose-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold"
                              title="سڕینەوەی لۆگۆ"
                            >
                              سڕینەوە
                            </button>
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center shrink-0 text-slate-400 text-[10px] font-bold">
                            <span>بێ لۆگۆ</span>
                          </div>
                        )}

                        <div className="flex-1 space-y-1.5">
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs active:scale-95">
                            <Upload className="w-3.5 h-3.5" />
                            {isUploadingLogo ? 'خەریکی بارکردنە...' : 'هەڵبژاردنی وێنەی لۆگۆ'}
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              disabled={isUploadingLogo}
                              onChange={e => {
                                if (e.target.files && e.target.files[0]) {
                                  handleUploadLogo(e.target.files[0]);
                                }
                              }} 
                            />
                          </label>
                          <p className="text-[10px] text-slate-400">
                            وێنەی لۆگۆی فرۆشگا بە فۆرماتی PNG یان JPG (پێشنیارکراو: قەبارەی چوارگۆشە یان بێ باکگراوند)
                          </p>
                        </div>
                      </div>

                      {/* Direct Logo URL input */}
                      <div>
                        <input 
                          type="text"
                          value={settings.logoUrl || ''}
                          onChange={e => setSettings({ ...settings, logoUrl: e.target.value })}
                          placeholder="یان لینکی ڕاستەوخۆی وێنەی لۆگۆ (URL) لێرە دابنێ..."
                          className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-xs font-mono text-left bg-white"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی سەرەوەی وەسڵ (Header)</label>
                      <input 
                        type="text" 
                        value={settings.shopName || ''} 
                        onChange={e => setSettings({...settings, shopName: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-xs font-bold" 
                        placeholder="سۆران هۆکە شۆپ"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">ژێرناوی وەسڵ / درووشم (Subtitle)</label>
                      <input 
                        type="text" 
                        value={settings.receiptHeader || ''} 
                        onChange={e => setSettings({...settings, receiptHeader: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-xs font-bold" 
                        placeholder="باشترین نێرگەلە و دەرمانی ئەسڵی"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">تێبینی و مەرجی خوارەوەی وەسڵ (Footer Note)</label>
                      <textarea 
                        rows={2}
                        value={settings.receiptFooter || ''} 
                        onChange={e => setSettings({...settings, receiptFooter: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-teal-500 outline-none text-xs font-bold resize-none" 
                        placeholder="نموونە: کاڵای فرۆشراو ناگەڕێتەوە بەبێ وەسڵ تا ٤٨ کاتژمێر. سوپاس بۆ سەردانتان."
                      />
                    </div>

                    <div className="pt-2">
                      <button 
                        onClick={() => handleSave()}
                        disabled={isSaving}
                        className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-200 active:scale-98"
                      >
                        <Save className="w-4 h-4" />
                        پاشەکەوتکردنی ڕێکخستنی وەسڵ
                      </button>
                    </div>
                  </div>

                  {/* Live Thermal Receipt Preview */}
                  <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-teal-600" />
                      پێشبینینی ڕاستەوخۆی چاپی وەسڵ (Thermal 80mm Preview)
                    </span>

                    <div className="bg-white p-6 shadow-xl rounded-2xl w-full max-w-[280px] font-mono text-xs text-center border-t-4 border-slate-900 leading-tight">
                      
                      {/* Logo in preview */}
                      {settings.logoUrl && (
                        <div className="flex justify-center mb-2">
                          <img 
                            src={settings.logoUrl} 
                            alt="Logo" 
                            className="max-h-14 max-w-[100px] object-contain rounded"
                          />
                        </div>
                      )}

                      <h3 className="font-black text-base mb-0.5 text-slate-900">{settings.shopName || 'سۆران هۆکە شۆپ'}</h3>
                      {settings.receiptHeader && <p className="text-[10px] text-slate-600 font-bold mb-1">{settings.receiptHeader}</p>}
                      {settings.address && <p className="text-[10px] text-slate-500 mb-0.5">{settings.address}</p>}
                      {settings.phone && <p className="text-[10px] text-slate-700 font-bold mb-2" dir="ltr">{settings.phone}</p>}
                      
                      <div className="border-b border-dashed border-slate-300 my-2"></div>
                      
                      <div className="flex justify-between text-[10px] text-slate-600 mb-2">
                        <span>وەسڵ: #1042</span>
                        <span dir="ltr">{new Date().toLocaleDateString('en-CA')}</span>
                      </div>
                      
                      <div className="border-b border-dashed border-slate-300 my-2"></div>
                      
                      <table className="w-full text-right text-[11px] mb-2">
                        <thead>
                          <tr className="border-b border-slate-200 font-bold text-slate-800">
                            <th className="pb-1">کاڵا</th>
                            <th className="pb-1 text-center">بڕ</th>
                            <th className="pb-1 text-left">نرخ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="py-1.5">شیشەی ئەڵمانی</td>
                            <td className="py-1.5 text-center">١</td>
                            <td className="py-1.5 text-left" dir="ltr">25,000</td>
                          </tr>
                          <tr>
                            <td className="py-1.5">دەرمانی توو</td>
                            <td className="py-1.5 text-center">٢</td>
                            <td className="py-1.5 text-left" dir="ltr">12,000</td>
                          </tr>
                        </tbody>
                      </table>
                      
                      <div className="border-b border-dashed border-slate-300 my-2"></div>
                      
                      <div className="flex justify-between font-black text-sm text-slate-900 my-2">
                        <span>کۆی گشتی:</span>
                        <span dir="ltr">37,000 IQD</span>
                      </div>
                      
                      {settings.receiptFooter && (
                        <div className="border-t border-dashed border-slate-200 pt-2 mt-2">
                          <p className="text-[10px] text-slate-600 italic">{settings.receiptFooter}</p>
                        </div>
                      )}
                      
                      <div className="mt-3 pt-2 border-t border-dotted border-slate-300 flex flex-col items-center justify-center">
                        <div className="bg-white p-1 rounded">
                          <Barcode 
                            value="REC-1042" 
                            width={1.2} 
                            height={30} 
                            fontSize={9} 
                            margin={0} 
                            displayValue={true} 
                            font="monospace"
                          />
                        </div>
                        <p className="text-[8px] text-slate-400 mt-1">بارکۆدی تایبەت بە هەر وەصڵێک بۆ گەڕاندنەوە</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  TAB 3: TELEGRAM AUTOMATION
              ═══════════════════════════════════════════════════════════════ */}
              {activeTab === 'telegram' && (
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xs border border-slate-200/80 space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                      <Send className="w-5 h-5 text-sky-500" />
                      تێلیگرام و ناردنی ئۆتۆماتیکی ڕاپۆرتی ڕۆژانە
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">
                      کاتێک لە کۆتایی ڕۆژدا کاشێر دەرچوون (Log Out) دەکات، ڕاپۆرتی قاسە و فرۆشتن دەچێتە تێلیگرام
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Telegram Bot Token *</label>
                      <input 
                        type="text" 
                        value={settings.telegramBotToken || ''} 
                        onChange={e => setSettings({...settings, telegramBotToken: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-sky-500 outline-none text-xs font-bold font-mono text-left" 
                        dir="ltr"
                        placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Telegram Chat ID *</label>
                      <input 
                        type="text" 
                        value={settings.telegramChatId || ''} 
                        onChange={e => setSettings({...settings, telegramChatId: e.target.value})} 
                        className="w-full p-3 rounded-xl border border-slate-200 focus:border-sky-500 outline-none text-xs font-bold font-mono text-left" 
                        dir="ltr"
                        placeholder="-1001234567890 یان 123456789"
                      />
                    </div>
                  </div>

                  {/* Feedback Status */}
                  {telegramStatus && (
                    <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                      telegramStatus.success 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}>
                      {telegramStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                      <span>{telegramStatus.message}</span>
                    </div>
                  )}

                  {/* How-To Guide Box */}
                  <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 text-xs space-y-1.5 text-sky-900">
                    <span className="font-black flex items-center gap-1.5 text-sky-800">
                      <Info className="w-4 h-4 text-sky-600" />
                      چۆن بۆتی تێلیگرام دروست بکەم؟
                    </span>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-sky-800/90 pr-2">
                      <li>لە تێلیگرام بچۆ بۆ <strong>@BotFather</strong> و فەرمانی <code className="bg-sky-100 px-1 py-0.5 rounded font-mono">/newbot</code> بنێرە بۆ وەرگرتنی Token.</li>
                      <li>بۆتەکە زیاد بکە بۆ ئەو گرووپەی دەتەوێت ڕاپۆرتی لێ وەربگریت و بیکە بە ئەدمین.</li>
                      <li>لە <strong>@userinfobot</strong> یان لە ڕێگەی دەرهێنانی Chat ID، ژمارەی چاتەکە لە خوارەوە دابنێ.</li>
                    </ol>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button 
                      type="button"
                      onClick={handleTestTelegram}
                      disabled={isTestingTelegram}
                      className="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {isTestingTelegram ? 'خەریکی پشکنینە...' : 'تاقیکردنەوەی ناردنی نامە'}
                    </button>

                    <button 
                      onClick={() => handleSave()}
                      disabled={isSaving}
                      className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-sky-200"
                    >
                      <Save className="w-4 h-4" />
                      پاشەکەوتکردنی ڕێکخستنی تێلیگرام
                    </button>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  TAB 4: SECURITY & TIMERS
              ═══════════════════════════════════════════════════════════════ */}
              {activeTab === 'security' && (
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xs border border-slate-200/80 space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-indigo-600" />
                      سکیوریتی، قوفڵبوون و کاتی باکئاپ
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">
                      پاراستنی سیستەم لە کاتی بەکارنەهێنان و دیاریکردنی کاتی باکئاپی ئۆتۆماتیک
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Auto Logout */}
                    <div className="bg-indigo-50/60 p-5 rounded-3xl border border-indigo-100 space-y-3">
                      <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                        <Lock className="w-4 h-4 text-indigo-600" />
                        <span>قوفڵبوونی ئۆتۆماتیک (بە خولەک)</span>
                      </div>
                      <input 
                        type="number" 
                        min="1" 
                        max="1440"
                        value={settings.autoLogoutTime || 15} 
                        onChange={e => setSettings({...settings, autoLogoutTime: parseInt(e.target.value) || 15})} 
                        className="w-full p-3.5 rounded-2xl border border-indigo-200 focus:border-indigo-500 outline-none font-black text-xl text-indigo-800 bg-white font-mono text-center" 
                        dir="ltr"
                      />
                      <p className="text-[11px] text-indigo-700">
                        ئەگەر کۆمپیوتەر بۆ ماوەی ئەمەندە خولەکە دەستی لێنەدرێت، سیستەمەکە قوفڵ دەبێت بۆ پاراستنی داتا.
                      </p>
                      
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[5, 10, 15, 30, 60].map(mins => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setSettings({...settings, autoLogoutTime: mins})}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                              settings.autoLogoutTime === mins 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                            }`}
                          >
                            {mins} خولەک
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scheduled Backup Time */}
                    <div className="bg-purple-50/60 p-5 rounded-3xl border border-purple-100 space-y-3">
                      <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                        <Clock className="w-4 h-4 text-purple-600" />
                        <span>کاتی باکئاپی ئۆتۆماتیکی ڕۆژانە</span>
                      </div>
                      <input 
                        type="time" 
                        value={settings.autoBackupTime || '23:00'} 
                        onChange={e => setSettings({...settings, autoBackupTime: e.target.value})} 
                        className="w-full p-3.5 rounded-2xl border border-purple-200 focus:border-purple-500 outline-none font-black text-xl text-purple-800 bg-white font-mono text-center" 
                        dir="ltr"
                      />
                      <p className="text-[11px] text-purple-700">
                        لە کاتی دیاریکراودا باکئاپێکی تەواوی داتابەیس بۆ کۆمپیوتەرەکەت دابەزێت.
                      </p>
                      
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {['22:00', '23:00', '00:00', '01:00'].map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setSettings({...settings, autoBackupTime: t})}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-colors ${
                              settings.autoBackupTime === t 
                                ? 'bg-purple-600 text-white border-purple-600' 
                                : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100'
                            }`}
                            dir="ltr"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>

                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={() => handleSave()}
                      disabled={isSaving}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-indigo-200"
                    >
                      <Save className="w-4 h-4" />
                      پاشەکەوتکردنی سکیوریتی
                    </button>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  TAB 5: DATABASE & BACKUP
              ═══════════════════════════════════════════════════════════════ */}
              {activeTab === 'database' && (
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xs border border-slate-200/80 space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                      <Database className="w-5 h-5 text-purple-600" />
                      باکئاپ و گەڕاندنەوەی داتاکان (Backup & Restore)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">
                      وەرگرتنی کۆپییەکی یەدەگ لە هەموو داتاکان بە شێوەی فایلی JSON پارێزراو
                    </p>
                  </div>

                  {/* Database Health Overview Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[11px] text-slate-500 font-bold block mb-1">کۆی کاڵاکان</span>
                      <strong className="text-lg font-black text-slate-800 font-mono" dir="ltr">{dbStats.products}</strong>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[11px] text-slate-500 font-bold block mb-1">کۆی وەصڵەکان</span>
                      <strong className="text-lg font-black text-slate-800 font-mono" dir="ltr">{dbStats.sales}</strong>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[11px] text-slate-500 font-bold block mb-1">کۆی کڕیاران</span>
                      <strong className="text-lg font-black text-slate-800 font-mono" dir="ltr">{dbStats.customers}</strong>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[11px] text-slate-500 font-bold block mb-1">کۆی کۆمپانیاکان</span>
                      <strong className="text-lg font-black text-slate-800 font-mono" dir="ltr">{dbStats.suppliers}</strong>
                    </div>
                  </div>

                  {/* Backup & Restore Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    
                    {/* Download Backup */}
                    <button 
                      onClick={handleBackup} 
                      disabled={isProcessingDB}
                      className="flex flex-col items-center justify-center p-6 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-3xl text-purple-800 transition-all shadow-xs active:scale-98 disabled:opacity-50"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center mb-3 shadow-md shadow-purple-200">
                        <Download className="w-6 h-6" />
                      </div>
                      <strong className="text-sm font-black mb-1">وەرگرتنی باکئاپ (Download Backup)</strong>
                      <span className="text-xs text-purple-600 text-center">
                        داگرتنی فایلێکی JSON ی تەواوی کاڵا، قەرز، و فرۆشتنەکان
                      </span>
                    </button>

                    {/* Restore Backup */}
                    <label className="flex flex-col items-center justify-center p-6 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-3xl text-slate-800 transition-all shadow-xs active:scale-98 cursor-pointer disabled:opacity-50">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center mb-3 shadow-md shadow-slate-200">
                        <Upload className="w-6 h-6" />
                      </div>
                      <strong className="text-sm font-black mb-1">گەڕاندنەوەی باکئاپ (Restore Backup)</strong>
                      <span className="text-xs text-slate-500 text-center">
                        هەڵبژاردنی فایلە باکئاپە کۆنەکە بۆ ناو سیستەم
                      </span>
                      <input type="file" accept=".json" className="hidden" onChange={handleRestore} disabled={isProcessingDB} />
                    </label>

                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  TAB 6: DANGER ZONE
              ═══════════════════════════════════════════════════════════════ */}
              {activeTab === 'danger' && (
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xs border border-rose-200 space-y-6">
                  <div className="border-b border-rose-100 pb-4">
                    <h2 className="text-lg font-black text-rose-700 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-rose-600" />
                      ناوچەی مەترسیدار و پاککردنەوەی داتاکان
                    </h2>
                    <p className="text-xs text-rose-500/90 mt-0.5 font-medium">
                      ئاگاداربە! ئەم کردارانە ناگەڕێنەوە و داتاکان بە یەکجاری دەسڕنەوە.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    
                    <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-100 flex flex-col justify-between">
                      <div>
                        <span className="font-bold text-rose-900 text-xs block mb-1">سڕینەوەی ڕاپۆرتەکان</span>
                        <p className="text-[11px] text-rose-600 mb-3">سڕینەوەی هەموو مێژووی فرۆشتن و وەصڵەکان</p>
                      </div>
                      <button 
                        onClick={handleDeleteReports} 
                        disabled={isProcessingDB} 
                        className="w-full py-2 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-colors"
                      >
                        سڕینەوەی ڕاپۆرت
                      </button>
                    </div>

                    <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-100 flex flex-col justify-between">
                      <div>
                        <span className="font-bold text-rose-900 text-xs block mb-1">سڕینەوەی کاڵاکان</span>
                        <p className="text-[11px] text-rose-600 mb-3">سڕینەوەی هەموو کاڵاکانی ناو فرۆشگا</p>
                      </div>
                      <button 
                        onClick={handleDeleteProducts} 
                        disabled={isProcessingDB} 
                        className="w-full py-2 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-colors"
                      >
                        سڕینەوەی کاڵاکان
                      </button>
                    </div>

                    <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-100 flex flex-col justify-between">
                      <div>
                        <span className="font-bold text-rose-900 text-xs block mb-1">سفرکردنەوەی قەرزەکان</span>
                        <p className="text-[11px] text-rose-600 mb-3">پاکتاوکردن و سفرکردنەوەی قەرزی هەموو کڕیاران</p>
                      </div>
                      <button 
                        onClick={handleDeleteDebts} 
                        disabled={isProcessingDB} 
                        className="w-full py-2 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-colors"
                      >
                        سفرکردنەوەی قەرز
                      </button>
                    </div>

                  </div>

                  {/* Factory Reset */}
                  <div className="bg-rose-600 text-white p-6 rounded-3xl shadow-lg shadow-rose-200 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-black">
                      <AlertTriangle className="w-5 h-5 text-white" />
                      <h3>فۆرماتی گشتی سیستەم (Factory Reset)</h3>
                    </div>
                    <p className="text-xs text-rose-100">
                      ئەم دوگمەیە هەموو کاڵا، وەصڵ، قەرز، خەرجی و زانیارییەکانی فرۆشگا دەسڕێتەوە وەک ئەوەی تازە سیستەمەکە دانرابێت.
                    </p>
                    <button 
                      onClick={handleDeleteAll} 
                      disabled={isProcessingDB} 
                      className="bg-white text-rose-700 hover:bg-rose-50 px-6 py-3 rounded-xl text-xs font-black transition-all shadow-sm active:scale-98"
                    >
                      سڕینەوەی هەموو داتاکان بە یەکجاری
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </main>
    </div>
  );
};
