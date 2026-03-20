import { create } from 'zustand';

/** A 2D geographic point. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

export type GeoPolygon = GeoPoint[];

export interface SensorSpec {
  id: string;
  type: 'radar' | 'eo';
  maxRangeM: number;
  fovHalfAngleDeg: number;
  minAzDeg: number;
  maxAzDeg: number;
}

export interface PlacedSensor {
  spec: SensorSpec;
  position: GeoPoint;
  scores: {
    coverage: number;
    geometry: number;
    threat: number;
    total: number;
  };
}

export interface DeploymentMetrics {
  coveragePercent: number;
  triangulationCoveragePercent: number;
  worstCaseGapM: number;
  geometryQuality: number;
}

export type DeploymentDrawMode = 'select' | 'draw-area' | 'draw-exclusion' | 'draw-threat' | 'place-sensor';

interface DeploymentState {
  // Mode
  active: boolean;
  drawMode: DeploymentDrawMode;
  drawVertices: GeoPoint[];
  deploymentName: string;
  pendingSensorSpec: SensorSpec | null;

  // Area & zones
  scannedArea: GeoPolygon;
  inclusionZones: GeoPolygon[];
  exclusionZones: GeoPolygon[];
  threatCorridors: GeoPolygon[];

  // Sensors
  sensorInventory: SensorSpec[];
  placedSensors: PlacedSensor[];

  // Metrics
  metrics: DeploymentMetrics | null;

  // Optimization state
  optimizing: boolean;
  error: string | null;

  // Actions
  setActive: (active: boolean) => void;
  setScannedArea: (area: GeoPolygon) => void;
  addInclusionZone: (zone: GeoPolygon) => void;
  removeInclusionZone: (index: number) => void;
  addExclusionZone: (zone: GeoPolygon) => void;
  removeExclusionZone: (index: number) => void;
  addThreatCorridor: (corridor: GeoPolygon) => void;
  removeThreatCorridor: (index: number) => void;
  addSensorToInventory: (sensor: SensorSpec) => void;
  removeSensorFromInventory: (id: string) => void;
  setPlacedSensors: (sensors: PlacedSensor[]) => void;
  setMetrics: (metrics: DeploymentMetrics | null) => void;
  setOptimizing: (optimizing: boolean) => void;
  setError: (error: string | null) => void;
  clearAll: () => void;
  runOptimization: () => Promise<void>;
  exportScenario: () => Promise<void>;
  setDeploymentName: (name: string) => void;
  saveDeployment: (name?: string) => Promise<void>;
  // Drawing mode
  setDrawMode: (mode: DeploymentDrawMode) => void;
  addDrawVertex: (vertex: GeoPoint) => void;
  finishDraw: () => void;
  cancelDraw: () => void;
  // Place sensor on map
  startPlaceSensor: (spec: SensorSpec) => void;
  placeSensorAtPosition: (position: GeoPoint) => void;
  // Update sensor position (for dragging)
  updatePlacedSensorPosition: (index: number, position: GeoPoint) => void;
  // Remove a placed sensor
  removePlacedSensor: (index: number) => void;
}

// Default scanned area: Central Israel region
const DEFAULT_SCANNED_AREA: GeoPolygon = [
  { lat: 31.3, lon: 34.3 },
  { lat: 31.3, lon: 35.0 },
  { lat: 32.1, lon: 35.0 },
  { lat: 32.1, lon: 34.3 },
];

// Default sensor inventory
const DEFAULT_INVENTORY: SensorSpec[] = [
  { id: 'eo-1', type: 'eo', maxRangeM: 15000, fovHalfAngleDeg: 5, minAzDeg: 0, maxAzDeg: 360 },
  { id: 'eo-2', type: 'eo', maxRangeM: 15000, fovHalfAngleDeg: 5, minAzDeg: 0, maxAzDeg: 360 },
  { id: 'eo-3', type: 'eo', maxRangeM: 15000, fovHalfAngleDeg: 5, minAzDeg: 0, maxAzDeg: 360 },
  { id: 'radar-1', type: 'radar', maxRangeM: 40000, fovHalfAngleDeg: 180, minAzDeg: 0, maxAzDeg: 360 },
  { id: 'radar-2', type: 'radar', maxRangeM: 40000, fovHalfAngleDeg: 180, minAzDeg: 0, maxAzDeg: 360 },
];

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  active: false,
  drawMode: 'select' as DeploymentDrawMode,
  drawVertices: [] as GeoPoint[],
  deploymentName: '',
  pendingSensorSpec: null,
  scannedArea: DEFAULT_SCANNED_AREA,
  inclusionZones: [],
  exclusionZones: [],
  threatCorridors: [],
  sensorInventory: [...DEFAULT_INVENTORY],
  placedSensors: [],
  metrics: null,
  optimizing: false,
  error: null,

  setActive: (active) => set({ active }),
  setScannedArea: (area) => set({ scannedArea: area }),

  addInclusionZone: (zone) => set((s) => ({ inclusionZones: [...s.inclusionZones, zone] })),
  removeInclusionZone: (index) => set((s) => ({ inclusionZones: s.inclusionZones.filter((_, i) => i !== index) })),

  addExclusionZone: (zone) => set((s) => ({ exclusionZones: [...s.exclusionZones, zone] })),
  removeExclusionZone: (index) => set((s) => ({ exclusionZones: s.exclusionZones.filter((_, i) => i !== index) })),

  addThreatCorridor: (corridor) => set((s) => ({ threatCorridors: [...s.threatCorridors, corridor] })),
  removeThreatCorridor: (index) => set((s) => ({ threatCorridors: s.threatCorridors.filter((_, i) => i !== index) })),

  addSensorToInventory: (sensor) => set((s) => ({ sensorInventory: [...s.sensorInventory, sensor] })),
  removeSensorFromInventory: (id) => set((s) => ({ sensorInventory: s.sensorInventory.filter(si => si.id !== id) })),

  setPlacedSensors: (sensors) => set({ placedSensors: sensors }),
  setMetrics: (metrics) => set({ metrics }),
  setOptimizing: (optimizing) => set({ optimizing }),
  setError: (error) => set({ error }),

  clearAll: () => set({
    placedSensors: [],
    metrics: null,
    error: null,
  }),

  runOptimization: async () => {
    const state = get();
    set({ optimizing: true, error: null });

    try {
      const res = await fetch('/api/deployment/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sensors: state.sensorInventory,
          constraints: {
            scannedArea: state.scannedArea,
            inclusionZones: state.inclusionZones,
            exclusionZones: state.exclusionZones,
            threatCorridors: state.threatCorridors,
            minCoveragePercent: 70,
            gridResolutionM: 2000,
          },
        }),
      });

      if (!res.ok) throw new Error(`Optimization failed: ${res.statusText}`);

      const result = await res.json();
      set({
        placedSensors: result.placedSensors,
        metrics: result.metrics,
        optimizing: false,
      });
    } catch (err: any) {
      set({ optimizing: false, error: err.message || 'Optimization failed' });
    }
  },

  exportScenario: async () => {
    const state = get();
    try {
      const res = await fetch('/api/deployment/export-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placedSensors: state.placedSensors }),
      });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'deployment-scenario.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      set({ error: err.message || 'Export failed' });
    }
  },

  setDeploymentName: (name) => set({ deploymentName: name }),

  saveDeployment: async (name?: string) => {
    const state = get();
    const saveName = name || state.deploymentName || `deployment-${Date.now()}`;
    const id = saveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const res = await fetch('/api/deployment/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: saveName,
          constraints: {
            scannedArea: state.scannedArea,
            inclusionZones: state.inclusionZones,
            exclusionZones: state.exclusionZones,
            threatCorridors: state.threatCorridors,
            minCoveragePercent: 70,
            gridResolutionM: 2000,
          },
          sensors: state.sensorInventory,
          result: state.placedSensors.length > 0 ? {
            placedSensors: state.placedSensors,
            metrics: state.metrics,
          } : undefined,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      set({ deploymentName: saveName, error: null });
    } catch (err: any) {
      set({ error: err.message || 'Save failed' });
    }
  },

  // Drawing mode
  setDrawMode: (mode) => set({ drawMode: mode, drawVertices: [], pendingSensorSpec: null }),
  addDrawVertex: (vertex) => set((s) => ({ drawVertices: [...s.drawVertices, vertex] })),
  finishDraw: () => {
    const s = get();
    if (s.drawVertices.length < 3) {
      set({ drawMode: 'select', drawVertices: [] });
      return;
    }
    const verts = [...s.drawVertices];
    if (s.drawMode === 'draw-area') {
      set({ scannedArea: verts, drawMode: 'select', drawVertices: [] });
    } else if (s.drawMode === 'draw-exclusion') {
      set((prev) => ({ exclusionZones: [...prev.exclusionZones, verts], drawMode: 'select', drawVertices: [] }));
    } else if (s.drawMode === 'draw-threat') {
      set((prev) => ({ threatCorridors: [...prev.threatCorridors, verts], drawMode: 'select', drawVertices: [] }));
    }
  },
  cancelDraw: () => set({ drawMode: 'select', drawVertices: [] }),

  startPlaceSensor: (spec) => set({ drawMode: 'place-sensor', pendingSensorSpec: spec }),

  placeSensorAtPosition: (position) => {
    const s = get();
    if (!s.pendingSensorSpec) return;
    const newPlaced: PlacedSensor = {
      spec: s.pendingSensorSpec,
      position,
      scores: { coverage: 0, geometry: 0, threat: 0, total: 0 },
    };
    // Remove from inventory
    set((prev) => ({
      placedSensors: [...prev.placedSensors, newPlaced],
      sensorInventory: prev.sensorInventory.filter(si => si.id !== prev.pendingSensorSpec?.id),
      drawMode: 'select',
      pendingSensorSpec: null,
    }));
    // Auto-fetch terrain elevation
    fetch(`/api/terrain/elevation?lat=${position.lat}&lon=${position.lon}`)
      .then(r => r.json())
      .then(data => {
        if (data.elevationM != null) {
          const st = get();
          const idx = st.placedSensors.length - 1;
          if (idx >= 0) {
            set((prev) => ({
              placedSensors: prev.placedSensors.map((ps, i) =>
                i === idx ? { ...ps, position: { ...ps.position, alt: Math.round(data.elevationM) } } : ps
              ),
            }));
          }
        }
      })
      .catch(() => {});
  },

  removePlacedSensor: (index) =>
    set((s) => {
      const removed = s.placedSensors[index];
      return {
        placedSensors: s.placedSensors.filter((_, i) => i !== index),
        // Add back to inventory
        sensorInventory: removed ? [...s.sensorInventory, removed.spec] : s.sensorInventory,
      };
    }),

  updatePlacedSensorPosition: (index, position) => {
    set((s) => ({
      placedSensors: s.placedSensors.map((ps, i) =>
        i === index ? { ...ps, position } : ps
      ),
    }));
    // Auto-fetch terrain elevation on drag
    fetch(`/api/terrain/elevation?lat=${position.lat}&lon=${position.lon}`)
      .then(r => r.json())
      .then(data => {
        if (data.elevationM != null) {
          set((s) => ({
            placedSensors: s.placedSensors.map((ps, i) =>
              i === index ? { ...ps, position: { ...ps.position, alt: Math.round(data.elevationM) } } : ps
            ),
          }));
        }
      })
      .catch(() => {});
  },
}));
