import type { Pool } from 'pg';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: 'instructor' | 'operator';
  enabled: boolean;
  created_at: Date;
}

export interface UserInfo {
  id: string;
  username: string;
  role: 'instructor' | 'operator';
  enabled: boolean;
  created_at: Date;
}

function toUserInfo(row: UserRow): UserInfo {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    enabled: row.enabled,
    created_at: row.created_at,
  };
}

/**
 * Create a new user with a bcrypt-hashed password.
 */
export async function createUser(
  pool: Pool,
  username: string,
  password: string,
  role: 'instructor' | 'operator',
): Promise<UserInfo> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await pool.query<UserRow>(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [username, passwordHash, role],
  );
  return toUserInfo(result.rows[0]);
}

/**
 * Find a user by username. Returns null if not found.
 */
export async function findByUsername(
  pool: Pool,
  username: string,
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE username = $1',
    [username],
  );
  return result.rows[0] ?? null;
}

/**
 * Find a user by ID. Returns null if not found.
 */
export async function findById(
  pool: Pool,
  id: string,
): Promise<UserInfo | null> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );
  if (result.rows.length === 0) return null;
  return toUserInfo(result.rows[0]);
}

/**
 * List all users (without password hashes).
 */
export async function listUsers(pool: Pool): Promise<UserInfo[]> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM users ORDER BY created_at ASC',
  );
  return result.rows.map(toUserInfo);
}

/**
 * Update user fields (role, enabled).
 */
export async function updateUser(
  pool: Pool,
  id: string,
  updates: { role?: 'instructor' | 'operator'; enabled?: boolean },
): Promise<UserInfo | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (updates.role !== undefined) {
    setClauses.push(`role = $${paramIdx++}`);
    values.push(updates.role);
  }
  if (updates.enabled !== undefined) {
    setClauses.push(`enabled = $${paramIdx++}`);
    values.push(updates.enabled);
  }

  if (setClauses.length === 0) return findById(pool, id);

  values.push(id);
  const result = await pool.query<UserRow>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values,
  );
  if (result.rows.length === 0) return null;
  return toUserInfo(result.rows[0]);
}

/**
 * Delete a user by ID.
 */
export async function deleteUser(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Toggle a user's enabled status.
 */
export async function toggleEnabled(
  pool: Pool,
  id: string,
): Promise<UserInfo | null> {
  const result = await pool.query<UserRow>(
    'UPDATE users SET enabled = NOT enabled WHERE id = $1 RETURNING *',
    [id],
  );
  if (result.rows.length === 0) return null;
  return toUserInfo(result.rows[0]);
}

/**
 * Verify a password against the stored hash.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
