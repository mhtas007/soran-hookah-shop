import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Activity,
  Search,
  User,
  ShoppingCart,
  RotateCcw,
  Package,
  PlusCircle,
  Edit3,
  Trash2,
  DollarSign,
  Receipt,
  Lock,
  Unlock,
  KeyRound,
  Settings as SettingsIcon,
  ShieldCheck,
  RefreshCw,
  Eye,
  X,
  AlertTriangle,
  Layers,
  CreditCard,
  FileText,
  UserCheck
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { staffList } from '../lib/staffApi';
import { format, formatDistanceToNow } from 'date-fns';
import { useAppStore } from '../store/useAppStore';

const FIELD_LABELS: Record<string, string> = {
  name: 'ناو', selling_price: 'نرخی فرۆشتن', cost_price: 'تێچوو', bulk_price: 'نرخی تەک', bulk_cost: 'تێچووی تەک',
  half_bulk_price: 'نرخی نیو تەک', half_bulk_cost: 'تێچووی نیو تەک', stock_level: 'مەوجوود', min_stock_alert: 'ئاگاداری کەمی',
  category: 'جۆر', company: 'کۆمپانیا', barcode: 'بارکۆد', section: 'بەش', bulk_size: 'قەبارەی تەک', expiry_date: 'بەسەرچوون',
  currency: 'دراو', phone: 'مۆبایل', amount: 'بڕ', notes: 'تێبینی', date: 'بەروار', total_amount: 'کۆی گشتی',
  total_profit: 'قازانج', discount: 'داشکاندن', payment_method: 'شێوازی پارەدان', payment_amount: 'پارەی دراو',
  quantity: 'بڕ', price: 'نرخ', cost: 'تێچوو', role: 'پلە', permissions: 'دەسەڵاتەکان', email: 'ئیمەیڵ',
  remaining_debt: 'قەرزی ماوە', total_paid: 'کۆی دراو', total_purchases: 'کۆی کڕین', shop_name: 'ناوی دوکان',
  address: 'ناونیشان', usd_rate: 'نرخی دۆلار', status: 'دۆخ', telegram_bot_token: 'تێلیگرام Token',
};

