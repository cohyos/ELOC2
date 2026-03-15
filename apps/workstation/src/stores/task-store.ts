import { create } from 'zustand';
import type { Task } from '@eloc2/domain';

interface TaskStoreState {
  tasks: Task[];
  loading: boolean;
  error: string | null;

  fetchTasks: () => Promise<void>;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string) => Promise<void>;
}

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

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
