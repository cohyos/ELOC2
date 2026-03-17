import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEditorStore } from '../stores/editor-store';
import type { EditorSensor, EditorTarget, EditorWaypoint } from '../stores/editor-store';
import { SENSOR_TEMPLATES } from './sensor-templates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENSOR_COLORS: Record<string, string> = {
  radar: '#4488ff',
  eo: '#ff8800',
  c4isr: '#aa44ff',
};

const SENSOR_SOURCE = 'editor-sensors';
const SENSOR_LAYER = 'editor-sensors-layer';
const SENSOR_LABEL_LAYER = 'editor-sensors-labels';
const COVERAGE_SOURCE = 'editor-coverage';
const COVERAGE_LAYER = 'editor-coverage-layer';

const TARGET_PATH_SOURCE = 'editor-targets-source';
const TARGET_PATH_LAYER = 'editor-target-paths';
const WAYPOINT_MARKER_SOURCE = 'editor-waypoint-markers-source';
const WAYPOINT_MARKER_LAYER = 'editor-waypoint-markers';

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
// GeoJSON builders — sensors
// ---------------------------------------------------------------------------

function buildSensorGeoJSON(sensors: EditorSensor[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sensors.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        id: s.id,
        type: s.type,
        color: SENSOR_COLORS[s.type] || '#888',
        label: `${s.type.toUpperCase()}-${s.id.slice(0, 6)}`,
      },
    })),
  };
}

function buildCoverageGeoJSON(sensors: EditorSensor[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const s of sensors) {
    const steps = 32;
    const km = s.rangeMaxKm;
    const coords: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const dLat = (km / 111.32) * Math.cos(angle);
      const dLon =
        (km / (111.32 * Math.cos((s.lat * Math.PI) / 180))) * Math.sin(angle);
      coords.push([s.lon + dLon, s.lat + dLat]);
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: { id: s.id, color: SENSOR_COLORS[s.type] || '#888' },
    });
  }
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// GeoJSON builders — targets
// ---------------------------------------------------------------------------

function speedToColor(speedMs: number): string {
  if (speedMs < 100) return '#00cc44';
  if (speedMs > 300) return '#ff3333';
  return '#ffcc00';
}

