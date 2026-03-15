import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

export async function wsEventsRoute(app: FastifyInstance) {
  app.get('/ws/events', { websocket: true }, (socket) => {
    // Register this WebSocket client with the live engine
    engine.addWsClient(socket);

    // On connect: send current state snapshot
    const s = engine.getState();
    socket.send(JSON.stringify({
      type: 'rap.snapshot',
      timestamp: Date.now(),
      simTimeSec: s.elapsedSec,
      scenarioId: s.scenarioId,
      running: s.running,
      speed: s.speed,
      tracks: s.tracks,
      sensors: s.sensors,
      trackCount: s.tracks.length,
      confirmedCount: s.tracks.filter(t => t.status === 'confirmed').length,
      tentativeCount: s.tracks.filter(t => t.status === 'tentative').length,
    }));

    socket.on('close', () => {
      engine.removeWsClient(socket);
    });

    socket.on('error', () => {
      engine.removeWsClient(socket);
    });
  });
}
