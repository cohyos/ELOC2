import React from 'react';
import { useTaskStore } from '../stores/task-store';
import { useUiStore } from '../stores/ui-store';

const statusColors: Record<string, string> = {
  executing: '#4a9eff',
  proposed: '#ffcc00',
  approved: '#00cc44',
  completed: '#00cc44',
  rejected: '#ff3333',
  expired: '#888',
};

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
  taskCard: {
    background: '#1a1a2e',
    border: '1px solid #2a2a3e',
    borderRadius: '4px',
    padding: '8px 10px',
    marginBottom: '8px',
  } as React.CSSProperties,
  taskRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 0',
    fontSize: '11px',
  } as React.CSSProperties,
  label: {
    color: '#888',
  } as React.CSSProperties,
  value: {
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '11px',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    background: color + '22',
    color,
    border: `1px solid ${color}44`,
  } as React.CSSProperties),
  actionBtn: (color: string) => ({
    background: color + '22',
    color,
    border: `1px solid ${color}44`,
    padding: '3px 10px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
  } as React.CSSProperties),
  scoreBar: (pct: number, color: string) => ({
    height: '4px',
    borderRadius: '2px',
    background: '#333',
    position: 'relative' as const,
    overflow: 'hidden' as const,
    marginTop: '2px',
  } as React.CSSProperties),
  scoreFill: (pct: number, color: string) => ({
    position: 'absolute' as const,
    left: 0,
    top: 0,
    height: '100%',
    width: `${Math.min(100, pct)}%`,
    background: color,
    borderRadius: '2px',
  } as React.CSSProperties),
};

function ScoreRow({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = value * 100;
  return (
    <div style={{ marginBottom: '3px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
        <span style={{ color: '#777' }}>{label}</span>
        <span style={{ color: '#aaa', fontFamily: 'monospace' }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={styles.scoreBar(pct, color)}>
        <div style={styles.scoreFill(pct, color)} />
      </div>
    </div>
  );
}

export function TaskPanel() {
  const tasks = useTaskStore(s => s.tasks);
  const activeCues = useTaskStore(s => s.activeCues);
  const approveTask = useTaskStore(s => s.approveTask);
  const rejectTask = useTaskStore(s => s.rejectTask);
  const selectTrack = useUiStore(s => s.selectTrack);

  const activeTasks = tasks.filter(t => t.status === 'executing' || t.status === 'proposed');
  const recentTasks = tasks.filter(t => t.status !== 'executing' && t.status !== 'proposed');

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>EO Tasks</h3>
        <span style={{ fontSize: '11px', color: '#888' }}>
          {activeCues.length} cues | {activeTasks.length} active
        </span>
      </div>

      {/* Active tasks */}
      <div style={{ marginBottom: '16px' }}>
        <div style={styles.sectionTitle}>Active Tasks</div>
        {activeTasks.length === 0 ? (
          <p style={{ color: '#555', fontSize: '11px', textAlign: 'center', padding: '8px 0' }}>
            No active tasks
          </p>
        ) : (
          activeTasks.map(task => (
            <div key={task.taskId as string} style={styles.taskCard}>
              <div style={styles.taskRow}>
                <span style={styles.label}>Track</span>
                <span
                  style={{ ...styles.value, color: '#4a9eff', cursor: 'pointer' }}
                  onClick={() => selectTrack(task.systemTrackId as string)}
                >
                  {(task.systemTrackId as string).slice(0, 8)}
                </span>
              </div>
              <div style={styles.taskRow}>
                <span style={styles.label}>Sensor</span>
                <span style={styles.value}>{task.sensorId as string}</span>
              </div>
              <div style={styles.taskRow}>
                <span style={styles.label}>Status</span>
                <span style={styles.badge(statusColors[task.status] ?? '#888')}>
                  {task.status}
                </span>
              </div>
              <div style={styles.taskRow}>
                <span style={styles.label}>Policy</span>
                <span style={styles.value}>{task.policyMode}</span>
              </div>

              {/* Score breakdown */}
              {task.scoreBreakdown && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: 600, marginBottom: '2px' }}>
                    SCORE
                  </div>
                  <ScoreRow label="Threat" value={task.scoreBreakdown.threat ?? 0} color="#ff3333" />
                  <ScoreRow label="Uncertainty" value={task.scoreBreakdown.uncertaintyReduction ?? 0} color="#ffcc00" />
                  <ScoreRow label="Geometry" value={task.scoreBreakdown.geometryGain ?? 0} color="#00cc44" />
                </div>
              )}

              {/* Action buttons for proposed tasks */}
              {task.status === 'proposed' && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button
                    style={styles.actionBtn('#00cc44')}
                    onClick={() => approveTask(task.taskId as string)}
                  >
                    Approve
                  </button>
                  <button
                    style={styles.actionBtn('#ff3333')}
                    onClick={() => rejectTask(task.taskId as string)}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Recent completed tasks */}
      {recentTasks.length > 0 && (
        <div>
          <div style={styles.sectionTitle}>Recent</div>
          {recentTasks.slice(0, 5).map(task => (
            <div key={task.taskId as string} style={{ ...styles.taskCard, opacity: 0.6 }}>
              <div style={styles.taskRow}>
                <span style={styles.label}>Track</span>
                <span style={styles.value}>{(task.systemTrackId as string).slice(0, 8)}</span>
              </div>
              <div style={styles.taskRow}>
                <span style={styles.label}>Status</span>
                <span style={styles.badge(statusColors[task.status] ?? '#888')}>
                  {task.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
