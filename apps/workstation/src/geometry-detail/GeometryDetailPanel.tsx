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

function qualityColor(quality: string): string {
  switch (quality) {
    case 'strong': return '#00cc44';
    case 'acceptable': return '#ffcc00';
    case 'weak': return '#ff8800';
    case 'insufficient': return '#ff3333';
    default: return '#888888';
  }
}

function classificationColor(classification: string): string {
  switch (classification) {
    case 'confirmed_3d': return '#00cc44';
    case 'candidate_3d': return '#ffcc00';
    case 'bearing_only': return '#888888';
    default: return '#888888';
  }
}

function classificationLabel(classification: string): string {
  switch (classification) {
    case 'confirmed_3d': return 'Confirmed 3D';
    case 'candidate_3d': return 'Candidate 3D';
    case 'bearing_only': return 'Bearing Only';
    default: return classification;
  }
}

function timeAlignmentQualityIndicator(ms: number): { label: string; color: string } {
  if (ms <= 50) return { label: 'excellent', color: '#00cc44' };
  if (ms <= 200) return { label: 'good', color: '#ffcc00' };
  if (ms <= 500) return { label: 'marginal', color: '#ff8800' };
  return { label: 'poor', color: '#ff3333' };
}

function intersectionAngleQualityIndicator(deg: number): { label: string; color: string } {
  if (deg >= 60) return { label: 'excellent', color: '#00cc44' };
  if (deg >= 30) return { label: 'good', color: '#ffcc00' };
  if (deg >= 15) return { label: 'marginal', color: '#ff8800' };
  return { label: 'poor', color: '#ff3333' };
}

export function GeometryDetailPanel() {
  const selectedGeometryTrackId = useUiStore(s => s.selectedGeometryTrackId);
  const selectGeometry = useUiStore(s => s.selectGeometry);
  const selectTrack = useUiStore(s => s.selectTrack);
  const selectSensor = useUiStore(s => s.selectSensor);
  const geometryEstimates = useTaskStore(s => s.geometryEstimates);
  const eoTracks = useTaskStore(s => s.eoTracks);

  const estimate = selectedGeometryTrackId
    ? geometryEstimates.find(g => g.trackId === selectedGeometryTrackId)
    : null;

  if (!estimate) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
          Select a triangulation ray on the map to view geometry details.
        </p>
      </div>
    );
  }

  const timeQuality = timeAlignmentQualityIndicator(estimate.timeAlignmentQualityMs);
  const angleQuality = intersectionAngleQualityIndicator(estimate.intersectionAngleDeg);

  // Find contributing sensors from eoTracks associated with this track
  const contributingEoTracks = eoTracks.filter(
    t => estimate.eoTrackIds.includes(t.eoTrackId)
  );
  const contributingSensorIds = [...new Set(contributingEoTracks.map(t => t.sensorId))];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Geometry Estimate</div>
          <h3 style={styles.title}>
            <button style={{ ...styles.link, fontSize: '15px', fontWeight: 700 }} onClick={() => selectTrack(estimate.trackId)}>
              {estimate.trackId}
            </button>
          </h3>
        </div>
        <button style={styles.closeBtn} onClick={() => selectGeometry(null)}>&times;</button>
      </div>

      {/* Quality & Classification */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Assessment</div>
        <div style={styles.row}>
          <span style={styles.label}>Quality</span>
          <span style={styles.badge(qualityColor(estimate.quality))}>{estimate.quality}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Classification</span>
          <span style={styles.badge(classificationColor(estimate.classification))}>
            {classificationLabel(estimate.classification)}
          </span>
        </div>
      </div>

      {/* 3D Position */}
      {estimate.position3D && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>3D Position</div>
          <div style={styles.row}>
            <span style={styles.label}>Lat</span>
            <span style={styles.value}>{estimate.position3D.lat.toFixed(4)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Lon</span>
            <span style={styles.value}>{estimate.position3D.lon.toFixed(4)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Alt</span>
            <span style={styles.value}>{estimate.position3D.alt.toLocaleString()} m</span>
          </div>
        </div>
      )}

      {/* Intersection Angle */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Intersection Angle</div>
        <div style={styles.row}>
          <span style={styles.label}>Angle</span>
          <span style={styles.value}>{estimate.intersectionAngleDeg.toFixed(1)} deg</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Quality</span>
          <span style={styles.badge(angleQuality.color)}>{angleQuality.label}</span>
        </div>
        {/* Visual indicator bar */}
        <div style={{ marginTop: '4px', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, (estimate.intersectionAngleDeg / 90) * 100)}%`,
            height: '100%',
            background: angleQuality.color,
            borderRadius: '2px',
          }} />
        </div>
      </div>

      {/* Time Alignment */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Time Alignment</div>
        <div style={styles.row}>
          <span style={styles.label}>Offset</span>
          <span style={styles.value}>{estimate.timeAlignmentQualityMs} ms</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Quality</span>
          <span style={styles.badge(timeQuality.color)}>{timeQuality.label}</span>
        </div>
      </div>

      {/* Bearing Noise */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Bearing Noise</div>
        <div style={styles.row}>
          <span style={styles.label}>Noise</span>
          <span style={styles.value}>{estimate.bearingNoiseDeg.toFixed(3)} deg</span>
        </div>
      </div>

      {/* Contributing Sensors */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Contributing Sensors ({contributingSensorIds.length})</div>
        {contributingSensorIds.map(sensorId => (
          <div key={sensorId} style={{
            padding: '4px 0',
            borderLeft: '2px solid #ff8800',
            paddingLeft: '8px',
            marginBottom: '4px',
          }}>
            <button style={styles.link} onClick={() => selectSensor(sensorId)}>
              {sensorId}
            </button>
          </div>
        ))}
        {contributingSensorIds.length === 0 && (
          <div style={{ color: '#666', fontSize: '11px' }}>No contributing sensors found</div>
        )}
      </div>

      {/* EO Track IDs */}
      {estimate.eoTrackIds.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>EO Tracks ({estimate.eoTrackIds.length})</div>
          {estimate.eoTrackIds.map(id => (
            <div key={id} style={{
              padding: '2px 0',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#aaa',
            }}>
              {id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
