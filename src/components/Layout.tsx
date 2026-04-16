import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Target, Package, LayoutGrid, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthContext';

const navItems = [
  { name: '数据大屏', icon: LayoutDashboard, path: '/' },
  { name: '上新规划', icon: Target, path: '/planning' },
  { name: '链接管理', icon: Package, path: '/products' },
  { name: '进度监控', icon: LayoutGrid, path: '/progress' },
  { name: '系统设置', icon: Settings, path: '/settings' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex text-[#1D1D1F] font-sans">
      {/* Sidebar */}
      <aside className="w-[220px] bg-white/70 backdrop-blur-[20px] border-r border-black/10 flex flex-col sticky top-0 h-screen">
        <div className="p-8 pb-10">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2.5 whitespace-nowrap">
            <div className="w-7 h-7 bg-[#FF6B00] rounded-lg flex items-center justify-center text-white">
              <Package size={18} />
            </div>
            Banfuly新品中心
          </h1>
        </div>

        <nav className="flex-1 px-5 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-sm font-medium",
                  isActive 
                    ? "bg-white text-[#FF6B00] shadow-[0_4px_12px_rgba(0,0,0,0.05)]" 
                    : "text-[#86868B] hover:text-[#1D1D1F] hover:bg-white/50"
                )}
              >
                <item.icon size={18} className={cn(isActive ? "text-[#FF6B00]" : "text-[#86868B] group-hover:text-[#1D1D1F]")} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 uppercase">
              {profile?.displayName?.[0] || profile?.email?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.displayName || profile?.email?.split('@')[0]}</p>
              <p className="text-xs text-gray-400 uppercase tracking-wider">{profile?.role}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
            onClick={handleLogout}
          >
            <LogOut size={20} />
            <span>退出登录</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 overflow-auto min-w-0">
        <div className="w-full mx-auto max-w-[2000px]">
          {children}
        </div>
      </main>
    </div>
  );
};
