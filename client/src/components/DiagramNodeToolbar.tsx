import { useEffect, useState, useRef } from 'react';
import { type Editor, type TLDefaultColorStyle, type TLShapeId } from 'tldraw';
import type { NodeType } from '../types/sketch';
import type { DiagramNodeShape } from '../lib/DiagramNodeShape';
import { MobileBottomSheet } from './MobileBottomSheet';

const ALL_NODE_TYPES: { type: NodeType; label: string; category: string }[] = [
  // Semantic types
  { type: 'database', label: 'Database', category: 'Data' },
  { type: 'server', label: 'Server', category: 'Infrastructure' },
  { type: 'client', label: 'Client', category: 'Infrastructure' },
  { type: 'storage', label: 'Storage', category: 'Data' },
  { type: 'network', label: 'Network', category: 'Infrastructure' },
  // Shape-based types
  { type: 'box', label: 'Box', category: 'Shapes' },
  { type: 'circle', label: 'Circle', category: 'Shapes' },
  { type: 'cloud', label: 'Cloud', category: 'Shapes' },
  { type: 'diamond', label: 'Diamond', category: 'Shapes' },
  { type: 'hexagon', label: 'Hexagon', category: 'Shapes' },
  { type: 'person', label: 'Person', category: 'Other' },
  { type: 'process', label: 'Process', category: 'Other' },
  { type: 'data', label: 'Data', category: 'Data' },
  { type: 'frame', label: 'Frame', category: 'Containers' },
  { type: 'text', label: 'Text', category: 'Annotation' },
  { type: 'note', label: 'Note', category: 'Annotation' },
];

const ALL_COLORS: TLDefaultColorStyle[] = [
  'black',
  'grey',
  'light-violet',
  'violet',
  'blue',
  'light-blue',
  'yellow',
  'orange',
  'green',
  'light-green',
  'light-red',
  'red',
];

// Map TLDefaultColorStyle to hex colors for display
const COLOR_HEX_MAP: Record<TLDefaultColorStyle, string> = {
  black: '#1d1d1d',
  grey: '#d1d5db',
  'light-violet': '#ddd6fe',
  violet: '#a78bfa',
  blue: '#60a5fa',
  'light-blue': '#7dd3fc',
  yellow: '#facc15',
  orange: '#fb923c',
  green: '#4ade80',
  'light-green': '#86efac',
  'light-red': '#fca5a5',
  red: '#f87171',
  white: '#ffffff',
};

interface DiagramNodeToolbarProps {
  editor: Editor;
}

