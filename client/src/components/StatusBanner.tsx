import type { AppStatus } from '../types/status';
import { getStatusLabel, getStatusIcon } from '../types/status';

interface StatusBannerProps {
  status: AppStatus;
}

export function StatusBanner({ status }: StatusBannerProps) {
  if (status === 'idle') {
    return null;
  }

  const bgColor = status === 'error' ? 'bg-red-500' : 'bg-blue-500';
  const icon = getStatusIcon(status);
  const label = getStatusLabel(status);

  return (
    <div className={`fixed top-16 md:top-20 left-0 right-0 z-30 ${bgColor} text-white px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium flex items-center justify-center gap-2 shadow-lg`}>
      <span className="animate-pulse">{icon}</span>
      <span>{label}</span>
      {status !== 'error' && (
        <div className="flex gap-1">
          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
        </div>
      )}
    </div>
  );
}
