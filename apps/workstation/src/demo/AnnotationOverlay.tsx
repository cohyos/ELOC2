import React, { useEffect, useState, useCallback } from 'react';
import { useDemoStore } from '../stores/demo-store';
import { TOUR_STEPS } from './guided-tour-steps';

// ---------------------------------------------------------------------------
// Progress dots bar at top
// ---------------------------------------------------------------------------

function ProgressBar() {
  const { tourStep, totalSteps, setStep } = useDemoStore();
  const currentStepDef = TOUR_STEPS[tourStep - 1];

  return (
    <div
      style={{
        position: 'fixed',
        top: '48px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(20, 20, 37, 0.92)',
        borderRadius: '8px',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: 8500,
        border: '1px solid #2a2a3e',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <span style={{ fontSize: '12px', color: '#4a9eff', fontWeight: 600, whiteSpace: 'nowrap' }}>
        Step {tourStep}/{totalSteps}: {currentStepDef?.title ?? ''}
      </span>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            onClick={() => setStep(i + 1)}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: i + 1 <= tourStep ? '#4a9eff' : '#333',
              border: i + 1 === tourStep ? '2px solid #6ab8ff' : '1px solid #555',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            title={`Step ${i + 1}: ${TOUR_STEPS[i]?.title ?? ''}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Callout bubble positioned near a target element
// ---------------------------------------------------------------------------

interface BubblePosition {
  top: number;
  left: number;
  arrowSide: 'top' | 'bottom' | 'left' | 'right';
}

function computeBubblePosition(selector: string | undefined): BubblePosition | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Position bubble below the element by default
  let top = rect.bottom + 12;
  let left = rect.left + rect.width / 2 - 150; // 150 = half bubble width
  let arrowSide: BubblePosition['arrowSide'] = 'top';

  // If too far down, put above
  if (top + 120 > vh) {
    top = rect.top - 132;
    arrowSide = 'bottom';
  }

  // Clamp to viewport
  left = Math.max(12, Math.min(left, vw - 312));
  top = Math.max(50, top);

  return { top, left, arrowSide };
}

function CalloutBubble({ step }: { step: number }) {
  const stepDef = TOUR_STEPS[step - 1];
  const [pos, setPos] = useState<BubblePosition | null>(null);

  const updatePos = useCallback(() => {
    setPos(computeBubblePosition(stepDef?.targetSelector));
  }, [stepDef?.targetSelector]);

  useEffect(() => {
    updatePos();
    window.addEventListener('resize', updatePos);
    const interval = setInterval(updatePos, 2000); // Re-calc periodically
    return () => {
      window.removeEventListener('resize', updatePos);
      clearInterval(interval);
    };
  }, [updatePos]);

  if (!stepDef || !stepDef.targetSelector || !pos) return null;

  const arrowStyle: React.CSSProperties =
    pos.arrowSide === 'top'
      ? {
          position: 'absolute',
          top: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderBottom: '8px solid #1a1a3a',
        }
      : {
          position: 'absolute',
          bottom: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid #1a1a3a',
        };

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: '300px',
        background: '#1a1a3a',
        border: '1px solid #4a9eff44',
        borderRadius: '6px',
        padding: '12px 14px',
        zIndex: 8400,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
      }}
    >
      <div style={arrowStyle} />
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#4a9eff', marginBottom: '4px' }}>
        {stepDef.title}
      </div>
      <div style={{ fontSize: '12px', color: '#ccc', lineHeight: 1.4 }}>
        {stepDef.narration}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight ring around target element
// ---------------------------------------------------------------------------

function HighlightRing({ selector }: { selector: string | undefined }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const update = useCallback(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [selector]);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    const interval = setInterval(update, 2000);
    return () => {
      window.removeEventListener('resize', update);
      clearInterval(interval);
    };
  }, [update]);

  if (!rect) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        borderRadius: '6px',
        border: '2px solid #4a9eff',
        boxShadow: '0 0 12px #4a9eff88, 0 0 24px #4a9eff44',
        animation: 'eloc2-highlight-pulse 2s ease-in-out infinite',
        pointerEvents: 'none',
        zIndex: 8300,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main overlay component
// ---------------------------------------------------------------------------

export function AnnotationOverlay() {
  const { active, showAnnotations, narrativeMode, tourStep } = useDemoStore();

  const showGuided = narrativeMode === 'guided' || narrativeMode === 'guided_interactive';

  if (!active || !showAnnotations || !showGuided) return null;

  const stepDef = TOUR_STEPS[tourStep - 1];

  return (
    <>
      {/* Inject pulsing keyframes */}
      <style>{`
        @keyframes eloc2-highlight-pulse {
          0%, 100% { box-shadow: 0 0 12px #4a9eff88, 0 0 24px #4a9eff44; }
          50% { box-shadow: 0 0 20px #4a9effcc, 0 0 40px #4a9eff66; }
        }
      `}</style>
      <ProgressBar />
      <HighlightRing selector={stepDef?.targetSelector} />
      <CalloutBubble step={tourStep} />
    </>
  );
}
