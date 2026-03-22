import React, { useState } from 'react';
import { useDecisionChainStore } from '../stores/decision-chain-store';
import type { DecisionChainEntry, DecisionChainStep } from '../stores/decision-chain-store';
import { useUiStore } from '../stores/ui-store';

const colors = {
  bg: '#0d0d1a',
  panelBg: '#141425',
  headerBg: '#1a1a2e',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
  success: '#00cc44',
  warning: '#ffcc00',
  danger: '#ff3333',
};

const STAGE_COLORS: Record<string, string> = {
  ground_truth: '#aaaaff',
  detection: '#4488ff',
  cover_zone: '#ffaa44',
  correlation: '#ff8800',
  fusion: '#aa44ff',
  promotion: '#00cc44',
  eo_tasking: '#ff8800',
  eo_investigation: '#ffcc00',
  geometry: '#44ddaa',
  classification: '#ff88cc',
};

const STAGE_LABELS: Record<string, string> = {
  ground_truth: 'GT',
  detection: 'DET',
  cover_zone: 'COV',
  correlation: 'COR',
  fusion: 'FUS',
  promotion: 'PRO',
  eo_tasking: 'TSK',
  eo_investigation: 'INV',
  geometry: 'GEO',
  classification: 'CLS',
};

function qualityColor(score: number): string {
  if (score >= 0.8) return colors.success;
  if (score >= 0.5) return colors.warning;
  return colors.danger;
}

