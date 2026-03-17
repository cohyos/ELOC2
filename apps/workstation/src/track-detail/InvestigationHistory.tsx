import React, { useState } from 'react';

const SENSOR_COLORS: Record<string, string> = {
  radar: '#4488ff',
  eo: '#ff8800',
  c4isr: '#aa44ff',
};

interface ActiveCue {
  cueId: string;
  sensorId: string | null;
  priority: number;
  uncertaintyGateDeg: number;
  validFrom: number;
  validTo: number;
  taskStatus: string | null;
}

interface EoTrackEntry {
  eoTrackId: string;
  sensorId: string;
  bearing: { azimuthDeg: number; elevationDeg: number; timestamp: number; sensorId: string };
  imageQuality: number;
  status: string;
  confidence: number;
  identificationSupport: { type: string; confidence: number; features: string[] } | null;
}

interface EoReport {
  timestamp: number;
  simTimeSec: number;
  outcome: string;
  sensorId: string;
  cueId: string;
}

interface Identification {
  sensorId: string;
  type: string;
  confidence: number;
  features: string[];
}

interface UnresolvedGroupEntry {
  groupId: string;
  eoTrackIds: string[];
  status: string;
  reason: string;
  memberCount: number;
  escalated: boolean;
}

export interface InvestigationHistoryData {
  activeCues: ActiveCue[];
  eoTracks: EoTrackEntry[];
  eoReports: EoReport[];
  identifications: Identification[];
  unresolvedGroups: UnresolvedGroupEntry[];
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
  timelineItem: {
    display: 'flex',
    gap: '8px',
    marginBottom: '6px',
  } as React.CSSProperties,
  timelineIcon: (color: string) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    marginTop: '4px',
  } as React.CSSProperties),
  timelineContent: {
    flex: 1,
    fontSize: '11px',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '11px',
  } as React.CSSProperties,
  value: {
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '11px',
    color: '#e0e0e0',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 5px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
  priorityBar: (priority: number) => ({
    display: 'inline-block',
    width: `${Math.min(priority * 10, 100)}%`,
    maxWidth: '60px',
    height: '4px',
    borderRadius: '2px',
    background: priority > 7 ? '#ff3333' : priority > 4 ? '#ffcc00' : '#00cc44',
  } as React.CSSProperties),
  qualityBadge: (quality: number) => {
    const color = quality > 0.7 ? '#00cc44' : quality > 0.4 ? '#ffcc00' : '#ff3333';
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
  featureTag: {
    display: 'inline-block',
    padding: '1px 4px',
    borderRadius: '2px',
    fontSize: '9px',
    background: '#ffffff11',
    color: '#aaa',
    border: '1px solid #333',
    marginRight: '3px',
    marginBottom: '2px',
  } as React.CSSProperties,
  confBar: (confidence: number) => ({
    display: 'inline-block',
    width: '40px',
    height: '4px',
    borderRadius: '2px',
    background: '#333',
    position: 'relative' as const,
  }),
  confFill: (confidence: number) => {
    const color = confidence > 0.7 ? '#00cc44' : confidence > 0.4 ? '#ffcc00' : '#ff3333';
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      height: '4px',
      borderRadius: '2px',
      width: `${confidence * 100}%`,
      background: color,
    };
  },
  subLabel: {
    color: '#666',
    fontSize: '10px',
    marginBottom: '4px',
  } as React.CSSProperties,
};

function outcomeBadgeColor(outcome: string): string {
  switch (outcome) {
    case 'confirmed': return '#00cc44';
    case 'split_detected': return '#ff88aa';
    case 'no_support': return '#888';
    default: return '#666';
  }
}

