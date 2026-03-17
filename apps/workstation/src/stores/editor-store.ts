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
}

export interface EditorTarget {
  id: string;
  label: string;
  rcs: number;
  waypoints: EditorWaypoint[];
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
  editMode: 'select' | 'place-sensor' | 'place-waypoint';
  validationResult: { errors: string[]; warnings: string[] } | null;
  activeTargetId: string | null;

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

  // Target/waypoint actions (stubs for now, implemented in 1C)
  addTarget: (target: EditorTarget) => void;
  removeTarget: (id: string) => void;
  addFault: (fault: EditorFault) => void;
  removeFault: (id: string) => void;
  addAction: (action: EditorAction) => void;
  removeAction: (id: string) => void;
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
  editMode: 'select' as const,
  validationResult: null as EditorState['validationResult'],
  activeTargetId: null as string | null,
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

  // Target stubs
  addTarget: (target) =>
    set((s) => ({ targets: [...s.targets, target] })),

  removeTarget: (id) =>
    set((s) => ({
      targets: s.targets.filter((t) => t.id !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      selectedItemType: s.selectedItemId === id ? null : s.selectedItemType,
    })),

  addFault: (fault) =>
    set((s) => ({ faults: [...s.faults, fault] })),

  removeFault: (id) =>
    set((s) => ({ faults: s.faults.filter((f) => f.id !== id) })),

  addAction: (action) =>
    set((s) => ({ actions: [...s.actions, action] })),

  removeAction: (id) =>
    set((s) => ({ actions: s.actions.filter((a) => a.id !== id) })),
}));
