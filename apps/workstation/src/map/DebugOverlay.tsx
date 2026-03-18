import React, { useEffect, useRef, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import type { SystemTrack, SensorState } from '@eloc2/domain';
import type { LayerVisibility } from '../stores/ui-store';

/**
 * DebugOverlay — Primary HTML/SVG-based renderer.
 * Draws tracks, sensors, coverage arcs, EO rays, triangulation, and
 * bearing lines as positioned HTML divs + SVG paths using map.project().
 *
 * Bypasses MapLibre's WebGL rendering which fails in production
 * due to glyph CDN / WebGL pipeline stalls. This is the RELIABLE
 * rendering path. See Blank_Map_Postmortem_and_Testing_Lessons.md.
 */

const DEG_TO_RAD = Math.PI / 180;

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

/**
 * Compute a point at (rangeM) meters from (lon, lat) along azimuth azDeg.
 * Returns [lon, lat].
 */
function geoOffset(lon: number, lat: number, azDeg: number, rangeM: number): [number, number] {
  const azRad = azDeg * DEG_TO_RAD;
  const mPerDegLon = 111320 * Math.cos(lat * DEG_TO_RAD);
  const mPerDegLat = 110540;
  return [
    lon + (rangeM / mPerDegLon) * Math.sin(azRad),
    lat + (rangeM / mPerDegLat) * Math.cos(azRad),
  ];
}

interface DebugOverlayProps {
  map: maplibregl.Map | null;
  tracks: SystemTrack[];
  sensors: SensorState[];
  trailHistory: Map<string, Array<{ lon: number; lat: number }>>;
  layersReady: boolean;
  layerVisibility: LayerVisibility;
  onSelectTrack?: (id: string) => void;
  onSelectSensor?: (id: string) => void;
}

export function DebugOverlay({ map, tracks, sensors, trailHistory, layersReady, layerVisibility, onSelectTrack, onSelectSensor }: DebugOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<number>(0);

  const render = useCallback(() => {
    if (!map || !overlayRef.current || !svgRef.current) return;

    const container = overlayRef.current;
    const svg = svgRef.current;
    container.innerHTML = '';
    // SVG is a sibling, clear it separately
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const showSensors = layerVisibility.sensors;
    const showSensorLabels = layerVisibility.sensorLabels;
    const showTracks = layerVisibility.tracks;
    const showTrackLabels = layerVisibility.trackLabels;

    // ── SVG Geometry: Coverage arcs, EO rays, triangulation, bearings ──

    // Helper to project geo coords to screen pixel
    const proj = (lon: number, lat: number) => map.project([lon, lat]);

    // Radar coverage arcs
    if (layerVisibility.radarCoverage) {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'radar' || !sensor.online) continue;
        const cov = sensor.coverage;
        if (!cov || !Number.isFinite(cov.maxRangeM) || cov.maxRangeM <= 0) continue;
        drawCoverageArc(svg, map, sensor, cov, '#4488ff', 0.08, '#4488ff', 0.35);
      }
    }

    // EO field of regard (FOR)
    if (layerVisibility.eoFor) {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo' || !sensor.online) continue;
        const cov = sensor.coverage;
        if (!cov || !Number.isFinite(cov.maxRangeM) || cov.maxRangeM <= 0) continue;
        drawCoverageArc(svg, map, sensor, cov, 'none', 0, '#ff8800', 0.5, true);
      }
    }

    // EO field of view (FOV)
    if (layerVisibility.eoFov) {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo' || !sensor.online) continue;
        const cov = sensor.coverage;
        if (!cov || !sensor.gimbal || !sensor.fov) continue;
        if (!Number.isFinite(cov.maxRangeM) || cov.maxRangeM <= 0) continue;
        drawFovCone(svg, map, sensor, '#ff8800', 0.25);
      }
    }

    // EO gimbal rays
    if (layerVisibility.eoRays) {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo' || !sensor.gimbal || !sensor.online) continue;
        if (!Number.isFinite(sensor.gimbal.azimuthDeg)) continue;
        const { lon, lat } = sensor.position;
        const endPos = geoOffset(lon, lat, sensor.gimbal.azimuthDeg, 40000);
        const p1 = proj(lon, lat);
        const p2 = proj(endPos[0], endPos[1]);
        const line = createSvgEl('line', {
          x1: String(p1.x), y1: String(p1.y),
          x2: String(p2.x), y2: String(p2.y),
          stroke: '#ff8800', 'stroke-width': '2', 'stroke-opacity': '0.7',
          'stroke-dasharray': '6,3',
        });
        svg.appendChild(line);
      }
    }

    // Triangulation rays (EO sensor → track lines)
    if (layerVisibility.triangulation) {
      const sensorMap = new Map(sensors.map(s => [s.sensorId as string, s]));
      for (const track of tracks) {
        if (track.eoInvestigationStatus === 'none' || track.status === 'dropped') continue;
        const eoSources = (track.sources ?? []).filter(sid => {
          const s = sensorMap.get(sid as string);
          return s && s.sensorType === 'eo';
        });
        if (eoSources.length === 0) continue;

        const quality = eoSources.length >= 3 ? 'strong' : eoSources.length === 2 ? 'acceptable' : 'weak';
        const color = quality === 'strong' ? '#00cc44' : quality === 'acceptable' ? '#ffcc00' : '#ff8800';

        for (const sensorId of eoSources) {
          const sensor = sensorMap.get(sensorId as string);
          if (!sensor) continue;
          const p1 = proj(sensor.position.lon, sensor.position.lat);
          const p2 = proj(track.state.lon, track.state.lat);
          const line = createSvgEl('line', {
            x1: String(p1.x), y1: String(p1.y),
            x2: String(p2.x), y2: String(p2.y),
            stroke: color, 'stroke-width': '2', 'stroke-opacity': '0.8',
          });
          svg.appendChild(line);
        }
      }
    }

    // ── HTML: Sensors, trails, tracks ──

    // Draw sensors as squares
    if (showSensors || showSensorLabels) {
      for (const sensor of sensors) {
        const { lon, lat } = sensor.position;
        const px = proj(lon, lat);
        const color = sensor.online ? sensorColor(sensor.sensorType) : '#555555';

        if (showSensors) {
          const el = document.createElement('div');
          el.style.cssText = `
            position:absolute; left:${px.x - 7}px; top:${px.y - 7}px;
            width:14px; height:14px; background:${color};
            border:2px solid #000; z-index:20; cursor:pointer;
            pointer-events:auto;
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

    // Draw trail dots (fading breadcrumbs behind tracks)
    if (showTracks && trailHistory.size > 0) {
      const trackStatusMap = new Map(tracks.map(t => [t.systemTrackId as string, t.status]));
      for (const [trackId, positions] of trailHistory) {
        const status = trackStatusMap.get(trackId) ?? 'tentative';
        const color = statusColor(status);
        const count = positions.length;
        // Skip last position (that's the current track icon position)
        for (let i = 0; i < count - 1; i++) {
          const age = count - 1 - i;
          const opacity = Math.max(0.15, 1.0 - (age / 5) * 0.85);
          const { lon, lat } = positions[i];
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
          const px = proj(lon, lat);
          const dot = document.createElement('div');
          dot.style.cssText = `
            position:absolute; left:${px.x - 3}px; top:${px.y - 3}px;
            width:6px; height:6px; border-radius:50%; background:${color};
            opacity:${opacity}; z-index:18;
          `;
          container.appendChild(dot);
        }
      }
    }

    // Draw tracks as circles
    if (showTracks || showTrackLabels) {
      for (const track of tracks) {
        const { lon, lat } = track.state;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

        const px = proj(lon, lat);
        const color = statusColor(track.status);

        if (showTracks) {
          const el = document.createElement('div');
          el.style.cssText = `
            position:absolute; left:${px.x - 6}px; top:${px.y - 6}px;
            width:12px; height:12px; border-radius:50%; background:${color};
            border:2px solid #fff; z-index:22; cursor:pointer;
            pointer-events:auto;
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
  }, [map, tracks, sensors, trailHistory, layerVisibility, onSelectTrack, onSelectSensor]);

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
  }, [tracks, sensors, trailHistory, render]);

  return (
    <>
      {/* SVG layer for geometry (arcs, rays, lines) — below HTML markers */}
      <svg
        ref={svgRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 14,
          overflow: 'hidden',
        }}
      />
      {/* HTML layer for markers (tracks, sensors, labels) — above SVG */}
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
    </>
  );
}

