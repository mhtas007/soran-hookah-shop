import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Settings } from '../types';

interface AppState {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isLocked: boolean;
  setLocked: (locked: boolean) => void;
  settings: Settings;
  updateSettings: (settings: Partial<Settings>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      isLocked: false,
      setLocked: (locked) => set({ isLocked: locked }),
      settings: {
        shopName: 'Soran Hookah Shop',
        phone: '',
        address: '',
        receiptFooter: 'سوپاس بۆ سەردانتان', // Thank you for visiting
        usdRate: 150000,
        autoBackupTime: '23:00',
        autoLogoutTime: 15,
        imgbbApiKey: '',
      },
      updateSettings: (newSettings) => 
        set((state) => ({ settings: { ...state.settings, ...newSettings } }))
    }),
    {
      name: 'pos-storage',
      partialize: (state) => ({ settings: state.settings, currentUser: state.currentUser, isLocked: state.isLocked }),
    }
  )
);
