import React from 'react';
import { useUiStore } from '../stores/ui-store';
import { useGroundTruthStore } from '../stores/ground-truth-store';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';

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
  comparisonGrid: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 1fr',
    gap: '0',
    fontSize: '11px',
    marginBottom: '8px',
  } as React.CSSProperties,
  gridHeader: {
    padding: '4px 4px',
    fontWeight: 700,
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    borderBottom: '1px solid #333',
  } as React.CSSProperties,
  gridCell: {
    padding: '3px 4px',
    fontFamily: 'monospace',
    fontSize: '11px',
    borderBottom: '1px solid #1a1a2e',
  } as React.CSSProperties,
  errorCell: (error: number, threshold: number) => ({
    padding: '3px 4px',
    fontFamily: 'monospace',
    fontSize: '11px',
    borderBottom: '1px solid #1a1a2e',
    color: error < threshold * 0.5 ? '#00cc44' : error < threshold ? '#ffcc00' : '#ff3333',
  } as React.CSSProperties),
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
  sensorRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid #1a1a2e',
    fontSize: '11px',
  } as React.CSSProperties,
  sensorName: {
    fontWeight: 600,
    fontSize: '11px',
  } as React.CSSProperties,
  sensorDetail: {
    color: '#888',
    fontSize: '10px',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  noData: {
    color: '#555',
    fontStyle: 'italic' as const,
    fontSize: '11px',
    padding: '4px 0',
  } as React.CSSProperties,
};

const SENSOR_COLORS: Record<string, string> = {
  radar: '#4488ff',
  eo: '#ff8800',
  c4isr: '#aa44ff',
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#00cc44',
  tentative: '#ffcc00',
  dropped: '#ff3333',
};

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(m: number): string {
  return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;
}

