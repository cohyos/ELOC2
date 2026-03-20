import React, { useEffect, useState, useCallback } from 'react';

interface TargetType {
  id: string;
  name: string;
  category: string;
  description: string;
  rcs: number;
  irEmission: number;
  speedMs: number;
  altitudeM: number;
  classification?: string;
  symbol?: string;
}

const CATEGORIES = [
  'ballistic_missile',
  'abt',
  'fighter',
  'helicopter',
  'civilian',
  'military_transport',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  ballistic_missile: '#ff4444',
  abt: '#ff8844',
  fighter: '#ff44ff',
  helicopter: '#44aaff',
  civilian: '#88ff88',
  military_transport: '#ffff44',
};

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

export function TargetLibraryPanel() {
  const [targets, setTargets] = useState<TargetType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TargetType | null>(null);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const fetchTargets = useCallback(async () => {
    const res = await fetch('/api/targets/library');
    if (res.ok) {
      const data = await res.json();
      setTargets(data.targets || []);
    }
  }, []);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  const handleSave = async () => {
    if (!editing) return;
    await fetch('/api/targets/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    setEditing(null);
    fetchTargets();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/targets/library/${id}`, { method: 'DELETE' });
    setSelectedId(null);
    fetchTargets();
  };

  const handleNew = () => {
    setEditing({
      id: `custom-target-${Date.now()}`,
      name: 'New Target',
      category: 'fighter',
      description: '',
      rcs: 5.0,
      irEmission: 1000,
      speedMs: 250,
      altitudeM: 5000,
      classification: 'unknown',
    });
    setSelectedId(null);
  };

  const filtered = targets.filter(t => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const selected = targets.find(t => t.id === selectedId);

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#fff' }}>Target Type Library</h3>
        <button style={{ ...btnStyle, background: '#2a4e2a', color: '#88ff88' }} onClick={handleNew}>+ New</button>
      </div>

      {/* Category filter tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
        <button
          style={{ ...btnStyle, background: categoryFilter === 'all' ? '#2a2a4e' : '#1a1a2e', fontSize: '10px' }}
          onClick={() => setCategoryFilter('all')}
        >All ({targets.length})</button>
        {CATEGORIES.map(cat => {
          const count = targets.filter(t => t.category === cat).length;
          return (
            <button
              key={cat}
              style={{
                ...btnStyle,
                background: categoryFilter === cat ? '#2a2a4e' : '#1a1a2e',
                fontSize: '10px',
                borderColor: CATEGORY_COLORS[cat] || '#2a2a3e',
              }}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat.replace('_', ' ')} ({count})
            </button>
          );
        })}
      </div>

      <input
        style={{ ...inputStyle, marginBottom: '10px' }}
        placeholder="Filter by name..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      <div style={{ maxHeight: '280px', overflow: 'auto', marginBottom: '12px' }}>
        {filtered.map(t => (
          <div
            key={t.id}
            onClick={() => { setSelectedId(t.id); setEditing(null); }}
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              background: selectedId === t.id ? '#2a2a4e' : 'transparent',
              borderBottom: '1px solid #1a1a2e',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '12px' }}>{t.name}</div>
              <div style={{ fontSize: '10px', color: '#888' }}>
                RCS: {t.rcs}m² | {t.speedMs}m/s | {t.altitudeM}m
              </div>
            </div>
            <span style={{
              fontSize: '9px',
              color: CATEGORY_COLORS[t.category] || '#888',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}>
              {t.category.replace('_', ' ')}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No targets found</div>
        )}
      </div>

      {/* Edit form */}
      {editing ? (
        <div style={{ borderTop: '1px solid #2a2a3e', paddingTop: '12px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#4a9eff' }}>
            {targets.find(t => t.id === editing.id) ? 'Edit Target' : 'New Target'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '10px', color: '#888' }}>Name</label>
              <input style={inputStyle} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#888' }}>Category</label>
              <select
                style={{ ...inputStyle, fontFamily: 'system-ui' }}
                value={editing.category}
                onChange={e => setEditing({ ...editing, category: e.target.value })}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#888' }}>Classification</label>
              <select
                style={{ ...inputStyle, fontFamily: 'system-ui' }}
                value={editing.classification || 'unknown'}
                onChange={e => setEditing({ ...editing, classification: e.target.value })}
              >
                <option value="unknown">Unknown</option>
                <option value="fighter_aircraft">Fighter</option>
                <option value="civilian_aircraft">Civilian</option>
                <option value="helicopter">Helicopter</option>
                <option value="predator">Hostile</option>
                <option value="ally">Ally</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#888' }}>RCS (m²)</label>
              <input style={inputStyle} type="number" step="0.01" value={editing.rcs} onChange={e => setEditing({ ...editing, rcs: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#888' }}>IR Emission (W/sr)</label>
              <input style={inputStyle} type="number" value={editing.irEmission} onChange={e => setEditing({ ...editing, irEmission: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#888' }}>Speed (m/s)</label>
              <input style={inputStyle} type="number" value={editing.speedMs} onChange={e => setEditing({ ...editing, speedMs: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#888' }}>Altitude (m)</label>
              <input style={inputStyle} type="number" value={editing.altitudeM} onChange={e => setEditing({ ...editing, altitudeM: Number(e.target.value) })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '10px', color: '#888' }}>Description</label>
              <input style={inputStyle} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button style={{ ...btnStyle, background: '#4a9eff', color: '#fff', flex: 1 }} onClick={handleSave}>Save</button>
            <button style={{ ...btnStyle, flex: 1 }} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : selected ? (
        <div style={{ borderTop: '1px solid #2a2a3e', paddingTop: '12px' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '12px', color: '#4a9eff' }}>{selected.name}</h4>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>{selected.description}</div>
          <table style={{ width: '100%', fontSize: '11px' }}>
            <tbody>
              <tr><td style={{ color: '#888', width: '40%' }}>Category</td><td style={{ color: CATEGORY_COLORS[selected.category] }}>{selected.category.replace('_', ' ')}</td></tr>
              <tr><td style={{ color: '#888' }}>RCS</td><td>{selected.rcs} m²</td></tr>
              <tr><td style={{ color: '#888' }}>IR Emission</td><td>{selected.irEmission.toLocaleString()} W/sr</td></tr>
              <tr><td style={{ color: '#888' }}>Speed</td><td>{selected.speedMs} m/s ({(selected.speedMs * 3.6).toFixed(0)} km/h)</td></tr>
              <tr><td style={{ color: '#888' }}>Altitude</td><td>{selected.altitudeM.toLocaleString()} m ({(selected.altitudeM * 3.281).toFixed(0)} ft)</td></tr>
              {selected.classification && <tr><td style={{ color: '#888' }}>Classification</td><td>{selected.classification}</td></tr>}
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
