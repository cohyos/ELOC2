import React, { useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import type { EditorFault } from '../stores/editor-store';

const FAULT_COLORS: Record<string, string> = {
  sensor_outage: '#ff3333',
  azimuth_bias: '#ffcc00',
  clock_drift: '#ff8844',
};

const FAULT_LABELS: Record<string, string> = {
  azimuth_bias: 'Azimuth Bias',
  clock_drift: 'Clock Drift',
  sensor_outage: 'Sensor Outage',
};

const styles = {
  container: {
    padding: '12px',
    color: '#e0e0e0',
    fontSize: '13px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    borderBottom: '1px solid #333',
    paddingBottom: '3px',
  },
  faultItem: (selected: boolean, color: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    background: selected ? '#2a2a4e' : '#1a1a2e',
    border: `1px solid ${selected ? color : '#2a2a3e'}`,
    borderRadius: '4px',
    marginBottom: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  }),
  dot: (color: string): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  addBtn: {
    background: '#333',
    color: '#aaa',
    border: '1px dashed #555',
    padding: '6px 12px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    width: '100%',
    marginBottom: '12px',
  } as React.CSSProperties,
  formRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
    fontSize: '12px',
  } as React.CSSProperties,
  label: {
    color: '#888',
    fontSize: '11px',
    minWidth: '80px',
  } as React.CSSProperties,
  input: {
    background: '#222',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '11px',
    width: '120px',
    fontFamily: '"Fira Code", "Consolas", monospace',
  } as React.CSSProperties,
  select: {
    background: '#222',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '11px',
    width: '130px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteBtn: {
    background: '#ff333322',
    color: '#ff3333',
    border: '1px solid #ff333344',
    padding: '4px 12px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    width: '100%',
    marginTop: '12px',
  } as React.CSSProperties,
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TimelineBar({ fault, duration }: { fault: EditorFault; duration: number }) {
  const color = FAULT_COLORS[fault.type] || '#888';
  const leftPct = duration > 0 ? (fault.startTimeSec / duration) * 100 : 0;
  const widthPct = duration > 0 ? ((fault.endTimeSec - fault.startTimeSec) / duration) * 100 : 0;

  return (
    <div
      style={{
        marginTop: '8px',
        background: '#1a1a2e',
        borderRadius: '3px',
        height: '16px',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid #333',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          width: `${Math.max(widthPct, 0.5)}%`,
          height: '100%',
          background: color,
          opacity: 0.6,
          borderRadius: '2px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '4px',
          top: '1px',
          fontSize: '9px',
          color: '#888',
          pointerEvents: 'none',
        }}
      >
        {formatTime(fault.startTimeSec)} - {formatTime(fault.endTimeSec)}
      </div>
    </div>
  );
}

