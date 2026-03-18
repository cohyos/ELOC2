import React from 'react';
import { useDeploymentStore } from './deployment-store';

const colors = {
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
  success: '#00cc44',
  warning: '#ffcc00',
  danger: '#ff3333',
  bg: '#1a1a2e',
  border: '#2a2a3e',
};

export function DeploymentMetrics() {
  const metrics = useDeploymentStore(s => s.metrics);
  const placedSensors = useDeploymentStore(s => s.placedSensors);

  if (!metrics) {
    return (
      <div style={{
        background: colors.bg,
        borderTop: `1px solid ${colors.border}`,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '12px',
        color: colors.textDim,
      }}>
        Run optimization to see deployment metrics
      </div>
    );
  }

  const coverageColor = metrics.coveragePercent >= 80 ? colors.success
    : metrics.coveragePercent >= 50 ? colors.warning : colors.danger;
  const triColor = metrics.triangulationCoveragePercent >= 60 ? colors.success
    : metrics.triangulationCoveragePercent >= 30 ? colors.warning : colors.danger;
  const geoColor = metrics.geometryQuality >= 0.7 ? colors.success
    : metrics.geometryQuality >= 0.4 ? colors.warning : colors.danger;

  const metricBox: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  };

  const metricLabel: React.CSSProperties = {
    fontSize: '9px',
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const metricValue: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: 'monospace',
  };

  return (
    <div style={{
      background: colors.bg,
      borderTop: `1px solid ${colors.border}`,
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
      fontSize: '12px',
    }}>
      <div style={metricBox}>
        <span style={metricLabel}>Sensors</span>
        <span style={{ ...metricValue, color: colors.accent }}>{placedSensors.length}</span>
      </div>
      <div style={metricBox}>
        <span style={metricLabel}>Coverage</span>
        <span style={{ ...metricValue, color: coverageColor }}>{metrics.coveragePercent.toFixed(1)}%</span>
      </div>
      <div style={metricBox}>
        <span style={metricLabel}>Triangulation</span>
        <span style={{ ...metricValue, color: triColor }}>{metrics.triangulationCoveragePercent.toFixed(1)}%</span>
      </div>
      <div style={metricBox}>
        <span style={metricLabel}>Gap</span>
        <span style={{ ...metricValue, color: metrics.worstCaseGapM > 20000 ? colors.danger : colors.text }}>
          {metrics.worstCaseGapM < Infinity ? `${(metrics.worstCaseGapM / 1000).toFixed(1)}km` : 'N/A'}
        </span>
      </div>
      <div style={metricBox}>
        <span style={metricLabel}>Geometry</span>
        <span style={{ ...metricValue, color: geoColor }}>{(metrics.geometryQuality * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
