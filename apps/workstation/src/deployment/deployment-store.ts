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

interface DeploymentState {
  // Mode
  active: boolean;

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
      // Download as JSON
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
}));
