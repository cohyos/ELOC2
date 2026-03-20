import React, { useEffect, useRef, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';
import type { SystemTrack, SensorState } from '@eloc2/domain';
import type { LayerVisibility } from '../stores/ui-store';
import { useUiStore } from '../stores/ui-store';
import type { GroundTruthTarget } from '../stores/ground-truth-store';
import type { CoverZone, OperationalZone } from '../stores/cover-zone-store';
import type { SearchModeStateWS } from '../stores/sensor-store';
import type { FovOverlap, BearingAssociation, MultiSensorResolution } from '../stores/fov-overlap-store';
import type { BallisticEstimateWS } from '../stores/task-store';
import { resolveTrackSymbol, resolveSensorSymbol } from './symbols/symbol-resolver';
import { EoVideoPopup } from './EoVideoPopup';

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
  onSelectGroundTruth?: (id: string) => void;
  selectedGroundTruthId?: string | null;
  groundTruthTargets?: GroundTruthTarget[];
  showGroundTruth?: boolean;
  coverZones?: CoverZone[];
  operationalZones?: OperationalZone[];
  searchModeStates?: SearchModeStateWS[];
  fovOverlaps?: FovOverlap[];
  bearingAssociations?: BearingAssociation[];
  multiSensorResolutions?: MultiSensorResolution[];
  convergedTrackIds?: Set<string>;
  ballisticEstimates?: BallisticEstimateWS[];
}

