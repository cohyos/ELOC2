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

    // Stream simulated events at interval
    const interval = setInterval(() => {
      if (!scenarioState.running) return;

      const event = generateSimEvent();
      try {
        socket.send(JSON.stringify({
          type: 'event',
          ...event,
        }));
      } catch {
        // Socket may be closed
        clearInterval(interval);
      }
    }, 2000 / scenarioState.speed);

    socket.on('close', () => {
      clearInterval(interval);
    });

    socket.on('error', () => {
      clearInterval(interval);
    });
  });
}
