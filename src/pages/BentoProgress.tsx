import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutGrid, List, PieChart, AlertTriangle, Users, Store, Globe, Target, X, Copy, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { updateDoc, doc as firestoreDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

import { useSecureCollection } from '../hooks/useSecureCollection';
import { useSettings } from '../components/SettingsContext';

export const BentoProgress: React.FC = () => {
  const { profile, isAdmin, isSuperAdmin, currentCompanyId } = useAuth();
  const navigate = useNavigate();
  const { data: plannings } = useSecureCollection('plannings');
  const { data: products } = useSecureCollection('products');
  const { settings } = useSettings();
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [aggDimension, setAggDimension] = useState<'category' | 'scene' | 'shop' | 'channel' | 'ownerName'>('category');
  const [previewGroup, setPreviewGroup] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'planning' | 'links'>('planning');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  
  const calculateDays = (uploadTime?: number) => {
    if (!uploadTime) return 0;
    const diff = Date.now() - uploadTime;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleCopyProductIds = (productIds: string | string[]) => {
    const ids = Array.isArray(productIds) ? productIds.join('\n') : productIds;
    navigator.clipboard.writeText(ids);
    toast.success(`已复制 ${Array.isArray(productIds) ? productIds.length : 1} 个商品 ID`);
  };

  const handleToggleProductStep = async (productId: string, step: string, currentStatus: boolean) => {
    try {
      const productRef = firestoreDoc(db, 'products', productId);
      await updateDoc(productRef, {
        [`steps.${step}`]: !currentStatus,
        updatedAt: Date.now()
      });
      toast.success(`环节“${step}”状态已更新`);
    } catch (error) {
      console.error('Update SOP error:', error);
      toast.error('更新失败，请重试');
    }
  };

  const getUserDisplayName = (email: string) => {
    if (!email) return '未分配';
    return email.split('@')[0];
  };

  const handlePreviewOpen = (group: string) => {
    setPreviewGroup(group);
    setActiveTab('planning');
    setSelectedProductIds([]);
  };

  useEffect(() => {
    if (previewGroup) {
      const timer = setTimeout(() => setIsReady(true), 150);
      return () => {
        setIsReady(false);
        clearTimeout(timer);
      };
    }
  }, [previewGroup]);


  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterShop, setFilterShop] = useState<string>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterParentCategory, setFilterParentCategory] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const {
    uniqueYears,
    uniqueMonths,
    uniqueDays,
    uniqueChannels,
    uniqueShops,
    uniqueParentCategories,
    uniqueOwners,
    uniqueCategories
  } = React.useMemo(() => ({
    uniqueYears: Array.from(new Set(plannings.map(p => typeof p.month === 'string' ? p.month.split('-')[0] : null).filter(Boolean))),
    uniqueMonths: Array.from(new Set(plannings.map(p => typeof p.month === 'string' ? p.month.split('-')[1] : null).filter(Boolean))),
    uniqueDays: Array.from(new Set(plannings.map(p => p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null).filter(Boolean))),
    uniqueChannels: Array.from(new Set(plannings.map(p => p.channel).filter(Boolean))),
    uniqueShops: Array.from(new Set(plannings.map(p => p.shop).filter(Boolean))),
    uniqueParentCategories: Array.from(new Set(plannings.map(p => p.parentCategory).filter(Boolean))),
    uniqueOwners: Array.from(new Set(plannings.map(p => p.ownerName).filter(Boolean))),
    uniqueCategories: Array.from(new Set(plannings.map(p => p.category).filter(Boolean)))
  }), [plannings]);

  const filteredPlannings = React.useMemo(() => plannings.filter(p => {
    const pYear = typeof p.month === 'string' ? p.month.split('-')[0] : null;
    const pMonth = typeof p.month === 'string' ? p.month.split('-')[1] : null;
    const pDay = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;
    if (filterYear !== 'all' && pYear !== filterYear) return false;
    if (filterMonth !== 'all' && pMonth !== filterMonth) return false;
    if (filterDay !== 'all' && pDay !== filterDay) return false;
    if (filterChannel !== 'all' && p.channel !== filterChannel) return false;
    if (filterShop !== 'all' && p.shop !== filterShop) return false;
    if (filterOwner !== 'all' && p.ownerName !== filterOwner) return false;
    if (filterParentCategory !== 'all' && p.parentCategory !== filterParentCategory) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  }), [plannings, filterYear, filterMonth, filterDay, filterChannel, filterShop, filterOwner, filterParentCategory, filterCategory]);

  const filteredProducts = React.useMemo(() => products.filter(p => {
    const pYear = typeof p.month === 'string' ? p.month.split('-')[0] : null;
    const pMonth = typeof p.month === 'string' ? p.month.split('-')[1] : null;
    const pDay = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;
    if (filterYear !== 'all' && pYear !== filterYear) return false;
    if (filterMonth !== 'all' && pMonth !== filterMonth) return false;
    if (filterDay !== 'all' && pDay !== filterDay) return false;
    if (filterChannel !== 'all' && p.channel !== filterChannel) return false;
    if (filterShop !== 'all' && p.shop !== filterShop) return false;
    if (filterOwner !== 'all' && p.ownerName !== filterOwner) return false;
    if (filterParentCategory !== 'all' && p.parentCategory !== filterParentCategory) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  }), [products, filterYear, filterMonth, filterDay, filterChannel, filterShop, filterOwner, filterParentCategory, filterCategory]);

  // Dynamic aggregation logic
  const groups = React.useMemo(() => {
    const grps: Record<string, any> = {};
    
    filteredPlannings.forEach(p => {
      const key = p[aggDimension] || '未分类';
      if (!grps[key]) {
        grps[key] = {
          name: key,
          planned: 0,
          uploaded: 0,
          details: new Set(),
          owners: new Set(),
          shops: new Set(),
        };
      }
      grps[key].planned += p.plannedCount || 0;
      grps[key].owners.add(p.ownerName);
      grps[key].shops.add(p.shop);
      if (aggDimension === 'category') grps[key].details.add(p.scene);
      else if (aggDimension === 'scene') grps[key].details.add(p.category);
    });

    Object.values(grps).forEach((group: any) => {
      group.uploaded = filteredProducts.filter(prod => prod[aggDimension] === group.name).length;
    });

    return Object.values(grps).sort((a, b) => b.planned - a.planned);
  }, [filteredPlannings, filteredProducts, aggDimension]);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const timeProgress = (now.getDate() / daysInMonth) * 100;

  const dimensionLabels = {
    parentCategory: '类目',
    category: '品类',
    scene: '场景',
    shop: '店铺',
    channel: '渠道',
    ownerName: '负责人'
  };

  const previewPlannings = previewGroup ? filteredPlannings.filter(p => (p[aggDimension] || '未分类') === previewGroup) : [];

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">上新进度监控</h1>
          <p className="text-xs text-[#86868B] mt-1">Bento Progress · 多维度聚合分析</p>
        </div>
        
        <div className="flex bg-[#E3E3E8] p-1 rounded-xl gap-1 overflow-x-auto custom-scrollbar flex-nowrap shrink-0 max-w-full">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterYear === 'all' ? '全部年' : `${filterYear}年`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部年</SelectItem>
              {uniqueYears.map(y => <SelectItem key={y} value={y}>{y}年</SelectItem>)}
            </SelectContent>
          </Select>
          
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterMonth === 'all' ? '全部月' : `${filterMonth}月`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部月</SelectItem>
              {uniqueMonths.map(m => <SelectItem key={m} value={m}>{m}月</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterDay} onValueChange={setFilterDay}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterDay === 'all' ? '全部日' : `${filterDay}日`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部日</SelectItem>
              {uniqueDays.map(d => <SelectItem key={d} value={d}>{d}日</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterChannel === 'all' ? '全部渠道' : filterChannel}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部渠道</SelectItem>
              {uniqueChannels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterShop} onValueChange={setFilterShop}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterShop === 'all' ? '全部店铺' : filterShop}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部店铺</SelectItem>
              {uniqueShops.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterOwner} onValueChange={setFilterOwner}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterOwner === 'all' ? '全部负责人' : (typeof filterOwner === 'string' ? filterOwner.split('@')[0] : String(filterOwner))}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部负责人</SelectItem>
              {uniqueOwners.map(o => <SelectItem key={o} value={o}>{(typeof o === 'string' ? o.split('@')[0] : String(o))}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterParentCategory} onValueChange={setFilterParentCategory}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
              <SelectValue>{filterParentCategory === 'all' ? '全部类目' : filterParentCategory}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">全部类目</SelectItem>
              {uniqueParentCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
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
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  aggDimension === key ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B] hover:text-[#1D1D1F]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="bg-[#E3E3E8] p-1 rounded-xl flex">
            <button onClick={() => setViewMode('card')} className={cn("p-2 rounded-lg transition-all", viewMode === 'card' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B]")}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B]")}>
              <List size={16} />
            </button>
          </div>
        </div>
      </header>

      {viewMode === 'card' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {groups.map((group: any, i) => {
            const rate = group.planned > 0 ? Math.round((group.uploaded / group.planned) * 100) : 0;
            const isLagging = rate < timeProgress - 10;
            
            return (
              <motion.div
                key={group.name}
                onDoubleClick={() => handlePreviewOpen(group.name)}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "bg-white p-3 rounded-2xl shadow-sm border transition-all duration-300 group hover:shadow-md cursor-pointer flex flex-col",
                  isLagging ? "border-red-100 bg-red-50/30" : "border-black/5"
                )}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0 pr-2">
                    <h3 className="text-sm font-bold text-[#1D1D1F] line-clamp-1 truncate">{group.name}</h3>
                    <p className="text-[10px] text-[#86868B] font-medium mt-0.5 truncate">
                      {Array.from(group.details).join(' · ') || '全局统计'}
                    </p>
                  </div>
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                    isLagging ? "bg-red-100 text-red-600" : "bg-[#FF6B00]/10 text-[#FF6B00]"
                  )}>
                    <Target size={14} />
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div className="relative h-16 w-16 mx-auto mb-3">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="32" cy="32" r="28" fill="transparent" stroke="#F5F5F7" strokeWidth="5" />
                      <circle
                        cx="32" cy="32" r="28"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="5"
                        strokeDasharray={175.9}
                        strokeDashoffset={175.9 - (175.9 * rate) / 100}
                        strokeLinecap="round"
                        className={cn("transition-all duration-1000", isLagging ? "text-red-500" : "text-[#FF6B00]")}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-[#1D1D1F]">{rate}%</span>
                    </div>
                  </div>

                  <div className="flex justify-between text-center pt-3 border-t border-black/5 mt-auto">
                    <div className="flex-1">
                      <span className="text-[10px] text-[#86868B] font-medium block">已上架</span>
                      <p className="text-xs font-bold text-[#1D1D1F] leading-tight mt-0.5">{group.uploaded}</p>
                    </div>
                    <div className="w-px bg-black/5 mx-2" />
                    <div className="flex-1">
                      <span className="text-[10px] text-[#86868B] font-medium block">规划</span>
                      <p className="text-xs font-bold text-[#1D1D1F] leading-tight mt-0.5">{group.planned}</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-1.5 text-[10px] text-[#86868B] font-medium">
                    <div className="flex items-center gap-1.5">
                      <Users size={12} className="shrink-0" />
                      <span className="truncate">{Array.from(group.owners).map(o => typeof o === 'string' ? o.split('@')[0] : String(o)).join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Store size={12} className="shrink-0" />
                      <span className="truncate">{Array.from(group.shops).join(', ')}</span>
                    </div>
                  </div>
                  
                  {isLagging && (
                    <div className="mt-2 text-[10px] font-bold text-red-500 bg-red-50 rounded py-1 px-2 flex items-center justify-center gap-1">
                      <AlertTriangle size={10} className="shrink-0" />
                      距目标 {Math.round(timeProgress - rate)}%
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
                  <tr key={group.name} onDoubleClick={() => handlePreviewOpen(group.name)} className="hover:bg-[#F5F5F7]/50 transition-colors cursor-pointer">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-[#1D1D1F]">{group.name}</span>
                      <p className="text-[10px] text-[#86868B] font-bold">{Array.from(group.details).join(' · ')}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1D1D1F]">
                        <Users size={12} className="text-[#86868B]" /> {Array.from(group.owners).map(o => typeof o === 'string' ? o.split('@')[0] : String(o)).join(', ')}
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

      <Dialog open={!!previewGroup} onOpenChange={(open) => !open && setPreviewGroup(null)}>
        <DialogContent className={cn(
          "max-h-[92vh] overflow-hidden rounded-[32px] p-0 flex flex-col gap-0 border-none shadow-2xl transition-all duration-300",
          activeTab === 'planning' ? "max-w-[95vw] xl:max-w-[1300px]" : "max-w-[98vw] w-[1700px] sm:max-w-[95vw] md:max-w-[1700px]"
        )}>
          {isReady ? (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-black/5 px-8 py-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <DialogTitle className="text-xl font-bold text-[#1D1D1F]">
                      {previewGroup} - {activeTab === 'planning' ? '规划明细' : '商品链接'}
                    </DialogTitle>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-[#86868B] font-medium">双击行可直接跳转并进行一次性绑定</p>
                      {activeTab === 'links' && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-black/10" />
                          <span className="bg-black/5 px-2 py-0.5 rounded-md text-[11px] font-bold">共 {products.filter(pr => previewPlannings.some(pl => pl.id === pr.planningId)).length} 个商品</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex bg-[#F5F5F7] p-1 rounded-xl gap-1 border border-black/[0.03]">
                    <button 
                      onClick={() => setActiveTab('planning')}
                      className={cn(
                        "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                        activeTab === 'planning' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B] hover:text-[#1D1D1F]"
                      )}
                    >
                      上新规划
                    </button>
                    <button 
                      onClick={() => setActiveTab('links')}
                      className={cn(
                        "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                        activeTab === 'links' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B] hover:text-[#1D1D1F]"
                      )}
                    >
                      商品链接
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    {activeTab === 'links' && selectedProductIds.length > 0 && (
                      <Button 
                        onClick={() => {
                          const idsToCopy = products.filter(pr => selectedProductIds.includes(pr.id)).map(pr => pr.productId);
                          handleCopyProductIds(idsToCopy);
                        }}
                        className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl gap-2 text-sm font-bold h-10 px-5 shadow-lg shadow-[#FF6B00]/20 animate-in fade-in zoom-in duration-200"
                      >
                        <Plus size={16} /> 批量复制 {selectedProductIds.length} 个商品ID
                      </Button>
                    )}
                    <button onClick={() => setPreviewGroup(null)} className="p-2.5 hover:bg-[#F5F5F7] rounded-full transition-colors bg-[#F5F5F7]/50">
                      <X size={20} className="text-[#86868B]" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-[#FBFBFD] custom-scrollbar p-8">
                <AnimatePresence mode="wait">
                  {activeTab === 'planning' ? (
                    <motion.div 
                      key="planning"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden"
                    >
                      <Table className="min-w-[900px]">
                        <TableHeader className="bg-[#F5F5F7]">
                          <TableRow className="hover:bg-transparent border-none">
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4 pl-6">月份</TableHead>
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">商机来源</TableHead>
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">品类</TableHead>
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">场景</TableHead>
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">核心关键词</TableHead>
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4 text-center">规划/已上架</TableHead>
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">负责人</TableHead>
                            <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4 pr-6">店铺/渠道</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewPlannings.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="h-48 text-center text-[#86868B] text-sm">暂无数据</TableCell>
                            </TableRow>
                          ) : (
                            previewPlannings.map((p) => (
                              <TableRow 
                                key={p.id} 
                                onDoubleClick={() => navigate('/products', { state: { action: 'bind', planning: p } })}
                                className="hover:bg-[#F5F5F7]/50 transition-colors border-black/5 group cursor-pointer"
                              >
                                <TableCell className="pl-6"><div className="text-sm font-medium text-[#1D1D1F]">{p.month}</div></TableCell>
                                <TableCell><div className="text-[11px] text-[#86868B] font-bold">{p.source}</div></TableCell>
                                <TableCell><div className="text-sm font-bold text-[#1D1D1F]">{p.category}</div></TableCell>
                                <TableCell><div className="text-[11px] text-[#86868B] font-medium">{p.scene}</div></TableCell>
                                <TableCell className="text-sm text-[#1D1D1F] max-w-[200px] truncate">{p.keywords}</TableCell>
                                <TableCell className="text-center">
                                  <span className="text-sm font-bold text-[#FF6B00]">{p.uploadedCount || 0}</span>
                                  <span className="text-[#86868B] mx-1 text-sm">/</span>
                                  <span className="text-sm text-[#1D1D1F] font-bold">{p.plannedCount}</span>
                                </TableCell>
                                <TableCell className="text-sm text-[#1D1D1F] font-medium">{getUserDisplayName(p.ownerName)}</TableCell>
                                <TableCell className="pr-6">
                                  <div className="text-sm text-[#1D1D1F] font-bold">{p.shop}</div>
                                  <div className="text-[11px] text-[#86868B] font-medium">{p.channel}</div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="links"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-black/5 overflow-hidden"
                    >
                      <TooltipProvider>
                        <Table className="w-full table-fixed">
                          <TableHeader className="bg-[#F5F5F7]">
                            <TableRow className="hover:bg-transparent border-none">
                              <TableHead className="w-[60px] py-5 text-center">
                                <Checkbox 
                                  checked={
                                    products.filter(pr => previewPlannings.some(pl => pl.id === pr.planningId)).length > 0 &&
                                    products.filter(pr => previewPlannings.some(pl => pl.id === pr.planningId)).every(pr => selectedProductIds.includes(pr.id))
                                  }
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      const allIds = products.filter(pr => previewPlannings.some(pl => pl.id === pr.planningId)).map(pr => pr.id);
                                      setSelectedProductIds(allIds);
                                    } else {
                                      setSelectedProductIds([]);
                                    }
                                  }}
                                  className="rounded-[6px] w-5 h-5 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                                />
                              </TableHead>
                              <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest pl-4 w-[180px]">商品信息</TableHead>
                              <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center w-[160px]">类目/归属</TableHead>
                              <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center w-[120px]">负责人</TableHead>
                              <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center w-[150px]">店铺渠道</TableHead>
                              <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center">SOP 全流程跟踪</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {products.filter(pr => previewPlannings.some(pl => pl.id === pr.planningId)).length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="h-64 text-center text-[#86868B] text-sm bg-white">
                                  <div className="flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-[#F5F5F7] flex items-center justify-center">
                                      <Plus size={32} className="text-[#86868B] opacity-20" />
                                    </div>
                                    <span className="text-lg font-bold text-[#1D1D1F]">暂无关联商品链接</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : (
                              products.filter(pr => previewPlannings.some(pl => pl.id === pr.planningId)).map((pr) => {
                                const planning = previewPlannings.find(p => p.id === pr.planningId);
                                const channelKey = pr.channel || planning?.channel;
                                let channelSops = settings?.channels?.[channelKey]?.sop || [];
                                
                                if (channelSops.length === 0 && settings?.channels) {
                                  const firstChannel = Object.values(settings.channels)[0] as any;
                                  channelSops = firstChannel?.sop || [];
                                }

                                const uploadDate = pr.uploadTime ? new Date(pr.uploadTime).toISOString().split('T')[0] : '-';
                                const days = calculateDays(pr.uploadTime);
                                
                                return (
                                  <TableRow key={pr.id} className="hover:bg-[#F5F5F7]/30 transition-colors border-black/5 group h-28">
                                    <TableCell className="text-center">
                                      <Checkbox 
                                        checked={selectedProductIds.includes(pr.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) setSelectedProductIds([...selectedProductIds, pr.id]);
                                          else setSelectedProductIds(selectedProductIds.filter(id => id !== pr.id));
                                        }}
                                        className="rounded-[6px] w-5 h-5 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                                      />
                                    </TableCell>
                                    <TableCell className="pl-4">
                                      <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-bold text-[14px] text-[#1D1D1F] tracking-tighter leading-none">{pr.productId}</span>
                                          <button onClick={() => handleCopyProductIds(pr.productId)} className="text-[#A1A1A6] hover:text-[#FF6B00] transition-colors p-1 rounded-md hover:bg-[#FF6B00]/5">
                                            <Copy size={12} />
                                          </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-[#86868B] font-bold bg-[#F5F5F7] px-1.5 py-0.5 rounded-md cursor-default tracking-tight">{uploadDate}</span>
                                          {days > 0 && (
                                            <span className="text-[10px] text-[#FF6B00] font-extrabold tracking-tight underline underline-offset-2">上架第 {days} 天</span>
                                          )}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex flex-col gap-1 items-center">
                                        <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md inline-block max-w-full truncate">{pr.category || '-'}</span>
                                        <div className="flex items-center gap-1.5 text-[10px] text-[#86868B] font-bold mt-0.5 opacity-80">
                                          <span className="truncate max-w-[100px]">{pr.keywords || '-'}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className="text-[11px] font-bold text-[#1D1D1F] bg-[#F5F5F7] px-3 py-1 rounded-lg border border-black/[0.03]">{getUserDisplayName(pr.assignedOwner || pr.ownerName)}</span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex flex-col gap-0.5 items-center">
                                        <div className="text-[11px] font-black text-[#1D1D1F] tracking-tight truncate w-full">{pr.shop}</div>
                                        <div className="text-[9px] text-[#86868B] font-bold uppercase tracking-widest">{pr.channel}</div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="pr-8">
                                      <div className="flex items-center justify-between w-full px-2">
                                        {channelSops.map((step: string) => (
                                          <div key={step} className="flex flex-col items-center gap-2.5 group/step flex-1">
                                            <span className={cn("text-[10px] font-bold transition-colors tracking-tighter text-center", pr.steps?.[step] ? "text-[#FF6B00]" : "text-[#86868B] opacity-60")}>{step}</span>
                                            <button 
                                              onClick={() => handleToggleProductStep(pr.id, step, !!pr.steps?.[step])}
                                              className={cn(
                                                "w-8 h-8 rounded-full border-[2.5px] transition-all flex items-center justify-center scale-100 active:scale-90",
                                                pr.steps?.[step] 
                                                  ? "bg-[#FF6B00] border-[#FF6B00] text-white shadow-[0_4px_12px_rgba(255,107,0,0.3)]" 
                                                  : "bg-white border-black/10 text-transparent hover:border-[#FF6B00]/40"
                                              )}
                                            >
                                              {pr.steps?.[step] ? (
                                                <Check size={16} strokeWidth={4} className="animate-in zoom-in duration-300" />
                                              ) : (
                                                <div className="w-1.5 h-1.5 rounded-full bg-black/10 group-hover/step:bg-[#FF6B00]/30 transition-colors" />
                                              )}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </TooltipProvider>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="px-8 py-5 border-t border-black/5 flex justify-end bg-white">
                <Button 
                  variant="default" 
                  onClick={() => setPreviewGroup(null)} 
                  className="rounded-2xl h-11 px-10 bg-[#1D1D1F] hover:bg-black font-bold text-sm shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  关闭
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-[#86868B] font-bold text-sm">加载中...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

