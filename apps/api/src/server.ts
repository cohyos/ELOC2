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
import { registerOperatorRoutes } from './routes/operator-routes.js';
import { registerQualityRoutes } from './routes/quality-routes.js';
import { registerReportRoutes } from './routes/report-routes.js';
import { registerDeploymentRoutes } from './routes/deployment-routes.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerAsterixRoutes } from './routes/asterix-routes.js';
import { wsEventsRoute } from './routes/ws-events.js';
import { engine } from './simulation/live-engine.js';
import { getElevation, loadTile, isLoaded } from '@eloc2/terrain';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

const server = Fastify({ logger: true });

// Register WebSocket support
await server.register(fastifyWebsocket);

// In production, serve workstation static files from the same port
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workstationDist = path.resolve(__dirname, '../../workstation/dist');
const distExists = fs.existsSync(workstationDist);
const indexExists = distExists && fs.existsSync(path.join(workstationDist, 'index.html'));

console.log(`[static] NODE_ENV=${process.env.NODE_ENV}, distPath=${workstationDist}, distExists=${distExists}, indexExists=${indexExists}`);

if (process.env.NODE_ENV === 'production' && distExists) {
  await server.register(fastifyStatic, { root: workstationDist, prefix: '/' });
  // SPA fallback: serve index.html for non-API routes
  server.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.sendFile('index.html');
    }
  });
} else if (process.env.NODE_ENV === 'production') {
  console.error(`[static] WARNING: workstation dist not found at ${workstationDist} — no UI will be served`);
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

// Instructor availability check (for no-auth role selection)
server.get('/api/simulation/instructor-available', async () => {
  const users = engine.getConnectedUsers();
  return { available: users.instructors === 0 };
});

// Connected users list (for user management view)
server.get('/api/simulation/connected-users', async () => {
  return { users: engine.getConnectedUsersList() };
});

// Initialize auth if enabled
if (AUTH_ENABLED) {
  const { authPlugin } = await import('./auth/auth-plugin.js');
  await server.register(authPlugin);
  server.log.info('Auth system enabled — DATABASE_URL required');
} else {
  server.log.info('Auth system disabled — set AUTH_ENABLED=true to enable');
}

// Always register /api/auth/status so the frontend can detect auth state
server.get('/api/auth/status', async () => {
  return { enabled: AUTH_ENABLED };
});

// Register full auth routes only when auth is enabled
if (AUTH_ENABLED) {
  registerAuthRoutes(server);
}

// GET /api/terrain/elevation — Query terrain elevation at lat/lon
server.get<{ Querystring: { lat: string; lon: string } }>('/api/terrain/elevation', async (request, reply) => {
  const lat = parseFloat(request.query.lat);
  const lon = parseFloat(request.query.lon);
  if (isNaN(lat) || isNaN(lon)) {
    return reply.code(400).send({ error: 'lat and lon query parameters are required (numeric)' });
  }
  // Try to load the tile if not already loaded
  if (!isLoaded()) {
    const dataDir = path.resolve(__dirname, '../../../../data/srtm');
    loadTile(lat, lon, dataDir);
  } else {
    const dataDir = path.resolve(__dirname, '../../../../data/srtm');
    loadTile(lat, lon, dataDir);
  }
  const elevation = getElevation(lat, lon);
  return { lat, lon, elevationM: elevation ?? null };
});

// Register route modules
await server.register(rapRoutes);
await server.register(sensorRoutes);
await server.register(taskRoutes);
await server.register(groupRoutes);
await server.register(scenarioRoutes);
registerEditorRoutes(server, engine);
registerInvestigationRoutes(server, engine);
registerOperatorRoutes(server, engine);
registerQualityRoutes(server, engine);
registerReportRoutes(server, engine);
registerDeploymentRoutes(server);
registerAsterixRoutes(server, engine);
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
