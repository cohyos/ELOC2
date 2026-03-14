import { useUiStore } from '../stores/ui-store';
import { useTrackStore } from '../stores/track-store';

/**
 * ReplayController manages the WebSocket connection for real-time event streaming
 * and handles replay state (play/pause, speed, time scrubbing).
 */
export class ReplayController {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

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
    useUiStore.getState().setWsConnected(false);
  }

  private handleMessage(data: any) {
    if (data.type === 'rap.snapshot') {
      // Full RAP snapshot on connect
      if (data.tracks && Array.isArray(data.tracks)) {
        useTrackStore.getState().setTracks(data.tracks);
      }
    } else if (data.type === 'event') {
      // Individual event
      useUiStore.getState().addEvent({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        eventType: data.eventType ?? 'unknown',
        timestamp: data.timestamp ?? Date.now(),
        summary: data.summary ?? '',
      });
    }
  }
}

// Singleton instance
export const replayController = new ReplayController();
