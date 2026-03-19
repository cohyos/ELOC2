import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

export async function wsEventsRoute(app: FastifyInstance) {
  app.get('/ws/events', { websocket: true }, (socket, request) => {
    // Determine user role from session (if auth enabled)
    let role: 'instructor' | 'operator' | 'anonymous' = 'anonymous';
    const session = (request as any).session;
    if (session?.user?.role) {
      role = session.user.role === 'instructor' ? 'instructor' : 'operator';
    }

    // Register this WebSocket client with the live engine (includes role)
    engine.addWsClient(socket, role);

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
