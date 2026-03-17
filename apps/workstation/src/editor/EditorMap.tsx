import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEditorStore } from '../stores/editor-store';
import type { EditorSensor } from '../stores/editor-store';
import { SENSOR_TEMPLATES } from './sensor-templates';

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
    // Approximate circle as polygon (32 points)
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
      properties: {
        id: s.id,
        color: SENSOR_COLORS[s.type] || '#888',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function EditorMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layersReady, setLayersReady] = useState(false);

  const sensors = useEditorStore((s) => s.sensors);
  const editMode = useEditorStore((s) => s.editMode);
  const addSensor = useEditorStore((s) => s.addSensor);
  const selectItem = useEditorStore((s) => s.selectItem);
  const setEditMode = useEditorStore((s) => s.setEditMode);
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

      // Coverage layer (below sensors)
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

      // Sensor circles
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

      // Sensor labels
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

      // Click on sensor to select
      m.on('click', SENSOR_LAYER, (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties?.id;
          if (id) {
            selectItem('sensor', id);
            // Stop propagation so map click doesn't fire
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
      const currentMode = useEditorStore.getState().editMode;
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
        useEditorStore.getState().addSensor(newSensor);
        useEditorStore.getState().selectItem('sensor', newSensor.id);
        useEditorStore.getState().setEditMode('select');
      } else if (currentMode === 'select') {
        // Deselect if clicking empty space (sensor click is handled by layer click above)
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
