import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { logOperation } from '../lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Download, Upload, Trash2, Edit2, Search } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

export const Planning: React.FC = () => {
  const { profile, isAdmin, isSuperAdmin, currentCompanyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [plannings, setPlannings] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ channels: {} });
  const [users, setUsers] = useState<any[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const allShops = React.useMemo(() => {
    const shops: { name: string, channel: string }[] = [];
    Object.entries(settings.channels || {}).forEach(([cName, cData]: [string, any]) => {
      (cData.shops || []).forEach((s: any) => {
        shops.push({ name: s.name || s, channel: cName });
      });
    });
    return shops;
  }, [settings.channels]);
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterShop, setFilterShop] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterParentCategory, setFilterParentCategory] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    month: new Date().toISOString().slice(0, 7),
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
      setFilterDay('all');
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
    const settingDocId = currentCompanyId !== 'HQ' ? currentCompanyId : 'global';
    const unsubSettings = onSnapshot(doc(db, 'settings', settingDocId), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else if (currentCompanyId !== 'HQ') {
        // Fallback to global if branch settings don't exist yet
        getDoc(doc(db, 'settings', 'global')).then(g => {
          if (g.exists()) setSettings(g.data() as any);
        });
      }
    });

    const allowedShops = profile?.permissions?.map((p: any) => p.shop) || [];
    
    // Core query by tenant
    const q = query(collection(db, 'plannings'), where('companyId', '==', currentCompanyId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Client-side shop filtering for non-admin
      if (!isSuperAdmin) {
        if (!isAdmin && allowedShops.length === 0) {
           docs = [];
        } else if (!isAdmin) {
          docs = docs.filter(doc => {
            const shopPerm = profile?.permissions?.find((p: any) => p.shop === doc.shop);
            if (!shopPerm) return false;
            if (shopPerm.canViewPast) return true;
            const docDate = new Date(doc.createdAt || 0);
            const takeoverDate = new Date(shopPerm.takeoverTime);
            return docDate >= takeoverDate;
          });
        }
      }
      setPlannings(docs);
    });
    
    // Add missing users subscription
    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('companyId', '==', currentCompanyId)), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubProducts = onSnapshot(query(collection(db, 'products'), where('companyId', '==', currentCompanyId)), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSettings();
      unsubscribe();
      unsubUsers();
      unsubProducts();
    };
  }, [isAdmin, isSuperAdmin, profile, currentCompanyId]);

  // Auto-fix discrepancies in uploadedCount
  useEffect(() => {
    if (plannings.length > 0 && products.length > 0) {
      plannings.forEach(p => {
        const actualCount = products.filter(pr => pr.planningId === p.id).length;
        if (p.uploadedCount !== actualCount) {
          updateDoc(doc(db, 'plannings', p.id), { uploadedCount: actualCount }).catch(() => {});
        }
      });
    }
  }, [plannings, products]);

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
    const sources = settings.opportunitySources || ['爆款复刻', '竞品监控', '趋势发现', '站内商机'];
    const channelData: { channel: string; shop: string }[] = [];
    const uniqueChannels = Object.keys(settings.channels || []);
    
    uniqueChannels.forEach(channelName => {
      const channel = settings.channels[channelName];
      if (channel.shops) {
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

          const docRef = await addDoc(collection(db, 'plannings'), {
            month: String(item['月份'] || ''),
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

  const uniqueYears = Array.from(new Set(plannings.map(p => p.month?.split('-')[0]).filter(Boolean))).sort().reverse() as string[];
  const uniqueMonths = Array.from(new Set(plannings.map(p => p.month?.split('-')[1]).filter(Boolean))).sort().reverse() as string[];
  const uniqueDays = Array.from(new Set(plannings.map(p => p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null).filter(Boolean))).sort().reverse() as string[];
  const uniqueChannels = Array.from(new Set(plannings.map(p => p.channel).filter(Boolean))) as string[];
  const uniqueShops = Array.from(new Set(plannings.map(p => p.shop).filter(Boolean))) as string[];
  const uniqueParentCategories = Array.from(new Set(plannings.map(p => p.parentCategory).filter(Boolean))) as string[];
  const uniqueCategories = Array.from(new Set(plannings.map(p => p.category).filter(Boolean))) as string[];

  const getUserDisplayName = (emailOrName: string) => {
    if (!emailOrName) return '未知';
    const user = users.find(u => u.email === emailOrName || u.displayName === emailOrName || u.username === emailOrName);
    return user?.displayName || user?.username || emailOrName.split('@')[0];
  };

  const uniqueOwners = Array.from(new Set(plannings.map(p => getUserDisplayName(p.ownerName)).filter(Boolean))) as string[];

  const filteredPlannings = plannings.filter(p => {
    const pYear = p.month?.split('-')[0];
    const pMonth = p.month?.split('-')[1];
    const pDay = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;

    const matchesYear = filterYear === 'all' || pYear === filterYear;
    const matchesMonth = filterMonth === 'all' || pMonth === filterMonth;
    const matchesDay = filterDay === 'all' || pDay === filterDay;
    const matchesChannel = filterChannel === 'all' || p.channel === filterChannel;
    const matchesShop = filterShop === 'all' || p.shop === filterShop;
    const matchesOwner = filterOwner === 'all' || getUserDisplayName(p.ownerName) === filterOwner;
    const matchesParentCategory = filterParentCategory === 'all' || p.parentCategory === filterParentCategory;
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    
    return matchesYear && matchesMonth && matchesDay && matchesChannel && matchesShop && matchesOwner && matchesParentCategory && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">上新方向规划</h1>
          <p className="text-xs text-[#86868B] mt-1">Strategic Planning · 设定目标与分母</p>
        </div>
        <div className="flex items-center gap-4">
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
                {uniqueDays.map(d => <SelectItem key={d} value={d}>{d}日</SelectItem>)}
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
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger render={
                <Button className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl gap-2 text-sm font-bold px-8 h-10 ml-2 shadow-lg shadow-[#FF6B00]/20">
                  <Plus size={18} /> 新增规划
                </Button>
              } />
              <DialogContent className="sm:max-w-[500px] rounded-[32px] border-none shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">新增上新规划</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868B] uppercase">月份</label>
                      <Input type="month" className="rounded-xl border-black/10" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868B] uppercase">商机来源</label>
                      <Select value={formData.source} onValueChange={val => setFormData({...formData, source: val})}>
                        <SelectTrigger className="rounded-xl border-black/10">
                          <SelectValue placeholder="选择来源" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {(settings.opportunitySources || []).map((s: string) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868B] uppercase">类目</label>
                      <Input placeholder="如：女装" className="rounded-xl border-black/10" value={formData.parentCategory} onChange={e => setFormData({...formData, parentCategory: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868B] uppercase">品类</label>
                      <Input placeholder="如：连衣裙" className="rounded-xl border-black/10" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868B] uppercase">规划数量</label>
                      <Input type="number" className="rounded-xl border-black/10" value={formData.plannedCount} onChange={e => setFormData({...formData, plannedCount: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868B] uppercase">场景</label>
                      <Input placeholder="如：通勤/约会" className="rounded-xl border-black/10" value={formData.scene} onChange={e => setFormData({...formData, scene: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#86868B] uppercase">核心关键词</label>
                    <Input placeholder="多个关键词用逗号隔开" className="rounded-xl border-black/10" value={formData.keywords} onChange={e => setFormData({...formData, keywords: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868B] uppercase">渠道</label>
                      <Select value={formData.channel} onValueChange={val => setFormData({...formData, channel: val, shop: ''})}>
                        <SelectTrigger className="rounded-xl border-black/10">
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
                      <label className="text-xs font-bold text-[#86868B] uppercase">店铺</label>
                      <Select value={formData.shop} onValueChange={val => {
                        const selectedShop = allShops.find(s => s.name === val);
                        setFormData({
                          ...formData,
                          shop: val,
                          channel: selectedShop ? selectedShop.channel : formData.channel
                        });
                      }}>
                        <SelectTrigger className="rounded-xl border-black/10">
                          <SelectValue placeholder="选择店铺" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {(formData.channel ? allShops.filter(s => s.channel === formData.channel) : allShops).map((s, i) => (
                            <SelectItem key={`${s.name}-${i}`} value={s.name}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleAdd} className="w-full bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl mt-4 font-bold h-12">
                    确认提交
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
        <Table>
          <TableHeader className="bg-[#F5F5F7]">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-xs font-bold text-[#86868B] uppercase py-4">月份</TableHead>
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
                  {(filterYear !== 'all' || filterMonth !== 'all' || filterDay !== 'all' || filterChannel !== 'all' || filterShop !== 'all' || filterOwner !== 'all' || filterCategory !== 'all') ? '未找到匹配的规划' : '暂无规划数据'}
                </TableCell>
              </TableRow>
            ) : (
              filteredPlannings.map((p) => (
                <TableRow 
                  key={p.id} 
                  id={`planning-row-${p.id}`}
                  onDoubleClick={() => navigate('/products', { state: { action: 'bind', planning: p } })}
                  className={`hover:bg-[#F5F5F7]/50 transition-colors border-black/5 group cursor-pointer ${highlightId === p.id ? 'bg-[#FF6B00]/10' : ''}`}
                >
                  <TableCell>
                    <div className="text-sm font-medium text-[#1D1D1F]">{p.month}</div>
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
                    <span className="text-sm font-bold text-[#FF6B00]">
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

      {/* FIELD EDIT Modal */}
      {fieldEdit && fieldEdit.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-[#1D1D1F] mb-6">{fieldEdit.title}</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#86868B] uppercase">新值</label>
                <Input 
                  autoFocus
                  value={fieldEdit.value} 
                  onChange={(e) => setFieldEdit({...fieldEdit, value: e.target.value})}
                  className="rounded-xl border-black/10 h-12"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateField();
                    if (e.key === 'Escape') setFieldEdit(null);
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="ghost" onClick={() => setFieldEdit(null)} className="rounded-xl font-bold h-11 px-6">
                  取消
                </Button>
                <Button 
                  onClick={handleUpdateField}
                  className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl font-bold px-8 h-11 shadow-lg shadow-[#FF6B00]/20"
                >
                  保存修改
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

