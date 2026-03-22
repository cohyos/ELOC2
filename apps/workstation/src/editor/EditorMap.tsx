import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEditorStore, ZONE_TYPE_LABELS } from '../stores/editor-store';
import type { EditorSensor, EditorTarget, EditorWaypoint, GeoVertex } from '../stores/editor-store';
import type { OperationalZone } from '@eloc2/domain';
import { SENSOR_TEMPLATES } from './sensor-templates';
import { enableCtrlBoxZoom } from '../map/ctrl-box-zoom';
import { LeafletAdapter } from '../map/map-adapter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENSOR_COLORS: Record<string, string> = {
  radar: '#4488ff',
  eo: '#ff8800',
  c4isr: '#aa44ff',
};

const ZONE_COLORS: Record<string, string> = {
  threat_corridor: 'rgba(255,50,50,0.12)',
  exclusion: 'rgba(255,0,0,0.08)',
  engagement: 'rgba(0,200,100,0.08)',
  safe_passage: 'rgba(0,150,255,0.08)',
};
const ZONE_OUTLINE_COLORS: Record<string, string> = {
  threat_corridor: 'rgba(255,50,50,0.7)',
  exclusion: 'rgba(255,0,0,0.6)',
  engagement: 'rgba(0,200,100,0.5)',
  safe_passage: 'rgba(0,150,255,0.5)',
};
const ZONE_DASH: Record<string, string> = {
  threat_corridor: '8,4',
  exclusion: '12,4,4,4',
  engagement: '6,3',
  safe_passage: '4,4',
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
// Speed-to-color mapping
// ---------------------------------------------------------------------------

function speedToColor(speedMs: number): string {
  if (speedMs < 100) return '#00cc44';
  if (speedMs > 300) return '#ff3333';
  return '#ffcc00';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditorMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const [layersReady, setLayersReady] = useState(false);
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

  // Leaflet layer groups
  const coverageGroupRef = useRef<L.LayerGroup | null>(null);
  const sensorGroupRef = useRef<L.LayerGroup | null>(null);
  const targetPathGroupRef = useRef<L.LayerGroup | null>(null);
  const waypointGroupRef = useRef<L.LayerGroup | null>(null);
  const zoneGroupRef = useRef<L.LayerGroup | null>(null);
  const zoneDrawGroupRef = useRef<L.LayerGroup | null>(null);

  const sensors = useEditorStore((s) => s.sensors);
  const targets = useEditorStore((s) => s.targets);
  const editMode = useEditorStore((s) => s.editMode);
  const activeTargetId = useEditorStore((s) => s.activeTargetId);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const operationalZones = useEditorStore((s) => s.operationalZones);
  const zoneDrawVertices = useEditorStore((s) => s.zoneDrawVertices);
  const zoneDrawMode = useEditorStore((s) => s.zoneDrawMode);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = L.map(mapContainer.current, {
      center: [31.5, 34.8],
      zoom: 8,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    // Ctrl+drag box zoom
    const adapter = new LeafletAdapter(map);
    const cleanupBoxZoom = enableCtrlBoxZoom(adapter);

    // Create layer groups (ordered bottom to top)
    const coverageGroup = L.layerGroup().addTo(map);
    const zoneGroup = L.layerGroup().addTo(map);
    const zoneDrawGroup = L.layerGroup().addTo(map);
    const targetPathGroup = L.layerGroup().addTo(map);
    const waypointGroup = L.layerGroup().addTo(map);
    const sensorGroup = L.layerGroup().addTo(map);

    coverageGroupRef.current = coverageGroup;
    sensorGroupRef.current = sensorGroup;
    targetPathGroupRef.current = targetPathGroup;
    waypointGroupRef.current = waypointGroup;
    zoneGroupRef.current = zoneGroup;
    zoneDrawGroupRef.current = zoneDrawGroup;

    mapRef.current = map;

    // Map click handler for placing sensors/waypoints/zone vertices
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (dragState.current) return; // Don't process clicks during drag
      const state = useEditorStore.getState();
      const currentMode = state.editMode;

      if (currentMode === 'draw-zone') {
        state.addZoneVertex({ lat: e.latlng.lat, lon: e.latlng.lng });
        return;
      } else if (currentMode === 'place-sensor') {
        const defaults = SENSOR_TEMPLATES['long-range-radar'];
        const newSensor: EditorSensor = {
          id: crypto.randomUUID(),
          type: defaults.type,
          lat: e.latlng.lat,
          lon: e.latlng.lng,
          alt: 0,
          azMin: defaults.azMin,
          azMax: defaults.azMax,
          elMin: defaults.elMin,
          elMax: defaults.elMax,
          rangeMaxKm: defaults.rangeMaxKm,
          template: 'long-range-radar',
        };
        // Auto-fetch terrain height
        fetch(`/api/terrain/elevation?lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
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
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
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

        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        const alt = 1000;
        const speedMs = 200;

        let arrivalTimeSec = 0;
        if (target.waypoints.length > 0) {
          const prev = target.waypoints[target.waypoints.length - 1];
          const distKm = haversineDistanceKm(prev.lat, prev.lon, lat, lon);
          const timeSec = (distKm * 1000) / speedMs;
          arrivalTimeSec = prev.arrivalTimeSec + timeSec;
        }

        state.addWaypoint(targetId, {
          lat, lon, alt, speedMs, arrivalTimeSec,
        });
      }
    });

    setLayersReady(true);
    console.log('[EditorMap] Leaflet initialized');

    return () => {
      cleanupBoxZoom();
      map.remove();
      mapRef.current = null;
      setLayersReady(false);
    };
  }, []);

  // Update cursor based on edit mode
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (editMode === 'place-sensor' || editMode === 'place-waypoint' || editMode === 'draw-zone') {
      m.getContainer().style.cursor = 'crosshair';
    } else {
      m.getContainer().style.cursor = '';
    }
  }, [editMode]);

  // Update sensor layer
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !layersReady || !sensorGroupRef.current || !coverageGroupRef.current) return;

    // Clear and rebuild sensors
    sensorGroupRef.current.clearLayers();
    coverageGroupRef.current.clearLayers();

    for (const s of sensors) {
      const color = SENSOR_COLORS[s.type] || '#888';
      const label = s.nickname || `${s.type.toUpperCase()}-${s.id.slice(0, 6)}`;

      // Coverage circle (dashed outline)
      const coverageCircle = L.circle([s.lat, s.lon], {
        radius: s.rangeMaxKm * 1000,
        fill: false,
        color,
        weight: 1.5,
        dashArray: '8 8',
        opacity: 0.5,
        interactive: false,
      });
      coverageGroupRef.current!.addLayer(coverageCircle);

      // Sensor marker
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: 8,
        fillColor: color,
        fillOpacity: 0.9,
        color: '#fff',
        weight: 2,
        interactive: true,
      });

      marker.bindTooltip(label, {
        permanent: false,
        direction: 'top',
        className: 'editor-sensor-tooltip',
      });

      // Click to select
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (useEditorStore.getState().editMode !== 'select') return;
        useEditorStore.getState().selectItem('sensor', s.id);
      });

      // Drag sensor (ED-5)
      marker.on('mousedown', (e) => {
        if (useEditorStore.getState().editMode !== 'select') return;
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);

        dragState.current = { type: 'sensor', sensorId: s.id };
        m.dragging.disable();
        m.getContainer().style.cursor = 'grabbing';

        const onMove = (moveEvt: L.LeafletMouseEvent) => {
          if (!dragState.current || dragState.current.type !== 'sensor') return;
          useEditorStore.getState().updateSensor(dragState.current.sensorId, {
            lat: moveEvt.latlng.lat,
            lon: moveEvt.latlng.lng,
          });
        };

        const onUp = () => {
          dragState.current = null;
          m.dragging.enable();
          m.getContainer().style.cursor = '';
          m.off('mousemove', onMove);
          m.off('mouseup', onUp);
        };

        m.on('mousemove', onMove);
        m.on('mouseup', onUp);
      });

      sensorGroupRef.current!.addLayer(marker);
    }
  }, [sensors, layersReady]);

  // Update target paths and waypoint markers
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !layersReady || !targetPathGroupRef.current || !waypointGroupRef.current) return;

    targetPathGroupRef.current.clearLayers();
    waypointGroupRef.current.clearLayers();

    for (const t of targets) {
      const isActive = t.id === activeTargetId;

      // Draw path segments colored by speed
      if (t.waypoints.length >= 2) {
        for (let i = 0; i < t.waypoints.length - 1; i++) {
          const wp1 = t.waypoints[i];
          const wp2 = t.waypoints[i + 1];
          const avgSpeed = (wp1.speedMs + wp2.speedMs) / 2;
          const line = L.polyline(
            [[wp1.lat, wp1.lon], [wp2.lat, wp2.lon]],
            {
              color: isActive ? speedToColor(avgSpeed) : '#555',
              weight: isActive ? 3 : 1.5,
              opacity: isActive ? 0.9 : 0.4,
              interactive: false,
            },
          );
          targetPathGroupRef.current!.addLayer(line);
        }
      }

      // Draw waypoint markers
      for (let i = 0; i < t.waypoints.length; i++) {
        const wp = t.waypoints[i];
        const marker = L.circleMarker([wp.lat, wp.lon], {
          radius: isActive ? 6 : 4,
          fillColor: isActive ? '#ffffff' : '#888',
          fillOpacity: 0.95,
          color: isActive ? speedToColor(wp.speedMs) : '#555',
          weight: 2,
          interactive: true,
        });

        // Drag waypoint
        marker.on('mousedown', (e) => {
          if (useEditorStore.getState().editMode !== 'select') return;
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);

          dragState.current = {
            type: 'waypoint',
            targetId: t.id,
            waypointIndex: i,
          };
          m.dragging.disable();
          m.getContainer().style.cursor = 'grabbing';

          const onMove = (moveEvt: L.LeafletMouseEvent) => {
            if (!dragState.current || dragState.current.type !== 'waypoint') return;
            const { targetId, waypointIndex } = dragState.current;
            useEditorStore.getState().updateWaypoint(targetId, waypointIndex, {
              lat: moveEvt.latlng.lat,
              lon: moveEvt.latlng.lng,
            });
            recalcArrivalTimes(targetId);
          };

          const onUp = () => {
            dragState.current = null;
            m.dragging.enable();
            m.getContainer().style.cursor = '';
            m.off('mousemove', onMove);
            m.off('mouseup', onUp);
          };

          m.on('mousemove', onMove);
          m.on('mouseup', onUp);
        });

        // Right-click to delete waypoint
        marker.on('contextmenu', (e) => {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          useEditorStore.getState().removeWaypoint(t.id, i);
          recalcArrivalTimes(t.id);
        });

        waypointGroupRef.current!.addLayer(marker);
      }
    }
  }, [targets, activeTargetId, layersReady]);

  // Update zone layers
  useEffect(() => {
    if (!layersReady || !zoneGroupRef.current) return;
    zoneGroupRef.current.clearLayers();

    for (const zone of operationalZones) {
      if (!zone.polygon || zone.polygon.length < 3) continue;
      const latlngs = zone.polygon
        .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon))
        .map((v) => [v.lat, v.lon] as [number, number]);
      if (latlngs.length < 3) continue;

      const fillColor = zone.color ? `${zone.color}20` : ZONE_COLORS[zone.zoneType] ?? ZONE_COLORS.engagement;
      const strokeColor = zone.color ?? ZONE_OUTLINE_COLORS[zone.zoneType] ?? ZONE_OUTLINE_COLORS.engagement;
      const dash = ZONE_DASH[zone.zoneType] ?? '6,3';

      const polygon = L.polygon(latlngs, {
        fillColor,
        fillOpacity: 1,
        color: strokeColor,
        weight: 2,
        dashArray: dash,
        interactive: false,
      });
      zoneGroupRef.current!.addLayer(polygon);

      // Zone name label at centroid
      if (zone.name) {
        const centLat = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
        const centLon = latlngs.reduce((s, p) => s + p[1], 0) / latlngs.length;
        const icon = L.divIcon({
          className: '',
          html: `<span style="font:bold 10px monospace;color:${strokeColor};white-space:nowrap;text-shadow:0 0 3px #000,0 0 6px #000;">${zone.name}</span>`,
          iconSize: [100, 14],
          iconAnchor: [50, 7],
        });
        L.marker([centLat, centLon], { icon, interactive: false }).addTo(zoneGroupRef.current!);
      }
    }
  }, [operationalZones, layersReady]);

  // Update cursor based on edit mode
  useEffect(() => {
    if (!layersReady || !zoneDrawGroupRef.current) return;
    zoneDrawGroupRef.current.clearLayers();

    if (zoneDrawVertices.length === 0) return;

    // Points
    for (const v of zoneDrawVertices) {
      const marker = L.circleMarker([v.lat, v.lon], {
        radius: 5,
        fillColor: '#ffcc00',
        fillOpacity: 1,
        color: '#fff',
        weight: 2,
        interactive: false,
      });
      zoneDrawGroupRef.current.addLayer(marker);
    }

    // Line (+ close polygon if 3+ vertices)
    if (zoneDrawVertices.length >= 2) {
      const latlngs = zoneDrawVertices.map((v) => [v.lat, v.lon] as [number, number]);
      if (zoneDrawVertices.length >= 3) {
        latlngs.push([zoneDrawVertices[0].lat, zoneDrawVertices[0].lon]);
      }
      const line = L.polyline(latlngs, {
        color: '#ffcc00',
        weight: 2,
        dashArray: '8 4',
        interactive: false,
      });
      zoneDrawGroupRef.current.addLayer(line);
    }
  }, [zoneDrawVertices, layersReady]);

  // Mode indicator overlay
  const zoneModeLabels: Record<string, string> = {
    threat_corridor: 'Click to define threat corridor vertices',
    exclusion: 'Click to define exclusion zone vertices',
    engagement: 'Click to define engagement zone vertices',
    safe_passage: 'Click to define safe passage vertices',
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
    <div style={{ position: 'relative', width: '100%', height: '100%', userSelect: 'none' }}>
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
          <span style={{ color: '#888', fontSize: '10px' }}>
            ESC to cancel
          </span>
        </div>
      )}
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
            onClick={() => useEditorStore.getState().startZoneDraw('threat_corridor')}
            title="Threat Corridor — Deployment optimizer prioritizes sensor coverage of this area (20% scoring weight)"
            style={{ background: '#1a1a2ecc', color: '#ff3232', border: '1px solid #ff323266', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
          >+ Threat</button>
          <button
            onClick={() => useEditorStore.getState().startZoneDraw('exclusion')}
            title="Exclusion Zone — Sensors cannot be placed inside this area during deployment optimization"
            style={{ background: '#1a1a2ecc', color: '#ff0000', border: '1px solid #ff000066', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
          >+ Exclusion</button>
          <button
            onClick={() => useEditorStore.getState().startZoneDraw('engagement')}
            title="Engagement Zone — Marks the primary engagement area on the map (visual reference)"
            style={{ background: '#1a1a2ecc', color: '#00c864', border: '1px solid #00c86466', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
          >+ Engage</button>
          <button
            onClick={() => useEditorStore.getState().startZoneDraw('safe_passage')}
            title="Safe Passage — Marks safe transit corridors on the map (visual reference)"
            style={{ background: '#1a1a2ecc', color: '#0096ff', border: '1px solid #0096ff66', borderRadius: '3px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
          >+ Safe</button>
          {operationalZones.length > 0 && (
            <button
              onClick={() => useEditorStore.getState().clearZones()}
              title="Remove all zones"
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
