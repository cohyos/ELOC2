import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Editor types
// ---------------------------------------------------------------------------

export interface EditorSensor {
  id: string;
  type: 'radar' | 'eo' | 'c4isr';
  lat: number;
  lon: number;
  alt: number;
  azMin: number;
  azMax: number;
  elMin: number;
  elMax: number;
  rangeMaxKm: number;
  fovHalfAngleH?: number; // EO only
  fovHalfAngleV?: number;
  slewRateDegSec?: number;
  initialGimbalAz?: number;
  template?: string;
  nickname?: string;
  libraryId?: string;
}

export interface EditorTarget {
  id: string;
  label: string;
  rcs: number;
  waypoints: EditorWaypoint[];
  nickname?: string;
  irEmission?: number;
  classification?: string;
  libraryId?: string;
}

export interface EditorWaypoint {
  lat: number;
  lon: number;
  alt: number;
  speedMs: number;
  arrivalTimeSec: number;
}

export interface EditorFault {
  id: string;
  type: 'azimuth_bias' | 'clock_drift' | 'sensor_outage';
  sensorId: string;
  startTimeSec: number;
  endTimeSec: number;
  magnitude?: number;
}

export interface EditorAction {
  id: string;
  type: 'reserve_sensor' | 'veto_assignment';
  timeSec: number;
  sensorId?: string;
  targetId?: string;
  durationSec?: number;
}

// ---------------------------------------------------------------------------
// Zone types
// ---------------------------------------------------------------------------

export interface GeoVertex {
  lat: number;
  lon: number;
}

export type ZoneDrawMode = 'operational-area' | 'exclusion-zone' | 'threat-zone';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface EditorState {
  scenarioName: string;
  description: string;
  duration: number;
  policyMode: 'recommended_only' | 'auto_with_veto' | 'manual';
  sensors: EditorSensor[];
  targets: EditorTarget[];
  faults: EditorFault[];
  actions: EditorAction[];
  selectedItemType: 'sensor' | 'target' | null;
  selectedItemId: string | null;
  editMode: 'select' | 'place-sensor' | 'place-waypoint' | 'draw-zone';
  validationResult: { errors: string[]; warnings: string[] } | null;
  activeTargetId: string | null;

  // Zones (ED-2)
  operationalArea: GeoVertex[];
  exclusionZones: GeoVertex[][];
  threatZones: GeoVertex[][];
  zoneDrawMode: ZoneDrawMode | null;
  zoneDrawVertices: GeoVertex[];

  // CRUD actions
  addSensor: (sensor: EditorSensor) => void;
  removeSensor: (id: string) => void;
  updateSensor: (id: string, updates: Partial<EditorSensor>) => void;
  selectItem: (type: 'sensor' | 'target' | null, id: string | null) => void;
  setEditMode: (mode: EditorState['editMode']) => void;
  setScenarioName: (name: string) => void;
  setDescription: (desc: string) => void;
  setDuration: (dur: number) => void;
  setPolicyMode: (mode: EditorState['policyMode']) => void;
  setValidationResult: (result: EditorState['validationResult']) => void;
  reset: () => void;

  // Target/waypoint actions
  addTarget: (target: EditorTarget) => void;
  removeTarget: (id: string) => void;
  updateTarget: (id: string, updates: Partial<EditorTarget>) => void;
  addWaypoint: (targetId: string, waypoint: EditorWaypoint) => void;
  removeWaypoint: (targetId: string, waypointIndex: number) => void;
  updateWaypoint: (targetId: string, waypointIndex: number, updates: Partial<EditorWaypoint>) => void;
  setActiveTargetId: (id: string | null) => void;

  addFault: (fault: EditorFault) => void;
  removeFault: (id: string) => void;
  updateFault: (id: string, updates: Partial<EditorFault>) => void;
  addAction: (action: EditorAction) => void;
  removeAction: (id: string) => void;
  updateAction: (id: string, updates: Partial<EditorAction>) => void;
  buildScenarioDefinition: () => ScenarioExport;
  loadFromScenarioDefinition: (def: ScenarioExport) => void;

  // Zone actions (ED-2)
  setOperationalArea: (vertices: GeoVertex[]) => void;
  addExclusionZone: (vertices: GeoVertex[]) => void;
  addThreatZone: (vertices: GeoVertex[]) => void;
  clearZones: () => void;
  startZoneDraw: (mode: ZoneDrawMode) => void;
  addZoneVertex: (vertex: GeoVertex) => void;
  finishZoneDraw: () => void;
  cancelZoneDraw: () => void;
}

