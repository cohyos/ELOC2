import { create } from 'zustand';
import type { SensorState } from '@eloc2/domain';

interface SensorStoreState {
  sensors: SensorState[];
  loading: boolean;
  error: string | null;

  fetchSensors: () => Promise<void>;
  setSensors: (sensors: SensorState[]) => void;
}

export const useSensorStore = create<SensorStoreState>((set) => ({
  sensors: [],
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
}));
