import React, { useEffect, useState } from 'react';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useUiStore } from '../stores/ui-store';
import { replayController } from '../replay/ReplayController';

/**
 * DebugView — renders targets and sensors as simple HTML elements
 * on a plain coordinate grid without any map library.
 * Purpose: isolate whether the data pipeline delivers valid positions.
 *
 * Activate by navigating to ?debug=1
 */

// Viewport bounds (lon/lat) — Israel region
const DEFAULT_BOUNDS = {
  minLon: 33.5,
  maxLon: 36.5,
  minLat: 29.5,
  maxLat: 33.5,
};

function statusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#00cc44';
    case 'tentative': return '#ffcc00';
    case 'dropped': return '#ff3333';
    default: return '#888888';
  }
}

function sensorColor(type: string): string {
  switch (type) {
    case 'radar': return '#4488ff';
    case 'eo': return '#ff8800';
    case 'c4isr': return '#aa44ff';
    default: return '#888888';
  }
}

/** Convert lon/lat to screen pixel within the grid */
function toScreen(
  lon: number,
  lat: number,
  width: number,
  height: number,
  bounds: typeof DEFAULT_BOUNDS,
): { x: number; y: number } {
  const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width;
  // Flip Y — lat increases upward, screen Y increases downward
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
  return { x, y };
}

