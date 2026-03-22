import React, { useEffect } from 'react';
import { EditorHeader } from './EditorHeader';
import { EditorMap } from './EditorMap';
import { SensorTab } from './SensorTab';
import { TargetTab } from './TargetTab';
import { FaultTab } from './FaultTab';
import { ActionTab } from './ActionTab';
import { ZoneTab } from './ZoneTab';
import { SettingsTab } from './SettingsTab';
import { ValidationBar } from './ValidationBar';
import { useEditorStore } from '../stores/editor-store';
import { DeploymentMap } from '../deployment/DeploymentView';
import { DeploymentPanel } from '../deployment/DeploymentPanel';
import { DeploymentMetrics } from '../deployment/DeploymentMetrics';

type TabId = 'sensors' | 'targets' | 'zones' | 'faults' | 'actions' | 'settings' | 'deploy';

const TABS: { id: TabId; label: string }[] = [
  { id: 'sensors', label: 'Sensors' },
  { id: 'targets', label: 'Targets' },
  { id: 'zones', label: 'Zones' },
  { id: 'faults', label: 'Faults' },
  { id: 'actions', label: 'Actions' },
  { id: 'settings', label: 'Settings' },
  { id: 'deploy', label: 'Deploy' },
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
  onLibraries?: () => void;
}


export function ScenarioEditor({ onBack, onLibraries }: ScenarioEditorProps) {
  const [activeTab, setActiveTab] = React.useState<TabId>('sensors');
  const setEditMode = useEditorStore((s) => s.setEditMode);

  // ESC key to cancel placement mode or zone drawing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const state = useEditorStore.getState();
        if (state.editMode === 'draw-zone') {
          state.cancelZoneDraw();
        } else {
          setEditMode('select');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setEditMode]);

  const isDeployTab = activeTab === 'deploy';

  return (
    <div
      style={{
        display: 'grid',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: colors.bg,
        color: '#e0e0e0',
        overflow: 'hidden',
        gridTemplateRows: isDeployTab ? '40px 1fr auto' : '40px 1fr',
        gridTemplateColumns: isDeployTab ? '1fr 320px' : '1fr 400px',
        gridTemplateAreas: isDeployTab
          ? `"header header" "map panel" "metrics metrics"`
          : `"header header" "map panel"`,
      }}
    >
      {/* Header */}
      <div style={{ gridArea: 'header' }}>
        <EditorHeader onBack={onBack} onLibraries={onLibraries} />
      </div>

      {/* Map — swap based on active tab */}
      <div
        style={{
          gridArea: 'map',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {isDeployTab ? <DeploymentMap /> : <EditorMap />}
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
                  activeTab === tab.id
                    ? (tab.id === 'deploy' ? '#44ddaa' : colors.accent)
                    : colors.textDim,
                border: 'none',
                borderBottom:
                  activeTab === tab.id
                    ? `2px solid ${tab.id === 'deploy' ? '#44ddaa' : colors.accent}`
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
          {activeTab === 'targets' && <TargetTab />}
          {activeTab === 'zones' && <ZoneTab />}
          {activeTab === 'faults' && <FaultTab />}
          {activeTab === 'actions' && <ActionTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'deploy' && <DeploymentPanel />}
        </div>

        {/* Validation bar (hide on deploy tab) */}
        {!isDeployTab && <ValidationBar />}
      </div>

      {/* Deployment metrics bar (deploy tab only) */}
      {isDeployTab && (
        <div style={{ gridArea: 'metrics' }}>
          <DeploymentMetrics />
        </div>
      )}
    </div>
  );
}
