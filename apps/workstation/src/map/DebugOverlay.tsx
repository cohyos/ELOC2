import React, { useEffect, useRef, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import type { SystemTrack, SensorState } from '@eloc2/domain';

/**
 * DebugOverlay — draws targets and sensors as simple HTML divs
 * positioned using map.project() (lon/lat → pixel).
 * Completely bypasses MapLibre's GeoJSON source/layer system.
 *
 * If symbols appear here but not in MapLibre layers, the issue is
 * in layer init/style/source. If they don't appear here either,
 * the issue is in data flow or map projection.
 */

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

interface DebugOverlayProps {
  map: maplibregl.Map | null;
  tracks: SystemTrack[];
  sensors: SensorState[];
  layersReady: boolean;
}

export function DebugOverlay({ map, tracks, sensors, layersReady }: DebugOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  const render = useCallback(() => {
    if (!map || !overlayRef.current) return;

    const container = overlayRef.current;
    // Clear previous markers
    container.innerHTML = '';

    // Draw sensors as squares
    for (const sensor of sensors) {
      const { lon, lat } = sensor.position;
      const px = map.project([lon, lat]);
      const color = sensorColor(sensor.sensorType);

      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute; left:${px.x - 7}px; top:${px.y - 7}px;
        width:14px; height:14px; background:${color};
        border:2px solid #000; z-index:20; pointer-events:none;
      `;
      el.title = `${sensor.sensorId} (${sensor.sensorType})`;
      container.appendChild(el);

      // Label
      const lbl = document.createElement('div');
      lbl.style.cssText = `
        position:absolute; left:${px.x + 10}px; top:${px.y - 8}px;
        font-size:10px; color:${color}; white-space:nowrap;
        text-shadow:0 0 3px #000, 0 0 3px #000; z-index:21;
        pointer-events:none; font-family:monospace; font-weight:bold;
      `;
      lbl.textContent = sensor.sensorId;
      container.appendChild(lbl);
    }

    // Draw tracks as circles
    for (const track of tracks) {
      const { lon, lat } = track.state;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const px = map.project([lon, lat]);
      const color = statusColor(track.status);

      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute; left:${px.x - 6}px; top:${px.y - 6}px;
        width:12px; height:12px; border-radius:50%; background:${color};
        border:2px solid #fff; z-index:22; pointer-events:none;
      `;
      el.title = `${track.systemTrackId} (${track.status}) ${lat.toFixed(4)},${lon.toFixed(4)}`;
      container.appendChild(el);

      // Label
      const lbl = document.createElement('div');
      lbl.style.cssText = `
        position:absolute; left:${px.x + 9}px; top:${px.y - 7}px;
        font-size:9px; color:#fff; white-space:nowrap;
        text-shadow:0 0 3px #000, 0 0 3px #000; z-index:23;
        pointer-events:none; font-family:monospace;
      `;
      lbl.textContent = track.systemTrackId;
      container.appendChild(lbl);
    }
  }, [map, tracks, sensors]);

  // Re-render on map move/zoom
  useEffect(() => {
    if (!map) return;

    const onMove = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(render);
    };

    map.on('move', onMove);
    map.on('zoom', onMove);
    render(); // initial draw

    return () => {
      map.off('move', onMove);
      map.off('zoom', onMove);
      cancelAnimationFrame(frameRef.current);
    };
  }, [map, render]);

  // Re-render when data changes
  useEffect(() => {
    render();
  }, [tracks, sensors, render]);

  return (
    <>
      {/* Overlay container for HTML markers */}
      <div
        ref={overlayRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 15,
        }}
      />

      {/* Diagnostic info panel */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'rgba(0,0,0,0.85)',
          color: '#e0e0e0',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'monospace',
          zIndex: 30,
          maxWidth: '300px',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#ff8800' }}>
          DEBUG OVERLAY (HTML markers)
        </div>
        <div>layersReady: <span style={{ color: layersReady ? '#0c0' : '#f33' }}>{String(layersReady)}</span></div>
        <div>tracks in store: <strong>{tracks.length}</strong></div>
        <div>sensors in store: <strong>{sensors.length}</strong></div>
        {tracks.length > 0 && (
          <div style={{ marginTop: '4px', fontSize: '9px', color: '#aaa' }}>
            First track: {tracks[0].systemTrackId} @ {tracks[0].state.lat.toFixed(4)},{tracks[0].state.lon.toFixed(4)}
          </div>
        )}
        {sensors.length > 0 && (
          <div style={{ fontSize: '9px', color: '#aaa' }}>
            First sensor: {sensors[0].sensorId} @ {sensors[0].position.lat.toFixed(4)},{sensors[0].position.lon.toFixed(4)}
          </div>
        )}
      </div>
    </>
  );
}
