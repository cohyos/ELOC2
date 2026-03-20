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
import { InvestigationWindowPanel } from './investigation/InvestigationWindowPanel';
import { CueDetailPanel } from './cue-detail/CueDetailPanel';
import { GroupDetailPanel } from './group-detail/GroupDetailPanel';
import { GeometryDetailPanel } from './geometry-detail/GeometryDetailPanel';
import { GroundTruthDetailPanel } from './ground-truth-detail/GroundTruthDetailPanel';
import { HelpPage } from './help/HelpPage';
import { ScenarioEditor } from './editor/ScenarioEditor';
import { LiveInjectionToolbar } from './injection/LiveInjectionToolbar';
import { useDemoStore } from './stores/demo-store';
import { useGroundTruthStore } from './stores/ground-truth-store';
import { ToggleOverlay } from './demo/ToggleOverlay';
import { getBasicModeHiddenPanels } from './demo/BasicModeFilter';
import { PresenterDashboard } from './demo/PresenterDashboard';
import { AnnotationOverlay } from './demo/AnnotationOverlay';
import { NarrationPanel } from './demo/NarrationPanel';
import { MetricsOverlay } from './demo/MetricsOverlay';
import { ResizeHandle } from './components/ResizeHandle';
import { QualityMetricsPanel } from './quality/QualityMetricsPanel';
import { DeploymentView } from './deployment/DeploymentView';
import { UserManagementView } from './admin/UserManagementView';
import { FusionConfigPanel } from './components/FusionConfigPanel';
import { useAuthStore } from './auth/auth-store';
import { LoginPage } from './auth/LoginPage';
import { ReportModal } from './reports/ReportModal';

