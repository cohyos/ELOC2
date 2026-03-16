import { create } from 'zustand';
import type { Task } from '@eloc2/domain';

interface TaskStoreState {
  tasks: Task[];
  eoTracks: Array<{
    eoTrackId: string;
    sensorId: string;
    bearing: { azimuthDeg: number; elevationDeg: number; timestamp: number; sensorId: string };
    imageQuality: number;
    status: string;
    associatedSystemTrackId: string | undefined;
  }>;
  activeCues: Array<{
    cueId: string;
    systemTrackId: string;
    predictedState: { lat: number; lon: number; alt: number };
    uncertaintyGateDeg: number;
    priority: number;
    validFrom: number;
    validTo: number;
  }>;
  loading: boolean;
  error: string | null;

  setTasks: (tasks: Task[]) => void;
  setActiveCues: (cues: TaskStoreState['activeCues']) => void;
  setEoTracks: (eoTracks: TaskStoreState['eoTracks']) => void;
  fetchTasks: () => Promise<void>;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string) => Promise<void>;
}

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  tasks: [],
  activeCues: [],
  eoTracks: [],
  loading: false,
  error: null,

  setTasks: (tasks) => set({ tasks }),
  setActiveCues: (cues) => set({ activeCues: cues }),
  setEoTracks: (eoTracks) => set({ eoTracks }),

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tasks: Task[] = await res.json();
      set({ tasks, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  approveTask: async (taskId: string) => {
    try {
      const res = await fetch('/api/operator/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Task = await res.json();
      const tasks = get().tasks.map(t => t.taskId === taskId ? updated : t);
      set({ tasks });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  rejectTask: async (taskId: string) => {
    try {
      const res = await fetch('/api/operator/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Task = await res.json();
      const tasks = get().tasks.map(t => t.taskId === taskId ? updated : t);
      set({ tasks });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
