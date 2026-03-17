import React from 'react';
import { useTaskStore } from '../stores/task-store';
import { useUiStore } from '../stores/ui-store';

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
  closeBtn: {
    background: 'none',
    border: '1px solid #555',
    color: '#aaa',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '11px',
  } as React.CSSProperties,
  section: {
    marginBottom: '12px',
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
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 600,
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
  link: {
    color: '#4a9eff',
    cursor: 'pointer',
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '12px',
    textDecoration: 'underline',
    background: 'none',
    border: 'none',
    padding: 0,
  } as React.CSSProperties,
};

function cueStatusColor(cue: { validFrom: number; validTo: number }): { label: string; color: string } {
  const now = Date.now();
  if (now < cue.validFrom) return { label: 'pending', color: '#ffcc00' };
  if (now > cue.validTo) return { label: 'expired', color: '#888888' };
  return { label: 'active', color: '#4488ff' };
}

function priorityColor(priority: number): string {
  if (priority >= 8) return '#ff3333';
  if (priority >= 5) return '#ff8800';
  if (priority >= 3) return '#ffcc00';
  return '#00cc44';
}

export function CueDetailPanel() {
  const selectedCueId = useUiStore(s => s.selectedCueId);
  const selectCue = useUiStore(s => s.selectCue);
  const selectTrack = useUiStore(s => s.selectTrack);
  const selectSensor = useUiStore(s => s.selectSensor);
  const activeCues = useTaskStore(s => s.activeCues);
  const eoTracks = useTaskStore(s => s.eoTracks);

  const cue = selectedCueId ? activeCues.find(c => c.cueId === selectedCueId) : null;

  if (!cue) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
          Select a bearing line on the map to view cue details.
        </p>
      </div>
    );
  }

  const status = cueStatusColor(cue);
  const bearingResults = eoTracks.filter(
    t => t.associatedSystemTrackId === cue.systemTrackId && t.bearing
  );

  // Countdown: seconds remaining until expiry
  const remainingSec = Math.max(0, Math.round((cue.validTo - Date.now()) / 1000));
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingS = remainingSec % 60;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>EO Cue</div>
          <h3 style={styles.title}>{cue.cueId}</h3>
        </div>
        <button style={styles.closeBtn} onClick={() => selectCue(null)}>&times;</button>
      </div>

      {/* Status */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Status</div>
        <div style={styles.row}>
          <span style={styles.label}>State</span>
          <span style={styles.badge(status.color)}>{status.label}</span>
        </div>
      </div>

      {/* Target */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Target</div>
        <div style={styles.row}>
          <span style={styles.label}>System Track</span>
          <button style={styles.link} onClick={() => selectTrack(cue.systemTrackId)}>
            {cue.systemTrackId}
          </button>
        </div>
      </div>

      {/* Priority */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Priority</div>
        <div style={styles.row}>
          <span style={styles.label}>Level</span>
          <span style={{ ...styles.value, color: priorityColor(cue.priority) }}>{cue.priority}/10</span>
        </div>
        <div style={{ marginTop: '4px', height: '6px', background: '#222', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: `${(cue.priority / 10) * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, #00cc44, #ffcc00, #ff8800, #ff3333)`,
            borderRadius: '3px',
          }} />
        </div>
      </div>

      {/* Uncertainty */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Uncertainty Gate</div>
        <div style={styles.row}>
          <span style={styles.label}>Gate Width</span>
          <span style={styles.value}>{cue.uncertaintyGateDeg.toFixed(2)} deg</span>
        </div>
      </div>

      {/* Validity Window */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Validity Window</div>
        <div style={styles.row}>
          <span style={styles.label}>Valid From</span>
          <span style={styles.value}>{new Date(cue.validFrom).toLocaleTimeString()}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Valid To</span>
          <span style={styles.value}>{new Date(cue.validTo).toLocaleTimeString()}</span>
        </div>
        {status.label === 'active' && (
          <div style={styles.row}>
            <span style={styles.label}>Remaining</span>
            <span style={{ ...styles.value, color: remainingSec < 30 ? '#ff3333' : '#e0e0e0' }}>
              {remainingMin}:{remainingS.toString().padStart(2, '0')}
            </span>
          </div>
        )}
      </div>

      {/* Predicted Position */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Predicted Position</div>
        <div style={styles.row}>
          <span style={styles.label}>Lat</span>
          <span style={styles.value}>{cue.predictedState.lat.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Lon</span>
          <span style={styles.value}>{cue.predictedState.lon.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Alt</span>
          <span style={styles.value}>{cue.predictedState.alt.toLocaleString()} m</span>
        </div>
      </div>

      {/* Bearing Results */}
      {bearingResults.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Bearing Results ({bearingResults.length})</div>
          {bearingResults.map(t => (
            <div key={t.eoTrackId} style={{
              padding: '4px 0',
              borderLeft: '2px solid #ff8800',
              paddingLeft: '8px',
              marginBottom: '4px',
              fontSize: '11px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#aaa' }}>{t.eoTrackId}</span>
                <button style={{ ...styles.link, fontSize: '10px' }} onClick={() => selectSensor(t.sensorId)}>
                  {t.sensorId}
                </button>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Azimuth</span>
                <span style={styles.value}>{t.bearing.azimuthDeg.toFixed(2)} deg</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Elevation</span>
                <span style={styles.value}>{t.bearing.elevationDeg.toFixed(2)} deg</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
