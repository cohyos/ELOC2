import type { FastifyInstance } from 'fastify';
import { mockTracks, generateSimEvent, scenarioState } from '../mock-data.js';

export async function wsEventsRoute(app: FastifyInstance) {
  app.get('/ws/events', { websocket: true }, (socket, request) => {
    // On connect: send current RAP snapshot
    const snapshot = {
      type: 'rap.snapshot',
      timestamp: Date.now(),
      tracks: mockTracks,
    };
    socket.send(JSON.stringify(snapshot));

    let closed = false;

    // Stream simulated events using recursive setTimeout for dynamic speed
    function scheduleNext() {
      if (closed) return;

      const delay = 2000 / scenarioState.speed;
      setTimeout(() => {
        if (closed || !scenarioState.running) {
          if (!closed) scheduleNext(); // keep polling even when paused
          return;
        }

        const event = generateSimEvent();
        try {
          socket.send(JSON.stringify({
            type: 'event',
            ...event,
          }));
        } catch {
          closed = true;
          return;
        }
        scheduleNext();
      }, delay);
    }

    scheduleNext();

    socket.on('close', () => {
      closed = true;
    });

    socket.on('error', () => {
      closed = true;
    });
  });
}
