import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Target, Package, LayoutGrid, Settings, LogOut, Lightbulb, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { auth, db } from '@/lib/firebase';
import { collection, onSnapshot, setDoc, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthContext';

const navItems = [
  { name: '数据大屏', icon: LayoutDashboard, path: '/' },
  { name: '上新规划', icon: Target, path: '/planning' },
  { name: '链接管理', icon: Package, path: '/products' },
  { name: '进度监控', icon: LayoutGrid, path: '/progress' },
  { name: '头脑风暴', icon: Lightbulb, path: '/brainstorming' },
  { name: '系统设置', icon: Settings, path: '/settings' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, isSuperAdmin, currentCompanyId, setCurrentCompanyId } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    // Optional bootstrap if companies collection empty
    const bootstrapCompanies = async () => {
      try {
        if (!isSuperAdmin) return;
        const hqDoc = await getDoc(doc(db, 'companies', 'HQ'));
        if (!hqDoc.exists()) {
          await setDoc(doc(db, 'companies', 'HQ'), { name: '总公司 (HQ)', createdAt: new Date().toISOString() });
          await setDoc(doc(db, 'companies', 'branch_001'), { name: '演示分公司', createdAt: new Date().toISOString() });
        }

        // Data Migration: Set missing companyId to 'HQ'
        const collectionsToMigrate = ['plannings', 'products', 'mindmaps', 'users'];
        for (const col of collectionsToMigrate) {
          try {
            const snap = await getDocs(collection(db, col));
            const batch = writeBatch(db);
            let count = 0;
            snap.forEach(d => {
              if (col === 'users') {
                 // don't overwrite if it already exists. For users, some might have companyId.
                 if (!d.data().companyId) {
                   batch.update(d.ref, { companyId: 'HQ' });
                   count++;
                 }
              } else {
                 if (!d.data().companyId) {
                   batch.update(d.ref, { companyId: 'HQ' });
                   count++;
                 }
              }
            });
            if (count > 0) {
              await batch.commit();
              console.log(`Migrated ${count} docs in ${col} to HQ`);
            }
          } catch(e) {
            console.error('Migration failed for', col, e);
          }
        }
      } catch (e) {
        console.error('Bootstrap failed', e);
      }
    };
    bootstrapCompanies();

    const unsub = onSnapshot(collection(db, 'companies'), (snapshot) => {
      setCompanies(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isSuperAdmin]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const currentCompanyName = companies.find(c => c.id === currentCompanyId)?.name || '新品中心';

  return (
    <div className="h-screen overflow-hidden bg-[#F5F5F7] flex text-[#1D1D1F] font-sans flex-col">
      {/* Top Warning Banner for SuperAdmin in Branch */}
      {isSuperAdmin && currentCompanyId !== 'HQ' && (
        <div className="bg-[#FF6B00] text-white text-xs font-semibold py-1.5 px-4 text-center tracking-wide flex items-center justify-center gap-2 flex-shrink-0">
          <Building2 size={14} />
          上帝模式：您当前正在审查【{companies.find(c => c.id === currentCompanyId)?.name || currentCompanyId}】的数据
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-[220px] bg-white/70 backdrop-blur-[20px] border-r border-black/10 flex flex-col shrink-0">
          <div className="p-8 pb-8">
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2.5 whitespace-nowrap overflow-hidden text-ellipsis">
              <div className="w-7 h-7 bg-[#FF6B00] rounded-lg flex items-center justify-center text-white shrink-0">
                <Package size={18} />
              </div>
              <span className="truncate">{currentCompanyName}</span>
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

          <div className="p-4 border-t border-gray-100 flex flex-col gap-2">
            {isSuperAdmin && (
              <div className="mb-2 px-2">
                <p className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1"><Building2 size={12}/>组织切换</p>
                <select 
                  className="w-full text-sm bg-[#F5F5F7] border-black/5 rounded-lg py-1.5 px-2 focus:ring-[#FF6B00] outline-none"
                  value={currentCompanyId}
                  onChange={(e) => setCurrentCompanyId(e.target.value)}
                >
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 uppercase">
                {profile?.displayName?.[0] || profile?.email?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{profile?.displayName || profile?.email?.split('@')[0]}</p>
                <p className="text-xs text-gray-400 tracking-wider">{(profile?.role === 'super_admin' ? 'SYSTEM ADMIN' : profile?.role).toUpperCase()}</p>
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
        <main className="flex-1 p-6 md:p-8 overflow-y-auto min-w-0">
          <div className="w-full mx-auto max-w-[2000px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
