import React, { useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import type { EditorAction } from '../stores/editor-store';

const ACTION_COLORS: Record<string, string> = {
  reserve_sensor: '#4a9eff',
  veto_assignment: '#ff8844',
};

const ACTION_LABELS: Record<string, string> = {
  reserve_sensor: 'Reserve Sensor',
  veto_assignment: 'Veto Assignment',
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
  actionItem: (selected: boolean, color: string): React.CSSProperties => ({
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

function TimelineMarkers({
  actions,
  duration,
}: {
  actions: EditorAction[];
  duration: number;
}) {
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
      {actions.map((a) => {
        const leftPct = duration > 0 ? (a.timeSec / duration) * 100 : 0;
        const color = ACTION_COLORS[a.type] || '#888';
        return (
          <div
            key={a.id}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              width: '3px',
              height: '100%',
              background: color,
              opacity: 0.8,
              transform: 'translateX(-1px)',
            }}
            title={`${ACTION_LABELS[a.type]} @ ${formatTime(a.timeSec)}`}
          />
        );
      })}
    </div>
  );
}

function ActionForm({ action }: { action: EditorAction }) {
  const updateAction = useEditorStore((s) => s.updateAction);
  const removeAction = useEditorStore((s) => s.removeAction);
  const sensors = useEditorStore((s) => s.sensors);
  const targets = useEditorStore((s) => s.targets);
  const duration = useEditorStore((s) => s.duration);

  const update = useCallback(
    (updates: Partial<EditorAction>) => {
      updateAction(action.id, updates);
    },
    [action.id, updateAction]
  );

  const handleDelete = useCallback(() => {
    if (confirm('Delete this action?')) {
      removeAction(action.id);
    }
  }, [action.id, removeAction]);

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={styles.sectionTitle}>Action Configuration</div>

      {/* Type */}
      <div style={styles.formRow}>
        <span style={styles.label}>Action Type</span>
        <select
          value={action.type}
          onChange={(e) =>
            update({ type: e.target.value as EditorAction['type'] })
          }
          style={styles.select}
        >
          <option value="reserve_sensor">Reserve Sensor</option>
          <option value="veto_assignment">Veto Assignment</option>
        </select>
      </div>

      {/* Time */}
      <div style={styles.formRow}>
        <span style={styles.label}>Time (sec)</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={duration}
            value={action.timeSec}
            onChange={(e) => update({ timeSec: parseInt(e.target.value) })}
            style={{ width: '60px' }}
          />
          <input
            type="number"
            value={action.timeSec}
            onChange={(e) => update({ timeSec: parseInt(e.target.value) || 0 })}
            min={0}
            max={duration}
            style={{ ...styles.input, width: '50px' }}
          />
        </div>
      </div>

      {/* Sensor ID — shown for reserve_sensor */}
      {action.type === 'reserve_sensor' && (
        <>
          <div style={styles.formRow}>
            <span style={styles.label}>Sensor</span>
            <select
              value={action.sensorId || ''}
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
          <div style={styles.formRow}>
            <span style={styles.label}>Duration (sec)</span>
            <input
              type="number"
              value={action.durationSec ?? 60}
              onChange={(e) =>
                update({ durationSec: parseInt(e.target.value) || 0 })
              }
              min={1}
              style={styles.input}
            />
          </div>
        </>
      )}

      {/* Target ID — shown for veto_assignment */}
      {action.type === 'veto_assignment' && (
        <div style={styles.formRow}>
          <span style={styles.label}>Target</span>
          <select
            value={action.targetId || ''}
            onChange={(e) => update({ targetId: e.target.value })}
            style={styles.select}
          >
            <option value="">-- Select --</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label || t.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      )}

      <button style={styles.deleteBtn} onClick={handleDelete}>
        Delete Action
      </button>
    </div>
  );
}

export function ActionTab() {
  const actions = useEditorStore((s) => s.actions);
  const sensors = useEditorStore((s) => s.sensors);
  const duration = useEditorStore((s) => s.duration);
  const addAction = useEditorStore((s) => s.addAction);
  const [selectedActionId, setSelectedActionId] = React.useState<string | null>(
    null
  );

  const selectedAction =
    actions.find((a) => a.id === selectedActionId) ?? null;

  const handleAdd = useCallback(() => {
    const newAction: EditorAction = {
      id: crypto.randomUUID(),
      type: 'reserve_sensor',
      timeSec: 0,
      sensorId: sensors.length > 0 ? sensors[0].id : undefined,
      durationSec: 60,
    };
    addAction(newAction);
    setSelectedActionId(newAction.id);
  }, [addAction, sensors]);

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
          Actions ({actions.length})
        </span>
      </div>

      <button style={styles.addBtn} onClick={handleAdd}>
        + Add Action
      </button>

      {/* Action list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '8px',
          minHeight: 0,
        }}
      >
        {actions.length === 0 ? (
          <p
            style={{
              color: '#555',
              fontSize: '11px',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No operator actions defined. Add actions to simulate operator
            decisions.
          </p>
        ) : (
          actions.map((a) => {
            const color = ACTION_COLORS[a.type] || '#888';
            const isSelected = selectedActionId === a.id;
            return (
              <div
                key={a.id}
                style={styles.actionItem(isSelected, color)}
                onClick={() => setSelectedActionId(a.id)}
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
                    {ACTION_LABELS[a.type]}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    @ {formatTime(a.timeSec)}
                    {a.sensorId ? ` | ${a.sensorId.slice(0, 8)}` : ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Timeline preview */}
      {actions.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={styles.sectionTitle}>Timeline</div>
          <TimelineMarkers actions={actions} duration={duration} />
        </div>
      )}

      {selectedAction && <ActionForm action={selectedAction} />}
    </div>
  );
}
