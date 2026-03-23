import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
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
 * DebugOverlay — Primary renderer using native Leaflet layers.
 * All visual elements (tracks, sensors, coverage arcs, EO rays, etc.)
 * are rendered as Leaflet layer groups (L.polygon, L.polyline, L.circleMarker,
 * L.marker with divIcon). Leaflet handles repositioning on pan/zoom natively.
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

function sensorColorFn(type: string): string {
  switch (type) {
    case 'radar': return '#4488ff';
    case 'eo': return '#ff8800';
    case 'c4isr': return '#aa44ff';
    default: return '#888888';
  }
}

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

function shortSensorLabel(sensor: SensorState): string {
  const prefix = sensor.sensorType === 'radar' ? 'R' : sensor.sensorType === 'eo' ? 'E' : 'C';
  const idNum = (sensor.sensorId as string).match(/(\d+)/)?.[1] ?? '?';
  return `${prefix}${idNum}`;
}

function geoOffset(lon: number, lat: number, azDeg: number, rangeM: number): [number, number] {
  const azRad = azDeg * DEG_TO_RAD;
  const mPerDegLon = 111320 * Math.cos(lat * DEG_TO_RAD);
  const mPerDegLat = 110540;
  return [
    lon + (rangeM / mPerDegLon) * Math.sin(azRad),
    lat + (rangeM / mPerDegLat) * Math.cos(azRad),
  ];
}

/** Generate sector polygon latlngs for coverage arcs */
function sectorLatLngs(
  lat: number, lon: number,
  startDeg: number, endDeg: number, rangeM: number,
  segments = 48,
): [number, number][] {
  const center: [number, number] = [lat, lon];
  const latlngs: [number, number][] = [center];
  for (let i = 0; i <= segments; i++) {
    const azDeg = startDeg + ((endDeg - startDeg) * i) / segments;
    const [eLon, eLat] = geoOffset(lon, lat, azDeg, rangeM);
    latlngs.push([eLat, eLon]);
  }
  latlngs.push(center);
  return latlngs;
}

/** Create a divIcon with no default Leaflet styling and drag prevention */
function icon(html: string, size: [number, number], anchor: [number, number]): L.DivIcon {
  return L.divIcon({
    html: `<div draggable="false" style="user-select:none;-webkit-user-drag:none;">${html}</div>`,
    iconSize: size, iconAnchor: anchor, className: '',
  });
}

/** Clickable hit area size — larger than the visual element for easier selection */
const HIT_SIZE: [number, number] = [32, 32];
const HIT_ANCHOR: [number, number] = [16, 16];

// ─── Props ───────────────────────────────────────────────────────────────────

interface DebugOverlayProps {
  map: L.Map | null;
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

// ─── Layer group names ───────────────────────────────────────────────────────

interface LayerGroups {
  zones: L.LayerGroup;
  coverage: L.LayerGroup;
  rays: L.LayerGroup;
  ellipses: L.LayerGroup;
  ballistic: L.LayerGroup;
  trails: L.LayerGroup;
  gt: L.LayerGroup;
  sensors: L.LayerGroup;
  tracks: L.LayerGroup;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DebugOverlay({
  map, tracks, sensors, trailHistory, layersReady, layerVisibility,
  onSelectTrack, onSelectSensor, onSelectGroundTruth,
  selectedGroundTruthId, groundTruthTargets, showGroundTruth,
  coverZones, operationalZones, searchModeStates,
  fovOverlaps, bearingAssociations, multiSensorResolutions,
  convergedTrackIds, ballisticEstimates,
}: DebugOverlayProps) {

  const groupsRef = useRef<LayerGroups | null>(null);
  const callbacksRef = useRef({ onSelectTrack, onSelectSensor, onSelectGroundTruth });
  callbacksRef.current = { onSelectTrack, onSelectSensor, onSelectGroundTruth };

  // ── Disambiguation: when multiple objects overlap, show selection popup ────
  const disambigRef = useRef<{
    candidates: Array<{ type: 'track' | 'sensor' | 'gt'; id: string; label: string; color: string }>;
    timer: ReturnType<typeof setTimeout> | null;
    popup: L.Popup | null;
  }>({ candidates: [], timer: null, popup: null });

  const addClickCandidate = (
    type: 'track' | 'sensor' | 'gt',
    id: string,
    label: string,
    color: string,
    latlng: L.LatLng,
  ) => {
    const d = disambigRef.current;
    // Close any existing popup
    if (d.popup && map) { map.closePopup(d.popup); d.popup = null; }
    d.candidates.push({ type, id, label, color });
    if (d.timer) clearTimeout(d.timer);
    // Wait one frame for all overlapping clicks to register
    d.timer = setTimeout(() => {
      const items = [...d.candidates];
      d.candidates = [];
      d.timer = null;
      if (items.length === 1) {
        // Single object — select directly
        const item = items[0];
        if (item.type === 'track') callbacksRef.current.onSelectTrack?.(item.id);
        else if (item.type === 'sensor') callbacksRef.current.onSelectSensor?.(item.id);
        else callbacksRef.current.onSelectGroundTruth?.(item.id);
      } else if (items.length > 1 && map) {
        // Multiple objects — show disambiguation popup
        const listHtml = items.map(item =>
          `<div class="disambig-item" data-type="${item.type}" data-id="${item.id}" ` +
          `style="padding:4px 8px;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:1px solid #444;" ` +
          `onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">` +
          `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};flex-shrink:0;"></span>` +
          `<span style="font:11px monospace;color:#e0e0e0;white-space:nowrap;">${item.label}</span>` +
          `</div>`
        ).join('');
        const popup = L.popup({
          closeButton: true,
          className: 'disambig-popup',
          maxWidth: 250,
          minWidth: 120,
        })
          .setLatLng(latlng)
          .setContent(
            `<div style="background:#1a1a1a;border-radius:4px;overflow:hidden;margin:-13px -20px -13px -20px;">` +
            `<div style="padding:4px 8px;font:bold 10px monospace;color:#888;border-bottom:1px solid #444;">Select object</div>` +
            `${listHtml}</div>`
          )
          .openOn(map);
        d.popup = popup;
        // Bind click handlers on popup items
        const el = popup.getElement();
        if (el) {
          el.querySelectorAll('.disambig-item').forEach(itemEl => {
            itemEl.addEventListener('click', () => {
              const t = itemEl.getAttribute('data-type');
              const itemId = itemEl.getAttribute('data-id');
              if (!itemId) return;
              if (t === 'track') callbacksRef.current.onSelectTrack?.(itemId);
              else if (t === 'sensor') callbacksRef.current.onSelectSensor?.(itemId);
              else callbacksRef.current.onSelectGroundTruth?.(itemId);
              map.closePopup(popup);
            });
          });
        }
      }
    }, 50); // 50ms debounce — enough to collect overlapping clicks
  };

  // ── Suppress layer rebuilds during zoom animations to prevent flicker ─────
  const zoomingRef = useRef(false);
  useEffect(() => {
    if (!map) return;
    const onZoomStart = () => { zoomingRef.current = true; };
    const onZoomEnd = () => { zoomingRef.current = false; };
    map.on('zoomanim', onZoomStart);
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomanim', onZoomStart);
      map.off('zoomend', onZoomEnd);
    };
  }, [map]);

