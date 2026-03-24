import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DeploymentPanel } from './DeploymentPanel';
import { DeploymentMetrics } from './DeploymentMetrics';
import { useDeploymentStore } from './deployment-store';
import type { GeoPolygon } from './deployment-store';
import { useEditorStore } from '../stores/editor-store';
import { enableCtrlBoxZoom } from '../map/ctrl-box-zoom';
import { LeafletAdapter } from '../map/map-adapter';

const colors = {
  bg: '#0d0d1a',
  headerBg: '#1a1a2e',
  panelBg: '#141425',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
  eo: '#ff8800',
  radar: '#4488ff',
  danger: '#ff3333',
  success: '#00cc44',
  warning: '#ffcc00',
};

// ---------------------------------------------------------------------------
// Helper: convert GeoPolygon to Leaflet LatLng array
// ---------------------------------------------------------------------------

function geoToLatLngs(polygon: GeoPolygon): [number, number][] {
  return polygon.map(p => [p.lat, p.lon] as [number, number]);
}

// ---------------------------------------------------------------------------
// DeploymentMap — Native Leaflet layers (matches EditorMap pattern)
// ---------------------------------------------------------------------------

export function DeploymentMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Leaflet layer groups
  const zoneGroupRef = useRef<L.LayerGroup | null>(null);
  const coverageGroupRef = useRef<L.LayerGroup | null>(null);
  const sensorGroupRef = useRef<L.LayerGroup | null>(null);
  const drawPreviewGroupRef = useRef<L.LayerGroup | null>(null);

  const dragState = useRef<{ index: number } | null>(null);

  const scannedArea = useDeploymentStore(s => s.scannedArea);
  const exclusionZones = useDeploymentStore(s => s.exclusionZones);
  const threatCorridors = useDeploymentStore(s => s.threatCorridors);
  const placedSensors = useDeploymentStore(s => s.placedSensors);
  const editorZones = useEditorStore(s => s.operationalZones);
  const drawMode = useDeploymentStore(s => s.drawMode);
  const drawVertices = useDeploymentStore(s => s.drawVertices);

  // Initialize Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const cLat = scannedArea.reduce((s, p) => s + p.lat, 0) / (scannedArea.length || 1);
    const cLon = scannedArea.reduce((s, p) => s + p.lon, 0) / (scannedArea.length || 1);

    const map = L.map(mapContainerRef.current, {
      center: [cLat, cLon],
      zoom: 8.5,
      zoomControl: false,
      attributionControl: true,
      zoomDelta: 1,
      zoomSnap: 0,
      wheelPxPerZoomLevel: 120,
      wheelDebounceTime: 80,
    });

    L.tileLayer('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    // Suppress browser context menu over the map
    const container = mapContainerRef.current;
    const suppressCtx = (e: Event) => e.preventDefault();
    container.addEventListener('contextmenu', suppressCtx);

    // Ctrl+drag box zoom
    const adapter = new LeafletAdapter(map);
    const cleanupBoxZoom = enableCtrlBoxZoom(adapter);

    // Create layer groups (ordered bottom to top)
    const zoneGroup = L.layerGroup().addTo(map);
    const coverageGroup = L.layerGroup().addTo(map);
    const drawPreviewGroup = L.layerGroup().addTo(map);
    const sensorGroup = L.layerGroup().addTo(map);

    zoneGroupRef.current = zoneGroup;
    coverageGroupRef.current = coverageGroup;
    drawPreviewGroupRef.current = drawPreviewGroup;
    sensorGroupRef.current = sensorGroup;

    // Click handler for placing sensors and drawing polygons
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (dragState.current) return;
      const state = useDeploymentStore.getState();
      const mode = state.drawMode;

      if (mode === 'place-sensor') {
        state.placeSensorAtPosition({ lat: e.latlng.lat, lon: e.latlng.lng });
        return;
      }

      if (mode === 'draw-area' || mode === 'draw-exclusion' || mode === 'draw-threat') {
        state.addDrawVertex({ lat: e.latlng.lat, lon: e.latlng.lng });
      }
    });

    map.whenReady(() => map.invalidateSize());
    mapRef.current = map;

    return () => {
      // Clean up any in-progress drag handlers
      if (dragState.current) {
        dragState.current = null;
        map.dragging.enable();
      }
      container.removeEventListener('contextmenu', suppressCtx);
      cleanupBoxZoom();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update zone polygons (scanned area, exclusion zones, threat corridors)
  useEffect(() => {
    if (!zoneGroupRef.current) return;
    zoneGroupRef.current.clearLayers();

    // Scanned area
    if (scannedArea.length >= 3) {
      L.polygon(geoToLatLngs(scannedArea), {
        fillColor: colors.accent,
        fillOpacity: 0.08,
        color: colors.accent,
        weight: 2,
        dashArray: '8 4',
        interactive: false,
      }).addTo(zoneGroupRef.current);
    }

    // Threat corridors
    for (const corridor of threatCorridors) {
      if (corridor.length < 3) continue;
      L.polygon(geoToLatLngs(corridor), {
        fillColor: colors.warning,
        fillOpacity: 0.12,
        color: colors.warning,
        weight: 1.5,
        dashArray: '6 3',
        interactive: false,
      }).addTo(zoneGroupRef.current);
    }

    // Exclusion zones
    for (const zone of exclusionZones) {
      if (zone.length < 3) continue;
      L.polygon(geoToLatLngs(zone), {
        fillColor: colors.danger,
        fillOpacity: 0.15,
        color: colors.danger,
        weight: 1.5,
        interactive: false,
      }).addTo(zoneGroupRef.current);
    }

    // Editor operational zones (unified rendering)
    const editorZoneStyles: Record<string, { fill: string; stroke: string; dash: string }> = {
      threat_corridor: { fill: 'rgba(255,50,50,0.12)', stroke: 'rgba(255,50,50,0.7)', dash: '8,4' },
      exclusion: { fill: 'rgba(255,0,0,0.08)', stroke: 'rgba(255,0,0,0.6)', dash: '12,4,4,4' },
      engagement: { fill: 'rgba(0,200,100,0.08)', stroke: 'rgba(0,200,100,0.5)', dash: '6,3' },
      safe_passage: { fill: 'rgba(0,150,255,0.08)', stroke: 'rgba(0,150,255,0.5)', dash: '4,4' },
    };
    for (const zone of editorZones) {
      if (!zone.polygon || zone.polygon.length < 3) continue;
      const latlngs = zone.polygon
        .filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lon))
        .map(v => [v.lat, v.lon] as [number, number]);
      if (latlngs.length < 3) continue;
      const style = editorZoneStyles[zone.zoneType] ?? editorZoneStyles.engagement;
      const fillColor = zone.color ? `${zone.color}20` : style.fill;
      const strokeColor = zone.color ?? style.stroke;
      L.polygon(latlngs, {
        fillColor, fillOpacity: 1, color: strokeColor,
        weight: 2, dashArray: style.dash, interactive: false,
      }).addTo(zoneGroupRef.current);
      // Label
      if (zone.name) {
        const centLat = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
        const centLon = latlngs.reduce((s, p) => s + p[1], 0) / latlngs.length;
        const icon = L.divIcon({
          className: '',
          html: `<span style="font:bold 10px monospace;color:${strokeColor};white-space:nowrap;text-shadow:0 0 3px #000,0 0 6px #000;">${zone.name}</span>`,
          iconSize: [100, 14],
          iconAnchor: [50, 7],
        });
        L.marker([centLat, centLon], { icon, interactive: false }).addTo(zoneGroupRef.current);
      }
    }
  }, [scannedArea, exclusionZones, threatCorridors, editorZones]);

  // Update sensor coverage circles + markers
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !coverageGroupRef.current || !sensorGroupRef.current) return;
    coverageGroupRef.current.clearLayers();
    sensorGroupRef.current.clearLayers();

    for (let idx = 0; idx < placedSensors.length; idx++) {
      const ps = placedSensors[idx];
      const sensorColor = ps.spec.type === 'eo' ? colors.eo : colors.radar;
      const pos: [number, number] = [ps.position.lat, ps.position.lon];

      // Coverage circle
      L.circle(pos, {
        radius: ps.spec.maxRangeM,
        fillColor: sensorColor,
        fillOpacity: 0.06,
        color: sensorColor,
        weight: 1.5,
        opacity: 0.3,
        interactive: false,
      }).addTo(coverageGroupRef.current);

      // Sensor marker (draggable)
      const marker = L.circleMarker(pos, {
        radius: 6,
        fillColor: sensorColor,
        fillOpacity: 1,
        color: '#fff',
        weight: 2,
        interactive: true,
      });

      // Tooltip with sensor ID + score
      marker.bindTooltip(
        `${ps.spec.id} — ${(ps.scores.total * 100).toFixed(0)}%`,
        { permanent: true, direction: 'right', offset: [8, -4], className: 'deploy-sensor-tooltip' },
      );

      // Drag sensor
      const sensorIdx = idx;
      marker.on('mousedown', (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        dragState.current = { index: sensorIdx };
        m.dragging.disable();
        m.getContainer().style.cursor = 'grabbing';

        const onMove = (moveEvt: L.LeafletMouseEvent) => {
          if (!dragState.current) return;
          useDeploymentStore.getState().updatePlacedSensorPosition(dragState.current.index, {
            lat: moveEvt.latlng.lat, lon: moveEvt.latlng.lng,
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

      marker.addTo(sensorGroupRef.current);
    }
  }, [placedSensors]);

  // Draw preview (in-progress polygon vertices)
  useEffect(() => {
    if (!drawPreviewGroupRef.current) return;
    drawPreviewGroupRef.current.clearLayers();
    if (drawVertices.length === 0) return;

    // Vertex dots
    for (const v of drawVertices) {
      L.circleMarker([v.lat, v.lon], {
        radius: 5,
        fillColor: '#ffcc00',
        fillOpacity: 1,
        color: '#fff',
        weight: 2,
        interactive: false,
      }).addTo(drawPreviewGroupRef.current);
    }

    // Connecting lines
    if (drawVertices.length >= 2) {
      const latlngs = drawVertices.map(v => [v.lat, v.lon] as [number, number]);
      if (drawVertices.length >= 3) {
        latlngs.push([drawVertices[0].lat, drawVertices[0].lon]);
      }
      L.polyline(latlngs, {
        color: '#ffcc00',
        weight: 2,
        dashArray: '8 4',
        interactive: false,
      }).addTo(drawPreviewGroupRef.current);
    }
  }, [drawVertices]);

  // Update cursor for drawing modes
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const container = m.getContainer();
    container.style.cursor = drawMode !== 'select' ? 'crosshair' : '';
    container.style.userSelect = 'none';
  }, [drawMode]);

  // Draw mode label
  const modeLabels: Record<string, string> = {
    'draw-area': 'Click to define scanned area',
    'draw-exclusion': 'Click to define exclusion zone',
    'draw-threat': 'Click to define threat corridor',
    'place-sensor': 'Click map to place sensor',
  };
  const modeLabel = drawMode !== 'select' ? modeLabels[drawMode] : null;

  return (
    <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', userSelect: 'none' }} />

      {/* Tooltip styles */}
      <style>{`
        .deploy-sensor-tooltip {
          background: #1a1a2eee !important;
          color: #fff !important;
          border: 1px solid #4a9eff44 !important;
          font: bold 11px monospace !important;
          padding: 2px 6px !important;
          box-shadow: 0 0 6px #0008 !important;
        }
        .deploy-sensor-tooltip::before { display: none !important; }
      `}</style>

      {/* Mode indicator */}
      {modeLabel && (
        <div style={{
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a2ecc', color: '#ffcc00', padding: '6px 16px', borderRadius: '4px',
          fontSize: '12px', fontWeight: 600, border: '1px solid #ffcc0044', zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto',
        }}>
          {modeLabel}
          {drawMode !== 'place-sensor' && drawVertices.length >= 3 && (
            <button
              onClick={() => useDeploymentStore.getState().finishDraw()}
              style={{ background: '#00cc44', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
            >
              Finish ({drawVertices.length} pts)
            </button>
          )}
          <button
            onClick={() => {
              if (drawMode === 'place-sensor') {
                useDeploymentStore.getState().setDrawMode('select');
              } else {
                useDeploymentStore.getState().cancelDraw();
              }
            }}
            style={{ background: '#ff333344', color: '#ff6666', border: 'none', borderRadius: '3px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute', top: '10px', right: '50px', background: '#141425ee',
        border: `1px solid ${colors.border}`, borderRadius: '4px', padding: '8px 12px',
        fontSize: '10px', color: colors.textDim, zIndex: 16,
      }}>
        <div style={{ marginBottom: '4px', fontWeight: 600, color: colors.text }}>Legend</div>
        <div><span style={{ color: colors.accent }}>---</span> Scanned Area</div>
        <div><span style={{ color: colors.warning }}>---</span> Threat Corridor</div>
        <div><span style={{ color: colors.danger }}>---</span> Exclusion Zone</div>
        <div><span style={{ color: colors.eo }}>&#9679;</span> EO Sensor</div>
        <div><span style={{ color: colors.radar }}>&#9679;</span> Radar Sensor</div>
      </div>
    </div>
  );
}

interface DeploymentViewProps {
  onBack: () => void;
}

export function DeploymentView({ onBack }: DeploymentViewProps) {
  return (
    <div style={{
      display: 'grid',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: colors.bg,
      color: colors.text,
      overflow: 'hidden',
      gridTemplateRows: '40px 1fr auto',
      gridTemplateColumns: '320px 1fr',
      gridTemplateAreas: '"header header" "panel map" "panel metrics"',
    }}>
      <header style={{
        gridArea: 'header', background: colors.headerBg, display: 'flex',
        alignItems: 'center', padding: '0 16px', gap: '12px', fontSize: '13px',
        borderBottom: `1px solid ${colors.border}`, zIndex: 10,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>ELOC2</span>
        <span style={{ color: colors.accent, fontSize: '12px', fontWeight: 600 }}>Deployment Planner</span>
        <span style={{ color: colors.textDim, fontSize: '11px' }}>REQ-15: EO Sensor Deployment Optimization</span>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={onBack} style={{
            background: '#333', color: '#aaa', border: 'none', padding: '3px 12px',
            borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
          }}>Back to Workstation</button>
        </div>
      </header>

      <div style={{ gridArea: 'panel', background: colors.panelBg, borderRight: `1px solid ${colors.border}`, overflowY: 'auto' }}>
        <DeploymentPanel />
      </div>

      <div style={{ gridArea: 'map', position: 'relative', overflow: 'hidden' }}>
        <DeploymentMap />
      </div>

      <div style={{ gridArea: 'metrics' }}>
        <DeploymentMetrics />
      </div>
    </div>
  );
}
