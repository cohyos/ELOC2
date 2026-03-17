import React, { useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import type { EditorTarget, EditorWaypoint } from '../stores/editor-store';
import { WaypointRow } from './WaypointRow';

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
  targetItem: (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    background: selected ? '#2a2a4e' : '#1a1a2e',
    border: `1px solid ${selected ? '#ff8800' : '#2a2a3e'}`,
    borderRadius: '4px',
    marginBottom: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  }),
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#ff8800',
    flexShrink: 0,
  } as React.CSSProperties,
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
    minWidth: '70px',
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
  waypointAddBtn: (active: boolean): React.CSSProperties => ({
    background: active ? '#ffcc0022' : '#333',
    color: active ? '#ffcc00' : '#aaa',
    border: `1px dashed ${active ? '#ffcc0066' : '#555'}`,
    padding: '4px 8px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
    width: '100%',
    marginTop: '4px',
  }),
  waypointHeader: {
    display: 'grid',
    gridTemplateColumns: '24px 72px 72px 60px 60px 60px 24px',
    gap: '2px',
    padding: '2px 0',
    fontSize: '9px',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    textAlign: 'center' as const,
    borderBottom: '1px solid #333',
    marginBottom: '2px',
  } as React.CSSProperties,
};

function TargetForm({ target }: { target: EditorTarget }) {
  const updateTarget = useEditorStore((s) => s.updateTarget);
  const removeTarget = useEditorStore((s) => s.removeTarget);
  const updateWaypoint = useEditorStore((s) => s.updateWaypoint);
  const removeWaypoint = useEditorStore((s) => s.removeWaypoint);
  const editMode = useEditorStore((s) => s.editMode);
  const activeTargetId = useEditorStore((s) => s.activeTargetId);
  const setEditMode = useEditorStore((s) => s.setEditMode);
  const setActiveTargetId = useEditorStore((s) => s.setActiveTargetId);

  const isPlacing = editMode === 'place-waypoint' && activeTargetId === target.id;

  const handleAddWaypoint = useCallback(() => {
    setActiveTargetId(target.id);
    setEditMode('place-waypoint');
  }, [target.id, setActiveTargetId, setEditMode]);

  const handleDelete = useCallback(() => {
    if (confirm('Delete this target and all its waypoints?')) {
      removeTarget(target.id);
    }
  }, [target.id, removeTarget]);

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={styles.sectionTitle}>Target Configuration</div>

      {/* Target ID */}
      <div style={styles.formRow}>
        <span style={styles.label}>ID</span>
        <input
          type="text"
          value={target.id}
          onChange={(e) => updateTarget(target.id, { id: e.target.value })}
          style={styles.input}
        />
      </div>

      {/* Label */}
      <div style={styles.formRow}>
        <span style={styles.label}>Label</span>
        <input
          type="text"
          value={target.label}
          onChange={(e) => updateTarget(target.id, { label: e.target.value })}
          style={styles.input}
          placeholder="Display name"
        />
      </div>

      {/* RCS */}
      <div style={styles.formRow}>
        <span style={styles.label}>RCS (m2)</span>
        <input
          type="number"
          value={target.rcs}
          onChange={(e) => updateTarget(target.id, { rcs: parseFloat(e.target.value) || 1 })}
          step={0.5}
          min={0.1}
          max={100}
          style={styles.input}
        />
      </div>

      {/* Waypoints section */}
      <div style={{ ...styles.sectionTitle, marginTop: '10px' }}>
        Waypoints ({target.waypoints.length})
      </div>

      {target.waypoints.length > 0 && (
        <>
          <div style={styles.waypointHeader}>
            <span>#</span>
            <span>Lat</span>
            <span>Lon</span>
            <span>Alt(m)</span>
            <span>Spd(m/s)</span>
            <span>Arr(s)</span>
            <span />
          </div>
          {target.waypoints.map((wp, i) => (
            <WaypointRow
              key={i}
              index={i}
              waypoint={wp}
              isLatest={i === target.waypoints.length - 1}
              onUpdate={(updates) => updateWaypoint(target.id, i, updates)}
              onDelete={() => removeWaypoint(target.id, i)}
            />
          ))}
        </>
      )}

      {target.waypoints.length === 0 && (
        <div style={{ color: '#555', fontSize: '10px', textAlign: 'center', padding: '8px 0' }}>
          No waypoints. Click below to place on map.
        </div>
      )}

      <button
        style={styles.waypointAddBtn(isPlacing)}
        onClick={handleAddWaypoint}
      >
        {isPlacing ? 'Click map to place waypoint...' : '+ Add Waypoint on Map'}
      </button>

      <button style={styles.deleteBtn} onClick={handleDelete}>
        Delete Target
      </button>
    </div>
  );
}

export function TargetTab() {
  const targets = useEditorStore((s) => s.targets);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const selectedItemType = useEditorStore((s) => s.selectedItemType);
  const selectItem = useEditorStore((s) => s.selectItem);
  const addTarget = useEditorStore((s) => s.addTarget);
  const setActiveTargetId = useEditorStore((s) => s.setActiveTargetId);

  const selectedTarget =
    selectedItemType === 'target'
      ? targets.find((t) => t.id === selectedItemId) ?? null
      : null;

  const handleAddTarget = useCallback(() => {
    const id = `TGT-${(targets.length + 1).toString().padStart(3, '0')}`;
    const newTarget: EditorTarget = {
      id,
      label: '',
      rcs: 5,
      waypoints: [],
    };
    addTarget(newTarget);
    selectItem('target', id);
    setActiveTargetId(id);
  }, [targets.length, addTarget, selectItem, setActiveTargetId]);

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
          Targets ({targets.length})
        </span>
      </div>

      <button style={styles.addBtn} onClick={handleAddTarget}>
        + Add Target
      </button>

      {/* Target list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '8px',
          minHeight: 0,
        }}
      >
        {targets.length === 0 ? (
          <p
            style={{
              color: '#555',
              fontSize: '11px',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No targets defined. Click "Add Target" to create one.
          </p>
        ) : (
          targets.map((t) => {
            const isSelected =
              selectedItemType === 'target' && selectedItemId === t.id;
            return (
              <div
                key={t.id}
                style={styles.targetItem(isSelected)}
                onClick={() => {
                  selectItem('target', t.id);
                  setActiveTargetId(t.id);
                }}
              >
                <div style={styles.dot} />
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
                    {t.label || t.id}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {t.waypoints.length} waypoint{t.waypoints.length !== 1 ? 's' : ''} | RCS {t.rcs} m2
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Configuration form for selected target */}
      {selectedTarget && <TargetForm target={selectedTarget} />}
    </div>
  );
}
