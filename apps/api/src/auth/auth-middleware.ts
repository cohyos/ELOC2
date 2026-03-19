import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool, findSession, findById } from '@eloc2/database';

export interface AuthUser {
  id: string;
  username: string;
  role: 'instructor' | 'operator';
  sessionId: string;
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Extract session ID from cookie or Authorization header.
 */
function extractSessionId(request: FastifyRequest): string | null {
  // Check Authorization header first: "Bearer <session-id>"
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Check cookie
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/session-id=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Fastify preHandler hook that validates session and populates req.user.
 * Returns 401 if session is invalid or missing.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = extractSessionId(request);
  if (!sessionId) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  try {
    const pool = getPool();
    const session = await findSession(pool, sessionId);
    if (!session) {
      reply.code(401).send({ error: 'Invalid or expired session' });
      return;
    }

    const user = await findById(pool, session.user_id);
    if (!user || !user.enabled) {
      reply.code(401).send({ error: 'User account is disabled' });
      return;
    }

    request.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      sessionId: session.session_id,
    };
  } catch (err) {
    request.log.error(err, 'Auth middleware error');
    reply.code(500).send({ error: 'Internal authentication error' });
  }
}

/**
 * Creates a preHandler that requires a specific role.
 */
export function requireRole(role: 'instructor' | 'operator') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // First run auth middleware to populate request.user
    if (!request.user) {
      await authMiddleware(request, reply);
      if (reply.sent) return;
    }

    if (!request.user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    // Instructors can do everything operators can
    if (role === 'operator' && request.user.role === 'instructor') {
      return;
    }

    if (request.user.role !== role) {
      reply.code(403).send({ error: `Requires ${role} role` });
    }
  };
}