function FaultForm({ fault }: { fault: EditorFault }) {
  const updateFault = useEditorStore((s) => s.updateFault);
  const removeFault = useEditorStore((s) => s.removeFault);
  const sensors = useEditorStore((s) => s.sensors);
  const duration = useEditorStore((s) => s.duration);

  const update = useCallback(
    (updates: Partial<EditorFault>) => {
      updateFault(fault.id, updates);
    },
    [fault.id, updateFault]
  );

  const handleDelete = useCallback(() => {
    if (confirm('Delete this fault?')) {
      removeFault(fault.id);
    }
  }, [fault.id, removeFault]);

  const showMagnitude = fault.type === 'azimuth_bias' || fault.type === 'clock_drift';
  const magnitudeLabel = fault.type === 'azimuth_bias' ? 'Bias (degrees)' : 'Drift (ms/s)';

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={styles.sectionTitle}>Fault Configuration</div>

      {/* Type */}
      <div style={styles.formRow}>
        <span style={styles.label}>Fault Type</span>
        <select
          value={fault.type}
          onChange={(e) =>
            update({
              type: e.target.value as EditorFault['type'],
              magnitude:
                e.target.value === 'sensor_outage'
                  ? undefined
                  : e.target.value === 'azimuth_bias'
                    ? 3.0
                    : 5.0,
            })
          }
          style={styles.select}
        >
          <option value="azimuth_bias">Azimuth Bias</option>
          <option value="clock_drift">Clock Drift</option>
          <option value="sensor_outage">Sensor Outage</option>
        </select>
      </div>

      {/* Sensor ID */}
      <div style={styles.formRow}>
        <span style={styles.label}>Sensor</span>
        <select
          value={fault.sensorId}
          onChange={(e) => update({ sensorId: e.target.value })}
          style={styles.select}
        >
          <option value="">-- Select --</option>
          {sensors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.type.toUpperCase()}-{s.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      {/* Start Time */}
      <div style={styles.formRow}>
        <span style={styles.label}>Start (sec)</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={duration}
            value={fault.startTimeSec}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              update({ startTimeSec: v, endTimeSec: Math.max(fault.endTimeSec, v) });
            }}
            style={{ width: '60px' }}
          />
          <input
            type="number"
            value={fault.startTimeSec}
            onChange={(e) => {
              const v = parseInt(e.target.value) || 0;
              update({ startTimeSec: v, endTimeSec: Math.max(fault.endTimeSec, v) });
            }}
            min={0}
            max={duration}
            style={{ ...styles.input, width: '50px' }}
          />
        </div>
      </div>

      {/* End Time */}
      <div style={styles.formRow}>
        <span style={styles.label}>End (sec)</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="range"
            min={fault.startTimeSec}
            max={duration}
            value={fault.endTimeSec}
            onChange={(e) => update({ endTimeSec: parseInt(e.target.value) })}
            style={{ width: '60px' }}
          />
          <input
            type="number"
            value={fault.endTimeSec}
            onChange={(e) => update({ endTimeSec: parseInt(e.target.value) || 0 })}
            min={fault.startTimeSec}
            max={duration}
            style={{ ...styles.input, width: '50px' }}
          />
        </div>
      </div>

      {/* Magnitude */}
      {showMagnitude && (
        <div style={styles.formRow}>
          <span style={styles.label}>{magnitudeLabel}</span>
          <input
            type="number"
            value={fault.magnitude ?? (fault.type === 'azimuth_bias' ? 3.0 : 5.0)}
            onChange={(e) => update({ magnitude: parseFloat(e.target.value) || 0 })}
            step={0.1}
            min={0}
            style={styles.input}
          />
        </div>
      )}

      {/* Timeline preview */}
      <div style={{ ...styles.sectionTitle, marginTop: '12px' }}>Timeline</div>
      <TimelineBar fault={fault} duration={duration} />

      <button style={styles.deleteBtn} onClick={handleDelete}>
        Delete Fault
      </button>
    </div>
  );
}

export function FaultTab() {
  const faults = useEditorStore((s) => s.faults);
  const sensors = useEditorStore((s) => s.sensors);
  const duration = useEditorStore((s) => s.duration);
  const addFault = useEditorStore((s) => s.addFault);
  const [selectedFaultId, setSelectedFaultId] = React.useState<string | null>(null);

  const selectedFault = faults.find((f) => f.id === selectedFaultId) ?? null;

  const handleAdd = useCallback(() => {
    const newFault: EditorFault = {
      id: crypto.randomUUID(),
      type: 'azimuth_bias',
      sensorId: sensors.length > 0 ? sensors[0].id : '',
      startTimeSec: 0,
      endTimeSec: Math.min(60, duration),
      magnitude: 3.0,
    };
    addFault(newFault);
    setSelectedFaultId(newFault.id);
  }, [addFault, sensors, duration]);

  return (
    <div style={styles.container}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
          Faults ({faults.length})
        </span>
      </div>

      <button style={styles.addBtn} onClick={handleAdd}>
        + Add Fault
      </button>

      {/* Fault list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '8px',
          minHeight: 0,
        }}
      >
        {faults.length === 0 ? (
          <p
            style={{
              color: '#555',
              fontSize: '11px',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No faults defined. Add faults to simulate sensor degradation.
          </p>
        ) : (
          faults.map((f) => {
            const color = FAULT_COLORS[f.type] || '#888';
            const isSelected = selectedFaultId === f.id;
            return (
              <div
                key={f.id}
                style={styles.faultItem(isSelected, color)}
                onClick={() => setSelectedFaultId(f.id)}
              >
                <div style={styles.dot(color)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '11px',
                      color: '#ddd',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {FAULT_LABELS[f.type]}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {f.sensorId ? f.sensorId.slice(0, 8) : 'No sensor'} |{' '}
                    {formatTime(f.startTimeSec)}-{formatTime(f.endTimeSec)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedFault && <FaultForm fault={selectedFault} />}
    </div>
  );
}
