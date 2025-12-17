import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  type TLBaseShape,
  type TLDefaultColorStyle,
  type TLResizeInfo,
} from 'tldraw';
import { useEffect, useRef, useState } from 'react';
import type { NodeType } from '../types/sketch';

// Icon SVG library
const ICONS: Record<NodeType, string> = {
  // Semantic types
  database: `<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/><path d="M3 11v6c0 1.657 4.03 3 9 3s9-1.343 9-3v-6"/></svg>`,
  server: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg>`,
  client: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  storage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  network: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>`,
  // Shape-based types
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
  diamond: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>`,
  hexagon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
  person: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  process: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>`,
  data: `<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/></svg>`,
  frame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 6H3M21 12H8M11 18H3"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>`,
};

// Semantic color groupings
const NODE_COLORS: Record<NodeType, TLDefaultColorStyle> = {
  // Semantic types - Infrastructure (Blue family)
  server: 'blue',
  client: 'light-blue',
  network: 'light-violet',
  // Semantic types - Data (Green family)
  database: 'green',
  storage: 'light-green',
  data: 'light-green',
  // Shape-based - Infrastructure
  cloud: 'light-blue',
  box: 'blue',
  // People - Purple family
  person: 'violet',
  // Processes - Orange family
  process: 'orange',
  hexagon: 'light-red',
  // Decisions - Yellow family
  diamond: 'yellow',
  // Text and notes
  text: 'grey',
  note: 'yellow',
  // Generic
  circle: 'grey',
  frame: 'grey',
};

// Map TLDefaultColorStyle to hex colors
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

function getColorHex(colorStyle: TLDefaultColorStyle): string {
  return COLOR_HEX_MAP[colorStyle] || COLOR_HEX_MAP.grey;
}

// Shape type definition
export type DiagramNodeShape = TLBaseShape<
  'diagram-node',
  {
    w: number;
    h: number;
    color: TLDefaultColorStyle;
    nodeType: NodeType;
    label: string;
    description: string;
  }
>;

// Shape util class
export class DiagramNodeUtil extends BaseBoxShapeUtil<DiagramNodeShape> {
  static override type = 'diagram-node' as const;

  getDefaultProps(): DiagramNodeShape['props'] {
    return {
      w: 200,
      h: 120,
      color: 'grey',
      nodeType: 'box',
      label: 'Node',
      description: '',
    };
  }

  getGeometry(shape: DiagramNodeShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override canEdit() {
    return true;
  }

  override isAspectRatioLocked() {
    return false;
  }

  override onDoubleClick = (shape: DiagramNodeShape) => {
    this.editor.setEditingShape(shape.id);
  };

  component(shape: DiagramNodeShape) {
    const { w, h, color, nodeType, label, description } = shape.props;
    const icon = ICONS[nodeType] || ICONS.circle;
    const effectiveColor = color || NODE_COLORS[nodeType] || 'grey';
    const bgColor = getColorHex(effectiveColor);

    const isEditing = this.editor.getEditingShapeId() === shape.id;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [editingLabel, setEditingLabel] = useState(label);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [editingDescription, setEditingDescription] = useState(description);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const labelInputRef = useRef<HTMLInputElement>(null);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const descriptionInputRef = useRef<HTMLInputElement>(null);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const wasEditingRef = useRef(false);

    // Focus label input and sync state when entering edit mode
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const wasEditing = wasEditingRef.current;
      wasEditingRef.current = isEditing;

      // Sync state when entering edit mode (including first render if already editing)
      if (isEditing && !wasEditing) {
        setEditingLabel(label);
        setEditingDescription(description);

        if (labelInputRef.current) {
          labelInputRef.current.focus();
          labelInputRef.current.select();
        }
      }
    }, [isEditing, label, description]);

    const saveChanges = () => {
      this.editor.updateShape({
        id: shape.id,
        type: 'diagram-node',
        props: {
          label: editingLabel || 'Node',
          description: editingDescription,
        },
      });
      this.editor.setEditingShape(null);
    };

    const handleBlur = (e: React.FocusEvent) => {
      // Check if focus is moving to the other input field
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (
        relatedTarget === labelInputRef.current ||
        relatedTarget === descriptionInputRef.current
      ) {
        // Focus is moving between our inputs, don't exit edit mode
        return;
      }
      // Focus is leaving the shape entirely, save and exit
      saveChanges();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveChanges();
      } else if (e.key === 'Escape') {
        setEditingLabel(label);
        setEditingDescription(description);
        this.editor.setEditingShape(null);
      }
    };

    return (
      <HTMLContainer
        id={shape.id}
        onPointerDown={isEditing ? this.editor.markEventAsHandled : undefined}
        style={{
          width: w,
          height: h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bgColor,
          border: `2px solid var(--color-${effectiveColor}-text)`,
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          pointerEvents: isEditing ? 'all' : 'none',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '32px',
            height: '32px',
            marginBottom: '8px',
            color: `var(--color-${effectiveColor}-text)`,
          }}
          dangerouslySetInnerHTML={{ __html: icon }}
        />

        {/* Label */}
        {isEditing ? (
          <input
            ref={labelInputRef}
            type="text"
            value={editingLabel}
            onChange={(e) => setEditingLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: `var(--color-${effectiveColor}-text)`,
              textAlign: 'center',
              marginBottom: '4px',
              lineHeight: '1.2',
              maxWidth: '100%',
              width: '90%',
              background: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid var(--color-text)',
              borderRadius: '4px',
              padding: '4px',
            }}
            placeholder="Label"
          />
        ) : (
          <div
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: `var(--color-${effectiveColor}-text)`,
              textAlign: 'center',
              marginBottom: description ? '4px' : '0',
              lineHeight: '1.2',
              wordBreak: 'break-word',
              maxWidth: '100%',
            }}
          >
            {label}
          </div>
        )}

        {/* Description */}
        {isEditing ? (
          <input
            ref={descriptionInputRef}
            type="text"
            value={editingDescription}
            onChange={(e) => setEditingDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            style={{
              fontSize: '11px',
              color: `var(--color-${effectiveColor}-text)`,
              textAlign: 'center',
              lineHeight: '1.3',
              maxWidth: '100%',
              width: '90%',
              background: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid var(--color-text)',
              borderRadius: '4px',
              padding: '4px',
            }}
            placeholder="Description (optional)"
          />
        ) : (
          description && (
            <div
              style={{
                fontSize: '11px',
                color: `var(--color-${effectiveColor}-text)`,
                opacity: 0.8,
                textAlign: 'center',
                lineHeight: '1.3',
                wordBreak: 'break-word',
                maxWidth: '100%',
              }}
            >
              {description}
            </div>
          )
        )}
      </HTMLContainer>
    );
  }

  indicator(shape: DiagramNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }

  override onResize = (_shape: DiagramNodeShape, info: TLResizeInfo<DiagramNodeShape>) => {
    return {
      props: {
        w: Math.max(100, info.initialBounds.width * info.scaleX),
        h: Math.max(80, info.initialBounds.height * info.scaleY),
      },
    };
  };
}

// Helper function to get color for node type
export function getNodeColor(nodeType: NodeType): TLDefaultColorStyle {
  return NODE_COLORS[nodeType] || 'grey';
}
