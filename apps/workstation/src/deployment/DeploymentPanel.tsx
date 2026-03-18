import React from 'react';
import { useDeploymentStore } from './deployment-store';
import type { SensorSpec } from './deployment-store';

const colors = {
  bg: '#141425',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
  eo: '#ff8800',
  radar: '#4488ff',
  danger: '#ff3333',
  success: '#00cc44',
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

const btnStyle: React.CSSProperties = {
  background: '#333',
  color: '#aaa',
  border: 'none',
  padding: '4px 10px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '11px',
  width: '100%',
  marginBottom: '4px',
};

let sensorCounter = 10;

export function DeploymentPanel() {
  const inventory = useDeploymentStore(s => s.sensorInventory);
  const placedSensors = useDeploymentStore(s => s.placedSensors);
  const optimizing = useDeploymentStore(s => s.optimizing);
  const error = useDeploymentStore(s => s.error);
  const exclusionZones = useDeploymentStore(s => s.exclusionZones);
  const threatCorridors = useDeploymentStore(s => s.threatCorridors);
  const addSensor = useDeploymentStore(s => s.addSensorToInventory);
  const removeSensor = useDeploymentStore(s => s.removeSensorFromInventory);
  const addExclusionZone = useDeploymentStore(s => s.addExclusionZone);
  const removeExclusionZone = useDeploymentStore(s => s.removeExclusionZone);
  const addThreatCorridor = useDeploymentStore(s => s.addThreatCorridor);
  const removeThreatCorridor = useDeploymentStore(s => s.removeThreatCorridor);
  const runOptimization = useDeploymentStore(s => s.runOptimization);
  const exportScenario = useDeploymentStore(s => s.exportScenario);
  const clearAll = useDeploymentStore(s => s.clearAll);

  const handleAddEO = () => {
    sensorCounter++;
    addSensor({
      id: `eo-${sensorCounter}`,
      type: 'eo',
      maxRangeM: 15000,
      fovHalfAngleDeg: 5,
      minAzDeg: 0,
      maxAzDeg: 360,
    });
  };

  const handleAddRadar = () => {
    sensorCounter++;
    addSensor({
      id: `radar-${sensorCounter}`,
      type: 'radar',
      maxRangeM: 40000,
      fovHalfAngleDeg: 180,
      minAzDeg: 0,
      maxAzDeg: 360,
    });
  };

  const handleAddExclusion = () => {
    // Add a small default exclusion zone in center of scanned area
    const area = useDeploymentStore.getState().scannedArea;
    if (area.length < 2) return;
    const cLat = area.reduce((s, p) => s + p.lat, 0) / area.length;
    const cLon = area.reduce((s, p) => s + p.lon, 0) / area.length;
    const d = 0.05;
    addExclusionZone([
      { lat: cLat - d, lon: cLon - d },
      { lat: cLat - d, lon: cLon + d },
      { lat: cLat + d, lon: cLon + d },
      { lat: cLat + d, lon: cLon - d },
    ]);
  };

  const handleAddThreat = () => {
    const area = useDeploymentStore.getState().scannedArea;
    if (area.length < 2) return;
    const minLat = Math.min(...area.map(p => p.lat));
    const maxLat = Math.max(...area.map(p => p.lat));
    const cLon = area.reduce((s, p) => s + p.lon, 0) / area.length;
    const w = 0.03;
    addThreatCorridor([
      { lat: minLat, lon: cLon - w },
      { lat: minLat, lon: cLon + w },
      { lat: maxLat, lon: cLon + w },
      { lat: maxLat, lon: cLon - w },
    ]);
  };

  return (
    <div style={{ padding: '12px', color: colors.text, fontSize: '13px', overflowY: 'auto', height: '100%' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>Deployment Planner</h3>

      {/* Sensor Inventory */}
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Sensor Inventory ({inventory.length})</div>
        {inventory.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '12px' }}>
            <span>
              <span style={{ color: s.type === 'eo' ? colors.eo : colors.radar, fontWeight: 600 }}>
                {s.type.toUpperCase()}
              </span>
              <span style={{ color: colors.textDim, marginLeft: '6px' }}>{s.id}</span>
              <span style={{ color: colors.textDim, marginLeft: '6px', fontSize: '10px' }}>{(s.maxRangeM / 1000).toFixed(0)}km</span>
            </span>
            <button
              onClick={() => removeSensor(s.id)}
              style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
            >
              x
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <button onClick={handleAddEO} style={{ ...btnStyle, width: 'auto', flex: 1, color: colors.eo }}>+ EO</button>
          <button onClick={handleAddRadar} style={{ ...btnStyle, width: 'auto', flex: 1, color: colors.radar }}>+ Radar</button>
        </div>
      </div>

      {/* Zones */}
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Zones</div>
        {exclusionZones.map((_, i) => (
          <div key={`excl-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: '12px' }}>
            <span style={{ color: colors.danger }}>Exclusion Zone {i + 1}</span>
            <button onClick={() => removeExclusionZone(i)} style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: '14px' }}>x</button>
          </div>
        ))}
        {threatCorridors.map((_, i) => (
          <div key={`threat-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: '12px' }}>
            <span style={{ color: '#ffcc00' }}>Threat Corridor {i + 1}</span>
            <button onClick={() => removeThreatCorridor(i)} style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: '14px' }}>x</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <button onClick={handleAddExclusion} style={{ ...btnStyle, width: 'auto', flex: 1, color: colors.danger }}>+ Exclusion</button>
          <button onClick={handleAddThreat} style={{ ...btnStyle, width: 'auto', flex: 1, color: '#ffcc00' }}>+ Threat</button>
        </div>
      </div>

      {/* Placed Sensors */}
      {placedSensors.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionTitle}>Placed Sensors ({placedSensors.length})</div>
          {placedSensors.map((ps, i) => (
            <div key={i} style={{ padding: '3px 0', fontSize: '11px', borderBottom: '1px solid #222' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: ps.spec.type === 'eo' ? colors.eo : colors.radar, fontWeight: 600 }}>
                  {ps.spec.type.toUpperCase()} {ps.spec.id}
                </span>
                <span style={{ color: colors.success, fontFamily: 'monospace' }}>
                  {(ps.scores.total * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ color: colors.textDim, fontSize: '10px' }}>
                {ps.position.lat.toFixed(4)}, {ps.position.lon.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#331111', border: '1px solid #ff3333', borderRadius: '3px', padding: '6px 8px', fontSize: '11px', color: '#ff6666', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Actions</div>
        <button
          onClick={runOptimization}
          disabled={optimizing || inventory.length === 0}
          style={{
            ...btnStyle,
            background: optimizing ? '#555' : '#00aa44',
            color: '#fff',
            fontWeight: 600,
            opacity: optimizing || inventory.length === 0 ? 0.5 : 1,
            cursor: optimizing || inventory.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {optimizing ? 'Optimizing...' : 'Optimize Placement'}
        </button>
        {placedSensors.length > 0 && (
          <>
            <button onClick={exportScenario} style={{ ...btnStyle, color: colors.accent }}>
              Export to Scenario
            </button>
            <button onClick={clearAll} style={{ ...btnStyle, color: colors.danger }}>
              Clear Results
            </button>
          </>
        )}
      </div>
    </div>
  );
}
