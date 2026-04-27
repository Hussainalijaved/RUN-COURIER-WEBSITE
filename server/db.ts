import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dns from 'dns';
import * as schema from '@shared/schema';

// Helper to force IPv4 lookup for database hosts
const forceIPv4Lookup = (hostname: string, opts: any, cb: any) => {
  return dns.lookup(hostname, { family: 4 }, cb);
};

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getConnectionString(): string | null {
  try {
    // First try DATABASE_URL if it looks like a valid postgres connection string
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
      let connStr = process.env.DATABASE_URL;
      // Ensure SSL is enabled for secure connections
      if (!connStr.includes('sslmode=')) {
        connStr += connStr.includes('?') ? '&sslmode=require' : '?sslmode=require';
      }
      return connStr;
    }
    
    // Fall back to individual PG* variables (Replit built-in database)
    if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
      const host = process.env.PGHOST;
      const port = process.env.PGPORT || '5432';
      const user = process.env.PGUSER;
      const password = process.env.PGPASSWORD;
      const database = process.env.PGDATABASE;
      // Add sslmode=require for secure connections to Neon/Supabase
      return `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
    }
    
    return null;
  } catch (e) {
    console.warn('[DB] Error getting connection string:', e);
    return null;
  }
}

function initDb() {
  if (dbInstance) return dbInstance;
  
  const connectionString = getConnectionString();
  
  if (!connectionString) {
    console.warn('[DB] Database not configured - running without database');
    return null;
  }
  
  try {
    console.log('[DB] Initializing with SSL fix...');
    pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false },
      //@ts-ignore
      lookup: forceIPv4Lookup
    });
    dbInstance = drizzle(pool, { schema });
    console.log('[DB] Database connection initialized');
    return dbInstance;
  } catch (e) {
    console.warn('[DB] Failed to initialize database:', e);
    return null;
  }
}

// Lazy-loaded database export - use getDb() instead of db directly
export function getDb() {
  return initDb();
}

// For backward compatibility - lazy proxy that initializes on first access
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(target, prop) {
    const instance = initDb();
    if (!instance) {
      throw new Error('Database not available - check configuration');
    }
    return (instance as any)[prop];
  }
});

export function isDatabaseAvailable(): boolean {
  return getConnectionString() !== null;
}