/** Shape matching ScenarioDefinition from scenario-library */
export interface ScenarioExport {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  policyMode: string;
  sensors: Array<{
    sensorId: string;
    type: string;
    position: { lat: number; lon: number; alt: number };
    coverage: {
      minAzDeg: number;
      maxAzDeg: number;
      minElDeg: number;
      maxElDeg: number;
      maxRangeM: number;
    };
    fov?: { halfAngleHDeg: number; halfAngleVDeg: number };
    slewRateDegPerSec?: number;
  }>;
  targets: Array<{
    targetId: string;
    name: string;
    description: string;
    startTime: number;
    waypoints: Array<{
      time: number;
      position: { lat: number; lon: number; alt: number };
    }>;
  }>;
  faults: Array<{
    type: string;
    sensorId: string;
    startTime: number;
    endTime?: number;
    magnitude?: number;
  }>;
  operatorActions: Array<{
    type: string;
    time: number;
    sensorId?: string;
    targetId?: string;
    durationSec?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  scenarioName: 'New Scenario',
  description: '',
  duration: 900,
  policyMode: 'recommended_only' as const,
  sensors: [] as EditorSensor[],
  targets: [] as EditorTarget[],
  faults: [] as EditorFault[],
  actions: [] as EditorAction[],
  selectedItemType: null as 'sensor' | 'target' | null,
  selectedItemId: null as string | null,
  editMode: 'select' as EditorState['editMode'],
  validationResult: null as EditorState['validationResult'],
  activeTargetId: null as string | null,
  operationalArea: [] as GeoVertex[],
  exclusionZones: [] as GeoVertex[][],
  threatZones: [] as GeoVertex[][],
  zoneDrawMode: null as ZoneDrawMode | null,
  zoneDrawVertices: [] as GeoVertex[],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEditorStore = create<EditorState>((set) => ({
  ...initialState,

  addSensor: (sensor) =>
    set((s) => ({ sensors: [...s.sensors, sensor] })),

  removeSensor: (id) =>
    set((s) => ({
      sensors: s.sensors.filter((sen) => sen.id !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      selectedItemType: s.selectedItemId === id ? null : s.selectedItemType,
    })),

  updateSensor: (id, updates) =>
    set((s) => ({
      sensors: s.sensors.map((sen) =>
        sen.id === id ? { ...sen, ...updates } : sen
      ),
    })),

  selectItem: (type, id) =>
    set({ selectedItemType: type, selectedItemId: id }),

  setEditMode: (mode) =>
    set({ editMode: mode }),

  setScenarioName: (name) =>
    set({ scenarioName: name }),

  setDescription: (desc) =>
    set({ description: desc }),

  setDuration: (dur) =>
    set({ duration: dur }),

  setPolicyMode: (mode) =>
    set({ policyMode: mode }),

  setValidationResult: (result) =>
    set({ validationResult: result }),

  reset: () =>
    set({ ...initialState }),

  // Target CRUD
  addTarget: (target) =>
    set((s) => ({ targets: [...s.targets, target] })),

  removeTarget: (id) =>
    set((s) => ({
      targets: s.targets.filter((t) => t.id !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      selectedItemType: s.selectedItemId === id ? null : s.selectedItemType,
      activeTargetId: s.activeTargetId === id ? null : s.activeTargetId,
    })),

  updateTarget: (id, updates) =>
    set((s) => ({
      targets: s.targets.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  addWaypoint: (targetId, waypoint) =>
    set((s) => ({
      targets: s.targets.map((t) =>
        t.id === targetId
          ? { ...t, waypoints: [...t.waypoints, waypoint] }
          : t
      ),
    })),

  removeWaypoint: (targetId, waypointIndex) =>
    set((s) => ({
      targets: s.targets.map((t) =>
        t.id === targetId
          ? { ...t, waypoints: t.waypoints.filter((_, i) => i !== waypointIndex) }
          : t
      ),
    })),

  updateWaypoint: (targetId, waypointIndex, updates) =>
    set((s) => ({
      targets: s.targets.map((t) =>
        t.id === targetId
          ? {
              ...t,
              waypoints: t.waypoints.map((wp, i) =>
                i === waypointIndex ? { ...wp, ...updates } : wp
              ),
            }
          : t
      ),
    })),

  setActiveTargetId: (id) =>
    set({ activeTargetId: id }),

  addFault: (fault) =>
    set((s) => ({ faults: [...s.faults, fault] })),

  removeFault: (id) =>
    set((s) => ({ faults: s.faults.filter((f) => f.id !== id) })),

  updateFault: (id, updates) =>
    set((s) => ({
      faults: s.faults.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),

  addAction: (action) =>
    set((s) => ({ actions: [...s.actions, action] })),

  removeAction: (id) =>
    set((s) => ({ actions: s.actions.filter((a) => a.id !== id) })),

  updateAction: (id, updates) =>
    set((s) => ({
      actions: s.actions.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),

  // Zone actions (ED-2)
  setOperationalArea: (vertices) => set({ operationalArea: vertices }),

  addExclusionZone: (vertices) =>
    set((s) => ({ exclusionZones: [...s.exclusionZones, vertices] })),

  addThreatZone: (vertices) =>
    set((s) => ({ threatZones: [...s.threatZones, vertices] })),

  clearZones: () =>
    set({ operationalArea: [], exclusionZones: [], threatZones: [] }),

  startZoneDraw: (mode) =>
    set({ editMode: 'draw-zone', zoneDrawMode: mode, zoneDrawVertices: [] }),

  addZoneVertex: (vertex) =>
    set((s) => ({ zoneDrawVertices: [...s.zoneDrawVertices, vertex] })),

  finishZoneDraw: () => {
    const s = useEditorStore.getState();
    if (s.zoneDrawVertices.length < 3) {
      // Need at least 3 points for a polygon
      set({ editMode: 'select', zoneDrawMode: null, zoneDrawVertices: [] });
      return;
    }
    const vertices = [...s.zoneDrawVertices];
    if (s.zoneDrawMode === 'operational-area') {
      set({ operationalArea: vertices, editMode: 'select', zoneDrawMode: null, zoneDrawVertices: [] });
    } else if (s.zoneDrawMode === 'exclusion-zone') {
      set((prev) => ({
        exclusionZones: [...prev.exclusionZones, vertices],
        editMode: 'select',
        zoneDrawMode: null,
        zoneDrawVertices: [],
      }));
    } else if (s.zoneDrawMode === 'threat-zone') {
      set((prev) => ({
        threatZones: [...prev.threatZones, vertices],
        editMode: 'select',
        zoneDrawMode: null,
        zoneDrawVertices: [],
      }));
    }
  },

  cancelZoneDraw: () =>
    set({ editMode: 'select', zoneDrawMode: null, zoneDrawVertices: [] }),

  buildScenarioDefinition: () => {
    const s = useEditorStore.getState();
    return {
      id: 'custom-' + Date.now(),
      name: s.scenarioName,
      description: s.description,
      durationSec: s.duration,
      policyMode: s.policyMode,
      sensors: s.sensors.map((sen) => ({
        sensorId: sen.id,
        type: sen.type,
        position: { lat: sen.lat, lon: sen.lon, alt: sen.alt },
        coverage: {
          minAzDeg: sen.azMin,
          maxAzDeg: sen.azMax,
          minElDeg: sen.elMin,
          maxElDeg: sen.elMax,
          maxRangeM: sen.rangeMaxKm * 1000,
        },
        ...(sen.type === 'eo'
          ? {
              fov: {
                halfAngleHDeg: sen.fovHalfAngleH ?? 2.5,
                halfAngleVDeg: sen.fovHalfAngleV ?? 1.8,
              },
              slewRateDegPerSec: sen.slewRateDegSec ?? 30,
            }
          : {}),
      })),
      targets: s.targets.map((t) => ({
        targetId: t.id,
        name: t.label,
        description: '',
        startTime: t.waypoints.length > 0 ? t.waypoints[0].arrivalTimeSec : 0,
        waypoints: t.waypoints.map((wp) => ({
          time: wp.arrivalTimeSec,
          position: { lat: wp.lat, lon: wp.lon, alt: wp.alt },
        })),
      })),
      faults: s.faults.map((f) => ({
        type: f.type,
        sensorId: f.sensorId,
        startTime: f.startTimeSec,
        endTime: f.endTimeSec,
        magnitude: f.magnitude,
      })),
      operatorActions: s.actions.map((a) => ({
        type: a.type,
        time: a.timeSec,
        sensorId: a.sensorId,
        targetId: a.targetId,
        durationSec: a.durationSec,
      })),
    };
  },

  loadFromScenarioDefinition: (def) => {
    set({ ...initialState });
    const store = useEditorStore.getState();
    if (def.name) store.setScenarioName(def.name);
    if (def.description) store.setDescription(def.description);
    if (def.durationSec) store.setDuration(def.durationSec);
    if (def.policyMode) store.setPolicyMode(def.policyMode as EditorState['policyMode']);

    if (Array.isArray(def.sensors)) {
      for (const s of def.sensors) {
        store.addSensor({
          id: s.sensorId || crypto.randomUUID(),
          type: (s.type as EditorSensor['type']) || 'radar',
          lat: s.position?.lat ?? 0,
          lon: s.position?.lon ?? 0,
          alt: s.position?.alt ?? 0,
          azMin: s.coverage?.minAzDeg ?? 0,
          azMax: s.coverage?.maxAzDeg ?? 360,
          elMin: s.coverage?.minElDeg ?? -5,
          elMax: s.coverage?.maxElDeg ?? 85,
          rangeMaxKm: (s.coverage?.maxRangeM ?? 100000) / 1000,
          fovHalfAngleH: s.fov?.halfAngleHDeg,
          fovHalfAngleV: s.fov?.halfAngleVDeg,
          slewRateDegSec: s.slewRateDegPerSec,
        });
      }
    }

    if (Array.isArray(def.targets)) {
      for (const t of def.targets) {
        store.addTarget({
          id: t.targetId || crypto.randomUUID(),
          label: t.name || 'Target',
          rcs: 1,
          waypoints: (t.waypoints || []).map((wp: any) => ({
            lat: wp.position?.lat ?? 0,
            lon: wp.position?.lon ?? 0,
            alt: wp.position?.alt ?? 0,
            speedMs: 0,
            arrivalTimeSec: wp.time ?? 0,
          })),
        });
      }
    }

    if (Array.isArray(def.faults)) {
      for (const f of def.faults) {
        store.addFault({
          id: crypto.randomUUID(),
          type: f.type as EditorFault['type'],
          sensorId: f.sensorId,
          startTimeSec: f.startTime ?? 0,
          endTimeSec: f.endTime ?? 0,
          magnitude: f.magnitude,
        });
      }
    }

    if (Array.isArray(def.operatorActions)) {
      for (const a of def.operatorActions) {
        store.addAction({
          id: crypto.randomUUID(),
          type: a.type as EditorAction['type'],
          timeSec: a.time ?? 0,
          sensorId: a.sensorId,
          targetId: a.targetId,
          durationSec: a.durationSec,
        });
      }
    }
  },
}));