function QualityBar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', marginBottom: '3px' }}>
      <span style={{ color: colors.textDim, minWidth: '90px' }}>{label}</span>
      <div style={{ flex: 1, height: '6px', background: '#222', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${value * 100}%`, height: '100%', background: qualityColor(value), borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ color: qualityColor(value), fontFamily: 'monospace', minWidth: '30px', textAlign: 'right' }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function StepRow({ step }: { step: DecisionChainStep }) {
  const [expanded, setExpanded] = useState(false);
  const stageColor = STAGE_COLORS[step.stage] ?? colors.textDim;

  return (
    <div
      style={{
        borderLeft: `3px solid ${stageColor}`,
        padding: '4px 8px',
        marginBottom: '2px',
        background: '#0d0d1a',
        cursor: step.data ? 'pointer' : 'default',
      }}
      onClick={() => step.data && setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, color: stageColor, minWidth: '28px', textTransform: 'uppercase' }}>
          {STAGE_LABELS[step.stage] ?? step.stage}
        </span>
        <span style={{ flex: 1, fontSize: '11px', color: colors.text }}>{step.detail}</span>
        {step.score != null && (
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: qualityColor(step.score), minWidth: '32px', textAlign: 'right' }}>
            {(step.score * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {step.decision && (
        <div style={{ fontSize: '10px', color: colors.textDim, marginTop: '2px', paddingLeft: '34px' }}>
          Decision: <b style={{ color: stageColor }}>{step.decision}</b>
          {step.alternatives && <span> (options: {step.alternatives})</span>}
        </div>
      )}
      {expanded && step.data && (
        <pre style={{ fontSize: '9px', color: colors.textDim, margin: '4px 0 0 34px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(step.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ChainCard({ chain, isSelected, onSelect }: { chain: DecisionChainEntry; isSelected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '8px',
        marginBottom: '4px',
        background: isSelected ? '#1a2a3e' : colors.panelBg,
        border: `1px solid ${isSelected ? colors.accent : colors.border}`,
        borderRadius: '4px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: colors.text }}>{chain.targetName}</span>
          {chain.trackId && (
            <span style={{ fontSize: '10px', color: colors.textDim, marginLeft: '8px' }}>→ {chain.trackId}</span>
          )}
        </div>
        <div style={{
          fontSize: '12px', fontWeight: 700, fontFamily: 'monospace',
          color: qualityColor(chain.chainQuality),
          padding: '2px 6px',
          borderRadius: '3px',
          background: `${qualityColor(chain.chainQuality)}15`,
        }}>
          {(chain.chainQuality * 100).toFixed(0)}%
        </div>
      </div>
      <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
        {chain.steps.map((step, i) => (
          <span
            key={i}
            title={`${step.stage}: ${step.decision ?? step.detail}`}
            style={{
              fontSize: '8px',
              fontWeight: 700,
              color: STAGE_COLORS[step.stage] ?? colors.textDim,
              background: `${STAGE_COLORS[step.stage] ?? colors.textDim}20`,
              padding: '1px 4px',
              borderRadius: '2px',
            }}
          >
            {STAGE_LABELS[step.stage] ?? step.stage.slice(0, 3).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

interface LogViewProps {
  onBack: () => void;
}

export function LogView({ onBack }: LogViewProps) {
  const chains = useDecisionChainStore((s) => s.chains);
  const events = useUiStore((s) => s.events);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chains' | 'events'>('chains');
  const [sortBy, setSortBy] = useState<'quality' | 'name'>('quality');

  const selectedChain = chains.find((c) => c.id === selectedChainId);

  const sortedChains = [...chains].sort((a, b) => {
    if (sortBy === 'quality') return a.chainQuality - b.chainQuality; // worst first
    return a.targetName.localeCompare(b.targetName);
  });

  const avgQuality = chains.length > 0
    ? chains.reduce((s, c) => s + c.chainQuality, 0) / chains.length
    : 0;

  const handleExport = async () => {
    try {
      const res = await fetch('/api/logs/decision-chains/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `decision-chains-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleExportEvents = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', height: '100vh', gridTemplateRows: '40px 1fr', gridTemplateColumns: '350px 1fr', background: colors.bg, color: colors.text, fontFamily: 'system-ui', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ gridColumn: '1 / -1', background: colors.headerBg, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', borderBottom: `1px solid ${colors.border}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>← Back</button>
        <span style={{ fontSize: '14px', fontWeight: 700 }}>Decision Chain Log</span>
        <span style={{ fontSize: '11px', color: colors.textDim }}>({chains.length} targets)</span>

        {/* Average quality */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: colors.textDim }}>Avg Quality:</span>
          <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: qualityColor(avgQuality) }}>
            {(avgQuality * 100).toFixed(0)}%
          </span>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['chains', 'events'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? colors.accent : 'transparent',
                  color: activeTab === tab ? '#fff' : colors.textDim,
                  border: 'none', borderRadius: '3px', padding: '3px 10px',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {tab === 'chains' ? 'Decision Chains' : 'Event Log'}
              </button>
            ))}
          </div>

          <button onClick={activeTab === 'chains' ? handleExport : handleExportEvents} style={{ background: '#2a2a4e', color: colors.accent, border: `1px solid ${colors.accent}44`, borderRadius: '3px', padding: '3px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
            Export {activeTab === 'chains' ? 'Chains' : 'Events'}
          </button>
        </div>
      </div>

      {activeTab === 'chains' ? (
        <>
          {/* Left panel — chain list */}
          <div style={{ background: colors.panelBg, borderRight: `1px solid ${colors.border}`, overflowY: 'auto', padding: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: colors.textDim, textTransform: 'uppercase' }}>Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'quality' | 'name')}
                style={{ background: '#0d0d1a', color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '3px', padding: '2px 6px', fontSize: '10px' }}
              >
                <option value="quality">Worst Quality First</option>
                <option value="name">Name</option>
              </select>
            </div>
            {sortedChains.length === 0 && (
              <div style={{ color: colors.textDim, fontSize: '11px', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
                No decision chains available. Start a scenario and wait a few seconds.
              </div>
            )}
            {sortedChains.map((chain) => (
              <ChainCard
                key={chain.id}
                chain={chain}
                isSelected={selectedChainId === chain.id}
                onSelect={() => setSelectedChainId(chain.id)}
              />
            ))}
          </div>

          {/* Right panel — chain detail */}
          <div style={{ overflowY: 'auto', padding: '12px' }}>
            {!selectedChain ? (
              <div style={{ color: colors.textDim, fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
                Select a target from the left panel to view its decision chain.
              </div>
            ) : (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: '#fff' }}>
                  {selectedChain.targetName}
                  <span style={{ fontSize: '12px', color: colors.textDim, fontWeight: 400, marginLeft: '8px' }}>
                    → Track {selectedChain.trackId || '(none)'}
                  </span>
                </h3>
                <div style={{ fontSize: '11px', color: colors.textDim, marginBottom: '12px' }}>
                  T+{selectedChain.simTimeSec.toFixed(1)}s | {selectedChain.steps.length} pipeline steps
                </div>

                {/* Quality breakdown */}
                <div style={{ background: colors.panelBg, padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: colors.textDim }}>CHAIN QUALITY</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: qualityColor(selectedChain.chainQuality) }}>
                      {(selectedChain.chainQuality * 100).toFixed(0)}%
                    </span>
                  </div>
                  <QualityBar value={selectedChain.qualityBreakdown.detectionLatency} label="Detection Speed" />
                  <QualityBar value={selectedChain.qualityBreakdown.positionAccuracy} label="Position Accuracy" />
                  <QualityBar value={selectedChain.qualityBreakdown.correlationCorrectness} label="Correlation" />
                  <QualityBar value={selectedChain.qualityBreakdown.promotionSpeed} label="Track Promotion" />
                  <QualityBar value={selectedChain.qualityBreakdown.classificationAccuracy} label="Classification" />
                  <QualityBar value={selectedChain.qualityBreakdown.geometryQuality} label="Geometry" />
                  <QualityBar value={selectedChain.qualityBreakdown.fusionEfficiency} label="Fusion Diversity" />
                </div>

                {/* Pipeline steps */}
                <div style={{ fontSize: '12px', fontWeight: 700, color: colors.textDim, marginBottom: '6px' }}>PIPELINE STEPS</div>
                {selectedChain.steps.map((step, i) => (
                  <StepRow key={i} step={step} />
                ))}
              </>
            )}
          </div>
        </>
      ) : (
        /* Event log tab */
        <div style={{ gridColumn: '1 / -1', overflowY: 'auto', padding: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}`, color: colors.textDim }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', width: '100px' }}>Time</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', width: '200px' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {[...events].reverse().map((evt) => (
                <tr key={evt.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                  <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: colors.textDim }}>
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '3px 8px', color: colors.accent }}>
                    {evt.eventType}
                  </td>
                  <td style={{ padding: '3px 8px', color: colors.text }}>
                    {evt.summary}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: colors.textDim, fontStyle: 'italic' }}>
                    No events recorded. Start a scenario to see events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
