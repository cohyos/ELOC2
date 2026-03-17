import React, { useEffect } from 'react';
import { EditorHeader } from './EditorHeader';
import { EditorMap } from './EditorMap';
import { SensorTab } from './SensorTab';
import { useEditorStore } from '../stores/editor-store';

type TabId = 'sensors' | 'targets' | 'faults' | 'actions' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'sensors', label: 'Sensors' },
  { id: 'targets', label: 'Targets' },
  { id: 'faults', label: 'Faults' },
  { id: 'actions', label: 'Actions' },
  { id: 'settings', label: 'Settings' },
];

const colors = {
  bg: '#0d0d1a',
  panelBg: '#141425',
  border: '#2a2a3e',
  accent: '#4a9eff',
  textDim: '#888',
};

interface ScenarioEditorProps {
  onBack: () => void;
}

function ComingSoonPlaceholder({ tabName }: { tabName: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#555',
        fontSize: '13px',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <span style={{ fontSize: '24px', opacity: 0.3 }}>&#9881;</span>
      <span>{tabName} — Coming soon</span>
    </div>
  );
}

function SettingsTab() {
  const description = useEditorStore((s) => s.description);
  const duration = useEditorStore((s) => s.duration);
  const policyMode = useEditorStore((s) => s.policyMode);
  const setDescription = useEditorStore((s) => s.setDescription);
  const setDuration = useEditorStore((s) => s.setDuration);
  const setPolicyMode = useEditorStore((s) => s.setPolicyMode);
  const validationResult = useEditorStore((s) => s.validationResult);

  const formRow: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    fontSize: '12px',
  };
  const label: React.CSSProperties = {
    color: '#888',
    fontSize: '11px',
    minWidth: '90px',
  };
  const input: React.CSSProperties = {
    background: '#222',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '3px',
    padding: '3px 6px',
    fontSize: '11px',
    width: '200px',
    fontFamily: '"Fira Code", "Consolas", monospace',
  };

  return (
    <div style={{ padding: '12px', color: '#e0e0e0', fontSize: '13px' }}>
      <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
        Settings
      </span>

      <div style={{ marginTop: '12px' }}>
        <div style={formRow}>
          <span style={label}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              ...input,
              height: '60px',
              resize: 'vertical',
              fontFamily: 'system-ui, sans-serif',
            }}
          />
        </div>
        <div style={formRow}>
          <span style={label}>Duration (s)</span>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 900)}
            style={input}
            min={60}
            max={7200}
            step={60}
          />
        </div>
        <div style={formRow}>
          <span style={label}>Policy Mode</span>
          <select
            value={policyMode}
            onChange={(e) =>
              setPolicyMode(
                e.target.value as
                  | 'recommended_only'
                  | 'auto_with_veto'
                  | 'manual'
              )
            }
            style={{
              ...input,
              cursor: 'pointer',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            <option value="recommended_only">Recommended Only</option>
            <option value="auto_with_veto">Auto with Veto</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      {/* Validation results */}
      {validationResult && (
        <div style={{ marginTop: '16px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '6px',
              borderBottom: '1px solid #333',
              paddingBottom: '3px',
            }}
          >
            Validation Results
          </div>
          {validationResult.errors.map((err, i) => (
            <div
              key={`err-${i}`}
              style={{
                color: '#ff3333',
                fontSize: '11px',
                padding: '2px 0',
              }}
            >
              Error: {err}
            </div>
          ))}
          {validationResult.warnings.map((warn, i) => (
            <div
              key={`warn-${i}`}
              style={{
                color: '#ffcc00',
                fontSize: '11px',
                padding: '2px 0',
              }}
            >
              Warning: {warn}
            </div>
          ))}
          {validationResult.errors.length === 0 &&
            validationResult.warnings.length === 0 && (
              <div style={{ color: '#00cc44', fontSize: '11px' }}>
                Scenario is valid.
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export function ScenarioEditor({ onBack }: ScenarioEditorProps) {
  const [activeTab, setActiveTab] = React.useState<TabId>('sensors');
  const setEditMode = useEditorStore((s) => s.setEditMode);

  // ESC key to cancel placement mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditMode('select');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setEditMode]);

  return (
    <div
      style={{
        display: 'grid',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: colors.bg,
        color: '#e0e0e0',
        overflow: 'hidden',
        gridTemplateRows: '40px 1fr',
        gridTemplateColumns: '1fr 400px',
        gridTemplateAreas: `"header header" "map panel"`,
      }}
    >
      {/* Header */}
      <div style={{ gridArea: 'header' }}>
        <EditorHeader onBack={onBack} />
      </div>

      {/* Map */}
      <div
        style={{
          gridArea: 'map',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <EditorMap />
      </div>

      {/* Right Panel */}
      <div
        style={{
          gridArea: 'panel',
          background: colors.panelBg,
          borderLeft: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Tab navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${colors.border}`,
            flexShrink: 0,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                background:
                  activeTab === tab.id ? '#1a1a2e' : 'transparent',
                color:
                  activeTab === tab.id ? colors.accent : colors.textDim,
                border: 'none',
                borderBottom:
                  activeTab === tab.id
                    ? `2px solid ${colors.accent}`
                    : '2px solid transparent',
                padding: '8px 4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {activeTab === 'sensors' && <SensorTab />}
          {activeTab === 'targets' && (
            <ComingSoonPlaceholder tabName="Targets" />
          )}
          {activeTab === 'faults' && (
            <ComingSoonPlaceholder tabName="Faults" />
          )}
          {activeTab === 'actions' && (
            <ComingSoonPlaceholder tabName="Actions" />
          )}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}
