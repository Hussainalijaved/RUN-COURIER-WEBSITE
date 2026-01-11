import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { setupRealtimeServer, hydrateLocationCache } from './realtime';
import { db } from './db';
import { sql } from 'drizzle-orm';

// Run startup migrations to add new columns if they don't exist
async function runStartupMigrations() {
  try {
    // Add driver visibility columns to jobs table if they don't exist
    await db.execute(sql`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS driver_hidden BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS driver_hidden_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS driver_hidden_by VARCHAR(36)
    `);
    console.log('Startup migrations completed successfully');
  } catch (error) {
    console.error('Startup migration error (may be harmless if columns already exist):', error);
  }
}

const app = express();

// CRITICAL: CORS middleware that applies to ALL responses - must be FIRST
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://runcourier.co.uk',
    'https://www.runcourier.co.uk',
    'http://localhost:5000',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  
  // Always set CORS headers for all origins (frontend on Hostinger, Replit preview, localhost)
  if (origin) {
    if (allowedOrigins.includes(origin) || origin.includes('.replit.dev') || origin.includes('.replit.app')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      // Allow all origins for now to debug CORS issues
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle preflight OPTIONS requests immediately - don't continue to other middleware
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function getConnectionString(): string | null {
  // First try DATABASE_URL if it looks like a valid postgres connection string
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
  
  return null;
}

// Stripe initialization - runs fully in background, never blocks server startup
let stripeInitialized = false;
let stripeSyncInProgress = false;

async function initStripeInBackground() {
  const databaseUrl = getConnectionString();

  if (!databaseUrl) {
    console.warn('[Stripe] Database not configured - Stripe sync caching disabled');
    return;
  }

  try {
    console.log('[Stripe] Initializing schema in background...');
    await runMigrations({ databaseUrl });
    console.log('[Stripe] Schema ready');

    const stripeSync = await getStripeSync();

    console.log('[Stripe] Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const { webhook } = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
      {
        enabled_events: ['*'],
        description: 'Run Courier payment webhook',
      }
    );
    console.log(`[Stripe] Webhook configured: ${webhook.url}`);
    stripeInitialized = true;

    // Sync data in background - completely non-blocking
    console.log('[Stripe] Starting background data sync...');
    stripeSyncInProgress = true;
    stripeSync.syncBackfill()
      .then(() => {
        console.log('[Stripe] Background sync complete');
        stripeSyncInProgress = false;
      })
      .catch((err: any) => {
        stripeSyncInProgress = false;
        if (err?.code === 'resource_missing' || err?.message?.includes('No such customer')) {
          console.warn('[Stripe Sync] Skipped missing resource - normal if customers were deleted');
        } else {
          console.warn('[Stripe Sync] Non-critical sync issue:', err?.message || err);
        }
      });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('endpoint has been disabled') || 
        errorMessage.includes('XX000') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('ECONNREFUSED')) {
      console.warn('[Stripe] Database unavailable - sync caching disabled. Payments still work via direct API.');
    } else {
      console.error('[Stripe] Init error:', errorMessage);
    }
  }
}

// Export for manual trigger via admin endpoint
export async function triggerStripeSync() {
  if (stripeSyncInProgress) {
    return { status: 'already_running' };
  }
  
  try {
    const stripeSync = await getStripeSync();
    stripeSyncInProgress = true;
    await stripeSync.syncBackfill();
    stripeSyncInProgress = false;
    return { status: 'completed' };
  } catch (error: any) {
    stripeSyncInProgress = false;
    return { status: 'error', message: error?.message };
  }
}

// DO NOT await - fire and forget so server starts immediately
setTimeout(() => {
  initStripeInBackground().catch(err => {
    console.warn('[Stripe] Background init failed:', err?.message || err);
  });
}, 100); // Small delay to ensure server is fully up first

// Main Stripe webhook (managed by stripe-replit-sync)
app.post(
  '/api/stripe/webhook/:uuid',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      const { uuid } = req.params;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// Backup Stripe webhook for payment links (uses raw body for signature verification)
app.post(
  '/api/webhooks/payment-links',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-08-27.basil' });
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    // SECURITY: Require webhook secret to be configured
    if (!webhookSecret) {
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not configured - rejecting webhook');
      return res.status(500).json({ error: 'Webhook configuration error' });
    }
    
    if (!sig) {
      console.error('[Webhook] Missing stripe-signature header');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
    
    if (!Buffer.isBuffer(req.body)) {
      console.error('[Webhook] Raw body not available for signature verification');
      return res.status(400).json({ error: 'Raw body not available' });
    }
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        webhookSecret
      );
    } catch (err: any) {
      console.error(`[Webhook] Signature verification failed:`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      
      if (session.metadata?.type === 'payment_link' && session.metadata?.paymentLinkId) {
        // Import storage lazily to avoid circular dependencies
        const { storage } = await import('./storage');
        const link = await storage.getPaymentLink(session.metadata.paymentLinkId);
        
        if (link && link.status !== 'paid') {
          await storage.updatePaymentLink(link.id, {
            status: "paid",
            paidAt: new Date(),
            stripePaymentIntentId: session.payment_intent,
          });
          await storage.appendPaymentLinkAuditLog(link.id, "paid_via_webhook", undefined, `PaymentIntent: ${session.payment_intent}`);

          const job = await storage.getJob(link.jobId);
          if (job) {
            await storage.updateJob(link.jobId, {
              paymentStatus: "paid",
              paymentIntentId: session.payment_intent,
            });
          }

          console.log(`[Webhook] Payment completed via webhook for link ${link.id}`);
        }
      }
    }

    res.json({ received: true });
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run startup migrations in background - don't block server start
  runStartupMigrations().catch(err => {
    console.warn('[Migrations] Background migration failed:', err?.message || err);
  });
  
  await registerRoutes(httpServer, app);

  setupRealtimeServer(httpServer);
  
  // Hydrate cache in background - don't block server start
  hydrateLocationCache().catch(err => {
    console.warn('[Realtime] Failed to hydrate location cache:', err?.message || err);
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
