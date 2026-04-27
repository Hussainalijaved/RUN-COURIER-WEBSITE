import type { Express, Request, Response, NextFunction } from "express";
import compression from "compression";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  insertJobSchema,
  insertDriverSchema,
  insertDocumentSchema,
  insertNotificationSchema,
  insertVendorApiKeySchema,
  insertDriverApplicationSchema,
  bookingQuoteSchema,
  type JobStatus,
  type VehicleType,
  type DriverApplicationStatus,
  type JobAssignmentStatus,
} from "@shared/schema";
import { stripeService, type BookingData } from "./stripeService";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";
import { registerMobileRoutes } from "./mobileRoutes";
import { sendNewJobNotification, sendDriverApplicationNotification, sendDocumentUploadNotification, sendPaymentNotification, sendContactFormSubmission, sendPasswordResetEmail, sendWelcomeEmail, sendNewRegistrationNotification, sendCustomerBookingConfirmation, sendPaymentLinkEmail, sendPaymentConfirmationEmail, sendPaymentLinkFailureNotification, sendBusinessQuoteEmail, sendEmailVerification, sendJobCancellationEmail, sendDeliveryConfirmationEmail, sendEmailNotification, sendQuoteNotification, sendAdminNotification, wrapEmailContent, ADMIN_EMAIL, INFO_EMAIL, SENDER_EMAIL } from "./emailService";
import { sendBookingConfirmationSMS, sendPickupNotificationSMS, sendDeliveredSMS, sendStatusUpdateSMS, sendDriverJobAssignmentSMS, sendAdminNewBookingAlert } from "./twilioService";
import { createHash, randomBytes } from "crypto";
import { broadcastJobUpdate, broadcastJobCreated, broadcastJobAssigned, broadcastDocumentPending, broadcastJobWithdrawn, broadcastDriverAvailability, broadcastProfileUpdate } from "./realtime";
import { geocodeAddress } from "./geocoding";
import { stableJobNumberCache, persistJobNumber, ensureJobNumber, assignStableJobNumbers, generateJobNumber } from "./jobNumbers";
import { Pool } from "pg";
import dns from "dns";

// Helper to force IPv4 lookup for database hosts
const forceIPv4Lookup = (hostname: string, opts: any, cb: any) => {
  return dns.lookup(hostname, { family: 4 }, cb);
};

function generateReadableTempPassword(): string {
  const words = ['Run', 'Fast', 'Drive', 'Go', 'Ace', 'Top', 'Jet', 'Max', 'Pro', 'Key', 'Win', 'Zip', 'Fly', 'Red', 'Blu',
    'Dash', 'Bold', 'Star', 'Pace', 'Rush', 'Keen', 'Snap', 'Grip', 'Lift', 'Peak', 'Core', 'Edge', 'Volt', 'True', 'Firm'];
  const { randomInt } = require('crypto');
  const word1 = words[randomInt(words.length)];
  const word2 = words[randomInt(words.length)];
  const word3 = words[randomInt(words.length)];
  const num = randomInt(100, 1000);
  return `${word1}${word2}${word3}${num}`;
}

async function generateUniqueDriverCode(supabaseAdmin: any): Promise<string> {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const { data: existingDrivers } = await supabaseAdmin
    .from('drivers')
    .select('driver_code')
    .not('driver_code', 'is', null);
  const usedCodes = new Set<string>(
    (existingDrivers || [])
      .map((d: any) => d.driver_code)
      .filter((c: any) => typeof c === 'string' && /^RC\d{2}[A-Z]$/.test(c))
  );
  let attempts = 0;
  while (attempts < 1000) {
    const n1 = Math.floor(Math.random() * 10);
    const n2 = Math.floor(Math.random() * 10);
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const code = `RC${n1}${n2}${letter}`;
    if (!usedCodes.has(code)) return code;
    attempts++;
  }
  const ts = Date.now().toString().slice(-3);
  return `RC${ts[0]}${ts[1]}${letters[parseInt(ts[2]) % 26]}`;
}

let pgPool: Pool | null = null;
function getPgPool(): Pool {
  if (!pgPool) {
    // Prioritize individual PG variables
    if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
      console.log(`[PgPool] Initializing Pool with individual params - Host: ${process.env.PGHOST}, User: ${process.env.PGUSER}`);
      pgPool = new Pool({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        port: parseInt(process.env.PGPORT || '5432'),
        max: 3,
        ssl: { rejectUnauthorized: false },
        //@ts-ignore
        lookup: forceIPv4Lookup
      });
    } 
    // Fallback to DATABASE_URL
    else if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
      console.log('[PgPool] Initializing Pool with DATABASE_URL');
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&sslmode=require' : '?sslmode=require'),
        max: 3,
        ssl: { rejectUnauthorized: false },
        //@ts-ignore
        lookup: forceIPv4Lookup
      });
    } else {
      console.error('[getPgPool] No valid database configuration found');
      throw new Error('[getPgPool] Database configuration missing.');
    }
    
    pgPool.on('error', (err: Error) => {
      console.warn('[PgPool] Idle client error:', err.message);
      if (err.message.includes('authentication failed')) {
        console.error(`[PgPool] CRITICAL Auth failure. Using User: ${process.env.PGUSER}`);
      }
      pgPool = null;
    });
  }
  return pgPool;
}

// ── Driver application vehicle sidecar (Neon table: driver_application_vehicles) ─────────────
// The driver_applications Supabase table is missing vehicle_* columns (schema gap).
// We store vehicle data in a Neon sidecar table and merge it into every application read.

async function saveAppVehicle(
  appId: string,
  email: string,
  data: { vehicleRegistration?: string | null; vehicleMake?: string | null; vehicleModel?: string | null; vehicleColor?: string | null }
): Promise<void> {
  if (!data.vehicleRegistration && !data.vehicleMake && !data.vehicleModel && !data.vehicleColor) return;
  try {
    await getPgPool().query(
      `INSERT INTO driver_application_vehicles
         (application_id, email, vehicle_registration, vehicle_make, vehicle_model, vehicle_color, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (application_id) DO UPDATE SET
         email = EXCLUDED.email,
         vehicle_registration = COALESCE(EXCLUDED.vehicle_registration, driver_application_vehicles.vehicle_registration),
         vehicle_make        = COALESCE(EXCLUDED.vehicle_make,         driver_application_vehicles.vehicle_make),
         vehicle_model       = COALESCE(EXCLUDED.vehicle_model,        driver_application_vehicles.vehicle_model),
         vehicle_color       = COALESCE(EXCLUDED.vehicle_color,        driver_application_vehicles.vehicle_color),
         updated_at = NOW()`,
      [appId, email || null, data.vehicleRegistration || null, data.vehicleMake || null, data.vehicleModel || null, data.vehicleColor || null]
    );
  } catch (e: any) {
    console.error('[VehicleSidecar] saveAppVehicle error:', e?.message);
  }
}

async function overwriteAppVehicle(
  appId: string,
  email: string,
  data: { vehicleRegistration?: string | null; vehicleMake?: string | null; vehicleModel?: string | null; vehicleColor?: string | null }
): Promise<void> {
  try {
    await getPgPool().query(
      `INSERT INTO driver_application_vehicles
         (application_id, email, vehicle_registration, vehicle_make, vehicle_model, vehicle_color, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (application_id) DO UPDATE SET
         email = EXCLUDED.email,
         vehicle_registration = EXCLUDED.vehicle_registration,
         vehicle_make         = EXCLUDED.vehicle_make,
         vehicle_model        = EXCLUDED.vehicle_model,
         vehicle_color        = EXCLUDED.vehicle_color,
         updated_at = NOW()`,
      [appId, email || null, data.vehicleRegistration || null, data.vehicleMake || null, data.vehicleModel || null, data.vehicleColor || null]
    );
  } catch (e: any) {
    console.error('[VehicleSidecar] overwriteAppVehicle error:', e?.message);
  }
}

async function mergeAppVehicles<T extends { id: string; vehicleRegistration: string | null; vehicleMake: string | null; vehicleModel: string | null; vehicleColor: string | null }>(
  applications: T[]
): Promise<T[]> {
  if (!applications.length) return applications;
  const appIds = applications.map(a => a.id);
  const placeholders = appIds.map((_, i) => `$${i + 1}`).join(',');
  try {
    const { rows } = await getPgPool().query(
      `SELECT application_id, vehicle_registration, vehicle_make, vehicle_model, vehicle_color
       FROM driver_application_vehicles WHERE application_id IN (${placeholders})`,
      appIds
    );
    const vehicleMap = new Map(rows.map((r: any) => [r.application_id, r]));
    return applications.map(app => {
      const v = vehicleMap.get(app.id);
      if (!v) return app;
      return {
        ...app,
        vehicleRegistration: app.vehicleRegistration || v.vehicle_registration || null,
        vehicleMake:  app.vehicleMake  || v.vehicle_make  || null,
        vehicleModel: app.vehicleModel || v.vehicle_model || null,
        vehicleColor: app.vehicleColor || v.vehicle_color || null,
      };
    });
  } catch (e: any) {
    console.error('[VehicleSidecar] mergeAppVehicles error:', e?.message);
    return applications;
  }
}

async function upsertJobMetadata(jobId: string, officeCity?: string | null, createdBy?: string | null): Promise<void> {
  try {
    await getPgPool().query(
      `INSERT INTO job_admin_notes (job_id, office_city, created_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (job_id) DO UPDATE SET
         office_city = CASE WHEN $2 IS NOT NULL THEN $2 ELSE job_admin_notes.office_city END,
         created_by = CASE WHEN $3 IS NOT NULL THEN $3 ELSE job_admin_notes.created_by END,
         updated_at = NOW()`,
      [jobId, officeCity ?? null, createdBy ?? null]
    );
  } catch (err: any) {
    console.warn('[Jobs] Failed to upsert job metadata:', err.message);
  }
}

async function setMustChangePassword(userId: string, value: boolean): Promise<void> {
  try {
    await getPgPool().query('UPDATE drivers SET must_change_password = $1 WHERE id = $2', [value, userId]);
  } catch (err) {
    console.warn('[Driver] Failed to set must_change_password:', err);
  }
}

async function getMustChangePassword(userId: string): Promise<boolean> {
  try {
    const result = await getPgPool().query('SELECT must_change_password FROM drivers WHERE id = $1', [userId]);
    return result.rows[0]?.must_change_password === true;
  } catch {
    return false;
  }
}
import { sendJobOfferNotification, sendJobWithdrawalNotification, sendPriceUpdateNotification } from "./pushNotifications";
import { isAdminByEmail, supabaseAdmin, verifyAccessToken } from "./supabaseAdmin";
import { cache, CACHE_TTL } from "./cache";

const adminTokenCache = new Map<string, { user: { id: string; email: string; user_metadata?: any }; isAdmin: boolean; isSupervisor?: boolean; expiry: number }>();

function decodeJwtPayload(token: string): { sub?: string; email?: string; exp?: number; user_metadata?: any } | null {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    }
  } catch (_) {}
  return null;
}

async function requireAdminAccessStrict(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const tokenHash = token.slice(-16);
    
    const cached = adminTokenCache.get(tokenHash);
    if (cached && Date.now() < cached.expiry) {
      if (!cached.isAdmin) {
        res.status(403).json({ error: 'Admin access required', code: 'NOT_ADMIN' });
        return;
      }
      (req as any).isAdmin = true;
      (req as any).adminUser = {
        id: cached.user.id,
        email: cached.user.email,
        role: 'admin',
        fullName: cached.user.user_metadata?.fullName || cached.user.user_metadata?.full_name,
      };
      next();
      return;
    }
    
    let authUser: { id: string; email: string; user_metadata?: any } | null = null;
    let jwtExp = 0;
    
    const payload = decodeJwtPayload(token);
    if (payload?.exp) {
      jwtExp = payload.exp * 1000;
      if (jwtExp < Date.now()) {
        res.status(401).json({ error: 'Token expired', code: 'INVALID_TOKEN' });
        return;
      }
    }
    
    if (supabaseAdmin) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user && user.email) {
        authUser = user as typeof authUser;
      }
    }
    
    if (!authUser && payload?.email && payload?.sub) {
      authUser = {
        id: payload.sub,
        email: payload.email,
        user_metadata: payload.user_metadata || {}
      };
    }
    
    if (!authUser) {
      res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      return;
    }

    const emailIsAdmin = await isAdminByEmail(authUser.email || '');
    
    const cacheExpiry = Math.min(jwtExp || Date.now() + 300000, Date.now() + 300000);
    adminTokenCache.set(tokenHash, {
      user: authUser,
      isAdmin: emailIsAdmin,
      expiry: cacheExpiry,
    });
    
    if (adminTokenCache.size > 50) {
      const now = Date.now();
      for (const [key, val] of adminTokenCache.entries()) {
        if (val.expiry < now) adminTokenCache.delete(key);
      }
    }
    
    if (!emailIsAdmin) {
      res.status(403).json({ error: 'Admin access required', code: 'NOT_ADMIN' });
      return;
    }
    
    (req as any).isAdmin = true;
    (req as any).adminUser = {
      id: authUser.id,
      email: authUser.email || '',
      role: 'admin',
      fullName: authUser.user_metadata?.fullName || authUser.user_metadata?.full_name,
    };
    next();
  } catch (error) {
    console.error('[Admin Access] Error verifying admin status:', error);
    res.status(500).json({ error: 'Authentication error', code: 'AUTH_ERROR' });
  }
}

/**
 * Strict middleware that allows both admins AND active supervisors
 * Used for routes that supervisors and admins share (payment links, invoices, etc.)
 */
async function requireAdminOrSupervisorStrict(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    return;
  }
  try {
    const token = authHeader.slice(7);
    const tokenHash = token.slice(-16);

    const cached = adminTokenCache.get(tokenHash);
    if (cached && Date.now() < cached.expiry) {
      if (!cached.isAdmin && !cached.isSupervisor) {
        res.status(403).json({ error: 'Admin or supervisor access required', code: 'NOT_AUTHORIZED' });
        return;
      }
      (req as any).isAdmin = cached.isAdmin;
      (req as any).isSupervisor = cached.isSupervisor;
      (req as any).adminUser = {
        id: cached.user.id,
        email: cached.user.email,
        role: cached.isAdmin ? 'admin' : 'supervisor',
        fullName: cached.user.user_metadata?.fullName || cached.user.user_metadata?.full_name,
      };
      next();
      return;
    }

    const payload = decodeJwtPayload(token);
    if (payload?.exp && payload.exp * 1000 < Date.now()) {
      res.status(401).json({ error: 'Token expired', code: 'INVALID_TOKEN' });
      return;
    }

    let authUser: { id: string; email: string; user_metadata?: any } | null = null;
    let jwtExp = payload?.exp ? payload.exp * 1000 : 0;

    if (supabaseAdmin) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user && user.email) authUser = user as typeof authUser;
    }
    if (!authUser && payload?.email && payload?.sub) {
      authUser = { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} };
    }
    if (!authUser) {
      res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      return;
    }

    const emailIsAdmin = await isAdminByEmail(authUser.email || '');
    let emailIsSupervisor = false;
    if (!emailIsAdmin) {
      try {
        const supResult = await getPgPool().query(
          "SELECT status FROM supervisors WHERE email = $1 LIMIT 1",
          [(authUser.email || '').toLowerCase()]
        );
        emailIsSupervisor = supResult.rows.length > 0 && supResult.rows[0].status === 'active';
      } catch { emailIsSupervisor = false; }
    }

    const cacheExpiry = Math.min(jwtExp || Date.now() + 300000, Date.now() + 300000);
    adminTokenCache.set(tokenHash, {
      user: authUser,
      isAdmin: emailIsAdmin,
      isSupervisor: emailIsSupervisor,
      expiry: cacheExpiry,
    });

    if (!emailIsAdmin && !emailIsSupervisor) {
      res.status(403).json({ error: 'Admin or supervisor access required', code: 'NOT_AUTHORIZED' });
      return;
    }

    (req as any).isAdmin = emailIsAdmin;
    (req as any).isSupervisor = emailIsSupervisor;
    (req as any).adminUser = {
      id: authUser.id,
      email: authUser.email || '',
      role: emailIsAdmin ? 'admin' : 'supervisor',
      fullName: authUser.user_metadata?.fullName || authUser.user_metadata?.full_name,
    };
    next();
  } catch (error) {
    console.error('[AdminOrSupervisor Access] Error:', error);
    res.status(500).json({ error: 'Authentication error', code: 'AUTH_ERROR' });
  }
}

/**
 * Soft middleware to set admin status without blocking
 * Used for routes that need to check admin status but allow non-admin access
 * 
 * SECURITY: Admin status is ONLY set if email is in admins table
 */
async function requireAdminAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    (req as any).isAdmin = false;
    next();
    return;
  }

  try {
    const token = authHeader.slice(7);
    const tokenHash = token.slice(-16);
    
    const cached = adminTokenCache.get(tokenHash);
    if (cached && Date.now() < cached.expiry) {
      (req as any).isAdmin = cached.isAdmin;
      if (cached.isAdmin) {
        (req as any).adminUser = {
          id: cached.user.id,
          email: cached.user.email,
          role: 'admin',
          fullName: cached.user.user_metadata?.fullName || cached.user.user_metadata?.full_name,
        };
      }
      next();
      return;
    }
    
    let authUser: { id: string; email: string; user_metadata?: any } | null = null;
    let jwtExp = 0;
    
    const payload = decodeJwtPayload(token);
    if (payload?.exp) {
      jwtExp = payload.exp * 1000;
    }
    
    if (supabaseAdmin) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user && user.email) authUser = user as typeof authUser;
    }
    
    if (!authUser && payload?.email && payload?.sub) {
      authUser = { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} };
    }
    
    if (!authUser) {
      (req as any).isAdmin = false;
      next();
      return;
    }

    const emailIsAdmin = await isAdminByEmail(authUser.email || '');
    
    const cacheExpiry = Math.min(jwtExp || Date.now() + 300000, Date.now() + 300000);
    adminTokenCache.set(tokenHash, { user: authUser, isAdmin: emailIsAdmin, expiry: cacheExpiry });
    
    (req as any).isAdmin = emailIsAdmin;
    if (emailIsAdmin) {
      (req as any).adminUser = {
        id: authUser.id,
        email: authUser.email || '',
        role: 'admin',
        fullName: authUser.user_metadata?.fullName || authUser.user_metadata?.full_name,
      };
    }
    next();
  } catch (error) {
    (req as any).isAdmin = false;
    next();
  }
}

/**
 * Helper to enforce admin access within route handlers
 * Returns true if admin, sends 403 if not
 */
function enforceAdminAccess(req: Request, res: Response): boolean {
  if (!(req as any).isAdmin) {
    res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
    return false;
  }
  return true;
}

function enforceAdminOrSupervisorAccess(req: Request, res: Response): boolean {
  if (!(req as any).isAdmin && !(req as any).isSupervisor) {
    res.status(403).json({ error: 'Admin or supervisor access required', code: 'NOT_AUTHORIZED' });
    return false;
  }
  return true;
}

// Server-side pricing configuration - SINGLE SOURCE OF TRUTH
// This must match the client-side config in client/src/lib/pricing.ts
const PRICING_CONFIG = {
  vehicles: {
    motorbike: { name: "Motorbike", baseCharge: 10, perMileRate: 1.3 },
    car: { name: "Car", baseCharge: 19, perMileRate: 1.2 },
    small_van: { name: "Small Van", baseCharge: 25, perMileRate: 1.3 },
    medium_van: { name: "Medium Van", baseCharge: 30, perMileRate: 1.4 },
    lwb_van: { name: "LWB Van", baseCharge: 35, perMileRate: 1.6 },
    luton_van: { name: "Luton Van", baseCharge: 40, perMileRate: 1.7 },
  }
} as const;

// Helper function to get base charge for any vehicle type
function getBaseChargeForVehicle(vehicleType: string): number {
  const vehicle = PRICING_CONFIG.vehicles[vehicleType as keyof typeof PRICING_CONFIG.vehicles];
  if (!vehicle) {
    console.warn(`[Pricing] Unknown vehicle type: ${vehicleType}, defaulting to car base charge`);
    return PRICING_CONFIG.vehicles.car.baseCharge;
  }
  return vehicle.baseCharge;
}

// Validation: ensure motorbike base price is never less than £10
function validateBasePrice(vehicleType: string, basePrice: number): number {
  if (vehicleType === 'motorbike' && basePrice < 10) {
    console.warn(`[Pricing] Invalid motorbike base price £${basePrice}, correcting to £10.00`);
    return 10;
  }
  const expectedBase = getBaseChargeForVehicle(vehicleType);
  if (basePrice < expectedBase * 0.9) {
    console.warn(`[Pricing] Base price £${basePrice} seems too low for ${vehicleType} (expected ~£${expectedBase}), using config value`);
    return expectedBase;
  }
  return basePrice;
}

// MINIMUM DRIVER PAYMENT per vehicle type
// Rule: no job can pay a driver less than these amounts
function getMinDriverPrice(vehicleType: string | null | undefined): number {
  const vt = String(vehicleType || 'car').toLowerCase().split('|')[0]; // strip vehicle reg suffix
  switch (vt) {
    case 'motorbike': return 5;
    case 'car':       return 12;
    case 'small_van': return 15;
    case 'medium_van': return 17;
    case 'lwb_van':    return 20;
    case 'large_van':  return 17;
    case 'luton_van':  return 20;
    case 'flatbed':    return 17;
    default:           return 12;
  }
}

// SECURITY: Centralized helper to strip ALL customer pricing fields from job objects
// This is the SINGLE SOURCE OF TRUTH for driver-safe job serialization
// All non-admin endpoints MUST use this to prevent price leakage
function stripCustomerPricing<T extends Record<string, any>>(job: T): Omit<T, 
  'totalPrice' | 'basePrice' | 'distancePrice' | 'weightSurcharge' | 
  'multiDropCharge' | 'returnTripCharge' | 'centralLondonCharge' | 'waitingTimeCharge' |
  'priceCustomer' | 'priceCustomerCurrency' | 'invoiceAmount'
> {
  const { 
    totalPrice, basePrice, distancePrice, weightSurcharge,
    multiDropCharge, returnTripCharge, centralLondonCharge, waitingTimeCharge,
    priceCustomer, priceCustomerCurrency, invoiceAmount,
    // Also strip any snake_case versions
    total_price, base_price, distance_price, weight_surcharge,
    multi_drop_charge, return_trip_charge, central_london_charge, waiting_time_charge,
    price_customer, price_customer_currency, invoice_amount,
    ...safeJob 
  } = job as any;
  return safeJob;
}

function normalizeDocumentUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== 'string' || url.trim() === '') return url;
  if (url.startsWith('text:')) return url;
  if (url.startsWith('/api/uploads/documents/')) return url;
  if (url.startsWith('/uploads/documents/')) return '/api' + url;
  if (url.startsWith('/uploads/')) return '/api' + url;
  const prodMatch = url.match(/^https?:\/\/(?:www\.)?runcourier\.co\.uk\/uploads\/(.+)$/i);
  if (prodMatch) return `/api/uploads/${prodMatch[1]}`;
  const supabaseMatch = url.match(/supabase\.co\/storage\/v1\/object\/(?:public\/)?(?:driver-documents|DRIVER-DOCUMENTS)\/(.+?)(?:\?.*)?$/i);
  if (supabaseMatch) return `/api/uploads/documents/${decodeURIComponent(supabaseMatch[1])}`;
  if (!url.startsWith('http') && !url.startsWith('/')) {
    return `/api/uploads/documents/${url}`;
  }
  return url;
}

function extractStoragePath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  // Handle /public/, /sign/, /authenticated/, and bare bucket paths
  const supabaseMatch = fileUrl.match(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?(?:driver-documents|DRIVER-DOCUMENTS)\/(.+?)(?:\?.*)?$/i);
  if (supabaseMatch) return decodeURIComponent(supabaseMatch[1]);
  const proxyMatch = fileUrl.match(/^\/api\/uploads\/documents\/(.+)$/);
  if (proxyMatch) return proxyMatch[1];
  const uploadsMatch = fileUrl.match(/^\/uploads\/documents\/(.+)$/);
  if (uploadsMatch) return uploadsMatch[1];
  return null;
}

async function copyApplicationFileToDriver(
  originalUrl: string,
  driverUUID: string,
  supabaseClient: any
): Promise<{ path: string; bucket: string }> {
  if (!originalUrl) return { path: originalUrl, bucket: 'DRIVER-DOCUMENTS' };

  const BUCKET = 'DRIVER-DOCUMENTS';
  
  let sourcePath = extractStoragePath(originalUrl) || originalUrl;
  if (sourcePath.startsWith('http') || sourcePath.startsWith('/')) {
    const normalized = normalizeDocumentUrl(originalUrl);
    sourcePath = normalized || originalUrl;
  }

  const isPendingPath = sourcePath.includes('drivers/pending/') || sourcePath.includes('applications/');
  
  if (isPendingPath) {
    try {
      const fileName = sourcePath.split('/').pop() || `file_${Date.now()}`;
      const docTypeMatch = sourcePath.match(/(?:drivers\/pending|applications\/[^/]+)\/([^/]+)\//);
      const docType = docTypeMatch ? docTypeMatch[1] : 'document';
      const normalizedDocType = (() => {
        const lower = docType.toLowerCase();
        for (const group of DOC_TYPE_GROUPS) {
          if (group.some(alias => alias.toLowerCase() === lower)) {
            return group[0];
          }
        }
        return docType;
      })();
      const destPath = `${driverUUID}/${normalizedDocType}_${Date.now()}_${fileName}`;

      const { data: fileData, error: downloadError } = await supabaseClient.storage
        .from(BUCKET)
        .download(sourcePath);
      
      if (downloadError || !fileData) {
        const ALT_BUCKET = 'driver-documents';
        const { data: altData, error: altErr } = await supabaseClient.storage
          .from(ALT_BUCKET)
          .download(sourcePath);
        if (altErr || !altData) {
          console.warn(`[FileCopy] Could not download from pending path: ${sourcePath}, using original path`);
          return { path: sourcePath, bucket: 'driver-documents' };
        }
        const buffer = Buffer.from(await altData.arrayBuffer());
        const { error: uploadErr } = await supabaseClient.storage
          .from(BUCKET)
          .upload(destPath, buffer, { upsert: true });
        if (uploadErr) {
          console.warn(`[FileCopy] Upload to ${destPath} failed:`, uploadErr.message);
          return { path: sourcePath, bucket: ALT_BUCKET };
        }
        console.log(`[FileCopy] Copied ${sourcePath} -> ${destPath} (from ${ALT_BUCKET})`);
        return { path: destPath, bucket: BUCKET };
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const { error: uploadErr } = await supabaseClient.storage
        .from(BUCKET)
        .upload(destPath, buffer, { upsert: true });
      
      if (uploadErr) {
        console.warn(`[FileCopy] Upload to ${destPath} failed:`, uploadErr.message);
        return { path: sourcePath, bucket: BUCKET };
      }
      
      console.log(`[FileCopy] Copied ${sourcePath} -> ${destPath}`);
      return { path: destPath, bucket: BUCKET };
    } catch (err: any) {
      console.error(`[FileCopy] Error copying file:`, err.message);
      return { path: sourcePath, bucket: BUCKET };
    }
  }

  const storagePath = extractStoragePath(originalUrl);
  if (storagePath) {
    const BUCKETS = [BUCKET, 'driver-documents'];
    for (const bucket of BUCKETS) {
      try {
        const { data } = await supabaseClient.storage.from(bucket).createSignedUrl(storagePath, 3600);
        if (data?.signedUrl) {
          return { path: storagePath, bucket };
        }
      } catch {}
    }
    return { path: storagePath, bucket: BUCKET };
  }

  return { path: sourcePath, bucket: BUCKET };
}

const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
const tempUploadsDir = path.join(process.cwd(), 'uploads', 'temp');
// Local filesystem storage removed - all documents stored in Supabase Storage only

function sanitizePath(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

const documentStorage = multer.memoryStorage();

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadPodImage = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed for POD photos.'));
    }
  }
});

// Postcode geocoding cache: maps postcode (uppercased, trimmed) -> {lat, lng}
const postcodeGeoCache = new Map<string, { lat: number; lng: number }>();

async function geocodePostcodesBulk(postcodes: string[]): Promise<void> {
  if (postcodes.length === 0) return;
  const unique = [...new Set(postcodes.map(p => p.trim().toUpperCase()))].filter(p => !postcodeGeoCache.has(p));
  if (unique.length === 0) return;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[PostcodeGeo] GOOGLE_MAPS_API_KEY not configured');
    return;
  }

  for (const postcode of unique) {
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(postcode + ', UK')}&key=${apiKey}`
      );
      if (!resp.ok) {
        console.error(`[PostcodeGeo] Google API returned ${resp.status} for ${postcode}`);
        continue;
      }
      const data = await resp.json();
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        postcodeGeoCache.set(postcode, { lat: loc.lat, lng: loc.lng });
      } else {
        console.warn(`[PostcodeGeo] No result for ${postcode}: ${data.status}`);
      }
    } catch (err: any) {
      console.error(`[PostcodeGeo] Google geocode error for ${postcode}:`, err.message);
    }
  }
}


// Sequential counter for tracking numbers within each year
let lastJobSequence = 0;
let lastJobYear = 0;
let initializingYear: Promise<void> | null = null;

async function generateTrackingNumber(): Promise<string> {
  const prefix = "RC";
  const currentYear = new Date().getFullYear();
  
  // Handle year change with proper locking to prevent race conditions
  if (currentYear !== lastJobYear) {
    // If initialization is already in progress, wait for it
    if (initializingYear) {
      await initializingYear;
    }
    
    // Double-check after waiting
    if (currentYear !== lastJobYear) {
      // Start initialization - store promise so other callers can wait
      initializingYear = (async () => {
        // Query database to find the highest sequence number for this year
        try {
          const { db } = await import("./db");
          const { jobs } = await import("@shared/schema");
          const { like, desc } = await import("drizzle-orm");
          
          const pattern = `RC${currentYear}%`;
          const latestJobs = await db.select({ trackingNumber: jobs.trackingNumber })
            .from(jobs)
            .where(like(jobs.trackingNumber, pattern))
            .orderBy(desc(jobs.trackingNumber))
            .limit(1);
          
          let newSequence = 0;
          if (latestJobs.length > 0) {
            // Extract sequence number from tracking number (e.g., RC2024004JKL -> 004)
            const match = latestJobs[0].trackingNumber.match(/RC\d{4}(\d{3})/);
            if (match) {
              newSequence = parseInt(match[1], 10);
            }
          }
          
          // Update atomically after DB query completes
          lastJobSequence = newSequence;
          lastJobYear = currentYear;
        } catch (error) {
          console.error('[TrackingNumber] Error fetching last sequence:', error);
          // Still update year to prevent repeated failures
          lastJobYear = currentYear;
          lastJobSequence = 0;
        }
      })();
      
      await initializingYear;
      initializingYear = null;
    }
  }
  
  // Increment sequence atomically
  lastJobSequence++;
  const currentSequence = lastJobSequence;
  
  // Generate random 3-letter suffix
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluding I and O to avoid confusion
  const randomSuffix = Array.from({ length: 3 }, () => 
    letters.charAt(Math.floor(Math.random() * letters.length))
  ).join('');
  
  // Format: RC + YYYY + NNN (3-digit padded) + XXX (3 random letters)
  const sequenceStr = currentSequence.toString().padStart(3, '0');
  return `${prefix}${currentYear}${sequenceStr}${randomSuffix}`;
}


const DOC_TYPE_GROUPS: string[][] = [
  ['driving_license', 'driving_licence_front', 'driving_license_front', 'drivingLicenceFront', 'drivingLicenseFront', 'driving_licence'],
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

function findDocTypeMatch(fileName: string): string[] {
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

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function resolveJobPodUrls(jobs: any[]): Promise<any[]> {
  const { supabaseAdmin } = await import('./supabaseAdmin');
  if (!supabaseAdmin) return jobs;

  // The mobile app uploads POD images and signatures to 'pod-images'
  const POD_BUCKET = 'pod-images';
  const DOC_BUCKET = 'driver-documents';

  return Promise.all(jobs.map(async (job) => {
    // Return a shallow copy so we don't mutate original objects if cached
    const resolved = { ...job };

    const resolveUrl = async (path: string, primaryBucket: string = POD_BUCKET): Promise<string> => {
      if (!path) return path;
      
      // If it's already a working signed URL (unlikely to be stored in DB, but just in case)
      if (path.includes('token=') && path.startsWith('http')) return path;

      let storagePath = path;
      let targetBucket = primaryBucket;

      // Handle Supabase URL format: https://{project}.supabase.co/storage/v1/object/{type}/{bucket}/{path}
      if (path.startsWith('http')) {
        // More robust regex to handle various Supabase storage URL patterns
        const match = path.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^\/]+)\/(.+?)(?:\?.*)?$/);
        if (match) {
          targetBucket = match[1];
          // Strip any query parameters and decode
          storagePath = decodeURIComponent(match[2].split('?')[0]);
        } else {
          // If it's an external URL but not a standard Supabase storage URL, return as-is
          console.log(`[POD Resolver] External non-Supabase URL for job ${job.id || 'N/A'}: ${path.substring(0, 50)}...`);
          return path;
        }
      } else {
        // Not an HTTP URL, just a raw path or legacy name
        // Strip leading slashes and decode
        storagePath = decodeURIComponent(path.replace(/^\/+/, '').split('?')[0]);
      }
      
      // Buckets to try in order of priority
      const bucketsToTry = [targetBucket];
      if (targetBucket !== POD_BUCKET) bucketsToTry.push(POD_BUCKET);
      if (targetBucket !== 'pod') bucketsToTry.push('pod');
      if (targetBucket !== DOC_BUCKET) bucketsToTry.push(DOC_BUCKET);

      // Remove duplicates while preserving order
      const uniqueBuckets = [...new Set(bucketsToTry)];

      for (const bucket of uniqueBuckets) {
        try {
          const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, 3600);
          if (data?.signedUrl) return data.signedUrl;
          
          // Only log if it's not a "not found" error, to avoid log spamming
          if (error && !error.message?.includes('not found') && !error.message?.includes('The object was not found')) {
            console.error(`[POD Resolver] Error for bucket ${bucket}:`, error.message);
          }
        } catch (err: any) {
          // Silent catch for individual bucket failures
        }
      }

      // FINAL FALLBACK: If we couldn't create a signed URL, but it's a Supabase URL, 
      // try to return it as-is or transform it to a public URL as a "best effort"
      if (path.startsWith('http')) {
        console.warn(`[POD Resolver] Could not sign URL, returning original: ${path.substring(0, 50)}...`);
        return path;
      }

      // If it's a raw path and everything failed, return a public URL attempt
      const { data } = supabaseAdmin.storage.from(targetBucket).getPublicUrl(storagePath);
      return data?.publicUrl || path;
    };

    // 1. Resolve main job POD items
    if (job.podPhotoUrl) {
      resolved.podPhotoUrl = await resolveUrl(job.podPhotoUrl);
    }

    // 2. Resolve multiple POD photos array (often used by mobile app)
    if (Array.isArray(job.podPhotos) && job.podPhotos.length > 0) {
      resolved.podPhotos = await Promise.all(job.podPhotos.map(async (photoPath: string) => {
        return await resolveUrl(photoPath);
      }));
    }

    // 3. Resolve Signature
    if (job.podSignatureUrl) {
      resolved.podSignatureUrl = await resolveUrl(job.podSignatureUrl);
    }

    // 4. CRITICAL: Resolve POD URLs for multi-drop stops
    if (Array.isArray(resolved.multiDropStops) && resolved.multiDropStops.length > 0) {
      resolved.multiDropStops = await Promise.all(resolved.multiDropStops.map(async (stop: any) => {
        const resolvedStop = { ...stop };
        if (stop.podPhotoUrl) {
          resolvedStop.podPhotoUrl = await resolveUrl(stop.podPhotoUrl);
        }
        if (stop.podSignatureUrl) {
          resolvedStop.podSignatureUrl = await resolveUrl(stop.podSignatureUrl);
        }
        // Also handle legacy or stop-specific pod_photo_url / pod_signature_url if they exist in snake_case
        if (stop.pod_photo_url && !resolvedStop.podPhotoUrl) {
          resolvedStop.podPhotoUrl = await resolveUrl(stop.pod_photo_url);
        }
        if (stop.pod_signature_url && !resolvedStop.podSignatureUrl) {
          resolvedStop.podSignatureUrl = await resolveUrl(stop.pod_signature_url);
        }
        return resolvedStop;
      }));
    }

    return resolved;
  }));
}
async function resolveSingleJobPodUrls(job: any): Promise<any> {
  const resolved = (await resolveJobPodUrls([job]))[0];
  return resolved || job;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use(compression());

  // Apply access middleware to admin/supervisor shared routes
  // /api/admin/* — supervisors and admins both need access (payment links, pricing, etc.)
  app.use('/api/admin', requireAdminOrSupervisorStrict);
  // Strictly admin-only management routes
  app.use('/api/contract-templates', requireAdminAccessStrict);
  app.use('/api/driver-contracts', requireAdminAccessStrict);
  app.use('/api/notice-templates', requireAdminAccessStrict);
  app.use('/api/drivers/:id/verify', requireAdminAccessStrict);
  app.use('/api/drivers/:id/deactivate', requireAdminAccessStrict);
  app.use('/api/drivers/:id/reactivate', requireAdminAccessStrict);
  app.use('/api/documents/:id/review', requireAdminAccessStrict);
  app.use('/api/documents/:id', (req, res, next) => { if (req.method === 'DELETE') return requireAdminAccessStrict(req, res, next); next(); });
  // Invoices — supervisors can send/resend invoices
  app.use('/api/invoices/:id/send', requireAdminOrSupervisorStrict);
  app.use('/api/invoices/:id/resend', requireAdminOrSupervisorStrict);
  app.use('/api/invoices/:id/send-sms', requireAdminOrSupervisorStrict);
  app.use('/api/invoices/bulk-send', requireAdminOrSupervisorStrict);
  // Protect DELETE invoice route (must be registered before the route)
  app.delete('/api/invoices/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const invoiceId = req.params.id;
    console.log('[Invoices] Deleting invoice:', invoiceId);
    
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Database not available" });
    }
    
    // Delete from invoice_payment_tokens table (where invoices are stored)
    const { error } = await supabaseAdmin
      .from('invoice_payment_tokens')
      .delete()
      .eq('token', invoiceId);
    
    if (error) {
      console.error('[Invoices] Delete error:', error);
      return res.status(500).json({ error: "Failed to delete invoice" });
    }
    
    console.log('[Invoices] Invoice deleted successfully:', invoiceId);
    res.json({ success: true, message: "Invoice deleted successfully" });
  }));
  app.use('/api/job-assignments', requireAdminOrSupervisorStrict);

  app.get("/api/health", (req, res) => {
    const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    res.json({ status: "ok", mode, timestamp: new Date().toISOString() });
  });

  app.get("/api/debug/supabase-files", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.json({ error: 'No supabase' });
    const allFiles: string[] = [];
    const dirs = ['applications/pending'];
    const { data: appDirs } = await supabaseAdmin.storage.from('driver-documents').list('applications', { limit: 200 });
    if (appDirs) {
      for (const d of appDirs) {
        if (d.id && d.name !== '.emptyFolderPlaceholder') dirs.push(`applications/${d.name}`);
      }
    }
    for (const dir of dirs) {
      const { data: files } = await supabaseAdmin.storage.from('driver-documents').list(dir, { limit: 500 });
      if (files) {
        for (const f of files) {
          if (f.name && f.name !== '.emptyFolderPlaceholder') allFiles.push(`${dir}/${f.name}`);
        }
      }
    }
    res.json({ totalFiles: allFiles.length, files: allFiles });
  }));


  // Diagnostic endpoint to check job assignment state (admin only)
  app.get("/api/debug/job-assignment/:jobId", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    const jobId = req.params.jobId;
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase not configured" });
    }
    
    // Get job directly from Supabase
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('id, tracking_number, status, driver_id, driver_price, driver_hidden, pickup_latitude, pickup_longitude')
      .eq('id', jobId)
      .single();
    
    // Get job assignments for this job
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from('job_assignments')
      .select('id, driver_id, status, driver_price, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    
    // Get driver info if driver_id exists
    let driver = null;
    if (job?.driver_id) {
      const { data: driverData } = await supabaseAdmin
        .from('drivers')
        .select('id, driver_code, full_name, email')
        .eq('id', job.driver_id)
        .single();
      driver = driverData;
    }
    
    // Get driver devices if driver exists
    let devices: any[] = [];
    if (job?.driver_id) {
      const { data: deviceData } = await supabaseAdmin
        .from('driver_devices')
        .select('id, push_token, platform, last_seen_at')
        .eq('driver_id', job.driver_id);
      devices = deviceData || [];
    }
    
    res.json({
      job: job || null,
      jobError: jobError?.message || null,
      assignments: assignments || [],
      assignError: assignError?.message || null,
      driver: driver || null,
      devices,
      summary: {
        jobExists: !!job,
        driverAssigned: !!job?.driver_id,
        driverHidden: job?.driver_hidden || false,
        activeAssignments: (assignments || []).filter((a: any) => ['sent', 'pending', 'accepted'].includes(a.status)).length,
        pushDevicesRegistered: devices.length,
        hasCoordinates: !!(job?.pickup_latitude && job?.pickup_longitude),
      }
    });
  }));

  // Diagnostic endpoint to check driver push notification status (admin only)
  app.get("/api/debug/driver-notifications/:driverId", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED: Sensitive driver information
    if (!enforceAdminAccess(req, res)) return;
    
    const { supabaseAdmin } = await import('./supabaseAdmin');
    const driverId = req.params.driverId;
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase not configured" });
    }
    
    // Get driver info
    const { data: driver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('id, driver_code, full_name, email, online_status, status')
      .eq('id', driverId)
      .single();
    
    // Get all registered devices for this driver
    const { data: devices, error: deviceError } = await supabaseAdmin
      .from('driver_devices')
      .select('*')
      .eq('driver_id', driverId);
    
    // Get recent job assignments for this driver
    const { data: assignments } = await supabaseAdmin
      .from('job_assignments')
      .select('id, job_id, status, driver_price, created_at')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    // Get active jobs assigned to this driver
    const { data: activeJobs } = await supabaseAdmin
      .from('jobs')
      .select('id, tracking_number, status, driver_price')
      .eq('driver_id', driverId)
      .in('status', ['pending', 'assigned', 'picked_up', 'in_transit'])
      .limit(5);
    
    res.json({
      driver: driver || null,
      driverError: driverError?.message || null,
      devices: devices || [],
      deviceError: deviceError?.message || null,
      recentAssignments: assignments || [],
      activeJobs: activeJobs || [],
      summary: {
        driverExists: !!driver,
        driverVerified: driver?.status === 'approved',
        onlineStatus: driver?.online_status || 'unknown',
        pushDevicesCount: (devices || []).length,
        canReceivePushNotifications: (devices || []).length > 0,
        activeJobsCount: (activeJobs || []).length,
        recentAssignmentsCount: (assignments || []).length,
      },
      troubleshooting: {
        noDevices: (devices || []).length === 0 
          ? "Mobile app needs to call POST /api/mobile/v1/driver/push-token on startup"
          : null,
        notVerified: driver?.status !== 'approved'
          ? "Driver account needs admin verification to receive jobs"
          : null,
        offline: driver?.online_status !== 'online'
          ? "Driver needs to set status to 'online' in mobile app"
          : null,
      }
    });
  }));

  // Admin endpoint to test push notification for a driver
  app.post("/api/admin/test-push/:driverId", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED
    if (!enforceAdminAccess(req, res)) return;
    
    const { supabaseAdmin } = await import('./supabaseAdmin');
    const { sendJobOfferNotification } = await import('./pushNotifications');
    const driverId = req.params.driverId;
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase not configured" });
    }
    
    // Get driver devices
    const { data: devices } = await supabaseAdmin
      .from('driver_devices')
      .select('*')
      .eq('driver_id', driverId);
    
    if (!devices || devices.length === 0) {
      return res.json({
        success: false,
        error: "No push devices registered for this driver",
        troubleshooting: "The mobile app needs to call POST /api/mobile/v1/driver/push-token with the Expo push token on startup",
        driverId
      });
    }
    
    // Send a test notification
    const result = await sendJobOfferNotification(driverId, {
      jobId: 'test-' + Date.now(),
      trackingNumber: 'TEST-NOTIFICATION',
      pickupAddress: 'Test Pickup Location',
      deliveryAddress: 'Test Delivery Location',
      driverPrice: '10.00',
      vehicleType: 'small_van'
    });
    
    res.json({
      success: result.success,
      deviceCount: devices.length,
      notificationsSent: result.sentCount,
      message: result.success 
        ? `Test notification sent to ${result.sentCount} device(s)` 
        : "Failed to send test notification",
      devices: devices.map(d => ({
        id: d.id,
        platform: d.platform,
        tokenPrefix: d.push_token?.substring(0, 30) + '...',
        lastSeen: d.last_seen_at
      }))
    });
  }));

  // Admin: manually register a push token for any driver (useful for testing/setup)
  app.post("/api/admin/driver/:driverId/push-token", asyncHandler(async (req, res) => {
    if (!enforceAdminOrSupervisorAccess(req, res)) return;
    const { driverId } = req.params;
    const { pushToken, platform } = req.body as { pushToken: string; platform?: string };

    if (!pushToken?.trim()) {
      return res.status(400).json({ error: "Push token is required" });
    }
    if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
      return res.status(400).json({ error: "Invalid Expo push token format. Must start with ExponentPushToken[ or ExpoPushToken[" });
    }

    const { registerDriverDevice } = await import('./pushNotifications');
    const normalizedPlatform = (platform || 'android').toLowerCase().startsWith('i') ? 'ios' as const : 'android' as const;
    const result = await registerDriverDevice(driverId, pushToken.trim(), normalizedPlatform);

    if (result.success) {
      console.log(`[Admin] Manually registered push token for driver ${driverId}`);
      return res.json({ success: true, deviceId: result.deviceId, message: "Push token registered successfully" });
    } else {
      return res.status(500).json({ success: false, error: result.error || "Failed to register push token" });
    }
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE: Driver registers/updates their own push token (called on app startup)
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/api/mobile/v1/driver/push-token", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace('Bearer ', '');

    let driverId: string;
    try {
      const { verifyAccessToken } = await import('./supabaseAdmin');
      const user = await verifyAccessToken(token);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      driverId = user.id;
    } catch (e: any) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { pushToken, platform, appVersion } = req.body as {
      pushToken: string;
      platform?: string;
      appVersion?: string;
    };

    if (!pushToken?.trim()) {
      return res.status(400).json({ error: "Push token is required" });
    }

    const { registerDriverDevice } = await import('./pushNotifications');
    const normalizedPlatform = (platform || 'android').toLowerCase().startsWith('i') ? 'ios' as const : 'android' as const;
    const result = await registerDriverDevice(driverId, pushToken.trim(), normalizedPlatform, appVersion);

    if (result.success) {
      console.log(`[Mobile] ✅ Push token registered for driver ${driverId} (${normalizedPlatform})`);
      return res.json({ success: true, deviceId: result.deviceId });
    } else {
      console.error(`[Mobile] ❌ Push token registration failed for driver ${driverId}:`, result.error);
      return res.status(500).json({ success: false, error: result.error || "Failed to register" });
    }
  }));

  // MOBILE: Driver removes their push token on logout
  app.delete("/api/mobile/v1/driver/push-token", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace('Bearer ', '');

    let driverId: string;
    try {
      const { verifyAccessToken } = await import('./supabaseAdmin');
      const user = await verifyAccessToken(token);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      driverId = user.id;
    } catch (e: any) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { pushToken } = req.body as { pushToken?: string };
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not configured" });

    let deleteQuery = supabaseAdmin.from('driver_devices').delete().eq('driver_id', driverId);
    if (pushToken?.trim()) {
      deleteQuery = (deleteQuery as any).eq('push_token', pushToken.trim());
    }
    const { error } = await deleteQuery;

    if (error) {
      console.error(`[Mobile] Failed to remove push token for driver ${driverId}:`, error.message);
      return res.status(500).json({ error: error.message });
    }
    console.log(`[Mobile] Push token removed for driver ${driverId}`);
    return res.json({ success: true });
  }));

  // Admin: remove all registered push devices for a driver
  app.delete("/api/admin/driver/:driverId/push-token", asyncHandler(async (req, res) => {
    if (!enforceAdminOrSupervisorAccess(req, res)) return;
    const { driverId } = req.params;
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.status(500).json({ error: "Not configured" });
    const { error } = await supabaseAdmin.from('driver_devices').delete().eq('driver_id', driverId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, message: "All devices cleared for driver" });
  }));

  // Send custom push notification to one or all drivers (admin + supervisor)
  app.post("/api/admin/push-notification", asyncHandler(async (req, res) => {
    const { driverId, title, message } = req.body as {
      driverId?: string;
      title: string;
      message: string;
    };

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const { sendCustomNotificationToDrivers } = await import('./pushNotifications');
    const target = driverId ? [driverId] : "all";
    const result = await sendCustomNotificationToDrivers(target, title.trim(), message.trim());

    // Always save to Alerts tab so driver sees it when they open the app,
    // regardless of whether push was delivered
    let savedToAlerts = 0;
    try {
      const sentBy = (req as any).adminUser?.email || (req as any).supervisorUser?.email || 'admin';
      const notice = await storage.createDriverNotice({
        title: title.trim(),
        subject: '',
        message: message.trim(),
        category: 'general',
        sent_by: sentBy,
        sent_at: new Date().toISOString(),
        target_type: driverId ? 'selected' : 'all',
        requires_acknowledgement: false,
        status: 'sent',
      });

      if (driverId) {
        await storage.createNoticeRecipient({
          notice_id: notice.id,
          driver_id: driverId,
          delivery_channel: 'push',
        });
        savedToAlerts = 1;
      } else {
        const allDrivers = await storage.getDrivers();
        const activeDrivers = allDrivers.filter((d: any) => d.isVerified && d.isActive !== false);
        for (const driver of activeDrivers) {
          await storage.createNoticeRecipient({
            notice_id: notice.id,
            driver_id: driver.id,
            driver_email: driver.email || null,
            delivery_channel: 'push',
          });
        }
        savedToAlerts = activeDrivers.length;
      }
      console.log(`[PushNotif] Saved notice "${title.trim()}" to Alerts tab for ${savedToAlerts} driver(s)`);
    } catch (noticeErr: any) {
      console.error('[PushNotif] Failed to save to Alerts tab:', noticeErr.message, noticeErr.stack);
    }

    let responseMsg: string;
    if (result.sentCount > 0 && result.noDeviceCount === 0) {
      responseMsg = `Push notification delivered to ${result.sentCount} driver(s).`;
    } else if (result.sentCount > 0 && result.noDeviceCount > 0) {
      responseMsg = `Push delivered to ${result.sentCount}. ${result.noDeviceCount} driver(s) will see it in their Alerts tab.`;
    } else {
      responseMsg = savedToAlerts > 0
        ? `Saved to driver's Alerts tab. They will see it when they open the app.`
        : `Notification saved to Alerts tab.`;
    }

    return res.json({
      success: true,
      sentCount: result.sentCount,
      noDeviceCount: result.noDeviceCount,
      savedToAlerts,
      message: responseMsg,
    });
  }));

  // Diagnostic endpoint to list all driver devices (admin only)
  app.get("/api/debug/all-driver-devices", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED
    if (!enforceAdminAccess(req, res)) return;
    
    const { supabaseAdmin } = await import('./supabaseAdmin');
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase not configured" });
    }
    
    const { data: devices, error } = await supabaseAdmin
      .from('driver_devices')
      .select('driver_id, platform, app_version, last_seen_at, created_at')
      .order('created_at', { ascending: false });
    
    // Get driver names for context
    const driverIds = [...new Set((devices || []).map(d => d.driver_id))];
    let drivers: any[] = [];
    if (driverIds.length > 0) {
      const { data: driverData } = await supabaseAdmin
        .from('drivers')
        .select('id, driver_code, full_name')
        .in('id', driverIds);
      drivers = driverData || [];
    }
    
    const driverMap = new Map(drivers.map(d => [d.id, d]));
    
    const enrichedDevices = (devices || []).map(d => ({
      ...d,
      driverCode: driverMap.get(d.driver_id)?.driver_code || 'unknown',
      driverName: driverMap.get(d.driver_id)?.full_name || 'unknown'
    }));
    
    res.json({
      totalDevices: (devices || []).length,
      devices: enrichedDevices,
      error: error?.message || null,
      status: (devices || []).length === 0 
        ? "NO DEVICES REGISTERED - Mobile app must call POST /api/mobile/v1/driver/push-token"
        : "OK"
    });
  }));

  // Normalise a UK postcode to the standard "AA9 9AA" format (insert space before last 3 chars)
  function normalizeUKPostcode(pc: string): string {
    const clean = pc.replace(/\s+/g, '').toUpperCase().trim();
    if (clean.length >= 5) {
      return clean.slice(0, -3) + ' ' + clean.slice(-3);
    }
    return clean;
  }

  // Google Maps Optimized Route endpoint - finds optimal route through all drops
  // Uses Distance Matrix API to get all distances, then implements nearest-neighbor TSP
  app.get("/api/maps/optimized-route", asyncHandler(async (req, res) => {
    const { origin, drops } = req.query;
    
    if (!origin || !drops) {
      return res.status(400).json({ error: 'Origin and drops are required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Maps API not configured' });
    }

    try {
      const normalizedOrigin = normalizeUKPostcode(origin as string);
      const dropList = (drops as string).split('|').filter(w => w.trim()).map(normalizeUKPostcode);
      if (dropList.length === 0) {
        return res.status(400).json({ error: 'At least one drop is required' });
      }

      // For single drop, no optimization needed
      if (dropList.length === 1) {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(normalizedOrigin)}&destinations=${encodeURIComponent(dropList[0])}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
          return res.status(400).json({ error: 'Could not calculate distance' });
        }

        const element = data.rows[0].elements[0];
        if (element.status !== 'OK') {
          return res.status(400).json({ error: 'Invalid location' });
        }

        const legs = [{
          from: normalizedOrigin + ', UK',
          to: dropList[0] + ', UK',
          distance: element.distance.value / 1609.34,
          duration: Math.round(element.duration.value / 60),
        }];

        const markers = `markers=color:green|label:A|${encodeURIComponent(normalizedOrigin)}&markers=color:red|label:B|${encodeURIComponent(dropList[0])}`;
        const path = `path=color:0x007BFF|weight:4|${encodeURIComponent(normalizedOrigin)}|${encodeURIComponent(dropList[0])}`;
        const routeMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&${markers}&${path}&key=${apiKey}`;

        return res.json({
          legs,
          optimizedOrder: [0],
          totalDistance: legs[0].distance,
          totalDuration: legs[0].duration,
          routeMapUrl,
        });
      }

      // For multiple drops, use Distance Matrix to get all pairwise distances
      // Then solve TSP using nearest-neighbor heuristic
      const allPoints = [normalizedOrigin, ...dropList];
      const n = allPoints.length;
      
      // Initialize distance and duration matrices
      const distanceMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(Infinity));
      const durationMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(Infinity));
      const invalidLocations: string[] = [];
      
      // Batch Distance Matrix requests to stay within 100-element limit (10x10 max per request)
      const BATCH_SIZE = 10;
      
      // Helper function to fetch a batch of the distance matrix
      const fetchMatrixBatch = async (originIndices: number[], destIndices: number[]) => {
        const batchOrigins = originIndices.map(i => encodeURIComponent(allPoints[i])).join('|');
        const batchDests = destIndices.map(j => encodeURIComponent(allPoints[j])).join('|');
        
        const batchUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${batchOrigins}&destinations=${batchDests}&key=${apiKey}`;
        const response = await fetch(batchUrl);
        const data = await response.json();
        
        if (data.status !== 'OK') {
          console.error('Distance Matrix batch error:', data.status, data.error_message);
          throw new Error(`Distance Matrix API error: ${data.error_message || data.status}`);
        }
        
        // Parse results into our matrices
        for (let oi = 0; oi < originIndices.length; oi++) {
          const globalOriginIdx = originIndices[oi];
          for (let di = 0; di < destIndices.length; di++) {
            const globalDestIdx = destIndices[di];
            const element = data.rows[oi]?.elements[di];
            
            if (element?.status === 'OK') {
              distanceMatrix[globalOriginIdx][globalDestIdx] = element.distance.value;
              durationMatrix[globalOriginIdx][globalDestIdx] = element.duration.value;
            } else if (globalOriginIdx !== globalDestIdx) {
              invalidLocations.push(`${allPoints[globalOriginIdx]} → ${allPoints[globalDestIdx]}`);
            }
          }
        }
      }
      
      // Build list of batch requests needed
      const originBatches: number[][] = [];
      const destBatches: number[][] = [];
      
      for (let i = 0; i < n; i += BATCH_SIZE) {
        originBatches.push(Array.from({ length: Math.min(BATCH_SIZE, n - i) }, (_, k) => i + k));
      }
      for (let j = 0; j < n; j += BATCH_SIZE) {
        destBatches.push(Array.from({ length: Math.min(BATCH_SIZE, n - j) }, (_, k) => j + k));
      }
      
      // Execute all batch requests (sequentially to avoid rate limiting)
      for (const originBatch of originBatches) {
        for (const destBatch of destBatches) {
          await fetchMatrixBatch(originBatch, destBatch);
        }
      }
      
      // Set self-distances to 0
      for (let i = 0; i < n; i++) {
        distanceMatrix[i][i] = 0;
        durationMatrix[i][i] = 0;
      }

      // Reject if any routes between points are invalid
      if (invalidLocations.length > 0) {
        console.error('Invalid route segments:', invalidLocations.slice(0, 5));
        return res.status(400).json({ 
          error: 'One or more postcodes are invalid or unreachable. Please check all postcodes.' 
        });
      }

      // Nearest-neighbor TSP: start from origin (index 0), always go to nearest unvisited
      const visited = new Set<number>([0]);
      const route: number[] = [0]; // Start with origin
      
      while (visited.size < allPoints.length) {
        const current = route[route.length - 1];
        let nearestIdx = -1;
        let nearestDist = Infinity;
        
        for (let i = 1; i < allPoints.length; i++) { // Skip origin (index 0)
          if (!visited.has(i) && distanceMatrix[current][i] < nearestDist) {
            nearestIdx = i;
            nearestDist = distanceMatrix[current][i];
          }
        }
        
        if (nearestIdx === -1) break;
        visited.add(nearestIdx);
        route.push(nearestIdx);
      }

      // Validate that all points were visited (route is complete)
      if (route.length !== allPoints.length) {
        console.error('Incomplete route: visited', route.length, 'of', allPoints.length, 'points');
        return res.status(400).json({ 
          error: 'Could not find a complete route through all postcodes. Please check the postcodes.' 
        });
      }

      // Build legs from the optimized route (skip origin at index 0)
      const legs: { from: string; to: string; distance: number; duration: number }[] = [];
      for (let i = 0; i < route.length - 1; i++) {
        const fromIdx = route[i];
        const toIdx = route[i + 1];
        legs.push({
          from: allPoints[fromIdx] + ', UK',
          to: allPoints[toIdx] + ', UK',
          distance: distanceMatrix[fromIdx][toIdx] / 1609.34, // meters to miles
          duration: Math.round(durationMatrix[fromIdx][toIdx] / 60), // seconds to minutes
        });
      }

      // optimizedOrder maps to the drop indices (subtract 1 because index 0 is origin)
      const optimizedOrder = route.slice(1).map(idx => idx - 1);

      const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0);
      const totalDuration = legs.reduce((sum, leg) => sum + leg.duration, 0);

      // Build static map URL for the optimized route
      const orderedPoints = route.map(idx => allPoints[idx]);
      const markers = orderedPoints.map((wp, i) => {
        const label = String.fromCharCode(65 + i);
        const color = i === 0 ? 'green' : i === orderedPoints.length - 1 ? 'red' : 'blue';
        return `markers=color:${color}|label:${label}|${encodeURIComponent(wp)}`;
      }).join('&');
      const pathPoints = orderedPoints.map(wp => encodeURIComponent(wp)).join('|');
      const routeMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&${markers}&path=color:0x007BFF|weight:4|${pathPoints}&key=${apiKey}`;

      return res.json({
        legs,
        optimizedOrder,
        totalDistance,
        totalDuration,
        routeMapUrl,
      });
    } catch (error) {
      console.error('Optimized route error:', error);
      return res.status(500).json({ error: 'Failed to calculate optimized route' });
    }
  }));

  // Google Maps Static Map URL generator for route visualization
  app.get("/api/maps/route-image", asyncHandler(async (req, res) => {
    const { waypoints, size } = req.query;
    
    if (!waypoints) {
      return res.status(400).json({ error: 'Waypoints are required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Maps API not configured' });
    }

    try {
      const waypointList = (waypoints as string).split('|');
      if (waypointList.length < 2) {
        return res.status(400).json({ error: 'At least 2 waypoints required' });
      }

      const mapSize = (size as string) || '600x400';
      
      // Build markers for each waypoint
      const markers = waypointList.map((wp, i) => {
        const label = i === 0 ? 'A' : i === waypointList.length - 1 ? 'B' : String.fromCharCode(65 + i);
        const color = i === 0 ? 'green' : i === waypointList.length - 1 ? 'red' : 'blue';
        return `markers=color:${color}|label:${label}|${encodeURIComponent(wp)}`;
      }).join('&');

      // Build path for route
      const pathPoints = waypointList.map(wp => encodeURIComponent(wp)).join('|');
      const path = `path=color:0x007BFF|weight:4|${pathPoints}`;

      const url = `https://maps.googleapis.com/maps/api/staticmap?size=${mapSize}&${markers}&${path}&key=${apiKey}`;
      
      return res.json({ url });
    } catch (error) {
      console.error('Route image error:', error);
      return res.status(500).json({ error: 'Failed to generate route image' });
    }
  }));

  // Google Maps Distance Matrix API endpoint
  app.get("/api/maps/distance", asyncHandler(async (req, res) => {
    const { origins, destinations } = req.query;
    
    if (!origins || !destinations) {
      return res.status(400).json({ error: 'Origins and destinations are required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return res.status(500).json({ error: 'Maps API not configured' });
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins as string)}&destinations=${encodeURIComponent(destinations as string)}&units=imperial&key=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK') {
        return res.json(data);
      } else {
        console.error('Google Maps Distance API error:', data.status, data.error_message);
        return res.status(400).json({ error: data.status });
      }
    } catch (error) {
      console.error('Distance API error:', error);
      return res.status(500).json({ error: 'Failed to calculate distance' });
    }
  }));

  // Google Maps Geocoding API endpoint
  app.get("/api/maps/geocode", asyncHandler(async (req, res) => {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return res.status(500).json({ error: 'Maps API not configured' });
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address as string)}&key=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK') {
        return res.json(data);
      } else {
        console.error('Google Maps Geocode API error:', data.status, data.error_message);
        return res.status(400).json({ error: data.status });
      }
    } catch (error) {
      console.error('Geocode API error:', error);
      return res.status(500).json({ error: 'Failed to geocode address' });
    }
  }));

  // Postcode autocomplete API endpoint using Google Maps Places API only
  app.get("/api/maps/autocomplete", asyncHandler(async (req, res) => {
    const { input } = req.query;
    
    if (!input || typeof input !== 'string' || input.length < 2) {
      return res.json({ predictions: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return res.status(500).json({ error: 'Maps API not configured' });
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:gb&types=geocode&key=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        return res.json({ predictions: data.predictions || [] });
      } else {
        console.error('Google Maps API error:', data.status, data.error_message);
        return res.json({ predictions: [] });
      }
    } catch (error) {
      console.error('Maps autocomplete error:', error);
      return res.json({ predictions: [] });
    }
  }));

  const invalidateJobsCache = () => cache.invalidatePattern('^jobs:');
  
  app.get("/api/jobs", asyncHandler(async (req, res) => {
    const { status, customerId, driverId, vendorId, limit = 50 } = req.query;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API Jobs] Fetching jobs with customerId: ${customerId}, driverId: ${driverId}`);
    }
    
    const jobsCacheKey = `jobs:${status || 'all'}:${customerId || 'all'}:${driverId || 'all'}:${vendorId || 'all'}:${limit}`;
    let resolvedJobs = cache.get<any[]>(jobsCacheKey);
    
    if (!resolvedJobs) {
      const jobs = await storage.getJobs({
        status: status as JobStatus | undefined,
        customerId: customerId as string | undefined,
        driverId: driverId as string | undefined,
        vendorId: vendorId as string | undefined,
        limit: Number(limit),
      });
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API Jobs] Found ${jobs.length} jobs for customerId: ${customerId}`);
      }
      
      const numberedJobs = assignStableJobNumbers(jobs);
      resolvedJobs = await resolveJobPodUrls(numberedJobs);
      
      if (supabaseAdmin) {
        const multiDropJobIds = resolvedJobs.filter((j: any) => j.isMultiDrop).map((j: any) => j.id);
        if (multiDropJobIds.length > 0) {
          try {
            const { data: stops } = await supabaseAdmin
              .from('multi_drop_stops')
              .select('job_id, stop_order, postcode, address, recipient_name, recipient_phone, instructions, status, delivered_at, pod_photo_url, pod_signature_url, pod_recipient_name')
              .in('job_id', multiDropJobIds)
              .order('stop_order', { ascending: true });
            
            if (stops && stops.length > 0) {
              const stopsMap: Record<string, any[]> = {};
              for (const stop of stops) {
                if (!stopsMap[stop.job_id]) stopsMap[stop.job_id] = [];
                stopsMap[stop.job_id].push({
                  stopOrder: stop.stop_order,
                  postcode: stop.postcode,
                  address: stop.address,
                  recipientName: stop.recipient_name,
                  recipientPhone: stop.recipient_phone,
                  instructions: stop.instructions,
                  status: stop.status || 'pending',
                  deliveredAt: stop.delivered_at,
                  podPhotoUrl: stop.pod_photo_url,
                  podSignatureUrl: stop.pod_signature_url,
                  podRecipientName: stop.pod_recipient_name,
                });
              }
              for (const job of resolvedJobs) {
                if ((job as any).isMultiDrop && stopsMap[(job as any).id]) {
                  let stops = stopsMap[(job as any).id];
                  // Include the job's main delivery address as the final stop if not already listed
                  const deliveryAddr = (job as any).deliveryAddress || (job as any).delivery_address;
                  if (deliveryAddr) {
                    const normalizedAddr = deliveryAddr.trim().toLowerCase();
                    const alreadyIncluded = stops.some((s: any) => 
                      (s.address && s.address.trim().toLowerCase() === normalizedAddr) || 
                      (s.postcode && (job as any).deliveryPostcode && s.postcode.trim().toLowerCase() === ((job as any).deliveryPostcode || (job as any).delivery_postcode || '').trim().toLowerCase())
                    );
                    if (!alreadyIncluded) {
                      stops = [...stops, {
                        stopOrder: stops.length + 1,
                        postcode: (job as any).deliveryPostcode || (job as any).delivery_postcode || '',
                        address: deliveryAddr,
                        recipientName: (job as any).recipientName || (job as any).recipient_name || '',
                        recipientPhone: '',
                        instructions: '',
                      }];
                    }
                  }
                  (job as any).multiDropStops = stops;
                }
              }
            }
          } catch (err: any) {
            console.error('[API Jobs] Error fetching multi-drop stops:', err.message);
          }
        }
      }

      // Merge office_city and created_by from job_admin_notes (PGHOST) into jobs
      try {
        const jobIds = resolvedJobs.map((j: any) => j.id).filter(Boolean);
        if (jobIds.length > 0) {
          const metaResult = await getPgPool().query(
            'SELECT job_id, office_city, created_by FROM job_admin_notes WHERE job_id = ANY($1::text[])',
            [jobIds]
          );
          // Always use String keys — job_admin_notes.job_id is text; resolvedJobs.id may be number or string
          const metaMap = new Map<string, any>(metaResult.rows.map((r: any) => [String(r.job_id), r]));
          for (const job of resolvedJobs) {
            const meta = metaMap.get(String((job as any).id));
            if (meta) {
              if (meta.office_city) (job as any).officeCity = meta.office_city;
              if (meta.created_by) (job as any).createdBy = meta.created_by;
            }
            // If no customer_id and no createdBy → job was created by the office (admin/supervisor)
            if (!(job as any).customerId && !(job as any).createdBy) {
              (job as any).createdBy = 'Office';
            }
          }
        }
      } catch (metaErr: any) {
        console.warn('[API Jobs] Failed to merge metadata:', metaErr.message);
      }
      
      cache.set(jobsCacheKey, resolvedJobs, CACHE_TTL.JOBS_LIST);
    }
    
    let isAdminOrSupervisor = false;
    let isCustomerViewingOwn = false;
    let authenticatedUserId: string | null = null;
    
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { verifyAccessToken } = await import("./supabaseAdmin");
      const user = await verifyAccessToken(token);
      authenticatedUserId = user?.id || null;
      
      if (user?.role === 'admin' || user?.role === 'dispatcher') {
        isAdminOrSupervisor = true;
      } else if (user?.email) {
        // Check supervisor table
        try {
          const supResult = await getPgPool().query(
            "SELECT status FROM supervisors WHERE email = $1 LIMIT 1",
            [user.email.toLowerCase()]
          );
          isAdminOrSupervisor = supResult.rows.length > 0 && supResult.rows[0].status === 'active';
        } catch { isAdminOrSupervisor = false; }
      }
      
      if ((user?.role === 'customer' || user?.role === 'business') && customerId && authenticatedUserId === customerId) {
        isCustomerViewingOwn = true;
      }
    }
    
    if (isAdminOrSupervisor || isCustomerViewingOwn) {
      return res.json(resolvedJobs);
    }
    
    const safeJobs = resolvedJobs.map(job => stripCustomerPricing(job));
    return res.json(safeJobs);
  }));

  // Test email endpoint - for testing email templates
  app.post("/api/test-email", asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const testJobDetails = {
      id: 285,
      trackingNumber: 'RCTEST123456',
      pickupPostcode: 'SW1A 1AA',
      pickupAddress: '10 Downing Street, Westminster',
      pickupBuildingName: 'Prime Minister Office',
      pickupContactName: 'John Smith',
      pickupContactPhone: '+44 7700 900123',
      pickupInstructions: 'Ring the doorbell',
      deliveryPostcode: 'EC1A 1BB',
      deliveryAddress: '1 London Wall, City of London',
      deliveryBuildingName: 'Tower Building',
      recipientName: 'Jane Doe',
      recipientPhone: '+44 7700 900456',
      deliveryInstructions: 'Leave with reception',
      vehicleType: 'small_van',
      weight: 25,
      distance: 8.5,
      isMultiDrop: false,
      isReturnTrip: false,
      basePrice: 17.00,
      distancePrice: 17.00,
      weightSurcharge: 15.00,
      multiDropCharge: 0,
      returnTripCharge: 0,
      centralLondonCharge: 17.00,
      waitingTimeCharge: 0,
      totalPrice: 66.00,
      paymentStatus: 'paid',
      createdAt: new Date()
    };
    
    const result = await sendCustomerBookingConfirmation(email, testJobDetails);
    res.json({ success: true, message: "Test email sent", result });
  }));

  app.post("/api/test-admin-booking-email", asyncHandler(async (req, res) => {
    const testJobDetails = {
      id: 'test-0',
      jobNumber: String(100000 + Math.floor(Math.random() * 900000)),
      trackingNumber: 'RCTEST' + Date.now().toString().slice(-6),
      pickupPostcode: 'SW1A 1AA',
      pickupAddress: '10 Downing Street, Westminster',
      deliveryPostcode: 'EC1A 1BB',
      deliveryAddress: '1 London Wall, City of London',
      recipientName: 'Test Recipient',
      recipientPhone: '+44 7700 900456',
      vehicleType: 'small_van',
      totalPrice: 45.00,
      paymentStatus: 'paid',
      status: 'pending',
      createdAt: new Date()
    };
    
    console.log('[Test] Sending test admin booking notification email...');
    const result = await sendNewJobNotification('test-0', testJobDetails);
    console.log('[Test] Admin booking email result:', result);
    res.json({ success: result, message: result ? "Test booking email sent to admin addresses" : "Failed to send test email - check server logs" });
  }));

  // Weekly driver jobs for payment reference
  app.get("/api/driver-jobs/weekly", asyncHandler(async (req, res) => {
    const { db } = await import("./db");
    const { gte, lte, and, or, isNotNull, inArray } = await import("drizzle-orm");
    const { jobs } = await import("@shared/schema");
    type JobStatus = "pending" | "assigned" | "accepted" | "on_the_way_pickup" | "arrived_pickup" | "collected" | "on_the_way_delivery" | "delivered" | "cancelled";
    
    // Get start and end dates from query, default to current week (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    // Handle Sunday (0) as end of week, so Monday is start
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
    endOfWeek.setHours(23, 59, 59, 999);
    
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : startOfWeek;
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate as string) 
      : endOfWeek;
    
    const completedStatuses: JobStatus[] = ['delivered', 'collected'];
    
    // Get jobs that have a driver assigned and are delivered/completed
    // Filter by deliveredAt (or actualDeliveryTime, or createdAt as fallback)
    // SECURITY: This endpoint is for admin payroll - includes both prices for admin use
    // Admin sees totalPrice for customer invoice, driverPrice for driver payment
    const weeklyJobs = await db
      .select({
        id: jobs.id,
        trackingNumber: jobs.trackingNumber,
        driverId: jobs.driverId,
        pickupPostcode: jobs.pickupPostcode,
        pickupAddress: jobs.pickupAddress,
        deliveryPostcode: jobs.deliveryPostcode,
        deliveryAddress: jobs.deliveryAddress,
        status: jobs.status,
        driverPrice: jobs.driverPrice,
        totalPrice: jobs.totalPrice, // Admin-only: needed for profit margin calculation
        deliveredAt: jobs.deliveredAt,
        actualDeliveryTime: jobs.actualDeliveryTime,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .where(
        and(
          isNotNull(jobs.driverId),
          inArray(jobs.status, completedStatuses),
          or(
            // Jobs delivered in this week
            and(isNotNull(jobs.deliveredAt), gte(jobs.deliveredAt, startDate), lte(jobs.deliveredAt, endDate)),
            // Or jobs with actualDeliveryTime in this week (fallback)
            and(isNotNull(jobs.actualDeliveryTime), gte(jobs.actualDeliveryTime, startDate), lte(jobs.actualDeliveryTime, endDate)),
            // Or jobs created in this week as last fallback (for legacy data without delivery timestamps)
            and(gte(jobs.createdAt, startDate), lte(jobs.createdAt, endDate))
          )
        )
      )
      .orderBy(jobs.deliveredAt);
    
    res.json(weeklyJobs);
  }));

  // Track by tracking number - must be before :id route
  // Query Supabase directly for public tracking (doesn't require auth)
  app.get("/api/jobs/track/:trackingNumber", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    
    const trackingNumber = req.params.trackingNumber.toUpperCase();
    
    // Query Supabase where jobs are actually stored
    if (supabaseAdmin) {
      const { data: job, error } = await supabaseAdmin
        .from('jobs')
        .select(`
          id,
          tracking_number,
          job_number,
          status,
          vehicle_type,
          pickup_address,
          pickup_postcode,
          delivery_address,
          delivery_postcode,
          recipient_name,
          estimated_delivery_time,
          created_at,
          driver_id,
          is_multi_drop,
          pod_photo_url,
          pod_photos,
          pod_signature_url,
          pod_recipient_name,
          delivered_at
        `)
        .eq('tracking_number', trackingNumber)
        .single();
      
      if (error || !job) {
        console.log(`[Track] Job not found for tracking number ${trackingNumber}:`, error?.message);
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Get driver info if assigned
      let driverName = null;
      let driverPhone = null;
      let driverVehicleType = null;
      if (job.driver_id) {
        const { data: driver } = await supabaseAdmin
          .from('drivers')
          .select('full_name, phone, vehicle_type')
          .eq('id', job.driver_id)
          .single();
        
        if (driver) {
          driverName = driver.full_name;
          driverPhone = driver.phone;
          driverVehicleType = (driver as any).vehicle_type || null;
        }
      }
      
      // Fetch multi-drop stops if applicable
      const isMultiDrop = !!(job as any).is_multi_drop;
      let multiDropStops: { stopOrder: number; address: string; postcode: string; status: string; deliveredAt: string | null; podPhotoUrl: string | null; podSignatureUrl: string | null; podRecipientName: string | null }[] = [];
      if (isMultiDrop) {
        const jobIdStr = String(job.id);
        const { data: stops } = await supabaseAdmin
          .from('multi_drop_stops')
          .select('stop_order, address, postcode, status, delivered_at, pod_photo_url, pod_signature_url, pod_recipient_name')
          .eq('job_id', jobIdStr)
          .order('stop_order', { ascending: true });
        if (stops && stops.length > 0) {
          multiDropStops = stops.map((s: any) => {
            const normPostcode = normalizeUKPostcode(s.postcode || '');
            const addr = s.address && s.address.trim() ? s.address : normPostcode;
            return {
              stopOrder: s.stop_order,
              address: addr,
              postcode: normPostcode,
              status: s.status || 'pending',
              deliveredAt: s.delivered_at || null,
              podPhotoUrl: s.pod_photo_url || null,
              podSignatureUrl: s.pod_signature_url || null,
              podRecipientName: s.pod_recipient_name || null,
            };
          });
        }
        // Some jobs store the final stop only in delivery_address — append it if missing
        const deliveryPostcode = normalizeUKPostcode(job.delivery_postcode || '');
        if (deliveryPostcode && !multiDropStops.some(s => s.postcode === deliveryPostcode)) {
          const nextOrder = multiDropStops.length > 0 ? Math.max(...multiDropStops.map(s => s.stopOrder)) + 1 : 1;
          multiDropStops.push({
            stopOrder: nextOrder,
            address: job.delivery_address || deliveryPostcode,
            postcode: deliveryPostcode,
            status: 'pending',
            deliveredAt: null,
            podPhotoUrl: null,
            podSignatureUrl: null,
            podRecipientName: null,
          });
        }
      }

      // Map snake_case to camelCase for frontend
      const trackResult: any = {
        id: job.id,
        trackingNumber: job.tracking_number,
        jobNumber: (job as any).job_number || null,
        status: job.status,
        vehicleType: job.vehicle_type,
        pickupAddress: job.pickup_address,
        pickupPostcode: job.pickup_postcode,
        deliveryAddress: job.delivery_address,
        deliveryPostcode: job.delivery_postcode,
        isMultiDrop,
        multiDropStops,
        recipientName: job.recipient_name,
        estimatedDeliveryTime: job.estimated_delivery_time,
        createdAt: job.created_at,
        driverName,
        driverPhone,
        driverVehicleType,
        podPhotoUrl: (job as any).pod_photo_url || null,
        podPhotos: (job as any).pod_photos || [],
        podSignatureUrl: (job as any).pod_signature_url || null,
        podRecipientName: (job as any).pod_recipient_name || null,
        deliveredAt: (job as any).delivered_at || null,
        pickupBarcode: (job as any).pickup_barcode || null,
        deliveryBarcode: (job as any).delivery_barcode || null,
        barcodeScannedAtPickup: (job as any).barcode_scanned_at_pickup || false,
        barcodeVerifiedAtDelivery: (job as any).barcode_verified_at_delivery || false,
        pickupBarcodeScanTime: (job as any).pickup_barcode_scan_time || null,
        deliveryBarcodeScanTime: (job as any).delivery_barcode_scan_time || null,
      };
      const resolvedTrackResult = await resolveSingleJobPodUrls(trackResult);
      return res.json(ensureJobNumber(resolvedTrackResult));
    }
    
    // Fallback to Drizzle if Supabase not available
    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { jobs } = await import("@shared/schema");
    
    const [job] = await db.select().from(jobs).where(eq(jobs.trackingNumber, trackingNumber)).limit(1);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // SECURITY: Public tracking endpoint must NEVER expose pricing
    // Return only safe fields for public tracking
    return res.json({
      id: job.id,
      trackingNumber: job.trackingNumber,
      status: job.status,
      vehicleType: job.vehicleType,
      pickupAddress: job.pickupAddress,
      pickupPostcode: job.pickupPostcode,
      deliveryAddress: job.deliveryAddress,
      deliveryPostcode: job.deliveryPostcode,
      recipientName: job.recipientName,
      estimatedDeliveryTime: job.estimatedDeliveryTime,
      createdAt: job.createdAt,
      driverName: null,
      driverPhone: null,
    });
  }));

  // Public live-tracking endpoint — returns pickup/delivery coords + driver position
  // Security: driver lat/lng only returned for active jobs with an assigned driver
  app.get("/api/jobs/track/:trackingNumber/live", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    const { getDriverLocationFromCache } = await import("./realtime");

    const trackingNumber = req.params.trackingNumber.toUpperCase();

    const ACTIVE_STATUSES = new Set([
      'assigned', 'accepted', 'offered',
      'on_the_way_pickup', 'arrived_pickup',
      'collected', 'picked_up',
      'on_the_way_delivery', 'on_the_way',
    ]);

    const STATUS_LABELS: Record<string, string> = {
      assigned: 'Driver assigned, preparing for pickup',
      offered: 'Driver assigned, preparing for pickup',
      accepted: 'Driver assigned, preparing for pickup',
      on_the_way_pickup: 'Driver on the way to pickup',
      arrived_pickup: 'Driver has arrived at pickup',
      collected: 'Parcel collected — driver on the way',
      picked_up: 'Parcel collected — driver on the way',
      on_the_way_delivery: 'Driver on the way to delivery',
      on_the_way: 'Driver on the way to delivery',
      delivered: 'Delivered successfully',
      cancelled: 'Delivery cancelled',
      failed: 'Delivery could not be completed',
      pending: 'Order received — awaiting driver',
    };

    // Helper: geocode postcode via postcodes.io (free, no key)
    async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
      try {
        const resp = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
        const data = await resp.json();
        if (data.status === 200 && data.result) {
          return { lat: data.result.latitude, lng: data.result.longitude };
        }
      } catch { /* ignore */ }
      return null;
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Service unavailable' });
    }

    const { data: job, error } = await supabaseAdmin
      .from('jobs')
      .select('id, status, driver_id, pickup_postcode, delivery_postcode, pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude, is_multi_drop')
      .eq('tracking_number', trackingNumber)
      .single();

    if (error || !job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const status = (job as any).status as string;
    const isActive = ACTIVE_STATUSES.has(status);

    const driverIdRaw = (job as any).driver_id as string | null;
    console.log(`[LiveTrack] ${trackingNumber} → id=${(job as any).id} status=${status} driver_id=${driverIdRaw ?? 'none'}`);

    // Always fetch stops — job_id is stored as string in multi_drop_stops
    const jobIdStr = String((job as any).id);
    let rawStops: any[] = [];
    try {
      const { data: stopsData, error: stopsError } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('stop_order, address, postcode, latitude, longitude, status')
        .eq('job_id', jobIdStr)
        .order('stop_order', { ascending: true });
      if (stopsError) {
        console.error(`[LiveTrack] Supabase stops error: ${stopsError.message}`);
      } else {
        rawStops = stopsData ?? [];
      }
    } catch (err: any) {
      console.error(`[LiveTrack] stops fetch exception:`, err.message);
    }

    console.log(`[LiveTrack] stops fetched: ${rawStops.length} for job_id=${jobIdStr}`);

    const isMultiDrop = rawStops.length > 0 || !!(job as any).is_multi_drop;

    // Resolve pickup coords
    let pickup: { lat: number; lng: number } | null = null;
    if ((job as any).pickup_latitude && (job as any).pickup_longitude) {
      pickup = { lat: parseFloat((job as any).pickup_latitude), lng: parseFloat((job as any).pickup_longitude) };
    } else if ((job as any).pickup_postcode) {
      pickup = await geocodePostcode((job as any).pickup_postcode);
    }

    // Resolve delivery coords (only for single-drop jobs)
    let delivery: { lat: number; lng: number } | null = null;
    if (!isMultiDrop) {
      if ((job as any).delivery_latitude && (job as any).delivery_longitude) {
        delivery = { lat: parseFloat((job as any).delivery_latitude), lng: parseFloat((job as any).delivery_longitude) };
      } else if ((job as any).delivery_postcode) {
        delivery = await geocodePostcode((job as any).delivery_postcode);
      }
    }

    // Geocode stops that are missing coordinates
    const stops: { stopOrder: number; address: string; postcode: string; lat: number | null; lng: number | null; status: string }[] = [];
    for (const s of rawStops) {
      const normPc = normalizeUKPostcode(s.postcode || '');
      let lat: number | null = s.latitude ? parseFloat(String(s.latitude)) : null;
      let lng: number | null = s.longitude ? parseFloat(String(s.longitude)) : null;
      if ((lat === null || isNaN(lat) || lng === null || isNaN(lng)) && normPc) {
        const geo = await geocodePostcode(normPc);
        if (geo) { lat = geo.lat; lng = geo.lng; }
      }
      const displayAddr = s.address && s.address.trim() ? s.address : normPc;
      stops.push({ stopOrder: s.stop_order, address: displayAddr, postcode: normPc, lat, lng, status: s.status || 'pending' });
    }

    // Some jobs store the final stop only in delivery_address — append it if missing
    const deliveryPostcode = (job as any).delivery_postcode as string | null;
    if (isMultiDrop && deliveryPostcode && !stops.some(s => s.postcode === deliveryPostcode)) {
      let dLat: number | null = null, dLng: number | null = null;
      if ((job as any).delivery_latitude && (job as any).delivery_longitude) {
        dLat = parseFloat(String((job as any).delivery_latitude));
        dLng = parseFloat(String((job as any).delivery_longitude));
      } else {
        const geo = await geocodePostcode(deliveryPostcode);
        if (geo) { dLat = geo.lat; dLng = geo.lng; }
      }
      const nextOrder = stops.length > 0 ? Math.max(...stops.map(s => s.stopOrder)) + 1 : 1;
      stops.push({ stopOrder: nextOrder, address: (job as any).delivery_address || deliveryPostcode, postcode: deliveryPostcode, lat: dLat, lng: dLng, status: 'pending' });
    }

    // Driver location — ONLY for active jobs with a driver assigned
    let driver: { lat: number; lng: number; updatedAt: number; isLive: boolean } | null = null;
    if (isActive && driverIdRaw) {
      const driverId = driverIdRaw;
      const cached = getDriverLocationFromCache(driverId);
      if (cached) {
        const ageMs = Date.now() - cached.timestamp;
        driver = {
          lat: cached.lat,
          lng: cached.lng,
          updatedAt: cached.timestamp,
          isLive: ageMs < 5 * 60 * 1000,
        };
      } else {
        // Cache miss — fall back to Supabase drivers table (current_latitude/current_longitude)
        try {
          const { data: driverRow } = await supabaseAdmin
            .from('drivers')
            .select('current_latitude, current_longitude, last_location_update, postcode')
            .eq('id', driverId)
            .single();
          if (driverRow?.current_latitude && driverRow?.current_longitude) {
            const updatedAt = driverRow.last_location_update
              ? new Date(driverRow.last_location_update).getTime()
              : Date.now();
            const ageMs = Date.now() - updatedAt;
            driver = {
              lat: parseFloat(String(driverRow.current_latitude)),
              lng: parseFloat(String(driverRow.current_longitude)),
              updatedAt,
              isLive: ageMs < 5 * 60 * 1000,
            };
            console.log(`[LiveTrack] driver found in DB lat=${driver.lat} lng=${driver.lng} isLive=${driver.isLive}`);
          } else if (driverRow?.postcode) {
            // Last resort: geocode the driver's home postcode
            const geo = await geocodePostcode(driverRow.postcode);
            if (geo) {
              driver = { lat: geo.lat, lng: geo.lng, updatedAt: Date.now(), isLive: false };
              console.log(`[LiveTrack] driver geocoded from postcode lat=${driver.lat} lng=${driver.lng}`);
            }
          }
        } catch { /* ignore */ }
      }
    }

    return res.json({
      status,
      statusLabel: STATUS_LABELS[status] ?? status,
      isActive,
      isMultiDrop,
      pickup,
      delivery,
      stops,
      driver,
    });
  }));

  app.get("/api/jobs/:id", asyncHandler(async (req, res) => {
    const job = await storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Inline multi-drop stops so every consumer of /api/jobs/:id sees the full
    // routed list (admin, customer, dispatcher, supervisor, track, etc.)
    if ((job as any).isMultiDrop && supabaseAdmin) {
      try {
        const { data: stopsRows } = await supabaseAdmin
          .from('multi_drop_stops')
          .select('id, stop_order, postcode, address, recipient_name, recipient_phone, instructions, status, completed_at, latitude, longitude, pod_photo_url, pod_signature_url, pod_recipient_name')
          .eq('job_id', String(req.params.id))
          .order('stop_order', { ascending: true });

        let stops = (stopsRows || []).map((stop: any) => ({
          id: String(stop.id),
          stopOrder: stop.stop_order,
          stop_order: stop.stop_order,
          order: stop.stop_order,
          address: stop.address,
          postcode: stop.postcode,
          recipientName: stop.recipient_name,
          recipient_name: stop.recipient_name,
          recipientPhone: stop.recipient_phone,
          recipient_phone: stop.recipient_phone,
          instructions: stop.instructions,
          status: stop.status || 'pending',
          completedAt: stop.completed_at,
          completed_at: stop.completed_at,
          latitude: stop.latitude?.toString() || null,
          longitude: stop.longitude?.toString() || null,
          podPhotoUrl: stop.pod_photo_url,
          podSignatureUrl: stop.pod_signature_url,
          podRecipientName: stop.pod_recipient_name,
        }));

        // Append the job's main delivery address as the final stop if not already in the list
        const deliveryAddr = (job as any).deliveryAddress;
        if (deliveryAddr) {
          const normalizedAddr = String(deliveryAddr).trim().toLowerCase();
          const deliveryPc = (job as any).deliveryPostcode || '';
          const alreadyIncluded = stops.some((s: any) =>
            (s.address && String(s.address).trim().toLowerCase() === normalizedAddr) ||
            (s.postcode && deliveryPc && String(s.postcode).trim().toLowerCase() === String(deliveryPc).trim().toLowerCase())
          );
          if (!alreadyIncluded) {
            stops = [...stops, {
              id: `final-${(job as any).id}`,
              stopOrder: stops.length + 1,
              stop_order: stops.length + 1,
              order: stops.length + 1,
              address: deliveryAddr,
              postcode: deliveryPc,
              recipientName: (job as any).recipientName || '',
              recipient_name: (job as any).recipientName || '',
              recipientPhone: (job as any).recipientPhone || '',
              recipient_phone: (job as any).recipientPhone || '',
              instructions: '',
              status: 'pending',
              completedAt: null,
              completed_at: null,
              latitude: (job as any).deliveryLatitude?.toString() || null,
              longitude: (job as any).deliveryLongitude?.toString() || null,
              podPhotoUrl: null,
              podSignatureUrl: null,
              podRecipientName: null,
            }];
          }
        }

        (job as any).multiDropStops = stops;
        (job as any).stops = stops;
      } catch (err: any) {
        console.error('[API Job] Error fetching multi-drop stops:', err.message);
      }
    }

    // Merge office_city and created_by from job_admin_notes (PGHOST)
    try {
      const metaResult = await getPgPool().query(
        'SELECT office_city, created_by FROM job_admin_notes WHERE job_id = $1',
        [String(req.params.id)]
      );
      if (metaResult.rows.length > 0) {
        const meta = metaResult.rows[0];
        if (meta.office_city) (job as any).officeCity = meta.office_city;
        if (meta.created_by) (job as any).createdBy = meta.created_by;
      }
    } catch {}
    // If no customer → job was created by the office
    if (!(job as any).customerId && !(job as any).createdBy) {
      (job as any).createdBy = 'Office';
    }
    
    // SECURITY: Check if user can see pricing
    let isAdminOrSupervisor = false;
    let isOwner = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { verifyAccessToken } = await import("./supabaseAdmin");
      const user = await verifyAccessToken(token);
      if (user?.role === 'admin' || user?.role === 'dispatcher') {
        isAdminOrSupervisor = true;
      } else if (user?.email) {
        try {
          const supResult = await getPgPool().query(
            "SELECT status FROM supervisors WHERE email = $1 LIMIT 1",
            [user.email.toLowerCase()]
          );
          isAdminOrSupervisor = supResult.rows.length > 0 && supResult.rows[0].status === 'active';
        } catch { isAdminOrSupervisor = false; }
      }
      // Customer or Business viewing their own job
      if ((user?.role === 'customer' || user?.role === 'business') && user?.id === job.customerId) {
        isOwner = true;
      }
    }
    
    if (isAdminOrSupervisor || isOwner) {
      return res.json(ensureJobNumber(await resolveSingleJobPodUrls(job)));
    }
    
    // CRITICAL: Everyone else gets NO customer pricing
    return res.json(ensureJobNumber(stripCustomerPricing(await resolveSingleJobPodUrls(job))));
  }));

  // Get multi-drop stops for a job (admin/supervisor - contains POD and recipient data)
  app.get("/api/jobs/:id/stops", asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    
    // SECURITY: Require admin or supervisor access for POD and recipient data
    let isAdminOrSupervisor = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user: authUser } } = await supabaseAdmin?.auth.getUser(token) || { data: { user: null } };
      if (authUser?.email) {
        const adminCheck = await isAdminByEmail(authUser.email);
        if (adminCheck) {
          isAdminOrSupervisor = true;
        } else {
          try {
            const supResult = await getPgPool().query(
              "SELECT status FROM supervisors WHERE email = $1 LIMIT 1",
              [authUser.email.toLowerCase()]
            );
            isAdminOrSupervisor = supResult.rows.length > 0 && supResult.rows[0].status === 'active';
          } catch { isAdminOrSupervisor = false; }
        }
      }
    }
    
    if (!isAdminOrSupervisor) {
      return res.status(403).json({ error: "Admin or supervisor access required", code: "NOT_AUTHORIZED" });
    }
    
    // First verify the job exists
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Fetch multi-drop stops from Supabase
    if (!supabaseAdmin) {
      return res.json({ stops: [] });
    }
    
    console.log(`[Stops] Fetching stops for job ${jobId}`);
    
    const { data: stops, error } = await supabaseAdmin
      .from('multi_drop_stops')
      .select('id, job_id, stop_order, address, postcode, latitude, longitude, recipient_name, recipient_phone, instructions, status, delivered_at, pod_photo_url, pod_signature_url, pod_recipient_name')
      .eq('job_id', jobId)
      .order('stop_order', { ascending: true });
    
    console.log(`[Stops] Found ${stops?.length || 0} stops for job ${jobId}`);
    
    if (error) {
      console.error('[Stops] Error fetching multi-drop stops:', error);
      return res.json({ stops: [] });
    }
    
    // Map snake_case to camelCase
    const mappedStops = (stops || []).map(stop => ({
      id: stop.id,
      jobId: stop.job_id,
      stopOrder: stop.stop_order,
      address: stop.address,
      postcode: stop.postcode,
      latitude: stop.latitude,
      longitude: stop.longitude,
      recipientName: stop.recipient_name,
      recipientPhone: stop.recipient_phone,
      instructions: stop.instructions,
      status: stop.status,
      deliveredAt: stop.delivered_at,
      podPhotoUrl: stop.pod_photo_url,
      podSignatureUrl: stop.pod_signature_url,
      podRecipientName: stop.pod_recipient_name,
    }));
    
    // Some jobs store the final stop only in delivery_address — append it if missing
    const jobDeliveryPostcode = (job as any).deliveryPostcode as string | undefined;
    if (job.isMultiDrop && jobDeliveryPostcode && !mappedStops.some((s: any) => s.postcode === jobDeliveryPostcode)) {
      const nextOrder = mappedStops.length > 0 ? Math.max(...mappedStops.map((s: any) => s.stopOrder)) + 1 : 1;
      mappedStops.push({
        id: `fallback-${jobId}`,
        jobId,
        stopOrder: nextOrder,
        address: (job as any).deliveryAddress || jobDeliveryPostcode,
        postcode: jobDeliveryPostcode,
        latitude: (job as any).deliveryLatitude || null,
        longitude: (job as any).deliveryLongitude || null,
        recipientName: (job as any).recipientName || null,
        recipientPhone: null,
        instructions: null,
        status: 'pending',
        deliveredAt: null,
        podPhotoUrl: null,
        podSignatureUrl: null,
        podRecipientName: null,
      });
    }

    // Resolve POD URLs to signed URLs
    const resolvedStops = await Promise.all(mappedStops.map(async (stop: any) => {
      const resolved = { ...stop };
      const BUCKET = 'driver-documents';
      if (stop.podPhotoUrl && !stop.podPhotoUrl.startsWith('http')) {
        try {
          const { data } = await supabaseAdmin!.storage.from(BUCKET).createSignedUrl(stop.podPhotoUrl, 3600);
          if (data?.signedUrl) resolved.podPhotoUrl = data.signedUrl;
        } catch {}
      }
      if (stop.podSignatureUrl && !stop.podSignatureUrl.startsWith('http')) {
        try {
          const { data } = await supabaseAdmin!.storage.from(BUCKET).createSignedUrl(stop.podSignatureUrl, 3600);
          if (data?.signedUrl) resolved.podSignatureUrl = data.signedUrl;
        } catch {}
      }
      return resolved;
    }));

    return res.json({ stops: resolvedStops });
  }));

  // Update a multi-drop stop status (admin only)
  app.patch("/api/jobs/:jobId/stops/:stopId", asyncHandler(async (req, res) => {
    const { jobId, stopId } = req.params;
    const { status } = req.body;
    
    // Verify token and allow admin OR active supervisor
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    const { verifyAccessToken } = await import('./supabaseAdmin');
    const authUser = await verifyAccessToken(token);
    if (!authUser?.email) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const userIsAdmin = await isAdminByEmail(authUser.email);
    let userIsSupervisor = false;
    if (!userIsAdmin) {
      try {
        const supResult = await getPgPool().query(
          "SELECT status FROM supervisors WHERE email = $1 LIMIT 1",
          [authUser.email.toLowerCase()]
        );
        userIsSupervisor = supResult.rows.length > 0 && supResult.rows[0].status === 'active';
      } catch { userIsSupervisor = false; }
    }
    if (!userIsAdmin && !userIsSupervisor) {
      return res.status(403).json({ error: 'Admin or supervisor access required' });
    }

    if (!status || !['pending', 'delivered', 'failed'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'pending', 'delivered', or 'failed'" });
    }
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Database not available" });
    }

    // If this is a fallback stop (not yet in DB), insert it first then update
    let realStopId = stopId;
    if (stopId.startsWith('fallback-')) {
      // Fetch the job's delivery address to build the real stop row
      const { data: jobRow } = await supabaseAdmin
        .from('jobs')
        .select('delivery_address, delivery_postcode, delivery_latitude, delivery_longitude, recipient_name')
        .eq('id', jobId)
        .single();

      // Find the next stop_order
      const { data: existingStops } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('stop_order')
        .eq('job_id', jobId)
        .order('stop_order', { ascending: false })
        .limit(1);
      const nextOrder = existingStops && existingStops.length > 0 ? (existingStops[0].stop_order + 1) : 1;

      const insertPayload: Record<string, any> = {
        job_id: jobId,
        stop_order: nextOrder,
        address: jobRow?.delivery_address || null,
        postcode: jobRow?.delivery_postcode || null,
        latitude: jobRow?.delivery_latitude || null,
        longitude: jobRow?.delivery_longitude || null,
        recipient_name: jobRow?.recipient_name || null,
        status,
        delivered_at: status === 'delivered' ? new Date().toISOString() : null,
      };

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('multi_drop_stops')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError || !inserted) {
        console.error('[Stops] Error inserting fallback stop:', insertError);
        return res.status(500).json({ error: "Failed to create stop record" });
      }

      console.log(`[Stops] Inserted fallback stop ${inserted.id} for job ${jobId} with status ${status}`);
      cache.clear();
      return res.json({
        success: true,
        stop: {
          id: inserted.id,
          jobId: inserted.job_id,
          stopOrder: inserted.stop_order,
          status: inserted.status,
          deliveredAt: inserted.delivered_at,
        }
      });
    }

    // Update the stop status
    const updateData: Record<string, any> = { status };
    if (status === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    } else {
      updateData.delivered_at = null;
    }
    
    const { data: updatedStop, error } = await supabaseAdmin
      .from('multi_drop_stops')
      .update(updateData)
      .eq('id', realStopId)
      .eq('job_id', jobId)
      .select()
      .single();
    
    if (error) {
      console.error('[Stops] Error updating stop:', error);
      return res.status(500).json({ error: "Failed to update stop status" });
    }
    
    console.log(`[Stops] Updated stop ${realStopId} status to ${status}, job ${jobId}`);
    
    cache.clear();
    
    return res.json({ 
      success: true, 
      stop: {
        id: updatedStop.id,
        jobId: updatedStop.job_id,
        stopOrder: updatedStop.stop_order,
        status: updatedStop.status,
        deliveredAt: updatedStop.delivered_at,
      }
    });
  }));

  // Upload POD photo for a specific multi-drop stop
  app.post("/api/jobs/:jobId/stops/:stopId/pod/upload", (req, res, next) => {
    uploadPodImage.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { jobId, stopId } = req.params;
    
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const finalFilename = `stop_${stopId}_${timestamp}${ext}`;
    const BUCKET = 'pod-images';
    const storagePath = `pod/${jobId}/${finalFilename}`;
    const contentType = req.file.mimetype || 'image/jpeg';
    const fileBuffer = req.file.buffer;

    const { supabaseAdmin: supAdmin } = await import('./supabaseAdmin');
    if (!supAdmin) return res.status(500).json({ error: "Storage service unavailable" });

    let uploaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error: uploadError } = await supAdmin.storage
          .from(BUCKET)
          .upload(storagePath, fileBuffer, { contentType, upsert: true });
        if (!uploadError) { uploaded = true; break; }
        console.warn(`[Stop POD] Upload attempt ${attempt}/3 failed:`, uploadError.message);
      } catch (err: any) {
        console.warn(`[Stop POD] Upload attempt ${attempt}/3 error:`, err.message);
      }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
    
    if (!uploaded) return res.status(500).json({ error: "Failed to upload POD photo" });

    // Verify the stop exists before updating
    const { data: existingStop } = await supAdmin
      .from('multi_drop_stops')
      .select('id')
      .eq('id', stopId)
      .eq('job_id', jobId)
      .maybeSingle();
    
    if (!existingStop) {
      console.error(`[Stop POD] Stop ${stopId} not found for job ${jobId} - may have been recreated`);
      // Try to find the stop by job_id and stop_order from the filename pattern
      // Fall back to updating by job_id and searching for any stop
      const { data: allStops } = await supAdmin
        .from('multi_drop_stops')
        .select('id, stop_order')
        .eq('job_id', jobId)
        .order('stop_order', { ascending: true });
      
      if (allStops && allStops.length > 0) {
        // Update the first stop that doesn't have a POD yet, or the first stop
        const { data: stopsWithoutPod } = await supAdmin
          .from('multi_drop_stops')
          .select('id')
          .eq('job_id', jobId)
          .is('pod_photo_url', null)
          .order('stop_order', { ascending: true })
          .limit(1);
        
        const targetStopId = stopsWithoutPod?.[0]?.id || allStops[0].id;
        console.log(`[Stop POD] Redirecting POD upload to stop ${targetStopId} (original ${stopId} not found)`);
        
        const { error: fallbackError } = await supAdmin
          .from('multi_drop_stops')
          .update({ pod_photo_url: storagePath })
          .eq('id', targetStopId);
        
        if (fallbackError) {
          console.error('[Stop POD] Fallback update also failed:', fallbackError);
          return res.status(500).json({ error: "Failed to save POD reference" });
        }
      } else {
        return res.status(404).json({ error: "No stops found for this job" });
      }
    } else {
      const { error: updateError } = await supAdmin
        .from('multi_drop_stops')
        .update({ pod_photo_url: storagePath })
        .eq('id', stopId)
        .eq('job_id', jobId);
      
      if (updateError) {
        console.error('[Stop POD] Failed to update stop:', updateError);
        return res.status(500).json({ error: "Failed to save POD reference" });
      }
    }

    let signedUrl = storagePath;
    try {
      const { data } = await supAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) signedUrl = data.signedUrl;
    } catch {}

    console.log(`[Stop POD] Uploaded POD for stop ${stopId} of job ${jobId}`);
    res.json({ success: true, podPhotoUrl: signedUrl, stopId });
  }));

  // Delete POD photo for a specific multi-drop stop
  app.delete("/api/jobs/:jobId/stops/:stopId/pod", requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { jobId, stopId } = req.params;
    
    const { supabaseAdmin: supAdmin } = await import('./supabaseAdmin');
    if (!supAdmin) return res.status(500).json({ error: "Storage service unavailable" });
    
    const { data: stop } = await supAdmin
      .from('multi_drop_stops')
      .select('pod_photo_url')
      .eq('id', stopId)
      .eq('job_id', jobId)
      .single();
    
    if (stop?.pod_photo_url) {
      await supAdmin.storage.from('driver-documents').remove([stop.pod_photo_url]).catch(() => {});
    }
    
    await supAdmin
      .from('multi_drop_stops')
      .update({ pod_photo_url: null })
      .eq('id', stopId)
      .eq('job_id', jobId);
    
    res.json({ success: true });
  }));

  // Driver delivers a multi-drop stop with POD (photo + recipient name)
  // Called from the mobile app when a driver completes a stop
  app.patch("/api/jobs/:jobId/stops/:stopId/deliver", asyncHandler(async (req, res) => {
    const { jobId, stopId } = req.params;
    const { podRecipientName, podPhotoUrl, podSignatureUrl } = req.body;

    // Authenticate - allow both admin and the assigned driver
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.slice(7);
    const { supabaseAdmin: supAdmin } = await import('./supabaseAdmin');
    if (!supAdmin) return res.status(500).json({ error: "Database not available" });

    const { data: { user: authUser } } = await supAdmin.auth.getUser(token);
    if (!authUser) return res.status(401).json({ error: "Invalid authentication" });

    const isAdmin = await isAdminByEmail(authUser.email || '');
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const isAssignedDriver = job.driverId === authUser.id;
    if (!isAdmin && !isAssignedDriver) {
      return res.status(403).json({ error: "Access denied - only the assigned driver or admin can deliver stops" });
    }

    if (!job.isMultiDrop) {
      return res.status(400).json({ error: "This endpoint is only for multi-drop jobs. Use the standard delivery endpoint for single-drop jobs." });
    }

    // Verify the stop exists and belongs to this job before updating
    const { data: existingStop, error: fetchError } = await supAdmin
      .from('multi_drop_stops')
      .select('id, status')
      .eq('id', stopId)
      .eq('job_id', jobId)
      .single();

    if (fetchError || !existingStop) {
      return res.status(404).json({ error: "Stop not found for this job" });
    }

    if (existingStop.status === 'delivered') {
      return res.status(400).json({ error: "This stop has already been delivered" });
    }

    // Update the stop with POD data and mark as delivered
    const updateData: Record<string, any> = {
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    };
    if (podRecipientName) updateData.pod_recipient_name = podRecipientName;
    if (podPhotoUrl) updateData.pod_photo_url = podPhotoUrl;
    if (podSignatureUrl) updateData.pod_signature_url = podSignatureUrl;

    const { data: updatedStop, error: updateError } = await supAdmin
      .from('multi_drop_stops')
      .update(updateData)
      .eq('id', stopId)
      .eq('job_id', jobId)
      .select()
      .single();

    if (updateError) {
      console.error('[Stop Deliver] Failed to update stop:', updateError);
      return res.status(500).json({ error: "Failed to deliver stop" });
    }

    console.log(`[Stop Deliver] Stop ${stopId} delivered for job ${jobId} by ${isAdmin ? 'admin' : 'driver'}`);

    // Fetch ALL stops with full details ordered by stop_order so the app always
    // has the authoritative sequence — prevents client-side reordering bugs.
    const { data: allStops, error: allStopsError } = await supAdmin
      .from('multi_drop_stops')
      .select('id, job_id, stop_order, address, postcode, latitude, longitude, recipient_name, recipient_phone, instructions, status, delivered_at, pod_photo_url, pod_recipient_name')
      .eq('job_id', jobId)
      .order('stop_order', { ascending: true });

    if (allStopsError) {
      console.error('[Stop Deliver] Failed to fetch all stops:', allStopsError);
      cache.clear();
      return res.json({
        success: true,
        stop: {
          id: updatedStop.id,
          jobId: updatedStop.job_id,
          stopOrder: updatedStop.stop_order,
          status: 'delivered',
          deliveredAt: updatedStop.delivered_at,
          podRecipientName: updatedStop.pod_recipient_name,
          podPhotoUrl: updatedStop.pod_photo_url,
        },
        jobCompleted: false,
        message: "Stop delivered but could not check auto-completion status",
      });
    }

    // Map all stops to camelCase for the response
    const mappedAllStops = (allStops || []).map((s: any) => ({
      id: s.id,
      jobId: s.job_id,
      stopOrder: s.stop_order,
      address: s.address,
      postcode: s.postcode,
      latitude: s.latitude,
      longitude: s.longitude,
      recipientName: s.recipient_name,
      recipientPhone: s.recipient_phone,
      instructions: s.instructions,
      status: s.status,
      deliveredAt: s.delivered_at,
      podRecipientName: s.pod_recipient_name,
      podPhotoUrl: s.pod_photo_url,
    }));

    // Remaining stops in original stop_order sequence — never re-sorted
    const remainingStops = mappedAllStops.filter(s => s.status !== 'delivered');

    const allDelivered = allStops && allStops.length > 0 && allStops.every((s: any) => s.status === 'delivered');

    if (allDelivered) {
      console.log(`[Stop Deliver] All ${allStops.length} stops delivered for job ${jobId} - auto-completing job`);

      // Set synthetic POD on the main job via storage (single consistent update)
      const syntheticPodRecipient = updatedStop.pod_recipient_name || 'Multi-drop complete';
      const syntheticPodPhoto = allStops.find(s => s.pod_photo_url)?.pod_photo_url || null;
      await storage.updateJob(jobId, {
        podNotes: `Multi-drop delivery completed. ${allStops.length} stops delivered.`,
        podRecipientName: syntheticPodRecipient,
        podPhotoUrl: syntheticPodPhoto,
      });

      // Update job status to delivered
      const deliveredJob = await storage.updateJobStatus(jobId, 'delivered');
      if (deliveredJob) {
        console.log(`[Stop Deliver] Job ${jobId} auto-completed after all stops delivered`);

        // Broadcast job status update
        broadcastJobUpdate({
          id: deliveredJob.id,
          trackingNumber: deliveredJob.trackingNumber,
          status: 'delivered',
          previousStatus: job.status,
          customerId: deliveredJob.customerId,
          driverId: deliveredJob.driverId,
          updatedAt: deliveredJob.updatedAt,
        });

        // Send delivery confirmation email
        try {
          let customerEmail = (deliveredJob as any).customerEmail;
          if (!customerEmail && deliveredJob.customerId) {
            const customer = await storage.getUser(deliveredJob.customerId);
            customerEmail = customer?.email;
          }
          if (!customerEmail) {
            const { data: sJob } = await supAdmin
              .from('jobs')
              .select('customer_email')
              .eq('id', jobId)
              .single();
            if (sJob?.customer_email) customerEmail = sJob.customer_email;
          }
          if (customerEmail) {
            const { sendDeliveryConfirmationEmail } = await import('./emailService');
            const numberedJob = ensureJobNumber(deliveredJob);
            await sendDeliveryConfirmationEmail(customerEmail, {
              trackingNumber: deliveredJob.trackingNumber,
              jobNumber: numberedJob.jobNumber,
              pickupAddress: deliveredJob.pickupAddress,
              pickupPostcode: deliveredJob.pickupPostcode,
              deliveryAddress: deliveredJob.deliveryAddress,
              deliveryPostcode: deliveredJob.deliveryPostcode,
              recipientName: deliveredJob.recipientName,
              podRecipientName: syntheticPodRecipient,
              podPhotoUrl: syntheticPodPhoto,
              deliveredAt: new Date().toISOString(),
            });
            console.log(`[Stop Deliver] Delivery confirmation email sent for job ${jobId}`);
          }
        } catch (emailErr) {
          console.error('[Stop Deliver] Failed to send delivery email:', emailErr);
        }
      }

      cache.clear();
      return res.json({
        success: true,
        stop: {
          id: updatedStop.id,
          jobId: updatedStop.job_id,
          stopOrder: updatedStop.stop_order,
          status: 'delivered',
          deliveredAt: updatedStop.delivered_at,
          podRecipientName: updatedStop.pod_recipient_name,
          podPhotoUrl: updatedStop.pod_photo_url,
        },
        jobCompleted: true,
        message: `All ${allStops.length} stops delivered. Job auto-completed.`,
        allStops: mappedAllStops,
        remainingStops: [],
        remainingStopsCount: 0,
      });
    }

    cache.clear();
    res.json({
      success: true,
      stop: {
        id: updatedStop.id,
        jobId: updatedStop.job_id,
        stopOrder: updatedStop.stop_order,
        status: 'delivered',
        deliveredAt: updatedStop.delivered_at,
        podRecipientName: updatedStop.pod_recipient_name,
        podPhotoUrl: updatedStop.pod_photo_url,
      },
      jobCompleted: false,
      // Full ordered list of all stops (delivered + pending) sorted by stop_order.
      // The app must use this to drive navigation — never re-sort client-side.
      allStops: mappedAllStops,
      // Pending stops only, already in stop_order sequence ready for navigation.
      remainingStops,
      remainingStopsCount: remainingStops.length,
      nextStop: remainingStops[0] ?? null,
    });
  }));

  // Upload POD photo for a multi-drop stop (driver-facing)
  app.post("/api/jobs/:jobId/stops/:stopId/pod/driver-upload", (req, res, next) => {
    uploadPodImage.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, asyncHandler(async (req, res) => {
    const { jobId, stopId } = req.params;

    // Authenticate driver
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.slice(7);
    const { supabaseAdmin: supAdmin } = await import('./supabaseAdmin');
    if (!supAdmin) return res.status(500).json({ error: "Storage service unavailable" });

    const { data: { user: authUser } } = await supAdmin.auth.getUser(token);
    if (!authUser) return res.status(401).json({ error: "Invalid authentication" });

    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const isAdmin = await isAdminByEmail(authUser.email || '');
    const isAssignedDriver = job.driverId === authUser.id;
    if (!isAdmin && !isAssignedDriver) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const finalFilename = `stop_${stopId}_${timestamp}${ext}`;
    const BUCKET = 'pod-images';
    const storagePath = `pod/${jobId}/${finalFilename}`;
    const contentType = req.file.mimetype || 'image/jpeg';
    const fileBuffer = req.file.buffer;

    let uploaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error: uploadError } = await supAdmin.storage
          .from(BUCKET)
          .upload(storagePath, fileBuffer, { contentType, upsert: true });
        if (!uploadError) { uploaded = true; break; }
        console.warn(`[Stop POD Driver] Upload attempt ${attempt}/3 failed:`, uploadError.message);
      } catch (err: any) {
        console.warn(`[Stop POD Driver] Upload attempt ${attempt}/3 error:`, err.message);
      }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }

    if (!uploaded) return res.status(500).json({ error: "Failed to upload POD photo" });

    // Update the stop with the POD photo
    const { error: updateError } = await supAdmin
      .from('multi_drop_stops')
      .update({ pod_photo_url: storagePath })
      .eq('id', stopId)
      .eq('job_id', jobId);

    if (updateError) {
      console.error('[Stop POD Driver] Failed to update stop:', updateError);
      return res.status(500).json({ error: "Failed to save POD reference" });
    }

    let signedUrl = storagePath;
    try {
      const { data } = await supAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) signedUrl = data.signedUrl;
    } catch {}

    console.log(`[Stop POD Driver] Uploaded POD for stop ${stopId} of job ${jobId}`);
    res.json({ success: true, podPhotoUrl: signedUrl, storagePath, stopId });
  }));

  app.post("/api/jobs", requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    console.log('[Jobs] POST /api/jobs - Creating new job with driverId:', req.body.driverId);
    
    // Generate tracking number first
    const trackingNumber = await generateTrackingNumber();
    const jobNumber = await generateJobNumber();
    
    // CRITICAL: If driverId is provided, we need to convert it to Supabase auth.uid for RLS compatibility
    // The mobile app uses RLS policy: auth.uid() = driver_id
    // In Supabase, drivers.id IS the auth.uid (not a separate user_id column)
    // So we must look up the driver in Supabase and use their id field
    let resolvedDriverId = req.body.driverId || null;
    let supabaseDriverId: string | null = null;
    
    if (resolvedDriverId) {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        // First, get the local driver's email to look them up in Supabase
        const localDriver = await storage.getDriver(resolvedDriverId);
        
        if (localDriver?.email) {
          // Look up driver in Supabase by email to get their id (which is auth.uid)
          const { data: supabaseDriver, error } = await supabaseAdmin
            .from('drivers')
            .select('id, email, driver_code')
            .eq('email', localDriver.email)
            .single();
          
          if (supabaseDriver?.id) {
            // In Supabase, the id column IS the auth.uid()
            supabaseDriverId = supabaseDriver.id;
            console.log(`[Jobs] Resolved local driver ${localDriver.email} to Supabase auth.uid ${supabaseDriverId}`);
          } else {
            console.log(`[Jobs] Could not find driver in Supabase by email ${localDriver.email}:`, error?.message);
          }
        } else {
          console.log(`[Jobs] Local driver ${resolvedDriverId} has no email, cannot resolve Supabase ID`);
        }
      }
    }
    
    // Preprocess data to handle type coercion
    // ADMIN FLEXIBILITY: Provide defaults for missing required fields
    const weight = req.body.weight ?? 1;
    const pickupAddress = req.body.pickupAddress || 'TBC';
    const pickupPostcode = req.body.pickupPostcode || 'TBC';
    const deliveryAddress = req.body.deliveryAddress || 'TBC';
    const deliveryPostcode = req.body.deliveryPostcode || 'TBC';
    const basePrice = req.body.basePrice ?? '0';
    const distancePrice = req.body.distancePrice ?? '0';
    const totalPrice = req.body.totalPrice ?? '0';
    
    const preprocessedBody = {
      ...req.body,
      trackingNumber,
      jobNumber,
      driverId: resolvedDriverId,
      pickupAddress,
      pickupPostcode,
      deliveryAddress,
      deliveryPostcode,
      weight: typeof weight === 'number' ? String(weight) : weight,
      scheduledPickupTime: req.body.scheduledPickupTime ? new Date(req.body.scheduledPickupTime) : undefined,
      scheduledDeliveryTime: req.body.scheduledDeliveryTime ? new Date(req.body.scheduledDeliveryTime) : undefined,
      distance: typeof req.body.distance === 'number' ? String(req.body.distance) : (req.body.distance || '0'),
      basePrice: typeof basePrice === 'number' ? String(basePrice) : basePrice,
      distancePrice: typeof distancePrice === 'number' ? String(distancePrice) : distancePrice,
      weightSurcharge: typeof req.body.weightSurcharge === 'number' ? String(req.body.weightSurcharge) : (req.body.weightSurcharge || '0'),
      multiDropCharge: typeof req.body.multiDropCharge === 'number' ? String(req.body.multiDropCharge) : (req.body.multiDropCharge || '0'),
      returnTripCharge: typeof req.body.returnTripCharge === 'number' ? String(req.body.returnTripCharge) : (req.body.returnTripCharge || '0'),
      centralLondonCharge: typeof req.body.centralLondonCharge === 'number' ? String(req.body.centralLondonCharge) : (req.body.centralLondonCharge || '0'),
      waitingTimeCharge: typeof req.body.waitingTimeCharge === 'number' ? String(req.body.waitingTimeCharge) : (req.body.waitingTimeCharge || '0'),
      totalPrice: typeof totalPrice === 'number' ? String(totalPrice) : totalPrice,
    };
    
    const data = insertJobSchema.parse(preprocessedBody);
    const job = await storage.createJob(data);
    
    stableJobNumberCache.set(String(job.id), jobNumber);
    
    // Persist job_number to Supabase immediately (not in Drizzle schema, so must be done explicitly)
    persistJobNumber(String(job.id), jobNumber);
    
    // Auto-geocode addresses for live map display
    const geocodeUpdates: any = {};
    if (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude)) {
      const pickupResult = await geocodeAddress(job.pickupAddress);
      if (pickupResult) {
        geocodeUpdates.pickupLatitude = pickupResult.lat;
        geocodeUpdates.pickupLongitude = pickupResult.lng;
        console.log(`[Geocoding] Job ${job.id} pickup: ${pickupResult.lat}, ${pickupResult.lng}`);
      }
    }
    if (job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude)) {
      const deliveryResult = await geocodeAddress(job.deliveryAddress);
      if (deliveryResult) {
        geocodeUpdates.deliveryLatitude = deliveryResult.lat;
        geocodeUpdates.deliveryLongitude = deliveryResult.lng;
        console.log(`[Geocoding] Job ${job.id} delivery: ${deliveryResult.lat}, ${deliveryResult.lng}`);
      }
    }
    // Update job with coordinates if geocoding succeeded
    let finalJob = job;
    if (Object.keys(geocodeUpdates).length > 0) {
      const updatedJob = await storage.updateJob(job.id, geocodeUpdates);
      if (updatedJob) {
        finalJob = updatedJob;
      }
    }
    
    // Storage is already Supabase — job was created by storage.createJob above.
    // We only need to UPDATE the existing job with additional fields like geocoded
    // coordinates and the resolved Supabase driver ID for RLS compatibility.
    console.log('[Jobs] Updating job in Supabase with additional fields...');
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        const supabaseUpdateData: any = {
          updated_at: new Date().toISOString(),
        };
        
        // Set the Supabase auth.uid driver_id for RLS compatibility
        if (supabaseDriverId) {
          supabaseUpdateData.driver_id = supabaseDriverId;
          supabaseUpdateData.status = finalJob.status || 'pending';
        }
        
        // Add geocoded coordinates
        if (geocodeUpdates.pickupLatitude) supabaseUpdateData.pickup_latitude = geocodeUpdates.pickupLatitude;
        if (geocodeUpdates.pickupLongitude) supabaseUpdateData.pickup_longitude = geocodeUpdates.pickupLongitude;
        if (geocodeUpdates.deliveryLatitude) supabaseUpdateData.delivery_latitude = geocodeUpdates.deliveryLatitude;
        if (geocodeUpdates.deliveryLongitude) supabaseUpdateData.delivery_longitude = geocodeUpdates.deliveryLongitude;
        
        // Ensure dropoff_address is set (some schemas require it)
        supabaseUpdateData.dropoff_address = finalJob.deliveryAddress || 'Not specified';
        
        // Ensure job_number is set
        supabaseUpdateData.job_number = jobNumber;

        // Tag office_city and created_by using flags already set by auth middleware (no extra network calls)
        {
          const adminUser = (req as any).adminUser;
          const isSupervisor = (req as any).isSupervisor === true;
          let metaOfficeCity: string | null = null;
          let metaCreatedBy: string | null = null;

          if (isSupervisor && adminUser?.email) {
            // Supervisor path — look up their city and name from supervisors table
            try {
              metaOfficeCity = await getSupervisorCityByEmail(adminUser.email);
              let supName = adminUser.fullName || adminUser.email;
              try {
                const supRow = await getPgPool().query(
                  'SELECT full_name FROM supervisors WHERE email = $1 LIMIT 1',
                  [adminUser.email.toLowerCase()]
                );
                supName = supRow.rows[0]?.full_name || supName;
              } catch {}
              metaCreatedBy = `Supervisor: ${supName}`;
            } catch (err: any) {
              console.warn('[Jobs] Could not fetch supervisor city/name:', err.message);
              metaCreatedBy = `Supervisor: ${adminUser.fullName || adminUser.email}`;
            }
          } else if (adminUser?.email) {
            // Admin path — no city, just record who created it
            metaCreatedBy = `Admin: ${adminUser.fullName || adminUser.email}`;
          }

          if (metaCreatedBy) {
            try {
              await upsertJobMetadata(finalJob.id.toString(), metaOfficeCity, metaCreatedBy);
              console.log(`[Jobs] Tagged job ${finalJob.id} createdBy="${metaCreatedBy}" officeCity="${metaOfficeCity}"`);
            } catch (err: any) {
              console.warn('[Jobs] Failed to write job metadata to PGHOST:', err.message);
            }
            // Also write to Supabase (safe — ignored silently if columns don't exist yet)
            try {
              const supaMeta: Record<string, string> = {};
              if (metaOfficeCity) supaMeta.office_city = metaOfficeCity;
              if (metaCreatedBy) supaMeta.created_by = metaCreatedBy;
              if (Object.keys(supaMeta).length > 0) {
                await supabaseAdmin.from('jobs').update(supaMeta).eq('id', finalJob.id.toString());
              }
            } catch {}
          }
        }
        
        const { error: updateError } = await supabaseAdmin
          .from('jobs')
          .update(supabaseUpdateData)
          .eq('tracking_number', finalJob.trackingNumber);
        
        if (updateError) {
          console.error('[Jobs] Failed to update job in Supabase:', updateError);
        } else {
          console.log(`[Jobs] Job ${finalJob.trackingNumber} updated in Supabase with geocode + driver_id`);
        }
        
        // Save multi-drop stops to Supabase if present (independent of job sync)
        // IMPORTANT: Use LOCAL finalJob.id so frontend can query by local ID
        const multiDropStops = req.body.multiDropStops;
        if (finalJob.isMultiDrop && multiDropStops && Array.isArray(multiDropStops) && multiDropStops.length > 0) {
          console.log(`[Jobs] Saving ${multiDropStops.length} multi-drop stops for local job ${finalJob.id}`);
          const stopsToInsert = [];
          for (let i = 0; i < multiDropStops.length; i++) {
            const stop = multiDropStops[i];
            const stopAddress = stop.address || stop.fullAddress || '';
            const stopPostcode = stop.postcode || '';
            
            let stopLat: string | null = null;
            let stopLng: string | null = null;
            const geocodeTarget = stopAddress || stopPostcode;
            if (geocodeTarget) {
              try {
                const geo = await geocodeAddress(geocodeTarget);
                if (geo) {
                  stopLat = String(geo.lat);
                  stopLng = String(geo.lng);
                  console.log(`[Jobs] Geocoded stop ${i + 1} (${stopPostcode}): ${stopLat}, ${stopLng}`);
                }
              } catch (geoErr) {
                console.error(`[Jobs] Failed to geocode stop ${i + 1}:`, geoErr);
              }
            }
            
            stopsToInsert.push({
              job_id: String(finalJob.id),
              stop_order: stop.stopOrder || i + 1,
              address: stopAddress,
              postcode: stopPostcode,
              recipient_name: stop.recipientName || null,
              recipient_phone: stop.recipientPhone || null,
              instructions: stop.instructions || null,
              latitude: stopLat,
              longitude: stopLng,
              status: 'pending',
            });
          }
          
          const { error: stopsError } = await supabaseAdmin
            .from('multi_drop_stops')
            .insert(stopsToInsert);
          
          if (stopsError) {
            console.error('[Jobs] Failed to save multi-drop stops:', stopsError);
          } else {
            console.log(`[Jobs] Successfully saved ${stopsToInsert.length} multi-drop stops (with geocoded coordinates)`);
          }
        }
      } else {
        console.error('[Jobs] supabaseAdmin is null - cannot sync to Supabase! Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      }
    } catch (syncErr) {
      console.error('[Jobs] Error syncing job to Supabase:', syncErr);
    }
    
    // Broadcast job created event for real-time updates
    broadcastJobCreated({
      id: job.id,
      trackingNumber: job.trackingNumber,
      status: job.status,
      customerId: job.customerId,
      createdAt: job.createdAt,
    });
    // If job is created with a driver already assigned, do full assignment flow
    if (supabaseDriverId && finalJob.driverId) {
      // 1. Re-fetch the job so we have fresh geocoded coordinates
      const freshCreatedJob = await storage.getJob(finalJob.id) || finalJob;

      // 2. Create a job_assignment record so the driver app can see the job
      try {
        const existingAssignments = await storage.getJobAssignments({ jobId: finalJob.id, driverId: supabaseDriverId });
        if (!existingAssignments || existingAssignments.length === 0) {
          // Resolve who is creating this assignment — prefer explicit dispatcherId,
          // fall back to the authenticated user's sub from the JWT token
          let dispatcherId = req.body.dispatcherId || null;
          if (!dispatcherId) {
            const authHeader = req.headers.authorization;
            const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
            if (token) {
              const payload = decodeJwtPayload(token);
              dispatcherId = payload?.sub || null;
            }
          }
          await storage.createJobAssignment({
            jobId: finalJob.id,
            driverId: supabaseDriverId,
            assignedBy: dispatcherId,
            driverPrice: finalJob.driverPrice || '0',
            status: 'sent',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          });
          console.log(`[Jobs] Created job_assignment for new job ${finalJob.id} → driver ${supabaseDriverId}`);
        }
      } catch (assignErr) {
        console.error('[Jobs] Failed to create job_assignment on job creation:', assignErr);
      }

      // 3. Broadcast WebSocket event using the correct Supabase driver ID
      broadcastJobAssigned({
        id: freshCreatedJob.id,
        trackingNumber: freshCreatedJob.trackingNumber,
        jobNumber: (freshCreatedJob as any).jobNumber,
        status: freshCreatedJob.status,
        driverId: supabaseDriverId,
        pickupAddress: freshCreatedJob.pickupAddress,
        pickupPostcode: freshCreatedJob.pickupPostcode,
        pickupLatitude: freshCreatedJob.pickupLatitude,
        pickupLongitude: freshCreatedJob.pickupLongitude,
        deliveryAddress: freshCreatedJob.deliveryAddress,
        deliveryPostcode: freshCreatedJob.deliveryPostcode,
        deliveryLatitude: freshCreatedJob.deliveryLatitude,
        deliveryLongitude: freshCreatedJob.deliveryLongitude,
        vehicleType: freshCreatedJob.vehicleType,
        driverPrice: freshCreatedJob.driverPrice,
      });

      // 4. Send push notification to driver's mobile device
      (async () => {
        let multiDropStops: any[] | undefined;
        if (freshCreatedJob.isMultiDrop) {
          try {
            const { supabaseAdmin: mdClient } = await import('./supabaseAdmin');
            if (mdClient) {
              const { data: stops } = await mdClient
                .from('multi_drop_stops')
                .select('stop_order, address, postcode, recipient_name, recipient_phone, instructions, latitude, longitude')
                .eq('job_id', freshCreatedJob.id)
                .order('stop_order', { ascending: true });
              if (stops && stops.length > 0) {
                multiDropStops = stops.map(s => ({
                  stopOrder: s.stop_order,
                  address: s.address,
                  postcode: s.postcode,
                  recipientName: s.recipient_name,
                  recipientPhone: s.recipient_phone,
                  instructions: s.instructions,
                  latitude: s.latitude,
                  longitude: s.longitude,
                }));
              }
            }
          } catch (err: any) {
            console.error('[Jobs] Failed to fetch multi-drop stops for push on creation:', err.message);
          }
        }
        const result = await sendJobOfferNotification(supabaseDriverId!, {
          jobId: freshCreatedJob.id,
          trackingNumber: freshCreatedJob.trackingNumber,
          jobNumber: freshCreatedJob.jobNumber,
          pickupAddress: freshCreatedJob.pickupAddress,
          pickupPostcode: freshCreatedJob.pickupPostcode,
          pickupLatitude: freshCreatedJob.pickupLatitude,
          pickupLongitude: freshCreatedJob.pickupLongitude,
          deliveryAddress: freshCreatedJob.deliveryAddress,
          deliveryPostcode: freshCreatedJob.deliveryPostcode,
          deliveryLatitude: freshCreatedJob.deliveryLatitude,
          deliveryLongitude: freshCreatedJob.deliveryLongitude,
          recipientName: freshCreatedJob.recipientName ?? undefined,
          recipientPhone: freshCreatedJob.recipientPhone ?? undefined,
          distance: freshCreatedJob.distance,
          driverPrice: freshCreatedJob.driverPrice || '0',
          vehicleType: freshCreatedJob.vehicleType,
          isMultiDrop: freshCreatedJob.isMultiDrop || false,
          multiDropStops,
        });
        if (result.success) {
          console.log(`[Jobs] Push notification sent to ${result.sentCount} device(s) for driver ${supabaseDriverId} on job creation`);
        } else {
          console.log(`[Jobs] Push notification failed for driver ${supabaseDriverId} on job creation`);
        }
      })().catch(err => console.error('[Jobs] Failed to send push notification on job creation:', err));

      console.log(`[Jobs] New job ${finalJob.id} created and fully assigned to driver ${supabaseDriverId}`);
    }
    // Send admin notification - include multiDropStops from request for email details
    const customerEmail = req.body.customerEmail || (job as any).customerEmail;
    const jobWithStops = {
      ...job,
      jobNumber,
      customerEmail,
      multiDropStops: req.body.multiDropStops || null,
      returnToSameLocation: req.body.returnToSameLocation ?? true,
      returnAddress: req.body.returnAddress || null,
      returnPostcode: req.body.returnPostcode || null,
    };
    console.log(`[Email] Sending admin new booking notification for job #${jobNumber} (${job.trackingNumber})`);
    await sendNewJobNotification(job.id, jobWithStops).catch(err => console.error('[Email] Failed to send admin job notification:', err));
    // Send customer confirmation if email available
    if (customerEmail) {
      console.log(`[Email] Sending customer booking confirmation to ${customerEmail} for job #${jobNumber} (${job.trackingNumber})`);
      await sendCustomerBookingConfirmation(customerEmail, { ...finalJob, jobNumber, customerEmail }).catch(err => console.error('[Email] Failed to send customer confirmation:', err));
    } else {
      console.log(`[Email] No customer email available for job ${job.trackingNumber} - skipping customer confirmation`);
    }
    // Notify admin numbers of new booking via SMS
    console.log(`[Admin SMS] Sending admin new booking alert for job #${jobNumber} (${job.trackingNumber})`);
    sendAdminNewBookingAlert({
      jobNumber: String(jobNumber),
      trackingNumber: job.trackingNumber,
      pickupAddress: (job as any).pickupAddress || (job as any).pickupPostcode || '',
      vehicleType: (job as any).vehicleType,
      price: (job as any).totalPrice,
    }).catch(err => console.error('[Admin SMS] Admin-created booking alert failed:', err));
    res.status(201).json(finalJob);
  }));

  app.patch("/api/jobs/:id", asyncHandler(async (req, res) => {
    console.log(`[Jobs PATCH] Updating job ${req.params.id}`, JSON.stringify(req.body, null, 2));
    const previousJob = await storage.getJob(req.params.id);
    const { multiDropStops, ...updateData } = req.body;
    console.log(`[Jobs PATCH] multiDropStops received:`, multiDropStops);
    const job = await storage.updateJob(req.params.id, updateData);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Handle multi-drop stops update when stops are provided
    if (supabaseAdmin && (multiDropStops !== undefined || updateData.isMultiDrop !== undefined)) {
      const jobId = String(job.id);
      
      const isMultiDropEnabled = updateData.isMultiDrop !== undefined ? updateData.isMultiDrop : job.isMultiDrop;
      if (isMultiDropEnabled && multiDropStops && Array.isArray(multiDropStops) && multiDropStops.length > 0) {
        // Fetch existing stops to preserve IDs, POD data, and status
        const { data: existingStops } = await supabaseAdmin
          .from('multi_drop_stops')
          .select('*')
          .eq('job_id', jobId)
          .order('stop_order', { ascending: true });
        
        const existingMap = new Map<number, any>();
        for (const s of (existingStops || [])) {
          existingMap.set(s.stop_order, s);
        }
        
        console.log(`[Jobs] Updating ${multiDropStops.length} multi-drop stops for job ${jobId} (existing: ${existingStops?.length || 0})`);
        
        const stopsToUpdate: any[] = [];
        const stopsToInsert: any[] = [];
        const usedExistingIds = new Set<string>();
        
        for (let index = 0; index < multiDropStops.length; index++) {
          const stop = multiDropStops[index];
          const stopOrder = index + 1;
          const existing = existingMap.get(stopOrder);
          
          // Geocode the stop if address/postcode changed or coordinates missing
          let stopLat = existing?.latitude || null;
          let stopLng = existing?.longitude || null;
          const addressChanged = existing ? (stop.address !== existing.address || stop.postcode !== existing.postcode) : true;
          if (addressChanged || !stopLat || !stopLng) {
            const geocodeTarget = stop.address || stop.postcode;
            if (geocodeTarget) {
              try {
                const geo = await geocodeAddress(geocodeTarget);
                if (geo) {
                  stopLat = String(geo.lat);
                  stopLng = String(geo.lng);
                }
              } catch (e) { /* non-critical */ }
            }
          }

          if (existing) {
            usedExistingIds.add(existing.id);
            stopsToUpdate.push({
              id: existing.id,
              address: stop.address || '',
              postcode: stop.postcode || '',
              stop_order: stopOrder,
              recipient_name: stop.recipientName || null,
              recipient_phone: stop.recipientPhone || null,
              instructions: stop.deliveryInstructions || null,
              latitude: stopLat,
              longitude: stopLng,
            });
          } else {
            stopsToInsert.push({
              job_id: String(jobId),
              address: stop.address || '',
              postcode: stop.postcode || '',
              stop_order: stopOrder,
              recipient_name: stop.recipientName || null,
              recipient_phone: stop.recipientPhone || null,
              instructions: stop.deliveryInstructions || null,
              latitude: stopLat,
              longitude: stopLng,
            });
          }
        }
        
        // Delete stops that are no longer needed (excess stops beyond new count)
        const stopsToDelete = (existingStops || []).filter(s => !usedExistingIds.has(s.id));
        if (stopsToDelete.length > 0) {
          const deleteIds = stopsToDelete.map(s => s.id);
          await supabaseAdmin
            .from('multi_drop_stops')
            .delete()
            .in('id', deleteIds);
          console.log(`[Jobs] Deleted ${stopsToDelete.length} excess stops`);
        }
        
        // Update existing stops (preserving their IDs, POD data, status)
        for (const stopData of stopsToUpdate) {
          const { id, ...updateFields } = stopData;
          await supabaseAdmin
            .from('multi_drop_stops')
            .update(updateFields)
            .eq('id', id);
        }
        if (stopsToUpdate.length > 0) {
          console.log(`[Jobs] Updated ${stopsToUpdate.length} existing stops (preserved POD/status)`);
        }
        
        // Insert new stops
        if (stopsToInsert.length > 0) {
          const { error: stopsError } = await supabaseAdmin
            .from('multi_drop_stops')
            .insert(stopsToInsert)
            .select();
          if (stopsError) {
            console.error('[Jobs] Failed to insert new stops:', stopsError);
          } else {
            console.log(`[Jobs] Inserted ${stopsToInsert.length} new stops`);
          }
        }
      } else if (!isMultiDropEnabled) {
        // Multi-drop disabled, remove all stops
        const { error: deleteError } = await supabaseAdmin
          .from('multi_drop_stops')
          .delete()
          .eq('job_id', jobId);
        if (deleteError) {
          console.error('[Jobs] Failed to delete stops:', deleteError);
        } else {
          console.log(`[Jobs] Deleted all stops for job ${jobId} (multi-drop disabled)`);
        }
      }
    }
    
    // Broadcast job update if status changed
    if (previousJob && previousJob.status !== job.status) {
      broadcastJobUpdate({
        id: job.id,
        trackingNumber: job.trackingNumber,
        status: job.status,
        previousStatus: previousJob.status,
        customerId: job.customerId,
        driverId: job.driverId,
        updatedAt: job.updatedAt,
      });
    }
    res.json(ensureJobNumber(job));
  }));

  // Canonical forward-only status order for driver tracking progression.
  // Any update that would move status BACKWARD is rejected; identical status
  // updates are treated as no-ops (idempotent) to prevent duplicates.
  const JOB_STATUS_ORDER: string[] = [
    'pending',
    'assigned',
    'offered',
    'accepted',
    'on_the_way_pickup',
    'arrived_pickup',
    'collected',
    'on_the_way_delivery',
    'delivered',
  ];

  app.patch("/api/jobs/:id/status", asyncHandler(async (req, res) => {
    const { status, rejectionReason, cancellationReason, podPhotoUrl, podSignatureUrl, podRecipientName, podNotes } = req.body;
    const previousJob = await storage.getJob(req.params.id);
    
    if (!previousJob) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Monotonic status progression — statuses must only move forward.
    // Cancellation is always allowed. Same-status updates are idempotent.
    if (status !== 'cancelled' && status !== 'failed') {
      const prevIdx = JOB_STATUS_ORDER.indexOf(previousJob.status);
      const nextIdx = JOB_STATUS_ORDER.indexOf(status);
      if (prevIdx !== -1 && nextIdx !== -1) {
        if (nextIdx < prevIdx) {
          console.warn(`[Status] Rejected backward progression: ${previousJob.status} → ${status} for job ${req.params.id}`);
          return res.status(400).json({
            error: `Cannot move job status backward from '${previousJob.status}' to '${status}'`,
            code: 'STATUS_REGRESSION',
            currentStatus: previousJob.status,
          });
        }
        if (nextIdx === prevIdx) {
          // Idempotent — same status, return current job without re-processing
          console.log(`[Status] Duplicate status update ignored: ${status} for job ${req.params.id}`);
          return res.json(ensureJobNumber(previousJob));
        }
      }
    }

    // If POD data is included with the status update (mobile app sends them together),
    // save it now so the POD-required check below can see the new data.
    if (status === "delivered" && (podPhotoUrl || podSignatureUrl || podRecipientName || podNotes)) {
      await storage.updateJobPOD(
        req.params.id,
        podPhotoUrl || undefined,
        podSignatureUrl || undefined,
        podRecipientName || undefined,
        undefined,
        podNotes || undefined
      );
      console.log(`[Status] Saved POD data with status update for job ${req.params.id}: photo=${!!podPhotoUrl} sig=${!!podSignatureUrl} recipient=${!!podRecipientName}`);
    }
    
    // Require POD (photo or signature) before marking as delivered
    // For multi-drop jobs, POD is collected per stop, so skip this check
    if (status === "delivered" && !previousJob.isMultiDrop) {
      const hasExistingPod = previousJob.podPhotoUrl || previousJob.podSignatureUrl;
      const hasIncomingPod = podPhotoUrl || podSignatureUrl;
      if (!hasExistingPod && !hasIncomingPod) {
        return res.status(400).json({ 
          error: "Proof of Delivery (photo or signature) is required before marking as delivered. POD must be submitted from the mobile app.",
          code: "POD_REQUIRED"
        });
      }
    }
    
    // If cancelling, update the job with the cancellation reason
    if (status === "cancelled" && cancellationReason) {
      await storage.updateJob(req.params.id, { cancellationReason } as any);
    }
    
    const job = await storage.updateJobStatus(req.params.id, status, rejectionReason);
    if (!job) {
      return res.status(404).json({ error: "Failed to update job status" });
    }
    
    // Send cancellation email to customer if status is cancelled
    if (status === "cancelled") {
      try {
        // Get customer email
        let customerEmail = (job as any).customerEmail as string | undefined;
        if (!customerEmail && job.customerId) {
          const customer = await storage.getUser(job.customerId);
          customerEmail = customer?.email;
        }
        
        if (customerEmail) {
          await sendJobCancellationEmail(customerEmail, {
            customerName: (job as any).customerName || job.pickupContactName,
            trackingNumber: job.trackingNumber || job.id,
            pickupPostcode: job.pickupPostcode,
            deliveryPostcode: job.deliveryPostcode,
            cancellationReason: cancellationReason,
            totalPrice: job.totalPrice ? `£${Number(job.totalPrice).toFixed(2)}` : undefined,
          });
          console.log(`[Job Cancellation] Sent cancellation email to ${customerEmail} for job ${job.trackingNumber}`);
        } else {
          console.log(`[Job Cancellation] No customer email found for job ${job.trackingNumber}`);
        }
      } catch (emailError) {
        console.error(`[Job Cancellation] Failed to send cancellation email:`, emailError);
      }
    }
    
    if (status === "delivered") {
      try {
        let customerEmail = (job as any).customerEmail;
        if (!customerEmail && job.customerId) {
          const customer = await storage.getUser(job.customerId);
          customerEmail = customer?.email;
        }
        if (!customerEmail && supabaseAdmin) {
          const { data: sJob } = await supabaseAdmin
            .from('jobs')
            .select('customer_email')
            .eq('id', job.id)
            .single();
          if (sJob?.customer_email) customerEmail = sJob.customer_email;
        }

        if (customerEmail) {
          let podPhotoUrl = job.podPhotoUrl || null;
          let podPhotos: string[] = (job as any).podPhotos || [];
          let podSignatureUrl = job.podSignatureUrl || null;

          if (supabaseAdmin) {
            const resolveUrl = async (p: string): Promise<string> => {
              if (p.startsWith('http')) return p;
              const { data } = supabaseAdmin!.storage.from('pod-images').getPublicUrl(p);
              return data?.publicUrl || p;
            };
            if (podPhotoUrl) podPhotoUrl = await resolveUrl(podPhotoUrl);
            if (podPhotos.length > 0) podPhotos = await Promise.all(podPhotos.map(p => resolveUrl(p)));
            if (podSignatureUrl) podSignatureUrl = await resolveUrl(podSignatureUrl);
          }

          const numberedJob = ensureJobNumber(job);
          await sendDeliveryConfirmationEmail(customerEmail, {
            trackingNumber: job.trackingNumber,
            jobNumber: numberedJob.jobNumber,
            pickupAddress: job.pickupAddress,
            pickupPostcode: job.pickupPostcode,
            deliveryAddress: job.deliveryAddress,
            deliveryPostcode: job.deliveryPostcode,
            recipientName: job.recipientName,
            podRecipientName: (job as any).podRecipientName,
            podPhotoUrl,
            podPhotos,
            podSignatureUrl,
            deliveredAt: (job as any).deliveredAt?.toISOString() || new Date().toISOString(),
          });
          console.log(`[Delivery Email] Sent to ${customerEmail} for job ${job.trackingNumber}`);
        }
      } catch (emailError) {
        console.error(`[Delivery Email] Failed:`, emailError);
      }
    }

    // Broadcast job status update for real-time updates
    broadcastJobUpdate({
      id: job.id,
      trackingNumber: job.trackingNumber,
      status: job.status,
      previousStatus: previousJob?.status,
      customerId: job.customerId,
      driverId: job.driverId,
      updatedAt: job.updatedAt,
    });
    res.json(ensureJobNumber(job));
  }));

  // Update driver payment status
  app.patch("/api/jobs/:id/driver-payment", asyncHandler(async (req, res) => {
    const { driverPaymentStatus } = req.body;
    const job = await storage.getJob(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (!['unpaid', 'paid'].includes(driverPaymentStatus)) {
      return res.status(400).json({ error: "Invalid payment status. Must be 'unpaid' or 'paid'" });
    }
    
    const updates: any = {
      driverPaymentStatus,
    };
    
    // Set paid timestamp when marking as paid
    if (driverPaymentStatus === 'paid') {
      updates.driverPaidAt = new Date();
    } else {
      updates.driverPaidAt = null;
    }
    
    const updatedJob = await storage.updateJob(req.params.id, updates);
    console.log(`[Jobs] Driver payment status updated for job ${req.params.id}: ${driverPaymentStatus}`);
    res.json(ensureJobNumber(updatedJob));
  }));

  // Update driver price for a job (admin/supervisor only) — updates jobs + active assignment + sends push notification
  app.patch("/api/jobs/:id/driver-price", requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    const { driverPrice } = req.body;

    if (driverPrice === undefined || driverPrice === null || driverPrice === '') {
      return res.status(400).json({ error: "driverPrice is required" });
    }

    const requestedPrice = parseFloat(String(driverPrice));
    if (isNaN(requestedPrice) || requestedPrice < 0) {
      return res.status(400).json({ error: "Invalid driver price" });
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Enforce minimum based on vehicle type.
    // IMPORTANT: £0.00 (exactly zero) is a valid admin-assigned price — bypass minimum.
    const minPrice = getMinDriverPrice(job.vehicleType);
    const enforcedPrice = (requestedPrice === 0) ? 0 : Math.max(requestedPrice, minPrice);
    const finalPrice = enforcedPrice.toFixed(2);

    // 1. Update the job's driver_price
    const updatedJob = await storage.updateJob(jobId, { driverPrice: finalPrice });

    // 2. Update active job_assignments record
    try {
      const { supabaseAdmin: sa } = await import('./supabaseAdmin');
      if (sa) {
        await sa
          .from('job_assignments')
          .update({ driver_price: finalPrice })
          .eq('job_id', jobId)
          .eq('status', 'sent')
          .then();
        // Also update accepted assignments
        await sa
          .from('job_assignments')
          .update({ driver_price: finalPrice })
          .eq('job_id', jobId)
          .eq('status', 'accepted')
          .then();
      }
    } catch (err: any) {
      console.error('[DriverPrice] Failed to update job_assignments:', err.message);
    }

    // 3. Send push + in-app notification to driver only when:
    //    a) Job is already assigned to a driver
    //    b) A previous driver price existed (not first-time set)
    //    c) The new price is genuinely different from the previous price
    const previousPrice = job.driverPrice !== null && job.driverPrice !== undefined && job.driverPrice !== ''
      ? parseFloat(String(job.driverPrice))
      : null;
    // Do NOT notify if previousPrice is null — that means price is being set for the first time
    // (first assignment price is handled by the assignment notification, not here)
    const priceActuallyChanged = previousPrice !== null && Math.abs(previousPrice - enforcedPrice) > 0.001;

    if (job.driverId && priceActuallyChanged) {
      // Create in-app notification for the driver
      try {
        const numberedJob = ensureJobNumber(job);
        const jobRef = numberedJob.jobNumber || job.trackingNumber || jobId;
        await storage.createNotification({
          userId: job.driverId,
          title: "Job Price Updated",
          message: `Your pay for job #${jobRef} has been updated to £${parseFloat(finalPrice).toFixed(2)}`,
          type: "price_update",
          data: { jobId, newPrice: finalPrice },
        });
      } catch (err: any) {
        console.error('[DriverPrice] Failed to create in-app notification:', err.message);
      }

      // Send push notification
      (async () => {
        try {
          const result = await sendPriceUpdateNotification(job.driverId!, {
            jobId,
            trackingNumber: job.trackingNumber || '',
            jobNumber: (job as any).jobNumber,
            newPrice: finalPrice,
            pickupPostcode: job.pickupPostcode,
            deliveryPostcode: job.deliveryPostcode,
          });
          if (result.success) {
            console.log(`[DriverPrice] Push notification sent to driver ${job.driverId} — new price £${finalPrice} (was £${previousPrice})`);
          } else {
            console.log(`[DriverPrice] No push devices for driver ${job.driverId}`);
          }
        } catch (err: any) {
          console.error('[DriverPrice] Failed to send push notification:', err.message);
        }
      })();
    } else if (!priceActuallyChanged) {
      if (previousPrice === null) {
        console.log(`[DriverPrice] Skipping notification — price set for first time to £${finalPrice} (initial assignment price, not an update)`);
      } else {
        console.log(`[DriverPrice] Price unchanged at £${finalPrice} — skipping push notification`);
      }
    }

    // 4. Broadcast WebSocket update
    try {
      const { broadcastJobUpdate } = await import('./realtime');
      if (updatedJob) {
        broadcastJobUpdate({
          id: updatedJob.id,
          trackingNumber: updatedJob.trackingNumber || '',
          status: updatedJob.status,
          customerId: updatedJob.customerId || '',
          driverId: updatedJob.driverId,
          updatedAt: updatedJob.updatedAt,
        });
      }
    } catch (err: any) {
      console.error('[DriverPrice] WebSocket broadcast failed:', err.message);
    }

    console.log(`[DriverPrice] Job ${jobId} driver price updated: £${finalPrice} (requested £${requestedPrice}, min £${minPrice})`);
    res.json(ensureJobNumber(updatedJob));
  }));

  // Admin/supervisor notes for a job
  app.get("/api/jobs/:id/admin-notes", requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const pool = getPgPool();
    const result = await pool.query('SELECT notes FROM job_admin_notes WHERE job_id = $1', [req.params.id]);
    const adminNotes = result.rows[0]?.notes ?? null;
    res.json({ adminNotes });
  }));

  app.patch("/api/jobs/:id/admin-notes", requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { notes } = req.body;
    if (notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({ error: "Notes must be a string" });
    }
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO job_admin_notes (job_id, notes, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (job_id) DO UPDATE SET notes = $2, updated_at = NOW()`,
      [req.params.id, notes ?? null]
    );
    console.log(`[Jobs] Admin notes updated for job ${req.params.id}`);
    res.json({ success: true, adminNotes: notes ?? null });
  }));

  app.patch("/api/jobs/:id/payment-status", asyncHandler(async (req, res) => {
    const { paymentStatus } = req.body;
    const job = await storage.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!['pending', 'paid', 'awaiting_payment', 'failed'].includes(paymentStatus)) {
      return res.status(400).json({ error: "Invalid payment status" });
    }
    const updatedJob = await storage.updateJob(req.params.id, { paymentStatus });
    console.log(`[Jobs] Payment status manually updated for job ${req.params.id}: ${paymentStatus}`);
    res.json(ensureJobNumber(updatedJob));
  }));

  app.post("/api/jobs/:id/geocode", asyncHandler(async (req, res) => {
    const job = await storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const updates: any = {};
    
    if (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude)) {
      const pickupResult = await geocodeAddress(job.pickupAddress);
      if (pickupResult) {
        updates.pickupLatitude = pickupResult.lat;
        updates.pickupLongitude = pickupResult.lng;
        console.log(`[Geocoding] Job ${job.id} pickup: ${pickupResult.lat}, ${pickupResult.lng}`);
      }
    }
    
    if (job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude)) {
      const deliveryResult = await geocodeAddress(job.deliveryAddress);
      if (deliveryResult) {
        updates.deliveryLatitude = deliveryResult.lat;
        updates.deliveryLongitude = deliveryResult.lng;
        console.log(`[Geocoding] Job ${job.id} delivery: ${deliveryResult.lat}, ${deliveryResult.lng}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      const updatedJob = await storage.updateJob(req.params.id, updates);
      res.json({ success: true, job: ensureJobNumber(updatedJob), geocoded: updates });
    } else {
      res.json({ success: true, job: ensureJobNumber(job), message: "No geocoding needed or addresses missing" });
    }
  }));

  // Bulk geocode all jobs with missing coordinates
  app.post("/api/jobs/geocode-all", asyncHandler(async (req, res) => {
    const allJobs = await storage.getJobs();
    const jobsToGeocode = allJobs.filter(job => 
      (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude)) ||
      (job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude))
    );
    
    console.log(`[Geocoding] Starting bulk geocode for ${jobsToGeocode.length} jobs`);
    
    const results = { success: 0, failed: 0, skipped: 0 };
    
    for (const job of jobsToGeocode) {
      const updates: any = {};
      
      if (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude)) {
        const pickupResult = await geocodeAddress(job.pickupAddress);
        if (pickupResult) {
          updates.pickupLatitude = pickupResult.lat;
          updates.pickupLongitude = pickupResult.lng;
        }
      }
      
      if (job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude)) {
        const deliveryResult = await geocodeAddress(job.deliveryAddress);
        if (deliveryResult) {
          updates.deliveryLatitude = deliveryResult.lat;
          updates.deliveryLongitude = deliveryResult.lng;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await storage.updateJob(job.id, updates);
        results.success++;
        console.log(`[Geocoding] Job ${job.id} geocoded successfully`);
      } else {
        results.failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    results.skipped = allJobs.length - jobsToGeocode.length;
    console.log(`[Geocoding] Bulk geocode complete: ${results.success} success, ${results.failed} failed, ${results.skipped} already had coordinates`);
    
    res.json({ 
      message: `Geocoded ${results.success} jobs`,
      ...results,
      totalJobs: allJobs.length
    });
  }));

  app.patch("/api/jobs/:id/assign", asyncHandler(async (req, res) => {
    const { driverId, dispatcherId, driverPrice } = req.body;
    
    // Validate driver is active before assignment
    // Support both auth.uid() format and driver code format (RC01A)
    let driver = null;
    let actualDriverId = driverId;
    if (driverId) {
      // First try to find by auth.uid (id column)
      driver = await storage.getDriver(driverId);
      
      // If not found, try to find by driver code (RC01A format)
      if (!driver) {
        driver = await storage.getDriverByDriverCode(driverId);
        if (driver) {
          // Use the actual Supabase id (auth.uid) for job assignment
          actualDriverId = driver.id;
          console.log(`[Jobs] Found driver by code ${driverId}, using id ${actualDriverId} for assignment`);
        }
      }
      
      if (!driver) {
        return res.status(404).json({ error: `Driver not found: ${driverId}` });
      }
      if (driver.isActive === false) {
        return res.status(400).json({ error: "Cannot assign jobs to deactivated drivers" });
      }
    }
    
    const previousJob = await storage.getJob(req.params.id);
    if (!previousJob) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // CRITICAL: driverPrice is REQUIRED - reject assignments without it
    // Drivers must ONLY see admin-set prices, never customer pricing
    if (driverPrice === undefined || driverPrice === null || driverPrice === '' || isNaN(parseFloat(String(driverPrice))) || parseFloat(String(driverPrice)) < 0) {
      return res.status(400).json({ 
        error: "Driver price is required. Please specify the amount the driver will be paid for this job." 
      });
    }
    // Enforce minimum driver price per vehicle type.
    // IMPORTANT: £0.00 (exactly zero) is a valid admin-assigned price — bypass minimum.
    const jobVehicleType = previousJob?.vehicleType || 'car';
    const minPrice = getMinDriverPrice(jobVehicleType);
    const requestedPrice = parseFloat(driverPrice);
    const enforcedPrice = (requestedPrice === 0) ? 0 : Math.max(requestedPrice, minPrice);
    if (enforcedPrice !== requestedPrice) {
      console.log(`[Jobs] Driver price £${requestedPrice} below minimum £${minPrice} for ${jobVehicleType} — raised to £${enforcedPrice}`);
    }
    const finalDriverPrice = String(enforcedPrice.toFixed(2));
    
    const job = await storage.assignDriver(req.params.id, actualDriverId, dispatcherId);
    if (!job) {
      return res.status(404).json({ error: "Failed to assign job" });
    }
    
    // CRITICAL: Update job with driver_price so driver sees correct amount
    // This must happen BEFORE driver fetches the job
    await storage.updateJob(req.params.id, { driverPrice: finalDriverPrice });
    console.log(`[Jobs] Updated job ${job.id} with driver_price: £${finalDriverPrice}`);

    // Tag office_city if assigned by a supervisor and job not already tagged
    try {
      const assignerEmail = await getSupervisorEmailFromReq(req);
      if (assignerEmail) {
        const supCity = await getSupervisorCityByEmail(assignerEmail);
        if (supCity && !previousJob?.officeCity) {
          await upsertJobMetadata(req.params.id, supCity, null);
          try {
            await supabaseAdmin.from('jobs').update({ office_city: supCity }).eq('id', req.params.id);
          } catch {}
          console.log(`[Jobs] Tagged job ${req.params.id} with office_city=${supCity} (assigned by supervisor ${assignerEmail})`);
        }
      }
    } catch (tagErr) {
      console.warn('[Jobs] Failed to tag office_city on assignment:', tagErr);
    }

    // Auto-geocode job coordinates if missing (for mobile app map preview)
    if (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude) ||
        job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude)) {
      try {
        const geoUpdates: any = {};
        if (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude)) {
          const pickupResult = await geocodeAddress(job.pickupAddress);
          if (pickupResult) {
            geoUpdates.pickupLatitude = pickupResult.lat;
            geoUpdates.pickupLongitude = pickupResult.lng;
            console.log(`[Jobs] Geocoded pickup for job ${job.id}: ${pickupResult.lat}, ${pickupResult.lng}`);
          }
        }
        if (job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude)) {
          const deliveryResult = await geocodeAddress(job.deliveryAddress);
          if (deliveryResult) {
            geoUpdates.deliveryLatitude = deliveryResult.lat;
            geoUpdates.deliveryLongitude = deliveryResult.lng;
            console.log(`[Jobs] Geocoded delivery for job ${job.id}: ${deliveryResult.lat}, ${deliveryResult.lng}`);
          }
        }
        if (Object.keys(geoUpdates).length > 0) {
          await storage.updateJob(req.params.id, geoUpdates);
        }
      } catch (geoErr) {
        console.error(`[Jobs] Geocoding failed for job ${job.id}:`, geoErr);
        // Continue anyway - map preview will be unavailable but job still works
      }
    }
    
    // NOTE: Job assignment record is already created by storage.assignDriver() with status 'offered'
    // We need to update it to 'sent' status and ensure driver_price is set correctly
    if (driverId && driver) {
      try {
        // Find the assignment created by assignDriver() and update it with correct price/status
        const assignments = await storage.getJobAssignments({ jobId: req.params.id, driverId: driver.id });
        const activeAssignment = assignments.find(a => ['offered', 'pending'].includes(a.status));
        
        if (activeAssignment) {
          await storage.updateJobAssignment(activeAssignment.id, {
            status: 'sent' as any,
            driverPrice: finalDriverPrice,
            sentAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          });
          console.log(`[Jobs] Updated job assignment ${activeAssignment.id} for driver ${driver.driverCode || driver.id} with status=sent and price £${finalDriverPrice}`);
        } else {
          // No existing assignment found - create one (fallback)
          // assigned_by must be a UUID or null - use dispatcherId if provided, otherwise null
          const assignment = await storage.createJobAssignment({
            jobId: job.id,
            driverId: driver.id,
            assignedBy: dispatcherId || null,
            driverPrice: finalDriverPrice,
            status: "sent",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          });
          console.log(`[Jobs] Created new job assignment ${assignment.id} for driver ${driver.driverCode || driver.id} with price £${finalDriverPrice}`);
        }
      } catch (err) {
        console.error(`[Jobs] Failed to update/create job assignment:`, err);
      }
    }
    
    // Re-fetch the job AFTER geocoding so we have updated coordinates
    const freshJob = await storage.getJob(req.params.id) || job;
    
    // Broadcast job assignment for real-time updates
    broadcastJobUpdate({
      id: freshJob.id,
      trackingNumber: freshJob.trackingNumber,
      status: freshJob.status,
      previousStatus: previousJob?.status,
      customerId: freshJob.customerId,
      driverId: freshJob.driverId,
      updatedAt: freshJob.updatedAt,
    });
    // Send specific notification to the assigned driver with full coordinates for map
    if (freshJob.driverId) {
      broadcastJobAssigned({
        id: freshJob.id,
        trackingNumber: freshJob.trackingNumber,
        jobNumber: freshJob.jobNumber,
        status: freshJob.status,
        driverId: freshJob.driverId,
        pickupAddress: freshJob.pickupAddress,
        pickupPostcode: freshJob.pickupPostcode,
        pickupLatitude: freshJob.pickupLatitude,
        pickupLongitude: freshJob.pickupLongitude,
        deliveryAddress: freshJob.deliveryAddress,
        deliveryPostcode: freshJob.deliveryPostcode,
        deliveryLatitude: freshJob.deliveryLatitude,
        deliveryLongitude: freshJob.deliveryLongitude,
        recipientName: freshJob.recipientName,
        recipientPhone: freshJob.recipientPhone,
        distance: freshJob.distance,
        vehicleType: freshJob.vehicleType,
        driverPrice: finalDriverPrice,
      });
      console.log(`[Jobs] Job ${freshJob.id} assigned to driver ${freshJob.driverId} with driver_price £${finalDriverPrice}, coordinates: pickup(${freshJob.pickupLatitude},${freshJob.pickupLongitude}) delivery(${freshJob.deliveryLatitude},${freshJob.deliveryLongitude})`);
      
      // Send push notification to driver's mobile device with coordinates for map
      (async () => {
        let multiDropStops: any[] | undefined;
        if (freshJob.isMultiDrop) {
          try {
            const { supabaseAdmin: mdClient } = await import('./supabaseAdmin');
            if (mdClient) {
              const { data: stops } = await mdClient
                .from('multi_drop_stops')
                .select('stop_order, address, postcode, recipient_name, recipient_phone, instructions, latitude, longitude')
                .eq('job_id', freshJob.id)
                .order('stop_order', { ascending: true });
              if (stops && stops.length > 0) {
                multiDropStops = stops.map(s => ({
                  stopOrder: s.stop_order,
                  address: s.address,
                  postcode: s.postcode,
                  recipientName: s.recipient_name,
                  recipientPhone: s.recipient_phone,
                  instructions: s.instructions,
                  latitude: s.latitude,
                  longitude: s.longitude,
                }));
              }
            }
          } catch (err: any) {
            console.error('[Jobs] Failed to fetch multi-drop stops for push:', err.message);
          }
        }
        const result = await sendJobOfferNotification(freshJob.driverId, {
          jobId: freshJob.id,
          trackingNumber: freshJob.trackingNumber,
          jobNumber: freshJob.jobNumber,
          pickupAddress: freshJob.pickupAddress,
          pickupPostcode: freshJob.pickupPostcode,
          pickupLatitude: freshJob.pickupLatitude,
          pickupLongitude: freshJob.pickupLongitude,
          deliveryAddress: freshJob.deliveryAddress,
          deliveryPostcode: freshJob.deliveryPostcode,
          deliveryLatitude: freshJob.deliveryLatitude,
          deliveryLongitude: freshJob.deliveryLongitude,
          recipientName: freshJob.recipientName,
          recipientPhone: freshJob.recipientPhone,
          distance: freshJob.distance,
          driverPrice: finalDriverPrice,
          vehicleType: freshJob.vehicleType,
          isMultiDrop: freshJob.isMultiDrop || false,
          multiDropStops,
        });
        if (result.success) {
          console.log(`[Jobs] Push notification sent to ${result.sentCount} device(s) for driver ${freshJob.driverId}`);
        }
      })().catch(err => console.error('[Jobs] Failed to send push notification:', err));
    }
    
    // Return the updated job with correct driver price
    res.json(ensureJobNumber(freshJob));
  }));

  app.patch("/api/jobs/:id/pod", asyncHandler(async (req, res) => {
    const { podPhotoUrl, podSignatureUrl, podRecipientName, podNotes } = req.body;
    const job = await storage.updateJobPOD(req.params.id, podPhotoUrl, podSignatureUrl, podRecipientName, undefined, podNotes);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(ensureJobNumber(job));
  }));

  // Admin POD photo upload endpoint (supports multiple photos)
  app.post("/api/jobs/:id/pod/upload", (req, res, next) => {
    uploadPodImage.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const finalFilename = `pod_${timestamp}${ext}`;
    const BUCKET = 'pod-images';
    const storagePath = `pod/${jobId}/${finalFilename}`;
    const contentType = req.file.mimetype || 'image/jpeg';
    const fileBuffer = req.file.buffer;

    const { supabaseAdmin: supAdmin } = await import('./supabaseAdmin');
    if (!supAdmin) {
      return res.status(500).json({ error: "Storage service unavailable" });
    }

    let fileUrl = storagePath;
    let uploaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error: uploadError } = await supAdmin.storage
          .from(BUCKET)
          .upload(storagePath, fileBuffer, { contentType, upsert: true });
        
        if (!uploadError) {
          uploaded = true;
          console.log(`[POD Upload] Uploaded to Supabase Storage: ${BUCKET}/${storagePath}`);
          break;
        } else {
          console.warn(`[POD Upload] Supabase upload attempt ${attempt}/3 failed:`, uploadError.message);
        }
      } catch (err: any) {
        console.warn(`[POD Upload] Supabase upload attempt ${attempt}/3 error:`, err.message);
      }
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    if (!uploaded) {
      return res.status(500).json({ error: "Failed to upload POD photo to storage" });
    }
    
    const existingPhotos = Array.isArray(job.podPhotos) ? [...job.podPhotos] : [];
    existingPhotos.push(fileUrl);
    
    const updatedJob = await storage.updateJobPOD(
      jobId,
      fileUrl,
      job.podSignatureUrl || undefined,
      job.podRecipientName || undefined,
      existingPhotos
    );
    
    const { error: updateError } = await supAdmin
      .from('jobs')
      .update({
        pod_photo_url: fileUrl,
        pod_photos: existingPhotos,
      })
      .eq('id', jobId);
    
    if (updateError) {
      console.error('[POD Upload] Failed to sync POD to Supabase:', updateError);
    } else {
      console.log(`[POD Upload] POD photo uploaded for job ${jobId}: ${fileUrl} (${existingPhotos.length} total photos)`);
    }
    
    let resolvedPhotoUrl = fileUrl;
    const resolvedPhotos = [...existingPhotos];
    try {
      const signedResult = await supAdmin.storage.from(BUCKET).createSignedUrl(fileUrl, 3600);
      if (signedResult.data?.signedUrl) resolvedPhotoUrl = signedResult.data.signedUrl;

      for (let i = 0; i < resolvedPhotos.length; i++) {
        if (!resolvedPhotos[i].startsWith('http')) {
          const sr = await supAdmin.storage.from(BUCKET).createSignedUrl(resolvedPhotos[i], 3600);
          if (sr.data?.signedUrl) resolvedPhotos[i] = sr.data.signedUrl;
        }
      }
    } catch {}

    res.json({ 
      success: true, 
      podPhotoUrl: resolvedPhotoUrl,
      podPhotos: resolvedPhotos,
      job: updatedJob 
    });
  }));

  // Admin/Supervisor DELETE a POD photo from a job
  app.delete("/api/jobs/:id/pod/photo", requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    const { photoUrl } = req.body;
    
    if (!photoUrl || typeof photoUrl !== 'string') {
      return res.status(400).json({ error: "photoUrl is required" });
    }
    
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    const existingPhotos = Array.isArray(job.podPhotos) ? [...job.podPhotos] : [];
    const updatedPhotos = existingPhotos.filter(url => url !== photoUrl && !photoUrl.includes(url));
    
    const newPodPhotoUrl = updatedPhotos.length > 0 ? updatedPhotos[updatedPhotos.length - 1] : null;
    
    const updatedJob = await storage.updateJobPOD(
      jobId,
      newPodPhotoUrl,
      job.podSignatureUrl,
      job.podRecipientName,
      updatedPhotos
    );
    
    if (supabaseAdmin) {
      const { error: updateError } = await supabaseAdmin
        .from('jobs')
        .update({
          pod_photo_url: newPodPhotoUrl,
          pod_photos: updatedPhotos,
        })
        .eq('id', jobId);
      
      if (updateError) {
        console.error('[POD Delete] Failed to sync to Supabase:', updateError);
      } else {
        console.log(`[POD Delete] Removed photo from job ${jobId}, ${updatedPhotos.length} photos remaining`);
      }
    }
    
    let resolvedPodPhotoUrl = newPodPhotoUrl;
    const resolvedDeletePhotos = [...updatedPhotos];
    if (supabaseAdmin) {
      try {
        const POD_BUCKET = 'pod-images';
        if (resolvedPodPhotoUrl && !resolvedPodPhotoUrl.startsWith('http')) {
          const { data } = await supabaseAdmin.storage.from(POD_BUCKET).createSignedUrl(resolvedPodPhotoUrl, 3600);
          if (data?.signedUrl) resolvedPodPhotoUrl = data.signedUrl;
        }
        for (let i = 0; i < resolvedDeletePhotos.length; i++) {
          if (!resolvedDeletePhotos[i].startsWith('http')) {
            const sr = await supabaseAdmin.storage.from(POD_BUCKET).createSignedUrl(resolvedDeletePhotos[i], 3600);
            if (sr.data?.signedUrl) resolvedDeletePhotos[i] = sr.data.signedUrl;
          }
        }
      } catch {}
    }

    res.json({
      success: true,
      podPhotoUrl: resolvedPodPhotoUrl,
      podPhotos: resolvedDeletePhotos,
      job: updatedJob,
    });
  }));

  app.patch("/api/jobs/:id/decline", asyncHandler(async (req, res) => {
    const { rejectionReason } = req.body;
    const jobId = req.params.id;
    
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (job.status !== 'assigned') {
      return res.status(400).json({ error: "Can only decline jobs with 'assigned' status" });
    }
    
    // Reset job to pending so it can be reassigned
    const updatedJob = await storage.updateJob(jobId, { 
      status: "pending", 
      driverId: null,
      rejectionReason: rejectionReason || null,
    });
    
    console.log(`[Jobs] Driver declined job ${jobId}. Reason: ${rejectionReason || 'No reason provided'}`);
    
    // Send notification to admin about the decline
    const admins = await storage.getUsers({ role: 'admin' });
    for (const admin of admins) {
      await storage.createNotification({
        userId: admin.id,
        title: 'Job Declined by Driver',
        message: `Job ${job.trackingNumber} was declined by the driver.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
        type: 'job_declined',
        data: { jobId, rejectionReason },
      });
    }
    
    res.json(ensureJobNumber(updatedJob));
  }));

  // Customer removes a booking from their own history (soft-hide only, not a real delete)
  app.delete("/api/jobs/:id/remove-from-history", asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Authentication required" });

    if (!supabaseAdmin) return res.status(500).json({ error: "Auth service unavailable" });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser) return res.status(401).json({ error: "Invalid token" });

    // Fetch the job to verify ownership
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (String(job.customerId) !== String(authUser.id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Mark as hidden for this customer (soft delete from their view only)
    await supabaseAdmin.from('jobs').update({ customer_hidden: true }).eq('id', jobId);

    res.status(204).send();
  }));

  app.delete("/api/jobs/:id", asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    try {
      await storage.deleteJob(jobId);
    } catch (e: any) {
      // Supabase REST API may reject non-integer IDs for bigint columns.
      // Fall back to raw SQL with text cast which handles both integer and
      // legacy string-format job IDs.
      if (e.message && e.message.includes('invalid input syntax for type bigint')) {
        await getPgPool().query('DELETE FROM jobs WHERE id::text = $1', [jobId]);
      } else {
        throw e;
      }
    }
    res.status(204).send();
  }));

  // Toggle job visibility for driver mobile app (admin only)
  app.patch("/api/jobs/:id/driver-visibility", asyncHandler(async (req, res) => {
    const { hidden } = req.body;
    const jobId = req.params.id;
    
    if (typeof hidden !== 'boolean') {
      return res.status(400).json({ error: "hidden field must be a boolean" });
    }
    
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Update Supabase directly (source of truth for mobile app)
    // Note: driver_hidden_by removed since it expects UUID and we don't have admin user ID here
    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (supabaseAdmin) {
      const { error: supabaseError } = await supabaseAdmin
        .from('jobs')
        .update({
          driver_hidden: hidden,
          driver_hidden_at: hidden ? new Date().toISOString() : null,
        })
        .eq('id', jobId);
      
      if (supabaseError) {
        console.error(`[Jobs] Supabase update failed for job ${jobId}:`, supabaseError.message);
        return res.status(500).json({ error: "Failed to update job visibility" });
      } else {
        console.log(`[Jobs] Supabase updated: job ${jobId} driver_hidden=${hidden}`);
      }
    }
    
    console.log(`[Jobs] Job ${jobId} visibility for driver: ${hidden ? 'hidden' : 'visible'}`);
    
    const updatedJob = await storage.getJob(jobId);
    
    // Broadcast to driver's mobile app for instant removal/appearance
    if (job.driverId) {
      const { broadcastJobHidden } = await import("./realtime");
      broadcastJobHidden({
        id: jobId,
        trackingNumber: job.trackingNumber,
        driverId: job.driverId,
        hidden: hidden,
        hiddenAt: hidden ? new Date() : null,
      });
    }
    
    res.json(ensureJobNumber(updatedJob));
  }));

  app.get("/api/drivers", asyncHandler(async (req, res) => {
    const { isAvailable, isVerified, vehicleType, includeInactive } = req.query;
    
    // Build cache key from query params
    const cacheKey = `drivers:${isAvailable || 'all'}:${isVerified || 'all'}:${vehicleType || 'all'}:${includeInactive || 'false'}`;
    
    // Check cache first for faster response
    const cached = cache.get<any[]>(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const drivers = await storage.getDrivers({
      isAvailable: isAvailable === "true" ? true : isAvailable === "false" ? false : undefined,
      isVerified: isVerified === "true" ? true : isVerified === "false" ? false : undefined,
      vehicleType: vehicleType as VehicleType | undefined,
      includeInactive: includeInactive === "true",
    });
    
    // Geocode postcodes for drivers without GPS coordinates
    const postcodesToGeocode: string[] = [];
    for (const d of drivers) {
      if (d.postcode && !d.currentLatitude && !d.currentLongitude) {
        const key = d.postcode.trim().toUpperCase();
        if (!postcodeGeoCache.has(key)) {
          postcodesToGeocode.push(d.postcode);
        }
      }
    }
    if (postcodesToGeocode.length > 0) {
      try {
        await geocodePostcodesBulk(postcodesToGeocode);
      } catch (err: any) {
        console.error('[PostcodeGeo] Geocoding error:', err.message);
      }
    }
    
    // Enrich drivers with postcode-based coordinates
    const enrichedDrivers = drivers.map((d: any) => {
      if (d.postcode && !d.currentLatitude && !d.currentLongitude) {
        const cached = postcodeGeoCache.get(d.postcode.trim().toUpperCase());
        if (cached) {
          return { ...d, postcodeLatitude: String(cached.lat), postcodeLongitude: String(cached.lng) };
        }
      }
      return d;
    });
    
    // Cache for 2 seconds - fast enough for real-time feel while reducing DB load
    cache.set(cacheKey, enrichedDrivers, CACHE_TTL.DRIVERS_LIST);
    res.json(enrichedDrivers);
  }));

  app.get("/api/drivers/:id", asyncHandler(async (req, res) => {
    const driver = await storage.getDriver(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    res.json(driver);
  }));

  app.get("/api/drivers/user/:userId", asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    
    // Use Supabase storage as single source of truth for driver data
    // This ensures consistent mapping of online_status -> isAvailable
    let driver = await storage.getDriverByUserId(userId);
    if (!driver) {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      let fullName: string | null = null;
      let email: string | null = null;
      let phone: string | null = null;
      
      if (supabaseAdmin) {
        try {
          const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
          if (!error && user) {
            fullName = user.user_metadata?.fullName || user.user_metadata?.full_name || null;
            email = user.email || null;
            phone = user.user_metadata?.phone || null;
          }
        } catch (e) {
          console.error("Failed to fetch user metadata from Supabase:", e);
        }
      }
      
      const { supabaseAdmin: supabaseAdminForCode } = await import("./supabaseAdmin");
      let autoDriverCode: string | undefined;
      if (supabaseAdminForCode) {
        try { autoDriverCode = await generateUniqueDriverCode(supabaseAdminForCode); } catch {}
      }
      driver = await storage.createDriver({
        userId: userId,
        fullName,
        email,
        phone,
        vehicleType: "car",
        vehicleRegistration: null,
        vehicleMake: null,
        vehicleModel: null,
        vehicleColor: null,
        isAvailable: false,
        isVerified: false,
        currentLatitude: null,
        currentLongitude: null,
        rating: "5.00",
        totalJobs: 0,
        driverCode: autoDriverCode,
      });
      
      // Save new driver to PostgreSQL with permanent driverCode
      if (driver) {
        // Check if there's an approved application for this email - sync profile data
        let applicationData: any = null;
        if (email) {
          try {
            const appResult = await storage.getDriverApplicationByEmail(email);
            if (appResult && appResult.status === 'approved') {
              applicationData = appResult;
              const appUpdates: Record<string, any> = {};
              if (appResult.profilePictureUrl) appUpdates.profilePictureUrl = appResult.profilePictureUrl;
              if (appResult.fullAddress) appUpdates.address = appResult.fullAddress;
              if (appResult.nationality) appUpdates.nationality = appResult.nationality;
              if (appResult.nationalInsuranceNumber) appUpdates.nationalInsuranceNumber = appResult.nationalInsuranceNumber;
              if (appResult.vehicleType) appUpdates.vehicleType = appResult.vehicleType as any;
              if (appResult.bankName) appUpdates.bankName = appResult.bankName;
              if (appResult.accountHolderName) appUpdates.accountHolderName = appResult.accountHolderName;
              if (appResult.sortCode) appUpdates.sortCode = appResult.sortCode;
              if (appResult.accountNumber) appUpdates.accountNumber = appResult.accountNumber;
              
              if (Object.keys(appUpdates).length > 0) {
                await storage.updateDriver(driver.id, { ...appUpdates, isVerified: true });
                driver = { ...driver, ...appUpdates, isVerified: true };
                console.log(`[Driver] Synced profile data from approved application for ${email}`);
              }
            }
          } catch (appErr) {
            console.error("[Driver] Error checking application data:", appErr);
          }
        }

        try {
          const { db } = await import("./db");
          const { drivers } = await import("@shared/schema");
          
          await db.insert(drivers).values({
            id: driver.id,
            userId: driver.userId,
            driverCode: driver.driverCode,
            fullName: driver.fullName,
            email: driver.email,
            phone: driver.phone,
            vehicleType: driver.vehicleType,
            vehicleRegistration: driver.vehicleRegistration,
            vehicleMake: driver.vehicleMake,
            vehicleModel: driver.vehicleModel,
            vehicleColor: driver.vehicleColor,
            isAvailable: driver.isAvailable ?? false,
            isVerified: driver.isVerified ?? false,
            profilePictureUrl: driver.profilePictureUrl || null,
            rating: driver.rating ?? "5.00",
            totalJobs: driver.totalJobs ?? 0,
            createdAt: driver.createdAt ?? new Date(),
          }).onConflictDoUpdate({
            target: drivers.id,
            set: {
              fullName: driver.fullName,
              email: driver.email,
              phone: driver.phone,
              vehicleType: driver.vehicleType,
              profilePictureUrl: driver.profilePictureUrl || null,
            }
          });
          
          console.log("New driver saved to PostgreSQL:", driver.id, "with permanent code:", driver.driverCode);
          
          // Also sync driver code to Supabase for Hostinger deployment
          try {
            const { supabaseAdmin } = await import("./supabaseAdmin");
            if (supabaseAdmin && driver.driverCode) {
              const supabaseData: Record<string, any> = {
                id: driver.id,
                user_id: driver.userId,
                driver_code: driver.driverCode,
                full_name: driver.fullName,
                email: driver.email,
                phone: driver.phone,
                vehicle_type: driver.vehicleType,
                online_status: driver.isAvailable ? 'online' : 'offline',
                status: driver.isVerified ? 'approved' : 'applicant',
              };
              if (driver.profilePictureUrl) {
                const baseUrl = process.env.APP_URL || 'https://runcourier.co.uk';
                supabaseData.profile_picture_url = driver.profilePictureUrl.startsWith('http') 
                  ? driver.profilePictureUrl 
                  : `${baseUrl}${driver.profilePictureUrl}`;
              }
              if (applicationData) {
                if (applicationData.fullAddress) supabaseData.address = applicationData.fullAddress;
                if (applicationData.nationality) supabaseData.nationality = applicationData.nationality;
                if (applicationData.nationalInsuranceNumber) supabaseData.national_insurance_number = applicationData.nationalInsuranceNumber;
                if (applicationData.bankName) supabaseData.bank_name = applicationData.bankName;
                if (applicationData.accountHolderName) supabaseData.account_holder_name = applicationData.accountHolderName;
                if (applicationData.sortCode) supabaseData.sort_code = applicationData.sortCode;
                if (applicationData.accountNumber) supabaseData.account_number = applicationData.accountNumber;
              }
              await supabaseAdmin
                .from('drivers')
                .upsert(supabaseData, { onConflict: 'id' });
              console.log("Driver synced to Supabase:", driver.id, driver.driverCode);
            }
          } catch (syncErr) {
            console.error("Failed to sync driver to Supabase:", syncErr);
          }
        } catch (e) {
          console.error("Failed to insert driver into PostgreSQL:", e);
        }
      }
    }
    res.json(driver);
  }));

  app.post("/api/drivers", asyncHandler(async (req, res) => {
    const data = insertDriverSchema.parse(req.body);
    const driver = await storage.createDriver(data);
    res.status(201).json(driver);
  }));

  app.patch("/api/drivers/:id", asyncHandler(async (req, res) => {
    // Prevent any attempt to change immutable identifiers
    if (req.body.id || req.body.userId || req.body.driverCode) {
      console.warn(`[Security] Attempt to modify immutable driver fields blocked for driver ${req.params.id}`);
    }
    // Remove immutable fields from request body before processing
    const { id: _id, userId: _userId, driverCode: _driverCode, ...safeBody } = req.body;
    
    let driver: any;
    try {
      driver = await storage.updateDriver(req.params.id, safeBody);
    } catch (err: any) {
      if (err.code === 'VEHICLE_TYPE_CONSTRAINT') {
        return res.status(422).json({
          error: `Vehicle type "${err.vehicleType}" is not yet supported in the database. Run the migration SQL first.`,
          code: 'VEHICLE_TYPE_CONSTRAINT',
          migrationSqlUrl: '/api/admin/vehicle-migration-sql',
        });
      }
      throw err;
    }
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Sync to Supabase (primary data store)
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        const supabaseUpdateData: Record<string, unknown> = {};
        if (safeBody.fullName !== undefined) supabaseUpdateData.full_name = safeBody.fullName;
        if (safeBody.email !== undefined) supabaseUpdateData.email = safeBody.email;
        if (safeBody.phone !== undefined) supabaseUpdateData.phone = safeBody.phone;
        if (safeBody.vehicleType !== undefined) supabaseUpdateData.vehicle_type = safeBody.vehicleType;
        // Null-overwrite protection: only update registration/vehicle fields if new value is non-empty, OR explicitly null/undefined
        if (safeBody.vehicleRegistration !== undefined && safeBody.vehicleRegistration !== '') supabaseUpdateData.vehicle_registration = safeBody.vehicleRegistration;
        if (safeBody.vehicleMake !== undefined && safeBody.vehicleMake !== '') supabaseUpdateData.vehicle_make = safeBody.vehicleMake;
        if (safeBody.vehicleModel !== undefined && safeBody.vehicleModel !== '') supabaseUpdateData.vehicle_model = safeBody.vehicleModel;
        if (safeBody.vehicleColor !== undefined && safeBody.vehicleColor !== '') supabaseUpdateData.vehicle_color = safeBody.vehicleColor;
        if (safeBody.isAvailable !== undefined) supabaseUpdateData.online_status = safeBody.isAvailable ? 'online' : 'offline';
        if (safeBody.isVerified !== undefined) supabaseUpdateData.status = safeBody.isVerified ? 'approved' : 'applicant';
        if (safeBody.address !== undefined) supabaseUpdateData.address = safeBody.address;
        if (safeBody.postcode !== undefined) supabaseUpdateData.postcode = safeBody.postcode;
        if (safeBody.bankName !== undefined) supabaseUpdateData.bank_name = safeBody.bankName;
        if (safeBody.accountHolderName !== undefined) supabaseUpdateData.account_holder_name = safeBody.accountHolderName;
        if (safeBody.sortCode !== undefined) supabaseUpdateData.sort_code = safeBody.sortCode;
        if (safeBody.accountNumber !== undefined) supabaseUpdateData.account_number = safeBody.accountNumber;
        if (safeBody.nationalInsuranceNumber !== undefined) supabaseUpdateData.national_insurance_number = safeBody.nationalInsuranceNumber;
        if (safeBody.rightToWorkShareCode !== undefined) supabaseUpdateData.right_to_work_share_code = safeBody.rightToWorkShareCode;
        
        if (Object.keys(supabaseUpdateData).length > 0) {
          let { error } = await supabaseAdmin
            .from('drivers')
            .update(supabaseUpdateData)
            .eq('id', req.params.id);
          
          if (error && (error.message?.includes('vehicle_registration') || error.message?.includes('vehicle_make') || error.message?.includes('column'))) {
            const vehicleReg = supabaseUpdateData.vehicle_registration;
            delete supabaseUpdateData.vehicle_registration;
            delete supabaseUpdateData.vehicle_make;
            delete supabaseUpdateData.vehicle_model;
            delete supabaseUpdateData.vehicle_color;
            if (vehicleReg && supabaseUpdateData.vehicle_type) {
              supabaseUpdateData.vehicle_type = `${supabaseUpdateData.vehicle_type}|${vehicleReg}`;
            } else if (vehicleReg) {
              const existing = await supabaseAdmin.from('drivers').select('vehicle_type').eq('id', req.params.id).single();
              const baseType = (existing.data?.vehicle_type as string)?.split('|')[0] || 'car';
              supabaseUpdateData.vehicle_type = `${baseType}|${vehicleReg}`;
            }
            if (Object.keys(supabaseUpdateData).length > 0) {
              const retry = await supabaseAdmin.from('drivers').update(supabaseUpdateData).eq('id', req.params.id);
              error = retry.error;
            } else {
              error = null;
            }
          }

          if (error) {
            console.error("Failed to update driver in Supabase:", error);
          } else {
            console.log("Driver successfully updated in Supabase:", req.params.id);
            // Broadcast profile update to mobile app for real-time sync
            broadcastProfileUpdate(req.params.id, {
              ...safeBody,
              // Include snake_case versions for mobile app compatibility
              full_name: safeBody.fullName,
              vehicle_type: safeBody.vehicleType,
              vehicle_registration: safeBody.vehicleRegistration,
              vehicle_make: safeBody.vehicleMake,
              vehicle_model: safeBody.vehicleModel,
              vehicle_color: safeBody.vehicleColor,
              bank_name: safeBody.bankName,
              account_holder_name: safeBody.accountHolderName,
              sort_code: safeBody.sortCode,
              account_number: safeBody.accountNumber,
              profile_picture_url: safeBody.profilePictureUrl,
              status: safeBody.isVerified ? 'approved' : 'applicant',
            });
          }
        }
      }
    } catch (syncErr) {
      console.error("Failed to sync driver to Supabase:", syncErr);
    }
    
    // Invalidate driver cache for instant updates
    cache.invalidatePattern('^drivers:');
    
    res.json(driver);
  }));

  app.patch("/api/drivers/:id/availability", asyncHandler(async (req, res) => {
    const { isAvailable } = req.body;
    const driver = await storage.updateDriverAvailability(req.params.id, isAvailable);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Sync availability update to PostgreSQL/Supabase
    try {
      const { db } = await import("./db");
      const { drivers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(drivers).set({ isAvailable }).where(eq(drivers.id, req.params.id));
      console.log("Driver availability synced to PostgreSQL:", req.params.id, isAvailable);
    } catch (e) {
      console.error("Failed to sync driver availability to PostgreSQL:", e);
    }
    
    // Invalidate driver cache for instant updates
    cache.invalidatePattern('^drivers:');
    
    res.json(driver);
  }));

  app.patch("/api/drivers/:id/location", asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    const driver = await storage.updateDriverLocation(req.params.id, latitude, longitude);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Invalidate driver cache for instant location updates
    cache.invalidatePattern('^drivers:');
    
    res.json(driver);
  }));

  app.patch("/api/drivers/:id/verify", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED: Driver verification is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
    const { isVerified, bypassDocumentCheck } = req.body;
    const driverId = req.params.id;
    
    // Get driver first to check vehicle type
    const existingDriver = await storage.getDriver(driverId);
    if (!existingDriver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // If trying to verify (activate) the driver, check that all required documents are approved
    if (isVerified === true && !bypassDocumentCheck) {
      const vehicleType = existingDriver.vehicleType || 'car';
      
      // Define required document types based on vehicle type
      const baseRequiredDocs = [
        'driving_license',
        'hire_and_reward_insurance',
        'goods_in_transit_insurance',
        'proof_of_identity',
        'proof_of_address',
      ];
      
      // Define vehicle photo requirements based on vehicle type
      const vehiclePhotoRequirements: Record<string, string[]> = {
        'motorbike': ['vehicle_photo_front', 'vehicle_photo_back'],
        'car': ['vehicle_photo_front', 'vehicle_photo_back'],
        'small_van': ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space'],
        'medium_van': ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space'],
      };
      
      const requiredPhotos = vehiclePhotoRequirements[vehicleType] || ['vehicle_photo_front', 'vehicle_photo_back'];
      const allRequiredDocs = [...baseRequiredDocs, ...requiredPhotos];
      
      // Fetch driver's documents from database
      let driverDocuments: any[] = [];
      try {
        const { db } = await import("./db");
        const { documents: documentsTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        
        driverDocuments = await db.select().from(documentsTable)
          .where(eq(documentsTable.driverId, driverId));
      } catch (e) {
        console.error("Failed to fetch documents from PostgreSQL:", e);
        // Fallback to memory storage
        driverDocuments = await storage.getDocuments({ driverId });
      }
      
      // Check each required document is approved
      const missingDocs: string[] = [];
      const pendingDocs: string[] = [];
      const rejectedDocs: string[] = [];
      
      for (const docType of allRequiredDocs) {
        const doc = driverDocuments.find((d: any) => d.type === docType);
        if (!doc) {
          missingDocs.push(docType.replace(/_/g, ' '));
        } else if (doc.status === 'pending') {
          pendingDocs.push(docType.replace(/_/g, ' '));
        } else if (doc.status === 'rejected') {
          rejectedDocs.push(docType.replace(/_/g, ' '));
        }
      }
      
      // If any documents are not approved, prevent verification
      if (missingDocs.length > 0 || pendingDocs.length > 0 || rejectedDocs.length > 0) {
        const issues: string[] = [];
        if (missingDocs.length > 0) {
          issues.push(`Missing: ${missingDocs.join(', ')}`);
        }
        if (pendingDocs.length > 0) {
          issues.push(`Pending approval: ${pendingDocs.join(', ')}`);
        }
        if (rejectedDocs.length > 0) {
          issues.push(`Rejected: ${rejectedDocs.join(', ')}`);
        }
        
        return res.status(400).json({ 
          error: "Cannot verify driver until all required documents are approved",
          details: issues,
          missingCount: missingDocs.length,
          pendingCount: pendingDocs.length,
          rejectedCount: rejectedDocs.length
        });
      }
    }
    
    const driver = await storage.verifyDriver(driverId, isVerified);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Sync to PostgreSQL
    try {
      const { db } = await import("./db");
      const { drivers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(drivers).set({ isVerified }).where(eq(drivers.id, driverId));
      console.log("Driver verification synced to PostgreSQL:", driverId, isVerified);
    } catch (e) {
      console.error("Failed to sync driver verification to PostgreSQL:", e);
    }
    
    // Also sync to Supabase directly to ensure consistency
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        const { error: supabaseError } = await supabaseAdmin
          .from('drivers')
          .update({ 
            status: isVerified ? 'approved' : 'applicant',
            updated_at: new Date().toISOString()
          })
          .eq('id', driverId);
        
        if (supabaseError) {
          console.error("Failed to sync driver verification to Supabase:", supabaseError.message);
        } else {
          console.log(`[Drivers] Verification synced to Supabase: ${driverId} -> status=${isVerified ? 'approved' : 'applicant'}`);
        }
      }
    } catch (e) {
      console.error("Failed to sync driver verification to Supabase:", e);
    }
    
    if (isVerified === true) {
      try {
        const { supabaseAdmin } = await import("./supabaseAdmin");
        if (supabaseAdmin) {
          const { data: driverData } = await supabaseAdmin
            .from('drivers')
            .select('profile_picture_url, driving_licence_front_url, driving_licence_back_url, dbs_certificate_url, goods_in_transit_insurance_url, hire_reward_insurance_url, right_to_work_share_code, vehicle_type')
            .eq('id', driverId)
            .single();

          let appData: any = null;
          if (existingDriver.email) {
            const { data: appResult } = await supabaseAdmin
              .from('driver_applications')
              .select('*')
              .eq('email', existingDriver.email)
              .eq('status', 'approved')
              .order('submitted_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            appData = appResult;
          }

          const docMappings = [
            {
              docType: 'driving_licence_front' as string | null,
              url: driverData?.driving_licence_front_url || appData?.driving_licence_front_url,
              dbColumn: 'driving_licence_front_url'
            },
            {
              docType: 'driving_licence_back' as string | null,
              url: driverData?.driving_licence_back_url || appData?.driving_licence_back_url,
              dbColumn: 'driving_licence_back_url'
            },
            {
              docType: 'dbs_certificate' as string | null,
              url: driverData?.dbs_certificate_url || appData?.dbs_certificate_url,
              dbColumn: 'dbs_certificate_url'
            },
            {
              docType: 'goods_in_transit' as string | null,
              url: driverData?.goods_in_transit_insurance_url || appData?.goods_in_transit_insurance_url,
              dbColumn: 'goods_in_transit_insurance_url'
            },
            {
              docType: 'hire_and_reward' as string | null,
              url: driverData?.hire_reward_insurance_url || appData?.hire_and_reward_url,
              dbColumn: 'hire_reward_insurance_url'
            },
            {
              docType: null,
              url: driverData?.profile_picture_url || appData?.profile_picture_url,
              dbColumn: 'profile_picture_url'
            },
          ];

          if (driverData?.right_to_work_share_code) {
            await supabaseAdmin.from('driver_documents')
              .delete()
              .eq('driver_id', driverId)
              .eq('doc_type', 'share_code');

            await supabaseAdmin.from('driver_documents')
              .insert({
                driver_id: driverId,
                doc_type: 'share_code',
                file_url: `text:${driverData.right_to_work_share_code}`,
                status: 'approved',
                uploaded_at: new Date().toISOString(),
              });
            console.log(`[Drivers] Created share_code record for driver ${driverId}`);
          }

          const updateData: Record<string, string> = {};

          for (const mapping of docMappings) {
            if (!mapping.url) continue;

            if (mapping.docType) {
              const { data: existing } = await supabaseAdmin.from('driver_documents')
                .select('id, storage_path, bucket')
                .eq('driver_id', driverId)
                .eq('doc_type', mapping.docType)
                .maybeSingle();

              if (existing && existing.storage_path && existing.bucket) {
                await supabaseAdmin.from('driver_documents')
                  .update({ status: 'approved' })
                  .eq('id', existing.id);
                console.log(`[Drivers] Approved existing document ${mapping.docType} for driver ${driverId}`);
              } else if (existing) {
                const storagePath = extractStoragePath(mapping.url) || normalizeDocumentUrl(mapping.url) || mapping.url;
                await supabaseAdmin.from('driver_documents')
                  .update({
                    status: 'approved',
                    bucket: 'DRIVER-DOCUMENTS',
                    storage_path: storagePath,
                    file_url: storagePath,
                  })
                  .eq('id', existing.id);
                console.log(`[Drivers] Approved and fixed storage_path for ${mapping.docType}: ${storagePath}`);
              } else {
                const storagePath = extractStoragePath(mapping.url) || normalizeDocumentUrl(mapping.url) || mapping.url;
                const { error: insertErr } = await supabaseAdmin.from('driver_documents')
                  .insert({
                    driver_id: driverId,
                    auth_user_id: driverId,
                    doc_type: mapping.docType,
                    file_url: storagePath,
                    bucket: 'DRIVER-DOCUMENTS',
                    storage_path: storagePath,
                    status: 'approved',
                    uploaded_at: new Date().toISOString(),
                  });

                if (insertErr) {
                  console.error(`[Drivers] Failed to create driver_documents record for ${mapping.docType}:`, insertErr.message);
                } else {
                  console.log(`[Drivers] Created document record for ${mapping.docType} with storage_path: ${storagePath}`);
                }
              }
            } else {
              updateData[mapping.dbColumn] = normalizeDocumentUrl(mapping.url) || mapping.url;
            }
          }

          const vehicleType = driverData?.vehicle_type || existingDriver.vehicleType || 'car';
          const BUCKET = 'DRIVER-DOCUMENTS';
          const searchFolders = [driverId, 'applications/pending'];
          const vehiclePhotoTypes: Record<string, string[]> = {
            'motorbike': ['front', 'back'],
            'car': ['front', 'back'],
            'small_van': ['front', 'back', 'left', 'right', 'load_space'],
            'medium_van': ['front', 'back', 'left', 'right', 'load_space'],
          };
          const photoLabels = vehiclePhotoTypes[vehicleType] || ['front', 'back'];

          for (const label of photoLabels) {
            const docType = `vehicle_photos_${label}`;
            const searchPatterns = [`vehicle_photo_${label}`, `vehicle_photos_${label}`, `vehiclephoto${label}`];

            const { data: existingVehicleDoc } = await supabaseAdmin.from('driver_documents')
              .select('id, storage_path, bucket')
              .eq('driver_id', driverId)
              .eq('doc_type', docType)
              .maybeSingle();

            if (existingVehicleDoc && existingVehicleDoc.storage_path && existingVehicleDoc.bucket) {
              await supabaseAdmin.from('driver_documents')
                .update({ status: 'approved' })
                .eq('id', existingVehicleDoc.id);
              console.log(`[Drivers] Approved existing vehicle photo ${docType} for driver ${driverId}`);
              continue;
            } else if (existingVehicleDoc) {
              const storagePath = existingVehicleDoc.storage_path || existingVehicleDoc.file_url || '';
              await supabaseAdmin.from('driver_documents')
                .update({ status: 'approved', bucket: BUCKET, storage_path: storagePath })
                .eq('id', existingVehicleDoc.id);
              console.log(`[Drivers] Approved and fixed vehicle photo ${docType} for driver ${driverId}`);
              continue;
            }

            let found = false;
            for (const folder of searchFolders) {
              try {
                const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: 200 });
                if (!files) continue;

                for (const file of files) {
                  const nameWithoutExt = file.name.replace(/\.[^.]+$/, '').replace(/_\d{10,}$/, '').toLowerCase();
                  if (searchPatterns.some(p => nameWithoutExt === p.toLowerCase() || nameWithoutExt.startsWith(p.toLowerCase()))) {
                    const originalPath = `${folder}/${file.name}`;

                    await supabaseAdmin.from('driver_documents').insert({
                      driver_id: driverId,
                      auth_user_id: driverId,
                      doc_type: docType,
                      file_url: originalPath,
                      bucket: BUCKET,
                      storage_path: originalPath,
                      file_name: file.name,
                      status: 'approved',
                      uploaded_at: new Date().toISOString(),
                    });
                    console.log(`[Drivers] Created vehicle photo record ${docType} at original path: ${originalPath}`);
                    found = true;
                    break;
                  }
                }
                if (found) break;
              } catch (e: any) {
                console.error(`[Drivers] Error searching vehicle photos in ${folder}:`, e.message);
              }
            }
          }

          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from('drivers')
              .update(updateData)
              .eq('id', driverId);
            console.log(`[Drivers] Updated ${Object.keys(updateData).length} document URLs for driver ${driverId}`);
          }
        }
      } catch (docMigrationErr: any) {
        console.error("[Drivers] Document migration error (non-critical):", docMigrationErr.message);
      }
    }

    // ── Auto-emails on approval ──────────────────────────────────────────────
    if (isVerified === true && driver.email) {
      // Email 1: Approval confirmation
      try {
        const { sendDriverApprovalEmailExisting } = await import('./emailService');
        const sent = await sendDriverApprovalEmailExisting(
          driver.email,
          driver.fullName || 'Driver',
          driver.driverCode || driver.id
        );
        if (sent) {
          console.log(`[Drivers] Approval confirmation email sent to ${driver.email}`);
        } else {
          console.error(`[Drivers] Failed to send approval confirmation email to ${driver.email}`);
        }
      } catch (emailErr: any) {
        console.error('[Drivers] Error sending approval confirmation email:', emailErr.message);
      }

      // Email 2: Contract signing — use first available template automatically
      try {
        const templates = await storage.getContractTemplates();
        if (templates && templates.length > 0) {
          const template = templates[0];
          const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
          const driverCode = driver.driverCode || driver.id;
          const contractContent = template.content
            .replace(/\{\{driver_name\}\}/g, driver.fullName || 'Driver')
            .replace(/\{\{driver_code\}\}/g, driverCode)
            .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
            .replace(/\{\{driver_email\}\}/g, driver.email || '')
            .replace(/\{\{driver_phone\}\}/g, driver.phone || '')
            .replace(/\{\{vehicle_type\}\}/g, driver.vehicleType || '');

          await storage.createDriverContract({
            templateId: template.id,
            driverId: driver.id,
            driverName: driver.fullName || 'Driver',
            driverEmail: driver.email || undefined,
            contractContent,
            token,
            status: 'sent',
            sentAt: new Date().toISOString(),
          });

          const { sendContractSigningEmail } = await import('./emailService');
          const signingUrl = `https://runcourier.co.uk/contracts/sign/${token}`;
          await sendContractSigningEmail(driver.email, {
            driverName: driver.fullName || 'Driver',
            contractTitle: template.title,
            signingUrl,
          });
          console.log(`[Drivers] Contract signing email sent to ${driver.email} (template: ${template.title})`);
        } else {
          console.log('[Drivers] No contract templates found — skipping auto contract email');
        }
      } catch (contractErr: any) {
        console.error('[Drivers] Error sending auto contract email:', contractErr.message);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    res.json(driver);
  }));

  app.post("/api/drivers/:id/deactivate", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED: Driver deactivation is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
    const driverId = req.params.id;
    
    // Check if driver exists
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Deactivate driver (soft delete)
    const deactivatedDriver = await storage.deactivateDriver(driverId);
    if (!deactivatedDriver) {
      return res.status(500).json({ error: "Failed to deactivate driver" });
    }
    
    // Also deactivate the user if they exist
    if (driver.userId) {
      await storage.deactivateUser(driver.userId);
    }
    
    // Sync to PostgreSQL
    try {
      const { db } = await import("./db");
      const { drivers: driversTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(driversTable).set({ 
        isActive: false, 
        deactivatedAt: new Date(),
        isAvailable: false
      }).where(eq(driversTable.id, driverId));
      console.log(`[Drivers] Synced driver deactivation to PostgreSQL: ${driverId}`);
    } catch (e) {
      console.error("Failed to sync driver deactivation to PostgreSQL:", e);
    }
    
    console.log(`[Drivers] Deactivated driver ${driverId}`);
    res.json({ success: true, message: "Driver account deactivated successfully", driver: deactivatedDriver });
  }));

  app.post("/api/drivers/:id/reactivate", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED: Driver reactivation is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
    const driverId = req.params.id;
    
    // Check if driver exists (include inactive)
    const allDrivers = await storage.getDrivers({ includeInactive: true });
    const driver = allDrivers.find(d => d.id === driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Reactivate driver
    const reactivatedDriver = await storage.reactivateDriver(driverId);
    if (!reactivatedDriver) {
      return res.status(500).json({ error: "Failed to reactivate driver" });
    }
    
    // Also reactivate the user if they exist
    if (driver.userId) {
      await storage.reactivateUser(driver.userId);
    }
    
    // Sync to PostgreSQL
    try {
      const { db } = await import("./db");
      const { drivers: driversTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(driversTable).set({ 
        isActive: true, 
        deactivatedAt: null
      }).where(eq(driversTable.id, driverId));
      console.log(`[Drivers] Synced driver reactivation to PostgreSQL: ${driverId}`);
    } catch (e) {
      console.error("Failed to sync driver reactivation to PostgreSQL:", e);
    }
    
    console.log(`[Drivers] Reactivated driver ${driverId}`);
    res.json({ success: true, message: "Driver account reactivated successfully", driver: reactivatedDriver });
  }));

  // Delete driver permanently - COMPLETE removal from all systems
  app.delete("/api/drivers/:id", asyncHandler(async (req, res) => {
    const driverId = req.params.id;
    
    // Check if driver exists (include inactive)
    const allDrivers = await storage.getDrivers({ includeInactive: true });
    const driver = allDrivers.find(d => d.id === driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    const driverEmail = driver.email;
    const driverUserId = driver.userId || driver.id;
    
    // Build list of all possible IDs to search for
    const driverIds = [...new Set([driverId, driverUserId].filter(Boolean))];
    console.log(`[Drivers] Starting PERMANENT deletion of driver (IDs: ${driverIds.join(', ')}, email: ${driverEmail})`);
    
    // First, find the actual Supabase Auth user ID by email (using direct lookup, not listUsers)
    let authUserId: string | null = null;
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin && driverEmail) {
        // Direct lookup by email - more reliable than listUsers which is paginated
        const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(driverId);
        if (!error && userData?.user) {
          authUserId = userData.user.id;
          console.log(`[Drivers] Found auth user ID by driver ID: ${authUserId}`);
        } else if (driverUserId !== driverId) {
          // Try with userId
          const { data: userData2 } = await supabaseAdmin.auth.admin.getUserById(driverUserId);
          if (userData2?.user) {
            authUserId = userData2.user.id;
            console.log(`[Drivers] Found auth user ID by user ID: ${authUserId}`);
          }
        }
        
        // If still not found, also check Supabase drivers table for the real auth id
        if (!authUserId) {
          const { data: supaDrivers } = await supabaseAdmin
            .from('drivers')
            .select('id, user_id')
            .or(`id.eq.${driverId},user_id.eq.${driverId}`);
          if (supaDrivers && supaDrivers.length > 0) {
            for (const sd of supaDrivers) {
              const potentialId = sd.id || sd.user_id;
              if (potentialId && !driverIds.includes(potentialId)) {
                driverIds.push(potentialId);
              }
              // Try to get auth user for each found ID
              const { data: authCheck } = await supabaseAdmin.auth.admin.getUserById(sd.id);
              if (authCheck?.user) {
                authUserId = authCheck.user.id;
                console.log(`[Drivers] Found auth user from Supabase drivers lookup: ${authUserId}`);
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to lookup auth user:", e);
    }
    
    // 1. Update jobs to remove driver reference (preserve job history with null driver)
    try {
      const { db } = await import("./db");
      const { jobs: jobsTable, jobAssignments } = await import("@shared/schema");
      const { eq, or, inArray } = await import("drizzle-orm");
      
      // Nullify driver_id on all jobs assigned to this driver (try both IDs)
      for (const id of driverIds) {
        await db.update(jobsTable).set({ driverId: null }).where(eq(jobsTable.driverId, id));
      }
      console.log(`[Drivers] Removed driver from jobs in PostgreSQL`);
      
      // Delete job assignments for this driver
      for (const id of driverIds) {
        await db.delete(jobAssignments).where(eq(jobAssignments.driverId, id));
      }
      console.log(`[Drivers] Deleted job assignments in PostgreSQL`);
    } catch (e) {
      console.error("Failed to clean up jobs/assignments in PostgreSQL:", e);
    }
    
    // 2. Update jobs in Supabase (mobile app data source)
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        // Nullify driver_id on jobs - use .in() for proper filtering
        for (const id of driverIds) {
          const { error: jobError } = await supabaseAdmin
            .from('jobs')
            .update({ driver_id: null })
            .eq('driver_id', id);
          if (jobError) {
            console.error(`Failed to nullify driver_id=${id} on Supabase jobs:`, jobError);
          }
        }
        console.log(`[Drivers] Removed driver from Supabase jobs`);
        
        // Delete job assignments
        for (const id of driverIds) {
          const { error: assignError } = await supabaseAdmin
            .from('job_assignments')
            .delete()
            .eq('driver_id', id);
          if (assignError) {
            console.error(`Failed to delete Supabase job assignments for driver_id=${id}:`, assignError);
          }
        }
        console.log(`[Drivers] Deleted Supabase job assignments`);
        
        // Delete driver devices (push notification tokens)
        for (const id of driverIds) {
          const { error: deviceError } = await supabaseAdmin
            .from('driver_devices')
            .delete()
            .eq('driver_id', id);
          if (deviceError) {
            console.error(`Failed to delete Supabase driver devices for driver_id=${id}:`, deviceError);
          }
        }
        console.log(`[Drivers] Deleted Supabase driver devices`);

        // Delete driver_locations entries
        for (const id of driverIds) {
          await supabaseAdmin.from('driver_locations').delete().eq('driver_id', id);
        }
        console.log(`[Drivers] Deleted Supabase driver locations`);

        // Delete driver_documents records and their files from Supabase Storage
        for (const id of driverIds) {
          const { data: docs } = await supabaseAdmin
            .from('driver_documents')
            .select('id, file_url, storage_path, bucket')
            .eq('driver_id', id);

          if (docs && docs.length > 0) {
            const BUCKETS = ['DRIVER-DOCUMENTS', 'driver-documents'];

            for (const doc of docs) {
              const storagePath = doc.storage_path || extractStoragePath(doc.file_url || '');
              if (storagePath) {
                for (const bucket of BUCKETS) {
                  const { error: rmErr } = await supabaseAdmin.storage
                    .from(bucket)
                    .remove([storagePath]);
                  if (!rmErr) {
                    console.log(`[Drivers] Deleted file from ${bucket}: ${storagePath}`);
                    break;
                  }
                }
              }
            }

            const { error: docsDelErr } = await supabaseAdmin
              .from('driver_documents')
              .delete()
              .eq('driver_id', id);
            if (docsDelErr) {
              console.error(`Failed to delete driver_documents for driver_id=${id}:`, docsDelErr);
            }
          }
        }
        console.log(`[Drivers] Deleted Supabase driver documents (records + storage files)`);

        // Delete documents from legacy 'documents' table as well
        for (const id of driverIds) {
          await supabaseAdmin.from('documents').delete().eq('driver_id', id);
        }

        // Delete driver_payments records
        for (const id of driverIds) {
          await supabaseAdmin.from('driver_payments').delete().eq('driver_id', id);
        }
        console.log(`[Drivers] Deleted Supabase driver payments`);

        // Delete files from Supabase Storage by auth user folder
        const storageUserId = authUserId || driverId;
        for (const bucket of ['DRIVER-DOCUMENTS', 'driver-documents']) {
          try {
            const { data: files } = await supabaseAdmin.storage
              .from(bucket)
              .list(storageUserId);
            if (files && files.length > 0) {
              const paths = files.map(f => `${storageUserId}/${f.name}`);
              await supabaseAdmin.storage.from(bucket).remove(paths);
              console.log(`[Drivers] Deleted ${paths.length} files from ${bucket}/${storageUserId}/`);
            }
          } catch (e) {
            // Bucket may not exist or folder may be empty
          }
        }

        // Also delete pending application files (drivers/pending/*)
        try {
          const pendingPrefixes = [
            `drivers/pending/driving_licence/${driverEmail}`,
            `drivers/pending/driving_license/${driverEmail}`,
            `drivers/pending/dbs_certificate/${driverEmail}`,
            `drivers/pending/goods_in_transit/${driverEmail}`,
            `drivers/pending/hire_and_reward/${driverEmail}`,
            `drivers/pending/profile_picture/${driverEmail}`,
          ];
          for (const bucket of ['DRIVER-DOCUMENTS', 'driver-documents']) {
            for (const prefix of pendingPrefixes) {
              const { data: pendingFiles } = await supabaseAdmin.storage
                .from(bucket)
                .list(prefix.substring(0, prefix.lastIndexOf('/')), {
                  search: prefix.substring(prefix.lastIndexOf('/') + 1),
                });
              if (pendingFiles && pendingFiles.length > 0) {
                const folder = prefix.substring(0, prefix.lastIndexOf('/'));
                const paths = pendingFiles.map(f => `${folder}/${f.name}`);
                await supabaseAdmin.storage.from(bucket).remove(paths);
                console.log(`[Drivers] Deleted ${paths.length} pending files from ${bucket}/${folder}/`);
              }
            }
          }
        } catch (e) {
          console.warn("[Drivers] Pending files cleanup error (non-critical):", e);
        }
      }
    } catch (e) {
      console.error("Failed to clean up Supabase jobs/assignments/documents:", e);
    }
    
    // 3. Delete local document files
    try {
      const localUploadsDir = path.join(process.cwd(), 'uploads', 'documents');
      if (fs.existsSync(localUploadsDir)) {
        const allIds = [...driverIds, authUserId].filter(Boolean) as string[];
        for (const id of allIds) {
          const driverDir = path.join(localUploadsDir, id);
          if (fs.existsSync(driverDir)) {
            fs.rmSync(driverDir, { recursive: true, force: true });
            console.log(`[Drivers] Deleted local files: ${driverDir}`);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to delete local document files:", e);
    }

    // 5. Delete from Supabase drivers table
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        // Delete by id column
        for (const id of driverIds) {
          await supabaseAdmin.from('drivers').delete().eq('id', id);
        }
        // Also delete by user_id column
        for (const id of driverIds) {
          await supabaseAdmin.from('drivers').delete().eq('user_id', id);
        }
        console.log(`[Drivers] Deleted driver from Supabase drivers table`);
      }
    } catch (e) {
      console.error("Failed to delete driver from Supabase:", e);
    }
    
    // 6. Delete from Supabase Auth (THIS IS CRITICAL - prevents driver from coming back)
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        let authDeleted = false;
        
        // First priority: delete by found auth user ID (from email lookup)
        if (authUserId) {
          const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
          if (error) {
            console.error(`Failed to delete auth user by authUserId ${authUserId}:`, error);
          } else {
            authDeleted = true;
            console.log(`[Drivers] DELETED Supabase auth user: ${authUserId}`);
          }
        }
        
        // Fallback: try each driver ID as potential auth user ID
        if (!authDeleted) {
          for (const id of driverIds) {
            const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
            if (!error) {
              authDeleted = true;
              console.log(`[Drivers] DELETED Supabase auth user by ID: ${id}`);
              break;
            } else if (!error.message?.includes('not found')) {
              console.error(`Failed to delete auth user ${id}:`, error);
            }
          }
        }
        
        if (!authDeleted) {
          console.log(`[Drivers] No auth user found to delete (may already be deleted)`);
        }
      }
    } catch (e) {
      console.error("Failed to delete from Supabase Auth:", e);
    }
    
    // 7. Delete documents from PostgreSQL documents table
    try {
      const { db } = await import("./db");
      const { documents: documentsTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      for (const id of driverIds) {
        await db.delete(documentsTable).where(eq(documentsTable.driverId, id));
      }
      console.log(`[Drivers] Deleted documents from PostgreSQL`);
    } catch (e) {
      console.error("Failed to delete documents from PostgreSQL:", e);
    }

    // 8. Delete from PostgreSQL drivers table (after documents are removed)
    try {
      const { db } = await import("./db");
      const { drivers: driversTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.delete(driversTable).where(eq(driversTable.id, driverId));
      console.log(`[Drivers] Deleted driver from PostgreSQL: ${driverId}`);
    } catch (e) {
      console.error("Failed to delete driver from PostgreSQL:", e);
    }
    
    // 9. Delete from in-memory storage
    const deleted = await storage.deleteDriver(driverId);
    if (!deleted) {
      console.log(`[Drivers] Driver not in memory storage (may have been deleted already)`);
    }
    
    // 10. Invalidate documents cache so deleted driver's docs don't appear
    documentsCache.invalidate();
    
    console.log(`[Drivers] PERMANENTLY DELETED driver (${driverEmail}) from ALL systems`);
    res.json({ success: true, message: "Driver permanently deleted from all systems" });
  }));

  // Fetch all drivers from Supabase (users with role=driver)
  app.get("/api/supabase-drivers", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase admin not configured" });
    }

    try {
      // Get all users from Supabase auth
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      
      if (error) {
        console.error("Error fetching Supabase users:", error);
        return res.status(500).json({ error: "Failed to fetch users from Supabase" });
      }

      // Get existing drivers from Supabase database (for permanent driver IDs and full names)
      // Note: Supabase uses 'driver_code' column for what we call 'driverCode' internally
      const { data: supabaseDrivers } = await supabaseAdmin
        .from('drivers')
        .select('id, driver_code, full_name, email, phone, vehicle_type, status, online_status, driving_licence_front_url, driving_licence_back_url, dbs_certificate_url, goods_in_transit_insurance_url, hire_reward_insurance_url, profile_picture_url, vehicle_registration, vehicle_make, vehicle_model, vehicle_color, is_active, created_at');
      
      // Build maps: by id and email for flexible lookup
      // IMPORTANT: driver_code from Supabase is the PERMANENT Driver ID (e.g., RC02C)
      type SupabaseDriverData = { 
        id: string; 
        driver_code: string | null;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        vehicle_type: string | null;
        is_verified: boolean;
        is_available: boolean;
        driving_licence_front_url: string | null;
        driving_licence_back_url: string | null;
        dbs_certificate_url: string | null;
        goods_in_transit_insurance_url: string | null;
        hire_reward_insurance_url: string | null;
        profile_picture_url: string | null;
        vehicle_registration: string | null;
        vehicle_make: string | null;
        vehicle_model: string | null;
        vehicle_color: string | null;
        is_active: boolean;
        created_at: string | null;
      };
      const supabaseDriverById = new Map<string, SupabaseDriverData>();
      const supabaseDriverByEmail = new Map<string, SupabaseDriverData>();
      
      for (const d of (supabaseDrivers || [])) {
        const driverData: SupabaseDriverData = { 
          id: d.id, 
          driver_code: d.driver_code,
          full_name: d.full_name,
          email: d.email,
          phone: d.phone,
          vehicle_type: d.vehicle_type,
          is_verified: d.status === 'approved',
          is_available: d.online_status === 'online',
          driving_licence_front_url: (d as any).driving_licence_front_url || null,
          driving_licence_back_url: (d as any).driving_licence_back_url || null,
          dbs_certificate_url: (d as any).dbs_certificate_url || null,
          goods_in_transit_insurance_url: (d as any).goods_in_transit_insurance_url || null,
          hire_reward_insurance_url: (d as any).hire_reward_insurance_url || null,
          profile_picture_url: (d as any).profile_picture_url || null,
          vehicle_registration: (d as any).vehicle_registration || null,
          vehicle_make: (d as any).vehicle_make || null,
          vehicle_model: (d as any).vehicle_model || null,
          vehicle_color: (d as any).vehicle_color || null,
          is_active: (d as any).is_active ?? true,
          created_at: (d as any).created_at || null,
        };
        
        // Map by id (which matches auth user id in Supabase)
        supabaseDriverById.set(d.id, driverData);
        // Also map by email for fallback lookup
        if (d.email) {
          supabaseDriverByEmail.set(d.email.toLowerCase(), driverData);
        }
      }
      
      // Helper function to find Supabase driver data
      const findSupabaseDriver = (userId: string, email?: string | null): SupabaseDriverData | undefined => {
        return supabaseDriverById.get(userId) || 
               (email ? supabaseDriverByEmail.get(email.toLowerCase()) : undefined);
      };

      // Get local drivers for driver codes
      const localDrivers = await storage.getDrivers();
      const localDriverMap = new Map(localDrivers.map(d => [d.userId || d.id, d]));

      // Filter for driver role users
      const driverUsersList = users.filter(user => user.user_metadata?.role === 'driver');
      
      // Track failed driver creation attempts to avoid spamming logs
      const failedDriverUserIds = new Set<string>();
      
      // Process drivers sequentially to avoid race conditions
      const driverUsers = [];
      for (const user of driverUsersList) {
        const supabaseDriver = findSupabaseDriver(user.id, user.email);
        
        // IMPORTANT: driver_code from Supabase is the PERMANENT Driver ID - NEVER regenerate it
        // This is the authoritative source of driver IDs
        const permanentDriverId = supabaseDriver?.driver_code || null;
        
        // Check if driver exists locally
        let localDriver = localDriverMap.get(user.id);
        
        if (!localDriver) {
          // Create a local driver record - use Supabase driver data (which is authoritative)
          try {
            localDriver = await storage.createDriver({
              userId: user.id,
              fullName: supabaseDriver?.full_name || user.user_metadata?.fullName || user.user_metadata?.full_name || null,
              email: supabaseDriver?.email || user.email || null,
              phone: supabaseDriver?.phone || user.user_metadata?.phone || null,
              vehicleType: (supabaseDriver?.vehicle_type as any) || 'car',
              isAvailable: supabaseDriver?.is_available ?? false,
              isVerified: supabaseDriver?.is_verified ?? false,
              driverCode: permanentDriverId || undefined, // Use PERMANENT Supabase driver_id
            });
            localDriverMap.set(user.id, localDriver);
          } catch (createDriverError) {
            // Log a warning only once per user to avoid spam
            if (!failedDriverUserIds.has(user.id)) {
              console.debug(`[API] Failed to create local driver record for user ${user.id} (${user.email}):`, (createDriverError as Error).message);
              failedDriverUserIds.add(user.id);
            }
            // Continue to next user - don't fail the entire endpoint
            continue;
          }
        } else {
          // Update local driver with Supabase data if there's a mismatch
          const needsUpdate = (
            (!localDriver.fullName && supabaseDriver?.full_name) ||
            (permanentDriverId && localDriver.driverCode !== permanentDriverId)
          );
          
          if (needsUpdate) {
            await storage.updateDriver(localDriver.id, {
              fullName: supabaseDriver?.full_name || localDriver.fullName,
              phone: supabaseDriver?.phone || localDriver.phone,
              vehicleType: (supabaseDriver?.vehicle_type as any) || localDriver.vehicleType,
              driverCode: permanentDriverId || localDriver.driverCode, // Sync permanent ID
            });
            localDriver.fullName = supabaseDriver?.full_name || localDriver.fullName;
            localDriver.driverCode = permanentDriverId || localDriver.driverCode;
          }
        }

        // Use the PERMANENT driver ID from Supabase as the authoritative source
        driverUsers.push({
          id: user.id,
          email: user.email,
          fullName: supabaseDriver?.full_name || localDriver?.fullName || user.user_metadata?.fullName || user.user_metadata?.full_name || 'Unknown Driver',
          phone: supabaseDriver?.phone || localDriver?.phone || user.user_metadata?.phone || null,
          role: user.user_metadata?.role || 'driver',
          driverCode: permanentDriverId || localDriver?.driverCode || null,
          vehicleType: supabaseDriver?.vehicle_type || localDriver?.vehicleType || 'car',
          isVerified: supabaseDriver?.is_verified ?? localDriver?.isVerified ?? false,
          isAvailable: supabaseDriver?.is_available ?? localDriver?.isAvailable ?? false,
          createdAt: user.created_at,
          driving_licence_front_url: supabaseDriver?.driving_licence_front_url || null,
          driving_licence_back_url: supabaseDriver?.driving_licence_back_url || null,
          dbs_certificate_url: supabaseDriver?.dbs_certificate_url || null,
          goods_in_transit_insurance_url: supabaseDriver?.goods_in_transit_insurance_url || null,
          hire_reward_insurance_url: supabaseDriver?.hire_reward_insurance_url || null,
          profile_picture_url: supabaseDriver?.profile_picture_url || null,
          vehicle_registration: supabaseDriver?.vehicle_registration || localDriver?.vehicleRegistration || null,
          vehicle_make: supabaseDriver?.vehicle_make || localDriver?.vehicleMake || null,
          vehicle_model: supabaseDriver?.vehicle_model || localDriver?.vehicleModel || null,
          vehicle_color: supabaseDriver?.vehicle_color || localDriver?.vehicleColor || null,
          is_active: supabaseDriver?.is_active ?? localDriver?.isActive ?? true,
        });
      }

      // Also include local-only drivers (test drivers, drivers created before Supabase sync)
      const supabaseUserIds = new Set(driverUsersList.map(u => u.id));
      for (const localDriver of localDrivers) {
        // Skip if already included from Supabase or if deactivated
        if (supabaseUserIds.has(localDriver.userId || '') || supabaseUserIds.has(localDriver.id)) {
          continue;
        }
        if (localDriver.isActive === false) {
          continue;
        }
        // Add local-only driver - same shape as Supabase-matched drivers
        driverUsers.push({
          id: localDriver.id,
          email: localDriver.email || null,
          fullName: localDriver.fullName || 'Local Driver',
          phone: localDriver.phone || null,
          role: 'driver',
          driverCode: localDriver.driverCode || null,
          vehicleType: localDriver.vehicleType || 'car',
          isVerified: localDriver.isVerified ?? false,
          isAvailable: localDriver.isAvailable ?? false,
          createdAt: null,
          driving_licence_front_url: (localDriver as any).drivingLicenceFrontUrl || null,
          driving_licence_back_url: (localDriver as any).drivingLicenceBackUrl || null,
          dbs_certificate_url: (localDriver as any).dbsCertificateUrl || null,
          goods_in_transit_insurance_url: (localDriver as any).goodsInTransitInsuranceUrl || null,
          hire_reward_insurance_url: (localDriver as any).hireRewardInsuranceUrl || null,
          profile_picture_url: (localDriver as any).profilePictureUrl || null,
          vehicle_registration: localDriver.vehicleRegistration || null,
          vehicle_make: (localDriver as any).vehicleMake || null,
          vehicle_model: (localDriver as any).vehicleModel || null,
          vehicle_color: (localDriver as any).vehicleColor || null,
          is_active: localDriver.isActive ?? true,
        });
      }

      res.json(driverUsers);
    } catch (err) {
      console.error("Error in supabase-drivers:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }));

  app.get("/api/users", asyncHandler(async (req, res) => {
    const { role, isActive, includeInactive } = req.query;
    const users = await storage.getUsers({
      role: role as string | undefined,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      includeInactive: includeInactive === "true",
    });
    res.json(users);
  }));

  app.get("/api/users/:id", asyncHandler(async (req, res) => {
    let user = await storage.getUser(req.params.id);
    if (!user) {
      const supabaseAdmin = (await import('./supabaseAdmin')).supabaseAdmin;
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase admin not configured" });
      }
      try {
        const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
        if (!error && authUser?.user) {
          const metadata = authUser.user.user_metadata || {};
          const createData = {
            id: req.params.id,
            email: authUser.user.email || '',
            fullName: metadata.fullName || metadata.full_name || '',
            phone: metadata.phone || null,
            postcode: metadata.postcode || null,
            address: metadata.address || null,
            buildingName: metadata.buildingName || null,
            role: metadata.role || 'customer',
            userType: metadata.userType || 'individual',
            companyName: metadata.companyName || null,
            registrationNumber: metadata.registrationNumber || null,
            isActive: true,
            payLaterEnabled: metadata.payLaterEnabled || false,
          };
          user = await storage.createUserWithId(req.params.id, createData);
          console.log(`[Users] Auto-created user ${req.params.id} from Supabase auth`);
        }
      } catch (syncError) {
        console.error('Error syncing user from Supabase:', syncError);
      }
    }
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  }));

  app.patch("/api/users/:id", asyncHandler(async (req, res) => {
    let user = await storage.getUser(req.params.id);
    
    if (!user) {
      // User doesn't exist in local DB, create them first
      const createData = {
        id: req.params.id,
        email: req.body.email || '',
        fullName: req.body.fullName || '',
        phone: req.body.phone || null,
        postcode: req.body.postcode || null,
        address: req.body.address || null,
        buildingName: req.body.buildingName || null,
        role: req.body.role || 'customer',
        userType: req.body.userType || 'individual',
        isActive: true,
      };
      user = await storage.createUser(createData);
    }
    
    // Now update with the provided data
    const updatedUser = await storage.updateUser(req.params.id, req.body);
    
    // Sync payLaterEnabled to Supabase user_metadata so it survives server restarts
    if (req.body.payLaterEnabled !== undefined) {
      try {
        const supabaseAdmin = (await import('./supabaseAdmin')).supabaseAdmin;
        if (!supabaseAdmin) {
          console.warn('Supabase admin not configured, skipping payLaterEnabled sync');
        } else {
          await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
            user_metadata: { payLaterEnabled: req.body.payLaterEnabled }
          });
          console.log(`[Users] Synced payLaterEnabled=${req.body.payLaterEnabled} to Supabase for user ${req.params.id}`);
        }
      } catch (syncError) {
        console.error('Error syncing payLaterEnabled to Supabase:', syncError);
      }
    }
    
    res.json(updatedUser);
  }));

  // Self-service account deletion — authenticated user deletes their OWN account
  app.delete("/api/account", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify the token and get the caller's auth UUID
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const authUUID = authUser.id;
    const userEmail = authUser.email;
    console.log(`[Account Delete] Self-delete requested for auth UUID: ${authUUID}, email: ${userEmail}`);

    // 1. Soft-delete driver record if this user is a driver (preserve job history)
    try {
      const { data: driverRow } = await supabaseAdmin.from('drivers').select('id').eq('id', authUUID).maybeSingle();
      if (driverRow) {
        await supabaseAdmin.from('drivers').update({
          is_active: false,
          online_status: 'offline',
          deactivated_at: new Date().toISOString(),
        }).eq('id', authUUID);
        console.log('[Account Delete] Soft-deleted driver record');
      }
    } catch (e) {
      console.error('[Account Delete] Exception soft-deleting driver record:', e);
    }

    // 2. Delete from Supabase users table by auth_id
    try {
      const { error } = await supabaseAdmin.from('users').delete().eq('auth_id', authUUID);
      if (error) console.error('[Account Delete] Error removing from users table:', error.message);
      else console.log('[Account Delete] Removed from users table');
    } catch (e) {
      console.error('[Account Delete] Exception removing from users table:', e);
    }

    // 3. Delete from storage layer — SupabaseStorage.deleteUser tries auth_id first
    try {
      await storage.deleteUser(authUUID);
    } catch (e) {
      console.error('[Account Delete] Exception in storage.deleteUser:', e);
    }

    // 4. Delete from Supabase Auth — this invalidates all sessions immediately
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authUUID);
    if (authDeleteError) {
      console.error('[Account Delete] Error deleting from Supabase Auth:', authDeleteError.message);
      return res.status(500).json({ error: 'Failed to delete account. Please contact support.' });
    }

    console.log(`[Account Delete] Account permanently deleted: ${userEmail}`);
    res.json({ success: true, message: 'Account permanently deleted' });
  }));

  // Mobile app alias: POST /api/account/delete (same logic as DELETE /api/account)
  app.post("/api/account/delete", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const authUUID = authUser.id;
    const userEmail = authUser.email;
    console.log(`[Account Delete Mobile] Self-delete for auth UUID: ${authUUID}, email: ${userEmail}`);

    // Soft-delete driver record if this user is a driver
    try {
      const { data: driverRow } = await supabaseAdmin.from('drivers').select('id').eq('id', authUUID).maybeSingle();
      if (driverRow) {
        await supabaseAdmin.from('drivers').update({
          is_active: false,
          online_status: 'offline',
          deactivated_at: new Date().toISOString(),
        }).eq('id', authUUID);
        console.log('[Account Delete Mobile] Soft-deleted driver record');
      }
    } catch (e) {
      console.error('[Account Delete Mobile] Exception soft-deleting driver record:', e);
    }

    // Delete from Supabase users table
    try {
      await supabaseAdmin.from('users').delete().eq('auth_id', authUUID);
      console.log('[Account Delete Mobile] Removed from users table');
    } catch (e) {
      console.error('[Account Delete Mobile] Exception removing from users table:', e);
    }

    // Delete from storage layer
    try {
      await storage.deleteUser(authUUID);
    } catch (e) {
      console.error('[Account Delete Mobile] Exception in storage.deleteUser:', e);
    }

    // Delete from Supabase Auth — broadcasts USER_DELETED event to all connected clients
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authUUID);
    if (authDeleteError) {
      console.error('[Account Delete Mobile] Error deleting from Supabase Auth:', authDeleteError.message);
      return res.status(500).json({ error: 'Failed to delete account. Please contact support.' });
    }

    console.log(`[Account Delete Mobile] Account permanently deleted: ${userEmail}`);
    res.json({ success: true, message: 'Account permanently deleted' });
  }));

  // Delete customer (admin only) - using requireAdminAccessStrict middleware directly
  app.delete("/api/users/:id", requireAdminAccessStrict, asyncHandler(async (req, res) => {
    console.log(`[Users DELETE] Route hit for id: ${req.params.id}, admin verified`);
    
    // Admin already verified by middleware
    
    const userId = req.params.id;
    console.log(`[Users] Attempting to delete customer: ${userId}`);
    
    // 1. Get user info first to find auth_id
    const user = await storage.getUser(userId);
    const userEmail = user?.email;
    const authId = (user as any)?.authId || (user as any)?.auth_id;
    
    console.log(`[Users] Found user: email=${userEmail}, authId=${authId}`);
    
    // 2. Delete from Supabase users table (try numeric ID first, then auth_id)
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        const numericId = parseInt(userId, 10);
        let deleteError = null;
        
        // Try deleting by numeric ID first
        if (!isNaN(numericId)) {
          const { error } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', numericId);
          deleteError = error;
          if (!error) {
            console.log(`[Users] Deleted from Supabase users table by id ${numericId}`);
          }
        }
        
        // If that failed and we have authId, try by auth_id
        if (deleteError && authId) {
          const { error } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('auth_id', authId);
          if (!error) {
            console.log(`[Users] Deleted from Supabase users table by auth_id ${authId}`);
            deleteError = null;
          }
        }
        
        if (deleteError) {
          console.error(`Failed to delete user from Supabase users table:`, deleteError);
        }
      }
    } catch (e) {
      console.error("Failed to delete from Supabase users table:", e);
    }
    
    // 3. Delete from Supabase Auth (requires UUID auth_id)
    if (authId) {
      try {
        const { supabaseAdmin } = await import("./supabaseAdmin");
        if (supabaseAdmin) {
          const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);
          if (error) {
            console.error(`Failed to delete auth user:`, error);
          } else {
            console.log(`[Users] Deleted from Supabase Auth`);
          }
        }
      } catch (e) {
        console.error("Failed to delete from Supabase Auth:", e);
      }
    } else {
      console.log(`[Users] No auth_id found, skipping Supabase Auth deletion`);
    }
    
    // 4. Delete from storage
    try {
      await storage.deleteUser(userId);
      console.log(`[Users] Deleted from storage`);
    } catch (e) {
      console.error("Failed to delete from storage:", e);
    }
    
    console.log(`[Users] DELETED customer ${userEmail || userId} from all systems`);
    res.json({ success: true, message: "Customer permanently deleted" });
  }));

  // Admin endpoint to update Pay Later status by email
  app.post("/api/admin/update-pay-later", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED: Updating pay later is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
    const { email, payLaterEnabled } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    try {
      const supabaseAdmin = (await import('./supabaseAdmin')).supabaseAdmin;
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase admin not configured" });
      }
      
      // Find user by email
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        return res.status(500).json({ error: "Failed to list users" });
      }
      
      const user = users.users.find((u: any) => u.email === email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update user metadata
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { 
          ...user.user_metadata,
          payLaterEnabled: payLaterEnabled === true 
        }
      });
      
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      
      console.log(`[Admin] Updated payLaterEnabled=${payLaterEnabled} for user ${email} (${user.id})`);
      res.json({ 
        success: true, 
        message: `Pay Later ${payLaterEnabled ? 'enabled' : 'disabled'} for ${email}`,
        userId: user.id
      });
    } catch (e: any) {
      console.error('Error updating Pay Later status:', e);
      res.status(500).json({ error: e.message });
    }
  }));

  // Admin endpoint to manually trigger Stripe sync (not auto-run on startup)
  app.post("/api/admin/sync-stripe", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED: Stripe sync is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
    try {
      const { triggerStripeSync } = await import('./index');
      const result = await triggerStripeSync();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Stripe sync failed' });
    }
  }));

  app.post("/api/users/:id/deactivate", asyncHandler(async (req, res) => {
    const userId = req.params.id;
    
    // Get the user first
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Deactivate user
    const deactivatedUser = await storage.deactivateUser(userId);
    if (!deactivatedUser) {
      return res.status(500).json({ error: "Failed to deactivate user" });
    }
    
    // If user is a driver, deactivate driver record too
    const driver = await storage.getDriverByUserId(userId);
    if (driver) {
      await storage.deactivateDriver(driver.id);
      
      // Sync to PostgreSQL
      try {
        const { db } = await import("./db");
        const { drivers: driversTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        
        await db.update(driversTable).set({ 
          isActive: false, 
          deactivatedAt: new Date(),
          isAvailable: false
        }).where(eq(driversTable.userId, userId));
        console.log(`[Users] Synced driver deactivation to PostgreSQL for user ${userId}`);
      } catch (e) {
        console.error("Failed to sync driver deactivation to PostgreSQL:", e);
      }
    }
    
    console.log(`[Users] Deactivated user ${userId}`);
    res.json({ success: true, message: "Account deactivated successfully", user: deactivatedUser });
  }));

  app.post("/api/users/:id/reactivate", asyncHandler(async (req, res) => {
    const userId = req.params.id;
    
    // Get the user (include inactive)
    const allUsers = await storage.getUsers({ includeInactive: true });
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Reactivate user
    const reactivatedUser = await storage.reactivateUser(userId);
    if (!reactivatedUser) {
      return res.status(500).json({ error: "Failed to reactivate user" });
    }
    
    // If user is a driver, reactivate driver record too
    const allDrivers = await storage.getDrivers({ includeInactive: true });
    const driver = allDrivers.find(d => d.userId === userId);
    if (driver) {
      await storage.reactivateDriver(driver.id);
      
      // Sync to PostgreSQL
      try {
        const { db } = await import("./db");
        const { drivers: driversTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        
        await db.update(driversTable).set({ 
          isActive: true, 
          deactivatedAt: null
        }).where(eq(driversTable.userId, userId));
        console.log(`[Users] Synced driver reactivation to PostgreSQL for user ${userId}`);
      } catch (e) {
        console.error("Failed to sync driver reactivation to PostgreSQL:", e);
      }
    }
    
    console.log(`[Users] Reactivated user ${userId}`);
    res.json({ success: true, message: "Account reactivated successfully", user: reactivatedUser });
  }));

  const documentsCache: {
    data: any[] | null;
    timestamp: number;
    ttl: number;
    isResolving: boolean;
    invalidate(): void;
    isValid(): boolean;
  } = {
    data: null,
    timestamp: 0,
    ttl: 600_000,
    isResolving: false,
    invalidate() { this.data = null; this.timestamp = 0; },
    isValid() { return this.data !== null && (Date.now() - this.timestamp) < this.ttl; },
  };

  app.get("/api/documents", asyncHandler(async (req, res) => {
    const { driverId, status, type } = req.query;
    const hasFilters = driverId || status || type;
    
    if (!hasFilters && documentsCache.isValid()) {
      console.log(`[Documents] Returning ${documentsCache.data!.length} cached documents`);
      return res.json(documentsCache.data);
    }
    
    if (!hasFilters && documentsCache.isResolving) {
      const waitStart = Date.now();
      while (documentsCache.isResolving && (Date.now() - waitStart) < 60_000) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (documentsCache.isValid()) {
        console.log(`[Documents] Returning ${documentsCache.data!.length} cached documents (waited)`);
        return res.json(documentsCache.data);
      }
    }
    
    if (!hasFilters) documentsCache.isResolving = true;
    
    let allDocuments: any[] = [];
    const seenIds = new Set<string>();
    
    // 1. Fetch documents from Supabase driver_documents table (where mobile app uploads)
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      if (supabaseAdmin) {
        let query = supabaseAdmin.from('driver_documents').select('*');
        
        if (driverId) {
          query = query.eq('driver_id', driverId as string);
        }
        if (status) {
          query = query.eq('status', status as string);
        }
        if (type) {
          query = query.or(`doc_type.eq.${type},document_type.eq.${type}`);
        }
        
        const { data: supabaseDocs, error } = await query.order('updated_at', { ascending: false });
        
        if (error) {
          console.error('[Documents] Supabase fetch error:', error);
        } else if (supabaseDocs) {
          supabaseDocs.forEach((doc: any) => {
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              const fileUrl = doc.file_url || doc.url || '';
              allDocuments.push({
                id: doc.id,
                driverId: doc.driver_id,
                authUserId: doc.auth_user_id || doc.driver_id,
                type: doc.doc_type || doc.document_type || doc.type || 'unknown',
                fileName: doc.file_name || fileUrl.split('/').pop() || 'document',
                fileUrl: fileUrl,
                storagePath: doc.storage_path || null,
                bucket: doc.bucket || 'driver-documents',
                mimeType: doc.mime_type || null,
                sizeBytes: doc.size_bytes || null,
                status: doc.status || 'pending',
                expiryDate: doc.expiry_date ? new Date(doc.expiry_date) : null,
                reviewedBy: doc.reviewed_by,
                reviewNotes: doc.review_notes || doc.admin_notes || null,
                uploadedAt: doc.uploaded_at ? new Date(doc.uploaded_at) : (doc.updated_at ? new Date(doc.updated_at) : null),
                reviewedAt: doc.reviewed_at ? new Date(doc.reviewed_at) : (doc.updated_at ? new Date(doc.updated_at) : null),
              });
            }
          });
          console.log(`[Documents] Fetched ${supabaseDocs.length} documents from Supabase driver_documents`);
        }
      }
    } catch (e) {
      console.error("Failed to fetch documents from Supabase:", e);
    }
    
    // 2. Also fetch from PostgreSQL database to get any legacy documents
    try {
      const { db } = await import("./db");
      const { documents: documentsTable } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      let dbDocuments;
      
      if (driverId && status && type) {
        dbDocuments = await db.select().from(documentsTable)
          .where(and(
            eq(documentsTable.driverId, driverId as string),
            eq(documentsTable.status, status as any),
            eq(documentsTable.type, type as any)
          ));
      } else if (driverId && status) {
        dbDocuments = await db.select().from(documentsTable)
          .where(and(
            eq(documentsTable.driverId, driverId as string),
            eq(documentsTable.status, status as any)
          ));
      } else if (driverId && type) {
        dbDocuments = await db.select().from(documentsTable)
          .where(and(
            eq(documentsTable.driverId, driverId as string),
            eq(documentsTable.type, type as any)
          ));
      } else if (driverId) {
        dbDocuments = await db.select().from(documentsTable)
          .where(eq(documentsTable.driverId, driverId as string));
      } else if (status) {
        dbDocuments = await db.select().from(documentsTable)
          .where(eq(documentsTable.status, status as any));
      } else if (type) {
        dbDocuments = await db.select().from(documentsTable)
          .where(eq(documentsTable.type, type as any));
      } else {
        dbDocuments = await db.select().from(documentsTable);
      }
      
      if (dbDocuments) {
        dbDocuments.forEach((doc: any) => {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            allDocuments.push(doc);
          }
        });
      }
    } catch (e) {
      console.error("Failed to fetch documents from PostgreSQL:", e);
    }
    
    // 3. Also check in-memory storage for any remaining documents
    try {
      const memDocs = await storage.getDocuments({
        driverId: driverId as string | undefined,
        status: status as string | undefined,
        type: type as string | undefined,
      });
      
      memDocs.forEach((doc: any) => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          allDocuments.push(doc);
        }
      });
    } catch (e) {
      console.error("Failed to fetch documents from memory:", e);
    }

    // 4. Deduplicate documents that point to the same physical file
    {
      const normalizeDocFileName = (name: string): string => {
        if (!name) return '';
        const base = name.replace(/\.[^.]+$/, '');
        const withoutTs = base.replace(/_\d{10,}$/, '');
        return withoutTs
          .replace(/vehicle_photos_/g, 'vehicle_photo_')
          .replace(/vehiclephotos/gi, 'vehiclephoto')
          .toLowerCase();
      };

      const extractFileName = (doc: any): string => {
        const sp = doc.storagePath || doc.fileUrl || '';
        const parts = sp.split('/');
        return parts[parts.length - 1] || '';
      };

      const dedupMap = new Map<string, any[]>();
      for (const doc of allDocuments) {
        const dId = doc.driverId || doc.authUserId || 'unknown';
        const rawFileName = extractFileName(doc);
        const normName = normalizeDocFileName(rawFileName);
        if (!normName) continue;
        const key = `${dId}::${normName}`;
        if (!dedupMap.has(key)) dedupMap.set(key, []);
        dedupMap.get(key)!.push(doc);
      }

      const keepIds = new Set<string>();
      const noDedupDocs: any[] = [];
      for (const [, docs] of Array.from(dedupMap)) {
        if (docs.length === 1) {
          keepIds.add(docs[0].id);
        } else {
          docs.sort((a: any, b: any) => {
            const da = new Date(a.uploadedAt || 0).getTime();
            const db = new Date(b.uploadedAt || 0).getTime();
            return db - da;
          });
          keepIds.add(docs[0].id);
        }
      }
      for (const doc of allDocuments) {
        const dId = doc.driverId || doc.authUserId || 'unknown';
        const rawFileName = extractFileName(doc);
        const normName = normalizeDocFileName(rawFileName);
        if (!normName) {
          noDedupDocs.push(doc);
          continue;
        }
      }

      const beforeCount = allDocuments.length;
      const deduped = allDocuments.filter(doc => {
        const dId = doc.driverId || doc.authUserId || 'unknown';
        const rawFileName = extractFileName(doc);
        const normName = normalizeDocFileName(rawFileName);
        if (!normName) return true;
        return keepIds.has(doc.id);
      });
      if (deduped.length < beforeCount) {
        console.log(`[Documents] Deduplicated: ${beforeCount} -> ${deduped.length} (removed ${beforeCount - deduped.length} duplicates)`);
      }
      allDocuments.length = 0;
      allDocuments.push(...deduped);
    }

    // Filter out documents belonging to deleted drivers
    {
      const activeDrivers = await storage.getDrivers({ includeInactive: true });
      const activeDriverIds = new Set(activeDrivers.map(d => d.id));
      // Also include userId mappings
      activeDrivers.forEach(d => {
        if (d.userId) activeDriverIds.add(d.userId);
      });
      try {
        const apps = await storage.getDriverApplications();
        apps.forEach((a: any) => {
          if (a.id) activeDriverIds.add(a.id);
        });
      } catch (e) {
        // Non-critical
      }

      const beforeOrphanFilter = allDocuments.length;
      allDocuments = allDocuments.filter(doc => {
        const docDriverId = doc.driverId || doc.authUserId;
        if (!docDriverId) return true;
        return activeDriverIds.has(docDriverId);
      });
      if (allDocuments.length < beforeOrphanFilter) {
        console.log(`[Documents] Filtered out ${beforeOrphanFilter - allDocuments.length} documents from deleted drivers`);
      }
    }
    
    const { supabaseAdmin: supabaseAdminClient } = await import('./supabaseAdmin');
    if (supabaseAdminClient) {
      const BUCKETS = ['driver-documents', 'DRIVER-DOCUMENTS'];

      const bucketPathMap = new Map<string, { docIndex: number; path: string }[]>();
      BUCKETS.forEach(b => bucketPathMap.set(b, []));

      for (let i = 0; i < allDocuments.length; i++) {
        const doc = allDocuments[i];
        if (doc.fileUrl && doc.fileUrl.startsWith('text:')) continue;
        if (doc.fileUrl && doc.fileUrl.startsWith('http')) continue;

        let storagePath = doc.storagePath || doc.fileUrl || '';
        if (storagePath.startsWith('/api/uploads/documents/')) {
          storagePath = storagePath.replace('/api/uploads/documents/', '');
        } else if (storagePath.startsWith('/uploads/documents/')) {
          storagePath = storagePath.replace('/uploads/documents/', '');
        } else if (storagePath.startsWith('/api/') || storagePath.startsWith('/uploads/')) {
          if (doc.fileUrl) doc.fileUrl = normalizeDocumentUrl(doc.fileUrl);
          continue;
        }
        if (!storagePath) {
          if (doc.fileUrl) doc.fileUrl = normalizeDocumentUrl(doc.fileUrl);
          continue;
        }

        if (storagePath.startsWith('application-pending/')) {
          storagePath = `applications/pending/${storagePath.replace('application-pending/', '')}`;
          doc.storagePath = storagePath;
        }

        const fileName = storagePath.split('/').pop() || '';
        const docType = doc.type || '';
        const did = doc.driverId || driverId || '';
        const extraPaths: string[] = [];
        if (did && docType && fileName) {
          extraPaths.push(`drivers/${did}/${docType}/${fileName}`);
          extraPaths.push(`drivers/pending/${docType}/${fileName}`);
        }
        if (did && fileName && !storagePath.startsWith(`drivers/${did}/`)) {
          extraPaths.push(`drivers/${did}/${fileName}`);
        }

        const docBucket = doc.bucket || BUCKETS[0];
        bucketPathMap.get(docBucket)!.push({ docIndex: i, path: storagePath });
        for (const ep of extraPaths) {
          if (ep !== storagePath) {
            bucketPathMap.get(docBucket)!.push({ docIndex: i, path: ep });
          }
        }
        if (docBucket === BUCKETS[0]) {
          bucketPathMap.get(BUCKETS[1])!.push({ docIndex: i, path: storagePath });
          for (const ep of extraPaths) {
            if (ep !== storagePath) {
              bucketPathMap.get(BUCKETS[1])!.push({ docIndex: i, path: ep });
            }
          }
        }
      }

      await Promise.all(BUCKETS.map(async (bucket) => {
        const entries = bucketPathMap.get(bucket) || [];
        if (entries.length === 0) return;

        const needsSigning = entries.filter(e => {
          const doc = allDocuments[e.docIndex];
          return !doc.signedUrl;
        });
        if (needsSigning.length === 0) return;
        
        const batchSize = 50;
        for (let start = 0; start < needsSigning.length; start += batchSize) {
          const batch = needsSigning.slice(start, start + batchSize);
          const paths = batch.map(e => e.path);
          try {
            const { data } = await supabaseAdminClient.storage.from(bucket).createSignedUrls(paths, 3600);
            if (data) {
              data.forEach((result: any, idx: number) => {
                if (result.signedUrl && !result.error) {
                  const docIdx = batch[idx].docIndex;
                  allDocuments[docIdx].fileUrl = result.signedUrl;
                  allDocuments[docIdx].signedUrl = result.signedUrl;
                  allDocuments[docIdx].storagePath = batch[idx].path;
                  allDocuments[docIdx].bucket = bucket;
                }
              });
            }
          } catch (_) {}
        }
      }));

      for (const doc of allDocuments) {
        if (doc.signedUrl || (doc.fileUrl && doc.fileUrl.startsWith('http')) || (doc.fileUrl && doc.fileUrl.startsWith('text:'))) continue;
        if (doc.storagePath || doc.fileUrl) {
          doc.fileMissing = true;
          if (doc.fileUrl) doc.fileUrl = normalizeDocumentUrl(doc.fileUrl);
        }
      }

      if (driverId) {
        const missingDocs = allDocuments.filter(d => d.fileMissing);
        if (missingDocs.length > 0) {
          const altPaths: { docIndex: number; paths: string[] }[] = [];
          for (let i = 0; i < allDocuments.length; i++) {
            const doc = allDocuments[i];
            if (!doc.fileMissing) continue;
            const sp = doc.storagePath || '';
            const fileUrlStr = (doc.fileUrl || '') as string;
            const fileName = sp.split('/').pop() || fileUrlStr.split('/').pop() || doc.fileName || '';
            if (!fileName) continue;
            const docType = doc.type || '';
            const alts = [
              `drivers/${driverId}/${docType}/${fileName}`,
              `drivers/pending/${docType}/${fileName}`,
              `${driverId}/${fileName}`,
              `${driverId}/${docType}/${fileName}`,
              `applications/${driverId}/${fileName}`,
              `applications/pending/${fileName}`,
              `application-pending/${fileName}`,
              `drivers/${driverId}/${fileName}`,
              `drivers/pending/${fileName}`,
              sp,
            ];
            altPaths.push({ docIndex: i, paths: [...new Set(alts.filter(p => p && p !== ''))] });
          }

          for (const bucket of BUCKETS) {
            for (const alt of altPaths) {
              if (allDocuments[alt.docIndex].signedUrl) continue;
              for (const tryPath of alt.paths) {
                try {
                  const { data } = await supabaseAdminClient.storage.from(bucket).createSignedUrl(tryPath, 3600);
                  if (data?.signedUrl) {
                    const doc = allDocuments[alt.docIndex];
                    doc.fileUrl = data.signedUrl;
                    doc.signedUrl = data.signedUrl;
                    doc.storagePath = tryPath;
                    doc.bucket = bucket;
                    doc.fileMissing = false;
                    if (doc.id) {
                      supabaseAdminClient.from('driver_documents')
                        .update({ storage_path: tryPath, bucket, file_url: tryPath })
                        .eq('id', doc.id)
                        .then(() => console.log(`[Documents] Fixed storage path for doc ${doc.id}: ${tryPath}`))
                        .catch(() => {});
                    }
                    break;
                  }
                } catch (_) {}
              }
            }
          }
        }
      }

      for (const doc of allDocuments) {
        if (doc.fileMissing && doc.fileUrl && doc.fileUrl.startsWith('/api/uploads/')) {
          const localPath = doc.fileUrl.replace(/^\/api\/uploads\//, '');
          const fullPath = path.join(process.cwd(), 'uploads', localPath);
          try {
            if (fs.existsSync(fullPath)) {
              doc.fileMissing = false;
            }
          } catch (_) {}
        }
      }

      allDocuments = allDocuments.filter(doc => {
        if (!doc.fileUrl && !doc.storagePath) return false;
        if (doc.fileMissing) return false;
        return true;
      });
    } else {
      allDocuments.forEach(doc => {
        if (doc.fileUrl && typeof doc.fileUrl === 'string') {
          const normalized = normalizeDocumentUrl(doc.fileUrl);
          if (normalized && typeof normalized === 'string') {
            doc.fileUrl = normalized;
          }
        }
      });
    }

    if (driverId) {
      // Always synthesize from driver table URL columns for any doc types not yet in the results.
      // This covers: (a) empty results, (b) application-uploaded docs not yet in driver_documents.
      try {
        const { supabaseAdmin: sbAdmin } = await import('./supabaseAdmin');
        if (sbAdmin) {
          const { data: driverRow } = await sbAdmin
            .from('drivers')
            .select('driving_licence_front_url, driving_licence_back_url, dbs_certificate_url, goods_in_transit_insurance_url, hire_reward_insurance_url, profile_picture_url')
            .eq('id', driverId as string)
            .maybeSingle();

          // Build a set of doc types already returned (using multiple type aliases)
          const existingTypesInResults = new Set(allDocuments.map((d: any) =>
            (d.type || '').toLowerCase()
          ));
          
          if (driverRow) {
            const colDocMappings = [
              { col: 'driving_licence_front_url',      type: 'driving_license',             aliases: ['drivinglicencefront','drivinglicensefront','driving_license','driving_licence_front'], label: 'Driving Licence (Front)' },
              { col: 'driving_licence_back_url',       type: 'driving_license_back',         aliases: ['drivinglicenceback','drivinglicenseback','driving_license_back','driving_licence_back'], label: 'Driving Licence (Back)' },
              { col: 'dbs_certificate_url',            type: 'dbs_certificate',              aliases: ['dbscertificate','dbs_certificate'], label: 'DBS Certificate' },
              { col: 'goods_in_transit_insurance_url', type: 'goods_in_transit_insurance',   aliases: ['goodsintransitinsurance','goods_in_transit_insurance'], label: 'Goods in Transit Insurance' },
              { col: 'hire_reward_insurance_url',      type: 'hire_and_reward_insurance',    aliases: ['hirerewardinsurance','hire_and_reward_insurance','hire_reward_insurance','hirereward'], label: 'Hire & Reward Insurance' },
              { col: 'profile_picture_url',            type: 'profile_picture',              aliases: ['profilepicture','profile_picture'], label: 'Profile Picture' },
            ];
            const columnPaths: string[] = [];
            const columnDocs: any[] = [];
            for (const m of colDocMappings) {
              const url = (driverRow as any)[m.col];
              // Skip if this doc type is already represented in results
              const alreadyExists = m.aliases.some((a: string) => existingTypesInResults.has(a));
              if (url && typeof url === 'string' && !url.startsWith('text:') && !alreadyExists) {
                const storagePath = url.startsWith('http') ? (extractStoragePath(url) || url) : url;
                columnPaths.push(storagePath);
                columnDocs.push({
                  id: `col-${driverId}-${m.type}`,
                  driverId: driverId as string,
                  authUserId: driverId as string,
                  type: m.type,
                  fileName: m.label,
                  fileUrl: url,
                  storagePath,
                  bucket: 'DRIVER-DOCUMENTS',
                  status: 'approved',
                  uploadedAt: new Date(),
                });
              }
            }
            if (columnDocs.length > 0) {
              const BUCKETS_TO_TRY = ['DRIVER-DOCUMENTS', 'driver-documents'];
              let signedAny = false;
              for (const bucket of BUCKETS_TO_TRY) {
                try {
                  const { data: signedData } = await sbAdmin.storage.from(bucket).createSignedUrls(columnPaths, 3600);
                  if (signedData) {
                    let found = 0;
                    signedData.forEach((result: any, idx: number) => {
                      if (result.signedUrl && !result.error) {
                        columnDocs[idx].fileUrl = result.signedUrl;
                        columnDocs[idx].signedUrl = result.signedUrl;
                        columnDocs[idx].bucket = bucket;
                        found++;
                      }
                    });
                    if (found > 0) {
                      allDocuments.push(...columnDocs.filter(d => d.signedUrl));
                      console.log(`[Documents] Synthesized ${found} missing docs from driver column URLs for ${driverId}`);
                      signedAny = true;
                      break;
                    }
                  }
                } catch (_) {}
              }
              if (!signedAny) {
                // Add unsigned — the file serving layer will handle these
                allDocuments.push(...columnDocs);
                console.log(`[Documents] Added ${columnDocs.length} unsigned docs from driver columns for ${driverId}`);
              }
            }
          }
        }
      } catch (colErr) {
        console.error('[Documents] Driver column URL fallback error:', colErr);
      }
    }

    if (driverId && allDocuments.length === 0) {
      try {
        const { supabaseAdmin: sbAdmin } = await import('./supabaseAdmin');
        if (sbAdmin) {
          const BUCKETS = ['driver-documents', 'DRIVER-DOCUMENTS'];
          const searchPaths = [
            `drivers/${driverId}`,
            `${driverId}`,
            `applications/${driverId}`,
          ];

          const docTypeFromPath = (folder: string): string => {
            const map: Record<string, string> = {
              driving_licence_front: 'driving_licence_front',
              driving_licence_back: 'driving_licence_back',
              driving_license_front: 'driving_licence_front',
              driving_license_back: 'driving_licence_back',
              dbs_certificate: 'dbs_certificate',
              goods_in_transit_insurance: 'goods_in_transit_insurance',
              hire_and_reward_insurance: 'hire_and_reward_insurance',
              hire_reward_insurance: 'hire_and_reward_insurance',
              proof_of_identity: 'proof_of_identity',
              proof_of_address: 'proof_of_address',
              profile_picture: 'profile_picture',
              vehicle_photo_front: 'vehicle_photo_front',
              vehicle_photo_back: 'vehicle_photo_back',
              vehicle_photo_left: 'vehicle_photo_left',
              vehicle_photo_right: 'vehicle_photo_right',
              vehicle_photo_load_space: 'vehicle_photo_load_space',
              vehicle_photos_front: 'vehicle_photo_front',
              vehicle_photos_back: 'vehicle_photo_back',
              vehicle_photos_left: 'vehicle_photo_left',
              vehicle_photos_right: 'vehicle_photo_right',
              'vehicle_photos_load space': 'vehicle_photo_load_space',
              vehicle_photos_load_space: 'vehicle_photo_load_space',
            };
            return map[folder] || folder;
          };

          const discoveredPaths: { bucket: string; path: string; type: string; name: string }[] = [];

          await Promise.all(BUCKETS.flatMap(bucket =>
            searchPaths.map(async (basePath) => {
              try {
                const { data: items } = await sbAdmin.storage.from(bucket).list(basePath, { limit: 100 });
                if (!items) return;
                for (const item of items) {
                  if (!item.id || item.name === '.emptyFolderPlaceholder') continue;
                  if (item.metadata) {
                    discoveredPaths.push({
                      bucket,
                      path: `${basePath}/${item.name}`,
                      type: basePath.split('/').pop() || 'unknown',
                      name: item.name,
                    });
                  } else {
                    try {
                      const { data: subItems } = await sbAdmin.storage.from(bucket).list(`${basePath}/${item.name}`, { limit: 100 });
                      if (subItems) {
                        for (const sub of subItems) {
                          if (!sub.id || sub.name === '.emptyFolderPlaceholder') continue;
                          discoveredPaths.push({
                            bucket,
                            path: `${basePath}/${item.name}/${sub.name}`,
                            type: docTypeFromPath(item.name),
                            name: sub.name,
                          });
                        }
                      }
                    } catch (_) {}
                  }
                }
              } catch (_) {}
            })
          ));

          if (discoveredPaths.length > 0) {
            const dedupPaths = new Map<string, typeof discoveredPaths[0]>();
            for (const dp of discoveredPaths) {
              const key = `${dp.type}::${dp.name}`;
              if (!dedupPaths.has(key)) dedupPaths.set(key, dp);
            }
            const uniquePaths = Array.from(dedupPaths.values());

            const byBucket = new Map<string, typeof uniquePaths>();
            for (const dp of uniquePaths) {
              if (!byBucket.has(dp.bucket)) byBucket.set(dp.bucket, []);
              byBucket.get(dp.bucket)!.push(dp);
            }

            await Promise.all(Array.from(byBucket.entries()).map(async ([bucket, paths]) => {
              try {
                const { data } = await sbAdmin.storage.from(bucket).createSignedUrls(
                  paths.map(p => p.path), 3600
                );
                if (data) {
                  data.forEach((result: any, idx: number) => {
                    if (result.signedUrl && !result.error) {
                      allDocuments.push({
                        id: `storage-${bucket}-${paths[idx].path.replace(/\//g, '-')}`,
                        driverId: driverId as string,
                        authUserId: driverId as string,
                        type: paths[idx].type,
                        fileName: paths[idx].name,
                        fileUrl: result.signedUrl,
                        signedUrl: result.signedUrl,
                        storagePath: paths[idx].path,
                        bucket,
                        status: 'pending',
                        uploadedAt: new Date(),
                      });
                    }
                  });
                }
              } catch (_) {}
            }));

            console.log(`[Documents] Storage scan for driver ${driverId}: found ${allDocuments.length} files`);
          }
        }
      } catch (e) {
        console.error('[Documents] Storage scan fallback error:', e);
      }
    }

    allDocuments.sort((a, b) => {
      const dateA = new Date(a.uploadedAt || 0).getTime();
      const dateB = new Date(b.uploadedAt || 0).getTime();
      return dateB - dateA;
    });

    try {
      const uniqueDriverIds = [...new Set(allDocuments.map((d: any) => d.driverId).filter(Boolean))] as string[];
      const { supabaseAdmin: sbClient } = await import('./supabaseAdmin');
      if (uniqueDriverIds.length > 0 && sbClient) {
        const { data: driverRows, error: driverErr } = await sbClient
          .from('drivers')
          .select('id, full_name, driver_code, email')
          .in('id', uniqueDriverIds);
        
        if (driverErr) {
          console.error('[Documents] Driver lookup error:', driverErr);
        }
        
        if (driverRows && driverRows.length > 0) {
          const driverLookup = new Map<string, { name: string; code: string }>();
          for (const d of driverRows) {
            driverLookup.set(d.id, {
              name: d.full_name || d.email || '',
              code: d.driver_code || '',
            });
          }
          let enriched = 0;
          const missingDriverIds: string[] = [];
          for (const doc of allDocuments) {
            const info = driverLookup.get(doc.driverId);
            if (info) {
              doc.driverName = info.name;
              doc.driverCode = info.code;
              enriched++;
            } else if (!doc.driverName) {
              if (!missingDriverIds.includes(doc.driverId)) {
                missingDriverIds.push(doc.driverId);
              }
            }
          }
          
          if (missingDriverIds.length > 0) {
            try {
              const { data: authUsers } = await sbClient.auth.admin.listUsers();
              if (authUsers?.users) {
                const authLookup = new Map<string, string>();
                for (const u of authUsers.users) {
                  authLookup.set(u.id, u.email || u.user_metadata?.full_name || '');
                }
                for (const doc of allDocuments) {
                  if (!doc.driverName && missingDriverIds.includes(doc.driverId)) {
                    const email = authLookup.get(doc.driverId);
                    if (email) {
                      doc.driverName = email;
                      doc.driverCode = '';
                      enriched++;
                    } else {
                      doc.driverName = 'Deleted Driver';
                      doc.driverCode = doc.driverId.slice(0, 8);
                    }
                  }
                }
              }
            } catch (authErr) {
              for (const doc of allDocuments) {
                if (!doc.driverName && missingDriverIds.includes(doc.driverId)) {
                  doc.driverName = 'Deleted Driver';
                  doc.driverCode = doc.driverId.slice(0, 8);
                }
              }
            }
          }
          console.log(`[Documents] Enriched ${enriched}/${allDocuments.length} documents with driver info (${driverRows.length} drivers found, ${missingDriverIds.length} missing)`);
        }
      }
    } catch (e) {
      console.error('[Documents] Failed to enrich driver info:', e);
    }
    
    console.log(`[Documents] Returning ${allDocuments.length} total documents from all sources`);
    
    if (!hasFilters) {
      documentsCache.data = allDocuments;
      documentsCache.timestamp = Date.now();
      documentsCache.isResolving = false;
    }
    
    res.json(allDocuments);
  }));

  app.get("/api/documents/:id", asyncHandler(async (req, res) => {
    const document = await storage.getDocument(req.params.id);
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json(document);
  }));

  app.post("/api/documents", asyncHandler(async (req, res) => {
    const data = insertDocumentSchema.parse(req.body);
    const document = await storage.createDocument(data);
    res.status(201).json(document);
  }));

  app.post("/api/documents/upload", (req, res, next) => {
    uploadDocument.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message || "Invalid file" });
      }
      next();
    });
  }, asyncHandler(async (req, res) => {
    const { driverId: rawDriverId, documentType: rawDocumentType, expiryDate: rawExpiryDate } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!rawDriverId) {
      return res.status(400).json({ error: "Driver ID is required" });
    }

    if (!rawDocumentType) {
      return res.status(400).json({ error: "Document type is required" });
    }

    const safeDocumentType = sanitizePath(rawDocumentType);
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const safeOrigName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
    const finalFilename = `${safeDocumentType}_${timestamp}_${safeOrigName}`;

    const isPendingApplication = rawDriverId === 'application-pending';
    const storagePath = isPendingApplication
      ? `drivers/pending/${safeDocumentType}/${finalFilename}`
      : `${rawDriverId}/${safeDocumentType}_${timestamp}_${safeOrigName}`;

    const contentType = file.mimetype || 'application/octet-stream';
    const fileBuffer = file.buffer;

    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      console.error('[Documents] supabaseAdmin is NULL - check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
      return res.status(500).json({ error: "Storage service unavailable - Supabase not configured" });
    }

    // Try both bucket names since Supabase bucket names are case-sensitive
    const BUCKET_CANDIDATES = ['driver-documents', 'DRIVER-DOCUMENTS'];
    let supabaseUploadSuccess = false;
    let usedBucket = BUCKET_CANDIDATES[0];

    for (const bucketName of BUCKET_CANDIDATES) {
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { error: uploadErr } = await supabaseAdmin.storage
            .from(bucketName)
            .upload(storagePath, fileBuffer, { contentType, upsert: true });

          if (!uploadErr) {
            supabaseUploadSuccess = true;
            usedBucket = bucketName;
            console.log(`[Documents] Uploaded to Supabase Storage: ${bucketName}/${storagePath} (attempt ${attempt})`);
            break;
          } else {
            console.error(`[Documents] Supabase upload error bucket=${bucketName} (attempt ${attempt}/${maxRetries}):`, uploadErr.message);
          }
        } catch (supaErr: any) {
          console.error(`[Documents] Supabase upload failed bucket=${bucketName} (attempt ${attempt}/${maxRetries}):`, supaErr?.message || supaErr);
        }
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      if (supabaseUploadSuccess) break;
      console.log(`[Documents] Bucket '${bucketName}' failed, trying next candidate...`);
    }

    if (!supabaseUploadSuccess) {
      console.error('[Documents] ALL bucket candidates failed for upload. Check Supabase Storage buckets exist.');
      return res.status(500).json({ error: "Failed to upload document to storage. Please try again." });
    }

    if (isPendingApplication) {
      console.log(`[Documents] Uploaded document for pending application: ${safeDocumentType}`);
      documentsCache.invalidate();
      return res.status(201).json({
        success: true,
        fileUrl: storagePath,
        storagePath,
        bucket: usedBucket,
        fileName: file.originalname,
        type: safeDocumentType,
        message: "Document uploaded successfully for application"
      });
    }

    const docId = randomUUID();
    const uploadedAt = new Date();
    const expiryDate = rawExpiryDate ? new Date(rawExpiryDate) : null;

    const immediateResponse = {
      id: docId,
      driverId: rawDriverId,
      type: safeDocumentType,
      fileName: file.originalname,
      fileUrl: storagePath,
      status: 'pending',
      uploadedAt,
      expiryDate,
      storagePath,
      bucket: usedBucket,
    };

    res.status(201).json(immediateResponse);

    const bgSupa = supabaseAdmin;
    setImmediate(async () => {
      try {
        await bgSupa.from('driver_documents')
          .update({ auth_user_id: rawDriverId })
          .eq('driver_id', rawDriverId)
          .is('auth_user_id', null);

        const docRecord: any = {
          driver_id: rawDriverId,
          auth_user_id: rawDriverId,
          doc_type: safeDocumentType,
          file_url: storagePath,
          bucket: usedBucket,
          storage_path: storagePath,
          file_name: file.originalname,
          mime_type: contentType,
          size_bytes: fileBuffer.length,
          status: 'pending',
          uploaded_at: uploadedAt.toISOString(),
        };

        const { error: upsertErr } = await bgSupa.from('driver_documents')
          .upsert(docRecord, { onConflict: 'auth_user_id,doc_type', ignoreDuplicates: false });

        if (upsertErr) {
          console.error('[Documents] Failed to upsert driver_documents:', upsertErr);
        } else {
          console.log(`[Documents] Upserted driver_documents record with storage_path: ${storagePath}`);
        }

        // Also update the drivers table URL columns so the mobile app sees the document
        const docTypeToDriverField: Record<string, string> = {
          'driving_license':              'driving_licence_front_url',
          'driving_licence_front':        'driving_licence_front_url',
          'driving_license_back':         'driving_licence_back_url',
          'driving_licence_back':         'driving_licence_back_url',
          'hire_and_reward_insurance':    'hire_reward_insurance_url',
          'hire_reward_insurance':        'hire_reward_insurance_url',
          'goods_in_transit_insurance':   'goods_in_transit_insurance_url',
          'dbs_certificate':              'dbs_certificate_url',
          'profile_picture':              'profile_picture_url',
        };
        const driverField = docTypeToDriverField[safeDocumentType];
        if (driverField && rawDriverId !== 'application-pending') {
          const { error: driverUpdateErr } = await bgSupa
            .from('drivers')
            .update({ [driverField]: storagePath, updated_at: new Date().toISOString() })
            .eq('id', rawDriverId);
          if (driverUpdateErr) {
            console.error(`[Documents] Failed to update drivers.${driverField}:`, driverUpdateErr.message);
          } else {
            console.log(`[Documents] Updated drivers.${driverField} = ${storagePath}`);
          }
        }
      } catch (e) {
        console.error('[Documents] Background upsert failed:', e);
      }

      try {
        const memoryDocs = await storage.getDocuments({ driverId: rawDriverId, type: rawDocumentType as any });
        const existingDocId = memoryDocs?.[0]?.id || null;

        if (existingDocId) {
          await storage.updateDocument(existingDocId, {
            fileName: file.originalname,
            fileUrl: storagePath,
            status: 'pending' as const,
            uploadedAt,
            expiryDate,
            reviewedBy: null,
            reviewNotes: null,
            reviewedAt: null,
          });
        } else {
          await storage.createDocument({
            driverId: rawDriverId,
            type: safeDocumentType,
            fileName: file.originalname,
            fileUrl: storagePath,
            status: 'pending',
            expiryDate,
          });
        }
      } catch (e) {
        console.error('[Documents] Background storage sync failed:', e);
      }

      try {
        const { db: bgDb } = await import("./db");
        const { documents: documentsTable } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const [existingPgDoc] = await bgDb.select().from(documentsTable)
          .where(and(eq(documentsTable.driverId, rawDriverId), eq(documentsTable.type, safeDocumentType as any)));
        if (existingPgDoc) {
          await bgDb.update(documentsTable).set({
            fileName: file.originalname,
            fileUrl: storagePath,
            status: 'pending',
            uploadedAt,
            expiryDate,
          }).where(eq(documentsTable.id, existingPgDoc.id));
        } else {
          await bgDb.insert(documentsTable).values({
            id: docId,
            driverId: rawDriverId,
            type: safeDocumentType,
            fileName: file.originalname,
            fileUrl: storagePath,
            status: 'pending',
            expiryDate,
            uploadedAt,
          }).catch(() => {});
        }
      } catch (e) {
        console.error('[Documents] Background PG sync failed:', e);
      }

      let driverName = rawDriverId;
      try {
        const d = await storage.getDriver(rawDriverId);
        if (d?.fullName) driverName = d.fullName;
      } catch {}

      const formattedDocType = rawDocumentType
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase())
        .trim();

      broadcastDocumentPending({
        id: docId,
        driverId: rawDriverId,
        driverName,
        type: safeDocumentType,
        fileName: file.originalname,
        uploadedAt,
      });

      sendDocumentUploadNotification(driverName, formattedDocType).catch(err =>
        console.error('Failed to send document upload notification:', err)
      );

      documentsCache.invalidate();
    });
  }));

  // Profile picture upload endpoint
  app.post("/api/drivers/:driverId/profile-picture", (req, res, next) => {
    uploadDocument.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message || "Invalid file" });
      }
      next();
    });
  }, asyncHandler(async (req, res) => {
    const { driverId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedImageTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: "Only image files are allowed for profile pictures" });
    }

    const timestamp = Date.now();
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const finalFilename = `profile_picture_${timestamp}${ext}`;
    const BUCKET = 'DRIVER-DOCUMENTS';
    const storagePath = `${driverId}/profile_picture_${timestamp}${ext}`;
    const contentType = file.mimetype || 'image/jpeg';
    const fileBuffer = file.buffer;

    const { supabaseAdmin: supAdmin } = await import('./supabaseAdmin');
    if (!supAdmin) {
      return res.status(500).json({ error: "Storage service unavailable" });
    }

    const { error: uploadErr } = await supAdmin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, { contentType, upsert: true });

    if (uploadErr) {
      console.error('[Profile Picture] Supabase upload failed:', uploadErr);
      return res.status(500).json({ error: "Failed to upload profile picture" });
    }

    console.log(`[Profile Picture] Uploaded to Supabase: ${BUCKET}/${storagePath}`);

    const { data: signedData } = await supAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    const signedUrl = signedData?.signedUrl || '';

    try {
      await supAdmin.from('driver_documents')
        .delete()
        .eq('driver_id', driverId)
        .eq('doc_type', 'profile_picture');

      await supAdmin.from('driver_documents')
        .insert({
          driver_id: driverId,
          auth_user_id: driverId,
          doc_type: 'profile_picture',
          file_url: storagePath,
          bucket: BUCKET,
          storage_path: storagePath,
          file_name: file.originalname,
          mime_type: contentType,
          size_bytes: fileBuffer.length,
          status: 'approved',
          uploaded_at: new Date().toISOString(),
        });
    } catch (e) {
      console.error('[Profile Picture] Failed to upsert driver_documents:', e);
    }

    await storage.updateDriver(driverId, { profilePictureUrl: storagePath });

    try {
      const { db } = await import("./db");
      const { drivers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(drivers).set({
        profilePictureUrl: storagePath,
      }).where(eq(drivers.id, driverId));
    } catch (e) {
      console.error("Failed to update profile picture in PostgreSQL:", e);
    }

    const { data: publicUrlData } = supAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicUrlData?.publicUrl || storagePath;
    console.log(`[Profile Picture] Generated public URL: ${publicUrl}`);

    try {
      await supAdmin
        .from('drivers')
        .update({
          profile_picture_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', driverId);
    } catch (e) {
      console.error("[Profile Picture] Supabase driver update failed:", e);
    }

    broadcastProfileUpdate(driverId, {
      profilePictureUrl: storagePath,
      profile_picture_url: publicUrl,
    });

    res.status(200).json({
      success: true,
      storagePath,
      publicUrl,
      bucket: BUCKET,
      signedUrl,
      profilePictureUrl: storagePath,
      message: "Profile picture uploaded successfully"
    });
  }));

  app.patch("/api/documents/:id/review", asyncHandler(async (req, res) => {
    // ADMIN REQUIRED: Document review is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
    const { status, reviewedBy, reviewNotes } = req.body;
    const reviewedAt = new Date();
    
    let document: any = null;
    let supabaseUpdated = false;
    
    // Check if ID looks like a UUID (contains hyphens) vs a bigint
    const isUuidId = req.params.id.includes('-');
    const docId = isUuidId ? req.params.id : parseInt(req.params.id, 10);
    
    // First try to update in Supabase driver_documents (where mobile app uploads)
    // Try both UUID and numeric IDs since mobile uploads can use either
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      // Try Supabase driver_documents for both UUID and numeric IDs
      if (supabaseAdmin) {
        // The Supabase driver_documents table only has: status, updated_at
        // It does NOT have: reviewed_by, review_notes columns
        const updateData: Record<string, any> = {
          status: status,
          updated_at: reviewedAt.toISOString(),
        };
        
        const { data: updatedDocs, error } = await supabaseAdmin
          .from('driver_documents')
          .update(updateData)
          .eq('id', req.params.id)
          .select();
        
        const updatedDoc = updatedDocs?.[0];
        if (!error && updatedDoc) {
          supabaseUpdated = true;
          console.log('[Documents] Updated document status in Supabase driver_documents:', req.params.id, '->', status);
          
          // Broadcast real-time update for document status change
          broadcastDocumentPending({
            id: updatedDoc.id,
            driverId: updatedDoc.driver_id,
            type: updatedDoc.doc_type || updatedDoc.document_type || 'unknown',
            fileName: updatedDoc.file_url?.split('/').pop() || 'document',
            uploadedAt: updatedDoc.created_at ? new Date(updatedDoc.created_at) : null,
          });
          
          // Map Supabase document to expected Document format with proper Date objects
          const fileUrl = updatedDoc.file_url || updatedDoc.url || '';
          document = {
            id: updatedDoc.id,
            driverId: updatedDoc.driver_id,
            type: updatedDoc.doc_type || updatedDoc.document_type || 'unknown',
            fileName: fileUrl.split('/').pop() || 'document',
            fileUrl: fileUrl,
            status: updatedDoc.status,
            expiryDate: updatedDoc.expiry_date ? new Date(updatedDoc.expiry_date) : null,
            reviewedBy: updatedDoc.reviewed_by,
            reviewNotes: updatedDoc.review_notes,
            uploadedAt: updatedDoc.created_at ? new Date(updatedDoc.created_at) : (updatedDoc.uploaded_at ? new Date(updatedDoc.uploaded_at) : null),
            reviewedAt: reviewedAt,
          };
          
          // Also update in-memory storage for consistency
          try {
            await storage.reviewDocument(updatedDoc.id, status, reviewedBy, reviewNotes);
          } catch (memErr) {
            // Document may not exist in memory, which is fine
            console.log('[Documents] Document not in memory storage, skipped update');
          }
          
          // IMPORTANT: Sync to PostgreSQL so auto-verification logic can find this document
          try {
            const { db } = await import("./db");
            const { documents: documentsTable } = await import("@shared/schema");
            const { eq } = await import("drizzle-orm");
            
            // Check if document exists in PostgreSQL
            const [existingPgDoc] = await db.select().from(documentsTable).where(eq(documentsTable.id, updatedDoc.id));
            
            if (existingPgDoc) {
              // Update existing record
              await db.update(documentsTable).set({
                status: status,
                reviewedBy: reviewedBy,
                reviewNotes: reviewNotes || null,
                reviewedAt: reviewedAt,
              }).where(eq(documentsTable.id, updatedDoc.id));
              console.log('[Documents] Synced Supabase document update to PostgreSQL:', updatedDoc.id);
            } else {
              // Insert new record for verification logic
              const fileUrl = updatedDoc.file_url || updatedDoc.url || '';
              const fileName = fileUrl.split('/').pop() || 'document';
              await db.insert(documentsTable).values({
                id: updatedDoc.id,
                driverId: updatedDoc.driver_id,
                type: updatedDoc.doc_type || updatedDoc.document_type || 'unknown',
                fileName: fileName,
                fileUrl: fileUrl,
                status: status,
                expiryDate: updatedDoc.expiry_date ? new Date(updatedDoc.expiry_date) : null,
                reviewedBy: reviewedBy,
                reviewNotes: reviewNotes || null,
                reviewedAt: reviewedAt,
              });
              console.log('[Documents] Inserted Supabase document into PostgreSQL for verification:', updatedDoc.id);
            }
          } catch (syncError) {
            console.error('[Documents] Failed to sync Supabase document to PostgreSQL:', syncError);
          }
        } else if (error) {
          console.log('[Documents] Document not found in Supabase, trying other sources:', error.message);
        }
      }
    } catch (e) {
      console.error('[Documents] Failed to update document in Supabase:', e);
    }
    
    // If not updated in Supabase driver_documents, try the storage layer
    // For UUID documents, this will try Supabase 'documents' table via SupabaseStorage
    if (!document) {
      console.log('[Documents] Trying storage layer for document:', req.params.id, 'isUuid:', isUuidId);
      try {
        document = await storage.reviewDocument(req.params.id, status, reviewedBy, reviewNotes);
        if (document) {
          console.log('[Documents] Updated document via storage layer:', req.params.id);
        } else {
          console.log('[Documents] Storage layer returned undefined for:', req.params.id);
        }
      } catch (storageErr: any) {
        console.log('[Documents] Storage layer error:', storageErr?.message || storageErr);
      }
    }
    
    // For UUID documents, try direct Supabase 'documents' table update
    if (!document && isUuidId) {
      try {
        const { supabaseAdmin } = await import("./supabaseAdmin");
        if (supabaseAdmin) {
          const { data: updatedDoc, error } = await supabaseAdmin
            .from('documents')
            .update({
              status: status,
              reviewed_by: reviewedBy,
              review_notes: reviewNotes || null,
              reviewed_at: reviewedAt.toISOString(),
            })
            .eq('id', req.params.id)
            .select()
            .single();
          
          if (!error && updatedDoc) {
            console.log('[Documents] Updated document in Supabase documents table:', req.params.id);
            document = {
              id: updatedDoc.id,
              driverId: updatedDoc.driver_id,
              type: updatedDoc.type || updatedDoc.doc_type || 'unknown',
              fileName: updatedDoc.file_name || 'document',
              fileUrl: updatedDoc.file_url || '',
              status: updatedDoc.status,
              expiryDate: updatedDoc.expiry_date ? new Date(updatedDoc.expiry_date) : null,
              reviewedBy: updatedDoc.reviewed_by,
              reviewNotes: updatedDoc.review_notes,
              uploadedAt: updatedDoc.uploaded_at ? new Date(updatedDoc.uploaded_at) : null,
              reviewedAt: reviewedAt,
            };
          }
        }
      } catch (e) {
        console.log('[Documents] Supabase documents table update failed:', e);
      }
    }
    
    // If not found in memory, try updating directly in PostgreSQL
    if (!document) {
      try {
        const { db } = await import("./db");
        const { documents: documentsTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        
        // Check if document exists in database
        const [existingDoc] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
        
        if (existingDoc) {
          // Update in database
          const [updatedDoc] = await db.update(documentsTable).set({
            status: status,
            reviewedBy: reviewedBy,
            reviewNotes: reviewNotes || null,
            reviewedAt: reviewedAt,
          }).where(eq(documentsTable.id, req.params.id)).returning();
          
          document = updatedDoc;
          console.log("Document review updated directly in PostgreSQL:", req.params.id);
        }
      } catch (e) {
        console.error("Failed to update document review in PostgreSQL:", e);
      }
    } else {
      // Sync review status to PostgreSQL database
      try {
        const { db } = await import("./db");
        const { documents: documentsTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        
        await db.update(documentsTable).set({
          status: document.status,
          reviewedBy: document.reviewedBy,
          reviewNotes: document.reviewNotes,
          reviewedAt: document.reviewedAt,
        }).where(eq(documentsTable.id, req.params.id));
        console.log("Document review synced to PostgreSQL:", req.params.id);
      } catch (e) {
        console.error("Failed to sync document review to PostgreSQL:", e);
      }
    }
    
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    // If document was approved, check if all required documents are now approved
    // and automatically verify the driver if so
    if (status === 'approved' && document.driverId) {
      try {
        const { db } = await import("./db");
        const { documents: documentsTable, drivers: driversTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        
        // Get driver to check vehicle type - try memory first, then PostgreSQL
        let driver = await storage.getDriver(document.driverId);
        if (!driver) {
          // Try fetching from PostgreSQL directly
          const [dbDriver] = await db.select().from(driversTable).where(eq(driversTable.id, document.driverId));
          driver = dbDriver;
        }
        
        if (driver && !driver.isVerified) {
          const vehicleType = driver.vehicleType || 'car';
          
          // Define required document types based on vehicle type
          const baseRequiredDocs = [
            'driving_license',
            'hire_and_reward_insurance',
            'goods_in_transit_insurance',
            'proof_of_identity',
            'proof_of_address',
          ];
          
          // Define vehicle photo requirements based on vehicle type
          const vehiclePhotoRequirements: Record<string, string[]> = {
            'motorbike': ['vehicle_photo_front', 'vehicle_photo_back'],
            'car': ['vehicle_photo_front', 'vehicle_photo_back'],
            'small_van': ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space'],
            'medium_van': ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space'],
          };
          
          const requiredPhotos = vehiclePhotoRequirements[vehicleType] || ['vehicle_photo_front', 'vehicle_photo_back'];
          const allRequiredDocs = [...baseRequiredDocs, ...requiredPhotos];
          
          // Fetch all driver's documents
          const driverDocuments = await db.select().from(documentsTable)
            .where(eq(documentsTable.driverId, document.driverId));
          
          // Check if all required documents are approved
          const allApproved = allRequiredDocs.every(docType => {
            const doc = driverDocuments.find((d: any) => d.type === docType);
            return doc && doc.status === 'approved';
          });
          
          if (allApproved) {
            // Automatically verify the driver - PostgreSQL is source of truth
            const [updatedDriver] = await db.update(driversTable).set({
              isVerified: true,
            }).where(eq(driversTable.id, document.driverId)).returning();
            
            if (updatedDriver) {
              // Also try to update in-memory storage for consistency
              try {
                await storage.verifyDriver(document.driverId, true);
              } catch (memError) {
                // Memory update failed, but PostgreSQL update succeeded - this is OK
                console.log(`Driver ${document.driverId} verified in database (memory sync skipped)`);
              }
              
              console.log(`Driver ${document.driverId} automatically verified - all documents approved`);
            }
          }
        }
      } catch (e) {
        console.error("Failed to auto-verify driver after document approval:", e);
      }
    }
    
    documentsCache.invalidate();
    res.json(document);
  }));

  app.delete("/api/documents/:id", asyncHandler(async (req, res) => {
    if (!enforceAdminAccess(req, res)) return;
    
    const docId = req.params.id;
    console.log('[Documents] Delete request for document:', docId);
    
    let deleted = false;
    let storagePath: string | null = null;
    
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        const { data: doc } = await supabaseAdmin
          .from('driver_documents')
          .select('*')
          .eq('id', docId)
          .single();
        
        if (doc) {
          if (doc.status !== 'rejected') {
            return res.status(400).json({ error: "Only rejected documents can be deleted" });
          }
          storagePath = doc.file_url || doc.storage_path || null;
          
          const { error } = await supabaseAdmin
            .from('driver_documents')
            .delete()
            .eq('id', docId);
          
          if (!error) {
            deleted = true;
            console.log('[Documents] Deleted from Supabase driver_documents:', docId);
          }
        }
        
        const { data: doc2 } = await supabaseAdmin
          .from('documents')
          .select('*')
          .eq('id', docId)
          .single();
        
        if (doc2) {
          if (doc2.status !== 'rejected') {
            return res.status(400).json({ error: "Only rejected documents can be deleted" });
          }
          if (!storagePath) storagePath = doc2.file_url || doc2.storage_path || null;
          
          const { error: error2 } = await supabaseAdmin
            .from('documents')
            .delete()
            .eq('id', docId);
          
          if (!error2) {
            deleted = true;
            console.log('[Documents] Deleted from Supabase documents:', docId);
          }
        }
        
        if (storagePath && supabaseAdmin) {
          const path = storagePath.replace(/^\/+/, '');
          for (const bucket of ['driver-documents', 'DRIVER-DOCUMENTS']) {
            try {
              await supabaseAdmin.storage.from(bucket).remove([path]);
              console.log(`[Documents] Deleted file from ${bucket}/${path}`);
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.error('[Documents] Supabase delete error:', e);
    }
    
    try {
      const { db } = await import("./db");
      const { documents: documentsTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.delete(documentsTable).where(eq(documentsTable.id, docId));
      deleted = true;
      console.log('[Documents] Deleted from PostgreSQL:', docId);
    } catch (e) {
      console.log('[Documents] PostgreSQL delete (may not exist):', (e as any)?.message);
    }
    
    if (!deleted) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    documentsCache.invalidate();
    res.json({ success: true, message: "Document deleted" });
  }));

  app.get("/api/documents/:id/signed-url", asyncHandler(async (req, res) => {
    const docId = req.params.id;
    
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Storage service unavailable" });
      }
      
      // Try Supabase driver_documents first
      const { data: docs, error } = await supabaseAdmin
        .from('driver_documents')
        .select('*')
        .eq('id', docId);
      
      let doc = docs?.[0];
      
      // If not found in Supabase driver_documents, check in-memory/PostgreSQL documents
      if (!doc) {
        try {
          const memDoc = await storage.getDocument(docId);
          if (memDoc) {
            doc = {
              id: memDoc.id,
              driver_id: memDoc.driverId,
              doc_type: memDoc.type,
              file_url: memDoc.fileUrl,
              storage_path: null,
              bucket: null,
              auth_user_id: null,
            };
            console.log(`[Documents] Found doc ${docId} in memory/PostgreSQL, fileUrl: ${memDoc.fileUrl}`);
          }
        } catch (memErr) {
          // Not found in memory either
        }
        
        // Also try PostgreSQL directly
        if (!doc) {
          try {
            const { db } = await import("./db");
            const { documents: documentsTable } = await import("@shared/schema");
            const { eq } = await import("drizzle-orm");
            const [pgDoc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
            if (pgDoc) {
              doc = {
                id: pgDoc.id,
                driver_id: pgDoc.driverId,
                doc_type: pgDoc.type,
                file_url: pgDoc.fileUrl,
                storage_path: null,
                bucket: null,
                auth_user_id: null,
              };
              console.log(`[Documents] Found doc ${docId} in PostgreSQL, fileUrl: ${pgDoc.fileUrl}`);
            }
          } catch (pgErr) {
            console.log(`[Documents] PostgreSQL lookup failed:`, (pgErr as any)?.message);
          }
        }
      }
      
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      const fileUrl = doc.file_url || '';
      
      if (fileUrl.startsWith('text:')) {
        return res.json({ signedUrl: fileUrl, expiresIn: 0, isText: true });
      }
      
      // If the file URL is already an HTTP URL (e.g. public Supabase URL), return it directly
      if (fileUrl.startsWith('http')) {
        return res.json({ signedUrl: fileUrl, expiresIn: 0, directUrl: true });
      }
      
      if (doc.storage_path && doc.bucket) {
        try {
          const { data: signedData, error: signError } = await supabaseAdmin.storage
            .from(doc.bucket)
            .createSignedUrl(doc.storage_path, 600);
          
          if (!signError && signedData?.signedUrl) {
            return res.json({ signedUrl: signedData.signedUrl, expiresIn: 600 });
          }
          console.error(`[Documents] Signed URL failed for ${doc.storage_path}:`, signError?.message);
        } catch (signErr) {
          console.error(`[Documents] Signed URL error:`, signErr);
        }
      }
      
      const storagePath = extractStoragePath(fileUrl) || doc.file_url;
      if (storagePath) {
        const buckets = [doc.bucket || 'driver-documents', 'DRIVER-DOCUMENTS'];
        const pathsToTry = [storagePath];

        if (!storagePath.startsWith('drivers/')) {
          pathsToTry.push(`drivers/${storagePath}`);
        }
        if (doc.driver_id) {
          const fileName = storagePath.split('/').pop();
          if (fileName) {
            pathsToTry.push(`${doc.driver_id}/${fileName}`);
            pathsToTry.push(`drivers/${doc.driver_id}/${doc.doc_type}/${fileName}`);
            pathsToTry.push(`drivers/pending/${doc.doc_type}/${fileName}`);
          }
        }
        if (doc.auth_user_id && doc.auth_user_id !== doc.driver_id) {
          const fileName = storagePath.split('/').pop();
          if (fileName) {
            pathsToTry.push(`${doc.auth_user_id}/${fileName}`);
            pathsToTry.push(`drivers/${doc.auth_user_id}/${doc.doc_type}/${fileName}`);
          }
        }

        for (const bucket of buckets) {
          for (const tryPath of pathsToTry) {
            try {
              const { data: signedData, error: signError } = await supabaseAdmin.storage
                .from(bucket)
                .createSignedUrl(tryPath, 600);
              if (!signError && signedData?.signedUrl) {
                if (doc.storage_path !== undefined && (tryPath !== doc.storage_path || bucket !== doc.bucket)) {
                  await supabaseAdmin.from('driver_documents')
                    .update({ storage_path: tryPath, bucket, file_url: tryPath })
                    .eq('id', doc.id);
                  console.log(`[Documents] Auto-fixed storage_path for doc ${doc.id}: ${tryPath}`);
                }
                return res.json({ signedUrl: signedData.signedUrl, expiresIn: 600 });
              }
            } catch (_) {}
          }
        }
      }

      const normalizedUrl = normalizeDocumentUrl(fileUrl);
      return res.json({ signedUrl: normalizedUrl || fileUrl, expiresIn: 0, fallback: true });
      
    } catch (e) {
      console.error('[Documents] Signed URL endpoint error:', e);
      return res.status(500).json({ error: "Failed to generate signed URL" });
    }
  }));

  app.get("/api/documents/:id/view", asyncHandler(async (req, res) => {
    const docId = req.params.id;
    console.log(`[DocView] ── Request ── id=${docId}`);
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) return res.status(500).send("Storage service unavailable");

      // ── helpers ──────────────────────────────────────────────────────────
      const MIME: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        svg: 'image/svg+xml',
      };

      const sendFile = (filePath: string): boolean => {
        if (!fs.existsSync(filePath)) return false;
        const ext = (filePath.split('.').pop() || '').toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.sendFile(filePath);
        return true;
      };

      const streamUrl = async (url: string, fileName: string): Promise<boolean> => {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!r.ok) { console.log(`[DocView] fetch ${url.substring(0,80)} -> ${r.status}`); return false; }
          const ext = (fileName.split('.').pop() || '').toLowerCase();
          const ct = MIME[ext] || r.headers.get('content-type') || 'application/octet-stream';
          res.setHeader('Content-Type', ct);
          res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
          res.setHeader('Cache-Control', 'private, max-age=300');
          const buf = await r.arrayBuffer();
          res.send(Buffer.from(buf));
          return true;
        } catch (e: any) {
          console.log(`[DocView] streamUrl error: ${e?.message}`);
          return false;
        }
      };

      // ── resolve document record ───────────────────────────────────────────
      let doc: any = null;

      const COL_MAP: Record<string, string> = {
        // camelCase (legacy format)
        drivingLicenceFront:         'driving_licence_front_url',
        drivingLicenceBack:          'driving_licence_back_url',
        dbsCertificate:              'dbs_certificate_url',
        goodsInTransitInsurance:     'goods_in_transit_insurance_url',
        hireAndReward:               'hire_reward_insurance_url',
        profilePicture:              'profile_picture_url',
        // snake_case (used by synthesized col- document IDs)
        driving_license:             'driving_licence_front_url',
        driving_licence_front:       'driving_licence_front_url',
        driving_license_back:        'driving_licence_back_url',
        driving_licence_back:        'driving_licence_back_url',
        dbs_certificate:             'dbs_certificate_url',
        goods_in_transit_insurance:  'goods_in_transit_insurance_url',
        hire_and_reward_insurance:   'hire_reward_insurance_url',
        hire_reward_insurance:       'hire_reward_insurance_url',
        profile_picture:             'profile_picture_url',
      };

      const resolveColDoc = async (dId: string, docType: string): Promise<any | null> => {
        const col = COL_MAP[docType];
        console.log(`[DocView] col- lookup: driverId=${dId} docType=${docType} col=${col || '(no mapping)'}`);
        if (!col || !dId) return null;
        const { data: driverRow } = await supabaseAdmin.from('drivers').select(col).eq('id', dId).maybeSingle();
        const rawUrl: string = driverRow ? (driverRow as any)[col] || '' : '';
        console.log(`[DocView] col- resolved url=${rawUrl.substring(0, 100)}`);
        if (!rawUrl) return null;
        const storagePath = extractStoragePath(rawUrl) || rawUrl;
        return { id: docId, driver_id: dId, file_url: rawUrl, storage_path: storagePath, bucket: 'DRIVER-DOCUMENTS', doc_type: docType };
      };

      if (docId.startsWith('col-')) {
        // col-{uuid}-{camelCaseType}: uuid contains 4 hyphens, type is camelCase (no hyphens)
        const withoutPrefix = docId.slice(4); // remove 'col-'
        const lastDash = withoutPrefix.lastIndexOf('-');
        const dId = withoutPrefix.slice(0, lastDash);
        const docType = withoutPrefix.slice(lastDash + 1);
        console.log(`[DocView] Parsed col-: dId=${dId} docType=${docType}`);
        doc = await resolveColDoc(dId, docType);
      }

      // Fallback: handle old-format IDs like "${uuid}-${docType}" without col- prefix
      if (!doc) {
        const knownTypes = Object.keys(COL_MAP);
        for (const t of knownTypes) {
          if (docId.endsWith(`-${t}`)) {
            const dId = docId.slice(0, docId.length - t.length - 1);
            if (dId.match(/^[0-9a-f-]{36}$/i)) {
              console.log(`[DocView] Old-format id match: dId=${dId} type=${t}`);
              doc = await resolveColDoc(dId, t);
              if (doc) break;
            }
          }
        }
      }

      // Look up by document primary key in Supabase driver_documents
      if (!doc) {
        console.log(`[DocView] Looking up in Supabase driver_documents id=${docId}`);
        const { data: dbDoc, error: sbErr } = await supabaseAdmin
          .from('driver_documents')
          .select('*')
          .eq('id', docId)
          .maybeSingle();
        if (sbErr) console.log(`[DocView] Supabase lookup error: ${sbErr.message}`);
        if (dbDoc) {
          console.log(`[DocView] Found in Supabase: doc_type=${dbDoc.doc_type} file_url=${String(dbDoc.file_url||'').substring(0,80)} storage_path=${String(dbDoc.storage_path||'').substring(0,80)} bucket=${dbDoc.bucket}`);
          doc = dbDoc;
        }
      }

      // PostgreSQL fallback — documents synced during approval or uploaded via web
      if (!doc) {
        try {
          console.log(`[DocView] Looking up in PostgreSQL documents id=${docId}`);
          const { db } = await import("./db");
          const { documents: documentsTable } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          const [pgDoc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
          if (pgDoc) {
            console.log(`[DocView] Found in PostgreSQL: type=${pgDoc.type} fileUrl=${String(pgDoc.fileUrl||'').substring(0,80)}`);
            doc = {
              id: pgDoc.id,
              driver_id: pgDoc.driverId,
              doc_type: pgDoc.type,
              file_url: pgDoc.fileUrl,
              storage_path: (pgDoc as any).storagePath || null,
              bucket: (pgDoc as any).bucket || 'DRIVER-DOCUMENTS',
              auth_user_id: null,
            };
          }
        } catch (pgErr: any) {
          console.log(`[DocView] PostgreSQL lookup failed: ${pgErr?.message}`);
        }
      }

      // Memory storage fallback
      if (!doc) {
        try {
          const memDoc = await storage.getDocument(docId);
          if (memDoc) {
            console.log(`[DocView] Found in memory storage: type=${memDoc.type} fileUrl=${String(memDoc.fileUrl||'').substring(0,80)}`);
            doc = {
              id: memDoc.id,
              driver_id: memDoc.driverId,
              doc_type: memDoc.type,
              file_url: memDoc.fileUrl,
              storage_path: null,
              bucket: 'DRIVER-DOCUMENTS',
              auth_user_id: null,
            };
          }
        } catch (_) {}
      }

      if (!doc) {
        console.log(`[DocView] ── Not found in any source: id=${docId}`);
        return res.status(404).send("Document not found");
      }

      const fileUrl: string = doc.file_url || doc.fileUrl || '';
      if (fileUrl.startsWith('text:')) return res.status(400).send("Text-only document");

      console.log(`[DocView] Resolved doc: driver_id=${doc.driver_id} doc_type=${doc.doc_type} file_url=${fileUrl.substring(0,120)} storage_path=${String(doc.storage_path||'').substring(0,80)} bucket=${doc.bucket}`);

      // ── 1. Try local disk first (fastest, most reliable for web-uploaded docs) ──
      const localCandidates: string[] = [];
      const addLocal = (p: string) => { if (p) localCandidates.push(p); };

      if (fileUrl.startsWith('/api/uploads/') || fileUrl.startsWith('/uploads/')) {
        const clean = fileUrl.replace(/^\/api\/uploads\//, '').replace(/^\/uploads\//, '');
        addLocal(path.join(process.cwd(), 'uploads', clean));
        addLocal(path.join(process.cwd(), 'uploads', 'documents', clean.replace(/^documents\//, '')));
      }
      const rawFileName = fileUrl.split('/').pop()?.split('?')[0];
      if (rawFileName && doc.driver_id) {
        addLocal(path.join(process.cwd(), 'uploads', 'documents', doc.driver_id, rawFileName));
        addLocal(path.join(process.cwd(), 'uploads', 'documents', 'application-pending', rawFileName));
      }

      for (const lp of localCandidates) {
        if (sendFile(lp)) { console.log(`[DocView] Served from disk: ${lp}`); return; }
      }

      // ── 2. Supabase Storage — generate signed URL from all candidate paths ──
      // Always extract storage path from file_url (Supabase public URLs contain the path).
      // Never rely on a public Supabase URL directly — bucket may be private.
      const pathFromUrl = extractStoragePath(fileUrl) || '';
      // storage_path column may itself be a full URL — strip it too
      const pathFromStorageCol = doc.storage_path
        ? (extractStoragePath(doc.storage_path) || (!doc.storage_path.startsWith('http') ? doc.storage_path : ''))
        : '';
      const rawStoragePath = pathFromStorageCol || pathFromUrl;

      const storagePathsToTry: string[] = [];
      const addPath = (p: string) => { if (p && !storagePathsToTry.includes(p)) storagePathsToTry.push(p); };

      if (rawStoragePath && !rawStoragePath.startsWith('http')) {
        addPath(rawStoragePath);
        if (!rawStoragePath.startsWith('drivers/')) addPath(`drivers/${rawStoragePath}`);
        const fn = rawStoragePath.split('/').pop();
        if (fn && doc.driver_id) {
          addPath(`${doc.driver_id}/${fn}`);
          addPath(`drivers/${doc.driver_id}/${doc.doc_type || ''}/${fn}`);
          addPath(`drivers/pending/${doc.doc_type || ''}/${fn}`);
        }
        if (fn && doc.auth_user_id && doc.auth_user_id !== doc.driver_id) {
          addPath(`${doc.auth_user_id}/${fn}`);
        }
      }

      // Always include {driver_id}/{filename} as a fallback path
      const rawFn = (fileUrl || '').split('/').pop()?.split('?')[0];
      if (rawFn && doc.driver_id) {
        addPath(`${doc.driver_id}/${rawFn}`);
      }

      console.log(`[DocView] Storage paths to try (${storagePathsToTry.length}):`, storagePathsToTry);

      const buckets = ['DRIVER-DOCUMENTS', 'driver-documents'];
      if (doc.bucket && !buckets.includes(doc.bucket)) buckets.unshift(doc.bucket);

      for (const bucket of buckets) {
        for (const tryPath of storagePathsToTry) {
          try {
            const { data: sd, error: se } = await supabaseAdmin.storage.from(bucket).createSignedUrl(tryPath, 600);
            if (se || !sd?.signedUrl) {
              if (se) console.log(`[DocView] signed-url fail: bucket=${bucket} path=${tryPath} err=${se.message}`);
              continue;
            }
            const fn = tryPath.split('/').pop() || 'document';
            const ok = await streamUrl(sd.signedUrl, fn);
            if (ok) {
              console.log(`[DocView] ✓ Streamed from Supabase bucket=${bucket} path=${tryPath}`);
              // Persist the correct storage_path only — never overwrite file_url
              if (doc.id && !doc.id.startsWith('col-')) {
                await supabaseAdmin.from('driver_documents')
                  .update({ storage_path: tryPath, bucket })
                  .eq('id', doc.id).catch(() => {});
              }
              return;
            }
          } catch (_) {}
        }
      }

      // ── 3. If fileUrl is a direct http URL (e.g. public Supabase), stream it ──
      if (fileUrl.startsWith('http')) {
        const fn = fileUrl.split('/').pop()?.split('?')[0] || 'document';
        console.log(`[DocView] Trying direct URL stream: ${fileUrl.substring(0,80)}`);
        const ok = await streamUrl(fileUrl, fn);
        if (ok) return;
      }

      // ── 4. Nothing worked ────────────────────────────────────────────────────
      console.log(`[DocView] ── All strategies failed for id=${docId} file_url=${fileUrl.substring(0,120)}`);
      return res.status(404).send(`Document file not found. (id=${docId})`);

    } catch (e: any) {
      console.error('[DocView] Unexpected error:', e?.message);
      return res.status(500).send("Failed to load document");
    }
  }));

  app.post("/api/admin/driver-codes/repair", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.status(500).json({ error: "Storage unavailable" });

    const { data: allDrivers, error } = await supabaseAdmin
      .from('drivers')
      .select('id, driver_code, full_name, email');

    if (error || !allDrivers) return res.status(500).json({ error: "Failed to fetch drivers" });

    const validCodeRx = /^RC\d{2}[A-Z]$/;
    const invalidDrivers = allDrivers.filter((d: any) => !d.driver_code || !validCodeRx.test(d.driver_code));

    if (invalidDrivers.length === 0) {
      return res.json({ message: "All drivers already have valid codes", repaired: 0, checked: allDrivers.length });
    }

    let repaired = 0;
    const results: { id: string; name: string; oldCode: string | null; newCode: string }[] = [];

    for (const driver of invalidDrivers) {
      try {
        const newCode = await generateUniqueDriverCode(supabaseAdmin);
        await supabaseAdmin.from('drivers').update({ driver_code: newCode }).eq('id', driver.id);
        results.push({ id: driver.id, name: driver.full_name || 'Unknown', oldCode: driver.driver_code, newCode });
        repaired++;
      } catch (e: any) {
        console.error(`[RepairDriverCodes] Failed to repair driver ${driver.id}:`, e.message);
      }
    }

    console.log(`[RepairDriverCodes] Repaired ${repaired}/${invalidDrivers.length} invalid driver codes`);
    res.json({ message: `Repaired ${repaired} driver codes`, repaired, checked: allDrivers.length, results });
  }));

  app.post("/api/admin/documents/repair", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.status(500).json({ error: "Storage unavailable" });

    const { data: docs } = await supabaseAdmin.from('driver_documents').select('*');
    if (!docs) return res.json({ fixed: 0, checked: 0 });

    const BUCKETS = ['driver-documents', 'DRIVER-DOCUMENTS'];
    let fixed = 0, checked = 0, failed = 0;

    for (const doc of docs) {
      checked++;
      if (doc.file_url?.startsWith('text:')) continue;

      if (doc.storage_path && doc.bucket) {
        try {
          const { error } = await supabaseAdmin.storage.from(doc.bucket).createSignedUrl(doc.storage_path, 60);
          if (!error) continue;
        } catch (_) {}
      }

      const fileUrl = doc.file_url || doc.storage_path || '';
      const fileName = fileUrl.split('/').pop();
      if (!fileName) { failed++; continue; }

      const searchPaths: string[] = [];
      if (doc.storage_path) searchPaths.push(doc.storage_path);
      if (doc.file_url && doc.file_url !== doc.storage_path) {
        const extracted = extractStoragePath(doc.file_url);
        if (extracted) searchPaths.push(extracted);
      }
      if (doc.driver_id) {
        searchPaths.push(`${doc.driver_id}/${fileName}`);
        searchPaths.push(`drivers/${doc.driver_id}/${doc.doc_type}/${fileName}`);
      }
      searchPaths.push(`drivers/pending/${doc.doc_type}/${fileName}`);
      searchPaths.push(`applications/pending/${fileName}`);

      let foundPath: string | null = null;
      let foundBucket: string | null = null;

      for (const bucket of BUCKETS) {
        for (const tryPath of searchPaths) {
          try {
            const { error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(tryPath, 60);
            if (!error) {
              foundPath = tryPath;
              foundBucket = bucket;
              break;
            }
          } catch (_) {}
        }
        if (foundPath) break;

        if (doc.driver_id) {
          for (const folder of [doc.driver_id, `drivers/${doc.driver_id}`, `drivers/${doc.driver_id}/${doc.doc_type}`]) {
            try {
              const { data: files } = await supabaseAdmin.storage.from(bucket).list(folder, { limit: 200 });
              if (files) {
                for (const f of files) {
                  if (f.name === fileName || f.name.includes(doc.doc_type)) {
                    const testPath = `${folder}/${f.name}`;
                    const { error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(testPath, 60);
                    if (!error) {
                      foundPath = testPath;
                      foundBucket = bucket;
                      break;
                    }
                  }
                }
              }
            } catch (_) {}
            if (foundPath) break;
          }
        }
        if (foundPath) break;
      }

      if (foundPath && foundBucket) {
        await supabaseAdmin.from('driver_documents')
          .update({ storage_path: foundPath, bucket: foundBucket, file_url: foundPath })
          .eq('id', doc.id);
        fixed++;
        console.log(`[DocRepair] Fixed doc ${doc.id} (${doc.doc_type}): ${foundPath}`);
      } else {
        failed++;
        console.log(`[DocRepair] Could not find file for doc ${doc.id} (${doc.doc_type}): ${fileUrl}`);
      }
    }

    res.json({ checked, fixed, failed, total: docs.length });
  }));

  app.get("/api/pricing", asyncHandler(async (req, res) => {
    const settings = await storage.getPricingSettings();
    res.json(settings);
  }));

  app.patch("/api/pricing", asyncHandler(async (req, res) => {
    const settings = await storage.updatePricingSettings(req.body);
    res.json(settings);
  }));

  app.get("/api/vehicles", asyncHandler(async (req, res) => {
    const vehicles = await storage.getVehicles();
    res.json(vehicles);
  }));

  app.patch("/api/vehicles/:type", asyncHandler(async (req, res) => {
    const vehicle = await storage.updateVehicle(req.params.type as VehicleType, req.body);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle type not found" });
    }
    res.json(vehicle);
  }));

  app.post("/api/quote", asyncHandler(async (req, res) => {
    const data = bookingQuoteSchema.parse(req.body);
    const quote = await storage.calculateQuote(data);
    res.json(quote);
  }));

  const quoteNotificationLimiter = new Map<string, number[]>();
  app.post("/api/quote-notification", asyncHandler(async (req, res) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60_000;
    const maxPerWindow = 5;
    const timestamps = (quoteNotificationLimiter.get(ip) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxPerWindow) {
      return res.status(429).json({ error: "Too many requests" });
    }
    timestamps.push(now);
    quoteNotificationLimiter.set(ip, timestamps);

    const { pickupPostcode, deliveryPostcode, vehicleType, weight, distance, totalPrice, isMultiDrop, multiDropStops, isReturnTrip, pickupDate, pickupTime, serviceType, serviceTypePercent } = req.body;
    if (!pickupPostcode || !deliveryPostcode || !vehicleType || typeof totalPrice !== 'number' || typeof distance !== 'number') {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }
    const validVehicles = ['motorbike', 'car', 'small_van', 'medium_van', 'lwb_van', 'luton_van'];
    if (!validVehicles.includes(vehicleType)) {
      return res.status(400).json({ error: "Invalid vehicle type" });
    }
    sendQuoteNotification({
      pickupPostcode: String(pickupPostcode).slice(0, 20),
      deliveryPostcode: String(deliveryPostcode).slice(0, 20),
      vehicleType,
      weight: Math.max(0, Number(weight) || 0),
      distance: Math.max(0, distance),
      totalPrice: Math.max(0, totalPrice),
      isMultiDrop: !!isMultiDrop,
      multiDropStops: Array.isArray(multiDropStops) ? multiDropStops.slice(0, 20).map((s: any) => String(s).slice(0, 20)) : undefined,
      isReturnTrip: !!isReturnTrip,
      pickupDate: pickupDate ? String(pickupDate).slice(0, 20) : undefined,
      pickupTime: pickupTime ? String(pickupTime).slice(0, 10) : undefined,
      serviceType: serviceType ? String(serviceType) : 'flexible',
      serviceTypePercent: typeof serviceTypePercent === 'number' ? serviceTypePercent : 0,
    }).catch(err => console.error('[Quote Notification] Email error:', err));
    res.json({ success: true });
  }));

  app.get("/api/notifications", asyncHandler(async (req, res) => {
    const { userId, isRead } = req.query;
    const notifications = await storage.getNotifications({
      userId: userId as string | undefined,
      isRead: isRead === "true" ? true : isRead === "false" ? false : undefined,
    });
    res.json(notifications);
  }));

  app.post("/api/notifications", asyncHandler(async (req, res) => {
    const data = insertNotificationSchema.parse(req.body);
    const notification = await storage.createNotification(data);
    res.status(201).json(notification);
  }));

  app.patch("/api/notifications/:id/read", asyncHandler(async (req, res) => {
    const notification = await storage.markNotificationRead(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json(notification);
  }));

  app.patch("/api/notifications/read-all", asyncHandler(async (req, res) => {
    const { userId } = req.body;
    await storage.markAllNotificationsRead(userId);
    res.json({ success: true });
  }));

  app.get("/api/vendor/api-keys", asyncHandler(async (req, res) => {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ error: "vendorId is required" });
    }
    const apiKeys = await storage.getVendorApiKeys(vendorId as string);
    res.json(apiKeys);
  }));

  app.post("/api/vendor/api-keys", asyncHandler(async (req, res) => {
    const data = insertVendorApiKeySchema.parse({
      ...req.body,
      apiKey: `rck_${randomUUID().replace(/-/g, "")}`,
    });
    const apiKey = await storage.createVendorApiKey(data);
    res.status(201).json(apiKey);
  }));

  app.patch("/api/vendor/api-keys/:id", asyncHandler(async (req, res) => {
    const apiKey = await storage.updateVendorApiKey(req.params.id, req.body);
    if (!apiKey) {
      return res.status(404).json({ error: "API key not found" });
    }
    res.json(apiKey);
  }));

  app.delete("/api/vendor/api-keys/:id", asyncHandler(async (req, res) => {
    await storage.deleteVendorApiKey(req.params.id);
    res.status(204).send();
  }));

  app.get("/api/stats/admin", asyncHandler(async (req, res) => {
    const stats = await storage.getAdminStats();
    res.json(stats);
  }));

  app.get("/api/stats/driver/:driverId", asyncHandler(async (req, res) => {
    const stats = await storage.getDriverStats(req.params.driverId);
    res.json(stats);
  }));

  app.get("/api/stats/customer/:customerId", asyncHandler(async (req, res) => {
    const stats = await storage.getCustomerStats(req.params.customerId);
    res.json(stats);
  }));

  app.get("/api/stats/dispatcher", asyncHandler(async (req, res) => {
    const stats = await storage.getDispatcherStats();
    res.json(stats);
  }));

  app.get("/api/stats/vendor/:vendorId", asyncHandler(async (req, res) => {
    const stats = await storage.getVendorStats(req.params.vendorId);
    res.json(stats);
  }));

  // Driver Payments Routes
  app.get("/api/driver-payments", asyncHandler(async (req, res) => {
    const { driverId, status, jobId } = req.query;
    const payments = await storage.getDriverPayments({
      driverId: driverId as string | undefined,
      status: status as any,
      jobId: jobId as string | undefined,
    });
    res.json(payments);
  }));

  app.get("/api/driver-payments/stats/:driverId", asyncHandler(async (req, res) => {
    const stats = await storage.getDriverPaymentStats(req.params.driverId);
    res.json(stats);
  }));

  app.get("/api/driver-payments/:id", asyncHandler(async (req, res) => {
    const payment = await storage.getDriverPayment(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }
    res.json(payment);
  }));

  app.post("/api/driver-payments", asyncHandler(async (req, res) => {
    const payment = await storage.createDriverPayment(req.body);
    
    // Send email confirmation if payment status is 'paid' and we have driver info
    if (req.body.status === 'paid' && req.body.driverId) {
      try {
        const driver = await storage.getDriver(req.body.driverId);
        if (driver?.email) {
          const { sendDriverPaymentConfirmation } = await import('./emailService');
          await sendDriverPaymentConfirmation(driver.email, {
            driverName: driver.fullName || 'Driver',
            amount: req.body.amount || payment.netAmount,
            description: req.body.description || 'Driver payment',
            reference: req.body.payoutReference || undefined,
            bankName: driver.bankName || undefined,
            sortCode: driver.sortCode || undefined,
            accountNumber: driver.accountNumber || undefined,
            paidAt: req.body.paidAt || new Date().toISOString(),
          });
          console.log(`[Driver Payment] Confirmation email sent to ${driver.email}`);
        }
      } catch (emailErr) {
        console.error('[Driver Payment] Failed to send confirmation email:', emailErr);
      }
    }
    
    res.status(201).json(payment);
  }));

  app.patch("/api/driver-payments/:id", asyncHandler(async (req, res) => {
    const payment = await storage.updateDriverPayment(req.params.id, req.body);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }
    res.json(payment);
  }));

  app.delete("/api/driver-payments/:id", asyncHandler(async (req, res) => {
    const success = await storage.deleteDriverPayment(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Payment not found" });
    }
    console.log(`[Driver Payment] Deleted payment ${req.params.id}`);
    res.json({ success: true });
  }));

  app.get("/api/contract-templates", asyncHandler(async (req, res) => {
    const templates = await storage.getContractTemplates();
    res.json(templates);
  }));

  app.get("/api/contract-templates/:id", asyncHandler(async (req, res) => {
    const template = await storage.getContractTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  }));

  app.post("/api/contract-templates", asyncHandler(async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Title and content are required" });
    const template = await storage.createContractTemplate({ title, content });
    res.status(201).json(template);
  }));

  app.patch("/api/contract-templates/:id", asyncHandler(async (req, res) => {
    const { title, content } = req.body;
    const template = await storage.updateContractTemplate(req.params.id, { title, content });
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  }));

  app.delete("/api/contract-templates/:id", asyncHandler(async (req, res) => {
    const success = await storage.deleteContractTemplate(req.params.id);
    if (!success) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
  }));

  app.get("/api/driver-contracts", asyncHandler(async (req, res) => {
    const { driverId, status, templateId } = req.query;
    const contracts = await storage.getDriverContracts({
      driverId: driverId as string | undefined,
      status: status as string | undefined,
      templateId: templateId as string | undefined,
    });
    res.json(contracts);
  }));

  app.get("/api/driver-contracts/:id", asyncHandler(async (req, res) => {
    const contract = await storage.getDriverContract(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    res.json(contract);
  }));

  app.post("/api/admin/contracts/send", asyncHandler(async (req, res) => {
    const { templateId, driverId, driverIds } = req.body;
    const ids: string[] = driverIds && Array.isArray(driverIds) ? driverIds : driverId ? [driverId] : [];
    if (!templateId || ids.length === 0) return res.status(400).json({ error: "Template ID and at least one driver ID are required" });

    const template = await storage.getContractTemplate(templateId);
    if (!template) return res.status(404).json({ error: "Template not found" });

    const results: any[] = [];
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const driver = await storage.getDriver(id);
        if (!driver) { errors.push(`Driver ${id} not found`); continue; }

        const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
        const driverCode = driver.driverCode || driver.id;
        const contractContent = template.content
          .replace(/\{\{driver_name\}\}/g, driver.fullName || 'Driver')
          .replace(/\{\{driver_code\}\}/g, driverCode)
          .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
          .replace(/\{\{driver_email\}\}/g, driver.email || '')
          .replace(/\{\{driver_phone\}\}/g, driver.phone || '')
          .replace(/\{\{vehicle_type\}\}/g, driver.vehicleType || '');

        const contract = await storage.createDriverContract({
          templateId,
          driverId: driver.id,
          driverName: driver.fullName || 'Driver',
          driverEmail: driver.email || undefined,
          contractContent,
          token,
          status: 'sent',
          sentAt: new Date().toISOString(),
        });
        results.push(contract);

        if (driver.email) {
          try {
            const { sendContractSigningEmail } = await import('./emailService');
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host || 'runcourier.co.uk';
            const signingUrl = `${protocol}://${host}/contracts/sign/${token}`;
            await sendContractSigningEmail(driver.email, {
              driverName: driver.fullName || 'Driver',
              contractTitle: template.title,
              signingUrl,
            });
            console.log(`[Contracts] Signing email sent to ${driver.email}`);
          } catch (emailErr) {
            console.error(`[Contracts] Failed to send signing email to ${driver.email}:`, emailErr);
          }
        }
      } catch (err: any) {
        console.error(`[Contracts] Error creating contract for driver ${id}:`, err);
        errors.push(`Failed to create contract for driver ${id}`);
      }
    }

    res.status(201).json({ contracts: results, sent: results.length, errors });
  }));

  app.delete("/api/admin/contracts/:id", asyncHandler(async (req, res) => {
    console.log(`[Contracts] Delete request for contract ${req.params.id}`);
    const contract = await storage.getDriverContract(req.params.id);
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    await storage.deleteDriverContract(req.params.id);
    console.log(`[Contracts] Contract ${req.params.id} deleted`);
    res.json({ success: true });
  }));

  app.post("/api/admin/contracts/resend/:id", asyncHandler(async (req, res) => {
    console.log(`[Contracts] Resend request for contract ${req.params.id}`);
    const contract = await storage.getDriverContract(req.params.id);
    if (!contract) {
      console.log(`[Contracts] Contract ${req.params.id} not found for resend`);
      return res.status(404).json({ error: "Contract not found" });
    }
    if (contract.status === 'signed') {
      console.log(`[Contracts] Contract ${req.params.id} already signed, cannot resend`);
      return res.status(400).json({ error: "Contract is already signed" });
    }

    if (!contract.driver_email) {
      console.log(`[Contracts] Contract ${req.params.id} has no driver email`);
      return res.status(400).json({ error: "No email address for this driver" });
    }

    try {
      const { sendContractSigningEmail } = await import('./emailService');
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'runcourier.co.uk';
      const signingUrl = `${protocol}://${host}/contracts/sign/${contract.token}`;

      const template = contract.template_id ? await storage.getContractTemplate(contract.template_id) : null;
      await sendContractSigningEmail(contract.driver_email, {
        driverName: contract.driver_name,
        contractTitle: template?.title || 'Contract',
        signingUrl,
      });
      console.log(`[Contracts] Resent signing email to ${contract.driver_email}`);

      await storage.updateDriverContract(contract.id, { sent_at: new Date().toISOString() });
      res.json({ success: true });
    } catch (emailErr: any) {
      console.error('[Contracts] Failed to resend signing email:', emailErr);
      res.status(500).json({ error: "Failed to send email: " + (emailErr.message || 'Unknown error') });
    }
  }));

  app.get("/api/contracts/sign/:token", asyncHandler(async (req, res) => {
    const contract = await storage.getDriverContractByToken(req.params.token);
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    res.json({
      id: contract.id,
      driverName: contract.driver_name,
      status: contract.status,
      contractContent: contract.contract_content,
      signedAt: contract.signed_at,
      signedName: contract.signed_name,
    });
  }));

  app.post("/api/contracts/sign/:token", asyncHandler(async (req, res) => {
    console.log(`[Contracts] Sign request for token ${req.params.token.substring(0, 8)}...`);
    const contract = await storage.getDriverContractByToken(req.params.token);
    if (!contract) {
      console.log(`[Contracts] Contract not found for signing token`);
      return res.status(404).json({ error: "Contract not found" });
    }
    if (contract.status === 'signed') {
      console.log(`[Contracts] Contract ${contract.id} already signed`);
      return res.status(400).json({ error: "Contract is already signed" });
    }

    const { signatureData, signedName } = req.body;
    if (!signatureData || !signedName) return res.status(400).json({ error: "Signature and name are required" });

    const updated = await storage.updateDriverContract(contract.id, {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signature_data: signatureData,
      signed_name: signedName,
    });

    console.log(`[Contracts] Contract ${contract.id} signed by ${signedName}, updated status: ${updated?.status}`);
    res.json({ success: true, contract: updated });
  }));

  // ============================================
  // NOTICE TEMPLATES (Admin CRUD)
  // ============================================
  app.get("/api/notice-templates", asyncHandler(async (req, res) => {
    const templates = await storage.getNoticeTemplates({ isActive: true });
    res.json(templates);
  }));

  app.get("/api/notice-templates/:id", asyncHandler(async (req, res) => {
    const template = await storage.getNoticeTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  }));

  app.post("/api/notice-templates", asyncHandler(async (req, res) => {
    const { title, subject, message, category, requires_acknowledgement } = req.body;
    if (!title || !message) return res.status(400).json({ error: "Title and message are required" });
    const template = await storage.createNoticeTemplate({
      title, subject: subject || '', message, category: category || 'general',
      requires_acknowledgement: requires_acknowledgement || false,
      created_by: (req as any).adminUser?.email || 'admin',
    });
    res.json(template);
  }));

  app.patch("/api/notice-templates/:id", asyncHandler(async (req, res) => {
    const updated = await storage.updateNoticeTemplate(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Template not found" });
    res.json(updated);
  }));

  app.delete("/api/notice-templates/:id", asyncHandler(async (req, res) => {
    await storage.deleteNoticeTemplate(req.params.id);
    res.json({ success: true });
  }));

  // ============================================
  // DRIVER NOTICES (Admin)
  // ============================================
  app.get("/api/admin/notices", asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const notices = await storage.getDriverNotices(status ? { status } : undefined);
    res.json(notices);
  }));

  app.get("/api/admin/notices/recipient-driver-ids", asyncHandler(async (req, res) => {
    const driverIds = await storage.getAllNoticeRecipientDriverIds();
    res.json(driverIds);
  }));

  app.get("/api/admin/notices/driver/:driverId", asyncHandler(async (req, res) => {
    const notices = await storage.getDriverNoticeRecipients(req.params.driverId);
    res.json(notices);
  }));

  app.get("/api/admin/notices/:id", asyncHandler(async (req, res) => {
    const notice = await storage.getDriverNotice(req.params.id);
    if (!notice) return res.status(404).json({ error: "Notice not found" });
    const recipients = await storage.getNoticeRecipients(req.params.id);
    const drivers = await storage.getDrivers();
    const enrichedRecipients = recipients.map((r: any) => {
      const driver = drivers.find((d: any) => d.id === r.driver_id);
      return { ...r, driver_name: driver ? (driver.fullName || `${(driver as any).firstName || ''} ${(driver as any).lastName || ''}`.trim() || r.driver_id) : r.driver_id, driver_code: driver?.driverCode || '' };
    });
    res.json({ ...notice, recipients: enrichedRecipients });
  }));

  app.post("/api/admin/notices/upload-image", uploadDocument.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: "Only image files are allowed (JPEG, PNG, GIF, WebP)" });
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.status(500).json({ error: "Storage unavailable" });
    const storagePath = `notice-attachments/${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: upErr } = await supabaseAdmin.storage.from('DRIVER-DOCUMENTS').upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) { console.error('[NoticeImage] Upload error:', upErr.message); return res.status(500).json({ error: "Failed to upload image" }); }
    const { data: signed } = await supabaseAdmin.storage.from('DRIVER-DOCUMENTS').createSignedUrl(storagePath, 315360000);
    if (!signed?.signedUrl) return res.status(500).json({ error: "Failed to create image URL" });
    res.json({ url: signed.signedUrl });
  }));

  app.post("/api/admin/notices/send", asyncHandler(async (req, res) => {
    const { title, subject, message, category, requires_acknowledgement, target_type, driver_ids, template_id, send_email, image_url, image_urls } = req.body;
    const allImageUrls: string[] = image_urls?.length ? image_urls : (image_url ? [image_url] : []);
    if (!title || !message) return res.status(400).json({ error: "Title and message are required" });

    const allDrivers = await storage.getDrivers();
    const activeApprovedDrivers = allDrivers.filter((d: any) => d.isVerified && d.isActive !== false);

    let targetDrivers: any[];
    if (target_type === 'selected') {
      if (!driver_ids?.length) return res.status(400).json({ error: "No drivers selected" });
      targetDrivers = activeApprovedDrivers.filter((d: any) => driver_ids.includes(d.id));
    } else {
      targetDrivers = activeApprovedDrivers;
    }

    if (targetDrivers.length === 0) return res.status(400).json({ error: "No eligible drivers found" });

    const notice = await storage.createDriverNotice({
      template_id: template_id || undefined,
      title, subject: subject || '', message, category: category || 'general',
      sent_by: (req as any).adminUser?.email || 'admin',
      sent_at: new Date().toISOString(),
      target_type: target_type || 'all',
      requires_acknowledgement: requires_acknowledgement || false,
      status: 'sent',
    });

    for (const driver of targetDrivers) {
      await storage.createNoticeRecipient({
        notice_id: notice.id,
        driver_id: driver.id,
        driver_email: driver.email || null,
        delivery_channel: 'dashboard',
      });
    }

    console.log(`[Notices] send_email=${send_email}, targetDrivers=${targetDrivers.length}`);
    if (send_email) {
      try {
        for (const driver of targetDrivers) {
          if (driver.email) {
            try {
              console.log(`[Notices] Sending email to driver: ${driver.email}`);
              await sendEmailNotification(
                driver.email,
                subject || title,
                `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1a1a1a;">${title}</h2>
                  ${subject ? `<p style="color: #666; font-size: 14px;">${subject}</p>` : ''}
                  <div style="margin: 20px 0; padding: 20px; background: #f9f9f9; border-radius: 8px;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                  ${allImageUrls.length > 0 ? allImageUrls.map((url: string) => `<div style="margin: 16px 0; text-align: center;"><img src="${url}" alt="Notice attachment" style="max-width: 100%; max-height: 500px; border-radius: 6px; border: 1px solid #e0e0e0;" /></div>`).join('') : ''}
                  ${requires_acknowledgement ? '<p style="color: #e55; font-weight: bold;">This notice requires your acknowledgement. Please log in to your driver account to acknowledge.</p>' : ''}
                  <p style="color: #666; font-size: 13px; margin-top: 20px;">Please also review this notice in your Run Courier driver account.</p>
                </div>`,
                message,
                SENDER_EMAIL
              );
            } catch (emailErr: any) {
              console.warn(`[Notices] Failed to email ${driver.email}:`, emailErr.message);
            }
          }
        }
      } catch (e: any) {
        console.warn('[Notices] Email service error:', e.message);
      }
    }

    // Send push notifications to all targeted drivers
    let pushResult = { sentCount: 0, smsCount: 0, noDeviceCount: 0, failCount: 0 };
    try {
      const { sendCustomNotificationToDrivers } = await import('./pushNotifications');
      const targetDriverIds = targetDrivers.map((d: any) => d.id);
      const shortMessage = message.length > 180 ? message.substring(0, 177) + '...' : message;
      const result = await sendCustomNotificationToDrivers(targetDriverIds, title, shortMessage);
      pushResult = result;
      console.log(`[Notices] Push notifications: ${result.sentCount} sent, ${result.failCount} failed, ${result.noDeviceCount} no device (saved to Alerts tab)`);
    } catch (pushErr: any) {
      console.warn('[Notices] Push notification error:', pushErr.message);
    }

    console.log(`[Notices] Notice "${title}" saved for ${targetDrivers.length} drivers. Push delivered: ${pushResult.sentCount}, Alerts tab only: ${pushResult.noDeviceCount}`);
    res.json({
      success: true,
      notice,
      recipientCount: targetDrivers.length,
      pushSent: pushResult.sentCount,
      noDeviceCount: pushResult.noDeviceCount,
      smsSent: 0
    });
  }));

  app.delete("/api/admin/notices/:id", asyncHandler(async (req, res) => {
    const deleted = await storage.deleteDriverNotice(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Notice not found" });
    res.json({ success: true });
  }));

  app.patch("/api/admin/notices/:id/archive", asyncHandler(async (req, res) => {
    const updated = await storage.updateDriverNotice(req.params.id, { status: 'archived' });
    if (!updated) return res.status(404).json({ error: "Notice not found" });
    res.json(updated);
  }));

  app.post("/api/admin/notices/:id/resend", asyncHandler(async (req, res) => {
    const notice = await storage.getDriverNotice(req.params.id);
    if (!notice) return res.status(404).json({ error: "Notice not found" });
    const recipients = await storage.getNoticeRecipients(req.params.id);
    try {
      let sentCount = 0;
      for (const r of recipients) {
        if (r.driver_email) {
          try {
            await sendEmailNotification(
              r.driver_email,
              notice.subject || notice.title,
              `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">${notice.title}</h2>
                ${notice.subject ? `<p style="color: #666; font-size: 14px;">${notice.subject}</p>` : ''}
                <div style="margin: 20px 0; padding: 20px; background: #f9f9f9; border-radius: 8px;">
                  ${notice.message.replace(/\n/g, '<br>')}
                </div>
                <p style="color: #666; font-size: 13px; margin-top: 20px;">Please also review this notice in your Run Courier driver account.</p>
              </div>`,
              notice.message,
              SENDER_EMAIL
            );
            sentCount++;
          } catch (e: any) { console.warn(`[Notices] Resend email failed for ${r.driver_email}`); }
        }
      }
      res.json({ success: true, sentCount });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to resend emails' });
    }
  }));

  // ============================================
  // ADMIN / SUPERVISOR — MANUAL SMS
  // ============================================
  app.post("/api/admin/sms/driver", asyncHandler(async (req, res) => {
    const { phone, message, driverName } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "phone and message are required" });
    }
    if (message.trim().length === 0) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }
    if (message.length > 1600) {
      return res.status(400).json({ error: "Message too long (max 1600 characters)" });
    }
    const { sendSMS } = await import("./twilioService");
    const result = await sendSMS(phone, message.trim());
    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to send SMS" });
    }
    console.log(`[Admin SMS] Sent to driver${driverName ? ` ${driverName}` : ''} (${phone.slice(0, 5)}***)`);
    res.json({ success: true, messageId: result.messageId });
  }));

  app.post("/api/admin/sms/application-reminder", asyncHandler(async (req, res) => {
    const { phone, name, applicationId } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "phone is required" });
    }
    const greeting = name ? `Hi ${name.split(' ')[0]}` : 'Hi';
    const message = `${greeting}, this is Run Courier. Your driver application is incomplete. Please visit runcourier.co.uk/driver-application to complete it and join our team. Questions? Reply STOP to opt out.`;
    const { sendSMS } = await import("./twilioService");
    const result = await sendSMS(phone, message);
    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to send SMS" });
    }
    console.log(`[Admin SMS] Application reminder sent${applicationId ? ` for app ${applicationId}` : ''} to ${phone.slice(0, 5)}***`);
    res.json({ success: true, messageId: result.messageId });
  }));

  // ============================================
  // DRIVER NOTICES (Driver-facing)
  // ============================================
  app.get("/api/driver/notices", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace('Bearer ', '');
    try {
      const { verifyAccessToken } = await import('./supabaseAdmin');
      const user = await verifyAccessToken(token);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      const driverId = user.id;
      console.log('[Driver Notices] Fetching notices for driver:', driverId);
      const rows = await storage.getDriverNoticeRecipients(driverId);
      console.log('[Driver Notices] Found', rows.length, 'notices for driver', driverId);

      // Transform flat DB rows into the nested format the mobile app expects
      const notices = rows.map((r: any) => ({
        id: r.id,
        notice_id: r.notice_id,
        driver_id: r.driver_id,
        driver_email: r.driver_email ?? null,
        viewed_at: r.viewed_at ?? null,
        acknowledged_at: r.acknowledged_at ?? null,
        status: r.status,
        delivery_channel: r.delivery_channel,
        notice: {
          id: r.notice_id,
          title: r.title,
          subject: r.subject || '',
          message: r.message,
          category: r.category || 'general',
          requires_acknowledgement: r.requires_acknowledgement || false,
          sent_by: r.sent_by || 'Operations Team',
          sent_at: r.notice_sent_at || r.sent_at,
          status: r.notice_status || r.status,
          image_url: r.image_url ?? null,
          image_urls: r.image_urls ?? null,
        },
      }));

      res.json(notices);
    } catch (e: any) {
      console.error('[Driver Notices] Error:', e.message);
      return res.status(401).json({ error: "Invalid token" });
    }
  }));

  app.patch("/api/driver/notices/:noticeId/view", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace('Bearer ', '');
    try {
      const { verifyAccessToken } = await import('./supabaseAdmin');
      const user = await verifyAccessToken(token);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      const driverId = user.id;
      const recipient = await storage.getDriverNoticeRecipient(req.params.noticeId, driverId);
      if (!recipient) return res.status(404).json({ error: "Notice not found" });
      if (!recipient.viewed_at) {
        await storage.updateNoticeRecipient(recipient.id, { viewed_at: new Date().toISOString(), status: 'viewed' });
      }
      res.json({ success: true });
    } catch (e: any) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }));

  app.patch("/api/driver/notices/:noticeId/acknowledge", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace('Bearer ', '');
    try {
      const { verifyAccessToken } = await import('./supabaseAdmin');
      const user = await verifyAccessToken(token);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      const driverId = user.id;
      const recipient = await storage.getDriverNoticeRecipient(req.params.noticeId, driverId);
      if (!recipient) return res.status(404).json({ error: "Notice not found" });
      await storage.updateNoticeRecipient(recipient.id, {
        viewed_at: recipient.viewed_at || new Date().toISOString(),
        acknowledged_at: new Date().toISOString(),
        status: 'acknowledged',
      });
      res.json({ success: true });
    } catch (e: any) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }));

  app.delete("/api/driver/notices/:noticeId", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace('Bearer ', '');
    try {
      const { verifyAccessToken } = await import('./supabaseAdmin');
      const user = await verifyAccessToken(token);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      const driverId = user.id;
      const recipient = await storage.getDriverNoticeRecipient(req.params.noticeId, driverId);
      if (!recipient) return res.status(404).json({ error: "Notice not found" });
      const deleted = await storage.deleteNoticeRecipient(recipient.id, driverId);
      if (!deleted) return res.status(500).json({ error: "Failed to delete notice" });
      res.json({ success: true });
    } catch (e: any) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }));

  const driverStripeAccountCache = new Map<string, string>();

  async function getOrCreateDriverStripeAccount(stripe: any, driver: any, clientIp?: string): Promise<string> {
    const driverRecord = await storage.getDriver(driver.id);
    const existingAccountId = (driverRecord as any)?.stripeAccountId || driverStripeAccountCache.get(driver.id);
    if (existingAccountId) {
      try {
        const existing = await stripe.accounts.retrieve(existingAccountId);
        if (existing && !existing.deleted) {
          return existingAccountId;
        }
      } catch (e: any) {
        console.log(`[Stripe Connect] Existing account ${existingAccountId} invalid, creating new`);
      }
    }

    if (!driver.sortCode || !driver.accountNumber) {
      throw new Error('Driver has no bank details on file. Please add bank details to the driver profile first.');
    }

    const sortCodeClean = driver.sortCode.replace(/\D/g, '');
    const accountNumberClean = driver.accountNumber.replace(/\D/g, '');

    const nameParts = (driver.fullName || 'Driver').split(' ');
    const firstName = nameParts[0] || 'Driver';
    const lastName = nameParts.slice(1).join(' ') || 'Driver';

    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'GB',
      business_type: 'individual',
      capabilities: {
        transfers: { requested: true },
      },
      individual: {
        first_name: firstName,
        last_name: lastName,
        email: driver.email || undefined,
        phone: driver.phone || undefined,
      },
      external_account: {
        object: 'bank_account',
        country: 'GB',
        currency: 'gbp',
        account_holder_name: driver.accountHolderName || driver.fullName || 'Driver',
        account_holder_type: 'individual',
        routing_number: sortCodeClean,
        account_number: accountNumberClean,
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: clientIp || '127.0.0.1',
      },
      metadata: {
        driverId: driver.id,
        driverCode: driver.driverCode || '',
      },
    });

    driverStripeAccountCache.set(driver.id, account.id);
    try {
      await storage.updateDriver(driver.id, { stripeAccountId: account.id } as any);
    } catch (e) {
      console.log(`[Stripe Connect] Could not save stripeAccountId to DB column, using in-memory cache`);
    }

    console.log(`[Stripe Connect] Created connected account ${account.id} for driver ${driver.driverCode}`);
    return account.id;
  }

  app.get("/api/stripe/config", asyncHandler(async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      res.status(500).json({ error: "Stripe not configured" });
    }
  }));

  app.post("/api/stripe/create-checkout-session", asyncHandler(async (req, res) => {
    const { jobId, amount, description, customerEmail, customerId } = req.body;
    
    if (!amount || !description) {
      return res.status(400).json({ error: "Amount and description are required" });
    }

    let stripeCustomerId = customerId;
    
    if (!stripeCustomerId && customerEmail) {
      const customer = await stripeService.createCustomer(
        customerEmail, 
        jobId || 'guest',
        'Run Courier Customer'
      );
      stripeCustomerId = customer.id;
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: "Customer email or customer ID required" });
    }

    const baseUrl = process.env.APP_URL || 'https://runcourier.co.uk';
    
    const session = await stripeService.createCheckoutSession(
      stripeCustomerId,
      Math.round(amount * 100),
      description,
      `${baseUrl}/payment/success?job=${jobId || ''}`,
      `${baseUrl}/payment/cancel?job=${jobId || ''}`,
      { jobId: jobId || '' }
    );

    res.json({ url: session.url, sessionId: session.id });
  }));

  app.post("/api/stripe/create-payment-intent", asyncHandler(async (req, res) => {
    const { jobId, amount, customerEmail, customerId, bookingId, trackingNumber } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    // customerId from the mobile app is a Supabase user UUID, not a Stripe cus_... ID.
    // Resolve to a real Stripe customer ID.
    let stripeCustomerId: string | null = null;

    if (customerId && String(customerId).startsWith('cus_')) {
      // Already a Stripe customer ID
      stripeCustomerId = customerId;
    } else if (customerId) {
      // Supabase user UUID — look up their Stripe customer ID
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('stripe_customer_id, email, full_name')
        .eq('id', customerId)
        .maybeSingle();

      if (userRow?.stripe_customer_id) {
        stripeCustomerId = userRow.stripe_customer_id;
      } else {
        // Create a Stripe customer for this user
        const email = customerEmail || userRow?.email || `${customerId}@runcourier.co.uk`;
        const customer = await stripeService.createCustomer(
          email,
          jobId || bookingId || customerId,
          userRow?.full_name || 'Run Courier Customer'
        );
        stripeCustomerId = customer.id;
        // Persist the Stripe customer ID back to the users table
        if (userRow) {
          await supabaseAdmin
            .from('users')
            .update({ stripe_customer_id: stripeCustomerId })
            .eq('id', customerId);
        }
      }
    } else if (customerEmail) {
      const customer = await stripeService.createCustomer(
        customerEmail,
        jobId || bookingId || 'guest',
        'Run Courier Customer'
      );
      stripeCustomerId = customer.id;
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: "Customer email or customer ID required" });
    }

    const paymentIntent = await stripeService.createPaymentIntent(
      Math.round(amount * 100),
      'gbp',
      stripeCustomerId,
      {
        jobId: jobId || '',
        bookingId: bookingId || '',
        trackingNumber: trackingNumber || '',
        customerId: customerId || '',
      }
    );

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      finalAmount: amount,
      originalAmount: amount,
    });
  }));

  app.get("/api/stripe/payment-status/:paymentIntentId", asyncHandler(async (req, res) => {
    const paymentIntent = await stripeService.getPaymentIntent(req.params.paymentIntentId);
    res.json({ 
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100
    });
  }));

  // Create Payment Intent for embedded checkout (no redirect)
  app.post("/api/booking/create-payment-intent", asyncHandler(async (req, res) => {
    const bookingData: BookingData = req.body;
    
    if (!bookingData.pickupPostcode || !bookingData.deliveryPostcode || !bookingData.vehicleType) {
      return res.status(400).json({ error: "Missing required booking information" });
    }

    if (!bookingData.customerEmail && !bookingData.pickupPhone) {
      return res.status(400).json({ error: "Customer email or phone is required" });
    }

    const customerEmail = bookingData.customerEmail || `${bookingData.pickupPhone}@guest.runcourier.co.uk`;
    const stripe = await (await import('./stripeClient')).getUncachableStripeClient();
    
    // Create or retrieve customer
    let customerId: string;
    const existingCustomers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: customerEmail,
        name: bookingData.pickupName,
        metadata: { 
          userId: bookingData.customerId || 'guest',
          phone: bookingData.pickupPhone 
        },
      });
      customerId = newCustomer.id;
    }

    const vehicleName = bookingData.vehicleType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    const description = `Run Courier Delivery - ${vehicleName} - ${bookingData.pickupPostcode} to ${bookingData.deliveryPostcode}`;

    // Apply service type adjustment server-side
    const serviceType = (bookingData.serviceType || 'flexible') as string;
    const storedPricingSettings = await storage.getPricingSettings();
    const serviceTypePercents: Record<string, number> = (storedPricingSettings.serviceTypePricing as Record<string, number>) || { flexible: 0, urgent: 15 };
    const serviceTypePercent = serviceTypePercents[serviceType] ?? 0;
    const baseTotal = bookingData.totalPrice;
    const serviceTypeAmount = Math.round(baseTotal * (serviceTypePercent / 100) * 100) / 100;
    const finalTotal = Math.round((baseTotal + serviceTypeAmount) * 100) / 100;

    const metadataForStripe: Record<string, string> = {
      bookingType: 'courier_delivery',
      pickupPostcode: bookingData.pickupPostcode,
      pickupAddress: (bookingData.pickupAddress || '').substring(0, 500),
      pickupBuildingName: (bookingData.pickupBuildingName || '').substring(0, 100),
      pickupName: (bookingData.pickupName || '').substring(0, 100),
      pickupPhone: bookingData.pickupPhone || '',
      pickupInstructions: (bookingData.pickupInstructions || '').substring(0, 200),
      deliveryPostcode: bookingData.deliveryPostcode,
      deliveryAddress: (bookingData.deliveryAddress || '').substring(0, 500),
      deliveryBuildingName: (bookingData.deliveryBuildingName || '').substring(0, 100),
      recipientName: (bookingData.recipientName || '').substring(0, 100),
      recipientPhone: bookingData.recipientPhone || '',
      deliveryInstructions: (bookingData.deliveryInstructions || '').substring(0, 200),
      vehicleType: bookingData.vehicleType,
      weight: String(bookingData.weight || 1),
      totalPrice: String(finalTotal),
      basePrice: String(bookingData.basePrice || 0),
      distancePrice: String(bookingData.distancePrice || 0),
      weightSurcharge: String(bookingData.weightSurcharge || 0),
      multiDropCharge: String(bookingData.multiDropCharge || 0),
      returnTripCharge: String(bookingData.returnTripCharge || 0),
      centralLondonCharge: String(bookingData.centralLondonCharge || 0),
      waitingTimeCharge: String(bookingData.waitingTimeCharge || 0),
      serviceType,
      serviceTypePercent: String(serviceTypePercent),
      serviceTypeAmount: String(serviceTypeAmount),
      distance: String(bookingData.distance || 0),
      estimatedTime: String(bookingData.estimatedTime || 0),
      isMultiDrop: String(bookingData.isMultiDrop || false),
      isReturnTrip: String(bookingData.isReturnTrip || false),
      customerId: bookingData.customerId || '',
      customerEmail: customerEmail,
    };

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(finalTotal * 100),
      currency: 'gbp',
      customer: customerId,
      description,
      metadata: metadataForStripe,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId 
    });
  }));

  // Confirm payment and create job after successful embedded payment
  app.post("/api/booking/confirm-embedded-payment", asyncHandler(async (req, res) => {
    const { paymentIntentId, bookingData } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Payment Intent ID is required" });
    }

    const stripe = await (await import('./stripeClient')).getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: "Payment not completed", status: paymentIntent.status });
    }

    const metadata = paymentIntent.metadata || bookingData || {};
    const trackingNumber = await generateTrackingNumber();
    const jobNumber = await generateJobNumber();
    const totalPrice = parseFloat(metadata.totalPrice) || (paymentIntent.amount / 100);

    const jobData = {
      trackingNumber,
      jobNumber,
      pickupPostcode: metadata.pickupPostcode || '',
      pickupAddress: metadata.pickupAddress || '',
      pickupBuildingName: metadata.pickupBuildingName || '',
      pickupContactName: metadata.pickupName || '',
      pickupContactPhone: metadata.pickupPhone || '',
      pickupInstructions: metadata.pickupInstructions || null,
      deliveryPostcode: metadata.deliveryPostcode || '',
      deliveryAddress: metadata.deliveryAddress || '',
      deliveryBuildingName: metadata.deliveryBuildingName || '',
      recipientName: metadata.recipientName || '',
      recipientPhone: metadata.recipientPhone || '',
      deliveryInstructions: metadata.deliveryInstructions || null,
      vehicleType: (metadata.vehicleType || 'car') as VehicleType,
      weight: metadata.weight || '1',
      basePrice: metadata.basePrice || String(getBaseChargeForVehicle(metadata.vehicleType || 'car')),
      distancePrice: metadata.distancePrice || String(Math.max(0, totalPrice - getBaseChargeForVehicle(metadata.vehicleType || 'car'))),
      weightSurcharge: metadata.weightSurcharge || '0',
      multiDropCharge: metadata.multiDropCharge || '0',
      returnTripCharge: metadata.returnTripCharge || '0',
      centralLondonCharge: metadata.centralLondonCharge || '0',
      waitingTimeCharge: metadata.waitingTimeCharge || '0',
      serviceType: metadata.serviceType || 'flexible',
      serviceTypePercent: String(metadata.serviceTypePercent || '0'),
      serviceTypeAmount: String(metadata.serviceTypeAmount || '0'),
      totalPrice: String(totalPrice),
      distance: metadata.distance || '0',
      customerId: metadata.customerId || '',
      customerEmail: metadata.customerEmail || '',
      paymentStatus: 'paid',
      paymentIntentId: paymentIntentId,
      status: 'pending' as JobStatus,
      isMultiDrop: metadata.isMultiDrop === 'true',
      isReturnTrip: metadata.isReturnTrip === 'true',
      isCentralLondon: metadata.isCentralLondon === 'true',
      isRushHour: metadata.isRushHour === 'true',
      scheduledPickupTime: metadata.scheduledPickupTime ? new Date(metadata.scheduledPickupTime) : null,
      scheduledDeliveryTime: metadata.scheduledDeliveryTime ? new Date(metadata.scheduledDeliveryTime) : null,
      isScheduled: !!metadata.scheduledPickupTime,
    };

    let job;
    try {
      console.log('[Embedded Payment] Creating job with data:', JSON.stringify(jobData, null, 2));
      job = await storage.createJob(jobData);
      stableJobNumberCache.set(String(job.id), jobNumber);
      persistJobNumber(String(job.id), jobNumber);
      console.log('[Embedded Payment] Job created successfully:', job.id);
    } catch (createError: any) {
      console.error('[Embedded Payment] Failed to create job:', createError);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to create booking: ${createError.message || 'Database error'}`,
        paymentIntentId 
      });
    }
    
    // Auto-geocode job coordinates for mobile app map display
    try {
      const geoUpdates: any = {};
      if (jobData.pickupAddress) {
        const pickupResult = await geocodeAddress(jobData.pickupAddress);
        if (pickupResult) {
          geoUpdates.pickupLatitude = pickupResult.lat;
          geoUpdates.pickupLongitude = pickupResult.lng;
          console.log(`[Embedded Payment] Geocoded pickup: ${pickupResult.lat}, ${pickupResult.lng}`);
        }
      }
      if (jobData.deliveryAddress) {
        const deliveryResult = await geocodeAddress(jobData.deliveryAddress);
        if (deliveryResult) {
          geoUpdates.deliveryLatitude = deliveryResult.lat;
          geoUpdates.deliveryLongitude = deliveryResult.lng;
          console.log(`[Embedded Payment] Geocoded delivery: ${deliveryResult.lat}, ${deliveryResult.lng}`);
        }
      }
      if (Object.keys(geoUpdates).length > 0) {
        await storage.updateJob(job.id, geoUpdates);
        console.log(`[Embedded Payment] Updated job ${job.id} with geocoded coordinates`);
      }
    } catch (geoError) {
      console.error('[Embedded Payment] Geocoding error:', geoError);
    }
    
    if (metadata.customerId) {
      await storage.incrementCompletedBookings(metadata.customerId);
    }
    
    console.log(`[Embedded Payment] Created job ${trackingNumber} with payment ${paymentIntentId}`);

    // Create invoice for this booking (paid by card)
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (supabaseAdmin) {
        const invoiceNumber = `INV-${trackingNumber}`;
        const now = new Date();
        const invoiceToken = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        
        // Get customer profile for business details
        let companyName = null;
        let businessAddress = null;
        let vatNumber = null;
        let customerName = metadata.pickupName || jobData.pickupContactName || 'Customer';
        
        if (metadata.customerId) {
          const { data: profile } = await supabaseAdmin
            .from('users')
            .select('full_name, company_name, business_address, vat_number, user_type')
            .eq('id', metadata.customerId)
            .single();
          
          if (profile?.user_type === 'business') {
            companyName = profile.company_name;
            businessAddress = profile.business_address;
            vatNumber = profile.vat_number;
            customerName = profile.company_name || customerName;
          } else if (profile?.full_name) {
            customerName = profile.full_name;
          }
        }
        
        await supabaseAdmin.from('invoice_payment_tokens').insert({
          token: invoiceToken,
          invoice_number: invoiceNumber,
          customer_name: customerName,
          customer_email: metadata.customerEmail || jobData.customerEmail || '',
          company_name: companyName,
          business_address: businessAddress,
          vat_number: vatNumber,
          amount: parseFloat(jobData.totalPrice),
          subtotal: parseFloat(jobData.totalPrice),
          vat: 0,
          status: 'paid', // Card payment - already paid
          due_date: now.toISOString(),
          period_start: now.toISOString(),
          period_end: now.toISOString(),
          job_ids: [job.id],
          notes: `Card payment - ${paymentIntentId}`,
          created_at: now.toISOString(),
        });
        console.log(`[Embedded Payment] Created invoice ${invoiceNumber} for job ${trackingNumber}`);
      }
    } catch (invoiceError) {
      console.error('[Embedded Payment] Failed to create invoice:', invoiceError);
      // Don't fail the booking if invoice creation fails
    }

    // Send email notifications
    const embeddedCustomerEmail = (job as any).customerEmail || metadata.customerEmail;
    const jobWithEmail = { ...job, jobNumber: job.jobNumber || jobNumber, customerEmail: embeddedCustomerEmail };
    console.log(`[Email] Sending admin new booking notification for embedded job #${job.jobNumber || jobNumber} (${job.trackingNumber})`);
    await sendNewJobNotification(job.id, jobWithEmail).catch(err => console.error('[Email] Failed to send admin notification:', err));
    if (embeddedCustomerEmail) {
      console.log(`[Email] Sending customer booking confirmation to ${embeddedCustomerEmail} for job #${job.jobNumber || jobNumber} (${job.trackingNumber})`);
      await sendCustomerBookingConfirmation(embeddedCustomerEmail, jobWithEmail).catch(err => console.error('[Email] Failed to send customer confirmation:', err));
    } else {
      console.log(`[Email] No customer email available for embedded job ${job.trackingNumber} - skipping customer confirmation`);
    }
    
    // Send SMS confirmation to pickup contact
    const pickupPhone = metadata.pickupPhone || jobData.pickupContactPhone;
    if (pickupPhone) {
      await sendBookingConfirmationSMS(pickupPhone, trackingNumber, jobData.pickupAddress || jobData.pickupPostcode, job.jobNumber || jobNumber)
        .catch(err => console.error('Failed to send SMS confirmation:', err));
    }
    // Notify admin numbers of new booking
    sendAdminNewBookingAlert({
      jobNumber: String(job.jobNumber || jobNumber),
      trackingNumber,
      pickupAddress: jobData.pickupAddress || jobData.pickupPostcode || '',
      vehicleType: jobData.vehicleType,
      price: job.totalPrice,
    }).catch(err => console.error('[Admin SMS] Embedded booking alert failed:', err));

    res.json({ 
      success: true, 
      trackingNumber: job.trackingNumber,
      jobNumber: job.jobNumber || jobNumber,
      jobId: job.id
    });
  }));

  app.post("/api/booking/checkout", asyncHandler(async (req, res) => {
    const bookingData: BookingData = req.body;
    
    if (!bookingData.pickupPostcode || !bookingData.deliveryPostcode || !bookingData.vehicleType) {
      return res.status(400).json({ error: "Missing required booking information" });
    }

    if (!bookingData.customerEmail && !bookingData.pickupPhone) {
      return res.status(400).json({ error: "Customer email or phone is required" });
    }

    const customerEmail = bookingData.customerEmail || `${bookingData.pickupPhone}@guest.runcourier.co.uk`;
    const baseUrl = process.env.APP_URL || 'https://runcourier.co.uk';
    
    const session = await stripeService.createBookingCheckoutSession(
      customerEmail,
      bookingData,
      `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      `${baseUrl}/payment/cancel`
    );

    res.json({ url: session.url, sessionId: session.id });
  }));

  app.post("/api/booking/pay-later", asyncHandler(async (req, res) => {
    const bookingData: BookingData = req.body;
    
    if (!bookingData.pickupPostcode || !bookingData.deliveryPostcode || !bookingData.vehicleType) {
      return res.status(400).json({ error: "Missing required booking information" });
    }

    if (!bookingData.customerId) {
      return res.status(400).json({ error: "Customer account required for Pay Later bookings" });
    }

    const customer = await storage.getUser(bookingData.customerId);
    if (!customer || !customer.payLaterEnabled) {
      return res.status(403).json({ error: "Pay Later is not enabled for this account" });
    }

    const trackingNumber = await generateTrackingNumber();
    const jobNumber = await generateJobNumber();

    // Apply service type adjustment for pay-later bookings
    const plServiceType = bookingData.serviceType || 'flexible';
    const plPricingSettings = await storage.getPricingSettings();
    const plServiceTypePercents: Record<string, number> = (plPricingSettings.serviceTypePricing as Record<string, number>) || { flexible: 0, urgent: 15 };
    const plServiceTypePercent = plServiceTypePercents[plServiceType] ?? 0;
    const plBaseTotal = bookingData.totalPrice;
    const plServiceTypeAmount = Math.round(plBaseTotal * (plServiceTypePercent / 100) * 100) / 100;
    const plFinalTotal = Math.round((plBaseTotal + plServiceTypeAmount) * 100) / 100;
    
    const jobData = {
      trackingNumber,
      jobNumber,
      pickupPostcode: bookingData.pickupPostcode,
      pickupAddress: bookingData.pickupAddress || '',
      pickupBuildingName: bookingData.pickupBuildingName || '',
      pickupContactName: bookingData.pickupName || '',
      pickupContactPhone: bookingData.pickupPhone || '',
      pickupInstructions: bookingData.pickupInstructions || null,
      deliveryPostcode: bookingData.deliveryPostcode,
      deliveryAddress: bookingData.deliveryAddress || '',
      deliveryBuildingName: bookingData.deliveryBuildingName || '',
      recipientName: bookingData.recipientName || '',
      recipientPhone: bookingData.recipientPhone || '',
      deliveryInstructions: bookingData.deliveryInstructions || null,
      vehicleType: bookingData.vehicleType as VehicleType,
      weight: String(bookingData.weight || 1),
      basePrice: String(bookingData.basePrice || getBaseChargeForVehicle(bookingData.vehicleType)),
      distancePrice: String(bookingData.distancePrice || Math.max(0, (bookingData.totalPrice || 0) - getBaseChargeForVehicle(bookingData.vehicleType))),
      weightSurcharge: String(bookingData.weightSurcharge || 0),
      multiDropCharge: String(bookingData.multiDropCharge || 0),
      returnTripCharge: String(bookingData.returnTripCharge || 0),
      centralLondonCharge: String(bookingData.centralLondonCharge || 0),
      waitingTimeCharge: String(bookingData.waitingTimeCharge || 0),
      serviceType: (bookingData.serviceType || 'flexible'),
      serviceTypePercent: String(plServiceTypePercent),
      serviceTypeAmount: String(plServiceTypeAmount),
      totalPrice: String(plFinalTotal),
      distance: String(bookingData.distance || 0),
      customerId: bookingData.customerId,
      customerEmail: bookingData.customerEmail || customer.email,
      paymentStatus: 'pay_later',
      status: 'pending' as JobStatus,
      isMultiDrop: bookingData.isMultiDrop || false,
      isReturnTrip: bookingData.isReturnTrip || false,
      isCentralLondon: bookingData.isCentralLondon || false,
      isRushHour: bookingData.isRushHour || false,
      scheduledPickupTime: bookingData.scheduledPickupTime ? new Date(bookingData.scheduledPickupTime) : null,
      scheduledDeliveryTime: bookingData.scheduledDeliveryTime ? new Date(bookingData.scheduledDeliveryTime) : null,
      isScheduled: !!bookingData.scheduledPickupTime,
    };

    const job = await storage.createJob(jobData);
    stableJobNumberCache.set(String(job.id), jobNumber);
    persistJobNumber(String(job.id), jobNumber);
    
    await storage.incrementCompletedBookings(bookingData.customerId);
    console.log(`[Pay Later Booking] Created job ${trackingNumber} for customer ${bookingData.customerId} - payment to be invoiced weekly`);
    
    // Send email notifications
    const customerEmailForNotification = bookingData.customerEmail || customer.email;
    const jobWithEmail = { ...job, jobNumber: job.jobNumber || jobNumber, customerEmail: customerEmailForNotification };
    console.log(`[Email] Sending admin new booking notification for pay-later job #${job.jobNumber || jobNumber} (${job.trackingNumber})`);
    await sendNewJobNotification(job.id, jobWithEmail).catch(err => console.error('[Email] Failed to send admin notification:', err));
    if (customerEmailForNotification) {
      console.log(`[Email] Sending customer booking confirmation to ${customerEmailForNotification} for job #${job.jobNumber || jobNumber} (${job.trackingNumber})`);
      await sendCustomerBookingConfirmation(customerEmailForNotification, jobWithEmail).catch(err => console.error('[Email] Failed to send customer confirmation:', err));
    } else {
      console.log(`[Email] No customer email available for pay-later job ${job.trackingNumber} - skipping customer confirmation`);
    }
    
    // Send SMS confirmation to pickup contact
    if (bookingData.pickupPhone) {
      await sendBookingConfirmationSMS(bookingData.pickupPhone, trackingNumber, bookingData.pickupAddress || bookingData.pickupPostcode, job.jobNumber || jobNumber)
        .catch(err => console.error('Failed to send SMS confirmation:', err));
    }
    // Notify admin numbers of new booking
    sendAdminNewBookingAlert({
      jobNumber: String(job.jobNumber || jobNumber),
      trackingNumber,
      pickupAddress: bookingData.pickupAddress || bookingData.pickupPostcode || '',
      vehicleType: bookingData.vehicleType,
      price: job.totalPrice,
    }).catch(err => console.error('[Admin SMS] Pay-later booking alert failed:', err));

    res.json({ 
      success: true, 
      trackingNumber: job.trackingNumber,
      jobNumber: job.jobNumber || jobNumber,
      jobId: job.id,
      payLater: true
    });
  }));

  app.post("/api/booking/confirm-payment", asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    const session = await stripeService.getCheckoutSession(sessionId);
    
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: "Payment not completed", status: session.payment_status });
    }

    const metadata = session.metadata || {};
    
    if (metadata.bookingType !== 'courier_delivery') {
      return res.status(400).json({ error: "Invalid booking session" });
    }

    const trackingNumber = await generateTrackingNumber();
    const jobNumber = await generateJobNumber();
    const totalPrice = parseFloat(metadata.totalPrice || '0');
    
    const jobData = {
      trackingNumber,
      jobNumber,
      pickupPostcode: metadata.pickupPostcode || '',
      pickupAddress: metadata.pickupAddress || '',
      pickupBuildingName: metadata.pickupBuildingName || '',
      pickupContactName: metadata.pickupName || '',
      pickupContactPhone: metadata.pickupPhone || '',
      pickupInstructions: metadata.pickupInstructions || null,
      deliveryPostcode: metadata.deliveryPostcode || '',
      deliveryAddress: metadata.deliveryAddress || '',
      deliveryBuildingName: metadata.deliveryBuildingName || '',
      recipientName: metadata.recipientName || '',
      recipientPhone: metadata.recipientPhone || '',
      deliveryInstructions: metadata.deliveryInstructions || null,
      vehicleType: metadata.vehicleType as VehicleType,
      weight: metadata.weight || '1',
      basePrice: metadata.basePrice || String(getBaseChargeForVehicle(metadata.vehicleType || 'car')),
      distancePrice: metadata.distancePrice || String(Math.max(0, totalPrice - getBaseChargeForVehicle(metadata.vehicleType || 'car'))),
      weightSurcharge: metadata.weightSurcharge || '0',
      multiDropCharge: metadata.multiDropCharge || '0',
      returnTripCharge: metadata.returnTripCharge || '0',
      centralLondonCharge: metadata.centralLondonCharge || '0',
      waitingTimeCharge: metadata.waitingTimeCharge || '0',
      totalPrice: String(totalPrice),
      distance: metadata.distance || '0',
      customerId: metadata.customerId || `guest-${session.id}`,
      customerEmail: metadata.customerEmail || session.customer_email || '',
      stripePaymentIntentId: session.payment_intent as string || null,
      stripeSessionId: session.id,
      paymentStatus: 'paid',
      status: 'pending' as JobStatus,
      isMultiDrop: metadata.isMultiDrop === 'true',
      isReturnTrip: metadata.isReturnTrip === 'true',
      isCentralLondon: metadata.isCentralLondon === 'true',
      isRushHour: metadata.isRushHour === 'true',
      scheduledPickupTime: metadata.scheduledPickupTime ? new Date(metadata.scheduledPickupTime) : null,
      scheduledDeliveryTime: metadata.scheduledDeliveryTime ? new Date(metadata.scheduledDeliveryTime) : null,
      isScheduled: !!metadata.scheduledPickupTime,
    };

    const job = await storage.createJob(jobData);
    stableJobNumberCache.set(String(job.id), jobNumber);
    persistJobNumber(String(job.id), jobNumber);
    
    if (metadata.customerId) {
      await storage.incrementCompletedBookings(metadata.customerId);
      console.log(`[Booking] Incremented completed bookings count for user ${metadata.customerId}. Discount was ${metadata.discountApplied === 'true' ? 'applied' : 'not applied'}`);
    }
    
    // Send email notifications
    const customerEmailForConfirmation = metadata.customerEmail || session.customer_email;
    const jobWithEmail = { ...job, jobNumber: job.jobNumber || jobNumber, customerEmail: customerEmailForConfirmation };
    console.log(`[Email] Sending admin new booking notification for Stripe job #${job.jobNumber || jobNumber} (${job.trackingNumber})`);
    await sendNewJobNotification(job.id, jobWithEmail).catch(err => console.error('[Email] Failed to send admin notification:', err));
    if (customerEmailForConfirmation) {
      console.log(`[Email] Sending customer booking confirmation to ${customerEmailForConfirmation} for job #${job.jobNumber || jobNumber} (${job.trackingNumber})`);
      await sendCustomerBookingConfirmation(customerEmailForConfirmation, jobWithEmail).catch(err => console.error('[Email] Failed to send customer confirmation:', err));
    } else {
      console.log(`[Email] No customer email available for Stripe job ${job.trackingNumber} - skipping customer confirmation`);
    }
    
    // Send SMS confirmation to pickup contact
    const pickupPhone = metadata.pickupPhone || jobData.pickupContactPhone;
    if (pickupPhone) {
      await sendBookingConfirmationSMS(pickupPhone, trackingNumber, jobData.pickupAddress || jobData.pickupPostcode, job.jobNumber || jobNumber)
        .catch(err => console.error('Failed to send SMS confirmation:', err));
    }
    // Notify admin numbers of new booking
    sendAdminNewBookingAlert({
      jobNumber: String(job.jobNumber || jobNumber),
      trackingNumber,
      pickupAddress: jobData.pickupAddress || jobData.pickupPostcode || '',
      vehicleType: jobData.vehicleType,
      price: job.totalPrice,
    }).catch(err => console.error('[Admin SMS] Stripe booking alert failed:', err));

    res.json({ 
      success: true, 
      trackingNumber: job.trackingNumber,
      jobNumber: job.jobNumber || jobNumber,
      jobId: job.id,
      totalPrice
    });
  }));

  // Minimal price lookup for booking confirmation page.
  // Returns only totalPrice — tracking number acts as the auth token.
  // Called by PaymentSuccess.tsx when ?amount= is not in the URL.
  app.get("/api/booking/confirmed-price", asyncHandler(async (req, res) => {
    const { tracking } = req.query;
    if (!tracking || typeof tracking !== 'string') {
      return res.status(400).json({ error: 'Tracking number required' });
    }
    const job = await storage.getJobByTrackingNumber(tracking.toUpperCase());
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ totalPrice: parseFloat(String(job.totalPrice || 0)) });
  }));

  const docUrlFields = ['profilePictureUrl', 'drivingLicenceFrontUrl', 'drivingLicenceBackUrl', 'dbsCertificateUrl', 'goodsInTransitInsuranceUrl', 'hireAndRewardUrl'] as const;

  function resolveDocUrls(app: any): any {
    const resolved = { ...app };
    for (const field of docUrlFields) {
      const url = resolved[field];
      if (!url || typeof url !== 'string') continue;
      if (url.startsWith('/uploads/')) {
        resolved[field] = '/api' + url;
      } else if (url.includes('supabase.co/storage/v1/object/public/driver-documents/')) {
        const storagePath = url.split('/driver-documents/')[1];
        if (storagePath) {
          resolved[field] = `/api/uploads/documents/${storagePath}`;
        }
      }
    }
    return resolved;
  }

  app.get("/api/driver-applications", asyncHandler(async (req, res) => {
    const { status } = req.query;
    const applications = await storage.getDriverApplications({
      status: status as DriverApplicationStatus | undefined,
    });
    // Exclude draft applications from the default admin list (they are incomplete saves)
    const filtered = status ? applications : applications.filter(a => a.status !== 'draft');
    // Merge vehicle data from Neon sidecar (driver_applications lacks vehicle_* columns)
    const withVehicles = await mergeAppVehicles(filtered);
    res.json(withVehicles.map(resolveDocUrls));
  }));

  app.get("/api/driver-applications/:id", asyncHandler(async (req, res) => {
    const application = await storage.getDriverApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }
    // Merge vehicle data from Neon sidecar
    const [withVehicle] = await mergeAppVehicles([application]);
    res.json(resolveDocUrls(withVehicle));
  }));

  app.get("/api/driver-applications/check/:email", asyncHandler(async (req, res) => {
    const application = await storage.getDriverApplicationByEmail(req.params.email);
    if (application) {
      if (application.status === 'approved') {
        const { supabaseAdmin } = await import('./supabaseAdmin');
        let accountStillActive = false;
        if (supabaseAdmin) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const authUser = users?.users?.find(
            u => u.email?.toLowerCase() === req.params.email.toLowerCase()
          );
          if (authUser && !authUser.deleted_at) {
            const driver = await storage.getDriverByUserId(authUser.id);
            if (driver && driver.isActive !== false) {
              accountStillActive = true;
            }
          }
        }
        if (!accountStillActive) {
          res.json({ exists: false });
          return;
        }
      }
      if (application.status === 'rejected') {
        res.json({ exists: false });
        return;
      }
      res.json({ exists: true, status: application.status, id: application.id });
    } else {
      res.json({ exists: false });
    }
  }));

  // ── Draft save (upsert by email, no completeness validation) ─────────────
  app.post("/api/driver-applications/draft", asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required to save a draft" });

    const existing = await storage.getDriverApplicationByEmail(email);

    // Only allow draft upsert if status is draft (or no existing record)
    if (existing && existing.status !== 'draft') {
      return res.status(409).json({
        error: "An application with this email already exists",
        status: existing.status,
        applicationId: existing.id,
      });
    }

    const DRAFT_DEFAULTS = {
      vehicleType: 'motorbike' as any,
      bankName: '',
      accountHolderName: '',
      sortCode: '',
      accountNumber: '',
      fullName: '',
      phone: '',
      postcode: '',
      fullAddress: '',
      nationality: '',
      nationalInsuranceNumber: '',
    };

    const draftData: any = { ...DRAFT_DEFAULTS, ...req.body, status: 'draft' };

    // Remove fields that shouldn't be set directly
    delete draftData.phoneVerificationToken;
    delete draftData.phoneVerified;

    let application;
    if (existing) {
      // Delete old draft and recreate — ensures all fields get updated
      // (updateDriverApplication only maps a subset of fields)
      await storage.deleteDriverApplication(existing.id);
    }
    application = await storage.createDriverApplication(draftData as any);

    // Save vehicle data to Neon sidecar (driver_applications lacks vehicle_* columns)
    if (application?.id && draftData.vehicleRegistration) {
      saveAppVehicle(application.id, draftData.email, {
        vehicleRegistration: draftData.vehicleRegistration,
        vehicleMake: draftData.vehicleMake,
        vehicleModel: draftData.vehicleModel,
        vehicleColor: draftData.vehicleColor,
      }).catch(() => {});
    }

    res.json(application);
  }));

  app.post("/api/driver-applications", asyncHandler(async (req, res) => {
    const existingApplication = await storage.getDriverApplicationByEmail(req.body.email);
    if (existingApplication) {
      if (existingApplication.status === 'draft') {
        // Draft → pending: just delete so we recreate with proper status
        await storage.deleteDriverApplication(existingApplication.id);
        console.log(`[Driver Application] Deleted draft ${existingApplication.id} to promote to pending`);
      } else if (existingApplication.status === 'corrections_needed' || existingApplication.status === 'rejected') {
        await storage.deleteDriverApplication(existingApplication.id);
        console.log(`[Driver Application] Deleted ${existingApplication.status} application ${existingApplication.id} for resubmission`);
      } else if (existingApplication.status === 'approved') {
        const { supabaseAdmin } = await import('./supabaseAdmin');
        let accountStillActive = false;
        if (supabaseAdmin) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const authUser = users?.users?.find(
            u => u.email?.toLowerCase() === req.body.email.toLowerCase()
          );
          if (authUser && !authUser.deleted_at) {
            const driver = await storage.getDriverByUserId(authUser.id);
            if (driver && driver.isActive !== false) {
              accountStillActive = true;
            }
          }
        }
        if (accountStillActive) {
          return res.status(400).json({ 
            error: "An active driver account already exists with this email.",
            status: existingApplication.status,
            applicationId: existingApplication.id
          });
        }
        await storage.deleteDriverApplication(existingApplication.id);
        console.log(`[Driver Application] Deleted old approved application ${existingApplication.id} (account deleted/deactivated, allowing re-signup)`);
      } else if (existingApplication.status === 'pending') {
        return res.status(400).json({ 
          error: "An application with this email is already pending review.",
          status: existingApplication.status,
          applicationId: existingApplication.id
        });
      } else {
        return res.status(400).json({ 
          error: "An application with this email already exists",
          status: existingApplication.status,
          applicationId: existingApplication.id
        });
      }
    }

    if (req.body.phone) {
      const existingPhoneApp = await storage.getDriverApplicationByPhone(req.body.phone);
      if (existingPhoneApp && existingPhoneApp.email.toLowerCase() !== req.body.email.toLowerCase()) {
        if (existingPhoneApp.status === 'approved') {
          const { supabaseAdmin } = await import('./supabaseAdmin');
          let accountStillExists = false;
          if (supabaseAdmin) {
            const { data: users } = await supabaseAdmin.auth.admin.listUsers();
            accountStillExists = !!users?.users?.find(
              u => u.email?.toLowerCase() === existingPhoneApp.email.toLowerCase() && !u.deleted_at
            );
          }
          if (!accountStillExists) {
            await storage.deleteDriverApplication(existingPhoneApp.id);
            console.log(`[Driver Application] Deleted old approved application ${existingPhoneApp.id} (phone reuse - account deleted)`);
          } else {
            return res.status(400).json({
              error: "This phone number is already associated with an active driver account.",
            });
          }
        } else if (['pending', 'corrections_needed', 'rejected'].includes(existingPhoneApp.status)) {
          await storage.deleteDriverApplication(existingPhoneApp.id);
          console.log(`[Driver Application] Deleted old ${existingPhoneApp.status} application ${existingPhoneApp.id} for phone reuse`);
        }
      }
    }

    const { phoneVerified, phoneVerificationToken } = req.body;
    
    if (!phoneVerified) {
      return res.status(400).json({ 
        error: "Phone verification is required",
        code: "PHONE_VERIFICATION_REQUIRED"
      });
    }
    
    if (phoneVerificationToken) {
      const { consumeVerificationToken } = await import('./twilioService');
      const tokenResult = consumeVerificationToken(phoneVerificationToken);
      if (tokenResult.valid) {
        console.log(`[Driver Application] Phone token validated for phone: ${tokenResult.phone}`);
      } else {
        console.warn(`[Driver Application] Phone token expired/invalid but phoneVerified=true, allowing submission (token may have been lost on server restart)`);
      }
    } else {
      console.warn(`[Driver Application] No phone token provided but phoneVerified=true, allowing submission`);
    }

    let data;
    try {
      data = insertDriverApplicationSchema.parse(req.body);
    } catch (zodError: any) {
      console.error('[Driver Application] Zod validation error:', JSON.stringify(zodError.errors || zodError.issues || zodError.message, null, 2));
      console.error('[Driver Application] Body keys:', Object.keys(req.body));
      const missingFields = (zodError.errors || zodError.issues || [])
        .filter((e: any) => e.code === 'invalid_type' && e.received === 'undefined')
        .map((e: any) => e.path?.join('.'));
      return res.status(400).json({ 
        error: `Validation failed: ${missingFields.length > 0 ? `Missing fields: ${missingFields.join(', ')}` : zodError.message || 'Invalid data'}`,
        details: zodError.errors || zodError.issues
      });
    }

    // ── Completeness validation (beyond Zod schema) ───────────────────────
    const missingRequired: string[] = [];
    if (!data.profilePictureUrl) missingRequired.push("Profile photo");
    if (!data.drivingLicenceFrontUrl) missingRequired.push("Driving licence (front)");
    if (!data.drivingLicenceBackUrl) missingRequired.push("Driving licence (back)");
    if (!data.goodsInTransitInsuranceUrl) missingRequired.push("Goods in transit insurance");
    if (!data.hireAndRewardUrl) missingRequired.push("Hire and reward insurance");
    if (!data.vehicleRegistration?.trim()) missingRequired.push("Vehicle registration");
    if (!data.vehicleMake?.trim()) missingRequired.push("Vehicle make");
    if (!data.vehicleModel?.trim()) missingRequired.push("Vehicle model");
    if (!data.vehicleColor?.trim()) missingRequired.push("Vehicle colour");
    if (!data.isBritish && !data.rightToWorkShareCode?.trim()) missingRequired.push("Right to work share code (required for non-British applicants)");
    if (missingRequired.length > 0) {
      return res.status(400).json({
        error: `Application is incomplete. Please provide all required items before submitting. Missing: ${missingRequired.join(", ")}. Note: DBS certificate can be submitted later.`,
        code: "INCOMPLETE_APPLICATION",
        missingFields: missingRequired,
      });
    }

    let application;
    try {
      application = await storage.createDriverApplication(data);
    } catch (dbError: any) {
      console.error('[Driver Application] Database insert error:', dbError.message || dbError, dbError.details || '', dbError.code || '');
      return res.status(500).json({ 
        error: `Application could not be saved: ${dbError.message || 'Database error'}` 
      });
    }

    // Save vehicle data to Neon sidecar — driver_applications table lacks these columns
    if (application?.id) {
      saveAppVehicle(application.id, data.email, {
        vehicleRegistration: data.vehicleRegistration?.trim() || null,
        vehicleMake: data.vehicleMake?.trim() || null,
        vehicleModel: data.vehicleModel?.trim() || null,
        vehicleColor: data.vehicleColor?.trim() || null,
      }).catch(() => {});
      // Reflect vehicle data in the returned object immediately
      if (application.vehicleRegistration == null && data.vehicleRegistration) {
        application.vehicleRegistration = data.vehicleRegistration.trim();
        application.vehicleMake = data.vehicleMake?.trim() || null;
        application.vehicleModel = data.vehicleModel?.trim() || null;
        application.vehicleColor = data.vehicleColor?.trim() || null;
      }
    }

    sendDriverApplicationNotification(data.fullName, 'New Application Submitted')
      .then(sent => {
        if (sent) console.log(`[Driver Application] Admin notified of new application from ${data.fullName}`);
        else console.error(`[Driver Application] Failed to send admin notification for ${data.fullName}`);
      })
      .catch(err => console.error('[Driver Application] Error sending admin notification:', err));

    res.status(201).json(application);
  }));

  app.patch("/api/driver-applications/:id", asyncHandler(async (req, res) => {
    try {
      const application = await storage.updateDriverApplication(req.params.id, req.body);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      // Keep Neon sidecar in sync if vehicle fields are present in the update
      const body = req.body;
      const hasVehicleUpdate = body.vehicleRegistration !== undefined || body.vehicleMake !== undefined ||
        body.vehicleModel !== undefined || body.vehicleColor !== undefined;
      if (hasVehicleUpdate && application.id) {
        overwriteAppVehicle(application.id, application.email || '', {
          vehicleRegistration: typeof body.vehicleRegistration === 'string' ? body.vehicleRegistration.trim() : (application.vehicleRegistration || null),
          vehicleMake:  typeof body.vehicleMake  === 'string' ? body.vehicleMake.trim()  : (application.vehicleMake  || null),
          vehicleModel: typeof body.vehicleModel === 'string' ? body.vehicleModel.trim() : (application.vehicleModel || null),
          vehicleColor: typeof body.vehicleColor === 'string' ? body.vehicleColor.trim() : (application.vehicleColor || null),
        }).catch(() => {});
        // Reflect in response immediately
        if (body.vehicleRegistration !== undefined) application.vehicleRegistration = body.vehicleRegistration?.trim() || null;
        if (body.vehicleMake !== undefined) application.vehicleMake = body.vehicleMake?.trim() || null;
        if (body.vehicleModel !== undefined) application.vehicleModel = body.vehicleModel?.trim() || null;
        if (body.vehicleColor !== undefined) application.vehicleColor = body.vehicleColor?.trim() || null;
      }
      res.json(application);
    } catch (err: any) {
      if (err.code === 'VEHICLE_TYPE_CONSTRAINT') {
        return res.status(422).json({
          error: `Vehicle type "${err.vehicleType}" is not yet supported in the database. A one-time SQL migration is required.`,
          code: 'VEHICLE_TYPE_CONSTRAINT',
          migrationSqlUrl: '/api/admin/vehicle-migration-sql',
        });
      }
      throw err;
    }
  }));

  let supabaseFileCache: { files: Set<string>; timestamp: number } | null = null;
  const SUPABASE_FILE_CACHE_TTL = 60000;

  async function getSupabaseFileSet(): Promise<Set<string>> {
    if (supabaseFileCache && Date.now() - supabaseFileCache.timestamp < SUPABASE_FILE_CACHE_TTL) {
      return supabaseFileCache.files;
    }
    const fileSet = new Set<string>();
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (supabaseAdmin) {
        const BUCKET = 'driver-documents';
        const dirs = ['applications/pending'];
        const { data: appDirs } = await supabaseAdmin.storage.from(BUCKET).list('applications', { limit: 200 });
        if (appDirs) {
          for (const d of appDirs) {
            if (d.id && d.name !== 'pending' && d.name !== '.emptyFolderPlaceholder') {
              dirs.push(`applications/${d.name}`);
            }
          }
        }
        for (const dir of dirs) {
          const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(dir, { limit: 500 });
          if (files) {
            for (const f of files) {
              if (f.name && f.name !== '.emptyFolderPlaceholder') {
                fileSet.add(`${dir}/${f.name}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[FileCache] Error building Supabase file cache:', err);
    }
    supabaseFileCache = { files: fileSet, timestamp: Date.now() };
    return fileSet;
  }

  app.post("/api/check-files", asyncHandler(async (req, res) => {
    const { urls } = req.body;
    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: "urls array required" });
    }

    const supabaseFiles = await getSupabaseFileSet();
    const results: Record<string, boolean> = {};

    for (const url of urls) {
      if (!url || typeof url !== 'string') continue;

      if (url.startsWith('https://') && url.includes('supabase.co')) {
        const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
        if (match) {
          const [, bucket, storagePath] = match;
          try {
            const { supabaseAdmin } = await import('./supabaseAdmin');
            if (supabaseAdmin) {
              const { data, error } = await supabaseAdmin.storage
                .from(bucket)
                .download(storagePath);
              results[url] = !error && !!data;
            } else {
              const resp = await fetch(url, { method: 'HEAD' });
              results[url] = resp.ok;
            }
          } catch {
            results[url] = false;
          }
        } else {
          try {
            const resp = await fetch(url, { method: 'HEAD' });
            results[url] = resp.ok;
          } catch {
            results[url] = false;
          }
        }
        continue;
      }

      const cleanUrl = url.replace(/^\/api/, '');
      const localPath = path.join(process.cwd(), cleanUrl);
      if (fs.existsSync(localPath)) {
        results[url] = true;
        continue;
      }

      const fileName = path.basename(url);
      let found = false;
      for (const storagePath of supabaseFiles) {
        if (storagePath.endsWith('/' + fileName)) {
          found = true;
          break;
        }
      }
      if (!found) {
        try {
          const { supabaseAdmin } = await import('./supabaseAdmin');
          if (supabaseAdmin) {
            const strippedPath = cleanUrl.replace(/^\/uploads\/documents\//, '');
            const appPendingPath = strippedPath.replace(/^application-pending\//, 'applications/pending/');
            const possiblePaths = [
              strippedPath,
              appPendingPath,
              `applications/pending/${fileName}`,
              `applications/${strippedPath}`,
              fileName,
            ];
            const buckets = ['driver-documents', 'DRIVER-DOCUMENTS'];
            outer:
            for (const bucket of buckets) {
              for (const sp of possiblePaths) {
                try {
                  const { data, error } = await supabaseAdmin.storage
                    .from(bucket)
                    .download(sp);
                  if (!error && data) {
                    found = true;
                    break outer;
                  }
                } catch (_) {}
              }
            }
          }
        } catch (e) {
          console.error('[check-files] Supabase direct check failed:', e);
        }
      }
      results[url] = found;
    }

    res.json(results);
  }));

  app.head("/api/uploads/*", asyncHandler(async (req, res) => {
    const filePath = req.params[0];
    if (!filePath || filePath.includes('..')) {
      return res.status(400).end();
    }

    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.status(404).end();

    const fileName = path.basename(filePath);
    const BUCKETS = ['driver-documents', 'DRIVER-DOCUMENTS'];
    const cleanPath = filePath.replace(/^documents\//, '');
    const appPendingConverted = cleanPath.replace(/^application-pending\//, 'applications/pending/');
    const possiblePaths = [
      cleanPath,
      appPendingConverted,
      `drivers/${cleanPath}`,
      filePath,
      `applications/pending/${fileName}`,
      `applications/${cleanPath}`,
      fileName,
    ];

    const headPathParts = cleanPath.split('/');
    if (headPathParts.length >= 2) {
      const headDriverId = headPathParts[0];
      const headFileName = headPathParts[headPathParts.length - 1];
      const headDocTypeMatch = headFileName.match(/^([a-z_]+?)_\d+/);
      if (headDocTypeMatch) {
        possiblePaths.push(`drivers/${headDriverId}/${headDocTypeMatch[1]}/${headFileName}`);
      }
      possiblePaths.push(`drivers/${headDriverId}/${headFileName}`);
    }

    for (const bucket of BUCKETS) {
      for (const sp of possiblePaths) {
        try {
          const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(sp, 60);
          if (!error && data?.signedUrl) return res.status(200).end();
        } catch (_) {}
      }
    }

    return res.status(404).end();
  }));

  app.get("/api/uploads/*", asyncHandler(async (req, res) => {
    const filePath = req.params[0];
    if (!filePath || filePath.includes('..')) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Storage service unavailable" });
    }

    const fileName = path.basename(filePath);
    const BUCKETS = ['driver-documents', 'DRIVER-DOCUMENTS'];
    const cleanPath = filePath.replace(/^documents\//, '');
    const appPendingConverted = cleanPath.replace(/^application-pending\//, 'applications/pending/');
    
    const possiblePaths = [
      cleanPath,
      appPendingConverted,
      `drivers/${cleanPath}`,
      filePath,
      `applications/pending/${fileName}`,
      `applications/${cleanPath}`,
      fileName,
    ];

    const getPathParts = cleanPath.split('/');
    if (getPathParts.length >= 2) {
      const getDriverId = getPathParts[0];
      const getFileName = getPathParts[getPathParts.length - 1];
      const getDocTypeMatch = getFileName.match(/^([a-z_]+?)_\d+/);
      if (getDocTypeMatch) {
        possiblePaths.push(`drivers/${getDriverId}/${getDocTypeMatch[1]}/${getFileName}`);
      }
      possiblePaths.push(`drivers/${getDriverId}/${getFileName}`);
    }

    // Helper: stream file content inline so browsers display PDFs properly
    const streamFileInline = async (signedUrl: string, fileName: string): Promise<boolean> => {
      try {
        const fetchRes = await fetch(signedUrl);
        if (!fetchRes.ok) return false;
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        const mimeMap: Record<string, string> = {
          pdf: 'application/pdf',
          jpg: 'image/jpeg', jpeg: 'image/jpeg',
          png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        };
        const contentType = mimeMap[ext] || fetchRes.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        const buf = await fetchRes.arrayBuffer();
        res.send(Buffer.from(buf));
        return true;
      } catch { return false; }
    };

    for (const bucket of BUCKETS) {
      for (const storagePath of possiblePaths) {
        try {
          const { data: signedData, error: signError } = await supabaseAdmin.storage
            .from(bucket)
            .createSignedUrl(storagePath, 600);
          
          if (!signError && signedData?.signedUrl) {
            const uploadFileName = path.basename(storagePath);
            const streamed = await streamFileInline(signedData.signedUrl, uploadFileName);
            if (streamed) return;
            return res.redirect(signedData.signedUrl);
          }
        } catch (_) {}
      }
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pathParts = cleanPath.split('/');
    const driverUUID = pathParts.length >= 2 ? pathParts[0] : null;
    
    if (driverUUID && uuidPattern.test(driverUUID)) {
      const docPrefixes = findDocTypeMatch(fileName);
      
      const searchFolders = [
        driverUUID,
        `drivers/${driverUUID}`,
        `applications/${driverUUID}`,
        'applications/pending',
      ];
      
      for (const folder of searchFolders) {
        for (const bucket of BUCKETS) {
          try {
            const { data: folderFiles, error: listErr } = await supabaseAdmin.storage
              .from(bucket)
              .list(folder, { limit: 200 });
            
            if (listErr || !folderFiles) continue;
            
            for (const storageFile of folderFiles) {
              if (!storageFile.name || storageFile.name === '.emptyFolderPlaceholder') continue;
              const storageBaseName = storageFile.name.replace(/\.[^.]+$/, '');
              const storageWithoutTs = storageBaseName.replace(/_\d{10,}$/, '');
              
              for (const prefix of docPrefixes) {
                if (storageWithoutTs === prefix || storageWithoutTs.startsWith(prefix + '_')) {
                  const { data: signedData, error: signErr } = await supabaseAdmin.storage
                    .from(bucket)
                    .createSignedUrl(`${folder}/${storageFile.name}`, 600);
                  if (!signErr && signedData?.signedUrl) {
                    return res.redirect(signedData.signedUrl);
                  }
                }
              }
            }
          } catch (_) {}
        }
      }
    }

    const localFilePath = path.join(process.cwd(), 'uploads', filePath);
    try {
      if (fs.existsSync(localFilePath)) {
        return res.sendFile(localFilePath);
      }
    } catch (_) {}

    const localDocsPath = path.join(process.cwd(), 'uploads', 'documents', cleanPath);
    try {
      if (fs.existsSync(localDocsPath)) {
        return res.sendFile(localDocsPath);
      }
    } catch (_) {}

    return res.status(404).json({ error: "File not found in storage" });
  }));

  // ── Application document viewer ──────────────────────────────────────────
  // Serves application-uploaded docs (images/PDFs) via signed URL from
  // the 'driver-documents' Supabase bucket, falling back to local disk.
  const APPLICATION_FIELD_MAP: Record<string, string> = {
    profilePicture: 'profile_picture_url',
    drivingLicenceFront: 'driving_licence_front_url',
    drivingLicenceBack: 'driving_licence_back_url',
    dbsCertificate: 'dbs_certificate_url',
    goodsInTransitInsurance: 'goods_in_transit_insurance_url',
    hireAndReward: 'hire_and_reward_url',
  };

  // ── Driver profile picture serving (no auth — for <img> tags) ────────────
  app.get("/api/drivers/:id/profile-picture", asyncHandler(async (req, res) => {
    const driverId = req.params.id;
    const { supabaseAdmin: sb } = await import('./supabaseAdmin');
    if (!sb) return res.status(500).json({ error: 'Storage unavailable' });

    // Fetch the stored URL from Supabase drivers table
    const { data: driverRow } = await sb
      .from('drivers')
      .select('profile_picture_url')
      .eq('id', driverId)
      .maybeSingle();

    const rawUrl: string | null = driverRow?.profile_picture_url ?? null;
    if (!rawUrl) return res.status(404).json({ error: 'No profile picture' });

    // Helper: stream a URL directly to the response
    const streamUrl = async (url: string): Promise<boolean> => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) return false;
        const ext = (url.split('.').pop() || '').toLowerCase().split('?')[0];
        const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        res.setHeader('Content-Type', MIME[ext] || r.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=300');
        const { Readable } = await import('stream');
        Readable.fromWeb(r.body as any).pipe(res);
        return true;
      } catch (_) { return false; }
    };

    // Extract storage path from a full Supabase URL
    const extractPath = (url: string): string | null => {
      const markers = [
        '/object/public/DRIVER-DOCUMENTS/',
        '/object/public/driver-documents/',
        '/object/DRIVER-DOCUMENTS/',
        '/object/driver-documents/',
      ];
      for (const m of markers) {
        const idx = url.indexOf(m);
        if (idx !== -1) return url.substring(idx + m.length).split('?')[0];
      }
      return null;
    };

    // Strategy 1: try direct fetch of the stored URL
    if (rawUrl.startsWith('http')) {
      const ok = await streamUrl(rawUrl);
      if (ok) return;
    }

    // Strategy 2: generate a fresh signed URL from storage
    const storagePath = rawUrl.startsWith('http') ? extractPath(rawUrl) : rawUrl.split('?')[0];
    if (storagePath) {
      for (const bucket of ['DRIVER-DOCUMENTS', 'driver-documents']) {
        try {
          const { data } = await sb.storage.from(bucket).createSignedUrl(storagePath, 3600);
          if (data?.signedUrl) {
            const ok = await streamUrl(data.signedUrl);
            if (ok) return;
          }
        } catch (_) {}
      }
    }

    return res.status(404).json({ error: 'Could not serve profile picture' });
  }));

  app.get("/api/application-document/:appId/:field", asyncHandler(async (req, res) => {
    const { appId, field } = req.params;
    const col = APPLICATION_FIELD_MAP[field];
    if (!col) return res.status(400).json({ error: 'Unknown document field' });

    const { supabaseAdmin: sb } = await import('./supabaseAdmin');
    if (!sb) return res.status(500).json({ error: 'Storage service unavailable' });

    // Also fetch all driver URL columns so we can fall back to the approved driver's copy
    const { data: appRow, error: appErr } = await sb
      .from('driver_applications')
      .select(`id, email, ${col}`)
      .eq('id', appId)
      .single();

    if (appErr || !appRow) return res.status(404).json({ error: 'Application not found' });

    const rawStoredValue: string | null = (appRow as any)[col];

    // Helper: stream a Supabase signed URL to the response
    const streamSignedUrl = async (signedUrl: string, ct: string): Promise<boolean> => {
      try {
        const remote = await fetch(signedUrl);
        if (!remote.ok) return false;
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'private, max-age=120');
        const { Readable } = await import('stream');
        Readable.fromWeb(remote.body as any).pipe(res);
        return true;
      } catch (_) { return false; }
    };

    // Helper: try a storage path against both buckets; return true if served
    const tryStoragePath = async (sp: string, ct: string): Promise<boolean> => {
      for (const bucket of ['DRIVER-DOCUMENTS', 'driver-documents']) {
        try {
          const { data } = await sb.storage.from(bucket).createSignedUrl(sp, 300);
          if (data?.signedUrl) {
            const ok = await streamSignedUrl(data.signedUrl, ct);
            if (ok) return true;
          }
        } catch (_) {}
      }
      return false;
    };

    // Build the list of candidate storage paths to try, in priority order
    const buildCandidatePaths = (raw: string): string[] => {
      const candidates: string[] = [];
      // 1. Extract clean path from full Supabase URL
      const extracted = extractStoragePath(raw);
      if (extracted) candidates.push(extracted);
      // 2. The raw value itself (if it looks like a plain storage path)
      if (!raw.startsWith('http') && !raw.startsWith('/')) candidates.push(raw);
      // 3. Normalise application-pending/ → applications/pending/
      const fileName = raw.split('/').pop()?.split('?')[0] || '';
      if (raw.includes('application-pending/') && !raw.includes('applications/pending/')) {
        const converted = raw.replace(/^.*application-pending\//, 'applications/pending/');
        candidates.push(converted);
      }
      // 4. Always try both prefixes with just the filename
      if (fileName) {
        candidates.push(`applications/pending/${fileName}`);
        candidates.push(`application-pending/${fileName}`);
      }
      return [...new Set(candidates.filter(Boolean))];
    };

    // Helper: detect MIME from any path/URL string
    const detectMime = (src: string): string => {
      const ext = (src.split('.').pop() || '').toLowerCase().split('?')[0];
      const MIME: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
      };
      return MIME[ext] || 'application/octet-stream';
    };

    // ── STRATEGY 1: Try the stored application value ──────────────────────────
    if (rawStoredValue) {
      const ct = detectMime(rawStoredValue);

      // If the stored value IS a full signed/public URL, fetch directly first
      if (rawStoredValue.startsWith('http')) {
        try {
          const direct = await fetch(rawStoredValue);
          if (direct.ok) {
            res.setHeader('Content-Type', ct);
            res.setHeader('Cache-Control', 'private, max-age=120');
            const { Readable } = await import('stream');
            Readable.fromWeb(direct.body as any).pipe(res);
            return;
          }
        } catch (_) {}
      }

      // Try all candidate storage paths
      for (const candidate of buildCandidatePaths(rawStoredValue)) {
        const served = await tryStoragePath(candidate, ct);
        if (served) return;
      }
    }

    // ── STRATEGY 2: Fall back to the driver record (approved applications have docs copied there) ──
    // Map application table columns → driver table columns (names differ for hire_and_reward)
    const APP_TO_DRIVER_COL: Record<string, string> = {
      profile_picture_url: 'profile_picture_url',
      driving_licence_front_url: 'driving_licence_front_url',
      driving_licence_back_url: 'driving_licence_back_url',
      dbs_certificate_url: 'dbs_certificate_url',
      goods_in_transit_insurance_url: 'goods_in_transit_insurance_url',
      hire_and_reward_url: 'hire_reward_insurance_url',
    };
    const driverCol = APP_TO_DRIVER_COL[col] || col;

    if ((appRow as any).email) {
      try {
        const { data: driver } = await sb
          .from('drivers')
          .select(`id, ${driverCol}`)
          .ilike('email', (appRow as any).email)
          .maybeSingle();

        if (driver) {
          const driverUrl: string | null = (driver as any)[driverCol];
          if (driverUrl) {
            const ct = detectMime(driverUrl);
            if (driverUrl.startsWith('http')) {
              try {
                const direct = await fetch(driverUrl);
                if (direct.ok) {
                  res.setHeader('Content-Type', ct);
                  res.setHeader('Cache-Control', 'private, max-age=120');
                  const { Readable } = await import('stream');
                  Readable.fromWeb(direct.body as any).pipe(res);
                  return;
                }
              } catch (_) {}
            }
            for (const candidate of buildCandidatePaths(driverUrl)) {
              const served = await tryStoragePath(candidate, ct);
              if (served) return;
            }
          }

          // Also try driverId-prefixed paths in storage
          const driverId = (driver as any).id;
          const fileName = rawStoredValue?.split('/').pop()?.split('?')[0] || '';
          if (driverId && fileName) {
            const ct = detectMime(fileName);
            const driverPaths = [
              `${driverId}/${fileName}`,
              `${driverId}/driving_licence/${fileName}`,
              `${driverId}/document/${fileName}`,
            ];
            for (const dp of driverPaths) {
              const served = await tryStoragePath(dp, ct);
              if (served) return;
            }
          }
        }
      } catch (_) {}
    }

    // ── STRATEGY 3: Local disk fallbacks ──────────────────────────────────────
    if (rawStoredValue) {
      const fileName = rawStoredValue.split('/').pop()?.split('?')[0] || '';
      const cleanPath = rawStoredValue.startsWith('/') ? rawStoredValue.slice(1) : rawStoredValue;
      const ct = detectMime(rawStoredValue);
      const localCandidates = [
        path.join(process.cwd(), cleanPath),
        path.join(process.cwd(), 'uploads', 'documents', 'application-pending', fileName),
        path.join(process.cwd(), 'uploads', 'documents', fileName),
      ];
      for (const lp of localCandidates) {
        if (fs.existsSync(lp)) {
          res.setHeader('Content-Type', ct);
          res.setHeader('Content-Disposition', `inline; filename="${path.basename(lp)}"`);
          return res.sendFile(lp);
        }
      }
    }

    return res.status(404).json({ error: 'Document not found in any storage location' });
  }));

  app.post("/api/driver-applications/:id/upload-document", requireAdminAccessStrict, (req, res, next) => {
    uploadDocument.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File size exceeds 10MB limit" });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message || "Invalid file" });
      }
      next();
    });
  }, asyncHandler(async (req, res) => {
    const applicationId = req.params.id;
    const { documentField } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const allowedFields = [
      'profilePictureUrl', 'drivingLicenceFrontUrl', 'drivingLicenceBackUrl',
      'dbsCertificateUrl', 'goodsInTransitInsuranceUrl', 'hireAndRewardUrl'
    ];
    if (!documentField || !allowedFields.includes(documentField)) {
      return res.status(400).json({ error: "Invalid document field" });
    }

    const fieldToColumn: Record<string, string> = {
      'profilePictureUrl': 'profile_picture_url',
      'drivingLicenceFrontUrl': 'driving_licence_front_url',
      'drivingLicenceBackUrl': 'driving_licence_back_url',
      'dbsCertificateUrl': 'dbs_certificate_url',
      'goodsInTransitInsuranceUrl': 'goods_in_transit_insurance_url',
      'hireAndRewardUrl': 'hire_and_reward_url',
    };

    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Storage service unavailable" });
    }

    const { data: appExists, error: checkErr } = await supabaseAdmin
      .from('driver_applications')
      .select('id')
      .eq('id', applicationId)
      .maybeSingle();

    if (checkErr || !appExists) {
      return res.status(404).json({ error: "Application not found" });
    }

    const safeId = sanitizePath(applicationId);
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const safeField = sanitizePath(documentField);
    const finalFilename = `${safeField}_${timestamp}${ext}`;

    const BUCKET = 'driver-documents';
    const storagePath = `applications/${safeId}/${finalFilename}`;
    const contentType = file.mimetype || 'application/octet-stream';
    const fileBuffer = file.buffer;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, { contentType, upsert: true });

    if (uploadErr) {
      console.error('[Admin Doc Upload] Supabase Storage upload error:', uploadErr.message);
      return res.status(500).json({ error: "Failed to upload document to storage" });
    }

    console.log(`[Admin Doc Upload] Uploaded to Supabase Storage: ${BUCKET}/${storagePath}`);

    const fileUrl = storagePath;

    const columnName = fieldToColumn[documentField];
    const { error: updateErr } = await supabaseAdmin
      .from('driver_applications')
      .update({ [columnName]: fileUrl })
      .eq('id', applicationId);

    if (updateErr) {
      console.error('[Admin Doc Upload] Failed to update application:', updateErr);
      return res.status(500).json({ error: "Failed to update application record" });
    }

    console.log(`[Admin Doc Upload] Updated ${documentField} for application ${applicationId}`);
    res.json({ success: true, storagePath, bucket: BUCKET, fileUrl, documentField });
  }));

  app.patch("/api/driver-applications/:id/review", asyncHandler(async (req, res) => {
    const { status, reviewedBy, reviewNotes, rejectionReason, documentStatuses } = req.body;
    
    if (!status || !reviewedBy) {
      return res.status(400).json({ error: "Status and reviewedBy are required" });
    }

    let application: any;
    try {
      application = await storage.reviewDriverApplication(
        req.params.id,
        status as DriverApplicationStatus,
        reviewedBy,
        reviewNotes,
        rejectionReason
      );
    } catch (err: any) {
      if (err.code === 'VEHICLE_TYPE_CONSTRAINT') {
        return res.status(422).json({
          error: `Vehicle type not yet supported in database. Run the migration SQL first.`,
          code: 'VEHICLE_TYPE_CONSTRAINT',
          migrationSqlUrl: '/api/admin/vehicle-migration-sql',
        });
      }
      throw err;
    }

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    res.json(application);

    // CRITICAL: When application is approved, also set is_verified = true on the driver
    // OPTIMIZED: Runs AFTER response sent. All file copies in parallel, no duplicate work
    if (status === 'approved') {
      try {
        const { supabaseAdmin } = await import('./supabaseAdmin');
        if (supabaseAdmin) {
          const startTime = Date.now();
          const { data: driver, error: findError } = await supabaseAdmin
            .from('drivers')
            .select('id, driver_code, status')
            .ilike('email', application.email)
            .maybeSingle();
          
          const allDocMappings = [
            { url: application.profilePictureUrl, type: 'profile_picture', col: 'profile_picture_url', label: 'Profile Picture' },
            { url: application.drivingLicenceFrontUrl, type: 'driving_licence', col: 'driving_licence_front_url', label: 'Driving Licence (Front)' },
            { url: application.drivingLicenceBackUrl, type: 'driving_licence_back', col: 'driving_licence_back_url', label: 'Driving Licence (Back)' },
            { url: application.dbsCertificateUrl, type: 'dbs_certificate', col: 'dbs_certificate_url', label: 'DBS Certificate' },
            { url: application.goodsInTransitInsuranceUrl, type: 'goods_in_transit', col: 'goods_in_transit_insurance_url', label: 'Goods in Transit Insurance' },
            { url: application.hireAndRewardUrl, type: 'hire_and_reward', col: 'hire_reward_insurance_url', label: 'Hire & Reward Insurance' },
          ].filter(m => !!m.url);

          async function copyAllDocsParallel(driverId: string) {
            const results = await Promise.allSettled(
              allDocMappings.map(async (m) => {
                const fileResult = await copyApplicationFileToDriver(m.url!, driverId, supabaseAdmin);
                return { ...m, fileResult };
              })
            );
            return results
              .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
              .map(r => r.value);
          }

          async function upsertDocRecords(driverId: string, copiedDocs: any[], docStatus: string = 'approved') {
            await Promise.allSettled(copiedDocs.map(async (m) => {
              try {
                const { data: existingDoc } = await supabaseAdmin.from('driver_documents')
                  .select('id, storage_path, bucket')
                  .eq('driver_id', driverId)
                  .eq('doc_type', m.type)
                  .maybeSingle();

                if (existingDoc && existingDoc.storage_path && existingDoc.bucket) {
                  await supabaseAdmin.from('driver_documents')
                    .update({ status: docStatus, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
                    .eq('id', existingDoc.id);
                } else if (existingDoc) {
                  await supabaseAdmin.from('driver_documents')
                    .update({
                      file_url: m.fileResult.path, bucket: m.fileResult.bucket, storage_path: m.fileResult.path,
                      status: docStatus, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(),
                    })
                    .eq('id', existingDoc.id);
                } else {
                  await supabaseAdmin.from('driver_documents')
                    .insert({
                      driver_id: driverId, auth_user_id: driverId, doc_type: m.type,
                      file_url: m.fileResult.path, bucket: m.fileResult.bucket, storage_path: m.fileResult.path,
                      file_name: m.label, status: docStatus, uploaded_at: new Date().toISOString(),
                      reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(),
                    });
                }
                console.log(`[Driver Application] Doc ${m.type} processed for driver ${driverId}`);
              } catch (docErr) {
                console.error(`[Driver Application] Failed doc ${m.type}:`, docErr);
              }
            }));
          }

          // Merge vehicle data from Neon sidecar in case driver_applications columns are missing
          if (!application.vehicleRegistration) {
            try {
              const [merged] = await mergeAppVehicles([application]);
              application = merged;
            } catch (_) {}
          }

          if (driver) {
            const updateData: Record<string, any> = { 
              status: 'approved', updated_at: new Date().toISOString()
            };
            if (application.profilePictureUrl) updateData.profile_picture_url = normalizeDocumentUrl(application.profilePictureUrl) || application.profilePictureUrl;
            if (application.fullName) updateData.full_name = application.fullName;
            if (application.phone) updateData.phone = application.phone;
            if (application.postcode) updateData.postcode = application.postcode;
            if (application.fullAddress) updateData.address = application.fullAddress;
            if (application.buildingName) updateData.building_name = application.buildingName;
            if (application.nationality) updateData.nationality = application.nationality;
            if (application.isBritish !== undefined) updateData.is_british = application.isBritish;
            if (application.nationalInsuranceNumber) updateData.national_insurance_number = application.nationalInsuranceNumber;
            if (application.rightToWorkShareCode) updateData.right_to_work_share_code = application.rightToWorkShareCode;
            if (application.vehicleType) updateData.vehicle_type = application.vehicleType;
            if (application.vehicleRegistration) updateData.vehicle_registration = application.vehicleRegistration;
            if (application.vehicleMake) updateData.vehicle_make = application.vehicleMake;
            if (application.vehicleModel) updateData.vehicle_model = application.vehicleModel;
            if (application.vehicleColor) updateData.vehicle_color = application.vehicleColor;
            if (application.bankName) updateData.bank_name = application.bankName;
            if (application.accountHolderName) updateData.account_holder_name = application.accountHolderName;
            if (application.sortCode) updateData.sort_code = application.sortCode;
            if (application.accountNumber) updateData.account_number = application.accountNumber;

            const [updateResult, copiedDocs] = await Promise.all([
              (async () => {
                // Smart retry: if a column doesn't exist, parse the exact name from the
                // Postgres error and skip only that column, then retry — never silently
                // drop an entire category of fields.
                let currentData = { ...updateData };
                const savedVehicleReg = currentData.vehicle_registration;
                let updateError: any = null;
                let attempts = 0;
                while (attempts < 20 && Object.keys(currentData).length > 0) {
                  const result = await supabaseAdmin.from('drivers').update(currentData).eq('id', driver.id);
                  updateError = result.error;
                  if (!updateError) break;
                  const colMatch = updateError.message?.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/);
                  if (colMatch?.[1]) {
                    const badCol = colMatch[1];
                    console.warn(`[Driver Application] Column "${badCol}" missing from drivers, skipping for ${driver.driver_code}`);
                    // If vehicle_registration is missing, preserve it inside vehicle_type
                    if (badCol === 'vehicle_registration' && savedVehicleReg && currentData.vehicle_type) {
                      currentData.vehicle_type = `${currentData.vehicle_type.split('|')[0]}|${savedVehicleReg}`;
                    }
                    delete currentData[badCol];
                    attempts++;
                    continue;
                  }
                  break; // Non-column error — stop retrying
                }
                return updateError;
              })(),
              copyAllDocsParallel(driver.id),
            ]);

            if (!updateResult) {
              console.log(`[Driver Application] Driver ${driver.driver_code} verified and profile synced after application approval`);
              await storage.verifyDriver(driver.id, true);
              if (application.profilePictureUrl) {
                storage.updateDriver(driver.id, { profilePictureUrl: application.profilePictureUrl }).catch(() => {});
              }

              const docColumnUpdates: Record<string, any> = {};
              for (const doc of copiedDocs) {
                if (doc.col) docColumnUpdates[doc.col] = doc.fileResult.path;
              }
              const [, ] = await Promise.all([
                Object.keys(docColumnUpdates).length > 0
                  ? supabaseAdmin.from('drivers').update(docColumnUpdates).eq('id', driver.id)
                    .then(({ error }: any) => { if (error) console.error(`[Driver Application] Failed doc column sync:`, error); else console.log(`[Driver Application] Doc URLs synced for ${driver.driver_code}`); })
                  : Promise.resolve(),
                upsertDocRecords(driver.id, copiedDocs),
              ]);

              try {
                const { sendDriverApprovalEmailExisting } = await import('./emailService');
                const sent = await sendDriverApprovalEmailExisting(application.email, application.fullName, driver.driver_code);
                if (sent) console.log(`[Driver Application] Approval email sent to existing driver ${application.email}`);
                else console.error(`[Driver Application] Failed to send approval email to existing driver ${application.email}`);
              } catch (emailErr) {
                console.error('[Driver Application] Error sending approval email to existing driver:', emailErr);
              }
            } else {
              console.error(`[Driver Application] Failed to update driver ${driver.driver_code}:`, updateResult);
              try {
                const { sendDriverApprovalEmailExisting } = await import('./emailService');
                const sent = await sendDriverApprovalEmailExisting(application.email, application.fullName, driver.driver_code);
                if (sent) console.log(`[Driver Application] Approval email sent despite update error to ${application.email}`);
                else console.error(`[Driver Application] Failed to send approval email to ${application.email}`);
              } catch (emailErr) {
                console.error('[Driver Application] Error sending approval email after update failure:', emailErr);
              }
            }
          } else if (findError) {
            console.error(`[Driver Application] Error finding driver by email ${application.email}:`, findError);
            try {
              const { sendDriverApprovalEmailExisting } = await import('./emailService');
              const sent = await sendDriverApprovalEmailExisting(application.email, application.fullName, 'TBD');
              if (sent) console.log(`[Driver Application] Approval email sent despite lookup error to ${application.email}`);
              else console.error(`[Driver Application] Failed to send approval email to ${application.email}`);
            } catch (emailErr) {
              console.error('[Driver Application] Error sending fallback approval email:', emailErr);
            }
          } else if (!driver) {
            console.log(`[Driver Application] No driver found for email ${application.email} - creating account automatically`);
            try {
              const tempPassword = generateReadableTempPassword();
              
              let oldAuthUser: any = null;
              try {
                const { data: allUsersData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
                oldAuthUser = allUsersData?.users?.find(
                  (u: any) => u.email?.toLowerCase() === application.email.toLowerCase()
                ) || null;
              } catch (lookupErr) {
                console.warn(`[Driver Application] User lookup failed:`, lookupErr);
              }

              if (oldAuthUser) {
                console.log(`[Driver Application] Found existing auth user ${oldAuthUser.id} for ${application.email} - cleaning up for re-signup`);
                const oldDriverRecord = await storage.getDriverByUserId(oldAuthUser.id);
                if (!oldDriverRecord || oldDriverRecord.isActive === false) {
                  if (oldDriverRecord) {
                    await supabaseAdmin.from('drivers').delete().eq('id', oldAuthUser.id);
                    console.log(`[Driver Application] Deleted old deactivated driver record ${oldAuthUser.id}`);
                  }
                  await supabaseAdmin.auth.admin.deleteUser(oldAuthUser.id);
                  console.log(`[Driver Application] Deleted old auth user ${oldAuthUser.id} for re-signup`);
                }
              }

              const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email: application.email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { fullName: application.fullName, role: 'driver', phone: application.phone }
              });

              if (authError) {
                console.error(`[Driver Application] Failed to create auth user for ${application.email}:`, authError);
              } else if (authUser?.user) {
                const userId = authUser.user.id;
                console.log(`[Driver Application] Auth user created: ${userId}`);

                const [existingDriverResult, copiedDocs] = await Promise.all([
                  supabaseAdmin.from('drivers').select('id, driver_code').eq('id', userId).maybeSingle(),
                  copyAllDocsParallel(userId),
                ]);

                const existingCode = existingDriverResult.data?.driver_code;
                let driverCode: string;
                if (existingCode && /^RC\d{2}[A-Z]$/.test(existingCode)) {
                  driverCode = existingCode;
                } else {
                  driverCode = await generateUniqueDriverCode(supabaseAdmin);
                }

                const driverData: Record<string, any> = {
                  id: userId, user_id: userId, driver_code: driverCode,
                  full_name: application.fullName, email: application.email, phone: application.phone,
                  postcode: application.postcode || null, address: application.fullAddress || null,
                  nationality: application.nationality || null, is_british: application.isBritish ?? true,
                  national_insurance_number: application.nationalInsuranceNumber || null,
                  right_to_work_share_code: application.rightToWorkShareCode || null,
                  vehicle_type: application.vehicleType || 'car',
                  vehicle_registration: application.vehicleRegistration || null,
                  vehicle_make: application.vehicleMake || null,
                  vehicle_model: application.vehicleModel || null,
                  vehicle_color: application.vehicleColor || null,
                  online_status: 'offline', status: 'approved', is_active: true,
                  bank_name: application.bankName || null, account_holder_name: application.accountHolderName || null,
                  sort_code: application.sortCode || null, account_number: application.accountNumber || null,
                };

                for (const doc of copiedDocs) {
                  if (doc.col) driverData[doc.col] = doc.fileResult.path;
                }

                // Smart retry: detect each missing column by name and skip only that
                // one, so all other fields (postcode, NI, share code, etc.) are saved.
                let currentInsertData = { ...driverData };
                const savedVehicleRegNew = currentInsertData.vehicle_registration;
                let insertError: any = null;
                let insertAttempts = 0;
                while (insertAttempts < 20 && Object.keys(currentInsertData).length > 0) {
                  const result = await supabaseAdmin.from('drivers').upsert(currentInsertData, { onConflict: 'id' });
                  insertError = result.error;
                  if (!insertError) break;
                  const colMatch = insertError.message?.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/);
                  if (colMatch?.[1]) {
                    const badCol = colMatch[1];
                    console.warn(`[Driver Application] Column "${badCol}" missing from drivers, skipping for new driver ${driverData.driver_code}`);
                    if (badCol === 'vehicle_registration' && savedVehicleRegNew && currentInsertData.vehicle_type) {
                      currentInsertData.vehicle_type = `${currentInsertData.vehicle_type.split('|')[0]}|${savedVehicleRegNew}`;
                    }
                    delete currentInsertData[badCol];
                    insertAttempts++;
                    continue;
                  }
                  break; // Non-column error — stop retrying
                }

                if (insertError) {
                  console.error(`[Driver Application] Failed to create driver record:`, insertError);
                  try {
                    const { sendDriverApprovalEmail } = await import('./emailService');
                    const sent = await sendDriverApprovalEmail(application.email, application.fullName, driverCode, tempPassword);
                    if (sent) console.log(`[Driver Application] Approval email sent despite record error to ${application.email}`);
                    else console.error(`[Driver Application] Failed to send approval email to ${application.email}`);
                  } catch (emailErr) {
                    console.error('[Driver Application] Error sending approval email after record failure:', emailErr);
                  }
                } else {
                  console.log(`[Driver Application] Driver ${driverCode} created for ${application.email} (vehicle: ${application.vehicleType} ${application.vehicleMake || ''} ${application.vehicleModel || ''}, reg: ${application.vehicleRegistration || 'none'})`);

                  await setMustChangePassword(userId, true);

                  await upsertDocRecords(userId, copiedDocs);

                  try {
                    const { sendDriverApprovalEmail } = await import('./emailService');
                    const sent = await sendDriverApprovalEmail(application.email, application.fullName, driverCode, tempPassword);
                    if (sent) console.log(`[Driver Application] Approval email with credentials sent to ${application.email}`);
                    else console.error(`[Driver Application] Failed to send approval email to ${application.email}`);
                  } catch (emailErr) {
                    console.error('[Driver Application] Error sending approval email:', emailErr);
                  }
                }
              }
            } catch (createErr) {
              console.error(`[Driver Application] Error creating driver account:`, createErr);
            }
          }
          console.log(`[Driver Application] Approval completed in ${Date.now() - startTime}ms`);
        }
      } catch (verifyErr) {
        console.error(`[Driver Application] Error verifying driver after approval:`, verifyErr);
      }
    }

    sendDriverApplicationNotification(application.fullName, status).catch(err => console.error('Failed to send application notification:', err));
  }));

  app.post("/api/driver-applications/:id/resend-approval", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.substring(7);
    const { data: { user: authUser }, error: authError } = await supabaseAdmin!.auth.getUser(token);
    if (authError || !authUser?.email) {
      return res.status(401).json({ error: "Invalid authentication token" });
    }
    const isAdmin = await isAdminByEmail(authUser.email);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const application = await storage.getDriverApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }
    if (application.status !== 'approved') {
      return res.status(400).json({ error: "Application is not approved" });
    }

    let { data: driver } = await supabaseAdmin!
      .from('drivers')
      .select('id, driver_code, email')
      .ilike('email', application.email)
      .maybeSingle();

    const tempPassword = generateReadableTempPassword();

    if (!driver) {
      console.log(`[Resend Approval] No driver account found for ${application.email} - creating one now`);
      try {
        let oldAuthUser: any = null;
        try {
          const { data: allUsersData } = await supabaseAdmin!.auth.admin.listUsers({ page: 1, perPage: 1000 });
          oldAuthUser = allUsersData?.users?.find(
            (u: any) => u.email?.toLowerCase() === application.email.toLowerCase()
          ) || null;
        } catch {}

        if (oldAuthUser) {
          const oldDriverRecord = await storage.getDriverByUserId(oldAuthUser.id);
          if (!oldDriverRecord || oldDriverRecord.isActive === false) {
            if (oldDriverRecord) {
              await supabaseAdmin!.from('drivers').delete().eq('id', oldAuthUser.id);
            }
            await supabaseAdmin!.auth.admin.deleteUser(oldAuthUser.id);
            console.log(`[Resend Approval] Cleaned up old auth user ${oldAuthUser.id}`);
          }
        }

        const { data: authUserResult, error: createAuthErr } = await supabaseAdmin!.auth.admin.createUser({
          email: application.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { fullName: application.fullName, role: 'driver', phone: application.phone }
        });

        if (createAuthErr || !authUserResult?.user) {
          console.error(`[Resend Approval] Failed to create auth user:`, createAuthErr);
          return res.status(500).json({ error: `Failed to create driver account: ${createAuthErr?.message || 'Unknown error'}` });
        }

        const userId = authUserResult.user.id;
        const driverCode = await generateUniqueDriverCode(supabaseAdmin!);

        const driverData: Record<string, any> = {
          id: userId, user_id: userId, driver_code: driverCode,
          full_name: application.fullName, email: application.email, phone: application.phone,
          postcode: application.postcode || null, address: application.fullAddress || null,
          nationality: application.nationality || null, is_british: application.isBritish ?? true,
          national_insurance_number: application.nationalInsuranceNumber || null,
          right_to_work_share_code: application.rightToWorkShareCode || null,
          vehicle_type: application.vehicleType || 'car',
          vehicle_registration: application.vehicleRegistration || null,
          vehicle_make: application.vehicleMake || null,
          vehicle_model: application.vehicleModel || null,
          vehicle_color: application.vehicleColor || null,
          online_status: 'offline', status: 'approved', is_active: true,
          bank_name: application.bankName || null, account_holder_name: application.accountHolderName || null,
          sort_code: application.sortCode || null, account_number: application.accountNumber || null,
        };

        if (application.profilePictureUrl) driverData.profile_picture_url = normalizeDocumentUrl(application.profilePictureUrl) || application.profilePictureUrl;

        let { error: insertError } = await supabaseAdmin!.from('drivers').upsert(driverData, { onConflict: 'id' });
        if (insertError && insertError.message?.includes('column')) {
          console.warn(`[Resend Approval] Retrying without problematic columns: ${insertError.message}`);
          const vehicleReg = driverData.vehicle_registration;
          delete driverData.vehicle_registration; delete driverData.vehicle_make; delete driverData.vehicle_model; delete driverData.vehicle_color;
          delete driverData.must_change_password; delete driverData.right_to_work_share_code;
          if (vehicleReg && driverData.vehicle_type) driverData.vehicle_type = `${driverData.vehicle_type}|${vehicleReg}`;
          const retry = await supabaseAdmin!.from('drivers').upsert(driverData, { onConflict: 'id' });
          insertError = retry.error;
        }

        if (insertError) {
          console.error(`[Resend Approval] Failed to create driver:`, insertError);
          return res.status(500).json({ error: "Failed to create driver record" });
        }

        driver = { id: userId, driver_code: driverCode, email: application.email };
        console.log(`[Resend Approval] Created driver ${driverCode} for ${application.email}`);

        await setMustChangePassword(userId, true);

        const allDocMappings = [
          { url: application.profilePictureUrl, type: 'profile_picture', col: 'profile_picture_url', label: 'Profile Picture' },
          { url: application.drivingLicenceFrontUrl, type: 'driving_licence', col: 'driving_licence_front_url', label: 'Driving Licence (Front)' },
          { url: application.drivingLicenceBackUrl, type: 'driving_licence_back', col: 'driving_licence_back_url', label: 'Driving Licence (Back)' },
          { url: application.dbsCertificateUrl, type: 'dbs_certificate', col: 'dbs_certificate_url', label: 'DBS Certificate' },
          { url: application.goodsInTransitInsuranceUrl, type: 'goods_in_transit', col: 'goods_in_transit_insurance_url', label: 'Goods in Transit Insurance' },
          { url: application.hireAndRewardUrl, type: 'hire_and_reward', col: 'hire_reward_insurance_url', label: 'Hire & Reward Insurance' },
        ].filter(m => !!m.url);

        Promise.allSettled(allDocMappings.map(async (m) => {
          try {
            const fileResult = await copyApplicationFileToDriver(m.url!, userId, supabaseAdmin!);
            const { data: existingDoc } = await supabaseAdmin!.from('driver_documents')
              .select('id').eq('driver_id', userId).eq('doc_type', m.type).maybeSingle();
            if (existingDoc) {
              await supabaseAdmin!.from('driver_documents').update({
                file_url: fileResult.path, bucket: fileResult.bucket, storage_path: fileResult.path,
                status: 'approved', reviewed_at: new Date().toISOString(),
              }).eq('id', existingDoc.id);
            } else {
              await supabaseAdmin!.from('driver_documents').insert({
                driver_id: userId, auth_user_id: userId, doc_type: m.type,
                file_url: fileResult.path, bucket: fileResult.bucket, storage_path: fileResult.path,
                file_name: m.label, status: 'approved', uploaded_at: new Date().toISOString(),
              });
            }
          } catch (docErr) {
            console.error(`[Resend Approval] Doc ${m.type} error:`, docErr);
          }
        })).then(() => console.log(`[Resend Approval] Document processing complete for ${driverCode}`));
      } catch (createErr) {
        console.error(`[Resend Approval] Error creating driver account:`, createErr);
        return res.status(500).json({ error: "Failed to create driver account" });
      }
    } else {
      const { error: updateError } = await supabaseAdmin!.auth.admin.updateUserById(driver.id, {
        password: tempPassword
      });
      if (updateError) {
        console.error('[Resend Approval] Failed to update password:', updateError);
        return res.status(500).json({ error: "Failed to reset password" });
      }
      try {
        await setMustChangePassword(driver.id, true);
      } catch {}
    }

    const { sendDriverApprovalEmail } = await import('./emailService');
    const sent = await sendDriverApprovalEmail(application.email, application.fullName, driver.driver_code, tempPassword);

    if (sent) {
      console.log(`[Resend Approval] Approval email sent to ${application.email} (driver: ${driver.driver_code})`);
      res.json({ success: true, message: "Approval email sent successfully", driverCode: driver.driver_code });
    } else {
      console.error(`[Resend Approval] Failed to send email to ${application.email}`);
      res.status(500).json({ error: "Failed to send email" });
    }
  }));

  app.get("/api/driver/must-change-password", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin!.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const mustChange = await getMustChangePassword(user.id);
    res.json({ mustChangePassword: mustChange });
  }));

  app.post("/api/admin/driver/reset-password", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.substring(7);
    let userEmail = '';
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email || '';
    } catch {}
    const { data: adminCheck } = await supabaseAdmin!.from('admins').select('email').eq('email', userEmail).maybeSingle();
    if (!adminCheck) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { driverId } = req.body;
    if (!driverId) {
      return res.status(400).json({ error: "Driver ID required" });
    }

    const { data: driver } = await supabaseAdmin!.from('drivers').select('id, email, full_name, driver_code').eq('id', driverId).maybeSingle();
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const tempPassword = generateReadableTempPassword();
    const response = await fetch(process.env.SUPABASE_URL + '/auth/v1/admin/users/' + driverId, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: tempPassword })
    });

    if (!response.ok) {
      console.error(`[Admin] Failed to reset password for driver ${driver.driver_code}`);
      return res.status(500).json({ error: "Failed to reset password" });
    }

    await setMustChangePassword(driverId, true);

    console.log(`[Admin] Password reset for driver ${driver.driver_code} (${driver.email}) by admin ${userEmail}`);
    res.json({ 
      success: true, 
      tempPassword,
      driverCode: driver.driver_code,
      driverEmail: driver.email,
      driverName: driver.full_name
    });
  }));

  app.post("/api/driver/change-password", asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.substring(7);
    const { data: { user }, error: authErr } = await supabaseAdmin!.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { data: driver } = await supabaseAdmin!
      .from('drivers')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!driver) {
      return res.status(403).json({ error: "Only drivers can use this endpoint" });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const { error: updateErr } = await supabaseAdmin!.auth.admin.updateUserById(user.id, {
      password: newPassword
    });
    if (updateErr) {
      return res.status(500).json({ error: "Failed to update password" });
    }

    await setMustChangePassword(user.id, false);

    res.json({ success: true, message: "Password changed successfully" });
  }));

  app.patch("/api/driver-applications/:id/send-back", asyncHandler(async (req, res) => {
    const { adminFeedback, reviewedBy } = req.body;
    
    if (!adminFeedback?.trim()) {
      return res.status(400).json({ error: "Feedback message is required" });
    }

    const application = await storage.getDriverApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    if (application.status !== 'pending' && application.status !== 'corrections_needed') {
      return res.status(400).json({ error: "Only pending applications can be sent back for corrections" });
    }

    const updateData: any = {
      status: 'rejected',
      reviewNotes: adminFeedback.trim(),
      rejectionReason: 'CORRECTIONS_NEEDED',
      reviewedAt: new Date(),
    };
    if (reviewedBy && reviewedBy !== 'admin') {
      updateData.reviewedBy = reviewedBy;
    }

    const updated = await storage.updateDriverApplication(req.params.id, updateData);

    if (!updated) {
      return res.status(500).json({ error: "Failed to update application" });
    }

    try {
      const { sendApplicationCorrectionEmail } = await import('./emailService');
      await sendApplicationCorrectionEmail(application.email, application.fullName, adminFeedback.trim());
    } catch (err) {
      console.error('[Driver Application] Failed to send correction email:', err);
    }

    res.json(updated);
  }));

  app.post("/api/driver-applications/:id/email", requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { message } = req.body;
    
    if (!message?.trim()) {
      return res.status(400).json({ error: "Email message is required" });
    }

    const application = await storage.getDriverApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    try {
      const { sendDocumentRequestEmail } = await import('./emailService');
      const sent = await sendDocumentRequestEmail(application.email, application.fullName, message.trim());
      if (sent) {
        res.json({ success: true, message: "Email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send email" });
      }
    } catch (err) {
      console.error('[Driver Application] Failed to send document request email:', err);
      res.status(500).json({ error: "Failed to send email" });
    }
  }));

  app.delete("/api/driver-applications/:id", asyncHandler(async (req, res) => {
    const application = await storage.getDriverApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    if (application.status !== 'rejected' && application.status !== 'corrections_needed') {
      return res.status(400).json({ error: "Only rejected or corrections needed applications can be deleted" });
    }

    const deleted = await storage.deleteDriverApplication(req.params.id);
    if (!deleted) {
      return res.status(500).json({ error: "Failed to delete application" });
    }

    console.log(`[Driver Application] Deleted rejected application for ${application.email}`);
    res.json({ success: true, message: "Application deleted successfully" });
  }));

  // Invoice routes for Pay Later customers
  // Using invoice_payment_tokens as source of truth since invoices table has schema issues
  app.get("/api/invoices", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.json([]);
    }
    
    const { status, customerId } = req.query;
    console.log('[Invoices] Fetching invoices with customerId:', customerId, 'status:', status);
    
    let query = supabaseAdmin
      .from('invoice_payment_tokens')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    // Filter by customer email if customerId is provided
    // First get the customer's email from auth
    if (customerId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { verifyAccessToken } = await import("./supabaseAdmin");
        const user = await verifyAccessToken(token);
        console.log('[Invoices] Filtering by customer email:', user?.email);
        if (user?.email) {
          query = query.eq('customer_email', user.email);
        }
      }
    }
    
    const { data, error } = await query;
    console.log('[Invoices] Found', data?.length || 0, 'invoices from tokens table');
    
    // Transform invoice_payment_tokens to invoice format (snake_case for frontend)
    const invoicesFromTokens = (data || []).map((token: any) => ({
      id: token.token,
      invoice_number: token.invoice_number || `INV-${token.token?.substring(0, 8)?.toUpperCase()}`,
      customer_id: null,
      customer_name: token.customer_name,
      customer_email: token.customer_email,
      company_name: token.company_name || null,
      business_address: token.business_address || null,
      vat_number: token.vat_number || null,
      subtotal: String(token.subtotal || token.amount || 0),
      vat: String(token.vat || 0),
      total: String(token.amount || 0),
      status: token.status || 'pending',
      due_date: token.due_date || token.created_at,
      period_start: token.period_start || token.created_at,
      period_end: token.period_end || token.created_at,
      job_ids: token.job_ids || null,
      notes: token.notes,
      payment_token: token.token,
      job_details: token.job_details || null,
      created_at: token.created_at,
    }));
    
    // Virtual job invoices are only generated for the customer view (when customerId is supplied).
    // For the admin/general view (no customerId) we return only real stored invoices to avoid
    // duplicating every card-paid job as an extra "virtual" invoice entry.
    let jobInvoices: any[] = [];
    if (customerId) {
      const authHeader = req.headers.authorization;
      let customerEmail: string | null = null;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { verifyAccessToken } = await import("./supabaseAdmin");
        const user = await verifyAccessToken(token);
        customerEmail = user?.email || null;
      }

      // Get customer profile for business details
      let customerProfile: any = null;
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('full_name, company_name, business_address, vat_number, user_type')
        .eq('id', customerId)
        .single();
      customerProfile = profile;

      // Get jobs for this specific customer only
      let jobsQuery = supabaseAdmin
        .from('jobs')
        .select('id, tracking_number, customer_email, total_price, payment_intent_id, created_at, pickup_contact_name, status, customer_id')
        .order('created_at', { ascending: false });

      if (customerEmail) {
        jobsQuery = jobsQuery.eq('customer_email', customerEmail);
      } else {
        jobsQuery = jobsQuery.eq('customer_id', customerId);
      }

      const { data: jobs } = await jobsQuery;
      console.log('[Invoices] Found', jobs?.length || 0, 'jobs for customer', customerId);

      // Build set of job IDs already covered by a real invoice token
      const existingJobIds = new Set(
        invoicesFromTokens
          .filter((inv: any) => inv.job_ids)
          .flatMap((inv: any) => inv.job_ids.map(String))
      );

      jobInvoices = (jobs || [])
        .filter((job: any) => !existingJobIds.has(String(job.id)))
        .map((job: any) => {
          const isPaid = !!job.payment_intent_id;
          const isBusiness = customerProfile?.user_type === 'business';
          return {
            id: `job-${job.id}`,
            invoice_number: `INV-${job.tracking_number || job.id}`,
            customer_id: job.customer_id || null,
            customer_name: isBusiness ? (customerProfile?.company_name || job.pickup_contact_name || 'Customer') : (job.pickup_contact_name || customerProfile?.full_name || 'Customer'),
            customer_email: job.customer_email || '',
            company_name: isBusiness ? customerProfile?.company_name : null,
            business_address: isBusiness ? customerProfile?.business_address : null,
            vat_number: isBusiness ? customerProfile?.vat_number : null,
            subtotal: String(job.total_price || 0),
            vat: '0',
            total: String(job.total_price || 0),
            status: isPaid ? 'paid' : 'pending',
            due_date: job.created_at,
            period_start: job.created_at,
            period_end: job.created_at,
            job_ids: [String(job.id)],
            notes: isPaid ? 'Card payment' : 'Pay Later',
            payment_token: null,
            job_details: null,
            created_at: job.created_at,
          };
        });
    }

    // Combine, deduplicate by id, and sort by date
    const seen = new Set<string>();
    const allInvoices = [...invoicesFromTokens, ...jobInvoices]
      .filter((inv: any) => {
        const key = String(inv.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Re-fetch multi-drop stops from database for all invoices with multi-drop jobs
    // This ensures stops added after invoice creation are always shown
    try {
      const multiDropJobIds: string[] = [];
      for (const inv of allInvoices) {
        if (inv.job_details) {
          const details = typeof inv.job_details === 'string' ? JSON.parse(inv.job_details) : inv.job_details;
          if (Array.isArray(details)) {
            for (const job of details) {
              if (job.isMultiDrop && job.jobNumber) {
                multiDropJobIds.push(job.jobNumber);
              }
            }
          }
        }
      }
      
      if (multiDropJobIds.length > 0) {
        // Look up the actual job IDs from job numbers via the jobs table
        const { data: jobLookup } = await supabaseAdmin
          .from('jobs')
          .select('id, tracking_number')
          .in('id', allInvoices.flatMap((inv: any) => inv.job_ids || []).filter(Boolean));
        
        const allJobIds = (jobLookup || []).map((j: any) => j.id);
        
        if (allJobIds.length > 0) {
          const { data: allStops } = await supabaseAdmin
            .from('multi_drop_stops')
            .select('job_id, stop_order, postcode, address, recipient_name, recipient_phone, instructions')
            .in('job_id', allJobIds)
            .order('stop_order', { ascending: true });
          
          if (allStops && allStops.length > 0) {
            const stopsMap: Record<string, any[]> = {};
            for (const stop of allStops) {
              if (!stopsMap[stop.job_id]) stopsMap[stop.job_id] = [];
              stopsMap[stop.job_id].push({
                stopOrder: stop.stop_order,
                postcode: stop.postcode,
                address: stop.address,
                recipientName: stop.recipient_name,
                recipientPhone: stop.recipient_phone,
                instructions: stop.instructions,
              });
            }
            
            // Update job_details in each invoice with fresh stops
            for (const inv of allInvoices) {
              if (inv.job_details) {
                let details = typeof inv.job_details === 'string' ? JSON.parse(inv.job_details) : inv.job_details;
                if (Array.isArray(details)) {
                  let updated = false;
                  // Match jobs in details to stops by job_ids from the invoice
                  const invJobIds = inv.job_ids || [];
                  for (let i = 0; i < details.length; i++) {
                    const job = details[i];
                    // Try to find matching job_id for this job detail entry
                    const matchingJobId = invJobIds[i] || invJobIds.find((jid: string) => stopsMap[jid]);
                    if (job.isMultiDrop && matchingJobId && stopsMap[matchingJobId]) {
                      let stops = [...stopsMap[matchingJobId]];
                      // Include delivery address as final stop if not already in stops
                      if (job.deliveryAddress) {
                        const normalizedAddr = job.deliveryAddress.trim().toLowerCase();
                        const alreadyIncluded = stops.some((s: any) => 
                          (s.address && s.address.trim().toLowerCase() === normalizedAddr)
                        );
                        if (!alreadyIncluded) {
                          stops.push({
                            stopOrder: stops.length + 1,
                            postcode: '',
                            address: job.deliveryAddress,
                            recipientName: job.recipientName || '',
                            recipientPhone: '',
                            instructions: '',
                          });
                        }
                      }
                      job.multiDropStops = stops;
                      updated = true;
                    }
                  }
                  if (updated) {
                    inv.job_details = JSON.stringify(details);
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[Invoices] Error enriching stops:', e);
    }

    // Fill in job_details for invoices that have job_ids but no job_details stored
    // (happens for card-payment invoices created at booking time)
    try {
      const needsEnrichment = allInvoices.filter((inv: any) => {
        if (!inv.job_ids || inv.job_ids.length === 0) return false;
        if (!inv.job_details) return true;
        // Also enrich if job_details is stored as an empty array (e.g. "[]")
        try {
          const parsed = typeof inv.job_details === 'string' ? JSON.parse(inv.job_details) : inv.job_details;
          if (!Array.isArray(parsed) || parsed.length === 0) return true;
          // Re-enrich if any job entry is missing the version flag (_v: 2)
          // This upgrades old enrichments that stored total_price (incl. waiting) as the price
          return parsed.some((job: any) => !job._v || job._v < 2);
        } catch { return true; }
      });
      if (needsEnrichment.length > 0) {
        // id column is character varying in DB — keep as strings for Supabase queries
        // Exclude waiting_time_minutes from select (not in PostgREST schema cache)
        const allMissingIds = [...new Set(needsEnrichment.flatMap((inv: any) => inv.job_ids).map((id: any) => String(id)).filter(Boolean))];
        console.log(`[Invoices] Enriching ${needsEnrichment.length} invoices, job IDs:`, allMissingIds);
        const { data: missingJobs, error: missingJobsError } = await supabaseAdmin
          .from('jobs')
          .select('id, tracking_number, job_number, pickup_address, delivery_address, recipient_name, scheduled_pickup_time, vehicle_type, total_price, is_multi_drop, waiting_time_charge')
          .in('id', allMissingIds);
        console.log(`[Invoices] Job fetch result: ${missingJobs?.length ?? 0} jobs, error:`, missingJobsError?.message ?? 'none');

        const multiDropIds = (missingJobs || []).filter((j: any) => j.is_multi_drop).map((j: any) => j.id);
        let freshStopsMap: Record<string, any[]> = {};
        if (multiDropIds.length > 0) {
          const { data: freshStops } = await supabaseAdmin
            .from('multi_drop_stops')
            .select('job_id, stop_order, postcode, address, recipient_name, recipient_phone, instructions')
            .in('job_id', multiDropIds)
            .order('stop_order', { ascending: true });
          for (const stop of freshStops || []) {
            if (!freshStopsMap[stop.job_id]) freshStopsMap[stop.job_id] = [];
            freshStopsMap[stop.job_id].push({
              stopOrder: stop.stop_order,
              postcode: stop.postcode,
              address: stop.address,
              recipientName: stop.recipient_name,
              recipientPhone: stop.recipient_phone,
              instructions: stop.instructions,
            });
          }
        }

        const jobMap: Record<string, any> = {};
        for (const j of missingJobs || []) {
          let stops = freshStopsMap[j.id] || [];
          if (j.is_multi_drop && j.delivery_address) {
            const normalized = j.delivery_address.trim().toLowerCase();
            if (!stops.some((s: any) => s.address && s.address.trim().toLowerCase() === normalized)) {
              stops = [...stops, {
                stopOrder: stops.length + 1,
                postcode: '',
                address: j.delivery_address,
                recipientName: j.recipient_name || '',
                recipientPhone: '',
                instructions: '',
              }];
            }
          }
          const enrichedJob = ensureJobNumber({ id: j.id, jobNumber: (j as any).job_number || null });
          const entry = {
            jobNumber: enrichedJob.jobNumber,
            trackingNumber: j.tracking_number || 'N/A',
            pickupAddress: j.pickup_address || 'N/A',
            deliveryAddress: j.delivery_address || 'N/A',
            recipientName: j.recipient_name || '',
            scheduledDate: j.scheduled_pickup_time
              ? new Date(j.scheduled_pickup_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              : 'N/A',
            vehicleType: j.vehicle_type || 'car',
            price: Math.max(0, (parseFloat(j.total_price) || 0) - (parseFloat((j as any).waiting_time_charge) || 0)),
            isMultiDrop: j.is_multi_drop || false,
            multiDropStops: stops,
            waitingTimeMinutes: 0,
            waitingTimeCharge: parseFloat((j as any).waiting_time_charge) || 0,
            _v: 2,
          };
          // Store under both integer and string key for robust lookup
          jobMap[String(j.id)] = entry;
          jobMap[parseInt(String(j.id))] = entry;
        }

        for (const inv of needsEnrichment) {
          // jobMap keys are integers; job_ids may be stored as strings — normalise both
          const details = (inv.job_ids as any[]).map((jid: any) => jobMap[String(jid)] || jobMap[parseInt(jid)]).filter(Boolean);
          if (details.length > 0) {
            inv.job_details = JSON.stringify(details);
            if (inv.invoice_number === 'INV-202603-VA3E') {
              console.log(`[Invoices] VA3E enriched with ${details.length} jobs:`, JSON.stringify(details[0]).substring(0, 150));
            }
          } else {
            if (inv.invoice_number === 'INV-202603-VA3E') {
              console.log(`[Invoices] VA3E NOT enriched — job_ids: ${JSON.stringify(inv.job_ids)}, jobMap keys sample:`, Object.keys(jobMap).slice(0,5));
            }
          }
        }
        console.log(`[Invoices] Enriched ${needsEnrichment.length} invoices with live job details`);
      }
    } catch (e) {
      console.error('[Invoices] Error enriching missing job_details:', e);
    }

    console.log('[Invoices] Total invoices:', allInvoices.length);
    res.json(allInvoices);
  }));

  app.get("/api/invoices/:id", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    // Try to find by token (id is actually the token)
    const { data, error } = await supabaseAdmin
      .from('invoice_payment_tokens')
      .select('*')
      .eq('token', req.params.id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const invoice = {
      id: data.token,
      invoiceNumber: data.invoice_number || `INV-${data.token?.substring(0, 8)?.toUpperCase()}`,
      customerId: null,
      customerName: data.customer_name,
      customerEmail: data.customer_email,
      companyName: data.company_name || null,
      businessAddress: data.business_address || null,
      vatNumber: data.vat_number || null,
      subtotal: String(data.subtotal || data.amount || 0),
      vat: String(data.vat || 0),
      total: String(data.amount || 0),
      status: data.status || 'pending',
      dueDate: data.due_date || data.created_at,
      periodStart: data.period_start || data.created_at,
      periodEnd: data.period_end || data.created_at,
      jobIds: data.job_ids || null,
      notes: data.notes,
      paymentToken: data.token,
      jobDetails: data.job_details || null,
      createdAt: data.created_at,
    };
    
    res.json(invoice);
  }));

  app.get("/api/invoices/:id/details", asyncHandler(async (req, res) => {
    const result = await storage.getInvoiceWithJobs(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(result);
  }));

  // Update invoice status (Mark as Paid)
  app.patch("/api/invoices/:id/status", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Database not available" });
    }
    
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }
    
    const { data, error } = await supabaseAdmin
      .from('invoice_payment_tokens')
      .update({ status })
      .eq('token', req.params.id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('[Invoices] Error updating status:', error);
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const invoice = {
      id: data.token,
      invoice_number: data.invoice_number,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      total: String(data.amount),
      status: data.status,
      due_date: data.due_date,
    };
    
    res.json(invoice);
  }));

  app.patch("/api/invoices/:id", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    // Build update object with all editable fields (except invoice_number which is never changed)
    const updateData: any = {};
    if (req.body.status !== undefined) updateData.status = req.body.status;
    if (req.body.customer_name !== undefined) updateData.customer_name = req.body.customer_name;
    if (req.body.customer_email !== undefined) updateData.customer_email = req.body.customer_email;
    if (req.body.company_name !== undefined) updateData.company_name = req.body.company_name;
    if (req.body.business_address !== undefined) updateData.business_address = req.body.business_address;
    if (req.body.vat_number !== undefined) updateData.vat_number = req.body.vat_number;
    if (req.body.subtotal !== undefined) updateData.subtotal = parseFloat(req.body.subtotal);
    if (req.body.vat !== undefined) updateData.vat = parseFloat(req.body.vat);
    if (req.body.amount !== undefined) updateData.amount = parseFloat(req.body.amount);
    if (req.body.due_date !== undefined) updateData.due_date = req.body.due_date;
    if (req.body.period_start !== undefined) updateData.period_start = req.body.period_start;
    if (req.body.period_end !== undefined) updateData.period_end = req.body.period_end;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    if (req.body.job_details !== undefined) updateData.job_details = req.body.job_details;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    
    const { data, error } = await supabaseAdmin
      .from('invoice_payment_tokens')
      .update(updateData)
      .eq('token', req.params.id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('[Invoices] Error updating invoice:', error);
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const invoice = {
      id: data.token,
      invoice_number: data.invoice_number,
      customer_id: null,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      company_name: data.company_name || null,
      business_address: data.business_address || null,
      subtotal: String(data.subtotal || data.amount),
      vat: String(data.vat || 0),
      total: String(data.amount),
      status: data.status,
      due_date: data.due_date,
      period_start: data.period_start,
      period_end: data.period_end,
      job_ids: data.job_ids || null,
      notes: data.notes,
      payment_token: data.token,
      job_details: data.job_details || null,
      created_at: data.created_at,
    };
    
    res.json(invoice);
  }));

  // Helper functions for invoice payment tokens (using Supabase for persistence)
  const { supabaseAdmin } = await import('./supabaseAdmin');
  
  interface InvoicePaymentToken {
    token: string;
    invoice_number: string;
    customer_name: string;
    customer_email: string;
    amount: number;
    due_date: string;
    period_start: string;
    period_end: string;
    notes: string | null;
    payment_intent_id: string | null;
    client_secret: string | null;
    status: 'pending' | 'paid' | 'expired';
    created_at: string;
  }
  
  async function getInvoicePaymentToken(token: string): Promise<InvoicePaymentToken | null> {
    if (!supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin
      .from('invoice_payment_tokens')
      .select('*')
      .eq('token', token)
      .single();
    if (error || !data) return null;
    return data as InvoicePaymentToken;
  }
  
  async function createInvoicePaymentToken(tokenData: {
    token: string;
    invoiceNumber: string;
    customerName: string;
    customerEmail: string;
    amount: number;
    dueDate: string;
    periodStart: string;
    periodEnd: string;
    notes: string | null;
    companyName?: string | null;
    businessAddress?: string | null;
    vatNumber?: string | null;
    subtotal?: number;
    vat?: number;
    jobDetails?: any[];
    jobIds?: string[];
  }): Promise<boolean> {
    if (!supabaseAdmin) return false;
    const { error } = await supabaseAdmin
      .from('invoice_payment_tokens')
      .insert({
        token: tokenData.token,
        invoice_number: tokenData.invoiceNumber,
        customer_name: tokenData.customerName,
        customer_email: tokenData.customerEmail,
        amount: tokenData.amount,
        due_date: tokenData.dueDate,
        period_start: tokenData.periodStart,
        period_end: tokenData.periodEnd,
        notes: tokenData.notes,
        status: 'pending',
        company_name: tokenData.companyName || null,
        business_address: tokenData.businessAddress || null,
        vat_number: tokenData.vatNumber || null,
        subtotal: tokenData.subtotal || tokenData.amount,
        vat: tokenData.vat || 0,
        job_details: tokenData.jobDetails ? JSON.stringify(tokenData.jobDetails) : null,
        job_ids: tokenData.jobIds || null,
      });
    if (error) {
      console.error('[Invoice] Error creating payment token:', error);
    }
    return !error;
  }
  
  async function updateInvoicePaymentToken(token: string, updates: Partial<{
    payment_intent_id: string;
    client_secret: string;
    status: 'pending' | 'paid' | 'expired';
  }>): Promise<boolean> {
    if (!supabaseAdmin) return false;
    const { error } = await supabaseAdmin
      .from('invoice_payment_tokens')
      .update(updates)
      .eq('token', token);
    return !error;
  }

  // Create and send invoice via email with job details and save to database
  app.post("/api/invoices", asyncHandler(async (req, res) => {
    const { sendInvoiceToCustomerWithPaymentLink } = await import("./emailService");
    const { z } = await import("zod");
    const crypto = await import("crypto");
    const uuidv4 = () => crypto.randomUUID();
    
    const createInvoiceSchema = z.object({
      customerId: z.string().min(1, "Customer ID is required"),
      customerName: z.string().min(1, "Customer name is required"),
      customerEmail: z.string().email("Valid email required"),
      companyName: z.string().nullable().optional(),
      businessAddress: z.string().nullable().optional(),
      vatNumber: z.string().nullable().optional(),
      subtotal: z.number().min(0, "Subtotal must be non-negative"),
      vat: z.number().min(0).optional().default(0),
      total: z.number().min(0, "Total must be non-negative"),
      dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid due date"),
      periodStart: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid period start date"),
      periodEnd: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid period end date"),
      jobIds: z.array(z.string()).optional().default([]),
      notes: z.string().nullable().optional(),
    });
    
    const parseResult = createInvoiceSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.flatten() });
    }
    
    const data = parseResult.data;
    
    // Generate invoice number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const invoiceNumber = `INV-${year}${month}-${randomSuffix}`;
    
    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    };
    
    const formatShortDate = (date: Date | string | null) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      });
    };
    
    // Fetch job details if job IDs provided (including multi-drop stops)
    let jobDetails: any[] = [];
    if (data.jobIds && data.jobIds.length > 0 && supabaseAdmin) {
      // Handle both numeric and UUID job IDs
      // Note: id column is character varying in DB — keep IDs as strings for Supabase queries
      const stringJobIds = data.jobIds.map(String);
      const { data: jobs, error } = await supabaseAdmin
        .from('jobs')
        .select('id, tracking_number, job_number, pickup_address, delivery_address, recipient_name, scheduled_pickup_time, vehicle_type, total_price, is_multi_drop, waiting_time_charge, waiting_time_minutes')
        .in('id', stringJobIds);

      if (!error && jobs) {
        // Fetch multi-drop stops for all jobs that are multi-drop
        const multiDropJobIds = jobs.filter(j => j.is_multi_drop).map(j => j.id);
        let multiDropStopsMap: Record<string, any[]> = {};
        
        if (multiDropJobIds.length > 0) {
          const { data: stops, error: stopsError } = await supabaseAdmin
            .from('multi_drop_stops')
            .select('job_id, stop_order, postcode, address, recipient_name, recipient_phone, instructions')
            .in('job_id', multiDropJobIds)
            .order('stop_order', { ascending: true });
          
          if (!stopsError && stops) {
            // Group stops by job_id
            for (const stop of stops) {
              if (!multiDropStopsMap[stop.job_id]) {
                multiDropStopsMap[stop.job_id] = [];
              }
              multiDropStopsMap[stop.job_id].push({
                stopOrder: stop.stop_order,
                postcode: stop.postcode,
                address: stop.address,
                recipientName: stop.recipient_name,
                recipientPhone: stop.recipient_phone,
                instructions: stop.instructions,
              });
            }
          }
        }
        
        jobDetails = jobs.map(job => {
          const enriched = ensureJobNumber({ id: job.id, jobNumber: (job as any).job_number || null });
          let stops = multiDropStopsMap[job.id] || [];
          // Include the job's main delivery address as the final stop if not already in stops list
          if (job.is_multi_drop && job.delivery_address) {
            const normalizedAddr = job.delivery_address.trim().toLowerCase();
            const alreadyIncluded = stops.some((s: any) => 
              (s.address && s.address.trim().toLowerCase() === normalizedAddr)
            );
            if (!alreadyIncluded) {
              stops = [...stops, {
                stopOrder: stops.length + 1,
                postcode: (job as any).delivery_postcode || '',
                address: job.delivery_address,
                recipientName: job.recipient_name || '',
                recipientPhone: '',
                instructions: '',
              }];
            }
          }
          return {
            jobNumber: enriched.jobNumber,
            trackingNumber: job.tracking_number || 'N/A',
            pickupAddress: job.pickup_address || 'N/A',
            deliveryAddress: job.delivery_address,
            recipientName: job.recipient_name,
            scheduledDate: formatShortDate(job.scheduled_pickup_time),
            vehicleType: job.vehicle_type || 'car',
            price: parseFloat(job.total_price) || 0,
            isMultiDrop: job.is_multi_drop || false,
            multiDropStops: stops,
            waitingTimeMinutes: Number((job as any).waiting_time_minutes) || 0,
            waitingTimeCharge: parseFloat((job as any).waiting_time_charge) || 0,
            _v: 2,
          };
        });
      }
    }
    
    // Build notes
    let fullNotes = data.notes || '';
    
    // Create payment token for Stripe payment link
    const paymentToken = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const tokenCreated = await createInvoicePaymentToken({
      token: paymentToken,
      invoiceNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      amount: data.total,
      dueDate: formatDate(data.dueDate),
      periodStart: formatDate(data.periodStart),
      periodEnd: formatDate(data.periodEnd),
      notes: fullNotes.trim() || null,
      companyName: data.companyName,
      businessAddress: data.businessAddress,
      vatNumber: data.vatNumber,
      subtotal: data.subtotal,
      vat: data.vat,
      jobDetails: jobDetails,
      jobIds: data.jobIds,
    });
    
    if (!tokenCreated) {
      console.error('[Invoice] CRITICAL: Failed to create payment token in database. This likely means the invoice_payment_tokens table does not exist in Supabase. Please run the migration from supabase/migrations/011_invoice_payment_tokens.sql in your Supabase SQL Editor.');
      return res.status(500).json({ 
        error: "Failed to create invoice payment link. The invoice_payment_tokens table may not exist in Supabase. Please contact administrator to run the database migration." 
      });
    }
    
    // Generate payment URL - always use production domain, fall back to request host in dev
    const baseUrl = process.env.APP_URL || 'https://runcourier.co.uk';
    const paymentUrl = `${baseUrl}/invoice-pay/${paymentToken}`;
    
    // Save invoice to Supabase for future reference
    const invoiceId = uuidv4();
    // System UUID for manual/admin invoices (constant placeholder that satisfies NOT NULL constraint)
    const SYSTEM_CUSTOMER_ID = '00000000-0000-0000-0000-000000000000';
    
    console.log(`[Invoice] Attempting to save invoice ${invoiceNumber} to database. supabaseAdmin available: ${!!supabaseAdmin}`);
    
    // Note: Invoice data is stored in invoice_payment_tokens table (which works)
    // The invoices table has schema issues - skipping direct insert to avoid errors
    console.log(`[Invoice] Invoice ${invoiceNumber} data stored in payment token table`);
    
    // Send invoice directly via email with payment link and job details
    const success = await sendInvoiceToCustomerWithPaymentLink(
      data.customerEmail,
      data.customerName,
      invoiceNumber,
      data.total,
      formatDate(data.dueDate),
      formatDate(data.periodStart),
      formatDate(data.periodEnd),
      fullNotes.trim() || null,
      paymentUrl,
      data.companyName,
      data.businessAddress,
      jobDetails
    );
    
    if (success) {
      res.status(201).json({ 
        success: true,
        id: invoiceId,
        invoiceNumber,
        message: `Invoice ${invoiceNumber} sent to ${data.customerEmail}`,
        customerEmail: data.customerEmail,
        total: data.total,
        paymentUrl,
        jobCount: jobDetails.length,
      });
    } else {
      res.status(500).json({ error: "Failed to send invoice email" });
    }
  }));

  // Send invoice to customer email
  app.post("/api/invoices/:id/send", asyncHandler(async (req, res) => {
    if (!enforceAdminOrSupervisorAccess(req, res)) return;
    
    const { sendInvoiceToCustomer } = await import("./emailService");
    
    const invoice = await storage.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const formatDate = (date: Date) => {
      return new Date(date).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    };
    
    const success = await sendInvoiceToCustomer(
      invoice.customerEmail,
      invoice.customerName,
      invoice.invoiceNumber,
      invoice.total,
      formatDate(invoice.dueDate),
      formatDate(invoice.periodStart),
      formatDate(invoice.periodEnd),
      invoice.notes
    );
    
    if (success) {
      res.json({ success: true, message: `Invoice sent to ${invoice.customerEmail}` });
    } else {
      res.status(500).json({ error: "Failed to send invoice email" });
    }
  }));

  // Resend invoice email to customer
  app.post("/api/invoices/:id/resend", asyncHandler(async (req, res) => {
    if (!enforceAdminOrSupervisorAccess(req, res)) return;
    
    const { sendInvoiceToCustomerWithPaymentLink } = await import("./emailService");
    
    // Query invoice_payment_tokens table directly (where invoices are actually stored)
    // The id from frontend is the 'token' column
    const { data: invoice, error: fetchError } = await supabaseAdmin!
      .from('invoice_payment_tokens')
      .select('*')
      .eq('token', req.params.id)
      .single();
    
    if (fetchError || !invoice) {
      console.log(`[Invoice Resend] Invoice not found: ${req.params.id}`, fetchError);
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const formatDate = (date: Date | string) => {
      return new Date(date).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    };
    
    // Build payment URL using the token - use APP_URL for production
    let paymentUrl = '';
    const storedToken = invoice.token;
    if (storedToken) {
      const appUrl = process.env.APP_URL || 'https://runcourier.co.uk';
      paymentUrl = `${appUrl}/invoice-pay/${storedToken}`;
    }
    
    // Parse job details from stored JSON; if missing, build from job_ids live
    let jobDetails: any[] = [];
    if (invoice.job_details) {
      jobDetails = typeof invoice.job_details === 'string'
        ? JSON.parse(invoice.job_details)
        : invoice.job_details;
    } else if (invoice.job_ids && invoice.job_ids.length > 0) {
      const { data: liveJobs } = await supabaseAdmin!
        .from('jobs')
        .select('id, tracking_number, pickup_address, delivery_address, recipient_name, scheduled_pickup_time, vehicle_type, total_price, is_multi_drop, waiting_time_charge')
        .in('id', invoice.job_ids);
      const mdIds = (liveJobs || []).filter((j: any) => j.is_multi_drop).map((j: any) => j.id);
      const stopsMap: Record<string, any[]> = {};
      if (mdIds.length > 0) {
        const { data: liveStops } = await supabaseAdmin!
          .from('multi_drop_stops')
          .select('job_id, stop_order, postcode, address, recipient_name, recipient_phone, instructions')
          .in('job_id', mdIds)
          .order('stop_order', { ascending: true });
        for (const s of liveStops || []) {
          if (!stopsMap[s.job_id]) stopsMap[s.job_id] = [];
          stopsMap[s.job_id].push({ stopOrder: s.stop_order, postcode: s.postcode, address: s.address, recipientName: s.recipient_name, recipientPhone: s.recipient_phone, instructions: s.instructions });
        }
      }
      jobDetails = (liveJobs || []).map((j: any) => {
        let stops = stopsMap[j.id] || [];
        if (j.is_multi_drop && j.delivery_address) {
          const n = j.delivery_address.trim().toLowerCase();
          if (!stops.some((s: any) => s.address && s.address.trim().toLowerCase() === n)) {
            stops = [...stops, { stopOrder: stops.length + 1, postcode: '', address: j.delivery_address, recipientName: j.recipient_name || '', recipientPhone: '', instructions: '' }];
          }
        }
        return {
          jobNumber: j.tracking_number || String(j.id),
          trackingNumber: j.tracking_number || 'N/A',
          pickupAddress: j.pickup_address || 'N/A',
          deliveryAddress: j.delivery_address || 'N/A',
          recipientName: j.recipient_name || '',
          scheduledDate: j.scheduled_pickup_time ? new Date(j.scheduled_pickup_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A',
          vehicleType: j.vehicle_type || 'car',
          price: parseFloat(j.total_price) || 0,
          isMultiDrop: j.is_multi_drop || false,
          multiDropStops: stops,
          waitingTimeCharge: parseFloat((j as any).waiting_time_charge) || 0,
          waitingTimeMinutes: 0,
        };
      });
    }

    // Convert amount to number (invoice_payment_tokens uses 'amount' column)
    const rawAmount = invoice.amount ?? 0;
    const totalAmount = typeof rawAmount === 'string' 
      ? parseFloat(rawAmount) 
      : (rawAmount || 0);
    
    // Allow admin to override the recipient email
    const targetEmail = req.body?.overrideEmail || invoice.customer_email;
    console.log(`[Invoice Resend] Sending invoice ${invoice.invoice_number} to ${targetEmail}`);
    
    const success = await sendInvoiceToCustomerWithPaymentLink(
      targetEmail,
      invoice.customer_name,
      invoice.invoice_number,
      totalAmount,
      formatDate(invoice.due_date),
      formatDate(invoice.period_start),
      formatDate(invoice.period_end),
      invoice.notes,
      paymentUrl,
      invoice.company_name,
      invoice.business_address,
      jobDetails
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Invoice resent to ${targetEmail}`,
        customerEmail: targetEmail 
      });
    } else {
      res.status(500).json({ error: "Failed to resend invoice email" });
    }
  }));

  // Send invoice payment link via SMS
  app.post("/api/invoices/:id/send-sms", asyncHandler(async (req, res) => {
    if (!enforceAdminOrSupervisorAccess(req, res)) return;

    const { data: invoice, error: fetchError } = await supabaseAdmin!
      .from('invoice_payment_tokens')
      .select('*')
      .eq('token', req.params.id)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const appUrl = process.env.APP_URL || 'https://runcourier.co.uk';
    const paymentUrl = `${appUrl}/invoice-pay/${invoice.token}`;
    const totalAmount = typeof invoice.amount === 'string'
      ? parseFloat(invoice.amount)
      : (invoice.amount || 0);

    const message = `Run Courier Invoice ${invoice.invoice_number} - Amount due: £${totalAmount.toFixed(2)}. Pay securely here: ${paymentUrl}`;

    const { sendSMS } = await import("./twilioService");
    const result = await sendSMS(phoneNumber.trim(), message);

    if (result.success) {
      console.log(`[Invoice SMS] Sent invoice ${invoice.invoice_number} to ${phoneNumber.trim()}`);
      res.json({ success: true, messageId: result.messageId });
    } else {
      console.error(`[Invoice SMS] Failed to send to ${phoneNumber.trim()}:`, result.error);
      res.status(500).json({ error: result.error || "Failed to send SMS" });
    }
  }));

  // Bulk send invoices by email
  app.post("/api/invoices/bulk-send", asyncHandler(async (req, res) => {
    console.log('[Bulk Send] Starting bulk send request');
    if (!enforceAdminOrSupervisorAccess(req, res)) return;
    
    const { invoiceIds, overrideEmail } = req.body;
    console.log('[Bulk Send] Invoice IDs:', invoiceIds, 'Override email:', overrideEmail);
    
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: "Invoice IDs array is required" });
    }
    
    // Validate override email if provided
    if (overrideEmail && typeof overrideEmail === 'string' && overrideEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(overrideEmail.trim())) {
        return res.status(400).json({ error: "Invalid override email address" });
      }
    }
    
    const { sendInvoiceToCustomerWithPaymentLink } = await import("./emailService");
    
    const formatDate = (date: Date | string) => {
      return new Date(date).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    };
    
    const results: { invoiceId: string; success: boolean; email?: string; error?: string }[] = [];
    
    // Use override email if provided, otherwise use original customer email
    const targetEmail = overrideEmail?.trim() || null;
    
    // Get Supabase client to fetch from invoice_payment_tokens table
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Database not available" });
    }
    
    for (let i = 0; i < invoiceIds.length; i++) {
      const invoiceId = invoiceIds[i];
      
      // Add delay between emails to avoid rate limiting (Resend allows 2 requests/second)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      
      try {
        // Fetch invoice from invoice_payment_tokens table (where invoices are actually stored)
        // The invoiceId from frontend is actually the 'token' column (see GET /api/invoices mapping)
        const { data: invoice, error: fetchError } = await supabaseAdmin
          .from('invoice_payment_tokens')
          .select('*')
          .eq('token', invoiceId)
          .single();
        
        if (fetchError || !invoice) {
          console.log(`[Bulk Send] Invoice not found: ${invoiceId}`, fetchError);
          results.push({ invoiceId, success: false, error: "Invoice not found" });
          continue;
        }
        
        console.log(`[Bulk Send] Found invoice: ${invoice.invoice_number}`);
        
        // Determine which email to use
        const emailToUse = targetEmail || invoice.customer_email;
        
        // Build payment URL if token exists - use APP_URL for production
        let paymentUrl = '';
        const storedToken = invoice.token;
        if (storedToken) {
          const appUrl = process.env.APP_URL || 'https://runcourier.co.uk';
          paymentUrl = `${appUrl}/invoice-pay/${storedToken}`;
        }
        
        // Parse job details from stored JSON; if missing, build live from job_ids
        let jobDetails: any[] = [];
        if (invoice.job_details) {
          jobDetails = typeof invoice.job_details === 'string' ? JSON.parse(invoice.job_details) : invoice.job_details;
        } else if (invoice.job_ids && invoice.job_ids.length > 0) {
          const { data: liveJobs2 } = await supabaseAdmin
            .from('jobs')
            .select('id, tracking_number, pickup_address, delivery_address, recipient_name, scheduled_pickup_time, vehicle_type, total_price, is_multi_drop, waiting_time_charge')
            .in('id', invoice.job_ids);
          const mdIds2 = (liveJobs2 || []).filter((j: any) => j.is_multi_drop).map((j: any) => j.id);
          const stopsMap2: Record<string, any[]> = {};
          if (mdIds2.length > 0) {
            const { data: liveStops2 } = await supabaseAdmin
              .from('multi_drop_stops')
              .select('job_id, stop_order, postcode, address, recipient_name')
              .in('job_id', mdIds2)
              .order('stop_order', { ascending: true });
            for (const s of liveStops2 || []) {
              if (!stopsMap2[s.job_id]) stopsMap2[s.job_id] = [];
              stopsMap2[s.job_id].push({ stopOrder: s.stop_order, postcode: s.postcode, address: s.address, recipientName: s.recipient_name });
            }
          }
          jobDetails = (liveJobs2 || []).map((j: any) => ({
            jobNumber: j.tracking_number || String(j.id),
            trackingNumber: j.tracking_number || 'N/A',
            pickupAddress: j.pickup_address || 'N/A',
            deliveryAddress: j.delivery_address || 'N/A',
            recipientName: j.recipient_name || '',
            scheduledDate: j.scheduled_pickup_time ? new Date(j.scheduled_pickup_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A',
            vehicleType: j.vehicle_type || 'car',
            price: Math.max(0, (parseFloat(j.total_price) || 0) - (parseFloat((j as any).waiting_time_charge) || 0)),
            isMultiDrop: j.is_multi_drop || false,
            multiDropStops: stopsMap2[j.id] || [],
            waitingTimeCharge: parseFloat((j as any).waiting_time_charge) || 0,
            waitingTimeMinutes: 0,
          }));
        }

        // invoice_payment_tokens uses 'amount' column, not 'total'
        const rawAmount = invoice.amount ?? invoice.total ?? 0;
        const totalAmount = typeof rawAmount === 'string' 
          ? parseFloat(rawAmount) 
          : (rawAmount || 0);
        
        console.log(`[Bulk Send] Sending invoice ${invoice.invoice_number} to ${emailToUse}`);
        
        const success = await sendInvoiceToCustomerWithPaymentLink(
          emailToUse,
          invoice.customer_name,
          invoice.invoice_number,
          totalAmount,
          formatDate(invoice.due_date),
          formatDate(invoice.period_start),
          formatDate(invoice.period_end),
          invoice.notes,
          paymentUrl,
          invoice.company_name,
          invoice.business_address,
          jobDetails
        );
        
        if (success) {
          console.log(`[Bulk Send] Successfully sent invoice ${invoice.invoice_number} to ${emailToUse}`);
          results.push({ invoiceId, success: true, email: emailToUse });
        } else {
          console.log(`[Bulk Send] Failed to send invoice ${invoice.invoice_number}`);
          results.push({ invoiceId, success: false, error: "Failed to send email" });
        }
      } catch (err: any) {
        console.error(`[Bulk Send] Error sending invoice ${invoiceId}:`, err);
        results.push({ invoiceId, success: false, error: err.message || "Unknown error" });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    res.json({
      success: failCount === 0,
      message: `Sent ${successCount} invoice(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
      results
    });
  }));

  // Update invoice status
  app.patch("/api/invoices/:id/status", asyncHandler(async (req, res) => {
    const { status } = req.body;
    
    if (!status || !['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    
    const invoice = await storage.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const updated = await storage.updateInvoice(req.params.id, { status });
    res.json(updated);
  }));

  // Test invoice email endpoint (for testing email delivery without database)
  app.post("/api/test-invoice-email", asyncHandler(async (req, res) => {
    const { email, customerName, invoiceNumber, amount, dueDate, periodStart, periodEnd, notes } = req.body;
    
    if (!email || !customerName) {
      return res.status(400).json({ error: "Email and customer name are required" });
    }
    
    const { sendInvoiceToCustomer } = await import("./emailService");
    const testAmount = parseFloat(amount) || 50.00;
    const success = await sendInvoiceToCustomer(
      email,
      customerName,
      invoiceNumber || `INV-TEST-${Date.now()}`,
      testAmount.toFixed(2),
      dueDate || "25 January 2026",
      periodStart || "1 January 2026",
      periodEnd || "11 January 2026",
      notes || "Test invoice"
    );
    
    if (success) {
      res.json({ success: true, message: `Test invoice sent to ${email}` });
    } else {
      res.status(500).json({ error: "Failed to send test invoice email" });
    }
  }));

  // ============= ROUTE PLANNER =============

  app.post("/api/route-planner/send-email", asyncHandler(async (req, res) => {
    const { to, driverName, routeText, mapsLink, legs, stops, totalDistance, totalDuration } = req.body;

    if (!to) return res.status(400).json({ error: "Recipient email is required" });

    const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const formatDist = (m: number) => `${m.toFixed(1)} mi`;
    const formatTime = (min: number) => {
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60);
      const m2 = min % 60;
      return m2 > 0 ? `${h}h ${m2}min` : `${h}h`;
    };

    const stopsHtml = (stops || []).map((s: any, i: number) => `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${i === 0 ? '#16a34a' : i === (stops.length - 1) ? '#dc2626' : '#2563eb'};color:#fff;font-size:11px;font-weight:700;">${ALPHA[i] || (i + 1)}</span>
        </td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${s.postcode}</td>
      </tr>`).join('');

    const legsHtml = (legs || []).map((leg: any, i: number) => `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; font-size:12px;">${ALPHA[i] || (i + 1)} → ${ALPHA[i + 1] || (i + 2)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; font-size:12px;">${leg.from} → ${leg.to}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">${formatDist(leg.distance)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">${formatTime(leg.duration)}</td>
      </tr>`).join('');

    const routePlanContent = `
    <p style="color:#333;margin:0 0 16px;">Hi ${driverName || 'there'},</p>
    <p style="color:#555;margin:0 0 20px;">Your route plan is ready. Here are the details:</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="width:50%;padding-right:8px;">
          <div style="background:#f0f9ff;border-radius:6px;padding:12px;text-align:center;">
            <div style="font-size:11px;color:#666;margin-bottom:4px;text-transform:uppercase;">Total Distance</div>
            <div style="font-size:20px;font-weight:700;color:#2563eb;">${formatDist(totalDistance || 0)}</div>
          </div>
        </td>
        <td style="width:50%;padding-left:8px;">
          <div style="background:#f0fdf4;border-radius:6px;padding:12px;text-align:center;">
            <div style="font-size:11px;color:#666;margin-bottom:4px;text-transform:uppercase;">Estimated Time</div>
            <div style="font-size:20px;font-weight:700;color:#16a34a;">${formatTime(totalDuration || 0)}</div>
          </div>
        </td>
      </tr>
    </table>

    <h3 style="font-size:14px;font-weight:600;margin:0 0 8px;color:#374151;">Stops</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tbody>${stopsHtml}</tbody>
    </table>

    ${legs && legs.length > 0 ? `
    <h3 style="font-size:14px;font-weight:600;margin:0 0 8px;color:#374151;">Leg Breakdown</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Leg</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Route</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6b7280;">Distance</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6b7280;">Time</th>
        </tr>
      </thead>
      <tbody>${legsHtml}</tbody>
    </table>` : ''}

    ${mapsLink ? `
    <div style="text-align:center;margin-bottom:16px;">
      <a href="${mapsLink}" style="display:inline-block;background:#007BFF;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">
        Open in Google Maps
      </a>
    </div>` : ''}
  `;

    const { sendEmailNotification, wrapEmailContent } = await import("./emailService");
    const html = wrapEmailContent(routePlanContent, 'Route Plan');
    const success = await sendEmailNotification(
      to,
      `Route Plan – ${stops?.length || 0} stops · ${formatDist(totalDistance || 0)}`,
      html,
      `Route Plan\n\n${routeText || ''}`
    );

    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: "Failed to send email" });
    }
  }));

  // ─── Route Planner: Send SMS ───────────────────────────────────
  app.post("/api/route-planner/send-sms", asyncHandler(async (req, res) => {
    const { to, driverName, routeText, mapsLink, stops, totalDistance, totalDuration } = req.body;
    if (!to) return res.status(400).json({ error: "Recipient phone number is required" });

    const formatDist = (m: number) => `${m.toFixed(1)} mi`;
    const formatTime = (min: number) => {
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60);
      const m2 = min % 60;
      return m2 > 0 ? `${h}h ${m2}min` : `${h}h`;
    };

    const stopLines = (stops || []).map((s: any, i: number) => `${i + 1}. ${s.postcode}`).join('\n');
    const summary = totalDistance && totalDuration
      ? `Distance: ${formatDist(totalDistance)} | Time: ${formatTime(totalDuration)}`
      : '';

    // Build a short path-style Google Maps URL — works reliably in SMS
    // e.g. https://www.google.com/maps/dir/SW1A+2AA,UK/EC1A+1BB,UK
    const buildSmsMapUrl = () => {
      if (stops && stops.length >= 2) {
        const parts = (stops as any[]).map((s: any) =>
          (s.postcode + ',UK').replace(/\s+/g, '+')
        );
        return `https://www.google.com/maps/dir/${parts.join('/')}`;
      }
      return mapsLink || '';
    };
    const mapUrl = buildSmsMapUrl();

    const lines: string[] = [
      `Hi ${driverName || 'Driver'}, your route from Run Courier:`,
      '',
    ];
    if (summary) lines.push(summary, '');
    if (stopLines) lines.push(stopLines);
    if (mapUrl) lines.push('', `Open in Maps: ${mapUrl}`);

    const message = lines.join('\n').trim();

    const { sendSMS } = await import("./twilioService");
    const result = await sendSMS(to, message);

    if (result.success) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error || "Failed to send SMS" });
    }
  }));

  // ============= INVOICE PAYMENT WITH EMBEDDED STRIPE =============

  // Public endpoint: Get invoice payment details by token
  app.get("/api/invoice-pay/:token", asyncHandler(async (req, res) => {
    const token = req.params.token;
    const invoiceData = await getInvoicePaymentToken(token);
    
    if (!invoiceData) {
      return res.status(404).json({ error: "Invoice payment link not found or expired" });
    }
    
    if (invoiceData.status === 'paid') {
      return res.status(410).json({ error: "This invoice has already been paid" });
    }
    
    // Check if expired (90 days - 3 months to allow for payment)
    const expiryTime = new Date(invoiceData.created_at);
    expiryTime.setDate(expiryTime.getDate() + 90);
    if (new Date() > expiryTime) {
      await updateInvoicePaymentToken(token, { status: 'expired' });
      return res.status(410).json({ error: "This payment link has expired" });
    }
    
    // If invoice was previously marked expired but is now within the new 90-day window, reset it
    if (invoiceData.status === 'expired') {
      await updateInvoicePaymentToken(token, { status: 'pending' });
    }
    
    res.json({
      invoiceNumber: invoiceData.invoice_number,
      customerName: invoiceData.customer_name,
      amount: invoiceData.amount,
      dueDate: invoiceData.due_date,
      periodStart: invoiceData.period_start,
      periodEnd: invoiceData.period_end,
      notes: invoiceData.notes,
    });
  }));

  // Public endpoint: Create PaymentIntent for invoice
  app.post("/api/invoice-pay/:token/create-payment-intent", asyncHandler(async (req, res) => {
    const token = req.params.token;
    const invoiceData = await getInvoicePaymentToken(token);
    
    if (!invoiceData) {
      return res.status(404).json({ error: "Invoice payment link not found" });
    }
    
    if (invoiceData.status === 'paid') {
      return res.status(410).json({ error: "This invoice has already been paid" });
    }
    
    // Check if expired (90 days)
    const expiryTime = new Date(invoiceData.created_at);
    expiryTime.setDate(expiryTime.getDate() + 90);
    if (new Date() > expiryTime) {
      await updateInvoicePaymentToken(token, { status: 'expired' });
      return res.status(410).json({ error: "This payment link has expired" });
    }
    
    // If invoice was previously marked expired but is now within the new 90-day window, reset it
    if (invoiceData.status === 'expired') {
      await updateInvoicePaymentToken(token, { status: 'pending' });
    }
    
    const stripe = await getUncachableStripeClient();

    // Check if we have a cached PaymentIntent — but verify it's still usable
    if (invoiceData.payment_intent_id && invoiceData.client_secret) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(invoiceData.payment_intent_id);
        // Reuse it only if it's still awaiting payment (requires_payment_method or requires_confirmation)
        const reusableStatuses = ['requires_payment_method', 'requires_confirmation', 'requires_action'];
        if (reusableStatuses.includes(existingPi.status)) {
          return res.json({
            clientSecret: invoiceData.client_secret,
            paymentIntentId: invoiceData.payment_intent_id,
          });
        }
        // Otherwise fall through to create a fresh one (already paid, cancelled, etc.)
        console.log(`[InvoicePay] Existing PI ${invoiceData.payment_intent_id} has status '${existingPi.status}', creating a new one`);
      } catch (piErr: any) {
        console.warn(`[InvoicePay] Could not retrieve cached PI ${invoiceData.payment_intent_id}: ${piErr.message}. Creating a new one.`);
      }
    }
    
    // Create or find Stripe customer
    let stripeCustomerId: string | undefined;
    const existingCustomers = await stripe.customers.list({ 
      email: invoiceData.customer_email, 
      limit: 1 
    });
    
    if (existingCustomers.data.length > 0) {
      stripeCustomerId = existingCustomers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: invoiceData.customer_email,
        name: invoiceData.customer_name,
      });
      stripeCustomerId = customer.id;
    }
    
    // Create PaymentIntent — automatic_payment_methods is required for Stripe Elements
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(invoiceData.amount * 100),
      currency: 'gbp',
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'invoice_payment',
        invoiceNumber: invoiceData.invoice_number,
        customerEmail: invoiceData.customer_email,
        customerName: invoiceData.customer_name,
        paymentToken: token,
      },
      description: `Invoice ${invoiceData.invoice_number} - Run Courier`,
      receipt_email: invoiceData.customer_email,
    });
    
    // Store new PaymentIntent details in database
    await updateInvoicePaymentToken(token, {
      payment_intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret!,
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  }));

  // Public endpoint: Confirm invoice payment
  app.post("/api/invoice-pay/:token/confirm", asyncHandler(async (req, res) => {
    const token = req.params.token;
    const { paymentIntentId } = req.body;
    const invoiceData = await getInvoicePaymentToken(token);
    
    if (!invoiceData) {
      return res.status(404).json({ error: "Invoice payment link not found" });
    }
    
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Payment intent ID required" });
    }
    
    const stripe = await getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ 
        error: "Payment not completed", 
        status: paymentIntent.status 
      });
    }
    
    // Mark as paid in database
    await updateInvoicePaymentToken(token, { status: 'paid' });
    
    // Send payment confirmation email
    try {
      const { sendPaymentReceivedConfirmation } = await import("./emailService");
      await sendPaymentReceivedConfirmation(
        invoiceData.customer_email,
        invoiceData.customer_name,
        invoiceData.invoice_number,
        invoiceData.amount,
        paymentIntentId
      );
    } catch (err) {
      console.error("[InvoicePayment] Failed to send confirmation email:", err);
    }
    
    console.log(`[InvoicePayment] Invoice ${invoiceData.invoice_number} paid via Stripe: ${paymentIntentId}`);
    
    res.json({ 
      success: true, 
      message: "Payment successful",
      invoiceNumber: invoiceData.invoice_number,
    });
  }));

  // Contact form endpoint
  app.post("/api/contact", asyncHandler(async (req, res) => {
    const { name, email, phone, subject, message } = req.body;
    
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Send contact form email
    await sendContactFormSubmission(name, email, phone, subject, message).catch(err => console.error('Failed to send contact form:', err));
    
    res.status(200).json({ success: true, message: "Your message has been sent successfully" });
  }));

  // Send welcome and registration notification emails after signup
  app.post("/api/auth/registration-email", asyncHandler(async (req, res) => {
    const { email, name, role, company } = req.body;
    
    if (!email || !name) {
      return res.status(400).json({ error: "Email and name are required" });
    }

    // Send welcome email to the new user
    await sendWelcomeEmail(email, name, role || 'customer').catch(err => console.error('Failed to send welcome email:', err));
    
    // Send notification to admin about new registration
    await sendNewRegistrationNotification(email, name, role || 'customer', company).catch(err => console.error('Failed to send registration notification:', err));
    
    res.status(200).json({ success: true, message: "Registration emails sent" });
  }));

  // Phone verification endpoints for registration
  app.post("/api/auth/send-verification-code", asyncHandler(async (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Validate UK phone format - accepts formats like:
    // 07956503009, 7956503009, +447956503009, 00447956503009
    const cleanedPhone = phone.replace(/\s+/g, '');
    const ukPhoneRegex = /^(\+44|0044|0)?[7][0-9]{9}$/;
    if (!ukPhoneRegex.test(cleanedPhone)) {
      return res.status(400).json({ error: "Please enter a valid UK mobile number (e.g., 07956503009 or 7956503009)" });
    }

    const { sendVerificationCode } = await import("./twilioService");
    const result = await sendVerificationCode(phone);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error || "Failed to send verification code" });
    }
    
    res.status(200).json({ success: true, message: "Verification code sent to your phone" });
  }));

  app.post("/api/auth/verify-phone", asyncHandler(async (req, res) => {
    const { phone, code } = req.body;
    
    if (!phone || !code) {
      return res.status(400).json({ error: "Phone number and verification code are required" });
    }

    const { verifyCode } = await import("./twilioService");
    const result = await verifyCode(phone, code);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error || "Invalid verification code" });
    }
    
    // Return the verification token for use during registration
    res.status(200).json({ 
      success: true, 
      message: "Phone number verified successfully",
      verificationToken: result.token
    });
  }));

  // Validate phone verification token (for registration)
  app.post("/api/auth/validate-phone-token", asyncHandler(async (req, res) => {
    const { token, phone } = req.body;
    
    if (!token || !phone) {
      return res.status(400).json({ error: "Token and phone are required" });
    }

    const { validateVerificationToken } = await import("./twilioService");
    const result = validateVerificationToken(token);
    
    if (!result.valid) {
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }
    
    // Verify the token matches the phone number being registered
    const normalizedPhone = phone.replace(/\D/g, '');
    if (result.phone !== normalizedPhone) {
      return res.status(400).json({ error: "Verification token does not match the phone number" });
    }
    
    res.status(200).json({ success: true, verified: true });
  }));

  // Server-side registration with phone verification enforcement
  app.post("/api/auth/register", asyncHandler(async (req, res) => {
    const { email, password, fullName, phone, phoneVerificationToken, postcode, address, buildingName, role, userType, companyName, registrationNumber, businessAddress } = req.body;
    
    // Validate required fields
    if (!email || !password || !fullName || !phone || !phoneVerificationToken) {
      return res.status(400).json({ error: "Missing required fields: email, password, fullName, phone, and phoneVerificationToken" });
    }

    // Validate and consume the phone verification token
    const { consumeVerificationToken } = await import("./twilioService");
    const tokenResult = consumeVerificationToken(phoneVerificationToken);
    
    if (!tokenResult.valid) {
      return res.status(400).json({ error: "Invalid or expired phone verification. Please verify your phone number again." });
    }
    
    // Verify the token matches the phone number
    const normalizedPhone = phone.replace(/\D/g, '');
    if (tokenResult.phone !== normalizedPhone) {
      return res.status(400).json({ error: "Phone verification token does not match the phone number" });
    }

    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Authentication service not configured" });
      }

      // Create user via Supabase Admin
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // User will receive confirmation email
        user_metadata: {
          fullName,
          full_name: fullName,
          phone,
          phoneVerified: true,
          postcode,
          address,
          buildingName,
          role: role || 'customer',
          userType: userType || 'individual',
          companyName,
          registrationNumber,
          businessAddress,
        }
      });

      if (authError) {
        console.error('[Registration] Supabase auth error:', authError);
        
        // Check if email already exists - offer to resend verification
        if (authError.code === 'email_exists') {
          console.log('[Registration] Email exists, checking if user is unverified...');
          // Check if the existing user is unverified
          const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
          if (listErr) {
            console.error('[Registration] Failed to list users:', listErr);
          }
          const existingUser = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
          console.log('[Registration] Found user:', existingUser ? { email: existingUser.email, confirmed: !!existingUser.email_confirmed_at } : 'not found');
          
          if (existingUser && !existingUser.email_confirmed_at) {
            // User exists but unverified - resend verification email
            try {
              const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
                type: 'magiclink',
                email: email,
                options: {
                  redirectTo: 'https://www.runcourier.co.uk/login?verified=true'
                }
              });
              
              if (linkData?.properties?.action_link) {
                const userName = existingUser.user_metadata?.fullName || existingUser.user_metadata?.full_name || fullName;
                await sendEmailVerification(email, linkData.properties.action_link, userName);
                console.log(`[Registration] Resent verification email to existing unverified user: ${email}`);
              }
            } catch (resendErr) {
              console.error('[Registration] Failed to resend verification:', resendErr);
            }
            
            return res.status(200).json({ 
              success: true, 
              message: "This email is already registered but not verified. We've sent a new verification email. Please check your inbox.",
              needsVerification: true
            });
          }
          
          return res.status(400).json({ error: "An account with this email already exists. Please log in or reset your password." });
        }
        
        return res.status(400).json({ error: authError.message });
      }

      // Create user record in users table
      if (authData?.user) {
        try {
          await storage.createUserWithId(authData.user.id, {
            email: authData.user.email!,
            fullName,
            phone,
            postcode,
            address,
            buildingName,
            role: role || 'customer',
            userType: userType || 'individual',
            companyName,
            registrationNumber,
            businessAddress,
            isActive: true,
          });
          console.log(`[Registration] User record created in database for ${email}`);
        } catch (dbError: any) {
          console.error('[Registration] Failed to create user record:', dbError?.message || dbError);
          // User is created in Supabase auth, data will sync on first login
        }

        // Generate email verification link and send it using magiclink
        try {
          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
            options: {
              redirectTo: 'https://www.runcourier.co.uk/login?verified=true'
            }
          });
          
          console.log('[Registration] Generate link result:', { 
            hasLink: !!linkData?.properties?.action_link, 
            error: linkError?.message 
          });
          
          if (linkError) {
            console.error('[Registration] Failed to generate verification link:', linkError);
          } else if (linkData?.properties?.action_link) {
            console.log(`[Registration] Sending verification email to ${email}...`);
            const emailSent = await sendEmailVerification(email, linkData.properties.action_link, fullName);
            if (emailSent) {
              console.log(`[Registration] Verification email sent successfully to ${email}`);
            } else {
              console.error('[Registration] Failed to send verification email via Resend');
            }
          } else {
            console.error('[Registration] No action link returned from Supabase');
          }
        } catch (verifyError) {
          console.error('[Registration] Verification email error:', verifyError);
        }

        // Send notification to admin about new registration
        try {
          await sendNewRegistrationNotification(email, fullName, role || 'customer', companyName).catch(err => console.error('Failed to send registration notification:', err));
        } catch (emailError) {
          console.error('[Registration] Notification email error:', emailError);
        }
      }

      console.log(`[Registration] User registered successfully: ${email} (phone verified)`);
      
      res.status(200).json({ 
        success: true, 
        message: "Account created successfully. Please check your email to verify your account.",
        user: authData?.user ? { id: authData.user.id, email: authData.user.email } : null
      });
    } catch (error: any) {
      console.error('[Registration] Error:', error);
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  }));

  async function saveResetCode(userId: string, email: string, code: string, expiresAt: number) {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (!supabaseAdmin) throw new Error("Supabase not configured");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { reset_code: code, reset_email: email.toLowerCase(), reset_expires: expiresAt }
    });
    if (error) {
      console.error('[ResetTokens] Failed to save to Supabase app_metadata:', error);
      throw error;
    }
    console.log(`[ResetTokens] Saved reset code for ${email} in app_metadata`);
  }

  async function getResetCode(email: string): Promise<{ code: string; email: string; userId: string; expiresAt: number } | null> {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (!supabaseAdmin) return null;
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return null;
    const meta = user.app_metadata;
    if (!meta?.reset_code || !meta?.reset_expires) return null;
    if (meta.reset_expires < Date.now()) return null;
    return { code: meta.reset_code, email: email.toLowerCase(), userId: user.id, expiresAt: meta.reset_expires };
  }

  async function clearResetCode(userId: string) {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (!supabaseAdmin) return;
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { reset_code: null, reset_email: null, reset_expires: null }
    });
  }

  async function getResetCodeByToken(token: string): Promise<{ code: string; email: string; userId: string; expiresAt: number } | null> {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (!supabaseAdmin) return null;
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const user = users?.find(u => u.app_metadata?.reset_code === token);
    if (!user) return null;
    const meta = user.app_metadata;
    if (!meta?.reset_code || !meta?.reset_expires) return null;
    if (meta.reset_expires < Date.now()) return null;
    return { code: meta.reset_code, email: user.email || '', userId: user.id, expiresAt: meta.reset_expires };
  }

  app.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Authentication service not configured" });
      }

      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (!user) {
        return res.status(200).json({ success: true, message: "If an account exists with this email, you will receive a reset code." });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 60 * 60 * 1000;

      await saveResetCode(user.id, email, code, expiresAt);

      const emailSent = await sendPasswordResetEmail(email, code);
      
      if (!emailSent) {
        console.error('Failed to send password reset email via Resend');
        return res.status(500).json({ error: "Failed to send password reset email. Please try again later." });
      }

      console.log('Password reset code sent successfully to:', email);

      res.status(200).json({ success: true, message: "If an account exists with this email, you will receive a reset code." });
    } catch (error: any) {
      console.error('Password reset error:', error);
      const msg = error?.message?.toLowerCase?.() || '';
      if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
        return res.status(429).json({ error: "Too many requests. Please wait a few minutes before trying again." });
      }
      res.status(500).json({ error: "An error occurred. Please try again later." });
    }
  }));

  app.post("/api/auth/reset-password", asyncHandler(async (req, res) => {
    const { token, email, code, newPassword } = req.body;

    if (token && newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      try {
        const { supabaseAdmin } = await import("./supabaseAdmin");
        if (!supabaseAdmin) {
          return res.status(500).json({ error: "Authentication service not configured" });
        }

        const resetData = await getResetCodeByToken(token);

        if (!resetData) {
          return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
        }

        if (resetData.expiresAt < Date.now()) {
          await clearResetCode(resetData.userId);
          return res.status(400).json({ error: "Reset link has expired. Please request a new one." });
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(resetData.userId, {
          password: newPassword
        });

        if (error) {
          console.error('Password update error:', error);
          return res.status(500).json({ error: "Failed to update password. Please try again." });
        }

        await clearResetCode(resetData.userId);
        console.log(`Password reset successfully for: ${resetData.email}`);

        return res.json({ success: true, message: "Password has been reset successfully." });
      } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ error: "An error occurred. Please try again later." });
      }
    }

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, code, and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Authentication service not configured" });
      }

      const resetData = await getResetCode(email);

      if (!resetData) {
        return res.status(400).json({ error: "Invalid or expired reset code. Please request a new one." });
      }

      if (resetData.expiresAt < Date.now()) {
        await clearResetCode(resetData.userId);
        return res.status(400).json({ error: "Reset code has expired. Please request a new one." });
      }

      if (resetData.code !== code) {
        return res.status(400).json({ error: "Invalid reset code. Please check and try again." });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(resetData.userId, {
        password: newPassword
      });

      if (error) {
        console.error('Password update error:', error);
        return res.status(500).json({ error: "Failed to update password. Please try again." });
      }

      await clearResetCode(resetData.userId);
      console.log(`Password reset successfully for: ${resetData.email}`);

      res.json({ success: true, message: "Password has been reset successfully." });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: "An error occurred. Please try again later." });
    }
  }));

  // Resend email verification endpoint
  app.post("/api/auth/resend-verification", asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Authentication service not configured" });
      }

      // Check if user exists and get their info
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error('[ResendVerification] Error listing users:', listError);
        return res.status(200).json({ success: true, message: "If an account exists with this email, you will receive a verification link." });
      }

      const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.status(200).json({ success: true, message: "If an account exists with this email, you will receive a verification link." });
      }

      if (user.email_confirmed_at) {
        return res.status(400).json({ error: "This email is already verified. You can log in." });
      }

      // Generate verification link
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
        options: {
          redirectTo: 'https://www.runcourier.co.uk/login?verified=true'
        }
      });

      if (linkError) {
        console.error('[ResendVerification] Failed to generate link:', linkError);
        return res.status(500).json({ error: "Failed to generate verification link" });
      }

      if (linkData?.properties?.action_link) {
        const fullName = user.user_metadata?.fullName || user.user_metadata?.full_name || 'Customer';
        const emailSent = await sendEmailVerification(email, linkData.properties.action_link, fullName);
        
        if (emailSent) {
          console.log(`[ResendVerification] Verification email sent to ${email}`);
        } else {
          console.error('[ResendVerification] Failed to send email');
          return res.status(500).json({ error: "Failed to send verification email" });
        }
      }

      res.status(200).json({ success: true, message: "If an account exists with this email, you will receive a verification link." });
    } catch (error) {
      console.error('[ResendVerification] Error:', error);
      res.status(500).json({ error: "An error occurred. Please try again later." });
    }
  }));

  app.get("/api/driver/:driverId/jobs", asyncHandler(async (req, res) => {
    const { driverId } = req.params;
    
    // Authenticate the request
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    try {
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Auth service unavailable" });
      }
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: "Invalid authentication" });
      }
      
      // Verify the user is either this driver or an admin
      const isAdmin = user.user_metadata?.role === 'admin' || user.email === 'runcourier1@gmail.com';
      const isDriver = user.id === driverId || user.user_metadata?.role === 'driver';
      
      // For drivers, verify they can only access their own jobs
      if (!isAdmin && !isDriver) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!isAdmin && user.id !== driverId) {
        // Check if the driver's user_id maps to this driverId
        const driver = await storage.getDriver(driverId);
        if (!driver || (driver.userId !== user.id && driver.id !== user.id)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    } catch (authErr) {
      console.error('[Driver Jobs API] Auth error:', authErr);
      return res.status(401).json({ error: "Authentication failed" });
    }
    
    const assignments = await storage.getJobAssignments({ driverId, status: undefined });
    const activeAssignments = (assignments || []).filter(a => 
      ['sent', 'accepted', 'pending'].includes(a.status)
    );
    
    const assignmentPriceMap = new Map();
    const assignmentJobIds: string[] = [];
    for (const a of activeAssignments) {
      assignmentJobIds.push(String(a.jobId));
      if (!assignmentPriceMap.has(String(a.jobId)) || a.status === 'accepted') {
        assignmentPriceMap.set(String(a.jobId), a.driverPrice);
      }
    }
    console.log(`[Driver Jobs API] Active assignments: ${activeAssignments.length}, jobIds: [${assignmentJobIds.join(', ')}]`);
    
    const allJobs = await storage.getJobs();
    const driverJobs = allJobs.filter(j => 
      String(j.driverId) === String(driverId) || assignmentJobIds.includes(String(j.id))
    );
    
    const safeJobs = driverJobs
      .filter(j => !j.driverHidden)
      .map(j => {
        const assignmentPrice = assignmentPriceMap.get(String(j.id));
        const numbered = ensureJobNumber(j);
        return {
          id: j.id,
          jobNumber: numbered.jobNumber,
          trackingNumber: j.trackingNumber,
          customerId: j.customerId,
          driverId: j.driverId,
          dispatcherId: j.dispatcherId,
          vendorId: j.vendorId,
          status: j.status,
          vehicleType: j.vehicleType,
          pickupAddress: j.pickupAddress,
          pickupPostcode: j.pickupPostcode,
          pickupLatitude: j.pickupLatitude,
          pickupLongitude: j.pickupLongitude,
          pickupInstructions: j.pickupInstructions,
          pickupContactName: j.pickupContactName,
          pickupContactPhone: j.pickupContactPhone,
          deliveryAddress: j.deliveryAddress,
          deliveryPostcode: j.deliveryPostcode,
          deliveryLatitude: j.deliveryLatitude,
          deliveryLongitude: j.deliveryLongitude,
          deliveryInstructions: j.deliveryInstructions,
          recipientName: j.recipientName,
          recipientPhone: j.recipientPhone,
          weight: j.weight,
          distance: j.distance,
          isMultiDrop: j.isMultiDrop,
          isReturnTrip: j.isReturnTrip,
          driverPrice: assignmentPrice !== undefined ? assignmentPrice : j.driverPrice,
          scheduledPickupTime: j.scheduledPickupTime,
          estimatedDeliveryTime: j.estimatedDeliveryTime,
          actualPickupTime: j.actualPickupTime,
          actualDeliveryTime: j.actualDeliveryTime,
          podSignatureUrl: j.podSignatureUrl,
          podPhotoUrl: j.podPhotoUrl,
          podNotes: j.podNotes,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
          multiDropStops: [] as any[],
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const multiDropJobIds = safeJobs.filter(j => j.isMultiDrop).map(j => j.id);
    if (multiDropJobIds.length > 0) {
      try {
        const { supabaseAdmin } = await import('./supabaseAdmin');
        if (supabaseAdmin) {
          const { data: stops } = await supabaseAdmin
            .from('multi_drop_stops')
            .select('id, job_id, stop_order, address, postcode, latitude, longitude, recipient_name, recipient_phone, instructions, status, delivered_at, pod_photo_url, pod_signature_url, pod_recipient_name')
            .in('job_id', multiDropJobIds)
            .order('stop_order', { ascending: true });

          if (stops && stops.length > 0) {
            const stopsMap: Record<string, any[]> = {};
            for (const stop of stops) {
              if (!stopsMap[stop.job_id]) stopsMap[stop.job_id] = [];
              stopsMap[stop.job_id].push({
                id: stop.id,
                jobId: stop.job_id,
                stopOrder: stop.stop_order,
                address: stop.address,
                postcode: stop.postcode,
                latitude: stop.latitude,
                longitude: stop.longitude,
                recipientName: stop.recipient_name,
                recipientPhone: stop.recipient_phone,
                instructions: stop.instructions,
                status: stop.status || 'pending',
                deliveredAt: stop.delivered_at,
                podPhotoUrl: stop.pod_photo_url,
                podSignatureUrl: stop.pod_signature_url,
                podRecipientName: stop.pod_recipient_name,
              });
            }
            for (const job of safeJobs) {
              if (job.isMultiDrop && stopsMap[job.id]) {
                job.multiDropStops = stopsMap[job.id];
              }
            }
            console.log(`[Driver Jobs API] Attached multi-drop stops for ${Object.keys(stopsMap).length} jobs`);
          }
        }
      } catch (err: any) {
        console.error('[Driver Jobs API] Error fetching multi-drop stops:', err.message);
      }
    }
    
    console.log(`[Driver Jobs API] Found ${safeJobs.length} jobs for driver ${driverId}`);
    res.json(safeJobs);
  }));

  // Job Assignment Routes - Admin assigns jobs to drivers
  app.get("/api/job-assignments", asyncHandler(async (req, res) => {
    const { jobId, driverId, status } = req.query;
    const assignments = await storage.getJobAssignments({
      jobId: jobId as string,
      driverId: driverId as string,
      status: status as any,
    });
    res.json(assignments);
  }));

  app.get("/api/job-assignments/:id", asyncHandler(async (req, res) => {
    const assignment = await storage.getJobAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.json(assignment);
  }));

  app.get("/api/jobs/:id/active-assignment", asyncHandler(async (req, res) => {
    const assignment = await storage.getActiveAssignmentForJob(req.params.id);
    res.json(assignment || null);
  }));

  app.post("/api/job-assignments", asyncHandler(async (req, res) => {
    console.log(`[Job Assignment API] POST /api/job-assignments called with body:`, JSON.stringify(req.body));
    const { jobId, driverId, assignedBy, driverPrice, expiresAt } = req.body;
    
    if (!jobId || !driverId || !assignedBy || driverPrice === undefined || driverPrice === null) {
      console.log(`[Job Assignment API] Missing required fields - jobId: ${jobId}, driverId: ${driverId}, assignedBy: ${assignedBy}, driverPrice: ${driverPrice}`);
      return res.status(400).json({ error: "Missing required fields: jobId, driverId, assignedBy, driverPrice" });
    }

    // Check if job exists
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Capture previous assignment state BEFORE any changes (for notification logic)
    const previousDriverId: string | null = job.driverId || null;
    const previousDriverPrice: number | null = (job.driverPrice !== null && job.driverPrice !== undefined && job.driverPrice !== '')
      ? parseFloat(String(job.driverPrice))
      : null;

    // Check if driver exists - first in local storage, then in Supabase
    let driver = await storage.getDriver(driverId);
    let driverUserId = driver?.userId || driverId; // For Supabase drivers, the driverId IS the userId
    
    if (!driver) {
      // Check if this is a Supabase driver (UUID format)
      const { supabaseAdmin } = await import('./supabaseAdmin');
      if (supabaseAdmin) {
        try {
          const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(driverId);
          if (!error && user && user.user_metadata?.role === 'driver') {
            // Valid Supabase driver - create a temporary driver object for the assignment
            console.log(`[Job Assignment] Found Supabase driver: ${user.email}`);
            driverUserId = user.id;
          } else {
            return res.status(404).json({ error: "Driver not found" });
          }
        } catch (e) {
          console.error('[Job Assignment] Error checking Supabase driver:', e);
          return res.status(404).json({ error: "Driver not found" });
        }
      } else {
        return res.status(404).json({ error: "Driver not found" });
      }
    } else if (driver.isActive === false) {
      // Driver exists but is deactivated
      return res.status(400).json({ error: "Cannot assign jobs to deactivated drivers" });
    }

    // Check for existing active assignment
    const existingAssignment = await storage.getActiveAssignmentForJob(jobId);
    if (existingAssignment) {
      // Allow reassignment to the same driver with updated price
      if (existingAssignment.driverId === driverId) {
        // Cancel the old assignment and create a new one with updated price
        await storage.updateJobAssignment(existingAssignment.id, {
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: "Reassigned with updated price"
        });
        console.log(`[Job Assignment] Cancelled old assignment ${existingAssignment.id} for price update reassignment`);
      } else {
        return res.status(400).json({ error: "Job already has an active assignment to another driver. Cancel it first before reassigning." });
      }
    }

    // Enforce minimum driver price per vehicle type.
    // IMPORTANT: £0.00 (exactly zero) is a valid admin-assigned price and BYPASSES the minimum.
    // Only enforce the minimum when the admin sets a non-zero price that is below the vehicle minimum.
    const assignMinPrice = getMinDriverPrice(job.vehicleType);
    const assignRequestedPrice = parseFloat(String(driverPrice));
    const assignEnforcedPrice = (assignRequestedPrice === 0)
      ? 0  // £0.00 is an intentional admin choice — preserve it exactly
      : Math.max(assignRequestedPrice, assignMinPrice);
    const enforcedDriverPrice = assignEnforcedPrice.toFixed(2);
    if (assignEnforcedPrice !== assignRequestedPrice) {
      console.log(`[Job Assignment] Driver price £${assignRequestedPrice} below minimum £${assignMinPrice} for ${job.vehicleType} — raised to £${assignEnforcedPrice}`);
    }

    // Create the assignment
    console.log(`[Job Assignment] Creating assignment: jobId=${jobId}, driverId=${driverId}, price=${enforcedDriverPrice}`);
    const assignment = await storage.createJobAssignment({
      jobId,
      driverId,
      assignedBy,
      driverPrice: enforcedDriverPrice,
      status: "sent",
      sentAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    console.log(`[Job Assignment] Assignment created: id=${assignment.id}, status=${assignment.status}`);

    // Automatically update job status to "assigned" AND set the driverId when assignment is created
    // CRITICAL: Use enforcedDriverPrice (same as assignment) — not the raw request driverPrice
    // This ensures both the job and assignment tables always have the identical driver price
    console.log(`[Job Assignment] Updating job ${jobId} with driverId=${driverId} and status=assigned`);
    const updatedJob = await storage.updateJob(jobId, {
      status: "assigned" as any,
      driverId: driverId,
      driverPrice: enforcedDriverPrice
    });
    console.log(`[Job Assignment] Job ${jobId} update result:`, updatedJob ? `success, driver_id=${updatedJob.driverId}` : 'FAILED - no job returned');
    
    // Verify the job was updated in Supabase
    const { supabaseAdmin: verifyClient } = await import('./supabaseAdmin');
    if (verifyClient) {
      const { data: verifyJob, error: verifyError } = await verifyClient
        .from('jobs')
        .select('id, driver_id, status, driver_price')
        .eq('id', jobId)
        .single();
      if (verifyError) {
        console.error(`[Job Assignment] VERIFICATION FAILED: Could not verify job in Supabase:`, verifyError.message);
      } else {
        console.log(`[Job Assignment] VERIFIED in Supabase: job ${jobId} driver_id=${verifyJob?.driver_id}, status=${verifyJob?.status}, driver_price=${verifyJob?.driver_price}`);
      }
    }
    
    console.log(`[Job Assignment] Job ${jobId} assigned to driver ${driverId} with price £${driverPrice}`);
    
    // Auto-geocode job coordinates if missing (for mobile app map preview)
    if (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude) ||
        job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude)) {
      try {
        const geoUpdates: any = {};
        if (job.pickupAddress && (!job.pickupLatitude || !job.pickupLongitude)) {
          const pickupResult = await geocodeAddress(job.pickupAddress);
          if (pickupResult) {
            geoUpdates.pickupLatitude = pickupResult.lat;
            geoUpdates.pickupLongitude = pickupResult.lng;
            console.log(`[Job Assignment] Geocoded pickup for job ${jobId}: ${pickupResult.lat}, ${pickupResult.lng}`);
          }
        }
        if (job.deliveryAddress && (!job.deliveryLatitude || !job.deliveryLongitude)) {
          const deliveryResult = await geocodeAddress(job.deliveryAddress);
          if (deliveryResult) {
            geoUpdates.deliveryLatitude = deliveryResult.lat;
            geoUpdates.deliveryLongitude = deliveryResult.lng;
            console.log(`[Job Assignment] Geocoded delivery for job ${jobId}: ${deliveryResult.lat}, ${deliveryResult.lng}`);
          }
        }
        if (Object.keys(geoUpdates).length > 0) {
          await storage.updateJob(jobId, geoUpdates);
        }
      } catch (geoErr) {
        console.error(`[Job Assignment] Geocoding failed for job ${jobId}:`, geoErr);
        // Continue anyway - map preview will be unavailable but job still works
      }
    }

    // Re-fetch the job AFTER geocoding so we have updated coordinates for mobile map
    const freshAssignJob = await storage.getJob(jobId) || job;

    // Determine notification type based on previous state:
    //   - "New Job Assigned"  : driver changed from null/nobody to this driver, OR different driver
    //   - "Job Price Updated" : same driver already assigned, price genuinely changed
    //   - (no notification)   : same driver already assigned, price unchanged
    const newDriverPrice = parseFloat(String(enforcedDriverPrice));
    const isSameDriverReassignment = previousDriverId !== null && previousDriverId === driverId;
    const wasPriceChanged = isSameDriverReassignment && previousDriverPrice !== null
      && Math.abs(previousDriverPrice - newDriverPrice) > 0.001;

    if (isSameDriverReassignment && wasPriceChanged) {
      // --- PRICE UPDATE SCENARIO ---
      // Same driver already assigned; admin updated their pay via the assignment dialog
      console.log(`[Job Assignment] Same driver ${driverId} re-assigned — price changed from £${previousDriverPrice} to £${newDriverPrice} → sending "Job Price Updated"`);

      const jobRef = freshAssignJob.jobNumber || freshAssignJob.trackingNumber || jobId;

      // In-app notification
      try {
        await storage.createNotification({
          userId: driverUserId,
          title: "Job Price Updated",
          message: `Your pay for job #${jobRef} has been updated to £${newDriverPrice.toFixed(2)}`,
          type: "price_update",
          data: { assignmentId: assignment.id, jobId, newPrice: newDriverPrice.toFixed(2) },
        });
      } catch (err: any) {
        console.error('[Job Assignment] Failed to create price-update in-app notification:', err.message);
      }

      // Push notification
      (async () => {
        try {
          const result = await sendPriceUpdateNotification(driverId, {
            jobId,
            trackingNumber: freshAssignJob.trackingNumber || '',
            jobNumber: freshAssignJob.jobNumber,
            newPrice: newDriverPrice.toFixed(2),
            pickupPostcode: freshAssignJob.pickupPostcode,
            deliveryPostcode: freshAssignJob.deliveryPostcode,
          });
          if (result.success) {
            console.log(`[Job Assignment] Price-update push sent to ${result.sentCount} device(s) for driver ${driverId}`);
          } else {
            console.log(`[Job Assignment] No push devices for driver ${driverId} (price update)`);
          }
        } catch (err: any) {
          console.error('[Job Assignment] Failed to send price-update push:', err.message);
        }
      })().catch(err => console.error('[Job Assignment] Price-update push error:', err));

    } else if (isSameDriverReassignment && !wasPriceChanged) {
      // Same driver, same price — no notification needed (re-send without price change)
      console.log(`[Job Assignment] Same driver ${driverId} re-assigned with same price £${newDriverPrice} — no notification sent`);

    } else {
      // --- NEW ASSIGNMENT SCENARIO ---
      // Driver changed from null → new driver, or different driver
      console.log(`[Job Assignment] New assignment for driver ${driverId} (previousDriver: ${previousDriverId ?? 'none'}) → sending "New Job Assigned"`);

      // In-app notification
      await storage.createNotification({
        userId: driverUserId,
        title: "New Job Assignment",
        message: `You have been assigned a new job #${freshAssignJob.jobNumber || ''} (${freshAssignJob.trackingNumber}). Driver payment: £${driverPrice}. Please accept or decline.`,
        type: "job_assigned",
        data: { assignmentId: assignment.id, jobId },
      });

      // Push notification with multi-drop stops
      (async () => {
        let multiDropStops: any[] | undefined;
        if (freshAssignJob.isMultiDrop) {
          try {
            const { supabaseAdmin: mdClient } = await import('./supabaseAdmin');
            if (mdClient) {
              const { data: stops } = await mdClient
                .from('multi_drop_stops')
                .select('stop_order, address, postcode, recipient_name, recipient_phone, instructions, latitude, longitude')
                .eq('job_id', jobId)
                .order('stop_order', { ascending: true });
              if (stops && stops.length > 0) {
                multiDropStops = stops.map(s => ({
                  stopOrder: s.stop_order,
                  address: s.address,
                  postcode: s.postcode,
                  recipientName: s.recipient_name,
                  recipientPhone: s.recipient_phone,
                  instructions: s.instructions,
                  latitude: s.latitude,
                  longitude: s.longitude,
                }));
              }
            }
          } catch (err: any) {
            console.error('[Job Assignment] Failed to fetch multi-drop stops for push:', err.message);
          }
        }

        const result = await sendJobOfferNotification(driverId, {
          jobId,
          trackingNumber: freshAssignJob.trackingNumber,
          jobNumber: freshAssignJob.jobNumber,
          pickupAddress: freshAssignJob.pickupAddress,
          pickupPostcode: freshAssignJob.pickupPostcode,
          pickupLatitude: freshAssignJob.pickupLatitude,
          pickupLongitude: freshAssignJob.pickupLongitude,
          deliveryAddress: freshAssignJob.deliveryAddress,
          deliveryPostcode: freshAssignJob.deliveryPostcode,
          deliveryLatitude: freshAssignJob.deliveryLatitude,
          deliveryLongitude: freshAssignJob.deliveryLongitude,
          recipientName: freshAssignJob.recipientName,
          recipientPhone: freshAssignJob.recipientPhone,
          distance: freshAssignJob.distance,
          driverPrice: enforcedDriverPrice,
          vehicleType: freshAssignJob.vehicleType,
          isMultiDrop: freshAssignJob.isMultiDrop || false,
          multiDropStops,
        });
        if (result.success) {
          console.log(`[Job Assignment] Push notification sent to ${result.sentCount} device(s) for driver ${driverId}`);
        } else {
          console.log(`[Job Assignment] No push devices registered for driver ${driverId}`);
        }
      })().catch(err => console.error('[Job Assignment] Failed to send push notification:', err));
    }

    // Broadcast WebSocket update so all admin sessions reflect the change
    if (freshAssignJob.driverId) {
      broadcastJobAssigned({
        id: freshAssignJob.id,
        trackingNumber: freshAssignJob.trackingNumber,
        jobNumber: freshAssignJob.jobNumber,
        status: freshAssignJob.status,
        driverId: freshAssignJob.driverId,
        pickupAddress: freshAssignJob.pickupAddress,
        pickupPostcode: freshAssignJob.pickupPostcode,
        pickupLatitude: freshAssignJob.pickupLatitude,
        pickupLongitude: freshAssignJob.pickupLongitude,
        deliveryAddress: freshAssignJob.deliveryAddress,
        deliveryPostcode: freshAssignJob.deliveryPostcode,
        deliveryLatitude: freshAssignJob.deliveryLatitude,
        deliveryLongitude: freshAssignJob.deliveryLongitude,
        recipientName: freshAssignJob.recipientName,
        recipientPhone: freshAssignJob.recipientPhone,
        distance: freshAssignJob.distance,
        vehicleType: freshAssignJob.vehicleType,
        driverPrice: enforcedDriverPrice,
      });

      broadcastJobUpdate({
        id: freshAssignJob.id,
        trackingNumber: freshAssignJob.trackingNumber || '',
        status: 'assigned',
        previousStatus: 'pending',
        customerId: freshAssignJob.customerId || '',
        driverId: freshAssignJob.driverId,
        updatedAt: new Date(),
      });
    }

    // Note: SupabaseStorage already handles Supabase writes directly
    // No need for redundant sync here
    
    res.status(201).json(assignment);
  }));

  // Batch assign multiple jobs to a driver
  app.post("/api/job-assignments/batch", asyncHandler(async (req, res) => {
    const { jobIds, driverId, assignedBy, driverPrice, expiresAt } = req.body;
    
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "At least one job is required" });
    }
    if (!driverId || !assignedBy || driverPrice === undefined || driverPrice === null) {
      return res.status(400).json({ error: "Driver ID, assigned by, and driver price are required" });
    }

    // Verify driver exists and is active
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    if (driver.isActive === false) {
      return res.status(400).json({ error: "Cannot assign jobs to a deactivated driver" });
    }

    const driverUserId = driver.userId;
    if (!driverUserId) {
      return res.status(400).json({ error: "Driver has no associated user account" });
    }

    // Generate a batch group ID
    const batchGroupId = crypto.randomUUID();
    const assignments: any[] = [];
    const errors: { jobId: string; error: string }[] = [];

    for (const jobId of jobIds) {
      const job = await storage.getJob(jobId);
      if (!job) {
        errors.push({ jobId, error: "Job not found" });
        continue;
      }

      // Check if job already has an active assignment
      const existingAssignment = await storage.getActiveAssignmentForJob(jobId);
      if (existingAssignment) {
        errors.push({ jobId, error: "Job already has an active assignment" });
        continue;
      }

      // Enforce minimum driver price per vehicle type for this job.
      // IMPORTANT: £0.00 (exactly zero) is a valid admin-assigned price — bypass minimum.
      const batchMinPrice = getMinDriverPrice(job.vehicleType);
      const batchRequestedPrice = parseFloat(String(driverPrice));
      const batchEnforcedPrice = (batchRequestedPrice === 0) ? 0 : Math.max(batchRequestedPrice, batchMinPrice);
      const batchFinalPrice = batchEnforcedPrice.toFixed(2);
      if (batchEnforcedPrice !== batchRequestedPrice) {
        console.log(`[BatchAssign] Job ${jobId} (${job.vehicleType}): price raised from £${batchRequestedPrice} to minimum £${batchEnforcedPrice}`);
      }

      // Create the assignment
      const assignment = await storage.createJobAssignment({
        jobId,
        driverId,
        assignedBy,
        driverPrice: batchFinalPrice,
        status: "sent",
        sentAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        batchGroupId,
      });

      // Update job status to "assigned" and set driverId
      await storage.updateJob(jobId, {
        status: "assigned" as any,
        driverId: driverId,
        driverPrice: batchFinalPrice
      });

      // Tag office_city if assigned by a supervisor and job not already tagged
      try {
        const assignerEmail = await getSupervisorEmailFromReq(req);
        if (assignerEmail) {
          const supCity = await getSupervisorCityByEmail(assignerEmail);
          if (supCity && !job.officeCity) {
            await upsertJobMetadata(jobId, supCity, null);
            try {
              await supabaseAdmin.from('jobs').update({ office_city: supCity }).eq('id', jobId);
            } catch {}
          }
        }
      } catch {}

      assignments.push(assignment);
    }

    // Create single notification for batch assignment
    if (assignments.length > 0) {
      await storage.createNotification({
        userId: driverUserId,
        title: `${assignments.length} New Job Assignment${assignments.length > 1 ? 's' : ''}`,
        message: `You have been assigned ${assignments.length} job${assignments.length > 1 ? 's' : ''}. Driver payment: £${driverPrice} each. Please review and respond.`,
        type: "job_assigned",
        data: { batchGroupId, assignmentCount: assignments.length },
      });
      
      // Send push notification for each job in the batch (with multi-drop data)
      for (const assignment of assignments) {
        const job = await storage.getJob(assignment.jobId);
        if (job) {
          (async () => {
            let multiDropStops: any[] | undefined;
            if (job.isMultiDrop) {
              try {
                const { supabaseAdmin: mdClient } = await import('./supabaseAdmin');
                if (mdClient) {
                  const { data: stops } = await mdClient
                    .from('multi_drop_stops')
                    .select('stop_order, address, postcode, recipient_name, recipient_phone, instructions, latitude, longitude')
                    .eq('job_id', job.id)
                    .order('stop_order', { ascending: true });
                  if (stops && stops.length > 0) {
                    multiDropStops = stops.map(s => ({
                      stopOrder: s.stop_order,
                      address: s.address,
                      postcode: s.postcode,
                      recipientName: s.recipient_name,
                      recipientPhone: s.recipient_phone,
                      instructions: s.instructions,
                      latitude: s.latitude,
                      longitude: s.longitude,
                    }));
                  }
                }
              } catch (err: any) {
                console.error('[Batch Assignment] Failed to fetch multi-drop stops:', err.message);
              }
            }
            await sendJobOfferNotification(driverId, {
              jobId: job.id,
              trackingNumber: job.trackingNumber,
              jobNumber: job.jobNumber,
              pickupAddress: job.pickupAddress,
              deliveryAddress: job.deliveryAddress,
              driverPrice: batchFinalPrice,
              vehicleType: job.vehicleType,
              isMultiDrop: job.isMultiDrop || false,
              multiDropStops,
            });
          })().catch(err => console.error('[Batch Assignment] Failed to send push:', err));
        }
      }
    }

    console.log(`[Job Assignment Batch] ${assignments.length} jobs assigned to driver ${driverId} (batch: ${batchGroupId})`);

    res.status(201).json({
      batchGroupId,
      assignments,
      errors: errors.length > 0 ? errors : undefined,
      successCount: assignments.length,
      errorCount: errors.length,
    });
  }));

  app.patch("/api/job-assignments/:id", asyncHandler(async (req, res) => {
    const assignment = await storage.updateJobAssignment(req.params.id, req.body);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.json(assignment);
  }));

  app.patch("/api/job-assignments/:id/respond", asyncHandler(async (req, res) => {
    const { accepted, rejectionReason } = req.body;
    
    if (accepted === undefined) {
      return res.status(400).json({ error: "Response (accepted) is required" });
    }

    const assignment = await storage.getJobAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    if (assignment.status !== "sent") {
      return res.status(400).json({ error: "Assignment is no longer pending response" });
    }

    // Check if driver is still active before accepting
    if (accepted) {
      const driver = await storage.getDriver(assignment.driverId);
      if (driver && driver.isActive === false) {
        return res.status(400).json({ error: "Your account has been deactivated. Please contact support." });
      }
    }

    const newStatus: JobAssignmentStatus = accepted ? "accepted" : "rejected";
    const updated = await storage.updateJobAssignment(req.params.id, {
      status: newStatus,
      respondedAt: new Date(),
      rejectionReason: !accepted ? (rejectionReason || null) : null,
    });

    // If accepted, assign the driver to the job and update status to "accepted"
    if (accepted && updated) {
      await storage.assignDriver(assignment.jobId, assignment.driverId);
      
      // Update job status to "accepted" - driver has confirmed they will take the job
      await storage.updateJobStatus(assignment.jobId, "accepted" as any);
      console.log(`[Job Assignment] Driver accepted - Job ${assignment.jobId} status updated to 'accepted'`);
      
      // Get job details for broadcast
      const job = await storage.getJob(assignment.jobId);
      if (job) {
        // Broadcast job update instantly to all connected clients
        broadcastJobUpdate({
          id: job.id,
          trackingNumber: job.trackingNumber || '',
          status: 'accepted',
          previousStatus: 'assigned',
          customerId: job.customerId || '',
          driverId: assignment.driverId,
          updatedAt: new Date(),
        });
        console.log(`[Job Assignment] Broadcasted job accepted update for ${job.trackingNumber}`);
      }
    } else if (!accepted) {
      // Driver declined - reset job status to "pending" so it can be reassigned
      await storage.updateJob(assignment.jobId, { status: "pending", driverId: null });
      const reasonText = rejectionReason ? ` Reason: ${rejectionReason}` : '';
      console.log(`[Job Assignment] Driver declined - Job ${assignment.jobId} status reset to 'pending'.${reasonText}`);
      
      // Get job details for broadcast
      const job = await storage.getJob(assignment.jobId);
      if (job) {
        // Broadcast job update instantly to all connected clients
        broadcastJobUpdate({
          id: job.id,
          trackingNumber: job.trackingNumber || '',
          status: 'pending',
          previousStatus: 'assigned',
          customerId: job.customerId || '',
          driverId: null,
          updatedAt: new Date(),
        });
        console.log(`[Job Assignment] Broadcasted job declined update for ${job.trackingNumber}`);
      }
    }

    // Notify admin of response with rejection reason if applicable
    const reasonMessage = !accepted && rejectionReason ? `\nReason: ${rejectionReason}` : '';
    await storage.createNotification({
      userId: assignment.assignedBy,
      title: `Job Assignment ${accepted ? "Accepted" : "Rejected"}`,
      message: `Driver has ${accepted ? "accepted" : "rejected"} the job assignment for job ${assignment.jobId}${reasonMessage}`,
      type: "assignment_response",
      data: { assignmentId: assignment.id, jobId: assignment.jobId, rejectionReason: rejectionReason || null },
    });

    res.json(updated);
  }));

  app.patch("/api/job-assignments/:id/cancel", asyncHandler(async (req, res) => {
    const { reason } = req.body;
    
    const assignment = await storage.getJobAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    if (assignment.status === "cancelled") {
      return res.status(400).json({ error: "Assignment is already cancelled" });
    }

    const cancelled = await storage.cancelJobAssignment(req.params.id, reason);

    // Reset job status to "pending" so it can be reassigned
    await storage.updateJob(assignment.jobId, { status: "pending", driverId: null });
    console.log(`[Job Assignment] Assignment cancelled - Job ${assignment.jobId} status reset to 'pending'`);

    // Broadcast job update instantly to all connected clients
    const job = await storage.getJob(assignment.jobId);
    if (job) {
      broadcastJobUpdate({
        id: job.id,
        trackingNumber: job.trackingNumber || '',
        status: 'pending',
        previousStatus: job.status || 'assigned',
        customerId: job.customerId || '',
        driverId: null,
        updatedAt: new Date(),
      });
      console.log(`[Job Assignment] Broadcasted assignment cancelled update for ${job.trackingNumber}`);
    }

    // Notify driver of cancellation
    const driver = await storage.getDriver(assignment.driverId);
    if (driver?.userId) {
      await storage.createNotification({
        userId: driver.userId,
        title: "Job Assignment Cancelled",
        message: `Your job assignment has been cancelled.${reason ? ` Reason: ${reason}` : ""}`,
        type: "assignment_cancelled",
        data: { assignmentId: assignment.id, jobId: assignment.jobId },
      });
    }

    res.json(cancelled);
  }));

  // Admin: Withdraw job assignment (for pending/sent offers before driver responds)
  app.patch("/api/job-assignments/:id/withdraw", asyncHandler(async (req, res) => {
    const { adminUserId } = req.body;
    
    if (!adminUserId) {
      return res.status(400).json({ error: "adminUserId is required" });
    }

    const assignment = await storage.getJobAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Can only withdraw pending or sent assignments (before driver responds)
    if (!["pending", "sent"].includes(assignment.status)) {
      return res.status(400).json({ 
        error: "Can only withdraw pending or sent assignments. Use 'remove' for accepted assignments." 
      });
    }

    const updated = await storage.updateJobAssignment(req.params.id, {
      status: "withdrawn" as any,
      withdrawnAt: new Date(),
      withdrawnBy: adminUserId,
    });

    // Reset job status to pending so it can be reassigned
    await storage.updateJob(assignment.jobId, { status: "pending", driverId: null });
    console.log(`[Job Assignment] Admin withdrawn - Job ${assignment.jobId} status reset to 'pending'`);

    // Notify driver that the offer was withdrawn
    const driver = await storage.getDriver(assignment.driverId);
    if (driver?.userId) {
      await storage.createNotification({
        userId: driver.userId,
        title: "Job Offer Withdrawn",
        message: "A job offer has been withdrawn by the admin.",
        type: "assignment_withdrawn",
        data: { assignmentId: assignment.id, jobId: assignment.jobId },
      });
    }

    // Broadcast job withdrawal via WebSocket for real-time mobile app updates
    const job = await storage.getJob(assignment.jobId);
    if (job) {
      broadcastJobWithdrawn({
        id: job.id,
        trackingNumber: job.trackingNumber,
        driverId: assignment.driverId,
        reason: "Withdrawn by admin",
      });
    }

    sendJobWithdrawalNotification(assignment.driverId, {
      jobId: assignment.jobId,
      trackingNumber: job?.trackingNumber || '',
      reason: "Withdrawn by admin",
    }).catch(err => console.error('[Job Assignment] Push notification failed:', err));

    res.json(updated);
  }));

  // Admin: Remove job assignment (for accepted/active assignments)
  app.patch("/api/job-assignments/:id/remove", asyncHandler(async (req, res) => {
    const { adminUserId, reason } = req.body;
    
    if (!adminUserId) {
      return res.status(400).json({ error: "adminUserId is required" });
    }

    const assignment = await storage.getJobAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Can remove any assignment that isn't already removed/cleaned
    if (["removed", "cleaned"].includes(assignment.status)) {
      return res.status(400).json({ error: "Assignment is already removed or cleaned" });
    }

    const updated = await storage.updateJobAssignment(req.params.id, {
      status: "removed" as any,
      removedAt: new Date(),
      removedBy: adminUserId,
      cancellationReason: reason || null,
    });

    // Reset job status to pending and clear driver assignment
    await storage.updateJob(assignment.jobId, { status: "pending", driverId: null });
    console.log(`[Job Assignment] Admin removed - Job ${assignment.jobId} status reset to 'pending'`);

    // Notify driver that the assignment was removed
    const driver = await storage.getDriver(assignment.driverId);
    if (driver?.userId) {
      await storage.createNotification({
        userId: driver.userId,
        title: "Job Assignment Removed",
        message: `Your job assignment has been removed by admin.${reason ? ` Reason: ${reason}` : ""}`,
        type: "assignment_removed",
        data: { assignmentId: assignment.id, jobId: assignment.jobId },
      });
    }

    // Broadcast job removal via WebSocket for real-time mobile app updates
    const job = await storage.getJob(assignment.jobId);
    if (job) {
      broadcastJobWithdrawn({
        id: job.id,
        trackingNumber: job.trackingNumber,
        driverId: assignment.driverId,
        reason: reason || "Removed by admin",
      });
    }

    sendJobWithdrawalNotification(assignment.driverId, {
      jobId: assignment.jobId,
      trackingNumber: job?.trackingNumber || '',
      reason: reason || "Removed by admin",
    }).catch(err => console.error('[Job Assignment] Push notification failed:', err));

    res.json(updated);
  }));

  // Admin: Clean job assignment (reset job completely for fresh reassignment)
  app.patch("/api/job-assignments/:id/clean", asyncHandler(async (req, res) => {
    const { adminUserId } = req.body;
    
    if (!adminUserId) {
      return res.status(400).json({ error: "adminUserId is required" });
    }

    const assignment = await storage.getJobAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Can clean any assignment
    if (assignment.status === "cleaned") {
      return res.status(400).json({ error: "Assignment is already cleaned" });
    }

    const updated = await storage.updateJobAssignment(req.params.id, {
      status: "cleaned" as any,
      cleanedAt: new Date(),
      cleanedBy: adminUserId,
    });

    // Reset job completely - clear driver, set to pending, clear any driver-related data
    await storage.updateJob(assignment.jobId, { 
      status: "pending", 
      driverId: null,
      driverHidden: false,
      driverHiddenAt: null,
      driverHiddenBy: null,
    });
    console.log(`[Job Assignment] Admin cleaned - Job ${assignment.jobId} fully reset for reassignment`);

    // Broadcast job update instantly to all connected clients
    const job = await storage.getJob(assignment.jobId);
    if (job) {
      broadcastJobUpdate({
        id: job.id,
        trackingNumber: job.trackingNumber || '',
        status: 'pending',
        previousStatus: job.status || 'assigned',
        customerId: job.customerId || '',
        driverId: null,
        updatedAt: new Date(),
      });
      console.log(`[Job Assignment] Broadcasted job cleaned update for ${job.trackingNumber}`);
    }

    // Notify driver that the assignment was cleaned/reset
    const driver = await storage.getDriver(assignment.driverId);
    if (driver?.userId) {
      await storage.createNotification({
        userId: driver.userId,
        title: "Job Assignment Reset",
        message: "A job assignment has been reset by admin and is no longer assigned to you.",
        type: "assignment_cleaned",
        data: { assignmentId: assignment.id, jobId: assignment.jobId },
      });
    }

    sendJobWithdrawalNotification(assignment.driverId, {
      jobId: assignment.jobId,
      trackingNumber: job?.trackingNumber || '',
      reason: "Assignment cleaned by admin",
    }).catch(err => console.error('[Job Assignment] Push notification failed:', err));

    res.json(updated);
  }));

  // Admin: Unassign driver from job (works with or without assignment record)
  app.patch("/api/jobs/:id/unassign", asyncHandler(async (req, res) => {
    const { adminUserId, reason } = req.body;
    const jobId = req.params.id;
    console.log(`[Job Unassign] Request — jobId: ${jobId}, adminUserId: ${adminUserId}, reason: ${reason}`);
    
    if (!adminUserId) {
      return res.status(400).json({ error: "adminUserId is required" });
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      console.log(`[Job Unassign] Job ${jobId} not found`);
      return res.status(404).json({ error: "Job not found" });
    }

    if (!job.driverId) {
      console.log(`[Job Unassign] Job ${jobId} has no driver assigned`);
      return res.status(400).json({ error: "Job has no driver assigned" });
    }

    const previousDriverId = job.driverId;

    // Try to find and cancel any active assignment
    const assignments = await storage.getJobAssignments({ jobId });
    const activeAssignment = assignments.find(a => 
      ['sent', 'pending', 'accepted'].includes(a.status)
    );

    if (activeAssignment) {
      // Cancel the assignment record
      await storage.updateJobAssignment(activeAssignment.id, {
        status: "cancelled" as any,
        cancelledAt: new Date(),
        cancellationReason: reason || "Unassigned by admin"
      });
      console.log(`[Job Unassign] Cancelled assignment ${activeAssignment.id}`);
    }

    // Clear driver from job and reset status
    await storage.updateJob(jobId, {
      driverId: null,
      driverPrice: null,
      status: "pending" as any
    });
    console.log(`[Job Unassign] Job ${job.trackingNumber} unassigned from driver, status reset to pending`);

    // Notify the driver
    const driver = await storage.getDriver(previousDriverId);
    if (driver?.userId) {
      await storage.createNotification({
        userId: driver.userId,
        title: "Job Unassigned",
        message: `Job #${job.jobNumber || ''} (${job.trackingNumber}) has been unassigned from you by admin.${reason ? ` Reason: ${reason}` : ""}`,
        type: "job_unassigned",
        data: { jobId, jobNumber: job.jobNumber, trackingNumber: job.trackingNumber },
      });
    }

    // Broadcast job unassignment via WebSocket for real-time mobile app updates
    broadcastJobWithdrawn({
      id: job.id,
      trackingNumber: job.trackingNumber,
      driverId: previousDriverId,
      reason: reason || "Unassigned by admin",
    });

    sendJobWithdrawalNotification(previousDriverId, {
      jobId: jobId,
      trackingNumber: job.trackingNumber,
      reason: reason || "Unassigned by admin",
    }).catch(err => console.error('[Job Unassign] Push notification failed:', err));

    res.json({ 
      success: true, 
      message: "Driver unassigned from job",
      jobId,
      previousDriverId
    });
  }));

  // Delivery Contacts routes (for business customers to save delivery details)
  app.get("/api/delivery-contacts", asyncHandler(async (req, res) => {
    const customerId = req.query.customerId as string;
    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
    }
    const contacts = await storage.getDeliveryContacts(customerId);
    res.json(contacts);
  }));

  app.get("/api/delivery-contacts/:id", asyncHandler(async (req, res) => {
    const contact = await storage.getDeliveryContact(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: "Delivery contact not found" });
    }
    res.json(contact);
  }));

  app.post("/api/delivery-contacts", asyncHandler(async (req, res) => {
    const { customerId, label, recipientName, recipientPhone, deliveryAddress, deliveryPostcode, buildingName, deliveryInstructions, isDefault } = req.body;
    
    if (!customerId || !label || !recipientName || !recipientPhone || !deliveryAddress || !deliveryPostcode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // If setting as default, unset other defaults for this customer
    if (isDefault) {
      const existingContacts = await storage.getDeliveryContacts(customerId);
      for (const contact of existingContacts) {
        if (contact.isDefault) {
          await storage.updateDeliveryContact(contact.id, { isDefault: false });
        }
      }
    }

    const contact = await storage.createDeliveryContact({
      customerId,
      label,
      recipientName,
      recipientPhone,
      deliveryAddress,
      deliveryPostcode,
      buildingName: buildingName || null,
      deliveryInstructions: deliveryInstructions || null,
      isDefault: isDefault || false,
    });
    res.status(201).json(contact);
  }));

  app.patch("/api/delivery-contacts/:id", asyncHandler(async (req, res) => {
    const contact = await storage.getDeliveryContact(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: "Delivery contact not found" });
    }

    const { isDefault, ...otherData } = req.body;

    // If setting as default, unset other defaults for this customer
    if (isDefault) {
      const existingContacts = await storage.getDeliveryContacts(contact.customerId);
      for (const existingContact of existingContacts) {
        if (existingContact.isDefault && existingContact.id !== contact.id) {
          await storage.updateDeliveryContact(existingContact.id, { isDefault: false });
        }
      }
    }

    const updated = await storage.updateDeliveryContact(req.params.id, { ...otherData, isDefault });
    res.json(updated);
  }));

  app.delete("/api/delivery-contacts/:id", asyncHandler(async (req, res) => {
    const contact = await storage.getDeliveryContact(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: "Delivery contact not found" });
    }
    await storage.deleteDeliveryContact(req.params.id);
    res.status(204).end();
  }));

  // ============================================================
  // SUPERVISOR ROUTES
  // ============================================================
  async function isSupervisorActive(email: string): Promise<boolean> {
    try {
      const result = await getPgPool().query(
        "SELECT status FROM supervisors WHERE email = $1 LIMIT 1",
        [email.toLowerCase()]
      );
      return result.rows.length > 0 && result.rows[0].status === 'active';
    } catch {
      return false;
    }
  }

  async function requireSupervisorOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const token = authHeader.slice(7);
    const authUser = await verifyAccessToken(token);
    if (!authUser?.email) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const isAdmin = await isAdminByEmail(authUser.email);
    if (isAdmin) { next(); return; }
    const isSup = await isSupervisorActive(authUser.email);
    if (isSup) { next(); return; }
    res.status(403).json({ error: 'Access denied' });
  }

  // POST /api/supervisors/invite — admin invites a supervisor
  app.post('/api/supervisors/invite', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { email, fullName, notes } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const normalizedEmail = email.toLowerCase().trim();
    const { randomBytes } = await import('crypto');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const invitedBy = req.headers['x-admin-name'] as string || 'Admin';
    // Check if supervisor already exists
    const existing = await getPgPool().query(
      'SELECT id, status FROM supervisors WHERE email = $1 LIMIT 1',
      [normalizedEmail]
    );
    if (existing.rows.length > 0 && existing.rows[0].status === 'active') {
      return res.status(400).json({ error: 'A supervisor with this email already exists and is active' });
    }
    if (existing.rows.length > 0) {
      // Re-invite: update token
      await getPgPool().query(
        'UPDATE supervisors SET invite_token = $1, invite_token_expires_at = $2, full_name = COALESCE($3, full_name), status = $4, notes = COALESCE($5, notes), updated_at = NOW() WHERE email = $6',
        [token, expiresAt, fullName || null, 'pending', notes || null, normalizedEmail]
      );
    } else {
      await getPgPool().query(
        'INSERT INTO supervisors (email, full_name, status, invite_token, invite_token_expires_at, invited_by, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [normalizedEmail, fullName || '', 'pending', token, expiresAt, invitedBy, notes || null]
      );
    }
    // Use APP_URL if set (production), otherwise derive from the request host so dev testing works
    const reqHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
    const reqProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const isLocalhost = reqHost.includes('localhost') || reqHost.includes('127.0.0.1');
    const baseUrl = process.env.APP_URL && !isLocalhost ? process.env.APP_URL : `${reqProto}://${reqHost}`;
    const inviteUrl = `${baseUrl}/supervisor/register?token=${token}`;
    console.log(`[Supervisor] Invite URL for ${normalizedEmail}: ${inviteUrl} (host: ${reqHost})`);
    try {
      const { sendSupervisorInviteEmail } = await import('./emailService');
      await sendSupervisorInviteEmail(normalizedEmail, {
        supervisorName: fullName,
        inviteUrl,
        invitedBy,
        expiresAt,
      });
    } catch (emailErr: any) {
      console.warn('[Supervisor] Failed to send invite email:', emailErr?.message);
    }
    res.json({ success: true, message: `Invitation sent to ${normalizedEmail}`, inviteUrl });
  }));

  // GET /api/supervisors/invite/validate/:token
  app.get('/api/supervisors/invite/validate/:token', asyncHandler(async (req, res) => {
    const { token } = req.params;
    const result = await getPgPool().query(
      'SELECT id, email, full_name, status, invite_token_expires_at FROM supervisors WHERE invite_token = $1 LIMIT 1',
      [token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid or expired invitation link' });
    const sup = result.rows[0];
    if (sup.status === 'active') return res.status(400).json({ error: 'This invitation has already been used' });
    if (new Date(sup.invite_token_expires_at) < new Date()) return res.status(400).json({ error: 'This invitation link has expired. Please request a new one from your admin.' });
    res.json({ valid: true, email: sup.email, fullName: sup.full_name });
  }));

  // POST /api/supervisors/register — supervisor creates account from invite
  app.post('/api/supervisors/register', asyncHandler(async (req, res) => {
    const { token, password, fullName, phone, city } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (!city) return res.status(400).json({ error: 'City is required' });
    const result = await getPgPool().query(
      'SELECT id, email, full_name, status, invite_token_expires_at FROM supervisors WHERE invite_token = $1 LIMIT 1',
      [token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid invitation link' });
    const sup = result.rows[0];
    if (sup.status === 'active') return res.status(400).json({ error: 'This invitation has already been used' });
    if (new Date(sup.invite_token_expires_at) < new Date()) return res.status(400).json({ error: 'This invitation has expired' });
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server error' });
    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: sup.email,
      password,
      email_confirm: true,
      user_metadata: { role: 'supervisor', fullName: fullName || sup.full_name, phone: phone || '', city: city || '' },
    });
    if (authError) {
      if (authError.message.includes('already')) {
        return res.status(400).json({ error: 'An account with this email already exists. Try logging in.' });
      }
      return res.status(400).json({ error: authError.message });
    }
    // Update supervisors table
    await getPgPool().query(
      'UPDATE supervisors SET auth_user_id = $1, full_name = $2, phone = $3, city = $4, status = $5, invite_token = NULL, activated_at = NOW(), updated_at = NOW() WHERE id = $6',
      [authData.user.id, fullName || sup.full_name, phone || null, city, 'pending_approval', sup.id]
    );
    res.json({ success: true, message: 'Account created successfully. Your account is pending admin approval.' });
  }));

  // GET /api/supervisor/verify — check supervisor status after login
  app.get('/api/supervisor/verify', asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    const token = authHeader.slice(7);
    const authUser = await verifyAccessToken(token);
    if (!authUser?.email) return res.status(401).json({ error: 'Invalid token' });
    const result = await getPgPool().query(
      'SELECT id, status, full_name, city, phone, notes, invited_at, activated_at, created_at FROM supervisors WHERE email = $1 LIMIT 1',
      [authUser.email.toLowerCase()]
    );
    if (result.rows.length === 0) return res.status(403).json({ error: 'Not a supervisor account' });
    const sup = result.rows[0];
    if (sup.status !== 'active') {
      return res.status(403).json({ error: 'Your account is pending admin approval.', status: sup.status });
    }
    res.json({
      verified: true,
      status: sup.status,
      name: sup.full_name,
      city: sup.city,
      phone: sup.phone,
      notes: sup.notes,
      invited_at: sup.invited_at,
      activated_at: sup.activated_at,
      created_at: sup.created_at,
    });
  }));

  // GET /api/supervisors — admin list all supervisors
  app.get('/api/supervisors', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const result = await getPgPool().query(
      'SELECT id, email, full_name, phone, city, status, invited_at, activated_at, invited_by, notes, created_at FROM supervisors ORDER BY created_at DESC'
    );
    res.json(result.rows);
  }));

  // Helper: get supervisor city by email
  async function getSupervisorCityByEmail(email: string): Promise<string | null> {
    try {
      const r = await getPgPool().query('SELECT city FROM supervisors WHERE email = $1 LIMIT 1', [email.toLowerCase()]);
      return r.rows[0]?.city || null;
    } catch { return null; }
  }

  // Helper: extract supervisor email from Bearer token (returns null if admin or invalid)
  async function getSupervisorEmailFromReq(req: Request): Promise<string | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const authUser = await verifyAccessToken(token);
    if (!authUser?.email) return null;
    const isAdmin = await isAdminByEmail(authUser.email);
    if (isAdmin) return null; // admins get no filter
    return authUser.email;
  }

  // GET /api/supervisor/jobs — active jobs (all, no city filter) + completed jobs for supervisor's city
  app.get('/api/supervisor/jobs', requireSupervisorOrAdmin, asyncHandler(async (req, res) => {
    const supEmail = await getSupervisorEmailFromReq(req);
    const city = supEmail ? await getSupervisorCityByEmail(supEmail) : null;

    const ACTIVE_STATUSES = ['pending', 'assigned', 'accepted', 'offered', 'on_the_way_pickup', 'collected', 'on_the_way_delivery'];

    let query: string;
    let params: any[];

    const SELECT_COLS = `id, tracking_number, job_number, status,
      pickup_address, delivery_address, pickup_postcode, delivery_postcode,
      pickup_contact_name, vehicle_type, total_price, driver_price,
      payment_status, created_at, scheduled_pickup_time, is_multi_drop,
      office_city, driver_id, service_type`;

    if (city) {
      // All active jobs (any city) + completed jobs only for this supervisor's city
      query = `SELECT ${SELECT_COLS}
               FROM jobs
               WHERE status = ANY($1::text[])
                  OR (status NOT IN ('pending','assigned','accepted','offered','on_the_way_pickup','collected','on_the_way_delivery') AND office_city = $2)
               ORDER BY created_at DESC LIMIT 300`;
      params = [ACTIVE_STATUSES, city];
    } else {
      // Admin / no-city supervisor — all jobs
      query = `SELECT ${SELECT_COLS}
               FROM jobs ORDER BY created_at DESC LIMIT 300`;
      params = [];
    }

    const result = await getPgPool().query(query, params);
    const jobs = result.rows.map((r: any) => ({
      id: r.id,
      trackingNumber: r.tracking_number,
      jobNumber: r.job_number,
      status: r.status,
      pickupAddress: r.pickup_address,
      deliveryAddress: r.delivery_address,
      pickupPostcode: r.pickup_postcode || '',
      deliveryPostcode: r.delivery_postcode || '',
      pickupContactName: r.pickup_contact_name,
      customerName: r.pickup_contact_name,
      customerEmail: null,
      vehicleType: r.vehicle_type,
      totalPrice: r.total_price,
      driverPrice: r.driver_price,
      paymentStatus: r.payment_status,
      createdAt: r.created_at,
      scheduledPickupTime: r.scheduled_pickup_time,
      isMultiDrop: r.is_multi_drop,
      officeCity: r.office_city,
      driverId: r.driver_id,
      serviceType: r.service_type,
    }));
    res.json(assignStableJobNumbers(jobs));
  }));

  // GET /api/supervisor/history — all completed jobs (no city filter)
  app.get('/api/supervisor/history', requireSupervisorOrAdmin, asyncHandler(async (req, res) => {
    const result = await getPgPool().query(
      `SELECT j.id, j.tracking_number, j.job_number, j.status, j.pickup_address, j.delivery_address,
              j.pickup_contact_name, j.vehicle_type, j.total_price, j.driver_price, j.created_at,
              j.is_multi_drop, j.office_city, j.driver_id,
              d.full_name AS driver_name, d.driver_code
       FROM jobs j
       LEFT JOIN drivers d ON d.id = j.driver_id
       WHERE j.status IN ('delivered','cancelled','failed')
       ORDER BY j.created_at DESC LIMIT 500`
    );
    const jobs = result.rows.map((r: any) => ({
      id: r.id,
      trackingNumber: r.tracking_number,
      jobNumber: r.job_number,
      status: r.status,
      pickupAddress: r.pickup_address,
      deliveryAddress: r.delivery_address,
      customerName: r.pickup_contact_name,
      vehicleType: r.vehicle_type,
      totalPrice: r.total_price,
      driverPrice: r.driver_price,
      createdAt: r.created_at,
      isMultiDrop: r.is_multi_drop,
      officeCity: r.office_city,
      driverName: r.driver_name,
      driverCode: r.driver_code,
    }));
    res.json(assignStableJobNumbers(jobs));
  }));

  // PUT /api/supervisor/profile — update supervisor's own name, phone and city
  app.put('/api/supervisor/profile', requireSupervisorOrAdmin, asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    const token = authHeader.slice(7);
    const authUser = await verifyAccessToken(token);
    if (!authUser?.email) return res.status(401).json({ error: 'Invalid token' });
    const { fullName, phone, city } = req.body;
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    await getPgPool().query(
      'UPDATE supervisors SET full_name = $1, phone = $2, city = $3 WHERE email = $4',
      [fullName.trim(), (phone || '').trim() || null, (city || '').trim() || null, authUser.email.toLowerCase()]
    );
    res.json({ success: true });
  }));

  // GET /api/supervisor/invoices — invoices for jobs in supervisor's office city
  app.get('/api/supervisor/invoices', requireSupervisorOrAdmin, asyncHandler(async (req, res) => {
    const supEmail = await getSupervisorEmailFromReq(req);
    const city = supEmail ? await getSupervisorCityByEmail(supEmail) : null;
    let query: string;
    let params: any[];
    if (city) {
      query = `SELECT i.* FROM invoices i
               LEFT JOIN jobs j ON j.id::text = i.job_id::text
               WHERE j.office_city = $1 OR i.office_city = $1
               ORDER BY i.created_at DESC LIMIT 300`;
      params = [city];
    } else {
      query = `SELECT * FROM invoices ORDER BY created_at DESC LIMIT 300`;
      params = [];
    }
    try {
      const result = await getPgPool().query(query, params);
      res.json(result.rows);
    } catch {
      // invoices table may not have job_id or office_city yet — fallback to unfiltered
      const fallback = await getPgPool().query(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 300`);
      res.json(fallback.rows);
    }
  }));

  // PUT /api/supervisors/:id — admin edit supervisor profile details
  app.put('/api/supervisors/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { full_name, phone, city, notes } = req.body;
    const result = await getPgPool().query(
      `UPDATE supervisors
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           city = COALESCE($3, city),
           notes = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, full_name, phone, city, status, invited_at, activated_at, invited_by, notes, created_at`,
      [full_name || null, phone || null, city || null, notes ?? null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supervisor not found' });
    res.json(result.rows[0]);
  }));

  // PATCH /api/supervisors/:id/status — admin update supervisor status
  app.patch('/api/supervisors/:id/status', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['active', 'suspended', 'deactivated', 'pending_approval'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await getPgPool().query(
      'UPDATE supervisors SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supervisor not found' });
    res.json(result.rows[0]);
  }));

  // DELETE /api/supervisors/:id — admin delete supervisor
  app.delete('/api/supervisors/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const supResult = await getPgPool().query('SELECT auth_user_id FROM supervisors WHERE id = $1', [id]);
    if (supResult.rows.length === 0) return res.status(404).json({ error: 'Supervisor not found' });
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (supabaseAdmin && supResult.rows[0].auth_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(supResult.rows[0].auth_user_id).catch(() => {});
    }
    await getPgPool().query('DELETE FROM supervisors WHERE id = $1', [id]);
    res.json({ success: true });
  }));

  // GET /api/supervisor/stats — supervisor dashboard stats
  // Active job counts = ALL jobs (no city filter); completed = city-filtered for supervisors
  app.get('/api/supervisor/stats', requireSupervisorOrAdmin, asyncHandler(async (req, res) => {
    try {
      const supEmail = await getSupervisorEmailFromReq(req);
      const city = supEmail ? await getSupervisorCityByEmail(supEmail) : null;

      const ACTIVE_STATUSES = ['pending', 'assigned', 'accepted', 'offered', 'on_the_way_pickup', 'collected', 'on_the_way_delivery'];

      const [activeResult, completedResult, driversResult] = await Promise.all([
        // All active jobs regardless of city
        getPgPool().query("SELECT status, COUNT(*) as count FROM jobs WHERE status = ANY($1::text[]) GROUP BY status", [ACTIVE_STATUSES]),
        // Completed jobs filtered by city (or all for admin)
        city
          ? getPgPool().query("SELECT COUNT(*) as count FROM jobs WHERE status = 'delivered' AND office_city = $1", [city])
          : getPgPool().query("SELECT COUNT(*) as count FROM jobs WHERE status = 'delivered'"),
        getPgPool().query("SELECT COUNT(*) as count FROM drivers WHERE is_verified = true AND is_active = true"),
      ]);

      const activeCounts: Record<string, number> = {};
      for (const row of activeResult.rows) {
        activeCounts[row.status] = parseInt(row.count);
      }
      const totalActive = Object.values(activeCounts).reduce((a, b) => a + b, 0);
      const inProgress = (activeCounts['assigned'] || 0) + (activeCounts['accepted'] || 0) + (activeCounts['on_the_way_pickup'] || 0) + (activeCounts['collected'] || 0) + (activeCounts['on_the_way_delivery'] || 0);

      res.json({
        totalJobs: totalActive,
        pendingJobs: activeCounts['pending'] || 0,
        activeJobs: inProgress,
        completedJobs: parseInt(completedResult.rows[0]?.count || '0'),
        activeDrivers: parseInt(driversResult.rows[0]?.count || '0'),
        officeCity: city || null,
      });
    } catch (e: any) {
      res.json({ totalJobs: 0, pendingJobs: 0, activeJobs: 0, completedJobs: 0, activeDrivers: 0, officeCity: null });
    }
  }));

  registerMobileRoutes(app);

  // Payment Links Routes
  const PAYMENT_LINK_EXPIRY_HOURS = 72; // Links expire after 72 hours
  const BASE_URL = process.env.APP_URL || 'https://runcourier.co.uk';
  console.log('[PaymentLinks] BASE_URL:', BASE_URL, 'APP_URL env:', process.env.APP_URL);

  function generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Company bank details storage (simple file-based)
  const companySettingsPath = path.join(process.cwd(), 'data', 'company-settings.json');
  
  const getCompanySettings = (): Record<string, any> => {
    try {
      if (fs.existsSync(companySettingsPath)) {
        return JSON.parse(fs.readFileSync(companySettingsPath, 'utf8'));
      }
    } catch {}
    return {};
  };
  
  const saveCompanySettings = (settings: Record<string, any>) => {
    const dir = path.dirname(companySettingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(companySettingsPath, JSON.stringify(settings, null, 2));
  };
  
  app.get("/api/admin/company-bank-details", asyncHandler(async (req, res) => {
    const settings = getCompanySettings();
    res.json(settings.bankDetails || null);
  }));
  
  app.put("/api/admin/company-bank-details", asyncHandler(async (req, res) => {
    const { bankName, accountHolderName, sortCode, accountNumber } = req.body;
    if (!bankName || !sortCode || !accountNumber) {
      return res.status(400).json({ error: "Bank name, sort code, and account number are required" });
    }
    const settings = getCompanySettings();
    settings.bankDetails = {
      bankName,
      accountHolderName: accountHolderName || '',
      sortCode,
      accountNumber,
      updatedAt: new Date().toISOString(),
    };
    saveCompanySettings(settings);
    console.log('[Admin] Company bank details saved');
    res.json(settings.bankDetails);
  }));

  // Admin: Generate and send payment link for a job
  app.post("/api/admin/payment-links", asyncHandler(async (req, res) => {
    const { jobId, adminId, customerEmail: providedEmail, customerName: providedName } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: "jobId is required" });
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Check if there's already an active payment link
    const existingLink = await storage.getActivePaymentLinkForJob(jobId);
    if (existingLink) {
      // Check if the existing link is actually expired (despite status)
      const expiresAt = existingLink.expiresAt instanceof Date ? existingLink.expiresAt : new Date(existingLink.expiresAt);
      if (expiresAt < new Date()) {
        // Link is expired, cancel it and allow new one
        console.log('[PaymentLink] Existing link expired, cancelling:', existingLink.id);
        await storage.cancelPaymentLink(existingLink.id, 'system');
      } else {
        return res.status(400).json({ 
          error: "An active payment link already exists for this job",
          existingLinkId: existingLink.id 
        });
      }
    }

    // Get customer information - try from user record first, then from provided data, then from job recipient
    let customerEmail: string | undefined;
    let customerName: string = job.recipientName || 'Customer';
    let customerId = job.customerId || 'admin-job';

    if (job.customerId) {
      const customer = await storage.getUser(job.customerId);
      if (customer?.email) {
        customerEmail = customer.email;
        customerName = customer.fullName;
      }
    }
    
    // Use provided email if no customer found
    if (!customerEmail && providedEmail) {
      customerEmail = providedEmail;
      customerName = providedName || job.recipientName || 'Customer';
    }
    
    // No email found - ask admin to provide one
    if (!customerEmail) {
      return res.status(400).json({ 
        error: "Customer email not found. Please provide a customer email.",
        requiresEmail: true 
      });
    }

    // Generate secure token
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + PAYMENT_LINK_EXPIRY_HOURS * 60 * 60 * 1000);

    // Create payment link
    const paymentLink = await storage.createPaymentLink({
      jobId,
      customerId,
      customerEmail: customerEmail!,
      token,
      tokenHash,
      amount: job.totalPrice,
      status: "pending",
      expiresAt,
      createdBy: adminId || null,
      auditLog: [{
        event: "created",
        timestamp: new Date().toISOString(),
        actor: adminId || "system",
      }],
    });

    // Update job payment status
    await storage.updateJob(jobId, { paymentStatus: "awaiting_payment" });

    // Generate the payment URL
    const paymentUrl = `${BASE_URL}/pay/${token}`;

    // Fetch multi-drop stops if job is multi-drop
    let multiDropStops: Array<{ address: string; postcode: string; recipientName?: string }> = [];
    if (job.isMultiDrop && supabaseAdmin) {
      const { data: stops } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('address, postcode, recipient_name')
        .eq('job_id', jobId)
        .order('stop_order', { ascending: true });
      if (stops && stops.length > 0) {
        multiDropStops = stops.map((s: any) => ({
          address: s.address || '',
          postcode: s.postcode || '',
          recipientName: s.recipient_name || undefined,
        }));
      }
    }

    // Send email to customer
    const emailSent = await sendPaymentLinkEmail(customerEmail!, {
      customerName,
      trackingNumber: job.trackingNumber,
      paymentLink: paymentUrl,
      amount: `£${parseFloat(job.totalPrice).toFixed(2)}`,
      expiresAt: expiresAt.toLocaleDateString('en-GB', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      pickupAddress: job.pickupAddress,
      pickupPostcode: job.pickupPostcode,
      deliveryAddress: job.deliveryAddress,
      deliveryPostcode: job.deliveryPostcode,
      vehicleType: job.vehicleType,
      weight: job.weight,
      distance: job.distance || "N/A",
      isMultiDrop: job.isMultiDrop || false,
      isReturnTrip: job.isReturnTrip || false,
      multiDropStops,
    });

    if (emailSent) {
      await storage.updatePaymentLink(paymentLink.id, {
        status: "sent",
        sentViaEmail: true,
      });
      await storage.appendPaymentLinkAuditLog(paymentLink.id, "email_sent", adminId, customerEmail);
    } else {
      // Email failed - notify admin
      await sendPaymentLinkFailureNotification({
        customerName,
        customerEmail: customerEmail!,
        trackingNumber: job.trackingNumber,
        amount: `£${parseFloat(job.totalPrice).toFixed(2)}`,
        paymentLink: paymentUrl,
        jobId,
      });
      await storage.appendPaymentLinkAuditLog(paymentLink.id, "email_failed", adminId, customerEmail);
    }

    // Notify admin
    if (adminId) {
      await storage.createNotification({
        userId: adminId,
        title: emailSent ? "Payment Link Sent" : "Payment Link Email Failed",
        message: emailSent 
          ? `Payment link sent to ${customerEmail} for job ${job.trackingNumber}` 
          : `Payment link created but email failed for ${customerEmail}. Check admin email for the payment link.`,
        type: "payment_link",
        data: { jobId, paymentLinkId: paymentLink.id, emailFailed: !emailSent },
      });
    }

    console.log(`[PaymentLink] Created payment link for job ${job.trackingNumber}`);

    res.status(201).json({
      id: paymentLink.id,
      paymentUrl,
      expiresAt,
      emailSent,
      status: emailSent ? "sent" : "pending",
    });
  }));

  // Admin: Get payment links for a job
  app.get("/api/admin/payment-links", asyncHandler(async (req, res) => {
    const { jobId, customerId, status } = req.query;
    console.log('[PaymentLinks] Admin fetching links with jobId:', jobId);
    const links = await storage.getPaymentLinks({
      jobId: jobId as string | undefined,
      customerId: customerId as string | undefined,
      status: status as any,
    });
    console.log('[PaymentLinks] Found', links.length, 'payment links');
    res.json(links);
  }));

  // Admin: Get single payment link
  app.get("/api/admin/payment-links/:id", asyncHandler(async (req, res) => {
    const link = await storage.getPaymentLink(req.params.id);
    if (!link) {
      return res.status(404).json({ error: "Payment link not found" });
    }
    res.json(link);
  }));

  // Admin: Cancel payment link
  app.post("/api/admin/payment-links/:id/cancel", asyncHandler(async (req, res) => {
    const { adminId } = req.body;
    const link = await storage.getPaymentLink(req.params.id);

    if (!link) {
      return res.status(404).json({ error: "Payment link not found" });
    }

    if (link.status === "paid") {
      return res.status(400).json({ error: "Cannot cancel a paid payment link" });
    }

    if (link.status === "cancelled") {
      return res.status(400).json({ error: "Payment link is already cancelled" });
    }

    const cancelled = await storage.cancelPaymentLink(req.params.id, adminId);
    console.log(`[PaymentLink] Cancelled payment link ${req.params.id}`);

    res.json(cancelled);
  }));

  // Admin: Resend payment link email
  app.post("/api/admin/payment-links/:id/resend", asyncHandler(async (req, res) => {
    const { adminId } = req.body;
    const link = await storage.getPaymentLink(req.params.id);

    if (!link) {
      return res.status(404).json({ error: "Payment link not found" });
    }

    if (link.status === "paid" || link.status === "cancelled" || link.status === "expired") {
      return res.status(400).json({ error: "Cannot resend an inactive payment link" });
    }

    // Check if expired
    if (new Date(link.expiresAt) < new Date()) {
      await storage.updatePaymentLink(link.id, { status: "expired" });
      return res.status(400).json({ error: "Payment link has expired" });
    }

    const job = await storage.getJob(link.jobId);
    if (!job) {
      return res.status(404).json({ error: "Associated job not found" });
    }

    // Use the email stored in the payment link (works for admin-created jobs too)
    const customerEmail = link.customerEmail;
    if (!customerEmail) {
      return res.status(400).json({ error: "Customer email not found" });
    }

    // Try to get customer name from user record, fallback to job recipient name
    let customerName = job.recipientName || 'Customer';
    if (link.customerId && link.customerId !== 'admin-job') {
      const customer = await storage.getUser(link.customerId);
      if (customer?.fullName) {
        customerName = customer.fullName;
      }
    }

    const paymentUrl = `${BASE_URL}/pay/${link.token}`;

    // Fetch multi-drop stops if job is multi-drop
    let multiDropStops: Array<{ address: string; postcode: string; recipientName?: string }> = [];
    if (job.isMultiDrop && supabaseAdmin) {
      const { data: stops } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('address, postcode, recipient_name')
        .eq('job_id', link.jobId)
        .order('stop_order', { ascending: true });
      if (stops && stops.length > 0) {
        multiDropStops = stops.map((s: any) => ({
          address: s.address || '',
          postcode: s.postcode || '',
          recipientName: s.recipient_name || undefined,
        }));
      }
    }

    const emailSent = await sendPaymentLinkEmail(customerEmail, {
      customerName,
      trackingNumber: job.trackingNumber,
      paymentLink: paymentUrl,
      amount: `£${parseFloat(link.amount).toFixed(2)}`,
      expiresAt: new Date(link.expiresAt).toLocaleDateString('en-GB', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      pickupAddress: job.pickupAddress,
      pickupPostcode: job.pickupPostcode,
      deliveryAddress: job.deliveryAddress,
      deliveryPostcode: job.deliveryPostcode,
      vehicleType: job.vehicleType,
      weight: job.weight,
      distance: job.distance || "N/A",
      isMultiDrop: job.isMultiDrop || false,
      isReturnTrip: job.isReturnTrip || false,
      multiDropStops,
    });

    if (emailSent) {
      await storage.appendPaymentLinkAuditLog(link.id, "email_resent", adminId, customerEmail);
      console.log(`[PaymentLink] Resent payment link email to ${customerEmail}`);
    } else {
      // Email failed - notify admin
      await sendPaymentLinkFailureNotification({
        customerName,
        customerEmail,
        trackingNumber: job.trackingNumber,
        amount: `£${parseFloat(link.amount).toFixed(2)}`,
        paymentLink: paymentUrl,
        jobId: link.jobId,
      });
      await storage.appendPaymentLinkAuditLog(link.id, "email_resend_failed", adminId, customerEmail);
      console.log(`[PaymentLink] Resend email FAILED for ${customerEmail}`);
    }

    res.json({ success: true, emailSent });
  }));

  // Admin: Regenerate payment link (create new one, cancel old)
  app.post("/api/admin/payment-links/:id/regenerate", asyncHandler(async (req, res) => {
    const { adminId } = req.body;
    const oldLink = await storage.getPaymentLink(req.params.id);

    if (!oldLink) {
      return res.status(404).json({ error: "Payment link not found" });
    }

    if (oldLink.status === "paid") {
      return res.status(400).json({ error: "Cannot regenerate a paid payment link" });
    }

    // Cancel old link
    await storage.cancelPaymentLink(oldLink.id, adminId);
    await storage.appendPaymentLinkAuditLog(oldLink.id, "replaced", adminId, "Regenerated with new link");

    // Generate new token
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + PAYMENT_LINK_EXPIRY_HOURS * 60 * 60 * 1000);

    const newLink = await storage.createPaymentLink({
      jobId: oldLink.jobId,
      customerId: oldLink.customerId,
      customerEmail: oldLink.customerEmail,
      token,
      tokenHash,
      amount: oldLink.amount,
      status: "pending",
      expiresAt,
      createdBy: adminId || null,
      auditLog: [{
        event: "created",
        timestamp: new Date().toISOString(),
        actor: adminId || "system",
        details: `Regenerated from link ${oldLink.id}`,
      }],
    });

    const job = await storage.getJob(oldLink.jobId);
    const customer = await storage.getUser(oldLink.customerId);
    const paymentUrl = `${BASE_URL}/pay/${token}`;

    // Fetch multi-drop stops if job is multi-drop
    let multiDropStops: Array<{ address: string; postcode: string; recipientName?: string }> = [];
    if (job?.isMultiDrop && supabaseAdmin) {
      const { data: stops } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('address, postcode, recipient_name')
        .eq('job_id', oldLink.jobId)
        .order('stop_order', { ascending: true });
      if (stops && stops.length > 0) {
        multiDropStops = stops.map((s: any) => ({
          address: s.address || '',
          postcode: s.postcode || '',
          recipientName: s.recipient_name || undefined,
        }));
      }
    }

    let emailSent = false;
    if (customer?.email && job) {
      emailSent = await sendPaymentLinkEmail(customer.email, {
        customerName: customer.fullName,
        trackingNumber: job.trackingNumber,
        paymentLink: paymentUrl,
        amount: `£${parseFloat(newLink.amount).toFixed(2)}`,
        expiresAt: expiresAt.toLocaleDateString('en-GB', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        pickupAddress: job.pickupAddress,
        pickupPostcode: job.pickupPostcode,
        deliveryAddress: job.deliveryAddress,
        deliveryPostcode: job.deliveryPostcode,
        vehicleType: job.vehicleType,
        weight: job.weight,
        distance: job.distance || "N/A",
        isMultiDrop: job.isMultiDrop || false,
        isReturnTrip: job.isReturnTrip || false,
        multiDropStops,
      });

      if (emailSent) {
        await storage.updatePaymentLink(newLink.id, {
          status: "sent",
          sentViaEmail: true,
        });
        await storage.appendPaymentLinkAuditLog(newLink.id, "email_sent", adminId, customer.email);
      } else {
        // Email failed - notify admin
        await sendPaymentLinkFailureNotification({
          customerName: customer.fullName,
          customerEmail: customer.email,
          trackingNumber: job.trackingNumber,
          amount: `£${parseFloat(newLink.amount).toFixed(2)}`,
          paymentLink: paymentUrl,
          jobId: oldLink.jobId,
        });
        await storage.appendPaymentLinkAuditLog(newLink.id, "email_failed", adminId, customer.email);
      }
    }

    console.log(`[PaymentLink] Regenerated payment link for job ${job?.trackingNumber}`);

    res.status(201).json({
      id: newLink.id,
      paymentUrl,
      expiresAt,
      emailSent,
      status: emailSent ? "sent" : "pending",
    });
  }));

  // Public: Validate token and get booking details
  app.get("/api/payment-links/:token", asyncHandler(async (req, res) => {
    const token = req.params.token;
    console.log('[PaymentLink] Looking up payment link with token:', token.substring(0, 20) + '...');
    const link = await storage.getPaymentLinkByToken(token);
    console.log('[PaymentLink] Lookup result:', link ? `Found link id=${link.id}` : 'Not found');

    if (!link) {
      return res.status(404).json({ error: "Invalid or expired payment link" });
    }

    // Check if expired
    const expiresAt = link.expiresAt instanceof Date ? link.expiresAt : new Date(link.expiresAt);
    console.log('[PaymentLink] Checking expiry:', expiresAt, 'vs now:', new Date(), 'expired:', expiresAt < new Date());
    if (expiresAt < new Date()) {
      await storage.updatePaymentLink(link.id, { status: "expired" });
      await storage.appendPaymentLinkAuditLog(link.id, "expired", undefined, "Link accessed after expiry");
      return res.status(410).json({ error: "This payment link has expired" });
    }

    // Check if already paid
    if (link.status === "paid") {
      return res.status(410).json({ error: "This payment has already been completed" });
    }

    // Check if cancelled
    if (link.status === "cancelled") {
      return res.status(410).json({ error: "This payment link has been cancelled" });
    }

    const job = await storage.getJob(link.jobId);
    if (!job) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Log that link was opened
    if (link.status !== "opened") {
      await storage.updatePaymentLink(link.id, { status: "opened", openedAt: new Date() });
      await storage.appendPaymentLinkAuditLog(link.id, "opened");
    }

    // Return read-only booking details
    res.json({
      trackingNumber: job.trackingNumber,
      amount: link.amount,
      expiresAt: link.expiresAt,
      pickup: {
        address: job.pickupAddress,
        postcode: job.pickupPostcode,
      },
      delivery: {
        address: job.deliveryAddress,
        postcode: job.deliveryPostcode,
      },
      vehicleType: job.vehicleType,
      weight: job.weight,
      distance: job.distance,
      pricing: {
        basePrice: job.basePrice,
        distancePrice: job.distancePrice,
        weightSurcharge: job.weightSurcharge,
        centralLondonCharge: job.centralLondonCharge,
        multiDropCharge: job.multiDropCharge,
        returnTripCharge: job.returnTripCharge,
        totalPrice: job.totalPrice,
      },
      isMultiDrop: job.isMultiDrop,
      isReturnTrip: job.isReturnTrip,
      isCentralLondon: job.isCentralLondon,
    });
  }));

  // Public: Create Stripe checkout session for payment link
  app.post("/api/payment-links/:token/checkout", asyncHandler(async (req, res) => {
    const token = req.params.token;
    const link = await storage.getPaymentLinkByToken(token);

    if (!link) {
      return res.status(404).json({ error: "Invalid or expired payment link" });
    }

    if (new Date(link.expiresAt) < new Date()) {
      await storage.updatePaymentLink(link.id, { status: "expired" });
      return res.status(410).json({ error: "This payment link has expired" });
    }

    if (link.status === "paid") {
      return res.status(410).json({ error: "This payment has already been completed" });
    }

    if (link.status === "cancelled") {
      return res.status(410).json({ error: "This payment link has been cancelled" });
    }

    const job = await storage.getJob(link.jobId);
    if (!job) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const stripe = await getUncachableStripeClient();
    const vehicleName = job.vehicleType.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    const description = `Run Courier Delivery - ${vehicleName} - ${job.pickupPostcode} to ${job.deliveryPostcode}`;

    const successUrl = `${BASE_URL}/pay/${token}/success`;
    const cancelUrl = `${BASE_URL}/pay/${token}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(parseFloat(link.amount) * 100),
          product_data: {
            name: description,
            description: `Tracking: ${job.trackingNumber} | From: ${job.pickupPostcode} | To: ${job.deliveryPostcode}`,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: link.customerEmail,
      metadata: {
        paymentLinkId: link.id,
        jobId: link.jobId,
        trackingNumber: job.trackingNumber,
        type: 'payment_link',
      },
    });

    await storage.updatePaymentLink(link.id, { stripeSessionId: session.id });
    await storage.appendPaymentLinkAuditLog(link.id, "checkout_started", undefined, `Session: ${session.id}`);

    console.log(`[PaymentLink] Checkout session created for job ${job.trackingNumber}`);

    res.json({ 
      sessionId: session.id, 
      url: session.url 
    });
  }));

  // Public: Handle successful payment (called after redirect from Stripe)
  app.post("/api/payment-links/:token/complete", asyncHandler(async (req, res) => {
    const token = req.params.token;
    const { sessionId } = req.body;
    const link = await storage.getPaymentLinkByToken(token);

    if (!link) {
      return res.status(404).json({ error: "Payment link not found" });
    }

    if (link.status === "paid") {
      return res.json({ success: true, message: "Payment already confirmed" });
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId || link.stripeSessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: "Payment not yet completed" });
    }

    // Mark payment link as paid
    await storage.updatePaymentLink(link.id, {
      status: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: session.payment_intent as string,
    });
    await storage.appendPaymentLinkAuditLog(link.id, "paid", undefined, `PaymentIntent: ${session.payment_intent}`);

    // Update job payment status
    const job = await storage.getJob(link.jobId);
    if (job) {
      await storage.updateJob(link.jobId, {
        paymentStatus: "paid",
        paymentIntentId: session.payment_intent as string,
      });

      // Send confirmation email
      const customer = await storage.getUser(link.customerId);
      if (customer?.email) {
        await sendPaymentConfirmationEmail(customer.email, {
          customerName: customer.fullName,
          trackingNumber: job.trackingNumber,
          amount: `£${parseFloat(link.amount).toFixed(2)}`,
          pickupAddress: job.pickupAddress,
          pickupPostcode: job.pickupPostcode,
          deliveryAddress: job.deliveryAddress,
          deliveryPostcode: job.deliveryPostcode,
          vehicleType: job.vehicleType,
        });
      }

      // Notify admins
      const admins = await storage.getUsers({ role: 'admin' });
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          title: "Payment Received",
          message: `Payment of £${parseFloat(link.amount).toFixed(2)} received for job ${job.trackingNumber}`,
          type: "payment_received",
          data: { jobId: link.jobId, paymentLinkId: link.id },
        });
      }

      console.log(`[PaymentLink] Payment completed for job ${job.trackingNumber}`);
    }

    res.json({ success: true });
  }));

  // NOTE: Stripe webhook for payment-links has been moved to server/index.ts
  // to ensure it receives raw body for signature verification (before express.json middleware)

  // ============= BUSINESS QUOTE =============
  // Send business multi-drop quote email (admin only)
  app.post("/api/send-business-quote", asyncHandler(async (req, res) => {
    // SECURITY: Require admin role to send business quotes
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const token = authHeader.slice(7);
    const { verifyAccessToken } = await import("./supabaseAdmin");
    const user = await verifyAccessToken(token);
    
    if (!user || (user.role !== 'admin' && user.role !== 'dispatcher' && user.role !== 'supervisor')) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { customerEmail, customerName, companyName, pickupPostcode, pickupAddress, pickupDate, pickupTime, drops, vehicleType, weight, quote, notes, serviceType, serviceTypePercent, serviceTypeAmount, finalTotal } = req.body;

    if (!customerEmail) {
      return res.status(400).json({ error: "Customer email is required" });
    }

    if (!quote || !quote.breakdown) {
      return res.status(400).json({ error: "Quote data is required" });
    }

    if (!drops || !Array.isArray(drops) || drops.length === 0) {
      return res.status(400).json({ error: "At least one delivery point is required" });
    }

    try {
      const emailSent = await sendBusinessQuoteEmail(customerEmail, {
        customerName,
        companyName,
        pickupPostcode,
        pickupAddress,
        pickupDate,
        pickupTime,
        drops,
        vehicleType,
        weight,
        quote,
        notes,
        serviceType,
        serviceTypePercent,
        serviceTypeAmount,
        finalTotal,
      });

      if (emailSent) {
        console.log(`[BusinessQuote] Quote email sent to ${customerEmail} for ${companyName || 'unnamed company'}`);
        res.json({ success: true, message: "Quote sent successfully" });
      } else {
        console.error(`[BusinessQuote] Failed to send quote email to ${customerEmail}`);
        res.status(500).json({ error: "Failed to send email" });
      }
    } catch (error) {
      console.error("[BusinessQuote] Error sending quote email:", error);
      res.status(500).json({ error: "Failed to send quote email" });
    }
  }));

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("API Error:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: err.errors 
      });
    }
    res.status(500).json({ error: "Internal server error" });
  });

  // Admin: Toggle driver availability (online/offline)
  app.patch("/api/admin/drivers/:id/availability", asyncHandler(async (req, res) => {
    if (!enforceAdminAccess(req, res)) return;
    
    const driverId = req.params.id;
    const { isAvailable } = req.body;
    
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ error: "isAvailable must be a boolean" });
    }
    
    const driver = await storage.updateDriver(driverId, { isAvailable });
    
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Broadcast availability change for instant map updates
    await broadcastDriverAvailability(driverId, isAvailable);
    
    // Broadcast profile update to mobile app for real-time sync
    broadcastProfileUpdate(driverId, {
      isAvailable,
      is_available: isAvailable,
      online_status: isAvailable ? 'online' : 'offline',
    });
    
    console.log(`[Admin] Set driver ${driver.driverCode || driverId} availability to ${isAvailable}`);
    res.json({ success: true, driver });
  }));

  // TEMPORARY: Create test driver account (internal use only - uses secret auth)
  app.post("/api/internal/create-test-driver", asyncHandler(async (req, res) => {
    // Allow with secret key for server-side creation
    const { email, password, fullName, secret } = req.body;
    
    // Check secret key (first 20 chars of service role key)
    const INTERNAL_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20);
    if (!secret || secret !== INTERNAL_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Authentication service not configured" });
      }
      
      // Create user via Supabase Admin with email confirmed
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Skip email verification for test account
        user_metadata: {
          fullName: fullName || 'Test Driver',
          full_name: fullName || 'Test Driver',
          role: 'driver',
        }
      });
      
      if (authError) {
        console.error('[TestDriver] Supabase auth error:', authError);
        return res.status(400).json({ error: authError.message });
      }
      
      if (!authData?.user) {
        return res.status(500).json({ error: "Failed to create auth user" });
      }
      
      const userId = authData.user.id;
      
      // Create driver record in Supabase
      const { data: driverData, error: driverError } = await supabaseAdmin
        .from('drivers')
        .insert({
          id: userId,
          email,
          full_name: fullName || 'Test Driver',
          vehicle_type: 'car',
          online_status: 'offline',
          status: 'approved',
        })
        .select()
        .single();
      
      if (driverError) {
        console.error('[TestDriver] Driver insert error:', driverError);
      }
      
      // Also create in local PostgreSQL
      try {
        const { db } = await import("./db");
        const { drivers } = await import("@shared/schema");
        
        await db.insert(drivers).values({
          id: crypto.randomUUID(),
          userId: userId,
          driverCode: driverData?.driver_code || null,
          fullName: fullName || 'Test Driver',
          email,
          vehicleType: 'car',
          isAvailable: false,
          isVerified: true,
          rating: "5.00",
          totalJobs: 0,
          createdAt: new Date(),
        }).onConflictDoNothing();
        
        console.log('[TestDriver] Driver created in PostgreSQL');
      } catch (dbErr) {
        console.error('[TestDriver] PostgreSQL insert error:', dbErr);
      }
      
      console.log(`[TestDriver] Test driver created: ${email}`);
      res.status(201).json({ 
        success: true, 
        message: `Test driver created with email: ${email}`,
        userId,
        driverId: driverData?.driver_code || userId
      });
    } catch (error: any) {
      console.error('[TestDriver] Error:', error);
      res.status(500).json({ error: error.message || "Failed to create test driver" });
    }
  }));

  // TEMPORARY: Reset password for existing test user
  app.post("/api/internal/reset-test-password", asyncHandler(async (req, res) => {
    const { email, newPassword, secret } = req.body;
    
    const INTERNAL_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20);
    if (!secret || secret !== INTERNAL_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }
    
    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and newPassword are required" });
    }
    
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Authentication service not configured" });
      }
      
      // Find user by email
      const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) {
        return res.status(500).json({ error: "Failed to list users" });
      }
      
      const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update password
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
        email_confirm: true, // Ensure email is confirmed
      });
      
      if (updateErr) {
        return res.status(400).json({ error: updateErr.message });
      }
      
      // Also ensure driver record exists and is verified
      const { data: driverData, error: driverErr } = await supabaseAdmin
        .from('drivers')
        .upsert({
          id: user.id,
          email,
          full_name: user.user_metadata?.fullName || user.user_metadata?.full_name || 'Test Driver',
          vehicle_type: 'car',
          online_status: 'offline',
          status: 'approved',
        }, { onConflict: 'id' })
        .select()
        .single();
      
      console.log(`[TestDriver] Password reset for ${email}`);
      res.json({ 
        success: true, 
        message: `Password reset for ${email}`,
        userId: user.id,
        driverId: driverData?.driver_code || user.id
      });
    } catch (error: any) {
      console.error('[TestDriver] Reset error:', error);
      res.status(500).json({ error: error.message || "Failed to reset password" });
    }
  }));

  // TEMPORARY: Force verify a driver (for debugging)
  app.post("/api/admin/force-verify-driver/:id", asyncHandler(async (req, res) => {
    if (!enforceAdminAccess(req, res)) return;
    
    const driverId = req.params.id;
    const driver = await storage.updateDriver(driverId, { isVerified: true });
    
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Broadcast verification update to mobile app for real-time sync
    broadcastProfileUpdate(driverId, {
      isVerified: true,
      status: 'approved',
    });
    
    console.log(`[Admin] Force verified driver ${driver.driverCode || driverId}`);
    res.json({ success: true, driver });
  }));

  app.post("/api/admin/backfill-driver-documents", asyncHandler(async (req, res) => {
    if (!enforceAdminAccess(req, res)) return;

    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not available" });

    const results: any[] = [];

    const { data: drivers } = await supabaseAdmin.from('drivers').select('*');
    const { data: applications } = await supabaseAdmin.from('driver_applications').select('*');

    if (!drivers) return res.json({ message: "No drivers found", results: [] });

    for (const driver of drivers) {
      const { count } = await supabaseAdmin.from('driver_documents')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', driver.id);

      const app = applications?.find((a: any) => a.email === driver.email);

      const docMappings = [
        { docType: 'driving_licence_front', url: driver.driving_licence_front_url || app?.driving_licence_front_url },
        { docType: 'driving_licence_back', url: driver.driving_licence_back_url || app?.driving_licence_back_url },
        { docType: 'dbs_certificate', url: driver.dbs_certificate_url || app?.dbs_certificate_url },
        { docType: 'goods_in_transit', url: driver.goods_in_transit_insurance_url || app?.goods_in_transit_insurance_url },
        { docType: 'hire_and_reward', url: driver.hire_reward_insurance_url || app?.hire_and_reward_url },
        { docType: 'profile_picture', url: driver.profile_picture_url || app?.profile_picture_url },
      ];

      let migrated = 0;
      let skipped = 0;

      for (const mapping of docMappings) {
        if (!mapping.url) { skipped++; continue; }

        const { data: existing } = await supabaseAdmin.from('driver_documents')
          .select('id')
          .eq('driver_id', driver.id)
          .eq('doc_type', mapping.docType)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        const fileResult = await copyApplicationFileToDriver(mapping.url, driver.id, supabaseAdmin);
        const finalUrl = fileResult.path || normalizeDocumentUrl(mapping.url) || mapping.url;

        await supabaseAdmin.from('driver_documents').insert({
          driver_id: driver.id,
          doc_type: mapping.docType,
          file_url: finalUrl,
          bucket: fileResult.bucket,
          storage_path: finalUrl,
          status: driver.status === 'approved' ? 'approved' : 'pending',
          uploaded_at: new Date().toISOString(),
        });
        migrated++;
      }

      if (driver.right_to_work_share_code) {
        const { data: existing } = await supabaseAdmin.from('driver_documents')
          .select('id').eq('driver_id', driver.id).eq('doc_type', 'share_code').maybeSingle();
        if (!existing) {
          await supabaseAdmin.from('driver_documents').insert({
            driver_id: driver.id,
            doc_type: 'share_code',
            file_url: `text:${driver.right_to_work_share_code}`,
            status: 'approved',
            uploaded_at: new Date().toISOString(),
          });
          migrated++;
        }
      }

      const BUCKET = 'driver-documents';
      const vehicleLabels = ['front', 'back', 'left', 'right', 'load_space'];
      for (const label of vehicleLabels) {
        const docType = `vehicle_photos_${label}`;
        const { data: existing } = await supabaseAdmin.from('driver_documents')
          .select('id').eq('driver_id', driver.id).eq('doc_type', docType).maybeSingle();
        if (existing) continue;

        try {
          const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(driver.id, { limit: 200 });
          if (files) {
            const match = files.find((f: any) => {
              const base = f.name.replace(/\.[^.]+$/, '').replace(/_\d{10,}$/, '').toLowerCase();
              return base === `vehicle_photos_${label}` || base === `vehicle_photo_${label}` || base.startsWith(`vehicle_photos_${label}_`);
            });
            if (match) {
              await supabaseAdmin.from('driver_documents').insert({
                driver_id: driver.id,
                auth_user_id: driver.id,
                doc_type: docType,
                file_url: `${driver.id}/${match.name}`,
                bucket: BUCKET,
                storage_path: `${driver.id}/${match.name}`,
                file_name: match.name,
                status: driver.status === 'approved' ? 'approved' : 'pending',
                uploaded_at: new Date().toISOString(),
              });
              migrated++;
            }
          }
        } catch {}
      }

      results.push({ driverId: driver.id, email: driver.email, migrated, skipped, existingDocs: count || 0 });
    }

    console.log(`[Admin] Backfill driver documents complete: ${results.length} drivers processed`);
    res.json({ message: "Backfill complete", results });
  }));

  app.post("/api/admin/migrate-local-documents", asyncHandler(async (req, res) => {
    if (!enforceAdminAccess(req, res)) return;

    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not available" });

    const BUCKET = 'driver-documents';
    const BATCH_SIZE = 5;
    const baseUploadsDir = path.join(process.cwd(), 'uploads');
    const documentsDir = path.join(baseUploadsDir, 'documents');
    const podDir = path.join(baseUploadsDir, 'pod');

    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    function getContentType(filePath: string): string {
      const ext = path.extname(filePath).toLowerCase();
      return mimeTypes[ext] || 'application/octet-stream';
    }

    function extractDocType(filename: string): string {
      const baseName = filename.replace(/\.[^.]+$/, '');
      const withoutTimestamp = baseName.replace(/_\d{10,}$/, '');
      return withoutTimestamp;
    }

    function getAllFiles(dir: string): string[] {
      const results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getAllFiles(fullPath));
        } else if (entry.isFile()) {
          results.push(fullPath);
        }
      }
      return results;
    }

    interface FileTask {
      localPath: string;
      storagePath: string;
      driverId: string | null;
      docType: string | null;
      category: string;
    }

    const tasks: FileTask[] = [];

    const documentFiles = getAllFiles(documentsDir);
    for (const filePath of documentFiles) {
      const relativePath = path.relative(documentsDir, filePath);
      const parts = relativePath.split(path.sep);
      const filename = parts[parts.length - 1];

      if (parts.length < 2) continue;

      const folder = parts[0];

      if (folder === 'application-pending') {
        tasks.push({
          localPath: filePath,
          storagePath: `applications/pending/${filename}`,
          driverId: null,
          docType: null,
          category: 'application-pending',
        });
      } else if (folder.startsWith('application-')) {
        const uuid = folder.replace('application-', '');
        tasks.push({
          localPath: filePath,
          storagePath: `applications/${uuid}/${filename}`,
          driverId: null,
          docType: null,
          category: 'application',
        });
      } else if (folder === 'temp' || folder === 'unknown') {
        tasks.push({
          localPath: filePath,
          storagePath: `misc/${folder}/${filename}`,
          driverId: null,
          docType: null,
          category: folder,
        });
      } else {
        const driverId = folder;
        const docType = extractDocType(filename);
        tasks.push({
          localPath: filePath,
          storagePath: `drivers/${driverId}/${docType}/${filename}`,
          driverId,
          docType,
          category: 'driver-document',
        });
      }
    }

    const podFiles = getAllFiles(podDir);
    for (const filePath of podFiles) {
      const relativePath = path.relative(podDir, filePath);
      tasks.push({
        localPath: filePath,
        storagePath: `pod/${relativePath.split(path.sep).join('/')}`,
        driverId: null,
        docType: null,
        category: 'pod',
      });
    }

    let migrated = 0;
    let failed = 0;
    let alreadyExisted = 0;
    const errors: Array<{ file: string; error: string }> = [];

    async function processTask(task: FileTask): Promise<void> {
      try {
        const fileBuffer = fs.readFileSync(task.localPath);
        const contentType = getContentType(task.localPath);

        const { data, error } = await supabaseAdmin!.storage
          .from(BUCKET)
          .upload(task.storagePath, fileBuffer, {
            contentType,
            upsert: true,
          });

        if (error) {
          if (error.message?.includes('already exists')) {
            alreadyExisted++;
            return;
          }
          failed++;
          errors.push({ file: task.storagePath, error: error.message });
          return;
        }

        if (task.driverId && task.docType && task.category === 'driver-document') {
          const matchDocTypes = findDocTypeMatch(path.basename(task.localPath));

          const { data: docRecord } = await supabaseAdmin!
            .from('driver_documents')
            .select('id')
            .eq('driver_id', task.driverId)
            .in('doc_type', matchDocTypes)
            .limit(1)
            .maybeSingle();

          if (docRecord) {
            await supabaseAdmin!
              .from('driver_documents')
              .update({
                file_url: task.storagePath,
                storage_path: task.storagePath,
                bucket: BUCKET,
              })
              .eq('id', docRecord.id);
          }
        }

        migrated++;
      } catch (err: any) {
        failed++;
        errors.push({ file: task.storagePath, error: err.message || String(err) });
      }
    }

    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(processTask));
    }

    console.log(`[Admin] Migrate local documents complete: ${migrated} migrated, ${failed} failed, ${alreadyExisted} already existed, ${tasks.length} total files`);
    res.json({
      message: "Migration complete",
      totalFiles: tasks.length,
      migrated,
      failed,
      alreadyExisted,
      errors: errors.slice(0, 50),
    });
  }));

  // ─── CONTACTS (admin + supervisor) ───────────────────────────────────────
  // Migrate contacts table on first use
  try {
    await getPgPool().query(`
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
    console.log('[MIGRATION] contacts table created/verified successfully');
  } catch (e) {
    console.warn('[MIGRATION] contacts table migration failed:', e);
  }

  app.get('/api/contacts', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const result = await getPgPool().query(
      'SELECT * FROM contacts ORDER BY name ASC'
    );
    res.json(result.rows);
  }));

  app.post('/api/contacts', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { name, phone, email, company_name, notes } = req.body;
    if (!name || !phone || !email) {
      return res.status(400).json({ error: 'name, phone and email are required' });
    }
    const result = await getPgPool().query(
      `INSERT INTO contacts (name, phone, email, company_name, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), phone.trim(), email.trim(), company_name?.trim() || null, notes?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  }));

  app.put('/api/contacts/:id', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, company_name, notes } = req.body;
    if (!name || !phone || !email) {
      return res.status(400).json({ error: 'name, phone and email are required' });
    }
    const result = await getPgPool().query(
      `UPDATE contacts SET name=$1, phone=$2, email=$3, company_name=$4, notes=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name.trim(), phone.trim(), email.trim(), company_name?.trim() || null, notes?.trim() || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  }));

  app.delete('/api/contacts/:id', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { id } = req.params;
    await getPgPool().query('DELETE FROM contacts WHERE id=$1', [id]);
    res.json({ success: true });
  }));

  // Vehicle type migration SQL — returns the SQL to run in Supabase SQL Editor
  app.get('/api/admin/vehicle-migration-sql', asyncHandler(async (req, res) => {
    if (!enforceAdminAccess(req, res)) return;
    const sql = `-- Run this once in your Supabase SQL Editor to enable LWB Van & Luton Van vehicle types
-- Step 1: Update CHECK constraints on all affected tables
ALTER TABLE vehicles          DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;
ALTER TABLE vehicles          DROP CONSTRAINT IF EXISTS vehicles_type_check;
ALTER TABLE drivers           DROP CONSTRAINT IF EXISTS drivers_vehicle_type_check;
ALTER TABLE driver_applications DROP CONSTRAINT IF EXISTS driver_applications_vehicle_type_check;

ALTER TABLE vehicles ADD CONSTRAINT vehicles_type_check
  CHECK (type IN ('motorbike','car','small_van','medium_van','lwb_van','luton_van','large_van','flatbed'));
ALTER TABLE drivers ADD CONSTRAINT drivers_vehicle_type_check
  CHECK (vehicle_type IN ('motorbike','car','small_van','medium_van','lwb_van','luton_van','large_van','flatbed'));
ALTER TABLE driver_applications ADD CONSTRAINT driver_applications_vehicle_type_check
  CHECK (vehicle_type IN ('motorbike','car','small_van','medium_van','lwb_van','luton_van','large_van','flatbed'));

-- Step 2: Insert the new vehicle types into the vehicles table
INSERT INTO vehicles (id, type, name, description, max_weight, base_charge, per_mile_rate, rush_hour_rate)
VALUES
  (gen_random_uuid(), 'lwb_van',   'LWB Van',   'Extra-long deliveries up to 1000kg', 1000, 35.00, 1.60, 1.80),
  (gen_random_uuid(), 'luton_van', 'Luton Van',  'Large volume deliveries up to 1200kg', 1200, 40.00, 1.70, 2.00)
ON CONFLICT (type) DO NOTHING;
`;
    res.type('text/plain').send(sql);
  }));


  // ══════════════════════════════════════════════════════════════════════════
  // API INTEGRATION SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  const {
    authenticateApiClient,
    requireApiPermission,
    generateApiKey,
    hashApiKey,
    getKeyLast4,
    logApiRequest,
    duplicateRequestCheck,
  } = await import('./apiAuth');

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Strip sensitive/internal fields before logging a request payload */
  function sanitisePayload(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const REDACT = ['password', 'api_key', 'apiKey', 'authorization', 'card', 'cvv', 'secret'];
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (REDACT.some(r => k.toLowerCase().includes(r))) out[k] = '[REDACTED]';
      else out[k] = v;
    }
    return out;
  }

  function getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  // ── Neon pool helper for API tables ──────────────────────────────────────

  async function getApiPool() {
    const { Pool } = await import('pg');
    
    if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
      return new Pool({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        port: parseInt(process.env.PGPORT || '5432'),
        max: 3,
        ssl: { rejectUnauthorized: false },
        //@ts-ignore
        lookup: forceIPv4Lookup
      });
    }

    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
      return new Pool({ 
        connectionString: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&sslmode=require' : '?sslmode=require'),
        max: 3, 
        ssl: { rejectUnauthorized: false },
        //@ts-ignore
        lookup: forceIPv4Lookup
      });
    }

    throw new Error('[getApiPool] Database connection details are missing.');
  }

  // ── PUBLIC: Submit API Integration Request form ───────────────────────────

  app.post('/api/integration-requests', asyncHandler(async (req, res) => {
    const {
      companyName, contactName, email, phone, website,
      businessType, platformUsed, monthlyVolume, integrationType, notes,
    } = req.body;

    // Validate required fields
    if (!companyName || !contactName || !email || !integrationType) {
      return res.status(400).json({ error: 'validation_failed', message: 'Company name, contact name, email, and integration type are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: 'validation_failed', message: 'Valid email address required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const pool = await getApiPool();
    try {
      // Duplicate protection: reject if an active request already exists for this email
      const { rows: existing } = await pool.query(
        `SELECT id FROM api_integration_requests WHERE email = $1 AND status IN ('new','contacted','in_progress') LIMIT 1`,
        [normalizedEmail]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          error: 'duplicate_request',
          message: 'An active integration request already exists for this email address. Our team will be in touch with you shortly.',
        });
      }

      // Insert and return the full saved row so email values match DB exactly
      const { rows } = await pool.query(
        `INSERT INTO api_integration_requests
          (company_name, contact_name, email, phone, website, business_type, platform_used, monthly_volume, integration_type, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          String(companyName).slice(0, 200),
          String(contactName).slice(0, 200),
          normalizedEmail.slice(0, 200),
          phone ? String(phone).slice(0, 50) : null,
          website ? String(website).slice(0, 300) : null,
          businessType ? String(businessType).slice(0, 100) : null,
          platformUsed ? String(platformUsed).slice(0, 200) : null,
          monthlyVolume ? String(monthlyVolume).slice(0, 100) : null,
          String(integrationType).slice(0, 500),
          notes ? String(notes).slice(0, 2000) : null,
        ]
      );

      const saved = rows[0];

      // Build and send improved admin notification email (non-fatal)
      try {
        const adminUrl = `${process.env.APP_URL || 'https://runcourier.co.uk'}/admin/api-requests?id=${saved.id}`;
        const submittedAt = new Date(saved.created_at).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
        });

        const integrationTypeLabels: Record<string, string> = {
          quote: 'Quote API', booking: 'Booking API',
          tracking: 'Tracking API', custom: 'Custom Integration',
        };
        const integrationLabel = String(saved.integration_type)
          .split(',')
          .map((t: string) => integrationTypeLabels[t.trim()] || t.trim())
          .join(', ');

        // Safely escape user-supplied values for inline HTML
        const esc = (v: string | null | undefined): string =>
          v ? String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';

        const row = (label: string, value: string | null | undefined): string =>
          value
            ? `<tr>
                <td style="padding:8px 12px 8px 0;color:#666;font-size:14px;width:160px;vertical-align:top;white-space:nowrap;">${label}</td>
                <td style="padding:8px 0;font-size:14px;color:#111;font-weight:500;">${esc(value)}</td>
               </tr>`
            : '';

        const divider = `<tr><td colspan="2" style="padding:2px 0;">
          <hr style="border:none;border-top:1px solid #e8e8e8;margin:6px 0;"></td></tr>`;

        const emailHtml = wrapEmailContent(`
          <h2 style="color:#111;font-size:20px;font-weight:700;margin:0 0 6px 0;">New API Integration Request</h2>
          <p style="color:#555;font-size:14px;margin:0 0 24px 0;">
            A business has submitted an API integration request and is awaiting your review.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tbody>
              ${row('Request ID', `#${saved.id}`)}
              ${row('Status', 'New')}
              ${row('Submitted', submittedAt)}
              ${divider}
              ${row('Company', saved.company_name)}
              ${row('Contact', saved.contact_name)}
              ${row('Email', saved.email)}
              ${saved.phone ? row('Phone', saved.phone) : ''}
              ${saved.website ? row('Website', saved.website) : ''}
              ${divider}
              ${row('Integration Types', integrationLabel)}
              ${saved.monthly_volume ? row('Monthly Volume', saved.monthly_volume) : ''}
              ${saved.business_type ? row('Business Type', saved.business_type) : ''}
              ${saved.platform_used ? row('Platform / System', saved.platform_used) : ''}
              ${saved.notes ? `<tr>
                <td style="padding:8px 12px 8px 0;color:#666;font-size:14px;vertical-align:top;">Notes</td>
                <td style="padding:8px 0;font-size:14px;color:#111;">${esc(saved.notes)}</td>
              </tr>` : ''}
            </tbody>
          </table>

          <div style="text-align:center;margin:28px 0 16px 0;">
            <a href="${adminUrl}"
               style="background-color:#007BFF;color:#ffffff;padding:12px 32px;border-radius:6px;
                      text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
              View Request in Admin
            </a>
          </div>
          <p style="color:#999;font-size:12px;text-align:center;margin:0;">
            <a href="${adminUrl}" style="color:#007BFF;">${adminUrl}</a>
          </p>
        `, 'API Integration Request');

        await sendAdminNotification(
          `New API Integration Request — ${saved.company_name} (#${saved.id})`,
          emailHtml,
        );
      } catch (_emailErr) {
        // Email failure is non-fatal — request is already saved
      }

      res.status(201).json({ success: true, id: saved.id, message: 'Your request has been received. Our team will be in touch shortly.' });
    } finally {
      await pool.end();
    }
  }));

  // ── ADMIN: API Clients CRUD ───────────────────────────────────────────────

  // List all API clients
  app.get('/api/admin/api-clients', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `SELECT id, created_at, company_name, contact_name, email, phone,
                linked_business_user_id, api_key_last4, is_active,
                allow_quote, allow_booking, allow_tracking, allow_cancel, allow_webhooks,
                notes, last_used_at, request_count, updated_at,
                payment_mode, stripe_customer_id, invoice_cycle, account_status, credit_limit
         FROM api_clients ORDER BY created_at DESC`
      );
      res.json(rows);
    } finally {
      await pool.end();
    }
  }));

  // Create new API client + generate key
  app.post('/api/admin/api-clients', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const {
      companyName, contactName, email, phone, linkedBusinessUserId,
      allowQuote, allowBooking, allowTracking, allowCancel, allowWebhooks, notes,
      paymentMode, invoiceCycle, accountStatus, creditLimit,
    } = req.body;

    if (!companyName || !contactName || !email) {
      return res.status(400).json({ error: 'validation_failed', message: 'Company name, contact name, and email are required.' });
    }

    const resolvedPaymentMode = ['instant', 'pay_later'].includes(paymentMode) ? paymentMode : 'instant';
    const resolvedInvoiceCycle = ['weekly', 'monthly'].includes(invoiceCycle) ? invoiceCycle : 'weekly';
    const resolvedAccountStatus = ['active', 'suspended', 'overdue'].includes(accountStatus) ? accountStatus : 'active';
    const resolvedCreditLimit = creditLimit ? parseFloat(creditLimit) : null;

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyLast4 = getKeyLast4(rawKey);

    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `INSERT INTO api_clients
          (company_name, contact_name, email, phone, linked_business_user_id,
           api_key_hash, api_key_last4, is_active,
           allow_quote, allow_booking, allow_tracking, allow_cancel, allow_webhooks, notes,
           payment_mode, invoice_cycle, account_status, credit_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id, created_at, company_name, contact_name, email, phone,
                   api_key_last4, is_active, allow_quote, allow_booking, allow_tracking,
                   allow_cancel, allow_webhooks, notes, request_count,
                   payment_mode, invoice_cycle, account_status, credit_limit`,
        [
          String(companyName).slice(0, 200),
          String(contactName).slice(0, 200),
          String(email).slice(0, 200),
          phone ? String(phone).slice(0, 50) : null,
          linkedBusinessUserId || null,
          keyHash,
          keyLast4,
          allowQuote !== false,
          allowBooking === true,
          allowTracking !== false,
          allowCancel === true,
          allowWebhooks === true,
          notes ? String(notes).slice(0, 2000) : null,
          resolvedPaymentMode,
          resolvedInvoiceCycle,
          resolvedAccountStatus,
          resolvedCreditLimit,
        ]
      );
      // Return the raw key ONCE — never stored in plain text after this point
      res.status(201).json({ ...rows[0], apiKey: rawKey, apiKeyWarning: 'Store this key securely. It will not be shown again.' });
    } finally {
      await pool.end();
    }
  }));

  // Get single API client
  app.get('/api/admin/api-clients/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `SELECT id, created_at, company_name, contact_name, email, phone,
                linked_business_user_id, api_key_last4, is_active,
                allow_quote, allow_booking, allow_tracking, allow_cancel, allow_webhooks,
                notes, last_used_at, request_count, updated_at,
                payment_mode, stripe_customer_id, invoice_cycle, account_status, credit_limit
         FROM api_clients WHERE id = $1`,
        [parseInt(req.params.id)]
      );
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      res.json(rows[0]);
    } finally {
      await pool.end();
    }
  }));

  // Update API client
  app.patch('/api/admin/api-clients/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const {
      companyName, contactName, email, phone, linkedBusinessUserId,
      isActive, allowQuote, allowBooking, allowTracking, allowCancel, allowWebhooks, notes,
      paymentMode, invoiceCycle, accountStatus, creditLimit,
    } = req.body;

    const resolvedPaymentMode = paymentMode !== undefined
      ? (['instant', 'pay_later'].includes(paymentMode) ? paymentMode : null)
      : null;
    const resolvedInvoiceCycle = invoiceCycle !== undefined
      ? (['weekly', 'monthly'].includes(invoiceCycle) ? invoiceCycle : null)
      : null;
    const resolvedAccountStatus = accountStatus !== undefined
      ? (['active', 'suspended', 'overdue'].includes(accountStatus) ? accountStatus : null)
      : null;
    const resolvedCreditLimit = creditLimit !== undefined
      ? (creditLimit !== null && creditLimit !== '' ? parseFloat(creditLimit) : null)
      : undefined;

    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `UPDATE api_clients SET
          company_name = COALESCE($1, company_name),
          contact_name = COALESCE($2, contact_name),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          linked_business_user_id = COALESCE($5, linked_business_user_id),
          is_active = COALESCE($6, is_active),
          allow_quote = COALESCE($7, allow_quote),
          allow_booking = COALESCE($8, allow_booking),
          allow_tracking = COALESCE($9, allow_tracking),
          allow_cancel = COALESCE($10, allow_cancel),
          allow_webhooks = COALESCE($11, allow_webhooks),
          notes = COALESCE($12, notes),
          payment_mode = COALESCE($13, payment_mode),
          invoice_cycle = COALESCE($14, invoice_cycle),
          account_status = COALESCE($15, account_status),
          credit_limit = CASE WHEN $16::text = '__unset__' THEN credit_limit ELSE $17::numeric END,
          updated_at = NOW()
         WHERE id = $18
         RETURNING id, company_name, contact_name, email, phone,
                   api_key_last4, is_active, allow_quote, allow_booking, allow_tracking,
                   allow_cancel, allow_webhooks, notes, request_count, last_used_at,
                   payment_mode, stripe_customer_id, invoice_cycle, account_status, credit_limit`,
        [
          companyName ? String(companyName).slice(0, 200) : null,
          contactName ? String(contactName).slice(0, 200) : null,
          email ? String(email).slice(0, 200) : null,
          phone !== undefined ? (phone ? String(phone).slice(0, 50) : null) : undefined,
          linkedBusinessUserId !== undefined ? (linkedBusinessUserId || null) : undefined,
          isActive !== undefined ? isActive : null,
          allowQuote !== undefined ? allowQuote : null,
          allowBooking !== undefined ? allowBooking : null,
          allowTracking !== undefined ? allowTracking : null,
          allowCancel !== undefined ? allowCancel : null,
          allowWebhooks !== undefined ? allowWebhooks : null,
          notes !== undefined ? (notes ? String(notes).slice(0, 2000) : null) : undefined,
          resolvedPaymentMode,
          resolvedInvoiceCycle,
          resolvedAccountStatus,
          resolvedCreditLimit === undefined ? '__unset__' : 'set',
          resolvedCreditLimit === undefined ? null : resolvedCreditLimit,
          parseInt(req.params.id),
        ]
      );
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      let updatedClient = rows[0];

      // Auto-create Stripe customer if switching to pay_later with no existing stripe_customer_id
      if (updatedClient.payment_mode === 'pay_later' && !updatedClient.stripe_customer_id) {
        console.log(`[PatchAPIClient] payment_mode=pay_later but no stripe_customer_id — auto-creating Stripe customer for client #${updatedClient.id}`);
        try {
          const { getUncachableStripeClient } = await import('./stripeClient');
          const stripe = await getUncachableStripeClient();
          if (stripe) {
            const customer = await stripe.customers.create({
              email: updatedClient.email,
              name:  updatedClient.company_name,
              metadata: { source: 'api_client', api_client_id: String(updatedClient.id) },
            });
            const { rows: updRows } = await pool.query(
              `UPDATE api_clients SET stripe_customer_id = $1 WHERE id = $2
               RETURNING id, company_name, contact_name, email, phone,
                         api_key_last4, is_active, allow_quote, allow_booking, allow_tracking,
                         allow_cancel, allow_webhooks, notes, request_count, last_used_at,
                         payment_mode, stripe_customer_id, invoice_cycle, account_status, credit_limit`,
              [customer.id, updatedClient.id]
            );
            if (updRows[0]) updatedClient = updRows[0];
            console.log(`[PatchAPIClient] Stripe customer created — id=${customer.id}`);
          } else {
            console.warn('[PatchAPIClient] Stripe not configured — skipping customer creation');
          }
        } catch (stripeErr: any) {
          console.error('[PatchAPIClient] Stripe customer creation failed (non-fatal):', stripeErr?.message || stripeErr);
        }
      }

      res.json(updatedClient);
    } finally {
      await pool.end();
    }
  }));

  // Delete API client
  app.delete('/api/admin/api-clients/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      await pool.query(`DELETE FROM api_clients WHERE id = $1`, [parseInt(req.params.id)]);
      res.json({ success: true });
    } finally {
      await pool.end();
    }
  }));

  // Regenerate API key for a client
  app.post('/api/admin/api-clients/:id/regenerate-key', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyLast4 = getKeyLast4(rawKey);

    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `UPDATE api_clients SET api_key_hash = $1, api_key_last4 = $2, updated_at = NOW()
         WHERE id = $3 RETURNING id, company_name`,
        [keyHash, keyLast4, parseInt(req.params.id)]
      );
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      res.json({
        success: true,
        apiKey: rawKey,
        apiKeyLast4: keyLast4,
        apiKeyWarning: 'Store this key securely. It will not be shown again.',
      });
    } finally {
      await pool.end();
    }
  }));

  // ── ADMIN: API Integration Requests ──────────────────────────────────────

  app.get('/api/admin/api-integration-requests', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `SELECT * FROM api_integration_requests ORDER BY created_at DESC`
      );
      res.json(rows);
    } finally {
      await pool.end();
    }
  }));

  app.patch('/api/admin/api-integration-requests/:id/status', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['new', 'contacted', 'in_progress', 'approved', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'validation_failed', message: 'Invalid status value.' });
    }
    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `UPDATE api_integration_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, parseInt(req.params.id)]
      );
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      res.json(rows[0]);
    } finally {
      await pool.end();
    }
  }));

  // Approve request → create API client + send access email atomically
  app.post('/api/admin/api-integration-requests/:id/approve', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const requestId = parseInt(req.params.id);
    console.log(`[ApproveAPI] ── START ── requestId=${requestId}`);

    if (isNaN(requestId)) {
      console.warn('[ApproveAPI] Invalid request ID supplied');
      return res.status(400).json({ error: 'validation_failed', message: 'Invalid request ID.' });
    }

    const pool = await getApiPool();
    console.log('[ApproveAPI] DB pool created');

    try {
      // ── Step 1: Fetch the integration request ────────────────────────────
      console.log('[ApproveAPI] Step 1: Fetching integration request…');
      const { rows: reqRows } = await pool.query(
        `SELECT * FROM api_integration_requests WHERE id = $1`,
        [requestId]
      );
      const integRequest = reqRows[0];
      if (!integRequest) {
        console.warn(`[ApproveAPI] Request #${requestId} not found in DB`);
        return res.status(404).json({ error: 'not_found', message: 'Integration request not found.' });
      }
      console.log(`[ApproveAPI] Found request: company="${integRequest.company_name}", email="${integRequest.email}", status="${integRequest.status}", linked_client=${integRequest.linked_api_client_id ?? 'none'}`);

      // ── Step 2: Guard against duplicate approval ─────────────────────────
      if (integRequest.linked_api_client_id) {
        console.warn(`[ApproveAPI] Already approved — linked_api_client_id=${integRequest.linked_api_client_id}`);
        return res.status(409).json({
          error: 'already_approved',
          message: 'This request has already been approved and an API client already exists.',
          apiClientId: integRequest.linked_api_client_id,
        });
      }

      // ── Step 3: Parse permission flags from integration_type ─────────────
      console.log('[ApproveAPI] Step 3: Parsing permissions from integration_type:', integRequest.integration_type);
      const types = String(integRequest.integration_type || '').split(',').map((t: string) => t.trim().toLowerCase());
      const allowQuote    = types.includes('quote') || types.includes('quote api');
      const allowBooking  = types.includes('booking') || types.includes('booking api');
      const allowTracking = types.includes('tracking') || types.includes('tracking api');
      const allowCancel   = types.includes('cancel') || types.includes('cancel api');
      const allowWebhooks = false;
      console.log(`[ApproveAPI] Permissions → quote=${allowQuote} booking=${allowBooking} tracking=${allowTracking} cancel=${allowCancel}`);

      // ── Step 4: Generate API key ─────────────────────────────────────────
      console.log('[ApproveAPI] Step 4: Generating API key…');
      let rawKey = '';
      let keyHash = '';
      let keyLast4 = '';
      try {
        rawKey   = generateApiKey();
        keyHash  = hashApiKey(rawKey);
        keyLast4 = getKeyLast4(rawKey);
        console.log(`[ApproveAPI] API key generated — last4=****${keyLast4}`);
      } catch (keyErr: any) {
        console.error('[ApproveAPI] Key generation error:', keyErr?.message || keyErr);
        return res.status(500).json({ error: 'key_generation_failed', message: `API key generation failed: ${keyErr?.message || keyErr}` });
      }
      if (!rawKey || !keyHash || !keyLast4) {
        return res.status(500).json({ error: 'key_generation_failed', message: 'API key generation produced an empty result.' });
      }

      // ── Step 5: Resolve payment mode + optionally create Stripe customer ──
      const { paymentMode } = req.body;
      const resolvedPaymentMode = paymentMode === 'pay_later' ? 'pay_later' : 'instant';
      console.log(`[ApproveAPI] Step 5a: payment_mode=${resolvedPaymentMode}`);

      let stripeCustomerId: string | null = null;
      if (resolvedPaymentMode === 'pay_later') {
        console.log('[ApproveAPI] Step 5b: Creating Stripe customer for pay_later client…');
        try {
          const { getUncachableStripeClient } = await import('./stripeClient');
          const stripe = await getUncachableStripeClient();
          if (stripe) {
            const customer = await stripe.customers.create({
              email: String(integRequest.email),
              name:  String(integRequest.company_name),
              metadata: { source: 'api_client', company: String(integRequest.company_name) },
            });
            stripeCustomerId = customer.id;
            console.log(`[ApproveAPI] Stripe customer created — id=${stripeCustomerId}`);
          } else {
            console.warn('[ApproveAPI] Stripe not configured — skipping customer creation');
          }
        } catch (stripeErr: any) {
          console.error('[ApproveAPI] Stripe customer creation failed (non-fatal):', stripeErr?.message || stripeErr);
        }
      }

      // ── Step 5c: Insert api_clients row ──────────────────────────────────
      console.log('[ApproveAPI] Step 5c: Inserting api_clients row…');
      let newClient: any;
      try {
        const { rows: clientRows } = await pool.query(
          `INSERT INTO api_clients
            (company_name, contact_name, email, phone,
             api_key_hash, api_key_last4, is_active,
             allow_quote, allow_booking, allow_tracking, allow_cancel, allow_webhooks,
             payment_mode, stripe_customer_id,
             notes)
           VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id, company_name, contact_name, email, api_key_last4,
                     allow_quote, allow_booking, allow_tracking, allow_cancel, allow_webhooks,
                     payment_mode, stripe_customer_id`,
          [
            String(integRequest.company_name).slice(0, 200),
            String(integRequest.contact_name).slice(0, 200),
            String(integRequest.email).slice(0, 200),
            integRequest.phone ? String(integRequest.phone).slice(0, 50) : null,
            keyHash,
            keyLast4,
            allowQuote,
            allowBooking,
            allowTracking,
            allowCancel,
            allowWebhooks,
            resolvedPaymentMode,
            stripeCustomerId,
            `Auto-created from integration request #${requestId}`,
          ]
        );
        newClient = clientRows[0];
        console.log(`[ApproveAPI] api_clients row created — id=${newClient?.id} payment_mode=${newClient?.payment_mode} stripe_customer_id=${newClient?.stripe_customer_id ?? 'none'}`);
      } catch (dbErr: any) {
        console.error('[ApproveAPI] DB insert into api_clients failed:', dbErr?.message || dbErr);
        return res.status(500).json({ error: 'db_insert_failed', message: `Database insert failed: ${dbErr?.message || dbErr}` });
      }

      if (!newClient) {
        console.error('[ApproveAPI] INSERT returned no rows');
        return res.status(500).json({ error: 'db_insert_failed', message: 'API client insert returned no row.' });
      }

      // ── Step 6: Link client back to request ──────────────────────────────
      console.log(`[ApproveAPI] Step 6: Linking api_clients.id=${newClient.id} → request #${requestId}…`);
      try {
        await pool.query(
          `UPDATE api_integration_requests
           SET status = 'approved', linked_api_client_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [newClient.id, requestId]
        );
        console.log('[ApproveAPI] Request status updated to approved');
      } catch (updateErr: any) {
        console.error('[ApproveAPI] Failed to update request status:', updateErr?.message || updateErr);
        // Non-fatal — client created, continue
      }

      // ── Step 7: Send access email ────────────────────────────────────────
      const permissions: string[] = [];
      if (allowQuote)    permissions.push('quote');
      if (allowBooking)  permissions.push('booking');
      if (allowTracking) permissions.push('tracking');
      if (allowCancel)   permissions.push('cancel');

      console.log('[ApproveAPI] Step 7: Sending API access email to', integRequest.email);
      let emailSent = false;
      let emailError: string | null = null;
      try {
        const { sendApiAccessEmail } = await import('./emailService');
        emailSent = await sendApiAccessEmail({
          toEmail:     String(integRequest.email),
          contactName: String(integRequest.contact_name),
          companyName: String(integRequest.company_name),
          apiKey:      rawKey,
          permissions,
        });
        console.log(`[ApproveAPI] Email result: sent=${emailSent}`);
      } catch (emailErr: any) {
        emailError = emailErr?.message || String(emailErr);
        console.error('[ApproveAPI] Email send threw error:', emailError);
      }

      // ── Step 8: Mark email sent in DB ────────────────────────────────────
      if (emailSent) {
        console.log('[ApproveAPI] Step 8: Marking email sent in DB…');
        try {
          await pool.query(
            `UPDATE api_integration_requests
             SET api_access_email_sent = true, api_access_email_sent_at = NOW()
             WHERE id = $1`,
            [requestId]
          );
          console.log('[ApproveAPI] Email sent flag recorded');
        } catch (flagErr: any) {
          console.error('[ApproveAPI] Failed to record email_sent flag:', flagErr?.message || flagErr);
        }
      }

      // ── Done ─────────────────────────────────────────────────────────────
      console.log(`[ApproveAPI] ── COMPLETE ── clientId=${newClient.id} emailSent=${emailSent}`);
      res.json({
        success:   true,
        apiClient: newClient,
        emailSent,
        message: emailSent
          ? 'API client created and access email sent successfully.'
          : `API client created, but email sending failed${emailError ? ': ' + emailError : ''}. Please resend manually.`,
      });
    } catch (outerErr: any) {
      const msg = outerErr?.message || String(outerErr);
      console.error('[ApproveAPI] UNHANDLED ERROR:', msg, outerErr);
      return res.status(500).json({ error: 'approval_failed', message: `Approval failed: ${msg}` });
    } finally {
      await pool.end().catch(() => {});
    }
  }));

  // Regenerate key for API client and send new access email
  app.post('/api/admin/api-clients/:id/regenerate-key-and-notify', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: 'validation_failed', message: 'Invalid client ID.' });

    const rawKey  = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyLast4 = getKeyLast4(rawKey);

    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `UPDATE api_clients SET api_key_hash = $1, api_key_last4 = $2, updated_at = NOW()
         WHERE id = $3 RETURNING id, company_name, contact_name, email,
                                  allow_quote, allow_booking, allow_tracking, allow_cancel`,
        [keyHash, keyLast4, clientId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      const client = rows[0];

      const permissions: string[] = [];
      if (client.allow_quote)    permissions.push('quote');
      if (client.allow_booking)  permissions.push('booking');
      if (client.allow_tracking) permissions.push('tracking');
      if (client.allow_cancel)   permissions.push('cancel');

      let emailSent = false;
      try {
        const { sendApiAccessEmail } = await import('./emailService');
        emailSent = await sendApiAccessEmail({
          toEmail:     client.email,
          contactName: client.contact_name,
          companyName: client.company_name,
          apiKey:      rawKey,
          permissions,
        });
      } catch (emailErr) {
        console.error('[Regenerate Key] Email send error:', emailErr);
      }

      res.json({
        success: true,
        apiKeyLast4: keyLast4,
        emailSent,
        message: emailSent
          ? 'API key regenerated and new access email sent.'
          : 'API key regenerated but email sending failed.',
      });
    } finally {
      await pool.end();
    }
  }));

  app.delete('/api/admin/api-integration-requests/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      await pool.query(`DELETE FROM api_integration_requests WHERE id = $1`, [parseInt(req.params.id)]);
      res.json({ success: true });
    } finally {
      await pool.end();
    }
  }));

  // ── ADMIN: API Logs ───────────────────────────────────────────────────────

  app.get('/api/admin/api-logs', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { clientId, endpoint, status, dateFrom, dateTo, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(String(limitParam || '200')), 500);
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (clientId) { conditions.push(`api_client_id = $${idx++}`); values.push(parseInt(String(clientId))); }
    if (endpoint) { conditions.push(`endpoint ILIKE $${idx++}`); values.push(`%${endpoint}%`); }
    if (status === 'success') { conditions.push(`success = true`); }
    else if (status === 'failure') { conditions.push(`success = false`); }
    if (dateFrom) { conditions.push(`created_at >= $${idx++}`); values.push(dateFrom); }
    if (dateTo) { conditions.push(`created_at <= $${idx++}`); values.push(dateTo); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit);

    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `SELECT id, created_at, api_client_id, client_name, endpoint, method,
                status_code, success, error_message, booking_reference, ip_address
         FROM api_logs ${where} ORDER BY created_at DESC LIMIT $${idx}`,
        values
      );
      res.json(rows);
    } finally {
      await pool.end();
    }
  }));

  app.delete('/api/admin/api-logs', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      // Keep last 30 days, delete older
      await pool.query(`DELETE FROM api_logs WHERE created_at < NOW() - INTERVAL '30 days'`);
      res.json({ success: true });
    } finally {
      await pool.end();
    }
  }));

  // ── ADMIN: API Invoices ───────────────────────────────────────────────────

  // List all API invoices
  app.get('/api/admin/api-invoices', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { status, clientId, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(String(limitParam || '200')), 500);
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status && status !== 'all') { conditions.push(`status = $${idx++}`); values.push(status); }
    if (clientId) { conditions.push(`api_client_id = $${idx++}`); values.push(parseInt(String(clientId))); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit);

    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `SELECT id, invoice_number, api_client_id, company_name, billing_email,
                period_start, period_end, total_amount, job_count, status,
                created_at, sent_at, paid_at, notes
         FROM api_invoices ${where} ORDER BY created_at DESC LIMIT $${idx}`,
        values
      );
      res.json(rows);
    } finally {
      await pool.end();
    }
  }));

  // Get single invoice with its line items
  app.get('/api/admin/api-invoices/:id', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      const { rows: invRows } = await pool.query(
        `SELECT id, invoice_number, api_client_id, company_name, billing_email,
                period_start, period_end, total_amount, job_count, status,
                created_at, sent_at, paid_at, notes
         FROM api_invoices WHERE id = $1`,
        [parseInt(req.params.id)]
      );
      if (!invRows[0]) return res.status(404).json({ error: 'not_found' });

      const { rows: items } = await pool.query(
        `SELECT id, job_id, tracking_number, job_number, pickup_address, delivery_address,
                vehicle_type, scheduled_date, amount, created_at
         FROM api_invoice_items WHERE invoice_id = $1 ORDER BY id`,
        [parseInt(req.params.id)]
      );

      res.json({ ...invRows[0], items });
    } finally {
      await pool.end();
    }
  }));

  // Mark invoice as paid
  app.patch('/api/admin/api-invoices/:id/mark-paid', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const pool = await getApiPool();
    try {
      const { rows } = await pool.query(
        `UPDATE api_invoices SET status = 'paid', paid_at = NOW()
         WHERE id = $1 RETURNING id, invoice_number, status, paid_at`,
        [parseInt(req.params.id)]
      );
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      res.json({ success: true, invoice: rows[0] });
    } finally {
      await pool.end();
    }
  }));

  // Resend invoice email
  app.post('/api/admin/api-invoices/:id/resend', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { resendApiInvoice } = await import('./apiInvoicing');
    try {
      await resendApiInvoice(parseInt(req.params.id));
      res.json({ success: true, message: 'Invoice email resent successfully.' });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Failed to resend invoice.' });
    }
  }));

  // Manually trigger the invoice run (for testing / ad-hoc)
  app.post('/api/admin/api-invoices/run-now', requireAdminAccessStrict, asyncHandler(async (req, res) => {
    const { runWeeklyApiInvoicingJob } = await import('./apiInvoicing');
    try {
      const result = await runWeeklyApiInvoicingJob(true);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Invoice run failed.' });
    }
  }));

  // ── HEALTH CHECK ─────────────────────────────────────────────────────────

  app.get('/api/health', asyncHandler(async (req, res) => {
    res.json({
      success: true,
      status: 'operational',
      service: 'Run Courier API',
      version: 'v1',
      timestamp: new Date().toISOString(),
    });
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // EXTERNAL PARTNER API — v1 (requires valid API key)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/v1/health — connection test (no auth required)
  app.get('/api/v1/health', asyncHandler(async (req, res) => {
    res.json({ success: true, status: 'operational', service: 'Run Courier Partner API', version: 'v1' });
  }));

  // GET /api/v1/pricing — return vehicle types and base pricing structure
  app.get('/api/v1/pricing', authenticateApiClient, requireApiPermission('quote'), asyncHandler(async (req, res) => {
    const client = req.apiClient!;
    const ip = getClientIp(req);

    const vehicles = await storage.getVehicles();
    const result = vehicles.map(v => ({
      vehicleType: (v as any).type || (v as any).vehicleType,
      name: (v as any).name,
      maxWeightKg: (v as any).maxWeight,
      basePriceGbp: parseFloat((v as any).baseCharge),
      perMileRateGbp: parseFloat((v as any).perMileRate),
    }));

    await logApiRequest({
      apiClientId: client.id, clientName: client.companyName,
      endpoint: '/api/v1/pricing', method: 'GET',
      statusCode: 200, success: true, ipAddress: ip,
    });
    res.json({ success: true, vehicles: result });
  }));

  // POST /api/v1/quote — get a delivery quote using existing pricing engine
  app.post('/api/v1/quote', authenticateApiClient, requireApiPermission('quote'), asyncHandler(async (req, res) => {
    const client = req.apiClient!;
    const ip = getClientIp(req);
    const safePayload = sanitisePayload(req.body);

    const {
      pickupPostcode, deliveryPostcode, vehicleType, weight,
      pickupDate, pickupTime, isMultiDrop, multiDropStops, isReturnTrip,
    } = req.body;

    // Validate required fields
    if (!pickupPostcode || !deliveryPostcode || !vehicleType || !pickupDate || !pickupTime) {
      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: '/api/v1/quote', method: 'POST',
        requestPayloadSafe: safePayload, statusCode: 400, success: false,
        errorMessage: 'validation_failed: missing required fields', ipAddress: ip,
      });
      return res.status(400).json({
        error: 'validation_failed',
        message: 'Required fields: pickupPostcode, deliveryPostcode, vehicleType, pickupDate, pickupTime',
      });
    }

    const validVehicles = ['motorbike', 'car', 'small_van', 'medium_van', 'lwb_van', 'luton_van'];
    if (!validVehicles.includes(vehicleType)) {
      return res.status(400).json({ error: 'validation_failed', message: `vehicleType must be one of: ${validVehicles.join(', ')}` });
    }

    try {
      // Use existing quote calculator (same as website)
      const quoteInput = {
        pickupPostcode: String(pickupPostcode).toUpperCase().trim(),
        deliveryPostcode: String(deliveryPostcode).toUpperCase().trim(),
        vehicleType,
        weight: Math.max(0, parseFloat(weight) || 0),
        pickupDate: String(pickupDate),
        pickupTime: String(pickupTime),
        isMultiDrop: !!isMultiDrop,
        multiDropStops: Array.isArray(multiDropStops) ? multiDropStops : [],
        isReturnTrip: !!isReturnTrip,
        returnToSameLocation: true,
      };

      const quote = await storage.calculateQuote(quoteInput);
      const quoteRef = `QT-${Date.now().toString(36).toUpperCase()}`;

      const result = {
        success: true,
        quoteReference: quoteRef,
        vehicleType,
        totalPriceGbp: quote.total,
        breakdown: {
          baseCharge: quote.baseCharge,
          distanceCharge: quote.distanceCharge,
          weightSurcharge: quote.weightSurcharge,
          isRushHour: quote.isRushHour,
        },
        validFor: '30 minutes',
        message: 'Quote generated successfully.',
      };

      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: '/api/v1/quote', method: 'POST',
        requestPayloadSafe: safePayload,
        responsePayloadSafe: { success: true, totalPriceGbp: quote.total },
        statusCode: 200, success: true, ipAddress: ip,
      });
      res.json(result);
    } catch (err: any) {
      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: '/api/v1/quote', method: 'POST',
        requestPayloadSafe: safePayload, statusCode: 500, success: false,
        errorMessage: err?.message || 'internal_error', ipAddress: ip,
      });
      res.status(500).json({ error: 'internal_error', message: 'Failed to calculate quote. Please try again.' });
    }
  }));

  // POST /api/v1/book-job — create a booking
  app.post('/api/v1/book-job', authenticateApiClient, requireApiPermission('booking'), asyncHandler(async (req, res) => {
    const client = req.apiClient!;
    const ip = getClientIp(req);
    const safePayload = sanitisePayload(req.body);

    // Duplicate request prevention via Idempotency-Key header
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (idempotencyKey && duplicateRequestCheck(idempotencyKey)) {
      return res.status(409).json({ error: 'duplicate_request', message: 'This request has already been processed. Check Idempotency-Key.' });
    }

    const {
      pickupAddress, pickupPostcode, pickupContactName, pickupContactPhone,
      deliveryAddress, deliveryPostcode, recipientName, recipientPhone,
      vehicleType, weight, specialInstructions,
      pickupDate, pickupTime, isMultiDrop, isReturnTrip,
    } = req.body;

    // Validate required fields
    const missing = [];
    if (!pickupAddress) missing.push('pickupAddress');
    if (!pickupPostcode) missing.push('pickupPostcode');
    if (!deliveryAddress) missing.push('deliveryAddress');
    if (!deliveryPostcode) missing.push('deliveryPostcode');
    if (!vehicleType) missing.push('vehicleType');
    if (!pickupDate) missing.push('pickupDate');
    if (!pickupTime) missing.push('pickupTime');

    if (missing.length) {
      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: '/api/v1/book-job', method: 'POST',
        requestPayloadSafe: safePayload, statusCode: 400, success: false,
        errorMessage: `validation_failed: missing ${missing.join(', ')}`, ipAddress: ip,
      });
      return res.status(400).json({ error: 'validation_failed', message: `Missing required fields: ${missing.join(', ')}` });
    }

    const validVehicles = ['motorbike', 'car', 'small_van', 'medium_van', 'lwb_van', 'luton_van'];
    if (!validVehicles.includes(vehicleType)) {
      return res.status(400).json({ error: 'validation_failed', message: `vehicleType must be one of: ${validVehicles.join(', ')}` });
    }

    try {
      // Calculate price using existing engine
      const quoteInput = {
        pickupPostcode: String(pickupPostcode).toUpperCase().trim(),
        deliveryPostcode: String(deliveryPostcode).toUpperCase().trim(),
        vehicleType,
        weight: Math.max(0, parseFloat(weight) || 0),
        pickupDate: String(pickupDate),
        pickupTime: String(pickupTime),
        isMultiDrop: !!isMultiDrop,
        multiDropStops: [],
        isReturnTrip: !!isReturnTrip,
        returnToSameLocation: true,
      };
      const quote = await storage.calculateQuote(quoteInput);

      // Generate tracking number using existing generator
      const trackingNumber = await (storage as any).generateTrackingNumber?.() ||
        `RC${new Date().getFullYear()}${String(Date.now()).slice(-6)}`;

      // Determine payment behaviour from the API client's payment mode
      const isPayLater = client.paymentMode === 'pay_later';

      // Build job data reusing existing structure
      const jobData: any = {
        trackingNumber,
        status: isPayLater ? 'pending' : 'pending',        // both start pending, admin confirms
        pickupAddress: String(pickupAddress).slice(0, 500),
        pickupPostcode: String(pickupPostcode).toUpperCase().trim(),
        pickupContactName: pickupContactName ? String(pickupContactName).slice(0, 100) : client.companyName,
        pickupContactPhone: pickupContactPhone ? String(pickupContactPhone).slice(0, 50) : client.phone || '',
        deliveryAddress: String(deliveryAddress).slice(0, 500),
        deliveryPostcode: String(deliveryPostcode).toUpperCase().trim(),
        recipientName: recipientName ? String(recipientName).slice(0, 100) : '',
        recipientPhone: recipientPhone ? String(recipientPhone).slice(0, 50) : '',
        vehicleType,
        weight: parseFloat(weight) || 0,
        specialInstructions: specialInstructions ? String(specialInstructions).slice(0, 1000) : null,
        scheduledPickupTime: `${pickupDate}T${pickupTime}`,
        isMultiDrop: !!isMultiDrop,
        isReturnTrip: !!isReturnTrip,
        totalPrice: quote.total,
        basePrice: quote.baseCharge,
        distancePrice: quote.distanceCharge,
        weightSurcharge: quote.weightSurcharge,
        paymentMethod: isPayLater ? 'api_invoice' : 'api',
        paymentStatus: isPayLater ? 'pay_later' : 'pending',
        createdBy: `API: ${client.companyName}`,
        apiClientId: client.id,
      };

      const created = await storage.createJob(jobData);

      const trackingUrl = `${process.env.APP_URL || 'https://runcourier.co.uk'}/track/${trackingNumber}`;

      const responsePayload = {
        success: true,
        bookingReference: trackingNumber,
        jobId: created?.id,
        status: 'pending',
        paymentMode: isPayLater ? 'pay_later' : 'instant',
        totalPriceGbp: quote.total,
        trackingUrl,
        message: isPayLater
          ? 'Booking created and added to your invoice account. You will be invoiced on your regular billing cycle.'
          : 'Booking created successfully. Our team will process your request.',
      };

      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: '/api/v1/book-job', method: 'POST',
        requestPayloadSafe: safePayload,
        responsePayloadSafe: { success: true, trackingNumber, paymentMode: responsePayload.paymentMode },
        statusCode: 201, success: true,
        bookingReference: trackingNumber, ipAddress: ip,
      });

      res.status(201).json(responsePayload);
    } catch (err: any) {
      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: '/api/v1/book-job', method: 'POST',
        requestPayloadSafe: safePayload, statusCode: 500, success: false,
        errorMessage: err?.message || 'internal_error', ipAddress: ip,
      });
      res.status(500).json({ error: 'internal_error', message: 'Failed to create booking. Please try again or contact support.' });
    }
  }));

  // GET /api/v1/track/:reference — get booking status
  app.get('/api/v1/track/:reference', authenticateApiClient, requireApiPermission('tracking'), asyncHandler(async (req, res) => {
    const client = req.apiClient!;
    const ip = getClientIp(req);
    const reference = req.params.reference?.toUpperCase().trim();

    if (!reference) {
      return res.status(400).json({ error: 'validation_failed', message: 'Booking reference is required.' });
    }

    try {
      // Use existing tracking logic (Supabase)
      const { supabaseAdmin } = await import('./supabaseAdmin');
      const { data: job, error } = await supabaseAdmin
        .from('jobs')
        .select('tracking_number, status, created_at, scheduled_pickup_time, pickup_address, pickup_postcode, delivery_address, delivery_postcode, vehicle_type, driver_id, job_number')
        .eq('tracking_number', reference)
        .single();

      if (error || !job) {
        await logApiRequest({
          apiClientId: client.id, clientName: client.companyName,
          endpoint: `/api/v1/track/${reference}`, method: 'GET',
          statusCode: 404, success: false, errorMessage: 'booking_not_found', ipAddress: ip,
        });
        return res.status(404).json({ error: 'booking_not_found', message: `No booking found with reference: ${reference}` });
      }

      const isDelivered = job.status === 'delivered';
      const result = {
        success: true,
        bookingReference: job.tracking_number,
        jobNumber: (job as any).job_number || null,
        status: job.status,
        statusLabel: job.status?.replace(/_/g, ' ') || job.status,
        pickupAddress: job.pickup_address,
        pickupPostcode: (job as any).pickup_postcode || null,
        deliveryAddress: job.delivery_address,
        deliveryPostcode: (job as any).delivery_postcode || null,
        vehicleType: (job as any).vehicle_type || null,
        scheduledPickupTime: job.scheduled_pickup_time || null,
        driverAssigned: !!job.driver_id,
        delivered: isDelivered,
        proofOfDeliveryAvailable: false,
        trackingUrl: `${process.env.APP_URL || 'https://runcourier.co.uk'}/track/${reference}`,
        lastUpdated: new Date().toISOString(),
      };

      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: `/api/v1/track/${reference}`, method: 'GET',
        responsePayloadSafe: { status: job.status },
        statusCode: 200, success: true,
        bookingReference: reference, ipAddress: ip,
      });

      res.json(result);
    } catch (err: any) {
      await logApiRequest({
        apiClientId: client.id, clientName: client.companyName,
        endpoint: `/api/v1/track/${reference}`, method: 'GET',
        statusCode: 500, success: false, errorMessage: err?.message, ipAddress: ip,
      });
      res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve booking status.' });
    }
  }));

  // POST /api/v1/cancel-job — future endpoint (returns 501)
  app.post('/api/v1/cancel-job', authenticateApiClient, requireApiPermission('cancel'), asyncHandler(async (req, res) => {
    res.status(501).json({ error: 'not_implemented', message: 'Job cancellation via API is coming soon. Please contact Run Courier directly.' });
  }));

  // ── Notifications Module (Admin + Supervisor) ──────────────────────────────

  // GET /api/notifications/drivers — list active drivers for dropdown
  app.get('/api/notifications/drivers', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { supabaseAdmin: sb } = await import('./supabaseAdmin');
    if (!sb) return res.json([]);
    const { data, error } = await sb
      .from('drivers')
      .select('id, full_name, email, vehicle_type, status, driver_code, phone')
      .eq('is_active', true)
      .in('status', ['approved', 'active'])
      .order('full_name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  }));

  // GET /api/notifications/customers — list customers for dropdown
  app.get('/api/notifications/customers', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { supabaseAdmin: sb } = await import('./supabaseAdmin');
    if (!sb) return res.json([]);
    const { data, error } = await sb
      .from('users')
      .select('id, full_name, email, role, phone')
      .in('role', ['customer', 'business_customer'])
      .order('full_name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  }));

  // POST /api/admin/notifications — send notification OR sms (delivery_method required)
  app.post('/api/admin/notifications', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { supabaseAdmin: sb } = await import('./supabaseAdmin');
    const { randomUUID } = await import('crypto');
    const { Pool } = await import('pg');
    const connectionString = process.env.DATABASE_URL;
    let pool;
    if (connectionString && connectionString.startsWith('postgresql://')) {
      let connStr = connectionString;
      if (!connStr.includes('sslmode=')) {
        connStr += connStr.includes('?') ? '&sslmode=require' : '?sslmode=require';
      }
      pool = new Pool({ connectionString: connStr, max: 3, ssl: { rejectUnauthorized: false } });
    } else {
      throw new Error('[Notifications] DATABASE_URL is missing. Cannot connect to Supabase.');
    }

    try {
      const { delivery_method, target_type, target_user_id, notification_type, title, message } = req.body;

      // Validate required fields
      if (!delivery_method || !['notification', 'sms'].includes(delivery_method)) {
        return res.status(400).json({ error: 'delivery_method must be "notification" or "sms"' });
      }
      if (!target_type || !title || !message) {
        return res.status(400).json({ error: 'target_type, title and message are required' });
      }
      if (delivery_method === 'notification' && !notification_type) {
        return res.status(400).json({ error: 'notification_type is required when sending a notification' });
      }
      if ((target_type === 'specific_driver' || target_type === 'specific_customer') && !target_user_id) {
        return res.status(400).json({ error: 'target_user_id is required for specific recipient' });
      }

      // Resolve sender info from JWT
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      let senderName = 'Admin';
      let senderRole = 'admin';
      let senderId = '';
      try {
        const { verifyAccessToken } = await import('./supabaseAdmin');
        const user = await verifyAccessToken(token);
        if (user) {
          senderId = user.id;
          senderRole = (user as any).role || 'admin';
          if (sb) {
            const { data: adminData } = await sb.from('users').select('full_name').eq('id', user.id).maybeSingle();
            if (adminData?.full_name) senderName = adminData.full_name;
            else {
              const { data: supData } = await sb.from('supervisors').select('full_name').eq('auth_user_id', user.id).maybeSingle();
              if (supData?.full_name) senderName = supData.full_name;
            }
          }
        }
      } catch (_) {}

      // Resolve recipients (always needed for both paths)
      type Recipient = { id: string; name: string; email: string; role: string; phone?: string };
      let recipients: Recipient[] = [];
      let targetUserName: string | null = null;

      if (sb) {
        if (target_type === 'all_drivers') {
          const { data } = await sb.from('drivers').select('id, full_name, email, phone').eq('is_active', true).in('status', ['approved', 'active']);
          recipients = (data || []).map(d => ({ id: d.id, name: d.full_name || '', email: d.email || '', role: 'driver', phone: d.phone || '' }));
        } else if (target_type === 'specific_driver') {
          const { data } = await sb.from('drivers').select('id, full_name, email, phone').eq('id', target_user_id).maybeSingle();
          if (data) { targetUserName = data.full_name || ''; recipients = [{ id: data.id, name: data.full_name || '', email: data.email || '', role: 'driver', phone: data.phone || '' }]; }
        } else if (target_type === 'all_customers') {
          const { data } = await sb.from('users').select('id, full_name, email, phone').in('role', ['customer', 'business_customer']);
          recipients = (data || []).map(u => ({ id: u.id, name: u.full_name || '', email: u.email || '', role: 'customer', phone: u.phone || '' }));
        } else if (target_type === 'specific_customer') {
          const { data } = await sb.from('users').select('id, full_name, email, phone').eq('id', target_user_id).maybeSingle();
          if (data) { targetUserName = data.full_name || ''; recipients = [{ id: data.id, name: data.full_name || '', email: data.email || '', role: 'customer', phone: data.phone || '' }]; }
        }
      }

      // ── SMS path ────────────────────────────────────────────────────────────
      if (delivery_method === 'sms') {
        let smsSentCount = 0;
        let smsFailCount = 0;
        try {
          const { sendSMS } = await import('./twilioService');
          const smsBody = `Run Courier: ${title}\n${message}`;
          const eligible = recipients.filter(r => r.phone && r.phone.trim().length > 7);
          const results = await Promise.allSettled(eligible.map(r => sendSMS(r.phone!, smsBody)));
          smsSentCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
          smsFailCount = eligible.length - smsSentCount;
          console.log(`[Notifications] SMS-only: ${smsSentCount} sent, ${smsFailCount} failed`);
        } catch (smsErr: any) {
          console.warn('[Notifications] SMS error:', smsErr?.message);
          return res.status(500).json({ error: `SMS failed: ${smsErr?.message}` });
        }
        return res.json({ success: true, delivery_method: 'sms', recipientCount: recipients.length, smsSentCount, smsFailCount });
      }

      // ── Notification path ───────────────────────────────────────────────────
      // Generate explicit UUID because old notifications.id has no DB default
      const notifId = randomUUID();
      console.log(`[Notifications] Inserting notification id=${notifId} target=${target_type} type=${notification_type}`);
      const notifResult = await pool.query(
        `INSERT INTO notifications (id, user_id, sender_id, sender_name, sender_role, target_type, target_user_id, target_user_name, notification_type, title, message, status, sms_sent, sms_sent_count, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'sent',false,0,NOW()) RETURNING *`,
        [notifId, senderId || notifId, senderId, senderName, senderRole, target_type, target_user_id || null, targetUserName, notification_type, title, message]
      );
      const notification = notifResult.rows[0];
      console.log(`[Notifications] Saved notification id=${notification.id}`);

      // Insert recipient rows
      if (recipients.length > 0) {
        const values = recipients.map((_, i) => `($1,$${i*4+2},$${i*4+3},$${i*4+4},$${i*4+5},false,NOW(),NOW())`).join(',');
        const params: any[] = [notification.id];
        recipients.forEach(r => { params.push(r.id, r.name, r.email, r.role); });
        await pool.query(
          `INSERT INTO notification_recipients (notification_id, recipient_user_id, recipient_name, recipient_email, recipient_role, is_read, delivered_at, created_at) VALUES ${values}`,
          params
        );
        console.log(`[Notifications] Inserted ${recipients.length} recipient rows`);
      }

      // ── Expo push notifications to drivers ───────────────────────────────────
      // Drivers have registered Expo push tokens; customers do not.
      let pushSentCount = 0;
      let pushNoDeviceCount = 0;
      const isDriverTarget = target_type === 'all_drivers' || target_type === 'specific_driver';
      if (isDriverTarget) {
        try {
          const { sendCustomNotificationToDrivers } = await import('./pushNotifications');
          // Map notification_type to a push title prefix
          const typePrefix = notification_type === 'urgent' ? '[URGENT] ' : notification_type === 'alert' ? '[ALERT] ' : '';
          const pushTitle = `${typePrefix}${title}`;
          let driverIds: string[] | 'all';
          if (target_type === 'all_drivers') {
            driverIds = 'all';
          } else {
            // specific_driver — target_user_id is the driver's row id
            driverIds = target_user_id ? [target_user_id] : [];
          }
          if (driverIds === 'all' || (Array.isArray(driverIds) && driverIds.length > 0)) {
            const pushResult = await sendCustomNotificationToDrivers(driverIds, pushTitle, message);
            pushSentCount = pushResult.sentCount;
            pushNoDeviceCount = pushResult.noDeviceCount;
            console.log(`[Notifications] Push: ${pushSentCount} sent, ${pushNoDeviceCount} no device`);
          }
        } catch (pushErr: any) {
          // Push delivery failure is non-fatal — DB save already succeeded
          console.warn(`[Notifications] Push delivery error (non-fatal): ${pushErr?.message}`);
        }
      }

      return res.json({
        success: true,
        delivery_method: 'notification',
        notification,
        recipientCount: recipients.length,
        pushSentCount,
        pushNoDeviceCount,
      });
    } finally {
      await pool.end();
    }
  }));

  // GET /api/admin/notifications — notification log with filters
  app.get('/api/admin/notifications', requireAdminOrSupervisorStrict, asyncHandler(async (req, res) => {
    const { Pool } = await import('pg');
    const connectionString = process.env.DATABASE_URL;
    let pool;
    if (connectionString && connectionString.startsWith('postgresql://')) {
      let connStr = connectionString;
      if (!connStr.includes('sslmode=')) {
        connStr += connStr.includes('?') ? '&sslmode=require' : '?sslmode=require';
      }
      pool = new Pool({ connectionString: connStr, max: 3, ssl: { rejectUnauthorized: false } });
    } else {
      throw new Error('[Notifications List] DATABASE_URL is missing. Cannot connect to Supabase.');
    }
    try {
      const { from, to, target_type, notification_type, sender_role, search, page = '1', limit: lim = '25' } = req.query as Record<string, string>;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (from) { conditions.push(`n.created_at >= $${idx++}`); params.push(from); }
      if (to) { conditions.push(`n.created_at <= $${idx++}`); params.push(to + 'T23:59:59Z'); }
      if (target_type) { conditions.push(`n.target_type = $${idx++}`); params.push(target_type); }
      if (notification_type) { conditions.push(`n.notification_type = $${idx++}`); params.push(notification_type); }
      if (sender_role) { conditions.push(`n.sender_role = $${idx++}`); params.push(sender_role); }
      if (search) {
        conditions.push(`(n.title ILIKE $${idx} OR n.message ILIKE $${idx} OR n.target_user_name ILIKE $${idx} OR n.sender_name ILIKE $${idx})`);
        params.push(`%${search}%`); idx++;
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(lim)));
      const offset = (pageNum - 1) * limitNum;

      const countResult = await pool.query(`SELECT COUNT(*) FROM notifications n ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      params.push(limitNum, offset);
      const rows = await pool.query(
        `SELECT n.*, 
          (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id) as recipient_count,
          (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id AND nr.is_read = true) as read_count
         FROM notifications n ${where}
         ORDER BY n.created_at DESC
         LIMIT $${idx} OFFSET $${idx+1}`,
        params
      );

      res.json({ notifications: rows.rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
    } finally {
      await pool.end();
    }
  }));

  return httpServer;
}
