import React, { useState } from 'react';
import { useUiStore, type LayerVisibility } from '../stores/ui-store';

const LAYER_GROUPS: Array<{
  label: string;
  items: Array<{ key: keyof LayerVisibility; label: string; color: string }>;
}> = [
  {
    label: 'Tracks',
    items: [
      { key: 'tracks', label: 'Track icons', color: '#ffcc00' },
      { key: 'trackLabels', label: 'Track labels', color: '#ffffff' },
      { key: 'trackEllipses', label: 'Uncertainty ellipses', color: '#ffcc00' },
    ],
  },
  {
    label: 'Sensors',
    items: [
      { key: 'sensors', label: 'Sensor icons', color: '#4488ff' },
      { key: 'sensorLabels', label: 'Sensor labels', color: '#4488ff' },
    ],
  },
  {
    label: 'Coverage',
    items: [
      { key: 'radarCoverage', label: 'Radar coverage', color: '#4488ff' },
      { key: 'eoFor', label: 'EO field of regard', color: '#ff8800' },
      { key: 'eoFov', label: 'EO field of view', color: '#ff8800' },
    ],
  },
  {
    label: 'EO',
    items: [
      { key: 'eoRays', label: 'EO gimbal rays', color: '#ff8800' },
      { key: 'triangulation', label: 'Triangulation rays', color: '#00cc44' },
    ],
  },
];

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '10px',
  left: '10px',
  zIndex: 5,
  background: 'rgba(20, 20, 37, 0.92)',
  border: '1px solid #2a2a3e',
  borderRadius: '6px',
  minWidth: '180px',
  fontSize: '12px',
  color: '#e0e0e0',
  userSelect: 'none',
  backdropFilter: 'blur(4px)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  cursor: 'pointer',
  borderBottom: '1px solid #2a2a3e',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  color: '#aaa',
};

const collapsedStyle: React.CSSProperties = {
  ...panelStyle,
  cursor: 'pointer',
  padding: '6px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#aaa',
  letterSpacing: '0.5px',
};

const groupLabelStyle: React.CSSProperties = {
  padding: '5px 10px 2px',
  fontSize: '10px',
  fontWeight: 600,
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 10px',
  cursor: 'pointer',
};

const checkboxStyle = (checked: boolean, color: string): React.CSSProperties => ({
  width: '12px',
  height: '12px',
  borderRadius: '2px',
  border: `1.5px solid ${checked ? color : '#555'}`,
  background: checked ? color : 'transparent',
  flexShrink: 0,
  transition: 'all 0.15s ease',
});

export function LayerFilterPanel() {
  const [expanded, setExpanded] = useState(true);
  const layerVisibility = useUiStore(s => s.layerVisibility);
  const toggleLayer = useUiStore(s => s.toggleLayer);

  if (!expanded) {
    return (
      <div style={collapsedStyle} onClick={() => setExpanded(true)}>
        Layers
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle} onClick={() => setExpanded(false)}>
        <span>LAYERS</span>
        <span style={{ fontSize: '10px', color: '#555' }}>&#x25B2;</span>
      </div>
      <div style={{ padding: '4px 0 6px' }}>
        {LAYER_GROUPS.map(group => (
          <div key={group.label}>
            <div style={groupLabelStyle}>{group.label}</div>
            {group.items.map(item => (
              <div
                key={item.key}
                style={itemStyle}
                onClick={() => toggleLayer(item.key)}
              >
                <div style={checkboxStyle(layerVisibility[item.key], item.color)} />
                <span style={{ opacity: layerVisibility[item.key] ? 1 : 0.5 }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
