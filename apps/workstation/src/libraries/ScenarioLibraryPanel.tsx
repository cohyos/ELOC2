import React, { useEffect, useState, useCallback } from 'react';

interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  sensorCount: number;
  targetCount: number;
  custom: boolean;
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

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #2a2a3e',
  borderRadius: '4px',
  fontSize: '11px',
  cursor: 'pointer',
  background: '#1a1a2e',
  color: '#e0e0e0',
};

interface Props {
  onLoadScenario?: (id: string) => void;
  onEditScenario?: (id: string) => void;
}

export function ScenarioLibraryPanel({ onLoadScenario, onEditScenario }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showCustomOnly, setShowCustomOnly] = useState(false);

  const fetchScenarios = useCallback(async () => {
    const res = await fetch('/api/scenarios');
    if (res.ok) {
      const data = await res.json();
      setScenarios(data);
    }
  }, []);

  useEffect(() => { fetchScenarios(); }, [fetchScenarios]);

  const handleClone = async (id: string) => {
    const res = await fetch(`/api/scenarios/${id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      fetchScenarios();
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/scenarios/custom/${id}`, { method: 'DELETE' });
    setSelectedId(null);
    fetchScenarios();
  };

  const handleExport = async (id: string) => {
    const res = await fetch(`/api/scenarios/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-${data.name || id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filtered = scenarios.filter(s => {
    if (showCustomOnly && !s.custom) return false;
    if (filter && !s.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const selected = scenarios.find(s => s.id === selectedId);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div style={panelStyle}>
      <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#fff' }}>Scenario Library</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          style={{
            flex: 1,
            background: '#1a1a2e',
            border: '1px solid #2a2a3e',
            borderRadius: '4px',
            color: '#e0e0e0',
            padding: '4px 8px',
            fontSize: '12px',
          }}
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button
          style={{ ...btnStyle, background: showCustomOnly ? '#2a2a4e' : '#1a1a2e' }}
          onClick={() => setShowCustomOnly(!showCustomOnly)}
        >Custom</button>
      </div>

      <div style={{ maxHeight: '350px', overflow: 'auto', marginBottom: '12px' }}>
        {filtered.map(s => (
          <div
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              cursor: 'pointer',
              background: selectedId === s.id ? '#2a2a4e' : 'transparent',
              borderBottom: '1px solid #1a1a2e',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '12px' }}>{s.name}</div>
              {s.custom && (
                <span style={{ fontSize: '9px', background: '#4a9eff22', color: '#4a9eff', padding: '1px 4px', borderRadius: '3px' }}>
                  CUSTOM
                </span>
              )}
            </div>
            <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
              {s.sensorCount} sensors | {s.targetCount} targets | {formatDuration(s.durationSec)}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ borderTop: '1px solid #2a2a3e', paddingTop: '12px' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '12px', color: '#4a9eff' }}>{selected.name}</h4>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>{selected.description}</div>
          <table style={{ width: '100%', fontSize: '11px', marginBottom: '10px' }}>
            <tbody>
              <tr><td style={{ color: '#888' }}>Duration</td><td>{formatDuration(selected.durationSec)}</td></tr>
              <tr><td style={{ color: '#888' }}>Sensors</td><td>{selected.sensorCount}</td></tr>
              <tr><td style={{ color: '#888' }}>Targets</td><td>{selected.targetCount}</td></tr>
              <tr><td style={{ color: '#888' }}>Type</td><td>{selected.custom ? 'Custom' : 'Built-in'}</td></tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {onLoadScenario && (
              <button style={{ ...btnStyle, background: '#2a4e2a', color: '#88ff88' }} onClick={() => onLoadScenario(selected.id)}>
                Load
              </button>
            )}
            {onEditScenario && (
              <button style={{ ...btnStyle, background: '#2a3e5a', color: '#88bbff' }} onClick={() => onEditScenario(selected.id)}>
                Edit
              </button>
            )}
            <button style={btnStyle} onClick={() => handleClone(selected.id)}>Clone</button>
            <button style={btnStyle} onClick={() => handleExport(selected.id)}>Export JSON</button>
            {selected.custom && (
              <button style={{ ...btnStyle, color: '#ff6666' }} onClick={() => handleDelete(selected.id)}>Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
