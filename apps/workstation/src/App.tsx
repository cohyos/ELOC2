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
import { TaskPanel } from './task-panel/TaskPanel';
import { InvestigationManagerPanel } from './investigation/InvestigationManagerPanel';
import { CueDetailPanel } from './cue-detail/CueDetailPanel';
import { GroupDetailPanel } from './group-detail/GroupDetailPanel';
import { GeometryDetailPanel } from './geometry-detail/GeometryDetailPanel';
import { ScenarioEditor } from './editor/ScenarioEditor';
import { LiveInjectionToolbar } from './injection/LiveInjectionToolbar';
import { useDemoStore } from './stores/demo-store';
import { ToggleOverlay } from './demo/ToggleOverlay';
import { getBasicModeHiddenPanels } from './demo/BasicModeFilter';
import { PresenterDashboard } from './demo/PresenterDashboard';
import { AnnotationOverlay } from './demo/AnnotationOverlay';
import { NarrationPanel } from './demo/NarrationPanel';
import { MetricsOverlay } from './demo/MetricsOverlay';

// ---------------------------------------------------------------------------
// Colors
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

// ---------------------------------------------------------------------------
// Mobile detection hook
// ---------------------------------------------------------------------------

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

// ---------------------------------------------------------------------------
// Default Panel (shown when nothing is selected)
// ---------------------------------------------------------------------------

