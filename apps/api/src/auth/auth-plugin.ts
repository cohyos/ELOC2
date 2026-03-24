import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  getPool,
  initializeDatabase,
  findByUsername,
  createUser,
} from '@eloc2/database';
import { authMiddleware, requireRole } from './auth-middleware.js';

/**
 * Fastify plugin that sets up auth infrastructure:
 * - Initializes the database schema
 * - Seeds a default instructor account if users table is empty
 * - Decorates the app with auth helpers
 */
export async function authPlugin(app: FastifyInstance): Promise<void> {
  try {
    const pool = getPool();

    // Initialize database schema
    await initializeDatabase(pool);
    app.log.info('Database schema initialized');

    // Seed default instructor account if no users exist
    await seedDefaultInstructor(pool, app);

    // Decorate fastify with auth helpers
    app.decorate('authMiddleware', authMiddleware);
    app.decorate('requireRole', requireRole);
  } catch (err) {
    app.log.error(err, 'Auth plugin failed to initialize — server will start without auth. Check DATABASE_URL and database connectivity.');
    // Decorate with no-op helpers so the server can still start
    app.decorate('authMiddleware', authMiddleware);
    app.decorate('requireRole', requireRole);
  }
}

async function seedDefaultInstructor(
  pool: Pool,
  app: FastifyInstance,
): Promise<void> {
  try {
    const existing = await findByUsername(pool, 'admin');
    if (!existing) {
      // Use environment variable for default password; NEVER use hardcoded credentials
      const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;
      if (!defaultPassword || defaultPassword.length < 12) {
        app.log.warn(
          'No ADMIN_DEFAULT_PASSWORD env var set (or < 12 chars) — skipping default instructor seed. ' +
          'Set ADMIN_DEFAULT_PASSWORD to create the initial admin account.',
        );
        return;
      }
      await createUser(pool, 'admin', defaultPassword, 'instructor');
      app.log.info('Default instructor account created (username: admin)');
    }
  } catch (err) {
    app.log.warn(err, 'Could not seed default instructor — users table may already have data');
  }
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authMiddleware: typeof authMiddleware;
    requireRole: typeof requireRole;
  }
}
