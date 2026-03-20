import React, { useEffect, useState } from 'react';

interface DeploymentSummary {
  id: string;
  name: string;
  createdAt: string;
  sensorCount: number;
  coveragePercent: number;
}

interface Props {
  onLoadDeployment?: (id: string) => void;
}

const colors = {
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
  danger: '#ff3333',
  success: '#00cc44',
  border: '#2a2a3e',
};

const btnStyle: React.CSSProperties = {
  background: '#333',
  color: '#aaa',
  border: 'none',
  padding: '4px 10px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '11px',
};

export function DeploymentLibraryPanel({ onLoadDeployment }: Props) {
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/deployment/list');
      if (!res.ok) throw new Error('Failed to fetch');
      setDeployments(await res.json());
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/deployment/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchList();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  const handleClone = async (id: string) => {
    try {
      const res = await fetch(`/api/deployment/${id}`);
      if (!res.ok) throw new Error('Load failed');
      const deployment = await res.json();
      const cloneName = `${deployment.name || id} (copy)`;
      const cloneId = `${id}-copy-${Date.now()}`;
      const saveRes = await fetch('/api/deployment/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...deployment, id: cloneId, name: cloneName }),
      });
      if (!saveRes.ok) throw new Error('Clone save failed');
      fetchList();
    } catch (err: any) {
      setError(err.message || 'Clone failed');
    }
  };

  const handleExport = async (id: string) => {
    try {
      const res = await fetch(`/api/deployment/${id}`);
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    }
  };

  if (loading) return <div style={{ color: colors.textDim, padding: '16px' }}>Loading deployments...</div>;

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {error && (
        <div style={{ background: '#331111', border: '1px solid #ff3333', borderRadius: '3px', padding: '6px 8px', fontSize: '11px', color: '#ff6666', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {deployments.length === 0 ? (
        <div style={{ color: colors.textDim, padding: '16px' }}>No saved deployments. Use the Deployment Planner to create one.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {deployments.map(d => (
            <div key={d.id} style={{
              background: '#141425',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              padding: '12px',
            }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: colors.text, marginBottom: '4px' }}>
                {d.name}
              </div>
              <div style={{ fontSize: '11px', color: colors.textDim, marginBottom: '8px' }}>
                {d.sensorCount} sensors | {d.coveragePercent}% coverage
                {d.createdAt && <span> | {new Date(d.createdAt).toLocaleDateString()}</span>}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {onLoadDeployment && (
                  <button onClick={() => onLoadDeployment(d.id)} style={{ ...btnStyle, color: colors.accent }}>
                    Load
                  </button>
                )}
                <button onClick={() => handleClone(d.id)} style={{ ...btnStyle, color: colors.success }}>
                  Clone
                </button>
                <button onClick={() => handleExport(d.id)} style={btnStyle}>
                  Export
                </button>
                <button onClick={() => handleDelete(d.id)} style={{ ...btnStyle, color: colors.danger }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
