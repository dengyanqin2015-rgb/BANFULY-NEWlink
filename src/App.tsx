import React from 'react';
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

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
    <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
  </div>;
  
  if (!user) return <Navigate to="/login" />;
  
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
