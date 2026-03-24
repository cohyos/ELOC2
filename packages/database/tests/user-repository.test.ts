import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import {
  createUser,
  findByUsername,
  findById,
  listUsers,
  updateUser,
  deleteUser,
  toggleEnabled,
  verifyPassword,
} from '../src/user-repository.js';

function mockPool(rows: unknown[] = [], rowCount = 1) {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount }),
  } as any;
}

const sampleUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  username: 'testuser',
  password_hash: '$2b$12$hashedpassword',
  role: 'operator' as const,
  enabled: true,
  created_at: new Date('2026-01-01'),
};

describe('user-repository', () => {
  describe('createUser', () => {
    it('should hash password and insert user', async () => {
      const pool = mockPool([sampleUser]);
      const result = await createUser(pool, 'testuser', 'password123', 'operator');

      expect(pool.query).toHaveBeenCalledOnce();
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO users');
      expect(params[0]).toBe('testuser');
      expect(params[1]).toBe('$2b$12$hashedpassword'); // bcrypt mock
      expect(params[2]).toBe('operator');

      expect(result.id).toBe(sampleUser.id);
      expect(result.username).toBe('testuser');
      expect(result).not.toHaveProperty('password_hash');
    });
  });

  describe('findByUsername', () => {
    it('should return user row when found', async () => {
      const pool = mockPool([sampleUser]);
      const result = await findByUsername(pool, 'testuser');

      expect(result).toEqual(sampleUser);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE username'),
        ['testuser'],
      );
    });

    it('should return null when not found', async () => {
      const pool = mockPool([]);
      const result = await findByUsername(pool, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user info without password hash', async () => {
      const pool = mockPool([sampleUser]);
      const result = await findById(pool, sampleUser.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(sampleUser.id);
      expect(result).not.toHaveProperty('password_hash');
    });

    it('should return null when not found', async () => {
      const pool = mockPool([]);
      const result = await findById(pool, 'nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('listUsers', () => {
    it('should return array of user info objects', async () => {
      const pool = mockPool([sampleUser, { ...sampleUser, id: 'id2', username: 'user2' }]);
      const result = await listUsers(pool);

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password_hash');
      expect(result[1].username).toBe('user2');
    });
  });

  describe('updateUser', () => {
    it('should update role', async () => {
      const updated = { ...sampleUser, role: 'instructor' as const };
      const pool = mockPool([updated]);
      const result = await updateUser(pool, sampleUser.id, { role: 'instructor' });

      expect(result).not.toBeNull();
      expect(result!.role).toBe('instructor');
      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain('UPDATE users SET');
      expect(sql).toContain('role');
    });

    it('should update enabled status', async () => {
      const updated = { ...sampleUser, enabled: false };
      const pool = mockPool([updated]);
      const result = await updateUser(pool, sampleUser.id, { enabled: false });

      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
    });

    it('should return null when user not found', async () => {
      const pool = mockPool([], 0);
      const result = await updateUser(pool, 'nonexistent', { role: 'instructor' });
      expect(result).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should return true when user deleted', async () => {
      const pool = mockPool([], 1);
      const result = await deleteUser(pool, sampleUser.id);
      expect(result).toBe(true);
    });

    it('should return false when user not found', async () => {
      const pool = mockPool([], 0);
      const result = await deleteUser(pool, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('toggleEnabled', () => {
    it('should toggle and return updated user', async () => {
      const toggled = { ...sampleUser, enabled: false };
      const pool = mockPool([toggled]);
      const result = await toggleEnabled(pool, sampleUser.id);

      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(false);
      const [sql] = pool.query.mock.calls[0];
      expect(sql).toContain('NOT enabled');
    });

    it('should return null when user not found', async () => {
      const pool = mockPool([]);
      const result = await toggleEnabled(pool, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('verifyPassword', () => {
    it('should delegate to bcrypt.compare', async () => {
      const result = await verifyPassword('password123', '$2b$12$hashedpassword');
      expect(result).toBe(true);
    });
  });
});
