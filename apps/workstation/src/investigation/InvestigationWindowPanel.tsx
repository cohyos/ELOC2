import React, { useState } from 'react';
import { useUiStore } from '../stores/ui-store';
import { useInvestigationStore } from '../stores/investigation-store';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useTaskStore } from '../stores/task-store';

// ---------------------------------------------------------------------------
// Classification types
// ---------------------------------------------------------------------------

const CLASSIFICATION_TYPES = [
  'civilian_aircraft', 'passenger_aircraft', 'light_aircraft', 'fighter_aircraft',
  'ally', 'predator', 'neutral', 'unknown', 'bird', 'birds',
  'helicopter', 'uav', 'small_uav', 'drone',
] as const;

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const trackStatusColors: Record<string, string> = {
  confirmed: '#00cc44',
  tentative: '#ffcc00',
  dropped: '#ff3333',
};

const investigationStatusColors: Record<string, string> = {
  in_progress: '#4a9eff',
  split_detected: '#ff8800',
  confirmed: '#00cc44',
  no_support: '#ff3333',
};

const geometryStatusColors: Record<string, string> = {
  bearing_only: '#888',
  candidate_3d: '#ffcc00',
  confirmed_3d: '#00cc44',
};

// ---------------------------------------------------------------------------
// Styles
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
  backBtn: {
    background: '#333',
    color: '#aaa',
    border: 'none',
    padding: '3px 10px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
  } as React.CSSProperties,
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
  section: {
    marginBottom: '16px',
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
    padding: '2px 0',
    fontSize: '12px',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '11px',
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
  emptyText: {
    color: '#555',
    fontSize: '12px',
    textAlign: 'center' as const,
    padding: '24px 0',
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Score bar component
// ---------------------------------------------------------------------------

function ScoreBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
        <span style={{ color: '#777' }}>{label}</span>
        <span style={{ color: '#aaa', fontFamily: 'monospace' }}>{value.toFixed(2)}</span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: '#333', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function InvestigationWindowPanel() {
  const trackId = useUiStore(s => s.investigationWindowTrackId);
  const setInvestigationWindowTrackId = useUiStore(s => s.setInvestigationWindowTrackId);
  const setDetailView = useUiStore(s => s.setDetailView);

  const activeInvestigations = useInvestigationStore(s => s.activeInvestigations);
  const sensors = useSensorStore(s => s.sensors);
  const tracksById = useTrackStore(s => s.tracksById);
  const geometryEstimates = useTaskStore(s => s.geometryEstimates);

  const [classifyType, setClassifyType] = useState<string>('unknown');
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [lockLoading, setLockLoading] = useState<string | null>(null);

  // Find the investigation for this track
  const inv = activeInvestigations.find(i => i.trackId === trackId);
  const track = trackId ? tracksById.get(trackId) : undefined;
  const geometry = trackId ? geometryEstimates.find(g => g.trackId === trackId) : undefined;

  const handleBack = () => {
    setInvestigationWindowTrackId(null);
    setDetailView('investigation');
  };

  const handleLockSensor = async (sensorId: string) => {
    setLockLoading(sensorId);
    try {
      await fetch('/api/operator/lock-sensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensorId, trackId }),
      });
    } catch { /* ignore */ }
    setLockLoading(null);
  };

  const handleReleaseSensor = async (sensorId: string) => {
    setLockLoading(sensorId);
    try {
      await fetch('/api/operator/release-sensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensorId }),
      });
    } catch { /* ignore */ }
    setLockLoading(null);
  };

  const handleClassify = async () => {
    if (!trackId) return;
    setClassifyLoading(true);
    try {
      await fetch('/api/operator/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, classification: classifyType, source: 'operator' }),
      });
    } catch { /* ignore */ }
    setClassifyLoading(false);
  };

  // No track selected or investigation not found
  if (!trackId || !inv) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>EO Investigation</h3>
          <button style={styles.backBtn} onClick={handleBack}>Back</button>
        </div>
        <p style={styles.emptyText}>No active investigation for this track.</p>
      </div>
    );
  }

  // Get classification from track if available
  const classification = (track as Record<string, unknown>)?.classification as
    | { type: string; confidence: number; source: string }
    | undefined;

  // Sensor details for assigned sensors
  const assignedSensorDetails = inv.assignedSensors.map(sid => {
    const sensor = sensors.find(s => s.sensorId === sid);
    return {
      sensorId: sid,
      online: sensor?.online ?? false,
      azimuthDeg: sensor?.gimbal?.azimuthDeg,
      currentTargetId: sensor?.gimbal?.currentTargetId,
      sensorType: sensor?.sensorType ?? 'eo',
    };
  });

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>EO Investigation</h3>
        <button style={styles.backBtn} onClick={handleBack}>Back</button>
      </div>

      {/* Track + Investigation Header */}
      <div style={styles.card}>
        <div style={styles.row}>
          <span style={styles.label}>Track</span>
          <span style={{ ...styles.value, color: '#4a9eff' }}>{trackId.slice(0, 8)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Track Status</span>
          <span style={styles.badge(trackStatusColors[inv.trackStatus] ?? '#888')}>
            {inv.trackStatus}
          </span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Investigation</span>
          <span style={styles.badge(investigationStatusColors[inv.investigationStatus] ?? '#888')}>
            {inv.investigationStatus}
          </span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Priority</span>
          <span style={{ ...styles.value, color: inv.cuePriority > 5 ? '#ff8800' : '#aaa' }}>
            {inv.cuePriority.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Sensor Assignment Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Sensor Assignments</div>
        {assignedSensorDetails.length === 0 ? (
          <p style={{ color: '#555', fontSize: '11px', margin: '4px 0' }}>No sensors assigned</p>
        ) : (
          assignedSensorDetails.map(s => {
            const isLockedToThis = s.currentTargetId === trackId;
            return (
              <div key={s.sensorId} style={{ ...styles.card, padding: '6px 10px' }}>
                <div style={styles.row}>
                  <span style={styles.label}>Sensor</span>
                  <span style={{ ...styles.value, color: '#ff8800' }}>{s.sensorId.slice(0, 8)}</span>
                </div>
                <div style={styles.row}>
                  <span style={styles.label}>Status</span>
                  <span style={styles.badge(s.online ? '#00cc44' : '#ff3333')}>
                    {s.online ? 'online' : 'offline'}
                  </span>
                </div>
                {s.azimuthDeg !== undefined && (
                  <div style={styles.row}>
                    <span style={styles.label}>Gimbal Az</span>
                    <span style={styles.value}>{s.azimuthDeg.toFixed(1)}&deg;</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  {!isLockedToThis ? (
                    <button
                      style={{ ...styles.actionBtn('#4a9eff'), opacity: lockLoading === s.sensorId ? 0.5 : 1 }}
                      onClick={() => handleLockSensor(s.sensorId)}
                      disabled={lockLoading === s.sensorId}
                    >
                      Lock
                    </button>
                  ) : (
                    <button
                      style={{ ...styles.actionBtn('#ff8800'), opacity: lockLoading === s.sensorId ? 0.5 : 1 }}
                      onClick={() => handleReleaseSensor(s.sensorId)}
                      disabled={lockLoading === s.sensorId}
                    >
                      Release
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bearing & Geometry Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Bearing &amp; Geometry</div>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.label}>Bearings</span>
            <span style={{ ...styles.value, color: inv.bearingCount >= 2 ? '#00cc44' : '#ffcc00' }}>
              {inv.bearingCount}
            </span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Geometry</span>
            <span style={styles.badge(geometryStatusColors[inv.geometryStatus] ?? '#888')}>
              {inv.geometryStatus}
            </span>
          </div>
          {geometry && (
            <>
              <div style={styles.row}>
                <span style={styles.label}>Intersection Angle</span>
                <span style={styles.value}>{geometry.intersectionAngleDeg.toFixed(1)}&deg;</span>
              </div>
              {geometry.position3D && (
                <div style={styles.row}>
                  <span style={styles.label}>Position Est.</span>
                  <span style={styles.value}>
                    {geometry.position3D.lat.toFixed(4)}, {geometry.position3D.lon.toFixed(4)}
                  </span>
                </div>
              )}
              <div style={styles.row}>
                <span style={styles.label}>Quality</span>
                <span style={styles.badge(geometryStatusColors[geometry.quality] ?? '#888')}>
                  {geometry.quality}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Score Breakdown Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Score Breakdown</div>
        <div style={styles.card}>
          <ScoreBar label="Threat" value={inv.scoreBreakdown.threat} maxValue={1} color="#ff3333" />
          <ScoreBar label="Uncertainty" value={inv.scoreBreakdown.uncertainty} maxValue={1} color="#ffcc00" />
          <ScoreBar label="Geometry" value={inv.scoreBreakdown.geometry} maxValue={1} color="#00cc44" />
          <ScoreBar label="Intent" value={inv.scoreBreakdown.intent} maxValue={1} color="#aa44ff" />
        </div>
      </div>

      {/* Classification Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Classification</div>
        <div style={styles.card}>
          <div style={styles.row}>
            <span style={styles.label}>Current</span>
            <span style={{ ...styles.value, color: classification ? '#e0e0e0' : '#555' }}>
              {classification?.type ?? 'Unknown'}
            </span>
          </div>
          {classification && (
            <>
              <div style={styles.row}>
                <span style={styles.label}>Confidence</span>
                <span style={styles.value}>{(classification.confidence * 100).toFixed(0)}%</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Source</span>
                <span style={styles.badge('#aa44ff')}>{classification.source}</span>
              </div>
            </>
          )}
          <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              value={classifyType}
              onChange={e => setClassifyType(e.target.value)}
              style={{
                flex: 1,
                background: '#1a1a2e',
                color: '#e0e0e0',
                border: '1px solid #2a2a3e',
                borderRadius: '3px',
                padding: '4px 6px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {CLASSIFICATION_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button
              style={{ ...styles.actionBtn('#aa44ff'), opacity: classifyLoading ? 0.5 : 1 }}
              onClick={handleClassify}
              disabled={classifyLoading}
            >
              Classify
            </button>
          </div>
        </div>
      </div>

      {/* Hypotheses Section */}
      {inv.hypotheses.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Hypotheses</div>
          <div style={styles.card}>
            {inv.hypotheses.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#888', minWidth: '60px' }}>{h.label}</span>
                <div style={{ flex: 1, height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(h.probability * 100).toFixed(0)}%`,
                    background: '#aa44ff',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <span style={{ fontSize: '10px', color: '#aaa', fontFamily: 'monospace', minWidth: '32px', textAlign: 'right' }}>
                  {(h.probability * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
