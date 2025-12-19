import { useEffect } from 'react';
import type { StatusMessage } from '../types/status';

interface ToastProps {
  message: StatusMessage;
  onDismiss: (id: string) => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(message.id);
    }, 4000);

    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  const bgColor =
    message.type === 'error'
      ? 'bg-red-500'
      : message.type === 'success'
      ? 'bg-green-500'
      : 'bg-blue-500';

  const icon =
    message.type === 'error'
      ? '⚠️'
      : message.type === 'success'
      ? '✓'
      : 'ℹ️';

  return (
    <div
      className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 min-w-[280px] max-w-[340px] md:min-w-[300px] md:max-w-[400px] animate-slide-in`}
    >
      <span className="text-lg">{icon}</span>
      <div className="flex-1">
        <p className="text-xs md:text-sm font-medium">{message.message}</p>
      </div>
      <button
        onClick={() => onDismiss(message.id)}
        className="text-white hover:text-gray-200 text-xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center -m-2"
      >
        ×
      </button>
    </div>
  );
}

interface ToastContainerProps {
  messages: StatusMessage[];
  onDismiss: (id: string) => void;
  hasBottomSheet?: boolean;
}

export function ToastContainer({ messages, onDismiss, hasBottomSheet = false }: ToastContainerProps) {
  return (
    <div
      className={`fixed right-4 z-50 flex flex-col gap-2 transition-all ${
        hasBottomSheet ? 'bottom-80' : 'bottom-4'
      } md:bottom-4`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {messages.map((message) => (
        <Toast key={message.id} message={message} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