const showVal = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US');
  if (typeof v === 'boolean') return v ? 'بەڵێ' : 'نەخێر';
  if (Array.isArray(v)) return v.join('، ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

interface LogItem {
  id: string;
  user_id?: string;
  user_name: string;
  action: string;
  details: string;
  metadata?: any;
  created_at: string;
}

interface StaffUser {
  id: string;
  name: string;
  role: string;
  email?: string;
}

export const ActivityLogs: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all');

  // Metadata Inspector Modal
  const [inspectLog, setInspectLog] = useState<LogItem | null>(null);

  useEffect(() => {
    if (currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager') {
      navigate('/');
      return;
    }
    fetchLogs();
  }, [currentUser]);

  const PAGE = 500;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Refresh every 20 seconds so new actions appear by themselves
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') fetchLogs(true); }, 20000);
    return () => clearInterval(t);
  }, [autoRefresh, logs.length]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data, error } = await supabase.from('activity_logs').select('*')
        .order('created_at', { ascending: false }).range(logs.length, logs.length + PAGE - 1);
      if (error) throw error;
      const known = new Set(logs.map(l => l.id));
      setLogs(prev => [...prev, ...(data || []).filter((l: LogItem) => !known.has(l.id))]);
      setHasMore((data || []).length === PAGE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchLogs = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const size = Math.max(PAGE, logs.length);
      // Fetch both logs and staff users concurrently
      const [logsRes, usersRes] = await Promise.all([
        supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).range(0, size - 1),
        staffList().then(list => ({ data: [...list].sort((a, b) => a.name.localeCompare(b.name)) })).catch(() => ({ data: [] as any[] }))
      ]);

      if (logsRes.error && logsRes.error.code !== '42P01') {
        console.warn('Logs error:', logsRes.error);
      }
      
      setLogs(logsRes.data || []);
      setHasMore((logsRes.data || []).length === size);
      setStaffUsers(usersRes.data || []);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const getActionInfo = (action: string) => {
    const config: Record<string, { label: string; color: string; icon: any; category: string }> = {
      'USER_LOGIN': { label: 'چوونەژوورەوە', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: KeyRound, category: 'auth' },
      'USER_LOGOUT': { label: 'دەرچوون', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Lock, category: 'auth' },
      'SCREEN_LOCKED': { label: 'قوفڵکردنی شاشە', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Lock, category: 'auth' },
      'SCREEN_UNLOCKED': { label: 'کردنەوەی شاشە', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Unlock, category: 'auth' },

      'SALE_COMPLETED': { label: 'فرۆشتن', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ShoppingCart, category: 'sales' },
      'SALE_RETURNED': { label: 'گەڕانەوەی وەسڵ', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: RotateCcw, category: 'sales' },

      'PRODUCT_ADDED': { label: 'زیادکردنی کاڵا', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: PlusCircle, category: 'products' },
      'PRODUCT_UPDATED': { label: 'دەستکاری کاڵا', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Edit3, category: 'products' },
      'PRODUCT_DELETED': { label: 'سڕینەوەی کاڵا', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'products' },
      'STOCK_ADJUSTED': { label: 'دەستکاری کۆگا', color: 'bg-sky-50 text-sky-700 border-sky-200', icon: Package, category: 'products' },

      'EXPENSE_ADDED': { label: 'تۆماری خەرجی', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Receipt, category: 'finance' },
      'EXPENSE_UPDATED': { label: 'دەستکاری خەرجی', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Edit3, category: 'finance' },
      'EXPENSE_DELETED': { label: 'سڕینەوەی خەرجی', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'finance' },
      'DEBT_PAYMENT': { label: 'وەرگرتنی قەرز', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: CreditCard, category: 'finance' },
      'CUSTOMER_ADDED': { label: 'کڕیاری نوێ', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: User, category: 'finance' },
      'CUSTOMER_UPDATED': { label: 'دەستکاری کڕیار', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Edit3, category: 'finance' },
      'CUSTOMER_DELETED': { label: 'سڕینەوەی کڕیار', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'finance' },

      'SUPPLIER_ADDED': { label: 'کۆمپانیای نوێ', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: PlusCircle, category: 'products' },
      'SUPPLIER_UPDATED': { label: 'دەستکاری کۆمپانیا', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Edit3, category: 'products' },
      'SUPPLIER_DELETED': { label: 'سڕینەوەی کۆمپانیا', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'products' },
      
      'CATEGORY_ADDED': { label: 'کەتەگۆری نوێ', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Layers, category: 'products' },
      'CATEGORY_UPDATED': { label: 'دەستکاری کەتەگۆری', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Edit3, category: 'products' },
      'CATEGORY_DELETED': { label: 'سڕینەوەی کەتەگۆری', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'products' },

      'INVOICE_ADDED': { label: 'وەسڵی فیزیکی', color: 'bg-violet-50 text-violet-700 border-violet-200', icon: FileText, category: 'sales' },
      'INVOICE_UPDATED': { label: 'دەستکاری وەسڵی کاغەزی', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Edit3, category: 'sales' },
      'INVOICE_DELETED': { label: 'سڕینەوەی وەسڵی کاغەزی', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'sales' },

      'SETTINGS_UPDATED': { label: 'ڕێکخستنەکان', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: SettingsIcon, category: 'settings' },
      'SETTINGS_WIPED': { label: 'سڕینەوەی داتا', color: 'bg-rose-600 text-white border-rose-700', icon: AlertTriangle, category: 'settings' },
      'USER_CREATED': { label: 'کارمەندی نوێ', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: ShieldCheck, category: 'settings' },
      'USER_UPDATED': { label: 'دەستکاری کارمەند', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Edit3, category: 'settings' },
      'USER_DELETED': { label: 'سڕینەوەی کارمەند', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'settings' },
      'USER_PASSWORD_CHANGED': { label: 'گۆڕینی پاسۆرد', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: KeyRound, category: 'settings' },
      'LOGIN_FAILED': { label: 'هەوڵی چوونەژوورەوەی هەڵە', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertTriangle, category: 'auth' },

      'SALE_UPDATED': { label: 'دەستکاری وەسڵ', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Edit3, category: 'sales' },
      'SALE_DELETED': { label: 'سڕینەوەی وەسڵ', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'sales' },
      'PRINTED': { label: 'چاپکردن', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: FileText, category: 'sales' },

      'PRODUCT_BULK_PRICE': { label: 'گۆڕینی نرخ بە کۆمەڵ', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Layers, category: 'products' },
      'MIX_ADDED': { label: 'ڕەچەتەی خەلتە', color: 'bg-pink-50 text-pink-700 border-pink-200', icon: PlusCircle, category: 'products' },
      'MIX_UPDATED': { label: 'دەستکاری خەلتە', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Edit3, category: 'products' },
      'MIX_DELETED': { label: 'سڕینەوەی خەلتە', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'products' },
      'MIX_PRODUCED': { label: 'دروستکردنی خەلتە', color: 'bg-pink-50 text-pink-700 border-pink-200', icon: Package, category: 'products' },

      'DEBT_BALANCE_CHANGED': { label: 'گۆڕانی حسابی قەرز', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: CreditCard, category: 'finance' },
      'DEBT_PAYMENT_UPDATED': { label: 'دەستکاری پارەدان', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Edit3, category: 'finance' },
      'DEBT_PAYMENT_DELETED': { label: 'سڕینەوەی پارەدان', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'finance' },
      'DEBT_ADDED_MANUALLY': { label: 'زیادکردنی قەرز', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: PlusCircle, category: 'finance' },

      'DATABASE_BACKUP': { label: 'باکئەپ', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ShieldCheck, category: 'settings' },
      'DATABASE_RESTORE': { label: 'گەڕاندنەوەی باکئەپ', color: 'bg-amber-50 text-amber-800 border-amber-200', icon: RotateCcw, category: 'settings' },
      'DATA_EXPORTED': { label: 'دابەزاندنی فایل', color: 'bg-sky-50 text-sky-700 border-sky-200', icon: FileText, category: 'settings' },
      'DANGER_RESET_REPORTS': { label: 'سڕینەوەی ڕاپۆرتەکان', color: 'bg-rose-600 text-white border-rose-700', icon: AlertTriangle, category: 'settings' },
      'DANGER_RESET_PRODUCTS': { label: 'سڕینەوەی کاڵاکان', color: 'bg-rose-600 text-white border-rose-700', icon: AlertTriangle, category: 'settings' },
      'DANGER_RESET_DEBTS': { label: 'سفرکردنەوەی قەرزەکان', color: 'bg-rose-600 text-white border-rose-700', icon: AlertTriangle, category: 'settings' },
      'DANGER_FACTORY_RESET': { label: 'سڕینەوەی هەموو داتا', color: 'bg-rose-600 text-white border-rose-700', icon: AlertTriangle, category: 'settings' },
      'BULK_INSERT': { label: 'زیادکردنی بە کۆمەڵ', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Layers, category: 'settings' },
      'BULK_UPDATE': { label: 'دەستکاری بە کۆمەڵ', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Layers, category: 'settings' },
      'BULK_DELETE': { label: 'سڕینەوەی بە کۆمەڵ', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Trash2, category: 'settings' },
    };

    return config[action] || {
      label: action.replace(/_/g, ' '),
      color: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: Activity,
      category: 'other'
    };
  };

  // Build unified unique staff list
  const staffNamesMap = new Map<string, string>();
  staffUsers.forEach(s => {
    staffNamesMap.set(s.name.trim().toLowerCase(), s.name.trim());
  });
  logs.forEach(l => {
    if (l.user_name) {
      const key = l.user_name.trim().toLowerCase();
      if (!staffNamesMap.has(key)) {
        staffNamesMap.set(key, l.user_name.trim());
      }
    }
  });

  const allDisplayUsers = Array.from(staffNamesMap.values());

  const filteredLogs = logs.filter(log => {
    const info = getActionInfo(log.action);
    
    // Category match
    if (selectedCategory !== 'all' && info.category !== selectedCategory) {
      return false;
    }

    // User match (case-insensitive & trimmed)
    if (selectedUser !== 'all') {
      const logUserName = (log.user_name || '').trim().toLowerCase();
      const targetUser = selectedUser.trim().toLowerCase();
      if (logUserName !== targetUser) {
        return false;
      }
    }

    // Date match
    if (dateFilter !== 'all') {
      const logDate = new Date(log.created_at);
      const today = new Date();
      if (dateFilter === 'today') {
        if (format(logDate, 'yyyy-MM-dd') !== format(today, 'yyyy-MM-dd')) return false;
      } else if (dateFilter === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (format(logDate, 'yyyy-MM-dd') !== format(yesterday, 'yyyy-MM-dd')) return false;
      } else if (dateFilter === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        if (logDate < sevenDaysAgo) return false;
      }
    }

    // Search query
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      const matchDetails = (log.details || '').toLowerCase().includes(query);
      const matchUser = (log.user_name || '').toLowerCase().includes(query);
      const matchAction = (info.label || '').toLowerCase().includes(query);
      if (!matchDetails && !matchUser && !matchAction) return false;
    }

    return true;
  });

  // Metrics
  const salesCount = logs.filter(l => getActionInfo(l.action).category === 'sales').length;
  const productsCount = logs.filter(l => getActionInfo(l.action).category === 'products').length;
  const financeCount = logs.filter(l => getActionInfo(l.action).category === 'finance').length;

  const resetAllFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedUser('all');
    setDateFilter('all');
  };

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                تۆماری چالاکییەکان و چاودێری کاشێر
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                  {logs.length} تۆمار
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">چاودێری هەموو کرداری فرۆشتن، کۆگا و دەستکارییەکان</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition-all ${
              autoRefresh ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
            title="نوێکردنەوەی خۆکار هەر ٢٠ چرکە"
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {autoRefresh ? 'ڕاستەوخۆ' : 'وەستاوە'}
          </button>
          <button 
            onClick={() => fetchLogs()}
            disabled={isRefreshing}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all border border-slate-200 active:scale-95 shadow-2xs"
            title="نوێکردنەوەی داتا"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            {isRefreshing ? 'خەریکی هێنانە...' : 'نوێکردنەوە'}
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* ─── Metric Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی چالاکییەکان</span>
              <h3 className="text-2xl font-black text-slate-800 font-mono" dir="ltr">{logs.length}</h3>
              <span className="text-[11px] text-indigo-600 font-bold mt-0.5 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" />
                {allDisplayUsers.length} کارمەندی تۆمارکراو
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">فرۆشتن و گەڕانەوە</span>
              <h3 className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">{salesCount}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">وەسڵی کڕین و گەڕاندنەوە</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆگا و کاڵاکان</span>
              <h3 className="text-2xl font-black text-blue-600 font-mono" dir="ltr">{productsCount}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">زیادکردن، نرخ و ستۆک</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">دارایی، خەرجی و قەرز</span>
              <h3 className="text-2xl font-black text-purple-600 font-mono" dir="ltr">{financeCount}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">سندوق و قەرزی کڕیاران</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ─── Filter Suite Bar ─── */}
        <div className="bg-white p-4 rounded-3xl shadow-xs border border-slate-200/80 space-y-3">
          
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-100">
            {[
              { id: 'all', label: 'هەموو چالاکییەکان', icon: Activity },
              { id: 'sales', label: '🛒 فرۆشتن و گەڕانەوە', icon: ShoppingCart },
              { id: 'products', label: '📦 کۆگا و کاڵاکان', icon: Package },
              { id: 'finance', label: '💰 دارایی و قەرز و خەرجی', icon: DollarSign },
              { id: 'auth', label: '🔐 چوونەژوورەوە و قوفڵ', icon: Lock },
              { id: 'settings', label: '⚙️ ڕێکخستن و بەکارهێنەران', icon: SettingsIcon },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  selectedCategory === tab.id 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Controls: Date presets + Staff filter + Live search */}
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 items-center">
            
            {/* Search Input */}
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="گەڕان لە چالاکییەکان بەپێی کارمەند، کاڵا، بڕی پارە..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold bg-slate-50 focus:bg-white"
              />
            </div>

            {/* Staff Selector */}
            <div>
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold bg-slate-50 font-sans"
              >
                <option value="all">هەموو کارمەندان ({allDisplayUsers.length})</option>
                {allDisplayUsers.map(u => {
                  const staffObj = staffUsers.find(s => s.name.trim().toLowerCase() === u.toLowerCase());
                  const roleLabel = staffObj ? (staffObj.role === 'Admin' ? 'ئەدمین' : staffObj.role === 'Manager' ? 'بەڕێوەبەر' : 'کاشێر') : '';
                  return (
                    <option key={u} value={u}>
                      {u} {roleLabel ? `(${roleLabel})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Date Preset */}
            <div>
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 outline-none text-xs font-bold bg-slate-50"
              >
                <option value="all">هەموو کاتەکان (گشتی)</option>
                <option value="today">ئەمڕۆ</option>
                <option value="yesterday">دوێنێ</option>
                <option value="week">٧ ڕۆژی ڕابردوو</option>
              </select>
            </div>

          </div>
        </div>

        {/* ─── Activity Log Stream Table ─── */}
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3.5 text-center w-12">#</th>
                  <th className="p-3.5 w-44">بەروار و کات</th>
                  <th className="p-3.5 w-44">کارمەند</th>
                  <th className="p-3.5 w-44">جۆری کردار</th>
                  <th className="p-3.5">وردەکاری چالاکی</th>
                  <th className="p-3.5 text-center w-24">پشکنین</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">بەدوای تۆمارەکاندا دەگەڕێت...</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400">
                      <div className="max-w-md mx-auto space-y-2">
                        <Activity className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-bold text-slate-700">هیچ چالاکییەک نەدۆزرایەوە بەپێی ئەم فلتەرانە</p>
                        <p className="text-xs text-slate-400">
                          {selectedUser !== 'all' ? `بۆ کارمەندی (${selectedUser}) هیچ چالاکییەک تۆمار نەکراوە یاخود فلتەرەکە بسڕەوە.` : 'دەتوانیت فلتەرەکان لابدەیت بۆ بینینی هەموو کردارەکان.'}
                        </p>
                        <button
                          onClick={resetAllFilters}
                          className="mt-2 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl border border-indigo-200 transition-colors"
                        >
                          نیشاندانی هەموو چالاکییەکان
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, idx) => {
                    const info = getActionInfo(log.action);
                    const IconComp = info.icon;
                    const staffObj = staffUsers.find(s => s.name.trim().toLowerCase() === (log.user_name || '').trim().toLowerCase());
                    const roleBadge = staffObj?.role === 'Admin' ? 'ئەدمین' : staffObj?.role === 'Manager' ? 'بەڕێوەبەر' : 'کاشێر';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 text-slate-400 font-mono text-center">{idx + 1}</td>
                        
                        <td className="p-3.5">
                          <div className="font-mono text-xs text-slate-800 font-bold" dir="ltr">
                            {format(new Date(log.created_at), 'yyyy-MM-dd hh:mm:ss a')}
                          </div>
                          <span className="text-[10px] text-slate-400 block font-normal">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                              {(log.user_name || 'U').charAt(0)}
                            </div>
                            <div>
                              <span className="font-black text-slate-900 text-xs block">
                                {log.user_name || 'سیستەم'}
                              </span>
                              {staffObj && (
                                <span className="text-[9px] text-slate-400 font-bold block">{roleBadge}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black border ${info.color}`}>
                            <IconComp className="w-3.5 h-3.5" />
                            {info.label}
                          </span>
                        </td>

                        <td className="p-3.5 font-bold text-slate-700 text-xs leading-relaxed whitespace-pre-line min-w-[16rem]">
                          {(log.details || '').split(' | ').join('\n')}
                        </td>

                        <td className="p-3.5 text-center">
                          {log.metadata ? (
                            <button
                              onClick={() => setInspectLog(log)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-slate-200"
                              title="بینینی وردەکاری داتا (Metadata)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!loading && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/60">
              <span className="text-xs font-bold text-slate-500">{filteredLogs.length} لە {logs.length} تۆمار پیشان دەدرێت</span>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-black text-slate-700 disabled:opacity-60"
                >
                  {loadingMore ? 'چاوەڕێبە…' : 'هێنانی تۆماری کۆنتر'}
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ─── Metadata Inspector Modal ─── */}
      {inspectLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col border border-slate-100">
            
            <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">وردەکاری دەقی تۆمار (Payload)</h3>
                  <p className="text-[10px] text-slate-400">Activity ID: {inspectLog.id.slice(0, 8)}</p>
                </div>
              </div>
              <button 
                onClick={() => setInspectLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">کردار:</span>
                  <span className="font-mono font-bold text-slate-800">{inspectLog.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">کارمەند:</span>
                  <span className="font-bold text-indigo-700">{inspectLog.user_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">کات:</span>
                  <span className="font-mono text-slate-700" dir="ltr">
                    {format(new Date(inspectLog.created_at), 'yyyy-MM-dd HH:mm:ss')}
                  </span>
                </div>
              </div>

              <p className="text-sm font-bold text-slate-800 leading-7 whitespace-pre-line">{(inspectLog.details || '').split(' | ').join('\n')}</p>

              {inspectLog.metadata?.changes && Object.keys(inspectLog.metadata.changes).length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr><th className="p-2.5 text-right">خانە</th><th className="p-2.5 text-right">پێشتر</th><th className="p-2.5 text-right">دوای گۆڕین</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(inspectLog.metadata.changes as Record<string, { old: any; new: any }>).map(([k, v]) => (
                        <tr key={k}>
                          <td className="p-2.5 font-bold text-slate-600">{FIELD_LABELS[k] || k}</td>
                          <td className="p-2.5 font-mono text-rose-600 line-through" dir="ltr">{showVal(v.old)}</td>
                          <td className="p-2.5 font-mono font-black text-emerald-700" dir="ltr">{showVal(v.new)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {inspectLog.metadata?.deleted && (
                <div className="border border-rose-200 bg-rose-50/40 rounded-2xl p-3">
                  <p className="text-xs font-black text-rose-700 mb-2">زانیاریی سڕاوە (بۆ گەڕاندنەوە بە دەست)</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(inspectLog.metadata.deleted as Record<string, any>)
                      .filter(([k, v]) => v !== null && v !== '' && !['id'].includes(k))
                      .map(([k, v]) => (
                        <React.Fragment key={k}>
                          <span className="font-bold text-slate-500">{FIELD_LABELS[k] || k}</span>
                          <span className="font-mono text-slate-800 truncate" dir="ltr">{showVal(v)}</span>
                        </React.Fragment>
                      ))}
                  </div>
                </div>
              )}

              <details className="group">
                <summary className="cursor-pointer text-[11px] font-bold text-slate-400 hover:text-slate-600">داتای تەکنیکی (JSON)</summary>
                <pre className="mt-2 p-3 bg-slate-900 text-emerald-400 rounded-2xl font-mono text-[11px] overflow-x-auto text-left leading-relaxed max-h-60" dir="ltr">
                  {JSON.stringify(inspectLog.metadata, null, 2)}
                </pre>
              </details>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setInspectLog(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
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
