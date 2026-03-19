import React, { useState, useEffect, useCallback } from 'react';
import { useUiStore } from '../stores/ui-store';
import type { InvestigationMode } from '../stores/ui-store';
import { useInvestigationStore } from '../stores/investigation-store';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useTaskStore } from '../stores/task-store';
import { useGroundTruthStore } from '../stores/ground-truth-store';
import { useAuthStore } from '../auth/auth-store';

// ---------------------------------------------------------------------------
// Investigation event type (mirrors backend InvestigationEvent)
// ---------------------------------------------------------------------------

interface InvestigationEvent {
  timestamp: number;
  simTimeSec: number;
  type: 'observation' | 'classification' | 'state_change' | 'eo_dwell' | 'bearing_report' | 'cue_issued' | 'task_assigned' | 'geometry_update';
  sensorId: string;
  trackId: string;
  details: Record<string, unknown>;
}

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

const eventTypeColors: Record<string, string> = {
  observation: '#4488ff',
  classification: '#aa44ff',
  state_change: '#ffcc00',
  eo_dwell: '#ff8800',
  bearing_report: '#00cc44',
  cue_issued: '#4a9eff',
  task_assigned: '#ff8800',
  geometry_update: '#00cc44',
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
  modeSelector: {
    display: 'flex',
    gap: '4px',
    marginBottom: '12px',
  } as React.CSSProperties,
  modeTab: (active: boolean, color: string) => ({
    flex: 1,
    background: active ? color + '22' : '#1a1a2e',
    color: active ? color : '#666',
    border: `1px solid ${active ? color + '44' : '#2a2a3e'}`,
    borderRadius: '3px',
    padding: '4px 6px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
    textAlign: 'center' as const,
    transition: 'all 0.2s ease',
  } as React.CSSProperties),
};

// ---------------------------------------------------------------------------
// Utility: Haversine distance in meters
// ---------------------------------------------------------------------------

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
// GT Comparison Panel (instructor only)
// ---------------------------------------------------------------------------

