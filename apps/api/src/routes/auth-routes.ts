import type { FastifyInstance } from 'fastify';
import {
  getPool,
  findByUsername,
  verifyPassword,
  createUser,
  createSession,
  deleteSession,
  countActiveSessions,
  listUsers,
  updateUser,
  deleteUser as deleteUserById,
  toggleEnabled,
} from '@eloc2/database';
import { authMiddleware, requireRole } from '../auth/auth-middleware.js';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const MAX_INSTRUCTORS = 1;
const MAX_OPERATORS = 10;

export function registerAuthRoutes(app: FastifyInstance): void {
  // Note: /api/auth/status is registered in server.ts (always available)

  // -----------------------------------------------------------------------
  // POST /api/auth/login
  // -----------------------------------------------------------------------
  app.post<{
    Body: { username: string; password: string };
  }>('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body ?? {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' });
    }

    const pool = getPool();
    const user = await findByUsername(pool, username);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    if (!user.enabled) {
      return reply.code(403).send({ error: 'Account is disabled' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Check role limits
    const activeCount = await countActiveSessions(pool, user.role);
    const limit = user.role === 'instructor' ? MAX_INSTRUCTORS : MAX_OPERATORS;
    if (activeCount >= limit) {
      return reply.code(409).send({
        error: `Maximum ${user.role} sessions reached (${limit})`,
      });
    }

    // Create session
    const session = await createSession(pool, user.id, user.role);

    // Set cookie
    reply.header(
      'Set-Cookie',
      `session-id=${session.session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${24 * 3600}`,
    );

    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      sessionId: session.session_id,
    };
  });

  // -----------------------------------------------------------------------
  // POST /api/auth/logout
  // -----------------------------------------------------------------------
  app.post('/api/auth/logout', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const pool = getPool();
    await deleteSession(pool, request.user!.sessionId);

    reply.header(
      'Set-Cookie',
      'session-id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );

    return { ok: true };
  });

  // -----------------------------------------------------------------------
  // GET /api/auth/me
  // -----------------------------------------------------------------------
  app.get('/api/auth/me', {
    preHandler: authMiddleware,
  }, async (request) => {
    return {
      id: request.user!.id,
      username: request.user!.username,
      role: request.user!.role,
    };
  });

  // -----------------------------------------------------------------------
  // GET /api/auth/users — Instructor only
  // -----------------------------------------------------------------------
  app.get('/api/auth/users', {
    preHandler: [authMiddleware, requireRole('instructor')],
  }, async () => {
    const pool = getPool();
    return listUsers(pool);
  });

  // -----------------------------------------------------------------------
  // POST /api/auth/users — Create user (Instructor only)
  // -----------------------------------------------------------------------
  app.post<{
    Body: { username: string; password: string; role: 'instructor' | 'operator' };
  }>('/api/auth/users', {
    preHandler: [authMiddleware, requireRole('instructor')],
  }, async (request, reply) => {
    const { username, password, role } = request.body ?? {};
    if (!username || !password || !role) {
      return reply.code(400).send({ error: 'username, password, and role are required' });
    }
    if (!['instructor', 'operator'].includes(role)) {
      return reply.code(400).send({ error: 'role must be instructor or operator' });
    }
    if (password.length < 6) {
      return reply.code(400).send({ error: 'password must be at least 6 characters' });
    }

    const pool = getPool();

    // Check if username already exists
    const existing = await findByUsername(pool, username);
    if (existing) {
      return reply.code(409).send({ error: 'Username already exists' });
    }

    const user = await createUser(pool, username, password, role);
    return reply.code(201).send(user);
  });

  // -----------------------------------------------------------------------
  // DELETE /api/auth/users/:id — Delete user (Instructor only)
  // -----------------------------------------------------------------------
  app.delete<{
    Params: { id: string };
  }>('/api/auth/users/:id', {
    preHandler: [authMiddleware, requireRole('instructor')],
  }, async (request, reply) => {
    const { id } = request.params;

    // Prevent self-deletion
    if (id === request.user!.id) {
      return reply.code(400).send({ error: 'Cannot delete your own account' });
    }

    const pool = getPool();
    const deleted = await deleteUserById(pool, id);
    if (!deleted) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return { ok: true };
  });

  // -----------------------------------------------------------------------
  // PATCH /api/auth/users/:id — Update user (Instructor only)
  // -----------------------------------------------------------------------
  app.patch<{
    Params: { id: string };
    Body: { role?: 'instructor' | 'operator'; enabled?: boolean };
  }>('/api/auth/users/:id', {
    preHandler: [authMiddleware, requireRole('instructor')],
  }, async (request, reply) => {
    const { id } = request.params;
    const { role, enabled } = request.body ?? {};

    if (role !== undefined && !['instructor', 'operator'].includes(role)) {
      return reply.code(400).send({ error: 'role must be instructor or operator' });
    }

    const pool = getPool();

    // If toggling enabled, use toggleEnabled shortcut
    if (enabled === undefined && role === undefined) {
      const toggled = await toggleEnabled(pool, id);
      if (!toggled) {
        return reply.code(404).send({ error: 'User not found' });
      }
      return toggled;
    }

    const updated = await updateUser(pool, id, { role, enabled });
    if (!updated) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return updated;
  });
}
