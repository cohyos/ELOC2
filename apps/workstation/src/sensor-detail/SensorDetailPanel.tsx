import React, { useEffect, useState } from 'react';
import { useSensorStore } from '../stores/sensor-store';
import { useUiStore } from '../stores/ui-store';
import type { RegistrationState } from '@eloc2/domain';

const styles = {
  container: {
    padding: '12px',
    color: '#e0e0e0',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  } as React.CSSProperties,
  closeBtn: {
    background: 'none',
    border: '1px solid #555',
    color: '#aaa',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '11px',
  } as React.CSSProperties,
  section: {
    marginBottom: '12px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    borderBottom: '1px solid #333',
    paddingBottom: '3px',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '12px',
  } as React.CSSProperties,
  value: {
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '12px',
    color: '#e0e0e0',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 600,
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
};

function sensorTypeColor(type: string): string {
  switch (type) {
    case 'radar': return '#4488ff';
    case 'eo': return '#ff8800';
    case 'c4isr': return '#aa44ff';
    default: return '#888888';
  }
}

function qualityColor(quality: string): string {
  switch (quality) {
    case 'good': return '#00cc44';
    case 'degraded': return '#ffcc00';
    case 'unsafe': return '#ff3333';
    default: return '#888888';
  }
}

export function SensorDetailPanel() {
  const selectedSensorId = useUiStore(s => s.selectedSensorId);
  const selectSensor = useUiStore(s => s.selectSensor);
  const sensors = useSensorStore(s => s.sensors);
  const [registration, setRegistration] = useState<RegistrationState | null>(null);

  const sensor = selectedSensorId
    ? sensors.find(s => s.sensorId === selectedSensorId)
    : null;

  useEffect(() => {
    if (!selectedSensorId) {
      setRegistration(null);
      return;
    }
    fetch(`/api/sensors/${selectedSensorId}/registration`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setRegistration(data))
      .catch(() => setRegistration(null));
  }, [selectedSensorId]);

  if (!sensor) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
          Select a sensor on the map to view details.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>{sensor.sensorId}</h3>
        <button style={styles.closeBtn} onClick={() => selectSensor(null)}>Close</button>
      </div>

      {/* Type & Status */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Sensor Info</div>
        <div style={styles.row}>
          <span style={styles.label}>Type</span>
          <span style={styles.badge(sensorTypeColor(sensor.sensorType))}>{sensor.sensorType}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Online</span>
          <span style={styles.badge(sensor.online ? '#00cc44' : '#ff3333')}>
            {sensor.online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Position */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Position</div>
        <div style={styles.row}>
          <span style={styles.label}>Lat</span>
          <span style={styles.value}>{sensor.position.lat.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Lon</span>
          <span style={styles.value}>{sensor.position.lon.toFixed(4)}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Alt</span>
          <span style={styles.value}>{sensor.position.alt} m</span>
        </div>
      </div>

      {/* Coverage */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Coverage</div>
        <div style={styles.row}>
          <span style={styles.label}>Az Range</span>
          <span style={styles.value}>{sensor.coverage.minAzDeg} - {sensor.coverage.maxAzDeg} deg</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>El Range</span>
          <span style={styles.value}>{sensor.coverage.minElDeg} - {sensor.coverage.maxElDeg} deg</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Max Range</span>
          <span style={styles.value}>{(sensor.coverage.maxRangeM / 1000).toFixed(0)} km</span>
        </div>
      </div>

      {/* Gimbal (EO only) */}
      {sensor.gimbal && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Gimbal State</div>
          <div style={styles.row}>
            <span style={styles.label}>Azimuth</span>
            <span style={styles.value}>{sensor.gimbal.azimuthDeg.toFixed(1)} deg</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Elevation</span>
            <span style={styles.value}>{sensor.gimbal.elevationDeg.toFixed(1)} deg</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Slew Rate</span>
            <span style={styles.value}>{sensor.gimbal.slewRateDegPerSec} deg/s</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Target</span>
            <span style={styles.value}>{sensor.gimbal.currentTargetId ?? 'None'}</span>
          </div>
        </div>
      )}

      {/* FOV (EO only) */}
      {sensor.fov && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Field of View</div>
          <div style={styles.row}>
            <span style={styles.label}>H Half-angle</span>
            <span style={styles.value}>{sensor.fov.halfAngleHDeg} deg</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>V Half-angle</span>
            <span style={styles.value}>{sensor.fov.halfAngleVDeg} deg</span>
          </div>
        </div>
      )}

      {/* Registration Health */}
      {registration && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Registration Health</div>
          <div style={styles.row}>
            <span style={styles.label}>Spatial Quality</span>
            <span style={styles.badge(qualityColor(registration.spatialQuality))}>
              {registration.spatialQuality}
            </span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Timing Quality</span>
            <span style={styles.badge(qualityColor(registration.timingQuality))}>
              {registration.timingQuality}
            </span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Fusion Safe</span>
            <span style={styles.badge(registration.fusionSafe ? '#00cc44' : '#ff3333')}>
              {registration.fusionSafe ? 'YES' : 'NO'}
            </span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Az Bias</span>
            <span style={styles.value}>{registration.spatialBias.azimuthBiasDeg.toFixed(3)} deg</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>El Bias</span>
            <span style={styles.value}>{registration.spatialBias.elevationBiasDeg.toFixed(3)} deg</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Clock Offset</span>
            <span style={styles.value}>{registration.clockBias.offsetMs} ms</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Bias Age</span>
            <span style={styles.value}>{(registration.biasEstimateAge / 1000).toFixed(1)} s</span>
          </div>
        </div>
      )}
    </div>
  );
}
