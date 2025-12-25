import Stripe from 'stripe';

function getCredentials() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!secretKey || !publishableKey) {
    throw new Error('STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY environment variables are required');
  }

  return {
    publishableKey,
    secretKey,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil',
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = getCredentials();
  return secretKey;
}

let stripeSync: any = null;

function getConnectionString(): string {
  // First try DATABASE_URL if it looks like a valid postgres connection string
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
    return process.env.DATABASE_URL;
  }
  
  // Fall back to individual PG* variables
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || '5432';
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD;
    const database = process.env.PGDATABASE;
    return `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
  }
  
  throw new Error('Database connection not configured');
}

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();
    const connectionString = getConnectionString();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
