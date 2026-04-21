import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthContext';
import { logOperation } from '../lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Copy, Trash2, MoreHorizontal, Search, LayoutGrid, List, Download, Upload, Edit2, Info, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
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
  const { profile, isAdmin, isSuperAdmin, currentCompanyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState<any[]>([]);
  const [plannings, setPlannings] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ channels: {} });
  const [users, setUsers] = useState<any[]>([]);

  const allShops = React.useMemo(() => {
    const shops: { name: string, channel: string }[] = [];
    Object.entries(settings.channels || {}).forEach(([cName, cData]: [string, any]) => {
      (cData.shops || []).forEach((s: any) => {
        shops.push({ name: s.name || s, channel: cName });
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
    if (location.state?.action === 'bind' && location.state?.planning) {
      const p = location.state.planning;
      setNewProduct({
        productId: '',
        category: p.category || '',
        scene: p.scene || '',
        keywords: p.keywords || '',
        source: p.source || '',
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
      setFilterSource('all');
      setSearchTerm('');
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      navigate(location.pathname, { replace: true, state: {} });
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
    
    // Add missing users subscription
    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('companyId', '==', currentCompanyId)), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const allowedShops = profile?.permissions?.map((p: any) => p.shop) || [];

    const qP = query(collection(db, 'plannings'), where('companyId', '==', currentCompanyId));

    const unsubP = onSnapshot(qP, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
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

    const qProd = query(collection(db, 'products'), where('companyId', '==', currentCompanyId));

    const unsubProd = onSnapshot(qProd, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      if (!isSuperAdmin) {
        if (!isAdmin && allowedShops.length === 0) {
          docs = [];
        } else if (!isAdmin) {
          docs = docs.filter(doc => {
            const shopPerm = profile?.permissions?.find((p: any) => p.shop === doc.shop);
            if (!shopPerm) return false;
            if (shopPerm.canViewPast) return true;
            const docDate = new Date(doc.uploadTime || doc.createdAt || 0); // User considers uploadTime real time
            const takeoverDate = new Date(shopPerm.takeoverTime);
            return docDate >= takeoverDate;
          });
        }
      }
      setProducts(docs);
    });

    return () => {
      unsubSettings();
      unsubP();
      unsubProd();
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

    const channelSop = settings.channels[newProduct.channel]?.sop || [];
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

  const exportToExcel = () => {
    // Generate headers including dynamic SOPs
    const allExpectedSteps = new Set<string>();
    if (settings.channels) {
      Object.values(settings.channels).forEach((channelData: any) => {
        if (channelData.sop && Array.isArray(channelData.sop)) {
          channelData.sop.forEach((step: string) => allExpectedSteps.add(step));
        }
      });
    }
    const sopColumns = Array.from(allExpectedSteps);

    const data = enrichedProducts.map(p => {
      const row: any = {
        '商品 ID': p.productId,
        'SKU': p.sku || '',
        '商机来源': p.source || '',
        '品类': p.category,
        '场景': p.scene,
        '核心关键词': p.keywords || '',
        '渠道': p.channel,
        '店铺': p.shop,
        '负责人': p.assignedOwner || p.ownerName,
        '月份': p.month || '',
        '结果': p.result || '待设置',
        '上架时间': p.uploadTime
      };
      
      // Add SOP columns
      sopColumns.forEach(step => {
        row[step] = p.steps && p.steps[step] ? '是' : '否';
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "导出数据");
    XLSX.writeFile(workbook, "product_export.xlsx");
    toast.success('导出成功');
  };

  const downloadImportTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('导入模板');

    // 定义表头
    const columns = [
      { header: '商品 ID (必填)', key: 'productId', width: 20 },
      { header: '商机来源', key: 'source', width: 15 },
      { header: '品类', key: 'category', width: 15 },
      { header: '场景', key: 'scene', width: 15 },
      { header: '核心关键词', key: 'keywords', width: 20 },
      { header: '渠道 (必填)', key: 'channel', width: 15 },
      { header: '店铺 (必填)', key: 'shop', width: 15 },
      { header: '月份 (例如: 2024-05)', key: 'month', width: 20 },
    ];

    worksheet.columns = columns;

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // 获取下拉框数据源
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

    const allShops = Array.from(new Set(channelData.map(d => d.shop)));

    const firstChannel = uniqueChannels[0] || '拼多多';
    const firstShop = channelData.find(d => d.channel === firstChannel)?.shop || '旗舰店';

    const monthOptions = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      monthOptions.push(`${year}-${month}`);
    }

    worksheet.addRow({
      productId: 'P20241018001',
      source: sources[0] || '爆款复刻',
      category: '女装/连衣裙',
      scene: '日常通勤',
      keywords: '法式, 碎花',
      channel: firstChannel,
      shop: firstShop,
      month: monthOptions[0]
    });

    // 为各列添加下拉框验证 (限制 1000 行)
    for (let i = 2; i <= 1000; i++) {
      if (sources.length > 0) {
        worksheet.getCell(`B${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${sources.join(',')}"`],
        };
      }
      
      if (uniqueChannels.length > 0) {
        worksheet.getCell(`F${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${uniqueChannels.join(',')}"`],
        };
      }
      
      if (allShops.length > 0) {
        worksheet.getCell(`G${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${allShops.join(',')}"`],
        };
      }

      if (monthOptions.length > 0) {
        worksheet.getCell(`H${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${monthOptions.join(',')}"`],
        };
      }
    }

    // 导出文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '导入模板.xlsx';
    anchor.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('模板下载成功');
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
      
      const allExpectedSteps = new Set<string>();
      if (settings.channels) {
        Object.values(settings.channels).forEach((channelData: any) => {
          if (channelData.sop && Array.isArray(channelData.sop)) {
            channelData.sop.forEach((step: string) => allExpectedSteps.add(step));
          }
        });
      }
      const sopKeys = Array.from(allExpectedSteps);

      let count = 0;
      const importedDocIds: string[] = [];
      for (const item of data as any[]) {
        try {
          const rawId = String(item['商品 ID (必填)'] || item['商品 ID'] || '');
          const rawChannel = item['渠道 (必填)'] || item['渠道'];
          const rawShop = item['店铺 (必填)'] || item['店铺'];
          
          if (!rawId || rawId.trim() === '') continue;

          const channelSop = settings.channels?.[rawChannel]?.sop || [];
          
          const initialSteps: any = {};
          channelSop.forEach((step: string) => {
            initialSteps[step] = false;
          });

          // Map SOP fields from the row
          sopKeys.forEach(step => {
             if (item[step] !== undefined && channelSop.includes(step)) {
                const val = String(item[step]).trim().toUpperCase();
                initialSteps[step] = (val === '是' || val === 'TRUE' || val === '1' || val === '完成' || val === 'Y' || val === 'YES');
             }
          });

          const docRef = await addDoc(collection(db, 'products'), {
            productId: rawId.trim(),
            sku: String(item['SKU'] || ''),
            category: item['品类'] || '',
            scene: item['场景'] || '',
            keywords: item['核心关键词'] || '',
            source: item['商机来源'] || item['来源'] || '',
            channel: rawChannel || '',
            shop: rawShop || '',
            month: item['月份 (例如: 2024-05)'] || item['月份'] || new Date().toISOString().slice(0, 7),
            assignedOwner: item['负责人 (必填)'] || item['负责人'] || profile.email,
            ownerId: profile.uid,
            ownerName: profile.displayName || profile.email,
            companyId: currentCompanyId,
            steps: initialSteps,
            notes: item['备注'] || '',
            result: settings.linkJudgments?.[0]?.label || '待设置',
            createdAt: new Date().toISOString(),
            uploadTime: new Date().toISOString()
          });
          importedDocIds.push(docRef.id);
          await logOperation('CREATE', 'PRODUCT', docRef.id, `导入商品链接: ${rawId}`, profile);
          count++;
        } catch (err) {}
      }
      toast.success(`成功导入 ${count} 条数据`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (importedDocIds.length > 0) {
        setUploadTimeModal({
          isOpen: true,
          productIds: importedDocIds,
          defaultDate: new Date().toISOString().split('T')[0],
          uploadTimeSet: false
        });
      }
    };
    reader.readAsBinaryString(file);
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

  const enrichedProducts = useMemo(() => {
    return products.map(p => {
      const relatedPlanning = p.planningId ? plannings.find(plan => plan.id === p.planningId) : null;
      return {
        ...p,
        parentCategory: relatedPlanning?.parentCategory || p.parentCategory || '',
        source: relatedPlanning?.source || p.source || '',
        category: relatedPlanning?.category || p.category || '',
        scene: relatedPlanning?.scene || p.scene || '',
        keywords: relatedPlanning?.keywords || p.keywords || ''
      };
    });
  }, [products, plannings]);

  const uniqueYears = Array.from(new Set(enrichedProducts.map(p => typeof p.month === 'string' ? p.month.split('-')[0] : null).filter(Boolean))).sort().reverse() as string[];
  const uniqueMonths = Array.from(new Set(enrichedProducts.map(p => typeof p.month === 'string' ? p.month.split('-')[1] : null).filter(Boolean))).sort().reverse() as string[];
  const uniqueDays = Array.from(new Set(enrichedProducts.map(p => p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null).filter(Boolean))).sort().reverse() as string[];
  const uniqueChannels = Array.from(new Set(enrichedProducts.map(p => p.channel).filter(Boolean))) as string[];
  const uniqueShops = Array.from(new Set(enrichedProducts.map(p => p.shop).filter(Boolean))) as string[];
  const uniqueParentCategories = Array.from(new Set(enrichedProducts.map(p => p.parentCategory).filter(Boolean))) as string[];
  const uniqueCategories = Array.from(new Set(enrichedProducts.map(p => p.category).filter(Boolean))) as string[];
  const uniqueSources = Array.from(new Set([
    ...(settings.opportunitySources || []),
    ...enrichedProducts.map(p => p.source).filter(Boolean)
  ])) as string[];

  const getUserDisplayName = (emailOrName: string) => {
    if (!emailOrName) return '未知';
    const user = users.find(u => u.email === emailOrName || u.displayName === emailOrName || u.username === emailOrName);
    return user?.displayName || user?.username || (typeof emailOrName === 'string' ? emailOrName.split('@')[0] : String(emailOrName));
  };

  const uniqueOwners = Array.from(new Set(enrichedProducts.map(p => getUserDisplayName(p.assignedOwner || p.ownerName)).filter(Boolean))) as string[];

  const filteredProducts = enrichedProducts.filter(p => {
    const matchesSearch = p.productId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const pYear = typeof p.month === 'string' ? p.month.split('-')[0] : null;
    const pMonth = typeof p.month === 'string' ? p.month.split('-')[1] : null;
    const pDay = p.uploadTime ? new Date(p.uploadTime).getDate().toString().padStart(2, '0') : null;

    const matchesYear = filterYear === 'all' || pYear === filterYear;
    const matchesMonth = filterMonth === 'all' || pMonth === filterMonth;
    const matchesDay = filterDay === 'all' || pDay === filterDay;
    
    let matchesDateRange = true;
    if (dateRange.start && p.uploadTime) {
      if (new Date(p.uploadTime) < new Date(dateRange.start)) matchesDateRange = false;
    }
    if (dateRange.end && p.uploadTime) {
      if (new Date(p.uploadTime) > new Date(dateRange.end + 'T23:59:59')) matchesDateRange = false;
    }

    const matchesChannel = filterChannel === 'all' || p.channel === filterChannel;
    const matchesShop = filterShop === 'all' || p.shop === filterShop;
    const matchesOwner = filterOwner === 'all' || getUserDisplayName(p.assignedOwner || p.ownerName) === filterOwner;
    const matchesParentCategory = filterParentCategory === 'all' || p.parentCategory === filterParentCategory;
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    const matchesSource = filterSource === 'all' || p.source === filterSource;
    
    let matchesSop = true;
    if (filterSopStep !== 'all') {
      matchesSop = p.steps && p.steps[filterSopStep] === true;
    }
    
    return matchesSearch && matchesYear && matchesMonth && matchesDay && matchesDateRange && matchesChannel && matchesShop && matchesOwner && matchesParentCategory && matchesCategory && matchesSource && matchesSop;
  });

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
                className="h-7 w-36 pl-8 pr-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-[10px] font-bold text-[#1D1D1F] placeholder:text-[#86868B] focus:bg-white focus:shadow-sm focus:outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex bg-[#E3E3E8] p-1 rounded-xl gap-1 overflow-x-auto custom-scrollbar flex-nowrap shrink-0 max-w-full">
            <Popover>
               <PopoverTrigger className="flex items-center h-9 px-3 rounded-lg border-none bg-transparent hover:bg-white/50 text-xs font-bold text-[#86868B] shadow-none w-auto cursor-pointer focus:bg-white transition-colors">
                  日期 <ChevronDown size={14} className="ml-1 opacity-50" />
               </PopoverTrigger>
               <PopoverContent className="w-auto p-5 rounded-2xl shadow-xl z-50 bg-white border border-black/10 flex flex-col gap-4" align="start">
                  <div>
                     <p className="text-xs font-bold text-[#1D1D1F] mb-2">按区间筛选</p>
                     <div className="flex items-center gap-2">
                        <input 
                           type="date" 
                           value={dateRange.start}
                           onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                           className="h-9 px-3 rounded-xl border border-black/10 text-xs font-bold text-[#1D1D1F] w-[130px] focus:ring-2 focus:ring-[#FF6B00]/30 outline-none"
                           title="开始日期"
                        />
                        <span className="text-[#86868B] text-xs">-</span>
                        <input 
                           type="date" 
                           value={dateRange.end}
                           onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                           className="h-9 px-3 rounded-xl border border-black/10 text-xs font-bold text-[#1D1D1F] w-[130px] focus:ring-2 focus:ring-[#FF6B00]/30 outline-none"
                           title="结束日期"
                        />
                     </div>
                  </div>
                  <div>
                     <p className="text-xs font-bold text-[#1D1D1F] mb-2 border-t border-black/5 pt-4">按年/月/日精准筛选</p>
                     <div className="flex items-center gap-2">
                        <Select value={filterYear} onValueChange={setFilterYear}>
                           <SelectTrigger className="h-9 flex-1 rounded-xl border border-black/10 text-xs font-bold text-[#1D1D1F] shadow-none focus:ring-[#FF6B00]/30">
                              <SelectValue>{filterYear === 'all' ? '全部年' : `${filterYear}年`}</SelectValue>
                           </SelectTrigger>
                           <SelectContent className="rounded-xl">
                              <SelectItem value="all">全部年</SelectItem>
                              {uniqueYears.map(y => <SelectItem key={y} value={y}>{y}年</SelectItem>)}
                           </SelectContent>
                        </Select>
                        <Select value={filterMonth} onValueChange={setFilterMonth}>
                           <SelectTrigger className="h-9 flex-1 rounded-xl border border-black/10 text-xs font-bold text-[#1D1D1F] shadow-none focus:ring-[#FF6B00]/30">
                              <SelectValue>{filterMonth === 'all' ? '全部月' : `${filterMonth}月`}</SelectValue>
                           </SelectTrigger>
                           <SelectContent className="rounded-xl">
                              <SelectItem value="all">全部月</SelectItem>
                              {uniqueMonths.map(m => <SelectItem key={m} value={m}>{m}月</SelectItem>)}
                           </SelectContent>
                        </Select>
                        <Select value={filterDay} onValueChange={setFilterDay}>
                           <SelectTrigger className="h-9 flex-1 rounded-xl border border-black/10 text-xs font-bold text-[#1D1D1F] shadow-none focus:ring-[#FF6B00]/30">
                              <SelectValue>{filterDay === 'all' ? '全部日' : `${filterDay}日`}</SelectValue>
                           </SelectTrigger>
                           <SelectContent className="rounded-xl">
                              <SelectItem value="all">全部日</SelectItem>
                              {uniqueDays.map(d => <SelectItem key={d} value={d}>{d}日</SelectItem>)}
                           </SelectContent>
                        </Select>
                     </div>
                  </div>
               </PopoverContent>
            </Popover>
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
                <Button variant="ghost" className="w-full justify-start gap-3 h-11 rounded-xl text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7]" onClick={exportToExcel}>
                  <Download size={16} /> 导出当前数据
                </Button>
                <div className="h-px bg-black/5 my-1 mx-2" />
                <Button variant="ghost" className="w-full justify-start gap-3 h-11 rounded-xl text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7]" onClick={downloadImportTemplate}>
                  <Download size={16} /> 下载导入模板
                </Button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleImport} />
                <Button variant="ghost" className="w-full justify-start gap-3 h-11 rounded-xl text-[13px] font-bold text-[#FF6B00] hover:bg-[#FFF0E5]" onClick={() => fileInputRef.current?.click()}>
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
              <Select value={newProduct.planningId || ''} onValueChange={val => {
                const p = plannings.find(pl => pl.id === val);
                if (p) {
                  setNewProduct({...newProduct, planningId: val, category: p.category, scene: p.scene, keywords: p.keywords, channel: p.channel, shop: p.shop, month: p.month});
                }
              }}>
                <SelectTrigger className="rounded-xl border-black/10 h-10">
                  <SelectValue placeholder="选择规划">
                    {newProduct.planningId && plannings.find((p) => p.id === newProduct.planningId)
                      ? (() => {
                          const p = plannings.find((pl) => pl.id === newProduct.planningId);
                          return p ? `${p.category} (${p.keywords}) - ${p.channel}` : newProduct.planningId;
                        })()
                      : "选择规划"}
                  </SelectValue>
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
              <Select value={newProduct.channel || ''} onValueChange={val => setNewProduct({...newProduct, channel: val, shop: '', planningId: ''})}>
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
              <Select value={newProduct.shop || ''} onValueChange={val => {
                const selectedShop = allShops.find(s => s.name === val);
                const owners = users.filter(u => u.role !== 'rejected' && (u.role === 'admin' || (u.permissions && u.permissions.some((p: any) => p.shop === val))));
                setNewProduct({
                  ...newProduct, 
                  shop: val, 
                  channel: selectedShop ? selectedShop.channel : newProduct.channel,
                  assignedOwner: owners.length === 1 ? owners[0].email : ''
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
              <Select value={newProduct.assignedOwner || ''} onValueChange={val => setNewProduct({...newProduct, assignedOwner: val})} disabled={!newProduct.shop}>
                <SelectTrigger className="rounded-xl border-black/10 h-10">
                  <span className={cn("text-sm", !newProduct.assignedOwner && "text-muted-foreground")}>
                    {newProduct.assignedOwner ? getUserDisplayName(newProduct.assignedOwner) : (newProduct.shop ? "选择负责人" : "请先选择店铺")}
                  </span>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {users.filter(u => u.role !== 'rejected' && (u.role === 'admin' || (u.permissions && u.permissions.some((p: any) => p.shop === newProduct.shop)))).map(o => (
                    <SelectItem key={o.id} value={o.email}>{getUserDisplayName(o.email)}</SelectItem>
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
        <div className="bg-white rounded-[24px] shadow-sm border border-black/5 flex flex-col relative w-full min-w-0 overflow-x-auto">
          <Table className="min-w-max w-full">
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
                    <span className="text-xs text-[#1D1D1F] font-medium">{getUserDisplayName(p.assignedOwner || p.ownerName)}</span>
                  </TableCell>
                  <TableCell className="sticky left-[480px] z-10 bg-white group-hover:bg-[#fafafc] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] min-w-[120px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-[#1D1D1F] truncate w-[110px]" title={p.shop}>{p.shop}</span>
                      <span className="text-[10px] text-[#86868B] font-bold truncate w-[110px]" title={p.channel}>{p.channel}</span>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[400px]">
                    <div className="flex flex-wrap gap-x-5 gap-y-3">
                      {(settings.channels[p.channel]?.sop || []).map((step: string) => (
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
                    <Select value={p.result || ''} onValueChange={(val) => updateResult(p.id, val)}>
                      <Tooltip content={judgments.find((j: any) => j.label === p.result)?.definition || '暂无定义'}>
                        <SelectTrigger 
                          className="w-[80px] h-8 rounded-lg border-none shadow-none text-xs font-bold"
                          style={getResultStyle(p.result)}
                        >
                          <SelectValue>{p.result || '待设置'}</SelectValue>
                        </SelectTrigger>
                      </Tooltip>
                      <SelectContent className="rounded-xl">
                        {judgments.map((j: any) => (
                          <React.Fragment key={j.label}>
                            <Tooltip content={j.definition} side="right">
                              <SelectItem value={j.label} className="text-xs">
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
                  <TableCell className="min-w-[140px]" onDoubleClick={(e) => e.stopPropagation()}>
                    <Popover>
                       <PopoverTrigger render={
                          <button type="button"
                             className="text-left bg-transparent border-none outline-none w-[110px] cursor-pointer hover:bg-black/5 px-2 py-1.5 rounded-lg transition-colors flex items-start h-[42px]" 
                             onClick={(e) => e.stopPropagation()}
                             onDoubleClick={(e) => e.stopPropagation()}
                          />
                       }>
                             {p.notes ? (
                                <Tooltip content={<div className="text-[13px] max-w-[200px] whitespace-normal break-words leading-relaxed">{p.notes}</div>} side="top">
                                   <div className="text-[13px] text-[#1D1D1F] whitespace-normal break-words leading-[1.3] line-clamp-2 w-full">{p.notes}</div>
                                </Tooltip>
                             ) : <div className="flex items-center gap-1 text-[13px] text-[#86868B] opacity-70 hover:opacity-100 transition-opacity"><Edit2 size={12} /><span>添加备注</span></div>}
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
                  <div className="text-xs text-[#FF6B00] font-bold mt-0.5">
                    {typeof p.uploadTime === 'string' ? p.uploadTime.split('T')[0] : ''} · 已上架 {calculateDays(p.uploadTime)} 天
                  </div>
                  <p className="text-xs text-[#86868B] font-bold mt-1">{p.category} {p.scene ? `· ${p.scene}` : ''}</p>
                </div>
                <Select value={p.result || ''} onValueChange={(val) => updateResult(p.id, val)}>
                  <Tooltip content={judgments.find((j: any) => j.label === p.result)?.definition || '暂无定义'}>
                    <SelectTrigger 
                      className="w-[80px] h-7 rounded-lg border-none shadow-none text-xs font-bold"
                      style={getResultStyle(p.result)}
                    >
                      <SelectValue>{p.result || '待设置'}</SelectValue>
                    </SelectTrigger>
                  </Tooltip>
                  <SelectContent className="rounded-xl">
                    {judgments.map((j: any) => (
                      <React.Fragment key={j.label}>
                        <Tooltip content={j.definition} side="right">
                          <SelectItem value={j.label} className="text-xs">{j.label}</SelectItem>
                        </Tooltip>
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.channel}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{p.shop}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-[#F5F5F7] text-[#86868B] font-bold border border-black/5">{getUserDisplayName(p.assignedOwner || p.ownerName)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-4 border-t border-black/5">
                {(settings.channels[p.channel]?.sop || []).map((step: string) => (
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

      {/* Upload Time Override Modal */}
      {uploadTimeModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#1D1D1F]">重设上架时间</h2>
              <p className="text-sm text-[#86868B] mt-2">
                您新增了 {uploadTimeModal.productIds.length} 个链接。如果您上传的链接已经实际上架过一段时间，请在这里统一将其修改为真实的初始上架时间（如果不填则默认为今天）。
              </p>
            </div>
            
            <div className="space-y-2 relative isolate">
              <label className="text-xs font-bold text-[#86868B]">选择真实上架日期</label>
              <Input 
                type="date" 
                value={uploadTimeModal.defaultDate}
                onChange={(e) => setUploadTimeModal(prev => ({...prev, defaultDate: e.target.value}))}
                className="h-12 rounded-xl"
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <Button 
                variant="outline" 
                className="rounded-xl h-10 px-6 font-bold"
                onClick={() => setUploadTimeModal({ isOpen: false, productIds: [], defaultDate: '', uploadTimeSet: false })}
              >
                跳过 (保存今天)
              </Button>
              <Button 
                onClick={() => submitUploadTime(uploadTimeModal.defaultDate)} 
                className="bg-[#1D1D1F] hover:bg-black text-white rounded-xl h-10 px-6 font-bold shadow-md"
              >
                确认真实时间
              </Button>
            </div>
          </div>
        </div>
      )}

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
    </TooltipProvider>
  );
};