export function DebugOverlay({ map, tracks, sensors, trailHistory, layersReady, layerVisibility, onSelectTrack, onSelectSensor, onSelectGroundTruth, selectedGroundTruthId, groundTruthTargets, showGroundTruth, coverZones, operationalZones, searchModeStates, fovOverlaps, bearingAssociations, multiSensorResolutions, convergedTrackIds, ballisticEstimates }: DebugOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<number>(0);

  // --- Event delegation: single persistent handler instead of per-element listeners ---
  // This avoids lost clicks when the DOM is rebuilt during frequent re-renders.
  const callbacksRef = useRef({ onSelectTrack, onSelectSensor, onSelectGroundTruth });
  callbacksRef.current = { onSelectTrack, onSelectSensor, onSelectGroundTruth };

  useEffect(() => {
    const container = overlayRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Walk up to find data attribute
      const trackEl = target.closest('[data-track-id]') as HTMLElement | null;
      if (trackEl) {
        e.stopPropagation();
        const id = trackEl.dataset.trackId!;
        callbacksRef.current.onSelectTrack?.(id);
        return;
      }
      const sensorEl = target.closest('[data-sensor-id]') as HTMLElement | null;
      if (sensorEl) {
        e.stopPropagation();
        const id = sensorEl.dataset.sensorId!;
        callbacksRef.current.onSelectSensor?.(id);
        return;
      }
      const gtEl = target.closest('[data-gt-id]') as HTMLElement | null;
      if (gtEl) {
        e.stopPropagation();
        const id = gtEl.dataset.gtId!;
        callbacksRef.current.onSelectGroundTruth?.(id);
        return;
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const trackEl = target.closest('[data-track-id]') as HTMLElement | null;
      if (trackEl) {
        e.stopPropagation();
        const id = trackEl.dataset.trackId!;
        useUiStore.getState().setEoVideoPopupTrackId(id);
      }
    };

    container.addEventListener('click', handleClick);
    container.addEventListener('dblclick', handleDblClick);
    return () => {
      container.removeEventListener('click', handleClick);
      container.removeEventListener('dblclick', handleDblClick);
    };
  }, []);

  const render = useCallback(() => {
    if (!map || !overlayRef.current || !svgRef.current) return;

    const container = overlayRef.current;
    const svg = svgRef.current;
    container.innerHTML = '';
    // SVG is a sibling, clear it separately
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const showSensors = layerVisibility.sensors;
    const showSensorLabels = layerVisibility.sensorLabels;
    const showTracks = showGroundTruth ? false : layerVisibility.tracks;
    const showTrackLabels = showGroundTruth ? false : layerVisibility.trackLabels;

    // ── SVG Geometry: Coverage arcs, EO rays, triangulation, bearings ──

    // Helper to project geo coords to screen pixel
    const proj = (lon: number, lat: number) => map.project([lon, lat]);

    // Cover zone polygons (rendered first so they appear behind all other SVG)
    if (coverZones && coverZones.length > 0) {
      const coverTypeStyle: Record<string, { fill: string; stroke: string }> = {
        urban:  { fill: 'rgba(255, 165, 0, 0.15)',  stroke: 'rgba(255, 165, 0, 0.4)' },
        forest: { fill: 'rgba(34, 139, 34, 0.15)',   stroke: 'rgba(34, 139, 34, 0.4)' },
        water:  { fill: 'rgba(0, 100, 200, 0.15)',   stroke: 'rgba(0, 100, 200, 0.4)' },
        open:   { fill: 'rgba(200, 180, 100, 0.10)', stroke: 'rgba(200, 180, 100, 0.4)' },
      };

      for (const zone of coverZones) {
        if (!zone.polygon || zone.polygon.length < 3) continue;

        const style = coverTypeStyle[zone.coverType] ?? coverTypeStyle.open;
        const points: string[] = [];
        let centroidX = 0;
        let centroidY = 0;

        for (const vertex of zone.polygon) {
          if (!Number.isFinite(vertex.lon) || !Number.isFinite(vertex.lat)) continue;
          const p = proj(vertex.lon, vertex.lat);
          points.push(`${p.x},${p.y}`);
          centroidX += p.x;
          centroidY += p.y;
        }

        if (points.length < 3) continue;

        centroidX /= points.length;
        centroidY /= points.length;

        const polygon = createSvgEl('polygon', {
          points: points.join(' '),
          fill: style.fill,
          stroke: style.stroke,
          'stroke-width': '1',
          'stroke-dasharray': '4,3',
        });
        svg.appendChild(polygon);

        // Zone name label at centroid
        if (zone.name) {
          const label = createSvgEl('text', {
            x: String(centroidX),
            y: String(centroidY),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': '10',
            'font-family': 'monospace',
            fill: style.stroke,
            'pointer-events': 'none',
          });
          label.textContent = zone.name;
          svg.appendChild(label);
        }
      }
    }

    // Operational zones (threat corridors, exclusion areas, engagement zones)
    if (operationalZones && operationalZones.length > 0) {
      const zoneStyles: Record<string, { fill: string; stroke: string; dash: string }> = {
        threat_corridor: { fill: 'rgba(255, 50, 50, 0.12)', stroke: 'rgba(255, 50, 50, 0.7)', dash: '8,4' },
        exclusion:       { fill: 'rgba(255, 0, 0, 0.08)',   stroke: 'rgba(255, 0, 0, 0.6)',   dash: '12,4,4,4' },
        engagement:      { fill: 'rgba(0, 200, 100, 0.08)', stroke: 'rgba(0, 200, 100, 0.5)', dash: '6,3' },
        safe_passage:    { fill: 'rgba(0, 150, 255, 0.08)', stroke: 'rgba(0, 150, 255, 0.5)', dash: '4,4' },
      };

      for (const zone of operationalZones) {
        if (!zone.polygon || zone.polygon.length < 3) continue;

        const style = zoneStyles[zone.zoneType] ?? zoneStyles.threat_corridor;
        const points: string[] = [];
        let cx = 0, cy = 0;

        for (const v of zone.polygon) {
          if (!Number.isFinite(v.lon) || !Number.isFinite(v.lat)) continue;
          const p = proj(v.lon, v.lat);
          points.push(`${p.x},${p.y}`);
          cx += p.x;
          cy += p.y;
        }
        if (points.length < 3) continue;
        cx /= points.length;
        cy /= points.length;

        const poly = createSvgEl('polygon', {
          points: points.join(' '),
          fill: zone.color ? `${zone.color}20` : style.fill,
          stroke: zone.color ?? style.stroke,
          'stroke-width': '2',
          'stroke-dasharray': style.dash,
        });
        svg.appendChild(poly);

        // Label
        const label = createSvgEl('text', {
          x: String(cx),
          y: String(cy),
          fill: zone.color ?? style.stroke,
          'font-size': '10',
          'font-family': 'monospace',
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-weight': '600',
        });
        label.textContent = zone.name;
        svg.appendChild(label);
      }
    }

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

    // FOV overlap regions (semi-transparent yellow polygons)
    if (fovOverlaps && fovOverlaps.length > 0 && layerVisibility.eoFov) {
      for (const overlap of fovOverlaps) {
        if (!overlap.overlapRegion || overlap.overlapRegion.length < 2) continue;

        if (overlap.overlapRegion.length >= 3) {
          // Render as polygon
          const points: string[] = [];
          for (const vertex of overlap.overlapRegion) {
            if (!Number.isFinite(vertex.lon) || !Number.isFinite(vertex.lat)) continue;
            const p = proj(vertex.lon, vertex.lat);
            points.push(`${p.x},${p.y}`);
          }
          if (points.length >= 3) {
            const polygon = createSvgEl('polygon', {
              points: points.join(' '),
              fill: 'rgba(255, 255, 0, 0.1)',
              stroke: 'rgba(255, 255, 0, 0.4)',
              'stroke-width': '1.5',
              'stroke-dasharray': '4,3',
            });
            svg.appendChild(polygon);
          }
        } else {
          // Single point indicator — render as a small circle
          const pt = overlap.overlapRegion[0];
          if (Number.isFinite(pt.lon) && Number.isFinite(pt.lat)) {
            const p = proj(pt.lon, pt.lat);
            const circle = createSvgEl('circle', {
              cx: String(p.x),
              cy: String(p.y),
              r: '6',
              fill: 'rgba(255, 255, 0, 0.3)',
              stroke: 'rgba(255, 255, 0, 0.6)',
              'stroke-width': '1.5',
            });
            svg.appendChild(circle);
          }
        }
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

    // Bearing association indicators (ambiguous/low-confidence bearing rays)
    if (bearingAssociations && bearingAssociations.length > 0 && layerVisibility.eoRays) {
      const sensorMap = new Map(sensors.map(s => [s.sensorId as string, s]));
      const trackMap = new Map(tracks.map(t => [t.systemTrackId as string, t]));

      for (const assoc of bearingAssociations) {
        const sensor = sensorMap.get(assoc.sensorId);
        if (!sensor || !sensor.online) continue;

        const { lon, lat } = sensor.position;
        const endPos = geoOffset(lon, lat, assoc.bearing, 40000);
        const p1 = proj(lon, lat);
        const p2 = proj(endPos[0], endPos[1]);

        // Low-confidence (< 0.5): dotted line instead of solid
        if (assoc.confidence < 0.5) {
          const line = createSvgEl('line', {
            x1: String(p1.x), y1: String(p1.y),
            x2: String(p2.x), y2: String(p2.y),
            stroke: '#ff4400', 'stroke-width': '2', 'stroke-opacity': '0.6',
            'stroke-dasharray': '2,4',
          });
          svg.appendChild(line);
        }

        // Ambiguous: warning icon at bearing ray midpoint
        if (assoc.ambiguous) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          // Orange warning triangle using SVG text
          const warning = createSvgEl('text', {
            x: String(midX),
            y: String(midY),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': '14',
            fill: '#ff8800',
            'pointer-events': 'none',
          });
          warning.textContent = '\u26A0'; // ⚠
          svg.appendChild(warning);

          // Confidence label below warning
          const confLabel = createSvgEl('text', {
            x: String(midX),
            y: String(midY + 14),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': '9',
            'font-family': 'monospace',
            fill: '#ff8800',
            'fill-opacity': '0.8',
            'pointer-events': 'none',
          });
          confLabel.textContent = `${(assoc.confidence * 100).toFixed(0)}%`;
          svg.appendChild(confLabel);
        }
      }
    }

    // Multi-sensor association links (REQ-6): thin lines from contributing sensors to resolved position
    if (multiSensorResolutions && multiSensorResolutions.length > 0 && layerVisibility.triangulation) {
      const sensorMap = new Map(sensors.map(s => [s.sensorId as string, s]));

      for (const resolution of multiSensorResolutions) {
        if (resolution.sensorCount < 3 || !resolution.positionEstimate) continue;
        const { lat, lon } = resolution.positionEstimate;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const targetPx = proj(lon, lat);

        // Draw thin lines from each contributing sensor to the resolved position
        for (const sensorId of resolution.sensorIds) {
          const sensor = sensorMap.get(sensorId);
          if (!sensor) continue;
          const sensorPx = proj(sensor.position.lon, sensor.position.lat);
          const line = createSvgEl('line', {
            x1: String(sensorPx.x), y1: String(sensorPx.y),
            x2: String(targetPx.x), y2: String(targetPx.y),
            stroke: '#00cccc', 'stroke-width': '1', 'stroke-opacity': '0.3',
          });
          svg.appendChild(line);
        }
      }
    }

    // Search mode sweep lines (dashed light blue from sensor in scan direction)
    if (searchModeStates && searchModeStates.length > 0 && layerVisibility.sensors) {
      const searchMap = new Map(searchModeStates.map(s => [s.sensorId, s]));
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo') continue;
        const searchState = searchMap.get(sensor.sensorId as string);
        if (!searchState || !searchState.active) continue;

        const { lon, lat } = sensor.position;
        const endPos = geoOffset(lon, lat, searchState.currentAzimuth, 30000); // 30km line
        const p1 = proj(lon, lat);
        const p2 = proj(endPos[0], endPos[1]);
        const line = createSvgEl('line', {
          x1: String(p1.x), y1: String(p1.y),
          x2: String(p2.x), y2: String(p2.y),
          stroke: '#44aaff', 'stroke-width': '2', 'stroke-opacity': '0.5',
          'stroke-dasharray': '8,4',
        });
        svg.appendChild(line);

        // Small "SEARCH" label near sensor
        const labelX = p1.x + (p2.x - p1.x) * 0.15;
        const labelY = p1.y + (p2.y - p1.y) * 0.15;
        const label = createSvgEl('text', {
          x: String(labelX),
          y: String(labelY - 6),
          'font-size': '9',
          'font-family': 'monospace',
          fill: '#44aaff',
          'fill-opacity': '0.7',
          'text-anchor': 'start',
          'pointer-events': 'none',
        });
        label.textContent = 'SEARCH';
        svg.appendChild(label);
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

    // Draw sensors as squares (legacy) or NATO symbols
    const useNato = layerVisibility.useNatoSymbols;
    if (showSensors || showSensorLabels) {
      for (const sensor of sensors) {
        const { lon, lat } = sensor.position;
        const px = proj(lon, lat);
        const color = sensor.online ? sensorColor(sensor.sensorType) : '#555555';

        if (showSensors) {
          if (useNato) {
            const sym = resolveSensorSymbol(sensor, false, 24);
            const el = document.createElement('div');
            el.style.cssText = `
              position:absolute; left:${px.x - 12}px; top:${px.y - 12}px;
              width:24px; height:24px; z-index:20; cursor:pointer;
              pointer-events:auto;
            `;
            el.innerHTML = sym.svgHtml;
            el.title = `${shortSensorLabel(sensor)} — ${sensor.sensorId}`;
            el.dataset.sensorId = sensor.sensorId as string;
            container.appendChild(el);
          } else {
            const el = document.createElement('div');
            el.style.cssText = `
              position:absolute; left:${px.x - 7}px; top:${px.y - 7}px;
              width:14px; height:14px; background:${color};
              border:2px solid #000; z-index:20; cursor:pointer;
              pointer-events:auto;
            `;
            el.title = `${shortSensorLabel(sensor)} — ${sensor.sensorId}`;
            el.dataset.sensorId = sensor.sensorId as string;
            container.appendChild(el);
          }
        }

        if (showSensorLabels) {
          const sensorLblOffset = useNato ? 14 : 10;
          const lbl = document.createElement('div');
          lbl.style.cssText = `
            position:absolute; left:${px.x + sensorLblOffset}px; top:${px.y - 8}px;
            font-size:10px; color:${color}; white-space:nowrap;
            text-shadow:0 0 3px #000, 0 0 3px #000; z-index:21;
            pointer-events:none; font-family:monospace; font-weight:bold;
          `;
          lbl.textContent = shortSensorLabel(sensor);
          container.appendChild(lbl);
        }
      }
    }

    // Draw ground truth targets as cyan diamonds when GT mode is active
    if (showGroundTruth && groundTruthTargets && groundTruthTargets.length > 0) {
      for (const target of groundTruthTargets) {
        if (!target.active) continue;
        const { lon, lat } = target.position;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const px = proj(lon, lat);

        const gtId = target.targetId ?? target.name;
        const isSelected = selectedGroundTruthId === gtId;

        // Diamond marker (rotated square) — clickable to show details
        const el = document.createElement('div');
        const size = isSelected ? 18 : 14;
        const offset = size / 2;
        el.style.cssText = `
          position:absolute; left:${px.x - offset}px; top:${px.y - offset}px;
          width:${size}px; height:${size}px; background:${isSelected ? '#00ffff' : '#00ffff'};
          border:${isSelected ? '3px solid #fff' : '2px solid #fff'}; z-index:22; cursor:pointer;
          transform:rotate(45deg); pointer-events:auto;
          ${isSelected ? 'box-shadow:0 0 12px #00ffff, 0 0 24px #00ffff66;' : ''}
        `;
        el.title = `GT: ${target.name} — ${target.classification ?? 'unclassified'}`;
        el.dataset.gtId = gtId;
        container.appendChild(el);

        // Selection ring for selected GT target
        if (isSelected) {
          const ring = document.createElement('div');
          const ringSize = 32;
          ring.style.cssText = `
            position:absolute; left:${px.x - ringSize / 2}px; top:${px.y - ringSize / 2}px;
            width:${ringSize}px; height:${ringSize}px; border:2px solid #00ffff;
            border-radius:50%; z-index:21; pointer-events:none;
            box-shadow:0 0 8px #00ffff88; animation:pulse-ring 1.5s ease-in-out infinite;
          `;
          container.appendChild(ring);

          // Draw connecting line to nearest matched track
          let nearestDist = Infinity;
          let nearestTrack: typeof tracks[0] | null = null;
          for (const track of tracks) {
            const R = 6371000;
            const dLat = (track.state.lat - target.position.lat) * Math.PI / 180;
            const dLon = (track.state.lon - target.position.lon) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(target.position.lat * Math.PI / 180) * Math.cos(track.state.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (d < nearestDist) { nearestDist = d; nearestTrack = track; }
          }

          if (nearestTrack && nearestDist < 5000) {
            const trkPx = proj(nearestTrack.state.lon, nearestTrack.state.lat);
            // Dashed line from GT diamond to system track
            const line = createSvgEl('line', {
              x1: String(px.x), y1: String(px.y),
              x2: String(trkPx.x), y2: String(trkPx.y),
              stroke: nearestDist < 500 ? '#00cc44' : nearestDist < 2000 ? '#ffcc00' : '#ff3333',
              'stroke-width': '2',
              'stroke-dasharray': '6,4',
              'stroke-opacity': '0.8',
            });
            svg.appendChild(line);

            // Distance label at midpoint
            const midX = (px.x + trkPx.x) / 2;
            const midY = (px.y + trkPx.y) / 2;
            const distLbl = document.createElement('div');
            const distStr = nearestDist < 1000 ? `${nearestDist.toFixed(0)}m` : `${(nearestDist / 1000).toFixed(2)}km`;
            distLbl.style.cssText = `
              position:absolute; left:${midX}px; top:${midY - 8}px;
              font-size:9px; color:#fff; background:#000a; padding:1px 4px;
              border-radius:2px; z-index:24; pointer-events:none;
              font-family:monospace; white-space:nowrap;
            `;
            distLbl.textContent = distStr;
            container.appendChild(distLbl);
          }
        }

        // Name label
        const lbl = document.createElement('div');
        const lblOffset = isSelected ? 16 : 12;
        lbl.style.cssText = `
          position:absolute; left:${px.x + lblOffset}px; top:${px.y - 8}px;
          font-size:${isSelected ? '11px' : '10px'}; color:#00ffff; white-space:nowrap;
          text-shadow:0 0 3px #000, 0 0 3px #000; z-index:23;
          pointer-events:none; font-family:monospace; font-weight:bold;
        `;
        lbl.textContent = target.name;
        container.appendChild(lbl);

        // Classification label below name
        if (target.classification) {
          const cls = document.createElement('div');
          cls.style.cssText = `
            position:absolute; left:${px.x + lblOffset}px; top:${px.y + 4}px;
            font-size:9px; color:#00cccc; white-space:nowrap;
            text-shadow:0 0 3px #000, 0 0 3px #000; z-index:23;
            pointer-events:none; font-family:monospace;
          `;
          cls.textContent = target.classification;
          container.appendChild(cls);
        }

        // Velocity vector line
        if (target.velocity) {
          const { vx, vy } = target.velocity;
          const speed = Math.sqrt(vx * vx + vy * vy);
          if (speed > 0.1) {
            // Normalize and scale to ~30px length
            const scale = 30 / speed;
            const endX = px.x + vx * scale;
            const endY = px.y - vy * scale; // Invert Y for screen coords
            const line = createSvgEl('line', {
              x1: String(px.x), y1: String(px.y),
              x2: String(endX), y2: String(endY),
              stroke: '#00ffff', 'stroke-width': '2', 'stroke-opacity': '0.8',
            });
            svg.appendChild(line);
          }
        }
      }
    }

    // Draw trail dots (fading breadcrumbs behind tracks) with newest-dot flash
    if (showTracks && trailHistory.size > 0) {
      const trackStatusMap = new Map(tracks.map(t => [t.systemTrackId as string, t.status]));
      for (const [trackId, positions] of trailHistory) {
        const status = trackStatusMap.get(trackId) ?? 'tentative';
        const color = statusColor(status);
        const count = positions.length;
        // The newest trail dot is at index count - 2 (count - 1 is current position)
        const newestTrailIdx = count - 2;
        // Skip last position (that's the current track icon position)
        for (let i = 0; i < count - 1; i++) {
          const age = count - 1 - i;
          const isNewest = i === newestTrailIdx;
          const opacity = isNewest ? 1.0 : Math.max(0.15, 1.0 - (age / 5) * 0.85);
          const size = isNewest ? 8 : 6;
          const halfSize = size / 2;
          const { lon, lat } = positions[i];
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
          const px = proj(lon, lat);
          const dot = document.createElement('div');
          if (isNewest) {
            dot.style.cssText = `
              position:absolute; left:${px.x - halfSize}px; top:${px.y - halfSize}px;
              width:${size}px; height:${size}px; border-radius:50%; background:${color};
              opacity:1; z-index:19;
              box-shadow:0 0 6px 2px ${color};
              animation:trail-flash 0.8s ease-out;
            `;
          } else {
            dot.style.cssText = `
              position:absolute; left:${px.x - halfSize}px; top:${px.y - halfSize}px;
              width:${size}px; height:${size}px; border-radius:50%; background:${color};
              opacity:${opacity}; z-index:18;
            `;
          }
          container.appendChild(dot);
        }
      }
    }

    // Uncertainty ellipses (SVG, behind markers)
    if (layerVisibility.trackEllipses && showTracks) {
      for (const track of tracks) {
        const { lon, lat } = track.state;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const cov = track.covariance;
        if (!cov || !cov[0] || !cov[1]) continue;

        const semiAxisXm = Math.sqrt(Math.abs(cov[0][0] ?? 100));
        const semiAxisYm = Math.sqrt(Math.abs(cov[1][1] ?? 100));
        const mPerDegLon = 111320 * Math.cos(lat * DEG_TO_RAD);
        const mPerDegLat = 110540;
        // Scale by 3x for visibility
        const semiAxisXdeg = (semiAxisXm / mPerDegLon) * 3;
        const semiAxisYdeg = (semiAxisYm / mPerDegLat) * 3;

        // Generate 24-segment ellipse polygon in screen coords
        const segments = 24;
        const points: string[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (2 * Math.PI * i) / segments;
          const eLon = lon + semiAxisXdeg * Math.cos(angle);
          const eLat = lat + semiAxisYdeg * Math.sin(angle);
          const p = proj(eLon, eLat);
          points.push(`${p.x},${p.y}`);
        }

        const color = statusColor(track.status);
        const ellipse = createSvgEl('polygon', {
          points: points.join(' '),
          fill: color,
          'fill-opacity': '0.1',
          stroke: color,
          'stroke-opacity': '0.4',
          'stroke-width': '1',
        });
        svg.appendChild(ellipse);
      }
    }

    // ── Ballistic launch/impact estimates ──
    if (ballisticEstimates && ballisticEstimates.length > 0) {
      for (const est of ballisticEstimates) {
        // Launch point: green dashed circle
        if (est.launchPoint && Number.isFinite(est.launchPoint.lat) && Number.isFinite(est.launchPoint.lon)) {
          const lp = est.launchPoint;
          const px = proj(lp.lon, lp.lat);
          const mPerDegLat = 110540;
          const uncertaintyDeg = lp.uncertainty2SigmaM / mPerDegLat;
          const edgePx = proj(lp.lon, lp.lat + uncertaintyDeg);
          const radiusPx = Math.max(8, Math.abs(px.y - edgePx.y));

          svg.appendChild(createSvgEl('circle', {
            cx: String(px.x), cy: String(px.y), r: String(radiusPx),
            fill: 'rgba(0, 200, 68, 0.08)', stroke: '#00cc44',
            'stroke-width': '2', 'stroke-dasharray': '6,4', 'stroke-opacity': '0.8',
          }));
          // Cross marker
          const cs = 6;
          svg.appendChild(createSvgEl('line', { x1: String(px.x - cs), y1: String(px.y), x2: String(px.x + cs), y2: String(px.y), stroke: '#00cc44', 'stroke-width': '2' }));
          svg.appendChild(createSvgEl('line', { x1: String(px.x), y1: String(px.y - cs), x2: String(px.x), y2: String(px.y + cs), stroke: '#00cc44', 'stroke-width': '2' }));
          // Label
          svg.appendChild(createSvgEl('text', {
            x: String(px.x + 10), y: String(px.y - 4), 'font-size': '10', 'font-family': 'monospace',
            'font-weight': '600', fill: '#00cc44', 'text-anchor': 'start', 'pointer-events': 'none',
          })).textContent = `LAUNCH ${(lp.uncertainty2SigmaM / 1000).toFixed(1)}km`;
        }

        // Impact point: red dashed circle
        if (est.impactPoint && Number.isFinite(est.impactPoint.lat) && Number.isFinite(est.impactPoint.lon)) {
          const ip = est.impactPoint;
          const px = proj(ip.lon, ip.lat);
          const mPerDegLat = 110540;
          const uncertaintyDeg = ip.uncertainty2SigmaM / mPerDegLat;
          const edgePx = proj(ip.lon, ip.lat + uncertaintyDeg);
          const radiusPx = Math.max(8, Math.abs(px.y - edgePx.y));

          svg.appendChild(createSvgEl('circle', {
            cx: String(px.x), cy: String(px.y), r: String(radiusPx),
            fill: 'rgba(255, 50, 50, 0.08)', stroke: '#ff3333',
            'stroke-width': '2', 'stroke-dasharray': '6,4', 'stroke-opacity': '0.8',
          }));
          // X marker
          const cs = 6;
          svg.appendChild(createSvgEl('line', { x1: String(px.x - cs), y1: String(px.y - cs), x2: String(px.x + cs), y2: String(px.y + cs), stroke: '#ff3333', 'stroke-width': '2' }));
          svg.appendChild(createSvgEl('line', { x1: String(px.x + cs), y1: String(px.y - cs), x2: String(px.x - cs), y2: String(px.y + cs), stroke: '#ff3333', 'stroke-width': '2' }));
          // Label with time-to-impact
          const tti = ip.timeToImpactSec > 0 ? ` T-${ip.timeToImpactSec.toFixed(0)}s` : '';
          svg.appendChild(createSvgEl('text', {
            x: String(px.x + 10), y: String(px.y - 4), 'font-size': '10', 'font-family': 'monospace',
            'font-weight': '600', fill: '#ff3333', 'text-anchor': 'start', 'pointer-events': 'none',
          })).textContent = `IMPACT ${(ip.uncertainty2SigmaM / 1000).toFixed(1)}km${tti}`;
        }
      }
    }

    // Build set of multi-sensor resolved track IDs for diamond markers
    const multiSensorTrackIds = new Set<string>();
    if (multiSensorResolutions) {
      for (const r of multiSensorResolutions) {
        if (r.sensorCount >= 3 && r.method === 'multi-sensor') {
          multiSensorTrackIds.add(r.trackId);
        }
      }
    }

    // Draw tracks as circles/diamonds (legacy) or NATO symbols
    if (showTracks || showTrackLabels) {
      for (const track of tracks) {
        const { lon, lat } = track.state;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

        const px = proj(lon, lat);
        const color = statusColor(track.status);
        const isMultiSensor = multiSensorTrackIds.has(track.systemTrackId as string);

        if (showTracks) {
          if (useNato) {
            // NATO APP-6D symbol
            const sym = resolveTrackSymbol(track, false, 24);
            const el = document.createElement('div');
            el.dataset.trackId = track.systemTrackId as string;
            el.style.cssText = `
              position:absolute; left:${px.x - 12}px; top:${px.y - 12}px;
              width:24px; height:24px; z-index:22; cursor:pointer;
              pointer-events:auto;
            `;
            el.innerHTML = sym.svgHtml;
            el.title = `${shortTrackLabel(track)} — ${track.status}${isMultiSensor ? ' (multi-sensor)' : ''}\nDouble-click for EO feed`;
            container.appendChild(el);
          } else {
            // Legacy circle/diamond rendering
            const el = document.createElement('div');
            el.dataset.trackId = track.systemTrackId as string;
            if (isMultiSensor) {
              el.style.cssText = `
                position:absolute; left:${px.x - 7}px; top:${px.y - 7}px;
                width:12px; height:12px; background:#00ffcc;
                border:2px solid #fff; z-index:22; cursor:pointer;
                pointer-events:auto; transform:rotate(45deg);
              `;
            } else {
              el.style.cssText = `
                position:absolute; left:${px.x - 6}px; top:${px.y - 6}px;
                width:12px; height:12px; border-radius:50%; background:${color};
                border:2px solid #fff; z-index:22; cursor:pointer;
                pointer-events:auto;
              `;
            }
            el.title = `${shortTrackLabel(track)} — ${track.status}${isMultiSensor ? ' (multi-sensor)' : ''}\nDouble-click for EO feed`;
            container.appendChild(el);
          }

          // REQ-5 Phase C: Green ring around converged tracks
          if (convergedTrackIds?.has(track.systemTrackId as string)) {
            const ringSize = useNato ? 28 : 18;
            const ringOffset = ringSize / 2;
            const ring = document.createElement('div');
            ring.style.cssText = `
              position:absolute; left:${px.x - ringOffset}px; top:${px.y - ringOffset}px;
              width:${ringSize}px; height:${ringSize}px; border-radius:50%;
              border:2px solid #00cc44; z-index:21;
              pointer-events:none;
            `;
            container.appendChild(ring);
          }
        }

        if (showTrackLabels) {
          const lblOffset = useNato ? 14 : 9;
          const lbl = document.createElement('div');
          lbl.style.cssText = `
            position:absolute; left:${px.x + lblOffset}px; top:${px.y - 7}px;
            font-size:9px; color:#fff; white-space:nowrap;
            text-shadow:0 0 3px #000, 0 0 3px #000; z-index:23;
            pointer-events:none; font-family:monospace;
          `;
          lbl.textContent = shortTrackLabel(track);
          container.appendChild(lbl);
        }
      }
    }
  }, [map, tracks, sensors, trailHistory, layerVisibility, selectedGroundTruthId, groundTruthTargets, showGroundTruth, coverZones, operationalZones, searchModeStates, fovOverlaps, bearingAssociations, multiSensorResolutions, convergedTrackIds]);

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
  }, [tracks, sensors, trailHistory, groundTruthTargets, showGroundTruth, selectedGroundTruthId, coverZones, searchModeStates, fovOverlaps, bearingAssociations, multiSensorResolutions, convergedTrackIds, render]);

  // EO Video Popup state
  const eoVideoPopupTrackId = useUiStore(s => s.eoVideoPopupTrackId);
  const setEoVideoPopupTrackId = useUiStore(s => s.setEoVideoPopupTrackId);

  // Compute popup props when a track is selected for EO video
  const eoPopupData = React.useMemo(() => {
    if (!eoVideoPopupTrackId || !map) return null;
    const track = tracks.find(t => (t.systemTrackId as string) === eoVideoPopupTrackId);
    if (!track) return null;
    // Only show for tracks with EO investigation
    if (track.eoInvestigationStatus === 'none' && !track.classification) return null;

    const { lon, lat } = track.state;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const px = map.project([lon, lat]);

    const color = track.status === 'confirmed' ? '#00cc44' : track.status === 'tentative' ? '#ffcc00' : '#ff3333';
    const classification = (track as any).classification ?? 'unknown';
    const confidence = (track as any).classificationConfidence ?? 0.5;

    return {
      trackId: track.systemTrackId as string,
      classification,
      confidence,
      statusColor: color,
      trackScreenX: px.x,
      trackScreenY: px.y,
    };
  }, [eoVideoPopupTrackId, tracks, map]);

  return (
    <>
      {/* CSS keyframes for trail flash animation */}
      <style>{`
        @keyframes trail-flash {
          0% { box-shadow: 0 0 8px 3px currentColor; transform: scale(1.3); }
          100% { box-shadow: none; transform: scale(1); }
        }
      `}</style>
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
      {/* EO Video Popup — rendered above all other layers */}
      {eoPopupData && (
        <EoVideoPopup
          trackId={eoPopupData.trackId}
          classification={eoPopupData.classification}
          confidence={eoPopupData.confidence}
          statusColor={eoPopupData.statusColor}
          trackScreenX={eoPopupData.trackScreenX}
          trackScreenY={eoPopupData.trackScreenY}
          onClose={() => setEoVideoPopupTrackId(null)}
        />
      )}
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
