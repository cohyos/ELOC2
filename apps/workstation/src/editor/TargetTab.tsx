import React, { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import type { EditorTarget, EditorWaypoint } from '../stores/editor-store';
import { WaypointRow } from './WaypointRow';

interface TargetLibraryEntry {
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
  ballisticProperties?: {
    rangeKm: number;
    apogeeM: number;
    burnTimeSec: number;
    reentrySpeedMs: number;
    defaultLaunchBearingDeg: number;
    defaultImpactBearingDeg: number;
  };
}

const CLASSIFICATION_OPTIONS = [
  'unknown',
  'hostile',
  'friendly',
  'neutral',
  'fighter_aircraft',
  'civilian_aircraft',
  'helicopter',
  'predator',
  'ballistic_missile',
  'cruise_missile',
  'uav',
];

const SYMBOL_OPTIONS = [
  { value: '', label: '(default)' },
  { value: 'SHAPMFM---', label: 'Missile' },
  { value: 'SHAPMFF---', label: 'Fighter' },
  { value: 'SHAPMFH---', label: 'Helicopter' },
  { value: 'SHAPMFU---', label: 'UAV' },
  { value: 'SHAPMC----', label: 'Civilian' },
  { value: 'SNAPMF----', label: 'Unknown Aircraft' },
  { value: 'SFAPMF----', label: 'Friendly Aircraft' },
];

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

function BallisticForm({ target }: { target: EditorTarget }) {
  const updateTarget = useEditorStore((s) => s.updateTarget);
  const editMode = useEditorStore((s) => s.editMode);
  const setEditMode = useEditorStore((s) => s.setEditMode);
  const setActiveTargetId = useEditorStore((s) => s.setActiveTargetId);

  const isPlacing = editMode === 'place-launch-point';

  const handlePlaceLaunch = useCallback(() => {
    setActiveTargetId(target.id);
    setEditMode('place-launch-point');
  }, [target.id, setActiveTargetId, setEditMode]);

  return (
    <div style={{ marginTop: '6px' }}>
      <div style={styles.sectionTitle}>Launch Point</div>

      <button
        style={styles.waypointAddBtn(isPlacing)}
        onClick={handlePlaceLaunch}
      >
        {isPlacing ? 'Click map to set launch point...' : 'Set Launch Point on Map'}
      </button>

      {target.launchLat != null && (
        <>
          <div style={styles.formRow}>
            <span style={styles.label}>Lat</span>
            <input
              type="number"
              value={target.launchLat ?? 0}
              onChange={(e) => updateTarget(target.id, { launchLat: parseFloat(e.target.value) || 0 })}
              step={0.001}
              style={styles.input}
            />
          </div>
          <div style={styles.formRow}>
            <span style={styles.label}>Lon</span>
            <input
              type="number"
              value={target.launchLon ?? 0}
              onChange={(e) => updateTarget(target.id, { launchLon: parseFloat(e.target.value) || 0 })}
              step={0.001}
              style={styles.input}
            />
          </div>
          <div style={styles.formRow}>
            <span style={styles.label}>Elev (m)</span>
            <span style={{ ...styles.input, border: 'none', background: 'none', color: '#aaa' }}>
              {target.launchAlt ?? 0}
            </span>
          </div>
        </>
      )}

      <div style={{ ...styles.sectionTitle, marginTop: '8px' }}>Trajectory</div>
      <div style={styles.formRow}>
        <span style={styles.label}>Bearing (°)</span>
        <input
          type="number"
          value={target.launchBearingDeg ?? 0}
          onChange={(e) => updateTarget(target.id, { launchBearingDeg: parseFloat(e.target.value) || 0 })}
          step={1}
          min={0}
          max={360}
          style={styles.input}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Range (km)</span>
        <input
          type="number"
          value={target.ballisticRangeKm ?? 0}
          onChange={(e) => updateTarget(target.id, { ballisticRangeKm: parseFloat(e.target.value) || 0 })}
          step={10}
          min={0}
          style={styles.input}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Apogee (m)</span>
        <input
          type="number"
          value={target.ballisticApogeeM ?? 0}
          onChange={(e) => updateTarget(target.id, { ballisticApogeeM: parseFloat(e.target.value) || 0 })}
          step={1000}
          min={0}
          style={styles.input}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Burn (s)</span>
        <input
          type="number"
          value={target.ballisticBurnTimeSec ?? 0}
          onChange={(e) => updateTarget(target.id, { ballisticBurnTimeSec: parseFloat(e.target.value) || 0 })}
          step={1}
          min={0}
          style={styles.input}
        />
      </div>
      <div style={styles.formRow}>
        <span style={styles.label}>Re-entry (m/s)</span>
        <input
          type="number"
          value={target.ballisticReentrySpeedMs ?? 0}
          onChange={(e) => updateTarget(target.id, { ballisticReentrySpeedMs: parseFloat(e.target.value) || 0 })}
          step={100}
          min={0}
          style={styles.input}
        />
      </div>

      {/* Computed impact point */}
      {target.impactLat != null && target.impactLon != null && (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: '8px' }}>Impact Point (computed)</div>
          <div style={styles.formRow}>
            <span style={styles.label}>Lat</span>
            <span style={{ fontSize: '11px', color: '#ff6666', fontFamily: 'monospace' }}>
              {target.impactLat.toFixed(4)}
            </span>
          </div>
          <div style={styles.formRow}>
            <span style={styles.label}>Lon</span>
            <span style={{ fontSize: '11px', color: '#ff6666', fontFamily: 'monospace' }}>
              {target.impactLon.toFixed(4)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function TargetForm({ target, targetLibrary }: { target: EditorTarget; targetLibrary: TargetLibraryEntry[] }) {
  const updateTarget = useEditorStore((s) => s.updateTarget);
  const removeTarget = useEditorStore((s) => s.removeTarget);
  const updateWaypoint = useEditorStore((s) => s.updateWaypoint);
  const removeWaypoint = useEditorStore((s) => s.removeWaypoint);
  const editMode = useEditorStore((s) => s.editMode);
  const activeTargetId = useEditorStore((s) => s.activeTargetId);
  const setEditMode = useEditorStore((s) => s.setEditMode);
  const setActiveTargetId = useEditorStore((s) => s.setActiveTargetId);

  const isBallistic = target.classification === 'ballistic_missile';
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

  const handleLibrarySelect = useCallback(
    (libraryId: string) => {
      const entry = targetLibrary.find((e) => e.id === libraryId);
      if (!entry) return;
      const updates: Partial<EditorTarget> = {
        libraryId,
        rcs: entry.rcs,
        irEmission: entry.irEmission,
        classification: entry.classification || 'unknown',
        nickname: target.nickname || entry.name,
        label: target.label || entry.name,
        symbol: entry.symbol || '',
      };
      // Auto-fill ballistic properties if available
      if (entry.ballisticProperties) {
        updates.ballisticRangeKm = entry.ballisticProperties.rangeKm;
        updates.ballisticApogeeM = entry.ballisticProperties.apogeeM;
        updates.ballisticBurnTimeSec = entry.ballisticProperties.burnTimeSec;
        updates.ballisticReentrySpeedMs = entry.ballisticProperties.reentrySpeedMs;
        updates.launchBearingDeg = entry.ballisticProperties.defaultLaunchBearingDeg;
      }
      updateTarget(target.id, updates);
      // For non-ballistic: update existing waypoints with altitude/speed
      if (!entry.ballisticProperties) {
        for (let i = 0; i < target.waypoints.length; i++) {
          updateWaypoint(target.id, i, {
            alt: entry.altitudeM,
            speedMs: entry.speedMs,
          });
        }
      }
    },
    [target.id, target.label, target.nickname, target.waypoints.length, targetLibrary, updateTarget, updateWaypoint]
  );

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={styles.sectionTitle}>Target Configuration</div>

      {/* From Library */}
      {targetLibrary.length > 0 && (
        <div style={styles.formRow}>
          <span style={styles.label}>From Library</span>
          <select
            value={target.libraryId || ''}
            onChange={(e) => handleLibrarySelect(e.target.value)}
            style={styles.select}
          >
            <option value="">-- Select --</option>
            {targetLibrary.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {/* Nickname */}
      <div style={styles.formRow}>
        <span style={styles.label}>Nickname</span>
        <input
          type="text"
          value={target.nickname || ''}
          onChange={(e) => updateTarget(target.id, { nickname: e.target.value })}
          style={styles.input}
          placeholder="Optional nickname"
        />
      </div>

      {/* Symbol */}
      <div style={styles.formRow}>
        <span style={styles.label}>Symbol</span>
        <select
          value={target.symbol || ''}
          onChange={(e) => updateTarget(target.id, { symbol: e.target.value })}
          style={styles.select}
        >
          {SYMBOL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* RCS */}
      <div style={styles.formRow}>
        <span style={styles.label}>RCS (m2)</span>
        <input
          type="number"
          value={target.rcs}
          onChange={(e) => updateTarget(target.id, { rcs: parseFloat(e.target.value) || 1 })}
          step={0.5}
          min={0.01}
          style={styles.input}
        />
      </div>

      {/* IR Emission */}
      <div style={styles.formRow}>
        <span style={styles.label}>IR (W/sr)</span>
        <input
          type="number"
          value={target.irEmission ?? 0}
          onChange={(e) => updateTarget(target.id, { irEmission: parseFloat(e.target.value) || 0 })}
          step={100}
          min={0}
          style={styles.input}
        />
      </div>

      {/* Classification */}
      <div style={styles.formRow}>
        <span style={styles.label}>Class</span>
        <select
          value={target.classification || 'unknown'}
          onChange={(e) => updateTarget(target.id, { classification: e.target.value })}
          style={styles.select}
        >
          {CLASSIFICATION_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Ballistic missile UI OR Waypoints UI */}
      {isBallistic ? (
        <BallisticForm target={target} />
      ) : (
        <>
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
        </>
      )}

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
  const [targetLibrary, setTargetLibrary] = useState<TargetLibraryEntry[]>([]);

  // Fetch target library on mount
  useEffect(() => {
    fetch('/api/targets/library')
      .then((r) => r.json())
      .then((data) => {
        setTargetLibrary(data?.targets || []);
      })
      .catch(() => { /* ignore */ });
  }, []);

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
            const isBallistic = t.classification === 'ballistic_missile';
            return (
              <div
                key={t.id}
                style={styles.targetItem(isSelected)}
                onClick={() => {
                  selectItem('target', t.id);
                  setActiveTargetId(t.id);
                }}
              >
                <div style={{
                  ...styles.dot,
                  background: isBallistic ? '#ff3333' : '#ff8800',
                }} />
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
                    {t.nickname || t.label || t.id}
                  </div>
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {isBallistic
                      ? `BM | Range ${t.ballisticRangeKm ?? '?'}km | RCS ${t.rcs} m2`
                      : `${t.waypoints.length} wp${t.waypoints.length !== 1 ? 's' : ''} | RCS ${t.rcs} m2`}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Configuration form for selected target */}
      {selectedTarget && <TargetForm target={selectedTarget} targetLibrary={targetLibrary} />}
    </div>
  );
}