export function DebugView() {
  const tracks = useTrackStore(s => s.tracks);
  const trackCount = useTrackStore(s => s.trackCount);
  const confirmedCount = useTrackStore(s => s.confirmedCount);
  const tentativeCount = useTrackStore(s => s.tentativeCount);
  const sensors = useSensorStore(s => s.sensors);
  const wsConnected = useUiStore(s => s.wsConnected);
  const fetchRap = useTrackStore(s => s.fetchRap);
  const fetchSensors = useSensorStore(s => s.fetchSensors);

  const [rawRapResponse, setRawRapResponse] = useState<string>('');
  const [rawSensorResponse, setRawSensorResponse] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false);
  const [bounds] = useState(DEFAULT_BOUNDS);

  // grid size
  const GRID_W = 900;
  const GRID_H = 700;

  // Initial fetch
  useEffect(() => {
    fetchRap();
    fetchSensors();
    replayController.connect();
    return () => replayController.disconnect();
  }, []);

  // Periodic refresh
  useEffect(() => {
    const iv = setInterval(() => {
      fetchRap();
      fetchSensors();
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  // Fetch raw API responses for debugging
  const fetchRawData = async () => {
    try {
      const [rapRes, sensorRes] = await Promise.all([
        fetch('/api/rap').then(r => r.text()),
        fetch('/api/sensors').then(r => r.text()),
      ]);
      setRawRapResponse(rapRes);
      setRawSensorResponse(sensorRes);
      setShowRaw(true);
    } catch (err) {
      setRawRapResponse(`Error: ${err}`);
      setRawSensorResponse(`Error: ${err}`);
      setShowRaw(true);
    }
  };

  // Separate valid/invalid tracks for diagnostic
  const validTracks = tracks.filter(t => {
    const { lat, lon } = t.state;
    return typeof lat === 'number' && typeof lon === 'number' &&
      Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  });

  const invalidTracks = tracks.filter(t => {
    const { lat, lon } = t.state;
    return !(typeof lat === 'number' && typeof lon === 'number' &&
      Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180);
  });

  return (
    <div style={{ background: '#0a0a1a', color: '#e0e0e0', height: '100vh', overflow: 'auto', fontFamily: 'monospace', padding: '16px' }}>
      <h1 style={{ fontSize: '18px', margin: '0 0 8px' }}>
        ELOC2 DEBUG VIEW — No Map Layer
      </h1>

      {/* Status bar */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'center', fontSize: '13px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span>
          WS: <span style={{ color: wsConnected ? '#00cc44' : '#ff3333' }}>{wsConnected ? 'Connected' : 'Disconnected'}</span>
        </span>
        <span>
          Tracks in store: <strong>{tracks.length}</strong>
        </span>
        <span style={{ color: '#00cc44' }}>
          Confirmed: {confirmedCount}
        </span>
        <span style={{ color: '#ffcc00' }}>
          Tentative: {tentativeCount}
        </span>
        <span>
          Valid coords: <strong>{validTracks.length}</strong>
        </span>
        <span style={{ color: invalidTracks.length > 0 ? '#ff3333' : '#888' }}>
          Invalid coords: <strong>{invalidTracks.length}</strong>
        </span>
        <span>
          Sensors: <strong>{sensors.length}</strong>
        </span>
        <button
          onClick={fetchRawData}
          style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '4px 12px', cursor: 'pointer', borderRadius: '3px' }}
        >
          Fetch Raw API
        </button>
        <button
          onClick={() => { fetchRap(); fetchSensors(); }}
          style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '4px 12px', cursor: 'pointer', borderRadius: '3px' }}
        >
          Refresh Now
        </button>
      </div>

      {/* Main layout: grid + data tables */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {/* Coordinate grid */}
        <div style={{ position: 'relative', width: GRID_W, height: GRID_H, background: '#111122', border: '2px solid #333', flexShrink: 0 }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => (
            <React.Fragment key={`grid-${frac}`}>
              {/* Vertical */}
              <div style={{
                position: 'absolute', left: GRID_W * frac, top: 0, width: '1px', height: '100%',
                background: 'rgba(255,255,255,0.08)',
              }} />
              {/* Horizontal */}
              <div style={{
                position: 'absolute', top: GRID_H * frac, left: 0, height: '1px', width: '100%',
                background: 'rgba(255,255,255,0.08)',
              }} />
              {/* Lon label */}
              <span style={{
                position: 'absolute', left: GRID_W * frac - 10, bottom: -18, fontSize: '9px', color: '#666',
              }}>
                {(bounds.minLon + (bounds.maxLon - bounds.minLon) * frac).toFixed(1)}
              </span>
              {/* Lat label */}
              <span style={{
                position: 'absolute', top: GRID_H * frac - 6, left: -30, fontSize: '9px', color: '#666',
              }}>
                {(bounds.maxLat - (bounds.maxLat - bounds.minLat) * frac).toFixed(1)}
              </span>
            </React.Fragment>
          ))}

          {/* Render sensors as squares */}
          {sensors.map(sensor => {
            const { x, y } = toScreen(sensor.position.lon, sensor.position.lat, GRID_W, GRID_H, bounds);
            const color = sensorColor(sensor.sensorType);
            return (
              <div
                key={`sensor-${sensor.sensorId}`}
                title={`${sensor.sensorId} (${sensor.sensorType}) @ ${sensor.position.lat.toFixed(3)},${sensor.position.lon.toFixed(3)}`}
                style={{
                  position: 'absolute',
                  left: x - 6,
                  top: y - 6,
                  width: 12,
                  height: 12,
                  background: color,
                  border: '2px solid #000',
                  zIndex: 5,
                  cursor: 'pointer',
                }}
              />
            );
          })}

          {/* Render tracks as circles */}
          {validTracks.map(track => {
            const { x, y } = toScreen(track.state.lon, track.state.lat, GRID_W, GRID_H, bounds);
            const color = statusColor(track.status);
            return (
              <div
                key={`track-${track.systemTrackId}`}
                title={`${track.systemTrackId} (${track.status}) @ ${track.state.lat.toFixed(4)},${track.state.lon.toFixed(4)}`}
                style={{
                  position: 'absolute',
                  left: x - 5,
                  top: y - 5,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: color,
                  border: '1px solid rgba(255,255,255,0.5)',
                  zIndex: 10,
                  cursor: 'pointer',
                }}
              />
            );
          })}

          {/* Sensor labels */}
          {sensors.map(sensor => {
            const { x, y } = toScreen(sensor.position.lon, sensor.position.lat, GRID_W, GRID_H, bounds);
            return (
              <span
                key={`slbl-${sensor.sensorId}`}
                style={{
                  position: 'absolute',
                  left: x + 8,
                  top: y - 6,
                  fontSize: '9px',
                  color: sensorColor(sensor.sensorType),
                  whiteSpace: 'nowrap',
                  zIndex: 6,
                  textShadow: '0 0 3px #000',
                }}
              >
                {sensor.sensorId}
              </span>
            );
          })}

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.7)', padding: '6px 10px', borderRadius: '4px', fontSize: '10px' }}>
            <div><span style={{ color: '#00cc44' }}>●</span> confirmed</div>
            <div><span style={{ color: '#ffcc00' }}>●</span> tentative</div>
            <div><span style={{ color: '#ff3333' }}>●</span> dropped</div>
            <div style={{ marginTop: '4px' }}><span style={{ color: '#4488ff' }}>■</span> radar</div>
            <div><span style={{ color: '#ff8800' }}>■</span> eo</div>
            <div><span style={{ color: '#aa44ff' }}>■</span> c4isr</div>
          </div>
        </div>

        {/* Data tables */}
        <div style={{ flex: 1, minWidth: '300px', maxHeight: GRID_H, overflow: 'auto' }}>
          {/* First few tracks */}
          <h3 style={{ fontSize: '13px', margin: '0 0 6px' }}>
            Tracks (first 20 of {tracks.length})
          </h3>
          <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: '100%' }}>
            <thead>
              <tr style={{ background: '#1a1a2e' }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Lat</th>
                <th style={thStyle}>Lon</th>
                <th style={thStyle}>Alt</th>
                <th style={thStyle}>Conf</th>
                <th style={thStyle}>Sources</th>
              </tr>
            </thead>
            <tbody>
              {tracks.slice(0, 20).map(t => (
                <tr key={t.systemTrackId} style={{ borderBottom: '1px solid #222' }}>
                  <td style={tdStyle}>{t.systemTrackId}</td>
                  <td style={{ ...tdStyle, color: statusColor(t.status) }}>{t.status}</td>
                  <td style={tdStyle}>{t.state?.lat?.toFixed(4) ?? 'N/A'}</td>
                  <td style={tdStyle}>{t.state?.lon?.toFixed(4) ?? 'N/A'}</td>
                  <td style={tdStyle}>{t.state?.alt?.toFixed(0) ?? 'N/A'}</td>
                  <td style={tdStyle}>{t.confidence?.toFixed(2) ?? 'N/A'}</td>
                  <td style={tdStyle}>{t.sources?.join(', ') ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Invalid tracks */}
          {invalidTracks.length > 0 && (
            <>
              <h3 style={{ fontSize: '13px', margin: '12px 0 6px', color: '#ff3333' }}>
                Invalid Tracks ({invalidTracks.length})
              </h3>
              <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#2a1a1e' }}>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>state.lat</th>
                    <th style={thStyle}>state.lon</th>
                    <th style={thStyle}>Raw state</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidTracks.slice(0, 10).map(t => (
                    <tr key={t.systemTrackId}>
                      <td style={tdStyle}>{t.systemTrackId}</td>
                      <td style={tdStyle}>{String(t.state?.lat)}</td>
                      <td style={tdStyle}>{String(t.state?.lon)}</td>
                      <td style={tdStyle}>{JSON.stringify(t.state)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Sensors */}
          <h3 style={{ fontSize: '13px', margin: '12px 0 6px' }}>
            Sensors ({sensors.length})
          </h3>
          <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: '100%' }}>
            <thead>
              <tr style={{ background: '#1a1a2e' }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Lat</th>
                <th style={thStyle}>Lon</th>
                <th style={thStyle}>Online</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map(s => (
                <tr key={s.sensorId} style={{ borderBottom: '1px solid #222' }}>
                  <td style={tdStyle}>{s.sensorId}</td>
                  <td style={{ ...tdStyle, color: sensorColor(s.sensorType) }}>{s.sensorType}</td>
                  <td style={tdStyle}>{s.position?.lat?.toFixed(4) ?? 'N/A'}</td>
                  <td style={tdStyle}>{s.position?.lon?.toFixed(4) ?? 'N/A'}</td>
                  <td style={tdStyle}>{s.online ? 'YES' : 'NO'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw API response */}
      {showRaw && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '13px', margin: 0 }}>Raw API Responses</h3>
            <button
              onClick={() => setShowRaw(false)}
              style={{ background: '#333', color: '#aaa', border: 'none', padding: '2px 8px', cursor: 'pointer', fontSize: '10px' }}
            >
              Hide
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h4 style={{ fontSize: '11px', margin: '0 0 4px', color: '#888' }}>GET /api/rap</h4>
              <pre style={{ background: '#111', padding: '8px', fontSize: '9px', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {rawRapResponse.slice(0, 5000)}
              </pre>
            </div>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h4 style={{ fontSize: '11px', margin: '0 0 4px', color: '#888' }}>GET /api/sensors</h4>
              <pre style={{ background: '#111', padding: '8px', fontSize: '9px', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {rawSensorResponse.slice(0, 5000)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '3px 6px',
  borderBottom: '1px solid #333',
  color: '#888',
};

const tdStyle: React.CSSProperties = {
  padding: '3px 6px',
};