function buildTargetPathGeoJSON(
  targets: EditorTarget[],
  activeTargetId: string | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const t of targets) {
    if (t.waypoints.length < 2) continue;
    const isActive = t.id === activeTargetId;
    // Build individual line segments so each can be colored by speed
    for (let i = 0; i < t.waypoints.length - 1; i++) {
      const wp1 = t.waypoints[i];
      const wp2 = t.waypoints[i + 1];
      const avgSpeed = (wp1.speedMs + wp2.speedMs) / 2;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [wp1.lon, wp1.lat],
            [wp2.lon, wp2.lat],
          ],
        },
        properties: {
          targetId: t.id,
          color: isActive ? speedToColor(avgSpeed) : '#555',
          width: isActive ? 3 : 1.5,
          opacity: isActive ? 0.9 : 0.4,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function buildWaypointMarkersGeoJSON(
  targets: EditorTarget[],
  activeTargetId: string | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const t of targets) {
    const isActive = t.id === activeTargetId;
    for (let i = 0; i < t.waypoints.length; i++) {
      const wp = t.waypoints[i];
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
        properties: {
          targetId: t.id,
          waypointIndex: i,
          color: isActive ? '#ffffff' : '#888',
          strokeColor: isActive ? speedToColor(wp.speedMs) : '#555',
          radius: isActive ? 6 : 4,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditorMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const dragState = useRef<{
    targetId: string;
    waypointIndex: number;
  } | null>(null);

  const sensors = useEditorStore((s) => s.sensors);
  const targets = useEditorStore((s) => s.targets);
  const editMode = useEditorStore((s) => s.editMode);
  const activeTargetId = useEditorStore((s) => s.activeTargetId);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [34.8, 31.5],
      zoom: 8,
    });

    mapRef.current.on('error', (e) => {
      console.error('[EditorMap] MapLibre error:', e.error?.message || e);
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current.addControl(
      new maplibregl.ScaleControl({ unit: 'metric' }),
      'bottom-left'
    );

    mapRef.current.on('load', () => {
      const m = mapRef.current;
      if (!m) return;

      // --- Coverage layer ---
      m.addSource(COVERAGE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: COVERAGE_LAYER,
        type: 'line',
        source: COVERAGE_SOURCE,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-dasharray': [4, 4],
          'line-opacity': 0.5,
        },
      });

      // --- Target paths layer ---
      m.addSource(TARGET_PATH_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: TARGET_PATH_LAYER,
        type: 'line',
        source: TARGET_PATH_SOURCE,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
      });

      // --- Waypoint markers layer ---
      m.addSource(WAYPOINT_MARKER_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: WAYPOINT_MARKER_LAYER,
        type: 'circle',
        source: WAYPOINT_MARKER_SOURCE,
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': ['get', 'strokeColor'],
          'circle-opacity': 0.95,
        },
      });

      // --- Sensor circles ---
      m.addSource(SENSOR_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: SENSOR_LAYER,
        type: 'circle',
        source: SENSOR_SOURCE,
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.9,
        },
      });

      // --- Sensor labels ---
      try {
        m.addLayer({
          id: SENSOR_LABEL_LAYER,
          type: 'symbol',
          source: SENSOR_SOURCE,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 10,
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
            'text-font': ['Open Sans Bold'],
          },
          paint: {
            'text-color': '#ccc',
            'text-halo-color': '#000',
            'text-halo-width': 1,
          },
        });
      } catch (e) {
        console.warn('Editor sensor labels init failed:', e);
      }

      // --- Click on sensor to select ---
      m.on('click', SENSOR_LAYER, (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties?.id;
          if (id) {
            useEditorStore.getState().selectItem('sensor', id);
            e.originalEvent.stopPropagation();
          }
        }
      });

      m.on('mouseenter', SENSOR_LAYER, () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', SENSOR_LAYER, () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
      });

      // --- Waypoint marker interactions ---
      m.on('mouseenter', WAYPOINT_MARKER_LAYER, () => {
        if (mapRef.current && useEditorStore.getState().editMode === 'select') {
          mapRef.current.getCanvas().style.cursor = 'grab';
        }
      });
      m.on('mouseleave', WAYPOINT_MARKER_LAYER, () => {
        if (mapRef.current && !dragState.current) {
          mapRef.current.getCanvas().style.cursor = '';
        }
      });

      // Drag waypoint: mousedown on marker
      m.on('mousedown', WAYPOINT_MARKER_LAYER, (e) => {
        if (useEditorStore.getState().editMode !== 'select') return;
        if (!e.features || e.features.length === 0) return;
        const props = e.features[0].properties;
        if (!props) return;

        dragState.current = {
          targetId: props.targetId as string,
          waypointIndex: props.waypointIndex as number,
        };

        m.getCanvas().style.cursor = 'grabbing';
        e.preventDefault(); // Prevent map pan

        const onMove = (moveEvt: maplibregl.MapMouseEvent) => {
          if (!dragState.current) return;
          const { targetId, waypointIndex } = dragState.current;
          const store = useEditorStore.getState();
          const target = store.targets.find((t) => t.id === targetId);
          if (!target) return;

          store.updateWaypoint(targetId, waypointIndex, {
            lat: moveEvt.lngLat.lat,
            lon: moveEvt.lngLat.lng,
          });

          // Recalculate arrival times after drag
          recalcArrivalTimes(targetId);
        };

        const onUp = () => {
          dragState.current = null;
          m.getCanvas().style.cursor = '';
          m.off('mousemove', onMove);
          m.off('mouseup', onUp);
        };

        m.on('mousemove', onMove);
        m.on('mouseup', onUp);
      });

      // Right-click waypoint to delete
      m.on('contextmenu', WAYPOINT_MARKER_LAYER, (e) => {
        e.preventDefault();
        if (!e.features || e.features.length === 0) return;
        const props = e.features[0].properties;
        if (!props) return;
        const targetId = props.targetId as string;
        const waypointIndex = props.waypointIndex as number;
        useEditorStore.getState().removeWaypoint(targetId, waypointIndex);
        // Recalculate arrival times
        recalcArrivalTimes(targetId);
      });

      setLayersReady(true);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      setLayersReady(false);
    };
  }, []);

  // Map click handler for placing sensors/waypoints
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const handler = (e: maplibregl.MapMouseEvent) => {
      const state = useEditorStore.getState();
      const currentMode = state.editMode;

      if (currentMode === 'place-sensor') {
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
        state.addSensor(newSensor);
        state.selectItem('sensor', newSensor.id);
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

        const newWaypoint: EditorWaypoint = {
          lat,
          lon,
          alt,
          speedMs,
          arrivalTimeSec,
        };

        state.addWaypoint(targetId, newWaypoint);
        // Stay in place-waypoint mode for chaining
      }
    };

    m.on('click', handler);
    return () => {
      m.off('click', handler);
    };
  }, []);

  // Update cursor based on edit mode
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (editMode === 'place-sensor' || editMode === 'place-waypoint') {
      m.getCanvas().style.cursor = 'crosshair';
    } else {
      m.getCanvas().style.cursor = '';
    }
  }, [editMode]);

  // Update sensor data on map
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !layersReady) return;

    const src = m.getSource(SENSOR_SOURCE) as maplibregl.GeoJSONSource;
    if (src) src.setData(buildSensorGeoJSON(sensors));

    const covSrc = m.getSource(COVERAGE_SOURCE) as maplibregl.GeoJSONSource;
    if (covSrc) covSrc.setData(buildCoverageGeoJSON(sensors));
  }, [sensors, layersReady]);

  // Update target paths and waypoint markers on map
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !layersReady) return;

    const pathSrc = m.getSource(TARGET_PATH_SOURCE) as maplibregl.GeoJSONSource;
    if (pathSrc) pathSrc.setData(buildTargetPathGeoJSON(targets, activeTargetId));

    const wpSrc = m.getSource(WAYPOINT_MARKER_SOURCE) as maplibregl.GeoJSONSource;
    if (wpSrc) wpSrc.setData(buildWaypointMarkersGeoJSON(targets, activeTargetId));
  }, [targets, activeTargetId, layersReady]);

  // Mode indicator overlay
  const modeLabel =
    editMode === 'place-sensor'
      ? 'Click map to place sensor'
      : editMode === 'place-waypoint'
      ? 'Click map to add waypoint'
      : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%',
          filter: 'brightness(0.85) saturate(0.7)',
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
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {modeLabel}
          <span
            style={{ marginLeft: '12px', color: '#888', fontSize: '10px' }}
          >
            ESC to cancel
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: recalculate arrival times for a target's waypoints
// ---------------------------------------------------------------------------

function recalcArrivalTimes(targetId: string) {
  const store = useEditorStore.getState();
  const target = store.targets.find((t) => t.id === targetId);
  if (!target) return;

  for (let i = 0; i < target.waypoints.length; i++) {
    if (i === 0) {
      store.updateWaypoint(targetId, 0, { arrivalTimeSec: 0 });
    } else {
      const prev = store.targets.find((t) => t.id === targetId)!.waypoints[i - 1];
      const curr = target.waypoints[i];
      const distKm = haversineDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
      const speed = curr.speedMs > 0 ? curr.speedMs : 1;
      const timeSec = (distKm * 1000) / speed;
      // Re-read prev arrival after possible update
      const updatedPrev = useEditorStore.getState().targets.find((t) => t.id === targetId)!.waypoints[i - 1];
      store.updateWaypoint(targetId, i, {
        arrivalTimeSec: updatedPrev.arrivalTimeSec + timeSec,
      });
    }
  }
}
