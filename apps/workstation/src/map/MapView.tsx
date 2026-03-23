import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useTaskStore } from '../stores/task-store';
import { useUiStore } from '../stores/ui-store';
import { DebugOverlay } from './DebugOverlay';
import { LayerFilterPanel } from './LayerFilterPanel';
import type { LayerVisibility, SelectionBearingRay } from '../stores/ui-store';
import { useDemoStore } from '../stores/demo-store';
import { useGroundTruthStore } from '../stores/ground-truth-store';
import { useCoverZoneStore } from '../stores/cover-zone-store';
import { useFovOverlapStore } from '../stores/fov-overlap-store';
import { useQualityStore } from '../stores/quality-store';
import { DeckGlOverlay } from '../3d/DeckGlOverlay';
import { enableCtrlBoxZoom } from './ctrl-box-zoom';
import type { MapAdapter } from './map-adapter';
import { MapLibreAdapter, LeafletAdapter } from './map-adapter';

// Feature flag: 'leaflet' (default) or 'maplibre'
const RENDERER = (import.meta.env.VITE_RASTER_RENDERER as string) || 'leaflet';

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const [mapAdapter, setMapAdapter] = useState<MapAdapter | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  const tracks = useTrackStore(s => s.tracks);
  const trailHistory = useTrackStore(s => s.trailHistory);
  const sensors = useSensorStore(s => s.sensors);
  const searchModeStates = useSensorStore(s => s.searchModeStates);
  const selectTrack = useUiStore(s => s.selectTrack);
  const selectSensor = useUiStore(s => s.selectSensor);
  const selectGroundTruth = useUiStore(s => s.selectGroundTruth);
  const eoTracks = useTaskStore(s => s.eoTracks);
  const selectedTrackId = useUiStore(s => s.selectedTrackId);
  const selectedGroundTruthId = useUiStore(s => s.selectedGroundTruthId);
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
  const selectedSensorId = useUiStore(s => s.selectedSensorId);
  const centerRequestSeq = useUiStore(s => s.centerRequestSeq);
  const demoActive = useDemoStore(s => s.active);
  const viewMode = useDemoStore(s => s.viewMode);
  const groundTruthTargets = useGroundTruthStore(s => s.targets);
  const showGroundTruth = useGroundTruthStore(s => s.showGroundTruth);
  const coverZones = useCoverZoneStore(s => s.coverZones);
  const operationalZones = useCoverZoneStore(s => s.operationalZones);
  const fovOverlaps = useFovOverlapStore(s => s.fovOverlaps);
  const bearingAssociations = useFovOverlapStore(s => s.bearingAssociations);
  const multiSensorResolutions = useFovOverlapStore(s => s.multiSensorResolutions);
  const convergenceStates = useQualityStore(s => s.convergenceStates);
  const ballisticEstimates = useTaskStore(s => s.ballisticEstimates);

  const convergedTrackIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const cs of convergenceStates) {
      if (cs.converged) ids.add(cs.trackId);
    }
    return ids;
  }, [convergenceStates]);

  // ── Initialize map (Leaflet or MapLibre) ──────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || adapterRef.current) return;

    const tileUrl = darkMode
      ? 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    if (RENDERER === 'leaflet') {
      cleanup = initLeaflet(mapContainer.current, tileUrl);
    } else {
      // MapLibre loaded async to avoid bundling when not needed
      initMapLibreAsync(mapContainer.current, tileUrl).then((c) => {
        if (cancelled) { c(); return; }
        cleanup = c;
      });
    }

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  /** Initialize Leaflet map */
  function initLeaflet(container: HTMLElement, tileUrl: string) {
    const leafletMap = L.map(container, {
      center: [31.5, 34.8],
      zoom: 8,
      zoomControl: false,
      attributionControl: true,
      zoomDelta: 0.5,           // Half-level per scroll tick (smoother zoom)
      zoomSnap: 0.25,           // Allow quarter-level zoom stops
      wheelPxPerZoomLevel: 120, // Require more scroll to change zoom (default 60)
    });

    // Add tile layer
    const tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(leafletMap);

    // Add controls
    L.control.zoom({ position: 'topright' }).addTo(leafletMap);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(leafletMap);

    // Suppress browser context menu over the map
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    const adapter = new LeafletAdapter(leafletMap);
    adapterRef.current = adapter;
    leafletMapRef.current = leafletMap;

    // Store tileLayer for dark mode switching
    (adapter as any)._tileLayer = tileLayer;

    const cleanupBoxZoom = enableCtrlBoxZoom(adapter);

    // Leaflet is ready immediately (no async WebGL init)
    setLayersReady(true);
    setMapAdapter(adapter);
    console.log('[MapView] Leaflet initialized');

    return () => {
      cleanupBoxZoom();
      leafletMap.remove();
      adapterRef.current = null;
      leafletMapRef.current = null;
      setLayersReady(false);
      setMapAdapter(null);
    };
  }

  /** Initialize MapLibre GL JS map (fallback) — async to allow dynamic import */
  async function initMapLibreAsync(container: HTMLElement, tileUrl: string): Promise<() => void> {
    const maplibregl = (await import('maplibre-gl')).default;
    // Load CSS via side-effect import
    await import('maplibre-gl/dist/maplibre-gl.css');

    const mlMap = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [34.8, 31.5],
      zoom: 8,
    });

    mlMap.on('error', (e: any) => {
      console.error('[MapView] MapLibre error:', e.error?.message || e);
    });

    mlMap.addControl(new maplibregl.NavigationControl(), 'top-right');
    mlMap.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const adapter = new MapLibreAdapter(mlMap);
    adapterRef.current = adapter;

    const cleanupBoxZoom = enableCtrlBoxZoom(adapter);

    // Initialize MapLibre data layers (fallback rendering path)
    const initMapLibreLayers = async () => {
      try {
        const { initTrackLayer } = await import('./layers/track-layer');
        const { initSensorLayer } = await import('./layers/sensor-layer');
        const { initCoverageLayer } = await import('./layers/coverage-layer');
        const { initEoRayLayer } = await import('./layers/eo-ray-layer');
        const { initTriangulationLayer } = await import('./layers/triangulation-layer');
        const { initBearingLineLayer } = await import('./layers/bearing-line-layer');
        const { initInvestigationRingLayer } = await import('./layers/investigation-ring-layer');
        const { initAmbiguityMarkerLayer } = await import('./layers/ambiguity-marker-layer');
        const { initSelectionRayLayer } = await import('./layers/selection-ray-layer');

        const m = mlMap;
        try { if (!m.getSource('radar-coverage')) initCoverageLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('triangulation-rays')) initTriangulationLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('eo-rays')) initEoRayLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('sensors')) initSensorLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('investigation-rings')) initInvestigationRingLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('bearing-lines')) initBearingLineLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('ambiguity-markers')) initAmbiguityMarkerLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('selection-rays-source')) initSelectionRayLayer(m); } catch { /* skip */ }
        try { if (!m.getSource('system-tracks')) initTrackLayer(m); } catch { /* skip */ }
        try { m.resize(); } catch { /* skip */ }

        console.log('[MapView] MapLibre layers initialized');
        setLayersReady(true);
        setMapAdapter(adapter);
      } catch (e) {
        console.warn('[MapView] MapLibre layer init failed:', e);
        // Still make the adapter available for DebugOverlay
        setLayersReady(true);
        setMapAdapter(adapter);
      }
    };

    mlMap.on('load', () => initMapLibreLayers());
    // Fallback timeout
    const timer = setTimeout(() => {
      if (!mapAdapter) initMapLibreLayers();
    }, 5000);

    return () => {
      cleanupBoxZoom();
      clearTimeout(timer);
      mlMap.remove();
      adapterRef.current = null;
      setLayersReady(false);
      setMapAdapter(null);
    };
  }

  // ── Switch tiles when dark mode toggles ───────────────────────────────────
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) return;

    const tiles = darkMode
      ? 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (adapter.type === 'leaflet') {
      const tileLayer = (adapter as any)._tileLayer;
      if (tileLayer) {
        tileLayer.setUrl(tiles);
      }
    } else {
      const mlAdapter = adapter as MapLibreAdapter;
      const src = mlAdapter.raw.getSource('osm') as any;
      if (src) src.setTiles([tiles]);
    }
  }, [darkMode]);

  // ── MapLibre-only: update data layers ─────────────────────────────────────
  useEffect(() => {
    if (!adapterRef.current || adapterRef.current.type !== 'maplibre' || !layersReady) return;
    const m = (adapterRef.current as MapLibreAdapter).raw;

    import('./layers/track-layer').then(({ updateTrackLayer, updateTrackTrailLayer }) => {
      const filteredTracks = tracks.filter(t =>
        trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
      );
      updateTrackLayer(m, filteredTracks, selectedTrackId);
      updateTrackTrailLayer(m, trailHistory, filteredTracks);
    });
    import('./layers/triangulation-layer').then(({ updateTriangulationLayer }) => {
      const filteredTracks = tracks.filter(t =>
        trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
      );
      updateTriangulationLayer(m, filteredTracks, sensors, useTaskStore.getState().geometryEstimates);
    });
    import('./layers/investigation-ring-layer').then(({ updateInvestigationRingLayer }) => {
      const filteredTracks = tracks.filter(t =>
        trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
      );
      updateInvestigationRingLayer(m, filteredTracks);
    });
    import('./layers/ambiguity-marker-layer').then(({ updateAmbiguityMarkerLayer }) => {
      const filteredTracks = tracks.filter(t =>
        trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
      );
      updateAmbiguityMarkerLayer(m, useTaskStore.getState().unresolvedGroups, filteredTracks);
    });
  }, [tracks, sensors, trailHistory, layersReady, trackStatusFilter, selectedTrackId]);

  useEffect(() => {
    if (!adapterRef.current || adapterRef.current.type !== 'maplibre' || !layersReady) return;
    const m = (adapterRef.current as MapLibreAdapter).raw;

    import('./layers/sensor-layer').then(({ updateSensorLayer }) => {
      updateSensorLayer(m, sensors, useTaskStore.getState().registrationStates, useUiStore.getState().highlightedSensorIds);
    });
    import('./layers/coverage-layer').then(({ updateCoverageLayer }) => updateCoverageLayer(m, sensors));
    import('./layers/eo-ray-layer').then(({ updateEoRayLayer }) => updateEoRayLayer(m, sensors));
  }, [sensors, layersReady]);

  // ── MapLibre-only: sync layer visibility ──────────────────────────────────
  useEffect(() => {
    if (!adapterRef.current || adapterRef.current.type !== 'maplibre' || !layersReady) return;
    const m = (adapterRef.current as MapLibreAdapter).raw;

    const layerMap: Array<[keyof LayerVisibility, string[]]> = [
      ['tracks', ['system-tracks-layer', 'track-eo-badge', 'track-trails-layer', 'track-selection-pulse-layer', 'investigation-rings-layer', 'investigation-rings-outer']],
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

    for (const [key, layerIds] of layerMap) {
      const vis = layerVisibility[key] ? 'visible' : 'none';
      for (const id of layerIds) {
        try { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis); } catch { /* skip */ }
      }
    }

    if (demoActive && viewMode === 'basic') {
      import('../demo/BasicModeFilter').then(({ applyBasicMode }) => applyBasicMode(m));
    }
  }, [layerVisibility, layersReady, demoActive, viewMode]);

  // ── Track selection: highlight sensors + camera fit ────────────────────────
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !layersReady) return;

    if (!selectedTrackId) {
      clearSelectionHighlights();
      return;
    }

    const track = tracks.find(t => t.systemTrackId === selectedTrackId);
    if (!track) {
      clearSelectionHighlights();
      return;
    }

    const contributingSensorIds: string[] = (track.sources ?? []) as string[];
    const trackEoBearings = eoTracks.filter(
      et => et.associatedSystemTrackId === selectedTrackId && et.bearing
    );

    const allSensorIds = new Set(contributingSensorIds);
    for (const et of trackEoBearings) allSensorIds.add(et.sensorId);

    setHighlightedSensors(Array.from(allSensorIds));

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

    // No auto-zoom — user uses "Center" button in detail panel instead
  }, [selectedTrackId, tracks, sensors, eoTracks, activeCues, layersReady]);

  // ── One-time center on selected object when "Center" button clicked ────────
  const lastCenterSeq = useRef(0);
  useEffect(() => {
    if (centerRequestSeq === lastCenterSeq.current) return;
    lastCenterSeq.current = centerRequestSeq;
    const adapter = adapterRef.current;
    if (!adapter || !layersReady) return;

    // Center on selected track
    if (selectedTrackId) {
      const track = tracks.find(t => t.systemTrackId === selectedTrackId);
      if (track) {
        try {
          adapter.flyTo({ center: [track.state.lon, track.state.lat], zoom: 11, duration: 800 });
        } catch { /* ignore */ }
      }
      return;
    }

    // Center on selected sensor
    if (selectedSensorId) {
      const sensor = sensors.find(s => s.sensorId === selectedSensorId);
      if (sensor) {
        try {
          adapter.flyTo({ center: [sensor.position.lon, sensor.position.lat], zoom: 11, duration: 800 });
        } catch { /* ignore */ }
      }
      return;
    }
  }, [centerRequestSeq, selectedTrackId, selectedSensorId, tracks, sensors, layersReady]);

  // ── Spawn-target click interception ───────────────────────────────────────
  const spawnMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const adapter = adapterRef.current;
    const lMap = leafletMapRef.current;
    if (!adapter || !layersReady) return;

    if (!spawnTargetActive) {
      if (spawnMarkerRef.current && lMap) {
        lMap.removeLayer(spawnMarkerRef.current);
        spawnMarkerRef.current = null;
      }
      adapter.getCanvas().style.cursor = '';
      return;
    }

    adapter.getCanvas().style.cursor = 'crosshair';

    const spawnIcon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#00cc44;border:2px solid #fff;box-shadow:0 0 8px rgba(0,204,68,0.6);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const handler = (e: any) => {
      let lng: number, lat: number;
      if (adapter.type === 'leaflet') {
        lng = e.latlng.lng;
        lat = e.latlng.lat;
      } else {
        lng = e.lngLat.lng;
        lat = e.lngLat.lat;
      }
      setSpawnTargetPosition({ lat, lon: lng });

      // Use a Leaflet marker so it follows zoom/pan natively
      if (spawnMarkerRef.current && lMap) {
        spawnMarkerRef.current.setLatLng([lat, lng]);
      } else if (lMap) {
        spawnMarkerRef.current = L.marker([lat, lng], { icon: spawnIcon, interactive: false }).addTo(lMap);
      }
    };

    adapter.on('click', handler);
    return () => {
      adapter.off('click', handler);
      adapter.getCanvas().style.cursor = '';
    };
  }, [spawnTargetActive, layersReady, setSpawnTargetPosition]);

  useEffect(() => {
    const lMap = leafletMapRef.current;
    if (!spawnTargetPosition && spawnMarkerRef.current && lMap) {
      lMap.removeLayer(spawnMarkerRef.current);
      spawnMarkerRef.current = null;
    }
  }, [spawnTargetPosition]);

  // ── Render ────────────────────────────────────────────────────────────────
  const hideOverlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nodebug');

  const filteredTracksForOverlay = tracks.filter(t =>
    trackStatusFilter[t.status as keyof typeof trackStatusFilter] !== false
  );

  // DeckGlOverlay only works with MapLibre (uses MapboxOverlay which requires MapLibre's WebGL context)
  const showDeck = layerVisibility.show3DOverlay && mapAdapter?.type === 'maplibre';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%',
          filter: darkMode ? 'none' : 'brightness(0.85) saturate(0.7)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />
      <LayerFilterPanel />
      {!hideOverlay && mapAdapter && leafletMapRef.current && (
        <DebugOverlay
          map={leafletMapRef.current}
          tracks={filteredTracksForOverlay}
          sensors={sensors}
          trailHistory={trailHistory}
          layersReady={layersReady}
          layerVisibility={layerVisibility}
          onSelectTrack={selectTrack}
          onSelectSensor={selectSensor}
          onSelectGroundTruth={selectGroundTruth}
          selectedGroundTruthId={selectedGroundTruthId}
          groundTruthTargets={groundTruthTargets}
          showGroundTruth={showGroundTruth}
          coverZones={coverZones}
          operationalZones={operationalZones}
          searchModeStates={searchModeStates}
          fovOverlaps={fovOverlaps}
          bearingAssociations={bearingAssociations}
          multiSensorResolutions={multiSensorResolutions}
          convergedTrackIds={convergedTrackIds}
          ballisticEstimates={layerVisibility.ballisticEstimates ? ballisticEstimates : []}
        />
      )}
      {showDeck && mapAdapter && (
        <DeckGlOverlay
          map={(mapAdapter as MapLibreAdapter).raw}
          tracks={filteredTracksForOverlay}
          trailHistory={trailHistory}
        />
      )}
    </div>
  );
}
