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
import { registerLogRoutes } from './routes/log-routes.js';
import { wsEventsRoute } from './routes/ws-events.js';
import { engine } from './simulation/live-engine.js';


const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const server = Fastify({
  trustProxy: true,
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // Redact sensitive fields from logs
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.password_hash', '*.session_id'],
  },
  bodyLimit: 10 * 1024 * 1024, // 10MB max body size
});

// ── Security headers ─────────────────────────────────────────────────────
server.addHook('onSend', (_request, reply, payload, done) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (IS_PRODUCTION) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  done(null, payload);
});

// ── CORS ─────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : (IS_PRODUCTION ? [] : ['http://localhost:3000', 'http://localhost:3001']);

server.addHook('onRequest', (request, reply, done) => {
  const origin = request.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (request.method === 'OPTIONS') {
    reply.code(204).send();
    return;
  }
  done();
});

// ── Rate limiting on auth endpoints ──────────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max 10 login attempts per 15 min per IP

server.addHook('onRequest', (request, reply, done) => {
  if (request.url === '/api/auth/login' && request.method === 'POST') {
    const ip = request.ip;
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (entry && now < entry.resetAt) {
      if (entry.count >= RATE_LIMIT_MAX) {
        reply.code(429).send({ error: 'Too many login attempts. Try again later.' });
        return;
      }
      entry.count++;
    } else {
      loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
    // Periodic cleanup (every 100 requests)
    if (loginAttempts.size > 1000) {
      for (const [key, val] of loginAttempts) {
        if (now >= val.resetAt) loginAttempts.delete(key);
      }
    }
  }
  done();
});

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
registerLogRoutes(server, engine);
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
