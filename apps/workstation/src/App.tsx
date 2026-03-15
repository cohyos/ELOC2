import React, { useEffect, useState, useCallback } from 'react';
import { MapView } from './map/MapView';
import { TrackDetailPanel } from './track-detail/TrackDetailPanel';
import { SensorDetailPanel } from './sensor-detail/SensorDetailPanel';
import { TimelinePanel } from './timeline/TimelinePanel';
import { DegradedModeOverlay } from './overlays/DegradedModeOverlay';
import { replayController } from './replay/ReplayController';
import { useTrackStore } from './stores/track-store';
import { useSensorStore } from './stores/sensor-store';
import { useTaskStore } from './stores/task-store';
import { useUiStore } from './stores/ui-store';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const colors = {
  bg: '#0d0d1a',
  headerBg: '#1a1a2e',
  panelBg: '#141425',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textDim: '#888',
  accent: '#4a9eff',
};

const styles = {
  root: {
    display: 'grid',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: colors.bg,
    color: colors.text,
    overflow: 'hidden',
  } as React.CSSProperties,

  // PC layout: header | (map + detail) | timeline
  pcLayout: {
    gridTemplateRows: '40px 1fr auto',
    gridTemplateColumns: '1fr 380px',
    gridTemplateAreas: `
      "header header"
      "map detail"
      "timeline timeline"
    `,
  } as React.CSSProperties,

  // PC layout when detail panel is closed
  pcLayoutNoDetail: {
    gridTemplateRows: '40px 1fr auto',
    gridTemplateColumns: '1fr',
    gridTemplateAreas: `
      "header"
      "map"
      "timeline"
    `,
  } as React.CSSProperties,

  header: {
    gridArea: 'header',
    background: colors.headerBg,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '12px',
    fontSize: '13px',
    borderBottom: `1px solid ${colors.border}`,
    zIndex: 10,
  } as React.CSSProperties,

  logo: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '1px',
  } as React.CSSProperties,

  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginLeft: 'auto',
    fontSize: '11px',
    color: colors.textDim,
  } as React.CSSProperties,

  statusDot: (connected: boolean) => ({
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: connected ? '#00cc44' : '#ff3333',
    marginRight: '4px',
  } as React.CSSProperties),

  mapArea: {
    gridArea: 'map',
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  detailPanel: {
    gridArea: 'detail',
    background: colors.panelBg,
    borderLeft: `1px solid ${colors.border}`,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  } as React.CSSProperties,

  timelineArea: (open: boolean) => ({
    gridArea: 'timeline',
    background: colors.headerBg,
    borderTop: `1px solid ${colors.border}`,
    height: open ? '150px' : '32px',
    transition: 'height 0.2s ease',
    overflow: 'hidden',
  } as React.CSSProperties),

  timelineToggle: {
    position: 'absolute' as const,
    right: '8px',
    top: '4px',
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '10px',
  } as React.CSSProperties,

  trackSummary: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    fontSize: '11px',
  } as React.CSSProperties,

  summaryBadge: (color: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color,
    fontWeight: 600,
    fontSize: '11px',
  } as React.CSSProperties),

  toggleBtn: {
    background: '#333',
    color: '#aaa',
    border: 'none',
    padding: '2px 8px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11px',
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function App() {
  const detailView = useUiStore(s => s.detailView);
  const detailPanelOpen = useUiStore(s => s.detailPanelOpen);
  const timelinePanelOpen = useUiStore(s => s.timelinePanelOpen);
  const toggleDetailPanel = useUiStore(s => s.toggleDetailPanel);
  const toggleTimelinePanel = useUiStore(s => s.toggleTimelinePanel);
  const wsConnected = useUiStore(s => s.wsConnected);
  const trackCount = useTrackStore(s => s.trackCount);
  const confirmedCount = useTrackStore(s => s.confirmedCount);
  const tentativeCount = useTrackStore(s => s.tentativeCount);

  const fetchRap = useTrackStore(s => s.fetchRap);
  const fetchSensors = useSensorStore(s => s.fetchSensors);
  const fetchTasks = useTaskStore(s => s.fetchTasks);

  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simElapsed, setSimElapsed] = useState(0);
  const [currentScenarioId, setCurrentScenarioId] = useState('');
  const [availableScenarios, setAvailableScenarios] = useState<Array<{ id: string; name: string; description: string }>>([]);

  // Fetch available scenarios on mount
  useEffect(() => {
    fetch('/api/scenarios')
      .then(r => r.json())
      .then(data => setAvailableScenarios(data))
      .catch(() => {});
  }, []);

  // Poll scenario status
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/scenario/status');
        if (res.ok) {
          const data = await res.json();
          setSimRunning(data.running);
          setSimSpeed(data.speed);
          setSimElapsed(data.elapsedSec);
          setCurrentScenarioId(data.scenarioId || '');
        }
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(poll);
  }, []);

  const handleStartPause = useCallback(async () => {
    await fetch(simRunning ? '/api/scenario/pause' : '/api/scenario/start', { method: 'POST' });
  }, [simRunning]);

  const handleSpeed = useCallback(async (speed: number) => {
    await fetch('/api/scenario/speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed }),
    });
  }, []);

  const handleReset = useCallback(async () => {
    await fetch('/api/scenario/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }, []);

  const handleScenarioChange = useCallback(async (scenarioId: string) => {
    await fetch('/api/scenario/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    });
    fetchRap();
    fetchSensors();
    fetchTasks();
  }, [fetchRap, fetchSensors, fetchTasks]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Initial data fetch
  useEffect(() => {
    fetchRap();
    fetchSensors();
    fetchTasks();
  }, []);

  // WebSocket connection
  useEffect(() => {
    replayController.connect();
    return () => replayController.disconnect();
  }, []);

  // Periodic refresh (every 10s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRap();
      fetchSensors();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const showDetail = detailPanelOpen && detailView !== 'none';

  const rootStyle: React.CSSProperties = {
    ...styles.root,
    ...(showDetail ? styles.pcLayout : styles.pcLayoutNoDetail),
  };

  return (
    <div style={rootStyle}>
      {/* Header */}
      <header style={styles.header}>
        <span style={styles.logo}>ELOC2</span>
        <span style={{ color: colors.textDim, fontSize: '12px' }}>
          EO C2 Air Defense Demonstrator
        </span>

        {/* Scenario selector */}
        {availableScenarios.length > 0 && (
          <select
            value={currentScenarioId}
            onChange={(e) => handleScenarioChange(e.target.value)}
            title="Select scenario"
            style={{
              background: '#333',
              color: '#e0e0e0',
              border: '1px solid #555',
              borderRadius: '3px',
              padding: '2px 6px',
              fontSize: '11px',
              cursor: 'pointer',
              maxWidth: '180px',
            }}
          >
            {availableScenarios.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {/* Track summary */}
        <div style={styles.trackSummary}>
          <span style={styles.summaryBadge('#00cc44')}>
            {confirmedCount} confirmed
          </span>
          <span style={styles.summaryBadge('#ffcc00')}>
            {tentativeCount} tentative
          </span>
          <span style={{ color: colors.textDim }}>
            {trackCount} total
          </span>
        </div>

        {/* Scenario controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
          <button
            style={{
              ...styles.toggleBtn,
              background: simRunning ? '#cc3300' : '#00aa44',
              color: '#fff',
              fontWeight: 600,
              padding: '3px 12px',
            }}
            onClick={handleStartPause}
          >
            {simRunning ? 'Pause' : 'Start'}
          </button>
          <button style={styles.toggleBtn} onClick={handleReset}>Reset</button>
          {[1, 2, 5, 10].map(s => (
            <button
              key={s}
              style={{
                ...styles.toggleBtn,
                background: simSpeed === s ? '#4a9eff' : '#333',
                color: simSpeed === s ? '#fff' : '#aaa',
              }}
              onClick={() => handleSpeed(s)}
            >
              {s}x
            </button>
          ))}
          <span style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace', minWidth: '50px' }}>
            T+{formatTime(simElapsed)}
          </span>
        </div>

        <div style={styles.statusBar}>
          <button style={styles.toggleBtn} onClick={toggleDetailPanel}>
            {showDetail ? 'Hide Panel' : 'Show Panel'}
          </button>
          <button style={styles.toggleBtn} onClick={toggleTimelinePanel}>
            {timelinePanelOpen ? 'Hide Timeline' : 'Show Timeline'}
          </button>
          <span>
            <span style={styles.statusDot(wsConnected)} />
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span style={{ fontSize: '10px', opacity: 0.5 }}>v0.1.0</span>
        </div>
      </header>

      {/* Map */}
      <div style={styles.mapArea}>
        <DegradedModeOverlay />
        <MapView />
      </div>

      {/* Detail Panel */}
      {showDetail && (
        <div style={styles.detailPanel}>
          {detailView === 'track' && <TrackDetailPanel />}
          {detailView === 'sensor' && <SensorDetailPanel />}
        </div>
      )}

      {/* Timeline */}
      <div style={styles.timelineArea(timelinePanelOpen)}>
        {timelinePanelOpen ? (
          <TimelinePanel />
        ) : (
          <div style={{ padding: '6px 16px', fontSize: '12px', color: '#666' }}>
            Timeline (collapsed) — click Show Timeline to expand
          </div>
        )}
      </div>
    </div>
  );
}
