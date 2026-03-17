import React from 'react';
import { useDemoStore } from '../stores/demo-store';
import { useTrackStore } from '../stores/track-store';
import { useTaskStore } from '../stores/task-store';

interface MetricRow {
  label: string;
  value: number;
  color: string;
}

export function MetricsOverlay() {
  const active = useDemoStore((s) => s.active);
  const confirmedCount = useTrackStore((s) => s.confirmedCount);
  const activeCues = useTaskStore((s) => s.activeCues);
  const geometryEstimates = useTaskStore((s) => s.geometryEstimates);
  const registrationStates = useTaskStore((s) => s.registrationStates);
  const tasks = useTaskStore((s) => s.tasks);

  if (!active) return null;

  const faultsHandled = registrationStates.filter((r) => !r.fusionSafe).length;
  const investigationsActive = tasks.filter(
    (t) => t.status === 'executing' || t.status === 'proposed',
  ).length;

  const metrics: MetricRow[] = [
    { label: 'Confirmed Tracks', value: confirmedCount, color: '#00cc44' },
    { label: 'EO Cues Issued', value: activeCues.length, color: '#ff8800' },
    { label: 'Geometry Estimates', value: geometryEstimates.length, color: '#4a9eff' },
    { label: 'Faults Handled', value: faultsHandled, color: '#ff3333' },
    { label: 'Investigations Active', value: investigationsActive, color: '#ffcc00' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '48px',
        right: '16px',
        width: '250px',
        background: 'rgba(20, 20, 37, 0.9)',
        border: '1px solid #2a2a3e',
        borderRadius: '6px',
        padding: '12px 14px',
        zIndex: 7500,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px',
          borderBottom: '1px solid #333',
          paddingBottom: '4px',
        }}
      >
        Live Metrics
      </div>
      {metrics.map((m) => (
        <div
          key={m.label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '3px 0',
          }}
        >
          <span style={{ fontSize: '12px', color: '#aaa' }}>{m.label}</span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: '"Fira Code", "Consolas", monospace',
              color: m.color,
              minWidth: '30px',
              textAlign: 'right',
            }}
          >
            {m.value}
          </span>
        </div>
      ))}
    </div>
  );
}