  // ── Picture mode filtering ──────────────────────────────────────────────────
  const pictureMode = useUiStore(s => s.pictureMode);

  const filteredTracks = useMemo(() => {
    if (pictureMode === 'all') return tracks;
    if (pictureMode === 'eo_bearings') return []; // bearings-only mode shows no tracks

    const sensorMap = new Map(sensors.map(s => [s.sensorId as string, s]));
    return tracks.filter(track => {
      const sources = track.sources ?? [];
      if (pictureMode === 'radar') {
        // Show only tracks with at least one radar source and no EO-only tracks
        return sources.some(sid => sensorMap.get(sid as string)?.sensorType === 'radar');
      }
      if (pictureMode === 'eo_3d') {
        // Show only tracks with EO sources (triangulated) — no radar-only
        const hasEo = sources.some(sid => sensorMap.get(sid as string)?.sensorType === 'eo');
        const hasRadarOnly = sources.every(sid => sensorMap.get(sid as string)?.sensorType === 'radar');
        return hasEo && !hasRadarOnly;
      }
      return true;
    });
  }, [tracks, sensors, pictureMode]);

  // ── Init layer groups (once when map is available) ─────────────────────────
  useEffect(() => {
    if (!map) return;
    const groups: LayerGroups = {
      zones: L.layerGroup().addTo(map),
      coverage: L.layerGroup().addTo(map),
      rays: L.layerGroup().addTo(map),
      ellipses: L.layerGroup().addTo(map),
      ballistic: L.layerGroup().addTo(map),
      trails: L.layerGroup().addTo(map),
      gt: L.layerGroup().addTo(map),
      sensors: L.layerGroup().addTo(map),
      tracks: L.layerGroup().addTo(map),
    };
    groupsRef.current = groups;
    return () => {
      Object.values(groups).forEach(g => { g.clearLayers(); map.removeLayer(g); });
      groupsRef.current = null;
    };
  }, [map]);

