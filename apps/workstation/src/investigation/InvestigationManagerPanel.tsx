import React, { useState, useEffect } from 'react';
import { useInvestigationStore } from '../stores/investigation-store';
import type { InvestigationParameters, InvestigationSummary } from '../stores/investigation-store';
import { useUiStore } from '../stores/ui-store';

// ---------------------------------------------------------------------------
// Styles (match TaskPanel dark theme)
// ---------------------------------------------------------------------------

const styles = {
  container: {
    padding: '12px',
    color: '#e0e0e0',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  } as React.CSSProperties,
  tabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '12px',
    borderBottom: '1px solid #2a2a3e',
  } as React.CSSProperties,
  tab: (active: boolean) => ({
    padding: '6px 14px',
    background: active ? '#1a1a2e' : 'transparent',
    color: active ? '#4a9eff' : '#888',
    border: 'none',
    borderBottom: active ? '2px solid #4a9eff' : '2px solid transparent',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
  } as React.CSSProperties),
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    borderBottom: '1px solid #333',
    paddingBottom: '3px',
  } as React.CSSProperties,
  card: {
    background: '#1a1a2e',
    border: '1px solid #2a2a3e',
    borderRadius: '4px',
    padding: '8px 10px',
    marginBottom: '8px',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 0',
    fontSize: '11px',
  } as React.CSSProperties,
  label: {
    color: '#888',
  } as React.CSSProperties,
  value: {
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '11px',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    background: color + '22',
    color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
  actionBtn: (color: string) => ({
    background: color + '22',
    color,
    border: `1px solid ${color}44`,
    padding: '3px 10px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
  } as React.CSSProperties),
  sliderRow: {
    marginBottom: '10px',
  } as React.CSSProperties,
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    marginBottom: '2px',
  } as React.CSSProperties,
  slider: {
    width: '100%',
    height: '4px',
    appearance: 'auto' as const,
    background: '#333',
    borderRadius: '2px',
    outline: 'none',
    cursor: 'pointer',
    accentColor: '#4a9eff',
  } as React.CSSProperties,
  emptyText: {
    color: '#555',
    fontSize: '11px',
    textAlign: 'center' as const,
    padding: '8px 0',
  } as React.CSSProperties,
};

const statusColors: Record<string, string> = {
  in_progress: '#4a9eff',
  split_detected: '#ff8800',
  confirmed: '#00cc44',
  bearing_only: '#888',
  candidate_3d: '#ffcc00',
  confirmed_3d: '#00cc44',
};

// ---------------------------------------------------------------------------
// Score bar component
// ---------------------------------------------------------------------------

function ScoreBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div style={{ marginBottom: '3px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
        <span style={{ color: '#777' }}>{label}</span>
        <span style={{ color: '#aaa', fontFamily: 'monospace' }}>{value.toFixed(2)}</span>
      </div>
      <div style={{ height: '4px', borderRadius: '2px', background: '#333', position: 'relative', overflow: 'hidden', marginTop: '2px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, borderRadius: '2px' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hypothesis bar chart
// ---------------------------------------------------------------------------

function HypothesisChart({ hypotheses }: { hypotheses: Array<{ label: string; probability: number }> }) {
  if (hypotheses.length === 0) return null;
  return (
    <div style={{ marginTop: '4px' }}>
      <div style={{ fontSize: '10px', color: '#666', fontWeight: 600, marginBottom: '2px' }}>HYPOTHESES</div>
      {hypotheses.map((h, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '9px', color: '#777', minWidth: '50px' }}>{h.label}</span>
          <div style={{ flex: 1, height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(h.probability * 100).toFixed(0)}%`, background: '#aa44ff', borderRadius: '3px' }} />
          </div>
          <span style={{ fontSize: '9px', color: '#aaa', fontFamily: 'monospace', minWidth: '28px', textAlign: 'right' }}>{(h.probability * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Investigation card
// ---------------------------------------------------------------------------

function InvestigationCard({ inv, dimmed, selected, onSelect }: { inv: InvestigationSummary; dimmed?: boolean; selected?: boolean; onSelect?: () => void }) {
  const selectTrack = useUiStore(s => s.selectTrack);

  return (
    <div
      style={{
        ...styles.card,
        opacity: dimmed ? 0.6 : 1,
        cursor: onSelect ? 'pointer' : 'default',
        border: selected ? '1px solid #4a9eff' : styles.card.border,
        boxShadow: selected ? '0 0 6px #4a9eff44' : 'none',
      }}
      onClick={onSelect}
    >
      <div style={styles.row}>
        <span style={styles.label}>Track</span>
        <span
          style={{ ...styles.value, color: '#4a9eff', cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); selectTrack(inv.trackId); }}
        >
          {inv.trackId.slice(0, 8)}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Status</span>
        <span style={styles.badge(statusColors[inv.investigationStatus] ?? '#888')}>
          {inv.investigationStatus}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Sensors</span>
        <span style={styles.value}>{inv.assignedSensors.length > 0 ? inv.assignedSensors.join(', ') : 'none'}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Cue Priority</span>
        <span style={styles.value}>{inv.cuePriority.toFixed(2)}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Bearings</span>
        <span style={styles.value}>{inv.bearingCount}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Geometry</span>
        <span style={styles.badge(statusColors[inv.geometryStatus] ?? '#888')}>
          {inv.geometryStatus}
        </span>
      </div>

      {/* Score breakdown */}
      <div style={{ marginTop: '6px' }}>
        <div style={{ fontSize: '10px', color: '#666', fontWeight: 600, marginBottom: '2px' }}>SCORE</div>
        <ScoreBar label="Threat" value={inv.scoreBreakdown.threat} maxValue={1} color="#ff3333" />
        <ScoreBar label="Uncertainty" value={inv.scoreBreakdown.uncertainty} maxValue={1} color="#ffcc00" />
        <ScoreBar label="Geometry" value={inv.scoreBreakdown.geometry} maxValue={1} color="#00cc44" />
        <ScoreBar label="Intent" value={inv.scoreBreakdown.intent} maxValue={1} color="#aa44ff" />
      </div>

      {/* Hypotheses */}
      {inv.hypotheses.length > 0 && <HypothesisChart hypotheses={inv.hypotheses} />}

      {/* Buttons */}
      {!dimmed && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button
            style={styles.actionBtn('#4a9eff')}
            onClick={(e) => { e.stopPropagation(); selectTrack(inv.trackId); }}
          >
            View on Map
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider component
// ---------------------------------------------------------------------------

function ParamSlider({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={styles.sliderRow}>
      <div style={styles.sliderLabel}>
        <span style={{ color: '#aaa' }}>{label}</span>
        <span style={{ color: '#4a9eff', fontFamily: 'monospace', fontSize: '11px' }}>{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={styles.slider}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parameters tab
// ---------------------------------------------------------------------------

function ParametersTab() {
  const storeParams = useInvestigationStore(s => s.parameters);
  const updateParameters = useInvestigationStore(s => s.updateParameters);
  const resetParameters = useInvestigationStore(s => s.resetParameters);
  const loading = useInvestigationStore(s => s.loading);

  // Local draft state for editing
  const [draft, setDraft] = useState<InvestigationParameters>(storeParams);

  // Sync draft when store params change (e.g., after reset)
  useEffect(() => {
    setDraft(storeParams);
  }, [storeParams]);

  const setWeight = (key: keyof InvestigationParameters['weights'], v: number) => {
    setDraft(d => ({ ...d, weights: { ...d.weights, [key]: v } }));
  };

  const setThreshold = (key: keyof InvestigationParameters['thresholds'], v: number) => {
    setDraft(d => ({ ...d, thresholds: { ...d.thresholds, [key]: v } }));
  };

  const handleApply = () => {
    updateParameters(draft);
  };

  const handleReset = () => {
    resetParameters();
  };

  return (
    <div>
      {/* Scoring Weights */}
      <div style={{ marginBottom: '16px' }}>
        <div style={styles.sectionTitle}>Scoring Weights</div>
        <ParamSlider label="Threat" value={draft.weights.threat} min={0} max={5} step={0.1} onChange={(v) => setWeight('threat', v)} />
        <ParamSlider label="Uncertainty Reduction" value={draft.weights.uncertaintyReduction} min={0} max={5} step={0.1} onChange={(v) => setWeight('uncertaintyReduction', v)} />
        <ParamSlider label="Geometry Gain" value={draft.weights.geometryGain} min={0} max={5} step={0.1} onChange={(v) => setWeight('geometryGain', v)} />
        <ParamSlider label="Operator Intent" value={draft.weights.operatorIntent} min={0} max={5} step={0.1} onChange={(v) => setWeight('operatorIntent', v)} />
        <ParamSlider label="Slew Cost" value={draft.weights.slewCost} min={0} max={5} step={0.1} onChange={(v) => setWeight('slewCost', v)} />
        <ParamSlider label="Occupancy Cost" value={draft.weights.occupancyCost} min={0} max={5} step={0.1} onChange={(v) => setWeight('occupancyCost', v)} />
      </div>

      {/* Thresholds */}
      <div style={{ marginBottom: '16px' }}>
        <div style={styles.sectionTitle}>Thresholds</div>
        <ParamSlider label="Split Angle (deg)" value={draft.thresholds.splitAngleDeg} min={0.1} max={5.0} step={0.1} onChange={(v) => setThreshold('splitAngleDeg', v)} />
        <ParamSlider label="Confidence Gate" value={draft.thresholds.confidenceGate} min={0.3} max={1.0} step={0.01} onChange={(v) => setThreshold('confidenceGate', v)} />
        <ParamSlider label="Cue Validity (sec)" value={draft.thresholds.cueValidityWindowSec} min={10} max={120} step={1} onChange={(v) => setThreshold('cueValidityWindowSec', v)} />
        <ParamSlider label="Convergence Threshold" value={draft.thresholds.convergenceThreshold} min={0.5} max={1.0} step={0.01} onChange={(v) => setThreshold('convergenceThreshold', v)} />
      </div>

      {/* Policy Mode */}
      <div style={{ marginBottom: '16px' }}>
        <div style={styles.sectionTitle}>Policy Mode</div>
        <select
          value={draft.policyMode}
          onChange={(e) => setDraft(d => ({ ...d, policyMode: e.target.value as InvestigationParameters['policyMode'] }))}
          style={{
            width: '100%',
            background: '#1a1a2e',
            color: '#e0e0e0',
            border: '1px solid #2a2a3e',
            borderRadius: '3px',
            padding: '6px 8px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          <option value="recommended_only">Recommended Only</option>
          <option value="auto_with_veto">Auto with Veto</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          style={{ ...styles.actionBtn('#ff8800'), flex: 1, opacity: loading ? 0.5 : 1 }}
          onClick={handleReset}
          disabled={loading}
        >
          Reset to Defaults
        </button>
        <button
          style={{ ...styles.actionBtn('#00cc44'), flex: 1, opacity: loading ? 0.5 : 1 }}
          onClick={handleApply}
          disabled={loading}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

type TabId = 'active' | 'resolved' | 'parameters';

export function InvestigationManagerPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('active');
  const activeInvestigations = useInvestigationStore(s => s.activeInvestigations);
  const resolvedInvestigations = useInvestigationStore(s => s.resolvedInvestigations);
  const fetchParameters = useInvestigationStore(s => s.fetchParameters);
  const setInvestigationWindowTrackId = useUiStore(s => s.setInvestigationWindowTrackId);
  const investigationWindowTrackId = useUiStore(s => s.investigationWindowTrackId);

  // Fetch parameters on mount
  useEffect(() => {
    fetchParameters();
  }, [fetchParameters]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Investigations</h3>
        <span style={{ fontSize: '11px', color: '#888' }}>
          {activeInvestigations.length} active
        </span>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={styles.tab(activeTab === 'active')} onClick={() => setActiveTab('active')}>Active</button>
        <button style={styles.tab(activeTab === 'resolved')} onClick={() => setActiveTab('resolved')}>Resolved</button>
        <button style={styles.tab(activeTab === 'parameters')} onClick={() => setActiveTab('parameters')}>Parameters</button>
      </div>

      {/* Active tab */}
      {activeTab === 'active' && (
        <div>
          {activeInvestigations.length === 0 ? (
            <p style={styles.emptyText}>No active investigations</p>
          ) : (
            activeInvestigations.map(inv => (
              <InvestigationCard
                key={inv.trackId}
                inv={inv}
                selected={inv.trackId === investigationWindowTrackId}
                onSelect={() => setInvestigationWindowTrackId(inv.trackId)}
              />
            ))
          )}
        </div>
      )}

      {/* Resolved tab */}
      {activeTab === 'resolved' && (
        <div>
          {resolvedInvestigations.length === 0 ? (
            <p style={styles.emptyText}>No recently resolved investigations</p>
          ) : (
            resolvedInvestigations.map(inv => (
              <InvestigationCard key={inv.trackId} inv={inv} dimmed />
            ))
          )}
        </div>
      )}

      {/* Parameters tab */}
      {activeTab === 'parameters' && <ParametersTab />}
    </div>
  );
}
