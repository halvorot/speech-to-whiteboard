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
      className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 min-w-[300px] max-w-[400px] animate-slide-in`}
    >
      <span className="text-lg">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium">{message.message}</p>
      </div>
      <button
        onClick={() => onDismiss(message.id)}
        className="text-white hover:text-gray-200 text-xl leading-none"
      >
        ×
      </button>
    </div>
  );
}

interface ToastContainerProps {
  messages: StatusMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ messages, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {messages.map((message) => (
        <Toast key={message.id} message={message} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
