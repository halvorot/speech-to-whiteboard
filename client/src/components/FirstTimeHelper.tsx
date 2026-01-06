import { useState, useEffect } from 'react';

const STORAGE_KEY = 'hasSeenWelcome';

export function FirstTimeHelper() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has seen welcome before
    const hasSeenWelcome = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenWelcome) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop - click to dismiss */}
      <div
        className="fixed inset-0 bg-black/30 z-[45] animate-fade-in"
        onClick={handleDismiss}
      />

      {/* Helper popover - positioned at top-middle, below header */}
      <div className="fixed top-20 md:top-24 left-1/2 -translate-x-1/2 z-[46] animate-fade-in max-w-[90vw] md:max-w-md">
        <div className="bg-blue-600 text-white rounded-lg shadow-xl p-4 relative">
          {/* Arrow pointing up */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-600 transform rotate-45" />

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
              Click the <span className="font-semibold">Record button</span> to start creating diagrams with your voice.
            </p>
            <p className="text-sm md:text-base mt-2 text-blue-100">
              Try: "Create a React frontend and Node.js backend, then connect them"
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
