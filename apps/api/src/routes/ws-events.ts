import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

export async function wsEventsRoute(app: FastifyInstance) {
  app.get('/ws/events', { websocket: true }, (socket) => {
    // Register this WebSocket client with the live engine
    engine.addWsClient(socket);

    // On connect: send full state snapshot (identical to broadcastRap format)
    socket.send(JSON.stringify(engine.getFullSnapshot()));

    socket.on('close', () => {
      engine.removeWsClient(socket);
    });

    socket.on('error', () => {
      engine.removeWsClient(socket);
    });
  });
}
