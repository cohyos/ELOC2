import React, { useCallback, useRef, useEffect, useState } from 'react';

export interface ResizeHandleProps {
  /** 'vertical' = divides left/right (col-resize), 'horizontal' = divides top/bottom (row-resize) */
  direction: 'vertical' | 'horizontal';
  /** Called continuously during drag with the proposed new size in px */
  onResize: (sizePx: number) => void;
  /** Called on double-click to reset to default */
  onReset: () => void;
  /**
   * For vertical: the current width of the panel to the right.
   * For horizontal: the current height of the panel below.
   * Used to compute delta from mouse position.
   */
  currentSize: number;
  /** Grid area name for CSS grid placement */
  gridArea: string;
}

const HANDLE_THICKNESS = 4;

export function ResizeHandle({ direction, onResize, onReset, currentSize, gridArea }: ResizeHandleProps) {
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const isVertical = direction === 'vertical';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startPos.current = isVertical ? e.clientX : e.clientY;
    startSize.current = currentSize;
    setActive(true);

    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
  }, [currentSize, isVertical]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const currentPos = isVertical ? e.clientX : e.clientY;
      // For right panel (vertical): moving mouse left = panel gets bigger
      // For bottom panel (horizontal): moving mouse up = panel gets bigger
      const delta = startPos.current - currentPos;
      const newSize = startSize.current + delta;
      onResize(newSize);
    };

    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setActive(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isVertical, onResize]);

  const handleDoubleClick = useCallback(() => {
    onReset();
  }, [onReset]);

  const showHighlight = hovered || active;

  const style: React.CSSProperties = {
    gridArea,
    position: 'relative',
    cursor: isVertical ? 'col-resize' : 'row-resize',
    zIndex: 5,
    // The handle itself is a thin strip
    ...(isVertical
      ? { width: `${HANDLE_THICKNESS}px`, minWidth: `${HANDLE_THICKNESS}px` }
      : { height: `${HANDLE_THICKNESS}px`, minHeight: `${HANDLE_THICKNESS}px` }),
    // Expand clickable area with padding (negative margin to compensate)
    ...(isVertical
      ? { padding: '0 3px', margin: '0 -3px' }
      : { padding: '3px 0', margin: '-3px 0' }),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // The visible indicator line
  const indicatorStyle: React.CSSProperties = {
    position: 'absolute',
    borderRadius: '2px',
    transition: 'opacity 0.15s ease, background 0.15s ease',
    ...(isVertical
      ? {
          width: '2px',
          top: '0',
          bottom: '0',
          left: '50%',
          transform: 'translateX(-50%)',
          background: showHighlight ? '#4a9eff' : '#2a2a3e',
          opacity: showHighlight ? 0.9 : 0.4,
        }
      : {
          height: '2px',
          left: '0',
          right: '0',
          top: '50%',
          transform: 'translateY(-50%)',
          background: showHighlight ? '#4a9eff' : '#2a2a3e',
          opacity: showHighlight ? 0.9 : 0.4,
        }),
  };

  // Grab dots indicator (shows on hover)
  const dotsStyle: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    gap: '3px',
    opacity: showHighlight ? 0.8 : 0,
    transition: 'opacity 0.15s ease',
    zIndex: 1,
    ...(isVertical
      ? {
          flexDirection: 'column',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }
      : {
          flexDirection: 'row',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }),
  };

  const dotStyle: React.CSSProperties = {
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    background: '#4a9eff',
  };

  return (
    <div
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div style={indicatorStyle} />
      <div style={dotsStyle}>
        <div style={dotStyle} />
        <div style={dotStyle} />
        <div style={dotStyle} />
      </div>
    </div>
  );
}
