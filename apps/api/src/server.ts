import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { rapRoutes } from './routes/rap-routes.js';
import { sensorRoutes } from './routes/sensor-routes.js';
import { taskRoutes } from './routes/task-routes.js';
import { scenarioRoutes } from './routes/scenario-routes.js';
import { wsEventsRoute } from './routes/ws-events.js';

const server = Fastify({ logger: true });

// Register WebSocket support
await server.register(fastifyWebsocket);

// Health check
server.get('/api/health', async () => {
  return { status: 'ok', service: 'eloc2-api', version: '0.1.0' };
});

// Register route modules
await server.register(rapRoutes);
await server.register(sensorRoutes);
await server.register(taskRoutes);
await server.register(scenarioRoutes);
await server.register(wsEventsRoute);

const start = async () => {
  try {
    await server.listen({ port: 3001, host: '0.0.0.0' });
    console.log('ELOC2 API server running on http://localhost:3001');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
