import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Copy, Trash2, MoreHorizontal, Search, LayoutGrid, List, Download, Upload, Edit2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const defaultResultLabels: any = {
  '待设置': { color: 'bg-gray-100 text-gray-500' },
  '滞销': { color: 'bg-blue-100 text-blue-600' },
  '动销': { color: 'bg-green-100 text-green-600' },
  '小爆': { color: 'bg-orange-100 text-orange-600' },
  '大爆': { color: 'bg-red-100 text-red-600' },
};

export const ProductManagement: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState<any[]>([]);
  const [plannings, setPlannings] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ channels: {} });

  const allShops = React.useMemo(() => {
    const shops: { name: string, channel: string, owners: string[] }[] = [];
    Object.entries(settings.channels || {}).forEach(([cName, cData]: [string, any]) => {
      (cData.shops || []).forEach((s: any) => {
        shops.push({ name: s.name || s, channel: cName, owners: s.owners || [] });
      });
    });
    return shops;
  }, [settings.channels]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterShop, setFilterShop] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const calculateDays = (dateStr: string) => {
    if (!dateStr) return 0;
    const uploadDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - uploadDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const [newProduct, setNewProduct] = useState({
    productId: '',
    category: '',
    scene: '',
    keywords: '',
    channel: '',
    shop: '',
    planningId: '',
    assignedOwner: '', // New field for assigned owner email
    month: '', // Added month
  });

  useEffect(() => {
    if (location.state?.action === 'bind' && location.state?.planning) {
      const p = location.state.planning;
      setNewProduct({
        productId: '',
        category: p.category || '',
        scene: p.scene || '',
        keywords: p.keywords || '',
        channel: p.channel || '',
        shop: p.shop || '',
        planningId: p.id || '',
        assignedOwner: p.ownerName || '',
        month: p.month || '',
      });
      setIsAddOpen(true);
      
      // Reset filters to ensure the user can see the add form clearly
      setFilterYear('all');
      setFilterMonth('all');
      setFilterDay('all');
      setFilterChannel('all');
      setFilterShop('all');
      setFilterOwner('all');
      setFilterCategory('all');
      setSearchTerm('');
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setSettings(doc.data());
    });

    const qP = isAdmin ? collection(db, 'plannings') : query(collection(db, 'plannings'), where('ownerId', '==', profile?.uid || ''));
    const unsubP = onSnapshot(qP, (snapshot) => {
      setPlannings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qProd = isAdmin ? collection(db, 'products') : query(collection(db, 'products'), where('ownerId', '==', profile?.uid || ''));
    const unsubProd = onSnapshot(qProd, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSettings();
      unsubP();
      unsubProd();
    };
  }, [isAdmin, profile]);

  const handleAddProduct = async () => {
    if (!newProduct.productId) return toast.error('请输入商品 ID');
    if (!newProduct.channel) return toast.error('请选择渠道');
    if (!newProduct.assignedOwner) return toast.error('请选择负责人');
    
    // Split by comma, space, or newline, and filter out empty strings
    const productIds = newProduct.productId.split(/[\s,]+/).filter(id => id.trim() !== '');
    
    if (productIds.length === 0) return toast.error('请输入有效的商品 ID');

    const channelSop = settings.channels[newProduct.channel]?.sop || [];
    const initialSteps: any = {};
    channelSop.forEach((step: string) => {
      initialSteps[step] = step === '上架';
    });

    try {
      const batch = writeBatch(db);
      
      productIds.forEach(id => {
        const newDocRef = doc(collection(db, 'products'));
        batch.set(newDocRef, {
          ...newProduct,
          productId: id.trim(),
          uploadTime: new Date().toISOString(),
          ownerId: profile.uid,
          ownerName: profile.displayName || profile.email,
          assignedOwner: newProduct.assignedOwner,
          month: newProduct.month || new Date().toISOString().slice(0, 7),
          steps: initialSteps,
          result: settings.linkJudgments?.[0]?.label || '待设置',
          createdAt: new Date().toISOString(),
        });
      });

      if (newProduct.planningId) {
        const p = plannings.find(pl => pl.id === newProduct.planningId);
        if (p) {
          batch.update(doc(db, 'plannings', newProduct.planningId), {
            uploadedCount: (p.uploadedCount || 0) + productIds.length
          });
        }
      }

      await batch.commit();

      setNewProduct({ productId: '', category: '', scene: '', keywords: '', channel: '', shop: '', planningId: '', assignedOwner: '', month: '' });
      setIsAddOpen(false);
      toast.success(`成功绑定 ${productIds.length} 个链接`);
    } catch (error) {
      toast.error('绑定失败');
    }
  };

  const toggleStep = async (productId: string, step: string, currentVal: boolean) => {
    await updateDoc(doc(db, 'products', productId), {
      [`steps.${step}`]: !currentVal
    });
  };

  const updateResult = async (productId: string, result: string) => {
    await updateDoc(doc(db, 'products', productId), { result });
  };

  const handleBatchUpdateSteps = async (channel: string, step: string, value: boolean) => {
    if (selectedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;
      selectedIds.forEach(id => {
        const product = products.find(p => p.id === id);
        if (product && product.channel === channel) {
          batch.update(doc(db, 'products', id), { [`steps.${step}`]: value });
          updatedCount++;
        }
      });
      if (updatedCount === 0) {
        toast.error(`选中的商品中没有属于 ${channel} 的`);
        return;
      }
      await batch.commit();
      toast.success(`成功更新 ${updatedCount} 个商品的进度`);
    } catch (error) {
      toast.error('批量更新失败');
    }
  };

  const handleBatchUpdateResult = async (result: string) => {
    if (selectedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.update(doc(db, 'products', id), { result });
      });
      await batch.commit();
      toast.success('批量更新结果成功');
    } catch (error) {
      toast.error('批量更新失败');
    }
  };

  const handleBatchCopyIds = (channel?: string) => {
    if (selectedIds.length === 0) return;
    let idsToCopy = products.filter(p => selectedIds.includes(p.id));
    if (channel) {
      idsToCopy = idsToCopy.filter(p => p.channel === channel);
    }
    if (idsToCopy.length === 0) {
      toast.error('没有可复制的 ID');
      return;
    }
    navigator.clipboard.writeText(idsToCopy.map(p => p.productId).join('\n'));
    toast.success(`已复制 ${idsToCopy.length} 个商品 ID`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      toast.success('已删除');
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => batch.delete(doc(db, 'products', id)));
      await batch.commit();
      setSelectedIds([]);
      toast.success(`成功删除 ${selectedIds.length} 个链接`);
    } catch (error) {
      toast.error('批量删除失败');
    }
  };

  const exportToExcel = () => {
    const data = products.map(p => ({
      '商品 ID': p.productId,
      '品类': p.category,
      '场景': p.scene,
      '渠道': p.channel,
      '店铺': p.shop,
      '负责人': p.ownerName,
      '结果': p.result || '待设置',
      '上架时间': p.uploadTime
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
    XLSX.writeFile(workbook, "product_export.xlsx");
    toast.success('导出成功');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      let count = 0;
      for (const item of data as any[]) {
        try {
          await addDoc(collection(db, 'products'), {
            productId: String(item['商品 ID']),
            category: item['品类'],
            scene: item['场景'],
            channel: item['渠道'],
            shop: item['店铺'],
            month: item['月份'] || new Date().toISOString().slice(0, 7),
            assignedOwner: item['负责人'] || profile.email,
            ownerId: profile.uid,
            ownerName: profile.displayName || profile.email,
            steps: { '上架': true },
            result: 'unsold',
            createdAt: new Date().toISOString(),
          });
          count++;
        } catch (err) {}
      }
      toast.success(`成功导入 ${count} 条数据`);
    };
    reader.readAsBinaryString(file);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.productId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const pYear = p.month?.split('-')[0];
    const pMonth = p.month?.split('-')[1];
    const pDay = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;

    const matchesYear = filterYear === 'all' || pYear === filterYear;
    const matchesMonth = filterMonth === 'all' || pMonth === filterMonth;
    const matchesDay = filterDay === 'all' || pDay === filterDay;
    const matchesChannel = filterChannel === 'all' || p.channel === filterChannel;
    const matchesShop = filterShop === 'all' || p.shop === filterShop;
    const matchesOwner = filterOwner === 'all' || p.assignedOwner === filterOwner;
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    
    return matchesSearch && matchesYear && matchesMonth && matchesDay && matchesChannel && matchesShop && matchesOwner && matchesCategory;
  });

  const uniqueYears = Array.from(new Set(products.map(p => p.month?.split('-')[0]).filter(Boolean))).sort().reverse() as string[];
  const uniqueMonths = Array.from(new Set(products.map(p => p.month?.split('-')[1]).filter(Boolean))).sort().reverse() as string[];
  const uniqueDays = Array.from(new Set(products.map(p => p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null).filter(Boolean))).sort().reverse() as string[];
  const uniqueChannels = Array.from(new Set(products.map(p => p.channel).filter(Boolean))) as string[];
  const uniqueShops = Array.from(new Set(products.map(p => p.shop).filter(Boolean))) as string[];
  const uniqueOwners = Array.from(new Set(products.map(p => p.assignedOwner).filter(Boolean))) as string[];
  const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];

  const judgments = settings.linkJudgments || [
    { label: '待设置', definition: '尚未进行链接判定的商品', color: '#86868B' },
    { label: '滞销', definition: '上架后无销量或销量极低的商品', color: '#3B82F6' },
    { label: '动销', definition: '有稳定销量但未达爆款标准的商品', color: '#10B981' },
    { label: '小爆', definition: '销量增长迅速，具有爆款潜力的商品', color: '#F59E0B' },
    { label: '大爆', definition: '销量极高，处于爆发期的核心商品', color: '#EF4444' },
  ];

  const getResultStyle = (label: string) => {
    const judgment = judgments.find((j: any) => j.label === label);
    if (judgment?.color) {
      return { backgroundColor: `${judgment.color}20`, color: judgment.color };
    }
    return { backgroundColor: '#F3F4F6', color: '#6B7280' }; // Default gray
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">链接管理</h1>
          <p className="text-xs text-[#86868B] mt-1">Product Lifecycle · 环节 SOP 跟踪与结果标注</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-[#E3E3E8] p-1 rounded-xl shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3 text-[#86868B]" size={14} />
              <input 
                placeholder="搜索商品 ID..." 
                className="h-7 w-48 pl-8 pr-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#1D1D1F] placeholder:text-[#86868B] focus:bg-white focus:shadow-sm focus:outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
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
          <div className="bg-[#E3E3E8] p-1 rounded-xl flex">
            <button onClick={() => setViewMode('table')} className={cn("p-2 rounded-lg transition-all", viewMode === 'table' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B]")}>
              <List size={20} />
            </button>
            <button onClick={() => setViewMode('card')} className={cn("p-2 rounded-lg transition-all", viewMode === 'card' ? "bg-white shadow-sm text-[#FF6B00]" : "text-[#86868B]")}>
              <LayoutGrid size={20} />
            </button>
          </div>
          <div className="flex items-center gap-3 border-l border-black/5 pl-6 ml-2">
            <Button variant="outline" size="sm" className="rounded-xl h-10 gap-2 border-black/10 px-5" onClick={exportToExcel}>
              <Download size={18} /> 导出
            </Button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleImport} />
            <Button variant="outline" size="sm" className="rounded-xl h-10 gap-2 border-black/10 px-5" onClick={() => fileInputRef.current?.click()}>
              <Upload size={18} /> 导入
            </Button>
            <Button 
              onClick={() => setIsAddOpen(!isAddOpen)}
              className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl gap-2 text-sm font-bold px-8 h-10 ml-2 shadow-lg shadow-[#FF6B00]/20"
            >
              <Plus size={18} /> {isAddOpen ? '取消绑定' : '一次性绑定'}
            </Button>
          </div>
        </div>
      </header>

      {selectedIds.length > 0 && (() => {
        const selectedChannels = Array.from(new Set(products.filter(p => selectedIds.includes(p.id)).map(p => p.channel).filter(Boolean)));
        return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#1D1D1F] text-white px-6 py-4 rounded-[24px] shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-8">
          <div className="flex items-center gap-2 border-r border-white/10 pr-6">
            <span className="text-xs font-bold">已选择 {selectedIds.length} 项</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-white/60 hover:text-white" onClick={() => setSelectedIds([])}>取消</Button>
          </div>
          
          <div className="flex items-center gap-4 border-r border-white/10 pr-6">
            <span className="text-[10px] font-bold text-white/40 uppercase whitespace-nowrap">批量 SOP</span>
            <div className="flex flex-col gap-3 max-w-[60vw] overflow-x-auto custom-scrollbar pb-1">
              {selectedChannels.map(channel => {
                const stepsForChannel = settings.channels[channel]?.sop || [];
                if (stepsForChannel.length === 0) return null;
                const channelProducts = products.filter(p => selectedIds.includes(p.id) && p.channel === channel);
                return (
                  <div key={channel} className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-[#FF6B00] whitespace-nowrap">{channel}:</span>
                    <div className="flex items-center gap-4 flex-nowrap">
                      {stepsForChannel.map((step: string) => {
                        const allChecked = channelProducts.length > 0 && channelProducts.every(p => p.steps?.[step]);
                        return (
                          <div key={step} className="flex items-center gap-1.5 whitespace-nowrap">
                            <Checkbox 
                              checked={allChecked}
                              onCheckedChange={(checked) => handleBatchUpdateSteps(channel, step, !!checked)}
                              className="w-3.5 h-3.5 rounded-sm border-white/20 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                            />
                            <span className={cn("text-[10px] font-bold", allChecked ? "text-white" : "text-white/60")}>{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 border-r border-white/10 pr-6">
            <span className="text-[10px] font-bold text-white/40 uppercase">批量判定</span>
            <div className="flex gap-2">
              {judgments.map((j: any) => (
                <React.Fragment key={j.label}>
                  <Tooltip content={j.definition}>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 px-2 text-[10px] bg-white/5 border-white/10 hover:bg-white/10"
                      onClick={() => handleBatchUpdateResult(j.label)}
                    >
                      {j.label}
                    </Button>
                  </Tooltip>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedChannels.length > 1 ? (
              <Popover>
                <PopoverTrigger render={
                  <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs hover:bg-white/10">
                    <Copy size={14} /> 复制 ID (需选渠道)
                  </Button>
                } />
                <PopoverContent className="w-40 p-2 rounded-xl bg-[#1D1D1F] border-white/10 text-white" side="top">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-white/40 px-2 pb-1">选择要复制的渠道</p>
                    {selectedChannels.map(c => (
                      <Button key={c} variant="ghost" size="sm" className="w-full justify-start text-xs h-8 hover:bg-white/10" onClick={() => handleBatchCopyIds(c)}>
                        {c} ({products.filter(p => selectedIds.includes(p.id) && p.channel === c).length})
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs hover:bg-white/10" onClick={() => handleBatchCopyIds()}>
                <Copy size={14} /> 复制 ID
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs text-red-400 hover:bg-red-400/10" onClick={handleBatchDelete}>
              <Trash2 size={14} /> 批量删除
            </Button>
          </div>
        </div>
        );
      })()}
      {isAddOpen && (
        <div className="bg-white p-6 rounded-[24px] border border-[#FF6B00]/20 shadow-xl shadow-[#FF6B00]/5 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2 md:col-span-5">
              <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">商品 ID (支持多个，用空格、逗号或换行分隔)</label>
              <textarea 
                placeholder="输入商品 ID..." 
                className="w-full rounded-xl border border-black/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/20 resize-none h-20" 
                value={newProduct.productId} 
                onChange={e => setNewProduct({...newProduct, productId: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">关联规划</label>
              <Select value={newProduct.planningId} onValueChange={val => {
                const p = plannings.find(pl => pl.id === val);
                if (p) {
                  setNewProduct({...newProduct, planningId: val, category: p.category, scene: p.scene, keywords: p.keywords, channel: p.channel, shop: p.shop, month: p.month});
                }
              }}>
                <SelectTrigger className="rounded-xl border-black/10 h-10">
                  <SelectValue placeholder="选择规划" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {plannings
                    .filter(p => !newProduct.channel || p.channel === newProduct.channel)
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.category} ({p.keywords}) - {p.channel}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">渠道</label>
              <Select value={newProduct.channel} onValueChange={val => setNewProduct({...newProduct, channel: val, shop: '', planningId: ''})}>
                <SelectTrigger className="rounded-xl border-black/10 h-10">
                  <SelectValue placeholder="选择渠道" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {Object.keys(settings.channels || {}).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">店铺</label>
              <Select value={newProduct.shop} onValueChange={val => {
                const selectedShop = allShops.find(s => s.name === val);
                const owners = selectedShop?.owners || [];
                setNewProduct({
                  ...newProduct, 
                  shop: val, 
                  channel: selectedShop ? selectedShop.channel : newProduct.channel,
                  assignedOwner: owners.length === 1 ? owners[0] : newProduct.assignedOwner
                });
              }}>
                <SelectTrigger className="rounded-xl border-black/10 h-10">
                  <SelectValue placeholder="选择店铺" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(newProduct.channel ? allShops.filter(s => s.channel === newProduct.channel) : allShops).map((s, i) => (
                    <SelectItem key={`${s.name}-${i}`} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">负责人</label>
              <Select value={newProduct.assignedOwner} onValueChange={val => setNewProduct({...newProduct, assignedOwner: val})} disabled={!newProduct.shop}>
                <SelectTrigger className="rounded-xl border-black/10 h-10">
                  <SelectValue placeholder={newProduct.shop ? "选择负责人" : "请先选择店铺"} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(settings.channels[newProduct.channel]?.shops?.find((s: any) => s.name === newProduct.shop)?.owners || []).map((o: string) => (
                    <SelectItem key={o} value={o}>{o.split('@')[0]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddProduct} className="w-full bg-[#1D1D1F] text-white rounded-xl h-10 font-bold">确认绑定</Button>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'table' ? (
        <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
          <Table>
            <TableHeader className="bg-[#F5F5F7]">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[50px] py-4">
                  <Checkbox 
                    checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onCheckedChange={(checked) => setSelectedIds(checked ? filteredProducts.map(p => p.id) : [])}
                    className="rounded-md border-black/10 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                  />
                </TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">商品 ID</TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">上架信息</TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">基础信息</TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">负责人</TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">店铺/渠道</TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4 min-w-[300px]">SOP 进度</TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4">链接判定</TableHead>
                <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p) => (
                <TableRow 
                  key={p.id} 
                  onDoubleClick={() => {
                    if (p.planningId) {
                      navigate('/planning', { state: { highlightId: p.planningId } });
                    } else {
                      toast.info('该链接未绑定规划');
                    }
                  }}
                  className="hover:bg-[#F5F5F7]/50 transition-colors border-black/5 group cursor-pointer"
                >
                  <TableCell>
                    <Checkbox 
                      checked={selectedIds.includes(p.id)}
                      onCheckedChange={(checked) => setSelectedIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                      className="rounded-md border-black/10 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#1D1D1F]">{p.productId}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-[#86868B] hover:text-[#1D1D1F]" onClick={() => { navigator.clipboard.writeText(p.productId); toast.success('已复制'); }}>
                        <Copy size={12} />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-[#1D1D1F] font-bold">{p.uploadTime?.split('T')[0]}</span>
                      <span className="text-[10px] text-[#FF6B00] font-bold">已上架 {calculateDays(p.uploadTime)} 天</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-[11px] text-[#1D1D1F] font-medium">{p.category} · {p.scene}</div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] text-[#1D1D1F] font-medium">{p.assignedOwner?.split('@')[0] || p.ownerName}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold text-[#1D1D1F]">{p.shop}</span>
                      <span className="text-[10px] text-[#86868B] font-bold">{p.channel}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {(settings.channels[p.channel]?.sop || []).map((step: string) => (
                        <div key={step} className="flex items-center gap-1.5">
                          <Checkbox 
                            checked={!!p.steps?.[step]} 
                            onCheckedChange={() => toggleStep(p.id, step, !!p.steps?.[step])}
                            className="w-3.5 h-3.5 rounded-sm border-black/10 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                          />
                          <span className={cn("text-[10px] font-bold", p.steps?.[step] ? "text-[#1D1D1F]" : "text-[#86868B]")}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={p.result} onValueChange={(val) => updateResult(p.id, val)}>
                      <Tooltip content={judgments.find((j: any) => j.label === p.result)?.definition || '暂无定义'}>
                        <SelectTrigger 
                          className="w-[80px] h-7 rounded-lg border-none shadow-none text-[10px] font-bold"
                          style={getResultStyle(p.result)}
                        >
                          <SelectValue>{p.result || '待设置'}</SelectValue>
                        </SelectTrigger>
                      </Tooltip>
                      <SelectContent className="rounded-xl">
                        {judgments.map((j: any) => (
                          <React.Fragment key={j.label}>
                            <Tooltip content={j.definition} side="right">
                              <SelectItem value={j.label} className="text-[10px]">
                                <div className="flex items-center justify-between w-full gap-2">
                                  <span>{j.label}</span>
                                </div>
                              </SelectItem>
                            </Tooltip>
                          </React.Fragment>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50" onClick={() => handleDelete(p.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map(p => (
            <div 
              key={p.id} 
              onDoubleClick={() => {
                if (p.planningId) {
                  navigate('/planning', { state: { highlightId: p.planningId } });
                } else {
                  toast.info('该链接未绑定规划');
                }
              }}
              className="bg-white p-6 rounded-[24px] shadow-sm border border-black/5 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono font-bold text-lg text-[#1D1D1F]">{p.productId}</h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-[#86868B]" onClick={() => { navigator.clipboard.writeText(p.productId); toast.success('已复制'); }}>
                      <Copy size={14} />
                    </Button>
                  </div>
                  <div className="text-[10px] text-[#FF6B00] font-bold mt-0.5">
                    {p.uploadTime?.split('T')[0]} · 已上架 {calculateDays(p.uploadTime)} 天
                  </div>
                  <p className="text-xs text-[#86868B] font-bold mt-1">{p.category} · {p.scene}</p>
                </div>
                <Select value={p.result} onValueChange={(val) => updateResult(p.id, val)}>
                  <Tooltip content={judgments.find((j: any) => j.label === p.result)?.definition || '暂无定义'}>
                    <SelectTrigger 
                      className="w-[70px] h-6 rounded-lg border-none shadow-none text-[10px] font-bold"
                      style={getResultStyle(p.result)}
                    >
                      <SelectValue>{p.result || '待设置'}</SelectValue>
                    </SelectTrigger>
                  </Tooltip>
                  <SelectContent className="rounded-xl">
                    {judgments.map((j: any) => (
                      <React.Fragment key={j.label}>
                        <Tooltip content={j.definition} side="right">
                          <SelectItem value={j.label} className="text-[10px]">{j.label}</SelectItem>
                        </Tooltip>
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.channel}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.shop}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.assignedOwner?.split('@')[0] || p.ownerName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-4 border-t border-black/5">
                {(settings.channels[p.channel]?.sop || []).map((step: string) => (
                  <div key={step} className="flex items-center gap-2">
                    <Checkbox 
                      checked={!!p.steps?.[step]} 
                      onCheckedChange={() => toggleStep(p.id, step, !!p.steps?.[step])} 
                      className="w-3.5 h-3.5 rounded-sm border-black/10 data-[state=checked]:bg-[#FF6B00]" 
                    />
                    <span className={cn("text-[10px] font-bold", p.steps?.[step] ? "text-[#1D1D1F]" : "text-[#86868B]")}>{step}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="text-red-500 text-[10px] font-bold gap-1" onClick={() => handleDelete(p.id)}>
                  <Trash2 size={12} /> 删除链接
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};
