import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface AddPlanningModalProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  settings: any;
  allShops: any[];
  handleAdd: () => void;
}

export const AddPlanningModal: React.FC<AddPlanningModalProps> = ({
  isOpen,
  setIsOpen,
  formData,
  setFormData,
  settings,
  allShops,
  handleAdd
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px] rounded-[32px] border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">新增上新规划</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 relative isolate">
              <label className="text-xs font-bold text-[#86868B] uppercase">月份</label>
              <Input type="month" className="rounded-xl border-black/10" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} />
            </div>
            <div className="space-y-2 relative isolate">
              <label className="text-xs font-bold text-[#86868B] uppercase">日</label>
              <Select value={formData.plannedDay || '01'} onValueChange={val => setFormData({...formData, plannedDay: val})}>
                <SelectTrigger className="rounded-xl border-black/10">
                  <SelectValue placeholder="选择日期" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-[300px]">
                  {Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => (
                    <SelectItem key={d} value={d}>{d}日</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#86868B] uppercase">商机来源</label>
              <Select value={formData.source} onValueChange={val => setFormData({...formData, source: val})}>
                <SelectTrigger className="rounded-xl border-black/10">
                  <SelectValue placeholder="选择来源" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(settings?.opportunitySources || ['爆款复刻', '竞品监控', '趋势发现', '站内商机']).map((s: string) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 relative isolate">
              <label className="text-xs font-bold text-[#86868B] uppercase">类目</label>
              <Input placeholder="如：女装" className="rounded-xl border-black/10" value={formData.parentCategory} onChange={e => setFormData({...formData, parentCategory: e.target.value})} />
            </div>
            <div className="space-y-2 relative isolate">
              <label className="text-xs font-bold text-[#86868B] uppercase">品类</label>
              <Input placeholder="如：连衣裙" className="rounded-xl border-black/10" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 relative isolate">
              <label className="text-xs font-bold text-[#86868B] uppercase">规划数量</label>
              <Input type="number" className="rounded-xl border-black/10" value={formData.plannedCount} onChange={e => setFormData({...formData, plannedCount: Number(e.target.value)})} />
            </div>
            <div className="space-y-2 relative isolate">
              <label className="text-xs font-bold text-[#86868B] uppercase">场景</label>
              <Input placeholder="如：通勤/约会" className="rounded-xl border-black/10" value={formData.scene} onChange={e => setFormData({...formData, scene: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2 relative isolate">
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
                  {Object.keys(settings?.channels || {}).map(c => (
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
          <Button onClick={handleAdd} className="w-full bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl mt-4 font-bold h-12 relative z-10">
            确认提交
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
