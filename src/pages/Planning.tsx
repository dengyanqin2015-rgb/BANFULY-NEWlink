import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { useSettings } from '../components/SettingsContext';
import { logOperation } from '../lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AnimatePresence, motion } from 'motion/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Download, Upload, Trash2, Edit2, Search, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

import { useSecureCollection } from '../hooks/useSecureCollection';
import { DeleteConfirmModal } from '@/components/common/DeleteConfirmModal';
import { FieldEditModal } from '@/components/common/FieldEditModal';
import { cn } from '@/lib/utils';
import { AddPlanningModal } from '@/components/Planning/AddPlanningModal';

export const Planning: React.FC = () => {
  const { profile, isAdmin, isSuperAdmin, currentCompanyId } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: plannings } = useSecureCollection('plannings');
  const { data: products } = useSecureCollection('products');
  const [users, setUsers] = useState<any[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const allShops = React.useMemo(() => {
    const shops: { name: string, channel: string }[] = [];
    Object.entries(settings?.channels || {}).forEach(([cName, cData]: [string, any]) => {
      (cData.shops || []).forEach((s: any) => {
        shops.push({ name: s.name || s, channel: cName });
      });
    });
    return shops;
  }, [settings?.channels]);
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterShop, setFilterShop] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterParentCategory, setFilterParentCategory] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    month: new Date().toISOString().slice(0, 7),
    plannedDay: new Date().getDate().toString().padStart(2, '0'),
    category: '',
    scene: '',
    keywords: '',
    plannedCount: 0,
    shop: '',
    channel: '',
    source: '', // Added source
    parentCategory: '', // Added parentCategory
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; title?: string; message?: string; onConfirm: () => void } | null>(null);
  const [fieldEdit, setFieldEdit] = useState<{ isOpen: boolean; id: string; field: string; value: string; title: string } | null>(null);

  useEffect(() => {
    if (location.state?.highlightId) {
      setHighlightId(location.state.highlightId);
      
      // Reset filters to ensure the highlighted row is visible
      setFilterYear('all');
      setFilterMonth('all');
      setFilterChannel('all');
      setFilterShop('all');
      setFilterOwner('all');
      setFilterCategory('all');

      setTimeout(() => {
        const el = document.getElementById(`planning-row-${location.state.highlightId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
      navigate(location.pathname, { replace: true, state: {} });
      
      // Remove highlight after 3 seconds
      setTimeout(() => setHighlightId(null), 3000);
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

  const handleAdd = async () => {
    if (!formData.channel || !formData.shop) return toast.error('请选择渠道和店铺');
    try {
      const docRef = await addDoc(collection(db, 'plannings'), {
        ...formData,
        plannedCount: Number(formData.plannedCount),
        uploadedCount: 0,
        ownerId: profile.uid,
        ownerName: profile.displayName || profile.email,
        companyId: currentCompanyId,
        createdAt: new Date().toISOString(),
      });
      await logOperation('CREATE', 'PLANNING', docRef.id, `新增规划: ${formData.category} - ${formData.shop}`, profile);
      setIsAddOpen(false);
      toast.success('规划添加成功');
    } catch (error) {
      toast.error('添加失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const planning = plannings.find(p => p.id === id);
      await deleteDoc(doc(db, 'plannings', id));
      await logOperation('DELETE', 'PLANNING', id, `删除规划: ${planning?.category || '未知'} - ${planning?.shop || '未知'}`, profile);
      toast.success('已删除规划');
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleUpdateField = async () => {
    if (!fieldEdit) return;
    try {
      await updateDoc(doc(db, 'plannings', fieldEdit.id), {
        [fieldEdit.field]: fieldEdit.value
      });
      await logOperation('UPDATE', 'PLANNING', fieldEdit.id, `修改规划字段 ${fieldEdit.field}: ${fieldEdit.value}`, profile);
      toast.success('修改成功');
      setFieldEdit(null);
    } catch (error) {
      toast.error('修改失败');
    }
  };

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('上新规划模板');

    // 定义表头
    const columns = [
      { header: '月份', key: 'month', width: 15 },
      { header: '商机来源', key: 'source', width: 20 },
      { header: '类目', key: 'parentCategory', width: 15 },
      { header: '品类', key: 'category', width: 15 },
      { header: '场景', key: 'scene', width: 15 },
      { header: '核心关键词', key: 'keywords', width: 25 },
      { header: '规划数量', key: 'plannedCount', width: 12 },
      { header: '渠道', key: 'channel', width: 15 },
      { header: '店铺', key: 'shop', width: 15 },
    ];

    worksheet.columns = columns;

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // 获取列表数据
    const sources = settings?.opportunitySources || ['爆款复刻', '竞品监控', '趋势发现', '站内商机'];
    const channelData: { channel: string; shop: string }[] = [];
    const uniqueChannels = Object.keys(settings?.channels || {});
    
    uniqueChannels.forEach(channelName => {
      const channel = settings?.channels[channelName];
      if (channel && channel.shops) {
        channel.shops.forEach((s: any) => {
          const shopName = typeof s === 'string' ? s : s.name;
          if (shopName) {
            channelData.push({ channel: channelName, shop: shopName });
          }
        });
      }
    });

    // 创建隐藏的数据源工作表
    const dataSheet = workbook.addWorksheet('Data', { state: 'hidden' });
    
    // 写入渠道列表 (用于渠道下拉框)
    uniqueChannels.forEach((c, i) => {
      dataSheet.getCell(`A${i + 1}`).value = c;
    });
    
    // 写入渠道-店铺对应关系 (按渠道排序，用于联动)
    channelData.sort((a, b) => String(a.channel).localeCompare(String(b.channel)));
    channelData.forEach((item, i) => {
      dataSheet.getCell(`C${i + 1}`).value = item.channel;
      dataSheet.getCell(`D${i + 1}`).value = item.shop;
    });

    // 写入所有店铺列表 (用于店铺反向查找渠道)
    const allShops = Array.from(new Set(channelData.map(d => d.shop)));
    allShops.forEach((s, i) => {
      dataSheet.getCell(`F${i + 1}`).value = s;
    });

    // 添加示例数据
    const months = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    const firstChannel = uniqueChannels[0] || '拼多多';
    const firstShop = channelData.find(d => d.channel === firstChannel)?.shop || '旗舰店';

    worksheet.addRow({
      month: months[0],
      source: sources[0],
      parentCategory: '女装',
      category: '连衣裙',
      scene: '通勤',
      keywords: '法式,碎花',
      plannedCount: 50,
      channel: firstChannel,
      shop: firstShop
    });

    // 为各列添加下拉框验证和联动公式 (限制 1000 行)
    for (let i = 2; i <= 1000; i++) {
      // A列：月份
      worksheet.getCell(`A${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${months.join(',')}"`],
      };
      // B列：商机来源
      worksheet.getCell(`B${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${sources.join(',')}"`],
      };
      
      // G列：渠道 (下拉框)
      if (uniqueChannels.length > 0) {
        worksheet.getCell(`H${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${uniqueChannels.join(',')}"`],
        };
      }

      // H列：店铺 (下拉框 - 展示所有店铺，避免跨平台兼容性问题)
      if (allShops.length > 0) {
        worksheet.getCell(`I${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${allShops.join(',')}"`],
        };
      }
    }

    // 导出文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '上新规划模板.xlsx';
    anchor.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('模板下载成功');
  };

  const calculateDays = (dateStr: string) => {
    if (!dateStr) return 0;
    const uploadDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - uploadDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const [productListDialogOpen, setProductListDialogOpen] = useState(false);
  const [selectedPlanningForProducts, setSelectedPlanningForProducts] = useState<any>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'planning' | 'links'>('links');

  const handleToggleProductStep = async (productId: string, step: string, currentVal: boolean) => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        [`steps.${step}`]: !currentVal
      });
      toast.success('更新成功');
    } catch (error) {
      toast.error('更新失败');
    }
  };

  const handleBatchUpdateProductSteps = async (step: string, value: boolean) => {
    if (selectedProductIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedProductIds.forEach(id => {
        batch.update(doc(db, 'products', id), { [`steps.${step}`]: value });
      });
      await batch.commit();
      toast.success(`已批量更新 ${selectedProductIds.length} 个商品`);
    } catch (error) {
      toast.error('批量更新失败');
    }
  };

  const handleCopyProductIds = (ids: string | string[]) => {
    const text = Array.isArray(ids) ? ids.join('\n') : ids;
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const bstr = e.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      let successCount = 0;
      let skippedCount = 0;
      const allowedShops = profile?.permissions?.map((p: any) => p.shop) || [];
      
      for (const item of data as any[]) {
        try {
          const itemShop = String(item['店铺'] || '').trim();
          
          // Check permissions if not admin
          if (!isAdmin) {
            const hasPermission = allowedShops.some((s: string) => String(s).trim() === itemShop);
            if (!hasPermission) {
              skippedCount++;
              continue;
            }
          }

          let itemMonth = String(item['月份'] || '').trim();
          if (!itemMonth || itemMonth.startsWith('2024')) {
            itemMonth = '2026-04';
          }

          const docRef = await addDoc(collection(db, 'plannings'), {
            month: itemMonth,
            source: item['商机来源'] || '',
            parentCategory: item['类目'] || '',
            category: item['品类'] || '',
            scene: item['场景'] || '',
            keywords: item['核心关键词'] || '',
            plannedCount: Number(item['规划数量'] || 0),
            channel: item['渠道'] || '',
            shop: itemShop,
            uploadedCount: 0,
            ownerId: profile.uid,
            ownerName: profile.displayName || profile.email,
            companyId: currentCompanyId,
            createdAt: new Date().toISOString(),
          });
          await logOperation('CREATE', 'PLANNING', docRef.id, `导入规划: ${item['品类']} - ${itemShop}`, profile);
          successCount++;
        } catch (err) {
          console.error('Import error for item:', item, err);
        }
      }
      
      if (skippedCount > 0) {
        toast.warning(`成功导入 ${successCount} 条数据，跳过 ${skippedCount} 条无权限的店铺数据`);
      } else {
        toast.success(`成功导入 ${successCount} 条数据`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const uniqueYears = Array.from(new Set(plannings.map(p => typeof p.month === 'string' ? p.month.split('-')[0] : null).filter(Boolean))).sort().reverse() as string[];
  const uniqueMonths = Array.from(new Set(plannings.map(p => typeof p.month === 'string' ? p.month.split('-')[1] : null).filter(Boolean))).sort().reverse() as string[];
  const uniqueDays = Array.from(new Set(plannings.map(p => p.plannedDay || (p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null)).filter(Boolean))).sort() as string[];
  const uniqueChannels = Array.from(new Set(plannings.map(p => p.channel).filter(Boolean))) as string[];
  const uniqueShops = Array.from(new Set(plannings.map(p => p.shop).filter(Boolean))) as string[];
  const uniqueParentCategories = Array.from(new Set(plannings.map(p => p.parentCategory).filter(Boolean))) as string[];
  const uniqueCategories = Array.from(new Set(plannings.map(p => p.category).filter(Boolean))) as string[];

  const getUserDisplayName = (emailOrName: string) => {
    if (!emailOrName) return '未知';
    const user = users.find(u => u.email === emailOrName || u.displayName === emailOrName || u.username === emailOrName);
    return user?.displayName || user?.username || (typeof emailOrName === 'string' ? emailOrName.split('@')[0] : String(emailOrName));
  };

  const uniqueOwners = Array.from(new Set(plannings.map(p => getUserDisplayName(p.ownerName)).filter(Boolean))) as string[];

  const filteredPlannings = plannings.filter(p => {
    const pYear = typeof p.month === 'string' ? p.month.split('-')[0] : null;
    const pMonth = typeof p.month === 'string' ? p.month.split('-')[1] : null;
    const pDay = p.plannedDay || (p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null);

    const matchesYear = filterYear === 'all' || pYear === filterYear;
    const matchesMonth = filterMonth === 'all' || pMonth === filterMonth;
    const matchesChannel = filterChannel === 'all' || p.channel === filterChannel;
    const matchesShop = filterShop === 'all' || p.shop === filterShop;
    const matchesOwner = filterOwner === 'all' || getUserDisplayName(p.ownerName) === filterOwner;
    const matchesParentCategory = filterParentCategory === 'all' || p.parentCategory === filterParentCategory;
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    
    return matchesYear && matchesMonth && matchesChannel && matchesShop && matchesOwner && matchesParentCategory && matchesCategory;
  }).sort((a, b) => {
    // Sort by Year, Month, then Day ascending
    if (a.month !== b.month) return (a.month || '').localeCompare(b.month || '');
    const dayA = a.plannedDay || (a.uploadTime ? new Date(a.uploadTime).getDate().toString().padStart(2, '0') : '00');
    const dayB = b.plannedDay || (b.uploadTime ? new Date(b.uploadTime).getDate().toString().padStart(2, '0') : '00');
    if (dayA !== dayB) return dayA.localeCompare(dayB);
    const dateA = a.uploadTime ? new Date(a.uploadTime).getTime() : 0;
    const dateB = b.uploadTime ? new Date(b.uploadTime).getTime() : 0;
    return dateA - dateB;
  });

  const paginatedPlannings = filteredPlannings.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4">
        <div className="flex justify-between items-center w-full">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">上新方向规划</h1>
            <p className="text-xs text-[#86868B] mt-1">Strategic Planning · 设定目标与分母</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             {/* Action buttons could go here */}
          </div>
        </div>
        
        <div className="flex items-center gap-4 w-full">
          <div className="flex bg-[#E3E3E8] p-1 rounded-xl shrink-0">
             <div className="relative flex items-center">
                {/* Search could be added here if needed, keeping filters for now */}
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
            <Select value={filterParentCategory} onValueChange={setFilterParentCategory}>
              <SelectTrigger className="h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] data-[state=open]:bg-white data-[state=open]:text-[#1D1D1F] data-[state=open]:shadow-sm shadow-none focus:ring-0 whitespace-nowrap w-auto">
                <SelectValue>{filterParentCategory === 'all' ? '全部类目' : filterParentCategory}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">全部类目</SelectItem>
                {uniqueParentCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          <div className="flex items-center gap-3 border-l border-black/5 pl-4 ml-1">
            <Button 
              variant="outline" 
              className="rounded-xl gap-2 text-xs font-bold border-black/10 h-10 px-5"
              onClick={downloadTemplate}
            >
              <Download size={18} /> 下载模板
            </Button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".xlsx, .xls, .csv" 
              onChange={handleImport} 
            />
            <Button 
              variant="outline" 
              className="rounded-xl gap-2 text-xs font-bold border-black/10 h-10 px-5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={18} /> 导入数据
            </Button>
            <Button 
              className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl gap-2 text-sm font-bold px-8 h-10 ml-2 shadow-lg shadow-[#FF6B00]/20"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus size={18} /> 新增规划
            </Button>

            <AddPlanningModal
              isOpen={isAddOpen}
              setIsOpen={setIsAddOpen}
              formData={formData}
              setFormData={setFormData}
              settings={settings}
              allShops={allShops}
              handleAdd={handleAdd}
            />
          </div>
        </div>
      </header>

      <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
        <Table>
          <TableHeader className="bg-[#F5F5F7]">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 w-[100px] sticky left-0 bg-[#F5F5F7] z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">月份</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">商机来源</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">类目</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">品类</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">场景</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">核心关键词</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 text-center">规划/已上架</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">负责人</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">店铺/渠道</TableHead>
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPlannings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-[#86868B] text-sm">
                  {(filterYear !== 'all' || filterMonth !== 'all' || filterChannel !== 'all' || filterShop !== 'all' || filterOwner !== 'all' || filterCategory !== 'all') ? '未找到匹配的规划' : '暂无规划数据'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedPlannings.map((p) => (
                <TableRow 
                  key={p.id} 
                  id={`planning-row-${p.id}`}
                  onDoubleClick={() => navigate('/products', { state: { action: 'bind', planning: p } })}
                  className={`hover:bg-[#F5F5F7]/50 transition-colors border-black/5 group cursor-pointer ${highlightId === p.id ? 'bg-[#FF6B00]/10' : ''}`}
                >
                  <TableCell className="sticky left-0 bg-white group-hover:bg-[#F5F5F7]/50 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                    <div className="text-sm font-bold text-[#1D1D1F]">{p.month || '-'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-[#86868B] font-bold">{p.source || '-'}</div>
                  </TableCell>
                  <TableCell className="group/field relative">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold text-[#1D1D1F]">{p.parentCategory || '-'}</div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFieldEdit({
                            isOpen: true,
                            id: p.id,
                            field: 'parentCategory',
                            value: p.parentCategory || '',
                            title: '修改类目'
                          });
                        }}
                        className="p-1 rounded-md hover:bg-black/5 opacity-0 group-hover/field:opacity-100 transition-opacity"
                      >
                        <Edit2 size={12} className="text-[#86868B]" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-bold text-[#1D1D1F]">{p.category}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-[#86868B] font-medium">{p.scene}</div>
                  </TableCell>
                  <TableCell className="text-sm text-[#1D1D1F] max-w-[200px] truncate">{p.keywords}</TableCell>
                  <TableCell className="text-center">
                    <span 
                      className="text-sm font-bold text-[#FF6B00] hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlanningForProducts(p);
                        setProductListDialogOpen(true);
                        setSelectedProductIds([]);
                        setActiveTab('links');
                      }}
                    >
                      {products.filter(pr => pr.planningId === p.id).length}
                    </span>
                    <span className="text-[#86868B] mx-1 text-sm">/</span>
                    <span className="text-sm text-[#1D1D1F] font-bold">{p.plannedCount}</span>
                  </TableCell>
                  <TableCell className="text-sm text-[#1D1D1F] font-medium">{getUserDisplayName(p.ownerName)}</TableCell>
                  <TableCell>
                    <div className="text-sm text-[#1D1D1F] font-bold">{p.shop}</div>
                    <div className="text-xs text-[#86868B] font-medium mt-0.5">{p.channel}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50"
                        onClick={() => setDeleteConfirm({
                          isOpen: true,
                          title: '确认删除',
                          message: '确定要删除这条上新规划吗？相关商品的关联将被解除。',
                          onConfirm: () => handleDelete(p.id)
                        })}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
            共 <span className="text-[#1D1D1F]">{filteredPlannings.length}</span> 个规划
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
              const totalPages = Math.ceil(filteredPlannings.length / pageSize);
              const pages = [];
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
                max={Math.ceil(filteredPlannings.length / pageSize)}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val >= 1 && val <= Math.ceil(filteredPlannings.length / pageSize)) {
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
            disabled={currentPage >= Math.ceil(filteredPlannings.length / pageSize)}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            下一页
          </Button>
        </div>
      </div>

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

      <FieldEditModal
        isOpen={!!fieldEdit?.isOpen}
        title={fieldEdit?.title || '修改'}
        value={fieldEdit?.value || ''}
        onValueChange={(val) => fieldEdit && setFieldEdit({ ...fieldEdit, value: val })}
        onCancel={() => setFieldEdit(null)}
        onConfirm={handleUpdateField}
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
                    <span className="bg-black/5 px-2 py-0.5 rounded-md text-[11px] font-bold">共 {products.filter(pr => pr.planningId === selectedPlanningForProducts?.id).length} 个商品</span>
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

            <div className="flex items-center gap-3 pr-10">
              {activeTab === 'links' && selectedPlanningForProducts && selectedProductIds.length > 0 && (
                <Button 
                  onClick={() => {
                    const idsToCopy = products.filter(pr => selectedProductIds.includes(pr.id)).map(pr => pr.productId);
                    handleCopyProductIds(idsToCopy);
                  }}
                  className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl gap-2 text-sm font-bold h-11 px-6 shadow-lg shadow-[#FF6B00]/20 animate-in fade-in zoom-in duration-200"
                >
                  <Plus size={18} /> 批量复制 {selectedProductIds.length} 个商品ID
                </Button>
              )}
            </div>
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
                          <TableHead className="w-[60px] py-5 text-center">
                            <Checkbox 
                              checked={
                                selectedPlanningForProducts && 
                                products.filter(pr => pr.planningId === selectedPlanningForProducts.id).length > 0 &&
                                products.filter(pr => pr.planningId === selectedPlanningForProducts.id).every(pr => selectedProductIds.includes(pr.id))
                              }
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  const allIds = products.filter(pr => pr.planningId === selectedPlanningForProducts.id).map(pr => pr.id);
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
                          <TableHead className="text-[11px] font-bold text-[#86868B] uppercase py-5 tracking-widest text-center min-w-[600px]">SOP 全流程跟踪</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPlanningForProducts && products.filter(pr => pr.planningId === selectedPlanningForProducts.id).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-80 text-center text-[#86868B] text-sm bg-white">
                              <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-[#F5F5F7] flex items-center justify-center">
                                  <Plus size={32} className="text-[#86868B] opacity-20" />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-lg font-bold text-[#1D1D1F]">暂无关联商品链接</span>
                                  <span className="text-xs">请前往“链接管理”页面将商品 ID 绑定到此规划中</span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          products.filter(pr => pr.planningId === selectedPlanningForProducts?.id).map((pr) => {
                            // Priority: Product's own channel -> Planning's channel -> First available channel's SOP as fallback
                            const channelKey = pr.channel || selectedPlanningForProducts?.channel;
                            let channelSops = settings?.channels?.[channelKey]?.sop || [];
                            
                            // Fallback to avoid empty SOP column if data is missing
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
  );
};


