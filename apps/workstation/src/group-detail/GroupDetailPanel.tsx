import React, { useState } from 'react';
import { useTaskStore } from '../stores/task-store';
import { useUiStore } from '../stores/ui-store';

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
  link: {
    color: '#4a9eff',
    cursor: 'pointer',
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '12px',
    textDecoration: 'underline',
    background: 'none',
    border: 'none',
    padding: 0,
  } as React.CSSProperties,
  actionBtn: (color: string) => ({
    background: color + '22',
    color: color,
    border: `1px solid ${color}44`,
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    width: '100%',
    marginBottom: '6px',
  } as React.CSSProperties),
};

function groupStatusColor(status: string): string {
  switch (status) {
    case 'active': return '#ff6699';
    case 'resolved': return '#00cc44';
    default: return '#888888';
  }
}

export function GroupDetailPanel() {
  const selectedGroupId = useUiStore(s => s.selectedGroupId);
  const selectGroup = useUiStore(s => s.selectGroup);
  const selectCue = useUiStore(s => s.selectCue);
  const unresolvedGroups = useTaskStore(s => s.unresolvedGroups);
  const eoTracks = useTaskStore(s => s.eoTracks);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [forceResolving, setForceResolving] = useState(false);

  const group = selectedGroupId ? unresolvedGroups.find(g => g.groupId === selectedGroupId) : null;

  if (!group) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
          Select an ambiguity marker on the map to view group details.
        </p>
      </div>
    );
  }

  // Get EO track details for member tracks
  const memberTracks = group.eoTrackIds.map(id => eoTracks.find(t => t.eoTrackId === id)).filter(Boolean);

  const handleForceResolve = async () => {
    setForceResolving(true);
    try {
      const res = await fetch('/api/investigation/force-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.groupId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToastMsg('Force resolve sent');
    } catch (err) {
      setToastMsg(`Error: ${(err as Error).message}`);
    } finally {
      setForceResolving(false);
      setTimeout(() => setToastMsg(null), 3000);
    }
  };

  const handleRequestSensor = () => {
    setToastMsg('Not yet implemented');
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={{ fontSize: '10px', color: '#ff6699', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Ambiguity Group</div>
          <h3 style={styles.title}>{group.groupId}</h3>
        </div>
        <button style={styles.closeBtn} onClick={() => selectGroup(null)}>&times;</button>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          background: '#333',
          color: '#e0e0e0',
          padding: '6px 12px',
          borderRadius: '4px',
          marginBottom: '8px',
          fontSize: '12px',
          border: '1px solid #555',
        }}>
          {toastMsg}
        </div>
      )}

      {/* Status */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Status</div>
        <div style={styles.row}>
          <span style={styles.label}>State</span>
          <span style={styles.badge(groupStatusColor(group.status))}>{group.status}</span>
        </div>
      </div>

      {/* Reason */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Reason</div>
        <div style={{ color: '#ccc', fontSize: '12px', lineHeight: 1.4 }}>
          {group.reason || 'No reason provided'}
        </div>
      </div>

      {/* Parent Cue */}
      {group.parentCueId && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Parent Cue</div>
          <div style={styles.row}>
            <span style={styles.label}>Cue ID</span>
            <button style={styles.link} onClick={() => selectCue(group.parentCueId)}>
              {group.parentCueId}
            </button>
          </div>
        </div>
      )}

      {/* Member Tracks */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Member EO Tracks ({group.eoTrackIds.length})</div>
        {group.eoTrackIds.map((id, i) => {
          const track = memberTracks.find(t => t?.eoTrackId === id);
          return (
            <div key={id} style={{
              padding: '4px 0',
              borderLeft: '2px solid #ff6699',
              paddingLeft: '8px',
              marginBottom: '4px',
              fontSize: '11px',
            }}>
              <div style={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: '12px' }}>{id}</div>
              {track && (
                <>
                  <div style={styles.row}>
                    <span style={styles.label}>Sensor</span>
                    <span style={styles.value}>{track.sensorId}</span>
                  </div>
                  <div style={styles.row}>
                    <span style={styles.label}>Status</span>
                    <span style={styles.value}>{track.status}</span>
                  </div>
                  <div style={styles.row}>
                    <span style={styles.label}>Image Quality</span>
                    <span style={styles.value}>{(track.imageQuality * 100).toFixed(0)}%</span>
                  </div>
                </>
              )}
              {/* Hypothesis bar */}
              <div style={{ marginTop: '2px' }}>
                <div style={{
                  height: '4px',
                  background: '#222',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${(1 / Math.max(group.eoTrackIds.length, 1)) * 100}%`,
                    height: '100%',
                    background: '#ff6699',
                    borderRadius: '2px',
                  }} />
                </div>
                <div style={{ fontSize: '9px', color: '#888', marginTop: '1px' }}>
                  p = {(1 / Math.max(group.eoTrackIds.length, 1)).toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resolution Actions */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Resolution Actions</div>
        <button
          style={styles.actionBtn('#ff6699')}
          onClick={handleForceResolve}
          disabled={forceResolving}
        >
          {forceResolving ? 'Resolving...' : 'Force Resolve'}
        </button>
        <button
          style={styles.actionBtn('#4488ff')}
          onClick={handleRequestSensor}
        >
          Request Additional Sensor
        </button>
        <button
          style={styles.actionBtn('#888888')}
          onClick={() => selectGroup(null)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
