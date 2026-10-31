import React, { useEffect } from 'react';
import { create } from 'zustand';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }

interface ToastState {
  items: ToastItem[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (message, kind) => {
    const id = ++seq;
    const k = kind || guessKind(message);
    set({ items: [...get().items.slice(-3), { id, kind: k, message }] });
    const ms = Math.min(9000, 3500 + message.length * 40);
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ items: get().items.filter(t => t.id !== id) }),
}));

function guessKind(msg: string): ToastKind {
  if (/کێشە|هەڵە|ناتوانیت|ناکرێت|نییە|error|failed|تکایە/i.test(msg)) return 'error';
  if (/سەرکەوتوو|نوێکرایەوە|نوێکرانەوە|زیادکرا|سڕدرایەوە|تۆمارکرا|پاشەکەوت/i.test(msg)) return 'success';
  return 'info';
}

export const toast = {
  success: (m: string) => useToastStore.getState().push(m, 'success'),
  error: (m: string) => useToastStore.getState().push(m, 'error'),
  info: (m: string) => useToastStore.getState().push(m, 'info'),
};

/** Replace blocking browser alert() boxes with non-blocking toasts app-wide. */
export function installAlertOverride() {
  if (typeof window === 'undefined') return;
  window.alert = (msg?: unknown) => useToastStore.getState().push(String(msg ?? ''));
}

const styles: Record<ToastKind, { box: string; icon: React.ReactNode }> = {
  success: { box: 'border-emerald-200 bg-white', icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> },
  error:   { box: 'border-rose-200 bg-white',    icon: <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" /> },
  info:    { box: 'border-slate-200 bg-white',   icon: <Info className="w-5 h-5 text-indigo-600 shrink-0" /> },
};

export const Toaster: React.FC = () => {
  const items = useToastStore(s => s.items);
  const dismiss = useToastStore(s => s.dismiss);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && items.length) dismiss(items[items.length - 1].id); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, dismiss]);

  return (
    <div className="fixed z-[200] top-4 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none print:hidden" dir="rtl" aria-live="polite">
      {items.map(t => (
        <div
          key={t.id}
          role="status"
          className={`toast-in pointer-events-auto w-full max-w-md flex items-start gap-3 rounded-2xl border shadow-xl shadow-slate-900/10 px-4 py-3 font-kurdish ${styles[t.kind].box}`}
        >
          {styles[t.kind].icon}
          <p className="flex-1 text-sm font-bold text-slate-800 leading-6 whitespace-pre-line">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="p-1 -m-1 text-slate-400 hover:text-slate-700 rounded-lg" aria-label="داخستن">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
