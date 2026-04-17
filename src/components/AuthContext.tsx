import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  currentCompanyId: string;
  setCurrentCompanyId: (id: string) => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true, 
  isAdmin: false,
  isSuperAdmin: false,
  currentCompanyId: 'HQ',
  setCurrentCompanyId: () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCompanyId, setCurrentCompanyId] = useState<string>('HQ');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const isSuper = user.email === 'dengyanqin2015@gmail.com' || user.email === 'admin@banfuly.com';
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Automatically upgrade legacy admins to super_admin if email matches
            if (isSuper && data.role !== 'super_admin') {
              data.role = 'super_admin';
            }
            if (!data.companyId) data.companyId = 'HQ';
            setProfile(data);
            setCurrentCompanyId(data.companyId);
          } else {
            // Create profile if not exists
            const newProfile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || (isSuper ? '平台创始人' : '未命名用户'),
              role: isSuper ? 'super_admin' : 'pending',
              companyId: isSuper ? 'HQ' : 'UNASSIGNED',
              createdAt: new Date().toISOString(),
            };
            try {
              await setDoc(doc(db, 'users', user.uid), newProfile);
              setProfile(newProfile);
              setCurrentCompanyId('HQ');
            } catch (error) {
              console.error('Failed to auto-create user document in AuthContext:', error);
              // Even if creation fails (permissions etc), fallback to local state for the current session to avoid blank screens
              setProfile(newProfile);
            }
          }
        } catch (error) {
          console.error("Failed to fetch user profile:", error);
          // Auto-fallback: if offline, treat as logged in with some minimal profile so app doesn't stall completely
          const isSuper = user.email === 'dengyanqin2015@gmail.com' || user.email === 'admin@banfuly.com';
          setProfile({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || 'Offline User',
            role: isSuper ? 'super_admin' : 'pending',
            companyId: 'HQ'
          });
          setCurrentCompanyId('HQ');
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = isSuperAdmin || profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAdmin, 
      isSuperAdmin,
      currentCompanyId,
      setCurrentCompanyId 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
