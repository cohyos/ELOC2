import React from 'react';
import { useEditorStore, ZONE_TYPE_LABELS } from '../stores/editor-store';
import type { ZoneType } from '@eloc2/domain';

const colors = {
  panelBg: '#141425',
  border: '#2a2a3e',
  accent: '#4a9eff',
  textDim: '#888',
};

const ZONE_BUTTON_CONFIG: Array<{
  type: ZoneType;
  color: string;
  tooltip: string;
}> = [
  {
    type: 'threat_corridor',
    color: '#ff3232',
    tooltip: 'Threat Corridor — Deployment optimizer prioritizes sensor coverage of this area (20% scoring weight)',
  },
  {
    type: 'exclusion',
    color: '#ff0000',
    tooltip: 'Exclusion Zone — Sensors cannot be placed inside this area during deployment optimization',
  },
  {
    type: 'engagement',
    color: '#00c864',
    tooltip: 'Engagement Zone — Marks the primary engagement area on the map (visual reference)',
  },
  {
    type: 'safe_passage',
    color: '#0096ff',
    tooltip: 'Safe Passage — Marks safe transit corridors on the map (visual reference)',
  },
];

export function ZoneTab() {
  const operationalZones = useEditorStore((s) => s.operationalZones);
  const editMode = useEditorStore((s) => s.editMode);
  const zoneDrawMode = useEditorStore((s) => s.zoneDrawMode);

  return (
    <div style={{ padding: '8px 12px', fontSize: '12px' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontWeight: 700, fontSize: '11px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>
          Draw Zone
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {ZONE_BUTTON_CONFIG.map(({ type, color, tooltip }) => {
            const isActive = editMode === 'draw-zone' && zoneDrawMode === type;
            return (
              <button
                key={type}
                onClick={() => {
                  if (isActive) {
                    useEditorStore.getState().cancelZoneDraw();
                  } else {
                    useEditorStore.getState().startZoneDraw(type);
                  }
                }}
                title={tooltip}
                style={{
                  background: isActive ? `${color}33` : '#1a1a2ecc',
                  color,
                  border: `1px solid ${isActive ? color : `${color}66`}`,
                  borderRadius: '3px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + {ZONE_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
        {editMode === 'draw-zone' && (
          <div style={{ marginTop: '6px', color: '#ffcc00', fontSize: '10px' }}>
            Click map to place vertices (min 3). Press ESC to cancel.
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 700, fontSize: '11px', color: colors.textDim, textTransform: 'uppercase' }}>
            Zones ({operationalZones.length})
          </span>
          {operationalZones.length > 0 && (
            <button
              onClick={() => useEditorStore.getState().clearZones()}
              title="Remove all zones"
              style={{
                background: 'transparent',
                color: '#ff4444',
                border: '1px solid #ff444444',
                borderRadius: '3px',
                padding: '2px 8px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              Clear All
            </button>
          )}
        </div>

        {operationalZones.length === 0 && (
          <div style={{ color: colors.textDim, fontSize: '11px', fontStyle: 'italic', padding: '8px 0' }}>
            No zones defined. Use the buttons above to draw zones on the map.
          </div>
        )}

        {operationalZones.map((zone) => {
          const btnCfg = ZONE_BUTTON_CONFIG.find((b) => b.type === zone.zoneType);
          const zoneColor = zone.color ?? btnCfg?.color ?? '#888';
          return (
            <div
              key={zone.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 8px',
                marginBottom: '4px',
                background: '#1a1a2e',
                borderRadius: '4px',
                borderLeft: `3px solid ${zoneColor}`,
              }}
            >
              {/* Type badge */}
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: zoneColor,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  minWidth: '50px',
                }}
                title={btnCfg?.tooltip}
              >
                {ZONE_TYPE_LABELS[zone.zoneType] || zone.zoneType}
              </span>

              {/* Editable name */}
              <input
                type="text"
                value={zone.name}
                onChange={(e) => useEditorStore.getState().updateZone(zone.id, { name: e.target.value })}
                style={{
                  flex: 1,
                  background: '#0d0d1a',
                  color: '#e0e0e0',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '3px',
                  padding: '3px 6px',
                  fontSize: '11px',
                  fontFamily: 'system-ui',
                  outline: 'none',
                  minWidth: 0,
                }}
                placeholder="Zone name..."
              />

              {/* Vertex count */}
              <span style={{ color: colors.textDim, fontSize: '9px', whiteSpace: 'nowrap' }}>
                {zone.polygon.length}pt
              </span>

              {/* Delete button */}
              <button
                onClick={() => useEditorStore.getState().removeZone(zone.id)}
                title="Delete zone"
                style={{
                  background: 'transparent',
                  color: '#ff4444',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 2px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Help section */}
      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '10px', marginTop: '12px' }}>
        <div style={{ fontWeight: 700, fontSize: '11px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>
          Zone Effects
        </div>
        <div style={{ fontSize: '10px', color: colors.textDim, lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: '#ff3232' }}>Threat Corridor</b> — Optimizer prioritizes coverage here (20% weight)</p>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: '#ff0000' }}>Exclusion</b> — Sensors cannot be placed inside</p>
          <p style={{ margin: '0 0 4px' }}><b style={{ color: '#00c864' }}>Engagement</b> — Visual reference only</p>
          <p style={{ margin: '0 0 0' }}><b style={{ color: '#0096ff' }}>Safe Passage</b> — Visual reference only</p>
        </div>
      </div>
    </div>
  );
}
