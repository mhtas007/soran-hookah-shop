import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { staffLogin } from '../lib/staffApi';
import { Mail, AlertCircle, ShieldCheck, Eye, EyeOff, LogIn, Shield } from 'lucide-react';
import { logActivity } from '../lib/activityLogger';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);

  const setCurrentUser = useAppStore(state => state.setCurrentUser);
  const settings = useAppStore(state => state.settings);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if locked out
    if (lockoutTime) {
      const now = Date.now();
      if (now < lockoutTime) {
        const remainingSeconds = Math.ceil((lockoutTime - now) / 1000);
        setError(`بەهۆی هەوڵی زۆر، چوونەژوورەوە بۆ ماوەی ${remainingSeconds} چرکە ڕاگیراوە.`);
        return;
      } else {
        setLockoutTime(null);
        setAttempts(0);
      }
    }

    if (!email.trim() || !password) {
      setError('تکایە ئیمەیڵ و پاسۆرد بە دروستی بنووسە');
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      const cleanEmail = email.trim().toLowerCase();
      
      const data = await staffLogin(cleanEmail, password);
      if (!data) {
        throw new Error('ئیمەیڵ یان تێپەڕەوشە (پاسۆرد) هەڵەیە');
      }

      setAttempts(0);
      setCurrentUser({
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        permissions: data.permissions || [],
        sessionToken: data.sessionToken,
      });

      await logActivity('USER_LOGIN', `چوونەژوورەوەی کارمەند: ${data.name} (${data.role})`, { role: data.role, email: data.email });
    } catch (e: any) {
      console.error('Login error:', e);
      logActivity('LOGIN_FAILED', `هەوڵی چوونەژوورەوەی سەرنەکەوتوو بە ئیمەیڵی: ${email.trim().toLowerCase()}`,
        { email: email.trim().toLowerCase() }, { userName: email.trim().toLowerCase() || 'نەناسراو' });
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= 5) {
        setLockoutTime(Date.now() + 60000); // 1 minute lockout
        setError('بەهۆی سکیوریتییەوە، چوونەژوورەوە بۆ ماوەی ١ خولەک ڕاگیرا.');
      } else {
        setError(`ئیمەیڵ یان تێپەڕەوشە هەڵەیە! (${5 - newAttempts} هەوڵت ماوە)`);
      }
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center justify-center p-4 select-none font-kurdish overflow-y-auto">
      
      {/* ─── Ambient Glow Mesh Background ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-indigo-600/25 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-purple-600/25 rounded-full blur-[120px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px]"></div>
      </div>

      {/* ─── Luxury Login Card ─── */}
      <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800/90 backdrop-blur-2xl p-7 sm:p-9 rounded-[2.5rem] shadow-2xl shadow-black/70 my-auto animate-in">
        
        {/* Shop Logo & Title */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            {settings.logoUrl ? (
              <img 
                src={settings.logoUrl} 
                alt="Shop Logo" 
                className="w-20 h-20 rounded-3xl object-contain p-2 bg-slate-800/80 border border-slate-700/80 shadow-2xl shadow-indigo-500/20" 
              />
            ) : (
              <img src="/logo.svg" alt="Soran Hookah Shop" className="w-20 h-20 rounded-3xl shadow-2xl shadow-indigo-500/30" />
            )}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {settings.shopName || 'سۆران هۆکە شۆپ'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            {settings.receiptHeader || 'نێرگەلە و پێداویستییەکانی نێرگەلە'}
          </p>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="flex items-center gap-2.5 text-rose-300 bg-rose-950/60 border border-rose-800/60 px-4 py-3 rounded-2xl mb-6 text-xs sm:text-sm animate-pulse">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── Email & Password Form ─── */}
        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* Email Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              ئیمەیڵی کارمەند (Email)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="email" 
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="کارمەند@دوکان.com"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all text-left text-sm font-mono"
                dir="ltr"
              />
            </div>
          </div>
          
          {/* Password Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              تێپەڕەوشە (Password)
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors absolute left-3 top-1/2 -translate-y-1/2"
                title={showPassword ? 'شاردنەوەی پاسۆرد' : 'نیشاندانی پاسۆرد'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all text-left tracking-widest font-mono text-sm"
                dir="ltr"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-4 rounded-2xl font-black text-sm sm:text-base transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                چاوەڕێبە...
              </span>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                چوونەژوورەوە بۆ سیستەم
              </>
            )}
          </button>
        </form>

        {/* ─── Security Footer ─── */}
        <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-slate-500 text-[11px] font-medium">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          <span>سیستەمی پارێزراوی هەژمار و وردبینی چالاکییەکان</span>
        </div>

      </div>
    </div>
  );
};
