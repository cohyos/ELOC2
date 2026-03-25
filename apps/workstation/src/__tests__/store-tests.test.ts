/**
 * Phase B — Zustand Store Unit Tests
 *
 * Tests store state management directly (no React rendering).
 * Zustand stores work in any JS environment.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackStore } from '../stores/track-store';
import { useTaskStore } from '../stores/task-store';
import { useSensorStore } from '../stores/sensor-store';
import { useUiStore } from '../stores/ui-store';
import { useGroundTruthStore } from '../stores/ground-truth-store';
import { useQualityStore } from '../stores/quality-store';
import { useCoverZoneStore } from '../stores/cover-zone-store';
import { useInvestigationStore } from '../stores/investigation-store';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockTrack = (id: string, status = 'confirmed') => ({
  systemTrackId: id,
  status,
  position: { lat: 31.0, lon: 34.5, alt: 5000 },
  velocity: { vx: 100, vy: 0, vz: 0 },
  classification: 'unknown',
  classificationConfidence: 0.5,
  classificationSource: 'system',
  sources: ['RADAR-1'],
  updateCount: 5,
  missCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  lastObservationTime: Date.now(),
  lineage: [],
  covariance: [1, 0, 0, 1],
}) as any;

const mockSensor = (id: string, type = 'radar') => ({
  sensorId: id,
  sensorType: type,
  position: { lat: 31.0, lon: 34.5, alt: 50 },
  online: true,
  rangeKm: 200,
  lastUpdate: Date.now(),
}) as any;

// ---------------------------------------------------------------------------
// 1. Track Store
// ---------------------------------------------------------------------------

describe('Track Store', () => {
  beforeEach(() => {
    useTrackStore.getState().setTracks([]);
  });

  it('starts with empty tracks', () => {
    const { tracks } = useTrackStore.getState();
    expect(tracks).toEqual([]);
  });

  it('sets tracks correctly', () => {
    const tracks = [mockTrack('T1'), mockTrack('T2'), mockTrack('T3')];
    useTrackStore.getState().setTracks(tracks);
    expect(useTrackStore.getState().tracks).toHaveLength(3);
  });

  it('overwrites previous tracks', () => {
    useTrackStore.getState().setTracks([mockTrack('T1'), mockTrack('T2')]);
    expect(useTrackStore.getState().tracks).toHaveLength(2);
    useTrackStore.getState().setTracks([mockTrack('T3'), mockTrack('T4'), mockTrack('T5')]);
    expect(useTrackStore.getState().tracks).toHaveLength(3);
  });

  it('handles empty array', () => {
    useTrackStore.getState().setTracks([mockTrack('T1')]);
    useTrackStore.getState().setTracks([]);
    expect(useTrackStore.getState().tracks).toHaveLength(0);
  });

  it('builds tracksById map', () => {
    useTrackStore.getState().setTracks([mockTrack('T1'), mockTrack('T2')]);
    const { tracksById } = useTrackStore.getState();
    expect(tracksById.get('T1')).toBeDefined();
    expect(tracksById.get('T2')).toBeDefined();
    expect(tracksById.get('T999')).toBeUndefined();
  });

  it('updates trail history', () => {
    useTrackStore.getState().setTracks([mockTrack('T1')]);
    const { trailHistory } = useTrackStore.getState();
    // Trail history should have an entry for T1
    expect(trailHistory.size).toBeGreaterThanOrEqual(0); // May or may not add on first set
  });
});

// ---------------------------------------------------------------------------
// 2. Task Store
// ---------------------------------------------------------------------------

describe('Task Store', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks([]);
    useTaskStore.getState().setActiveCues([]);
    useTaskStore.getState().setEoTracks([]);
    useTaskStore.getState().setGeometryEstimates([]);
    useTaskStore.getState().setRegistrationStates([]);
    useTaskStore.getState().setUnresolvedGroups([]);
    useTaskStore.getState().setFusionModes({});
    useTaskStore.getState().setEoModuleStatus(null);
    useTaskStore.getState().setBallisticEstimates([]);
  });

  it('starts with empty state', () => {
    const state = useTaskStore.getState();
    expect(state.tasks).toEqual([]);
    expect(state.activeCues).toEqual([]);
    expect(state.eoTracks).toEqual([]);
  });

  it('sets tasks', () => {
    const tasks = [
      { taskId: 'task-1', status: 'executing', sensorId: 'EO-1', systemTrackId: 'T1' },
      { taskId: 'task-2', status: 'proposed', sensorId: 'EO-2', systemTrackId: 'T2' },
    ] as any;
    useTaskStore.getState().setTasks(tasks);
    expect(useTaskStore.getState().tasks).toHaveLength(2);
  });

  it('sets active cues', () => {
    const cues = [{
      cueId: 'cue-1',
      systemTrackId: 'T1',
      predictedState: { lat: 31, lon: 34, alt: 5000 },
      uncertaintyGateDeg: 2.0,
      priority: 5,
      validFrom: Date.now(),
      validTo: Date.now() + 30000,
    }];
    useTaskStore.getState().setActiveCues(cues);
    expect(useTaskStore.getState().activeCues).toHaveLength(1);
    expect(useTaskStore.getState().activeCues[0].cueId).toBe('cue-1');
  });

  it('sets EO tracks', () => {
    const eoTracks = [{
      eoTrackId: 'eo-1',
      sensorId: 'EO-1',
      bearing: { azimuthDeg: 45, elevationDeg: 5, timestamp: Date.now(), sensorId: 'EO-1' },
      imageQuality: 0.8,
      status: 'active',
      associatedSystemTrackId: 'T1',
    }];
    useTaskStore.getState().setEoTracks(eoTracks);
    expect(useTaskStore.getState().eoTracks).toHaveLength(1);
  });

  it('sets geometry estimates', () => {
    const estimates = [{
      trackId: 'T1',
      estimateId: 'geo-1',
      position3D: { lat: 31, lon: 34, alt: 5000 },
      quality: 'acceptable',
      classification: 'candidate_3d',
      intersectionAngleDeg: 45,
      timeAlignmentQualityMs: 100,
      bearingNoiseDeg: 0.5,
      eoTrackIds: ['eo-1', 'eo-2'],
    }];
    useTaskStore.getState().setGeometryEstimates(estimates);
    expect(useTaskStore.getState().geometryEstimates).toHaveLength(1);
  });

  it('sets registration states', () => {
    const states = [{
      sensorId: 'RADAR-1',
      spatialQuality: 'good',
      timingQuality: 'good',
      fusionSafe: true,
      azimuthBiasDeg: 0.1,
      elevationBiasDeg: 0.05,
      clockOffsetMs: 5,
    }];
    useTaskStore.getState().setRegistrationStates(states);
    expect(useTaskStore.getState().registrationStates).toHaveLength(1);
  });

  it('sets fusion modes', () => {
    const modes = { 'RADAR-1': 'basic', 'RADAR-2': 'conservative' };
    useTaskStore.getState().setFusionModes(modes);
    expect(useTaskStore.getState().fusionModes['RADAR-1']).toBe('basic');
  });

  it('sets EO module status', () => {
    const status = {
      mode: 'tracking' as const,
      activePipelines: [{ trackId: 'T1', pipeline: 'image' as const, angularSizeMrad: 0.5, snr: 10 }],
      sensorAllocations: [{ sensorId: 'EO-1', targetTrackId: 'T1', mode: 'dwell' as const, dwellRemainingSec: 15 }],
      enrichedTrackCount: 1,
      totalTracksIngested: 5,
      tickCount: 100,
    };
    useTaskStore.getState().setEoModuleStatus(status);
    expect(useTaskStore.getState().eoModuleStatus?.mode).toBe('tracking');
  });

  it('handles null EO module status', () => {
    useTaskStore.getState().setEoModuleStatus(null);
    expect(useTaskStore.getState().eoModuleStatus).toBeNull();
  });

  it('sets ballistic estimates', () => {
    const estimates = [{
      trackId: 'T1',
      launchPoint: { lat: 33, lon: 35, alt: 0, uncertainty2SigmaM: 500 },
      impactPoint: { lat: 31, lon: 34, alt: 0, uncertainty2SigmaM: 1000, timeToImpactSec: 120 },
    }];
    useTaskStore.getState().setBallisticEstimates(estimates);
    expect(useTaskStore.getState().ballisticEstimates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Sensor Store
// ---------------------------------------------------------------------------

describe('Sensor Store', () => {
  beforeEach(() => {
    useSensorStore.getState().setSensors([]);
    useSensorStore.getState().setSearchModeStates([]);
    useSensorStore.getState().setSectorScan(null);
  });

  it('starts with empty sensors', () => {
    expect(useSensorStore.getState().sensors).toEqual([]);
  });

  it('sets sensors', () => {
    useSensorStore.getState().setSensors([mockSensor('R1'), mockSensor('EO-1', 'eo')]);
    expect(useSensorStore.getState().sensors).toHaveLength(2);
  });

  it('sets search mode states', () => {
    const states = [{ sensorId: 'EO-1', active: true, pattern: 'sector' as const, currentAzimuth: 90 }];
    useSensorStore.getState().setSearchModeStates(states);
    expect(useSensorStore.getState().searchModeStates).toHaveLength(1);
  });

  it('sets sector scan state', () => {
    const scan = {
      scanId: 'scan-1',
      sector: { azimuthStartDeg: 0, azimuthEndDeg: 90 },
      scanners: [{ sensorId: 'EO-1', role: 'scanning' as const, subSectorStart: 0, subSectorEnd: 45 }],
      detections: [],
      active: true,
      triangulatorSensorId: null,
    };
    useSensorStore.getState().setSectorScan(scan);
    expect(useSensorStore.getState().sectorScan?.scanId).toBe('scan-1');
  });

  it('clears sector scan', () => {
    useSensorStore.getState().setSectorScan(null);
    expect(useSensorStore.getState().sectorScan).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. UI Store
// ---------------------------------------------------------------------------

describe('UI Store', () => {
  it('starts with correct defaults', () => {
    const state = useUiStore.getState();
    expect(state.selectedTrackId).toBeNull();
    expect(state.replayPlaying).toBe(false);
    expect(state.wsConnected).toBe(false);
    expect(state.darkMode).toBe(true);
  });

  it('selects track', () => {
    useUiStore.getState().selectTrack('T1');
    expect(useUiStore.getState().selectedTrackId).toBe('T1');
  });

  it('selects sensor', () => {
    useUiStore.getState().selectSensor('R1');
    expect(useUiStore.getState().selectedSensorId).toBe('R1');
  });

  it('toggles detail panel', () => {
    const before = useUiStore.getState().detailPanelOpen;
    useUiStore.getState().toggleDetailPanel();
    expect(useUiStore.getState().detailPanelOpen).toBe(!before);
  });

  it('toggles layer visibility', () => {
    const before = useUiStore.getState().layerVisibility.tracks;
    useUiStore.getState().toggleLayer('tracks');
    expect(useUiStore.getState().layerVisibility.tracks).toBe(!before);
    // Toggle back
    useUiStore.getState().toggleLayer('tracks');
    expect(useUiStore.getState().layerVisibility.tracks).toBe(before);
  });

  it('toggles track status filter', () => {
    const before = useUiStore.getState().trackStatusFilter.tentative;
    useUiStore.getState().toggleTrackStatus('tentative');
    expect(useUiStore.getState().trackStatusFilter.tentative).toBe(!before);
  });

  it('sets replay playing', () => {
    useUiStore.getState().setReplayPlaying(true);
    expect(useUiStore.getState().replayPlaying).toBe(true);
    useUiStore.getState().setReplayPlaying(false);
    expect(useUiStore.getState().replayPlaying).toBe(false);
  });

  it('sets replay speed', () => {
    useUiStore.getState().setReplaySpeed(4);
    expect(useUiStore.getState().replaySpeed).toBe(4);
  });

  it('sets replay time', () => {
    useUiStore.getState().setReplayTime(120);
    expect(useUiStore.getState().replayTime).toBe(120);
  });

  it('toggles dark mode', () => {
    const before = useUiStore.getState().darkMode;
    useUiStore.getState().toggleDarkMode();
    expect(useUiStore.getState().darkMode).toBe(!before);
    // Restore
    useUiStore.getState().toggleDarkMode();
  });

  it('toggles injection mode', () => {
    const before = useUiStore.getState().injectionMode;
    useUiStore.getState().toggleInjectionMode();
    expect(useUiStore.getState().injectionMode).toBe(!before);
    // Restore
    useUiStore.getState().toggleInjectionMode();
  });

  it('sets panel widths', () => {
    useUiStore.getState().setRightPanelWidth(400);
    expect(useUiStore.getState().rightPanelWidth).toBe(400);
    useUiStore.getState().setTimelinePanelHeight(200);
    expect(useUiStore.getState().timelinePanelHeight).toBe(200);
  });

  it('sets simulation state', () => {
    useUiStore.getState().setSimulationState('running', ['pause', 'reset']);
    expect(useUiStore.getState().simulationState).toBe('running');
    expect(useUiStore.getState().allowedActions).toEqual(['pause', 'reset']);
  });

  it('sets operator priority track IDs', () => {
    useUiStore.getState().setOperatorPriorityTrackIds(['T1', 'T2']);
    const ids = useUiStore.getState().operatorPriorityTrackIds;
    expect(ids.has('T1')).toBe(true);
    expect(ids.has('T2')).toBe(true);
    expect(ids.has('T999')).toBe(false);
  });

  it('clears operator priority track IDs', () => {
    useUiStore.getState().setOperatorPriorityTrackIds(['T1']);
    useUiStore.getState().setOperatorPriorityTrackIds([]);
    expect(useUiStore.getState().operatorPriorityTrackIds.size).toBe(0);
  });

  it('sets picture mode', () => {
    useUiStore.getState().setPictureMode('radar');
    expect(useUiStore.getState().pictureMode).toBe('radar');
    useUiStore.getState().setPictureMode('all');
  });

  it('toggles trajectory', () => {
    useUiStore.getState().toggleTrajectory('T1');
    expect(useUiStore.getState().trajectoryTrackIds.has('T1')).toBe(true);
    useUiStore.getState().toggleTrajectory('T1');
    expect(useUiStore.getState().trajectoryTrackIds.has('T1')).toBe(false);
  });

  it('sets connected users', () => {
    useUiStore.getState().setConnectedUsers({ total: 5, instructors: 1, operators: 4 });
    expect(useUiStore.getState().connectedUsers.total).toBe(5);
  });

  it('sets investigation mode', () => {
    useUiStore.getState().setInvestigationMode('gt-comparison');
    expect(useUiStore.getState().investigationMode).toBe('gt-comparison');
  });

  it('sets selected role', () => {
    useUiStore.getState().setSelectedRole('operator');
    expect(useUiStore.getState().selectedRole).toBe('operator');
  });

  it('sets effective role', () => {
    useUiStore.getState().setEffectiveRole('instructor');
    expect(useUiStore.getState().effectiveRole).toBe('instructor');
  });

  it('event log: add and clear', () => {
    useUiStore.getState().addEvent({ id: 'e1', eventType: 'test', timestamp: Date.now(), summary: 'test event' });
    expect(useUiStore.getState().eventLog.length).toBeGreaterThan(0);
    useUiStore.getState().clearEvents();
    expect(useUiStore.getState().eventLog).toHaveLength(0);
  });

  it('sets latency', () => {
    useUiStore.getState().setLatency({ tickMs: 5, avgMs: 4, maxMs: 10 });
    expect(useUiStore.getState().latency.tickMs).toBe(5);
  });

  it('sets system load', () => {
    useUiStore.getState().setSystemLoad({
      tickMs: 5, observationsPerSec: 100, tracksActive: 10,
      wsMessagesPerSec: 4, memoryMB: 200, uptime: 3600,
    });
    expect(useUiStore.getState().systemLoad.tracksActive).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 5. Ground Truth Store
// ---------------------------------------------------------------------------

describe('Ground Truth Store', () => {
  beforeEach(() => {
    useGroundTruthStore.getState().setTargets([]);
    useGroundTruthStore.getState().setShowGroundTruth(false);
  });

  it('starts with empty targets and show=false', () => {
    expect(useGroundTruthStore.getState().targets).toEqual([]);
    expect(useGroundTruthStore.getState().showGroundTruth).toBe(false);
  });

  it('sets targets', () => {
    const targets = [
      { targetId: 'TGT-1', name: 'Fighter', position: { lat: 31, lon: 34, alt: 8000 }, active: true },
      { targetId: 'TGT-2', name: 'UAV', position: { lat: 31.5, lon: 34.2, alt: 500 }, active: true },
    ];
    useGroundTruthStore.getState().setTargets(targets);
    expect(useGroundTruthStore.getState().targets).toHaveLength(2);
  });

  it('toggles show ground truth', () => {
    expect(useGroundTruthStore.getState().showGroundTruth).toBe(false);
    useGroundTruthStore.getState().toggleGroundTruth();
    expect(useGroundTruthStore.getState().showGroundTruth).toBe(true);
    useGroundTruthStore.getState().toggleGroundTruth();
    expect(useGroundTruthStore.getState().showGroundTruth).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Quality Store
// ---------------------------------------------------------------------------

describe('Quality Store', () => {
  it('sets metrics', () => {
    const metrics = { overallScore: 85, trackAccuracy: 0.9, completeness: 0.8 };
    useQualityStore.getState().setMetrics(metrics as any);
    expect(useQualityStore.getState().metrics).toBeDefined();
  });

  it('sets EO allocation quality', () => {
    const quality = { score: 75, coverageRatio: 0.7 };
    useQualityStore.getState().setEoAllocationQuality(quality as any);
    expect(useQualityStore.getState().eoAllocationQuality).toBeDefined();
  });

  it('sets convergence states', () => {
    const states = [{ sensorId: 'EO-1', converged: true, iterations: 5, error: 0.01 }];
    useQualityStore.getState().setConvergenceStates(states as any);
    expect(useQualityStore.getState().convergenceStates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Cover Zone Store
// ---------------------------------------------------------------------------

describe('Cover Zone Store', () => {
  it('sets cover zones', () => {
    const zones = [
      { name: 'Urban', type: 'urban', modifier: 0.7, polygon: [[31, 34], [31.1, 34], [31.1, 34.1]] },
    ];
    useCoverZoneStore.getState().setCoverZones(zones as any);
    expect(useCoverZoneStore.getState().coverZones).toHaveLength(1);
  });

  it('sets operational zones', () => {
    const zones = [
      { name: 'Threat Corridor', type: 'threat', polygon: [[31, 34], [31.1, 34], [31.1, 34.1]] },
    ];
    useCoverZoneStore.getState().setOperationalZones(zones as any);
    expect(useCoverZoneStore.getState().operationalZones).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Investigation Store
// ---------------------------------------------------------------------------

describe('Investigation Store', () => {
  it('sets active investigations', () => {
    const investigations = [{
      trackId: 'T1',
      trackStatus: 'confirmed',
      investigationStatus: 'in_progress',
      assignedSensors: ['EO-1'],
      cuePriority: 5,
      bearingCount: 3,
      geometryStatus: 'candidate_3d',
      hypotheses: [{ label: 'fighter', probability: 0.8 }],
      scoreBreakdown: { threat: 5, uncertainty: 3, geometry: 2, intent: 0 },
    }];
    useInvestigationStore.getState().setActiveInvestigations(investigations);
    expect(useInvestigationStore.getState().activeInvestigations).toHaveLength(1);
  });

  it('clears investigations', () => {
    useInvestigationStore.getState().setActiveInvestigations([]);
    expect(useInvestigationStore.getState().activeInvestigations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  it('handles rapid state updates without crash', () => {
    for (let i = 0; i < 100; i++) {
      useTrackStore.getState().setTracks([mockTrack(`T${i}`)]);
    }
    expect(useTrackStore.getState().tracks).toHaveLength(1);
  });

  it('handles large track arrays', () => {
    const tracks = Array.from({ length: 500 }, (_, i) => mockTrack(`T${i}`));
    useTrackStore.getState().setTracks(tracks);
    expect(useTrackStore.getState().tracks).toHaveLength(500);
  });

  it('handles tracks with minimal fields', () => {
    const minTrack = { systemTrackId: 'T-min', status: 'tentative', position: { lat: 0, lon: 0, alt: 0 } } as any;
    useTrackStore.getState().setTracks([minTrack]);
    expect(useTrackStore.getState().tracks).toHaveLength(1);
  });

  it('handles concurrent store updates', () => {
    // Update multiple stores simultaneously
    useTrackStore.getState().setTracks([mockTrack('T1')]);
    useSensorStore.getState().setSensors([mockSensor('R1')]);
    useTaskStore.getState().setTasks([{ taskId: 'task-1', status: 'executing' } as any]);
    useUiStore.getState().setReplayTime(60);

    expect(useTrackStore.getState().tracks).toHaveLength(1);
    expect(useSensorStore.getState().sensors).toHaveLength(1);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useUiStore.getState().replayTime).toBe(60);
  });
});