// ─── SVG Helpers ────────────────────────────────────────────────────────────

function createSvgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/**
 * Draw a coverage arc (radar full circle or EO sector) as an SVG polygon/path.
 */
function drawCoverageArc(
  svg: SVGSVGElement,
  map: maplibregl.Map,
  sensor: SensorState,
  cov: { minAzDeg: number; maxAzDeg: number; maxRangeM: number },
  fillColor: string,
  fillOpacity: number,
  strokeColor: string,
  strokeOpacity: number,
  dashedStroke = false,
) {
  const { lon, lat } = sensor.position;
  const center = map.project([lon, lat]);
  const isFullCircle = (cov.maxAzDeg - cov.minAzDeg) >= 359;
  const startDeg = isFullCircle ? 0 : cov.minAzDeg;
  const endDeg = isFullCircle ? 360 : cov.maxAzDeg;
  const segments = 48;

  const points: string[] = [`${center.x},${center.y}`];
  for (let i = 0; i <= segments; i++) {
    const azDeg = startDeg + ((endDeg - startDeg) * i) / segments;
    const [eLon, eLat] = geoOffset(lon, lat, azDeg, cov.maxRangeM);
    const p = map.project([eLon, eLat]);
    points.push(`${p.x},${p.y}`);
  }
  points.push(`${center.x},${center.y}`);

  const polygon = createSvgEl('polygon', {
    points: points.join(' '),
    fill: fillColor,
    'fill-opacity': String(fillOpacity),
    stroke: strokeColor,
    'stroke-opacity': String(strokeOpacity),
    'stroke-width': '1.5',
    ...(dashedStroke ? { 'stroke-dasharray': '4,4' } : {}),
  });
  svg.appendChild(polygon);
}

