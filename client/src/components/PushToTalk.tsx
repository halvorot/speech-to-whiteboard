import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export function PushToTalk() {
  const { isConnected, startRecording, stopRecording } = useWebSocket();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<number | null>(null);

  const handleMouseDown = async () => {
    if (!isConnected) return;
    setIsRecording(true);
    setRecordingTime(0);
    await startRecording();

    // Start timer
    timerRef.current = window.setInterval(() => {
      setRecordingTime((t) => t + 0.1);
    }, 100);
  };

  const handleMouseUp = () => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopRecording();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      disabled={!isConnected}
      className={`px-6 py-3 rounded-full font-medium transition-all ${
        isRecording
          ? 'bg-red-600 text-white scale-110'
          : isConnected
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-gray-400 text-gray-200 cursor-not-allowed'
      }`}
    >
      {isRecording
        ? `🎤 Recording... ${recordingTime.toFixed(1)}s`
        : isConnected
        ? '🎤 Push to Talk'
        : '🎤 Connecting...'
      }
    </button>
  );
}
