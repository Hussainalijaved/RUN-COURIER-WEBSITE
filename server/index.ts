console.log("🔥 SERVER ENTRY LOADED - VERSION 1.1 (DB FIX)");

import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { createServer } from "http";
import fs from "fs";
import dns from "dns";

// Fix Node 17+ resolving IPv6 first when it shouldn't, causing ECONNREFUSED with Supabase PostGres and Fetch
dns.setDefaultResultOrder("ipv4first");

// Helper to force IPv4 lookup for database hosts
const forceIPv4Lookup = (hostname: string, opts: any, cb: any) => {
  return dns.lookup(hostname, { family: 4 }, cb);
};

declare module "http" {
  interface IncomingMessage { rawBody: unknown; }
}

const PORT = Number(process.env.PORT) || 5000;
const IS_PROD = process.env.NODE_ENV === "production";

console.log(`[BOOT] Mode: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}, Port: ${PORT}`);

// Environment variable validation with graceful failure
function validateEnvironment(): { valid: boolean; warnings: string[]; critical: string[] } {
  const warnings: string[] = [];
  const critical: string[] = [];
  
  // Critical variables - required for core functionality
  const criticalVars = [
    { name: 'SUPABASE_URL', alt: 'VITE_SUPABASE_URL' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', alt: null },
    { name: 'SESSION_SECRET', alt: null },
  ];
  
  // Warning variables - functionality degraded without them
  const warningVars = [
    { name: 'VITE_SUPABASE_ANON_KEY', alt: 'SUPABASE_ANON_KEY' },
    { name: 'STRIPE_SECRET_KEY', alt: null },
    { name: 'VITE_GOOGLE_MAPS_API_KEY', alt: 'GOOGLE_MAPS_API_KEY' },
  ];
  
  for (const v of criticalVars) {
    const value = process.env[v.name] || (v.alt ? process.env[v.alt] : null);
    if (!value) {
      critical.push(`Missing ${v.name}${v.alt ? ` (or ${v.alt})` : ''}`);
    }
  }
  
  for (const v of warningVars) {
    const value = process.env[v.name] || (v.alt ? process.env[v.alt] : null);
    if (!value) {
      warnings.push(`Missing ${v.name}${v.alt ? ` (or ${v.alt})` : ''} - some features may be disabled`);
    }
  }
  
  // Log results
  if (critical.length > 0) {
    console.error('[ENV] Critical environment errors:');
    critical.forEach(c => console.error(`  - ${c}`));
  }
  if (warnings.length > 0) {
    console.warn('[ENV] Environment warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }
  if (critical.length === 0 && warnings.length === 0) {
    console.log('[ENV] All environment variables validated');
  }
  
  return { valid: critical.length === 0, warnings, critical };
}

const envCheck = validateEnvironment();
if (!envCheck.valid && IS_PROD) {
  console.error('[BOOT] Critical environment variables missing - server may not function correctly');
  // Don't crash in production, but log the issue
}

const app = express();
const httpServer = createServer(app);

// Health checks - ALWAYS available, FIRST (before any redirect middleware)
// Deployment promote checks rely on these returning 200 immediately.
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/healthz", (req, res) => res.status(200).send("OK"));
app.get("/api/health", (req, res) => res.status(200).json({ 
  status: "ok", 
  mode: IS_PROD ? "production" : "development",
  timestamp: new Date().toISOString() 
}));

// www redirect removed — Render handles the canonical host (non-www).
// Forcing www here was causing a redirect loop with Render's redirect rules.
app.use((req, res, next) => {
  next();
});

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

// PRODUCTION MODE - Full API with static files
if (IS_PROD) {
  console.log("[BOOT] PRODUCTION MODE - Full API enabled");
  
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Start listening IMMEDIATELY so /health responds during deploy promote checks.
  // Routes/realtime/static are wired up asynchronously below.
  httpServer.listen({ port: PORT, host: "0.0.0.0" }, () => {
    log(`serving on port ${PORT}`);
    console.log("[BOOT] Listening (early) - health checks ready");
  });

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
      
      app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        if (status >= 500) console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${message}`, err.stack || '');
        else console.warn(`[WARN] ${req.method} ${req.path} → ${status}: ${message}`);
        res.status(status).json({ message });
      });
      
      // Serve static files AFTER API routes
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

      console.log("[BOOT] PRODUCTION READY");
      runBackgroundTasks();
      
    } catch (error: any) {
      console.error("[BOOT] FATAL:", error?.message || error);
      process.exit(1);
    }
  })();
  
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

      app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        if (status >= 500) console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${message}`, err.stack || '');
        else console.warn(`[WARN] ${req.method} ${req.path} → ${status}: ${message}`);
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

async function runMigrations() {
  try {
    const { getDb } = await import('./db');
    const db = getDb();
    if (!db) {
      console.warn("[MIGRATION] Database not available for migrations");
      return;
    }
    const { sql } = await import('drizzle-orm');

    console.log("[MIGRATION] Starting unified sequence...");

    // 1. Drizzle-based migrations (these use our fixed Pool from db.ts)
    try {
      await db.execute(sql`
        ALTER TABLE jobs 
        ADD COLUMN IF NOT EXISTS driver_hidden BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS driver_hidden_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS driver_hidden_by VARCHAR(36)
      `);
      
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS contract_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS driver_contracts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          template_id UUID REFERENCES contract_templates(id),
          driver_id TEXT NOT NULL,
          driver_name TEXT NOT NULL,
          driver_email TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          sent_at TIMESTAMPTZ,
          signed_at TIMESTAMPTZ,
          signature_data TEXT,
          signed_name TEXT,
          token TEXT UNIQUE NOT NULL,
          contract_content TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS notice_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          subject TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'general',
          requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
          created_by TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          is_active BOOLEAN NOT NULL DEFAULT true
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS driver_notices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          template_id UUID REFERENCES notice_templates(id),
          title TEXT NOT NULL,
          subject TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'general',
          sent_by TEXT,
          sent_at TIMESTAMPTZ,
          target_type TEXT NOT NULL DEFAULT 'all',
          requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
          status TEXT NOT NULL DEFAULT 'draft'
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS driver_notice_recipients (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          notice_id UUID NOT NULL REFERENCES driver_notices(id) ON DELETE CASCADE,
          driver_id TEXT NOT NULL,
          driver_email TEXT,
          delivery_channel TEXT NOT NULL DEFAULT 'dashboard',
          sent_at TIMESTAMPTZ DEFAULT NOW(),
          viewed_at TIMESTAMPTZ,
          acknowledged_at TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'sent'
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS supervisors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          auth_user_id UUID UNIQUE,
          email TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL DEFAULT '',
          phone TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          invite_token TEXT UNIQUE,
          invite_token_expires_at TIMESTAMPTZ,
          invited_by TEXT,
          invited_at TIMESTAMPTZ DEFAULT NOW(),
          activated_at TIMESTAMPTZ,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS driver_devices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          driver_id TEXT NOT NULL,
          push_token TEXT NOT NULL,
          platform TEXT NOT NULL DEFAULT 'android',
          app_version TEXT,
          device_info TEXT,
          last_seen_at TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(driver_id, push_token)
        )
      `);

      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'flexible'`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_type_percent DECIMAL(5,2) DEFAULT 0`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_type_amount DECIMAL(10,2) DEFAULT 0`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by TEXT`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_notes TEXT`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS waiting_time_minutes INTEGER DEFAULT 0`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_hidden BOOLEAN DEFAULT FALSE`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS office_city TEXT`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS api_client_id TEXT`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payment_method TEXT`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_barcode TEXT`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS delivery_barcode TEXT`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS barcode_scanned_at_pickup BOOLEAN DEFAULT FALSE`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS barcode_verified_at_delivery BOOLEAN DEFAULT FALSE`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_barcode_scan_time TIMESTAMPTZ`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS delivery_barcode_scan_time TIMESTAMPTZ`);
      await db.execute(sql`ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS city TEXT`);
      
      // Drivers table essential columns
      await db.execute(sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT false`);
      await db.execute(sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`);
      await db.execute(sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS driver_code TEXT`);
      await db.execute(sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone TEXT`);
      await db.execute(sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email TEXT`);

      console.log("[MIGRATION] Essential structural updates complete");
    } catch (e: any) {
      console.warn("[MIGRATION] Drizzle migration warning:", e?.message);
    }

    // 2. PG Pool sessions (for tables requiring more complex SQL or IF NOT EXISTS)
    const { Pool } = await import('pg');
    const poolOptions = {
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: parseInt(process.env.PGPORT || '5432'),
      ssl: { rejectUnauthorized: false },
      max: 2,
      //@ts-ignore
      lookup: forceIPv4Lookup
    };
    
    const pool = new Pool(poolOptions);

    try {
      // driver_locations
      await pool.query(`
        CREATE TABLE IF NOT EXISTS driver_locations (
          id BIGSERIAL PRIMARY KEY,
          driver_id UUID NOT NULL,
          job_id UUID,
          latitude DOUBLE PRECISION NOT NULL,
          longitude DOUBLE PRECISION NOT NULL,
          speed REAL,
          heading REAL,
          accuracy REAL,
          is_moving BOOLEAN DEFAULT false,
          recorded_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations (driver_id)`);
      await pool.query(`
        CREATE OR REPLACE FUNCTION update_driver_locations_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await pool.query(`
        CREATE OR REPLACE TRIGGER trigger_driver_locations_updated_at
        BEFORE UPDATE ON driver_locations
        FOR EACH ROW
        EXECUTE FUNCTION update_driver_locations_updated_at()
      `);

      // job_admin_notes
      await pool.query(`
        CREATE TABLE IF NOT EXISTS job_admin_notes (
          job_id TEXT NOT NULL PRIMARY KEY,
          notes TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE job_admin_notes ADD COLUMN IF NOT EXISTS office_city TEXT`);
      await pool.query(`ALTER TABLE job_admin_notes ADD COLUMN IF NOT EXISTS created_by TEXT`);

      // API clients
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_clients (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          company_name TEXT NOT NULL,
          contact_name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          linked_business_user_id TEXT,
          api_key_hash TEXT NOT NULL,
          api_key_last4 VARCHAR(4) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          allow_quote BOOLEAN NOT NULL DEFAULT TRUE,
          allow_booking BOOLEAN NOT NULL DEFAULT FALSE,
          allow_tracking BOOLEAN NOT NULL DEFAULT TRUE,
          allow_cancel BOOLEAN NOT NULL DEFAULT FALSE,
          allow_webhooks BOOLEAN NOT NULL DEFAULT FALSE,
          notes TEXT,
          last_used_at TIMESTAMPTZ,
          request_count INTEGER NOT NULL DEFAULT 0,
          payment_mode TEXT NOT NULL DEFAULT 'instant',
          stripe_customer_id TEXT,
          invoice_cycle TEXT NOT NULL DEFAULT 'weekly',
          account_status TEXT NOT NULL DEFAULT 'active',
          credit_limit NUMERIC(10,2),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'instant'`);
      await pool.query(`ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
      await pool.query(`ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS invoice_cycle TEXT NOT NULL DEFAULT 'weekly'`);
      await pool.query(`ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'`);
      await pool.query(`ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(10,2)`);

      // Contacts table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contacts (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          company_name TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // API invoices
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_invoices (
          id SERIAL PRIMARY KEY,
          invoice_number TEXT NOT NULL UNIQUE,
          api_client_id INTEGER NOT NULL,
          company_name TEXT NOT NULL,
          billing_email TEXT NOT NULL,
          period_start DATE NOT NULL,
          period_end DATE NOT NULL,
          total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          job_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'sent',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          sent_at TIMESTAMPTZ,
          paid_at TIMESTAMPTZ,
          notes TEXT
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS driver_application_vehicles (
          application_id VARCHAR(36) PRIMARY KEY,
          email TEXT,
          vehicle_registration TEXT,
          vehicle_make TEXT,
          vehicle_model TEXT,
          vehicle_color TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // API integration requests
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_integration_requests (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          company_name TEXT NOT NULL,
          contact_name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          website TEXT,
          business_type TEXT,
          platform_used TEXT,
          monthly_volume TEXT,
          integration_type TEXT NOT NULL,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'new',
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE api_integration_requests ADD COLUMN IF NOT EXISTS linked_api_client_id INTEGER`);
      await pool.query(`ALTER TABLE api_integration_requests ADD COLUMN IF NOT EXISTS api_access_email_sent BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE api_integration_requests ADD COLUMN IF NOT EXISTS api_access_email_sent_at TIMESTAMPTZ`);

      // API logs
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_logs (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          api_client_id INTEGER,
          client_name TEXT,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          request_payload_safe JSONB,
          response_payload_safe JSONB,
          status_code INTEGER NOT NULL,
          success BOOLEAN NOT NULL,
          error_message TEXT,
          booking_reference TEXT,
          ip_address TEXT
        )
      `);

      // API invoice items
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_invoice_items (
          id SERIAL PRIMARY KEY,
          invoice_id INTEGER NOT NULL REFERENCES api_invoices(id) ON DELETE CASCADE,
          job_id TEXT NOT NULL,
          tracking_number TEXT NOT NULL,
          pickup_address TEXT,
          delivery_address TEXT,
          vehicle_type TEXT,
          scheduled_date TEXT,
          amount NUMERIC(10,2) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE api_invoice_items ADD COLUMN IF NOT EXISTS job_number TEXT`);

      // Notification recipients
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_recipients (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          notification_id UUID NOT NULL,
          recipient_user_id TEXT,
          recipient_name TEXT,
          recipient_email TEXT,
          recipient_role TEXT,
          is_read BOOLEAN DEFAULT false,
          delivered_at TIMESTAMPTZ DEFAULT NOW(),
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      console.log("[MIGRATION] Persistent tables ensured successfully");

    } catch (e: any) {
      console.warn("[MIGRATION] Pool migration warning:", e?.message);
    } finally {
      await pool.end();
    }

    console.log("[MIGRATION] All migrations finished.");
  } catch (e: any) {
    console.error("[MIGRATION] Critical error in runner:", e?.message);
  }
}

async function runBackgroundTasks() {
  // Always run migrations first
  await runMigrations();
  












  // Backfill driver_application_vehicles from approved drivers (once; safe to re-run)
  setTimeout(async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.PGHOST, user: process.env.PGUSER, password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE, port: parseInt(process.env.PGPORT || '5432'),
        ssl: { rejectUnauthorized: false }, max: 2,
      });
      // Find approved drivers that have vehicle_registration in drivers table
      const { data: drivers } = await supabaseAdmin
        .from('drivers')
        .select('id, email, vehicle_registration, vehicle_make, vehicle_model, vehicle_color')
        .eq('status', 'approved')
        .not('vehicle_registration', 'is', null);
      if (drivers && drivers.length > 0) {
        let seeded = 0;
        for (const driver of drivers) {
          if (!driver.vehicle_registration) continue;
          // Find the matching application by email (no created_at column in driver_applications)
          const { data: apps } = await supabaseAdmin
            .from('driver_applications')
            .select('id, vehicle_type')
            .ilike('email', driver.email || '')
            .in('status', ['approved', 'pending'])
            .limit(1);
          if (!apps || apps.length === 0) continue;
          const appId = apps[0].id;
          // Only insert if not already present
          const { rowCount } = await pool.query(
            `SELECT 1 FROM driver_application_vehicles WHERE application_id = $1 AND vehicle_registration IS NOT NULL LIMIT 1`,
            [appId]
          );
          if (rowCount && rowCount > 0) continue;
          await pool.query(
            `INSERT INTO driver_application_vehicles (application_id, email, vehicle_registration, vehicle_make, vehicle_model, vehicle_color, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (application_id) DO UPDATE SET
               vehicle_registration = COALESCE(EXCLUDED.vehicle_registration, driver_application_vehicles.vehicle_registration),
               vehicle_make = COALESCE(EXCLUDED.vehicle_make, driver_application_vehicles.vehicle_make),
               vehicle_model = COALESCE(EXCLUDED.vehicle_model, driver_application_vehicles.vehicle_model),
               vehicle_color = COALESCE(EXCLUDED.vehicle_color, driver_application_vehicles.vehicle_color),
               updated_at = NOW()`,
            [appId, driver.email, driver.vehicle_registration, driver.vehicle_make || null, driver.vehicle_model || null, driver.vehicle_color || null]
          );
          seeded++;
        }
        if (seeded > 0) console.log(`[BACKGROUND] Seeded vehicle data for ${seeded} applications from drivers`);
      }
      await pool.end();
    } catch (e: any) {
      console.warn("[BACKGROUND] driver_application_vehicles backfill error:", e?.message);
    }
  }, 12000);

  // Backfill job_admin_notes from Supabase (runs once; safe if columns don't exist in Supabase yet)
  (async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;
      const { data } = await (supabaseAdmin as any)
        .from('jobs')
        .select('id, office_city, created_by')
        .or('office_city.not.is.null,created_by.not.is.null');
      if (!data || data.length === 0) return;
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        port: parseInt(process.env.PGPORT || '5432'),
        ssl: { rejectUnauthorized: false },
        max: 2,
      });
      let count = 0;
      for (const job of data) {
        if (!job.office_city && !job.created_by) continue;
        try {
          await pool.query(
            `INSERT INTO job_admin_notes (job_id, office_city, created_by, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (job_id) DO UPDATE SET
               office_city = CASE WHEN $2 IS NOT NULL THEN $2 ELSE job_admin_notes.office_city END,
               created_by = CASE WHEN $3 IS NOT NULL THEN $3 ELSE job_admin_notes.created_by END,
               updated_at = NOW()`,
            [job.id, job.office_city || null, job.created_by || null]
          );
          count++;
        } catch {}
      }
      await pool.end();
      if (count > 0) console.log(`[MIGRATION] Backfilled ${count} jobs with office_city/created_by from Supabase`);
    } catch {}
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

  // Fix drivers with missing or invalid driver_code (should be RC##L format)
  (async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;

      const { data: allDrivers } = await supabaseAdmin
        .from('drivers')
        .select('id, driver_code, driver_id');

      if (!allDrivers || allDrivers.length === 0) return;

      const validFormat = /^RC\d{2}[A-Z]$/;
      const existingCodes = new Set<string>();
      allDrivers.forEach((d: any) => {
        if (d.driver_code && validFormat.test(d.driver_code)) existingCodes.add(d.driver_code);
        if (d.driver_id && validFormat.test(d.driver_id)) existingCodes.add(d.driver_id);
      });

      const needsFix = allDrivers.filter((d: any) => !d.driver_code || !validFormat.test(d.driver_code));
      if (needsFix.length === 0) {
        console.log("[BACKGROUND] All drivers have valid RC-format codes");
        return;
      }

      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let fixed = 0;
      for (const d of needsFix) {
        // If driver_id has valid format, use it
        if (d.driver_id && validFormat.test(d.driver_id)) {
          await supabaseAdmin.from('drivers').update({ driver_code: d.driver_id }).eq('id', d.id);
          existingCodes.add(d.driver_id);
          fixed++;
          continue;
        }
        // Generate a new unique code
        let newCode = '';
        for (let i = 0; i < 1000; i++) {
          const candidate = `RC${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}${letters[Math.floor(Math.random() * 26)]}`;
          if (!existingCodes.has(candidate)) {
            newCode = candidate;
            break;
          }
        }
        if (newCode) {
          const { error } = await supabaseAdmin.from('drivers').update({ driver_code: newCode }).eq('id', d.id);
          if (!error) {
            existingCodes.add(newCode);
            fixed++;
            console.log(`[BACKGROUND] Fixed driver ${d.id}: ${d.driver_code || d.driver_id || 'none'} -> ${newCode}`);
          }
        }
      }
      if (fixed > 0) {
        console.log(`[BACKGROUND] Fixed ${fixed} driver codes to RC-format`);
      }
    } catch (e: any) {
      console.warn("[BACKGROUND] Driver code fix error:", e?.message);
    }
  })();

  // Add RLS policy for drivers to update their own profile picture
  (async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) {
        console.warn("[BACKGROUND] Supabase admin not available for RLS migration");
        return;
      }

      // Create RLS policy to allow drivers to update their own profile
      // Using a Postgres function for the policy
      const { error } = await supabaseAdmin.rpc('exec_sql', {
        query: `
          DO $$
          BEGIN
            -- Drop existing policy if it exists
            DROP POLICY IF EXISTS "drivers_update_own_profile" ON drivers;
            
            -- Create policy allowing drivers to update their own records
            CREATE POLICY "drivers_update_own_profile" ON drivers
              FOR UPDATE
              USING (auth.uid() = id)
              WITH CHECK (auth.uid() = id);
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'RLS policy creation failed: %', SQLERRM;
          END $$;
        `
      });

      if (error) {
        // Try alternative approach - direct SQL via REST API
        console.log("[BACKGROUND] RLS policy via RPC failed, trying direct approach...");
        
        // Alternative: Just log that policy should be added manually
        console.log("[BACKGROUND] Please add the following RLS policy in Supabase dashboard:");
        console.log("  Policy name: drivers_update_own_profile");
        console.log("  For: UPDATE on drivers table");
        console.log("  Using: auth.uid() = id");
      } else {
        console.log("[BACKGROUND] RLS policy for driver profile updates created/updated");
      }
    } catch (e: any) {
      console.warn("[BACKGROUND] RLS policy setup error:", e?.message);
    }
  })();

  // Reconcile approved applications that are missing driver accounts (e.g. from server crash during approval)
  (async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;

      const { data: approvedApps, error: appsErr } = await supabaseAdmin
        .from('driver_applications')
        .select('id, full_name, email, phone, postcode, full_address, vehicle_type, bank_name, account_holder_name, sort_code, account_number, nationality, is_british, national_insurance_number, profile_picture_url, driving_licence_front_url, driving_licence_back_url, dbs_certificate_url, goods_in_transit_insurance_url, hire_and_reward_url')
        .eq('status', 'approved');
      if (appsErr) { console.warn("[BACKGROUND] Reconcile: approved apps query error:", appsErr.message); return; }

      if (!approvedApps || approvedApps.length === 0) return;

      const { data: existingDrivers } = await supabaseAdmin.from('drivers').select('email');
      const driverEmailSet = new Set<string>(
        (existingDrivers || []).map((d: any) => d.email?.toLowerCase()).filter(Boolean)
      );

      const missing = approvedApps.filter((a: any) => !driverEmailSet.has(a.email?.toLowerCase()));
      if (missing.length === 0) {
        console.log("[BACKGROUND] All approved applications have driver accounts");
        return;
      }

      console.log(`[BACKGROUND] Found ${missing.length} approved application(s) without driver accounts - reconciling...`);

      const { sendDriverApprovalEmail } = await import('./emailService');
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

      async function genCode(): Promise<string> {
        const { data: allCodes } = await supabaseAdmin!.from('drivers').select('driver_code').not('driver_code', 'is', null);
        const used = new Set<string>((allCodes || []).map((d: any) => d.driver_code).filter((c: any) => /^RC\d{2}[A-Z]$/.test(c)));
        for (let i = 0; i < 500; i++) {
          const code = `RC${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${letters[Math.floor(Math.random()*26)]}`;
          if (!used.has(code)) return code;
        }
        return `RC${Date.now() % 100}A`;
      }

      function genPassword(): string {
        const words = ['Run','Fast','Drive','Go','Ace','Top','Jet','Max','Pro','Key'];
        const pick = () => words[Math.floor(Math.random() * words.length)];
        return `${pick()}${pick()}${pick()}${100 + Math.floor(Math.random()*900)}`;
      }

      for (const app of missing) {
        try {
          // Clean up any orphaned auth user
          const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000, page: 1 });
          const oldUser = allUsers?.users?.find((u: any) => u.email?.toLowerCase() === app.email?.toLowerCase());
          if (oldUser) {
            const { data: oldDriver } = await supabaseAdmin.from('drivers').select('id, is_active').eq('id', oldUser.id).maybeSingle();
            if (!oldDriver || oldDriver.is_active === false) {
              if (oldDriver) await supabaseAdmin.from('drivers').delete().eq('id', oldUser.id);
              await supabaseAdmin.auth.admin.deleteUser(oldUser.id);
            }
          }

          const tempPassword = genPassword();
          const { data: authResult, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: app.email, password: tempPassword, email_confirm: true,
            user_metadata: { fullName: app.full_name, role: 'driver', phone: app.phone }
          });
          if (authErr || !authResult?.user) {
            console.error(`[BACKGROUND] Reconcile: failed to create auth for ${app.email}:`, authErr?.message);
            continue;
          }

          const userId = authResult.user.id;
          const driverCode = await genCode();

          const driverData: Record<string, any> = {
            id: userId, user_id: userId, driver_code: driverCode,
            full_name: app.full_name, email: app.email, phone: app.phone,
            postcode: app.postcode || null, address: app.full_address || null,
            nationality: app.nationality || null,
            is_british: app.is_british ?? true,
            national_insurance_number: app.national_insurance_number || null,
            vehicle_type: app.vehicle_type || 'car',
            online_status: 'offline', status: 'approved', is_active: true,
            bank_name: app.bank_name || null, account_holder_name: app.account_holder_name || null,
            sort_code: app.sort_code || null, account_number: app.account_number || null,
          };

          let { error: insertErr } = await supabaseAdmin.from('drivers').upsert(driverData, { onConflict: 'id' });
          if (insertErr) {
            console.warn(`[BACKGROUND] Reconcile: insert warning for ${app.email}: ${insertErr.message}`);
            const retry = await supabaseAdmin.from('drivers').upsert(driverData, { onConflict: 'id' });
            insertErr = retry.error;
          }

          if (insertErr) {
            console.error(`[BACKGROUND] Reconcile: failed to create driver record for ${app.email}:`, insertErr.message);
            continue;
          }

          // Set must_change_password
          try { await supabaseAdmin.from('drivers').update({ must_change_password: true }).eq('id', userId); } catch {}

          // Send approval email
          try {
            await sendDriverApprovalEmail(app.email, app.full_name, driverCode, tempPassword);
          } catch (emailErr) {
            console.error(`[BACKGROUND] Reconcile: email failed for ${app.email}:`, emailErr);
          }

          console.log(`[BACKGROUND] Reconcile: created driver ${driverCode} for ${app.full_name} (${app.email})`);
        } catch (err: any) {
          console.error(`[BACKGROUND] Reconcile error for ${app.email}:`, err?.message);
        }
      }
    } catch (e: any) {
      console.warn("[BACKGROUND] Approved-applications reconciliation error:", e?.message);
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

  setTimeout(async () => {
    try {
      const fs = await import('fs');
      const pathMod = await import('path');
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;

      const uploadsDir = pathMod.default.join(process.cwd(), 'uploads', 'documents');
      if (!fs.existsSync(uploadsDir)) return;

      const BUCKET = 'driver-documents';
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
      };

      const localDirToStoragePrefix = (dirName: string): string => {
        if (dirName === 'application-pending') return 'applications/pending';
        if (dirName.startsWith('application-')) return `applications/${dirName.replace('application-', '')}`;
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(dirName)) return `${dirName}`;
        return dirName;
      };

      const dirs = fs.readdirSync(uploadsDir, { withFileTypes: true })
        .filter((d: any) => d.isDirectory());

      let synced = 0;
      for (const dir of dirs) {
        const dirPath = pathMod.default.join(uploadsDir, dir.name);
        const files = fs.readdirSync(dirPath);
        const storagePrefix = localDirToStoragePrefix(dir.name);

        for (const file of files) {
          const ext = pathMod.default.extname(file).toLowerCase();
          const contentType = mimeMap[ext];
          if (!contentType) continue;

          const storagePath = `${storagePrefix}/${file}`;
          const fileBuf = fs.readFileSync(pathMod.default.join(dirPath, file));
          const { error } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(storagePath, fileBuf, { contentType, upsert: false });
          if (!error) synced++;
        }
      }
      if (synced > 0) {
        console.log(`[BACKGROUND] Synced ${synced} local document files to Supabase Storage`);
      }
    } catch (e: any) {
      console.warn("[BACKGROUND] Document sync error:", e?.message);
    }
  }, 10000);

  setTimeout(async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;

      const { data: drivers } = await supabaseAdmin.from('drivers').select('id, email, vehicle_registration, vehicle_make, vehicle_model, vehicle_color').eq('status', 'approved');
      if (drivers && drivers.length > 0) {
        let backfilled = 0;
        for (const driver of drivers) {
          if (driver.vehicle_registration) continue;
          const { data: app } = await supabaseAdmin.from('driver_applications')
            .select('vehicle_type, vehicle_registration, vehicle_make, vehicle_model, vehicle_color')
            .ilike('email', driver.email || '')
            .eq('status', 'approved')
            .maybeSingle();
          if (!app) continue;
          let reg = app.vehicle_registration;
          let make = app.vehicle_make;
          let model = app.vehicle_model;
          let color = app.vehicle_color;
          if (!reg && app.vehicle_type?.includes('|')) {
            reg = app.vehicle_type.split('|')[1];
          }
          if (reg) {
            const updateFields: Record<string, any> = { vehicle_registration: reg };
            if (make) updateFields.vehicle_make = make;
            if (model) updateFields.vehicle_model = model;
            if (color) updateFields.vehicle_color = color;
            await supabaseAdmin.from('drivers').update(updateFields).eq('id', driver.id);
            backfilled++;
          }
        }
        if (backfilled > 0) {
          console.log(`[BACKGROUND] Backfilled vehicle details for ${backfilled} drivers`);
        }
      }
    } catch (e: any) {
      console.warn("[BACKGROUND] Vehicle backfill error:", e?.message);
    }
  }, 8000);

  setTimeout(async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;

      console.log("[BACKGROUND] Starting driver_documents reconciliation...");

      const { data: docs, error: docsErr } = await supabaseAdmin
        .from('driver_documents')
        .select('id, driver_id, doc_type, file_url');

      if (docsErr || !docs || docs.length === 0) {
        if (docsErr) console.warn("[BACKGROUND] Failed to fetch driver_documents:", docsErr.message);
        return;
      }

      console.log(`[BACKGROUND] Checking ${docs.length} driver_documents entries...`);

      const DOC_TYPE_GROUPS: string[][] = [
        ['driving_license', 'driving_licence_front', 'driving_license_front', 'drivingLicenceFront', 'drivingLicenseFront'],
        ['driving_licence_back', 'driving_license_back', 'drivingLicenceBack', 'drivingLicenseBack'],
        ['dbs_certificate', 'dbsCertificate'],
        ['goods_in_transit', 'goods_in_transit_insurance', 'goodsInTransitInsurance', 'goodsInTransit'],
        ['hire_and_reward', 'hire_and_reward_insurance', 'hire_reward_insurance', 'hireAndReward', 'hireAndRewardInsurance'],
        ['proof_of_identity', 'proofOfIdentity'],
        ['proof_of_address', 'proofOfAddress'],
        ['profile_picture', 'profile', 'profilePicture'],
        ['vehicle_photo_front', 'vehicle_photos_front', 'vehiclePhotoFront'],
        ['vehicle_photo_back', 'vehicle_photos_back', 'vehiclePhotoBack'],
        ['vehicle_photo_left', 'vehicle_photos_left', 'vehiclePhotoLeft'],
        ['vehicle_photo_right', 'vehicle_photos_right', 'vehiclePhotoRight'],
        ['vehicle_photo_load_space', 'vehicle_photos_load', 'vehiclePhotoLoadSpace'],
      ];

      const getDocPrefixes = (fileName: string): string[] => {
        const baseName = fileName.replace(/\.[^.]+$/, '');
        const withoutTimestamp = baseName.replace(/_\d{10,}$/, '');
        for (const group of DOC_TYPE_GROUPS) {
          for (const prefix of group) {
            if (withoutTimestamp === prefix || withoutTimestamp.startsWith(prefix + '_')) {
              return group;
            }
          }
        }
        return [withoutTimestamp];
      }

      const BUCKETS = ['driver-documents', 'DRIVER-DOCUMENTS'];
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const folderCache = new Map<string, { bucket: string; name: string }[]>();

      const listDriverFolder = async (driverId: string): Promise<{ bucket: string; name: string }[]> => {
        const cached = folderCache.get(driverId);
        if (cached) return cached;
        const allFiles: { bucket: string; name: string }[] = [];
        for (const bucket of BUCKETS) {
          try {
            const { data, error } = await supabaseAdmin!.storage
              .from(bucket)
              .list(driverId, { limit: 200 });
            if (!error && data) {
              for (const f of data) {
                if (f.name && f.name !== '.emptyFolderPlaceholder') {
                  allFiles.push({ bucket, name: f.name });
                }
              }
            }
          } catch (_) {}
        }
        folderCache.set(driverId, allFiles);
        return allFiles;
      }

      let updated = 0;
      let checked = 0;

      for (const doc of docs) {
        checked++;
        if (!doc.file_url || !doc.driver_id) continue;
        if (!uuidPattern.test(doc.driver_id)) continue;

        const fileUrl = doc.file_url as string;
        const pathMatch = fileUrl.match(/\/(?:api\/)?uploads\/documents\/([^/]+)\/(.+)$/);
        if (!pathMatch) continue;

        const driverId = pathMatch[1];
        const requestedFile = pathMatch[2];

        if (!uuidPattern.test(driverId)) continue;

        const storagePath = `${driverId}/${requestedFile}`;
        let exactExists = false;
        for (const bucket of BUCKETS) {
          try {
            const { data, error } = await supabaseAdmin.storage
              .from(bucket)
              .download(storagePath);
            if (!error && data) {
              exactExists = true;
              break;
            }
          } catch (_) {}
        }

        if (exactExists) continue;

        const searchFolders = [driverId, `applications/${driverId}`];
        const prefixes = getDocPrefixes(requestedFile);
        let matchedFile: string | null = null;
        let matchedFolder: string | null = null;

        for (const folder of searchFolders) {
          const folderFiles = await listDriverFolder(folder);
          if (folderFiles.length === 0) continue;

          for (const storageFile of folderFiles) {
            const storageBaseName = storageFile.name.replace(/\.[^.]+$/, '');
            const storageWithoutTs = storageBaseName.replace(/_\d{10,}$/, '');
            for (const prefix of prefixes) {
              if (storageWithoutTs === prefix || storageWithoutTs.startsWith(prefix + '_')) {
                matchedFile = storageFile.name;
                matchedFolder = folder;
                break;
              }
            }
            if (matchedFile) break;
          }
          if (matchedFile) break;
        }

        if (matchedFile && matchedFolder) {
          const newUrl = `/api/uploads/documents/${matchedFolder}/${matchedFile}`;
          const { error: updateErr } = await supabaseAdmin
            .from('driver_documents')
            .update({ file_url: newUrl })
            .eq('id', doc.id);
          if (!updateErr) {
            updated++;
            console.log(`[BACKGROUND] Reconciled doc ${doc.id}: ${requestedFile} -> ${matchedFolder}/${matchedFile}`);
          }
        }
      }

      console.log(`[BACKGROUND] Document reconciliation complete: checked ${checked}, updated ${updated}`);
    } catch (e: any) {
      console.warn("[BACKGROUND] Document reconciliation error:", e?.message);
    }
  }, 120000);

  setTimeout(async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;

      console.log("[BACKGROUND] Starting profile picture URL sync...");

      const { data: drivers, error } = await supabaseAdmin
        .from('drivers')
        .select('id, profile_picture_url')
        .not('profile_picture_url', 'is', null);

      if (error || !drivers) {
        if (error) console.warn("[BACKGROUND] Failed to fetch drivers for profile pic sync:", error.message);
        return;
      }

      const BUCKET = 'driver-documents';
      let synced = 0;

      for (const driver of drivers) {
        const url = driver.profile_picture_url as string;
        if (!url) continue;
        if (url.startsWith('http')) continue;

        const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(url);
        const publicUrl = publicUrlData?.publicUrl;
        if (!publicUrl) continue;

        const { error: updateErr } = await supabaseAdmin
          .from('drivers')
          .update({ profile_picture_url: publicUrl })
          .eq('id', driver.id);

        if (!updateErr) {
          synced++;
          console.log(`[BACKGROUND] Synced profile pic URL for driver ${driver.id}: ${url} -> public URL`);
        }
      }

      const { data: driversEmpty } = await supabaseAdmin
        .from('drivers')
        .select('id, profile_picture_url')
        .or('profile_picture_url.is.null,profile_picture_url.eq.');

      if (driversEmpty && driversEmpty.length > 0) {
        const { storage: localStorage } = await import('./storage');
        for (const driver of driversEmpty) {
          try {
            const localDriver = await localStorage.getDriver(driver.id);
            const localUrl = (localDriver as any)?.profilePictureUrl;
            if (!localUrl) continue;

            const storagePath = localUrl.startsWith('/api/uploads/documents/')
              ? localUrl.replace('/api/uploads/documents/', '')
              : localUrl;

            const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
            const publicUrl = publicUrlData?.publicUrl;
            if (!publicUrl) continue;

            const { error: updateErr } = await supabaseAdmin
              .from('drivers')
              .update({ profile_picture_url: publicUrl })
              .eq('id', driver.id);

            if (!updateErr) {
              synced++;
              console.log(`[BACKGROUND] Synced missing profile pic for driver ${driver.id} from local DB`);
            }
          } catch (_) {}
        }
      }

      console.log(`[BACKGROUND] Profile picture URL sync complete: synced ${synced}`);
    } catch (e: any) {
      console.warn("[BACKGROUND] Profile picture sync error:", e?.message);
    }
  }, 25000);



  // Start weekly API invoicing scheduler
  (async () => {
    try {
      const { scheduleWeeklyInvoicing } = await import('./apiInvoicing');
      scheduleWeeklyInvoicing();
    } catch (e: any) {
      console.warn("[BACKGROUND] Invoicing scheduler error:", e?.message);
    }
  })();
}
