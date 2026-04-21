import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FieldEditModalProps {
  isOpen: boolean;
  title: string;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const FieldEditModal: React.FC<FieldEditModalProps> = ({
  isOpen,
  title,
  value,
  onValueChange,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-xl font-bold text-[#1D1D1F] mb-6">{title}</h3>
        <div className="space-y-4">
          <div className="space-y-2 relative isolate">
            <label className="text-xs font-bold text-[#86868B] uppercase">新值</label>
            <Input 
              autoFocus
              value={value} 
              onChange={(e) => onValueChange(e.target.value)}
              className="rounded-xl border-black/10 h-12"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={onCancel} className="rounded-xl font-bold h-11 px-6 relative z-10">
              取消
            </Button>
            <Button 
              onClick={onConfirm}
              className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl font-bold px-8 h-11 shadow-lg shadow-[#FF6B00]/20 relative z-10"
            >
              保存修改
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
