import React, { useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [realName, setRealName] = useState('');
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'pending') {
        // Stay on login page but show pending message
      } else {
        navigate('/');
      }
    }
  }, [user, profile, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    
    if (!trimmedUsername || !trimmedPassword) {
      toast.error('请输入账号和密码');
      return;
    }
    if (!isLogin && !realName.trim()) {
      toast.error('请输入真实姓名');
      return;
    }

    setLoading(true);
    const email = `${trimmedUsername}@banfuly.com`;

    try {
      if (isLogin) {
        try {
          await signInWithEmailAndPassword(auth, email, trimmedPassword);
          toast.success('登录成功');
        } catch (loginError: any) {
          if (trimmedUsername === 'admin' && trimmedPassword === 'admin123' && (loginError.code === 'auth/user-not-found' || loginError.code === 'auth/invalid-credential')) {
            // Auto-create admin account silently if it doesn't exist
            try {
              const userCredential = await createUserWithEmailAndPassword(auth, email, trimmedPassword);
              await updateProfile(userCredential.user, { displayName: '超级管理员' });
              
              const newProfile = {
                uid: userCredential.user.uid,
                email: email,
                username: trimmedUsername,
                displayName: '超级管理员',
                role: 'super_admin',
                companyId: 'HQ',
                createdAt: new Date().toISOString(),
                permissions: []
              };
              await setDoc(doc(db, 'users', userCredential.user.uid), newProfile);
              toast.success('管理员账户已成功初始化并登录');
            } catch (createError: any) {
              if (createError.code === 'auth/email-already-in-use') {
                 toast.error('管理员账号密码不正确 (Admin account already exists with a different password).');
                 throw createError;
              } else {
                 throw createError;
              }
            }
          } else {
            throw loginError;
          }
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, trimmedPassword);
        await updateProfile(userCredential.user, {
          displayName: realName.trim()
        });
        
        const isSuper = email === 'dengyanqin2015@gmail.com' || trimmedUsername === 'admin' || email === 'admin@banfuly.com';
        
        // Create user profile in Firestore
        const newProfile = {
          uid: userCredential.user.uid,
          email: email,
          username: trimmedUsername,
          displayName: realName.trim(),
          role: isSuper ? 'super_admin' : 'pending',
          companyId: isSuper ? 'HQ' : 'UNASSIGNED',
          createdAt: new Date().toISOString(),
          permissions: []
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), newProfile);
        
        toast.success(trimmedUsername === 'admin' ? '系统管理员注册成功' : '注册成功，请等待管理员审核');
      }
    } catch (error: any) {
      console.error('Auth error', error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('该账号已被注册');
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        toast.error('账号或密码错误');
      } else {
        toast.error((isLogin ? '登录失败: ' : '注册失败: ') + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (user && profile?.role === 'pending') {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] w-full max-w-md text-center border border-black/5"
        >
          <div className="w-16 h-16 bg-orange-100 rounded-[20px] flex items-center justify-center text-orange-500 mx-auto mb-8">
            <Package size={32} />
          </div>
          <h1 className="text-2xl font-bold mb-2 text-[#1D1D1F] tracking-tight">
            等待审核
          </h1>
          <p className="text-[#86868B] mb-8 text-sm font-medium">
            您的账号已注册成功，请联系管理员为您分配店铺权限并审核通过。
          </p>
          <Button 
            onClick={() => auth.signOut()}
            className="w-full h-12 bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F] rounded-xl text-sm font-bold transition-all duration-300"
          >
            退出登录
          </Button>
        </motion.div>
      </div>
    );
  }

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
          {isLogin ? '系统登录' : '注册账号'}
        </h1>
        <p className="text-[#86868B] mb-8 text-sm font-medium">
          {isLogin ? '欢迎回来，请输入您的账号和密码' : '请输入您的拼音账号和真实姓名'}
        </p>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1 text-left">
            <label className="text-xs font-bold text-[#86868B] ml-1">账号 (拼音/字母)</label>
            <Input 
              placeholder="例如: zhangsan" 
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
              className="h-12 rounded-xl bg-[#F5F5F7] border-none px-4"
            />
          </div>

          {!isLogin && (
            <div className="space-y-1 text-left">
              <label className="text-xs font-bold text-[#86868B] ml-1">真实姓名 (中文)</label>
              <Input 
                placeholder="例如: 张三" 
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                className="h-12 rounded-xl bg-[#F5F5F7] border-none px-4"
              />
            </div>
          )}

          <div className="space-y-1 text-left">
            <label className="text-xs font-bold text-[#86868B] ml-1">密码</label>
            <Input 
              type="password"
              placeholder="请输入密码" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl bg-[#F5F5F7] border-none px-4"
            />
          </div>

          <Button 
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#1D1D1F] hover:bg-black text-white rounded-xl text-sm font-bold transition-all duration-300 mt-4 shadow-lg shadow-black/10"
          >
            {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
          </Button>
        </form>

        <div className="mt-6 text-sm text-[#86868B]">
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-[#FF6B00] font-bold ml-1 hover:underline"
          >
            {isLogin ? '立即注册' : '返回登录'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
