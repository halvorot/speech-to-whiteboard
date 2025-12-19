import { useEffect, useState } from 'react';

const STORAGE_KEY = 'voiceboard-first-time-dismissed';

export function FirstTimeHelper() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has dismissed this before
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      // Show after a short delay to ensure UI is loaded
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[100] animate-fade-in"
        onClick={handleDismiss}
      />

      {/* Helper popover - positioned near the record button */}
      <div className="fixed top-20 md:top-24 right-4 md:right-32 z-[101] animate-fade-in">
        <div className="bg-blue-600 text-white rounded-lg shadow-xl p-4 max-w-xs md:max-w-sm relative">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-white/80 hover:text-white text-xl leading-none w-6 h-6 flex items-center justify-center"
            aria-label="Dismiss"
          >
            ×
          </button>

          {/* Content */}
          <div className="pr-6">
            <div className="text-lg font-bold mb-2">👋 Welcome to VoiceBoard!</div>
            <p className="text-sm md:text-base">
              Click the <span className="font-semibold">Record button</span> above to start creating diagrams with your voice.
            </p>
            <p className="text-sm md:text-base mt-2 text-blue-100">
              Try: "Create a React frontend and Node.js backend, then connect them"
            </p>
          </div>

          {/* Arrow pointing up to record button */}
          <div className="absolute -top-2 right-8 md:right-20 w-4 h-4 bg-blue-600 transform rotate-45" />
        </div>
      </div>
    </>
  );
}
