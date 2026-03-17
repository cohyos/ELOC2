import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useUiStore } from '../stores/ui-store';
import { useSensorStore } from '../stores/sensor-store';
import type { InjectionLogEntry } from '../stores/ui-store';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const toolbarBg = '#1a1a2e';
const borderColor = '#2a2a3e';

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '48px',
  background: toolbarBg,
  borderBottom: `1px solid ${borderColor}`,
  padding: '0 12px',
  gap: '8px',
  fontSize: '12px',
  color: '#e0e0e0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  position: 'relative',
  zIndex: 15,
};

const actionBtnStyle = (accentColor: string, isActive: boolean): React.CSSProperties => ({
  background: isActive ? accentColor + '22' : '#2a2a3e',
  color: isActive ? accentColor : '#ccc',
  border: 'none',
  borderLeft: `3px solid ${accentColor}`,
  padding: '6px 12px',
  borderRadius: '0 3px 3px 0',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '48px',
  background: '#1e1e35',
  border: `1px solid ${borderColor}`,
  borderRadius: '4px',
  padding: '12px',
  minWidth: '280px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  zIndex: 100,
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginBottom: '10px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

const inputStyle: React.CSSProperties = {
  background: '#2a2a3e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: '3px',
  padding: '5px 8px',
  fontSize: '12px',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const submitBtnStyle = (color: string): React.CSSProperties => ({
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: '3px',
  padding: '6px 14px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  marginTop: '4px',
});

// ---------------------------------------------------------------------------
// Toast notification
// ---------------------------------------------------------------------------

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed',
      top: '96px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#00cc44',
      color: '#000',
      padding: '8px 20px',
      borderRadius: '4px',
      fontWeight: 600,
      fontSize: '13px',
      zIndex: 9999,
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    }}>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type icons for log
// ---------------------------------------------------------------------------

const typeIcon: Record<string, { symbol: string; color: string }> = {
  fault:  { symbol: '\u26A0', color: '#ff4444' },
  action: { symbol: '\u2699', color: '#4a9eff' },
  target: { symbol: '\u2795', color: '#00cc44' },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveInjectionToolbar() {
  const sensors = useSensorStore(s => s.sensors);
  const injectionLog = useUiStore(s => s.injectionLog);
  const addInjectionEntry = useUiStore(s => s.addInjectionEntry);
  const spawnTargetPosition = useUiStore(s => s.spawnTargetPosition);
  const setSpawnTargetActive = useUiStore(s => s.setSpawnTargetActive);
  const setSpawnTargetPosition = useUiStore(s => s.setSpawnTargetPosition);
  const spawnTargetActive = useUiStore(s => s.spawnTargetActive);

  const [openDropdown, setOpenDropdown] = useState<'fault' | 'action' | 'target' | 'log' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fault form state
  const [faultType, setFaultType] = useState<'azimuth_bias' | 'clock_drift' | 'sensor_outage'>('azimuth_bias');
  const [faultSensorId, setFaultSensorId] = useState('');
  const [faultMagnitude, setFaultMagnitude] = useState(5);
  const [faultDuration, setFaultDuration] = useState(60);

  // Action form state
  const [actionType, setActionType] = useState<'reserve_sensor' | 'veto_assignment'>('reserve_sensor');
  const [actionSensorId, setActionSensorId] = useState('');
  const [actionDuration, setActionDuration] = useState(120);

  // Spawn target form state
  const [targetAlt, setTargetAlt] = useState(5000);
  const [targetSpeed, setTargetSpeed] = useState(250);
  const [targetHeading, setTargetHeading] = useState(0);
  const [targetLabel, setTargetLabel] = useState('');

  // Default sensor selection
  useEffect(() => {
    if (sensors.length > 0 && !faultSensorId) setFaultSensorId(sensors[0].sensorId);
    if (sensors.length > 0 && !actionSensorId) setActionSensorId(sensors[0].sensorId);
  }, [sensors, faultSensorId, actionSensorId]);

  // Click outside to close dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    if (openDropdown) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [openDropdown]);

  // When spawn target dropdown opens, activate map click mode
  useEffect(() => {
    if (openDropdown === 'target') {
      setSpawnTargetActive(true);
    } else {
      setSpawnTargetActive(false);
    }
  }, [openDropdown, setSpawnTargetActive]);

  const makeEntry = useCallback((type: 'fault' | 'action' | 'target', description: string): InjectionLogEntry => ({
    id: `inj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    timestamp: Date.now(),
    description,
  }), []);

  // ── Submit handlers ───────────────────────────────────────────────────

  const handleInjectFault = useCallback(async () => {
    try {
      const body: Record<string, unknown> = {
        type: faultType,
        sensorId: faultSensorId,
        durationSec: faultDuration,
      };
      if (faultType !== 'sensor_outage') body.magnitude = faultMagnitude;

      const res = await fetch('/api/scenario/inject-fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }
      addInjectionEntry(makeEntry('fault', `${faultType} on ${faultSensorId} for ${faultDuration}s`));
      setToast('Fault injected');
      setOpenDropdown(null);
    } catch (e) {
      setToast(`Error: ${(e as Error).message}`);
    }
  }, [faultType, faultSensorId, faultMagnitude, faultDuration, addInjectionEntry, makeEntry]);

  const handleInjectAction = useCallback(async () => {
    try {
      const body: Record<string, unknown> = { type: actionType };
      if (actionType === 'reserve_sensor') {
        body.sensorId = actionSensorId;
        body.durationSec = actionDuration;
      } else {
        body.sensorId = actionSensorId;
      }

      const res = await fetch('/api/scenario/inject-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }
      addInjectionEntry(makeEntry('action', `${actionType} — sensor ${actionSensorId}`));
      setToast('Action injected');
      setOpenDropdown(null);
    } catch (e) {
      setToast(`Error: ${(e as Error).message}`);
    }
  }, [actionType, actionSensorId, actionDuration, addInjectionEntry, makeEntry]);

  const handleSpawnTarget = useCallback(async () => {
    if (!spawnTargetPosition) return;
    try {
      const res = await fetch('/api/scenario/inject-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: spawnTargetPosition.lat,
          lon: spawnTargetPosition.lon,
          alt: targetAlt,
          speed: targetSpeed,
          headingDeg: targetHeading,
          label: targetLabel || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }
      addInjectionEntry(makeEntry('target', `Target at ${spawnTargetPosition.lat.toFixed(3)}, ${spawnTargetPosition.lon.toFixed(3)} hdg ${targetHeading}`));
      setToast('Target spawned');
      setOpenDropdown(null);
      setSpawnTargetPosition(null);
    } catch (e) {
      setToast(`Error: ${(e as Error).message}`);
    }
  }, [spawnTargetPosition, targetAlt, targetSpeed, targetHeading, targetLabel, addInjectionEntry, makeEntry, setSpawnTargetPosition]);

  // ── Sensor options ────────────────────────────────────────────────────

  const sensorOptions = sensors.map(s => (
    <option key={s.sensorId} value={s.sensorId}>
      {s.sensorId} ({s.sensorType})
    </option>
  ));

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <div style={toolbarStyle} ref={dropdownRef}>
        <span style={{ fontWeight: 700, fontSize: '11px', color: '#ff8800', letterSpacing: '0.5px', textTransform: 'uppercase', marginRight: '4px' }}>
          INJECT
        </span>

        {/* ── Inject Fault ─────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <button
            style={actionBtnStyle('#ff4444', openDropdown === 'fault')}
            onClick={() => setOpenDropdown(openDropdown === 'fault' ? null : 'fault')}
          >
            Inject Fault
          </button>
          {openDropdown === 'fault' && (
            <div style={{ ...dropdownStyle, left: 0 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Fault Type</label>
                <select style={selectStyle} value={faultType} onChange={e => setFaultType(e.target.value as typeof faultType)}>
                  <option value="azimuth_bias">Azimuth Bias</option>
                  <option value="clock_drift">Clock Drift</option>
                  <option value="sensor_outage">Sensor Outage</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Sensor</label>
                <select style={selectStyle} value={faultSensorId} onChange={e => setFaultSensorId(e.target.value)}>
                  {sensorOptions}
                </select>
              </div>
              {faultType !== 'sensor_outage' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Magnitude</label>
                  <input type="number" style={inputStyle} value={faultMagnitude} onChange={e => setFaultMagnitude(Number(e.target.value))} />
                </div>
              )}
              <div style={fieldStyle}>
                <label style={labelStyle}>Duration (seconds)</label>
                <input type="number" style={inputStyle} value={faultDuration} min={1} onChange={e => setFaultDuration(Number(e.target.value))} />
              </div>
              <button style={submitBtnStyle('#ff4444')} onClick={handleInjectFault}>Inject Fault</button>
            </div>
          )}
        </div>

        {/* ── Inject Action ────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <button
            style={actionBtnStyle('#4a9eff', openDropdown === 'action')}
            onClick={() => setOpenDropdown(openDropdown === 'action' ? null : 'action')}
          >
            Inject Action
          </button>
          {openDropdown === 'action' && (
            <div style={{ ...dropdownStyle, left: 0 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Action Type</label>
                <select style={selectStyle} value={actionType} onChange={e => setActionType(e.target.value as typeof actionType)}>
                  <option value="reserve_sensor">Reserve Sensor</option>
                  <option value="veto_assignment">Veto Assignment</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Sensor</label>
                <select style={selectStyle} value={actionSensorId} onChange={e => setActionSensorId(e.target.value)}>
                  {sensorOptions}
                </select>
              </div>
              {actionType === 'reserve_sensor' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Duration (seconds)</label>
                  <input type="number" style={inputStyle} value={actionDuration} min={1} onChange={e => setActionDuration(Number(e.target.value))} />
                </div>
              )}
              <button style={submitBtnStyle('#4a9eff')} onClick={handleInjectAction}>Inject Action</button>
            </div>
          )}
        </div>

        {/* ── Spawn Target ─────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <button
            style={actionBtnStyle('#00cc44', openDropdown === 'target')}
            onClick={() => setOpenDropdown(openDropdown === 'target' ? null : 'target')}
          >
            Spawn Target
          </button>
          {openDropdown === 'target' && (
            <div style={{ ...dropdownStyle, left: 0 }}>
              {!spawnTargetPosition ? (
                <div style={{ color: '#ffcc00', fontSize: '13px', fontWeight: 600, padding: '8px 0' }}>
                  Click on the map to place target...
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '11px', color: '#00cc44', marginBottom: '10px', fontFamily: 'monospace' }}>
                    Position: {spawnTargetPosition.lat.toFixed(4)}, {spawnTargetPosition.lon.toFixed(4)}
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Altitude (m)</label>
                    <input type="number" style={inputStyle} value={targetAlt} min={0} onChange={e => setTargetAlt(Number(e.target.value))} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Speed (m/s)</label>
                    <input type="number" style={inputStyle} value={targetSpeed} min={0} onChange={e => setTargetSpeed(Number(e.target.value))} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Heading (0-360)</label>
                    <input type="number" style={inputStyle} value={targetHeading} min={0} max={360} onChange={e => setTargetHeading(Number(e.target.value))} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Label (optional)</label>
                    <input type="text" style={inputStyle} value={targetLabel} onChange={e => setTargetLabel(e.target.value)} placeholder="e.g. UAV-1" />
                  </div>
                  <button style={submitBtnStyle('#00cc44')} onClick={handleSpawnTarget}>Spawn Target</button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Spacer ───────────────────────────────────────── */}
        <div style={{ flex: 1 }} />

        {/* ── Log toggle ───────────────────────────────────── */}
        <button
          style={{
            ...actionBtnStyle('#ff8800', openDropdown === 'log'),
            borderLeft: '3px solid #ff8800',
          }}
          onClick={() => setOpenDropdown(openDropdown === 'log' ? null : 'log')}
        >
          Log ({injectionLog.length})
        </button>
      </div>

      {/* ── Log Panel ────────────────────────────────────────────── */}
      {openDropdown === 'log' && (
        <div style={{
          background: '#1e1e35',
          borderBottom: `1px solid ${borderColor}`,
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '8px 12px',
          fontSize: '12px',
          zIndex: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, color: '#ff8800', fontSize: '11px', textTransform: 'uppercase' }}>Injection Log</span>
            <button
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '11px' }}
              onClick={() => setOpenDropdown(null)}
            >
              Close
            </button>
          </div>
          {injectionLog.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic', padding: '8px 0' }}>No injections yet</div>
          ) : (
            injectionLog.map(entry => {
              const icon = typeIcon[entry.type] || typeIcon.fault;
              const time = new Date(entry.timestamp);
              const ts = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;
              return (
                <div key={entry.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #2a2a3e' }}>
                  <span style={{ color: icon.color, fontSize: '14px', width: '18px', textAlign: 'center' }}>{icon.symbol}</span>
                  <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '11px', minWidth: '60px' }}>{ts}</span>
                  <span style={{ color: '#ccc' }}>{entry.description}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
