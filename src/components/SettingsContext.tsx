import React, { createContext, useContext, useEffect, useState } from 'react';
import { onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';

interface SettingsContextType {
  settings: any;
  loading: boolean;
}

const defaultSettings = { 
  channels: {},
  opportunitySources: ['爆款复刻', '竞品监控', '趋势发现', '站内商机'],
  linkJudgments: [
    { label: '待设置', definition: '尚未进行链接判定的商品', color: '#86868B' },
    { label: '滞销', definition: '上架后无销量或销量极低的商品', color: '#3B82F6' },
    { label: '动销', definition: '有稳定销量但未达爆款标准的商品', color: '#10B981' },
    { label: '小爆', definition: '销量增长迅速，具有爆款潜力的商品', color: '#F59E0B' },
    { label: '大爆', definition: '销量极高，处于爆发期的核心商品', color: '#EF4444' },
  ]
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  loading: true,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentCompanyId } = useAuth();
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentCompanyId) return;

    const settingDocId = currentCompanyId !== 'HQ' ? currentCompanyId : 'global';
    
    const unsubSettings = onSnapshot(doc(db, 'settings', settingDocId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({ ...defaultSettings, ...data });
        setLoading(false);
      } else if (currentCompanyId !== 'HQ') {
        // Fallback to global if branch settings don't exist yet
        getDoc(doc(db, 'settings', 'global')).then(g => {
          if (g.exists()) {
            const data = g.data();
            setSettings({ ...defaultSettings, ...data });
          } else {
            setSettings(defaultSettings);
          }
          setLoading(false);
        });
      } else {
        setSettings(defaultSettings);
        setLoading(false);
      }
    });

    return () => unsubSettings();
  }, [currentCompanyId]);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
