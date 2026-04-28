import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { useSettings } from '../components/SettingsContext';
import { logOperation } from '../lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Copy, Trash2, MoreHorizontal, Search, LayoutGrid, List, Download, Upload, Edit2, Info, ChevronDown, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportProductsToExcel, downloadImportTemplate, handleProductImport } from '../lib/excel';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSecureCollection } from '../hooks/useSecureCollection';
import { DeleteConfirmModal } from '@/components/common/DeleteConfirmModal';
import { UploadTimeModal } from '@/components/Product/UploadTimeModal';
import { AddProductForm } from '@/components/Product/AddProductForm';

const defaultResultLabels: any = {
  '待设置': { color: 'bg-gray-100 text-gray-500' },
  '滞销': { color: 'bg-blue-100 text-blue-600' },
  '动销': { color: 'bg-green-100 text-green-600' },
  '小爆': { color: 'bg-orange-100 text-orange-600' },
  '大爆': { color: 'bg-red-100 text-red-600' },
};

export const ProductManagement: React.FC = () => {
  const { profile, isAdmin, isSuperAdmin, currentCompanyId } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: products } = useSecureCollection('products');
  const { data: plannings } = useSecureCollection('plannings');
  const [users, setUsers] = useState<any[]>([]);

  const allShops = React.useMemo(() => {
    const shops: { name: string, channel: string }[] = [];
    Object.entries(settings?.channels || {}).forEach(([cName, cData]: [string, any]) => {
      (cData.shops || []).forEach((s: any) => {
        shops.push({ name: s.name || s, channel: cName });
      });
    });
    return shops;
  }, [settings?.channels]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterShop, setFilterShop] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterParentCategory, setFilterParentCategory] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterSopStep, setFilterSopStep] = useState('all');
  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ start: '', end: '' });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [uploadTimeModal, setUploadTimeModal] = useState<{ isOpen: boolean, productIds: string[], defaultDate: string, uploadTimeSet: boolean }>({
    isOpen: false,
    productIds: [],
    defaultDate: new Date().toISOString().split('T')[0],
    uploadTimeSet: false
  });

  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; title?: string; message?: string; onConfirm: () => void } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [productListDialogOpen, setProductListDialogOpen] = useState(false);
  const [selectedPlanningForProducts, setSelectedPlanningForProducts] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'planning' | 'links'>('links');

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
    source: '',
    channel: '',
    shop: '',
    planningId: '',
    assignedOwner: '', // New field for assigned owner email
    month: '', // Added month
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (location.state?.action === 'bind' && location.state?.planning) {
      const p = location.state.planning;
      setNewProduct({
        productId: '',
        category: p?.category || '',
        scene: p?.scene || '',
        keywords: p?.keywords || '',
        source: p?.source || '',
        channel: p?.channel || '',
        shop: p?.shop || '',
        planningId: p?.id || '',
        assignedOwner: p?.ownerName || '',
        month: p?.month || '',
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
      setFilterSource('all');
      setSearchTerm('');
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    // Add missing users subscription
    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('companyId', '==', currentCompanyId)), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsers();
    };
  }, [isAdmin, isSuperAdmin, profile, currentCompanyId]);

  const handleAddProduct = async () => {
    if (!newProduct.productId) return toast.error('请输入商品 ID');
    if (!newProduct.channel) return toast.error('请选择渠道');
    if (!newProduct.assignedOwner) return toast.error('请选择负责人');
    
    // Split by comma, space, or newline, and filter out empty strings
    const productIds = newProduct.productId.split(/[\s,]+/).filter(id => id.trim() !== '');
    
    if (productIds.length === 0) return toast.error('请输入有效的商品 ID');

    const channelSop = settings?.channels?.[newProduct.channel]?.sop || [];
    const initialSteps: any = {};
    channelSop.forEach((step: string) => {
      initialSteps[step] = false;
    });

    try {
      const batch = writeBatch(db);
      const newDocIds: string[] = [];
      
      productIds.forEach(id => {
        const newDocRef = doc(collection(db, 'products'));
        newDocIds.push(newDocRef.id);
        batch.set(newDocRef, {
          ...newProduct,
          productId: id.trim(),
          uploadTime: new Date().toISOString(),
          ownerId: profile.uid,
          ownerName: profile.displayName || profile.email,
          companyId: currentCompanyId,
          assignedOwner: newProduct.assignedOwner,
          month: newProduct.month || new Date().toISOString().slice(0, 7),
          steps: initialSteps,
          result: settings?.linkJudgments?.[0]?.label || '待设置',
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
      
      await logOperation('CREATE', 'PRODUCT', productIds.join(','), `新增链接: ${productIds.length}个 - ${newProduct.shop}`, profile);

      setNewProduct({ productId: '', category: '', scene: '', keywords: '', source: '', channel: '', shop: '', planningId: '', assignedOwner: '', month: '' });
      setIsAddOpen(false);
      toast.success(`成功绑定 ${productIds.length} 个链接`);
      
      setUploadTimeModal({
        isOpen: true,
        productIds: newDocIds,
        defaultDate: new Date().toISOString().split('T')[0],
        uploadTimeSet: false
      });
    } catch (error) {
      toast.error('绑定失败');
    }
  };

  const toggleStep = async (productId: string, step: string, currentVal: boolean) => {
    await updateDoc(doc(db, 'products', productId), {
      [`steps.${step}`]: !currentVal
    });
    await logOperation('UPDATE', 'PRODUCT', productId, `更新SOP状态: ${step} -> ${!currentVal ? '完成' : '未完成'}`, profile);
  };

  const updateResult = async (productId: string, result: string) => {
    await updateDoc(doc(db, 'products', productId), { result });
    await logOperation('UPDATE', 'PRODUCT', productId, `更新链接判定: ${result}`, profile);
  };

  const updateNotes = async (productId: string, notes: string) => {
    await updateDoc(doc(db, 'products', productId), { notes });
    await logOperation('UPDATE', 'PRODUCT', productId, `更新备注`, profile);
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
      await logOperation('UPDATE', 'PRODUCT', selectedIds.join(','), `批量更新SOP: ${channel} - ${step} -> ${value ? '完成' : '未完成'}`, profile);
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
      await logOperation('UPDATE', 'PRODUCT', selectedIds.join(','), `批量更新链接判定: ${result}`, profile);
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
      const product = products.find(p => p.id === id);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'products', id));
      
      if (product?.planningId) {
        const p = plannings.find(pl => pl.id === product.planningId);
        if (p) {
          batch.update(doc(db, 'plannings', product.planningId), {
            uploadedCount: Math.max(0, (p.uploadedCount || 0) - 1)
          });
        }
      }
      
      await batch.commit();
      await logOperation('DELETE', 'PRODUCT', id, `删除商品链接: ${product?.productId || '未知'}`, profile);
      toast.success('已删除');
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      const planningDecrements: Record<string, number> = {};
      
      selectedIds.forEach(id => {
        batch.delete(doc(db, 'products', id));
        const product = products.find(p => p.id === id);
        if (product && product.planningId) {
          planningDecrements[product.planningId] = (planningDecrements[product.planningId] || 0) + 1;
        }
      });
      
      Object.entries(planningDecrements).forEach(([planningId, count]) => {
        const p = plannings.find(pl => pl.id === planningId);
        if (p) {
          batch.update(doc(db, 'plannings', planningId), {
            uploadedCount: Math.max(0, (p.uploadedCount || 0) - count)
          });
        }
      });
      
      await batch.commit();
      await logOperation('DELETE', 'PRODUCT', selectedIds.join(','), `批量删除 ${selectedIds.length} 个商品链接`, profile);
      setSelectedIds([]);
      toast.success(`成功删除 ${selectedIds.length} 个链接`);
    } catch (error) {
      toast.error('批量删除失败');
    }
  };

  const exportToExcel = (mode: 'selected' | 'current_page' | 'filtered' | 'all' = 'filtered') => {
    exportProductsToExcel(mode, settings, selectedIds, enrichedProducts, paginatedProducts, filteredProducts, currentPage);
  };

  const handleDownloadTemplate = () => {
    downloadImportTemplate(settings);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    handleProductImport(file, settings, profile, currentCompanyId, (importedDocIds) => {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (importedDocIds.length > 0) {
        setUploadTimeModal({
          isOpen: true,
          productIds: importedDocIds,
          defaultDate: new Date().toISOString().split('T')[0],
          uploadTimeSet: false
        });
      }
    });
  };

  const submitUploadTime = async (date: string) => {
    if (!date) return toast.error('请选择有效的日期');
    
    // Validate format like YYYY-MM-DD
    const isoDate = new Date(date).toISOString(); // Normalizes
    
    try {
      const batch = writeBatch(db);
      uploadTimeModal.productIds.forEach(id => {
        batch.update(doc(db, 'products', id), { uploadTime: isoDate });
      });
      await batch.commit();
      toast.success(`成功设置了真实上架时间！`);
    } catch (e) {
      toast.error('设置失败');
    }
    setUploadTimeModal({ isOpen: false, productIds: [], defaultDate: '', uploadTimeSet: false });
  };

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach(u => {
      const name = u.displayName || u.username || (u.email ? u.email.split('@')[0] : '未知');
      if (u.email) map[u.email] = name;
      if (u.displayName) map[u.displayName] = name;
      if (u.username) map[u.username] = name;
    });
    return map;
  }, [users]);

  const getUserDisplayName = (emailOrName: string) => {
    if (!emailOrName) return '未知';
    return userMap[emailOrName] || (typeof emailOrName === 'string' ? emailOrName.split('@')[0] : String(emailOrName));
  };

  const enrichedProducts = useMemo(() => {
    return products.map(p => {
      const relatedPlanning = p.planningId ? plannings.find(plan => plan.id === p.planningId) : null;
      const pMonth = typeof p.month === 'string' ? p.month : '';
      const pYearPart = pMonth.split('-')[0] || null;
      const pMonthPart = pMonth.split('-')[1] || null;
      const pDayPart = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;
      const ownerName = getUserDisplayName(p.assignedOwner || p.ownerName);

      return {
        ...p,
        pYear: pYearPart,
        pMonth: pMonthPart,
        pDay: pDayPart,
        displayName: ownerName,
        parentCategory: relatedPlanning?.parentCategory || p.parentCategory || '',
        source: relatedPlanning?.source || p.source || '',
        category: relatedPlanning?.category || p.category || '',
        scene: relatedPlanning?.scene || p.scene || '',
        keywords: relatedPlanning?.keywords || p.keywords || ''
      };
    });
  }, [products, plannings, userMap]);

  const uniqueYears = useMemo(() => Array.from(new Set(enrichedProducts.map(p => p.pYear).filter(Boolean))).sort().reverse() as string[], [enrichedProducts]);
  const uniqueMonths = useMemo(() => Array.from(new Set(enrichedProducts.map(p => p.pMonth).filter(Boolean))).sort().reverse() as string[], [enrichedProducts]);
  const allDays = useMemo(() => Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0')), []);
  const uniqueChannels = useMemo(() => Array.from(new Set(enrichedProducts.map(p => p.channel).filter(Boolean))) as string[], [enrichedProducts]);
  const uniqueShops = useMemo(() => Array.from(new Set(enrichedProducts.map(p => p.shop).filter(Boolean))) as string[], [enrichedProducts]);
  const uniqueParentCategories = useMemo(() => Array.from(new Set(enrichedProducts.map(p => p.parentCategory).filter(Boolean))) as string[], [enrichedProducts]);
  const uniqueCategories = useMemo(() => Array.from(new Set(enrichedProducts.map(p => p.category).filter(Boolean))) as string[], [enrichedProducts]);
  const uniqueSources = useMemo(() => Array.from(new Set([
    ...(settings.opportunitySources || []),
    ...enrichedProducts.map(p => p.source).filter(Boolean)
  ])) as string[], [enrichedProducts, settings.opportunitySources]);

  const uniqueOwners = useMemo(() => Array.from(new Set(enrichedProducts.map(p => p.displayName).filter(Boolean))) as string[], [enrichedProducts]);

  const filteredProducts = useMemo(() => {
    const startTimestamp = dateRange.start ? new Date(dateRange.start).getTime() : null;
    const endTimestamp = dateRange.end ? new Date(dateRange.end + 'T23:59:59').getTime() : null;

    return enrichedProducts.filter(p => {
      const matchesSearch = !debouncedSearchTerm || p.productId?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      
      const matchesYear = filterYear === 'all' || p.pYear === filterYear;
      const matchesMonth = filterMonth === 'all' || p.pMonth === filterMonth;
      const matchesDay = filterDay === 'all' || p.pDay === filterDay;
      
      let matchesDateRange = true;
      if (p.uploadTime) {
        const pTimestamp = new Date(p.uploadTime).getTime();
        if (startTimestamp && pTimestamp < startTimestamp) matchesDateRange = false;
        if (endTimestamp && pTimestamp > endTimestamp) matchesDateRange = false;
      } else if (startTimestamp || endTimestamp) {
        matchesDateRange = false;
      }

      const matchesChannel = filterChannel === 'all' || p.channel === filterChannel;
      const matchesShop = filterShop === 'all' || p.shop === filterShop;
      const matchesOwner = filterOwner === 'all' || p.displayName === filterOwner;
      const matchesParentCategory = filterParentCategory === 'all' || p.parentCategory === filterParentCategory;
      const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
      const matchesSource = filterSource === 'all' || p.source === filterSource;
      
      let matchesSop = true;
      if (filterSopStep !== 'all') {
        matchesSop = p.steps && p.steps[filterSopStep] === true;
      }
      
      return matchesSearch && matchesYear && matchesMonth && matchesDay && matchesDateRange && matchesChannel && matchesShop && matchesOwner && matchesParentCategory && matchesCategory && matchesSource && matchesSop;
    }).sort((a, b) => {
      // Sort by Year, Month, then Day ascending
      if (a.pYear !== b.pYear) return (a.pYear || '').localeCompare(b.pYear || '');
      if (a.pMonth !== b.pMonth) return (a.pMonth || '').localeCompare(b.pMonth || '');
      // Ensure day is compared as string/number safely, forcing 2-digit format if needed
      const dayA = (a.pDay || '01').padStart(2, '0');
      const dayB = (b.pDay || '01').padStart(2, '0');
      if (dayA !== dayB) return dayA.localeCompare(dayB);
      const dateA = a.uploadTime ? new Date(a.uploadTime).getTime() : 0;
      const dateB = b.uploadTime ? new Date(b.uploadTime).getTime() : 0;
      return dateA - dateB;
    });
  }, [enrichedProducts, debouncedSearchTerm, filterYear, filterMonth, filterDay, dateRange, filterChannel, filterShop, filterOwner, filterParentCategory, filterCategory, filterSource, filterSopStep]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterYear, filterMonth, filterDay, dateRange, filterChannel, filterShop, filterOwner, filterParentCategory, filterCategory, filterSource, filterSopStep]);

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
    return { backgroundColor: '#F3F4F6', color: '#6B7280' };
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 w-full min-w-0">
      <header className="flex flex-col gap-4">
        <div className="flex justify-between items-center w-full">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">链接管理</h1>
            <p className="text-xs text-[#86868B] mt-1">Product Lifecycle · 环节 SOP 跟踪与结果标注</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             {/* Action Buttons ... maybe add Export/Add here if needed */}
          </div>
        </div>
        
        <div className="flex items-center gap-4 w-full">
          <div className="flex bg-[#E3E3E8] p-1 rounded-xl shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3 text-[#86868B]" size={14} />
              <input 
                placeholder="搜索商品 ID..." 
                className="h-7 w-36 pl-8 pr-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#1D1D1F] placeholder:text-[#86868B] focus:bg-white focus:shadow-sm focus:outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex bg-[#E3E3E8] p-1 rounded-xl gap-1 overflow-x-auto custom-scrollbar flex-nowrap shrink-0 max-w-full">
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterYear === 'all' ? '全部年' : `${filterYear}年`}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部年</SelectItem>
                {uniqueYears.map(y => <SelectItem key={y} value={y}>{y}年</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterMonth === 'all' ? '全部月' : `${filterMonth}月`}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部月</SelectItem>
                {uniqueMonths.map(m => <SelectItem key={m} value={m}>{m}月</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDay} onValueChange={setFilterDay}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterDay === 'all' ? '全部日' : `${filterDay}日`}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部日</SelectItem>
                {allDays.map(d => <SelectItem key={d} value={d}>{d}日</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterSource === 'all' ? '商机来源' : filterSource}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部商机来源</SelectItem>
                {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterParentCategory} onValueChange={setFilterParentCategory}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterParentCategory === 'all' ? '全部类目' : filterParentCategory}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部类目</SelectItem>
                {uniqueParentCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSopStep} onValueChange={setFilterSopStep}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterSopStep === 'all' ? 'SOP 状态筛选' : `已完成: ${filterSopStep}`}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部状态</SelectItem>
                {Array.from(new Set(
                  Object.values(settings.channels || {}).flatMap((c: any) => c.sop || [])
                )).map((step: any) => (
                  <SelectItem key={step} value={step}>已完成: {step}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterChannel === 'all' ? '全部渠道' : filterChannel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部渠道</SelectItem>
                {uniqueChannels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterShop} onValueChange={setFilterShop}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterShop === 'all' ? '全部店铺' : filterShop}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部店铺</SelectItem>
                {uniqueShops.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue placeholder="全部负责人">{filterOwner === 'all' ? '全部负责人' : filterOwner}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部负责人</SelectItem>
                {uniqueOwners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
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
          <div className="flex items-center gap-3 pl-6 ml-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl h-10 gap-2 border-black/10 px-5 text-[#1D1D1F] font-bold">
                  导入/导出 <ChevronDown size={16} className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 rounded-2xl shadow-xl z-50 bg-white border border-black/10 flex flex-col gap-1" align="end">
                <div className="px-3 py-1.5">
                  <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">数据导出</p>
                </div>
                <Button variant="ghost" className="w-full justify-start gap-3 h-10 rounded-xl text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7]" onClick={() => exportToExcel('selected')}>
                  <Download size={16} /> 导出勾选内容 {selectedIds.length > 0 && `(${selectedIds.length})`}
                </Button>
                <Button variant="ghost" className="w-full justify-start gap-3 h-10 rounded-xl text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7]" onClick={() => exportToExcel('current_page')}>
                  <Download size={16} /> 导出当前页
                </Button>
                <Button variant="ghost" className="w-full justify-start gap-3 h-10 rounded-xl text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7]" onClick={() => exportToExcel('filtered')}>
                  <Download size={16} /> 导出筛选条件
                </Button>
                <Button variant="ghost" className="w-full justify-start gap-3 h-10 rounded-xl text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7]" onClick={() => exportToExcel('all')}>
                  <Download size={16} /> 导出全部数据
                </Button>
                <div className="h-px bg-black/5 my-1 mx-2" />
                <Button variant="ghost" className="w-full justify-start gap-3 h-10 rounded-xl text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7]" onClick={handleDownloadTemplate}>
                  <Download size={16} /> 下载导入模板
                </Button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleImport} />
                <Button variant="ghost" className="w-full justify-start gap-3 h-10 rounded-xl text-[13px] font-bold text-[#FF6B00] hover:bg-[#FFF0E5]" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} /> 上传表格导入
                </Button>
              </PopoverContent>
            </Popover>
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
        const selectedChannels = Array.from(new Set(products.filter(p => selectedIds.includes(p.id)).map(p => p.channel).filter(Boolean))) as string[];
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
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs hover:bg-white/10">
                    <Copy size={14} /> 复制 ID (需选渠道)
                  </Button>
                </PopoverTrigger>
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
            <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs text-red-400 hover:bg-red-400/10" onClick={() => setDeleteConfirm({
              isOpen: true,
              title: '确认删除',
              message: `确定要批量删除这 ${selectedIds.length} 个链接吗？此操作无法撤销。`,
              onConfirm: handleBatchDelete
            })}>
              <Trash2 size={14} /> 批量删除
            </Button>
          </div>
        </div>
        );
      })()}
      {isAddOpen && (
        <AddProductForm
          newProduct={newProduct}
          setNewProduct={setNewProduct}
          plannings={plannings}
          settings={settings}
          allShops={allShops}
          users={users}
          getUserDisplayName={getUserDisplayName}
          handleAddProduct={handleAddProduct}
        />
      )}

      {viewMode === 'table' ? (
        <div className="bg-white rounded-[24px] shadow-sm border border-black/5 flex flex-col relative w-full min-w-0 overflow-x-auto">
          <Table className="min-w-max w-full" translate="no">
            <TableHeader className="bg-[#F5F5F7]">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[50px] py-4 sticky left-0 z-20 bg-[#F5F5F7] shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                  <Checkbox 
                    checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onCheckedChange={(checked) => setSelectedIds(checked ? filteredProducts.map(p => p.id) : [])}
                    className="rounded-md border-black/10 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                  />
                </TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 sticky left-[50px] z-20 bg-[#F5F5F7] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[150px]">商品 ID / 上架信息</TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 sticky left-[200px] z-20 bg-[#F5F5F7] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[200px]">基础信息</TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 sticky left-[400px] z-20 bg-[#F5F5F7] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[80px]">负责人</TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 sticky left-[480px] z-20 bg-[#F5F5F7] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[120px]">店铺/渠道</TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 min-w-[400px]">SOP 进度</TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 min-w-[100px]">链接判定</TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 min-w-[140px]">备注</TableHead>
                <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedProducts.map((p) => (
                <TableRow 
                  key={p.id} 
                  onDoubleClick={() => {
                    if (p.planningId) {
                      const planning = plannings.find(pl => pl.id === p.planningId);
                      if (planning) {
                        setSelectedPlanningForProducts(planning);
                        setProductListDialogOpen(true);
                        setActiveTab('links');
                      } else {
                        navigate('/planning', { state: { highlightId: p.planningId } });
                      }
                    } else {
                      toast.info('该链接未绑定规划');
                    }
                  }}
                  className="hover:bg-[#F5F5F7]/50 transition-colors border-black/5 group cursor-pointer relative"
                >
                  <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-[#fafafc] shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                    <Checkbox 
                      checked={selectedIds.includes(p.id)}
                      onCheckedChange={(checked) => setSelectedIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                      className="rounded-md border-black/10 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00]"
                    />
                  </TableCell>
                  <TableCell className="sticky left-[50px] z-10 bg-white group-hover:bg-[#fafafc] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[150px]">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#1D1D1F]">{p.productId}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-[#86868B] hover:text-[#1D1D1F]" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(p.productId); toast.success('已复制'); }}>
                          <Copy size={12} />
                        </Button>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[#86868B]">{typeof p.uploadTime === 'string' ? p.uploadTime.split('T')[0] : ''}</span>
                        <span className="text-[10px] text-[#FF6B00] font-bold">已上架 {calculateDays(p.uploadTime)} 天</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="sticky left-[200px] z-10 bg-white group-hover:bg-[#fafafc] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[200px]">
                    <div className="flex flex-col gap-1 items-start">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap font-medium">{p.source || '暂无来源'}</span>
                        <span className="text-[#1D1D1F] font-bold truncate">{p.category || '暂无类目'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[#86868B] mt-0.5">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[80px]" title={p.scene}>场: {p.scene || '暂无'}</span>
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[80px]" title={p.keywords}>词: {p.keywords || '暂无'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="sticky left-[400px] z-10 bg-white group-hover:bg-[#fafafc] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[80px]">
                    <span className="text-xs text-[#1D1D1F] font-medium">{p.displayName}</span>
                  </TableCell>
                  <TableCell className="sticky left-[480px] z-10 bg-white group-hover:bg-[#fafafc] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[120px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-[#1D1D1F] truncate w-[110px]" title={p.shop}>{p.shop}</span>
                      <span className="text-[10px] text-[#86868B] font-bold truncate w-[110px]" title={p.channel}>{p.channel}</span>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[400px]">
                    <div className="flex flex-wrap gap-x-5 gap-y-3">
                      {(settings?.channels?.[p.channel]?.sop || []).map((step: string) => (
                        <div key={step} className="flex flex-col items-center gap-1.5 break-inside-avoid">
                          <span className={cn("text-[11px] font-bold whitespace-nowrap", p.steps?.[step] ? "text-[#1D1D1F]" : "text-[#86868B]")}>{step}</span>
                          <Checkbox 
                            checked={!!p.steps?.[step]} 
                            onCheckedChange={() => toggleStep(p.id, step, !!p.steps?.[step])}
                            className="w-4 h-4 rounded-full border-black/20 data-[state=checked]:bg-[#FF6B00] data-[state=checked]:border-[#FF6B00] shadow-sm transition-all"
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[100px]">
                    <Tooltip content={judgments.find((j: any) => j.label === p.result)?.definition || '暂无定义'}>
                      <Select value={p.result || ''} onValueChange={(val) => updateResult(p.id, val)}>
                        <SelectTrigger 
                          className="w-[80px] h-8 rounded-lg border-none shadow-none text-xs font-bold"
                          style={getResultStyle(p.result)}
                        >
                          <SelectValue>{p.result || '待设置'}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {judgments.map((j: any) => (
                            <SelectItem key={j.label} value={j.label} className="text-xs">
                              {j.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="min-w-[140px]" onDoubleClick={(e) => e.stopPropagation()}>
                    <Popover>
                       <PopoverTrigger asChild>
                          <button type="button"
                             className="text-left bg-transparent border-none outline-none w-[110px] cursor-pointer hover:bg-black/5 px-2 py-1.5 rounded-lg transition-colors flex items-start h-[42px]" 
                             onClick={(e) => e.stopPropagation()}
                             onDoubleClick={(e) => e.stopPropagation()}
                          >
                             {p.notes ? (
                                <Tooltip content={<div className="text-[13px] max-w-[200px] whitespace-normal break-words leading-relaxed">{p.notes}</div>} side="top">
                                   <div className="text-[13px] text-[#1D1D1F] whitespace-normal break-words leading-[1.3] line-clamp-2 w-full">{p.notes}</div>
                                </Tooltip>
                             ) : <div className="flex items-center gap-1 text-[13px] text-[#86868B] opacity-70 hover:opacity-100 transition-opacity"><Edit2 size={12} /><span>添加备注</span></div>}
                          </button>
                       </PopoverTrigger>
                       <PopoverContent className="w-80 p-5 rounded-2xl shadow-xl z-50 bg-white border border-black/10 flex flex-col gap-3">
                           <p className="text-[15px] font-bold text-[#1D1D1F] flex items-center justify-between">
                              更新备注
                              <span className="text-[10px] font-normal text-[#86868B] bg-black/5 px-2 py-0.5 rounded-full">Enter 确认 / Shift+Enter 换行</span>
                           </p>
                           <textarea
                             className="w-full h-24 text-[13px] p-3 rounded-xl border border-black/10 resize-none focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30 leading-relaxed bg-[#F5F5F7] hover:bg-[#EAEAED] transition-colors"
                             placeholder="输入备注内容..."
                             defaultValue={p.notes}
                             onBlur={(e) => updateNotes(p.id, e.target.value)}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter' && !e.shiftKey) {
                                 e.preventDefault();
                                 updateNotes(p.id, e.currentTarget.value);
                                 e.currentTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                               }
                             }}
                           />
                       </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50" onClick={() => setDeleteConfirm({
                        isOpen: true,
                        title: '确认删除',
                        message: '确定要删除这条商品链接吗？此操作无法撤销。',
                        onConfirm: () => handleDelete(p.id)
                      })}>
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
          {paginatedProducts.map(p => (
            <div 
              key={p.id} 
              onDoubleClick={(e) => {
                if (p.planningId) {
                  const planning = plannings.find(pl => pl.id === p.planningId);
                  if (planning) {
                    setSelectedPlanningForProducts(planning);
                    setProductListDialogOpen(true);
                    setActiveTab('links');
                  } else {
                    navigate('/planning', { state: { highlightId: p.planningId } });
                  }
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
                  <div className="text-xs text-[#FF6B00] font-bold mt-0.5">
                    {typeof p.uploadTime === 'string' ? p.uploadTime.split('T')[0] : ''} · 已上架 {calculateDays(p.uploadTime)} 天
                  </div>
                  <p className="text-xs text-[#86868B] font-bold mt-1">{p.category} {p.scene ? `· ${p.scene}` : ''}</p>
                </div>
                <Tooltip content={judgments.find((j: any) => j.label === p.result)?.definition || '暂无定义'}>
                  <Select value={p.result || ''} onValueChange={(val) => updateResult(p.id, val)}>
                    <SelectTrigger 
                      className="w-[80px] h-7 rounded-lg border-none shadow-none text-xs font-bold"
                      style={getResultStyle(p.result)}
                    >
                      <SelectValue>{p.result || '待设置'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {judgments.map((j: any) => (
                        <SelectItem key={j.label} value={j.label} className="text-xs">{j.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Tooltip>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.channel}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.shop}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.displayName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-4 border-t border-black/5">
                {(settings?.channels?.[p.channel]?.sop || []).map((step: string) => (
                  <div key={step} className="flex items-center gap-2">
                    <Checkbox 
                      checked={!!p.steps?.[step]} 
                      onCheckedChange={() => toggleStep(p.id, step, !!p.steps?.[step])} 
                      className="w-4 h-4 rounded-sm border-black/10 data-[state=checked]:bg-[#FF6B00]" 
                    />
                    <span className={cn("text-xs font-bold", p.steps?.[step] ? "text-[#1D1D1F]" : "text-[#86868B]")}>{step}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="text-red-500 text-xs font-bold gap-1 h-8" onClick={() => setDeleteConfirm({
                  isOpen: true,
                  title: '确认删除',
                  message: '确定要删除这条商品链接吗？此操作无法撤销。',
                  onConfirm: () => handleDelete(p.id)
                })}>
                  <Trash2 size={12} /> 删除链接
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination & Status Footer */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-[24px] border border-black/5 shadow-sm gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs font-bold text-[#86868B]">
            <span>每页展示:</span>
            <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-20 rounded-lg border-black/5 bg-[#F5F5F7] shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {[20, 50, 100, 200].map(size => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="h-4 w-px bg-black/5" />
          <div className="text-xs font-bold text-[#86868B]">
            共 <span className="text-[#1D1D1F]">{filteredProducts.length}</span> 个链接
            {selectedIds.length > 0 && (
              <> · 已勾选 <span className="text-[#FF6B00]">{selectedIds.length}</span> 个</>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-xl border-black/5 text-xs font-bold disabled:opacity-30 h-9 px-4"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            上一页
          </Button>
          <div className="flex items-center gap-1.5 mx-2">
            {(() => {
              const totalPages = Math.ceil(filteredProducts.length / pageSize);
              const pages = [];
              
              // First page
              pages.push(
                <Button 
                  key={1}
                  variant={currentPage === 1 ? "default" : "ghost"}
                  size="sm"
                  className={cn("w-9 h-9 rounded-xl text-xs font-bold transition-all", currentPage === 1 ? "bg-[#1D1D1F] text-white shadow-md" : "hover:bg-[#F5F5F7] text-[#86868B]")}
                  onClick={() => setCurrentPage(1)}
                >1</Button>
              );
              
              if (currentPage > 3) pages.push(<span key="start-ellipsis" className="text-[#86868B] px-1">...</span>);
              
              for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                pages.push(
                  <Button 
                    key={i}
                    variant={currentPage === i ? "default" : "ghost"}
                    size="sm"
                    className={cn("w-9 h-9 rounded-xl text-xs font-bold transition-all", currentPage === i ? "bg-[#1D1D1F] text-white shadow-md" : "hover:bg-[#F5F5F7] text-[#86868B]")}
                    onClick={() => setCurrentPage(i)}
                  >{i}</Button>
                );
              }
              
              if (currentPage < totalPages - 2) pages.push(<span key="end-ellipsis" className="text-[#86868B] px-1">...</span>);
              
              if (totalPages > 1) {
                pages.push(
                  <Button 
                    key={totalPages}
                    variant={currentPage === totalPages ? "default" : "ghost"}
                    size="sm"
                    className={cn("w-9 h-9 rounded-xl text-xs font-bold transition-all", currentPage === totalPages ? "bg-[#1D1D1F] text-white shadow-md" : "hover:bg-[#F5F5F7] text-[#86868B]")}
                    onClick={() => setCurrentPage(totalPages)}
                  >{totalPages}</Button>
                );
              }
              return pages;
            })()}
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-[#86868B]">跳转</span>
              <input 
                type="number" 
                className="w-12 h-9 rounded-lg border border-black/10 text-center text-xs focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent" 
                min={1} 
                max={Math.ceil(filteredProducts.length / pageSize)}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val >= 1 && val <= Math.ceil(filteredProducts.length / pageSize)) {
                    setCurrentPage(val);
                  }
                }}
              />
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-xl border-black/5 text-xs font-bold disabled:opacity-30 h-9 px-4"
            disabled={currentPage >= Math.ceil(filteredProducts.length / pageSize)}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            下一页
          </Button>
        </div>
      </div>

      <UploadTimeModal
        isOpen={uploadTimeModal.isOpen}
        productIds={uploadTimeModal.productIds}
        defaultDate={uploadTimeModal.defaultDate}
        onDateChange={(date) => setUploadTimeModal(prev => ({ ...prev, defaultDate: date }))}
        onSkip={() => setUploadTimeModal({ isOpen: false, productIds: [], defaultDate: '', uploadTimeSet: false })}
        onSubmit={submitUploadTime}
      />

      <DeleteConfirmModal
        isOpen={!!deleteConfirm?.isOpen}
        title={deleteConfirm?.title}
        message={deleteConfirm?.message}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
             deleteConfirm.onConfirm();
             setDeleteConfirm(null);
          }
        }}
      />

      <Dialog open={productListDialogOpen} onOpenChange={setProductListDialogOpen}>
        <DialogContent className={cn(
          "max-h-[92vh] overflow-hidden rounded-[32px] p-0 flex flex-col gap-0 border-none shadow-2xl transition-all duration-300",
          "max-w-[98vw] w-[1800px] sm:max-w-[96vw] md:max-w-[1800px]"
        )}>
          <DialogHeader className="px-8 py-6 border-b border-black/5 flex flex-row items-center justify-between shrink-0">
            <div className="flex flex-col gap-1.5">
              <DialogTitle className="text-2xl font-bold text-[#1D1D1F]">
                {selectedPlanningForProducts?.category} - {activeTab === 'planning' ? '规划明细' : '商品链接'}
              </DialogTitle>
              <div className="flex items-center gap-3 text-sm text-[#86868B] font-medium">
                <Badge variant="outline" className="bg-[#FF6B00]/5 text-[#FF6B00] border-[#FF6B00]/20 rounded-md py-0 px-2 h-5 text-[10px] font-bold">{selectedPlanningForProducts?.channel}</Badge>
                <span className="w-1 h-1 rounded-full bg-black/10" />
                <span className="text-[#1D1D1F]">{selectedPlanningForProducts?.shop}</span>
                {activeTab === 'links' && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-black/10" />
                    <span className="bg-black/5 px-2 py-0.5 rounded-md text-[11px] font-bold">共 {products.filter((pr: any) => pr.planningId === selectedPlanningForProducts?.id).length} 个商品</span>
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

            <button 
              onClick={() => setProductListDialogOpen(false)}
              className="p-2 rounded-full hover:bg-black/5 transition-colors text-[#86868B] hover:text-[#1D1D1F]"
            >
              <X size={20} />
            </button>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-[#FBFBFD] custom-scrollbar p-8">
            <AnimatePresence mode="wait">
              {activeTab === 'planning' ? (
                <motion.div 
                  key="planning"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden w-full"
                >
                  <Table className="w-full" translate="no">
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
                      {selectedPlanningForProducts ? (
                        <TableRow className="hover:bg-[#F5F5F7]/50 transition-colors border-black/5 group">
                          <TableCell className="pl-6"><div className="text-sm font-medium text-[#1D1D1F]">{selectedPlanningForProducts.month}</div></TableCell>
                          <TableCell><div className="text-[11px] text-[#86868B] font-bold">{selectedPlanningForProducts.source}</div></TableCell>
                          <TableCell><div className="text-sm font-bold text-[#1D1D1F]">{selectedPlanningForProducts.category}</div></TableCell>
                          <TableCell><div className="text-[11px] text-[#86868B] font-medium">{selectedPlanningForProducts.scene}</div></TableCell>
                          <TableCell className="text-sm text-[#1D1D1F] max-w-[200px] truncate">{selectedPlanningForProducts.keywords}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm font-bold text-[#FF6B00]">{selectedPlanningForProducts.uploadedCount || 0}</span>
                            <span className="text-[#86868B] mx-1 text-sm">/</span>
                            <span className="text-sm text-[#1D1D1F] font-bold">{selectedPlanningForProducts.plannedCount}</span>
                          </TableCell>
                          <TableCell className="text-sm text-[#1D1D1F] font-medium">{getUserDisplayName(selectedPlanningForProducts.ownerName)}</TableCell>
                          <TableCell className="pr-6">
                            <div className="text-sm text-[#1D1D1F] font-bold">{selectedPlanningForProducts.shop}</div>
                            <div className="text-[11px] text-[#86868B] font-medium">{selectedPlanningForProducts.channel}</div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="h-48 text-center text-[#86868B] text-sm">暂无数据</TableCell>
                        </TableRow>
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
                  className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-black/5 overflow-hidden w-full"
                >
                  <Table className="w-full" translate="no">
                    <TableHeader className="bg-[#F5F5F7]">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest pl-6 w-[180px]">商品信息</TableHead>
                        <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center w-[160px]">类目/归属</TableHead>
                        <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center w-[120px]">负责人</TableHead>
                        <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center w-[150px]">店铺渠道</TableHead>
                        <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center min-w-[600px]">SOP 全流程跟踪</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPlanningForProducts && products.filter((pr: any) => pr.planningId === selectedPlanningForProducts.id).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-80 text-center text-[#86868B] text-sm bg-white">
                            <div className="flex flex-col items-center gap-4">
                              <div className="w-16 h-16 rounded-full bg-[#F5F5F7] flex items-center justify-center">
                                <Plus size={32} className="text-[#86868B] opacity-20" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-lg font-bold text-[#1D1D1F]">暂无关联商品链接</span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        products.filter((pr: any) => pr.planningId === selectedPlanningForProducts?.id).map((pr: any) => {
                          const channelKey = pr.channel || selectedPlanningForProducts?.channel;
                          let channelSops = settings?.channels?.[channelKey]?.sop || [];
                          const uploadDate = pr.uploadTime ? new Date(pr.uploadTime).toISOString().split('T')[0] : '-';
                          const days = calculateDays(pr.uploadTime);
                          
                          return (
                            <TableRow key={pr.id} className="hover:bg-[#F5F5F7]/30 transition-colors border-black/5 group h-28">
                              <TableCell className="pl-6">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-[14px] text-[#1D1D1F] tracking-tighter leading-none">{pr.productId}</span>
                                    <button onClick={() => navigator.clipboard.writeText(pr.productId).then(() => toast.success('已复制'))} className="text-[#A1A1A6] hover:text-[#FF6B00] transition-colors p-1 rounded-md hover:bg-[#FF6B00]/5">
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
                                        onClick={() => toggleStep(pr.id, step, !!pr.steps?.[step])}
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="px-8 py-6 border-t border-black/5 flex justify-end bg-white shrink-0">
            <Button 
              variant="default" 
              onClick={() => setProductListDialogOpen(false)} 
              className="rounded-xl h-12 px-12 bg-[#1D1D1F] hover:bg-black font-bold text-sm shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              完成并关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </TooltipProvider>
  );
};
