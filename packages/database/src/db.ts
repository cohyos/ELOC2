import { Pool } from 'pg';
import type { Pool as PoolType } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pool: PoolType | null = null;

/**
 * Returns a lazy singleton pg.Pool configured from DATABASE_URL env var.
 */
export function getPool(): PoolType {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

/**
 * Runs schema.sql to create tables if they don't exist.
 */
export async function initializeDatabase(p?: PoolType): Promise<void> {
  const dbPool = p ?? getPool();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, '../src/schema.sql');
  const altSchemaPath = path.resolve(__dirname, '../../src/schema.sql');

  let sql: string;
  if (fs.existsSync(schemaPath)) {
    sql = fs.readFileSync(schemaPath, 'utf-8');
  } else if (fs.existsSync(altSchemaPath)) {
    sql = fs.readFileSync(altSchemaPath, 'utf-8');
  } else {
    throw new Error(`schema.sql not found at ${schemaPath} or ${altSchemaPath}`);
  }

  await dbPool.query(sql);
}

/**
 * Closes the pool connection. Call on shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { Pool };
