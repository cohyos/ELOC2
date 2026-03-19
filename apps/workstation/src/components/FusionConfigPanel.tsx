import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useUiStore } from '../stores/ui-store';

const sectionTitle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px',
  borderBottom: '1px solid #333',
  paddingBottom: '3px',
};

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
};

const sliderStyle: React.CSSProperties = {
  width: '100%',
  height: '4px',
  appearance: 'none' as const,
  background: '#333',
  borderRadius: '2px',
  outline: 'none',
  cursor: 'pointer',
  accentColor: '#4a9eff',
};

export function FusionConfigPanel() {
  const fusionConfig = useUiStore(s => s.fusionConfig);
  const setFusionConfig = useUiStore(s => s.setFusionConfig);

  const [localGate, setLocalGate] = useState(fusionConfig.gateThreshold);
  const [localMerge, setLocalMerge] = useState(fusionConfig.mergeDistanceM);

  // Sync from store when it changes externally
  useEffect(() => {
    setLocalGate(fusionConfig.gateThreshold);
    setLocalMerge(fusionConfig.mergeDistanceM);
  }, [fusionConfig.gateThreshold, fusionConfig.mergeDistanceM]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const postConfig = useCallback((config: { gateThreshold: number; mergeDistanceM: number }) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/fusion/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        if (res.ok) {
          const data = await res.json();
          setFusionConfig(data);
        }
      } catch {
        // ignore network errors
      }
    }, 300);
  }, [setFusionConfig]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleGateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalGate(val);
    postConfig({ gateThreshold: val, mergeDistanceM: localMerge });
  }, [localMerge, postConfig]);

  const handleMergeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLocalMerge(val);
    postConfig({ gateThreshold: localGate, mergeDistanceM: val });
  }, [localGate, postConfig]);

  return (
    <div style={{ padding: '12px', color: '#e0e0e0', fontSize: '13px' }}>
      <div style={sectionTitle}>Fusion Config</div>

      <div style={{ marginBottom: '12px' }}>
        <div style={row}>
          <span style={{ color: '#888', fontSize: '12px' }}>Gate Threshold</span>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#4a9eff' }}>
            {localGate.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={50}
          step={0.5}
          value={localGate}
          onChange={handleGateChange}
          style={sliderStyle}
          title={`Chi-squared gate threshold (default: 16.27)`}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#555', marginTop: '2px' }}>
          <span>1 (tight)</span>
          <span>50 (loose)</span>
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={row}>
          <span style={{ color: '#888', fontSize: '12px' }}>Merge Distance</span>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#4a9eff' }}>
            {localMerge.toLocaleString()}m
          </span>
        </div>
        <input
          type="range"
          min={500}
          max={10000}
          step={100}
          value={localMerge}
          onChange={handleMergeChange}
          style={sliderStyle}
          title={`Track merge distance in meters (default: 3000)`}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#555', marginTop: '2px' }}>
          <span>500m</span>
          <span>10,000m</span>
        </div>
      </div>
    </div>
  );
}
