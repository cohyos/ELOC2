import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { rapRoutes } from './routes/rap-routes.js';
import { sensorRoutes } from './routes/sensor-routes.js';
import { taskRoutes } from './routes/task-routes.js';
import { groupRoutes } from './routes/group-routes.js';
import { scenarioRoutes } from './routes/scenario-routes.js';
import { registerEditorRoutes } from './routes/editor-routes.js';
import { registerInvestigationRoutes } from './routes/investigation-routes.js';
import { wsEventsRoute } from './routes/ws-events.js';
import { engine } from './simulation/live-engine.js';

const server = Fastify({ logger: true });

// Register WebSocket support
await server.register(fastifyWebsocket);

// In production, serve workstation static files from the same port
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workstationDist = path.resolve(__dirname, '../../workstation/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(workstationDist)) {
  await server.register(fastifyStatic, { root: workstationDist, prefix: '/' });
  // SPA fallback: serve index.html for non-API routes
  server.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.sendFile('index.html');
    }
  });
}

// Health check
server.get('/api/health', async () => {
  const s = engine.getState();
  return {
    status: 'ok',
    service: 'eloc2-api',
    version: '0.1.0',
    scenario: s.scenarioId,
    running: s.running,
    elapsed: s.elapsedSec,
    tracks: s.tracks.length,
  };
});

// Register route modules
await server.register(rapRoutes);
await server.register(sensorRoutes);
await server.register(taskRoutes);
await server.register(groupRoutes);
await server.register(scenarioRoutes);
registerEditorRoutes(server, engine);
registerInvestigationRoutes(server, engine);
await server.register(wsEventsRoute);

const start = async () => {
  try {
    await server.listen({ port: 3001, host: '0.0.0.0' });
    console.log('ELOC2 API server running on http://localhost:3001');
    console.log('Start the scenario: POST /api/scenario/start');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