function DefaultPanel() {
  const trackCount = useTrackStore(s => s.trackCount);
  const confirmedCount = useTrackStore(s => s.confirmedCount);
  const tentativeCount = useTrackStore(s => s.tentativeCount);
  const sensors = useSensorStore(s => s.sensors);
  const tasks = useTaskStore(s => s.tasks);
  const selectView = useUiStore(s => s.setDetailView);

  const radarCount = sensors.filter(s => s.sensorType === 'radar').length;
  const eoCount = sensors.filter(s => s.sensorType === 'eo').length;
  const activeTasks = tasks.filter(t => t.status === 'executing' || t.status === 'proposed').length;

  const sectionTitle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '3px' };
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '2px 0' };

  return (
    <div style={{ padding: '12px', color: '#e0e0e0', fontSize: '13px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>Overview</h3>
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Tracks</div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Total</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{trackCount}</span></div>
        <div style={row}><span style={{ color: '#00cc44', fontSize: '12px' }}>Confirmed</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#00cc44' }}>{confirmedCount}</span></div>
        <div style={row}><span style={{ color: '#ffcc00', fontSize: '12px' }}>Tentative</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ffcc00' }}>{tentativeCount}</span></div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Sensors</div>
        <div style={row}><span style={{ color: '#4488ff', fontSize: '12px' }}>Radar</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{radarCount}</span></div>
        <div style={row}><span style={{ color: '#ff8800', fontSize: '12px' }}>EO</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{eoCount}</span></div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>EO Tasking</div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Active Tasks</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{activeTasks}</span></div>
        <button onClick={() => selectView('tasks')} style={{ marginTop: '6px', background: '#333', color: '#aaa', border: 'none', padding: '4px 12px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', width: '100%' }}>View Tasks</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared button style
// ---------------------------------------------------------------------------

const btnBase = (isMobile: boolean): React.CSSProperties => ({
  background: '#333',
  color: '#aaa',
  border: 'none',
  padding: isMobile ? '6px 10px' : '2px 8px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: isMobile ? '12px' : '11px',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function App() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<'workstation' | 'editor'>('workstation');
  const detailView = useUiStore(s => s.detailView);
  const detailPanelOpen = useUiStore(s => s.detailPanelOpen);
  const timelinePanelOpen = useUiStore(s => s.timelinePanelOpen);
  const toggleDetailPanel = useUiStore(s => s.toggleDetailPanel);
  const toggleTimelinePanel = useUiStore(s => s.toggleTimelinePanel);
  const wsConnected = useUiStore(s => s.wsConnected);
  const trackCount = useTrackStore(s => s.trackCount);
  const confirmedCount = useTrackStore(s => s.confirmedCount);
  const tentativeCount = useTrackStore(s => s.tentativeCount);
  const trackStatusFilter = useUiStore(s => s.trackStatusFilter);
  const toggleTrackStatus = useUiStore(s => s.toggleTrackStatus);
  const demoActive = useDemoStore(s => s.active);
  const setDemoActive = useDemoStore(s => s.setActive);
  const viewMode = useDemoStore(s => s.viewMode);
  const basicHiddenPanels = demoActive && viewMode === 'basic' ? getBasicModeHiddenPanels() : [];
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const injectionMode = useUiStore(s => s.injectionMode);
  const toggleInjectionMode = useUiStore(s => s.toggleInjectionMode);

  // Sync demo mode to ui-store for convenience
  const setDemoMode = useUiStore(s => s.setDemoMode);
  useEffect(() => { setDemoMode(demoActive); }, [demoActive, setDemoMode]);

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
    fetch('/api/scenarios').then(r => r.json()).then(data => setAvailableScenarios(data)).catch(() => {});
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
    await fetch('/api/scenario/speed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speed }) });
  }, []);

  const handleReset = useCallback(async () => {
    await fetch('/api/scenario/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  }, []);

  const handleScenarioChange = useCallback(async (scenarioId: string) => {
    await fetch('/api/scenario/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId }) });
    fetchRap(); fetchSensors(); fetchTasks();
  }, [fetchRap, fetchSensors, fetchTasks]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Initial data fetch
  useEffect(() => { fetchRap(); fetchSensors(); fetchTasks(); }, []);

  // WebSocket connection
  useEffect(() => { replayController.connect(); return () => replayController.disconnect(); }, []);

  // Keyboard shortcuts for playback control
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handleStartPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          fetch('/api/replay/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeSec: Math.max(0, simElapsed - 10) }),
          }).catch(() => {});
          break;
        case 'ArrowRight':
          e.preventDefault();
          fetch('/api/replay/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeSec: simElapsed + 10 }),
          }).catch(() => {});
          break;
        case 'i':
        case 'I':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleInjectionMode();
          }
          break;
        case 'd':
        case 'D':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Toggle demo mode and open dashboard
            const nextActive = !useDemoStore.getState().active;
            setDemoActive(nextActive);
            setDashboardOpen(nextActive);
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleStartPause, simElapsed, toggleInjectionMode, setDemoActive]);

  // Periodic refresh (every 10s)
  useEffect(() => {
    const interval = setInterval(() => { fetchRap(); fetchSensors(); }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (view === 'editor') {
    return <ScenarioEditor onBack={() => setView('workstation')} />;
  }

  if (isMobile) return <MobileLayout />;

  // ─── Desktop Layout ───────────────────────────────────────────────────
  const showDetail = detailPanelOpen;
  const showInjection = injectionMode && simRunning;
  const btn = btnBase(false);

  return (
    <div style={{
      display: 'grid',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: colors.bg,
      color: colors.text,
      overflow: 'hidden',
      gridTemplateRows: showInjection ? '40px auto 1fr auto' : '40px 1fr auto',
      gridTemplateColumns: showDetail ? '1fr 380px' : '1fr',
      gridTemplateAreas: showDetail
        ? (showInjection
          ? `"header header" "inject inject" "map detail" "timeline timeline"`
          : `"header header" "map detail" "timeline timeline"`)
        : (showInjection
          ? `"header" "inject" "map" "timeline"`
          : `"header" "map" "timeline"`),
    }}>
      {/* Header */}
      <header style={{ gridArea: 'header', background: colors.headerBg, display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', fontSize: '13px', borderBottom: `1px solid ${colors.border}`, zIndex: 10 }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>ELOC2</span>
        <span style={{ color: colors.textDim, fontSize: '12px' }}>EO C2 Air Defense Demonstrator</span>
        <span style={{ color: colors.accent, fontSize: '10px', fontFamily: 'monospace' }}>rev:{__APP_REVISION__}</span>

        {/* Scenario selector */}
        {availableScenarios.length > 0 && (
          <select value={currentScenarioId} onChange={(e) => handleScenarioChange(e.target.value)} title="Select scenario"
            style={{ background: '#333', color: '#e0e0e0', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer', maxWidth: '180px' }}>
            {availableScenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button style={{ ...btn, background: '#2a2a4e', color: '#aa88ff', border: '1px solid #aa88ff44' }} onClick={() => setView('editor')}>Editor</button>
        <button
          style={{ ...btn, background: demoActive ? '#4a9eff' : '#2a2a4e', color: demoActive ? '#fff' : '#4a9eff', border: '1px solid #4a9eff44' }}
          onClick={() => {
            if (!demoActive) setDemoActive(true);
            setDashboardOpen(!dashboardOpen);
          }}
          title="Presenter Dashboard (Ctrl+D)"
        >Demo</button>

        {/* Track summary with filter toggles */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '11px' }}>
          {[
            { status: 'confirmed' as const, color: '#00cc44', count: confirmedCount, label: 'confirmed' },
            { status: 'tentative' as const, color: '#ffcc00', count: tentativeCount, label: 'tentative' },
            { status: 'dropped' as const, color: '#ff3333', count: undefined, label: 'dropped' },
          ].map(f => (
            <span key={f.status} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: f.color, fontWeight: 600, fontSize: '11px', cursor: 'pointer', opacity: trackStatusFilter[f.status] ? 1 : 0.35 }}
              onClick={() => toggleTrackStatus(f.status)} title={`Toggle ${f.label} tracks`}>
              {f.count !== undefined ? `${f.count} ` : ''}{f.label}
            </span>
          ))}
          <span style={{ color: colors.textDim }}>{trackCount} total</span>
        </div>

        {/* Scenario controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
          <button style={{ ...btn, background: simRunning ? '#cc3300' : '#00aa44', color: '#fff', fontWeight: 600, padding: '3px 12px' }} onClick={handleStartPause}>
            {simRunning ? 'Pause' : 'Start'}
          </button>
          <button style={btn} onClick={handleReset}>Reset</button>
          {[1, 2, 5, 10].map(s => (
            <button key={s} style={{ ...btn, background: simSpeed === s ? '#4a9eff' : '#333', color: simSpeed === s ? '#fff' : '#aaa' }} onClick={() => handleSpeed(s)}>{s}x</button>
          ))}
          <span style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace', minWidth: '50px' }}>T+{formatTime(simElapsed)}</span>
        </div>

        {simRunning && (
          <button
            style={{ ...btn, background: injectionMode ? '#ff8800' : '#333', color: injectionMode ? '#fff' : '#aaa', border: injectionMode ? '1px solid #ff880066' : 'none', fontWeight: injectionMode ? 600 : 400 }}
            onClick={toggleInjectionMode}
            title="Toggle live injection toolbar (Ctrl+I)"
          >
            Live Inject
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', fontSize: '11px', color: colors.textDim }}>
          <button style={{ ...btn, background: detailView === 'tasks' && detailPanelOpen ? '#4a9eff' : '#333', color: detailView === 'tasks' && detailPanelOpen ? '#fff' : '#aaa' }}
            onClick={() => {
              const store = useUiStore.getState();
              if (store.detailView === 'tasks' && store.detailPanelOpen) {
                store.toggleDetailPanel();
              } else {
                store.setDetailView('tasks');
              }
            }}>Tasks</button>
          <button style={{ ...btn, background: detailView === 'investigation' && detailPanelOpen ? '#4a9eff' : '#333', color: detailView === 'investigation' && detailPanelOpen ? '#fff' : '#aaa' }}
            onClick={() => {
              const store = useUiStore.getState();
              if (store.detailView === 'investigation' && store.detailPanelOpen) {
                store.toggleDetailPanel();
              } else {
                store.setDetailView('investigation');
              }
            }}>Investigation</button>
          <button style={btn} onClick={toggleDetailPanel}>{showDetail ? 'Hide Panel' : 'Show Panel'}</button>
          <button style={btn} onClick={toggleTimelinePanel}>{timelinePanelOpen ? 'Hide Timeline' : 'Show Timeline'}</button>
          <span><span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: wsConnected ? '#00cc44' : '#ff3333', marginRight: '4px' }} />{wsConnected ? 'Connected' : 'Disconnected'}</span>
          <span style={{ fontSize: '10px', opacity: 0.5 }}>v0.2.0</span>
        </div>
      </header>

      {/* Injection Toolbar */}
      {showInjection && (
        <div style={{ gridArea: 'inject' }}>
          <LiveInjectionToolbar />
        </div>
      )}

      {/* Map */}
      <div style={{ gridArea: 'map', position: 'relative', overflow: 'hidden' }}>
        <DegradedModeOverlay />
        <MapView />
        <ToggleOverlay />
      </div>

      {/* Detail Panel */}
      {showDetail && (
        <div style={{ gridArea: 'detail', background: colors.panelBg, borderLeft: `1px solid ${colors.border}`, overflowY: 'auto', overflowX: 'hidden' }}>
          {detailView === 'track' && <TrackDetailPanel />}
          {detailView === 'sensor' && <SensorDetailPanel />}
          {!basicHiddenPanels.includes('tasks') && detailView === 'tasks' && <TaskPanel />}
          {!basicHiddenPanels.includes('investigation') && detailView === 'investigation' && <InvestigationManagerPanel />}
          {detailView === 'cue' && <CueDetailPanel />}
          {detailView === 'group' && <GroupDetailPanel />}
          {detailView === 'geometry' && <GeometryDetailPanel />}
          {(detailView === 'none' || (basicHiddenPanels.includes(detailView))) && <DefaultPanel />}
        </div>
      )}

      {/* Timeline */}
      <div style={{ gridArea: 'timeline', background: colors.headerBg, borderTop: `1px solid ${colors.border}`, height: timelinePanelOpen ? '150px' : '32px', transition: 'height 0.2s ease', overflow: 'hidden' }}>
        {timelinePanelOpen ? <TimelinePanel /> : (
          <div style={{ padding: '6px 16px', fontSize: '12px', color: '#666' }}>Timeline (collapsed) — click Show Timeline to expand</div>
        )}
      </div>

      {/* Demo mode overlays */}
      {demoActive && <AnnotationOverlay />}
      {demoActive && <NarrationPanel />}
      {demoActive && <MetricsOverlay />}
      {dashboardOpen && <PresenterDashboard onClose={() => setDashboardOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Layout
// ---------------------------------------------------------------------------

function MobileLayout() {
  const detailView = useUiStore(s => s.detailView);
  const detailPanelOpen = useUiStore(s => s.detailPanelOpen);
  const toggleDetailPanel = useUiStore(s => s.toggleDetailPanel);
  const wsConnected = useUiStore(s => s.wsConnected);
  const trackCount = useTrackStore(s => s.trackCount);
  const confirmedCount = useTrackStore(s => s.confirmedCount);
  const tentativeCount = useTrackStore(s => s.tentativeCount);
  const trackStatusFilter = useUiStore(s => s.trackStatusFilter);
  const toggleTrackStatus = useUiStore(s => s.toggleTrackStatus);
  const setDetailView = useUiStore(s => s.setDetailView);
  const timelinePanelOpen = useUiStore(s => s.timelinePanelOpen);
  const toggleTimelinePanel = useUiStore(s => s.toggleTimelinePanel);

  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simElapsed, setSimElapsed] = useState(0);
  const [currentScenarioId, setCurrentScenarioId] = useState('');
  const [availableScenarios, setAvailableScenarios] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    fetch('/api/scenarios').then(r => r.json()).then(data => setAvailableScenarios(data)).catch(() => {});
  }, []);

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
    await fetch('/api/scenario/speed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speed }) });
  }, []);

  const handleReset = useCallback(async () => {
    await fetch('/api/scenario/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  }, []);

  const handleScenarioChange = useCallback(async (scenarioId: string) => {
    await fetch('/api/scenario/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId }) });
  }, []);

  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;

  const btn = btnBase(true);

  const showPanel = detailPanelOpen && (detailView !== 'none' || true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: colors.bg, color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>

      {/* ── Mobile Header ─────────────────────────────────────── */}
      <header style={{ background: colors.headerBg, borderBottom: `1px solid ${colors.border}`, padding: '6px 10px', flexShrink: 0, zIndex: 10 }}>
        {/* Row 1: Logo + status + controls toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>ELOC2</span>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: wsConnected ? '#00cc44' : '#ff3333' }} />
          <span style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace' }}>T+{formatTime(simElapsed)}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button style={{ ...btn, background: simRunning ? '#cc3300' : '#00aa44', color: '#fff', fontWeight: 600 }} onClick={handleStartPause}>
              {simRunning ? 'Pause' : 'Start'}
            </button>
            <button style={btn} onClick={() => setShowControls(!showControls)}>
              {showControls ? 'Less' : 'More'}
            </button>
          </div>
        </div>

        {/* Row 2: Track filter badges */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
          {[
            { status: 'confirmed' as const, color: '#00cc44', count: confirmedCount },
            { status: 'tentative' as const, color: '#ffcc00', count: tentativeCount },
            { status: 'dropped' as const, color: '#ff3333', count: undefined },
          ].map(f => (
            <span key={f.status}
              onClick={() => toggleTrackStatus(f.status)}
              style={{ color: f.color, fontWeight: 600, opacity: trackStatusFilter[f.status] ? 1 : 0.3, cursor: 'pointer', padding: '2px 6px', borderRadius: '3px', background: trackStatusFilter[f.status] ? f.color + '15' : 'transparent', touchAction: 'manipulation' }}>
              {f.count !== undefined ? `${f.count} ` : ''}{f.status}
            </span>
          ))}
          <span style={{ color: colors.textDim, fontSize: '10px' }}>{trackCount} total</span>
        </div>

        {/* Row 3: Expanded controls (shown when 'More' tapped) */}
        {showControls && (
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Speed + reset */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={btn} onClick={handleReset}>Reset</button>
              {[1, 2, 5, 10].map(s => (
                <button key={s} style={{ ...btn, background: simSpeed === s ? '#4a9eff' : '#333', color: simSpeed === s ? '#fff' : '#aaa', minWidth: '36px' }} onClick={() => handleSpeed(s)}>{s}x</button>
              ))}
            </div>
            {/* Scenario selector */}
            {availableScenarios.length > 0 && (
              <select value={currentScenarioId} onChange={(e) => handleScenarioChange(e.target.value)}
                style={{ background: '#333', color: '#e0e0e0', border: '1px solid #555', borderRadius: '3px', padding: '6px 8px', fontSize: '12px', width: '100%' }}>
                {availableScenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        )}
      </header>

      {/* ── Map (fills remaining space) ───────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DegradedModeOverlay />
        <MapView />

        {/* Detail panel as overlay on mobile */}
        {showPanel && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '55vh',
            background: colors.panelBg,
            borderTop: `2px solid ${colors.border}`,
            overflowY: 'auto',
            zIndex: 20,
            borderRadius: '12px 12px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
          }}>
            {/* Drag handle + close */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px', position: 'sticky', top: 0, background: colors.panelBg, zIndex: 1 }}>
              <div style={{ width: '32px', height: '4px', borderRadius: '2px', background: '#555' }} />
              <button onClick={toggleDetailPanel} style={{ position: 'absolute', right: '10px', top: '6px', background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer', padding: '4px 8px', touchAction: 'manipulation' }}>
                &times;
              </button>
            </div>
            {detailView === 'track' && <TrackDetailPanel />}
            {detailView === 'sensor' && <SensorDetailPanel />}
            {detailView === 'tasks' && <TaskPanel />}
            {detailView === 'investigation' && <InvestigationManagerPanel />}
            {detailView === 'cue' && <CueDetailPanel />}
            {detailView === 'group' && <GroupDetailPanel />}
            {detailView === 'geometry' && <GeometryDetailPanel />}
            {detailView === 'none' && <DefaultPanel />}
          </div>
        )}

        {/* Timeline overlay on mobile */}
        {timelinePanelOpen && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '200px',
            background: colors.headerBg,
            borderTop: `2px solid ${colors.border}`,
            zIndex: 25,
            borderRadius: '12px 12px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '6px', position: 'sticky', top: 0 }}>
              <div style={{ width: '32px', height: '4px', borderRadius: '2px', background: '#555' }} />
              <button onClick={toggleTimelinePanel} style={{ position: 'absolute', right: '10px', top: '4px', background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer', padding: '4px 8px', touchAction: 'manipulation' }}>
                &times;
              </button>
            </div>
            <TimelinePanel />
          </div>
        )}
      </div>

      {/* ── Bottom Toolbar ────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        background: colors.headerBg,
        borderTop: `1px solid ${colors.border}`,
        padding: '6px 0',
        paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
        flexShrink: 0,
        zIndex: 30,
      }}>
        {[
          { label: 'Overview', view: 'none' as const, icon: '\u2302' },
          { label: 'Tasks', view: 'tasks' as const, icon: '\u2611' },
          { label: 'Invest.', view: 'investigation' as const, icon: '\u2318' },
          { label: 'Timeline', view: '__timeline__' as const, icon: '\u23F1' },
        ].map(item => {
          const isTimeline = item.view === '__timeline__';
          const active = isTimeline ? timelinePanelOpen : (detailPanelOpen && detailView === item.view);
          return (
            <button
              key={item.label}
              onClick={() => {
                if (isTimeline) {
                  toggleTimelinePanel();
                  // Close detail panel if timeline opens
                  if (!timelinePanelOpen && detailPanelOpen) {
                    toggleDetailPanel();
                  }
                } else {
                  // Close timeline if detail opens
                  if (timelinePanelOpen) toggleTimelinePanel();
                  if (detailPanelOpen && detailView === item.view) {
                    toggleDetailPanel();
                  } else {
                    setDetailView(item.view);
                  }
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: active ? colors.accent : '#666',
                fontSize: '10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                cursor: 'pointer',
                padding: '4px 16px',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
