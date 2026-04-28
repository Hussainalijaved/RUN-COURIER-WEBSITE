import Stripe from 'stripe';

function getCredentials() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!secretKey || !publishableKey) {
    return null;
  }

  return {
    publishableKey,
    secretKey,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe | null> {
  const credentials = getCredentials();
  if (!credentials) {
    console.warn('[Stripe] Credentials not configured - Stripe disabled');
    return null;
  }

  return new Stripe(credentials.secretKey, {
    apiVersion: '2025-08-27.basil',
  });
}

export async function getStripePublishableKey(): Promise<string | null> {
  const credentials = getCredentials();
  return credentials?.publishableKey || null;
}

export async function getStripeSecretKey(): Promise<string | null> {
  const credentials = getCredentials();
  return credentials?.secretKey || null;
}

let stripeSync: any = null;

function getConnectionString(): string | null {
  try {
    // Match db.ts logic exactly to ensure we use the same working connection
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
      let connStr = process.env.DATABASE_URL.trim();
      // Ensure SSL is enabled
      if (!connStr.includes('sslmode=')) {
        connStr += connStr.includes('?') ? '&sslmode=require' : '?sslmode=require';
      }
      // Normalize to postgres:// for URL parser compatibility
      return connStr.replace('postgresql://', 'postgres://');
    }
    
    // Fall back to individual PG* variables (exactly as db.ts does)
    if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
      const host = process.env.PGHOST.trim();
      const port = (process.env.PGPORT || '5432').trim();
      const user = process.env.PGUSER.trim();
      const password = process.env.PGPASSWORD.trim();
      const database = process.env.PGDATABASE.trim();
      // Use postgres:// for manual construction
      return `postgres://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
    }
    
    return null;
  } catch (e) {
    console.warn('[Stripe] Database connection detection error:', e);
    return null;
  }
}




export async function getStripeSync() {
  if (!stripeSync) {
    try {
      const secretKey = await getStripeSecretKey();
      const connectionString = getConnectionString();
      
      if (!secretKey || !connectionString) {
        console.warn('[Stripe] Sync disabled - missing credentials or database');
        return null;
      }

      const { StripeSync } = await import('stripe-replit-sync');
      stripeSync = new StripeSync({
        poolConfig: {
          connectionString,
          max: 2,
        },
        stripeSecretKey: secretKey,
      });
    } catch (e: any) {
      console.warn('[Stripe] Sync initialization error:', e?.message);
      return null;
    }
  }
  return stripeSync;
}
