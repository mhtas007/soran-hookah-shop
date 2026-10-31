import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ShoppingCart, PackageSearch, TrendingUp, Home, Settings, FlaskConical } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { canAccess } from '../lib/access';

interface LayoutProps {
  children: React.ReactNode;
}

type NavItem = { name: string; icon: React.ElementType; path: string };

const mobileNav: NavItem[] = [
  { name: 'سەرەکی', icon: Home, path: '/' },
  { name: 'فرۆشتن', icon: ShoppingCart, path: '/pos' },
  { name: 'کاڵاکان', icon: PackageSearch, path: '/products' },
  { name: 'خەلتەکان', icon: FlaskConical, path: '/mixes' },
  { name: 'ڕاپۆرتەکان', icon: TrendingUp, path: '/reports' },
  { name: 'ڕێکخستن', icon: Settings, path: '/settings' },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const currentUser = useAppStore(state => state.currentUser);

  const visibleMobile = mobileNav.filter(item => canAccess(currentUser, item.path));

  return (
    <div className="app-shell min-h-screen">
      <main className="min-h-screen pb-20 md:pb-0">
        {children}
      </main>

      {/* ─── Bottom navigation (phones) ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] pb-safe z-50 print:hidden">
        <div className="flex justify-around items-center h-16">
          {visibleMobile.map(item => {
            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center w-full h-full space-y-1 relative"
              >
                {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-600 rounded-b-full" />}
                <Icon className={`w-6 h-6 transition-all duration-200 ${isActive ? 'text-indigo-600 scale-110' : 'text-slate-400'}`} />
                <span className={`text-[10px] font-bold ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>{item.name}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
