import React, { useState } from 'react';
import { useUiStore, type EventLogEntry } from '../stores/ui-store';
import { useTaskStore } from '../stores/task-store';

const eventTypeColors: Record<string, string> = {
  'system.track.updated': '#00cc44',
  'source.observation.reported': '#4488ff',
  'eo.cue.issued': '#ff8800',
  'eo.report.received': '#ff8800',
  'registration.state.updated': '#aa44ff',
  'geometry.estimate.updated': '#ffcc00',
  'task.decided': '#ff6699',
  'correlation.decided': '#44ccaa',
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
  filterBtn: (active: boolean) => ({
    background: active ? '#ffffff11' : 'transparent',
    color: active ? '#ddd' : '#666',
    border: 'none',
    padding: '1px 5px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10px',
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
const EVENT_TYPES = [
  'system.track.updated',
  'source.observation.reported',
  'eo.cue.issued',
  'registration.state.updated',
  'geometry.estimate.updated',
  'task.decided',
];

export function TimelinePanel() {
  const eventLog = useUiStore(s => s.eventLog);
  const replayPlaying = useUiStore(s => s.replayPlaying);
  const replaySpeed = useUiStore(s => s.replaySpeed);
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
        {EVENT_TYPES.map(type => {
          const shortName = type.split('.').pop() ?? type;
          return (
            <button
              key={type}
              style={styles.filterBtn(filterTypes.size === 0 || filterTypes.has(type))}
              onClick={() => toggleFilter(type)}
            >
              {shortName}
            </button>
          );
        })}
      </div>

      {/* Scrubber */}
      <div style={styles.scrubber}>
        <div style={styles.scrubberFill(replayPlaying ? 50 : 0)} />
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
