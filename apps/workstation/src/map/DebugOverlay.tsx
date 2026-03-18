import React, { useEffect, useRef, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import type { SystemTrack, SensorState } from '@eloc2/domain';
import type { LayerVisibility } from '../stores/ui-store';

/**
 * DebugOverlay — Primary HTML-based track/sensor renderer.
 * Draws targets and sensors as positioned HTML divs using map.project().
 * Bypasses MapLibre's GeoJSON/GL rendering which may fail due to glyph
 * CDN issues or WebGL stalls in production deployments.
 *
 * This is the RELIABLE rendering path — it always works regardless of
 * MapLibre layer state. MapLibre layers handle coverage arcs, EO rays,
 * triangulation, and other geometry overlays.
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

/** Generate a short label for a track: T1, T2, etc. */
function shortTrackLabel(track: SystemTrack): string {
  const id = track.systemTrackId as string;
  const numMatch = id.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 0;
  let label = `T${num}`;
  const idSupport = (track as any).identificationSupport;
  if (idSupport && idSupport !== 'unknown' && idSupport !== 'none') {
    label += ` ${idSupport}`;
  }
  return label;
}

/** Generate a short label for a sensor: R1, E2, C1 */
function shortSensorLabel(sensor: SensorState): string {
  const prefix = sensor.sensorType === 'radar' ? 'R' : sensor.sensorType === 'eo' ? 'E' : 'C';
  const idNum = (sensor.sensorId as string).match(/(\d+)/)?.[1] ?? '?';
  return `${prefix}${idNum}`;
}

interface DebugOverlayProps {
  map: maplibregl.Map | null;
  tracks: SystemTrack[];
  sensors: SensorState[];
  layersReady: boolean;
  layerVisibility: LayerVisibility;
  onSelectTrack?: (id: string) => void;
  onSelectSensor?: (id: string) => void;
}

export function DebugOverlay({ map, tracks, sensors, layersReady, layerVisibility, onSelectTrack, onSelectSensor }: DebugOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  const render = useCallback(() => {
    if (!map || !overlayRef.current) return;

    const container = overlayRef.current;
    container.innerHTML = '';

    const showSensors = layerVisibility.sensors;
    const showSensorLabels = layerVisibility.sensorLabels;
    const showTracks = layerVisibility.tracks;
    const showTrackLabels = layerVisibility.trackLabels;

    // Draw sensors as squares
    if (showSensors || showSensorLabels) {
      for (const sensor of sensors) {
        const { lon, lat } = sensor.position;
        const px = map.project([lon, lat]);
        const color = sensor.online ? sensorColor(sensor.sensorType) : '#555555';

        if (showSensors) {
          const el = document.createElement('div');
          el.style.cssText = `
            position:absolute; left:${px.x - 7}px; top:${px.y - 7}px;
            width:14px; height:14px; background:${color};
            border:2px solid #000; z-index:20; cursor:pointer;
          `;
          el.title = `${shortSensorLabel(sensor)} — ${sensor.sensorId}`;
          if (onSelectSensor) {
            const sId = sensor.sensorId as string;
            el.addEventListener('click', (e) => { e.stopPropagation(); onSelectSensor(sId); });
          }
          container.appendChild(el);
        }

        if (showSensorLabels) {
          const lbl = document.createElement('div');
          lbl.style.cssText = `
            position:absolute; left:${px.x + 10}px; top:${px.y - 8}px;
            font-size:10px; color:${color}; white-space:nowrap;
            text-shadow:0 0 3px #000, 0 0 3px #000; z-index:21;
            pointer-events:none; font-family:monospace; font-weight:bold;
          `;
          lbl.textContent = shortSensorLabel(sensor);
          container.appendChild(lbl);
        }
      }
    }

    // Draw tracks as circles
    if (showTracks || showTrackLabels) {
      for (const track of tracks) {
        const { lon, lat } = track.state;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

        const px = map.project([lon, lat]);
        const color = statusColor(track.status);

        if (showTracks) {
          const el = document.createElement('div');
          el.style.cssText = `
            position:absolute; left:${px.x - 6}px; top:${px.y - 6}px;
            width:12px; height:12px; border-radius:50%; background:${color};
            border:2px solid #fff; z-index:22; cursor:pointer;
          `;
          el.title = `${shortTrackLabel(track)} — ${track.status}`;
          if (onSelectTrack) {
            const tId = track.systemTrackId as string;
            el.addEventListener('click', (e) => { e.stopPropagation(); onSelectTrack(tId); });
          }
          container.appendChild(el);
        }

        if (showTrackLabels) {
          const lbl = document.createElement('div');
          lbl.style.cssText = `
            position:absolute; left:${px.x + 9}px; top:${px.y - 7}px;
            font-size:9px; color:#fff; white-space:nowrap;
            text-shadow:0 0 3px #000, 0 0 3px #000; z-index:23;
            pointer-events:none; font-family:monospace;
          `;
          lbl.textContent = shortTrackLabel(track);
          container.appendChild(lbl);
        }
      }
    }
  }, [map, tracks, sensors, layerVisibility, onSelectTrack, onSelectSensor]);

  // Re-render on map move/zoom
  useEffect(() => {
    if (!map) return;

    const onMove = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(render);
    };

    map.on('move', onMove);
    map.on('zoom', onMove);
    render();

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
  );
}
