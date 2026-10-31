import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Wallet,
  PackageSearch,
  Users,
  Building2,
  Receipt,
  ArrowLeftRight,
  RefreshCcw,
  Settings,
  TrendingUp,
  LogOut,
  PackagePlus,
  ScrollText,
  Lock,
  Loader2,
  Activity,
  FlaskConical,
  DollarSign,
  Layers,
  Shield,
  CheckCircle2,
  UserCheck,
  BarChart3
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { sendDailyReportToTelegram } from '../lib/telegram';
import { supabase } from '../lib/supabase';
import { canAccess } from '../lib/access';
import { logActivity } from '../lib/activityLogger';
import { staffLogout } from '../lib/staffApi';
import { startOfDay, endOfDay } from 'date-fns';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const settings = useAppStore(state => state.settings);
  const isCashier = currentUser?.role === 'Cashier';
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Quick Daily Stats
  const [todayStats, setTodayStats] = useState({
    totalSales: 0,
    salesCount: 0,
    totalProfit: 0,
    totalDebts: 0
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchDailyStats();
  }, []);

  const fetchDailyStats = async () => {
    try {
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      const [salesRes, customersRes] = await Promise.all([
        supabase.from('sales').select('total_amount, total_profit').gte('created_at', todayStart).lte('created_at', todayEnd),
        supabase.from('customers').select('remaining_debt')
      ]);

      const sales = salesRes.data || [];
      const totalSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const totalProfit = sales.reduce((sum, s) => sum + (s.total_profit || 0), 0);
      const totalDebts = (customersRes.data || []).reduce((sum, c) => sum + (c.remaining_debt || 0), 0);

      setTodayStats({
        totalSales,
        salesCount: sales.length,
        totalProfit,
        totalDebts
      });
    } catch (e) {
      console.error('Error fetching today stats:', e);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('دڵنیایت لە چوونەدەرەوە لە هەژمارەکەت؟')) return;
    setIsLoggingOut(true);
    try {
      await sendDailyReportToTelegram(settings, currentUser);
    } catch (e) {
      console.error(e);
    } finally {
      await logActivity('USER_LOGOUT', `دەرچوونی کارمەند: ${currentUser?.name || ''}`);
      await staffLogout().catch(() => {});
      useAppStore.getState().setCurrentUser(null);
    }
  };

  // Unified luxury list of all system modules
  const allModules = [
    { 
      name: 'فرۆشتن (POS)', 
      icon: ShoppingCart, 
      path: '/pos', 
      gradient: 'from-indigo-600 to-indigo-800', 
      shadow: 'shadow-indigo-500/20',
      badge: 'سەرەکی',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200'
    },
    { 
      name: 'سندوق و قاسە', 
      icon: Wallet, 
      path: '/safe', 
      gradient: 'from-emerald-500 to-emerald-700', 
      shadow: 'shadow-emerald-500/20' 
    },
    { 
      name: 'کاڵاکان', 
      icon: PackageSearch, 
      path: '/products', 
      gradient: 'from-blue-500 to-blue-700', 
      shadow: 'shadow-blue-500/20' 
    },
    { 
      name: 'جۆرەکانی کاڵا', 
      icon: Layers, 
      path: '/categories', 
      gradient: 'from-fuchsia-500 to-purple-700', 
      shadow: 'shadow-fuchsia-500/20' 
    },
    { 
      name: 'خەلتەکان', 
      icon: FlaskConical, 
      path: '/mixes', 
      gradient: 'from-pink-500 to-rose-600', 
      shadow: 'shadow-pink-500/20' 
    },
    { 
      name: 'کۆگای سەرەکی', 
      icon: PackagePlus, 
      path: '/inventory', 
      gradient: 'from-teal-500 to-teal-700', 
      shadow: 'shadow-teal-500/20' 
    },
    { 
      name: 'دەفتەری قەرزەکان', 
      icon: Users, 
      path: '/debts', 
      gradient: 'from-amber-500 to-amber-700', 
      shadow: 'shadow-amber-500/20' 
    },
    { 
      name: 'کۆمپانیاکان', 
      icon: Building2, 
      path: '/companies', 
      gradient: 'from-orange-500 to-orange-700', 
      shadow: 'shadow-orange-500/20' 
    },
    { 
      name: 'خەرجییەکان', 
      icon: Receipt, 
      path: '/expenses', 
      gradient: 'from-rose-500 to-rose-700', 
      shadow: 'shadow-rose-500/20' 
    },
    { 
      name: 'گەڕانەوەی کاڵا', 
      icon: ArrowLeftRight, 
      path: '/returns', 
      gradient: 'from-red-500 to-red-600', 
      shadow: 'shadow-red-500/20' 
    },
    { 
      name: 'گۆڕینەوەی کاڵا', 
      icon: RefreshCcw, 
      path: '/exchanges', 
      gradient: 'from-cyan-500 to-sky-700', 
      shadow: 'shadow-cyan-500/20' 
    },
    { 
      name: 'ئەرشیفی وەسڵەکان', 
      icon: ScrollText, 
      path: '/receipts', 
      gradient: 'from-pink-600 to-rose-700', 
      shadow: 'shadow-pink-500/20' 
    },
    { 
      name: 'ڕاپۆرتەکان', 
      icon: TrendingUp, 
      path: '/reports', 
      gradient: 'from-violet-600 to-purple-800', 
      shadow: 'shadow-violet-500/20' 
    },
    { 
      name: 'کاڵا فرۆشراوەکان', 
      icon: BarChart3, 
      path: '/sold-products', 
      gradient: 'from-amber-600 to-orange-700', 
      shadow: 'shadow-amber-500/20',
      adminOnly: true,
      badge: 'تایبەت بە ئەدمین',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
    },
    { 
      name: 'بەکارهێنەران', 
      icon: UserCheck, 
      path: '/users', 
      gradient: 'from-sky-600 to-blue-800', 
      shadow: 'shadow-sky-500/20',
      adminOnly: true 
    },
    { 
      name: 'تۆماری چالاکییەکان', 
      icon: Activity, 
      path: '/activity', 
      gradient: 'from-purple-600 to-indigo-800', 
      shadow: 'shadow-purple-500/20',
      adminOnly: true 
    },
    { 
      name: 'ڕێکخستنەکان', 
      icon: Settings, 
      path: '/settings', 
      gradient: 'from-slate-700 to-slate-900', 
      shadow: 'shadow-slate-500/20' 
    },
  ];

  const visibleModules = allModules.filter(m => canAccess(currentUser, m.path));

  const moduleGroups = [
    { title: 'فرۆشتن', hint: 'فرۆشتن و وەسڵ', paths: ['/pos', '/receipts', '/returns', '/exchanges'] },
    { title: 'کۆگا و کاڵا', hint: 'کاڵا، جۆر و کۆگا', paths: ['/products', '/categories', '/inventory', '/mixes', '/companies'] },
    { title: 'دارایی', hint: 'پارە، قەرز و ڕاپۆرت', paths: ['/safe', '/debts', '/expenses', '/reports', '/sold-products'] },
    { title: 'سیستەم', hint: 'بەکارهێنەر و ڕێکخستن', paths: ['/users', '/activity', '/settings'] },
  ];
  const moduleHints: Record<string, string> = {
    '/pos': 'فرۆشتنی خێرا و چاپی وەسڵ',
    '/receipts': 'بینین و چاپکردنەوەی وەسڵ',
    '/returns': 'گەڕاندنەوەی کاڵا بە وەسڵ',
    '/exchanges': 'گۆڕینەوەی کاڵا',
    '/products': 'زیادکردن و گۆڕینی نرخ',
    '/categories': 'پۆلێنکردنی کاڵاکان',
    '/inventory': 'مەوجوود و بەسەرچوون',
    '/mixes': 'ڕەچەتە و دروستکردنی خەلتە',
    '/companies': 'هاوردەکاران و قەرزیان',
    '/safe': 'پارەی ناو قاسە',
    '/debts': 'قەرزی کڕیاران',
    '/expenses': 'خەرجیی ڕۆژانە',
    '/reports': 'فرۆشتن، قازانج و شیکاری',
    '/sold-products': 'شیکاری کاڵا فرۆشراوەکان',
    '/users': 'کارمەندان و دەسەڵات',
    '/activity': 'تۆماری هەموو کردارەکان',
    '/settings': 'دوکان، تێلیگرام و باکئەپ',
  };

  return (
    <div className="min-h-screen bg-slate-50 font-kurdish animate-in select-none pb-12">
      
      {/* ─── Top Header Bar ─── */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-4 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Shop Branding */}
          <div className="flex items-center gap-3.5">
            {settings.logoUrl ? (
              <img 
                src={settings.logoUrl} 
                alt="Shop Logo" 
                className="w-12 h-12 rounded-2xl object-contain p-1 border border-slate-200 bg-white shadow-xs" 
              />
            ) : (
              <img src="/logo.svg" alt="Soran Hookah Shop" className="w-12 h-12 rounded-2xl shadow-md shadow-indigo-200" />
            )}

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  {settings.shopName || 'سۆران هۆکە شۆپ'}
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                  سیستەم چالاکە
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {settings.receiptHeader || 'نێرگەلە و پێداویستییەکانی نێرگەلە'}
              </p>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            
            {/* USD Rate Pill */}
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-2xl text-emerald-800 text-xs font-bold shadow-2xs">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>١٠٠ دۆلار:</span>
              <span className="font-mono font-black text-emerald-700" dir="ltr">{(settings.usdRate || 150000).toLocaleString()} IQD</span>
            </div>

            {/* Staff Card */}
            {currentUser && (
              <div className="flex items-center gap-2.5 bg-slate-100/90 border border-slate-200 px-3.5 py-1.5 rounded-2xl">
                <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-slate-800 block leading-tight">{currentUser.name}</span>
                  <span className="text-[10px] font-bold text-slate-400 block">
                    {currentUser.role === 'Admin' ? 'ئەدمین' : currentUser.role === 'Manager' ? 'بەڕێوەبەر' : 'کاشێر'}
                  </span>
                </div>
              </div>
            )}

            {/* Lock Screen */}
            <button 
              onClick={() => useAppStore.getState().setLocked(true)}
              title="قوفڵکردنی شاشە"
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition-all border border-slate-200 active:scale-95 shadow-2xs"
            >
              <Lock className="w-4 h-4" />
            </button>

            {/* Logout */}
            <button 
              onClick={handleLogout}
              disabled={isLoggingOut}
              title="چوونەدەرەوە لە هەژمار"
              className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl transition-all border border-rose-200 active:scale-95 disabled:opacity-50 shadow-2xs"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </button>

            {/* Clock */}
            <div className="text-left hidden lg:block border-r border-slate-200 pr-3 mr-1">
              <span className="text-xs font-mono font-bold text-slate-700 block" dir="ltr">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="text-[10px] text-slate-400 block">
                {currentTime.toLocaleDateString('ku-IQ', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>

          </div>

        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* ─── Slim Financial Summary Bar ─── */}
        <div className={`grid grid-cols-1 ${!isCashier ? 'sm:grid-cols-4' : 'sm:grid-cols-2'} gap-3`}>
          <div className="bg-white px-4 py-3 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 block leading-tight">فرۆشتنی ئەمڕۆ</span>
                <span className="text-base font-black text-indigo-700 font-mono" dir="ltr">
                  {todayStats.totalSales.toLocaleString('en-US')} <span className="text-[10px] font-kurdish font-normal text-slate-400">IQD</span>
                </span>
              </div>
            </div>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-100">
              {todayStats.salesCount} وەسڵ
            </span>
          </div>

          {!isCashier && (
            <div className="bg-white px-4 py-3 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 block leading-tight">قازانجی ئەمڕۆ</span>
                  <span className="text-base font-black text-emerald-700 font-mono" dir="ltr">
                    {todayStats.totalProfit.toLocaleString('en-US')} <span className="text-[10px] font-kurdish font-normal text-slate-400">IQD</span>
                  </span>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                پوختە
              </span>
            </div>
          )}

          <div className="bg-white px-4 py-3 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 block leading-tight">قەرزی بازاڕ</span>
                <span className="text-base font-black text-amber-700 font-mono" dir="ltr">
                  {todayStats.totalDebts.toLocaleString('en-US')} <span className="text-[10px] font-kurdish font-normal text-slate-400">IQD</span>
                </span>
              </div>
            </div>
            <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-100">
              کڕیاران
            </span>
          </div>

          {!isCashier && (
            <div className="bg-white px-4 py-3 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 block leading-tight">دۆخی سیستەم</span>
                  <span className="text-xs font-black text-slate-800 block">پارێزراو و ئامادە</span>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                کارایە
              </span>
            </div>
          )}
        </div>

        {/* ─── Modules, organised by area ─── */}
        <div className="space-y-8">
          {moduleGroups.map(group => {
            const items = visibleModules.filter(m => group.paths.includes(m.path));
            if (!items.length) return null;
            return (
              <section key={group.title}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-black text-slate-800">{group.title}</h2>
                  <span className="text-[11px] font-bold text-slate-400">{group.hint}</span>
                  <div className="flex-1 h-px bg-slate-200/80" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {items.map(module => {
                    const Icon = module.icon;
                    return (
                      <button
                        key={module.path}
                        onClick={() => navigate(module.path)}
                        className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-lg hover:shadow-slate-900/5 hover:border-indigo-200 hover:-translate-y-0.5 transition-all duration-200 text-center sm:text-right flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 group relative active:scale-[0.98]"
                      >
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${module.gradient} text-white flex items-center justify-center shadow-md ${module.shadow} shrink-0 group-hover:scale-105 transition-transform`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-black text-slate-800 group-hover:text-indigo-700 transition-colors leading-6 sm:truncate">{module.name}</h3>
                          <p className="hidden sm:block text-[11px] font-bold text-slate-400 truncate">{moduleHints[module.path] || ''}</p>
                        </div>
                        {module.badge && (
                          <span className={`absolute -top-2 left-3 text-[10px] font-black px-2 py-0.5 rounded-full border ${module.badgeColor || 'bg-slate-100 text-slate-700'}`}>
                            {module.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

      </main>

    </div>
  );
};
