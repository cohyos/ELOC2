/**
 * ASTERIX import/export API routes.
 *
 * POST /api/asterix/enable  — Start UDP listener, feed parsed observations into LiveEngine
 * POST /api/asterix/disable — Stop UDP listener
 * GET  /api/asterix/status  — Return listener status and statistics
 * POST /api/asterix/export  — Start exporting system tracks as CAT-062 UDP
 */

import type { FastifyInstance } from 'fastify';
import { createSocket, type Socket } from 'node:dgram';
import type { LiveEngine } from '../simulation/live-engine.js';
import {
  AsterixListener,
  type AsterixListenerConfig,
  encodeCAT062Record,
  encodeAsterixBlock,
} from '@eloc2/asterix-adapter';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AsterixState {
  listener: AsterixListener | null;
  enabled: boolean;
  port: number;
  recordsReceived: number;
  lastRecordTime: number | null;
  category: 48 | 62;

  // Export state
  exportEnabled: boolean;
  exportSocket: Socket | null;
  exportHost: string;
  exportPort: number;
  exportIntervalHandle: ReturnType<typeof setInterval> | null;
  recordsExported: number;
}

const state: AsterixState = {
  listener: null,
  enabled: false,
  port: 30003,
  recordsReceived: 0,
  lastRecordTime: null,
  category: 48,

  exportEnabled: false,
  exportSocket: null,
  exportHost: '127.0.0.1',
  exportPort: 30004,
  exportIntervalHandle: null,
  recordsExported: 0,
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerAsterixRoutes(app: FastifyInstance, engine: LiveEngine) {
  // POST /api/asterix/enable — Start UDP listener
  app.post<{
    Body: {
      port?: number;
      category?: 48 | 62;
      multicastGroup?: string;
      sensorPosition?: { lat: number; lon: number; alt: number };
    };
  }>('/api/asterix/enable', async (request, reply) => {
    if (state.enabled && state.listener) {
      return reply.code(409).send({ error: 'ASTERIX listener already enabled' });
    }

    const body = request.body ?? {};
    const port = body.port ?? 30003;
    const category = body.category ?? 48;
    const sensorPosition = body.sensorPosition ?? { lat: 31.5, lon: 34.5, alt: 0 };

    const config: AsterixListenerConfig = {
      port,
      category,
      sensorPosition,
      multicastGroup: body.multicastGroup,
    };

    const listener = new AsterixListener(config);

    listener.onObservation = (obs) => {
      state.recordsReceived++;
      state.lastRecordTime = Date.now();
      // Feed the observation into the LiveEngine's track manager
      try {
        engine.injectExternalObservation(obs);
      } catch {
        // Silently ignore if engine rejects
      }
    };

    listener.onError = (err) => {
      console.error(`[asterix-routes] Listener error: ${err.message}`);
    };

    try {
      listener.start();
    } catch (err) {
      return reply.code(500).send({
        error: `Failed to start listener: ${(err as Error).message}`,
      });
    }

    state.listener = listener;
    state.enabled = true;
    state.port = port;
    state.category = category;
    state.recordsReceived = 0;
    state.lastRecordTime = null;

    return {
      ok: true,
      port,
      category,
      message: `ASTERIX CAT-${category} listener started on UDP port ${port}`,
    };
  });

  // POST /api/asterix/disable — Stop UDP listener
  app.post('/api/asterix/disable', async (_request, reply) => {
    if (!state.enabled || !state.listener) {
      return reply.code(409).send({ error: 'ASTERIX listener is not enabled' });
    }

    state.listener.stop();
    state.listener = null;
    state.enabled = false;

    return { ok: true, message: 'ASTERIX listener stopped' };
  });

  // GET /api/asterix/status — Return listener status
  app.get('/api/asterix/status', async () => {
    return {
      enabled: state.enabled,
      port: state.port,
      category: state.category,
      recordsReceived: state.recordsReceived,
      lastRecordTime: state.lastRecordTime,
      export: {
        enabled: state.exportEnabled,
        host: state.exportHost,
        port: state.exportPort,
        recordsExported: state.recordsExported,
      },
    };
  });

  // POST /api/asterix/export — Start/stop exporting system tracks as CAT-062 UDP
  app.post<{
    Body: {
      enable: boolean;
      host?: string;
      port?: number;
      intervalMs?: number;
    };
  }>('/api/asterix/export', async (request, reply) => {
    const body = request.body ?? {} as any;

    if (body.enable) {
      // Start export
      if (state.exportEnabled) {
        return reply.code(409).send({ error: 'ASTERIX export already enabled' });
      }

      const host = body.host ?? '127.0.0.1';
      const port = body.port ?? 30004;
      const intervalMs = body.intervalMs ?? 1000;

      const socket = createSocket('udp4');

      const intervalHandle = setInterval(() => {
        try {
          const tracks = engine.getState().tracks;
          if (tracks.length === 0) return;

          const records = tracks.map((t) => encodeCAT062Record(t));
          const block = encodeAsterixBlock(62, records);

          socket.send(block, port, host, (err) => {
            if (err) {
              console.error(`[asterix-routes] Export send error: ${err.message}`);
            }
          });

          state.recordsExported += tracks.length;
        } catch (err) {
          console.error(`[asterix-routes] Export error: ${(err as Error).message}`);
        }
      }, intervalMs);

      state.exportEnabled = true;
      state.exportSocket = socket;
      state.exportHost = host;
      state.exportPort = port;
      state.exportIntervalHandle = intervalHandle;
      state.recordsExported = 0;

      return {
        ok: true,
        message: `ASTERIX CAT-062 export started to ${host}:${port} every ${intervalMs}ms`,
      };
    } else {
      // Stop export
      if (!state.exportEnabled) {
        return reply.code(409).send({ error: 'ASTERIX export is not enabled' });
      }

      if (state.exportIntervalHandle) {
        clearInterval(state.exportIntervalHandle);
        state.exportIntervalHandle = null;
      }
      if (state.exportSocket) {
        try {
          state.exportSocket.close();
        } catch {
          // ignore
        }
        state.exportSocket = null;
      }
      state.exportEnabled = false;

      return { ok: true, message: 'ASTERIX export stopped' };
    }
  });
}
