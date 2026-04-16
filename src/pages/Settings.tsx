import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { UserPlus, Globe, Workflow, ShieldCheck, Trash2, Plus, Store, ListChecks, ChevronUp, ChevronDown, GripVertical, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Reorder } from 'motion/react';

export const Settings: React.FC = () => {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<any>({
    channels: {}, // { "拼多多": { shops: [], sop: [] } }
    opportunitySources: ['爆款复刻', '竞品监控', '趋势发现', '站内商机'], // Default sources
    linkJudgments: [
      { label: '待设置', definition: '尚未进行链接判定的商品' },
      { label: '滞销', definition: '上架后无销量或销量极低的商品' },
      { label: '动销', definition: '有稳定销量但未达爆款标准的商品' },
      { label: '小爆', definition: '销量增长迅速，具有爆款潜力的商品' },
      { label: '大爆', definition: '销量极高，处于爆发期的核心商品' },
    ],
  });
  const [users, setUsers] = useState<any[]>([]);
  const [newChannel, setNewChannel] = useState('');
  const [newShop, setNewShop] = useState('');
  const [newSop, setNewSop] = useState('');
  const [newSource, setNewSource] = useState(''); // New state for adding source
  const [newJudgment, setNewJudgment] = useState({ label: '', definition: '', color: '#86868B' }); // New state for judgment
  const [activeChannel, setActiveChannel] = useState<string | null>(null);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const migrated: any = { 
          channels: data.channels || {},
          opportunitySources: data.opportunitySources || ['爆款复刻', '竞品监控', '趋势发现', '站内商机'],
          linkJudgments: (data.linkJudgments || [
            { label: '待设置', definition: '尚未进行链接判定的商品', color: '#86868B' },
            { label: '滞销', definition: '上架后无销量或销量极低的商品', color: '#3B82F6' },
            { label: '动销', definition: '有稳定销量但未达爆款标准的商品', color: '#10B981' },
            { label: '小爆', definition: '销量增长迅速，具有爆款潜力的商品', color: '#F59E0B' },
            { label: '大爆', definition: '销量极高，处于爆发期的核心商品', color: '#EF4444' },
          ]).map((j: any) => ({
            ...j,
            color: j.color || '#86868B'
          }))
        };
        
        // Migrate old format (array of strings) to new format (object with shops and sop)
        if (Array.isArray(data.channels)) {
          migrated.channels = {};
          data.channels.forEach((c: string) => {
            migrated.channels[c] = { shops: [], sop: ['上架', '测款', '加购', '晒图', '内销', '全站'] };
          });
        }

        // Migrate shops from string array to object array with owners
        Object.keys(migrated.channels).forEach(c => {
          if (Array.isArray(migrated.channels[c].shops)) {
            migrated.channels[c].shops = migrated.channels[c].shops.map((s: any) => {
              if (typeof s === 'string') return { name: s, owners: [] };
              return s;
            });
          }
        });

        setSettings(migrated);
      }
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSettings();
      unsubUsers();
    };
  }, []);

  const saveSettings = async (newSettings: any) => {
    await setDoc(doc(db, 'settings', 'global'), newSettings);
    toast.success('设置已保存');
  };

  const handleAddChannel = () => {
    if (!newChannel) return;
    const updated = {
      ...settings,
      channels: {
        ...settings.channels,
        [newChannel]: { shops: [], sop: ['上架', '测款', '加购', '晒图', '内销', '全站'] }
      }
    };
    saveSettings(updated);
    setNewChannel('');
  };

  const handleRemoveChannel = (channel: string) => {
    const updated = { ...settings };
    delete updated.channels[channel];
    saveSettings(updated);
    if (activeChannel === channel) setActiveChannel(null);
  };

  const handleAddShop = () => {
    if (!activeChannel || !newShop) return;
    const updated = { ...settings };
    updated.channels[activeChannel].shops.push({ name: newShop, owners: [] });
    saveSettings(updated);
    setNewShop('');
  };

  const handleRemoveShop = (channel: string, index: number) => {
    const updated = { ...settings };
    updated.channels[channel].shops = updated.channels[channel].shops.filter((_: any, i: number) => i !== index);
    saveSettings(updated);
  };

  const toggleShopOwner = (channel: string, shopIndex: number, userEmail: string) => {
    const updated = { ...settings };
    const shop = updated.channels[channel].shops[shopIndex];
    if (shop.owners.includes(userEmail)) {
      shop.owners = shop.owners.filter((e: string) => e !== userEmail);
    } else {
      shop.owners.push(userEmail);
    }
    saveSettings(updated);
  };

  const handleAddSop = () => {
    if (!activeChannel || !newSop) return;
    const updated = { ...settings };
    updated.channels[activeChannel].sop.push(newSop);
    saveSettings(updated);
    setNewSop('');
  };

  const handleRemoveSop = (channel: string, index: number) => {
    const updated = { ...settings };
    updated.channels[channel].sop = updated.channels[channel].sop.filter((_: any, i: number) => i !== index);
    saveSettings(updated);
  };

  const handleReorderSop = (channel: string, newSop: string[]) => {
    const updated = { ...settings };
    updated.channels[channel].sop = newSop;
    saveSettings(updated);
  };

  const handleAddSource = () => {
    if (!newSource) return;
    const updated = { ...settings };
    if (!updated.opportunitySources) updated.opportunitySources = [];
    updated.opportunitySources.push(newSource);
    saveSettings(updated);
    setNewSource('');
  };

  const handleRemoveSource = (index: number) => {
    const updated = { ...settings };
    updated.opportunitySources = updated.opportunitySources.filter((_: any, i: number) => i !== index);
    saveSettings(updated);
  };

  const handleAddJudgment = () => {
    if (!newJudgment.label) return;
    const updated = { ...settings };
    if (!updated.linkJudgments) updated.linkJudgments = [];
    updated.linkJudgments.push(newJudgment);
    saveSettings(updated);
    setNewJudgment({ label: '', definition: '', color: '#86868B' });
  };

  const handleUpdateJudgmentColor = (index: number, newColor: string) => {
    const updated = { ...settings };
    updated.linkJudgments[index].color = newColor;
    saveSettings(updated);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-2xl font-bold">权限不足</h2>
        <p className="text-gray-500">仅管理员可以访问系统设置页面。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">系统设置</h1>
          <p className="text-xs text-[#86868B] mt-1">System Configuration · 渠道、店铺及 SOP 配置</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Channel Management */}
        <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
          <div className="p-6 border-b border-black/5 bg-[#F5F5F7]/30">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Globe size={18} className="text-blue-500" />
              渠道管理
            </h3>
          </div>
          <div className="p-4 space-y-2">
            {Object.keys(settings.channels || {}).map(channel => (
              <div 
                key={channel} 
                onClick={() => setActiveChannel(channel)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${activeChannel === channel ? 'bg-[#FF6B00] text-white' : 'bg-[#F5F5F7] hover:bg-gray-200'}`}
              >
                <span className="text-sm font-bold">{channel}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleRemoveChannel(channel); }}
                  className={`p-1 rounded-lg ${activeChannel === channel ? 'hover:bg-white/20' : 'hover:bg-red-100 text-red-500'}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <Input 
                placeholder="新增渠道" 
                value={newChannel} 
                onChange={e => setNewChannel(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
              <Button onClick={handleAddChannel} size="sm" className="bg-[#1D1D1F] text-white rounded-xl">添加</Button>
            </div>
          </div>
        </div>

        {/* Shop & SOP Management */}
        <div className="lg:col-span-2 space-y-6">
          {activeChannel ? (
            <>
              <div className="bg-white rounded-[24px] shadow-sm border border-black/5 p-6">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-6">
                  <Store size={18} className="text-[#FF6B00]" />
                  [{activeChannel}] 店铺设置
                </h3>
                <div className="space-y-3 mb-4">
                  {settings.channels[activeChannel].shops.map((shop: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-[#F5F5F7] border border-black/5 group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-[#1D1D1F]">{shop.name}</span>
                        <button onClick={() => handleRemoveShop(activeChannel, i)} className="p-1 text-[#86868B] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-[#86868B] font-bold mr-1 self-center">负责人:</span>
                        {users.map(user => {
                          const isOwner = shop.owners?.includes(user.email);
                          return (
                            <button 
                              key={user.id} 
                              onClick={() => toggleShopOwner(activeChannel, i, user.email)}
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-md border transition-all",
                                isOwner 
                                  ? "bg-[#FF6B00] text-white border-[#FF6B00]" 
                                  : "bg-white text-[#86868B] border-black/10 hover:border-[#FF6B00]/50"
                              )}
                            >
                              {user.displayName || user.email?.split('@')[0]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 max-w-sm">
                  <Input 
                    placeholder="新增店铺名称" 
                    value={newShop} 
                    onChange={e => setNewShop(e.target.value)}
                    className="h-9 rounded-xl text-xs"
                  />
                  <Button onClick={handleAddShop} size="sm" className="bg-[#1D1D1F] text-white rounded-xl">添加</Button>
                </div>
              </div>

              <div className="bg-white rounded-[24px] shadow-sm border border-black/5 p-6">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-6">
                  <ListChecks size={18} className="text-green-500" />
                  [{activeChannel}] SOP 环节配置
                </h3>
                <Reorder.Group 
                  axis="y" 
                  values={settings.channels[activeChannel].sop} 
                  onReorder={(newOrder) => handleReorderSop(activeChannel, newOrder)}
                  className="space-y-2 mb-4"
                >
                  {settings.channels[activeChannel].sop.map((step: string, i: number) => (
                    <Reorder.Item 
                      key={step} 
                      value={step}
                      className="px-4 py-3 rounded-xl bg-[#F5F5F7] text-[#1D1D1F] text-sm font-bold flex items-center gap-3 border border-black/5 group cursor-grab active:cursor-grabbing hover:bg-white hover:shadow-md transition-all"
                    >
                      <GripVertical size={16} className="text-[#86868B] opacity-50 group-hover:opacity-100" />
                      <span className="flex-1">{step}</span>
                      <button onClick={() => handleRemoveSop(activeChannel, i)} className="p-1.5 text-[#86868B] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={16} />
                      </button>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                <div className="flex gap-2 max-w-sm">
                  <Input 
                    placeholder="新增 SOP 环节" 
                    value={newSop} 
                    onChange={e => setNewSop(e.target.value)}
                    className="h-9 rounded-xl text-xs"
                  />
                  <Button onClick={handleAddSop} size="sm" className="bg-[#1D1D1F] text-white rounded-xl">添加</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center bg-white rounded-[24px] border border-dashed border-gray-300 text-gray-400 text-sm">
              请先选择一个渠道进行配置
            </div>
          )}
        </div>

        {/* User Management */}
        <div className="lg:col-span-2 bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
          <div className="p-6 border-b border-black/5 bg-[#F5F5F7]/30">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <UserPlus size={18} className="text-purple-500" />
              账号管理
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {users.map(user => (
              <div key={user.id} className="flex items-center gap-3 p-4 bg-[#F5F5F7] rounded-2xl border border-black/5">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-[#86868B] border border-black/5">
                  {user.email?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#1D1D1F] truncate">{user.displayName || user.email}</p>
                  <p className="text-[10px] text-[#86868B] font-bold uppercase">{user.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Opportunity Source Management */}
        <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
          <div className="p-6 border-b border-black/5 bg-[#F5F5F7]/30">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Lightbulb size={18} className="text-yellow-500" />
              商机来源配置
            </h3>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex flex-wrap gap-2 mb-4">
              {(settings.opportunitySources || []).map((source: string, i: number) => (
                <div key={i} className="pl-3 pr-1 py-1.5 rounded-xl bg-[#F5F5F7] text-[#1D1D1F] text-xs font-bold flex items-center gap-1 border border-black/5 group">
                  {source}
                  <button onClick={() => handleRemoveSource(i)} className="p-1 text-[#86868B] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="新增商机来源" 
                value={newSource} 
                onChange={e => setNewSource(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
              <Button onClick={handleAddSource} size="sm" className="bg-[#1D1D1F] text-white rounded-xl">添加</Button>
            </div>
          </div>
        </div>

        {/* Link Judgment Management */}
        <div className="lg:col-span-3 bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
          <div className="p-6 border-b border-black/5 bg-[#F5F5F7]/30">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <ListChecks size={18} className="text-indigo-500" />
              链接判定配置 (Link Judgment)
            </h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {(settings.linkJudgments || []).map((j: any, i: number) => (
                <div key={i} className="p-4 rounded-2xl bg-[#F5F5F7] border border-black/5 relative group">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <div className="relative w-4 h-4 rounded-full overflow-hidden border border-black/10 flex-shrink-0">
                        <input 
                          type="color" 
                          value={j.color || '#86868B'} 
                          onChange={(e) => handleUpdateJudgmentColor(i, e.target.value)}
                          className="absolute -top-2 -left-2 w-8 h-8 cursor-pointer"
                        />
                      </div>
                      <span className="text-sm font-bold text-[#1D1D1F]" style={{ color: j.color || '#1D1D1F' }}>{j.label}</span>
                    </div>
                    <button onClick={() => {
                      const updated = { ...settings };
                      updated.linkJudgments = updated.linkJudgments.filter((_: any, idx: number) => idx !== i);
                      saveSettings(updated);
                    }} className="p-1 text-[#86868B] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-[#86868B] mt-2">{j.definition}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col md:flex-row gap-4 p-4 bg-[#F5F5F7]/50 rounded-2xl border border-dashed border-black/10">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-bold text-[#86868B] uppercase ml-1">判定名称</label>
                <Input 
                  placeholder="如：大爆" 
                  value={newJudgment.label} 
                  onChange={e => setNewJudgment({...newJudgment, label: e.target.value})}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="w-20 space-y-2">
                <label className="text-[10px] font-bold text-[#86868B] uppercase ml-1">颜色</label>
                <div className="h-10 rounded-xl border border-black/10 bg-white flex items-center justify-center relative overflow-hidden">
                  <input 
                    type="color" 
                    value={newJudgment.color} 
                    onChange={e => setNewJudgment({...newJudgment, color: e.target.value})}
                    className="absolute -top-2 -left-2 w-20 h-20 cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex-[2] space-y-2">
                <label className="text-[10px] font-bold text-[#86868B] uppercase ml-1">字段定义 (悬浮显示)</label>
                <Input 
                  placeholder="请输入该判定字段的详细定义..." 
                  value={newJudgment.definition} 
                  onChange={e => setNewJudgment({...newJudgment, definition: e.target.value})}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddJudgment} className="h-10 bg-[#1D1D1F] text-white rounded-xl px-8">
                  <Plus size={18} className="mr-2" /> 添加判定项
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
