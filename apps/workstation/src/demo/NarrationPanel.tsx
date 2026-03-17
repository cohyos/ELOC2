import React from 'react';
import { useDemoStore } from '../stores/demo-store';
import { TOUR_STEPS } from './guided-tour-steps';

export function NarrationPanel() {
  const { active, showNarrationPanel, narrativeMode, tourStep, totalSteps, nextStep, prevStep } =
    useDemoStore();

  if (!active || !showNarrationPanel) return null;

  const showGuided = narrativeMode === 'guided' || narrativeMode === 'guided_interactive';
  if (!showGuided) return null;

  const currentStepDef = TOUR_STEPS[tourStep - 1];
  // Show accumulated steps up to current
  const visibleSteps = TOUR_STEPS.slice(0, tourStep);

  return (
    <div
      style={{
        position: 'fixed',
        top: '40px',
        right: 0,
        width: '300px',
        height: 'calc(100vh - 40px)',
        background: 'rgba(20, 20, 37, 0.92)',
        borderLeft: '1px solid #2a2a3e',
        zIndex: 8000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'transform 0.3s ease',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #2a2a3e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Narration</span>
        <span style={{ fontSize: '11px', color: '#4a9eff', fontWeight: 600 }}>
          {tourStep}/{totalSteps}
        </span>
      </div>

      {/* Scrollable step list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {visibleSteps.map((step, idx) => {
          const isCurrent = idx === tourStep - 1;
          return (
            <div
              key={step.id}
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                borderRadius: '6px',
                background: isCurrent ? '#1a1a3a' : 'transparent',
                border: isCurrent ? '1px solid #4a9eff44' : '1px solid transparent',
                opacity: isCurrent ? 1 : 0.5,
                transition: 'opacity 0.3s, background 0.3s',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isCurrent ? '#4a9eff' : '#666',
                  marginBottom: '4px',
                }}
              >
                Step {step.id}: {step.title}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: isCurrent ? '#ccc' : '#777',
                  lineHeight: 1.5,
                  marginBottom: '6px',
                }}
              >
                {step.narration}
              </div>
              {isCurrent && (
                <div
                  style={{
                    fontSize: '11px',
                    color: '#ffcc00',
                    fontStyle: 'italic',
                    borderTop: '1px solid #333',
                    paddingTop: '6px',
                    marginTop: '4px',
                  }}
                >
                  Why it matters: {step.whyItMatters}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation buttons */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid #2a2a3e',
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <button
          onClick={prevStep}
          disabled={tourStep <= 1}
          style={{
            background: '#333',
            color: tourStep <= 1 ? '#555' : '#aaa',
            border: '1px solid #555',
            padding: '4px 14px',
            borderRadius: '3px',
            cursor: tourStep <= 1 ? 'default' : 'pointer',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          &lt; Prev
        </button>
        <button
          onClick={nextStep}
          disabled={tourStep >= totalSteps}
          style={{
            background: tourStep >= totalSteps ? '#333' : '#4a9eff',
            color: tourStep >= totalSteps ? '#555' : '#fff',
            border: 'none',
            padding: '4px 14px',
            borderRadius: '3px',
            cursor: tourStep >= totalSteps ? 'default' : 'pointer',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          Next &gt;
        </button>
      </div>
    </div>
  );
}
