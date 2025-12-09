import { useEffect, useRef, useState, useCallback } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { useAuth } from '../contexts/AuthContext';
import { createGraphState, applyAction, layoutGraph, serializeGraphState, type GraphState } from '../lib/graphLayout';
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
  const [sketchCommands, setSketchCommands] = useState<SketchResponse | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [appStatus, setAppStatus] = useState<AppStatus>('idle');
  const [toastMessages, setToastMessages] = useState<StatusMessage[]>([]);
  const graphStateRef = useRef<GraphState>(createGraphState());
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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

      // Sync current graph state on connect/reconnect
      const graphSync = serializeGraphState(graphStateRef.current);
      ws.send(JSON.stringify(graphSync));
      console.log('Sent initial graph sync:', graphSync.nodes.length, 'nodes,', graphSync.edges.length, 'edges');
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

      // Plain text transcript
      if (data && !data.startsWith('Connected to')) {
        console.log('WS: Setting transcript:', data);
        clearStatusTimeout(); // Got response, clear timeout
        setLastTranscript(data);
        setAppStatus('generating');
        addToast('info', `Heard: "${data.substring(0, 50)}${data.length > 50 ? '...' : ''}"`);
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

  // Sync manual canvas edits back to graph state (structure only, not layout)
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      const graphState = graphStateRef.current;

      // Get all current shape/arrow IDs on canvas
      const allShapes = Array.from(editor.getCurrentPageShapeIds()).map((id) => editor.getShape(id)!);

      // 1. Sync node deletions
      const canvasNodeIds = new Set(
        allShapes
          .filter((s) => s.type === 'diagram-node' || s.type === 'text' || s.type === 'note')
          .map((s) => s.id.replace('shape:', ''))
      );

      const nodesToRemove: string[] = [];
      for (const [nodeId, node] of graphState.nodes) {
        // Skip frames - they're containers
        if (node.type === 'frame') continue;
        if (!canvasNodeIds.has(nodeId)) {
          nodesToRemove.push(nodeId);
        }
      }

      nodesToRemove.forEach((nodeId) => {
        console.log('Syncing deletion of node:', nodeId);
        graphState.nodes.delete(nodeId);
        // Remove connected edges
        for (const [edgeId, edge] of graphState.edges) {
          if (edge.sourceId === nodeId || edge.targetId === nodeId) {
            graphState.edges.delete(edgeId);
          }
        }
      });

      // 2. Sync edge deletions (manually deleted arrows)
      const canvasArrowIds = new Set(
        allShapes
          .filter((s) => s.type === 'arrow' && s.id.toString().startsWith('shape:arrow_'))
          .map((s) => s.id.replace('shape:arrow_', ''))
      );

      const edgesToRemove: string[] = [];
      for (const [edgeId] of graphState.edges) {
        if (!canvasArrowIds.has(edgeId)) {
          edgesToRemove.push(edgeId);
        }
      }

      edgesToRemove.forEach((edgeId) => {
        console.log('Syncing deletion of edge:', edgeId);
        graphState.edges.delete(edgeId);
      });

      // 3. Sync parent changes (nodes moved into/out of frames)
      // Check if any diagram-node's parent has changed in tldraw
      allShapes
        .filter((s) => s.type === 'diagram-node')
        .forEach((shape) => {
          const nodeId = shape.id.replace('shape:', '');
          const existingNode = graphState.nodes.get(nodeId);

          if (existingNode) {
            // Get the shape's current parent in tldraw
            const tldrawParent = shape.parentId;
            const tldrawParentNodeId = tldrawParent?.toString().replace('shape:', '');

            // Check if parent changed
            const currentParentId = existingNode.parentId;
            const newParentId = tldrawParentNodeId && graphState.nodes.get(tldrawParentNodeId)?.type === 'frame'
              ? tldrawParentNodeId
              : undefined;

            if (currentParentId !== newParentId) {
              console.log(`Syncing parent change for ${nodeId}: ${currentParentId} → ${newParentId}`);
              graphState.nodes.set(nodeId, {
                ...existingNode,
                parentId: newParentId,
              });
            }
          }
        });
    };

    // Listen to user-initiated changes
    const dispose = editor.store.listen(handleChange, { scope: 'document', source: 'user' });

    return () => {
      dispose();
    };
  }, [editor]);

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

      <header className="bg-gray-800 text-white p-4 flex justify-between items-center relative z-40">
        <h1 className="text-xl font-bold">VoiceBoard</h1>
        <div className="flex-1 mx-8">
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
