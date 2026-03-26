import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

/**
 * Extract session-id from raw cookie header string.
 */
function extractSessionIdFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session-id=([^;]+)/);
  return match ? match[1] : null;
}

export async function wsEventsRoute(app: FastifyInstance) {
  app.get('/ws/events', { websocket: true }, async (socket, request) => {
    // When auth is enabled, validate session cookie before allowing WS connection
    if (AUTH_ENABLED) {
      const sessionId = extractSessionIdFromCookie(request.headers.cookie);
      if (!sessionId) {
        socket.close(1008, 'Unauthorized');
        return;
      }
      try {
        const { getPool, findSession, findById } = await import('@eloc2/database');
        const pool = getPool();
        const session = await findSession(pool, sessionId);
        if (!session) {
          socket.close(1008, 'Unauthorized');
          return;
        }
        const user = await findById(pool, session.user_id);
        if (!user || !user.enabled) {
          socket.close(1008, 'Unauthorized');
          return;
        }
        // Attach session info for role detection below
        (request as any).session = { user: { role: user.role } };
      } catch {
        socket.close(1008, 'Unauthorized');
        return;
      }
    }

    // Determine user role from session (if auth enabled)
    let role: 'instructor' | 'operator' | 'anonymous' = 'anonymous';
    let downgraded = false;
    const session = (request as any).session;

    if (AUTH_ENABLED && session?.user?.role) {
      // Auth enabled: use authenticated role from session
      role = session.user.role === 'instructor' ? 'instructor' : 'operator';
    } else if (!AUTH_ENABLED) {
      // Auth disabled: parse role from query params (?role=instructor or ?role=operator)
      const url = new URL(request.url, 'http://localhost');
      const requestedRole = url.searchParams.get('role');

      if (requestedRole === 'instructor') {
        const users = engine.getConnectedUsers();
        if (users.instructors >= 1) {
          // Instructor slot taken — downgrade to operator
          role = 'operator';
          downgraded = true;
        } else {
          role = 'instructor';
        }
      } else {
        // Default to operator for no-auth mode (instead of anonymous)
        role = 'operator';
      }
    }

    // Register this WebSocket client with the live engine (includes role)
    engine.addWsClient(socket, role);

    // Send role confirmation to the client
    if (!AUTH_ENABLED) {
      if (downgraded) {
        socket.send(JSON.stringify({
          type: 'role.assigned',
          role: 'operator',
          reason: 'instructor_slot_taken',
        }));
      } else {
        socket.send(JSON.stringify({
          type: 'role.assigned',
          role,
        }));
      }
    }

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
