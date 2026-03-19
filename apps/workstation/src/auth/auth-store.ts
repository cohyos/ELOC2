import { create } from 'zustand';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  /** Whether the backend has auth enabled (null = not yet checked) */
  authEnabled: boolean | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  checkAuthEnabled: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  authEnabled: null,

  checkAuthEnabled: async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = await res.json();
        set({ authEnabled: data.enabled });
        if (!data.enabled) {
          // Auth not enabled — skip login, mark as authenticated
          set({ isAuthenticated: true, isLoading: false });
        }
      } else {
        // If endpoint doesn't exist, assume auth is not enabled
        set({ authEnabled: false, isAuthenticated: true, isLoading: false });
      }
    } catch {
      // Network error — assume auth not enabled
      set({ authEnabled: false, isAuthenticated: true, isLoading: false });
    }
  },

  checkSession: async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const user = await res.json();
        set({ user, isAuthenticated: true, isLoading: false, error: null });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        set({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        set({
          isLoading: false,
          error: data.error || 'Login failed',
        });
        return false;
      }
    } catch {
      set({ isLoading: false, error: 'Network error — cannot reach server' });
      return false;
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    set({ user: null, isAuthenticated: false, error: null });
  },
}));
