import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  UserCog,
  Plus,
  Trash2,
  Edit2,
  ShieldAlert,
  ShieldCheck,
  User,
  KeyRound,
  Eye,
  EyeOff,
  X,
  Sparkles,
  Check,
  Users as UsersIcon
} from 'lucide-react';
import { staffList, staffSave, staffDelete, staffErrorMessage } from '../lib/staffApi';
import { useAppStore } from '../store/useAppStore';
import { logActivity } from '../lib/activityLogger';

const AVAILABLE_MODULES = [
  { path: '/pos', name: 'فرۆشتن (POS)', category: 'فرۆشتن', description: 'تۆمارکردنی فرۆشتن و دەرکردنی وەسڵ' },
  { path: '/safe', name: 'قاسەی پارە (Safe)', category: 'دارایی', description: 'بینینی پارەی نەقد و حسابی سندوق' },
  { path: '/products', name: 'بەشی کاڵاکان', category: 'کۆگا', description: 'بینین و دەستکاریکردنی کاڵاکان' },
  { path: '/categories', name: 'جۆرەکانی کاڵا', category: 'کۆگا', description: 'پۆلێنکردنی کەتەگۆرییەکان' },
  { path: '/inventory', name: 'کۆگای سەرەکی', category: 'کۆگا', description: 'مەوجوود و ئیکسپایەری کاڵاکان' },
  { path: '/debts', name: 'دەفتەری قەرزەکان', category: 'دارایی', description: 'قەرزی کڕیاران و وەرگرتنی پارە' },
  { path: '/companies', name: 'کۆمپانیاکان', category: 'کۆگا', description: 'شەریکە و هاوردەکاران' },
  { path: '/expenses', name: 'خەرجییەکان', category: 'دارایی', description: 'تۆمارکردنی خەرجی ڕۆژانە' },
  { path: '/returns', name: 'گەڕانەوە و گۆڕین', category: 'فرۆشتن', description: 'گەڕاندنەوەی کاڵا و گۆڕین' },
  { path: '/mixes', name: 'خەلتەکان', category: 'کۆگا', description: 'دروستکردن و بەڕێوەبردنی خەلتەکان' },
  { path: '/reports', name: 'ڕاپۆرت و شیکاری', category: 'دارایی', description: 'ڕاپۆرتی فرۆشتن و قازانج' },
  { path: '/sold-products', name: 'شیکاری کاڵا فرۆشراوەکان', category: 'شیکاری و فرۆشتن', description: 'شیکاری سەرجەم کاڵا فرۆشراوەکان بەپێی کات، ناو، تام و کۆمپانیا' },
  { path: '/receipts', name: 'ئەرشیفی وەسڵەکان', category: 'فرۆشتن', description: 'بینین و چاپکردنەوەی وەسڵ' },
  { path: 'manage_invoices', name: 'سڕینەوەی وەسڵ', category: 'دەسەڵاتی تایبەت', description: 'دەسەڵاتی سڕینەوەی وەسڵی فرۆشراو' },
  { path: '/settings', name: 'ڕێکخستنەکانی سیستەم', category: 'سەرەکی', description: 'زانیاری دوکان، تێلیگرام و باکئاپ' },
  { path: '/users', name: 'بەڕێوەبردنی بەکارهێنەران', category: 'سەرەکی', description: 'زیادکردنی کارمەند و دەسەڵات' }
];

