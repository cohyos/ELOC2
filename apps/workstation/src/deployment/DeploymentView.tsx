import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DeploymentPanel } from './DeploymentPanel';
import { DeploymentMetrics } from './DeploymentMetrics';
import { useDeploymentStore } from './deployment-store';
import type { GeoPolygon, PlacedSensor } from './deployment-store';

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

/**
 * Convert a GeoPolygon to an SVG path string using map.project().
 */
function polygonToSvgPath(
  polygon: GeoPolygon,
  map: maplibregl.Map,
): string {
  if (polygon.length < 3) return '';
  return polygon.map((p, i) => {
    const px = map.project([p.lon, p.lat]);
    return `${i === 0 ? 'M' : 'L'}${px.x},${px.y}`;
  }).join(' ') + ' Z';
}

/**
 * Render the deployment map using MapLibre (raster tiles only) + HTML/SVG overlays.
 * Same architecture as the main workstation: MapLibre for tiles, all data drawn via overlays.
 */
function DeploymentMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const scannedArea = useDeploymentStore(s => s.scannedArea);
  const exclusionZones = useDeploymentStore(s => s.exclusionZones);
  const threatCorridors = useDeploymentStore(s => s.threatCorridors);
  const placedSensors = useDeploymentStore(s => s.placedSensors);

  // Draw overlays: SVG polygons + HTML markers, projected via map.project()
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

    // Build SVG content
    let svgContent = '';

    // Scanned area
    if (scannedArea.length >= 3) {
      const path = polygonToSvgPath(scannedArea, map);
      svgContent += `<path d="${path}" fill="rgba(74,158,255,0.08)" stroke="${colors.accent}" stroke-width="2" stroke-dasharray="8 4" />`;
    }

    // Threat corridors
    for (const corridor of threatCorridors) {
      if (corridor.length < 3) continue;
      const path = polygonToSvgPath(corridor, map);
      svgContent += `<path d="${path}" fill="rgba(255,204,0,0.12)" stroke="${colors.warning}" stroke-width="1.5" stroke-dasharray="6 3" />`;
    }

    // Exclusion zones
    for (const zone of exclusionZones) {
      if (zone.length < 3) continue;
      const path = polygonToSvgPath(zone, map);
      svgContent += `<path d="${path}" fill="rgba(255,51,51,0.15)" stroke="${colors.danger}" stroke-width="1.5" />`;
    }

    // Sensor coverage circles (approximate as SVG ellipses)
    for (const ps of placedSensors) {
      const center = map.project([ps.position.lon, ps.position.lat]);
      const sensorColor = ps.spec.type === 'eo' ? colors.eo : colors.radar;
      // Approximate radius: project a point maxRangeM north
      const degOffset = ps.spec.maxRangeM / 111320;
      const edge = map.project([ps.position.lon, ps.position.lat + degOffset]);
      const rPx = Math.abs(center.y - edge.y);
      svgContent += `<circle cx="${center.x}" cy="${center.y}" r="${rPx}" fill="${sensorColor}15" stroke="${sensorColor}50" stroke-width="1.5" />`;
    }

    svg.innerHTML = svgContent;

    // Build HTML markers for placed sensors
    let html = '';
    for (const ps of placedSensors) {
      const px = map.project([ps.position.lon, ps.position.lat]);
      const sensorColor = ps.spec.type === 'eo' ? colors.eo : colors.radar;
      html += `<div style="position:absolute;left:${px.x}px;top:${px.y}px;transform:translate(-50%,-50%);pointer-events:none;">
        <div style="width:12px;height:12px;border-radius:50%;background:${sensorColor};border:2px solid #fff;box-shadow:0 0 6px ${sensorColor}88;"></div>
      </div>`;
      html += `<div style="position:absolute;left:${px.x + 10}px;top:${px.y - 16}px;pointer-events:none;font:bold 11px monospace;color:${sensorColor};text-shadow:0 0 3px #000,0 0 6px #000;">
        ${ps.spec.id}
      </div>`;
      html += `<div style="position:absolute;left:${px.x + 10}px;top:${px.y - 2}px;pointer-events:none;font:10px monospace;color:#aaa;text-shadow:0 0 3px #000;">
        ${(ps.scores.total * 100).toFixed(0)}%
      </div>`;
    }
    markerContainer.innerHTML = html;
  }, [scannedArea, exclusionZones, threatCorridors, placedSensors]);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Compute center from scanned area
    const cLat = scannedArea.reduce((s, p) => s + p.lat, 0) / (scannedArea.length || 1);
    const cLon = scannedArea.reduce((s, p) => s + p.lon, 0) / (scannedArea.length || 1);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
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
      center: [cLon, cLat],
      zoom: 8.5,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('error', (e) => {
      console.error('[DeploymentMap] MapLibre error:', e.error?.message || e);
    });

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
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw overlays when data changes
  useEffect(() => {
    if (mapRef.current) drawOverlays();
  }, [drawOverlays]);

  return (
    <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
      {/* MapLibre container (raster tiles only) */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* SVG overlay for polygons and coverage circles (z-index 14) */}
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

      {/* HTML overlay for sensor markers (z-index 15) */}
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

      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '50px',
        background: '#141425ee',
        border: `1px solid ${colors.border}`,
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '10px',
        color: colors.textDim,
        zIndex: 16,
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
      {/* Header */}
      <header style={{
        gridArea: 'header',
        background: colors.headerBg,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '12px',
        fontSize: '13px',
        borderBottom: `1px solid ${colors.border}`,
        zIndex: 10,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>ELOC2</span>
        <span style={{ color: colors.accent, fontSize: '12px', fontWeight: 600 }}>Deployment Planner</span>
        <span style={{ color: colors.textDim, fontSize: '11px' }}>REQ-15: EO Sensor Deployment Optimization</span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={onBack}
            style={{
              background: '#333',
              color: '#aaa',
              border: 'none',
              padding: '3px 12px',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Back to Workstation
          </button>
        </div>
      </header>

      {/* Left Panel */}
      <div style={{
        gridArea: 'panel',
        background: colors.panelBg,
        borderRight: `1px solid ${colors.border}`,
        overflowY: 'auto',
      }}>
        <DeploymentPanel />
      </div>

      {/* Map */}
      <div style={{ gridArea: 'map', position: 'relative', overflow: 'hidden' }}>
        <DeploymentMap />
      </div>

      {/* Metrics Bar */}
      <div style={{ gridArea: 'metrics' }}>
        <DeploymentMetrics />
      </div>
    </div>
  );
}
