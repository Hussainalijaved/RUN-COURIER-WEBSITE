import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@shared/schema';

function getConnectionString(): string {
  // First try NEON_DATABASE_URL (external Neon database)
  if (process.env.NEON_DATABASE_URL && process.env.NEON_DATABASE_URL.startsWith('postgresql://')) {
    return process.env.NEON_DATABASE_URL;
  }
  
  // Then try DATABASE_URL if it looks like a valid postgres connection string
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
    return process.env.DATABASE_URL;
  }
  
  // Fall back to individual PG* variables (Replit built-in database)
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || '5432';
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD;
    const database = process.env.PGDATABASE;
    // Replit's built-in database doesn't require SSL
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
  
  throw new Error('Database connection not configured. Set NEON_DATABASE_URL, DATABASE_URL, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE');
}

const connectionString = getConnectionString();

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
