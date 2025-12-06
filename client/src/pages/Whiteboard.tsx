import { useEffect, useRef, useState, useCallback } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { useAuth } from '../contexts/AuthContext';
import { createGraphState, applyAction, layoutGraph, type GraphState } from '../lib/graphLayout';
import { renderLayout } from '../lib/tldrawShapes';
import { DiagramNodeUtil } from '../lib/DiagramNodeShape';
import { StatusBanner } from '../components/StatusBanner';
import { ToastContainer } from '../components/Toast';
import type { SketchResponse } from '../types/sketch';
import type { AppStatus, StatusMessage } from '../types/status';

// Register custom shape
const customShapeUtils = [DiagramNodeUtil];

export function Whiteboard() {
  const { signOut, session } = useAuth();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [finalTranscripts, setFinalTranscripts] = useState<string[]>([]);
  const [currentInterim, setCurrentInterim] = useState<string>('');
  const [sketchCommands, setSketchCommands] = useState<SketchResponse | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [appStatus, setAppStatus] = useState<AppStatus>('idle');
  const [toastMessages, setToastMessages] = useState<StatusMessage[]>([]);
  const graphStateRef = useRef<GraphState>(createGraphState());
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const hasConnectedRef = useRef(false);
  const statusTimeoutRef = useRef<number | null>(null);

  console.log('Whiteboard render - lastTranscript:', lastTranscript, 'sketchCommands:', sketchCommands);

  // Toast management
  const addToast = useCallback((type: StatusMessage['type'], message: string) => {
    const toast: StatusMessage = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: Date.now(),
    };
    setToastMessages((prev) => [...prev, toast]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToastMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Clear any existing status timeout
  const clearStatusTimeout = useCallback(() => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
  }, []);

  // Start timeout to reset status if no response
  const startStatusTimeout = useCallback(() => {
    clearStatusTimeout();
    statusTimeoutRef.current = window.setTimeout(() => {
      console.log('Status timeout - no response received');
      setAppStatus('idle');
      addToast('error', 'No response received - try speaking louder or check connection');
    }, 10000); // 10 second timeout
  }, [clearStatusTimeout, addToast]);

  // WebSocket connection
  useEffect(() => {
    if (!session?.access_token) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    const wsUrlWithToken = `${wsUrl}?token=${session.access_token}`;
    const ws = new WebSocket(wsUrlWithToken);

    ws.onopen = () => {
      console.log('WS: Connected');
      setIsWsConnected(true);
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        addToast('success', 'Connected to server');
      }
    };

    ws.onmessage = (event) => {
      const data = event.data;
      console.log('WS: Message received:', data);

      // Check for error messages from backend
      if (typeof data === 'string' && data.startsWith('ERROR:')) {
        const errorMsg = data.substring(7); // Remove "ERROR: " prefix
        console.error('WS: Error from server:', errorMsg);
        clearStatusTimeout();
        setAppStatus('idle');
        addToast('error', errorMsg);
        return;
      }

      // Try to parse as JSON (sketch commands)
      try {
        const parsed = JSON.parse(data) as SketchResponse;
        if (parsed.actions && Array.isArray(parsed.actions)) {
          console.log('WS: Setting sketch commands:', parsed);
          setAppStatus('rendering');
          setSketchCommands(parsed);
          return;
        }
      } catch {
        // Not JSON
      }

      // Plain text transcript (with INTERIM: or FINAL: prefix)
      if (data && !data.startsWith('Connected to')) {
        console.log('WS: Received transcript:', data);
        clearStatusTimeout(); // Got response, clear timeout

        // Parse prefix to determine if interim or final
        if (data.startsWith('INTERIM:')) {
          const interimText = data.substring(8); // Remove "INTERIM:" prefix
          setCurrentInterim(interimText);
          setLastTranscript(interimText);
        } else if (data.startsWith('FINAL:')) {
          const finalText = data.substring(6); // Remove "FINAL:" prefix
          setFinalTranscripts((prev) => [...prev, finalText]);
          setCurrentInterim(''); // Clear interim since we got a final
          setLastTranscript(finalText);
        } else {
          // Legacy format without prefix (for compatibility)
          setLastTranscript(data);
        }

        // Change status when not recording (no toast for transcripts - shown in header)
        if (!isRecording) {
          setAppStatus('generating');
        }
      }
    };

    ws.onerror = (error) => {
      console.error('WS: Error:', error);
      setIsWsConnected(false);
      // Only show error and update status if we've successfully connected before
      if (hasConnectedRef.current) {
        setAppStatus('error');
        addToast('error', 'Connection error occurred');
      } else {
        // During initial connection, keep status as idle
        console.log('WS: Error during initial connection, will retry...');
      }
    };

    ws.onclose = (event) => {
      console.log('WS: Closed:', event.code, event.reason);
      setIsWsConnected(false);
      // Only show error if we've connected before and it's not a normal close
      if (hasConnectedRef.current && event.code !== 1000 && event.code !== 1001) {
        addToast('error', 'Connection lost');
      }
    };

    wsRef.current = ws;

    return () => {
      console.log('WS: Cleaning up');
      ws.close();
      clearStatusTimeout();
    };
  }, [session, addToast, clearStatusTimeout]);

  // Recording functions
  const startRecording = useCallback(async () => {
    if (!wsRef.current || !isWsConnected) {
      console.error('WebSocket not connected');
      addToast('error', 'Not connected to server');
      return;
    }

    try {
      clearStatusTimeout(); // Clear any existing timeout
      setIsRecording(true);
      setAppStatus('transcribing');
      setFinalTranscripts([]); // Clear final transcripts for new recording
      setCurrentInterim(''); // Clear interim transcript

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      // Send audio chunks in real-time as they become available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('Sending audio chunk, size:', event.data.size);
          wsRef.current.send(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Send stop signal to backend
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('Sending STOP_RECORDING signal');
          wsRef.current.send('STOP_RECORDING');
          // Start timeout for response
          startStatusTimeout();
        } else {
          // Connection lost, reset status
          console.log('WebSocket not open when stopping');
          setAppStatus('idle');
          addToast('error', 'Connection lost');
        }
      };

      // Request audio data every 100ms for real-time streaming
      mediaRecorder.start(100);
      console.log('Recording started with 100ms chunks');
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
      setAppStatus('error');
      addToast('error', 'Failed to start recording');
    }
  }, [isWsConnected, addToast, clearStatusTimeout, startStatusTimeout]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    console.log('Recording stopped');
  };

  // Recording toggle handler
  const handleRecordingToggle = async () => {
    if (!isWsConnected) return;

    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  // Handle sketch commands and render
  useEffect(() => {
    console.log('Sketch commands effect running, commands:', sketchCommands, 'editor:', editor);
    if (!sketchCommands || !editor) {
      console.log('Skipping - missing sketchCommands or editor');
      return;
    }

    console.log('Processing sketch commands:', sketchCommands);

    // Check for empty actions
    if (sketchCommands.actions.length === 0) {
      console.log('No actions to perform');
      clearStatusTimeout();
      setAppStatus('idle');
      addToast('info', 'No matching items found - could not understand the command');
      return;
    }

    // Apply all actions to graph state
    const graphState = graphStateRef.current;
    for (const action of sketchCommands.actions) {
      const applied = applyAction(graphState, action);
      console.log(`Applied action ${action.action}:`, applied);
    }

    // Layout and render
    layoutGraph(graphState)
      .then((layout) => {
        console.log('Layout calculated:', layout);
        renderLayout(editor, layout.nodes, layout.edges);
        console.log('Render complete!');
        clearStatusTimeout(); // Clear timeout on success
        setAppStatus('idle');
        addToast('success', `Rendered ${layout.nodes.length} nodes and ${layout.edges.length} connections`);
      })
      .catch((error) => {
        console.error('Error layouting graph:', error);
        clearStatusTimeout(); // Clear timeout on error
        setAppStatus('error');
        addToast('error', 'Failed to render diagram');
      });
  }, [sketchCommands, editor, addToast, clearStatusTimeout]);

  return (
    <div className="h-screen w-screen flex flex-col">
      {/* Status banner - fixed position, doesn't affect layout */}
      <StatusBanner status={appStatus} />

      <header className="bg-gray-800 text-white p-4 flex justify-between items-center relative z-40">
        <h1 className="text-xl font-bold">VoiceBoard</h1>
        <div className="flex-1 mx-8">
          {(finalTranscripts.length > 0 || currentInterim || lastTranscript) && (
            <div className="bg-gray-700 px-4 py-2 rounded text-sm">
              <span className="text-gray-400">
                {isRecording ? 'Listening...' : 'You said:'}
              </span>{' '}
              {[...finalTranscripts, currentInterim].filter(Boolean).join(' ')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleRecordingToggle}
            disabled={!isWsConnected}
            className={`px-6 py-3 rounded-full font-medium transition-all ${
              isRecording
                ? 'bg-red-600 text-white scale-110 animate-pulse'
                : isWsConnected
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
          >
            {isRecording
              ? '🔴 Recording...'
              : isWsConnected
              ? '🎤 Start Recording'
              : '🎤 Connecting...'
            }
          </button>
          <button
            onClick={signOut}
            className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
      </header>
      <div className="flex-1 relative">
        <Tldraw
          onMount={setEditor}
          shapeUtils={customShapeUtils}
        />
      </div>

      {/* Toast notifications */}
      <ToastContainer messages={toastMessages} onDismiss={dismissToast} />
    </div>
  );
}
