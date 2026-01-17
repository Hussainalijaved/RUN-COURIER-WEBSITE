import type { Express, Request, Response, NextFunction } from "express";
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
import { sendNewJobNotification, sendDriverApplicationNotification, sendDocumentUploadNotification, sendPaymentNotification, sendContactFormSubmission, sendPasswordResetEmail, sendWelcomeEmail, sendNewRegistrationNotification, sendCustomerBookingConfirmation, sendPaymentLinkEmail, sendPaymentConfirmationEmail, sendPaymentLinkFailureNotification, sendBusinessQuoteEmail } from "./emailService";
import { sendBookingConfirmationSMS, sendPickupNotificationSMS, sendDeliveredSMS, sendStatusUpdateSMS, sendDriverJobAssignmentSMS } from "./twilioService";
import { createHash, randomBytes } from "crypto";
import { broadcastJobUpdate, broadcastJobCreated, broadcastJobAssigned, broadcastDocumentPending, broadcastJobWithdrawn } from "./realtime";
import { geocodeAddress } from "./geocoding";
import { sendJobOfferNotification } from "./pushNotifications";
import { isAdminByEmail, supabaseAdmin, verifyAccessToken } from "./supabaseAdmin";

/**
 * Middleware to verify admin access using email-based recognition
 * Checks the Authorization header token and verifies email is in admins table
 * STRICT MODE: Rejects requests without valid admin credentials
 * 
 * SECURITY: Admin access is EXCLUSIVELY based on email in admins table
 * No JWT role fallback - this prevents bypass via stale/incorrect role claims
 */
async function requireAdminAccessStrict(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    
    // Verify token with Supabase - MUST succeed for admin access
    // No fallback to JWT payload decoding for admin routes
    if (!supabaseAdmin) {
      console.error('[Admin Access] Supabase admin client not initialized');
      res.status(500).json({ error: 'Authentication service unavailable', code: 'AUTH_SERVICE_ERROR' });
      return;
    }
    
    const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !authUser) {
      console.log('[Admin Access] Token verification failed:', error?.message);
      res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      return;
    }

    // AUTHORITATIVE CHECK: email must be in admins table
    // This is the SINGLE SOURCE OF TRUTH for admin access per the admin identity model
    const emailIsAdmin = await isAdminByEmail(authUser.email || '');
    
    if (!emailIsAdmin) {
      console.log(`[Admin Access] Denied for: ${authUser.email} (not in admins table)`);
      res.status(403).json({ error: 'Admin access required', code: 'NOT_ADMIN' });
      return;
    }
    
    // Admin verified via email in admins table
    console.log(`[Admin Access] Granted for: ${authUser.email} (verified via admins table)`);
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
    
    // Only use Supabase auth verification for admin status
    if (!supabaseAdmin) {
      (req as any).isAdmin = false;
      next();
      return;
    }
    
    const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !authUser) {
      (req as any).isAdmin = false;
      next();
      return;
    }

    // Admin status based ONLY on email in admins table
    const emailIsAdmin = await isAdminByEmail(authUser.email || '');
    
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
    console.error('[Admin Access] Error verifying admin status:', error);
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

