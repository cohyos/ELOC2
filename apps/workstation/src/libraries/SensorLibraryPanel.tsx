import React, { useEffect, useState, useCallback } from 'react';

interface SensorType {
  id: string;
  name: string;
  type: string;
  description: string;
  rangeMaxKm?: number;
  coverage?: Record<string, number>;
  fov?: Record<string, number>;
  slewRateDegSec?: number;
  [key: string]: unknown;
}

const panelStyle: React.CSSProperties = {
  background: '#141425',
  border: '1px solid #2a2a3e',
  borderRadius: '6px',
  padding: '16px',
  color: '#e0e0e0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
  height: '100%',
  overflow: 'auto',
};

const inputStyle: React.CSSProperties = {
  background: '#1a1a2e',
  border: '1px solid #2a2a3e',
  borderRadius: '4px',
  color: '#e0e0e0',
  padding: '4px 8px',
  fontSize: '12px',
  width: '100%',
  fontFamily: 'monospace',
};

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #2a2a3e',
  borderRadius: '4px',
  fontSize: '11px',
  cursor: 'pointer',
  background: '#1a1a2e',
  color: '#e0e0e0',
};

export function SensorLibraryPanel() {
  const [sensors, setSensors] = useState<SensorType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SensorType | null>(null);
  const [filter, setFilter] = useState('');

  const fetchSensors = useCallback(async () => {
    const res = await fetch('/api/sensors/library');
    if (res.ok) {
      const data = await res.json();
      setSensors(data.sensors || []);
    }
  }, []);

  useEffect(() => { fetchSensors(); }, [fetchSensors]);

  const handleSave = async () => {
    if (!editing) return;
    await fetch('/api/sensors/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    setEditing(null);
    fetchSensors();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/sensors/library/${id}`, { method: 'DELETE' });
    setSelectedId(null);
    fetchSensors();
  };

  const handleNew = () => {
    const newSensor: SensorType = {
      id: `custom-sensor-${Date.now()}`,
      name: 'New Sensor',
      type: 'radar',
      description: '',
      rangeMaxKm: 100,
      coverage: { azMin: 0, azMax: 360, elMin: 0, elMax: 60 },
    };
    setEditing(newSensor);
    setSelectedId(null);
  };

  const filtered = sensors.filter(s =>
    !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.type.includes(filter.toLowerCase())
  );

  const selected = sensors.find(s => s.id === selectedId);

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#fff' }}>Sensor Type Library</h3>
        <button style={{ ...btnStyle, background: '#2a4e2a', color: '#88ff88' }} onClick={handleNew}>+ New</button>
      </div>

      <input
        style={{ ...inputStyle, marginBottom: '10px' }}
        placeholder="Filter by name or type..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      <div style={{ maxHeight: '300px', overflow: 'auto', marginBottom: '12px' }}>
        {filtered.map(s => (
          <div
            key={s.id}
            onClick={() => { setSelectedId(s.id); setEditing(null); }}
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              background: selectedId === s.id ? '#2a2a4e' : 'transparent',
              borderBottom: '1px solid #1a1a2e',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '12px' }}>{s.name}</div>
              <div style={{ fontSize: '10px', color: '#888' }}>
                {s.type} | {s.rangeMaxKm ?? s.coverage?.rangeMaxKm ?? '?'}km
              </div>
            </div>
            <span style={{ fontSize: '10px', color: s.type === 'radar' ? '#4488ff' : '#ff8800' }}>
              {s.type.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Detail / Edit View */}
      {editing ? (
        <div style={{ borderTop: '1px solid #2a2a3e', paddingTop: '12px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#4a9eff' }}>
            {sensors.find(s => s.id === editing.id) ? 'Edit Sensor' : 'New Sensor'}
          </h4>
          <label style={{ fontSize: '10px', color: '#888' }}>ID</label>
          <input style={inputStyle} value={editing.id} onChange={e => setEditing({ ...editing, id: e.target.value })} />
          <label style={{ fontSize: '10px', color: '#888', marginTop: '4px', display: 'block' }}>Name</label>
          <input style={inputStyle} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          <label style={{ fontSize: '10px', color: '#888', marginTop: '4px', display: 'block' }}>Type</label>
          <select
            style={{ ...inputStyle, fontFamily: 'system-ui' }}
            value={editing.type}
            onChange={e => setEditing({ ...editing, type: e.target.value })}
          >
            <option value="radar">Radar</option>
            <option value="eo">EO</option>
            <option value="c4isr">C4ISR</option>
          </select>
          <label style={{ fontSize: '10px', color: '#888', marginTop: '4px', display: 'block' }}>Description</label>
          <input style={inputStyle} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
          <label style={{ fontSize: '10px', color: '#888', marginTop: '4px', display: 'block' }}>Range (km)</label>
          <input style={inputStyle} type="number" value={editing.rangeMaxKm ?? ''} onChange={e => setEditing({ ...editing, rangeMaxKm: Number(e.target.value) })} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button style={{ ...btnStyle, background: '#4a9eff', color: '#fff', flex: 1 }} onClick={handleSave}>Save</button>
            <button style={{ ...btnStyle, flex: 1 }} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : selected ? (
        <div style={{ borderTop: '1px solid #2a2a3e', paddingTop: '12px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#4a9eff' }}>{selected.name}</h4>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>{selected.description}</div>
          <table style={{ width: '100%', fontSize: '11px' }}>
            <tbody>
              <tr><td style={{ color: '#888' }}>Type</td><td>{selected.type}</td></tr>
              <tr><td style={{ color: '#888' }}>Range</td><td>{selected.rangeMaxKm ?? '—'}km</td></tr>
              {selected.coverage && (
                <tr><td style={{ color: '#888' }}>Coverage</td><td>{selected.coverage.azMin}°–{selected.coverage.azMax}°</td></tr>
              )}
              {selected.fov && (
                <tr><td style={{ color: '#888' }}>FOV</td><td>{selected.fov.halfAngleH}° x {selected.fov.halfAngleV}°</td></tr>
              )}
              {selected.slewRateDegSec && (
                <tr><td style={{ color: '#888' }}>Slew Rate</td><td>{selected.slewRateDegSec}°/s</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button style={{ ...btnStyle, flex: 1 }} onClick={() => setEditing({ ...selected })}>Edit</button>
            <button style={{ ...btnStyle, flex: 1, color: '#ff6666' }} onClick={() => handleDelete(selected.id)}>Delete</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
