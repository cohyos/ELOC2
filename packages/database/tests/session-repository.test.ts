import { describe, it, expect, vi } from 'vitest';
import {
  createSession,
  findSession,
  deleteSession,
  deleteExpiredSessions,
  countActiveSessions,
} from '../src/session-repository.js';

function mockPool(rows: unknown[] = [], rowCount = 1) {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount }),
  } as any;
}

const sampleSession = {
  session_id: 'aaaa-bbbb-cccc-dddd',
  user_id: '1111-2222-3333-4444',
  role: 'operator',
  created_at: new Date('2026-01-01'),
  expires_at: new Date('2026-01-02'),
  active: true,
};

describe('session-repository', () => {
  describe('createSession', () => {
    it('should insert session with default 24h expiry', async () => {
      const pool = mockPool([sampleSession]);
      const result = await createSession(pool, '1111-2222-3333-4444', 'operator');

      expect(pool.query).toHaveBeenCalledOnce();
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO sessions');
      expect(params[0]).toBe('1111-2222-3333-4444');
      expect(params[1]).toBe('operator');
      expect(params[2]).toBe(24); // default hours
      expect(result.session_id).toBe(sampleSession.session_id);
    });

    it('should accept custom expiry hours', async () => {
      const pool = mockPool([sampleSession]);
      await createSession(pool, '1111-2222-3333-4444', 'operator', 48);

      const [, params] = pool.query.mock.calls[0];
      expect(params[2]).toBe(48);
    });
  });

  describe('findSession', () => {
    it('should return active non-expired session', async () => {
      const pool = mockPool([sampleSession]);
      const result = await findSession(pool, sampleSession.session_id);

      expect(result).toEqual(sampleSession);
      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain('active = true');
      expect(sql).toContain('expires_at > now()');
    });

    it('should return null when not found', async () => {
      const pool = mockPool([]);
      const result = await findSession(pool, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should deactivate session', async () => {
      const pool = mockPool([], 1);
      const result = await deleteSession(pool, sampleSession.session_id);

      expect(result).toBe(true);
      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain('active = false');
    });

    it('should return false when session not found', async () => {
      const pool = mockPool([], 0);
      const result = await deleteSession(pool, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('deleteExpiredSessions', () => {
    it('should delete expired and inactive sessions', async () => {
      const pool = mockPool([], 5);
      const result = await deleteExpiredSessions(pool);

      expect(result).toBe(5);
      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain('expires_at <= now()');
      expect(sql).toContain('active = false');
    });
  });

  describe('countActiveSessions', () => {
    it('should count all active sessions without role filter', async () => {
      const pool = mockPool([{ count: '3' }]);
      const result = await countActiveSessions(pool);

      expect(result).toBe(3);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('active = true');
      expect(params).toHaveLength(0);
    });

    it('should count active sessions filtered by role', async () => {
      const pool = mockPool([{ count: '1' }]);
      const result = await countActiveSessions(pool, 'instructor');

      expect(result).toBe(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('role = $1');
      expect(params).toEqual(['instructor']);
    });
  });
});
