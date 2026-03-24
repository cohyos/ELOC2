import { create } from 'zustand';
import type { SensorState } from '@eloc2/domain';

export interface SearchModeStateWS {
  sensorId: string;
  active: boolean;
  pattern: 'sector' | 'raster';
  currentAzimuth: number;
}

export interface SectorScanStateWS {
  scanId: string;
  sector: { azimuthStartDeg: number; azimuthEndDeg: number };
  scanners: Array<{
    sensorId: string;
    role: 'scanning' | 'triangulating';
    subSectorStart: number;
    subSectorEnd: number;
  }>;
  detections: Array<{
    azimuthDeg: number;
    detectedBySensorId: string;
    targetId: string;
    triangulated: boolean;
  }>;
  active: boolean;
  triangulatorSensorId: string | null;
}

interface SensorStoreState {
  sensors: SensorState[];
  searchModeStates: SearchModeStateWS[];
  sectorScan: SectorScanStateWS | null;
  loading: boolean;
  error: string | null;

  fetchSensors: () => Promise<void>;
  setSensors: (sensors: SensorState[]) => void;
  setSearchModeStates: (states: SearchModeStateWS[]) => void;
  setSectorScan: (state: SectorScanStateWS | null) => void;
}

export const useSensorStore = create<SensorStoreState>((set) => ({
  sensors: [],
  searchModeStates: [],
  sectorScan: null,
  loading: false,
  error: null,

  fetchSensors: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/sensors');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sensors: SensorState[] = await res.json();
      set({ sensors, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  setSensors: (sensors: SensorState[]) => {
    set({ sensors });
  },

  setSearchModeStates: (states: SearchModeStateWS[]) => {
    set({ searchModeStates: states });
  },

  setSectorScan: (state: SectorScanStateWS | null) => {
    set({ sectorScan: state });
  },
}));
