import React, { useState } from 'react';

const SENSOR_COLORS: Record<string, string> = {
  radar: '#4488ff',
  eo: '#ff8800',
  c4isr: '#aa44ff',
  unknown: '#888888',
};

interface ContributingSensor {
  sensorId: string;
  sensorType: string;
  online: boolean;
}

interface CorrelationDecision {
  timestamp: number;
  simTimeSec: number;
  sensorId: string;
  decision: string;
}

interface SourceObservation {
  version: number;
  timestamp: number;
  event: string;
  description: string;
}

export interface TrackEvidence {
  contributingSensors: ContributingSensor[];
  observationCount: number;
  correlationDecisions: CorrelationDecision[];
  sourceObservations: SourceObservation[];
}

const styles = {
  section: {
    marginBottom: '12px',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    borderBottom: '1px solid #333',
    paddingBottom: '3px',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  chevron: {
    fontSize: '10px',
    color: '#666',
    transition: 'transform 0.15s',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '12px',
  } as React.CSSProperties,
  value: {
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '12px',
    color: '#e0e0e0',
  } as React.CSSProperties,
  sensorChip: (color: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    background: color + '18',
    color: color,
    border: `1px solid ${color}33`,
    marginRight: '4px',
    marginBottom: '3px',
  } as React.CSSProperties),
  dot: (color: string) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  } as React.CSSProperties),
  scrollList: {
    maxHeight: '200px',
    overflowY: 'auto' as const,
    background: '#0d0d1a',
    borderRadius: '4px',
    padding: '4px',
  } as React.CSSProperties,
  obsItem: {
    padding: '3px 6px',
    borderLeft: '2px solid #444',
    marginBottom: '3px',
    fontSize: '11px',
  } as React.CSSProperties,
  decisionBadge: (decision: string) => {
    const color = decision === 'new_track' ? '#ffcc00' : '#00cc44';
    return {
      display: 'inline-block',
      padding: '1px 5px',
      borderRadius: '3px',
      fontSize: '10px',
      fontWeight: 600,
      background: color + '22',
      color: color,
      border: `1px solid ${color}44`,
    } as React.CSSProperties;
  },
};

export function EvidenceChain({ evidence }: { evidence: TrackEvidence }) {
  const [expanded, setExpanded] = useState(false);
  const [obsExpanded, setObsExpanded] = useState(false);

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader} onClick={() => setExpanded(!expanded)}>
        <span>Evidence Chain</span>
        <span style={{ ...styles.chevron, transform: expanded ? 'rotate(90deg)' : 'none' }}>&#9654;</span>
      </div>

      {expanded && (
        <>
          {/* Contributing Sensors */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>CONTRIBUTING SENSORS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {evidence.contributingSensors.map(s => (
                <span key={s.sensorId} style={styles.sensorChip(SENSOR_COLORS[s.sensorType] ?? '#888')}>
                  <span style={styles.dot(s.online ? '#00cc44' : '#ff3333')} />
                  {s.sensorId}
                </span>
              ))}
            </div>
          </div>

          {/* Observation Count */}
          <div style={styles.row}>
            <span style={styles.label}>Total Observations</span>
            <span style={styles.value}>{evidence.observationCount}</span>
          </div>

          {/* Correlation Decisions */}
          {evidence.correlationDecisions.length > 0 && (
            <div style={{ marginTop: '6px', marginBottom: '6px' }}>
              <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>RECENT CORRELATIONS</div>
              <div style={styles.scrollList}>
                {evidence.correlationDecisions.map((d, i) => (
                  <div key={i} style={styles.obsItem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#aaa', fontSize: '10px' }}>
                        T+{d.simTimeSec.toFixed(0)}s &middot; {d.sensorId}
                      </span>
                      <span style={styles.decisionBadge(d.decision)}>{d.decision}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source Observations (collapsible) */}
          {evidence.sourceObservations.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <div
                style={{ color: '#666', fontSize: '10px', marginBottom: '4px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setObsExpanded(!obsExpanded)}
              >
                SOURCE OBSERVATIONS ({evidence.sourceObservations.length}) {obsExpanded ? '[-]' : '[+]'}
              </div>
              {obsExpanded && (
                <div style={styles.scrollList}>
                  {evidence.sourceObservations.map((obs, i) => (
                    <div key={i} style={styles.obsItem}>
                      <div style={{ color: '#aaa', fontSize: '10px' }}>
                        v{obs.version} &middot; {new Date(obs.timestamp).toLocaleTimeString()}
                      </div>
                      <div style={{ color: '#ccc', fontSize: '11px' }}>{obs.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
