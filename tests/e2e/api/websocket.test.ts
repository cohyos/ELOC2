import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';

/**
 * Helper: connect to the WebSocket endpoint and return the socket + first message.
 * Resolves when the first message is received or rejects on timeout/error.
 */
function connectWs(baseUrl: string): Promise<{ ws: WebSocket; message: any }> {
  return new Promise((resolve, reject) => {
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws/events';
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timed out after 10s'));
    }, 10_000);

    ws.on('open', () => {
      // Connection established; wait for the first message (rap.snapshot)
    });

    ws.on('message', (data: Buffer) => {
      clearTimeout(timer);
      try {
        const message = JSON.parse(data.toString());
        resolve({ ws, message });
      } catch {
        resolve({ ws, message: data.toString() });
      }
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test.describe('WebSocket Endpoints', () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

  test('API-25: WebSocket connects to /ws/events and receives snapshot', async () => {
    const { ws, message } = await connectWs(baseUrl);
    try {
      expect(message).toHaveProperty('type');
      expect(message.type).toBe('rap.snapshot');
      expect(message).toHaveProperty('tracks');
      expect(message).toHaveProperty('sensors');
      expect(message).toHaveProperty('timestamp');
    } finally {
      ws.close();
    }
  });

  test('API-26: Start scenario, receive rap.update via WebSocket', async ({ request }) => {
    // Reset and start a fast scenario
    await request.post('/api/scenario/reset', {
      data: { scenarioId: 'single-target-confirm' },
    });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');

    // Connect and get the initial snapshot
    const { ws, message: snapshot } = await connectWs(baseUrl);
    expect(snapshot.type).toBe('rap.snapshot');

    // Wait for a rap.update message
    const update = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('No rap.update received within 5s'));
      }, 5000);

      ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'rap.update') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });

    try {
      expect(update.type).toBe('rap.update');
      expect(update).toHaveProperty('tracks');
      expect(update).toHaveProperty('sensors');
    } finally {
      ws.close();
      // Clean up
      await request.post('/api/scenario/pause').catch(() => {});
      await request.post('/api/scenario/reset').catch(() => {});
    }
  });
});
