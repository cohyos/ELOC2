import { useUiStore } from '../stores/ui-store';
import { useTrackStore } from '../stores/track-store';
import { useSensorStore } from '../stores/sensor-store';
import { useTaskStore } from '../stores/task-store';
import { useInvestigationStore } from '../stores/investigation-store';

/**
 * ReplayController manages the WebSocket connection for real-time event streaming
 * and handles replay state (play/pause, speed, time scrubbing).
 *
 * Uses requestAnimationFrame batching to coalesce rapid WS messages into
 * a single React render cycle, improving UI responsiveness at high speeds.
 */
export class ReplayController {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingData: Record<string, any> | null = null;
  private rafId: number | null = null;
  private _firstFlush = false;

  connect() {
    if (this.ws) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/events`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      useUiStore.getState().setWsConnected(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch {
        // Ignore invalid messages
      }
    };

    this.ws.onclose = () => {
      useUiStore.getState().setWsConnected(false);
      this.ws = null;
      // Reconnect after 3 seconds
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingData = null;
    useUiStore.getState().setWsConnected(false);
  }

  private handleMessage(data: any) {
    if (data.type === 'rap.snapshot' || data.type === 'rap.update') {
      // Merge into pending buffer — later messages overwrite earlier ones
      if (!this.pendingData) {
        this.pendingData = {};
      }
      // Overwrite each field with latest data
      for (const key of Object.keys(data)) {
        if (key !== 'type') {
          this.pendingData[key] = data[key];
        }
      }
      // Preserve snapshot type so first-connect snapshot is applied correctly
      this.pendingData._type = data.type;

      // Schedule flush on next animation frame
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.flushPendingData();
          this.rafId = null;
        });
      }
    } else if (data.type === 'event') {
      // Events are small — apply immediately
      useUiStore.getState().addEvent({
        id: data.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        eventType: data.eventType ?? 'unknown',
        timestamp: data.timestamp ?? Date.now(),
        summary: data.summary ?? '',
      });
    }
  }

  private flushPendingData() {
    const data = this.pendingData;
    this.pendingData = null;
    if (!data) return;

    // Diagnostic: log first data flush so we know data is flowing
    if (!this._firstFlush) {
      this._firstFlush = true;
      console.log(`[ReplayController] First data flush — tracks: ${(data.tracks ?? []).length}, sensors: ${(data.sensors ?? []).length}, type: ${data._type ?? 'unknown'}`);
    }

    if (data.tracks && Array.isArray(data.tracks)) {
      useTrackStore.getState().setTracks(data.tracks);
    }
    if (data.sensors && Array.isArray(data.sensors)) {
      useSensorStore.getState().setSensors(data.sensors);
    }
    if (data.tasks && Array.isArray(data.tasks)) {
      useTaskStore.getState().setTasks(data.tasks);
    }
    if (data.activeCues && Array.isArray(data.activeCues)) {
      useTaskStore.getState().setActiveCues(data.activeCues);
    }
    if (data.eoTracks && Array.isArray(data.eoTracks)) {
      useTaskStore.getState().setEoTracks(data.eoTracks);
    }
    if (data.geometryEstimates && Array.isArray(data.geometryEstimates)) {
      useTaskStore.getState().setGeometryEstimates(data.geometryEstimates);
    }
    if (data.registrationStates && Array.isArray(data.registrationStates)) {
      useTaskStore.getState().setRegistrationStates(data.registrationStates);
    }
    if (data.unresolvedGroups && Array.isArray(data.unresolvedGroups)) {
      useTaskStore.getState().setUnresolvedGroups(data.unresolvedGroups);
    }
    if (data.fusionModes && typeof data.fusionModes === 'object') {
      useTaskStore.getState().setFusionModes(data.fusionModes);
    }
    if (data.investigationSummaries && Array.isArray(data.investigationSummaries)) {
      useInvestigationStore.getState().setActiveInvestigations(data.investigationSummaries);
    }
    // Update replay time from simulation
    if (typeof data.simTimeSec === 'number') {
      useUiStore.getState().setReplayTime(data.simTimeSec);
    }
    if (typeof data.running === 'boolean') {
      useUiStore.getState().setReplayPlaying(data.running);
    }
  }
}

// Singleton instance
export const replayController = new ReplayController();