export function InvestigationHistory({ investigationHistory }: { investigationHistory: InvestigationHistoryData }) {
  const [expanded, setExpanded] = useState(false);

  const hasContent =
    investigationHistory.activeCues.length > 0 ||
    investigationHistory.eoTracks.length > 0 ||
    investigationHistory.eoReports.length > 0 ||
    investigationHistory.identifications.length > 0 ||
    investigationHistory.unresolvedGroups.length > 0;

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader} onClick={() => setExpanded(!expanded)}>
        <span>Investigation History</span>
        <span style={{ ...styles.chevron, transform: expanded ? 'rotate(90deg)' : 'none' }}>&#9654;</span>
      </div>

      {expanded && (
        <>
          {!hasContent && (
            <div style={{ color: '#555', fontSize: '11px', fontStyle: 'italic', padding: '4px 0' }}>
              No investigation data available.
            </div>
          )}

          {/* Active Cues */}
          {investigationHistory.activeCues.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={styles.subLabel}>ACTIVE CUES</div>
              {investigationHistory.activeCues.map(cue => (
                <div key={cue.cueId} style={styles.timelineItem}>
                  <div style={styles.timelineIcon('#4488ff')} />
                  <div style={styles.timelineContent}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={styles.value}>{cue.cueId.slice(0, 8)}</span>
                      {cue.taskStatus && <span style={styles.badge(cue.taskStatus === 'executing' ? '#4488ff' : '#ffcc00')}>{cue.taskStatus}</span>}
                    </div>
                    {cue.sensorId && <div style={styles.label}>Sensor: {cue.sensorId}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <span style={styles.label}>Priority:</span>
                      <div style={styles.priorityBar(cue.priority)} />
                      <span style={{ color: '#aaa', fontSize: '10px' }}>{cue.priority.toFixed(1)}</span>
                    </div>
                    <div style={styles.label}>
                      Valid: {Math.max(0, Math.round((cue.validTo - Date.now()) / 1000))}s remaining
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EO Tracks / Bearings */}
          {investigationHistory.eoTracks.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={styles.subLabel}>BEARING RESULTS</div>
              {investigationHistory.eoTracks.map(t => (
                <div key={t.eoTrackId} style={styles.timelineItem}>
                  <div style={styles.timelineIcon('#ff8800')} />
                  <div style={styles.timelineContent}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={styles.value}>{t.sensorId}</span>
                      <span style={styles.qualityBadge(t.imageQuality)}>
                        IQ {(t.imageQuality * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={styles.label}>
                      Az: {t.bearing.azimuthDeg.toFixed(1)} / El: {t.bearing.elevationDeg.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EO Reports */}
          {investigationHistory.eoReports.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={styles.subLabel}>EO REPORTS</div>
              {investigationHistory.eoReports.map((r, i) => (
                <div key={i} style={styles.timelineItem}>
                  <div style={styles.timelineIcon(outcomeBadgeColor(r.outcome))} />
                  <div style={styles.timelineContent}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={styles.badge(outcomeBadgeColor(r.outcome))}>{r.outcome}</span>
                      <span style={{ color: '#666', fontSize: '10px' }}>T+{r.simTimeSec.toFixed(0)}s</span>
                    </div>
                    <div style={styles.label}>{r.sensorId}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Identification Support */}
          {investigationHistory.identifications.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={styles.subLabel}>IDENTIFICATION</div>
              {investigationHistory.identifications.map((id, i) => (
                <div key={i} style={styles.timelineItem}>
                  <div style={styles.timelineIcon('#aa44ff')} />
                  <div style={styles.timelineContent}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={styles.value}>{id.type}</span>
                      <span style={{ color: '#aaa', fontSize: '10px' }}>
                        {(id.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ position: 'relative', ...styles.confBar(id.confidence) }}>
                      <div style={styles.confFill(id.confidence)} />
                    </div>
                    {id.features.length > 0 && (
                      <div style={{ marginTop: '3px' }}>
                        {id.features.map((f, fi) => (
                          <span key={fi} style={styles.featureTag}>{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unresolved Groups */}
          {investigationHistory.unresolvedGroups.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={styles.subLabel}>AMBIGUITY GROUPS</div>
              {investigationHistory.unresolvedGroups.map(g => (
                <div key={g.groupId} style={styles.timelineItem}>
                  <div style={styles.timelineIcon(g.escalated ? '#ff3333' : '#ff88aa')} />
                  <div style={styles.timelineContent}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={styles.value}>{g.groupId.slice(0, 8)}</span>
                      <span style={styles.badge(g.escalated ? '#ff3333' : '#ff88aa')}>
                        {g.memberCount} members
                      </span>
                    </div>
                    <div style={styles.label}>{g.reason}</div>
                    {g.escalated && (
                      <div style={{ color: '#ff3333', fontSize: '10px', fontWeight: 600, marginTop: '2px' }}>
                        ESCALATED - Needs operator attention
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
