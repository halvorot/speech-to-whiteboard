import { useEffect, useRef, useState, useCallback } from 'react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const MobileBottomSheet = ({
  isOpen,
  onClose,
  children,
}: MobileBottomSheetProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300); // Match animation duration
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const deltaY = touchCurrentY.current - touchStartY.current;

    // Only allow downward swipes
    if (deltaY > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  };

  const handleTouchEnd = () => {
    const deltaY = touchCurrentY.current - touchStartY.current;

    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }

    // Close if swiped down more than 100px
    if (deltaY > 100) {
      handleClose();
    }
  };

  if (!isOpen && !isClosing) return null;

  return (
    <>
      {/* Backdrop - visible only on mobile */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-[999] transition-opacity duration-300 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />

      {/* Bottom sheet - visible only on mobile */}
      <div
        ref={sheetRef}
        className={`md:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[1000] max-h-[80vh] overflow-y-auto ${
          isClosing ? 'animate-slide-down' : 'animate-slide-up'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Content */}
        <div style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </>
  );
};
