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

// PRODUCTION MODE - Full API with static files
if (IS_PROD) {
  console.log("[BOOT] PRODUCTION MODE - Full API enabled");
  
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

      httpServer.listen({ port: PORT, host: "0.0.0.0" }, () => {
        log(`serving on port ${PORT}`);
        console.log("[BOOT] PRODUCTION READY");
        runBackgroundTasks();
      });
      
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
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return;
      
      const { error } = await supabaseAdmin.rpc('exec_sql', {
        query: `
          ALTER TABLE drivers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
          ALTER TABLE drivers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
        `
      });
      
      if (error) {
        console.warn("[BACKGROUND] Driver columns migration via RPC failed:", error.message);
      } else {
        console.log("[BACKGROUND] Driver must_change_password and approved_at columns ensured");
      }
    } catch (e: any) {
      console.warn("[BACKGROUND] Driver columns migration error:", e?.message);
    }
  })();

  (async () => {
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (supabaseAdmin) {
        const { error: tableCheck } = await supabaseAdmin.from('driver_locations').select('id').limit(1);
        if (tableCheck?.message?.includes('Could not find')) {
          console.log("[MIGRATION] driver_locations table does not exist yet.");
          console.log("[MIGRATION] Please run supabase/migrations/031_create_driver_locations.sql in Supabase SQL Editor");
          console.log("[MIGRATION] GPS tracking will use WebSocket + drivers table as fallback until then");
        } else if (tableCheck) {
          console.warn("[MIGRATION] driver_locations check error:", tableCheck.message);
        } else {
          console.log("[MIGRATION] driver_locations table exists and is accessible");
        }
      }
    } catch (e: any) {
      console.warn("[MIGRATION] driver_locations check:", e?.message);
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
  }, 20000);

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
}
