import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';
import { X, Settings2, TrendingUp, Target, Package, CheckSquare, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const COLORS = ['#FF6B00', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#6366F1', '#84CC16'];
const getColor = (index: number) => COLORS[index % COLORS.length];

export const Dashboard: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [plannings, setPlannings] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ channels: {} });
  const [users, setUsers] = useState<any[]>([]);

  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterShop, setFilterShop] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');

  const [rankingDimension, setRankingDimension] = useState<'shop' | 'ownerName' | 'category' | 'source'>('shop');
  const [chartMetrics, setChartMetrics] = useState<string[]>(['uploaded']);

  const [isFunnelConfigOpen, setIsFunnelConfigOpen] = useState(false);
  const [visibleSops, setVisibleSops] = useState<Record<string, string[]> | null>(() => {
    const saved = localStorage.getItem('dashboard-visible-sops-v2');
    return saved ? JSON.parse(saved) : null;
  });
  const [tempSops, setTempSops] = useState<Record<string, string[]>>({});
  const [visibleChannels, setVisibleChannels] = useState<string[] | null>(() => {
    const saved = localStorage.getItem('dashboard-visible-channels');
    return saved ? JSON.parse(saved) : null;
  });
  const [tempChannels, setTempChannels] = useState<string[]>([]);

  const [previewProducts, setPreviewProducts] = useState<any[] | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setSettings(doc.data());
    });

    const allowedShops = profile?.permissions?.map((p: any) => p.shop) || [];

    let qPlannings;
    let qProducts;

    if (isAdmin) {
      qPlannings = collection(db, 'plannings');
      qProducts = collection(db, 'products');
    } else if (allowedShops.length > 0) {
      qPlannings = query(collection(db, 'plannings'), where('shop', 'in', allowedShops.slice(0, 30)));
      qProducts = query(collection(db, 'products'), where('shop', 'in', allowedShops.slice(0, 30)));
    } else {
      qPlannings = query(collection(db, 'plannings'), where('ownerId', '==', profile?.uid || ''));
      qProducts = query(collection(db, 'products'), where('ownerId', '==', profile?.uid || ''));
    }

    const unsubPlannings = onSnapshot(qPlannings, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      if (!isAdmin) {
        docs = docs.filter(doc => {
          const shopPerm = profile?.permissions?.find((p: any) => p.shop === doc.shop);
          if (!shopPerm) return false;
          if (shopPerm.canViewPast) return true;
          return doc.uploadTime ? new Date(doc.uploadTime) >= new Date(shopPerm.takeoverTime) : new Date(doc.createdAt) >= new Date(shopPerm.takeoverTime);
        });
      }
      setPlannings(docs);
    });

    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      if (!isAdmin) {
        docs = docs.filter(doc => {
          const shopPerm = profile?.permissions?.find((p: any) => p.shop === doc.shop);
          if (!shopPerm) return false;
          if (shopPerm.canViewPast) return true;
          return doc.uploadTime ? new Date(doc.uploadTime) >= new Date(shopPerm.takeoverTime) : new Date(doc.createdAt) >= new Date(shopPerm.takeoverTime);
        });
      }
      setProducts(docs);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSettings();
      unsubPlannings();
      unsubProducts();
      unsubUsers();
    };
  }, [isAdmin, profile]);

  const getUserDisplayName = (emailOrName: string) => {
    if (!emailOrName) return '未知';
    const user = users.find(u => u.email === emailOrName || u.displayName === emailOrName || u.username === emailOrName);
    return user?.displayName || user?.username || emailOrName.split('@')[0];
  };

  const uniqueYears = Array.from(new Set([...plannings, ...products].map(p => p.month?.split('-')[0]).filter(Boolean)));
  const uniqueMonths = Array.from(new Set([...plannings, ...products].map(p => p.month?.split('-')[1]).filter(Boolean)));
  const uniqueDays = Array.from(new Set([...plannings, ...products].map(p => p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null).filter(Boolean)));
  const uniqueChannels = Array.from(new Set([...plannings, ...products].map(p => p.channel).filter(Boolean)));
  const uniqueShops = Array.from(new Set([...plannings, ...products].map(p => p.shop).filter(Boolean)));
  const uniqueCategories = Array.from(new Set([...plannings, ...products].map(p => p.category).filter(Boolean)));
  const uniqueOwners = Array.from(new Set([...plannings.map(p => getUserDisplayName(p.ownerName)), ...products.map(p => getUserDisplayName(p.assignedOwner || p.ownerName))].filter(Boolean)));

  const filteredPlannings = plannings.filter(p => {
    if (filterYear !== 'all' && p.month?.split('-')[0] !== filterYear) return false;
    if (filterMonth !== 'all' && p.month?.split('-')[1] !== filterMonth) return false;
    if (filterDay !== 'all' && p.uploadTime && new Date(p.uploadTime).getDate().toString().padStart(2, '0') !== filterDay) return false;
    if (filterChannel !== 'all' && p.channel !== filterChannel) return false;
    if (filterShop !== 'all' && p.shop !== filterShop) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (filterOwner !== 'all' && getUserDisplayName(p.ownerName) !== filterOwner) return false;
    return true;
  });

  const filteredProducts = products.filter(p => {
    if (filterYear !== 'all' && p.month?.split('-')[0] !== filterYear) return false;
    if (filterMonth !== 'all' && p.month?.split('-')[1] !== filterMonth) return false;
    if (filterDay !== 'all' && p.uploadTime && new Date(p.uploadTime).getDate().toString().padStart(2, '0') !== filterDay) return false;
    if (filterChannel !== 'all' && p.channel !== filterChannel) return false;
    if (filterShop !== 'all' && p.shop !== filterShop) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (filterOwner !== 'all' && getUserDisplayName(p.assignedOwner || p.ownerName) !== filterOwner) return false;
    return true;
  });

  const totalPlanned = filteredPlannings.reduce((acc, p) => acc + (p.plannedCount || 0), 0);
  const totalUploaded = filteredProducts.length;
  const completionRate = totalPlanned > 0 ? Math.round((totalUploaded / totalPlanned) * 100) : 0;

  const getResultCount = (result: string) => filteredProducts.filter(p => p.result === result).length;

  const handleDoubleClick = (title: string, productsList: any[]) => {
    setPreviewTitle(title);
    setPreviewProducts(productsList);
  };

  const renderOverviewSection = (dimension: 'channel' | 'shop' | 'ownerName' | 'assignedOwner') => {
    const groups = new Map();
    
    filteredPlannings.forEach(p => {
      const key = dimension === 'ownerName' ? getUserDisplayName(p.ownerName) : (p[dimension] || '未分类');
      if (!groups.has(key)) groups.set(key, { planned: 0, uploaded: 0, products: [], sops: {} });
      groups.get(key).planned += p.plannedCount || 0;
    });

    filteredProducts.forEach(p => {
      const key = dimension === 'ownerName' ? getUserDisplayName(p.assignedOwner || p.ownerName) : (p[dimension] || '未分类');
      if (!groups.has(key)) groups.set(key, { planned: 0, uploaded: 0, products: [], sops: {} });
      const group = groups.get(key);
      group.uploaded += 1;
      group.products.push(p);
      
      if (p.steps) {
        Object.entries(p.steps).forEach(([step, checked]) => {
          if (checked) {
            group.sops[step] = (group.sops[step] || 0) + 1;
          }
        });
      }
    });

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from(groups.entries()).map(([key, data]) => {
          const rate = data.planned > 0 ? Math.round((data.uploaded / data.planned) * 100) : 0;
          return (
            <div 
              key={key} 
              onDoubleClick={() => handleDoubleClick(`${key}`, data.products)}
              className="bg-white p-5 rounded-[20px] shadow-sm border border-black/5 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold text-base text-[#1D1D1F] group-hover:text-[#FF6B00] transition-colors">{key}</div>
                <div className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold", rate >= 100 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>
                  {rate}% 完成
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[#F5F5F7] p-3 rounded-xl">
                  <div className="text-[10px] text-[#86868B] font-bold mb-1">总规划</div>
                  <div className="text-lg font-bold text-[#1D1D1F]">{data.planned}</div>
                </div>
                <div className="bg-[#F5F5F7] p-3 rounded-xl">
                  <div className="text-[10px] text-[#86868B] font-bold mb-1">已上架</div>
                  <div className="text-lg font-bold text-[#FF6B00]">{data.uploaded}</div>
                </div>
              </div>
              {Object.keys(data.sops).length > 0 && (
                <div className="pt-3 border-t border-black/5">
                  <div className="text-[10px] text-[#86868B] font-bold mb-2">SOP 节点进度</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.sops).map(([step, count]) => (
                      <div key={step} className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1">
                        {step} <span className="font-bold bg-white/50 px-1 rounded">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRanking = () => {
    const groups = new Map();
    filteredProducts.forEach(p => {
      const key = rankingDimension === 'ownerName' ? getUserDisplayName(p.assignedOwner || p.ownerName) : (p[rankingDimension] || '未分类');
      if (!groups.has(key)) groups.set(key, { uploaded: 0, products: [] });
      groups.get(key).uploaded += 1;
      groups.get(key).products.push(p);
    });

    const sorted = Array.from(groups.entries()).sort((a, b) => b[1].uploaded - a[1].uploaded);

    return (
      <div className="bg-white p-6 rounded-[24px] shadow-sm border border-black/5 h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-[#1D1D1F]">排行榜</h2>
          <Select value={rankingDimension} onValueChange={(v: any) => setRankingDimension(v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg bg-[#F5F5F7] border-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shop">店铺排行</SelectItem>
              <SelectItem value="ownerName">员工排行</SelectItem>
              <SelectItem value="category">品类排行</SelectItem>
              <SelectItem value="source">来源排行</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
          {sorted.map(([key, data], index) => (
            <div 
              key={key}
              onDoubleClick={() => handleDoubleClick(`排行榜 - ${key}`, data.products)}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-[#F5F5F7] transition-colors cursor-pointer border border-transparent hover:border-black/5 group"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm",
                  index === 0 ? "bg-gradient-to-br from-yellow-300 to-yellow-500 text-white" :
                  index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400 text-white" :
                  index === 2 ? "bg-gradient-to-br from-orange-300 to-orange-400 text-white" : "bg-[#F5F5F7] text-[#86868B]"
                )}>
                  {index + 1}
                </div>
                <span className="font-medium text-sm text-[#1D1D1F] group-hover:text-[#FF6B00] transition-colors">{key}</span>
              </div>
              <div className="font-bold text-lg text-[#1D1D1F]">{data.uploaded}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- Chart Data & Options ---
  const baseMetrics = [
    { id: 'planned', label: '总规划', color: '#3B82F6', group: '基础指标' },
    { id: 'uploaded', label: '已上架', color: '#FF6B00', group: '基础指标' },
    { id: 'bigBurst', label: '大爆款', color: '#EF4444', group: '基础指标' },
    { id: 'smallBurst', label: '小爆款', color: '#F59E0B', group: '基础指标' },
    { id: 'moving', label: '动销款', color: '#10B981', group: '基础指标' },
    { id: 'flat', label: '平销款', color: '#3B82F6', group: '基础指标' },
    { id: 'unsalable', label: '滞销款', color: '#6B7280', group: '基础指标' },
  ];

  const channelMetrics = uniqueChannels.map((c, i) => ({ id: `channel_${c}`, label: String(c), color: getColor(i), group: '渠道' }));
  const shopMetrics = uniqueShops.map((s, i) => ({ id: `shop_${s}`, label: String(s), color: getColor(i+3), group: '店铺' }));
  const categoryMetrics = uniqueCategories.map((c, i) => ({ id: `category_${c}`, label: String(c), color: getColor(i+6), group: '品类' }));
  const ownerMetrics = uniqueOwners.map((o, i) => ({ id: `owner_${o}`, label: String(o), color: getColor(i+9), group: '负责人' }));

  const allChartOptions = [...baseMetrics, ...channelMetrics, ...shopMetrics, ...categoryMetrics, ...ownerMetrics];

  const systemChannels = settings.channels ? Object.keys(settings.channels) : [];
  const allAvailableChannels = systemChannels.length > 0 ? systemChannels : uniqueChannels.map(String);
  const activeChannels = visibleChannels !== null ? visibleChannels : allAvailableChannels;

  const defaultSops: Record<string, string[]> = {};
  allAvailableChannels.forEach(ch => {
    defaultSops[ch] = settings.channels?.[ch]?.sop || [];
  });
  const activeSops = visibleSops !== null ? visibleSops : defaultSops;

  const sopFunnelData = activeChannels.map(channel => {
    let planned = 0;
    let uploaded = 0;
    const channelSops = activeSops[channel] || [];
    const sops: Record<string, number> = {};
    channelSops.forEach(s => sops[s] = 0);

    filteredPlannings.forEach(p => {
      if ((p.channel || '未分类') === channel) {
        planned += p.plannedCount || 0;
      }
    });

    filteredProducts.forEach(p => {
      if ((p.channel || '未分类') === channel) {
        uploaded += 1;
        if (p.steps) {
          Object.entries(p.steps).forEach(([step, checked]) => {
            if (channelSops.includes(step) && checked) {
              sops[step] += 1;
            }
          });
        }
      }
    });
    
    return { name: channel, planned, uploaded, channelSops, sops };
  });

  const getChartData = () => {
    const dataMap = new Map();
    const timeKey = filterMonth !== 'all' ? 'day' : 'month';
    
    filteredPlannings.forEach(p => {
      let key = timeKey === 'month' ? (p.month || '未知') : (p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') + '日' : '未知');
      if (!dataMap.has(key)) dataMap.set(key, { name: key, planned: 0, uploaded: 0, bigBurst: 0, smallBurst: 0, moving: 0, flat: 0, unsalable: 0 });
      dataMap.get(key).planned += p.plannedCount || 0;
    });

    filteredProducts.forEach(p => {
      let key = timeKey === 'month' ? (p.month || '未知') : (p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') + '日' : '未知');
      if (!dataMap.has(key)) dataMap.set(key, { name: key, planned: 0, uploaded: 0, bigBurst: 0, smallBurst: 0, moving: 0, flat: 0, unsalable: 0 });
      const item = dataMap.get(key);
      
      item.uploaded += 1;
      if (p.result === '大爆') item.bigBurst += 1;
      if (p.result === '小爆') item.smallBurst += 1;
      if (p.result === '动销') item.moving += 1;
      if (p.result === '平销') item.flat += 1;
      if (p.result === '滞销') item.unsalable += 1;

      if (p.channel) item[`channel_${p.channel}`] = (item[`channel_${p.channel}`] || 0) + 1;
      if (p.shop) item[`shop_${p.shop}`] = (item[`shop_${p.shop}`] || 0) + 1;
      if (p.category) item[`category_${p.category}`] = (item[`category_${p.category}`] || 0) + 1;
      const owner = getUserDisplayName(p.assignedOwner || p.ownerName);
      if (owner) item[`owner_${owner}`] = (item[`owner_${owner}`] || 0) + 1;
    });

    return Array.from(dataMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const chartData = getChartData();

  const toggleChartMetric = (id: string) => {
    if (chartMetrics.includes(id)) {
      setChartMetrics(chartMetrics.filter(m => m !== id));
    } else {
      setChartMetrics([...chartMetrics, id]);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-[1600px] mx-auto">
      {/* 1. 控制面板与核心看板 */}
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 bg-white p-4 rounded-[24px] shadow-sm border border-black/5 items-center">
          <div className="text-sm font-bold text-[#1D1D1F] mr-2 flex items-center gap-2">
            <Settings2 size={16} className="text-[#86868B]" />
            全局筛选
          </div>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-auto h-8 px-4 text-xs rounded-full border-none bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"><SelectValue>{filterYear === 'all' ? '全部年' : `${filterYear}年`}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">全部年</SelectItem>{uniqueYears.map((y: any) => <SelectItem key={y} value={y}>{y}年</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-auto h-8 px-4 text-xs rounded-full border-none bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"><SelectValue>{filterMonth === 'all' ? '全部月' : `${filterMonth}月`}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">全部月</SelectItem>{uniqueMonths.map((m: any) => <SelectItem key={m} value={m}>{m}月</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterDay} onValueChange={setFilterDay}>
            <SelectTrigger className="w-auto h-8 px-4 text-xs rounded-full border-none bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"><SelectValue>{filterDay === 'all' ? '全部日' : `${filterDay}日`}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">全部日</SelectItem>{uniqueDays.map((d: any) => <SelectItem key={d} value={d}>{d}日</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="w-auto h-8 px-4 text-xs rounded-full border-none bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"><SelectValue>{filterChannel === 'all' ? '全部渠道' : filterChannel}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">全部渠道</SelectItem>{uniqueChannels.map((c: any) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterShop} onValueChange={setFilterShop}>
            <SelectTrigger className="w-auto h-8 px-4 text-xs rounded-full border-none bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"><SelectValue>{filterShop === 'all' ? '全部店铺' : filterShop}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">全部店铺</SelectItem>{uniqueShops.map((s: any) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-auto h-8 px-4 text-xs rounded-full border-none bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"><SelectValue>{filterCategory === 'all' ? '全部品类' : filterCategory}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">全部品类</SelectItem>{uniqueCategories.map((c: any) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterOwner} onValueChange={setFilterOwner}>
            <SelectTrigger className="w-auto h-8 px-4 text-xs rounded-full border-none bg-[#F5F5F7] hover:bg-[#E5E5EA] transition-colors"><SelectValue placeholder="全部负责人">{filterOwner === 'all' ? '全部负责人' : filterOwner}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">全部负责人</SelectItem>{uniqueOwners.map((o: any) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Unified Metrics Row (7 Cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white p-4 rounded-[20px] shadow-sm border border-black/5 flex flex-col items-center justify-center text-center transition-all hover:shadow-md">
            <p className="text-[11px] font-bold text-[#86868B] mb-1 uppercase tracking-wider">总规划链接</p>
            <p className="text-2xl font-black text-[#1D1D1F]">{totalPlanned}</p>
          </div>
          <div className="bg-gradient-to-br from-[#1D1D1F] to-[#434345] p-4 rounded-[20px] flex flex-col items-center justify-center text-center shadow-md transition-all hover:shadow-lg relative overflow-hidden">
            <p className="text-[11px] font-bold text-white/60 mb-1 uppercase tracking-wider relative z-10">已上链接</p>
            <div className="flex items-baseline gap-1 relative z-10">
              <p className="text-2xl font-black text-white">{totalUploaded}</p>
              <span className="text-[10px] text-green-400 font-bold ml-1">({completionRate}%)</span>
            </div>
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-white/5 rounded-full blur-xl" />
          </div>
          {[
            { label: '大爆款', count: getResultCount('大爆'), color: 'text-red-500', bg: 'bg-red-50' },
            { label: '小爆款', count: getResultCount('小爆'), color: 'text-orange-500', bg: 'bg-orange-50' },
            { label: '动销款', count: getResultCount('动销'), color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: '平销款', count: getResultCount('平销'), color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: '滞销款', count: getResultCount('滞销'), color: 'text-gray-500', bg: 'bg-gray-100' },
          ].map(m => (
            <div key={m.label} className="bg-white p-4 rounded-[20px] shadow-sm border border-black/5 flex flex-col items-center justify-center text-center transition-all hover:shadow-md group">
              <p className="text-[11px] font-bold text-[#86868B] mb-1 group-hover:text-[#1D1D1F] transition-colors">{m.label}</p>
              <p className={cn("text-2xl font-black", m.color)}>{m.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 多维数据分析中心 (Tabs) */}
      <div className="w-full">
        <Tabs defaultValue="channel" className="w-full flex-col flex">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 gap-4 px-2">
            <div>
              <h2 className="text-xl font-bold text-[#1D1D1F]">多维数据总览</h2>
              <p className="text-xs text-[#86868B] mt-1">不同维度下的数据对比分析</p>
            </div>
            <TabsList className="bg-white p-1 rounded-xl h-auto shadow-sm border border-black/5">
              <TabsTrigger value="channel" className="rounded-lg text-xs font-bold px-5 py-2 data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">渠道总览</TabsTrigger>
              <TabsTrigger value="shop" className="rounded-lg text-xs font-bold px-5 py-2 data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">店铺总览</TabsTrigger>
              <TabsTrigger value="owner" className="rounded-lg text-xs font-bold px-5 py-2 data-[state=active]:bg-[#FF6B00] data-[state=active]:text-white">员工总览</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="channel" className="mt-0 outline-none">
            {renderOverviewSection('channel')}
          </TabsContent>
          <TabsContent value="shop" className="mt-0 outline-none">
            {renderOverviewSection('shop')}
          </TabsContent>
          <TabsContent value="owner" className="mt-0 outline-none">
            {renderOverviewSection('ownerName')}
          </TabsContent>
        </Tabs>
      </div>

      {/* 3. 各渠道 SOP 履约全景图 */}
      <div className="w-full space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
          <div>
            <h2 className="text-xl font-bold text-[#1D1D1F]">各渠道 SOP 履约全景图</h2>
            <p className="text-xs text-[#86868B] mt-1">SOP Funnel · 以渠道为维度的核心运营动作转化漏斗</p>
          </div>
          <button
            onClick={() => {
              setTempSops(activeSops);
              setTempChannels(activeChannels);
              setIsFunnelConfigOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/5 text-[#1D1D1F] rounded-lg text-xs font-bold hover:bg-[#F5F5F7] transition-colors shadow-sm shrink-0"
          >
            <Settings2 size={14} />
            设置看板视图
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {sopFunnelData.map((cd, index) => (
            <div key={cd.name} className="flex flex-col bg-white rounded-[20px] shadow-sm border border-black/5 overflow-hidden hover:shadow-md transition-shadow duration-300">
              
              {/* Header Section */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-gray-50/80 to-transparent border-b border-black/[0.03]">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-3.5 bg-[#1D1D1F] rounded-full" />
                  <h3 className="text-[14px] font-bold text-[#1D1D1F] tracking-tight">{cd.name}</h3>
                </div>
                <div className="text-[10px] font-bold text-[#86868B] px-2 py-0.5 bg-white border border-black/[0.04] rounded-full shadow-sm">
                  {cd.channelSops.length} 个节点
                </div>
              </div>
              
              {/* Dense Pipeline Nodes */}
              <div className="flex w-full items-stretch p-3 md:p-4">
                {cd.channelSops.map((step, i) => {
                  const completed = cd.sops[step] || 0;
                  const rate = cd.planned > 0 ? Math.round((completed / cd.planned) * 100) : 0;
                  const isLast = i === cd.channelSops.length - 1;
                  const isComplete = rate >= 100;
                  
                  return (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 + index * 0.1 }}
                      className={cn(
                        "flex flex-col flex-1 min-w-0 px-2 md:px-3",
                        !isLast && "border-r border-black/[0.04]"
                      )}
                    >
                      <h4 
                        className="text-[10px] xl:text-[11px] font-bold text-[#86868B] truncate mb-2 leading-none" 
                        title={step}
                      >
                        {step}
                      </h4>
                      
                      <div className="flex items-baseline gap-1 xl:gap-1.5 mb-2.5">
                        <span className="text-lg xl:text-xl font-black text-[#1D1D1F] leading-none tracking-tight">
                          {completed}
                        </span>
                        <span className="text-[9px] xl:text-[10px] font-bold text-[#A1A1A6] font-mono leading-none tracking-tighter">
                          /{cd.planned}
                        </span>
                      </div>
                      
                      <div className="mt-auto flex items-center justify-between gap-1.5">
                        <div className="h-1.5 flex-1 bg-[#F5F5F7] rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-1000 ease-out" 
                            style={{ 
                              width: `${Math.min(rate, 100)}%`,
                              backgroundColor: isComplete ? '#10B981' : rate > 0 ? '#1D1D1F' : '#E5E5EA'
                            }} 
                          />
                        </div>
                        <span className={cn(
                          "text-[9px] font-bold font-mono text-right w-6 flex-shrink-0",
                          isComplete ? "text-[#10B981]" : rate > 0 ? "text-[#1D1D1F]" : "text-[#A1A1A6]"
                        )}>
                          {Math.min(rate, 999)}%
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
          {sopFunnelData.length === 0 && (
            <div className="bg-white p-8 rounded-[24px] shadow-sm border border-black/5 text-center flex flex-col items-center text-[#86868B]">
              <Target size={40} className="mb-4 opacity-20" />
              <p className="text-sm font-bold">暂无选中的渠道数据，请点击右上角配置看板视图</p>
            </div>
          )}
        </div>
      </div>

      {/* 4. 走势与排行矩阵 (Bento Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
        {/* Left: Ranking */}
        <div className="col-span-1 h-full">
          {renderRanking()}
        </div>

        {/* Right: Chart */}
        <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-[24px] shadow-sm border border-black/5 h-full flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-[#1D1D1F]">曲线走势图</h2>
            
            <Popover>
              <PopoverTrigger className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F7] hover:bg-[#E5E5EA] rounded-xl text-xs font-bold text-[#1D1D1F] transition-colors cursor-pointer border-none outline-none">
                <Settings2 size={14} />
                配置走势字段 ({chartMetrics.length})
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0 rounded-[20px] overflow-hidden" align="end">
                <div className="bg-[#F5F5F7] px-4 py-3 border-b border-black/5">
                  <p className="text-xs font-bold text-[#1D1D1F]">选择要对比的维度</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto p-2 custom-scrollbar">
                  {['基础指标', '渠道', '店铺', '品类', '负责人'].map(groupName => {
                    const groupOptions = allChartOptions.filter(o => o.group === groupName);
                    if (groupOptions.length === 0) return null;
                    return (
                      <div key={groupName} className="mb-4 last:mb-0">
                        <div className="px-2 py-1 mb-1 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">{groupName}</div>
                        {groupOptions.map(option => (
                          <label key={option.id} className="flex items-center gap-3 px-2 py-1.5 hover:bg-[#F5F5F7] rounded-lg cursor-pointer transition-colors">
                            <Checkbox 
                              checked={chartMetrics.includes(option.id)}
                              onCheckedChange={() => toggleChartMetric(option.id)}
                              className="rounded-[4px] data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                            />
                            <div className="flex items-center gap-2 flex-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: option.color }} />
                              <span className="text-xs font-medium text-[#1D1D1F] truncate">{option.label}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="flex-1 w-full min-h-0">
            {chartMetrics.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#86868B]">
                <TrendingUp size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-bold">请在右上角配置需要查看的走势字段</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F7" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#86868B', fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#86868B', fontWeight: 600 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: '12px 16px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600, padding: '4px 0' }}
                    labelStyle={{ fontSize: '11px', color: '#86868B', marginBottom: '8px', fontWeight: 'bold' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '20px' }} />
                  {chartMetrics.map(metricId => {
                    const metric = allChartOptions.find(m => m.id === metricId);
                    return (
                      <Line 
                        key={metricId}
                        type="monotone" 
                        dataKey={metricId} 
                        name={metric?.label}
                        stroke={metric?.color} 
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewProducts} onOpenChange={(open) => !open && setPreviewProducts(null)}>
        <DialogContent className="max-w-[95vw] xl:max-w-[1200px] max-h-[85vh] overflow-y-auto rounded-[24px] p-0 gap-0 border-none [&>button]:hidden">
          <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-black/5 px-6 py-4 flex items-center justify-between">
            <DialogTitle className="text-lg font-bold text-[#1D1D1F]">
              {previewTitle} - 链接明细 ({previewProducts?.length || 0})
            </DialogTitle>
            <button onClick={() => setPreviewProducts(null)} className="p-2 hover:bg-[#F5F5F7] rounded-full transition-colors">
              <X size={20} className="text-[#86868B]" />
            </button>
          </div>
          <div className="p-6">
            <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader className="bg-[#F5F5F7]">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">商品 ID</TableHead>
                    <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">渠道/店铺</TableHead>
                    <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">品类/场景</TableHead>
                    <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">负责人</TableHead>
                    <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">结果判定</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewProducts?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-[#86868B] text-sm">暂无数据</TableCell>
                    </TableRow>
                  ) : (
                    previewProducts?.map((p) => (
                      <TableRow 
                        key={p.id} 
                        onDoubleClick={() => {
                          if (p.planningId) {
                            navigate('/planning', { state: { highlightId: p.planningId } });
                          } else {
                            toast.info('该链接未绑定规划');
                          }
                        }}
                        className="hover:bg-[#F5F5F7]/50 transition-colors border-black/5 cursor-pointer"
                      >
                        <TableCell>
                          <div className="font-mono font-bold text-sm text-[#1D1D1F]">{p.productId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-bold text-[#1D1D1F]">{p.channel}</div>
                          <div className="text-[11px] text-[#86868B]">{p.shop}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-bold text-[#1D1D1F]">{p.category}</div>
                          <div className="text-[11px] text-[#86868B]">{p.scene}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-[#1D1D1F] font-medium">{getUserDisplayName(p.assignedOwner || p.ownerName)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-bold" style={{ color: p.result === '大爆' ? '#EF4444' : p.result === '小爆' ? '#F59E0B' : '#86868B' }}>
                            {p.result || '待设置'}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Funnel Config Modal */}
      <Dialog open={isFunnelConfigOpen} onOpenChange={setIsFunnelConfigOpen}>
        <DialogContent className="max-w-xl rounded-[24px]">
          <DialogHeader>
            <DialogTitle>设置 SOP 漏斗首屏视图</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
            {allAvailableChannels.map(channel => {
              const isChannelSelected = tempChannels.includes(channel);
              const channelSopList = settings.channels?.[channel]?.sop || [];
              const selectedSops = tempSops[channel] || [];

              return (
                <div key={channel} className={cn("space-y-3 p-4 rounded-2xl border transition-all", isChannelSelected ? "bg-white border-black/10 shadow-sm" : "bg-[#F5F5F7]/50 border-transparent")}>
                  <label className="flex items-center gap-3 font-bold text-[#1D1D1F] cursor-pointer">
                    <Checkbox 
                      checked={isChannelSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTempChannels([...tempChannels, channel]);
                          if (!tempSops[channel]) {
                            setTempSops({ ...tempSops, [channel]: channelSopList });
                          }
                        } else {
                          setTempChannels(tempChannels.filter(c => c !== channel));
                        }
                      }}
                      className="rounded-[4px] data-[state=checked]:bg-[#1D1D1F] data-[state=checked]:border-[#1D1D1F]"
                    />
                    <span className="text-sm">{channel} <span className="text-xs text-[#86868B] font-normal ml-1">({channelSopList.length} 个动作节点)</span></span>
                  </label>

                  <div className={cn("flex flex-wrap gap-2 pl-7", !isChannelSelected && "opacity-40 pointer-events-none grayscale")}>
                    {channelSopList.length > 0 ? channelSopList.map((step: string) => {
                      const isSopSelected = selectedSops.includes(step);
                      return (
                        <button
                          key={step}
                          onClick={() => {
                            const newSelectedSops = isSopSelected 
                              ? selectedSops.filter(s => s !== step)
                              : [...selectedSops, step];
                            setTempSops({ ...tempSops, [channel]: newSelectedSops });
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                            isSopSelected ? "bg-blue-50 border-blue-200 text-blue-600 shadow-sm" : "bg-white border-black/10 text-[#86868B] hover:border-black/20 hover:bg-[#F5F5F7]"
                          )}
                        >
                          {step}
                        </button>
                      );
                    }) : (
                      <span className="text-xs text-[#86868B] bg-white px-2 py-1 rounded border border-black/5">未配置 SOP 节点，请去系统设置里配置</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-black/5">
            <button
              onClick={() => setIsFunnelConfigOpen(false)}
              className="px-4 py-2 text-sm font-bold text-[#86868B] hover:text-[#1D1D1F]"
            >
              取消
            </button>
            <button
              onClick={() => {
                setVisibleSops(tempSops);
                setVisibleChannels(tempChannels);
                localStorage.setItem('dashboard-visible-sops-v2', JSON.stringify(tempSops));
                localStorage.setItem('dashboard-visible-channels', JSON.stringify(tempChannels));
                setIsFunnelConfigOpen(false);
              }}
              className="px-4 py-2 bg-[#1D1D1F] text-white rounded-xl text-sm font-bold shadow-sm"
            >
              保存看板视图配置
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
