import React from 'react';
import { useEditorStore } from '../stores/editor-store';

const POLICY_HELP: Record<string, string> = {
  recommended_only:
    'System recommends sensor assignments; operator must manually approve each one.',
  auto_with_veto:
    'System automatically assigns sensors; operator can veto individual assignments.',
  manual:
    'No automatic assignments. Operator manually tasks each sensor.',
};

const formRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '6px 0',
  fontSize: '12px',
};
const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '11px',
  minWidth: '100px',
  paddingTop: '3px',
};
const inputStyle: React.CSSProperties = {
  background: '#222',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: '3px',
  padding: '4px 8px',
  fontSize: '12px',
  width: '220px',
  fontFamily: 'system-ui, sans-serif',
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SettingsTab() {
  const scenarioName = useEditorStore((s) => s.scenarioName);
  const description = useEditorStore((s) => s.description);
  const duration = useEditorStore((s) => s.duration);
  const policyMode = useEditorStore((s) => s.policyMode);
  const setScenarioName = useEditorStore((s) => s.setScenarioName);
  const setDescription = useEditorStore((s) => s.setDescription);
  const setDuration = useEditorStore((s) => s.setDuration);
  const setPolicyMode = useEditorStore((s) => s.setPolicyMode);

  return (
    <div style={{ padding: '12px', color: '#e0e0e0', fontSize: '13px' }}>
      <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
        Settings
      </span>

      <div style={{ marginTop: '12px' }}>
        {/* Scenario Name */}
        <div style={formRow}>
          <span style={labelStyle}>Name *</span>
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario name (required)"
            style={{ ...inputStyle, fontWeight: 600 }}
          />
        </div>

        {/* Description */}
        <div style={formRow}>
          <span style={labelStyle}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional description..."
            style={{
              ...inputStyle,
              height: '60px',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Duration */}
        <div style={formRow}>
          <span style={labelStyle}>Duration</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="range"
                min={30}
                max={3600}
                step={30}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                style={{ width: '140px' }}
              />
              <span
                style={{
                  fontSize: '12px',
                  color: '#4a9eff',
                  fontFamily: '"Fira Code", "Consolas", monospace',
                  minWidth: '50px',
                }}
              >
                {formatDuration(duration)}
              </span>
            </div>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
              min={30}
              max={3600}
              step={30}
              style={{ ...inputStyle, width: '100px', fontSize: '11px' }}
            />
          </div>
        </div>

        {/* Policy Mode */}
        <div style={formRow}>
          <span style={labelStyle}>Policy Mode</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <select
              value={policyMode}
              onChange={(e) =>
                setPolicyMode(
                  e.target.value as 'recommended_only' | 'auto_with_veto' | 'manual'
                )
              }
              style={{
                ...inputStyle,
                cursor: 'pointer',
                width: '220px',
              }}
            >
              <option value="recommended_only">Recommended Only</option>
              <option value="auto_with_veto">Auto with Veto</option>
              <option value="manual">Manual</option>
            </select>
            <div
              style={{
                fontSize: '10px',
                color: '#666',
                maxWidth: '220px',
                lineHeight: '1.4',
                marginTop: '2px',
              }}
            >
              {POLICY_HELP[policyMode]}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
