import React from 'react';
import { Button } from '@/components/ui/button';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title = '确认删除',
  message = '确定要删除吗？此操作无法撤销。',
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-xl font-bold text-red-500 mb-4">{title}</h3>
        <p className="text-[#1D1D1F] mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} className="rounded-xl font-bold relative z-10">
            取消
          </Button>
          <Button 
            onClick={onConfirm} 
            className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-md relative z-10"
          >
            确认删除
          </Button>
        </div>
      </div>
    </div>
  );
};
