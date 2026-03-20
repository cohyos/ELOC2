import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEditorStore } from '../stores/editor-store';
import type { EditorSensor, EditorTarget, EditorWaypoint, GeoVertex } from '../stores/editor-store';
import { SENSOR_TEMPLATES } from './sensor-templates';
import { enableCtrlBoxZoom } from '../map/ctrl-box-zoom';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENSOR_COLORS: Record<string, string> = {
  radar: '#4488ff',
  eo: '#ff8800',
  c4isr: '#aa44ff',
};

// ---------------------------------------------------------------------------
// Haversine distance (km)
// ---------------------------------------------------------------------------

function haversineDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// SVG/HTML overlay builders (no WebGL data layers)
// ---------------------------------------------------------------------------

function buildSvgOverlay(
  map: maplibregl.Map,
  sensors: EditorSensor[],
  targets: EditorTarget[],
  activeTargetId: string | null,
  operationalArea: GeoVertex[],
  exclusionZones: GeoVertex[][],
  threatZones: GeoVertex[][],
  zoneDrawVertices: GeoVertex[],
  zoneDrawMode: string | null,
): string {
  let svg = '';

  // --- Zones ---
  const drawPoly = (verts: GeoVertex[], fill: string, stroke: string) => {
    if (verts.length < 3) return;
    const d = verts.map((v, i) => {
      const p = map.project([v.lon, v.lat]);
      return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
    }).join(' ') + ' Z';
    svg += `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-dasharray="6 3" />`;
  };

  if (operationalArea.length >= 3) drawPoly(operationalArea, 'rgba(0,204,68,0.12)', '#00cc44');
  for (const z of exclusionZones) drawPoly(z, 'rgba(255,51,51,0.15)', '#ff3333');
  for (const z of threatZones) drawPoly(z, 'rgba(255,136,0,0.15)', '#ff8800');

  // Zone draw preview
  if (zoneDrawVertices.length >= 2) {
    const coords = zoneDrawVertices.map(v => map.project([v.lon, v.lat]));
    let d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
    if (zoneDrawVertices.length >= 3) d += ' Z';
    svg += `<path d="${d}" fill="rgba(255,204,0,0.1)" stroke="#ffcc00" stroke-width="2" stroke-dasharray="4 2" />`;
    for (const c of coords) {
      svg += `<circle cx="${c.x}" cy="${c.y}" r="4" fill="#ffcc00" stroke="#fff" stroke-width="1.5" />`;
    }
  }

  // --- Sensor coverage circles ---
  for (const s of sensors) {
    const center = map.project([s.lon, s.lat]);
    const color = SENSOR_COLORS[s.type] || '#888';
    const degOffset = (s.rangeMaxKm * 1000) / 111320;
    const edge = map.project([s.lon, s.lat + degOffset]);
    const rPx = Math.abs(center.y - edge.y);
    svg += `<circle cx="${center.x}" cy="${center.y}" r="${rPx}" fill="none" stroke="${color}80" stroke-width="1.5" stroke-dasharray="4 4" />`;
  }

  // --- Target paths ---
  for (const t of targets) {
    const isBallistic = t.classification === 'ballistic_missile';
    const isActive = t.id === activeTargetId;

    if (isBallistic && t.launchLat != null && t.launchLon != null && t.impactLat != null && t.impactLon != null) {
      // Draw ballistic arc: launch → impact with arc indicator
      const lp = map.project([t.launchLon, t.launchLat]);
      const ip = map.project([t.impactLon, t.impactLat]);
      const mx = (lp.x + ip.x) / 2;
      const my = (lp.y + ip.y) / 2 - 40; // arc upward
      const color = isActive ? '#ff3333' : '#ff333388';
      const width = isActive ? 2.5 : 1.5;
      svg += `<path d="M${lp.x},${lp.y} Q${mx},${my} ${ip.x},${ip.y}" fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="6 3" />`;
      // Impact circle
      svg += `<circle cx="${ip.x}" cy="${ip.y}" r="8" fill="none" stroke="${color}" stroke-width="2" />`;
      svg += `<line x1="${ip.x - 5}" y1="${ip.y - 5}" x2="${ip.x + 5}" y2="${ip.y + 5}" stroke="${color}" stroke-width="1.5" />`;
      svg += `<line x1="${ip.x + 5}" y1="${ip.y - 5}" x2="${ip.x - 5}" y2="${ip.y + 5}" stroke="${color}" stroke-width="1.5" />`;
    } else if (!isBallistic && t.waypoints.length >= 2) {
      // Draw waypoint path segments
      for (let i = 0; i < t.waypoints.length - 1; i++) {
        const wp1 = t.waypoints[i];
        const wp2 = t.waypoints[i + 1];
        const p1 = map.project([wp1.lon, wp1.lat]);
        const p2 = map.project([wp2.lon, wp2.lat]);
        const avgSpeed = (wp1.speedMs + wp2.speedMs) / 2;
        const color = isActive
          ? (avgSpeed < 100 ? '#00cc44' : avgSpeed > 300 ? '#ff3333' : '#ffcc00')
          : '#555';
        const width = isActive ? 3 : 1.5;
        svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${color}" stroke-width="${width}" opacity="${isActive ? 0.9 : 0.4}" />`;
      }
    }
  }

  return svg;
}