export function GroundTruthDetailPanel() {
  const selectedId = useUiStore(s => s.selectedGroundTruthId);
  const selectGroundTruth = useUiStore(s => s.selectGroundTruth);
  const targets = useGroundTruthStore(s => s.targets);
  const tracks = useTrackStore(s => s.tracks);
  const sensors = useSensorStore(s => s.sensors);

  const target = targets.find(t => (t.targetId ?? t.name) === selectedId);

  if (!target) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#888' }}>No ground truth target selected.</p>
      </div>
    );
  }

  // Find nearest system track (within 5km threshold)
  const MATCH_THRESHOLD = 5000;
  let matchedTrack: typeof tracks[0] | null = null;
  let matchDist = Infinity;
  for (const track of tracks) {
    const dist = haversineDistanceM(
      target.position.lat, target.position.lon,
      track.state.lat, track.state.lon,
    );
    if (dist < matchDist) {
      matchDist = dist;
      if (dist < MATCH_THRESHOLD) matchedTrack = track;
    }
  }

  const gtSpeed = target.velocity
    ? Math.sqrt(target.velocity.vx ** 2 + target.velocity.vy ** 2 + target.velocity.vz ** 2)
    : 0;

  const trackSpeed = matchedTrack?.velocity
    ? Math.sqrt(matchedTrack.velocity.vx ** 2 + matchedTrack.velocity.vy ** 2 + matchedTrack.velocity.vz ** 2)
    : 0;

  const altError = matchedTrack ? Math.abs(target.position.alt - matchedTrack.state.alt) : 0;
  const speedError = matchedTrack ? Math.abs(gtSpeed - trackSpeed) : 0;

  // Determine which sensors can see this target (within their max range)
  const sensorsInRange = sensors.map(sensor => {
    const dist = haversineDistanceM(
      target.position.lat, target.position.lon,
      sensor.position.lat, sensor.position.lon,
    );
    const maxRange = sensor.coverage?.maxRangeM ?? 0;
    const inRange = dist <= maxRange;
    const contributing = matchedTrack?.sources?.includes(sensor.sensorId) ?? false;
    return { sensor, dist, maxRange, inRange, contributing };
  }).sort((a, b) => a.dist - b.dist);

  // Classification comparison
  const gtClass = target.classification ?? 'unknown';
  const sysClass = matchedTrack?.classification ?? 'unknown';
  const classMatch = gtClass === sysClass;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.diamond} />
          GT: {target.name}
        </h3>
        <button style={styles.closeBtn} onClick={() => selectGroundTruth(null)}>Close</button>
      </div>

      {/* Target Info */}
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

      {/* GT vs System Comparison */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          Ground Truth vs System{matchedTrack ? '' : ' (No Match)'}
        </div>

        {matchedTrack ? (
          <>
            <div style={styles.comparisonGrid}>
              {/* Header row */}
              <div style={{ ...styles.gridHeader, color: '#888' }}></div>
              <div style={{ ...styles.gridHeader, color: '#00ffff' }}>Truth</div>
              <div style={{ ...styles.gridHeader, color: '#ffcc00' }}>System</div>

              {/* Track ID */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Track</div>
              <div style={styles.gridCell}>{target.targetId}</div>
              <div style={styles.gridCell}>{(matchedTrack.systemTrackId as string).slice(0, 8)}</div>

              {/* Status */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Status</div>
              <div style={{ ...styles.gridCell, color: target.active ? '#00cc44' : '#ff3333' }}>
                {target.active ? 'Active' : 'Inactive'}
              </div>
              <div style={{ ...styles.gridCell, color: STATUS_COLORS[matchedTrack.status] ?? '#888' }}>
                {matchedTrack.status}
              </div>

              {/* Classification */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Class</div>
              <div style={styles.gridCell}>{gtClass}</div>
              <div style={{ ...styles.gridCell, color: classMatch ? '#00cc44' : '#ff3333' }}>
                {sysClass}{classMatch ? '' : ' ✗'}
              </div>

              {/* Latitude */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Lat</div>
              <div style={styles.gridCell}>{target.position.lat.toFixed(5)}°</div>
              <div style={styles.gridCell}>{matchedTrack.state.lat.toFixed(5)}°</div>

              {/* Longitude */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Lon</div>
              <div style={styles.gridCell}>{target.position.lon.toFixed(5)}°</div>
              <div style={styles.gridCell}>{matchedTrack.state.lon.toFixed(5)}°</div>

              {/* Altitude */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Alt</div>
              <div style={styles.gridCell}>{target.position.alt.toFixed(0)} m</div>
              <div style={styles.gridCell}>{matchedTrack.state.alt.toFixed(0)} m</div>

              {/* Speed */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Speed</div>
              <div style={styles.gridCell}>{gtSpeed.toFixed(1)} m/s</div>
              <div style={styles.gridCell}>{trackSpeed.toFixed(1)} m/s</div>

              {/* Confidence */}
              <div style={{ ...styles.gridCell, color: '#888' }}>Conf.</div>
              <div style={styles.gridCell}>100%</div>
              <div style={styles.gridCell}>{(matchedTrack.confidence * 100).toFixed(1)}%</div>
            </div>

            {/* Error Summary */}
            <div style={{ ...styles.sectionTitle, marginTop: '8px' }}>Error</div>
            <div style={styles.row}>
              <span style={styles.label}>Position Error</span>
              <span style={styles.errorCell(matchDist, 1000)}>
                {formatDist(matchDist)}
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Altitude Error</span>
              <span style={styles.errorCell(altError, 500)}>
                {altError.toFixed(0)} m
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Speed Error</span>
              <span style={styles.errorCell(speedError, 20)}>
                {speedError.toFixed(1)} m/s
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Classification</span>
              <span style={{ ...styles.value, color: classMatch ? '#00cc44' : '#ff3333' }}>
                {classMatch ? 'Correct' : 'Mismatch'}
              </span>
            </div>
          </>
        ) : (
          <div style={styles.noData}>
            No system track associated within {(MATCH_THRESHOLD / 1000).toFixed(0)} km
            {matchDist < Infinity && (
              <span> (nearest: {formatDist(matchDist)})</span>
            )}
          </div>
        )}
      </div>

      {/* Sensor Awareness */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Sensor Awareness</div>
        {sensorsInRange.map(({ sensor, dist, inRange, contributing }) => {
          const color = SENSOR_COLORS[sensor.sensorType] ?? '#888';
          return (
            <div key={sensor.sensorId as string} style={styles.sensorRow}>
              <div>
                <span style={{ ...styles.sensorName, color }}>
                  {sensor.sensorId}
                </span>
                <span style={{ color: '#555', fontSize: '10px', marginLeft: '4px' }}>
                  ({sensor.sensorType})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={styles.sensorDetail}>{formatDist(dist)}</span>
                {contributing ? (
                  <span style={styles.badge('#00cc44')}>Contributing</span>
                ) : inRange ? (
                  <span style={styles.badge('#ffcc00')}>In Range</span>
                ) : (
                  <span style={styles.badge('#ff3333')}>Out of Range</span>
                )}
                {!sensor.online && (
                  <span style={styles.badge('#ff3333')}>Offline</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Matched Track Sources */}
      {matchedTrack && matchedTrack.sources.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Contributing Sources</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
            {matchedTrack.sources.map(sid => {
              const sensor = sensors.find(s => s.sensorId === sid);
              const color = sensor ? SENSOR_COLORS[sensor.sensorType] ?? '#888' : '#888';
              return (
                <span key={sid as string} style={styles.badge(color)}>
                  {sid}
                </span>
              );
            })}
          </div>
          <div style={{ ...styles.row, marginTop: '4px' }}>
            <span style={styles.label}>EO Investigation</span>
            <span style={styles.value}>{matchedTrack.eoInvestigationStatus ?? 'none'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
