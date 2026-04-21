import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface UploadTimeModalProps {
  isOpen: boolean;
  productIds: string[];
  defaultDate: string;
  onDateChange: (date: string) => void;
  onSkip: () => void;
  onSubmit: (date: string) => void;
}

export const UploadTimeModal: React.FC<UploadTimeModalProps> = ({
  isOpen,
  productIds,
  defaultDate,
  onDateChange,
  onSkip,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-6">
        <div>
          <h2 className="text-xl font-bold text-[#1D1D1F]">重设上架时间</h2>
          <p className="text-sm text-[#86868B] mt-2">
            您新增了 {productIds.length} 个链接。如果您上传的链接已经实际上架过一段时间，请在这里统一将其修改为真实的初始上架时间（如果不填则默认为今天）。
          </p>
        </div>
        
        <div className="space-y-2 relative isolate">
          <label className="text-xs font-bold text-[#86868B]">选择真实上架日期</label>
          <Input 
            type="date" 
            value={defaultDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="h-12 rounded-xl"
          />
        </div>
        
        <div className="flex justify-end gap-3 pt-4">
          <Button 
            variant="outline" 
            className="rounded-xl h-10 px-6 font-bold relative z-10"
            onClick={onSkip}
          >
            跳过 (保存今天)
          </Button>
          <Button 
            onClick={() => onSubmit(defaultDate)} 
            className="bg-[#1D1D1F] hover:bg-black text-white rounded-xl h-10 px-6 font-bold shadow-md relative z-10"
          >
            确认真实时间
          </Button>
        </div>
      </div>
    </div>
  );
};
