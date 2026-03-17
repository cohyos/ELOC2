import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useTaskStore } from '../stores/task-store';
import { useUiStore } from '../stores/ui-store';
import { initTrackLayer, updateTrackLayer, getTrackLayerId } from './layers/track-layer';
import { initSensorLayer, updateSensorLayer, getSensorLayerId } from './layers/sensor-layer';
import { initCoverageLayer, updateCoverageLayer } from './layers/coverage-layer';
import { initEoRayLayer, updateEoRayLayer } from './layers/eo-ray-layer';
import { initTriangulationLayer, updateTriangulationLayer } from './layers/triangulation-layer';
import { initBearingLineLayer, updateBearingLineLayer, type BearingLine } from './layers/bearing-line-layer';
import { initInvestigationRingLayer, updateInvestigationRingLayer } from './layers/investigation-ring-layer';
import { initAmbiguityMarkerLayer, updateAmbiguityMarkerLayer, getAmbiguityMarkerLayerIds } from './layers/ambiguity-marker-layer';
import { initSelectionRayLayer, updateSelectionRayLayer, clearSelectionRayLayer } from './layers/selection-ray-layer';
import { DebugOverlay } from './DebugOverlay';
import { LayerFilterPanel } from './LayerFilterPanel';
import type { LayerVisibility, SelectionBearingRay } from '../stores/ui-store';
import { useDemoStore } from '../stores/demo-store';
import { applyBasicMode, applyFullMode } from '../demo/BasicModeFilter';

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // Use state (not ref) so that when layers become ready, effects re-fire
  const [layersReady, setLayersReady] = useState(false);

  const tracks = useTrackStore(s => s.tracks);
  const sensors = useSensorStore(s => s.sensors);
  const selectTrack = useUiStore(s => s.selectTrack);
  const selectSensor = useUiStore(s => s.selectSensor);
  const selectCue = useUiStore(s => s.selectCue);
  const selectGroup = useUiStore(s => s.selectGroup);
  const selectGeometry = useUiStore(s => s.selectGeometry);
  const eoTracks = useTaskStore(s => s.eoTracks);
  const geometryEstimates = useTaskStore(s => s.geometryEstimates);
  const unresolvedGroups = useTaskStore(s => s.unresolvedGroups);
  const registrationStates = useTaskStore(s => s.registrationStates);
  const selectedTrackId = useUiStore(s => s.selectedTrackId);
  const highlightedSensorIds = useUiStore(s => s.highlightedSensorIds);
  const selectionBearingRays = useUiStore(s => s.selectionBearingRays);
  const setHighlightedSensors = useUiStore(s => s.setHighlightedSensors);
  const setSelectionBearingRays = useUiStore(s => s.setSelectionBearingRays);
  const clearSelectionHighlights = useUiStore(s => s.clearSelectionHighlights);
  const activeCues = useTaskStore(s => s.activeCues);
  const layerVisibility = useUiStore(s => s.layerVisibility);
  const trackStatusFilter = useUiStore(s => s.trackStatusFilter);
  const demoActive = useDemoStore(s => s.active);
  const viewMode = useDemoStore(s => s.viewMode);

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

    // Log map errors for debugging
    map.current.on('error', (e) => {
      console.error('[MapView] MapLibre error:', e.error?.message || e);
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.current.on('load', () => {
      if (!map.current) return;
      try { initCoverageLayer(map.current); } catch (e) { console.warn('Coverage layer init failed:', e); }
      try { initTriangulationLayer(map.current); } catch (e) { console.warn('Triangulation layer init failed:', e); }
      try { initEoRayLayer(map.current); } catch (e) { console.warn('EO ray layer init failed:', e); }
      try { initSensorLayer(map.current); } catch (e) { console.warn('Sensor layer init failed:', e); }
      try { initInvestigationRingLayer(map.current); } catch (e) { console.warn('Investigation ring layer init failed:', e); }
      try { initBearingLineLayer(map.current); } catch (e) { console.warn('Bearing line layer init failed:', e); }
      try { initAmbiguityMarkerLayer(map.current); } catch (e) { console.warn('Ambiguity marker layer init failed:', e); }
      try { initSelectionRayLayer(map.current); } catch (e) { console.warn('Selection ray layer init failed:', e); }
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

      // Bearing line click → find matching cue
      map.current.on('click', 'bearing-lines-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const sensorId = e.features[0].properties?.sensorId;
          if (sensorId) {
            // Find cue by matching sensor to an active cue's system track
            const cues = useTaskStore.getState().activeCues;
            const eoTs = useTaskStore.getState().eoTracks;
            // Find the eo track for this sensor/bearing
            const eoTrack = eoTs.find(t => t.sensorId === sensorId && t.bearing);
            if (eoTrack?.associatedSystemTrackId) {
              const cue = cues.find(c => c.systemTrackId === eoTrack.associatedSystemTrackId);
              if (cue) {
                selectCue(cue.cueId);
                return;
              }
            }
            // Fallback: select first cue related to this sensor
            const anyCue = cues.find(c => eoTs.some(t => t.sensorId === sensorId && t.associatedSystemTrackId === c.systemTrackId));
            if (anyCue) selectCue(anyCue.cueId);
          }
        }
      });

      // Ambiguity marker click → select group
      map.current.on('click', 'ambiguity-markers-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const groupId = e.features[0].properties?.groupId;
          if (groupId) selectGroup(groupId);
        }
      });

      // Triangulation ray click → select geometry
      map.current.on('click', 'triangulation-rays-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const trackId = e.features[0].properties?.trackId;
          if (trackId) selectGeometry(trackId);
        }
      });

      // Cursor changes
      const interactiveLayers = [
        getTrackLayerId(),
        getSensorLayerId(),
        'bearing-lines-layer',
        'ambiguity-markers-layer',
        'triangulation-rays-layer',
      ];
      for (const layerId of interactiveLayers) {
        map.current.on('mouseenter', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }
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
    const filteredTracks = tracks.filter(t =>
      trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
    );
    updateTrackLayer(map.current, filteredTracks, selectedTrackId);
    updateTriangulationLayer(map.current, filteredTracks, sensors, geometryEstimates);
    updateInvestigationRingLayer(map.current, filteredTracks);
    updateAmbiguityMarkerLayer(map.current, unresolvedGroups, filteredTracks);
  }, [tracks, sensors, layersReady, trackStatusFilter, geometryEstimates, unresolvedGroups, selectedTrackId]);

  // Update sensor layers when sensors change OR when layers become ready
  useEffect(() => {
    if (!map.current || !layersReady) return;
    updateSensorLayer(map.current, sensors, registrationStates, highlightedSensorIds);
    updateCoverageLayer(map.current, sensors);
    updateEoRayLayer(map.current, sensors);
  }, [sensors, layersReady, registrationStates, highlightedSensorIds]);

  // Update bearing line layer from EO tracks
  useEffect(() => {
    if (!map.current || !layersReady) return;
    const sensorMap = new Map(sensors.map(s => [s.sensorId, s]));
    const bearingLines: BearingLine[] = eoTracks
      .filter(t => t.bearing && sensorMap.has(t.sensorId))
      .map(t => {
        const sensor = sensorMap.get(t.sensorId)!;
        return {
          sensorId: t.sensorId,
          azimuthDeg: t.bearing.azimuthDeg,
          sensorLon: sensor.position.lon,
          sensorLat: sensor.position.lat,
          color: t.status === 'confirmed' ? '#00cc44' : '#ffaa33',
        };
      });
    updateBearingLineLayer(map.current, bearingLines);
  }, [eoTracks, sensors, layersReady]);

  // Track selection highlighting: compute contributing sensors, bearing rays, camera fit
  useEffect(() => {
    if (!map.current || !layersReady) return;

    if (!selectedTrackId) {
      clearSelectionHighlights();
      clearSelectionRayLayer(map.current);
      return;
    }

    // Find the selected track
    const track = tracks.find(t => t.systemTrackId === selectedTrackId);
    if (!track) {
      clearSelectionHighlights();
      clearSelectionRayLayer(map.current);
      return;
    }

    // Get contributing sensor IDs from track.sources
    const contributingSensorIds: string[] = (track.sources ?? []) as string[];

    // Get EO bearings associated with this track
    const trackEoBearings = eoTracks.filter(
      et => et.associatedSystemTrackId === selectedTrackId && et.bearing
    );

    // Add EO sensor IDs to the contributing set
    const allSensorIds = new Set(contributingSensorIds);
    for (const et of trackEoBearings) {
      allSensorIds.add(et.sensorId);
    }

    // Also check active cues for this track
    const trackCues = activeCues.filter(c => c.systemTrackId === selectedTrackId);

    setHighlightedSensors(Array.from(allSensorIds));

    // Build bearing rays from EO sensor positions + azimuth
    const sensorMap = new Map(sensors.map(s => [s.sensorId, s]));
    const rays: SelectionBearingRay[] = trackEoBearings
      .filter(et => sensorMap.has(et.sensorId))
      .map(et => {
        const sensor = sensorMap.get(et.sensorId)!;
        return {
          sensorLat: sensor.position.lat,
          sensorLon: sensor.position.lon,
          azimuthDeg: et.bearing.azimuthDeg,
          color: '#ffffff',
        };
      });

    setSelectionBearingRays(rays);
    updateSelectionRayLayer(map.current, rays);

    // Compute bounding box to fit selected track + contributing sensors, then fly to it
    const points: [number, number][] = [[track.state.lon, track.state.lat]];
    for (const sId of allSensorIds) {
      const sensor = sensorMap.get(sId);
      if (sensor) {
        points.push([sensor.position.lon, sensor.position.lat]);
      }
    }

    if (points.length >= 2) {
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lon, lat] of points) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      try {
        map.current.fitBounds(
          [[minLon, minLat], [maxLon, maxLat]],
          { padding: 80, maxZoom: 12, duration: 1000 }
        );
      } catch (e) {
        console.warn('[MapView] fitBounds failed:', e);
      }
    } else if (points.length === 1) {
      try {
        map.current.flyTo({
          center: points[0],
          zoom: 10,
          duration: 1000,
        });
      } catch (e) {
        console.warn('[MapView] flyTo failed:', e);
      }
    }
  }, [selectedTrackId, tracks, sensors, eoTracks, activeCues, layersReady]);

  // Sync MapLibre layer visibility with store
  useEffect(() => {
    if (!map.current || !layersReady) return;
    const m = map.current;

    const layerMap: Array<[keyof LayerVisibility, string[]]> = [
      ['tracks', ['system-tracks-layer']],
      ['trackLabels', ['system-tracks-labels']],
      ['trackEllipses', ['track-ellipses-layer']],
      ['sensors', ['sensors-layer', 'sensors-degraded']],
      ['sensorLabels', ['sensors-labels']],
      ['radarCoverage', ['radar-coverage-layer']],
      ['eoFor', ['eo-for-layer']],
      ['eoFov', ['eo-fov-layer']],
      ['eoRays', ['eo-rays-layer']],
      ['triangulation', ['triangulation-rays-layer']],
      ['bearingLines', ['bearing-lines-layer']],
      ['ambiguityMarkers', ['ambiguity-markers-layer', 'ambiguity-markers-pulse']],
    ];

    for (const [key, layerIds] of layerMap) {
      const vis = layerVisibility[key] ? 'visible' : 'none';
      for (const id of layerIds) {
        try {
          if (m.getLayer(id)) {
            m.setLayoutProperty(id, 'visibility', vis);
          }
        } catch { /* layer may not exist */ }
      }
    }
  }, [layerVisibility, layersReady]);

  // Demo mode: toggle between basic and full ELOC2 view
  useEffect(() => {
    if (!map.current || !layersReady || !demoActive) return;
    if (viewMode === 'basic') {
      applyBasicMode(map.current);
    } else {
      applyFullMode(map.current);
    }
  }, [viewMode, demoActive, layersReady]);

  // Expose map instance as state so DebugOverlay can use it
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // Sync ref → state when map loads
  useEffect(() => {
    if (layersReady && map.current) {
      setMapInstance(map.current);
    }
  }, [layersReady]);

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
      <LayerFilterPanel />
      <DebugOverlay
        map={mapInstance}
        tracks={tracks}
        sensors={sensors}
        layersReady={layersReady}
        showTracks={layerVisibility.tracks}
        showTrackLabels={layerVisibility.trackLabels}
        showSensors={layerVisibility.sensors}
        showSensorLabels={layerVisibility.sensorLabels}
      />
    </div>
  );
}