  // ── SECTION: Zone layers (cover zones + operational zones) ──────────────────
  useEffect(() => {
    const g = groupsRef.current?.zones;
    if (!g) return;
    g.clearLayers();

    // Cover zones
    if (coverZones) {
      const coverTypeStyle: Record<string, { fill: string; stroke: string }> = {
        urban:  { fill: 'rgba(255,165,0,0.15)',  stroke: 'rgba(255,165,0,0.4)' },
        forest: { fill: 'rgba(34,139,34,0.15)',   stroke: 'rgba(34,139,34,0.4)' },
        water:  { fill: 'rgba(0,100,200,0.15)',   stroke: 'rgba(0,100,200,0.4)' },
        open:   { fill: 'rgba(200,180,100,0.10)', stroke: 'rgba(200,180,100,0.4)' },
      };
      for (const zone of coverZones) {
        if (!zone.polygon || zone.polygon.length < 3) continue;
        const style = coverTypeStyle[zone.coverType] ?? coverTypeStyle.open;
        const latlngs = zone.polygon
          .filter(v => Number.isFinite(v.lon) && Number.isFinite(v.lat))
          .map(v => [v.lat, v.lon] as [number, number]);
        if (latlngs.length < 3) continue;

        L.polygon(latlngs, {
          fillColor: style.fill, fillOpacity: 1, color: style.stroke,
          weight: 1, dashArray: '4,3', interactive: false,
        }).addTo(g);

        if (zone.name) {
          const centLat = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
          const centLon = latlngs.reduce((s, p) => s + p[1], 0) / latlngs.length;
          L.marker([centLat, centLon], {
            icon: icon(
              `<span style="font:10px monospace;color:${style.stroke};pointer-events:none;">${zone.name}</span>`,
              [80, 14], [40, 7],
            ),
            interactive: false,
          }).addTo(g);
        }
      }
    }

    // Operational zones (threat corridors, exclusion areas, engagement zones)
    if (operationalZones) {
      const zoneStyles: Record<string, { fill: string; stroke: string; dash: string }> = {
        threat_corridor: { fill: 'rgba(255,50,50,0.12)',  stroke: 'rgba(255,50,50,0.7)',  dash: '8,4' },
        exclusion:       { fill: 'rgba(255,0,0,0.08)',    stroke: 'rgba(255,0,0,0.6)',    dash: '12,4,4,4' },
        engagement:      { fill: 'rgba(0,200,100,0.08)',  stroke: 'rgba(0,200,100,0.5)',  dash: '6,3' },
        safe_passage:    { fill: 'rgba(0,150,255,0.08)',  stroke: 'rgba(0,150,255,0.5)',  dash: '4,4' },
      };
      for (const zone of operationalZones) {
        if (!zone.polygon || zone.polygon.length < 3) continue;
        const style = zoneStyles[zone.zoneType] ?? zoneStyles.threat_corridor;
        const latlngs = zone.polygon
          .filter(v => Number.isFinite(v.lon) && Number.isFinite(v.lat))
          .map(v => [v.lat, v.lon] as [number, number]);
        if (latlngs.length < 3) continue;

        const fillColor = zone.color ? `${zone.color}20` : style.fill;
        const strokeColor = zone.color ?? style.stroke;

        L.polygon(latlngs, {
          fillColor, fillOpacity: 1, color: strokeColor,
          weight: 2, dashArray: style.dash, interactive: false,
        }).addTo(g);

        const centLat = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
        const centLon = latlngs.reduce((s, p) => s + p[1], 0) / latlngs.length;
        L.marker([centLat, centLon], {
          icon: icon(
            `<span style="font:bold 10px monospace;color:${strokeColor};">${zone.name}</span>`,
            [100, 14], [50, 7],
          ),
          interactive: false,
        }).addTo(g);
      }
    }
  }, [coverZones, operationalZones]);

  // ── SECTION: Coverage layers (radar arcs, EO FOR, EO FOV, FOV overlaps) ────
  useEffect(() => {
    const g = groupsRef.current?.coverage;
    if (!g) return;
    g.clearLayers();

    // Radar coverage arcs (hidden in EO-only modes)
    if (layerVisibility.radarCoverage && pictureMode !== 'eo_bearings' && pictureMode !== 'eo_3d') {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'radar' || !sensor.online) continue;
        const cov = sensor.coverage;
        if (!cov || !Number.isFinite(cov.maxRangeM) || cov.maxRangeM <= 0) continue;
        const { lat, lon } = sensor.position;
        const isFullCircle = (cov.maxAzDeg - cov.minAzDeg) >= 359;
        const startDeg = isFullCircle ? 0 : cov.minAzDeg;
        const endDeg = isFullCircle ? 360 : cov.maxAzDeg;
        L.polygon(sectorLatLngs(lat, lon, startDeg, endDeg, cov.maxRangeM), {
          fillColor: '#4488ff', fillOpacity: 0.08,
          color: '#4488ff', opacity: 0.35, weight: 1.5, interactive: false,
        }).addTo(g);
      }
    }

    // EO field of regard (FOR) — hidden in radar-only mode
    if (layerVisibility.eoFor && pictureMode !== 'radar') {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo' || !sensor.online) continue;
        const cov = sensor.coverage;
        if (!cov || !Number.isFinite(cov.maxRangeM) || cov.maxRangeM <= 0) continue;
        const { lat, lon } = sensor.position;
        const isFullCircle = (cov.maxAzDeg - cov.minAzDeg) >= 359;
        const startDeg = isFullCircle ? 0 : cov.minAzDeg;
        const endDeg = isFullCircle ? 360 : cov.maxAzDeg;
        L.polygon(sectorLatLngs(lat, lon, startDeg, endDeg, cov.maxRangeM), {
          fill: false, color: '#ff8800', opacity: 0.5,
          weight: 1.5, dashArray: '4,4', interactive: false,
        }).addTo(g);
      }
    }

