import { create } from 'zustand';
import type { SensorState } from '@eloc2/domain';

export interface SearchModeStateWS {
  sensorId: string;
  active: boolean;
  pattern: 'sector' | 'raster';
  currentAzimuth: number;
}

interface SensorStoreState {
  sensors: SensorState[];
  searchModeStates: SearchModeStateWS[];
  loading: boolean;
  error: string | null;

  fetchSensors: () => Promise<void>;
  setSensors: (sensors: SensorState[]) => void;
  setSearchModeStates: (states: SearchModeStateWS[]) => void;
}

export const useSensorStore = create<SensorStoreState>((set) => ({
  sensors: [],
  searchModeStates: [],
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
}));
