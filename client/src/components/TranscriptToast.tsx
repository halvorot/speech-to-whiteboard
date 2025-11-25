import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export function TranscriptToast() {
  const { transcript } = useWebSocket();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!transcript) return;

    // Show toast
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 0);

    // Hide after 5 seconds
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 5000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [transcript]);

  if (!isVisible || !transcript) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg max-w-2xl">
      <div className="text-sm font-medium mb-1">Transcript:</div>
      <div className="text-base">{transcript}</div>
    </div>
  );
}
