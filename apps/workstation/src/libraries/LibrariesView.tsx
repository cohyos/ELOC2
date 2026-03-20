import React, { useState } from 'react';
import { SensorLibraryPanel } from './SensorLibraryPanel';
import { TargetLibraryPanel } from './TargetLibraryPanel';
import { ScenarioLibraryPanel } from './ScenarioLibraryPanel';

interface Props {
  onBack: () => void;
  onLoadScenario?: (id: string) => void;
  onEditScenario?: (id: string) => void;
}

type Tab = 'sensors' | 'targets' | 'scenarios';

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 16px',
  background: '#0d0d1a',
  borderBottom: '1px solid #2a2a3e',
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  border: 'none',
  borderBottom: active ? '2px solid #4a9eff' : '2px solid transparent',
  background: 'transparent',
  color: active ? '#4a9eff' : '#888',
  fontSize: '13px',
  fontWeight: active ? 700 : 400,
  cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
});

export function LibrariesView({ onBack, onLoadScenario, onEditScenario }: Props) {
  const [tab, setTab] = useState<Tab>('sensors');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d1a', color: '#e0e0e0' }}>
      <div style={headerStyle}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid #2a2a3e',
            borderRadius: '4px',
            color: '#888',
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>Libraries</h2>
        <div style={{ display: 'flex', gap: '4px', marginLeft: '16px' }}>
          <button style={tabStyle(tab === 'sensors')} onClick={() => setTab('sensors')}>Sensor Types</button>
          <button style={tabStyle(tab === 'targets')} onClick={() => setTab('targets')}>Target Types</button>
          <button style={tabStyle(tab === 'scenarios')} onClick={() => setTab('scenarios')}>Scenarios</button>
        </div>
      </div>
      <div style={{ flex: 1, padding: '16px', overflow: 'hidden' }}>
        {tab === 'sensors' && <SensorLibraryPanel />}
        {tab === 'targets' && <TargetLibraryPanel />}
        {tab === 'scenarios' && (
          <ScenarioLibraryPanel
            onLoadScenario={onLoadScenario}
            onEditScenario={onEditScenario}
          />
        )}
      </div>
    </div>
  );
}