// Panel size defaults (must match ui-store defaults)
const DEFAULT_RIGHT_PANEL_WIDTH = 380;
const DEFAULT_TIMELINE_HEIGHT = 150;

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
  const tracks = useTrackStore(s => s.tracks);
  const trackCount = useTrackStore(s => s.trackCount);
  const confirmedCount = useTrackStore(s => s.confirmedCount);
  const tentativeCount = useTrackStore(s => s.tentativeCount);
  const selectTrack = useUiStore(s => s.selectTrack);
  const sensors = useSensorStore(s => s.sensors);
  const tasks = useTaskStore(s => s.tasks);
  const registrationStates = useTaskStore(s => s.registrationStates);
  const fusionModes = useTaskStore(s => s.fusionModes);
  const eoModuleStatus = useTaskStore(s => s.eoModuleStatus);
  const selectView = useUiStore(s => s.setDetailView);
  const latency = useUiStore(s => s.latency);
  const systemLoad = useUiStore(s => s.systemLoad);
  const connectedUsers = useUiStore(s => s.connectedUsers);
  const autoLoopEnabled = useUiStore(s => s.autoLoopEnabled);

  const radarCount = sensors.filter(s => s.sensorType === 'radar').length;
  const eoCount = sensors.filter(s => s.sensorType === 'eo').length;
  const onlineCount = sensors.filter(s => s.online).length;
  const offlineCount = sensors.length - onlineCount;
  const activeTasks = tasks.filter(t => t.status === 'executing' || t.status === 'proposed').length;

  // Registration health summary
  const degradedCount = registrationStates.filter(s => s.spatialQuality === 'degraded' || s.timingQuality === 'degraded').length;
  const unsafeCount = registrationStates.filter(s => !s.fusionSafe).length;

  // Dominant fusion mode
  const modeValues = Object.values(fusionModes ?? {}) as string[];
  const modeCounts = modeValues.reduce((acc, m) => { acc[m] = (acc[m] || 0) + 1; return acc; }, {} as Record<string, number>);
  const dominantMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';
  const modeColor = dominantMode === 'centralized' ? '#00cc44' : dominantMode === 'conservative' ? '#ffcc00' : '#ff8800';

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
        {tracks.length > 0 && tracks.length <= 20 && (
          <div style={{ marginTop: '6px', maxHeight: '120px', overflowY: 'auto' }}>
            {tracks.filter(t => t.status !== 'dropped').map(t => {
              const id = t.systemTrackId as string;
              const color = t.status === 'confirmed' ? '#00cc44' : '#ffcc00';
              return (
                <div key={id} style={{ ...row, cursor: 'pointer', padding: '2px 4px', borderRadius: '2px' }}
                  onClick={() => selectTrack(id)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#ffffff11')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ color, fontSize: '11px' }}>
                    T{id.match(/(\d+)/)?.[1] ?? '?'}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#888' }}>
                    {t.sources.length}src {t.confidence?.toFixed(1) ?? '-'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Sensors</div>
        <div style={row}><span style={{ color: '#4488ff', fontSize: '12px' }}>Radar</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{radarCount}</span></div>
        <div style={row}><span style={{ color: '#ff8800', fontSize: '12px' }}>EO</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{eoCount}</span></div>
        <div style={row}><span style={{ color: onlineCount === sensors.length ? '#00cc44' : '#ffcc00', fontSize: '12px' }}>Online</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{onlineCount}/{sensors.length}</span></div>
        {offlineCount > 0 && <div style={row}><span style={{ color: '#ff3333', fontSize: '12px' }}>Offline</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ff3333' }}>{offlineCount}</span></div>}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>System Health</div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Fusion Mode</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: modeColor }}>{dominantMode}</span></div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Registration</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: degradedCount === 0 ? '#00cc44' : '#ffcc00' }}>{degradedCount === 0 ? 'Healthy' : `${degradedCount} degraded`}</span></div>
        {unsafeCount > 0 && <div style={row}><span style={{ color: '#ff3333', fontSize: '12px' }}>Fusion Unsafe</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ff3333' }}>{unsafeCount} sensors</span></div>}
        {(() => {
          const avgColor = latency.avgMs < 50 ? '#00cc44' : latency.avgMs < 100 ? '#ffcc00' : '#ff3333';
          const maxColor = latency.maxMs < 50 ? '#00cc44' : latency.maxMs < 100 ? '#ffcc00' : '#ff3333';
          return (
            <div style={row}>
              <span style={{ color: '#888', fontSize: '12px' }}>Latency</span>
              <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                <span style={{ color: avgColor }}>{latency.avgMs}ms</span>
                <span style={{ color: '#555' }}> avg / </span>
                <span style={{ color: maxColor }}>{latency.maxMs}ms</span>
                <span style={{ color: '#555' }}> max</span>
              </span>
            </div>
          );
        })()}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Connected Users</div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Online</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: connectedUsers.total > 0 ? '#00cc44' : '#888' }}>{connectedUsers.total}</span></div>
        {connectedUsers.instructors > 0 && <div style={row}><span style={{ color: '#4a9eff', fontSize: '12px' }}>Instructors</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{connectedUsers.instructors}</span></div>}
        {connectedUsers.operators > 0 && <div style={row}><span style={{ color: '#ff8800', fontSize: '12px' }}>Operators</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{connectedUsers.operators}</span></div>}
        {connectedUsers.total - connectedUsers.instructors - connectedUsers.operators > 0 && (
          <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Anonymous</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{connectedUsers.total - connectedUsers.instructors - connectedUsers.operators}</span></div>
        )}
        {autoLoopEnabled && <div style={row}><span style={{ color: '#ffcc00', fontSize: '12px' }}>Auto-Loop</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ffcc00' }}>Active</span></div>}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>EO Tasking</div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Active Tasks</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{activeTasks}</span></div>
        <button onClick={() => selectView('tasks')} style={{ marginTop: '6px', background: '#333', color: '#aaa', border: 'none', padding: '4px 12px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', width: '100%' }}>View Tasks</button>
      </div>
      {eoModuleStatus && (
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionTitle}>EO Module (REQ-16)</div>
          <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Mode</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: eoModuleStatus.mode === 'tracking' ? '#00cc44' : eoModuleStatus.mode === 'searching' ? '#ffcc00' : eoModuleStatus.mode === 'mixed' ? '#4a9eff' : '#888' }}>{eoModuleStatus.mode}</span></div>
          <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Active Pipelines</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{eoModuleStatus.activePipelines.length}</span></div>
          <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Enriched Tracks</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{eoModuleStatus.enrichedTrackCount}</span></div>
          <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Ticks</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{eoModuleStatus.tickCount}</span></div>
          {eoModuleStatus.activePipelines.length > 0 && (
            <>
              <div style={row}><span style={{ color: '#ff8800', fontSize: '12px' }}>Sub-pixel</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{eoModuleStatus.activePipelines.filter(p => p.pipeline === 'sub-pixel').length}</span></div>
              <div style={row}><span style={{ color: '#aa44ff', fontSize: '12px' }}>Image</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{eoModuleStatus.activePipelines.filter(p => p.pipeline === 'image').length}</span></div>
            </>
          )}
        </div>
      )}
      {/* System Load */}
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>System Load</div>
        {(() => {
          const tickColor = systemLoad.tickMs < 50 ? '#00cc44' : systemLoad.tickMs < 100 ? '#ffcc00' : '#ff3333';
          const memColor = systemLoad.memoryMB < 256 ? '#00cc44' : systemLoad.memoryMB <= 400 ? '#ffcc00' : '#ff3333';
          const uptimeH = Math.floor(systemLoad.uptime / 3600);
          const uptimeM = Math.floor((systemLoad.uptime % 3600) / 60);
          return (
            <>
              <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Tick</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: tickColor }}>{systemLoad.tickMs}ms</span></div>
              <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Obs/sec</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{systemLoad.observationsPerSec}</span></div>
              <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Tracks</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{systemLoad.tracksActive} active</span></div>
              <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>WS msg/sec</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{systemLoad.wsMessagesPerSec}</span></div>
              <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Memory</span><span style={{ fontFamily: 'monospace', fontSize: '12px', color: memColor }}>{systemLoad.memoryMB} MB</span></div>
              <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Uptime</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{uptimeH}h {uptimeM}m</span></div>
            </>
          );
        })()}
      </div>
      <FusionConfigPanel />
      <div style={{ marginBottom: '16px' }}>
        <div style={sectionTitle}>Build Info</div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Git SHA</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{__APP_REVISION__}</span></div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Branch</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{__BUILD_BRANCH__}</span></div>
        <div style={row}><span style={{ color: '#888', fontSize: '12px' }}>Built</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{__BUILD_TIMESTAMP__}</span></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EO Module Status Badge (REQ-16)
// ---------------------------------------------------------------------------

function EoModuleBadge() {
  const eoModuleStatus = useTaskStore(s => s.eoModuleStatus);
  if (!eoModuleStatus) return null;

  const modeColors: Record<string, string> = {
    idle: '#888',
    tracking: '#00cc44',
    searching: '#ffcc00',
    mixed: '#4a9eff',
  };

  const modeColor = modeColors[eoModuleStatus.mode] ?? '#888';
  const pipelineCount = eoModuleStatus.activePipelines.length;
  const subPixelCount = eoModuleStatus.activePipelines.filter(p => p.pipeline === 'sub-pixel').length;
  const imageCount = eoModuleStatus.activePipelines.filter(p => p.pipeline === 'image').length;

  const tooltipLines = [
    `EO Module: ${eoModuleStatus.mode}`,
    `Pipelines: ${pipelineCount} (${subPixelCount} sub-pixel, ${imageCount} image)`,
    `Enriched tracks: ${eoModuleStatus.enrichedTrackCount}`,
    `Ticks: ${eoModuleStatus.tickCount}`,
    `Sensors: ${eoModuleStatus.sensorAllocations.length}`,
  ];
  const allocByMode = eoModuleStatus.sensorAllocations.reduce(
    (acc, a) => { acc[a.mode] = (acc[a.mode] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  for (const [mode, count] of Object.entries(allocByMode)) {
    tooltipLines.push(`  ${mode}: ${count}`);
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: '#1a2a1a',
        border: `1px solid ${modeColor}44`,
        borderRadius: '3px',
        padding: '2px 8px',
        fontSize: '10px',
        fontWeight: 600,
        color: modeColor,
        cursor: 'help',
        letterSpacing: '0.3px',
      }}
      title={tooltipLines.join('\n')}
    >
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: modeColor,
        display: 'inline-block',
      }} />
      EO Module: {eoModuleStatus.mode}
      {pipelineCount > 0 && (
        <span style={{ color: '#aaa', fontWeight: 400 }}>
          ({pipelineCount})
        </span>
      )}
    </span>
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
  const [view, setView] = useState<'workstation' | 'editor' | 'deployment' | 'users'>('workstation');

  // ── Auth ────────────────────────────────────────────────────────────────
  const authEnabled = useAuthStore(s => s.authEnabled);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const authLoading = useAuthStore(s => s.isLoading);
  const authUser = useAuthStore(s => s.user);
  const authLogout = useAuthStore(s => s.logout);
  const checkAuthEnabled = useAuthStore(s => s.checkAuthEnabled);
  const checkSession = useAuthStore(s => s.checkSession);

  // ── ALL hooks must be above early returns (Rules of Hooks) ─────────────
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
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const injectionMode = useUiStore(s => s.injectionMode);
  const toggleInjectionMode = useUiStore(s => s.toggleInjectionMode);
  const darkMode = useUiStore(s => s.darkMode);
  const toggleDarkMode = useUiStore(s => s.toggleDarkMode);
  const showGroundTruth = useGroundTruthStore(s => s.showGroundTruth);
  const toggleGroundTruth = useGroundTruthStore(s => s.toggleGroundTruth);
  const simulationState = useUiStore(s => s.simulationState);
  const allowedActions = useUiStore(s => s.allowedActions);
  const rightPanelWidth = useUiStore(s => s.rightPanelWidth);
  const timelinePanelHeight = useUiStore(s => s.timelinePanelHeight);
  const setRightPanelWidth = useUiStore(s => s.setRightPanelWidth);
  const setTimelinePanelHeight = useUiStore(s => s.setTimelinePanelHeight);

  const setDemoMode = useUiStore(s => s.setDemoMode);
  const fetchRap = useTrackStore(s => s.fetchRap);
  const fetchSensors = useSensorStore(s => s.fetchSensors);
  const fetchTasks = useTaskStore(s => s.fetchTasks);
  const eoModuleStatus = useTaskStore(s => s.eoModuleStatus);
  const latency = useUiStore(s => s.latency);
  const systemLoad = useUiStore(s => s.systemLoad);
  const connectedUsers = useUiStore(s => s.connectedUsers);

  const effectiveRole = useUiStore(s => s.effectiveRole);
  const selectedRole = useUiStore(s => s.selectedRole);
  const setSelectedRole = useUiStore(s => s.setSelectedRole);

  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simElapsed, setSimElapsed] = useState(0);
  const [currentScenarioId, setCurrentScenarioId] = useState('');
  const [availableScenarios, setAvailableScenarios] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // On mount: check if auth is enabled, then check session
  useEffect(() => {
    (async () => {
      await checkAuthEnabled();
      const state = useAuthStore.getState();
      if (state.authEnabled) {
        await checkSession();
      }
    })();
  }, [checkAuthEnabled, checkSession]);

  // Sync demo mode to ui-store for convenience
  useEffect(() => { setDemoMode(demoActive); }, [demoActive, setDemoMode]);

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
  useEffect(() => { replayController.connect(useUiStore.getState().selectedRole); return () => replayController.disconnect(); }, []);

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

  // ── Auth early returns (AFTER all hooks) ─────────────────────────────
  if (authEnabled === null || authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0d1a', color: '#888', fontFamily: 'system-ui, sans-serif', fontSize: '14px' }}>
        Loading...
      </div>
    );
  }

  if (authEnabled && !isAuthenticated) {
    return <LoginPage />;
  }

  const basicHiddenPanels = demoActive && viewMode === 'basic' ? getBasicModeHiddenPanels() : [];

  if (view === 'editor') {
    return <ScenarioEditor onBack={() => setView('workstation')} />;
  }

  if (view === 'deployment') {
    return <DeploymentView onBack={() => setView('workstation')} />;
  }

  if (view === 'users') {
    return <UserManagementView onBack={() => setView('workstation')} />;
  }

  if (isMobile) return <MobileLayout />;

  // ─── Desktop Layout ───────────────────────────────────────────────────
  const showDetail = detailPanelOpen;
  const showInjection = injectionMode && ['running', 'paused', 'seeking'].includes(simulationState);
  const btn = btnBase(false);

  // ── Role gating ──────────────────────────────────────────────────────
  const isInstructor = authEnabled ? authUser?.role === 'instructor' : effectiveRole === 'instructor';

  const InstructorButton = ({ children, onClick, style, title, disabled, ...props }: any) => {
    const effectiveDisabled = !isInstructor || disabled;
    return (
      <button
        {...props}
        style={{
          ...style,
          opacity: effectiveDisabled ? 0.35 : (style?.opacity ?? 1),
          cursor: effectiveDisabled ? 'not-allowed' : (style?.cursor ?? 'pointer'),
        }}
        onClick={effectiveDisabled ? undefined : onClick}
        disabled={effectiveDisabled}
        title={!isInstructor ? 'Instructor role required' : title}
      >
        {children}
      </button>
    );
  };

  return (
    <div style={{
      display: 'grid',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: colors.bg,
      color: colors.text,
      overflow: 'hidden',
      gridTemplateRows: showInjection
        ? (timelinePanelOpen ? `40px auto 1fr 4px ${timelinePanelHeight}px` : '40px auto 1fr 32px')
        : (timelinePanelOpen ? `40px 1fr 4px ${timelinePanelHeight}px` : '40px 1fr 32px'),
      gridTemplateColumns: showDetail ? `1fr 4px ${rightPanelWidth}px` : '1fr',
      gridTemplateAreas: showDetail
        ? (showInjection
          ? (timelinePanelOpen
            ? `"header header header" "inject inject inject" "map vresize detail" "hresize hresize hresize" "timeline timeline timeline"`
            : `"header header header" "inject inject inject" "map vresize detail" "timeline timeline timeline"`)
          : (timelinePanelOpen
            ? `"header header header" "map vresize detail" "hresize hresize hresize" "timeline timeline timeline"`
            : `"header header header" "map vresize detail" "timeline timeline timeline"`))
        : (showInjection
          ? (timelinePanelOpen
            ? `"header" "inject" "map" "hresize" "timeline"`
            : `"header" "inject" "map" "timeline"`)
          : (timelinePanelOpen
            ? `"header" "map" "hresize" "timeline"`
            : `"header" "map" "timeline"`)),
    }}>
      {/* Header */}
      <header style={{ gridArea: 'header', background: colors.headerBg, display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px', fontSize: '13px', borderBottom: `1px solid ${colors.border}`, zIndex: 10 }}>

        {/* ── Left: Logo, version, revision ── */}
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '1px' }}>ELOC2</span>
        <span style={{ color: colors.textDim, fontSize: '12px' }}>EO C2 Air Defense Demonstrator</span>
        <span style={{ color: colors.accent, fontSize: '10px', fontFamily: 'monospace', cursor: 'help' }} title={`SHA: ${__APP_REVISION__}\nBranch: ${__BUILD_BRANCH__}\nBuilt: ${__BUILD_TIMESTAMP__}`}>rev:{__APP_REVISION__}</span>

        {/* ── Divider: Logo | Instructor Zone ── */}
        <div style={{ width: '1px', height: '24px', background: '#4a4a6e', margin: '0 8px' }} />

        {/* ── Center: Instructor Zone ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

          {/* Scenario selector */}
          {availableScenarios.length > 0 && (
            <select value={currentScenarioId} onChange={(e) => handleScenarioChange(e.target.value)}
              disabled={!isInstructor}
              title={!isInstructor ? 'Instructor role required' : 'Select scenario'}
              style={{ background: '#333', color: '#e0e0e0', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px', fontSize: '11px', maxWidth: '180px', opacity: !isInstructor ? 0.35 : 1, cursor: !isInstructor ? 'not-allowed' : 'pointer' }}>
              {availableScenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* Scenario controls: Start/Pause, Reset, Speed, elapsed */}
          {(() => {
            const canStart = allowedActions.includes('start') || allowedActions.includes('resume');
            const canPause = allowedActions.includes('pause');
            const startPauseBaseDisabled = simRunning ? !canPause : !canStart;
            const startPauseDisabled = !isInstructor || startPauseBaseDisabled;
            return (
              <InstructorButton
                style={{ ...btn, background: simRunning ? '#cc3300' : '#00aa44', color: '#fff', fontWeight: 600, padding: '3px 12px', opacity: startPauseBaseDisabled ? 0.4 : 1, cursor: startPauseBaseDisabled ? 'not-allowed' : 'pointer' }}
                onClick={startPauseBaseDisabled ? undefined : handleStartPause}
                disabled={startPauseBaseDisabled}
              >
                {simRunning ? 'Pause' : (simulationState === 'paused' ? 'Resume' : 'Start')}
              </InstructorButton>
            );
          })()}
          {(() => {
            const canReset = allowedActions.includes('reset');
            return (
              <InstructorButton
                style={{ ...btn, opacity: canReset ? 1 : 0.4, cursor: canReset ? 'pointer' : 'not-allowed' }}
                onClick={canReset ? handleReset : undefined}
                disabled={!canReset}
              >
                Reset
              </InstructorButton>
            );
          })()}
          {[1, 2, 5, 10].map(s => (
            <InstructorButton key={s} style={{ ...btn, background: simSpeed === s ? '#4a9eff' : '#333', color: simSpeed === s ? '#fff' : '#aaa' }} onClick={() => handleSpeed(s)}>{s}x</InstructorButton>
          ))}
          <span style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace', minWidth: '50px' }}>T+{formatTime(simElapsed)}</span>

          {/* State badge */}
          <span style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: '3px',
            background: simulationState === 'running' ? '#00aa4422' : simulationState === 'paused' ? '#ffcc0022' : '#88888822',
            color: simulationState === 'running' ? '#00cc44' : simulationState === 'paused' ? '#ffcc00' : '#888',
            border: `1px solid ${simulationState === 'running' ? '#00cc4444' : simulationState === 'paused' ? '#ffcc0044' : '#88888844'}`,
          }}>
            {simulationState}
          </span>

          {/* Editor */}
          <InstructorButton style={{ ...btn, background: '#2a2a4e', color: '#aa88ff', border: '1px solid #aa88ff44' }} onClick={() => setView('editor')}>Editor</InstructorButton>

          {/* Deploy */}
          <InstructorButton style={{ ...btn, background: '#2a2a4e', color: '#44ddaa', border: '1px solid #44ddaa44' }} onClick={() => setView('deployment')}>Deploy</InstructorButton>

          {/* Demo */}
          <InstructorButton
            style={{ ...btn, background: demoActive ? '#4a9eff' : '#2a2a4e', color: demoActive ? '#fff' : '#4a9eff', border: '1px solid #4a9eff44' }}
            onClick={() => {
              if (demoActive) {
                setDemoActive(false);
                setDashboardOpen(false);
              } else {
                setDemoActive(true);
                setDashboardOpen(true);
              }
            }}
            title="Presenter Dashboard (Ctrl+D)"
          >Demo</InstructorButton>

          {/* Live Inject */}
          {simulationState !== 'idle' && (
            <InstructorButton
              style={{ ...btn, background: injectionMode ? '#ff8800' : '#333', color: injectionMode ? '#fff' : '#aaa', border: injectionMode ? '1px solid #ff880066' : 'none', fontWeight: injectionMode ? 600 : 400 }}
              onClick={toggleInjectionMode}
              title="Toggle live injection toolbar (Ctrl+I)"
            >
              Live Inject
            </InstructorButton>
          )}

          {/* GT (Ground Truth) toggle */}
          <InstructorButton style={{ ...btn, background: showGroundTruth ? '#0a2a2a' : '#333', color: showGroundTruth ? '#00ffff' : '#aaa', border: showGroundTruth ? '1px solid #00ffff' : '1px solid transparent' }} onClick={toggleGroundTruth} title="Toggle ground truth overlay">
            GT
          </InstructorButton>
        </div>

        {/* ── Divider: Instructor Zone | Common Zone ── */}
        <div style={{ width: '1px', height: '24px', background: '#4a4a6e', margin: '0 8px' }} />

        {/* ── Right: Common Zone ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', fontSize: '11px', color: colors.textDim }}>

          {/* Track summary with filter toggles */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px' }}>
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

          {/* EO Module badge (REQ-16) */}
          <EoModuleBadge />

          {/* Panel toggle buttons */}
          <button style={{ ...btn, background: detailView === 'tasks' && detailPanelOpen ? '#4a9eff' : '#333', color: detailView === 'tasks' && detailPanelOpen ? '#fff' : '#aaa' }}
            onClick={() => {
              const store = useUiStore.getState();
              if (store.detailView === 'tasks' && store.detailPanelOpen) {
                store.setDetailView('none');
              } else {
                store.setDetailView('tasks');
              }
            }}>Tasks</button>
          <button style={{ ...btn, background: detailView === 'investigation' && detailPanelOpen ? '#4a9eff' : '#333', color: detailView === 'investigation' && detailPanelOpen ? '#fff' : '#aaa' }}
            onClick={() => {
              const store = useUiStore.getState();
              if (store.detailView === 'investigation' && store.detailPanelOpen) {
                store.setDetailView('none');
              } else {
                store.setDetailView('investigation');
              }
            }}>Investigation</button>
          <button style={{ ...btn, background: detailView === 'quality' && detailPanelOpen ? '#4a9eff' : '#333', color: detailView === 'quality' && detailPanelOpen ? '#fff' : '#aaa' }}
            onClick={() => {
              const store = useUiStore.getState();
              if (store.detailView === 'quality' && store.detailPanelOpen) {
                store.setDetailView('none');
              } else {
                store.setDetailView('quality');
              }
            }}>Quality</button>

          {/* Dark/Light toggle */}
          <button style={{ ...btn, background: darkMode ? '#4a9eff' : '#333', color: darkMode ? '#fff' : '#aaa' }} onClick={toggleDarkMode} title="Toggle dark/light map">
            {darkMode ? 'Dark' : 'Light'}
          </button>

          {/* Show/Hide Panel */}
          <button style={btn} onClick={toggleDetailPanel}>{showDetail ? 'Hide Panel' : 'Show Panel'}</button>

          {/* Show/Hide Timeline */}
          <button style={btn} onClick={toggleTimelinePanel}>{timelinePanelOpen ? 'Hide Timeline' : 'Show Timeline'}</button>

          {/* Report */}
          <button
            style={{ ...btn, background: '#2a4e2a', color: '#88ff88', border: '1px solid #88ff8844' }}
            onClick={() => setReportModalOpen(true)}
            title="Generate scenario report (PDF)"
          >Report</button>

          {/* Help */}
          <button style={{ ...btn, background: '#333', color: '#aaa' }} onClick={() => setHelpOpen(true)} title="Open help & reference documentation">Help</button>

          {/* Connection status */}
          <span><span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: wsConnected ? '#00cc44' : '#ff3333', marginRight: '4px' }} />{wsConnected ? 'Connected' : 'Disconnected'}</span>

          {/* Role display */}
          {authEnabled && authUser && (
            <>
              <span style={{ fontSize: '10px', color: '#aaa' }} title={`Role: ${authUser.role}`}>
                {authUser.username}
                <span style={{ marginLeft: '4px', padding: '1px 4px', borderRadius: '2px', fontSize: '9px', fontWeight: 600, background: authUser.role === 'instructor' ? '#4a9eff22' : '#ff880022', color: authUser.role === 'instructor' ? '#4a9eff' : '#ff8800', border: `1px solid ${authUser.role === 'instructor' ? '#4a9eff44' : '#ff880044'}` }}>
                  {authUser.role}
                </span>
              </span>
              <button style={{ ...btn, color: '#ff6666', fontSize: '10px' }} onClick={authLogout} title="Sign out">Logout</button>
            </>
          )}
          {!authEnabled && (
            <select
              value={selectedRole}
              onChange={(e) => {
                const role = e.target.value as 'instructor' | 'operator';
                setSelectedRole(role);
                replayController.reconnectWithRole(role);
              }}
              style={{ background: '#333', color: '#e0e0e0', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px', fontSize: '11px' }}
              title="Select your role"
            >
              <option value="operator">Operator</option>
              <option value="instructor">Instructor</option>
            </select>
          )}

          {/* Version label */}
          <span style={{ fontSize: '10px', opacity: 0.5 }} title="ELOC2 Air Defense Demonstrator">v0.3.0</span>
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

      {/* Vertical Resize Handle (between map and detail panel) */}
      {showDetail && (
        <ResizeHandle
          direction="vertical"
          gridArea="vresize"
          currentSize={rightPanelWidth}
          onResize={setRightPanelWidth}
          onReset={() => setRightPanelWidth(DEFAULT_RIGHT_PANEL_WIDTH)}
        />
      )}

      {/* Detail Panel */}
      {showDetail && (
        <div style={{ gridArea: 'detail', background: colors.panelBg, borderLeft: `1px solid ${colors.border}`, overflowY: 'auto', overflowX: 'hidden' }}>
          {detailView === 'track' && <TrackDetailPanel />}
          {detailView === 'sensor' && <SensorDetailPanel />}
          {!basicHiddenPanels.includes('tasks') && detailView === 'tasks' && <TaskPanel />}
          {!basicHiddenPanels.includes('investigation') && detailView === 'investigation' && <InvestigationManagerPanel />}
          {detailView === 'eo-window' && <InvestigationWindowPanel />}
          {detailView === 'cue' && <CueDetailPanel />}
          {detailView === 'group' && <GroupDetailPanel />}
          {detailView === 'geometry' && <GeometryDetailPanel />}
          {detailView === 'quality' && <QualityMetricsPanel />}
          {detailView === 'ground-truth' && <GroundTruthDetailPanel />}
          {(detailView === 'none' || (basicHiddenPanels.includes(detailView))) && <DefaultPanel />}
        </div>
      )}

      {/* Horizontal Resize Handle (between map and timeline) */}
      {timelinePanelOpen && (
        <ResizeHandle
          direction="horizontal"
          gridArea="hresize"
          currentSize={timelinePanelHeight}
          onResize={setTimelinePanelHeight}
          onReset={() => setTimelinePanelHeight(DEFAULT_TIMELINE_HEIGHT)}
        />
      )}

      {/* Timeline */}
      <div style={{ gridArea: 'timeline', background: colors.headerBg, borderTop: timelinePanelOpen ? 'none' : `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {timelinePanelOpen ? <TimelinePanel /> : (
          <div style={{ padding: '6px 16px', fontSize: '12px', color: '#666' }}>Timeline (collapsed) — click Show Timeline to expand</div>
        )}
      </div>

      {/* Demo mode overlays */}
      {demoActive && <AnnotationOverlay />}
      {demoActive && <NarrationPanel />}
      {demoActive && <MetricsOverlay />}
      {dashboardOpen && <PresenterDashboard onClose={() => setDashboardOpen(false)} />}
      {helpOpen && <HelpPage onClose={() => setHelpOpen(false)} />}
      <ReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        isInstructor={!!isInstructor}
        simElapsed={simElapsed}
      />
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
  const simulationState = useUiStore(s => s.simulationState);
  const allowedActions = useUiStore(s => s.allowedActions);

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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{
              fontSize: '8px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '1px 4px', borderRadius: '2px',
              background: simulationState === 'running' ? '#00aa4422' : simulationState === 'paused' ? '#ffcc0022' : '#88888822',
              color: simulationState === 'running' ? '#00cc44' : simulationState === 'paused' ? '#ffcc00' : '#888',
            }}>{simulationState}</span>
            {(() => {
              const canStart = allowedActions.includes('start') || allowedActions.includes('resume');
              const canPause = allowedActions.includes('pause');
              const disabled = simRunning ? !canPause : !canStart;
              return (
                <button style={{ ...btn, background: simRunning ? '#cc3300' : '#00aa44', color: '#fff', fontWeight: 600, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }} onClick={disabled ? undefined : handleStartPause} disabled={disabled}>
                  {simRunning ? 'Pause' : (simulationState === 'paused' ? 'Resume' : 'Start')}
                </button>
              );
            })()}
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
              {(() => {
                const canReset = allowedActions.includes('reset');
                return <button style={{ ...btn, opacity: canReset ? 1 : 0.4, cursor: canReset ? 'pointer' : 'not-allowed' }} onClick={canReset ? handleReset : undefined} disabled={!canReset}>Reset</button>;
              })()}
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
            {detailView === 'eo-window' && <InvestigationWindowPanel />}
            {detailView === 'cue' && <CueDetailPanel />}
            {detailView === 'group' && <GroupDetailPanel />}
            {detailView === 'geometry' && <GeometryDetailPanel />}
            {detailView === 'quality' && <QualityMetricsPanel />}
            {detailView === 'ground-truth' && <GroundTruthDetailPanel />}
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
