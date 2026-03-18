import React from 'react';
import { useQualityStore } from '../stores/quality-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pctColor(value: number): string {
  if (value >= 0.8) return '#00cc44';
  if (value >= 0.5) return '#ffcc00';
  return '#ff3333';
}

/** Color for 0-100 percentage values (used by allocation quality) */
function pctColor100(value: number): string {
  if (value >= 80) return '#00cc44';
  if (value >= 50) return '#ffcc00';
  return '#ff3333';
}

function formatPct(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

function formatMeters(value: number): string {
  if (value >= 1000) return (value / 1000).toFixed(2) + ' km';
  return value.toFixed(0) + ' m';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  padding: '12px',
  color: '#e0e0e0',
  fontSize: '13px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '6px',
  borderBottom: '1px solid #333',
  paddingBottom: '3px',
};

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
};

const monoVal: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '12px',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '12px',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QualityMetricsPanel() {
  const metrics = useQualityStore(s => s.metrics);
  const allocation = useQualityStore(s => s.eoAllocationQuality);

  if (!metrics) {
    return (
      <div style={panelStyle}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>
          Quality Assessment
        </h3>
        <div style={{ color: '#888', fontSize: '12px' }}>
          No quality metrics available. Start a scenario to begin assessment.
        </div>
      </div>
    );
  }

  const sensorIds = Object.keys(metrics.sensorUtilization);
  const detectionTargets = Object.entries(metrics.timeToFirstDetection);
  const geoTargets = Object.entries(metrics.timeToConfirmed3D);

  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>
        Quality Assessment
      </h3>

      {/* Track Association */}
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Track Association</div>
        <div style={row}>
          <span style={labelStyle}>Track-to-Truth</span>
          <span style={{ ...monoVal, color: pctColor(metrics.trackToTruthAssociation) }}>
            {formatPct(metrics.trackToTruthAssociation)}
          </span>
        </div>
        <div style={row}>
          <span style={labelStyle}>Coverage</span>
          <span style={{ ...monoVal, color: pctColor(metrics.coveragePercent) }}>
            {formatPct(metrics.coveragePercent)}
          </span>
        </div>
        <div style={row}>
          <span style={labelStyle}>False Track Rate</span>
          <span style={{ ...monoVal, color: pctColor(1 - metrics.falseTrackRate) }}>
            {formatPct(metrics.falseTrackRate)}
          </span>
        </div>
      </div>

      {/* Position Accuracy */}
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Position Accuracy</div>
        <div style={row}>
          <span style={labelStyle}>Avg Error</span>
          <span style={monoVal}>{formatMeters(metrics.positionErrorAvg)}</span>
        </div>
        <div style={row}>
          <span style={labelStyle}>Max Error</span>
          <span style={monoVal}>{formatMeters(metrics.positionErrorMax)}</span>
        </div>
      </div>

      {/* Classification */}
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Classification</div>
        <div style={row}>
          <span style={labelStyle}>Accuracy</span>
          <span style={{ ...monoVal, color: pctColor(metrics.classificationAccuracy) }}>
            {formatPct(metrics.classificationAccuracy)}
          </span>
        </div>
      </div>

      {/* Sensor Utilization */}
      {sensorIds.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionTitle}>Sensor Utilization</div>
          {sensorIds.map(sensorId => {
            const util = metrics.sensorUtilization[sensorId];
            const barWidth = Math.max(0, Math.min(100, util * 100));
            const shortId = sensorId.length > 12 ? sensorId.slice(0, 12) : sensorId;
            return (
              <div key={sensorId} style={{ marginBottom: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '1px' }}>
                  <span style={{ color: '#aaa' }}>{shortId}</span>
                  <span style={{ ...monoVal, fontSize: '11px' }}>{formatPct(util)}</span>
                </div>
                <div style={{ background: '#222', borderRadius: '2px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    background: pctColor(util),
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Time to First Detection */}
      {detectionTargets.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionTitle}>Time to First Detection</div>
          {detectionTargets.map(([targetId, timeSec]) => {
            const shortId = targetId.length > 16 ? targetId.slice(0, 16) : targetId;
            return (
              <div key={targetId} style={row}>
                <span style={labelStyle}>{shortId}</span>
                <span style={monoVal}>{timeSec.toFixed(0)}s</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Time to Confirmed 3D */}
      {geoTargets.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionTitle}>Time to Confirmed 3D</div>
          {geoTargets.map(([targetId, timeSec]) => {
            const shortId = targetId.length > 16 ? targetId.slice(0, 16) : targetId;
            return (
              <div key={targetId} style={row}>
                <span style={labelStyle}>{shortId}</span>
                <span style={monoVal}>{timeSec.toFixed(0)}s</span>
              </div>
            );
          })}
        </div>
      )}

      {/* EO Allocation Quality (REQ-10) */}
      {allocation && (
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionTitle}>EO Allocation Quality</div>
          {([
            ['Coverage Efficiency', allocation.coverageEfficiency, '%'],
            ['Geometry Optimality', allocation.geometryOptimality, '\u00B0'],
            ['Dwell Efficiency', allocation.dwellEfficiency, '%'],
            ['Revisit Timeliness', allocation.revisitTimeliness, '%'],
            ['Triangulation Success', allocation.triangulationSuccessRate, '%'],
            ['Sensor Utilization', allocation.sensorUtilization, '%'],
            ['Priority Alignment', allocation.priorityAlignment, '%'],
          ] as Array<[string, number, string]>).map(([label, value, unit]) => {
            const isAngle = unit === '\u00B0';
            const barValue = isAngle ? Math.min(100, (value / 90) * 100) : Math.min(100, value);
            const color = isAngle ? pctColor100((value / 90) * 100) : pctColor100(value);
            return (
              <div key={label} style={{ marginBottom: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '1px' }}>
                  <span style={{ color: '#aaa' }}>{label}</span>
                  <span style={{ ...monoVal, fontSize: '11px', color }}>{value.toFixed(1)}{unit}</span>
                </div>
                <div style={{ background: '#222', borderRadius: '2px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${barValue}%`,
                    height: '100%',
                    background: color,
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
