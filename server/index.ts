console.log("🔥 REAL ENTRY FILE LOADED");

import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { createServer } from "http";

const PORT = parseInt(process.env.PORT || "5000", 10);
let viteReady = false;

const app = express();
const httpServer = createServer(app);

// Health checks FIRST - always available
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/api/health", (req, res) => res.status(200).json({ status: "ok", viteReady }));

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

declare module "http" {
  interface IncomingMessage { rawBody: unknown; }
}

app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function triggerStripeSync() {
  try {
    const { getStripeSync } = await import('./stripeClient');
    const stripeSync = await getStripeSync();
    if (!stripeSync) {
      return { status: 'disabled', message: 'Stripe not configured' };
    }
    await stripeSync.syncBackfill();
    return { status: 'completed' };
  } catch (error: any) {
    return { status: 'error', message: error?.message };
  }
}

// Initialize everything BEFORE starting server
(async () => {
  try {
    console.log("[BOOT] Registering routes...");
    const { registerRoutes } = await import("./routes");
    await registerRoutes(httpServer, app);
    console.log("[BOOT] Routes registered");
    
    console.log("[BOOT] Setting up realtime...");
    const { setupRealtimeServer } = await import('./realtime');
    setupRealtimeServer(httpServer);
    console.log("[BOOT] Realtime done");

    // Error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    console.log("[BOOT] Setting up Vite...");
    if (process.env.NODE_ENV === "production") {
      const { serveStatic } = await import("./static");
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
    console.log("[BOOT] Vite ready");
    viteReady = true;

    // NOW start server - everything is ready
    httpServer.listen({ port: PORT, host: "0.0.0.0" }, () => {
      log(`serving on port ${PORT}`);
      console.log("[BOOT] Server accepting connections - READY FOR TRAFFIC");
      
      // Background tasks (non-blocking)
      runBackgroundTasks();
    });
    
  } catch (error: any) {
    console.error("[BOOT] FATAL:", error?.message || error);
    process.exit(1);
  }
})();

async function runBackgroundTasks() {
  console.log("[BACKGROUND] Starting background tasks...");
  
  (async () => {
    try {
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
  })();

  (async () => {
    try {
      const { hydrateLocationCache } = await import('./realtime');
      await hydrateLocationCache();
      console.log("[BACKGROUND] Cache hydrated");
    } catch (e: any) {
      console.warn("[BACKGROUND] Cache error:", e?.message);
    }
  })();

  (async () => {
    try {
      const { getStripeSync } = await import('./stripeClient');
      const stripeSync = await getStripeSync();
      
      if (!stripeSync) {
        console.log("[BACKGROUND] Stripe sync disabled - not configured");
        return;
      }
      
      const databaseUrl = process.env.DATABASE_URL || 
        (process.env.PGHOST ? `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE}` : null);
      
      if (databaseUrl) {
        try {
          const { runMigrations } = await import('stripe-replit-sync');
          await runMigrations({ databaseUrl });
        } catch (migrationError: any) {
          console.warn("[BACKGROUND] Stripe migration warning:", migrationError?.message);
        }
        
        try {
          const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost'}`;
          await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`, {
            enabled_events: ['*'],
            description: 'Run Courier payment webhook',
          });
          console.log("[BACKGROUND] Stripe initialized");
        } catch (webhookError: any) {
          console.warn("[BACKGROUND] Stripe webhook warning:", webhookError?.message);
        }
        
        stripeSync.syncBackfill().catch((e: any) => {
          console.warn("[BACKGROUND] Stripe sync warning:", e?.message);
        });
      }
    } catch (e: any) {
      console.warn("[BACKGROUND] Stripe error:", e?.message);
    }
  })();
}
