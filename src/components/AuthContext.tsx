import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true, isAdmin: false });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data());
          } else {
            // Create profile if not exists
            const newProfile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || (user.email === 'admin@banfuly.com' ? '超级管理员' : '未命名用户'),
              role: (user.email === 'dengyanqin2015@gmail.com' || user.email === 'admin@banfuly.com') ? 'admin' : 'pending',
              createdAt: new Date().toISOString(),
            };
            try {
              await setDoc(doc(db, 'users', user.uid), newProfile);
              setProfile(newProfile);
            } catch (error) {
              console.error('Failed to auto-create user document in AuthContext:', error);
              // Even if creation fails (permissions etc), fallback to local state for the current session to avoid blank screens
              setProfile(newProfile);
            }
          }
        } catch (error) {
          console.error("Failed to fetch user profile:", error);
          // Auto-fallback: if offline, treat as logged in with some minimal profile so app doesn't stall completely
          setProfile({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || 'Offline User',
            role: (user.email === 'dengyanqin2015@gmail.com' || user.email === 'admin@banfuly.com') ? 'admin' : 'pending',
          });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin: profile?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
