import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { createServer } from "http";

console.log("[BOOT] Starting server...");

const app = express();
const httpServer = createServer(app);

// Health check - always respond instantly
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Stripe webhook needs raw body - must come before json parser
app.post(
  '/api/stripe/webhook/:uuid',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    res.status(200).json({ received: true, note: "webhook placeholder" });
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

// Stripe sync exports (placeholder - does nothing on startup)
export async function triggerStripeSync() {
  return { status: 'disabled_for_testing' };
}

// Main startup - NO BLOCKING CALLS
(async () => {
  console.log("[BOOT] Registering routes...");
  
  // Register routes - this might be the blocker
  const { registerRoutes } = await import("./routes");
  await registerRoutes(httpServer, app);
  console.log("[BOOT] Routes registered");

  // Setup realtime - might be blocker
  console.log("[BOOT] Setting up realtime...");
  const { setupRealtimeServer } = await import('./realtime');
  setupRealtimeServer(httpServer);
  console.log("[BOOT] Realtime setup done");

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  // Vite/static serving - THIS IS LIKELY THE BLOCKER
  console.log("[BOOT] Setting up frontend serving...");
  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./static");
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
  console.log("[BOOT] Frontend serving ready");

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();

// Background tasks - start AFTER server is listening (non-blocking)
setTimeout(async () => {
  console.log("[BACKGROUND] Starting background tasks...");
  
  try {
    // Run startup migrations
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS driver_hidden BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS driver_hidden_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS driver_hidden_by VARCHAR(36)
    `);
    console.log("[BACKGROUND] Migrations done");
  } catch (e: any) {
    console.warn("[BACKGROUND] Migration error:", e?.message);
  }

  try {
    // Hydrate location cache
    const { hydrateLocationCache } = await import('./realtime');
    await hydrateLocationCache();
    console.log("[BACKGROUND] Location cache hydrated");
  } catch (e: any) {
    console.warn("[BACKGROUND] Cache hydration error:", e?.message);
  }

  try {
    // Initialize Stripe (completely optional, app works without it)
    const { runMigrations } = await import('stripe-replit-sync');
    const { getStripeSync } = await import('./stripeClient');
    
    const databaseUrl = process.env.DATABASE_URL || 
      (process.env.PGHOST ? `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE}` : null);
    
    if (databaseUrl) {
      await runMigrations({ databaseUrl });
      const stripeSync = await getStripeSync();
      const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`, {
        enabled_events: ['*'],
        description: 'Run Courier payment webhook',
      });
      console.log("[BACKGROUND] Stripe initialized");
      
      // Sync in background
      stripeSync.syncBackfill().catch((e: any) => {
        console.warn("[BACKGROUND] Stripe sync warning:", e?.message);
      });
    }
  } catch (e: any) {
    console.warn("[BACKGROUND] Stripe init error:", e?.message);
  }
}, 2000); // Wait 2 seconds after server starts
