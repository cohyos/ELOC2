import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useUiStore } from '../stores/ui-store';
import { initTrackLayer, updateTrackLayer, getTrackLayerId } from './layers/track-layer';
import { initSensorLayer, updateSensorLayer, getSensorLayerId } from './layers/sensor-layer';
import { initCoverageLayer, updateCoverageLayer } from './layers/coverage-layer';
import { initEoRayLayer, updateEoRayLayer } from './layers/eo-ray-layer';
import { initTriangulationLayer, updateTriangulationLayer } from './layers/triangulation-layer';

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // Use state (not ref) so that when layers become ready, effects re-fire
  const [layersReady, setLayersReady] = useState(false);

  const tracks = useTrackStore(s => s.tracks);
  const sensors = useSensorStore(s => s.sensors);
  const selectTrack = useUiStore(s => s.selectTrack);
  const selectSensor = useUiStore(s => s.selectSensor);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
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
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [34.8, 31.5],
      zoom: 8,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.current.on('load', () => {
      if (!map.current) return;
      try { initCoverageLayer(map.current); } catch (e) { console.warn('Coverage layer init failed:', e); }
      try { initTriangulationLayer(map.current); } catch (e) { console.warn('Triangulation layer init failed:', e); }
      try { initEoRayLayer(map.current); } catch (e) { console.warn('EO ray layer init failed:', e); }
      try { initSensorLayer(map.current); } catch (e) { console.warn('Sensor layer init failed:', e); }
      try { initTrackLayer(map.current); } catch (e) { console.warn('Track layer init failed:', e); }

      // Use setState to trigger re-render so data effects re-fire
      setLayersReady(true);

      // Click handlers
      map.current.on('click', getTrackLayerId(), (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties?.id;
          if (id) selectTrack(id);
        }
      });

      map.current.on('click', getSensorLayerId(), (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties?.id;
          if (id) selectSensor(id);
        }
      });

      // Cursor changes
      map.current.on('mouseenter', getTrackLayerId(), () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', getTrackLayerId(), () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
      map.current.on('mouseenter', getSensorLayerId(), () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', getSensorLayerId(), () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
      setLayersReady(false);
    };
  }, []);

  // Update track layer when tracks change OR when layers become ready
  useEffect(() => {
    if (!map.current || !layersReady) return;
    updateTrackLayer(map.current, tracks);
    updateTriangulationLayer(map.current, tracks, sensors);
  }, [tracks, sensors, layersReady]);

  // Update sensor layers when sensors change OR when layers become ready
  useEffect(() => {
    if (!map.current || !layersReady) return;
    updateSensorLayer(map.current, sensors);
    updateCoverageLayer(map.current, sensors);
    updateEoRayLayer(map.current, sensors);
  }, [sensors, layersReady]);

  return (
    <div
      ref={mapContainer}
      style={{
        width: '100%',
        height: '100%',
        filter: 'brightness(0.85) saturate(0.7)',
      }}
    />
  );
}