/**
 * Draw EO FOV cone as an SVG polygon.
 */
function drawFovCone(
  svg: SVGSVGElement,
  map: maplibregl.Map,
  sensor: SensorState,
  fillColor: string,
  fillOpacity: number,
) {
  if (!sensor.gimbal || !sensor.fov || !sensor.coverage) return;
  const { lon, lat } = sensor.position;
  const center = map.project([lon, lat]);
  const azDeg = sensor.gimbal.azimuthDeg;
  const halfAngle = sensor.fov.halfAngleHDeg;
  const rangeM = sensor.coverage.maxRangeM;

  const startAz = azDeg - halfAngle;
  const endAz = azDeg + halfAngle;
  const segments = 12;

  const points: string[] = [`${center.x},${center.y}`];
  for (let i = 0; i <= segments; i++) {
    const az = startAz + ((endAz - startAz) * i) / segments;
    const [eLon, eLat] = geoOffset(lon, lat, az, rangeM);
    const p = map.project([eLon, eLat]);
    points.push(`${p.x},${p.y}`);
  }
  points.push(`${center.x},${center.y}`);

  const polygon = createSvgEl('polygon', {
    points: points.join(' '),
    fill: fillColor,
    'fill-opacity': String(fillOpacity),
    stroke: fillColor,
    'stroke-opacity': '0.6',
    'stroke-width': '1',
  });
  svg.appendChild(polygon);
}
