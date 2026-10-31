import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { createDatabaseBackup } from '../lib/backup';
import { LockScreen } from './LockScreen';
import { staffMe } from '../lib/staffApi';
import { logActivity } from '../lib/activityLogger';

const PAGE_NAMES: Record<string, string> = {
  '/': 'سەرەکی', '/pos': 'فرۆشتن', '/receipts': 'وەسڵەکان', '/returns': 'گەڕانەوە', '/exchanges': 'گۆڕینەوە',
  '/products': 'کاڵاکان', '/categories': 'جۆرەکان', '/inventory': 'کۆگا', '/mixes': 'خەلتەکان',
  '/companies': 'کۆمپانیاکان', '/safe': 'قاسە', '/debts': 'قەرزەکان', '/expenses': 'خەرجییەکان',
  '/reports': 'ڕاپۆرتەکان', '/sold-products': 'کاڵا فرۆشراوەکان', '/users': 'بەکارهێنەران',
  '/activity': 'تۆماری چالاکی', '/settings': 'ڕێکخستنەکان',
};

export const SecurityManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUser = useAppStore((state) => state.currentUser);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const settings = useAppStore((state) => state.settings);
  
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLocked = useAppStore((state) => state.isLocked);
  const [lastBackupDate, setLastBackupDate] = useState<string>('');

  // 1. Auto Lock Logic
  const resetLockTimer = () => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    
    // Only set timer if user is logged in
    if (currentUser && settings.autoLogoutTime) {
      logoutTimerRef.current = setTimeout(() => {
        // Auto lock
        useAppStore.getState().setLocked(true);
      }, settings.autoLogoutTime * 60 * 1000);
    }
  };

  useEffect(() => {
    // Listen to user activity to reset the timer
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const handleActivity = () => resetLockTimer();

    events.forEach(event => document.addEventListener(event, handleActivity));
    resetLockTimer(); // Initialize

    return () => {
      events.forEach(event => document.removeEventListener(event, handleActivity));
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [currentUser, settings.autoLogoutTime]);

  // 2. Auto Backup Logic
  useEffect(() => {
    const backupInterval = setInterval(() => {
      if (!currentUser || !settings.autoBackupTime) return;

      const now = new Date();
      const currentHour = now.getHours().toString().padStart(2, '0');
      const currentMinute = now.getMinutes().toString().padStart(2, '0');
      const currentTimeString = `${currentHour}:${currentMinute}`;
      const todayString = now.toISOString().split('T')[0];

      if (currentTimeString === settings.autoBackupTime && lastBackupDate !== todayString) {
        // Trigger backup
        createDatabaseBackup().then((success) => {
          if (success) {
            logActivity('DATABASE_BACKUP', 'باکئەپی خۆکاری ڕۆژانە');
            setLastBackupDate(todayString);
          }
        });
      }
    }, 60000); // Check every minute

    return () => clearInterval(backupInterval);
  }, [currentUser, settings.autoBackupTime, lastBackupDate]);

  // 3. Realtime User Permissions Sync Logic
  useEffect(() => {
    if (!currentUser) return;
    
    let isMounted = true;
    const fetchPermissions = async () => {
      try {
        const me = useAppStore.getState().currentUser;
        if (!me) return;
        const data = await staffMe(me.id);
        if (!isMounted) return;
        if (data === 'invalid') {
          // Session revoked/expired (or old login from before the security upgrade)
          setCurrentUser(null);
          useAppStore.getState().setLocked(false);
          return;
        }
        if (data) {
          const currentPerms = me.permissions || [];
          const newPerms = data.permissions || [];
          if (data.role !== me.role || JSON.stringify(currentPerms) !== JSON.stringify(newPerms) || data.name !== me.name) {
            setCurrentUser({ ...me, name: data.name, role: data.role, permissions: newPerms });
          }
        }
      } catch (e) {
        console.error("Failed to sync permissions", e);
      }
    };

    // Fetch immediately on mount or user change
    fetchPermissions();

    // Check periodically every 15 seconds
    const interval = setInterval(fetchPermissions, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser?.id]); // Depend on ID, not the whole user, to avoid loops

  // 4. Log screen locks (manual button or automatic)
  const wasLocked = useRef(isLocked);
  useEffect(() => {
    if (isLocked && !wasLocked.current && currentUser) {
      logActivity('SCREEN_LOCKED', `قوفڵکردنی شاشە: ${currentUser.name}`);
    }
    wasLocked.current = isLocked;
  }, [isLocked]);

  // 5. Log every print (receipts, reports, barcodes, statements …)
  useEffect(() => {
    const onPrint = () => {
      const path = window.location.pathname;
      logActivity('PRINTED', `چاپکردن لە بەشی: ${PAGE_NAMES[path] || path}`, { path });
    };
    window.addEventListener('beforeprint', onPrint);
    return () => window.removeEventListener('beforeprint', onPrint);
  }, []);

  return (
    <>
      {isLocked && <LockScreen />}
      {children}
    </>
  );
};
