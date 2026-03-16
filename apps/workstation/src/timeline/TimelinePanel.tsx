import React, { useState } from 'react';
import { useUiStore, type EventLogEntry } from '../stores/ui-store';
import { useTaskStore } from '../stores/task-store';

const eventTypeColors: Record<string, string> = {
  'system.track.updated': '#00cc44',
  'source.observation.reported': '#4488ff',
  'eo.cue.issued': '#ff8800',
  'eo.report.received': '#ff8800',
  'eo.bearing.measured': '#ffaa33',
  'eo.track.created': '#ff8800',
  'eo.group.created': '#ff6699',
  'registration.state.updated': '#aa44ff',
  'geometry.estimate.updated': '#ffcc00',
  'task.decided': '#ff6699',
  'correlation.decided': '#44ccaa',
  'fault.started': '#ff3333',
  'fault.ended': '#00cc44',
  'scenario.started': '#4a9eff',
  'scenario.paused': '#ffcc00',
  'scenario.completed': '#00cc44',
  'scenario.reset': '#888',
  'scenario.speed_changed': '#888',
  'operator.action': '#aa44ff',
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    color: '#ccc',
    fontSize: '12px',
    fontFamily: 'system-ui, sans-serif',
    padding: '8px 16px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
    flexShrink: 0,
  },
  title: {
    fontWeight: 700,
    fontSize: '13px',
    color: '#fff',
  },
  separator: {
    opacity: 0.3,
  },
  controlBtn: (active: boolean) => ({
    background: active ? '#4a9eff' : '#333',
    color: '#fff',
    border: 'none',
    padding: '2px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: active ? 700 : 400,
  } as React.CSSProperties),
  speedBtn: (active: boolean) => ({
    background: active ? '#4a9eff33' : 'transparent',
    color: active ? '#4a9eff' : '#888',
    border: active ? '1px solid #4a9eff' : '1px solid #444',
    padding: '1px 6px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10px',
  } as React.CSSProperties),
  filterBtn: (active: boolean, color: string) => ({
    background: active ? color + '22' : 'transparent',
    color: active ? color : '#555',
    border: active ? `1px solid ${color}44` : '1px solid #333',
    padding: '2px 8px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: active ? 600 : 400,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties),
  scrubber: {
    background: '#333',
    height: '4px',
    borderRadius: '2px',
    marginBottom: '6px',
    position: 'relative' as const,
    flexShrink: 0,
  },
  scrubberFill: (pct: number) => ({
    background: '#4a9eff',
    height: '100%',
    width: `${pct}%`,
    borderRadius: '2px',
  } as React.CSSProperties),
  eventList: {
    flex: 1,
    overflowY: 'auto' as const,
    fontSize: '11px',
  },
  eventRow: {
    display: 'flex',
    gap: '8px',
    padding: '2px 0',
    borderBottom: '1px solid #1a1a2e',
  },
  eventTime: {
    color: '#666',
    fontFamily: '"Fira Code", "Consolas", monospace',
    fontSize: '10px',
    flexShrink: 0,
    width: '70px',
  },
  eventType: (color: string) => ({
    color,
    fontSize: '10px',
    flexShrink: 0,
    width: '120px',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties),
  eventSummary: {
    color: '#aaa',
    flex: 1,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
};

const SPEEDS = [1, 2, 5, 10];
const EVENT_TYPES: Array<{ type: string; label: string }> = [
  { type: 'source.observation.reported', label: 'Observations' },
  { type: 'eo.cue.issued', label: 'EO Cues' },
  { type: 'eo.report.received', label: 'EO Reports' },
  { type: 'eo.bearing.measured', label: 'Bearings' },
  { type: 'fault.started', label: 'Faults' },
  { type: 'scenario.started', label: 'Scenario' },
];

export function TimelinePanel() {
  const eventLog = useUiStore(s => s.eventLog);
  const replayPlaying = useUiStore(s => s.replayPlaying);
  const replaySpeed = useUiStore(s => s.replaySpeed);
  const replayTime = useUiStore(s => s.replayTime);
  const scenarioDurationSec = useUiStore(s => s.scenarioDurationSec);
  const setReplayPlaying = useUiStore(s => s.setReplayPlaying);
  const setReplaySpeed = useUiStore(s => s.setReplaySpeed);

  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());

  const toggleFilter = (type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filteredEvents = filterTypes.size === 0
    ? eventLog
    : eventLog.filter(e => filterTypes.has(e.eventType));

  const handlePlay = () => {
    setReplayPlaying(true);
    fetch('/api/scenario/start', { method: 'POST' }).catch(() => {});
  };

  const handlePause = () => {
    setReplayPlaying(false);
    fetch('/api/scenario/pause', { method: 'POST' }).catch(() => {});
  };

  const handleSpeedChange = (speed: number) => {
    setReplaySpeed(speed);
    fetch('/api/scenario/speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed }),
    }).catch(() => {});
  };

  return (
    <div style={styles.container}>
      {/* Controls row */}
      <div style={styles.header}>
        <span style={styles.title}>Timeline</span>
        <span style={styles.separator}>|</span>
        <button
          style={styles.controlBtn(replayPlaying)}
          onClick={replayPlaying ? handlePause : handlePlay}
        >
          {replayPlaying ? 'Pause' : 'Play'}
        </button>
        <span style={styles.separator}>|</span>
        {SPEEDS.map(s => (
          <button
            key={s}
            style={styles.speedBtn(replaySpeed === s)}
            onClick={() => handleSpeedChange(s)}
          >
            {s}x
          </button>
        ))}
        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: '11px' }}>
          {eventLog.length} events
        </span>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap', flexShrink: 0 }}>
        {EVENT_TYPES.map(({ type, label }) => {
          const color = eventTypeColors[type] ?? '#888';
          const active = filterTypes.size === 0 || filterTypes.has(type);
          return (
            <button
              key={type}
              style={styles.filterBtn(active, color)}
              onClick={() => toggleFilter(type)}
            >
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: active ? color : '#444',
              }} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', color: '#888', fontFamily: '"Fira Code", monospace', width: '50px' }}>
          T+{Math.floor(replayTime / 60)}:{String(Math.floor(replayTime % 60)).padStart(2, '0')}
        </span>
        <div style={{ ...styles.scrubber, flex: 1, marginBottom: 0 }}>
          <div style={styles.scrubberFill(scenarioDurationSec > 0 ? (replayTime / scenarioDurationSec) * 100 : 0)} />
        </div>
        <span style={{ fontSize: '10px', color: '#666', fontFamily: '"Fira Code", monospace', width: '50px', textAlign: 'right' }}>
          {Math.floor(scenarioDurationSec / 60)}:{String(Math.floor(scenarioDurationSec % 60)).padStart(2, '0')}
        </span>
      </div>

      {/* Event list */}
      <div style={styles.eventList}>
        {filteredEvents.length === 0 ? (
          <p style={{ opacity: 0.4, textAlign: 'center', marginTop: '8px' }}>
            {replayPlaying ? 'Waiting for events...' : 'Press Play to start the scenario.'}
          </p>
        ) : (
          filteredEvents.map(entry => (
            <div key={entry.id} style={styles.eventRow}>
              <span style={styles.eventTime}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span style={styles.eventType(eventTypeColors[entry.eventType] ?? '#888')}>
                {entry.eventType.split('.').slice(-2).join('.')}
              </span>
              <span style={styles.eventSummary}>{entry.summary}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
