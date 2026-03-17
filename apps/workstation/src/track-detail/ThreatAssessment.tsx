import React, { useState } from 'react';

interface ScoreBreakdown {
  threat: number;
  uncertainty: number;
  geometry: number;
  intent: number;
  slewCost: number;
  occupancyCost: number;
}

interface KinematicProfile {
  speedMs: number;
  speedTrend: 'increasing' | 'decreasing' | 'steady';
  altitudeM: number;
  altitudeTrend: 'climbing' | 'descending' | 'level';
  altitudeRateMs: number;
  headingRateDegPerSec: number;
}

interface ClosureRate {
  valueMs: number;
  approaching: boolean;
  sensorId: string | null;
}

export interface ThreatAssessmentData {
  threatScore: number;
  scoreBreakdown: ScoreBreakdown | null;
  kinematicProfile: KinematicProfile | null;
  closureRate: ClosureRate | null;
  taskingPriority: 'active' | 'proposed' | 'none';
}

function threatColor(score: number): string {
  if (score >= 7) return '#ff3333';
  if (score >= 4) return '#ffcc00';
  return '#00cc44';
}

function trendArrow(trend: string): string {
  switch (trend) {
    case 'increasing':
    case 'climbing':
      return '\u2191'; // up arrow
    case 'decreasing':
    case 'descending':
      return '\u2193'; // down arrow
    default:
      return '\u2192'; // right arrow (steady)
  }
}

function trendColor(trend: string): string {
  switch (trend) {
    case 'increasing':
    case 'climbing':
      return '#ff3333';
    case 'decreasing':
    case 'descending':
      return '#00cc44';
    default:
      return '#888';
  }
}

