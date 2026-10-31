import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { SecurityManager } from './components/SecurityManager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { canAccess } from './lib/access';
import { ShieldAlert } from 'lucide-react';

// Each page is loaded on demand → much smaller first download, faster start.
const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType<any>>>, key: K) =>
  lazy(() => loader().then(m => ({ default: m[key] })));

const Home = named(() => import('./pages/Home'), 'Home');
const POS = named(() => import('./pages/POS'), 'POS');
const Products = named(() => import('./pages/Products'), 'Products');
const Categories = named(() => import('./pages/Categories'), 'Categories');
const Safe = named(() => import('./pages/Safe'), 'Safe');
const Debts = named(() => import('./pages/Debts'), 'Debts');
const Companies = named(() => import('./pages/Companies'), 'Companies');
const Expenses = named(() => import('./pages/Expenses'), 'Expenses');
const Reports = named(() => import('./pages/Reports'), 'Reports');
const Settings = named(() => import('./pages/Settings'), 'Settings');
const Returns = named(() => import('./pages/Returns'), 'Returns');
const Exchanges = named(() => import('./pages/Exchanges'), 'Exchanges');
const Inventory = named(() => import('./pages/Inventory'), 'Inventory');
const Users = named(() => import('./pages/Users'), 'Users');
const Receipts = named(() => import('./pages/Receipts'), 'Receipts');
const ActivityLogs = named(() => import('./pages/ActivityLogs'), 'ActivityLogs');
const Mixes = named(() => import('./pages/Mixes'), 'Mixes');
const SoldProducts = named(() => import('./pages/SoldProducts'), 'SoldProducts');

const routes: { path: string; Page: React.ComponentType }[] = [
  { path: '/', Page: Home },
  { path: '/pos', Page: POS },
  { path: '/safe', Page: Safe },
  { path: '/products', Page: Products },
  { path: '/categories', Page: Categories },
  { path: '/inventory', Page: Inventory },
  { path: '/debts', Page: Debts },
  { path: '/companies', Page: Companies },
  { path: '/expenses', Page: Expenses },
  { path: '/returns', Page: Returns },
  { path: '/exchanges', Page: Exchanges },
  { path: '/mixes', Page: Mixes },
  { path: '/sold-products', Page: SoldProducts },
  { path: '/reports', Page: Reports },
  { path: '/settings', Page: Settings },
  { path: '/users', Page: Users },
  { path: '/receipts', Page: Receipts },
  { path: '/activity', Page: ActivityLogs },
];

const PageLoader: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center" aria-busy="true">
    <div className="w-10 h-10 rounded-full border-[3px] border-indigo-600 border-t-transparent animate-spin" />
  </div>
);

const NoAccess: React.FC = () => (
  <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 font-kurdish">
    <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-4">
      <ShieldAlert className="w-8 h-8 text-rose-500" />
    </div>
    <h1 className="text-xl font-black text-slate-800 mb-1">دەسەڵاتی چوونە ناو ئەم بەشەت نییە</h1>
    <p className="text-sm text-slate-500 mb-5">ئەگەر پێویستت پێیەتی، داوا لە ئەدمین بکە دەسەڵاتت پێبدات.</p>
    <Link to="/" className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800">گەڕانەوە بۆ سەرەکی</Link>
  </div>
);

const Guarded: React.FC<{ path: string; Page: React.ComponentType }> = ({ path, Page }) => {
  const currentUser = useAppStore(s => s.currentUser);
  const location = useLocation();
  return (
    <Layout>
      <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<PageLoader />}>
          {canAccess(currentUser, path) ? <Page /> : <NoAccess />}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
};

function App() {
  const currentUser = useAppStore((state) => state.currentUser);

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <SecurityManager>
      <BrowserRouter>
        <Routes>
          {routes.map(({ path, Page }) => (
            <Route key={path} path={path} element={<Guarded path={path} Page={Page} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SecurityManager>
  );
}

export default App;
