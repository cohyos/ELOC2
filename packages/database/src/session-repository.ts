import type { Pool } from 'pg';

const DEFAULT_SESSION_HOURS = 24;

export interface SessionRow {
  session_id: string;
  user_id: string;
  role: string;
  created_at: Date;
  expires_at: Date;
  active: boolean;
}

/**
 * Create a new session for a user.
 */
export async function createSession(
  pool: Pool,
  userId: string,
  role: string,
  expiresInHours: number = DEFAULT_SESSION_HOURS,
): Promise<SessionRow> {
  const result = await pool.query<SessionRow>(
    `INSERT INTO sessions (user_id, role, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))
     RETURNING *`,
    [userId, role, expiresInHours],
  );
  return result.rows[0];
}

/**
 * Find an active, non-expired session by session_id.
 */
export async function findSession(
  pool: Pool,
  sessionId: string,
): Promise<SessionRow | null> {
  const result = await pool.query<SessionRow>(
    `SELECT * FROM sessions
     WHERE session_id = $1 AND active = true AND expires_at > now()`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}

/**
 * Delete (deactivate) a session.
 */
export async function deleteSession(
  pool: Pool,
  sessionId: string,
): Promise<boolean> {
  const result = await pool.query(
    'UPDATE sessions SET active = false WHERE session_id = $1',
    [sessionId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete all expired sessions (cleanup).
 */
export async function deleteExpiredSessions(pool: Pool): Promise<number> {
  const result = await pool.query(
    'DELETE FROM sessions WHERE expires_at <= now() OR active = false',
  );
  return result.rowCount ?? 0;
}

/**
 * Count active (non-expired) sessions, optionally filtered by role.
 */
export async function countActiveSessions(
  pool: Pool,
  role?: string,
): Promise<number> {
  let query = 'SELECT COUNT(*) as count FROM sessions WHERE active = true AND expires_at > now()';
  const params: string[] = [];

  if (role) {
    query += ' AND role = $1';
    params.push(role);
  }

  const result = await pool.query<{ count: string }>(query, params);
  return parseInt(result.rows[0].count, 10);
}
