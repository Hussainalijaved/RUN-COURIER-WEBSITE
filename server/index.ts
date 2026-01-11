console.log("🔥 SERVER ENTRY LOADED");

import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { createServer } from "http";
import fs from "fs";

declare module "http" {
  interface IncomingMessage { rawBody: unknown; }
}

const PORT = Number(process.env.PORT) || 5000;
const IS_PROD = process.env.NODE_ENV === "production";

console.log(`[BOOT] Mode: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}, Port: ${PORT}`);

const app = express();
const httpServer = createServer(app);

// Health checks - ALWAYS available, FIRST
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/api/health", (req, res) => res.status(200).json({ 
  status: "ok", 
  mode: IS_PROD ? "production" : "development",
  timestamp: new Date().toISOString() 
}));

// CORS - safe, always needed
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function triggerStripeSync() {
  if (IS_PROD) return { status: 'disabled', message: 'Disabled in production safe mode' };
  try {
    const { getStripeSync } = await import('./stripeClient');
    const stripeSync = await getStripeSync();
    if (!stripeSync) return { status: 'disabled', message: 'Stripe not configured' };
    await stripeSync.syncBackfill();
    return { status: 'completed' };
  } catch (error: any) {
    return { status: 'error', message: error?.message };
  }
}

// PRODUCTION SAFE MODE
if (IS_PROD) {
  console.log("[BOOT] PRODUCTION SAFE MODE - Serving static files only");
  
  // Try to serve built static files
  const distPath = path.resolve(process.cwd(), "dist", "public");
  
  if (fs.existsSync(distPath)) {
    console.log("[BOOT] Serving from dist/public");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    console.log("[BOOT] No dist/public - serving fallback HTML");
    app.get("*", (req, res) => {
      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Run Courier - UK Delivery Services</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: white;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container { text-align: center; padding: 2rem; }
              h1 { 
                font-size: 3rem; 
                margin-bottom: 1rem;
                background: linear-gradient(90deg, #00d9ff, #00ff88);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
              p { font-size: 1.25rem; opacity: 0.9; margin-bottom: 2rem; }
              .status {
                display: inline-block;
                background: rgba(0, 255, 136, 0.2);
                border: 1px solid rgba(0, 255, 136, 0.5);
                padding: 0.5rem 1.5rem;
                border-radius: 2rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Run Courier</h1>
              <p>UK's Premier Delivery Service</p>
              <div class="status">Server Online</div>
            </div>
          </body>
        </html>
      `);
    });
  }

  // Start immediately - no async
  httpServer.listen({ port: PORT, host: "0.0.0.0" }, () => {
    log(`serving on port ${PORT}`);
    console.log("[BOOT] PRODUCTION READY - No background tasks");
  });
  
} else {
  // DEVELOPMENT MODE - Full functionality
  console.log("[BOOT] DEVELOPMENT MODE - Full features enabled");
  
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        res.status(status).json({ message });
      });

      console.log("[BOOT] Setting up Vite...");
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
      console.log("[BOOT] Vite ready");

      httpServer.listen({ port: PORT, host: "0.0.0.0" }, () => {
        log(`serving on port ${PORT}`);
        console.log("[BOOT] Server accepting connections");
        runBackgroundTasks();
      });
      
    } catch (error: any) {
      console.error("[BOOT] FATAL:", error?.message || error);
      process.exit(1);
    }
  })();
}

async function runBackgroundTasks() {
  if (IS_PROD) return;
  
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
        console.log("[BACKGROUND] Stripe sync disabled");
        return;
      }
      console.log("[BACKGROUND] Stripe initialized");
    } catch (e: any) {
      console.warn("[BACKGROUND] Stripe error:", e?.message);
    }
  })();
}