export const DiagramNodeToolbar = ({ editor }: DiagramNodeToolbarProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<TLShapeId | null>(null);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [, forceUpdate] = useState({});
  const selectionTimeoutRef = useRef<number | null>(null);
  const wasDraggedRef = useRef(false);

  // Subscribe to selection changes and shape updates
  useEffect(() => {
    let initialPosition: { x: number; y: number } | null = null;

    const updateSelection = () => {
      const selectedShapes = editor.getSelectedShapes();
      const diagramNodes = selectedShapes.filter((s) => s.type === 'diagram-node') as DiagramNodeShape[];

      // Clear any pending timeout
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
        selectionTimeoutRef.current = null;
      }

      // Only show toolbar if exactly one diagram node is selected
      if (diagramNodes.length === 1) {
        const nodeId = diagramNodes[0].id;
        const node = diagramNodes[0];
        setSelectedNodeId(nodeId);

        // Store initial position and reset drag flag for new selection
        initialPosition = { x: node.x, y: node.y };
        wasDraggedRef.current = false;

        // On mobile, delay showing the bottom sheet to avoid showing during drag/edit
        selectionTimeoutRef.current = window.setTimeout(() => {
          // Don't show if shape was dragged or if user is editing text
          const isEditing = editor.getEditingShapeId() === nodeId;
          if (!wasDraggedRef.current && !isEditing) {
            setShowMobileSheet(true);
          }
        }, 200); // 200ms delay
      } else {
        setSelectedNodeId(null);
        setShowMobileSheet(false);
        initialPosition = null;
        wasDraggedRef.current = false;
      }
    };

    const checkForDragOrEdit = () => {
      // Check if the selected shape moved (was dragged)
      if (selectedNodeId && initialPosition) {
        const shape = editor.getShape(selectedNodeId) as DiagramNodeShape | undefined;
        if (shape) {
          const moved = Math.abs(shape.x - initialPosition.x) > 2 ||
                       Math.abs(shape.y - initialPosition.y) > 2;
          if (moved) {
            // Mark as dragged - this prevents bottom sheet from showing
            wasDraggedRef.current = true;
            // Cancel pending timeout
            if (selectionTimeoutRef.current) {
              clearTimeout(selectionTimeoutRef.current);
              selectionTimeoutRef.current = null;
            }
            // Hide bottom sheet if it's showing
            setShowMobileSheet(false);
          }
        }
      }

      // Check if user is editing text - hide bottom sheet if so
      if (selectedNodeId && editor.getEditingShapeId() === selectedNodeId) {
        setShowMobileSheet(false);
        // Cancel pending timeout
        if (selectionTimeoutRef.current) {
          clearTimeout(selectionTimeoutRef.current);
          selectionTimeoutRef.current = null;
        }
      }

      // Also force re-render when shapes change (this updates picker displays)
      forceUpdate({});
    };

    // Initial update
    updateSelection();

    // Listen to both selection changes (session) and shape updates (document)
    const disposeSession = editor.store.listen(() => {
      updateSelection();
    }, { scope: 'session' });

    const disposeDocument = editor.store.listen(() => {
      checkForDragOrEdit();
    }, { scope: 'document' });

    return () => {
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
      disposeSession();
      disposeDocument();
    };
  }, [editor, selectedNodeId]);

  // Don't render if no node selected
  if (!selectedNodeId) {
    return null;
  }

  // Get current shape from editor (this ensures we always have latest props)
  const selectedNode = editor.getShape(selectedNodeId) as DiagramNodeShape | undefined;
  if (!selectedNode) {
    return null;
  }

  const { nodeType, color } = selectedNode.props;

  const handleTypeChange = (newType: NodeType) => {
    editor.updateShape({
      id: selectedNode.id,
      type: 'diagram-node',
      props: {
        nodeType: newType,
      },
    });
  };

  const handleColorChange = (newColor: TLDefaultColorStyle) => {
    editor.updateShape({
      id: selectedNode.id,
      type: 'diagram-node',
      props: {
        color: newColor,
      },
    });
  };

  const renderTypeSelector = (className: string) => (
    <select
      value={nodeType}
      onChange={(e) => handleTypeChange(e.target.value as NodeType)}
      className={className}
    >
      <optgroup label="Data">
        {ALL_NODE_TYPES.filter((t) => t.category === 'Data').map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Infrastructure">
        {ALL_NODE_TYPES.filter((t) => t.category === 'Infrastructure').map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Shapes">
        {ALL_NODE_TYPES.filter((t) => t.category === 'Shapes').map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Other">
        {ALL_NODE_TYPES.filter((t) => t.category === 'Other').map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Containers">
        {ALL_NODE_TYPES.filter((t) => t.category === 'Containers').map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Annotation">
        {ALL_NODE_TYPES.filter((t) => t.category === 'Annotation').map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </optgroup>
    </select>
  );

  return (
    <>
      {/* Desktop toolbar - hidden on mobile */}
      <div className="hidden md:block absolute top-16 left-4 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-3 flex gap-4">
        {/* Type selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Type / Icon</label>
          {renderTypeSelector("px-3 py-1.5 text-sm border border-gray-300 rounded bg-white hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500")}
        </div>

        {/* Color picker */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Color</label>
          <div className="flex gap-1 flex-wrap max-w-[200px]">
            {ALL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => handleColorChange(c)}
                className={`w-6 h-6 rounded border-2 ${
                  color === c ? 'border-blue-600 scale-110' : 'border-gray-300'
                } transition-all hover:scale-110`}
                style={{ backgroundColor: COLOR_HEX_MAP[c] }}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile bottom sheet - visible only on mobile */}
      <MobileBottomSheet
        isOpen={showMobileSheet}
        onClose={() => {
          setShowMobileSheet(false);
          editor.setSelectedShapes([]);
        }}
      >
        <div className="p-4 space-y-4">
          {/* Type selector - full width on mobile */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Type / Icon</label>
            {renderTypeSelector("w-full px-4 py-3 text-base border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500")}
          </div>

          {/* Color picker - larger touch targets */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Color</label>
            <div className="grid grid-cols-6 gap-2">
              {ALL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorChange(c)}
                  className={`w-11 h-11 rounded-lg border-2 ${
                    color === c ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-300'
                  } transition-all active:scale-95`}
                  style={{ backgroundColor: COLOR_HEX_MAP[c] }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>
      </MobileBottomSheet>
    </>
  );
};