// Server-side pricing configuration - SINGLE SOURCE OF TRUTH
// This must match the client-side config in client/src/lib/pricing.ts
const PRICING_CONFIG = {
  vehicles: {
    motorbike: { name: "Motorbike", baseCharge: 7, perMileRate: 1.3 },
    car: { name: "Car", baseCharge: 19, perMileRate: 1.2 },
    small_van: { name: "Small Van", baseCharge: 25, perMileRate: 1.3 },
    medium_van: { name: "Medium Van", baseCharge: 30, perMileRate: 1.4 },
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

// Validation: ensure motorbike base price is never less than £7
function validateBasePrice(vehicleType: string, basePrice: number): number {
  if (vehicleType === 'motorbike' && basePrice < 7) {
    console.warn(`[Pricing] Invalid motorbike base price £${basePrice}, correcting to £7.00`);
    return 7;
  }
  const expectedBase = getBaseChargeForVehicle(vehicleType);
  if (basePrice < expectedBase * 0.9) {
    console.warn(`[Pricing] Base price £${basePrice} seems too low for ${vehicleType} (expected ~£${expectedBase}), using config value`);
    return expectedBase;
  }
  return basePrice;
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

const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
const tempUploadsDir = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}

function sanitizePath(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `temp_${timestamp}_${random}${ext}`);
  }
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  }
});

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

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Apply STRICT admin access middleware to all admin-only routes
  // These routes will REJECT requests without valid admin credentials
  app.use('/api/admin', requireAdminAccessStrict);
  app.use('/api/drivers/:id/verify', requireAdminAccessStrict);
  app.use('/api/drivers/:id/deactivate', requireAdminAccessStrict);
  app.use('/api/drivers/:id/reactivate', requireAdminAccessStrict);
  app.use('/api/documents/:id/review', requireAdminAccessStrict);
  app.use('/api/invoices/:id/send', requireAdminAccessStrict);
  app.use('/api/invoices/:id/resend', requireAdminAccessStrict);
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
  app.use('/api/job-assignments', requireAdminAccessStrict);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

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
      const dropList = (drops as string).split('|').filter(w => w.trim());
      if (dropList.length === 0) {
        return res.status(400).json({ error: 'At least one drop is required' });
      }

      // For single drop, no optimization needed
      if (dropList.length === 1) {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin as string)}&destinations=${encodeURIComponent(dropList[0])}&key=${apiKey}`;
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
          from: origin + ', UK',
          to: dropList[0] + ', UK',
          distance: element.distance.value / 1609.34,
          duration: Math.round(element.duration.value / 60),
        }];

        const markers = `markers=color:green|label:A|${encodeURIComponent(origin as string)}&markers=color:red|label:B|${encodeURIComponent(dropList[0])}`;
        const path = `path=color:0x007BFF|weight:4|${encodeURIComponent(origin as string)}|${encodeURIComponent(dropList[0])}`;
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
      const allPoints = [origin as string, ...dropList];
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

  app.get("/api/jobs", asyncHandler(async (req, res) => {
    const { status, customerId, driverId, vendorId, limit = 50 } = req.query;
    const jobs = await storage.getJobs({
      status: status as JobStatus | undefined,
      customerId: customerId as string | undefined,
      driverId: driverId as string | undefined,
      vendorId: vendorId as string | undefined,
      limit: Number(limit),
    });
    
    // SECURITY: Default to safe (no-pricing) unless explicitly admin/dispatcher
    // This prevents price leakage by omitting auth or using driver token
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { verifyAccessToken } = await import("./supabaseAdmin");
      const user = await verifyAccessToken(token);
      isAdmin = user?.role === 'admin' || user?.role === 'dispatcher';
    }
    
    if (isAdmin) {
      // Admin/dispatcher see full pricing
      return res.json(jobs);
    }
    
    // CRITICAL: Everyone else (drivers, customers, unauthenticated) gets NO customer pricing
    const safeJobs = jobs.map(job => stripCustomerPricing(job));
    return res.json(safeJobs);
  }));

  // Test email endpoint - for testing email templates
  app.post("/api/test-email", asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const testJobDetails = {
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
          status,
          vehicle_type,
          pickup_address,
          pickup_postcode,
          delivery_address,
          delivery_postcode,
          recipient_name,
          estimated_delivery_time,
          created_at,
          driver_id
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
      if (job.driver_id) {
        const { data: driver } = await supabaseAdmin
          .from('drivers')
          .select('full_name, phone')
          .eq('id', job.driver_id)
          .single();
        
        if (driver) {
          driverName = driver.full_name;
          driverPhone = driver.phone;
        }
      }
      
      // Map snake_case to camelCase for frontend
      return res.json({
        id: job.id,
        trackingNumber: job.tracking_number,
        status: job.status,
        vehicleType: job.vehicle_type,
        pickupAddress: job.pickup_address,
        pickupPostcode: job.pickup_postcode,
        deliveryAddress: job.delivery_address,
        deliveryPostcode: job.delivery_postcode,
        recipientName: job.recipient_name,
        estimatedDeliveryTime: job.estimated_delivery_time,
        createdAt: job.created_at,
        driverName,
        driverPhone,
      });
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

  app.get("/api/jobs/:id", asyncHandler(async (req, res) => {
    const job = await storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // SECURITY: Default to safe (no-pricing) unless explicitly admin/dispatcher
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { verifyAccessToken } = await import("./supabaseAdmin");
      const user = await verifyAccessToken(token);
      isAdmin = user?.role === 'admin' || user?.role === 'dispatcher';
    }
    
    if (isAdmin) {
      return res.json(job);
    }
    
    // CRITICAL: Everyone else gets NO customer pricing
    return res.json(stripCustomerPricing(job));
  }));

  // Get multi-drop stops for a job (admin only - contains POD and recipient data)
  app.get("/api/jobs/:id/stops", asyncHandler(async (req, res) => {
    const jobId = req.params.id;
    
    // SECURITY: Require admin access for POD and recipient data
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user: authUser } } = await supabaseAdmin?.auth.getUser(token) || { data: { user: null } };
      if (authUser?.email) {
        isAdmin = await isAdminByEmail(authUser.email);
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required", code: "NOT_ADMIN" });
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
    
    const { data: stops, error } = await supabaseAdmin
      .from('multi_drop_stops')
      .select('id, job_id, stop_order, address, postcode, recipient_name, recipient_phone, instructions, status, delivered_at, pod_photo_url, pod_signature_url, pod_recipient_name')
      .eq('job_id', jobId)
      .order('stop_order', { ascending: true });
    
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
      recipientName: stop.recipient_name,
      recipientPhone: stop.recipient_phone,
      instructions: stop.instructions,
      status: stop.status,
      deliveredAt: stop.delivered_at,
      podPhotoUrl: stop.pod_photo_url,
      podSignatureUrl: stop.pod_signature_url,
      podRecipientName: stop.pod_recipient_name,
    }));
    
    return res.json({ stops: mappedStops });
  }));

  // Update a multi-drop stop status (admin only)
  app.patch("/api/jobs/:jobId/stops/:stopId", asyncHandler(async (req, res) => {
    const { jobId, stopId } = req.params;
    const { status } = req.body;
    
    // SECURITY: Require admin access
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user: authUser } } = await supabaseAdmin?.auth.getUser(token) || { data: { user: null } };
      if (authUser?.email) {
        isAdmin = await isAdminByEmail(authUser.email);
      }
    }
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required", code: "NOT_ADMIN" });
    }
    
    if (!status || !['pending', 'delivered'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'pending' or 'delivered'" });
    }
    
    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Database not available" });
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
      .eq('id', stopId)
      .eq('job_id', jobId)
      .select()
      .single();
    
    if (error) {
      console.error('[Stops] Error updating stop:', error);
      return res.status(500).json({ error: "Failed to update stop status" });
    }
    
    console.log(`[Stops] Updated stop ${stopId} status to ${status}`);
    
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

  app.post("/api/jobs", asyncHandler(async (req, res) => {
    console.log('[Jobs] POST /api/jobs - Creating new job with driverId:', req.body.driverId);
    
    // Generate tracking number first
    const trackingNumber = await generateTrackingNumber();
    
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
            .select('id, email, driver_id')
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
    
    // CRITICAL: Also create job in Supabase for mobile app sync
    // Mobile app queries Supabase directly using RLS, so jobs must exist there
    // NOTE: Supabase jobs table has different schema than local PostgreSQL
    console.log('[Jobs] Attempting to sync job to Supabase...');
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      console.log('[Jobs] supabaseAdmin available:', !!supabaseAdmin);
      if (supabaseAdmin) {
        // Map local job fields to Supabase jobs table columns
        // Column names match the create-job edge function schema
        // DO NOT include 'id' - let Supabase auto-generate it
        const supabaseJobData = {
          // Required tracking
          tracking_number: job.trackingNumber,
          // Driver/customer IDs - CRITICAL: Use Supabase auth.uid, NOT local driver UUID
          driver_id: supabaseDriverId, // Must be Supabase auth.uid for RLS
          customer_id: job.customerId !== 'admin-created' ? job.customerId : null,
          // Status and type
          status: job.status === 'assigned' ? 'pending' : job.status,
          vehicle_type: job.vehicleType || 'small_van',
          payment_status: job.paymentStatus || 'pending',
          // Pickup details
          pickup_address: job.pickupAddress || '',
          pickup_postcode: job.pickupPostcode || null,
          pickup_contact_name: job.pickupContactName || null,
          pickup_contact_phone: job.pickupContactPhone || null,
          pickup_instructions: job.pickupInstructions || null,
          // Delivery details
          delivery_address: job.deliveryAddress || '',
          delivery_postcode: job.deliveryPostcode || null,
          delivery_instructions: job.deliveryInstructions || null,
          // Recipient
          recipient_name: job.recipientName || 'Recipient',
          recipient_phone: job.recipientPhone || '',
          // Numeric fields - use correct column names matching create-job edge function
          weight: job.weight ? parseFloat(String(job.weight)).toFixed(2) : '1.00',
          distance: job.distance ? parseFloat(String(job.distance)).toFixed(2) : '0.00',
          base_price: job.basePrice ? parseFloat(String(job.basePrice)).toFixed(2) : '0.00',
          distance_price: job.distancePrice ? parseFloat(String(job.distancePrice)).toFixed(2) : '0.00',
          weight_surcharge: job.weightSurcharge ? parseFloat(String(job.weightSurcharge)).toFixed(2) : '0.00',
          multi_drop_charge: job.multiDropCharge ? parseFloat(String(job.multiDropCharge)).toFixed(2) : '0.00',
          return_trip_charge: job.returnTripCharge ? parseFloat(String(job.returnTripCharge)).toFixed(2) : '0.00',
          central_london_charge: job.centralLondonCharge ? parseFloat(String(job.centralLondonCharge)).toFixed(2) : '0.00',
          waiting_time_charge: job.waitingTimeCharge ? parseFloat(String(job.waitingTimeCharge)).toFixed(2) : '0.00',
          total_price: job.totalPrice ? parseFloat(String(job.totalPrice)).toFixed(2) : '0.00',
          // CRITICAL: driver_price is what drivers see - must be set by admin
          driver_price: job.driverPrice ? parseFloat(String(job.driverPrice)).toFixed(2) : null,
          // Schedule
          scheduled_pickup_time: job.scheduledPickupTime?.toISOString() || null,
          scheduled_delivery_time: job.scheduledDeliveryTime?.toISOString() || null,
          is_multi_drop: job.isMultiDrop || false,
          is_return_trip: job.isReturnTrip || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        console.log('[Jobs] Supabase job data:', JSON.stringify(supabaseJobData, null, 2));
        
        const { data: insertedJob, error: supabaseError } = await supabaseAdmin
          .from('jobs')
          .insert(supabaseJobData)
          .select('id, tracking_number')
          .single();
        
        if (supabaseError) {
          console.error('[Jobs] Failed to sync job to Supabase:', supabaseError);
        } else {
          console.log(`[Jobs] Job synced to Supabase with id ${insertedJob?.id}, tracking: ${insertedJob?.tracking_number}`);
        }
        
        // Save multi-drop stops to Supabase if present (independent of job sync)
        // IMPORTANT: Use LOCAL job.id so frontend can query by local ID
        const multiDropStops = req.body.multiDropStops;
        if (job.isMultiDrop && multiDropStops && Array.isArray(multiDropStops) && multiDropStops.length > 0) {
          console.log(`[Jobs] Saving ${multiDropStops.length} multi-drop stops for local job ${job.id}`);
          const stopsToInsert = multiDropStops.map((stop: any, index: number) => ({
            job_id: String(job.id), // Use local job ID for consistency with frontend queries
            stop_order: stop.stopOrder || index + 1,
            address: stop.address || stop.fullAddress || '',
            postcode: stop.postcode || '',
            recipient_name: stop.recipientName || null,
            recipient_phone: stop.recipientPhone || null,
            instructions: stop.instructions || null,
            status: 'pending',
          }));
          
          const { error: stopsError } = await supabaseAdmin
            .from('multi_drop_stops')
            .insert(stopsToInsert);
          
          if (stopsError) {
            console.error('[Jobs] Failed to save multi-drop stops:', stopsError);
          } else {
            console.log(`[Jobs] Successfully saved ${stopsToInsert.length} multi-drop stops`);
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
    // If job is created with a driver already assigned, notify the driver
    if (job.driverId) {
      broadcastJobAssigned({
        id: job.id,
        trackingNumber: job.trackingNumber,
        status: job.status,
        driverId: job.driverId,
        pickupAddress: job.pickupAddress,
        deliveryAddress: job.deliveryAddress,
        vehicleType: job.vehicleType,
        driverPrice: job.driverPrice,
      });
      console.log(`[Jobs] New job ${job.id} created and assigned to driver ${job.driverId}`);
    }
    // Send admin notification - include multiDropStops from request for email details
    const jobWithStops = {
      ...job,
      multiDropStops: req.body.multiDropStops || null,
      returnToSameLocation: req.body.returnToSameLocation ?? true,
      returnAddress: req.body.returnAddress || null,
      returnPostcode: req.body.returnPostcode || null,
    };
    await sendNewJobNotification(job.id, jobWithStops).catch(err => console.error('Failed to send job notification:', err));
    // Send customer confirmation if email available
    const customerEmail = req.body.customerEmail || (job as any).customerEmail;
    if (customerEmail) {
      await sendCustomerBookingConfirmation(customerEmail, { ...finalJob, customerEmail }).catch(err => console.error('Failed to send customer confirmation:', err));
    }
    res.status(201).json(finalJob);
  }));

  app.patch("/api/jobs/:id", asyncHandler(async (req, res) => {
    const previousJob = await storage.getJob(req.params.id);
    const job = await storage.updateJob(req.params.id, req.body);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
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
    res.json(job);
  }));

  app.patch("/api/jobs/:id/status", asyncHandler(async (req, res) => {
    const { status, rejectionReason } = req.body;
    const previousJob = await storage.getJob(req.params.id);
    
    if (!previousJob) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Require POD (photo or signature) before marking as delivered
    if (status === "delivered") {
      if (!previousJob.podPhotoUrl && !previousJob.podSignatureUrl) {
        return res.status(400).json({ 
          error: "Proof of Delivery (photo or signature) is required before marking as delivered. POD must be submitted from the mobile app.",
          code: "POD_REQUIRED"
        });
      }
    }
    
    const job = await storage.updateJobStatus(req.params.id, status, rejectionReason);
    if (!job) {
      return res.status(404).json({ error: "Failed to update job status" });
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
    res.json(job);
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
      res.json({ success: true, job: updatedJob, geocoded: updates });
    } else {
      res.json({ success: true, job, message: "No geocoding needed or addresses missing" });
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
    let driver = null;
    if (driverId) {
      driver = await storage.getDriver(driverId);
      if (!driver) {
        return res.status(404).json({ error: "Driver not found" });
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
    if (!driverPrice || parseFloat(driverPrice) <= 0) {
      return res.status(400).json({ 
        error: "Driver price is required. Please specify the amount the driver will be paid for this job." 
      });
    }
    const finalDriverPrice = String(driverPrice);
    
    const job = await storage.assignDriver(req.params.id, driverId, dispatcherId);
    if (!job) {
      return res.status(404).json({ error: "Failed to assign job" });
    }
    
    // CRITICAL: Update job with driver_price so driver sees correct amount
    // This must happen BEFORE driver fetches the job
    await storage.updateJob(req.params.id, { driverPrice: finalDriverPrice });
    console.log(`[Jobs] Updated job ${job.id} with driver_price: £${finalDriverPrice}`);
    
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
    
    // Broadcast job assignment for real-time updates
    broadcastJobUpdate({
      id: job.id,
      trackingNumber: job.trackingNumber,
      status: job.status,
      previousStatus: previousJob?.status,
      customerId: job.customerId,
      driverId: job.driverId,
      updatedAt: job.updatedAt,
    });
    // Send specific notification to the assigned driver
    if (job.driverId) {
      // CRITICAL: Use finalDriverPrice here, not job.driverPrice which may be stale
      broadcastJobAssigned({
        id: job.id,
        trackingNumber: job.trackingNumber,
        status: job.status,
        driverId: job.driverId,
        pickupAddress: job.pickupAddress,
        deliveryAddress: job.deliveryAddress,
        vehicleType: job.vehicleType,
        driverPrice: finalDriverPrice, // Use admin-set price, not customer price
      });
      console.log(`[Jobs] Job ${job.id} assigned to driver ${job.driverId} with driver_price £${finalDriverPrice}, notification sent`);
      
      // Send push notification to driver's mobile device
      sendJobOfferNotification(job.driverId, {
        jobId: job.id,
        trackingNumber: job.trackingNumber,
        pickupAddress: job.pickupAddress,
        deliveryAddress: job.deliveryAddress,
        driverPrice: finalDriverPrice, // Use admin-set price, not customer price
        vehicleType: job.vehicleType,
      }).then(result => {
        if (result.success) {
          console.log(`[Jobs] Push notification sent to ${result.sentCount} device(s) for driver ${job.driverId}`);
        }
      }).catch(err => console.error('[Jobs] Failed to send push notification:', err));
    }
    
    // Return the updated job with correct driver price
    const updatedJob = await storage.getJob(req.params.id);
    res.json(updatedJob || job);
  }));

  app.patch("/api/jobs/:id/pod", asyncHandler(async (req, res) => {
    const { podPhotoUrl, podSignatureUrl } = req.body;
    const job = await storage.updateJobPOD(req.params.id, podPhotoUrl, podSignatureUrl);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
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
    
    res.json(updatedJob);
  }));

  app.delete("/api/jobs/:id", asyncHandler(async (req, res) => {
    await storage.deleteJob(req.params.id);
    res.status(204).send();
  }));

  // Toggle job visibility for driver mobile app (admin only)
  app.patch("/api/jobs/:id/driver-visibility", asyncHandler(async (req, res) => {
    const { hidden, adminId } = req.body;
    const jobId = req.params.id;
    
    if (typeof hidden !== 'boolean') {
      return res.status(400).json({ error: "hidden field must be a boolean" });
    }
    
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Update job visibility in database
    const { db } = await import("./db");
    const { jobs: jobsTable } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const updateData: any = {
      driverHidden: hidden,
      driverHiddenAt: hidden ? new Date() : null,
      driverHiddenBy: hidden ? (adminId || null) : null,
    };
    
    await db.update(jobsTable)
      .set(updateData)
      .where(eq(jobsTable.id, jobId));
    
    // Also update in-memory storage
    await storage.updateJob(jobId, updateData);
    
    // CRITICAL: Also update Supabase (source of truth for mobile app)
    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (supabaseAdmin) {
      const { error: supabaseError } = await supabaseAdmin
        .from('jobs')
        .update({
          driver_hidden: hidden,
          driver_hidden_at: hidden ? new Date().toISOString() : null,
          driver_hidden_by: hidden ? (adminId || null) : null,
        })
        .eq('id', jobId);
      
      if (supabaseError) {
        console.error(`[Jobs] Supabase update failed for job ${jobId}:`, supabaseError.message);
      } else {
        console.log(`[Jobs] Supabase updated: job ${jobId} driver_hidden=${hidden}`);
      }
    }
    
    console.log(`[Jobs] Job ${jobId} visibility for driver: ${hidden ? 'hidden' : 'visible'} by admin ${adminId || 'unknown'}`);
    
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
    
    res.json(updatedJob);
  }));

  app.get("/api/drivers", asyncHandler(async (req, res) => {
    const { isAvailable, isVerified, vehicleType, includeInactive } = req.query;
    const drivers = await storage.getDrivers({
      isAvailable: isAvailable === "true" ? true : isAvailable === "false" ? false : undefined,
      isVerified: isVerified === "true" ? true : isVerified === "false" ? false : undefined,
      vehicleType: vehicleType as VehicleType | undefined,
      includeInactive: includeInactive === "true",
    });
    res.json(drivers);
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
      });
      
      // Save new driver to PostgreSQL with permanent driverCode
      if (driver) {
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
            }
          });
          
          console.log("New driver saved to PostgreSQL:", driver.id, "with permanent code:", driver.driverCode);
          
          // Also sync driver code to Supabase for Hostinger deployment
          try {
            const { supabaseAdmin } = await import("./supabaseAdmin");
            if (supabaseAdmin && driver.driverCode) {
              await supabaseAdmin
                .from('drivers')
                .upsert({
                  id: driver.id,
                  user_id: driver.userId,
                  driver_code: driver.driverCode,
                  full_name: driver.fullName,
                  email: driver.email,
                  phone: driver.phone,
                  vehicle_type: driver.vehicleType,
                  online_status: driver.isAvailable ? 'online' : 'offline',
                  is_verified: driver.isVerified ?? false,
                  rating: driver.rating ?? "5.00",
                  total_jobs: driver.totalJobs ?? 0,
                }, { onConflict: 'id' });
              console.log("Driver code synced to Supabase:", driver.id, driver.driverCode);
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
    
    const driver = await storage.updateDriver(req.params.id, safeBody);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Sync update to PostgreSQL database via Drizzle
    try {
      const { db } = await import("./db");
      const { drivers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const updateData: Partial<typeof drivers.$inferSelect> = {};
      if (safeBody.vehicleType !== undefined) updateData.vehicleType = safeBody.vehicleType;
      if (safeBody.vehicleRegistration !== undefined) updateData.vehicleRegistration = safeBody.vehicleRegistration;
      if (safeBody.vehicleMake !== undefined) updateData.vehicleMake = safeBody.vehicleMake;
      if (safeBody.vehicleModel !== undefined) updateData.vehicleModel = safeBody.vehicleModel;
      if (safeBody.vehicleColor !== undefined) updateData.vehicleColor = safeBody.vehicleColor;
      if (safeBody.fullName !== undefined) updateData.fullName = safeBody.fullName;
      if (safeBody.email !== undefined) updateData.email = safeBody.email;
      if (safeBody.phone !== undefined) updateData.phone = safeBody.phone;
      if (safeBody.postcode !== undefined) updateData.postcode = safeBody.postcode;
      if (safeBody.address !== undefined) updateData.address = safeBody.address;
      if (safeBody.isAvailable !== undefined) updateData.isAvailable = safeBody.isAvailable;
      if (safeBody.isVerified !== undefined) updateData.isVerified = safeBody.isVerified;
      
      if (Object.keys(updateData).length > 0) {
        await db.update(drivers).set(updateData).where(eq(drivers.id, req.params.id));
        console.log("Driver successfully updated in PostgreSQL:", req.params.id);
      }
      
      // Also sync to Supabase for Hostinger deployment
      try {
        const { supabaseAdmin } = await import("./supabaseAdmin");
        if (supabaseAdmin) {
          const supabaseUpdateData: Record<string, unknown> = {};
          if (safeBody.fullName !== undefined) supabaseUpdateData.full_name = safeBody.fullName;
          if (safeBody.email !== undefined) supabaseUpdateData.email = safeBody.email;
          if (safeBody.phone !== undefined) supabaseUpdateData.phone = safeBody.phone;
          if (safeBody.vehicleType !== undefined) supabaseUpdateData.vehicle_type = safeBody.vehicleType;
          if (safeBody.isAvailable !== undefined) supabaseUpdateData.online_status = safeBody.isAvailable ? 'online' : 'offline';
          if (safeBody.isVerified !== undefined) supabaseUpdateData.is_verified = safeBody.isVerified;
          if (safeBody.address !== undefined) supabaseUpdateData.address = safeBody.address;
          if (safeBody.postcode !== undefined) supabaseUpdateData.postcode = safeBody.postcode;
          
          if (Object.keys(supabaseUpdateData).length > 0) {
            await supabaseAdmin
              .from('drivers')
              .update(supabaseUpdateData)
              .eq('id', req.params.id);
            console.log("Driver successfully synced to Supabase:", req.params.id);
          }
        }
      } catch (syncErr) {
        console.error("Failed to sync driver to Supabase:", syncErr);
      }
    } catch (e) {
      console.error("Failed to update driver in PostgreSQL:", e);
    }
    
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
    
    res.json(driver);
  }));

  app.patch("/api/drivers/:id/location", asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    const driver = await storage.updateDriverLocation(req.params.id, latitude, longitude);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
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
      }
    } catch (e) {
      console.error("Failed to clean up Supabase jobs/assignments:", e);
    }
    
    // 3. Delete from Supabase drivers table
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
    
    // 4. Delete from Supabase Auth (THIS IS CRITICAL - prevents driver from coming back)
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
    
    // 5. Delete from PostgreSQL drivers table
    try {
      const { db } = await import("./db");
      const { drivers: driversTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.delete(driversTable).where(eq(driversTable.id, driverId));
      console.log(`[Drivers] Deleted driver from PostgreSQL: ${driverId}`);
    } catch (e) {
      console.error("Failed to delete driver from PostgreSQL:", e);
    }
    
    // 6. Delete from in-memory storage
    const deleted = await storage.deleteDriver(driverId);
    if (!deleted) {
      console.log(`[Drivers] Driver not in memory storage (may have been deleted already)`);
    }
    
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
      // Note: Supabase uses 'driver_id' column for what we call 'driverCode' internally
      const { data: supabaseDrivers } = await supabaseAdmin
        .from('drivers')
        .select('id, driver_id, full_name, email, phone, vehicle_type, approval_status, online_status');
      
      // Build maps: by id and email for flexible lookup
      // IMPORTANT: driver_id from Supabase is the PERMANENT Driver ID (e.g., RC02C)
      type SupabaseDriverData = { 
        id: string; 
        driver_id: string | null;  // This is the PERMANENT Driver ID from Supabase
        full_name: string | null;
        email: string | null;
        phone: string | null;
        vehicle_type: string | null;
        is_verified: boolean;
        is_available: boolean;
      };
      const supabaseDriverById = new Map<string, SupabaseDriverData>();
      const supabaseDriverByEmail = new Map<string, SupabaseDriverData>();
      
      for (const d of (supabaseDrivers || [])) {
        const driverData: SupabaseDriverData = { 
          id: d.id, 
          driver_id: d.driver_id,  // PERMANENT Driver ID from Supabase
          full_name: d.full_name,
          email: d.email,
          phone: d.phone,
          vehicle_type: d.vehicle_type,
          is_verified: d.approval_status === 'approved',
          is_available: d.online_status === 'online',
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
      
      // Process drivers sequentially to avoid race conditions
      const driverUsers = [];
      for (const user of driverUsersList) {
        const supabaseDriver = findSupabaseDriver(user.id, user.email);
        
        // IMPORTANT: driver_id from Supabase is the PERMANENT Driver ID - NEVER regenerate it
        // This is the authoritative source of driver IDs
        const permanentDriverId = supabaseDriver?.driver_id || null;
        
        // Check if driver exists locally
        let localDriver = localDriverMap.get(user.id);
        
        if (!localDriver) {
          // Create a local driver record - use Supabase driver data (which is authoritative)
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
          driverCode: permanentDriverId || localDriver?.driverCode || null, // PERMANENT ID first
          vehicleType: supabaseDriver?.vehicle_type || localDriver?.vehicleType || 'car',
          isVerified: supabaseDriver?.is_verified ?? localDriver?.isVerified ?? false,
          isAvailable: supabaseDriver?.is_available ?? localDriver?.isAvailable ?? false,
          createdAt: user.created_at,
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
        // Add local-only driver
        driverUsers.push({
          id: localDriver.id,
          email: localDriver.email || null,
          fullName: localDriver.fullName || 'Local Driver',
          phone: localDriver.phone || null,
          role: 'driver',
          driverCode: localDriver.driverCode || null,
          createdAt: null,
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

  app.get("/api/documents", asyncHandler(async (req, res) => {
    const { driverId, status, type } = req.query;
    
    // Collect documents from all sources and merge (deduplicate by id)
    const allDocuments: any[] = [];
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
                type: doc.doc_type || doc.document_type || doc.type || 'unknown',
                fileName: fileUrl.split('/').pop() || 'document',
                fileUrl: fileUrl,
                status: doc.status || 'pending',
                expiryDate: doc.expiry_date ? new Date(doc.expiry_date) : null,
                reviewedBy: doc.reviewed_by,
                reviewNotes: doc.review_notes,
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
    
    // Sort by uploadedAt descending
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.uploadedAt || 0).getTime();
      const dateB = new Date(b.uploadedAt || 0).getTime();
      return dateB - dateA;
    });
    
    console.log(`[Documents] Returning ${allDocuments.length} total documents from all sources`);
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
      // Clean up temp file
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ error: "Driver ID is required" });
    }

    if (!rawDocumentType) {
      // Clean up temp file
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ error: "Document type is required" });
    }

    const safeDriverId = sanitizePath(rawDriverId);
    const safeDocumentType = sanitizePath(rawDocumentType);
    
    // Create driver-specific directory and move file from temp
    const driverDir = path.join(uploadsDir, safeDriverId);
    if (!fs.existsSync(driverDir)) {
      fs.mkdirSync(driverDir, { recursive: true });
    }
    
    // Generate final filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const finalFilename = `${safeDocumentType}_${timestamp}${ext}`;
    const finalPath = path.join(driverDir, finalFilename);
    
    // Move file from temp to final location
    try {
      fs.renameSync(file.path, finalPath);
    } catch (moveError) {
      // If rename fails (cross-device), copy and delete
      fs.copyFileSync(file.path, finalPath);
      fs.unlinkSync(file.path);
    }
    
    const relativePath = `/uploads/documents/${safeDriverId}/${finalFilename}`;
    const fileUrl = relativePath;

    // Check for existing documents in both memory and database
    let existingDocId: string | null = null;
    
    // First check in-memory storage
    const memoryDocs = await storage.getDocuments({ driverId: rawDriverId, type: rawDocumentType as any });
    if (memoryDocs && memoryDocs.length > 0) {
      existingDocId = memoryDocs[0].id;
    }
    
    // If not in memory, check database
    if (!existingDocId) {
      try {
        const { db } = await import("./db");
        const { documents: documentsTable } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const dbDocs = await db.select().from(documentsTable)
          .where(and(
            eq(documentsTable.driverId, rawDriverId),
            eq(documentsTable.type, rawDocumentType as any)
          ));
        
        if (dbDocs && dbDocs.length > 0) {
          existingDocId = dbDocs[0].id;
        }
      } catch (e) {
        console.error("Failed to check existing documents in database:", e);
      }
    }
    
    let document;
    const uploadedAt = new Date();
    const expiryDate = rawExpiryDate ? new Date(rawExpiryDate) : null;
    
    if (existingDocId) {
      // Update existing document in memory
      document = await storage.updateDocument(existingDocId, {
        fileName: file.originalname,
        fileUrl,
        status: 'pending' as const,
        uploadedAt,
        expiryDate,
        reviewedBy: null,
        reviewNotes: null,
        reviewedAt: null,
      });
      
      // If not in memory, create in memory with existing ID
      if (!document) {
        document = await storage.createDocument({
          driverId: rawDriverId,
          type: safeDocumentType,
          fileName: file.originalname,
          fileUrl,
          status: 'pending',
          expiryDate,
        });
        // Override ID to match existing
        if (document) {
          (document as any).id = existingDocId;
        }
      }
    } else {
      document = await storage.createDocument({
        driverId: rawDriverId,
        type: safeDocumentType,
        fileName: file.originalname,
        fileUrl,
        status: 'pending',
        expiryDate,
      });
    }

    // Sync document to PostgreSQL database
    try {
      const { db } = await import("./db");
      const { documents } = await import("@shared/schema");
      
      if (document) {
        await db.insert(documents).values({
          id: document.id,
          driverId: document.driverId,
          type: document.type,
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          status: document.status,
          reviewedBy: document.reviewedBy,
          reviewNotes: document.reviewNotes,
          expiryDate: document.expiryDate,
          uploadedAt: document.uploadedAt,
          reviewedAt: document.reviewedAt,
        }).onConflictDoUpdate({
          target: documents.id,
          set: {
            fileName: document.fileName,
            fileUrl: document.fileUrl,
            status: document.status,
            reviewedBy: document.reviewedBy,
            reviewNotes: document.reviewNotes,
            expiryDate: document.expiryDate,
            uploadedAt: document.uploadedAt,
            reviewedAt: document.reviewedAt,
          }
        });
        console.log("Document successfully synced to PostgreSQL:", document.id);
      }
    } catch (e) {
      console.error("Failed to sync document to PostgreSQL:", e);
    }

    // Get driver name for email notification
    let driverName = rawDriverId;
    try {
      const driver = await storage.getDriver(rawDriverId);
      if (driver?.fullName) {
        driverName = driver.fullName;
      } else if (driver?.email) {
        driverName = driver.email;
      }
    } catch (e) {
      console.error('Failed to get driver name for notification:', e);
    }
    
    // Format document type for email
    const formattedDocType = safeDocumentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    
    await sendDocumentUploadNotification(driverName, formattedDocType).catch(err => 
      console.error('Failed to send document upload notification:', err)
    );

    // Broadcast real-time update to admin dashboard
    if (document) {
      broadcastDocumentPending({
        id: document.id,
        driverId: document.driverId,
        driverName: driverName,
        type: document.type,
        fileName: document.fileName,
        uploadedAt: document.uploadedAt,
      });
    }

    res.status(201).json(document);
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

    // Validate file is an image
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedImageTypes.includes(file.mimetype)) {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ error: "Only image files are allowed for profile pictures" });
    }

    const safeDriverId = sanitizePath(driverId);
    
    // Create driver-specific directory
    const driverDir = path.join(uploadsDir, safeDriverId);
    if (!fs.existsSync(driverDir)) {
      fs.mkdirSync(driverDir, { recursive: true });
    }
    
    // Generate final filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const finalFilename = `profile_picture_${timestamp}${ext}`;
    const finalPath = path.join(driverDir, finalFilename);
    
    // Move file from temp to final location
    try {
      fs.renameSync(file.path, finalPath);
    } catch (moveError) {
      fs.copyFileSync(file.path, finalPath);
      fs.unlinkSync(file.path);
    }
    
    const profilePictureUrl = `/uploads/documents/${safeDriverId}/${finalFilename}`;

    // Update driver profile with profile picture URL in storage
    await storage.updateDriver(driverId, { profilePictureUrl });

    // Update driver in PostgreSQL database
    try {
      const { db } = await import("./db");
      const { drivers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(drivers).set({
        profilePictureUrl: profilePictureUrl,
      }).where(eq(drivers.id, driverId));
      console.log("Profile picture URL updated in PostgreSQL for driver:", driverId);
    } catch (e) {
      console.error("Failed to update profile picture in PostgreSQL:", e);
    }

    res.status(200).json({ 
      success: true, 
      profilePictureUrl,
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
    // Supabase driver_documents uses bigint IDs, so only try for numeric IDs
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      // Only try Supabase driver_documents for numeric IDs (not UUIDs)
      if (supabaseAdmin && !isUuidId) {
        // The Supabase driver_documents table only has: status, updated_at
        // It does NOT have: reviewed_by, review_notes columns
        const updateData: Record<string, any> = {
          status: status,
          updated_at: reviewedAt.toISOString(),
        };
        
        // Use numeric ID for Supabase query
        const { data: updatedDoc, error } = await supabaseAdmin
          .from('driver_documents')
          .update(updateData)
          .eq('id', docId)
          .select()
          .single();
        
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
    
    res.json(document);
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
    res.status(201).json(payment);
  }));

  app.patch("/api/driver-payments/:id", asyncHandler(async (req, res) => {
    const payment = await storage.updateDriverPayment(req.params.id, req.body);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }
    res.json(payment);
  }));

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

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    
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
    const { jobId, amount, customerEmail, customerId } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
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

    const paymentIntent = await stripeService.createPaymentIntent(
      Math.round(amount * 100),
      'gbp',
      stripeCustomerId,
      { jobId: jobId || '' }
    );

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id 
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
      totalPrice: String(bookingData.totalPrice),
      distance: String(bookingData.distance || 0),
      estimatedTime: String(bookingData.estimatedTime || 0),
      isMultiDrop: String(bookingData.isMultiDrop || false),
      isReturnTrip: String(bookingData.isReturnTrip || false),
      customerId: bookingData.customerId || '',
      customerEmail: customerEmail,
    };

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(bookingData.totalPrice * 100),
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
    const totalPrice = parseFloat(metadata.totalPrice) || (paymentIntent.amount / 100);

    const jobData = {
      trackingNumber,
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
      totalPrice: String(totalPrice),
      distance: metadata.distance || '0',
      customerId: metadata.customerId || '',
      customerEmail: metadata.customerEmail || '',
      paymentStatus: 'paid',
      stripePaymentIntentId: paymentIntentId,
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

    // Send email notifications
    await sendNewJobNotification(job.id, job).catch(err => console.error('Failed to send admin notification:', err));
    const embeddedCustomerEmail = (job as any).customerEmail || metadata.customerEmail;
    if (embeddedCustomerEmail) {
      await sendCustomerBookingConfirmation(embeddedCustomerEmail, job).catch(err => console.error('Failed to send customer confirmation:', err));
    }
    
    // Send SMS confirmation to pickup contact
    const pickupPhone = metadata.pickupPhone || jobData.pickupContactPhone;
    if (pickupPhone) {
      await sendBookingConfirmationSMS(pickupPhone, trackingNumber, jobData.pickupAddress || jobData.pickupPostcode)
        .catch(err => console.error('Failed to send SMS confirmation:', err));
    }

    res.json({ 
      success: true, 
      trackingNumber: job.trackingNumber,
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
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    
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
    
    const jobData = {
      trackingNumber,
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
      totalPrice: String(bookingData.totalPrice || 0),
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
    
    await storage.incrementCompletedBookings(bookingData.customerId);
    console.log(`[Pay Later Booking] Created job ${trackingNumber} for customer ${bookingData.customerId} - payment to be invoiced weekly`);
    
    // Send email notifications
    await sendNewJobNotification(job.id, job).catch(err => console.error('Failed to send admin notification:', err));
    const customerEmailForNotification = bookingData.customerEmail || customer.email;
    if (customerEmailForNotification) {
      await sendCustomerBookingConfirmation(customerEmailForNotification, job).catch(err => console.error('Failed to send customer confirmation:', err));
    }
    
    // Send SMS confirmation to pickup contact
    if (bookingData.pickupPhone) {
      await sendBookingConfirmationSMS(bookingData.pickupPhone, trackingNumber, bookingData.pickupAddress || bookingData.pickupPostcode)
        .catch(err => console.error('Failed to send SMS confirmation:', err));
    }

    res.json({ 
      success: true, 
      trackingNumber: job.trackingNumber,
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
    const totalPrice = parseFloat(metadata.totalPrice || '0');
    
    const jobData = {
      trackingNumber,
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
    
    if (metadata.customerId) {
      await storage.incrementCompletedBookings(metadata.customerId);
      console.log(`[Booking] Incremented completed bookings count for user ${metadata.customerId}. Discount was ${metadata.discountApplied === 'true' ? 'applied' : 'not applied'}`);
    }
    
    // Send email notifications
    await sendNewJobNotification(job.id, job).catch(err => console.error('Failed to send admin notification:', err));
    const customerEmailForConfirmation = metadata.customerEmail || session.customer_email;
    if (customerEmailForConfirmation) {
      await sendCustomerBookingConfirmation(customerEmailForConfirmation, job).catch(err => console.error('Failed to send customer confirmation:', err));
    }
    
    // Send SMS confirmation to pickup contact
    const pickupPhone = metadata.pickupPhone || jobData.pickupContactPhone;
    if (pickupPhone) {
      await sendBookingConfirmationSMS(pickupPhone, trackingNumber, jobData.pickupAddress || jobData.pickupPostcode)
        .catch(err => console.error('Failed to send SMS confirmation:', err));
    }

    res.json({ 
      success: true, 
      trackingNumber: job.trackingNumber,
      jobId: job.id 
    });
  }));

  app.get("/api/driver-applications", asyncHandler(async (req, res) => {
    const { status } = req.query;
    const applications = await storage.getDriverApplications({
      status: status as DriverApplicationStatus | undefined,
    });
    res.json(applications);
  }));

  app.get("/api/driver-applications/:id", asyncHandler(async (req, res) => {
    const application = await storage.getDriverApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }
    res.json(application);
  }));

  app.get("/api/driver-applications/check/:email", asyncHandler(async (req, res) => {
    const application = await storage.getDriverApplicationByEmail(req.params.email);
    if (application) {
      res.json({ exists: true, status: application.status, id: application.id });
    } else {
      res.json({ exists: false });
    }
  }));

  app.post("/api/driver-applications", asyncHandler(async (req, res) => {
    const existingApplication = await storage.getDriverApplicationByEmail(req.body.email);
    if (existingApplication) {
      return res.status(400).json({ 
        error: "An application with this email already exists",
        status: existingApplication.status,
        applicationId: existingApplication.id
      });
    }

    const data = insertDriverApplicationSchema.parse(req.body);
    const application = await storage.createDriverApplication(data);
    res.status(201).json(application);
  }));

  app.patch("/api/driver-applications/:id", asyncHandler(async (req, res) => {
    const application = await storage.updateDriverApplication(req.params.id, req.body);
    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }
    res.json(application);
  }));

  app.patch("/api/driver-applications/:id/review", asyncHandler(async (req, res) => {
    const { status, reviewedBy, reviewNotes, rejectionReason } = req.body;
    
    if (!status || !reviewedBy) {
      return res.status(400).json({ error: "Status and reviewedBy are required" });
    }

    const application = await storage.reviewDriverApplication(
      req.params.id,
      status as DriverApplicationStatus,
      reviewedBy,
      reviewNotes,
      rejectionReason
    );

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Send admin notification for driver application review
    await sendDriverApplicationNotification(application.fullName, status).catch(err => console.error('Failed to send application notification:', err));

    res.json(application);
  }));

  // Invoice routes for Pay Later customers
  // Using invoice_payment_tokens as source of truth since invoices table has schema issues
  app.get("/api/invoices", asyncHandler(async (req, res) => {
    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      return res.json([]);
    }
    
    const { status } = req.query;
    let query = supabaseAdmin
      .from('invoice_payment_tokens')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error || !data) {
      console.error('[Invoices] Error fetching invoices:', error);
      return res.json([]);
    }
    
    // Transform invoice_payment_tokens to invoice format for frontend compatibility
    // Frontend expects snake_case field names
    const invoices = data.map((token: any) => ({
      id: token.token,
      invoice_number: token.invoice_number,
      customer_id: null,
      customer_name: token.customer_name,
      customer_email: token.customer_email,
      company_name: token.company_name || null,
      business_address: token.business_address || null,
      vat_number: token.vat_number || null,
      subtotal: String(token.subtotal || token.amount),
      vat: String(token.vat || 0),
      total: String(token.amount),
      status: token.status,
      due_date: token.due_date,
      period_start: token.period_start,
      period_end: token.period_end,
      job_ids: token.job_ids || null,
      notes: token.notes,
      payment_token: token.token,
      job_details: token.job_details || null,
      created_at: token.created_at,
    }));
    
    res.json(invoices);
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
      invoice_number: data.invoice_number,
      customer_id: null,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      company_name: data.company_name || null,
      business_address: data.business_address || null,
      vat_number: data.vat_number || null,
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
      const { data: jobs, error } = await supabaseAdmin
        .from('jobs')
        .select('id, tracking_number, pickup_address, delivery_address, recipient_name, scheduled_pickup_time, vehicle_type, total_price, is_multi_drop')
        .in('id', data.jobIds);
      
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
        
        jobDetails = jobs.map(job => ({
          trackingNumber: job.tracking_number || `JOB-${job.id}`,
          pickupAddress: job.pickup_address || 'N/A',
          deliveryAddress: job.delivery_address,
          recipientName: job.recipient_name,
          scheduledDate: formatShortDate(job.scheduled_pickup_time),
          vehicleType: job.vehicle_type || 'car',
          price: parseFloat(job.total_price) || 0,
          isMultiDrop: job.is_multi_drop || false,
          multiDropStops: multiDropStopsMap[job.id] || [],
        }));
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
    
    // Generate payment URL
    const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
    const protocol = baseUrl.includes('localhost') ? 'http' : 'https';
    const paymentUrl = `${protocol}://${baseUrl}/invoice-pay/${paymentToken}`;
    
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
    // ADMIN REQUIRED: Sending invoices is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
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
    // ADMIN REQUIRED: Resending invoices is an admin-only operation
    if (!enforceAdminAccess(req, res)) return;
    
    const { sendInvoiceToCustomerWithPaymentLink } = await import("./emailService");
    
    const invoice = await storage.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const formatDate = (date: Date | string) => {
      return new Date(date).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    };
    
    // Build payment URL if token exists (use snake_case from database)
    let paymentUrl = '';
    const storedToken = (invoice as any).payment_token || (invoice as any).paymentToken;
    if (storedToken) {
      const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
      const protocol = baseUrl.includes('localhost') ? 'http' : 'https';
      paymentUrl = `${protocol}://${baseUrl}/invoice-pay/${storedToken}`;
    }
    
    // Parse job details from stored JSON (use snake_case from database)
    const storedJobDetails = (invoice as any).job_details || (invoice as any).jobDetails;
    const jobDetails = storedJobDetails 
      ? (typeof storedJobDetails === 'string' 
          ? JSON.parse(storedJobDetails) 
          : storedJobDetails)
      : [];
    
    // Convert total to number for the function
    const totalAmount = typeof invoice.total === 'string' 
      ? parseFloat(invoice.total) 
      : invoice.total;
    
    const success = await sendInvoiceToCustomerWithPaymentLink(
      invoice.customerEmail,
      invoice.customerName,
      invoice.invoiceNumber,
      totalAmount,
      formatDate(invoice.dueDate),
      formatDate(invoice.periodStart),
      formatDate(invoice.periodEnd),
      invoice.notes,
      paymentUrl,
      (invoice as any).companyName,
      (invoice as any).businessAddress,
      jobDetails
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Invoice resent to ${invoice.customerEmail}`,
        customerEmail: invoice.customerEmail 
      });
    } else {
      res.status(500).json({ error: "Failed to resend invoice email" });
    }
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
    
    // Check if expired (7 days)
    const expiryTime = new Date(invoiceData.created_at);
    expiryTime.setDate(expiryTime.getDate() + 7);
    if (new Date() > expiryTime) {
      await updateInvoicePaymentToken(token, { status: 'expired' });
      return res.status(410).json({ error: "This payment link has expired" });
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
    
    // Check if expired
    const expiryTime = new Date(invoiceData.created_at);
    expiryTime.setDate(expiryTime.getDate() + 7);
    if (new Date() > expiryTime) {
      await updateInvoicePaymentToken(token, { status: 'expired' });
      return res.status(410).json({ error: "This payment link has expired" });
    }
    
    // Return existing PaymentIntent if already created
    if (invoiceData.payment_intent_id && invoiceData.client_secret) {
      return res.json({
        clientSecret: invoiceData.client_secret,
        paymentIntentId: invoiceData.payment_intent_id,
      });
    }
    
    const stripe = await getUncachableStripeClient();
    
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
    
    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(invoiceData.amount * 100),
      currency: 'gbp',
      customer: stripeCustomerId,
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
    
    // Store PaymentIntent details in database
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

    // Validate UK phone format
    const cleanedPhone = phone.replace(/\s+/g, '');
    const ukPhoneRegex = /^(\+44|0044|0)?[1-9]\d{8,10}$/;
    if (!ukPhoneRegex.test(cleanedPhone)) {
      return res.status(400).json({ error: "Please enter a valid UK phone number" });
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
    
    res.status(200).json({ success: true, message: "Phone number verified successfully" });
  }));

  // Password reset endpoint using Resend for reliable email delivery
  app.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
    const { email, redirectUrl } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Authentication service not configured" });
      }

      // Generate password reset link using Supabase Admin
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
        options: {
          redirectTo: redirectUrl || 'https://www.runcourier.co.uk/reset-password'
        }
      });

      if (error) {
        console.error('Supabase generate link error:', error);
        // Don't reveal if email exists or not for security
        return res.status(200).json({ success: true, message: "If an account exists with this email, you will receive a password reset link." });
      }

      if (data?.properties?.action_link) {
        // Send email using Resend
        const emailSent = await sendPasswordResetEmail(email, data.properties.action_link);
        
        if (!emailSent) {
          console.error('Failed to send password reset email via Resend');
          return res.status(500).json({ error: "Failed to send password reset email. Please try again later." });
        }

        console.log('Password reset email sent successfully to:', email);
      }

      res.status(200).json({ success: true, message: "If an account exists with this email, you will receive a password reset link." });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: "An error occurred. Please try again later." });
    }
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
    
    if (!jobId || !driverId || !assignedBy || !driverPrice) {
      console.log(`[Job Assignment API] Missing required fields - jobId: ${jobId}, driverId: ${driverId}, assignedBy: ${assignedBy}, driverPrice: ${driverPrice}`);
      return res.status(400).json({ error: "Missing required fields: jobId, driverId, assignedBy, driverPrice" });
    }

    // Check if job exists
    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

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

    // Create the assignment
    const assignment = await storage.createJobAssignment({
      jobId,
      driverId,
      assignedBy,
      driverPrice,
      status: "sent",
      sentAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // Automatically update job status to "assigned" AND set the driverId when assignment is created
    // This ensures the job appears in the driver's mobile app immediately
    await storage.updateJob(jobId, {
      status: "assigned" as any,
      driverId: driverId,
      driverPrice: driverPrice
    });
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

    // Create notification for driver
    await storage.createNotification({
      userId: driverUserId,
      title: "New Job Assignment",
      message: `You have been assigned a new job (${job.trackingNumber}). Driver payment: £${driverPrice}. Please accept or decline.`,
      type: "job_assigned",
      data: { assignmentId: assignment.id, jobId },
    });

    // Send push notification to driver's mobile device (with sound)
    sendJobOfferNotification(driverId, {
      jobId,
      trackingNumber: job.trackingNumber,
      pickupAddress: job.pickupAddress,
      deliveryAddress: job.deliveryAddress,
      driverPrice: driverPrice,
      vehicleType: job.vehicleType,
    }).then(result => {
      if (result.success) {
        console.log(`[Job Assignment] Push notification sent to ${result.sentCount} device(s) for driver ${driverId}`);
      } else {
        console.log(`[Job Assignment] No push devices registered for driver ${driverId}`);
      }
    }).catch(err => console.error('[Job Assignment] Failed to send push notification:', err));

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
    if (!driverId || !assignedBy || !driverPrice) {
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

      // Create the assignment
      const assignment = await storage.createJobAssignment({
        jobId,
        driverId,
        assignedBy,
        driverPrice,
        status: "sent",
        sentAt: new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        batchGroupId,
      });

      // Update job status to "assigned" and set driverId
      await storage.updateJob(jobId, {
        status: "assigned" as any,
        driverId: driverId,
        driverPrice: driverPrice
      });

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
      
      // Send push notification for each job in the batch
      for (const assignment of assignments) {
        const job = await storage.getJob(assignment.jobId);
        if (job) {
          sendJobOfferNotification(driverId, {
            jobId: job.id,
            trackingNumber: job.trackingNumber,
            pickupAddress: job.pickupAddress,
            deliveryAddress: job.deliveryAddress,
            driverPrice: driverPrice,
            vehicleType: job.vehicleType,
          }).catch(err => console.error('[Batch Assignment] Failed to send push:', err));
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
    } else if (!accepted) {
      // Driver declined - reset job status to "pending" so it can be reassigned
      await storage.updateJob(assignment.jobId, { status: "pending", driverId: null });
      const reasonText = rejectionReason ? ` Reason: ${rejectionReason}` : '';
      console.log(`[Job Assignment] Driver declined - Job ${assignment.jobId} status reset to 'pending'.${reasonText}`);
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

    res.json(updated);
  }));

  // Admin: Unassign driver from job (works with or without assignment record)
  app.patch("/api/jobs/:id/unassign", asyncHandler(async (req, res) => {
    const { adminUserId, reason } = req.body;
    const jobId = req.params.id;
    
    if (!adminUserId) {
      return res.status(400).json({ error: "adminUserId is required" });
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (!job.driverId) {
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
        message: `Job ${job.trackingNumber} has been unassigned from you by admin.${reason ? ` Reason: ${reason}` : ""}`,
        type: "job_unassigned",
        data: { jobId, trackingNumber: job.trackingNumber },
      });
    }

    // Broadcast job unassignment via WebSocket for real-time mobile app updates
    broadcastJobWithdrawn({
      id: job.id,
      trackingNumber: job.trackingNumber,
      driverId: previousDriverId,
      reason: reason || "Unassigned by admin",
    });

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

  registerMobileRoutes(app);

  // Payment Links Routes
  const PAYMENT_LINK_EXPIRY_HOURS = 72; // Links expire after 72 hours
  const BASE_URL = process.env.APP_URL || 'https://945d2f5a-7336-462a-b33f-10fb0e78a123-00-2bep7zisdjcv3.spock.replit.dev';

  function generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

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
      return res.status(400).json({ 
        error: "An active payment link already exists for this job",
        existingLinkId: existingLink.id 
      });
    }

    // Get customer information - try from user record first, then from provided data, then from job recipient
    let customerEmail: string | undefined;
    let customerName: string;
    let customerId = job.customerId;

    const customer = await storage.getUser(job.customerId);
    if (customer?.email) {
      customerEmail = customer.email;
      customerName = customer.fullName;
    } else if (providedEmail) {
      // Admin provided email directly (for admin-created jobs)
      customerEmail = providedEmail;
      customerName = providedName || job.recipientName || 'Customer';
    } else {
      // No email found - ask admin to provide one
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
    const links = await storage.getPaymentLinks({
      jobId: jobId as string | undefined,
      customerId: customerId as string | undefined,
      status: status as any,
    });
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

    const customer = await storage.getUser(link.customerId);
    if (!customer?.email) {
      return res.status(400).json({ error: "Customer email not found" });
    }

    const paymentUrl = `${BASE_URL}/pay/${link.token}`;

    const emailSent = await sendPaymentLinkEmail(customer.email, {
      customerName: customer.fullName,
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
    });

    if (emailSent) {
      await storage.appendPaymentLinkAuditLog(link.id, "email_resent", adminId, customer.email);
      console.log(`[PaymentLink] Resent payment link email to ${customer.email}`);
    } else {
      // Email failed - notify admin
      await sendPaymentLinkFailureNotification({
        customerName: customer.fullName,
        customerEmail: customer.email,
        trackingNumber: job.trackingNumber,
        amount: `£${parseFloat(link.amount).toFixed(2)}`,
        paymentLink: paymentUrl,
        jobId: link.jobId,
      });
      await storage.appendPaymentLinkAuditLog(link.id, "email_resend_failed", adminId, customer.email);
      console.log(`[PaymentLink] Resend email FAILED for ${customer.email}`);
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
    const link = await storage.getPaymentLinkByToken(token);

    if (!link) {
      return res.status(404).json({ error: "Invalid or expired payment link" });
    }

    // Check if expired
    if (new Date(link.expiresAt) < new Date()) {
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
    
    if (!user || (user.role !== 'admin' && user.role !== 'dispatcher')) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { customerEmail, customerName, companyName, pickupPostcode, pickupAddress, pickupDate, pickupTime, drops, vehicleType, weight, quote, notes } = req.body;

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

  return httpServer;
}
