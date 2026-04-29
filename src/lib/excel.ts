import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { toast } from 'sonner';
import { db } from './firebase';
import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { logOperation } from './logger';

export const exportProductsToExcel = (
  mode: 'selected' | 'current_page' | 'filtered' | 'all',
  settings: any,
  selectedIds: string[],
  enrichedProducts: any[],
  paginatedProducts: any[],
  filteredProducts: any[],
  currentPage: number
) => {
  let sourceData = enrichedProducts;
  let filename = 'products_all.xlsx';

  if (mode === 'selected') {
    if (selectedIds.length === 0) {
      toast.error('请先勾选商品');
      return;
    }
    sourceData = enrichedProducts.filter(p => selectedIds.includes(p.id));
    filename = 'products_selected.xlsx';
  } else if (mode === 'current_page') {
    sourceData = paginatedProducts;
    filename = `products_page_${currentPage}.xlsx`;
  } else if (mode === 'filtered') {
    sourceData = filteredProducts;
    filename = 'products_filtered.xlsx';
  }

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

  const data = sourceData.map(p => {
    const row: any = {
      '商品 ID': p.productId,
      'SKU': p.sku || '',
      '商机来源': p.source || '',
      '品类': p.category,
      '场景': p.scene,
      '核心关键词': p.keywords || '',
      '渠道': p.channel,
      '店铺': p.shop,
      '负责人': p.displayName || p.assignedOwner || p.ownerName,
      '月份': p.month || '',
      '结果': p.result || settings?.linkJudgments?.[0]?.label || '待设置',
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
  XLSX.writeFile(workbook, filename);
  toast.success('导出成功');
};

export const downloadImportTemplate = async (settings: any) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('导入模板');

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
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

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

export const handleProductImport = async (
  file: File,
  settings: any,
  profile: any,
  currentCompanyId: string,
  onComplete: (importedIds: string[]) => void
) => {
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const bstr = evt.target?.result;
    const wb = XLSX.read(bstr, { type: 'binary' });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];
    const data = XLSX.utils.sheet_to_json(ws);
    
    const allExpectedSteps = new Set<string>();
    if (settings?.channels) {
      Object.values(settings.channels).forEach((channelData: any) => {
        if (channelData.sop && Array.isArray(channelData.sop)) {
          channelData.sop.forEach((step: string) => allExpectedSteps.add(step));
        }
      });
    }
    const sopKeys = Array.from(allExpectedSteps);

    const importedDocIds: string[] = [];
    const batchSize = 400;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      const batch = writeBatch(db);
      
      for (const item of chunk as any[]) {
        try {
          const rawId = String(item['商品 ID (必填)'] || item['商品 ID'] || '');
          const rawChannel = item['渠道 (必填)'] || item['渠道'];
          const rawShop = item['店铺 (必填)'] || item['店铺'];
          
          if (!rawId || rawId.trim() === '') continue;

          const channelSop = settings?.channels?.[rawChannel]?.sop || [];
          
          const initialSteps: any = {};
          channelSop.forEach((step: string) => {
            initialSteps[step] = false;
          });

          sopKeys.forEach(step => {
             if (item[step] !== undefined && channelSop.includes(step)) {
                const val = String(item[step]).trim().toUpperCase();
                initialSteps[step] = (val === '是' || val === 'TRUE' || val === '1' || val === '完成' || val === 'Y' || val === 'YES');
             }
          });

          const newDocRef = doc(collection(db, 'products'));
          batch.set(newDocRef, {
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
            result: settings?.linkJudgments?.[0]?.label || '待设置',
            createdAt: new Date().toISOString(),
            uploadTime: new Date().toISOString()
          });
          importedDocIds.push(newDocRef.id);
        } catch (err) {}
      }
      await batch.commit();
    }
    
    if (importedDocIds.length > 0) {
      await logOperation('CREATE', 'PRODUCT', 'BATCH_IMPORT', `批量导入商品链接: ${importedDocIds.length}条`, profile);
    }
    
    toast.success(`成功导入 ${importedDocIds.length} 条数据`);
    onComplete(importedDocIds);
  };
  reader.readAsBinaryString(file);
};
