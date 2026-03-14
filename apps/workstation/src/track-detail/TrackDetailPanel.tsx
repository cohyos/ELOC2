import React, { useEffect, useState } from 'react';
import { useTrackStore } from '../stores/track-store';
import { useUiStore } from '../stores/ui-store';
import type { GeometryEstimate } from '@eloc2/domain';

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
  lineageItem: {
    padding: '4px 0',
    borderLeft: '2px solid #444',
    paddingLeft: '8px',
    marginBottom: '4px',
    fontSize: '11px',
  } as React.CSSProperties,
};

function statusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#00cc44';
    case 'tentative': return '#ffcc00';
    case 'dropped': return '#ff3333';
    default: return '#888888';
  }
}

function eoStatusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#00cc44';
    case 'in_progress': return '#4488ff';
    case 'pending': return '#ffcc00';
    case 'no_support': return '#ff8800';
    case 'split_detected': return '#ff3333';
    default: return '#888888';
  }
}

export function TrackDetailPanel() {
  const selectedTrackId = useUiStore(s => s.selectedTrackId);
  const selectTrack = useUiStore(s => s.selectTrack);
  const tracksById = useTrackStore(s => s.tracksById);
  const [geometry, setGeometry] = useState<GeometryEstimate | null>(null);

  const track = selectedTrackId ? tracksById.get(selectedTrackId) : null;

  useEffect(() => {
    if (!selectedTrackId) {
      setGeometry(null);
      return;
    }
    fetch(`/api/geometry/${selectedTrackId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setGeometry(data))
      .catch(() => setGeometry(null));
  }, [selectedTrackId]);

  if (!track) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
          Select a track on the map to view details.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>{track.systemTrackId}</h3>
        <button style={styles.closeBtn} onClick={() => selectTrack(null)}>Close</button>
      </div>

      {/* Status */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Status</div>
        <div style={styles.row}>
          <span style={styles.label}>Track Status</span>
          <span style={styles.badge(statusColor(track.status))}>{track.status}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Confidence</span>
          <span style={styles.value}>{(track.confidence * 100).toFixed(1)}%</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>EO Investigation</span>
          <span style={styles.badge(eoStatusColor(track.eoInvestigationStatus))}>
            {track.eoInvestigationStatus}
          </span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Last Updated</span>
          <span style={styles.value}>{new Date(track.lastUpdated).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Position */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Position</div>
        <div style={styles.row}>
          <span style={styles.label}>Lat</span>
          <span style={styles.value}>{track.state.lat.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Lon</span>
          <span style={styles.value}>{track.state.lon.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Alt</span>
          <span style={styles.value}>{track.state.alt.toLocaleString()} m</span>
        </div>
      </div>

      {/* Velocity */}
      {track.velocity && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Velocity (ENU m/s)</div>
          <div style={styles.row}>
            <span style={styles.label}>Vx (East)</span>
            <span style={styles.value}>{track.velocity.vx.toFixed(1)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Vy (North)</span>
            <span style={styles.value}>{track.velocity.vy.toFixed(1)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Vz (Up)</span>
            <span style={styles.value}>{track.velocity.vz.toFixed(1)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Speed</span>
            <span style={styles.value}>
              {Math.sqrt(
                track.velocity.vx ** 2 + track.velocity.vy ** 2 + track.velocity.vz ** 2
              ).toFixed(1)} m/s
            </span>
          </div>
        </div>
      )}

      {/* Sources */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Source Contributions</div>
        {track.sources.map(sid => (
          <div key={sid} style={{ ...styles.row, alignItems: 'center' }}>
            <span style={styles.value}>{sid}</span>
          </div>
        ))}
      </div>

      {/* Geometry */}
      {geometry && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Geometry Estimate</div>
          <div style={styles.row}>
            <span style={styles.label}>Quality</span>
            <span style={styles.badge(
              geometry.quality === 'strong' ? '#00cc44' :
              geometry.quality === 'acceptable' ? '#ffcc00' :
              geometry.quality === 'weak' ? '#ff8800' : '#ff3333'
            )}>{geometry.quality}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Classification</span>
            <span style={styles.value}>{geometry.classification}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Intersection Angle</span>
            <span style={styles.value}>{geometry.intersectionAngleDeg.toFixed(1)} deg</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Time Alignment</span>
            <span style={styles.value}>{geometry.timeAlignmentQualityMs} ms</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Bearing Noise</span>
            <span style={styles.value}>{geometry.bearingNoiseDeg.toFixed(3)} deg</span>
          </div>
        </div>
      )}

      {/* Lineage */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Lineage</div>
        {track.lineage.map((entry, i) => (
          <div key={i} style={styles.lineageItem}>
            <div style={{ color: '#aaa', fontSize: '10px' }}>
              v{entry.version} &middot; {new Date(entry.timestamp).toLocaleTimeString()}
            </div>
            <div style={{ color: '#ccc' }}>{entry.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
