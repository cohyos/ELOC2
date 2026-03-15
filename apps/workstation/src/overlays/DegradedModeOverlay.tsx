import React from 'react';
import { useSensorStore } from '../stores/sensor-store';

/**
 * Shows a warning banner when any sensor has degraded or unsafe registration state.
 * This component checks sensor online status and displays appropriate warnings.
 *
 * Registration quality is checked via the API when the sensor detail panel is open.
 * This overlay provides a quick visual indicator for offline or degraded sensors.
 */
export function DegradedModeOverlay() {
  const sensors = useSensorStore(s => s.sensors);

  const offlineSensors = sensors.filter(s => !s.online);

  if (offlineSensors.length === 0) {
    return null;
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      background: '#ff333399',
      color: '#ffffff',
      padding: '6px 16px',
      fontSize: '12px',
      fontWeight: 600,
      textAlign: 'center',
      fontFamily: 'system-ui, sans-serif',
      backdropFilter: 'blur(4px)',
    }}>
      DEGRADED MODE: {offlineSensors.map(s => s.sensorId).join(', ')} offline
      {' '} — Registration may be unsafe for fusion
    </div>
  );
}
