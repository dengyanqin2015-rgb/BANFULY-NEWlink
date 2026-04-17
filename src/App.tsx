import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { Planning } from './pages/Planning';
import { ProductManagement } from './pages/ProductManagement';
import { BentoProgress } from './pages/BentoProgress';
import { Brainstorming } from './pages/Brainstorming';
import { Settings } from './pages/Settings';
import { Toaster } from '@/components/ui/sonner';
import { Building2, ShieldAlert, LogOut } from 'lucide-react';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PendingApproval: React.FC = () => {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  useEffect(() => {
    const fetchCompanies = async () => {
      const snap = await getDocs(collection(db, 'companies'));
      setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchCompanies();
  }, []);

  const handleApply = async () => {
    if (!selectedCompanyId || !profile?.uid) return;
    await setDoc(doc(db, 'users', profile.uid), { companyId: selectedCompanyId }, { merge: true });
    window.location.reload();
  };

  const isRejected = profile?.role === 'rejected';

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-black/5 animate-in fade-in zoom-in-95">
        <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert size={32} />
        </div>
        
        {isRejected ? (
           <>
             <h2 className="text-2xl font-bold mb-2 text-[#1D1D1F]">账号已封停/拒绝</h2>
             <p className="text-[#86868B] mb-8 text-sm leading-relaxed">您的账号访问权限已被总部或管理员拒绝。如果有异议，请联系主管处理。</p>
           </>
        ) : profile?.companyId === 'UNASSIGNED' ? (
          <>
            <h2 className="text-2xl font-bold mb-2 text-[#1D1D1F]">选择您的归属公司</h2>
            <p className="text-[#86868B] mb-8 text-sm leading-relaxed">请选择您所属的公司/分公司，提交申请后等待管理员审核通过即可进入系统。</p>
            <div className="space-y-4 text-left">
              <label className="text-xs font-bold text-[#86868B] uppercase">选择公司机构</label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-full h-12 rounded-xl bg-[#F5F5F7] border-none font-medium">
                  <SelectValue placeholder="点击下拉选择公司" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleApply} 
                disabled={!selectedCompanyId}
                className="w-full h-12 rounded-xl bg-[#FF6B00] hover:bg-[#E66000] text-white font-bold mt-4"
              >
                提交加入申请
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-2 text-[#1D1D1F]">正在等待审核</h2>
            <p className="text-[#86868B] mb-8 text-sm leading-relaxed">
              您已申请加入 <span className="font-bold text-[#1D1D1F]">{companies.find(c => c.id === profile?.companyId)?.name || '该公司'}</span>。<br/>
              请耐心等待该公司管理员审批您的账号。
            </p>
            <div className="animate-pulse flex justify-center text-[#FF6B00]">
               <div className="w-2 h-2 bg-current rounded-full mx-1"></div>
               <div className="w-2 h-2 bg-current rounded-full mx-1 animation-delay-200"></div>
               <div className="w-2 h-2 bg-current rounded-full mx-1 animation-delay-400"></div>
            </div>
          </>
        )}

        <Button 
          variant="ghost" 
          className="mt-8 text-[#86868B] hover:text-[#1D1D1F]"
          onClick={() => auth.signOut()}
        >
          <LogOut size={16} className="mr-2" /> 退出并换个账号
        </Button>
      </div>
    </div>
  );
};

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, profile } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
    <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
  </div>;
  
  if (!user) return <Navigate to="/login" />;

  if (profile && (profile.role === 'pending' || profile.role === 'rejected' || profile.companyId === 'UNASSIGNED')) {
    return <PendingApproval />;
  }
  
  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
          <Route path="/planning" element={<AuthGuard><Planning /></AuthGuard>} />
          <Route path="/products" element={<AuthGuard><ProductManagement /></AuthGuard>} />
          <Route path="/progress" element={<AuthGuard><BentoProgress /></AuthGuard>} />
          <Route path="/brainstorming" element={<AuthGuard><Brainstorming /></AuthGuard>} />
          <Route path="/brainstorming/:id" element={<AuthGuard><Brainstorming /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </AuthProvider>
  );
}
