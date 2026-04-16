import React, { useEffect, useState } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from '@/components/ui/button';
import { Package } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('登录成功');
    } catch (error: any) {
      console.error('Auth error', error);
      toast.error('登录失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-10 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] w-full max-w-md text-center border border-black/5"
      >
        <div className="w-16 h-16 bg-[#FF6B00] rounded-[20px] flex items-center justify-center text-white mx-auto mb-8 shadow-2xl shadow-[#FF6B00]/20">
          <Package size={32} />
        </div>
        
        <h1 className="text-2xl font-bold mb-2 text-[#1D1D1F] tracking-tight">
          系统登录
        </h1>
        <p className="text-[#86868B] mb-8 text-sm font-medium">
          请使用 Google 账号登录系统
        </p>

        <Button 
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full h-12 bg-[#1D1D1F] hover:bg-black text-white rounded-xl text-sm font-bold transition-all duration-300 mt-4 shadow-lg shadow-black/10"
        >
          {loading ? '处理中...' : '使用 Google 账号登录'}
        </Button>
      </motion.div>
    </div>
  );
};
