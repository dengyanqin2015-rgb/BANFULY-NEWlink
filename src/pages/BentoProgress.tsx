import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'motion/react';
import { LayoutGrid, List, PieChart, AlertTriangle, Users, Store, Globe, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

export const BentoProgress: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const [plannings, setPlannings] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ channels: {} });
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [aggDimension, setAggDimension] = useState<'category' | 'scene' | 'shop' | 'channel' | 'ownerName'>('category');

  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterShop, setFilterShop] = useState<string>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setSettings(doc.data());
    });

    const qP = isAdmin ? collection(db, 'plannings') : query(collection(db, 'plannings'), where('ownerId', '==', profile?.uid));
    const unsubP = onSnapshot(qP, (snapshot) => {
      setPlannings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qProd = isAdmin ? collection(db, 'products') : query(collection(db, 'products'), where('ownerId', '==', profile?.uid));
    const unsubProd = onSnapshot(qProd, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSettings();
      unsubP();
      unsubProd();
    };
  }, [isAdmin, profile]);

  const uniqueYears = Array.from(new Set(plannings.map(p => p.month?.split('-')[0]).filter(Boolean)));
  const uniqueMonths = Array.from(new Set(plannings.map(p => p.month?.split('-')[1]).filter(Boolean)));
  const uniqueDays = Array.from(new Set(plannings.map(p => p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null).filter(Boolean)));
  const uniqueChannels = Array.from(new Set(plannings.map(p => p.channel).filter(Boolean)));
  const uniqueShops = Array.from(new Set(plannings.map(p => p.shop).filter(Boolean)));
  const uniqueOwners = Array.from(new Set(plannings.map(p => p.ownerName).filter(Boolean)));
  const uniqueCategories = Array.from(new Set(plannings.map(p => p.category).filter(Boolean)));

  const filteredPlannings = plannings.filter(p => {
    const pYear = p.month?.split('-')[0];
    const pMonth = p.month?.split('-')[1];
    const pDay = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;
    if (filterYear !== 'all' && pYear !== filterYear) return false;
    if (filterMonth !== 'all' && pMonth !== filterMonth) return false;
    if (filterDay !== 'all' && pDay !== filterDay) return false;
    if (filterChannel !== 'all' && p.channel !== filterChannel) return false;
    if (filterShop !== 'all' && p.shop !== filterShop) return false;
    if (filterOwner !== 'all' && p.ownerName !== filterOwner) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  });

  const filteredProducts = products.filter(p => {
    const pYear = p.month?.split('-')[0];
    const pMonth = p.month?.split('-')[1];
    const pDay = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;
    if (filterYear !== 'all' && pYear !== filterYear) return false;
    if (filterMonth !== 'all' && pMonth !== filterMonth) return false;
    if (filterDay !== 'all' && pDay !== filterDay) return false;
    if (filterChannel !== 'all' && p.channel !== filterChannel) return false;
    if (filterShop !== 'all' && p.shop !== filterShop) return false;
    if (filterOwner !== 'all' && p.ownerName !== filterOwner) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  });

  // Dynamic aggregation logic
  const getAggregatedGroups = () => {
    const groups: Record<string, any> = {};
    
    filteredPlannings.forEach(p => {
      const key = p[aggDimension] || '未分类';
      if (!groups[key]) {
        groups[key] = {
          name: key,
          planned: 0,
          uploaded: 0,
          details: new Set(),
          owners: new Set(),
          shops: new Set(),
        };
      }
      groups[key].planned += p.plannedCount || 0;
      groups[key].owners.add(p.ownerName);
      groups[key].shops.add(p.shop);
      if (aggDimension === 'category') groups[key].details.add(p.scene);
      else if (aggDimension === 'scene') groups[key].details.add(p.category);
    });

    Object.values(groups).forEach((group: any) => {
      group.uploaded = filteredProducts.filter(prod => prod[aggDimension] === group.name).length;
    });

    return Object.values(groups).sort((a, b) => b.planned - a.planned);
  };

  const groups = getAggregatedGroups();

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const timeProgress = (now.getDate() / daysInMonth) * 100;

  const dimensionLabels = {
    category: '品类',
    scene: '场景',
    shop: '店铺',
    channel: '渠道',
    ownerName: '负责人'
  };

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">上新进度监控</h1>
          <p className="text-xs text-[#86868B] mt-1">Bento Progress · 多维度聚合分析</p>
        </div>
        
        <div className="flex bg-[#E3E3E8] p-1 rounded-xl gap-1 overflow-x-auto custom-scrollbar flex-nowrap shrink-0 max-w-full">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="h-7 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterYear === 'all' ? '全部年' : `${filterYear}年`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部年</SelectItem>
              {uniqueYears.map(y => <SelectItem key={y} value={y}>{y}年</SelectItem>)}
            </SelectContent>
          </Select>
          
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="h-7 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterMonth === 'all' ? '全部月' : `${filterMonth}月`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部月</SelectItem>
              {uniqueMonths.map(m => <SelectItem key={m} value={m}>{m}月</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterDay} onValueChange={setFilterDay}>
            <SelectTrigger className="h-7 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterDay === 'all' ? '全部日' : `${filterDay}日`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部日</SelectItem>
              {uniqueDays.map(d => <SelectItem key={d} value={d}>{d}日</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="h-7 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterChannel === 'all' ? '全部渠道' : filterChannel}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部渠道</SelectItem>
              {uniqueChannels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterShop} onValueChange={setFilterShop}>
            <SelectTrigger className="h-7 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterShop === 'all' ? '全部店铺' : filterShop}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部店铺</SelectItem>
              {uniqueShops.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterOwner} onValueChange={setFilterOwner}>
            <SelectTrigger className="h-7 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterOwner === 'all' ? '全部负责人' : filterOwner.split('@')[0]}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部负责人</SelectItem>
              {uniqueOwners.map(o => <SelectItem key={o} value={o}>{o.split('@')[0]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-7 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterCategory === 'all' ? '全部品类' : filterCategory}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部品类</SelectItem>
              {uniqueCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3 shrink-0">
          <div className="flex bg-[#E3E3E8] p-1 rounded-xl gap-1">
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
          <div className="bg-[#E3E3E8] p-1 rounded-xl flex">
            <button onClick={() => setViewMode('card')} className={cn("p-1.5 rounded-lg transition-all", viewMode === 'card' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B]")}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-lg transition-all", viewMode === 'list' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B]")}>
              <List size={16} />
            </button>
          </div>
        </div>
      </header>

      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {groups.map((group: any, i) => {
            const rate = group.planned > 0 ? Math.round((group.uploaded / group.planned) * 100) : 0;
            const isLagging = rate < timeProgress - 10;
            
            return (
              <motion.div
                key={group.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "bg-white p-6 rounded-[24px] shadow-sm border transition-all duration-300 group hover:shadow-xl",
                  isLagging ? "border-red-100 bg-red-50/30" : "border-black/5"
                )}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-[#1D1D1F] truncate">{group.name}</h3>
                    <p className="text-[10px] text-[#86868B] font-bold truncate">
                      {Array.from(group.details).join(' · ') || '全局统计'}
                    </p>
                  </div>
                  <div className={cn(
                    "w-9 h-9 rounded-[14px] flex items-center justify-center shrink-0",
                    isLagging ? "bg-red-100 text-red-600" : "bg-[#FF6B00]/10 text-[#FF6B00]"
                  )}>
                    <Target size={18} />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="relative h-28 w-28 mx-auto">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="56" cy="56" r="50" fill="transparent" stroke="#F5F5F7" strokeWidth="8" />
                      <circle
                        cx="56" cy="56" r="50"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={314.159}
                        strokeDashoffset={314.159 - (314.159 * rate) / 100}
                        strokeLinecap="round"
                        className={cn("transition-all duration-1000", isLagging ? "text-red-500" : "text-[#FF6B00]")}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold text-[#1D1D1F]">{rate}%</span>
                      <span className="text-[9px] text-[#86868B] font-bold uppercase tracking-wider">完成率</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5">
                    <div className="space-y-1">
                      <span className="text-[9px] text-[#86868B] font-bold uppercase tracking-widest">已上架</span>
                      <p className="text-sm font-bold text-[#1D1D1F]">{group.uploaded}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <span className="text-[9px] text-[#86868B] font-bold uppercase tracking-widest">总规划</span>
                      <p className="text-sm font-bold text-[#1D1D1F]">{group.planned}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-[#86868B] font-bold">
                      <Users size={12} />
                      <span className="truncate">{Array.from(group.owners).join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#86868B] font-bold">
                      <Store size={12} />
                      <span className="truncate">{Array.from(group.shops).join(', ')}</span>
                    </div>
                  </div>

                  {isLagging && (
                    <div className="flex items-center gap-2 p-2.5 bg-red-100/50 rounded-xl text-red-600">
                      <AlertTriangle size={14} />
                      <span className="text-[11px] font-bold">落后 {Math.round(timeProgress - rate)}%</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F5F5F7]">
              <tr>
                <th className="text-left px-6 py-4 text-[11px] font-bold text-[#86868B] uppercase">{dimensionLabels[aggDimension]}</th>
                <th className="text-left px-6 py-4 text-[11px] font-bold text-[#86868B] uppercase">负责人 / 店铺</th>
                <th className="text-center px-6 py-4 text-[11px] font-bold text-[#86868B] uppercase">进度</th>
                <th className="text-right px-6 py-4 text-[11px] font-bold text-[#86868B] uppercase">规划 / 已上架</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {groups.map((group: any) => {
                const rate = group.planned > 0 ? Math.round((group.uploaded / group.planned) * 100) : 0;
                return (
                  <tr key={group.name} className="hover:bg-[#F5F5F7]/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-[#1D1D1F]">{group.name}</span>
                      <p className="text-[10px] text-[#86868B] font-bold">{Array.from(group.details).join(' · ')}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1D1D1F]">
                        <Users size={12} className="text-[#86868B]" /> {Array.from(group.owners).join(', ')}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[#86868B] font-bold mt-1">
                        <Store size={12} /> {Array.from(group.shops).join(', ')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-[#F5F5F7] rounded-full overflow-hidden">
                          <div className="h-full bg-[#FF6B00] rounded-full" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-xs font-bold text-[#1D1D1F] w-8">{rate}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-[#FF6B00]">{group.uploaded}</span>
                      <span className="text-[#86868B] mx-1">/</span>
                      <span className="text-sm font-bold text-[#1D1D1F]">{group.planned}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
