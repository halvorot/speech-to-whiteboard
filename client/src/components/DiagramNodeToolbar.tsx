import { useEffect, useState } from 'react';
import { type Editor, type TLDefaultColorStyle } from 'tldraw';
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
  const [selectedNode, setSelectedNode] = useState<DiagramNodeShape | null>(null);

  // Subscribe to selection changes
  useEffect(() => {
    const updateSelection = () => {
      const selectedShapes = editor.getSelectedShapes();
      const diagramNodes = selectedShapes.filter((s) => s.type === 'diagram-node') as DiagramNodeShape[];

      // Only show toolbar if exactly one diagram node is selected
      if (diagramNodes.length === 1) {
        setSelectedNode(diagramNodes[0]);
      } else {
        setSelectedNode(null);
      }
    };

    // Initial update
    updateSelection();

    // Listen to selection changes
    const dispose = editor.store.listen(() => {
      updateSelection();
    }, { scope: 'session' });

    return () => {
      dispose();
    };
  }, [editor]);

  // Don't render if no node selected
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

  // Reusable select component
  const TypeSelector = ({ className = '' }: { className?: string }) => (
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
          <TypeSelector className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
        isOpen={!!selectedNode}
        onClose={() => editor.setSelectedShapes([])}
      >
        <div className="p-4 space-y-4">
          {/* Type selector - full width on mobile */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Type / Icon</label>
            <TypeSelector className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Color picker - larger touch targets */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Color</label>
            <div className="grid grid-cols-6 gap-2">
              {ALL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorChange(c)}
                  className={`w-10 h-10 rounded-lg border-2 ${
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
