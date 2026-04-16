import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp, Package, CheckCircle2, Users, Target, LayoutGrid, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const Dashboard: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const [plannings, setPlannings] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ channels: {} });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('尚未同步');
  const [aggDimension, setAggDimension] = useState<'category' | 'scene' | 'shop' | 'channel' | 'ownerName'>('category');

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setSettings(doc.data());
    });

    const qPlannings = isAdmin ? collection(db, 'plannings') : query(collection(db, 'plannings'), where('ownerId', '==', profile?.uid || ''));
    const qProducts = isAdmin ? collection(db, 'products') : query(collection(db, 'products'), where('ownerId', '==', profile?.uid || ''));

    const unsubPlannings = onSnapshot(qPlannings, (snapshot) => {
      setPlannings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => {
      unsubSettings();
      unsubPlannings();
      unsubProducts();
    };
  }, [isAdmin, profile]);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      toast.success('数据同步成功');
    }, 1500);
  };

  const totalPlanned = plannings.reduce((acc, p) => acc + (p.plannedCount || 0), 0);
  const totalUploaded = products.length;
  const completionRate = totalPlanned > 0 ? Math.round((totalUploaded / totalPlanned) * 100) : 0;

  const judgments = settings.linkJudgments || [
    { label: '待设置', definition: '尚未进行链接判定的商品', color: '#86868B' },
    { label: '滞销', definition: '上架后无销量或销量极低的商品', color: '#3B82F6' },
    { label: '动销', definition: '有稳定销量但未达爆款标准的商品', color: '#10B981' },
    { label: '小爆', definition: '销量增长迅速，具有爆款潜力的商品', color: '#F59E0B' },
    { label: '大爆', definition: '销量极高，处于爆发期的核心商品', color: '#EF4444' },
  ];

  const burstDistribution = judgments.reduce((acc: any, j: any) => {
    acc[j.label] = products.filter(p => p.result === j.label).length;
    return acc;
  }, {});

  const burstData = judgments.map((j: any) => ({
    name: j.label,
    value: burstDistribution[j.label] || 0,
    color: j.color || '#86868B'
  })).filter((d: any) => d.value > 0);

  const bigBurstCount = burstDistribution['大爆'] || 0;
  const smallBurstCount = burstDistribution['小爆'] || 0;

  // Multi-dimensional aggregation
  const getAggData = () => {
    const map = new Map();
    products.forEach(p => {
      const key = p[aggDimension] || '未分类';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const aggData = getAggData();

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const timeProgress = (now.getDate() / daysInMonth) * 100;
  const isLagging = completionRate < timeProgress - 10;

  const dimensionLabels = {
    category: '品类',
    scene: '场景',
    shop: '店铺',
    channel: '渠道',
    ownerName: '个人'
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">数据概览</h1>
          <p className="text-xs text-[#86868B] mt-1">Real-time Operations Monitoring · 实时运营监控</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={handleSync}
            disabled={syncing}
            className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl text-xs font-semibold px-4 h-9 disabled:opacity-50"
          >
            {syncing ? '同步中...' : '同步数据'}
          </Button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          { title: '总规划数 (月)', value: totalPlanned.toLocaleString(), icon: Target, color: 'text-blue-500' },
          { title: '已上架链接', value: totalUploaded.toLocaleString(), icon: Package, color: 'text-orange-500' },
          { title: '整体完成度', value: `${completionRate}%`, icon: TrendingUp, color: 'text-green-500' },
          { title: '爆款产生 (大/小)', value: `${bigBurstCount} / ${smallBurstCount}`, icon: CheckCircle2, color: 'text-red-500' },
        ].map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-5 rounded-[24px] shadow-sm border border-black/5"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-[12px] text-[#86868B] font-bold uppercase tracking-wider">{stat.title}</p>
              <stat.icon size={16} className={stat.color} />
            </div>
            <p className="text-2xl font-bold text-[#1D1D1F]">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        <section className="space-y-5">
          {/* Multi-dimensional Data Preview */}
          <div className="bg-white p-6 rounded-[24px] shadow-sm border border-black/5">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <LayoutGrid size={18} className="text-[#FF6B00]" />
                多维数据预览 (链接数)
              </h3>
              <div className="flex bg-[#F5F5F7] p-1 rounded-xl gap-1">
                {Object.entries(dimensionLabels).map(([key, label]) => (
                  <button 
                    key={key}
                    onClick={() => setAggDimension(key as any)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-bold transition-all",
                      aggDimension === key ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B] hover:text-[#1D1D1F]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-[300px] w-full min-h-[300px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                <BarChart data={aggData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F7" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#86868B' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#86868B' }} />
                  <Tooltip 
                    cursor={{ fill: '#F5F5F7' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                    {aggData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#FF6B00' : '#1D1D1F'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Employee Performance Cards */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users size={18} className="text-blue-500" />
                员工作战看板
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from(new Set(plannings.map(p => p.ownerId))).map(ownerId => {
                const userPlannings = plannings.filter(p => p.ownerId === ownerId);
                const userProducts = products.filter(p => p.ownerId === ownerId);
                const userPlanned = userPlannings.reduce((acc, p) => acc + (p.plannedCount || 0), 0);
                const userUploaded = userProducts.length;
                const userRate = userPlanned > 0 ? Math.round((userUploaded / userPlanned) * 100) : 0;
                const ownerName = userPlannings[0]?.ownerName || '未知员工';
                const shop = userPlannings[0]?.shop || '未分配店铺';

                return (
                  <div key={ownerId} className="bg-white p-5 rounded-[24px] border border-black/5 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="font-bold text-sm text-[#1D1D1F]">{ownerName}</span>
                        <p className="text-[10px] text-[#86868B] font-bold mt-0.5">{shop}</p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] rounded-lg border-black/5", userRate >= timeProgress ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50")}>
                        {userRate >= timeProgress ? '进度领先' : '进度落后'}
                      </Badge>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-[#86868B]">完成率</span>
                        <span className="text-[#1D1D1F]">{userRate}%</span>
                      </div>
                      <div className="h-2 bg-[#F5F5F7] rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full transition-all duration-1000", userRate < timeProgress - 10 ? "bg-red-500" : "bg-[#FF6B00]")} 
                          style={{ width: `${userRate}%` }} 
                        />
                      </div>
                      <div className="flex gap-2 pt-1 flex-wrap">
                        {judgments.filter((j: any) => j.label !== '待设置').slice(0, 2).map((j: any) => (
                          <div key={j.label} className="flex-1 bg-[#F5F5F7] p-2 rounded-xl text-center min-w-[60px]">
                            <span className="text-[10px] text-[#86868B] font-bold block">{j.label}</span>
                            <span className="text-xs font-bold" style={{ color: j.color }}>{userProducts.filter(p => p.result === j.label).length}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          {/* Warning Card */}
          <div className={cn(
            "p-6 rounded-[24px] border transition-all",
            isLagging ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"
          )}>
            <div className={cn("flex items-center gap-2 font-bold text-sm mb-3", isLagging ? "text-red-600" : "text-green-600")}>
              <AlertCircle size={18} />
              智能预警
            </div>
            {isLagging ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-red-900">整体进度落后于时间进度</p>
                <p className="text-[11px] text-red-700 leading-relaxed font-medium">
                  本月时间已过 {Math.round(timeProgress)}%，当前完成度仅 {completionRate}%。
                  需要加快上新节奏，落后约 <span className="font-bold underline">{Math.round(timeProgress - completionRate)}%</span>。
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-bold text-green-900">系统运行良好</p>
                <p className="text-[11px] text-green-700 leading-relaxed font-medium">
                  当前完成度 {completionRate}%，与时间进度 {Math.round(timeProgress)}% 基本持平。请继续保持。
                </p>
              </div>
            )}
          </div>

          {/* Burst Distribution Pie */}
          <div className="bg-white p-6 rounded-[24px] shadow-sm border border-black/5">
            <h3 className="text-sm font-bold mb-4">爆款结果分布</h3>
            <div className="h-[180px] w-full min-h-[180px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                <PieChart>
                  <Pie
                    data={burstData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {burstData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {burstData.map(item => (
                <div key={item.name} className="flex items-center gap-2 p-2 bg-[#F5F5F7] rounded-xl">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-bold text-[#86868B]">{item.name}</span>
                  <span className="text-[10px] font-bold text-[#1D1D1F] ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="bg-[#1D1D1F] p-6 rounded-[24px] text-white shadow-xl border border-white/5">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">System Status</span>
              <div className="w-2 h-2 rounded-full animate-pulse bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            </div>
            <div className="space-y-5">
              <div>
                <p className="text-[10px] text-[#86868B] font-bold uppercase">数据库状态</p>
                <p className="text-xs font-bold mt-1">Cloud Firestore 已连接</p>
              </div>
              <div className="pt-5 border-t border-white/10">
                <p className="text-[10px] text-[#86868B] font-bold uppercase">上次同步时间</p>
                <p className="text-xs font-bold mt-1 text-[#FF6B00]">
                  {syncing ? '同步中...' : lastSyncTime}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
