import { Pool } from 'pg';

/**
 * Gestor Financeiro — Shared Database Pool Singleton
 * Manages a single, centralized connection pool across all backend endpoints,
 * preventing connection exhaustion on Azure Database for PostgreSQL.
 */

let pool: Pool | null = null;

export const getPool = (): Pool => {
  const g = globalThis as any;
  if (g.__gf_pg_pool) {
    return g.__gf_pg_pool as Pool;
  }
  if (pool) {
    g.__gf_pg_pool = pool;
    return pool;
  }

  const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  const connectionString = rawConnectionString 
    ? rawConnectionString.replace('?sslmode=require', '') 
    : rawConnectionString;

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false }
  });

  pool.on('connect', (client) => {
    client.query('SET client_encoding = "UTF8"').catch((e) => {
      console.error('Failed to set client_encoding to UTF8:', e);
    });
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });

  g.__gf_pg_pool = pool;
  return pool;
};

export default getPool;
