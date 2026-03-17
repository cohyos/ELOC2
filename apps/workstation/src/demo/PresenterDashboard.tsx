import React from 'react';
import { useDemoStore } from '../stores/demo-store';
import { TOUR_STEPS } from './guided-tour-steps';

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
  },
  panel: {
    width: '500px',
    maxHeight: '600px',
    background: '#141425',
    border: '1px solid #2a2a3e',
    borderRadius: '8px',
    color: '#e0e0e0',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid #2a2a3e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  },
  body: {
    padding: '16px 20px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '8px',
    marginTop: '16px',
  },
  radioGroup: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
    marginBottom: '4px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#ccc',
  },
  radio: {
    accentColor: '#4a9eff',
  },
  checkbox: {
    accentColor: '#4a9eff',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid #2a2a3e',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  btn: (primary: boolean): React.CSSProperties => ({
    background: primary ? '#4a9eff' : '#333',
    color: primary ? '#fff' : '#aaa',
    border: 'none',
    padding: '6px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  }),
  tourControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  tourBtn: {
    background: '#333',
    color: '#aaa',
    border: '1px solid #555',
    padding: '4px 12px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
  },
  stepIndicator: {
    fontSize: '12px',
    color: '#4a9eff',
    fontWeight: 600,
    flex: 1,
    textAlign: 'center' as const,
  },
};

interface PresenterDashboardProps {
  onClose: () => void;
}

export function PresenterDashboard({ onClose }: PresenterDashboardProps) {
  const {
    audience,
    narrativeMode,
    viewMode,
    showAnnotations,
    showNarrationPanel,
    tourStep,
    tourAutoAdvance,
    totalSteps,
    setAudience,
    setNarrativeMode,
    setViewMode,
    toggleAnnotations,
    toggleNarrationPanel,
    nextStep,
    prevStep,
    toggleAutoAdvance,
  } = useDemoStore();

  const currentStepDef = TOUR_STEPS[tourStep - 1];
  const showGuidedControls =
    narrativeMode === 'guided' || narrativeMode === 'guided_interactive';

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Presenter Dashboard</h3>
          <span style={{ fontSize: '11px', color: '#666' }}>Ctrl+D to toggle</span>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Audience */}
          <div style={{ ...styles.sectionTitle, marginTop: 0 }}>Audience</div>
          <div style={styles.radioGroup}>
            {(['military', 'technical', 'mixed'] as const).map((a) => (
              <label key={a} style={styles.radioLabel}>
                <input
                  type="radio"
                  name="audience"
                  value={a}
                  checked={audience === a}
                  onChange={() => setAudience(a)}
                  style={styles.radio}
                />
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </label>
            ))}
          </div>

          {/* Narrative Mode */}
          <div style={styles.sectionTitle}>Narrative Mode</div>
          <div style={styles.radioGroup}>
            {([
              { value: 'guided' as const, label: 'Guided Tour' },
              { value: 'interactive' as const, label: 'Interactive' },
              { value: 'guided_interactive' as const, label: 'Guided + Interactive' },
            ]).map((m) => (
              <label key={m.value} style={styles.radioLabel}>
                <input
                  type="radio"
                  name="narrativeMode"
                  value={m.value}
                  checked={narrativeMode === m.value}
                  onChange={() => setNarrativeMode(m.value)}
                  style={styles.radio}
                />
                {m.label}
              </label>
            ))}
          </div>

          {/* View Mode */}
          <div style={styles.sectionTitle}>View Mode</div>
          <div style={styles.radioGroup}>
            {([
              { value: 'full' as const, label: 'Full ELOC2' },
              { value: 'basic' as const, label: 'Basic Tracking' },
            ]).map((m) => (
              <label key={m.value} style={styles.radioLabel}>
                <input
                  type="radio"
                  name="viewMode"
                  value={m.value}
                  checked={viewMode === m.value}
                  onChange={() => setViewMode(m.value)}
                  style={styles.radio}
                />
                {m.label}
              </label>
            ))}
          </div>

          {/* Toggles */}
          <div style={styles.sectionTitle}>Overlays</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={styles.radioLabel}>
              <input
                type="checkbox"
                checked={showAnnotations}
                onChange={toggleAnnotations}
                style={styles.checkbox}
              />
              Show Annotations
            </label>
            <label style={styles.radioLabel}>
              <input
                type="checkbox"
                checked={showNarrationPanel}
                onChange={toggleNarrationPanel}
                style={styles.checkbox}
              />
              Show Narration Panel
            </label>
          </div>

          {/* Guided Tour Controls */}
          {showGuidedControls && (
            <>
              <div style={styles.sectionTitle}>Guided Tour Controls</div>
              <div style={styles.stepIndicator}>
                Step {tourStep}/{totalSteps}: {currentStepDef?.title ?? ''}
              </div>
              <div style={styles.tourControls}>
                <button
                  style={{ ...styles.tourBtn, opacity: tourStep <= 1 ? 0.4 : 1 }}
                  onClick={prevStep}
                  disabled={tourStep <= 1}
                >
                  &lt; Prev
                </button>
                <div style={{ flex: 1 }} />
                <button
                  style={{ ...styles.tourBtn, opacity: tourStep >= totalSteps ? 0.4 : 1 }}
                  onClick={nextStep}
                  disabled={tourStep >= totalSteps}
                >
                  Next &gt;
                </button>
              </div>
              <label style={{ ...styles.radioLabel, marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={tourAutoAdvance}
                  onChange={toggleAutoAdvance}
                  style={styles.checkbox}
                />
                Auto-advance
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.btn(false)} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