function buildHtmlOverlay(
  map: maplibregl.Map,
  sensors: EditorSensor[],
  targets: EditorTarget[],
  activeTargetId: string | null,
  selectedItemId: string | null,
): string {
  let html = '';

  // --- Sensor markers ---
  for (const s of sensors) {
    const px = map.project([s.lon, s.lat]);
    const color = SENSOR_COLORS[s.type] || '#888';
    const isSelected = s.id === selectedItemId;
    const label = s.nickname || `${s.type.toUpperCase()}-${s.id.slice(0, 6)}`;
    const border = isSelected ? `3px solid #fff` : `2px solid #fff`;
    html += `<div style="position:absolute;left:${px.x}px;top:${px.y}px;transform:translate(-50%,-50%);cursor:grab;pointer-events:auto;" data-sensor-id="${s.id}">
      <div style="width:14px;height:14px;border-radius:50%;background:${color};border:${border};box-shadow:0 0 6px ${color}88;${isSelected ? 'box-shadow:0 0 10px #fff88;' : ''}"></div>
    </div>`;
    html += `<div style="position:absolute;left:${px.x + 12}px;top:${px.y - 14}px;pointer-events:none;font:bold 10px monospace;color:${color};text-shadow:0 0 3px #000,0 0 6px #000;">
      ${label}
    </div>`;
  }

  // --- Target markers (waypoints + ballistic launch/impact) ---
  for (const t of targets) {
    const isBallistic = t.classification === 'ballistic_missile';
    const isActive = t.id === activeTargetId;

    if (isBallistic) {
      // Launch point marker
      if (t.launchLat != null && t.launchLon != null) {
        const lp = map.project([t.launchLon, t.launchLat]);
        const label = t.nickname || t.label || t.id;
        html += `<div style="position:absolute;left:${lp.x}px;top:${lp.y}px;transform:translate(-50%,-50%);cursor:grab;pointer-events:auto;" data-launch-id="${t.id}">
          <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid ${isActive ? '#ff3333' : '#ff333388'};filter:drop-shadow(0 0 4px #ff3333);"></div>
        </div>`;
        html += `<div style="position:absolute;left:${lp.x + 12}px;top:${lp.y - 8}px;pointer-events:none;font:bold 10px monospace;color:#ff3333;text-shadow:0 0 3px #000;">
          ${label} (launch)
        </div>`;
      }
    } else {
      // Waypoint markers
      for (let i = 0; i < t.waypoints.length; i++) {
        const wp = t.waypoints[i];
        const px = map.project([wp.lon, wp.lat]);
        const color = isActive ? '#ffffff' : '#888';
        const stroke = isActive
          ? (wp.speedMs < 100 ? '#00cc44' : wp.speedMs > 300 ? '#ff3333' : '#ffcc00')
          : '#555';
        const r = isActive ? 6 : 4;
        html += `<div style="position:absolute;left:${px.x}px;top:${px.y}px;transform:translate(-50%,-50%);cursor:grab;pointer-events:auto;" data-waypoint-target="${t.id}" data-waypoint-index="${i}">
          <div style="width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${color};border:2px solid ${stroke};"></div>
        </div>`;
        if (i === 0 && isActive) {
          const label = t.nickname || t.label || t.id;
          html += `<div style="position:absolute;left:${px.x + 10}px;top:${px.y - 14}px;pointer-events:none;font:bold 10px monospace;color:#ff8800;text-shadow:0 0 3px #000;">
            ${label}
          </div>`;
        }
      }
    }
  }

  return html;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditorMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dragState = useRef<{
    type: 'waypoint';
    targetId: string;
    waypointIndex: number;
  } | {
    type: 'sensor';
    sensorId: string;
  } | {
    type: 'launch';
    targetId: string;
  } | null>(null);

  const sensors = useEditorStore((s) => s.sensors);
  const targets = useEditorStore((s) => s.targets);
  const editMode = useEditorStore((s) => s.editMode);
  const activeTargetId = useEditorStore((s) => s.activeTargetId);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const operationalArea = useEditorStore((s) => s.operationalArea);
  const exclusionZones = useEditorStore((s) => s.exclusionZones);
  const threatZones = useEditorStore((s) => s.threatZones);
  const zoneDrawVertices = useEditorStore((s) => s.zoneDrawVertices);
  const zoneDrawMode = useEditorStore((s) => s.zoneDrawMode);

  // Draw overlays
  const drawOverlays = useCallback(() => {
    const map = mapRef.current;
    const svg = svgRef.current;
    const markerContainer = markersRef.current;
    if (!map || !svg || !markerContainer) return;

    const canvas = map.getCanvas();
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;

    svg.innerHTML = buildSvgOverlay(
      map, sensors, targets, activeTargetId,
      operationalArea, exclusionZones, threatZones,
      zoneDrawVertices, zoneDrawMode,
    );

    markerContainer.innerHTML = buildHtmlOverlay(
      map, sensors, targets, activeTargetId, selectedItemId,
    );
  }, [sensors, targets, activeTargetId, selectedItemId, operationalArea, exclusionZones, threatZones, zoneDrawVertices, zoneDrawMode]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [34.8, 31.5],
      zoom: 8,
    });

    map.on('error', (e) => {
      console.error('[EditorMap] MapLibre error:', e.error?.message || e);
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const cleanupBoxZoom = enableCtrlBoxZoom(map);

    const scheduleRedraw = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => drawOverlays());
    };

    map.on('move', scheduleRedraw);
    map.on('zoom', scheduleRedraw);
    map.on('resize', scheduleRedraw);
    map.on('load', () => drawOverlays());

    mapRef.current = map;

    return () => {
      cleanupBoxZoom();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when data changes
  useEffect(() => {
    if (mapRef.current) drawOverlays();
  }, [drawOverlays]);

  // Click handler for placing sensors/waypoints/launch points and zone drawing
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const handler = (e: maplibregl.MapMouseEvent) => {
      const state = useEditorStore.getState();
      const currentMode = state.editMode;

      if (currentMode === 'draw-zone') {
        state.addZoneVertex({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        return;
      } else if (currentMode === 'place-sensor') {
        const defaults = SENSOR_TEMPLATES['long-range-radar'];
        const newSensor: EditorSensor = {
          id: crypto.randomUUID(),
          type: defaults.type,
          lat: e.lngLat.lat,
          lon: e.lngLat.lng,
          alt: 0,
          azMin: defaults.azMin,
          azMax: defaults.azMax,
          elMin: defaults.elMin,
          elMax: defaults.elMax,
          rangeMaxKm: defaults.rangeMaxKm,
          template: 'long-range-radar',
        };
        // Auto-fetch terrain height
        fetch(`/api/terrain/elevation?lat=${e.lngLat.lat}&lon=${e.lngLat.lng}`)
          .then(r => r.json())
          .then(data => {
            if (data.elevationM != null) {
              state.updateSensor(newSensor.id, { alt: Math.round(data.elevationM) });
            }
          })
          .catch(() => {});
        state.addSensor(newSensor);
        state.selectItem('sensor', newSensor.id);
        state.setEditMode('select');
      } else if (currentMode === 'place-launch-point') {
        const targetId = state.activeTargetId;
        if (!targetId) return;
        const lat = e.lngLat.lat;
        const lon = e.lngLat.lng;
        // Auto-fetch terrain height for launch
        fetch(`/api/terrain/elevation?lat=${lat}&lon=${lon}`)
          .then(r => r.json())
          .then(data => {
            state.updateTarget(targetId, {
              launchAlt: data.elevationM != null ? Math.round(data.elevationM) : 0,
            });
          })
          .catch(() => {});
        state.updateTarget(targetId, {
          launchLat: lat,
          launchLon: lon,
          launchAlt: 0,
        });
        state.setEditMode('select');
      } else if (currentMode === 'place-waypoint') {
        const targetId = state.activeTargetId;
        if (!targetId) return;
        const target = state.targets.find((t) => t.id === targetId);
        if (!target) return;

        const lat = e.lngLat.lat;
        const lon = e.lngLat.lng;
        const alt = 1000;
        const speedMs = 200;

        let arrivalTimeSec = 0;
        if (target.waypoints.length > 0) {
          const prev = target.waypoints[target.waypoints.length - 1];
          const distKm = haversineDistanceKm(prev.lat, prev.lon, lat, lon);
          const timeSec = (distKm * 1000) / speedMs;
          arrivalTimeSec = prev.arrivalTimeSec + timeSec;
        }

        state.addWaypoint(targetId, { lat, lon, alt, speedMs, arrivalTimeSec });
      }
    };

    m.on('click', handler);
    return () => { m.off('click', handler); };
  }, []);

  // Drag handler via mousedown on marker container
  useEffect(() => {
    const markerDiv = markersRef.current;
    const m = mapRef.current;
    if (!markerDiv || !m) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const sensorEl = target.closest('[data-sensor-id]') as HTMLElement | null;
      const wpEl = target.closest('[data-waypoint-target]') as HTMLElement | null;
      const launchEl = target.closest('[data-launch-id]') as HTMLElement | null;

      if (sensorEl) {
        const sensorId = sensorEl.dataset.sensorId!;
        dragState.current = { type: 'sensor', sensorId };
        useEditorStore.getState().selectItem('sensor', sensorId);
        e.preventDefault();
        e.stopPropagation();
      } else if (wpEl) {
        const targetId = wpEl.dataset.waypointTarget!;
        const waypointIndex = parseInt(wpEl.dataset.waypointIndex!, 10);
        dragState.current = { type: 'waypoint', targetId, waypointIndex };
        e.preventDefault();
        e.stopPropagation();
      } else if (launchEl) {
        const targetId = launchEl.dataset.launchId!;
        dragState.current = { type: 'launch', targetId };
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const rect = m.getCanvas().getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lngLat = m.unproject([x, y]);
      const store = useEditorStore.getState();

      if (dragState.current.type === 'sensor') {
        store.updateSensor(dragState.current.sensorId, {
          lat: lngLat.lat,
          lon: lngLat.lng,
        });
      } else if (dragState.current.type === 'waypoint') {
        store.updateWaypoint(dragState.current.targetId, dragState.current.waypointIndex, {
          lat: lngLat.lat,
          lon: lngLat.lng,
        });
      } else if (dragState.current.type === 'launch') {
        store.updateTarget(dragState.current.targetId, {
          launchLat: lngLat.lat,
          launchLon: lngLat.lng,
        });
      }
      m.getCanvas().style.cursor = 'grabbing';
    };

    const onMouseUp = () => {
      if (!dragState.current) return;
      if (dragState.current.type === 'waypoint') {
        recalcArrivalTimes(dragState.current.targetId);
      }
      if (dragState.current.type === 'sensor') {
        // Auto-fetch terrain height after drag
        const store = useEditorStore.getState();
        const sensor = store.sensors.find(s => s.id === (dragState.current as any).sensorId);
        if (sensor) {
          fetch(`/api/terrain/elevation?lat=${sensor.lat}&lon=${sensor.lon}`)
            .then(r => r.json())
            .then(data => {
              if (data.elevationM != null) {
                store.updateSensor(sensor.id, { alt: Math.round(data.elevationM) });
              }
            })
            .catch(() => {});
        }
      }
      if (dragState.current.type === 'launch') {
        // Auto-fetch terrain height after drag
        const store = useEditorStore.getState();
        const target = store.targets.find(t => t.id === (dragState.current as any).targetId);
        if (target && target.launchLat != null && target.launchLon != null) {
          fetch(`/api/terrain/elevation?lat=${target.launchLat}&lon=${target.launchLon}`)
            .then(r => r.json())
            .then(data => {
              if (data.elevationM != null) {
                store.updateTarget(target.id, { launchAlt: Math.round(data.elevationM) });
              }
            })
            .catch(() => {});
        }
      }
      dragState.current = null;
      if (m) m.getCanvas().style.cursor = '';
    };

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const wpEl = target.closest('[data-waypoint-target]') as HTMLElement | null;
      if (wpEl) {
        e.preventDefault();
        const targetId = wpEl.dataset.waypointTarget!;
        const waypointIndex = parseInt(wpEl.dataset.waypointIndex!, 10);
        useEditorStore.getState().removeWaypoint(targetId, waypointIndex);
        recalcArrivalTimes(targetId);
      }
    };

    markerDiv.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    markerDiv.addEventListener('contextmenu', onContextMenu);

    return () => {
      markerDiv.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      markerDiv.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  // Update cursor based on edit mode
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (editMode === 'place-sensor' || editMode === 'place-waypoint' || editMode === 'place-launch-point' || editMode === 'draw-zone') {
      m.getCanvas().style.cursor = 'crosshair';
    } else {
      m.getCanvas().style.cursor = '';
    }
  }, [editMode]);

  // Mode indicator overlay
  const zoneModeLabels: Record<string, string> = {
    'operational-area': 'Click to define operational area vertices',
    'exclusion-zone': 'Click to define exclusion zone vertices',
    'threat-zone': 'Click to define threat zone vertices',
  };

  const modeLabel =
    editMode === 'place-sensor'
      ? 'Click map to place sensor'
      : editMode === 'place-waypoint'
      ? 'Click map to add waypoint'
      : editMode === 'place-launch-point'
      ? 'Click map to set launch point'
      : editMode === 'draw-zone' && zoneDrawMode
      ? zoneModeLabels[zoneDrawMode] || 'Click to define zone'
      : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* SVG overlay for geometry (z-index 14) */}
      <svg
        ref={svgRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 14,
        }}
      />

      {/* HTML overlay for markers (z-index 15) */}
      <div
        ref={markersRef}
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

      {modeLabel && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a2ecc',
            color: '#ffcc00',
            padding: '6px 16px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            border: '1px solid #ffcc0044',
            pointerEvents: editMode === 'draw-zone' ? 'auto' : 'none',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {modeLabel}
          {editMode === 'draw-zone' && zoneDrawVertices.length >= 3 && (
            <button
              onClick={() => useEditorStore.getState().finishZoneDraw()}
              style={{
                background: '#00cc44',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                padding: '2px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Finish ({zoneDrawVertices.length} pts)
            </button>
          )}
          <span style={{ color: '#888', fontSize: '10px' }}>ESC to cancel</span>
        </div>
      )}

      {/* Zone control buttons */}
      {editMode === 'select' && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            display: 'flex',
            gap: '4px',
            zIndex: 20,
          }}
        >
          <button
            onClick={() => useEditorStore.getState().startZoneDraw('operational-area')}
            style={{ background: '#1a1a2ecc', color: '#00cc44', border: '1px solid #00cc4466', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
          >+ Op Area</button>
          <button
            onClick={() => useEditorStore.getState().startZoneDraw('exclusion-zone')}
            style={{ background: '#1a1a2ecc', color: '#ff3333', border: '1px solid #ff333366', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
          >+ Exclusion</button>
          <button
            onClick={() => useEditorStore.getState().startZoneDraw('threat-zone')}
            style={{ background: '#1a1a2ecc', color: '#ff8800', border: '1px solid #ff880066', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
          >+ Threat</button>
          {(operationalArea.length > 0 || exclusionZones.length > 0 || threatZones.length > 0) && (
            <button
              onClick={() => useEditorStore.getState().clearZones()}
              style={{ background: '#1a1a2ecc', color: '#888', border: '1px solid #44444466', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
            >Clear Zones</button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: recalculate arrival times
// ---------------------------------------------------------------------------

function recalcArrivalTimes(targetId: string) {
  const store = useEditorStore.getState();
  const target = store.targets.find((t) => t.id === targetId);
  if (!target) return;

  for (let i = 0; i < target.waypoints.length; i++) {
    if (i === 0) {
      store.updateWaypoint(targetId, 0, { arrivalTimeSec: 0 });
    } else {
      const prev = useEditorStore.getState().targets.find((t) => t.id === targetId)!.waypoints[i - 1];
      const curr = target.waypoints[i];
      const distKm = haversineDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
      const speed = curr.speedMs > 0 ? curr.speedMs : 1;
      const timeSec = (distKm * 1000) / speed;
      const updatedPrev = useEditorStore.getState().targets.find((t) => t.id === targetId)!.waypoints[i - 1];
      store.updateWaypoint(targetId, i, {
        arrivalTimeSec: updatedPrev.arrivalTimeSec + timeSec,
      });
    }
  }
}