function GTComparisonView({ trackId, track, geometry }: {
  trackId: string;
  track: Record<string, unknown> | undefined;
  geometry: { position3D?: { lat: number; lon: number; alt?: number }; quality?: string; intersectionAngleDeg?: number } | undefined;
}) {
  const gtTargets = useGroundTruthStore(s => s.targets);
  const [showGtOverlay, setShowGtOverlay] = useState(false);

  // Try to find the matching GT target — match by closest position
  const trackPos = track?.state as { lat?: number; lon?: number } | undefined;
  let bestGt: typeof gtTargets[0] | undefined;
  let bestDist = Infinity;

  if (trackPos?.lat != null && trackPos?.lon != null) {
    for (const gt of gtTargets) {
      if (!gt.active) continue;
      const d = haversineM(trackPos.lat, trackPos.lon, gt.position.lat, gt.position.lon);
      if (d < bestDist) {
        bestDist = d;
        bestGt = gt;
      }
    }
  }

  // Also try geometry position for distance
  let geoDist: number | null = null;
  if (bestGt && geometry?.position3D) {
    geoDist = haversineM(geometry.position3D.lat, geometry.position3D.lon, bestGt.position.lat, bestGt.position.lon);
  }

  const classification = (track as Record<string, unknown>)?.classification as string | undefined;
  const classMatch = bestGt?.classification && classification
    ? bestGt.classification === classification
    : null;

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Ground Truth Comparison</div>

      {!bestGt ? (
        <div style={styles.card}>
          <p style={{ color: '#555', fontSize: '11px', margin: '4px 0' }}>No matching ground truth target found.</p>
        </div>
      ) : (
        <>
          {/* Split view: Investigation vs GT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            {/* Left: Investigation */}
            <div style={{ ...styles.card, marginBottom: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#4a9eff', marginBottom: '4px', textTransform: 'uppercase' as const }}>
                Investigation
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Lat</span>
                <span style={styles.value}>{trackPos?.lat?.toFixed(4) ?? '-'}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Lon</span>
                <span style={styles.value}>{trackPos?.lon?.toFixed(4) ?? '-'}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Class</span>
                <span style={{ ...styles.value, color: classMatch === true ? '#00cc44' : classMatch === false ? '#ff3333' : '#888' }}>
                  {classification ?? 'Unknown'}
                </span>
              </div>
              {geometry?.position3D && (
                <div style={styles.row}>
                  <span style={styles.label}>3D Est.</span>
                  <span style={styles.value}>
                    {geometry.position3D.lat.toFixed(4)}, {geometry.position3D.lon.toFixed(4)}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Ground Truth */}
            <div style={{ ...styles.card, marginBottom: 0, borderColor: '#00ffff33' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#00ffff', marginBottom: '4px', textTransform: 'uppercase' as const }}>
                Ground Truth
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Lat</span>
                <span style={styles.value}>{bestGt.position.lat.toFixed(4)}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Lon</span>
                <span style={styles.value}>{bestGt.position.lon.toFixed(4)}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Class</span>
                <span style={{ ...styles.value, color: '#00ffff' }}>
                  {bestGt.classification ?? 'Unknown'}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Name</span>
                <span style={{ ...styles.value, color: '#aaa' }}>{bestGt.name}</span>
              </div>
            </div>
          </div>

          {/* Comparison Metrics */}
          <div style={styles.card}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', marginBottom: '6px', textTransform: 'uppercase' as const }}>
              Comparison Metrics
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Track Position Error</span>
              <span style={{
                ...styles.value,
                color: bestDist < 500 ? '#00cc44' : bestDist < 2000 ? '#ffcc00' : '#ff3333',
              }}>
                {bestDist < 10000 ? `${bestDist.toFixed(0)}m` : `${(bestDist / 1000).toFixed(1)}km`}
              </span>
            </div>
            {geoDist != null && (
              <div style={styles.row}>
                <span style={styles.label}>Geometry Position Error</span>
                <span style={{
                  ...styles.value,
                  color: geoDist < 500 ? '#00cc44' : geoDist < 2000 ? '#ffcc00' : '#ff3333',
                }}>
                  {geoDist < 10000 ? `${geoDist.toFixed(0)}m` : `${(geoDist / 1000).toFixed(1)}km`}
                </span>
              </div>
            )}
            <div style={styles.row}>
              <span style={styles.label}>Classification Match</span>
              <span style={styles.badge(
                classMatch === true ? '#00cc44' : classMatch === false ? '#ff3333' : '#888',
              )}>
                {classMatch === true ? 'Match' : classMatch === false ? 'Mismatch' : 'N/A'}
              </span>
            </div>
          </div>

          {/* GT Overlay Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#888' }}>
              <input
                type="checkbox"
                checked={showGtOverlay}
                onChange={() => setShowGtOverlay(!showGtOverlay)}
                style={{ accentColor: '#00ffff' }}
              />
              Show GT overlay on map
            </label>
            {showGtOverlay && (
              <span style={{ fontSize: '9px', color: '#00ffff', fontStyle: 'italic' }}>
                (GT markers visible when GT toggle is ON)
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pyrite Event Log View
// ---------------------------------------------------------------------------

function PyriteEventLogView({ trackId }: { trackId: string }) {
  const [events, setEvents] = useState<InvestigationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/investigation/${encodeURIComponent(trackId)}/log`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [trackId]);

  // Initial fetch + auto-refresh every 3s
  useEffect(() => {
    fetchLog();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLog, 3000);
    return () => clearInterval(interval);
  }, [fetchLog, autoRefresh]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDetails = (evt: InvestigationEvent): string => {
    const d = evt.details;
    switch (evt.type) {
      case 'observation':
        return `${d.sensorType ?? 'sensor'} ${d.decision ?? ''} (fusion: ${d.fusionMode ?? 'N/A'})`;
      case 'bearing_report':
        return `az=${(d.azimuthDeg as number)?.toFixed(1) ?? '?'}deg el=${(d.elevationDeg as number)?.toFixed(1) ?? '?'}deg`;
      case 'classification':
        return `${d.classification ?? '?'} (${((d.confidence as number) * 100)?.toFixed(0) ?? '?'}% by ${d.source ?? '?'})`;
      case 'state_change':
        return `${d.detail ?? ''} -> ${d.newStatus ?? '?'}`;
      case 'eo_dwell':
        return `${d.action ?? ''} (${d.dwellDurationSec ?? '?'}s)`;
      case 'cue_issued':
        return `priority=${(d.priority as number)?.toFixed(2) ?? '?'} gate=${(d.uncertaintyGateDeg as number)?.toFixed(1) ?? '?'}deg`;
      case 'task_assigned':
        return `policy=${d.policyMode ?? '?'}`;
      case 'geometry_update':
        return `quality=${d.quality ?? '?'} class=${d.classification ?? '?'} angle=${(d.intersectionAngleDeg as number)?.toFixed(1) ?? '?'}deg`;
      default:
        return JSON.stringify(d).slice(0, 60);
    }
  };

  return (
    <div style={styles.section}>
      <div style={{ ...styles.sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Investigation Event Log</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '9px', color: '#666', textTransform: 'none' as const, fontWeight: 400, letterSpacing: 0 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={() => setAutoRefresh(!autoRefresh)}
              style={{ accentColor: '#4a9eff' }}
            />
            Auto
          </label>
          <button
            style={{ ...styles.backBtn, fontSize: '9px', padding: '1px 6px' }}
            onClick={fetchLog}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div style={styles.card}>
          <p style={{ color: '#555', fontSize: '11px', margin: '4px 0', textAlign: 'center' }}>
            {loading ? 'Loading event log...' : 'No investigation events recorded yet.'}
          </p>
        </div>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {events.slice().reverse().map((evt, i) => {
            const evtColor = eventTypeColors[evt.type] ?? '#888';
            return (
              <div
                key={i}
                style={{
                  ...styles.card,
                  padding: '5px 8px',
                  marginBottom: '4px',
                  borderLeft: `3px solid ${evtColor}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={styles.badge(evtColor)}>{evt.type.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '9px', color: '#666', fontFamily: 'monospace' }}>
                    T+{formatTime(evt.simTimeSec)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span style={{ color: '#aaa' }}>{formatDetails(evt)}</span>
                  <span style={{ color: '#555', fontSize: '9px' }}>{evt.sensorId.slice(0, 8)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: '10px', color: '#555', marginTop: '4px', textAlign: 'center' }}>
        {events.length} event{events.length !== 1 ? 's' : ''} recorded
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
  const investigationMode = useUiStore(s => s.investigationMode);
  const setInvestigationMode = useUiStore(s => s.setInvestigationMode);

  const activeInvestigations = useInvestigationStore(s => s.activeInvestigations);
  const sensors = useSensorStore(s => s.sensors);
  const tracksById = useTrackStore(s => s.tracksById);
  const geometryEstimates = useTaskStore(s => s.geometryEstimates);

  const authUser = useAuthStore(s => s.user);
  const authEnabled = useAuthStore(s => s.authEnabled);
  const isInstructor = authUser?.role === 'instructor' || !authEnabled;

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

  const handleModeChange = (mode: InvestigationMode) => {
    // Only instructors can use GT comparison mode
    if (mode === 'gt-comparison' && !isInstructor) return;
    setInvestigationMode(mode);
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
  const classification = (track as unknown as Record<string, unknown>)?.classification as
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

  const isPyrite = investigationMode === 'pyrite';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>EO Investigation</h3>
        <button style={styles.backBtn} onClick={handleBack}>Back</button>
      </div>

      {/* Mode Selector */}
      <div style={styles.modeSelector}>
        <button
          style={styles.modeTab(investigationMode === 'standard', '#4a9eff')}
          onClick={() => handleModeChange('standard')}
          title="Standard investigation view"
        >
          Standard
        </button>
        <button
          style={{
            ...styles.modeTab(investigationMode === 'gt-comparison', '#00ffff'),
            opacity: isInstructor ? 1 : 0.3,
            cursor: isInstructor ? 'pointer' : 'not-allowed',
          }}
          onClick={() => handleModeChange('gt-comparison')}
          title={isInstructor ? 'Compare with ground truth (instructor only)' : 'Instructor role required'}
        >
          GT Compare
        </button>
        <button
          style={styles.modeTab(investigationMode === 'pyrite', '#ff8800')}
          onClick={() => handleModeChange('pyrite')}
          title="Pyrite mode: event log only, no ground truth"
        >
          Pyrite
        </button>
      </div>

      {/* Mode description banner */}
      {investigationMode !== 'standard' && (
        <div style={{
          padding: '4px 8px',
          marginBottom: '10px',
          borderRadius: '3px',
          fontSize: '10px',
          background: investigationMode === 'gt-comparison' ? '#00ffff11' : '#ff880011',
          border: `1px solid ${investigationMode === 'gt-comparison' ? '#00ffff33' : '#ff880033'}`,
          color: investigationMode === 'gt-comparison' ? '#00ffff' : '#ff8800',
        }}>
          {investigationMode === 'gt-comparison'
            ? 'GT Comparison Mode -- Ground truth data shown alongside investigation results. For instructor evaluation only.'
            : 'Pyrite Mode -- Event log analysis only. No ground truth access. Realistic operator training.'}
        </div>
      )}

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

      {/* Pyrite mode: show event log instead of full details */}
      {isPyrite && (
        <PyriteEventLogView trackId={trackId} />
      )}

      {/* Standard and GT-Comparison modes show full investigation details */}
      {!isPyrite && (
        <>
          {/* GT Comparison section (GT mode only, instructor only) */}
          {investigationMode === 'gt-comparison' && isInstructor && (
            <GTComparisonView
              trackId={trackId}
              track={track as unknown as Record<string, unknown>}
              geometry={geometry}
            />
          )}

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
        </>
      )}
    </div>
  );
}