    // EO field of view (FOV) cone
    if (layerVisibility.eoFov) {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo' || !sensor.online) continue;
        const cov = sensor.coverage;
        if (!cov || !sensor.gimbal || !sensor.fov) continue;
        if (!Number.isFinite(cov.maxRangeM) || cov.maxRangeM <= 0) continue;
        const { lat, lon } = sensor.position;
        const isStaring = sensor.gimbal.slewRateDegPerSec === 0;
        let fovStartDeg: number;
        let fovEndDeg: number;
        if (isStaring) {
          // Fixed/staring sensor — FOV matches the coverage arc, no gimbal movement
          fovStartDeg = cov.minAzDeg;
          fovEndDeg = cov.maxAzDeg;
        } else {
          const azDeg = sensor.gimbal.azimuthDeg;
          const halfAngle = sensor.fov.halfAngleHDeg;
          fovStartDeg = azDeg - halfAngle;
          fovEndDeg = azDeg + halfAngle;
        }
        L.polygon(sectorLatLngs(lat, lon, fovStartDeg, fovEndDeg, cov.maxRangeM, 12), {
          fillColor: '#ff8800', fillOpacity: 0.25,
          color: '#ff8800', opacity: 0.6, weight: 1, interactive: false,
        }).addTo(g);
      }
    }

    // FOV overlap regions
    if (fovOverlaps && fovOverlaps.length > 0 && layerVisibility.eoFov) {
      for (const overlap of fovOverlaps) {
        if (!overlap.overlapRegion || overlap.overlapRegion.length < 2) continue;
        if (overlap.overlapRegion.length >= 3) {
          const latlngs = overlap.overlapRegion
            .filter(v => Number.isFinite(v.lon) && Number.isFinite(v.lat))
            .map(v => [v.lat, v.lon] as [number, number]);
          if (latlngs.length >= 3) {
            L.polygon(latlngs, {
              fillColor: 'rgba(255,255,0,0.1)', fillOpacity: 1,
              color: 'rgba(255,255,0,0.4)', weight: 1.5, dashArray: '4,3', interactive: false,
            }).addTo(g);
          }
        } else {
          const pt = overlap.overlapRegion[0];
          if (Number.isFinite(pt.lon) && Number.isFinite(pt.lat)) {
            L.circleMarker([pt.lat, pt.lon], {
              radius: 6, fillColor: 'rgba(255,255,0,0.3)', fillOpacity: 1,
              color: 'rgba(255,255,0,0.6)', weight: 1.5, interactive: false,
            }).addTo(g);
          }
        }
      }
    }
  }, [sensors, layerVisibility.radarCoverage, layerVisibility.eoFor, layerVisibility.eoFov, fovOverlaps, pictureMode]);

  // ── SECTION: Ray layers (gimbal, bearing assoc, search, triangulation, multi-sensor)
  useEffect(() => {
    const g = groupsRef.current?.rays;
    if (!g) return;
    g.clearLayers();

    // In radar-only picture mode, skip all EO ray rendering
    const showEoLayers = pictureMode !== 'radar';

    // EO gimbal rays (skip staring/fixed sensors — they don't slew)
    if (layerVisibility.eoRays && showEoLayers) {
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo' || !sensor.gimbal || !sensor.online) continue;
        if (sensor.gimbal.slewRateDegPerSec === 0) continue; // staring — no gimbal ray
        if (!Number.isFinite(sensor.gimbal.azimuthDeg)) continue;
        const { lon, lat } = sensor.position;
        const [endLon, endLat] = geoOffset(lon, lat, sensor.gimbal.azimuthDeg, 40000);
        L.polyline([[lat, lon], [endLat, endLon]], {
          color: '#ff8800', weight: 2, opacity: 0.7, dashArray: '6,3', interactive: false,
        }).addTo(g);
      }
    }

    // Bearing association indicators (ambiguous/low-confidence bearing rays)
    if (bearingAssociations && bearingAssociations.length > 0 && layerVisibility.eoRays) {
      const sensorMap = new Map(sensors.map(s => [s.sensorId as string, s]));
      for (const assoc of bearingAssociations) {
        const sensor = sensorMap.get(assoc.sensorId);
        if (!sensor || !sensor.online) continue;
        const { lon, lat } = sensor.position;
        const [endLon, endLat] = geoOffset(lon, lat, assoc.bearing, 40000);

        // Low-confidence (< 0.5): dotted line
        if (assoc.confidence < 0.5) {
          L.polyline([[lat, lon], [endLat, endLon]], {
            color: '#ff4400', weight: 2, opacity: 0.6, dashArray: '2,4', interactive: false,
          }).addTo(g);
        }

        // Ambiguous: warning icon at midpoint
        if (assoc.ambiguous) {
          const midLat = (lat + endLat) / 2;
          const midLon = (lon + endLon) / 2;
          L.marker([midLat, midLon], {
            icon: icon(
              `<div style="text-align:center;pointer-events:none;">` +
              `<div style="font-size:14px;color:#ff8800;">⚠</div>` +
              `<div style="font:9px monospace;color:#ff8800;opacity:0.8;">${(assoc.confidence * 100).toFixed(0)}%</div>` +
              `</div>`,
              [40, 28], [20, 14],
            ),
            interactive: false,
          }).addTo(g);
        }
      }
    }

    // Multi-sensor association links (thin cyan lines from sensors to resolved position)
    if (multiSensorResolutions && multiSensorResolutions.length > 0 && layerVisibility.triangulation && showEoLayers) {
      const sensorMap = new Map(sensors.map(s => [s.sensorId as string, s]));
      for (const resolution of multiSensorResolutions) {
        if (resolution.sensorCount < 3 || !resolution.positionEstimate) continue;
        const { lat, lon } = resolution.positionEstimate;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        for (const sensorId of resolution.sensorIds) {
          const sensor = sensorMap.get(sensorId);
          if (!sensor) continue;
          L.polyline([[sensor.position.lat, sensor.position.lon], [lat, lon]], {
            color: '#00cccc', weight: 1, opacity: 0.3, interactive: false,
          }).addTo(g);
        }
      }
    }

    // Search mode sweep lines
    if (searchModeStates && searchModeStates.length > 0 && layerVisibility.sensors) {
      const searchMap = new Map(searchModeStates.map(s => [s.sensorId, s]));
      for (const sensor of sensors) {
        if (sensor.sensorType !== 'eo') continue;
        const searchState = searchMap.get(sensor.sensorId as string);
        if (!searchState || !searchState.active) continue;
        const { lon, lat } = sensor.position;
        const [endLon, endLat] = geoOffset(lon, lat, searchState.currentAzimuth, 30000);
        L.polyline([[lat, lon], [endLat, endLon]], {
          color: '#44aaff', weight: 2, opacity: 0.5, dashArray: '8,4', interactive: false,
        }).addTo(g);

        // "SEARCH" label near sensor (15% along the line)
        const lblLat = lat + (endLat - lat) * 0.15;
        const lblLon = lon + (endLon - lon) * 0.15;
        L.marker([lblLat, lblLon], {
          icon: icon(
            `<span style="font:9px monospace;color:#44aaff;opacity:0.7;">SEARCH</span>`,
            [50, 12], [0, 12],
          ),
          interactive: false,
        }).addTo(g);
      }
    }

    // Triangulation rays (EO sensor → track lines)
    if (layerVisibility.triangulation && showEoLayers) {
      const sensorMap = new Map(sensors.map(s => [s.sensorId as string, s]));
      for (const track of filteredTracks) {
        if (track.eoInvestigationStatus === 'none' || track.status === 'dropped') continue;
        const eoSources = (track.sources ?? []).filter(sid => {
          const s = sensorMap.get(sid as string);
          return s && s.sensorType === 'eo';
        });
        if (eoSources.length === 0) continue;
        const color = eoSources.length >= 3 ? '#00cc44' : eoSources.length === 2 ? '#ffcc00' : '#ff8800';
        for (const sensorId of eoSources) {
          const sensor = sensorMap.get(sensorId as string);
          if (!sensor) continue;
          L.polyline(
            [[sensor.position.lat, sensor.position.lon], [track.state.lat, track.state.lon]],
            { color, weight: 2, opacity: 0.8, interactive: false },
          ).addTo(g);
        }
      }
    }
  }, [sensors, tracks, filteredTracks, layerVisibility.eoRays, layerVisibility.triangulation, layerVisibility.sensors, bearingAssociations, searchModeStates, multiSensorResolutions, pictureMode]);

  // ── SECTION: Ellipse layers (uncertainty ellipses) ──────────────────────────
  useEffect(() => {
    const g = groupsRef.current?.ellipses;
    if (!g) return;
    g.clearLayers();

    const showTracks = showGroundTruth ? false : layerVisibility.tracks;
    if (!layerVisibility.trackEllipses || !showTracks) return;

    for (const track of filteredTracks) {
      const { lon, lat } = track.state;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const cov = track.covariance;
      if (!cov || !cov[0] || !cov[1]) continue;

      const semiAxisXm = Math.sqrt(Math.abs(cov[0][0] ?? 100));
      const semiAxisYm = Math.sqrt(Math.abs(cov[1][1] ?? 100));
      const mPerDegLon = 111320 * Math.cos(lat * DEG_TO_RAD);
      const mPerDegLat = 110540;
      const semiAxisXdeg = (semiAxisXm / mPerDegLon) * 3;
      const semiAxisYdeg = (semiAxisYm / mPerDegLat) * 3;

      const segments = 24;
      const points: [number, number][] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        points.push([lat + semiAxisYdeg * Math.sin(angle), lon + semiAxisXdeg * Math.cos(angle)]);
      }

      const color = statusColor(track.status);
      L.polygon(points, {
        fillColor: color, fillOpacity: 0.1,
        color, opacity: 0.4, weight: 1, interactive: false,
      }).addTo(g);
    }
  }, [tracks, filteredTracks, layerVisibility.trackEllipses, layerVisibility.tracks, showGroundTruth, pictureMode]);

  // ── SECTION: Ballistic layers (launch/impact point estimates) ─────────────
  useEffect(() => {
    const g = groupsRef.current?.ballistic;
    if (!g) return;
    g.clearLayers();

    if (!ballisticEstimates || ballisticEstimates.length === 0) return;

    for (const est of ballisticEstimates) {
      // Launch point: green dashed circle + cross marker + label
      if (est.launchPoint && Number.isFinite(est.launchPoint.lat) && Number.isFinite(est.launchPoint.lon)) {
        const lp = est.launchPoint;
        L.circle([lp.lat, lp.lon], {
          radius: lp.uncertainty2SigmaM,
          fillColor: 'rgba(0,200,68,0.08)', fillOpacity: 1,
          color: '#00cc44', weight: 2, dashArray: '6,4', opacity: 0.8, interactive: false,
        }).addTo(g);
        // Cross marker
        L.marker([lp.lat, lp.lon], {
          icon: icon(
            `<svg width="12" height="12"><line x1="0" y1="6" x2="12" y2="6" stroke="#00cc44" stroke-width="2"/><line x1="6" y1="0" x2="6" y2="12" stroke="#00cc44" stroke-width="2"/></svg>`,
            [12, 12], [6, 6],
          ),
          interactive: false,
        }).addTo(g);
        // Label
        L.marker([lp.lat, lp.lon], {
          icon: icon(
            `<span style="font:bold 10px monospace;color:#00cc44;">LAUNCH ${(lp.uncertainty2SigmaM / 1000).toFixed(1)}km</span>`,
            [120, 14], [-10, 18],
          ),
          interactive: false,
        }).addTo(g);
      }

      // Impact point: red dashed circle + X marker + label
      if (est.impactPoint && Number.isFinite(est.impactPoint.lat) && Number.isFinite(est.impactPoint.lon)) {
        const ip = est.impactPoint;
        L.circle([ip.lat, ip.lon], {
          radius: ip.uncertainty2SigmaM,
          fillColor: 'rgba(255,50,50,0.08)', fillOpacity: 1,
          color: '#ff3333', weight: 2, dashArray: '6,4', opacity: 0.8, interactive: false,
        }).addTo(g);
        // X marker
        L.marker([ip.lat, ip.lon], {
          icon: icon(
            `<svg width="12" height="12"><line x1="0" y1="0" x2="12" y2="12" stroke="#ff3333" stroke-width="2"/><line x1="12" y1="0" x2="0" y2="12" stroke="#ff3333" stroke-width="2"/></svg>`,
            [12, 12], [6, 6],
          ),
          interactive: false,
        }).addTo(g);
        // Label with time-to-impact
        const tti = ip.timeToImpactSec > 0 ? ` T-${ip.timeToImpactSec.toFixed(0)}s` : '';
        L.marker([ip.lat, ip.lon], {
          icon: icon(
            `<span style="font:bold 10px monospace;color:#ff3333;">IMPACT ${(ip.uncertainty2SigmaM / 1000).toFixed(1)}km${tti}</span>`,
            [160, 14], [-10, 18],
          ),
          interactive: false,
        }).addTo(g);
      }
    }
  }, [ballisticEstimates]);

  // ── SECTION: Trail dots ─────────────────────────────────────────────────────
  useEffect(() => {
    const g = groupsRef.current?.trails;
    if (!g) return;
    // Skip rebuild during zoom animation to prevent flicker
    if (zoomingRef.current) return;
    g.clearLayers();

    const showTracks = showGroundTruth ? false : layerVisibility.tracks;
    if (!showTracks || trailHistory.size === 0) return;

    const filteredTrackIds = new Set(filteredTracks.map(t => t.systemTrackId as string));
    const trackStatusMap = new Map(tracks.map(t => [t.systemTrackId as string, t.status]));
    for (const [trackId, positions] of trailHistory) {
      if (!filteredTrackIds.has(trackId)) continue;
      const status = trackStatusMap.get(trackId) ?? 'tentative';
      const color = statusColor(status);
      const count = positions.length;
      const newestTrailIdx = count - 2;

      for (let i = 0; i < count - 1; i++) {
        const age = count - 1 - i;
        const isNewest = i === newestTrailIdx;
        const opacity = isNewest ? 1.0 : Math.max(0.15, 1.0 - (age / 5) * 0.85);
        const { lon, lat } = positions[i];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

        if (isNewest) {
          // Newest trail dot: use divIcon for flash animation
          L.marker([lat, lon], {
            icon: icon(
              `<div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px 2px ${color};animation:trail-flash 0.8s ease-out;"></div>`,
              [8, 8], [4, 4],
            ),
            interactive: false,
          }).addTo(g);
        } else {
          L.circleMarker([lat, lon], {
            radius: 3, fillColor: color, fillOpacity: opacity,
            color: 'transparent', weight: 0, interactive: false,
          }).addTo(g);
        }
      }
    }
  }, [trailHistory, tracks, filteredTracks, layerVisibility.tracks, showGroundTruth, pictureMode]);

  // ── SECTION: Sensor markers + labels ──────────────────────────────────────
  useEffect(() => {
    const g = groupsRef.current?.sensors;
    if (!g) return;
    // Skip rebuild during zoom animation to prevent flicker
    if (zoomingRef.current) return;
    g.clearLayers();

    const showSensors = layerVisibility.sensors;
    const showSensorLabels = layerVisibility.sensorLabels;
    const useNato = layerVisibility.useNatoSymbols;

    if (!showSensors && !showSensorLabels) return;

    for (const sensor of sensors) {
      const { lon, lat } = sensor.position;
      const color = sensor.online ? sensorColorFn(sensor.sensorType) : '#555555';

      if (showSensors) {
        let sensorHtml: string;
        if (useNato) {
          const sym = resolveSensorSymbol(sensor, false, 24);
          sensorHtml = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;">${sym.svgHtml}</div>`;
        } else {
          sensorHtml = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;"><div style="width:14px;height:14px;background:${color};border:2px solid #000;"></div></div>`;
        }
        const marker = L.marker([lat, lon], {
          icon: icon(sensorHtml, HIT_SIZE, HIT_ANCHOR),
          interactive: true,
        });
        marker.bindTooltip(`${shortSensorLabel(sensor)} — ${sensor.sensorId}`, { direction: 'top', offset: [0, -14] });
        marker.on('click', (e: L.LeafletMouseEvent) => addClickCandidate('sensor', sensor.sensorId as string, `${shortSensorLabel(sensor)} (${sensor.sensorType})`, color, e.latlng));
        marker.addTo(g);
      }

      if (showSensorLabels) {
        const lblOffset = useNato ? 14 : 10;
        L.marker([lat, lon], {
          icon: icon(
            `<span style="font:bold 10px monospace;color:${color};text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${shortSensorLabel(sensor)}</span>`,
            [50, 14], [-lblOffset, 8],
          ),
          interactive: false,
        }).addTo(g);
      }
    }
  }, [sensors, layerVisibility.sensors, layerVisibility.sensorLabels, layerVisibility.useNatoSymbols]);

  // ── SECTION: Track markers + labels ─────────────────────────────────────────
  useEffect(() => {
    const g = groupsRef.current?.tracks;
    if (!g) return;
    // Skip rebuild during zoom animation to prevent flicker
    if (zoomingRef.current) return;
    g.clearLayers();

    const showTracks = showGroundTruth ? false : layerVisibility.tracks;
    const showTrackLabels = showGroundTruth ? false : layerVisibility.trackLabels;
    const useNato = layerVisibility.useNatoSymbols;

    if (!showTracks && !showTrackLabels) return;

    // Build set of multi-sensor resolved track IDs for diamond markers
    const multiSensorTrackIds = new Set<string>();
    if (multiSensorResolutions) {
      for (const r of multiSensorResolutions) {
        if (r.sensorCount >= 3 && r.method === 'multi-sensor') {
          multiSensorTrackIds.add(r.trackId);
        }
      }
    }

    for (const track of filteredTracks) {
      const { lon, lat } = track.state;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const color = statusColor(track.status);
      const isMultiSensor = multiSensorTrackIds.has(track.systemTrackId as string);
      const trackId = track.systemTrackId as string;
      const title = `${shortTrackLabel(track)} — ${track.status}${isMultiSensor ? ' (multi-sensor)' : ''}`;

      if (showTracks) {
        let markerHtml: string;
        if (useNato) {
          const sym = resolveTrackSymbol(track, false, 24);
          markerHtml = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;">${sym.svgHtml}</div>`;
        } else if (isMultiSensor) {
          markerHtml = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;"><div style="width:12px;height:12px;background:#00ffcc;border:2px solid #fff;transform:rotate(45deg);"></div></div>`;
        } else {
          markerHtml = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;"><div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;"></div></div>`;
        }

        const marker = L.marker([lat, lon], {
          icon: icon(markerHtml, HIT_SIZE, HIT_ANCHOR),
          interactive: true,
          zIndexOffset: 200,
        });
        marker.bindTooltip(title, { direction: 'top', offset: [0, -14] });
        marker.on('click', (e: L.LeafletMouseEvent) => addClickCandidate('track', trackId, `${shortTrackLabel(track)} — ${track.status}`, color, e.latlng));
        marker.on('dblclick', () => useUiStore.getState().setEoVideoPopupTrackId(trackId));
        marker.addTo(g);

        // REQ-5C: Green ring around converged tracks
        if (convergedTrackIds?.has(trackId)) {
          const ringSize = useNato ? 28 : 18;
          L.marker([lat, lon], {
            icon: icon(
              `<div style="width:${ringSize}px;height:${ringSize}px;border-radius:50%;border:2px solid #00cc44;"></div>`,
              [ringSize, ringSize], [ringSize / 2, ringSize / 2],
            ),
            interactive: false,
          }).addTo(g);
        }
      }

      if (showTrackLabels) {
        const lblOffset = useNato ? 14 : 9;
        L.marker([lat, lon], {
          icon: icon(
            `<span style="font:9px monospace;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${shortTrackLabel(track)}</span>`,
            [60, 12], [-lblOffset, 7],
          ),
          interactive: false,
        }).addTo(g);
      }
    }
  }, [tracks, filteredTracks, layerVisibility.tracks, layerVisibility.trackLabels, layerVisibility.useNatoSymbols, showGroundTruth, multiSensorResolutions, convergedTrackIds, pictureMode]);

  // ── SECTION: Ground truth targets ──────────────────────────────────────────
  useEffect(() => {
    const g = groupsRef.current?.gt;
    if (!g) return;
    g.clearLayers();

    if (!showGroundTruth || !groundTruthTargets || groundTruthTargets.length === 0) return;

    for (const target of groundTruthTargets) {
      if (!target.active) continue;
      const { lon, lat } = target.position;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const gtId = target.targetId ?? target.name;
      const isSelected = selectedGroundTruthId === gtId;
      const size = isSelected ? 18 : 14;

      // Diamond marker (rotated square) with enlarged hit area
      const marker = L.marker([lat, lon], {
        icon: icon(
          `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;">` +
          `<div style="width:${size}px;height:${size}px;background:#00ffff;` +
          `border:${isSelected ? '3px solid #fff' : '2px solid #fff'};` +
          `transform:rotate(45deg);` +
          `${isSelected ? 'box-shadow:0 0 12px #00ffff,0 0 24px #00ffff66;' : ''}"></div></div>`,
          HIT_SIZE, HIT_ANCHOR,
        ),
        interactive: true,
        zIndexOffset: 300,
      });
      marker.bindTooltip(`GT: ${target.name} — ${target.classification ?? 'unclassified'}`, { direction: 'top', offset: [0, -12] });
      marker.on('click', (e: L.LeafletMouseEvent) => addClickCandidate('gt', gtId, `GT: ${target.name}`, '#00ffff', e.latlng));
      marker.addTo(g);

      // Selection ring + GT-to-track connection line
      if (isSelected) {
        L.marker([lat, lon], {
          icon: icon(
            `<div style="width:32px;height:32px;border:2px solid #00ffff;border-radius:50%;box-shadow:0 0 8px #00ffff88;animation:pulse-ring 1.5s ease-in-out infinite;"></div>`,
            [32, 32], [16, 16],
          ),
          interactive: false,
        }).addTo(g);

        // Find nearest track and draw connecting line
        let nearestDist = Infinity;
        let nearestTrack: typeof tracks[0] | null = null;
        for (const track of tracks) {
          const d = L.latLng(target.position.lat, target.position.lon).distanceTo(
            L.latLng(track.state.lat, track.state.lon),
          );
          if (d < nearestDist) { nearestDist = d; nearestTrack = track; }
        }

        if (nearestTrack && nearestDist < 5000) {
          const lineColor = nearestDist < 500 ? '#00cc44' : nearestDist < 2000 ? '#ffcc00' : '#ff3333';
          L.polyline(
            [[lat, lon], [nearestTrack.state.lat, nearestTrack.state.lon]],
            { color: lineColor, weight: 2, dashArray: '6,4', opacity: 0.8, interactive: false },
          ).addTo(g);

          // Distance label at midpoint
          const midLat = (lat + nearestTrack.state.lat) / 2;
          const midLon = (lon + nearestTrack.state.lon) / 2;
          const distStr = nearestDist < 1000 ? `${nearestDist.toFixed(0)}m` : `${(nearestDist / 1000).toFixed(2)}km`;
          L.marker([midLat, midLon], {
            icon: icon(
              `<span style="font:9px monospace;color:#fff;background:#000a;padding:1px 4px;border-radius:2px;">${distStr}</span>`,
              [60, 14], [30, 7],
            ),
            interactive: false,
          }).addTo(g);
        }
      }

      // Name label
      const lblOffset = isSelected ? 16 : 12;
      L.marker([lat, lon], {
        icon: icon(
          `<span style="font:bold ${isSelected ? '11px' : '10px'} monospace;color:#00ffff;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${target.name}</span>`,
          [80, 14], [-lblOffset, 8],
        ),
        interactive: false,
      }).addTo(g);

      // Classification label below name
      if (target.classification) {
        L.marker([lat, lon], {
          icon: icon(
            `<span style="font:9px monospace;color:#00cccc;text-shadow:0 0 3px #000,0 0 3px #000;">${target.classification}</span>`,
            [80, 12], [-lblOffset, -4],
          ),
          interactive: false,
        }).addTo(g);
      }

      // Velocity vector line
      if (target.velocity) {
        const { vx, vy } = target.velocity;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0.1) {
          // Convert velocity to geographic offset (30px equivalent at ~40m/s baseline)
          const scale = 0.0003 / speed;
          const endLat = lat + vy * scale;
          const endLon = lon + vx * scale;
          L.polyline([[lat, lon], [endLat, endLon]], {
            color: '#00ffff', weight: 2, opacity: 0.8, interactive: false,
          }).addTo(g);
        }
      }
    }
  }, [groundTruthTargets, showGroundTruth, selectedGroundTruthId, tracks]);

  // ── EO Video Popup ─────────────────────────────────────────────────────────
  const eoVideoPopupTrackId = useUiStore(s => s.eoVideoPopupTrackId);
  const setEoVideoPopupTrackId = useUiStore(s => s.setEoVideoPopupTrackId);

  const eoPopupData = useMemo(() => {
    if (!eoVideoPopupTrackId || !map) return null;
    const track = tracks.find(t => (t.systemTrackId as string) === eoVideoPopupTrackId);
    if (!track) return null;
    if (track.eoInvestigationStatus === 'none' && !track.classification) return null;
    const { lon, lat } = track.state;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const px = map.latLngToContainerPoint([lat, lon]);
    const color = statusColor(track.status);
    return {
      trackId: track.systemTrackId as string,
      classification: (track as any).classification ?? 'unknown',
      confidence: (track as any).classificationConfidence ?? 0.5,
      statusColor: color,
      trackScreenX: px.x,
      trackScreenY: px.y,
    };
  }, [eoVideoPopupTrackId, tracks, map]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes trail-flash {
          0% { box-shadow: 0 0 8px 3px currentColor; transform: scale(1.3); }
          100% { box-shadow: none; transform: scale(1); }
        }
        @keyframes pulse-ring {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.15); }
        }
      `}</style>
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
