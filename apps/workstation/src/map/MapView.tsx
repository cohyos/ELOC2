import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useTaskStore } from '../stores/task-store';
import { useUiStore } from '../stores/ui-store';
import { initTrackLayer, updateTrackLayer, updateTrackTrailLayer, getTrackLayerId } from './layers/track-layer';
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
import { applyBasicMode } from '../demo/BasicModeFilter';
import { useGroundTruthStore } from '../stores/ground-truth-store';
import { useCoverZoneStore } from '../stores/cover-zone-store';
import { useFovOverlapStore } from '../stores/fov-overlap-store';
import { useQualityStore } from '../stores/quality-store';

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // Use state (not ref) so that when layers become ready, effects re-fire
  const [layersReady, setLayersReady] = useState(false);

  const tracks = useTrackStore(s => s.tracks);
  const trailHistory = useTrackStore(s => s.trailHistory);
  const sensors = useSensorStore(s => s.sensors);
  const searchModeStates = useSensorStore(s => s.searchModeStates);
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
  const spawnTargetActive = useUiStore(s => s.spawnTargetActive);
  const setSpawnTargetPosition = useUiStore(s => s.setSpawnTargetPosition);
  const spawnTargetPosition = useUiStore(s => s.spawnTargetPosition);
  const darkMode = useUiStore(s => s.darkMode);
  const demoActive = useDemoStore(s => s.active);
  const viewMode = useDemoStore(s => s.viewMode);
  const groundTruthTargets = useGroundTruthStore(s => s.targets);
  const showGroundTruth = useGroundTruthStore(s => s.showGroundTruth);
  const coverZones = useCoverZoneStore(s => s.coverZones);
  const fovOverlaps = useFovOverlapStore(s => s.fovOverlaps);
  const bearingAssociations = useFovOverlapStore(s => s.bearingAssociations);
  const multiSensorResolutions = useFovOverlapStore(s => s.multiSensorResolutions);
  const convergenceStates = useQualityStore(s => s.convergenceStates);

  // Derive set of converged track IDs for DebugOverlay
  const convergedTrackIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const cs of convergenceStates) {
      if (cs.converged) ids.add(cs.trackId);
    }
    return ids;
  }, [convergenceStates]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const tileUrl = darkMode
      ? 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        // Glyphs URL removed: DebugOverlay handles all text labels.
        // Having a glyphs URL causes MapLibre to fetch fonts on symbol layer
        // visibility change, which can stall the entire WebGL pipeline in
        // production (CDN timeouts, CORS, rate limiting). See post-mortem:
        // Knowledge_Base_and_Agents_instructions/Blank_Map_Postmortem_and_Testing_Lessons.md
        sources: {
          osm: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
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

    /** Initialize all data layers on the map — idempotent (safe to call multiple times) */
    const initAllLayers = (m: maplibregl.Map) => {
      try { if (!m.getSource('radar-coverage')) initCoverageLayer(m); } catch (e) { console.warn('[MapView] Coverage layer init failed:', e); }
      try { if (!m.getSource('triangulation-rays')) initTriangulationLayer(m); } catch (e) { console.warn('[MapView] Triangulation init failed:', e); }
      try { if (!m.getSource('eo-rays')) initEoRayLayer(m); } catch (e) { console.warn('[MapView] EO ray init failed:', e); }
      try { if (!m.getSource('sensors')) initSensorLayer(m); } catch (e) { console.warn('[MapView] Sensor init failed:', e); }
      try { if (!m.getSource('investigation-rings')) initInvestigationRingLayer(m); } catch (e) { console.warn('[MapView] Investigation ring init failed:', e); }
      try { if (!m.getSource('bearing-lines')) initBearingLineLayer(m); } catch (e) { console.warn('[MapView] Bearing line init failed:', e); }
      try { if (!m.getSource('ambiguity-markers')) initAmbiguityMarkerLayer(m); } catch (e) { console.warn('[MapView] Ambiguity marker init failed:', e); }
      try { if (!m.getSource('selection-rays-source')) initSelectionRayLayer(m); } catch (e) { console.warn('[MapView] Selection ray init failed:', e); }
      try { if (!m.getSource('system-tracks')) initTrackLayer(m); } catch (e) { console.warn('[MapView] Track layer init failed:', e); }
      try { m.resize(); } catch { /* ignore */ }
    };

    /** Register click handlers for interactive layers (safe to call once) */
    const registerClickHandlers = (m: maplibregl.Map) => {
      m.on('click', getTrackLayerId(), (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties?.id;
          if (id) selectTrack(id);
        }
      });

      m.on('click', getSensorLayerId(), (e) => {
        if (e.features && e.features.length > 0) {
          const id = e.features[0].properties?.id;
          if (id) selectSensor(id);
        }
      });

      m.on('click', 'bearing-lines-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const sensorId = e.features[0].properties?.sensorId;
          if (sensorId) {
            const cues = useTaskStore.getState().activeCues;
            const eoTs = useTaskStore.getState().eoTracks;
            const eoTrack = eoTs.find(t => t.sensorId === sensorId && t.bearing);
            if (eoTrack?.associatedSystemTrackId) {
              const cue = cues.find(c => c.systemTrackId === eoTrack.associatedSystemTrackId);
              if (cue) { selectCue(cue.cueId); return; }
            }
            const anyCue = cues.find(c => eoTs.some(t => t.sensorId === sensorId && t.associatedSystemTrackId === c.systemTrackId));
            if (anyCue) selectCue(anyCue.cueId);
          }
        }
      });

      m.on('click', 'ambiguity-markers-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const groupId = e.features[0].properties?.groupId;
          if (groupId) selectGroup(groupId);
        }
      });

      m.on('click', 'triangulation-rays-layer', (e) => {
        if (e.features && e.features.length > 0) {
          const trackId = e.features[0].properties?.trackId;
          if (trackId) selectGeometry(trackId);
        }
      });

      const interactiveLayers = [
        getTrackLayerId(), getSensorLayerId(),
        'bearing-lines-layer', 'ambiguity-markers-layer', 'triangulation-rays-layer',
      ];
      for (const layerId of interactiveLayers) {
        m.on('mouseenter', layerId, () => { if (map.current) map.current.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', layerId, () => { if (map.current) map.current.getCanvas().style.cursor = ''; });
      }
    };

    let initialized = false;

    /** Try to initialize layers — called from multiple triggers for reliability */
    const tryInit = (source: string) => {
      if (initialized || !map.current) return;
      try {
        initAllLayers(map.current);
        // Verify at least one source was created
        if (map.current.getSource('system-tracks')) {
          initialized = true;
          console.log(`[MapView] Layers initialized via: ${source}`);
          registerClickHandlers(map.current);
          setLayersReady(true);
        } else {
          console.warn(`[MapView] Layer init via ${source} — sources not created yet, will retry`);
        }
      } catch (e) {
        console.warn(`[MapView] Layer init via ${source} failed:`, e);
      }
    };

    // Strategy 1: on 'load' event (standard approach)
    map.current.on('load', () => tryInit('load'));

    // Strategy 2: on 'idle' event (fires after all rendering is complete)
    map.current.once('idle', () => tryInit('idle'));

    // Strategy 3: short timeout (1 second — covers most fast-loading cases)
    const timer1 = setTimeout(() => tryInit('timeout-1s'), 1000);

    // Strategy 4: medium timeout (3 seconds)
    const timer2 = setTimeout(() => tryInit('timeout-3s'), 3000);

    // Strategy 5: long timeout (8 seconds — last resort)
    const timer3 = setTimeout(() => {
      if (!initialized && map.current) {
        console.error('[MapView] CRITICAL: Layers still not initialized after 8s — forcing init');
        // Force it regardless of source existence checks
        try {
          initAllLayers(map.current);
          initialized = true;
          registerClickHandlers(map.current);
          setLayersReady(true);
        } catch (e) {
          console.error('[MapView] Force init failed:', e);
        }
      }
    }, 8000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      map.current?.remove();
      map.current = null;
      setLayersReady(false);
    };
  }, []);

  // Switch map tiles when dark mode toggles
  useEffect(() => {
    if (!map.current) return;
    const src = map.current.getSource('osm') as any;
    if (!src) return;
    const tiles = darkMode
      ? ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png']
      : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
    src.setTiles(tiles);
  }, [darkMode]);

  // Update track layer when tracks change OR when layers become ready
  useEffect(() => {
    if (!map.current || !layersReady) return;
    const filteredTracks = tracks.filter(t =>
      trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
    );
    updateTrackLayer(map.current, filteredTracks, selectedTrackId);
    updateTrackTrailLayer(map.current, trailHistory, filteredTracks);
    updateTriangulationLayer(map.current, filteredTracks, sensors, geometryEstimates);
    updateInvestigationRingLayer(map.current, filteredTracks);
    updateAmbiguityMarkerLayer(map.current, unresolvedGroups, filteredTracks);
  }, [tracks, sensors, trailHistory, layersReady, trackStatusFilter, geometryEstimates, unresolvedGroups, selectedTrackId]);

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

  // Sync MapLibre layer visibility with store + demo mode
  useEffect(() => {
    if (!map.current || !layersReady) return;
    const m = map.current;

    const layerMap: Array<[keyof LayerVisibility, string[]]> = [
      ['tracks', ['system-tracks-layer', 'track-eo-badge', 'track-trails-layer', 'track-selection-pulse-layer', 'investigation-rings-layer', 'investigation-rings-outer']],
      // trackLabels and sensorLabels are handled by DebugOverlay (HTML), not MapLibre.
      // Symbol layers remain hidden to avoid glyph CDN loading.
      ['trackEllipses', ['track-ellipses-layer']],
      ['sensors', ['sensors-layer', 'sensors-degraded', 'sensors-highlight-ring']],
      ['radarCoverage', ['radar-coverage-layer', 'radar-coverage-outline']],
      ['eoFor', ['eo-for-layer']],
      ['eoFov', ['eo-fov-layer']],
      ['eoRays', ['eo-rays-layer']],
      ['triangulation', ['triangulation-rays-layer']],
      ['bearingLines', ['bearing-lines-layer']],
      ['ambiguityMarkers', ['ambiguity-markers-layer', 'ambiguity-markers-pulse']],
    ];

    // First: apply layer filter visibility from store
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

    // Then: if demo is active in basic mode, force-hide EO/advanced layers on top
    if (demoActive && viewMode === 'basic') {
      applyBasicMode(m);
    }
  }, [layerVisibility, layersReady, demoActive, viewMode]);

  // Spawn-target map click interception
  const spawnMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map.current || !layersReady) return;
    if (!spawnTargetActive) {
      // Remove marker + restore cursor when deactivated
      if (spawnMarkerRef.current) {
        spawnMarkerRef.current.remove();
        spawnMarkerRef.current = null;
      }
      map.current.getCanvas().style.cursor = '';
      return;
    }

    // Change cursor to crosshair while in spawn mode
    map.current.getCanvas().style.cursor = 'crosshair';

    const handler = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      setSpawnTargetPosition({ lat, lon: lng });

      // Place / move a temporary marker
      if (spawnMarkerRef.current) {
        spawnMarkerRef.current.setLngLat([lng, lat]);
      } else {
        const el = document.createElement('div');
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.background = '#00cc44';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 0 8px rgba(0,204,68,0.6)';
        spawnMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map.current!);
      }
    };

    map.current.on('click', handler);
    return () => {
      map.current?.off('click', handler);
      map.current && (map.current.getCanvas().style.cursor = '');
    };
  }, [spawnTargetActive, layersReady, setSpawnTargetPosition]);

  // Clean up spawn marker when position is cleared (after submit)
  useEffect(() => {
    if (!spawnTargetPosition && spawnMarkerRef.current) {
      spawnMarkerRef.current.remove();
      spawnMarkerRef.current = null;
    }
  }, [spawnTargetPosition]);

  // DebugOverlay: always show HTML markers (bypasses GL layers entirely)
  // This verifies data flow independently of MapLibre layer init.
  // DebugOverlay: HTML-based track/sensor rendering (primary reliable renderer).
  // MapLibre circle layers may fail due to glyph CDN / WebGL issues in production.
  // Gate behind ?nodebug to disable if needed for testing MapLibre-only rendering.
  const hideOverlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nodebug');
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // Set map instance as soon as the map exists (don't wait for layersReady)
  useEffect(() => {
    if (map.current && !mapInstance) {
      // Small delay to ensure map is rendered
      const t = setTimeout(() => {
        if (map.current) setMapInstance(map.current);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [layersReady, mapInstance]);

  // Track status filtered tracks for the overlay (same filter as MapLibre layers)
  const filteredTracksForOverlay = tracks.filter(t =>
    trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%',
          filter: darkMode ? 'none' : 'brightness(0.85) saturate(0.7)',
        }}
      />
      <LayerFilterPanel />
      {!hideOverlay && (
        <DebugOverlay
          map={mapInstance}
          tracks={filteredTracksForOverlay}
          sensors={sensors}
          trailHistory={trailHistory}
          layersReady={layersReady}
          layerVisibility={layerVisibility}
          onSelectTrack={selectTrack}
          onSelectSensor={selectSensor}
          groundTruthTargets={groundTruthTargets}
          showGroundTruth={showGroundTruth}
          coverZones={coverZones}
          searchModeStates={searchModeStates}
          fovOverlaps={fovOverlaps}
          bearingAssociations={bearingAssociations}
          multiSensorResolutions={multiSensorResolutions}
          convergedTrackIds={convergedTrackIds}
        />
      )}
    </div>
  );
}
