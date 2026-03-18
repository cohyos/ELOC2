import React from 'react';
import { useUiStore } from '../stores/ui-store';
import { useGroundTruthStore } from '../stores/ground-truth-store';
import { useTrackStore } from '../stores/track-store';

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
    color: '#00ffff',
    margin: 0,
  } as React.CSSProperties,
  closeBtn: {
    background: 'none',
    border: '1px solid #555',
    color: '#aaa',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '12px',
  } as React.CSSProperties,
  section: {
    marginBottom: '10px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#00cccc',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
    letterSpacing: '0.5px',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    borderBottom: '1px solid #1a1a2e',
    fontSize: '12px',
  } as React.CSSProperties,
  label: { color: '#888' } as React.CSSProperties,
  value: { color: '#e0e0e0', fontFamily: 'monospace', fontSize: '11px' } as React.CSSProperties,
  diamond: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    background: '#00ffff',
    transform: 'rotate(45deg)',
    marginRight: '8px',
  } as React.CSSProperties,
};

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function GroundTruthDetailPanel() {
  const selectedId = useUiStore(s => s.selectedGroundTruthId);
  const selectGroundTruth = useUiStore(s => s.selectGroundTruth);
  const targets = useGroundTruthStore(s => s.targets);
  const tracks = useTrackStore(s => s.tracks);

  const target = targets.find(t => (t.targetId ?? t.name) === selectedId);

  if (!target) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#888' }}>No ground truth target selected.</p>
      </div>
    );
  }

  // Find nearest system track
  let nearestTrack: { id: string; dist: number } | null = null;
  for (const track of tracks) {
    const dist = haversineDistanceM(
      target.position.lat, target.position.lon,
      track.state.lat, track.state.lon,
    );
    if (!nearestTrack || dist < nearestTrack.dist) {
      nearestTrack = { id: track.systemTrackId as string, dist };
    }
  }

  const speed = target.velocity
    ? Math.sqrt(target.velocity.vx ** 2 + target.velocity.vy ** 2 + target.velocity.vz ** 2)
    : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.diamond} />
          GT: {target.name}
        </h3>
        <button style={styles.closeBtn} onClick={() => selectGroundTruth(null)}>Close</button>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Target Info</div>
        <div style={styles.row}>
          <span style={styles.label}>ID</span>
          <span style={styles.value}>{target.targetId}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Classification</span>
          <span style={styles.value}>{target.classification ?? 'Unclassified'}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Status</span>
          <span style={{ ...styles.value, color: target.active ? '#00cc44' : '#ff3333' }}>
            {target.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Position</div>
        <div style={styles.row}>
          <span style={styles.label}>Latitude</span>
          <span style={styles.value}>{target.position.lat.toFixed(5)}°</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Longitude</span>
          <span style={styles.value}>{target.position.lon.toFixed(5)}°</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Altitude</span>
          <span style={styles.value}>{target.position.alt.toFixed(0)} m</span>
        </div>
        {speed > 0 && (
          <div style={styles.row}>
            <span style={styles.label}>Speed</span>
            <span style={styles.value}>{speed.toFixed(1)} m/s ({(speed * 3.6).toFixed(0)} km/h)</span>
          </div>
        )}
      </div>

      {nearestTrack && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Nearest Track</div>
          <div style={styles.row}>
            <span style={styles.label}>Track ID</span>
            <span style={styles.value}>{nearestTrack.id.slice(0, 12)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Distance</span>
            <span style={{
              ...styles.value,
              color: nearestTrack.dist < 500 ? '#00cc44' : nearestTrack.dist < 2000 ? '#ffcc00' : '#ff3333',
            }}>
              {nearestTrack.dist < 1000
                ? `${nearestTrack.dist.toFixed(0)} m`
                : `${(nearestTrack.dist / 1000).toFixed(2)} km`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
