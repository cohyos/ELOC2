/**
 * SectorScanPanel — UI for defining and controlling EO sector threat scans.
 *
 * Allows the operator to:
 *   1. Define a threat sector (azimuth start/end)
 *   2. Assign 1-3 EO investigators
 *   3. Start/stop the scan
 *   4. See scan status, detections, and triangulation activity
 */

import { useState, useCallback, useMemo } from 'react';
import { useSensorStore } from '../stores/sensor-store';

// ── Styles ──────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '12px',
  fontFamily: 'monospace',
  fontSize: '11px',
  color: '#e0e0e0',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '10px',
  borderBottom: '1px solid #333',
  paddingBottom: '6px',
};

const labelStyle: React.CSSProperties = {
  color: '#aaa',
  fontSize: '10px',
  marginBottom: '2px',
};

const inputStyle: React.CSSProperties = {
  width: '70px',
  background: '#222',
  border: '1px solid #444',
  color: '#fff',
  padding: '3px 6px',
  borderRadius: '3px',
  fontSize: '11px',
  fontFamily: 'monospace',
};

const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
  background: disabled ? '#333' : color,
  color: disabled ? '#666' : '#fff',
  border: 'none',
  borderRadius: '4px',
  padding: '5px 12px',
  fontSize: '11px',
  fontFamily: 'monospace',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 0',
};

// ── Component ───────────────────────────────────────────────────────────

export function SectorScanPanel() {
  const sensors = useSensorStore((s) => s.sensors);
  const sectorScan = useSensorStore((s) => s.sectorScan);

  // Form state
  const [azStart, setAzStart] = useState(0);
  const [azEnd, setAzEnd] = useState(90);
  const [selectedSensors, setSelectedSensors] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Available EO sensors
  const eoSensors = useMemo(
    () => sensors.filter((s) => s.sensorType === 'eo' && s.online),
    [sensors],
  );

  const isActive = sectorScan?.active ?? false;
  const noInvestigators = eoSensors.length === 0;

  const toggleSensor = useCallback((sensorId: string) => {
    setSelectedSensors((prev) => {
      const next = new Set(prev);
      if (next.has(sensorId)) {
        next.delete(sensorId);
      } else {
        if (next.size >= 3) return prev; // Max 3
        next.add(sensorId);
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    if (selectedSensors.size < 1) {
      setError('Select at least 1 investigator');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/eo/sector-scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          azimuthStartDeg: azStart,
          azimuthEndDeg: azEnd,
          sensorIds: [...selectedSensors],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [azStart, azEnd, selectedSensors]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      await fetch('/api/eo/sector-scan/stop', { method: 'POST' });
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, color: '#ff8800', fontSize: '12px' }}>
          SECTOR SCAN
        </span>
        {isActive && (
          <span
            style={{
              background: '#00cc44',
              color: '#000',
              padding: '1px 8px',
              borderRadius: '3px',
              fontWeight: 700,
              fontSize: '9px',
            }}
          >
            ACTIVE
          </span>
        )}
      </div>

      {noInvestigators && (
        <div style={{ color: '#ff4444', padding: '8px 0', textAlign: 'center' }}>
          No EO investigators available
        </div>
      )}

      {!isActive && !noInvestigators && (
        <>
          {/* Sector Definition */}
          <div style={{ marginBottom: '10px' }}>
            <div style={labelStyle}>THREAT SECTOR</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div>
                <div style={labelStyle}>Start</div>
                <input
                  type="number"
                  style={inputStyle}
                  min={0}
                  max={360}
                  value={azStart}
                  onChange={(e) => setAzStart(Number(e.target.value))}
                />
              </div>
              <span style={{ color: '#666', marginTop: '14px' }}>&rarr;</span>
              <div>
                <div style={labelStyle}>End</div>
                <input
                  type="number"
                  style={inputStyle}
                  min={0}
                  max={360}
                  value={azEnd}
                  onChange={(e) => setAzEnd(Number(e.target.value))}
                />
              </div>
              <span style={{ color: '#666', marginTop: '14px', fontSize: '10px' }}>deg</span>
            </div>
          </div>

          {/* Investigator Assignment */}
          <div style={{ marginBottom: '10px' }}>
            <div style={labelStyle}>ASSIGN INVESTIGATORS (1-3)</div>
            {eoSensors.map((s) => (
              <label key={s.sensorId as string} style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={selectedSensors.has(s.sensorId as string)}
                  onChange={() => toggleSensor(s.sensorId as string)}
                  disabled={
                    !selectedSensors.has(s.sensorId as string) &&
                    selectedSensors.size >= 3
                  }
                />
                <span style={{ color: '#ff8800' }}>{s.sensorId as string}</span>
                {(s.gimbal?.slewRateDegPerSec ?? 0) === 0 && (
                  <span style={{ color: '#ff4444', fontSize: '9px' }}>(fixed)</span>
                )}
              </label>
            ))}
          </div>

          {error && (
            <div style={{ color: '#ff4444', marginBottom: '6px', fontSize: '10px' }}>
              {error}
            </div>
          )}

          <button
            style={btnStyle('#ff8800', loading || selectedSensors.size < 1)}
            onClick={handleStart}
            disabled={loading || selectedSensors.size < 1}
          >
            {loading ? 'Starting...' : 'Start Sector Scan'}
          </button>
        </>
      )}

      {/* Active Scan Status */}
      {isActive && sectorScan && (
        <>
          <div style={{ marginBottom: '8px' }}>
            <div style={labelStyle}>SECTOR</div>
            <span style={{ color: '#ff8800' }}>
              {sectorScan.sector.azimuthStartDeg.toFixed(0)}&deg; &rarr;{' '}
              {sectorScan.sector.azimuthEndDeg.toFixed(0)}&deg;
            </span>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={labelStyle}>INVESTIGATORS</div>
            {sectorScan.scanners.map((s) => (
              <div
                key={s.sensorId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 0',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background:
                      s.role === 'triangulating' ? '#ff4444' : '#00cc44',
                    display: 'inline-block',
                  }}
                />
                <span>{s.sensorId}</span>
                <span style={{ color: '#666', fontSize: '10px' }}>
                  {s.role === 'scanning'
                    ? `scan ${s.subSectorStart.toFixed(0)}-${s.subSectorEnd.toFixed(0)}`
                    : 'TRIANGULATING'}
                </span>
              </div>
            ))}
          </div>

          {sectorScan.detections.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={labelStyle}>
                DETECTIONS ({sectorScan.detections.length})
              </div>
              {sectorScan.detections.map((d, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '10px',
                    color: d.triangulationCount > 0 ? '#00cc44' : '#ffcc00',
                    padding: '1px 0',
                  }}
                >
                  {d.triangulationCount > 0 ? '\u2713' : '\u25cf'}{' '}
                  {d.azimuthDeg.toFixed(1)}&deg; ({d.detectedBySensorId})
                  {d.triangulationCount > 0
                    ? ` — ${d.triangulationCount}x triangulated`
                    : ' — awaiting TRI'}
                </div>
              ))}
            </div>
          )}

          {sectorScan.triangulatorSensorId && (
            <div style={{ marginBottom: '8px', color: '#ff4444' }}>
              Triangulator: {sectorScan.triangulatorSensorId}
            </div>
          )}

          <button
            style={btnStyle('#ff3333', loading)}
            onClick={handleStop}
            disabled={loading}
          >
            {loading ? 'Stopping...' : 'Stop Scan'}
          </button>
        </>
      )}
    </div>
  );
}
