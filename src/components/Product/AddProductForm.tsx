import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AddProductFormProps {
  newProduct: any;
  setNewProduct: React.Dispatch<React.SetStateAction<any>>;
  plannings: any[];
  settings: any;
  allShops: any[];
  users: any[];
  getUserDisplayName: (emailOrName: string) => string;
  handleAddProduct: () => void;
}

export const AddProductForm: React.FC<AddProductFormProps> = ({
  newProduct,
  setNewProduct,
  plannings,
  settings,
  allShops,
  users,
  getUserDisplayName,
  handleAddProduct
}) => {

  const allowedOwners = users.filter(u => 
    u.role !== 'rejected' && 
    (u.role === 'admin' || (u.permissions && u.permissions.some((p: any) => p.shop === newProduct.shop)))
  );

  return (
    <div className="bg-white p-6 rounded-[24px] border border-[#FF6B00]/20 shadow-xl shadow-[#FF6B00]/5 animate-in fade-in slide-in-from-top-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-2 md:col-span-5">
          <label className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">商品 ID (支持多个，用空格、逗号或换行分隔)</label>
          <textarea 
            placeholder="输入商品 ID..." 
            className="w-full rounded-xl border border-black/10 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/20 resize-none h-20 bg-white" 
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
            <SelectTrigger className="rounded-xl border-black/10 h-10 bg-white">
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
            <SelectTrigger className="rounded-xl border-black/10 h-10 bg-white">
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
            <SelectTrigger className="rounded-xl border-black/10 h-10 bg-white">
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
            <SelectTrigger className="rounded-xl border-black/10 h-10 bg-white">
              <span className={cn("text-sm", !newProduct.assignedOwner && "text-muted-foreground", !newProduct.shop && "opacity-50")}>
                {newProduct.assignedOwner ? getUserDisplayName(newProduct.assignedOwner) : (newProduct.shop ? "选择负责人" : "请先选择店铺")}
              </span>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {allowedOwners.map(o => (
                <SelectItem key={o.id} value={o.email}>{getUserDisplayName(o.email)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={handleAddProduct} className="w-full bg-[#1D1D1F] text-white rounded-xl h-10 font-bold active:scale-95 transition-transform">确认绑定</Button>
        </div>
      </div>
    </div>
  );
};
