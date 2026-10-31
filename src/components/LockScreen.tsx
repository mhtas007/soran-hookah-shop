import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { staffVerifySecret, staffLogout } from '../lib/staffApi';
import { Lock, Unlock, AlertCircle } from 'lucide-react';
import { logActivity } from '../lib/activityLogger';

export const LockScreen: React.FC = () => {
  const currentUser = useAppStore(state => state.currentUser);
  const setLocked = useAppStore(state => state.setLocked);
  
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !currentUser) return;

    setIsLoading(true);
    setError('');

    try {
      const isMatch = await staffVerifySecret(currentUser.id, password);
      if (!isMatch) {
        throw new Error('پاسۆرد / پین کۆد هەڵەیە');
      }

      await logActivity('SCREEN_UNLOCKED', `کردنەوەی قوفڵی شاشە لەلایەن: ${currentUser.name}`);
      setLocked(false);
      setPassword('');
    } catch (err: any) {
      setError('پاسۆرد / پین کۆد هەڵەیە!');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 lg:p-10 rounded-[2rem] shadow-2xl w-full max-w-sm transform transition-all">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
            <Lock className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 font-kurdish mb-1">سیستەم قوفڵ کراوە</h2>
          <p className="text-slate-500 font-kurdish text-sm">بەخێربێیتەوە، <span className="font-bold text-indigo-600">{currentUser.name}</span></p>
        </div>

        {error && (
          <div className="flex items-center justify-center gap-2 text-rose-600 bg-rose-50 border border-rose-100 px-4 py-3 rounded-xl mb-6 font-kurdish text-sm animate-pulse">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4 font-kurdish w-full">
          <div>
            <div className="relative">
              <input 
                type="password" 
                required
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="پاسۆرد / پین کۆد بنووسە"
                className="w-full text-center px-4 py-4 rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all tracking-widest font-mono text-lg font-bold"
                dir="ltr"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              'چاوەڕێبە...'
            ) : (
              <>
                <Unlock className="w-5 h-5" />
                کردنەوەی شاشە
              </>
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={async () => {
              await logActivity('USER_LOGOUT', `دەرچوون لە شاشەی قوفڵ: ${currentUser?.name || ''}`);
              staffLogout().catch(() => {});
              useAppStore.getState().setCurrentUser(null);
              setLocked(false);
            }}
            className="text-slate-400 hover:text-rose-500 text-sm transition-colors font-kurdish"
          >
            کەسێکی تریت؟ (دەرچوون)
          </button>
        </div>
      </div>
    </div>
  );
};
