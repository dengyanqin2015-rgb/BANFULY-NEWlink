import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, limit, getDoc, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { logOperation } from '../lib/logger';
import { updatePassword } from 'firebase/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserPlus, Globe, Workflow, ShieldCheck, Trash2, Plus, Store, ListChecks, ChevronUp, ChevronDown, GripVertical, Lightbulb, History, CheckCircle, XCircle, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Reorder } from 'motion/react';

export const Settings: React.FC = () => {
  const { isAdmin, isSuperAdmin, user: currentUser, profile, currentCompanyId } = useAuth();
  const [settings, setSettings] = useState<any>({
    channels: {}, // { "拼多多": { shops: [], sop: [] } }
    opportunitySources: ['爆款复刻', '竞品监控', '趋势发现', '站内商机'], // Default sources
    linkJudgments: [
      { label: '待设置', definition: '尚未进行链接判定的商品', color: '#86868B' },
      { label: '滞销', definition: '上架后无销量或销量极低的商品', color: '#3B82F6' },
      { label: '动销', definition: '有稳定销量但未达爆款标准的商品', color: '#10B981' },
      { label: '小爆', definition: '销量增长迅速，具有爆款潜力的商品', color: '#F59E0B' },
      { label: '大爆', definition: '销量极高，处于爆发期的核心商品', color: '#EF4444' },
    ],
  });
  const [users, setUsers] = useState<any[]>([]);
  const [globalUsers, setGlobalUsers] = useState<any[]>([]);
  const [globalUserSearch, setGlobalUserSearch] = useState('');
  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [newChannel, setNewChannel] = useState('');
  const [newShop, setNewShop] = useState('');
  const [newSop, setNewSop] = useState('');
  const [newSource, setNewSource] = useState(''); // New state for adding source
  const [newJudgment, setNewJudgment] = useState({ label: '', definition: '', color: '#86868B' }); // New state for judgment
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  
  // Update Password State
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const handleUpdateAdminPassword = async () => {
    if (!newAdminPassword) return toast.error('请输入新密码');
    if (newAdminPassword.length < 6) return toast.error('密码长度至少需要6位');
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newAdminPassword);
        toast.success('你的超级管理员密码已成功修改！');
        setNewAdminPassword('');
      } else {
        toast.error('未能获取到当前登录态');
      }
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
         toast.error('出于安全策略保护：请退出账号重新登录一次后再进行密码修改操作！');
      } else {
         toast.error('修改失败：' + err.message);
      }
    }
  };

  // Log filters
  const [logDateFilter, setLogDateFilter] = useState('7'); // days
  const [logUserFilter, setLogUserFilter] = useState('all');
  
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; title?: string; message?: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    const settingDocId = currentCompanyId !== 'HQ' ? currentCompanyId : 'global';
    
    // First setup unsub to listen to current setting doc
    const unsubSettings = onSnapshot(doc(db, 'settings', settingDocId), async (docSnap) => {
      let data = docSnap.data();
      
      // If it doesn't exist but we are in a sub-company, fallback to global
      if (!docSnap.exists() && currentCompanyId !== 'HQ') {
        const globalDoc = await getDoc(doc(db, 'settings', 'global'));
        if (globalDoc.exists()) {
          data = globalDoc.data();
        }
      }

      if (data) {
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

    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('companyId', '==', currentCompanyId)), (snapshot) => {
      setUsers(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
    });

    let unsubLogs = () => {};
    let unsubGlobalUsers = () => {};
    let unsubAllCompanies = () => {};

    if (isAdmin || isSuperAdmin) {
      const qLogs = query(collection(db, 'logs'), where('companyId', '==', currentCompanyId), orderBy('timestamp', 'desc'), limit(500));
      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        setLogs(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        console.error('Logs index might be missing, falling back to client-side filtering', error);
        // Fallback without orderBy if index is missing
        const fallbackQuery = query(collection(db, 'logs'), where('companyId', '==', currentCompanyId), limit(1000));
        unsubLogs = onSnapshot(fallbackQuery, (fallbackSnapshot) => {
           const logData = fallbackSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
           logData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
           setLogs(logData.slice(0, 500));
        });
      });
    }

    if (isSuperAdmin) {
      unsubGlobalUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setGlobalUsers(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
      });
      unsubAllCompanies = onSnapshot(collection(db, 'companies'), (snapshot) => {
        setAllCompanies(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
      });
    }

    return () => {
      unsubSettings();
      unsubUsers();
      unsubLogs();
      unsubGlobalUsers();
      unsubAllCompanies();
    };
  }, [currentCompanyId, isAdmin, isSuperAdmin]);

  const saveSettings = async (newSettings: any) => {
    const settingDocId = currentCompanyId !== 'HQ' ? currentCompanyId : 'global';
    await setDoc(doc(db, 'settings', settingDocId), newSettings);
    toast.success('设置已保存');
  };

  const handleAddChannel = async () => {
    if (!newChannel) return;
    const updated = {
      ...settings,
      channels: {
        ...settings.channels,
        [newChannel]: { shops: [], sop: ['上架', '测款', '加购', '晒图', '内销', '全站'] }
      }
    };
    await saveSettings(updated);
    await logOperation('UPDATE', 'SYSTEM', 'channels', `添加渠道: ${newChannel}`, profile);
    setNewChannel('');
  };

  const handleRemoveChannel = async (channel: string) => {
    const updated = { ...settings };
    delete updated.channels[channel];
    await saveSettings(updated);
    await logOperation('DELETE', 'SYSTEM', 'channels', `删除渠道: ${channel}`, profile);
    if (activeChannel === channel) setActiveChannel(null);
  };

  const handleAddShop = async () => {
    if (!activeChannel || !newShop || !settings.channels?.[activeChannel]) return;
    const updated = { ...settings };
    if (!updated.channels[activeChannel].shops) updated.channels[activeChannel].shops = [];
    updated.channels[activeChannel].shops.push({ name: newShop, owners: [] });
    await saveSettings(updated);
    await logOperation('UPDATE', 'SYSTEM', 'shops', `在 ${activeChannel} 中添加店铺: ${newShop}`, profile);
    setNewShop('');
  };

  const handleRemoveShop = async (channel: string, index: number) => {
    if (!settings.channels?.[channel]?.shops) return;
    const updated = { ...settings };
    const removedShop = updated.channels[channel].shops[index];
    if (!removedShop) return;
    updated.channels[channel].shops = updated.channels[channel].shops.filter((_: any, i: number) => i !== index);
    await saveSettings(updated);
    await logOperation('DELETE', 'SYSTEM', 'shops', `从 ${channel} 中删除店铺: ${removedShop.name}`, profile);
  };

  const toggleShopOwner = async (channel: string, shopIndex: number, userEmail: string) => {
    if (!settings.channels?.[channel]?.shops) return;
    const updated = { ...settings };
    const shop = updated.channels[channel].shops[shopIndex];
    if (!shop) return;
    if (!shop.owners) shop.owners = [];
    if (shop.owners.includes(userEmail)) {
      shop.owners = shop.owners.filter((e: string) => e !== userEmail);
    } else {
      shop.owners.push(userEmail);
    }
    await saveSettings(updated);
  };

  const handleAddSop = async () => {
    if (!activeChannel || !newSop || !settings.channels?.[activeChannel]) return;
    const updated = { ...settings };
    if (!updated.channels[activeChannel].sop) updated.channels[activeChannel].sop = [];
    updated.channels[activeChannel].sop.push(newSop);
    await saveSettings(updated);
    await logOperation('UPDATE', 'SYSTEM', 'sop', `在 ${activeChannel} 中添加SOP节点: ${newSop}`, profile);
    setNewSop('');
  };

  const handleRemoveSop = async (channel: string, index: number) => {
    if (!settings.channels?.[channel]?.sop) return;
    const updated = { ...settings };
    const removedSop = updated.channels[channel].sop[index];
    if (!removedSop) return;
    updated.channels[channel].sop = updated.channels[channel].sop.filter((_: any, i: number) => i !== index);
    await saveSettings(updated);
    await logOperation('DELETE', 'SYSTEM', 'sop', `从 ${channel} 中删除SOP节点: ${removedSop}`, profile);
  };

  const handleReorderSop = async (channel: string, newSop: string[]) => {
    if (!settings.channels?.[channel]) return;
    const updated = { ...settings };
    updated.channels[channel].sop = newSop;
    await saveSettings(updated);
  };

  const handleAddSource = async () => {
    if (!newSource) return;
    const updated = { ...settings };
    if (!updated.opportunitySources) updated.opportunitySources = [];
    updated.opportunitySources.push(newSource);
    await saveSettings(updated);
    await logOperation('UPDATE', 'SYSTEM', 'opportunitySources', `添加商机来源: ${newSource}`, profile);
    setNewSource('');
  };

  const handleRemoveSource = async (index: number) => {
    const updated = { ...settings };
    const removedSource = updated.opportunitySources[index];
    updated.opportunitySources = updated.opportunitySources.filter((_: any, i: number) => i !== index);
    await saveSettings(updated);
    await logOperation('DELETE', 'SYSTEM', 'opportunitySources', `删除商机来源: ${removedSource}`, profile);
  };

  const handleAddJudgment = async () => {
    if (!newJudgment.label) return;
    const updated = { ...settings };
    if (!updated.linkJudgments) updated.linkJudgments = [];
    updated.linkJudgments.push(newJudgment);
    await saveSettings(updated);
    await logOperation('UPDATE', 'SYSTEM', 'linkJudgments', `添加商品状态: ${newJudgment.label}`, profile);
    setNewJudgment({ label: '', definition: '', color: '#86868B' });
  };

  const handleUpdateJudgmentColor = async (index: number, newColor: string) => {
    const updated = { ...settings };
    updated.linkJudgments[index].color = newColor;
    await saveSettings(updated);
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await setDoc(doc(db, 'users', userId), { role: 'employee' }, { merge: true });
      await logOperation('UPDATE', 'SYSTEM', 'users', `审批通过用户: ${userId}`, profile || { uid: 'admin', email: 'admin' });
      toast.success('审核通过');
    } catch (error) {
      toast.error('操作失败');
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      await setDoc(doc(db, 'users', userId), { role: 'rejected' }, { merge: true });
      await logOperation('UPDATE', 'SYSTEM', 'users', `拒绝用户: ${userId}`, profile || { uid: 'admin', email: 'admin' });
      toast.success('已拒绝');
    } catch (error) {
      toast.error('操作失败');
    }
  };

  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [expandedUserPerms, setExpandedUserPerms] = useState<Record<string, boolean>>({});

  const toggleUserPerms = (userId: string) => {
    setExpandedUserPerms(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleBatchAddAllShops = (userId: string, currentPerms: any[] = []) => {
    const allShops = Object.entries(settings.channels || {}).flatMap(([c, data]: [string, any]) => 
      (data?.shops || []).map((s: any) => s.name)
    );
    const currentShopMap = new Set(currentPerms.map(p => p.shop));
    const newPerms = allShops.filter(s => !currentShopMap.has(s)).map(s => ({ shop: s, takeoverTime: new Date().toISOString().split('T')[0], canViewPast: false }));

    if (newPerms.length === 0) {
      toast.info('该员工已拥有所有店铺权限');
      return;
    }

    handleUpdateUserPermissions(userId, [...currentPerms, ...newPerms]);
  };

  const handleDeleteUser = (userId: string) => {
    setUserToDelete(userId);
  };

  const executeDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete));
      await logOperation('DELETE', 'SYSTEM', 'users', `删除用户或重置记录: ${userToDelete}`, profile || { uid: 'admin', email: 'admin' });
      toast.success('已清空该员工记录。若需重新工作，请让员工使用全新账号(如原账号后加数字)重新注册。');
      setUserToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error('删除失败');
      setUserToDelete(null);
    }
  };

  const handleUpdateUserPermissions = async (userId: string, permissions: any[]) => {
    try {
      await setDoc(doc(db, 'users', userId), { permissions }, { merge: true });
      await logOperation('UPDATE', 'SYSTEM', 'users', `更新用户权限: ${userId}`, { uid: 'admin', email: 'admin' } as any);
      toast.success('权限已更新');
    } catch (error) {
      toast.error('更新失败');
    }
  };

  const filteredLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp);
    const now = new Date();
    const diffDays = (now.getTime() - logDate.getTime()) / (1000 * 3600 * 24);
    
    if (logDateFilter !== 'all' && diffDays > parseInt(logDateFilter)) return false;
    if (logUserFilter !== 'all' && log.operatorId !== logUserFilter) return false;
    return true;
  });

  const [newCompanyName, setNewCompanyName] = useState('');

  const handleCreateCompany = async () => {
    if (!newCompanyName) return;
    try {
      const newCompanyId = `company_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'companies', newCompanyId), {
        name: newCompanyName,
        createdAt: new Date().toISOString()
      });
      await logOperation('CREATE', 'SYSTEM', 'companies', `创建新公司: ${newCompanyName}`, profile);
      setNewCompanyName('');
      toast.success('公司创建成功');
    } catch (e) {
      toast.error('创建失败');
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (companyId === 'HQ') {
      toast.error('总公司不能删除！');
      return;
    }
    // Delete company...
    try {
      await deleteDoc(doc(db, 'companies', companyId));
      await logOperation('DELETE', 'SYSTEM', 'companies', `删除公司: ${companyId}`, profile);
      toast.success('公司已删除');
    } catch(e) {
      toast.error('删除公司失败');
    }
  };

  const handleGlobalUserRoleChange = async (userId: string, newRole: string) => {
    try {
      if (newRole === 'super_admin' && !auth.currentUser?.email?.includes('@banfuly.com') && auth.currentUser?.email !== 'dengyanqin2015@gmail.com') {
         toast.error('只有创始团队可以授予 super_admin 权限！');
         return;
      }
      await setDoc(doc(db, 'users', userId), { role: newRole }, { merge: true });
      toast.success('用户权限已更改');
      await logOperation('UPDATE', 'SYSTEM', 'users', `全局更改用户权限: ${userId} -> ${newRole}`, profile);
    } catch(e) {
      toast.error('权限修改失败');
    }
  };

  const handleGlobalUserCompanyChange = async (userId: string, targetCompanyId: string) => {
    try {
      await setDoc(doc(db, 'users', userId), { companyId: targetCompanyId }, { merge: true });
      toast.success('员工已调动');
      await logOperation('UPDATE', 'SYSTEM', 'users', `全局调动用户: ${userId} -> ${targetCompanyId}`, profile);
    } catch (e) {
      toast.error('修改调动失败');
    }
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
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">系统设置</h1>
          <p className="text-xs text-[#86868B] mt-1">System Configuration · 全局配置与权限管理</p>
        </div>
      </header>

      <Tabs defaultValue="basic" className="w-full flex-col flex">
        <TabsList className="bg-white p-1 rounded-xl h-auto mb-6 shadow-sm border border-black/5 self-start flex-wrap">
          <TabsTrigger value="basic" className="rounded-lg text-sm font-bold px-8 py-2.5 data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white transition-all">基础设置</TabsTrigger>
          <TabsTrigger value="users" className="rounded-lg text-sm font-bold px-8 py-2.5 data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white transition-all">本公司员工</TabsTrigger>
          <TabsTrigger value="logs" className="rounded-lg text-sm font-bold px-8 py-2.5 data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white transition-all">操作日志</TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="global" className="rounded-lg text-sm font-bold px-8 py-2.5 data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white transition-all text-[#FF6B00] bg-orange-50 border border-orange-100 ml-2">上帝模式: 全局大盘</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="basic" className="mt-0 outline-none space-y-6">
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
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setDeleteConfirm({
                          isOpen: true,
                          title: '删除渠道',
                          message: `确定要删除渠道【${channel}】吗？此操作无法撤销。`,
                          onConfirm: () => handleRemoveChannel(channel)
                        });
                      }}
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
                      {settings.channels[activeChannel]?.shops?.map((shop: any, i: number) => (
                        <div key={i} className="p-4 rounded-xl bg-[#F5F5F7] border border-black/5 group">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-[#1D1D1F]">{shop.name}</span>
                            <button onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({
                                isOpen: true,
                                title: '删除店铺',
                                message: `确定要删除店铺【${shop.name}】吗？此操作无法撤销。`,
                                onConfirm: () => handleRemoveShop(activeChannel, i)
                              });
                            }} className="p-1 text-[#86868B] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 size={14} />
                            </button>
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
                      values={settings.channels[activeChannel]?.sop || []} 
                      onReorder={(newOrder) => handleReorderSop(activeChannel, newOrder)}
                      className="space-y-2 mb-4"
                    >
                      {(settings.channels[activeChannel]?.sop || []).map((step: string, i: number) => (
                        <Reorder.Item 
                          key={step} 
                          value={step}
                          className="px-4 py-3 rounded-xl bg-[#F5F5F7] text-[#1D1D1F] text-sm font-bold flex items-center gap-3 border border-black/5 group cursor-grab active:cursor-grabbing hover:bg-white hover:shadow-md transition-all"
                        >
                          <GripVertical size={16} className="text-[#86868B] opacity-50 group-hover:opacity-100" />
                          <span className="flex-1">{step}</span>
                          <button onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({
                              isOpen: true,
                              title: '删除 SOP',
                              message: `确定要删除 SOP 节点【${step}】吗？此操作无法撤销。`,
                              onConfirm: () => handleRemoveSop(activeChannel, i)
                            });
                          }} className="p-1.5 text-[#86868B] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({
                          isOpen: true,
                          title: '删除商机来源',
                          message: `确定要删除商机来源【${source}】吗？此操作无法撤销。`,
                          onConfirm: () => handleRemoveSource(i)
                        });
                      }} className="p-1 text-[#86868B] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
        </TabsContent>

        <TabsContent value="users" className="mt-0 outline-none space-y-6">
          <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
            <div className="p-6 border-b border-black/5 bg-[#F5F5F7]/30 flex justify-between items-center">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserPlus size={18} className="text-purple-500" />
                本公司：账号与权限管理
              </h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Pending Users */}
              {users.filter(u => u.role === 'pending').length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-[#86868B] uppercase">待审核账号</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {users.filter(u => u.role === 'pending').map(user => (
                      <div key={user.id} className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-orange-500 border border-orange-200">
                            {user.displayName?.[0] || user.username?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-[#1D1D1F] truncate">{user.displayName} ({user.username})</p>
                            <p className="text-xs text-orange-600 font-bold">等待审核</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handleApproveUser(user.id)} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white h-8 text-xs rounded-lg">
                            <CheckCircle size={14} className="mr-1" /> 通过
                          </Button>
                          <Button onClick={() => handleRejectUser(user.id)} variant="outline" className="flex-1 h-8 text-xs rounded-lg border-orange-200 text-orange-600 hover:bg-orange-100">
                            <XCircle size={14} className="mr-1" /> 拒绝
                          </Button>
                          <Button onClick={() => handleDeleteUser(user.id)} variant="outline" className="flex-none w-8 p-0 h-8 text-xs rounded-lg border-red-200 text-red-500 hover:bg-red-50">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Users */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[#86868B] uppercase">已审核账号</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {users.filter(u => u.role !== 'pending').map(user => (
                    <div key={user.id} className="p-5 bg-[#F5F5F7] rounded-2xl border border-black/5 flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-[#1D1D1F] border border-black/5 shadow-sm">
                          {user.displayName?.[0] || user.username?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#1D1D1F] truncate">{user.displayName || user.username || user.email}</p>
                          <p className={cn("text-xs font-bold uppercase", user.role === 'rejected' ? 'text-red-500' : 'text-[#86868B]')}>
                            {user.role === 'admin' ? '管理员' : user.role === 'rejected' ? '已拒绝' : '普通员工'}
                          </p>
                        </div>
                        {user.id !== currentUser?.uid && (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100" onClick={() => handleDeleteUser(user.id)}>
                              {user.role === 'admin' ? '删除此账号' : '删除并重置此员工'}
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {user.role === 'admin' && currentUser?.uid === user.id && (
                        <div className="bg-white p-4 rounded-xl border border-black/5 space-y-4">
                          <p className="text-xs font-bold text-[#1D1D1F]">修改我的超管密码</p>
                          <div className="flex gap-2">
                            <Input
                               type="password"
                               placeholder="在此输入新密码(至少6位)"
                               value={newAdminPassword}
                               onChange={(e) => setNewAdminPassword(e.target.value)}
                               className="flex-1 h-9 rounded-xl text-xs"
                            />
                            <Button size="sm" className="h-9 px-4 bg-[#1D1D1F] text-white rounded-xl" onClick={handleUpdateAdminPassword}>
                              确认修改
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {(user.role === 'employee' || user.role === 'rejected') && (
                        <div className="bg-white p-4 rounded-xl border border-black/5 space-y-4">
                          <div 
                            className="flex justify-between items-center cursor-pointer select-none group" 
                            onClick={() => toggleUserPerms(user.id)}
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-[#1D1D1F]">
                                店铺权限配置 
                                <span className="text-xs text-[#86868B] font-normal ml-1">
                                  (共 {user.permissions?.length || 0} 个)
                                </span>
                              </p>
                              <div className="text-[#86868B] group-hover:text-black transition-colors">
                                {expandedUserPerms[user.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>
                            </div>
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50"
                                onClick={() => handleBatchAddAllShops(user.id, user.permissions)}
                              >
                                <ListChecks size={12} className="mr-1" /> 批量全选
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs rounded-lg"
                                onClick={() => {
                                  const newPerm = { shop: '', takeoverTime: new Date().toISOString().split('T')[0], canViewPast: false };
                                  handleUpdateUserPermissions(user.id, [...(user.permissions || []), newPerm]);
                                  // Ensure it's expanded when adding a new permission
                                  setExpandedUserPerms(prev => ({ ...prev, [user.id]: false })); // Note: logic inverted below so false means visible if default is visible? Let's treat true as expanded.
                                  setExpandedUserPerms(prev => ({ ...prev, [user.id]: true }));
                                }}
                              >
                                <Plus size={12} className="mr-1" /> 添加权限
                              </Button>
                            </div>
                          </div>
                          
                          {expandedUserPerms[user.id] && (
                            <div className="space-y-4 pt-2">
                              {(user.permissions || []).map((perm: any, idx: number) => (
                            <div key={idx} className="flex flex-col gap-2 p-3 bg-[#F5F5F7] rounded-lg border border-black/5">
                              <div className="flex items-center gap-2">
                                <Select 
                                  value={perm.shop || ''} 
                                  onValueChange={(val) => {
                                    const newPerms = [...user.permissions];
                                    newPerms[idx].shop = val;
                                    handleUpdateUserPermissions(user.id, newPerms);
                                  }}
                                >
                                  <SelectTrigger className="flex-1 h-8 text-xs bg-white border-black/10">
                                    <SelectValue placeholder="选择店铺" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(settings.channels || {}).flatMap(([c, data]: [string, any]) => 
                                      (data?.shops || []).map((s: any) => (
                                        <SelectItem key={`${c}-${s.name}`} value={s.name}>{c} - {s.name}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-[#86868B] hover:text-red-500"
                                  onClick={() => {
                                    const newPerms = user.permissions.filter((_: any, i: number) => i !== idx);
                                    handleUpdateUserPermissions(user.id, newPerms);
                                  }}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="date" 
                                  value={perm.takeoverTime}
                                  onChange={(e) => {
                                    const newPerms = [...user.permissions];
                                    newPerms[idx].takeoverTime = e.target.value;
                                    handleUpdateUserPermissions(user.id, newPerms);
                                  }}
                                  className="flex-1 h-8 text-xs bg-white border-black/10"
                                />
                                <div className="flex items-center gap-2 bg-white px-2 h-8 rounded-md border border-black/10">
                                  <Switch 
                                    checked={perm.canViewPast}
                                    onCheckedChange={(checked) => {
                                      const newPerms = [...user.permissions];
                                      newPerms[idx].canViewPast = checked;
                                      handleUpdateUserPermissions(user.id, newPerms);
                                    }}
                                    className="scale-75 data-[state=checked]:bg-[#FF6B00]"
                                  />
                                  <span className="text-[10px] text-[#86868B] whitespace-nowrap">允许查看历史</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {(!user.permissions || user.permissions.length === 0) && (
                            <p className="text-xs text-[#86868B] text-center py-2">暂未配置任何店铺权限</p>
                          )}
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-0 outline-none space-y-6">
          <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
            <div className="p-6 border-b border-black/5 bg-[#F5F5F7]/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <History size={18} className="text-blue-500" />
                操作日志 (近7天)
              </h3>
              <div className="flex items-center gap-2">
                <Select value={logDateFilter} onValueChange={setLogDateFilter}>
                  <SelectTrigger className="w-[120px] h-8 text-xs bg-white border-black/10">
                    <SelectValue placeholder="时间范围" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">今天</SelectItem>
                    <SelectItem value="3">近3天</SelectItem>
                    <SelectItem value="7">近7天</SelectItem>
                    <SelectItem value="all">全部</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={logUserFilter} onValueChange={setLogUserFilter}>
                  <SelectTrigger className="w-[120px] h-8 text-xs bg-white border-black/10">
                    <SelectValue placeholder="操作人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部人员</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.displayName || u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F5F5F7] text-[#86868B] text-xs uppercase font-bold">
                    <tr>
                      <th className="px-6 py-3">时间</th>
                      <th className="px-6 py-3">操作人</th>
                      <th className="px-6 py-3">动作</th>
                      <th className="px-6 py-3">模块</th>
                      <th className="px-6 py-3">详情</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-[#86868B]">暂无操作记录</td>
                      </tr>
                    ) : (
                      filteredLogs.map(log => (
                        <tr key={log.id} className="hover:bg-[#F5F5F7]/50 transition-colors">
                          <td className="px-6 py-3 text-[#86868B] whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="px-6 py-3 font-medium text-[#1D1D1F]">{log.operatorName}</td>
                          <td className="px-6 py-3">
                            <span className={cn(
                              "px-2 py-1 rounded-md text-[10px] font-bold",
                              log.action === 'CREATE' ? "bg-green-100 text-green-700" :
                              log.action === 'UPDATE' ? "bg-blue-100 text-blue-700" :
                              log.action === 'DELETE' ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                            )}>
                              {log.action === 'CREATE' ? '新增' : log.action === 'UPDATE' ? '更新' : log.action === 'DELETE' ? '删除' : log.action}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-[#1D1D1F] font-medium">
                            {log.entity === 'PLANNING' ? '上新规划' : 
                             log.entity === 'PRODUCT' ? '链接管理' : 
                             log.entity === 'USER' ? '用户管理' : 
                             log.entity === 'SETTING' ? '系统设置' : log.entity}
                          </td>
                          <td className="px-6 py-3 text-[#86868B] max-w-md truncate" title={log.details}>{log.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="global" className="mt-0 outline-none space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Companies Management */}
              <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 border-b border-black/5 bg-orange-50/50">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-[#FF6B00]">
                    <Building2 size={18} />
                    公司/租户管理
                  </h3>
                </div>
                <div className="p-4 flex gap-2 border-b border-black/5">
                  <Input 
                    placeholder="输入新公司名称..." 
                    value={newCompanyName} 
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleCreateCompany} className="bg-[#1D1D1F] text-white">新建公司</Button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {allCompanies.map(comp => (
                    <div key={comp.id} className="flex justify-between items-center p-4 bg-[#F5F5F7] rounded-xl border border-black/5 group hover:bg-[#EAEAEA] transition-colors">
                      <div className="flex-1 mr-4">
                        <Input 
                          key={`input-${comp.id}-${comp.name}`}
                          defaultValue={comp.name}
                          onBlur={async (e) => {
                             const newName = e.target.value.trim();
                             if (newName && newName !== comp.name) {
                                try {
                                  await setDoc(doc(db, 'companies', comp.id), { name: newName }, { merge: true });
                                  await logOperation('UPDATE', 'SYSTEM', 'companies', `更名公司: ${comp.name} -> ${newName}`, profile);
                                  toast.success('公司更名成功');
                                } catch (err) {
                                  toast.error('公司更名失败');
                                }
                             }
                          }}
                          className="font-bold text-sm text-[#1D1D1F] bg-transparent border-transparent hover:border-black/10 focus:border-[#FF6B00] focus:bg-white h-8 px-2 -ml-2 transition-all w-full"
                        />
                        <p className="text-[10px] text-[#86868B] font-mono mt-1 px-0">ID: {comp.id}</p>
                      </div>
                      {comp.id !== 'HQ' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setDeleteConfirm({
                              isOpen: true,
                              title: '删除分公司',
                              message: `确定要删除公司【${comp.name}】吗？删除后该公司的所有数据仍然在底层保留，但外层无法访问。建议先将员工掉回总部！`,
                              onConfirm: () => handleDeleteCompany(comp.id)
                            });
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Global Users Management */}
              <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 border-b border-black/5 bg-purple-50/50 flex justify-between items-center">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-purple-600">
                    <UserPlus size={18} />
                    全局员工大盘监控与调度
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Input 
                        placeholder="搜索员工邮箱/姓名..." 
                        value={globalUserSearch}
                        onChange={(e) => setGlobalUserSearch(e.target.value)}
                        className="h-8 w-[200px] text-xs pl-8 rounded-lg bg-white border-black/10"
                      />
                      <UserPlus className="absolute left-2.5 top-2.5 text-purple-400" size={14} />
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {globalUsers
                    .filter(u => 
                      !globalUserSearch || 
                      u.email?.toLowerCase().includes(globalUserSearch.toLowerCase()) || 
                      u.displayName?.toLowerCase().includes(globalUserSearch.toLowerCase()) ||
                      u.username?.toLowerCase().includes(globalUserSearch.toLowerCase())
                    )
                    .map(user => (
                    <div key={user.id} className="p-4 bg-[#F5F5F7] rounded-xl border border-black/5 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                         <div>
                            <p className="font-bold text-sm text-[#1D1D1F]">
                               {user.displayName || user.username || user.email}
                               {(!user.companyId || user.companyId === 'UNASSIGNED') && (
                                 <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">待分流</span>
                               )}
                             </p>
                            <p className="text-[10px] text-[#86868B]">{user.email}</p>
                         </div>
                         <div className="flex gap-2">
                            <Select 
                              value={user.companyId || 'UNASSIGNED'}
                              onValueChange={(val) => handleGlobalUserCompanyChange(user.id, val)}
                            >
                              <SelectTrigger className="w-[120px] h-7 text-xs bg-white">
                                <SelectValue>
                                   {user.companyId === 'UNASSIGNED' || !user.companyId 
                                     ? '未分配公司' 
                                     : allCompanies.find(c => c.id === user.companyId)?.name || (user.companyId === 'HQ' ? '半富利总公司' : user.companyId)}
                               </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UNASSIGNED">未分配公司</SelectItem>
                                {allCompanies.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                         </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-black/5">
                        <span className="text-[10px] uppercase font-bold text-[#86868B]">配置角色:</span>
                        <Select 
                          value={user.role || ''}
                          onValueChange={(val) => handleGlobalUserRoleChange(user.id, val)}
                        >
                          <SelectTrigger className="w-[100px] h-6 text-[10px] bg-transparent border-black/10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">待审核</SelectItem>
                            <SelectItem value="employee">员工</SelectItem>
                            <SelectItem value="admin">分公司超管</SelectItem>
                            <SelectItem value="super_admin">系统超管</SelectItem>
                            <SelectItem value="rejected">封禁区</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </TabsContent>
        )}
      </Tabs>
      
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent className="sm:max-w-[425px] rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> 移除并重置该员工
            </DialogTitle>
            <DialogDescription className="text-sm font-medium leading-relaxed">
              由于系统采用 Serverless 纯前端架构，在此我们只能<span className="text-red-500 font-bold">永久清除其档案记录</span>以阻止其登录。<br/><br/>
              若该员工需要重置密码，由于底层账号已被锁定，他必须使用<span className="font-bold text-black">全新的账号字母</span>（例如在原拼音后面加数字）重新注册，才能再次进入系统！
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setUserToDelete(null)}>取消操作</Button>
            <Button variant="destructive" className="rounded-xl font-bold bg-red-500 hover:bg-red-600 text-white" onClick={executeDeleteUser}>确认永久重置</Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* DELETE CONFIRM Modal */}
      {deleteConfirm && deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-red-500 mb-4">{deleteConfirm.title || '确认删除'}</h3>
            <p className="text-[#1D1D1F] mb-6">{deleteConfirm.message || '确定要删除吗？此操作无法撤销。'}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)} className="rounded-xl font-bold">
                取消
              </Button>
              <Button 
                onClick={() => {
                  deleteConfirm.onConfirm();
                  setDeleteConfirm(null);
                }} 
                className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-md"
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