const styles = {
  section: {
    marginBottom: '12px',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    borderBottom: '1px solid #333',
    paddingBottom: '3px',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  chevron: {
    fontSize: '10px',
    color: '#666',
    transition: 'transform 0.15s',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '2px 0',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '11px',
  } as React.CSSProperties,
  value: {
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '11px',
    color: '#e0e0e0',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
  barContainer: {
    width: '100%',
    height: '6px',
    background: '#1a1a2e',
    borderRadius: '3px',
    overflow: 'hidden' as const,
    marginTop: '2px',
    marginBottom: '4px',
  } as React.CSSProperties,
  barFill: (width: number, color: string) => ({
    height: '6px',
    width: `${Math.max(0, Math.min(100, width))}%`,
    background: color,
    borderRadius: '3px',
    transition: 'width 0.3s',
  } as React.CSSProperties),
  smallBarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 0',
  } as React.CSSProperties,
  smallBarLabel: {
    color: '#666',
    fontSize: '10px',
    width: '65px',
    flexShrink: 0,
  } as React.CSSProperties,
  smallBar: {
    flex: 1,
    height: '4px',
    background: '#1a1a2e',
    borderRadius: '2px',
    overflow: 'hidden' as const,
  } as React.CSSProperties,
  smallBarFill: (width: number, color: string) => ({
    height: '4px',
    width: `${Math.max(0, Math.min(100, width))}%`,
    background: color,
    borderRadius: '2px',
  } as React.CSSProperties),
  smallBarValue: {
    color: '#aaa',
    fontSize: '10px',
    width: '30px',
    textAlign: 'right' as const,
    flexShrink: 0,
  } as React.CSSProperties,
  subLabel: {
    color: '#666',
    fontSize: '10px',
    marginBottom: '4px',
    marginTop: '6px',
  } as React.CSSProperties,
};

function ScoreBar({ label, value, maxVal, color }: { label: string; value: number; maxVal: number; color: string }) {
  const pct = (Math.abs(value) / maxVal) * 100;
  return (
    <div style={styles.smallBarRow}>
      <span style={styles.smallBarLabel}>{label}</span>
      <div style={styles.smallBar}>
        <div style={styles.smallBarFill(pct, color)} />
      </div>
      <span style={styles.smallBarValue}>{value.toFixed(1)}</span>
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  active: '#4488ff',
  proposed: '#ffcc00',
  none: '#666',
};

export function ThreatAssessment({ threatAssessment }: { threatAssessment: ThreatAssessmentData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader} onClick={() => setExpanded(!expanded)}>
        <span>Threat Assessment</span>
        <span style={{ ...styles.chevron, transform: expanded ? 'rotate(90deg)' : 'none' }}>&#9654;</span>
      </div>

      {expanded && (
        <>
          {/* Threat Score Bar */}
          <div style={styles.row}>
            <span style={styles.label}>Threat Score</span>
            <span style={{ ...styles.value, color: threatColor(threatAssessment.threatScore) }}>
              {threatAssessment.threatScore.toFixed(1)} / 10
            </span>
          </div>
          <div style={styles.barContainer}>
            <div style={styles.barFill(
              threatAssessment.threatScore * 10,
              threatColor(threatAssessment.threatScore),
            )} />
          </div>

          {/* Score Breakdown */}
          {threatAssessment.scoreBreakdown && (
            <div>
              <div style={styles.subLabel}>SCORE BREAKDOWN</div>
              <ScoreBar label="Threat" value={threatAssessment.scoreBreakdown.threat} maxVal={10} color="#ff3333" />
              <ScoreBar label="Uncertainty" value={threatAssessment.scoreBreakdown.uncertainty} maxVal={10} color="#ffcc00" />
              <ScoreBar label="Geometry" value={threatAssessment.scoreBreakdown.geometry} maxVal={10} color="#4488ff" />
              <ScoreBar label="Intent" value={threatAssessment.scoreBreakdown.intent} maxVal={10} color="#aa44ff" />
              <ScoreBar label="-Slew" value={-Math.abs(threatAssessment.scoreBreakdown.slewCost)} maxVal={10} color="#ff8800" />
              <ScoreBar label="-Occupancy" value={-Math.abs(threatAssessment.scoreBreakdown.occupancyCost)} maxVal={10} color="#ff8800" />
            </div>
          )}

          {/* Kinematic Profile */}
          {threatAssessment.kinematicProfile && (
            <div>
              <div style={styles.subLabel}>KINEMATIC PROFILE</div>
              <div style={styles.row}>
                <span style={styles.label}>Speed</span>
                <span style={styles.value}>
                  {threatAssessment.kinematicProfile.speedMs.toFixed(1)} m/s{' '}
                  <span style={{ color: trendColor(threatAssessment.kinematicProfile.speedTrend) }}>
                    {trendArrow(threatAssessment.kinematicProfile.speedTrend)}
                  </span>
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Altitude</span>
                <span style={styles.value}>
                  {threatAssessment.kinematicProfile.altitudeM.toFixed(0)} m{' '}
                  <span style={{ color: trendColor(threatAssessment.kinematicProfile.altitudeTrend) }}>
                    {trendArrow(threatAssessment.kinematicProfile.altitudeTrend)}
                  </span>
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Alt Rate</span>
                <span style={styles.value}>{threatAssessment.kinematicProfile.altitudeRateMs.toFixed(1)} m/s</span>
              </div>
            </div>
          )}

          {/* Closure Rate */}
          {threatAssessment.closureRate && (
            <div>
              <div style={styles.subLabel}>CLOSURE RATE</div>
              <div style={styles.row}>
                <span style={styles.label}>
                  {threatAssessment.closureRate.sensorId
                    ? `vs ${threatAssessment.closureRate.sensorId}`
                    : 'Closure'}
                </span>
                <span style={{
                  ...styles.value,
                  color: threatAssessment.closureRate.approaching ? '#ff3333' : '#00cc44',
                }}>
                  {threatAssessment.closureRate.approaching ? '\u2191 ' : '\u2193 '}
                  {Math.abs(threatAssessment.closureRate.valueMs).toFixed(1)} m/s
                  {threatAssessment.closureRate.approaching ? ' approaching' : ' receding'}
                </span>
              </div>
            </div>
          )}

          {/* Tasking Priority */}
          <div style={{ marginTop: '6px' }}>
            <div style={styles.row}>
              <span style={styles.label}>Tasking Priority</span>
              <span style={styles.badge(PRIORITY_COLORS[threatAssessment.taskingPriority] ?? '#666')}>
                {threatAssessment.taskingPriority.charAt(0).toUpperCase() + threatAssessment.taskingPriority.slice(1)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
