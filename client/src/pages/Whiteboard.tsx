import { useEffect, useRef, useState, useCallback } from 'react';
import { Tldraw, type Editor, getSnapshot, type TLRecord } from 'tldraw';
import 'tldraw/tldraw.css';
import { useAuth } from '../contexts/AuthContext';
import { createGraphState, applyAction, layoutGraph, serializeGraphState, extractGraphFromSnapshot, type GraphState } from '../lib/graphLayout';
import { renderLayout } from '../lib/tldrawShapes';
import { DiagramNodeUtil } from '../lib/DiagramNodeShape';
import { StatusBanner } from '../components/StatusBanner';
import { ToastContainer } from '../components/Toast';
import { DiagramNodeToolbar } from '../components/DiagramNodeToolbar';
import { SaveStatusIndicator } from '../components/SaveStatusIndicator';
import { MobileMenu } from '../components/MobileMenu';
import type { SketchResponse } from '../types/sketch';
import type { AppStatus, StatusMessage } from '../types/status';

// Register custom shape
const customShapeUtils = [DiagramNodeUtil];

export function Whiteboard() {
  const { signOut, session } = useAuth();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [sketchCommands, setSketchCommands] = useState<SketchResponse | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [appStatus, setAppStatus] = useState<AppStatus>('idle');
  const [toastMessages, setToastMessages] = useState<StatusMessage[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const graphStateRef = useRef<GraphState>(createGraphState());
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const hasConnectedRef = useRef(false);
  const statusTimeoutRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const pendingSnapshotRef = useRef<string | null>(null);
  const hasLoadedInitialSnapshotRef = useRef(false);

  const tldrawLicenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY || undefined;
  if (!tldrawLicenseKey) {
    console.warn('Tldraw license key is not set. Please set VITE_TLDRAW_LICENSE_KEY in your environment variables.');
  } else {
    console.log('Tldraw license key loaded. Key:', tldrawLicenseKey.substring(0, 10) + '...' );
  }

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
    }, 20000); // 20 second timeout (Deepgram can be slow, 10-15s normal)
  }, [clearStatusTimeout, addToast]);

  // Process pending snapshot when editor becomes ready
  useEffect(() => {
    if (!editor || !pendingSnapshotRef.current) return;

    console.log('Editor ready, processing pending snapshot');
    const snapshotData = pendingSnapshotRef.current;
    pendingSnapshotRef.current = null;

    try {
      const parsed = JSON.parse(snapshotData);
      const records = Object.values(parsed.store) as TLRecord[];

      editor.store.mergeRemoteChanges(() => {
        const allRecords = editor.store.allRecords();
        const documentRecords = allRecords.filter(r =>
          r.typeName === 'shape' ||
          r.typeName === 'page' ||
          r.typeName === 'binding' ||
          r.typeName === 'asset'
        );
        editor.store.remove(documentRecords.map(r => r.id));
        editor.store.put(records);
      });

      const extractedGraph = extractGraphFromSnapshot(parsed);
      graphStateRef.current = extractedGraph;
      console.log('Updated graphStateRef from pending:', extractedGraph.nodes.size, 'nodes,', extractedGraph.edges.size, 'edges');

      setTimeout(() => {
        editor.zoomToFit({ animation: { duration: 300 } });
        if (!hasLoadedInitialSnapshotRef.current) {
          addToast('success', 'Whiteboard loaded');
          hasLoadedInitialSnapshotRef.current = true;
        }
        setSaveStatus('saved');
      }, 100);

      console.log('Pending snapshot loaded successfully');
    } catch (e) {
      console.error('Failed to load pending snapshot:', e);
      setTimeout(() => {
        addToast('error', 'Failed to load whiteboard');
      }, 0);
    }
  }, [editor, addToast]);

  // WebSocket connection
  useEffect(() => {
    if (!session?.access_token) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    const wsUrlWithToken = `${wsUrl}?token=${session.access_token}`;
    const ws = new WebSocket(wsUrlWithToken);

    ws.onopen = () => {
      console.log('WS: Connected');
      setIsWsConnected(true);
      setAppStatus('idle'); // Reset any error status
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        addToast('success', 'Connected to server');
      }

      // Don't sync on connect - server will send saved state if it exists
    };

    ws.onmessage = (event) => {
      const data = event.data;
      console.log('WS: Message received (type):', typeof data, data.substring ? data.substring(0, 100) : data);

      // Check for error messages from backend
      if (typeof data === 'string' && data.startsWith('ERROR:')) {
        const errorMsg = data.substring(7); // Remove "ERROR: " prefix
        console.error('WS: Error from server:', errorMsg);
        clearStatusTimeout();
        setAppStatus('idle');

        // Check if it's a save error
        if (errorMsg.includes('save') || errorMsg.includes('whiteboard')) {
          setSaveStatus('error');
          addToast('error', 'Failed to save - retrying...');
        } else {
          addToast('error', errorMsg);
        }
        return;
      }

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(data);

        // Check if it's a tldraw snapshot (initial load from server) - check this FIRST
        if (parsed.store) {
          console.log('WS: Received whiteboard snapshot');
          if (!editor) {
            console.log('Editor not ready yet, queueing snapshot');
            pendingSnapshotRef.current = data;
            return;
          }

          try {
            // Load snapshot by replacing document records while keeping instance state
            const records = Object.values(parsed.store) as TLRecord[];
            editor.store.mergeRemoteChanges(() => {
              // Remove only document records (shapes, pages, bindings, assets)
              // Keep instance, camera, and other session state
              const allRecords = editor.store.allRecords();
              const documentRecords = allRecords.filter(r =>
                r.typeName === 'shape' ||
                r.typeName === 'page' ||
                r.typeName === 'binding' ||
                r.typeName === 'asset'
              );
              editor.store.remove(documentRecords.map(r => r.id));

              // Add the new records from snapshot
              editor.store.put(records);
            });

            // IMPORTANT: Extract graph state from snapshot and update ref
            const extractedGraph = extractGraphFromSnapshot(parsed);
            graphStateRef.current = extractedGraph;
            console.log('Updated graphStateRef:', extractedGraph.nodes.size, 'nodes,', extractedGraph.edges.size, 'edges');

            // Auto-zoom to fit content (same as after voice commands)
            setTimeout(() => {
              editor.zoomToFit({ animation: { duration: 300 } });
            }, 100);

            if (!hasLoadedInitialSnapshotRef.current) {
              addToast('success', 'Whiteboard loaded');
              hasLoadedInitialSnapshotRef.current = true;
            }
            setSaveStatus('saved');
            console.log('Snapshot loaded successfully');
          } catch (e) {
            console.error('Failed to load snapshot:', e);
            addToast('error', 'Failed to load whiteboard');
          }
          return;
        }

        // Check if it's sketch commands
        if (parsed.actions && Array.isArray(parsed.actions)) {
          console.log('WS: Received sketch commands');
          setAppStatus('rendering');
          setSketchCommands(parsed);
          return;
        }

        // Unknown JSON structure
        console.warn('Unknown JSON message:', parsed);
        return;
      } catch {
        // Not JSON, might be plain text
      }

      // Plain text transcript (only if not a JSON message)
      if (data && typeof data === 'string' && !data.startsWith('Connected to') && !data.startsWith('{')) {
        console.log('WS: Setting transcript:', data);
        clearStatusTimeout(); // Got response, clear timeout
        setLastTranscript(data);
        setAppStatus('generating');
        addToast('info', `Heard: "${data.substring(0, 50)}${data.length > 50 ? '...' : ''}"`);
      }
    };

    ws.onerror = (error) => {
      console.error('WS: Error:', error);
      // Only handle errors for the current WebSocket instance
      if (wsRef.current !== ws) {
        console.log('Error from old WebSocket instance, ignoring');
        return;
      }
      setIsWsConnected(false);
      // Only show error if we've successfully connected before
      if (hasConnectedRef.current) {
        setAppStatus('error');
        addToast('error', 'Connection error occurred');
      } else {
        console.log('WS: Error during initial connection, will retry...');
      }
    };

    ws.onclose = (event) => {
      console.log('WS: Closed:', event.code, event.reason);
      // Only handle close for the current WebSocket instance
      if (wsRef.current !== ws) {
        console.log('Close from old WebSocket instance, ignoring');
        return;
      }
      setIsWsConnected(false);
      // Only show error if we've connected before and it's not a normal close
      if (hasConnectedRef.current && event.code !== 1000 && event.code !== 1001) {
        setAppStatus('error');
        addToast('error', 'Connection lost');
      }
    };

    wsRef.current = ws;

    return () => {
      console.log('WS: Cleaning up');
      ws.close();
      clearStatusTimeout();
    };
  }, [session, editor, addToast, clearStatusTimeout]);

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
      audioChunksRef.current = [];

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

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        console.log('Sending audio blob, size:', audioBlob.size);
        if (wsRef.current?.readyState === WebSocket.OPEN && audioBlob.size > 0) {
          // Send graph sync before audio
          const graphSync = serializeGraphState(graphStateRef.current);
          wsRef.current.send(JSON.stringify(graphSync));
          console.log('Sent graph sync:', graphSync.nodes.length, 'nodes,', graphSync.edges.length, 'edges');

          // Send audio
          wsRef.current.send(audioBlob);
          // Start timeout for response
          startStatusTimeout();
        } else {
          // No audio to send, reset status
          console.log('No audio to send');
          setAppStatus('idle');
          addToast('info', 'No audio captured - try speaking louder');
        }
        audioChunksRef.current = [];
      };

      mediaRecorder.start(100);
      console.log('Recording started');
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

  // Sync canvas to backend (called explicitly when saving)
  const syncCanvas = useCallback(() => {
    if (!editor || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('Cannot sync: editor or WebSocket not ready');
      return;
    }

    setSaveStatus('saving');

    // Get full canvas snapshot (document only, not session)
    const { document } = getSnapshot(editor.store);

    // Extract graph state from snapshot for AI context
    const graphState = extractGraphFromSnapshot(document);
    graphStateRef.current = graphState;

    // Send both snapshot and graph to backend
    const syncMessage = {
      type: 'canvas_sync',
      snapshot: JSON.stringify(document),
      graph: serializeGraphState(graphState),
    };

    wsRef.current.send(JSON.stringify(syncMessage));
    console.log(
      'Synced to backend:',
      graphState.nodes.size,
      'nodes,',
      graphState.edges.size,
      'edges'
    );

    // Assume save is successful (backend will send error if not)
    setSaveStatus('saved');
    hasUnsavedChangesRef.current = false;
  }, [editor]);

  // Auto-save with 3-second debounce after canvas changes
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      // Mark as having unsaved changes
      hasUnsavedChangesRef.current = true;
      setSaveStatus('unsaved');

      // Clear any existing auto-save timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set new auto-save timer (3 seconds)
      autoSaveTimerRef.current = window.setTimeout(() => {
        console.log('Auto-save triggered');
        syncCanvas();
      }, 3000);
    };

    // Listen to all document changes from user
    const dispose = editor.store.listen(handleChange, { scope: 'document', source: 'user' });

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      dispose();
    };
  }, [editor, syncCanvas]);

  // Manual save with Cmd/Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        console.log('Manual save triggered');
        syncCanvas();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [syncCanvas]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

    // Clean up orphaned edges (edges referencing non-existent nodes)
    const validNodeIds = new Set(graphState.nodes.keys());
    const orphanedEdges: string[] = [];
    for (const [edgeId, edge] of graphState.edges) {
      if (!validNodeIds.has(edge.sourceId) || !validNodeIds.has(edge.targetId)) {
        orphanedEdges.push(edgeId);
        console.log(`Removing orphaned edge ${edgeId}: ${edge.sourceId} -> ${edge.targetId}`);
      }
    }
    orphanedEdges.forEach((edgeId) => graphState.edges.delete(edgeId));

    // Layout and render (full auto-layout by ELK)
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

      <header className="bg-gray-800 text-white p-3 md:p-4 flex justify-between items-center relative z-40">
        <h1 className="text-lg md:text-xl font-bold">VoiceBoard</h1>

        {/* Transcript - hidden on mobile */}
        <div className="hidden md:flex flex-1 mx-8">
          <div className="bg-gray-700 px-4 py-2 rounded text-sm">
            {lastTranscript ? (
              <><span className="text-gray-400">You said:</span> {lastTranscript}</>
            ) : (
              <span className="text-gray-400 italic">
                Press record and say something like: "Create a React frontend, Node API server, Redis cache, and Postgres database, then connect them together"
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Save status - hidden on mobile */}
          <div className="hidden md:block">
            <SaveStatusIndicator status={saveStatus} />
          </div>

          {/* Record button - always visible */}
          <button
            onClick={handleRecordingToggle}
            disabled={!isWsConnected}
            className={`px-4 py-2 md:px-6 md:py-3 rounded-full font-medium transition-all text-sm md:text-base ${
              isRecording
                ? 'bg-red-600 text-white scale-110 animate-pulse'
                : isWsConnected
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
          >
            {/* Mobile: icon only, Desktop: icon + text */}
            <span className="md:hidden">{isRecording ? '🔴' : isWsConnected ? '🎤' : '🎤'}</span>
            <span className="hidden md:inline">
              {isRecording
                ? '🔴 Recording...'
                : isWsConnected
                ? '🎤 Start Recording'
                : '🎤 Connecting...'
              }
            </span>
          </button>

          {/* Sign out - hidden on mobile */}
          <button
            onClick={signOut}
            className="hidden md:block px-4 py-2 bg-red-600 rounded hover:bg-red-700"
          >
            Sign Out
          </button>

          {/* Mobile menu button - visible only on mobile */}
          <button
            onClick={() => setShowMobileMenu(true)}
            className="md:hidden px-3 py-2 text-white text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            ⋮
          </button>
        </div>
      </header>
      <div className="flex-1 relative">
        <Tldraw
          onMount={setEditor}
          shapeUtils={customShapeUtils}
          licenseKey={tldrawLicenseKey}
        />
        {/* Diagram node toolbar - shown when a node is selected */}
        {editor && <DiagramNodeToolbar editor={editor} />}
      </div>

      {/* Toast notifications */}
      <ToastContainer
        messages={toastMessages}
        onDismiss={dismissToast}
        hasBottomSheet={editor ? editor.getSelectedShapes().some((s) => s.type === 'diagram-node') : false}
      />

      {/* Mobile menu */}
      <MobileMenu
        isOpen={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        lastTranscript={lastTranscript}
        saveStatus={saveStatus}
        onSignOut={signOut}
      />
    </div>
  );
}
