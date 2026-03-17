import React from 'react';
import type { EditorWaypoint } from '../stores/editor-store';

const styles = {
  row: (highlight: boolean): React.CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: '24px 72px 72px 60px 60px 60px 24px',
    gap: '2px',
    alignItems: 'center',
    padding: '2px 0',
    fontSize: '11px',
    background: highlight ? '#2a2a4e' : 'transparent',
    borderRadius: '2px',
  }),
  cell: {
    color: '#ccc',
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '10px',
    textAlign: 'center' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  input: {
    background: '#222',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '2px',
    padding: '1px 3px',
    fontSize: '10px',
    width: '100%',
    fontFamily: '"Fira Code", "Consolas", monospace',
    textAlign: 'right' as const,
    boxSizing: 'border-box' as const,
  },
  inputError: {
    borderColor: '#ff3333',
  },
  deleteBtn: {
    background: 'transparent',
    color: '#ff3333',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '0 2px',
    lineHeight: 1,
    opacity: 0.6,
  } as React.CSSProperties,
};

interface WaypointRowProps {
  index: number;
  waypoint: EditorWaypoint;
  isLatest: boolean;
  onUpdate: (updates: Partial<EditorWaypoint>) => void;
  onDelete: () => void;
}

export function WaypointRow({ index, waypoint, isLatest, onUpdate, onDelete }: WaypointRowProps) {
  const altValid = waypoint.alt >= 0 && waypoint.alt <= 30000;
  const speedValid = waypoint.speedMs >= 0 && waypoint.speedMs <= 1000;

  return (
    <div style={styles.row(isLatest)}>
      {/* Index */}
      <span style={{ ...styles.cell, color: '#666' }}>{index + 1}</span>

      {/* Lat (read-only, set from map) */}
      <span style={styles.cell} title={waypoint.lat.toFixed(6)}>
        {waypoint.lat.toFixed(6)}
      </span>

      {/* Lon (read-only, set from map) */}
      <span style={styles.cell} title={waypoint.lon.toFixed(6)}>
        {waypoint.lon.toFixed(6)}
      </span>

      {/* Alt */}
      <input
        type="number"
        value={waypoint.alt}
        onChange={(e) => onUpdate({ alt: parseFloat(e.target.value) || 0 })}
        min={0}
        max={30000}
        step={100}
        style={{
          ...styles.input,
          ...(altValid ? {} : styles.inputError),
        }}
        title={altValid ? `Altitude: ${waypoint.alt}m` : 'Alt must be 0-30000'}
      />

      {/* Speed */}
      <input
        type="number"
        value={waypoint.speedMs}
        onChange={(e) => onUpdate({ speedMs: parseFloat(e.target.value) || 0 })}
        min={0}
        max={1000}
        step={10}
        style={{
          ...styles.input,
          ...(speedValid ? {} : styles.inputError),
        }}
        title={speedValid ? `Speed: ${waypoint.speedMs} m/s` : 'Speed must be 0-1000'}
      />

      {/* Arrival time */}
      <span style={{ ...styles.cell, color: '#888' }}>
        {waypoint.arrivalTimeSec.toFixed(1)}
      </span>

      {/* Delete */}
      <button style={styles.deleteBtn} onClick={onDelete} title="Delete waypoint">
        &times;
      </button>
    </div>
  );
}
