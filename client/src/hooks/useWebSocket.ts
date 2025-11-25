import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { SketchResponse } from '../types/sketch';

export function useWebSocket() {
  const { session } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sketchCommands, setSketchCommands] = useState<SketchResponse | null>(null);
  const [, forceUpdate] = useState(0); // Force re-render counter
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    if (!session?.access_token) return;

    let isMounted = true;
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    const wsUrlWithToken = `${wsUrl}?token=${session.access_token}`;
    const ws = new WebSocket(wsUrlWithToken);

    ws.onopen = () => {
      if (!isMounted) return;
      console.log('WebSocket connected (mounted)');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      if (!isMounted) {
        console.log('Ignoring message from unmounted WebSocket');
        return;
      }

      // CRITICAL: Only process if this is the CURRENT WebSocket
      if (wsRef.current !== ws) {
        console.log('Ignoring message from OLD WebSocket (not current ref)');
        return;
      }

      const data = event.data;

      // Try to parse as JSON (sketch commands)
      try {
        const parsed = JSON.parse(data) as SketchResponse;
        if (parsed.actions && Array.isArray(parsed.actions)) {
          console.log('Received sketch commands (mounted):', parsed);
          setSketchCommands(parsed);
          forceUpdate(n => n + 1); // Force re-render
          console.log('setSketchCommands called + forced update');
          return;
        }
      } catch {
        // Not JSON, treat as transcript
      }

      // Plain text transcript - filter out server messages
      if (data && !data.startsWith('Connected to')) {
        console.log('Received transcript (mounted):', data);
        setTranscript(data);
        forceUpdate(n => n + 1); // Force re-render
        console.log('setTranscript called + forced update');
      }
    };

    ws.onerror = (error) => {
      if (!isMounted) return;
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    ws.onclose = (event) => {
      if (!isMounted) return;
      console.log('WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
    };

    wsRef.current = ws;

    return () => {
      console.log('Cleaning up WebSocket, marking as unmounted');
      isMounted = false;
      ws.close();
    };
  }, [session]);

  const startRecording = async () => {
    // Prevent multiple simultaneous recordings
    if (isRecordingRef.current || mediaRecorderRef.current) {
      console.log('Already recording, ignoring start request');
      return;
    }

    try {
      isRecordingRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Try to use Ogg Opus (Deepgram compatible), fallback to WebM
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        options = { mimeType: 'audio/ogg;codecs=opus' };
        console.log('Using audio/ogg;codecs=opus (Deepgram compatible)');
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
        console.log('Using audio/webm;codecs=opus (may not work with Deepgram)');
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
        console.log('Using audio/webm');
      } else {
        console.warn('No preferred MIME type supported, using default');
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      console.log('MediaRecorder created, MIME type:', mediaRecorder.mimeType);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('Audio chunk available, size:', event.data.size);
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
      };

      console.log('Starting MediaRecorder...');
      mediaRecorder.start(100); // Collect data every 100ms
      console.log('MediaRecorder started, state:', mediaRecorder.state);
    } catch (error) {
      console.error('Error starting recording:', error);
      isRecordingRef.current = false;
    }
  };

  const stopRecording = () => {
    console.log('stopRecording called');

    // Clear flag FIRST
    isRecordingRef.current = false;

    if (mediaRecorderRef.current) {
      console.log('MediaRecorder state:', mediaRecorderRef.current.state);

      if (mediaRecorderRef.current.state !== 'inactive') {
        const mimeType = mediaRecorderRef.current.mimeType;

        mediaRecorderRef.current.onstop = () => {
          console.log('MediaRecorder stopped, processing audio chunks');

          // Create blob from accumulated chunks
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          console.log('Created audio blob, size:', audioBlob.size, 'type:', audioBlob.type);

          // Send to server
          if (wsRef.current?.readyState === WebSocket.OPEN && audioBlob.size > 0) {
            console.log('Sending complete audio to server');
            wsRef.current.send(audioBlob);
          } else {
            console.error('Cannot send audio: WS not open or blob empty');
          }

          // Clear chunks
          audioChunksRef.current = [];
        };

        mediaRecorderRef.current.stop();

        // Stop all tracks
        const stream = mediaRecorderRef.current.stream;
        stream.getTracks().forEach(track => {
          console.log('Stopping track:', track.kind);
          track.stop();
        });
      }

      mediaRecorderRef.current = null;
    }
  };

  return {
    isConnected,
    transcript,
    sketchCommands,
    startRecording,
    stopRecording,
  };
}
