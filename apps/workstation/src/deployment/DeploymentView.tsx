import React, { useEffect, useRef } from 'react';
import { DeploymentPanel } from './DeploymentPanel';
import { DeploymentMetrics } from './DeploymentMetrics';
import { useDeploymentStore } from './deployment-store';

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
 * Render the deployment view map using a simple SVG canvas.
 * Shows scanned area, zones, and placed sensors with coverage arcs.
 * Uses HTML/SVG rendering (same pattern as DebugOverlay) since
 * MapLibre WebGL layers are non-functional in production.
 */
function DeploymentMap() {
  const canvasRef = useRef<SVGSVGElement>(null);
  const scannedArea = useDeploymentStore(s => s.scannedArea);
  const exclusionZones = useDeploymentStore(s => s.exclusionZones);
  const threatCorridors = useDeploymentStore(s => s.threatCorridors);
  const placedSensors = useDeploymentStore(s => s.placedSensors);

  // Compute bounding box from scanned area
  const allLats = scannedArea.map(p => p.lat);
  const allLons = scannedArea.map(p => p.lon);
  const minLat = Math.min(...allLats) - 0.05;
  const maxLat = Math.max(...allLats) + 0.05;
  const minLon = Math.min(...allLons) - 0.05;
  const maxLon = Math.max(...allLons) + 0.05;

  const pad = 20;

  const toSvg = (lat: number, lon: number, width: number, height: number) => {
    const x = pad + ((lon - minLon) / (maxLon - minLon)) * (width - 2 * pad);
    const y = pad + ((maxLat - lat) / (maxLat - minLat)) * (height - 2 * pad);
    return { x, y };
  };

  const polygonToPoints = (poly: Array<{ lat: number; lon: number }>, w: number, h: number) =>
    poly.map(p => {
      const { x, y } = toSvg(p.lat, p.lon, w, h);
      return `${x},${y}`;
    }).join(' ');

  // Convert range in meters to SVG pixels (approximate)
  const rangeToPx = (rangeM: number, w: number, h: number) => {
    const degRange = rangeM / 111320;
    const pxPerDegLon = (w - 2 * pad) / (maxLon - minLon);
    return degRange * pxPerDegLon;
  };

  return (
    <div style={{ flex: 1, position: 'relative', background: '#0a0a15' }}>
      <svg
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {Array.from({ length: 10 }, (_, i) => {
          const x = pad + (i / 9) * (800 - 2 * pad);
          return <line key={`vg-${i}`} x1={x} y1={pad} x2={x} y2={600 - pad} stroke="#1a1a2e" strokeWidth={0.5} />;
        })}
        {Array.from({ length: 8 }, (_, i) => {
          const y = pad + (i / 7) * (600 - 2 * pad);
          return <line key={`hg-${i}`} x1={pad} y1={y} x2={800 - pad} y2={y} stroke="#1a1a2e" strokeWidth={0.5} />;
        })}

        {/* Scanned area polygon */}
        <polygon
          points={polygonToPoints(scannedArea, 800, 600)}
          fill="rgba(74, 158, 255, 0.08)"
          stroke={colors.accent}
          strokeWidth={1.5}
          strokeDasharray="6 3"
        />

        {/* Threat corridors */}
        {threatCorridors.map((corridor, i) => (
          <polygon
            key={`threat-${i}`}
            points={polygonToPoints(corridor, 800, 600)}
            fill="rgba(255, 204, 0, 0.1)"
            stroke={colors.warning}
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        ))}

        {/* Exclusion zones */}
        {exclusionZones.map((zone, i) => (
          <polygon
            key={`excl-${i}`}
            points={polygonToPoints(zone, 800, 600)}
            fill="rgba(255, 51, 51, 0.12)"
            stroke={colors.danger}
            strokeWidth={1}
          />
        ))}

        {/* Placed sensors with coverage arcs */}
        {placedSensors.map((ps, i) => {
          const { x, y } = toSvg(ps.position.lat, ps.position.lon, 800, 600);
          const r = rangeToPx(ps.spec.maxRangeM, 800, 600);
          const sensorColor = ps.spec.type === 'eo' ? colors.eo : colors.radar;

          return (
            <g key={`sensor-${i}`}>
              {/* Coverage circle */}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={sensorColor + '10'}
                stroke={sensorColor + '40'}
                strokeWidth={1}
              />
              {/* Sensor dot */}
              <circle cx={x} cy={y} r={5} fill={sensorColor} stroke="#fff" strokeWidth={1} />
              {/* Label */}
              <text x={x + 8} y={y - 8} fill={sensorColor} fontSize="10" fontFamily="monospace">
                {ps.spec.id}
              </text>
              {/* Score */}
              <text x={x + 8} y={y + 4} fill={colors.textDim} fontSize="8" fontFamily="monospace">
                {(ps.scores.total * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={400} y={600 - 4} fill={colors.textDim} fontSize="10" textAnchor="middle" fontFamily="monospace">
          Longitude
        </text>
        <text x={8} y={300} fill={colors.textDim} fontSize="10" textAnchor="middle" fontFamily="monospace"
          transform="rotate(-90, 8, 300)">
          Latitude
        </text>

        {/* Corner coordinates */}
        <text x={pad} y={600 - pad + 14} fill={colors.textDim} fontSize="8" fontFamily="monospace">
          {minLon.toFixed(2)}
        </text>
        <text x={800 - pad} y={600 - pad + 14} fill={colors.textDim} fontSize="8" fontFamily="monospace" textAnchor="end">
          {maxLon.toFixed(2)}
        </text>
        <text x={pad - 2} y={pad} fill={colors.textDim} fontSize="8" fontFamily="monospace" textAnchor="end">
          {maxLat.toFixed(2)}
        </text>
        <text x={pad - 2} y={600 - pad} fill={colors.textDim} fontSize="8" fontFamily="monospace" textAnchor="end">
          {minLat.toFixed(2)}
        </text>
      </svg>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: '#141425ee',
        border: `1px solid ${colors.border}`,
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '10px',
        color: colors.textDim,
      }}>
        <div style={{ marginBottom: '4px', fontWeight: 600, color: colors.text }}>Legend</div>
        <div><span style={{ color: colors.accent }}>---</span> Scanned Area</div>
        <div><span style={{ color: colors.warning }}>---</span> Threat Corridor</div>
        <div><span style={{ color: colors.danger }}>---</span> Exclusion Zone</div>
        <div><span style={{ color: colors.eo }}>*</span> EO Sensor</div>
        <div><span style={{ color: colors.radar }}>*</span> Radar Sensor</div>
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
