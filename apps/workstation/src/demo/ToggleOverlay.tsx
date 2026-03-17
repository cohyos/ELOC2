import React from 'react';
import { useDemoStore } from '../stores/demo-store';

/**
 * Floating toggle that switches between "Full ELOC2" and "Basic Tracking" views.
 * Only rendered when demo mode is active.
 */
export function ToggleOverlay() {
  const active = useDemoStore((s) => s.active);
  const viewMode = useDemoStore((s) => s.viewMode);
  const toggleViewMode = useDemoStore((s) => s.toggleViewMode);

  if (!active) return null;

  const isFull = viewMode === 'full';

  return (
    <button
      onClick={toggleViewMode}
      title={isFull ? 'Switch to Basic Tracking view' : 'Switch to Full ELOC2 view'}
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '6px',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        fontWeight: 600,
        letterSpacing: '0.3px',
        color: '#fff',
        background: isFull ? '#2a6edb' : '#555',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        transition: 'background 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease',
        outline: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
      }}
    >
      {/* Mode indicator dot */}
      <span
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: isFull ? '#66bbff' : '#999',
          transition: 'background 0.3s ease',
          boxShadow: isFull ? '0 0 6px #66bbff' : 'none',
        }}
      />
      {isFull ? 'Full ELOC2' : 'Basic Tracking'}
    </button>
  );
}
