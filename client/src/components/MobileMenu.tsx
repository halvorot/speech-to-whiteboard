import { useEffect } from 'react';
import { SaveStatusIndicator } from './SaveStatusIndicator';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  lastTranscript: string | null;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  onSignOut: () => void;
}

export const MobileMenu = ({
  isOpen,
  onClose,
  lastTranscript,
  saveStatus,
  onSignOut,
}: MobileMenuProps) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-fade-in md:hidden"
        onClick={onClose}
      />

      {/* Menu drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-[80vw] max-w-sm bg-gray-800 text-white z-40 shadow-2xl animate-slide-in-right md:hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold">Menu</h2>
          <button
            onClick={onClose}
            className="text-2xl text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Last Transcript */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">Last Voice Input</h3>
            <div className="bg-gray-700 px-4 py-3 rounded text-sm">
              {lastTranscript ? (
                <p>{lastTranscript}</p>
              ) : (
                <p className="text-gray-400 italic">No voice input yet</p>
              )}
            </div>
          </div>

          {/* Save Status */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">Save Status</h3>
            <div className="bg-gray-700 px-4 py-3 rounded">
              <SaveStatusIndicator status={saveStatus} />
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="w-full px-4 py-3 bg-red-600 rounded hover:bg-red-700 transition-colors font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
};
