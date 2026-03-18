import { create } from 'zustand';
import type { Task } from '@eloc2/domain';

export interface GeometryEstimateWS {
  trackId: string;
  estimateId: string;
  position3D?: { lat: number; lon: number; alt: number };
  quality: string;
  classification: string;
  intersectionAngleDeg: number;
  timeAlignmentQualityMs: number;
  bearingNoiseDeg: number;
  eoTrackIds: string[];
}

export interface RegistrationStateWS {
  sensorId: string;
  spatialQuality: string;
  timingQuality: string;
  fusionSafe: boolean;
  azimuthBiasDeg: number;
  elevationBiasDeg: number;
  clockOffsetMs: number;
}

export interface UnresolvedGroupWS {
  groupId: string;
  eoTrackIds: string[];
  status: string;
  parentCueId: string;
  reason: string;
}

export interface EoModuleStatusWS {
  mode: 'idle' | 'tracking' | 'searching' | 'mixed';
  activePipelines: Array<{
    trackId: string;
    pipeline: 'sub-pixel' | 'image';
    angularSizeMrad: number;
    snr: number;
  }>;
  sensorAllocations: Array<{
    sensorId: string;
    targetTrackId: string | null;
    mode: 'dwell' | 'search' | 'idle';
    dwellRemainingSec: number;
  }>;
  enrichedTrackCount: number;
  totalTracksIngested: number;
  tickCount: number;
}

interface TaskStoreState {
  tasks: Task[];
  eoTracks: Array<{
    eoTrackId: string;
    sensorId: string;
    bearing: { azimuthDeg: number; elevationDeg: number; timestamp: number; sensorId: string };
    imageQuality: number;
    status: string;
    associatedSystemTrackId: string | undefined;
    identificationSupport?: { type: string; confidence: number; features: string[] };
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
  geometryEstimates: GeometryEstimateWS[];
  registrationStates: RegistrationStateWS[];
  unresolvedGroups: UnresolvedGroupWS[];
  fusionModes: Record<string, string>;
  eoModuleStatus: EoModuleStatusWS | null;
  loading: boolean;
  error: string | null;

  setTasks: (tasks: Task[]) => void;
  setActiveCues: (cues: TaskStoreState['activeCues']) => void;
  setEoTracks: (eoTracks: TaskStoreState['eoTracks']) => void;
  setGeometryEstimates: (estimates: GeometryEstimateWS[]) => void;
  setRegistrationStates: (states: RegistrationStateWS[]) => void;
  setUnresolvedGroups: (groups: UnresolvedGroupWS[]) => void;
  setFusionModes: (modes: Record<string, string>) => void;
  setEoModuleStatus: (status: EoModuleStatusWS | null) => void;
  fetchTasks: () => Promise<void>;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string) => Promise<void>;
}

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  tasks: [],
  activeCues: [],
  eoTracks: [],
  geometryEstimates: [],
  registrationStates: [],
  unresolvedGroups: [],
  fusionModes: {},
  eoModuleStatus: null,
  loading: false,
  error: null,

  setTasks: (tasks) => set({ tasks }),
  setActiveCues: (cues) => set({ activeCues: cues }),
  setEoTracks: (eoTracks) => set({ eoTracks }),
  setGeometryEstimates: (estimates) => set({ geometryEstimates: estimates }),
  setRegistrationStates: (states) => set({ registrationStates: states }),
  setUnresolvedGroups: (groups) => set({ unresolvedGroups: groups }),
  setFusionModes: (modes) => set({ fusionModes: modes }),
  setEoModuleStatus: (status) => set({ eoModuleStatus: status }),

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