export const Users: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [role, setRole] = useState('Cashier');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    // Check access
    if (currentUser && currentUser.role !== 'Admin') {
      navigate('/');
      return;
    }
    fetchUsers();
  }, [currentUser, navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    setDbError(false);
    try {
      const data = await staffList();
      setUsers(data || []);
    } catch (error: any) {
      if (error?.code === '42P01' || error?.code === 'PGRST205') setDbError(true);
      else alert('کێشە لە هێنانی بەکارهێنەران: ' + staffErrorMessage(error));
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (path: string) => {
    setPermissions(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const handleSelectAllPerms = () => {
    setPermissions(AVAILABLE_MODULES.map(m => m.path));
  };

  const handleDeselectAllPerms = () => {
    setPermissions(['/pos']);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    // On edit, empty password / PIN means "keep the current one"
    if (!name.trim() || !email.trim() || (!editingId && (!password.trim() || !pinCode.trim()))) {
      alert("تکایە هەموو خانەکان بە دروستی پڕبکەرەوە");
      return;
    }

    if (pinCode.trim() && pinCode.trim().length < 4) {
      alert("پین کۆد پێویستە بە لایەنی کەم ٤ ژمارە بێت");
      return;
    }
    
    // Auto grant all perms to Admin
    const actualRole = users.length === 0 ? 'Admin' : role;
    const finalPerms = actualRole === 'Admin' ? AVAILABLE_MODULES.map(m => m.path) : permissions;

    setIsProcessing(true);
    try {
      await staffSave({
        id: editingId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        pin: pinCode.trim(),
        role: actualRole,
        permissions: finalPerms,
      });

      if (editingId) {
        await logActivity('USER_UPDATED', `دەستکاریکردنی هەژماری: ${name} (${actualRole})`, { id: editingId, role: actualRole });
        alert('زانیارییەکانی بەکارهێنەر بە سەرکەوتوویی نوێکرانەوە');
      } else {
        await logActivity('USER_CREATED', `دروستکردنی هەژماری نوێ: ${name} (${actualRole})`, { name, role: actualRole });
        alert('بەکارهێنەری نوێ بە سەرکەوتوویی زیادکرا');
      }

      setShowForm(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      alert('کێشەیەک ڕوویدا: ' + staffErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string, userName: string) => {
    if (users.length <= 1) {
      alert('ناتوانیت کۆتا بەکارهێنەر بسڕیتەوە! سیستەم پێویستی بە لایەنی کەم یەک هەژمار هەیە.');
      return;
    }
    if (id === currentUser?.id) {
      alert('ناتوانیت هەژماری خۆت بسڕیتەوە کاتێک لەسەر سیستەمەکە کار دەکەیت.');
      return;
    }
    if (confirm(`دڵنیایت لە سڕینەوەی بەکارهێنەری (${userName})؟`)) {
      try {
        await staffDelete(id);
        await logActivity('USER_DELETED', `سڕینەوەی هەژماری کارمەند: ${userName}`, { id, name: userName });
        alert('بەکارهێنەرەکە بە سەرکەوتوویی سڕدرایەوە');
        fetchUsers();
      } catch (error: any) {
        alert('کێشەیەک ڕوویدا لە سڕینەوە: ' + staffErrorMessage(error));
      }
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setEmail('');
    setPassword('');
    setPinCode('');
    setShowPassword(false);
    setRole('Cashier');
    setPermissions(['/pos', '/receipts']);
  };

  const handleEdit = (user: any) => {
    setEditingId(user.id);
    setName(user.name);
    setEmail(user.email);
    setPassword(''); // passwords are never sent to the browser any more
    setPinCode('');
    setRole(user.role);
    setPermissions(user.permissions || []);
    setShowForm(true);
  };

  const adminCount = users.filter(u => u.role === 'Admin').length;
  const managerCount = users.filter(u => u.role === 'Manager').length;
  const cashierCount = users.filter(u => u.role === 'Cashier').length;

  if (dbError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-kurdish items-center justify-center p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">خشتەی بەکارهێنەران نەدۆزرایەوە!</h1>
        <p className="text-slate-600 max-w-md text-sm">
          تکایە دڵنیابە لەوەی سکریپتی کۆدەکانی `supabase_schema.sql` ت جێبەجێ کردووە لە ناو Supabase بۆ ئەوەی خشتەی `staff_users` دروست ببێت.
        </p>
        <button onClick={() => navigate('/')} className="mt-6 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-md">
          گەڕانەوە بۆ داشبۆرد
        </button>
      </div>
    );
  }

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-200">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight flex items-center gap-2">
                بەڕێوەبردنی بەکارهێنەران و دەسەڵاتەکان
                <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                  {users.length} هەژمار
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">دیاریکردنی کارمەند، پلە و دەسەڵاتەکانی سیستەم</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shadow-blue-200"
        >
          <Plus className="w-4 h-4" />
          زیادکردنی بەکارهێنەری نوێ
        </button>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* ─── Metric Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کۆی کارمەندان</span>
              <h3 className="text-2xl font-black text-slate-800 font-mono" dir="ltr">{users.length}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">هەژماری تۆمارکراو</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <UsersIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">ئەدمینە سەرەکییەکان</span>
              <h3 className="text-2xl font-black text-purple-600 font-mono" dir="ltr">{adminCount}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">دەسەڵاتی تەواو (Full Access)</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">کاشێر و فرۆشیار</span>
              <h3 className="text-2xl font-black text-sky-600 font-mono" dir="ltr">{cashierCount}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">دەسەڵاتی دیاریکراو</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1">بەڕێوەبەران (Manager)</span>
              <h3 className="text-2xl font-black text-amber-600 font-mono" dir="ltr">{managerCount}</h3>
              <span className="text-[11px] text-slate-400 font-medium mt-0.5 block">دەسەڵاتی بەڕێوەبردن</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ─── Users Grid Cards View ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            <div className="col-span-full py-16 text-center text-slate-500">خەریکی هێنانی داتاکانی بەکارهێنەرانە...</div>
          ) : users.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              هیچ بەکارهێنەرێک نەدۆزرایەوە
            </div>
          ) : (
            users.map((user) => {
              const isAdmin = user.role === 'Admin';
              const isManager = user.role === 'Manager';

              const roleGradient = isAdmin 
                ? 'from-purple-600 to-indigo-700' 
                : isManager 
                ? 'from-amber-500 to-orange-600' 
                : 'from-blue-500 to-sky-600';

              const roleBadge = isAdmin 
                ? 'bg-purple-100 text-purple-800 border-purple-200' 
                : isManager 
                ? 'bg-amber-100 text-amber-800 border-amber-200' 
                : 'bg-sky-100 text-sky-800 border-sky-200';

              const roleLabel = isAdmin ? 'ئەدمین (Admin)' : isManager ? 'بەڕێوەبەر (Manager)' : 'کاشێر (Cashier)';

              return (
                <div 
                  key={user.id}
                  className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l ${roleGradient}`}></div>

                  <div>
                    {/* User Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${roleGradient} text-white flex items-center justify-center font-black text-base shadow-sm`}>
                          {user.name.slice(0, 1)}
                        </div>
                        <div>
                          <h3 className="font-black text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                            {user.name}
                          </h3>
                          <span className="text-[11px] font-mono text-slate-400 block" dir="ltr">
                            {user.email}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${roleBadge}`}>
                        {roleLabel}
                      </span>
                    </div>

                    {/* PIN & Role Details */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 my-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                        <span>پین کۆدی قوفڵ:</span>
                      </div>
                      <span className="font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800 tracking-widest" dir="ltr">
                        {'••••'}
                      </span>
                    </div>

                    {/* Accessible Modules Pills */}
                    <div className="space-y-1.5 mt-2">
                      <span className="text-[11px] font-bold text-slate-500 block">دەسەڵاتەکانی سیستەم:</span>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                        {isAdmin ? (
                          <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-emerald-200">
                            هەموو بەشەکانی سیستەم (دەسەڵاتی تەواو)
                          </span>
                        ) : (user.permissions || []).length === 0 ? (
                          <span className="text-[10px] text-slate-400">هیچ دەسەڵاتێک دیاری نەکراوە</span>
                        ) : (
                          (user.permissions || []).map((p: string) => {
                            const mod = AVAILABLE_MODULES.find(m => m.path === p);
                            return (
                              <span key={p} className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-slate-200">
                                {mod?.name || p}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4">
                    <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                      {user.id === currentUser?.id ? 'هەژماری تۆیە (ئێستا)' : ''}
                    </span>

                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleEdit(user)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                        title="دەستکاریکردن"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(user.id, user.name)}
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

      {/* ─── Add/Edit User Modal (Fixed z-[100]) ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col border border-slate-100">
            
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <UserCog className="w-5 h-5 text-blue-600" />
                {editingId ? 'دەستکاریکردنی بەکارهێنەر' : users.length === 0 ? 'دروستکردنی ئەدمینی سەرەکی' : 'زیادکردنی بەکارهێنەری نوێ'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto space-y-5 pr-1">
              
              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ناوی تەواوی کارمەند *</label>
                  <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-xs font-bold" 
                    placeholder="نموونە: ئارام عەلی"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ئیمەیڵی چوونەژوورەوە *</label>
                  <input 
                    type="email" 
                    required 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-left text-xs font-bold font-mono" 
                    dir="ltr"
                    placeholder="aram@soran.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">پاسۆردی هەژمار {editingId ? <span className="text-slate-400 font-normal">(بەتاڵی جێبهێڵە بۆ نەگۆڕین)</span> : '*'}</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required={!editingId}
                      autoComplete="new-password"
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      className="w-full p-3 pl-10 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-left text-xs font-bold font-mono" 
                      dir="ltr"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">پین کۆدی خێرا (PIN - ٤ ژمارە) {editingId ? <span className="text-slate-400 font-normal">(بەتاڵ = نەگۆڕین)</span> : '*'}</label>
                  <input 
                    type="password" 
                    required={!editingId}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4} 
                    placeholder={editingId ? '••••' : '1234'} 
                    value={pinCode} 
                    onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))} 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-center tracking-[8px] font-mono text-base font-black" 
                    dir="ltr" 
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">پلە و جۆری هەژمار (Role)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'Cashier', label: 'کاشێر (Cashier)', desc: 'تەنیا فرۆشتن، نرخی تێچووی لێ شاراوەیە', color: 'border-sky-300 bg-sky-50/50' },
                    { id: 'Manager', label: 'بەڕێوەبەر (Manager)', desc: 'بەڕێوەبردنی کاڵا و فرۆشگا بە تەواوی', color: 'border-amber-300 bg-amber-50/50' },
                    { id: 'Admin', label: 'ئەدمین (Admin)', desc: 'دەسەڵاتی بێسنوور بەسەر هەموو سیستەم', color: 'border-purple-300 bg-purple-50/50' },
                  ].map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`p-3.5 rounded-2xl border-2 text-right transition-all flex flex-col justify-between ${
                        role === r.id 
                          ? `${r.color} ring-2 ring-blue-500 shadow-xs font-bold` 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <strong className="text-xs text-slate-900">{r.label}</strong>
                        {role === r.id && <Check className="w-4 h-4 text-blue-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions Matrix (Shown if not Admin) */}
              {role !== 'Admin' && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="block text-xs font-black text-slate-800">دەسەڵاتەکانی ئەم کارمەندە</label>
                      <p className="text-[10px] text-slate-400">ئەو بەشانە دیاری بکە کە کارمەندەکە ڕێگەی پێدەدرێت بیبینێت</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={handleSelectAllPerms}
                        className="text-[10px] bg-white border border-slate-200 text-blue-600 font-bold px-2 py-1 rounded-lg hover:bg-blue-50"
                      >
                        هەمووی هەڵبژێرە
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAllPerms}
                        className="text-[10px] bg-white border border-slate-200 text-slate-500 font-bold px-2 py-1 rounded-lg hover:bg-slate-100"
                      >
                        سڕینەوەی هەمووی
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {AVAILABLE_MODULES.map(module => {
                      const isSelected = permissions.includes(module.path);
                      return (
                        <label 
                          key={module.path} 
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected 
                              ? 'border-blue-500 bg-blue-50/70 text-blue-900 shadow-2xs' 
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => handleTogglePermission(module.path)}
                            className="w-4 h-4 text-blue-600 rounded mt-0.5"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-bold block">{module.name}</span>
                            <span className="text-[10px] text-slate-400 block">{module.description}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs disabled:opacity-50 transition-all shadow-md shadow-blue-200 active:scale-98"
                >
                  {isProcessing ? 'خەریکی پاشەکەوتکردنە...' : (editingId ? 'نوێکردنەوەی بەکارهێنەر' : 'تۆمارکردنی بەکارهێنەر')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
