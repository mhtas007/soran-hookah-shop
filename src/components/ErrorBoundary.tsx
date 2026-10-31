import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State { error: Error | null }

/** Stops one broken page from blanking the whole app. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 font-kurdish">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-xl font-black text-slate-800 mb-1">کێشەیەک لەم بەشەدا ڕوویدا</h1>
        <p className="text-sm text-slate-500 mb-5 max-w-md">داتاکانت سەلامەتن. پەڕەکە دووبارە بکەرەوە، ئەگەر کێشەکە مایەوە بە بەڕێوەبەر ڕابگەیەنە.</p>
        <button
          onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" /> دووبارە کردنەوە
        </button>
      </div>
    );
  }
}
