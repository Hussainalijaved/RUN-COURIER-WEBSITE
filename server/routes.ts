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
import { sendNewJobNotification, sendDriverApplicationNotification, sendDocumentUploadNotification, sendPaymentNotification, sendContactFormSubmission, sendPasswordResetEmail, sendWelcomeEmail, sendNewRegistrationNotification, sendCustomerBookingConfirmation, sendPaymentLinkEmail, sendPaymentConfirmationEmail, sendPaymentLinkFailureNotification } from "./emailService";
import { createHash, randomBytes } from "crypto";
import { broadcastJobUpdate, broadcastJobCreated, broadcastJobAssigned, broadcastDocumentPending } from "./realtime";
import { geocodeAddress } from "./geocoding";
import { sendJobOfferNotification } from "./pushNotifications";

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

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/jobs", asyncHandler(async (req, res) => {
    const { status, customerId, driverId, vendorId, limit = 50 } = req.query;
    const jobs = await storage.getJobs({
      status: status as JobStatus | undefined,
      customerId: customerId as string | undefined,
      driverId: driverId as string | undefined,
      vendorId: vendorId as string | undefined,
      limit: Number(limit),
    });
    res.json(jobs);
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
        totalPrice: jobs.totalPrice,
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
    res.json(job);
  }));

  app.get("/api/jobs/:id", asyncHandler(async (req, res) => {
    const job = await storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
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
    const preprocessedBody = {
      ...req.body,
      trackingNumber,
      driverId: resolvedDriverId, // Use the resolved user_id
      // Convert weight to string if it's a number (schema expects decimal as string)
      weight: typeof req.body.weight === 'number' ? String(req.body.weight) : req.body.weight,
      // Convert date strings to Date objects
      scheduledPickupTime: req.body.scheduledPickupTime ? new Date(req.body.scheduledPickupTime) : undefined,
      scheduledDeliveryTime: req.body.scheduledDeliveryTime ? new Date(req.body.scheduledDeliveryTime) : undefined,
      // Convert numeric fields to strings for decimal columns
      distance: typeof req.body.distance === 'number' ? String(req.body.distance) : req.body.distance,
      basePrice: typeof req.body.basePrice === 'number' ? String(req.body.basePrice) : req.body.basePrice,
      distancePrice: typeof req.body.distancePrice === 'number' ? String(req.body.distancePrice) : req.body.distancePrice,
      weightSurcharge: typeof req.body.weightSurcharge === 'number' ? String(req.body.weightSurcharge) : req.body.weightSurcharge,
      multiDropCharge: typeof req.body.multiDropCharge === 'number' ? String(req.body.multiDropCharge) : req.body.multiDropCharge,
      returnTripCharge: typeof req.body.returnTripCharge === 'number' ? String(req.body.returnTripCharge) : req.body.returnTripCharge,
      centralLondonCharge: typeof req.body.centralLondonCharge === 'number' ? String(req.body.centralLondonCharge) : req.body.centralLondonCharge,
      waitingTimeCharge: typeof req.body.waitingTimeCharge === 'number' ? String(req.body.waitingTimeCharge) : req.body.waitingTimeCharge,
      totalPrice: typeof req.body.totalPrice === 'number' ? String(req.body.totalPrice) : req.body.totalPrice,
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
    // Send admin notification
    await sendNewJobNotification(job.id, job).catch(err => console.error('Failed to send job notification:', err));
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
    
    // Also create a job assignment record so it appears in mobile app's job offers
    if (driverId && driver) {
      try {
        const assignment = await storage.createJobAssignment({
          jobId: job.id,
          driverId: driver.id,
          assignedBy: "admin", // Map assigns as admin
          driverPrice: finalDriverPrice,
          status: "sent", // Immediately sent so driver sees it
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        });
        console.log(`[Jobs] Created job assignment ${assignment.id} for driver ${driver.driverCode || driver.id} with price £${finalDriverPrice}`);
      } catch (err) {
        console.error(`[Jobs] Failed to create job assignment:`, err);
        // Continue anyway - the job is still assigned
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
    
    console.log(`[Jobs] Job ${jobId} visibility for driver: ${hidden ? 'hidden' : 'visible'} by admin ${adminId || 'unknown'}`);
    
    const updatedJob = await storage.getJob(jobId);
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
    
    // First check PostgreSQL for existing driver (permanent storage with permanent driverCode)
    let dbDriver = null;
    try {
      const { db } = await import("./db");
      const { drivers: driversTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const result = await db.select().from(driversTable).where(eq(driversTable.userId, userId)).limit(1);
      if (result.length > 0) {
        dbDriver = result[0];
        console.log(`Found existing driver in PostgreSQL: ${dbDriver.id} with code ${dbDriver.driverCode}`);
      }
    } catch (e) {
      console.error("Error checking PostgreSQL for driver:", e);
    }
    
    // If found in PostgreSQL, return that (with permanent driverCode)
    if (dbDriver) {
      // Ensure in-memory storage is synced with PostgreSQL data
      const memDriver = await storage.getDriverByUserId(userId);
      if (!memDriver) {
        // Load from PostgreSQL into memory
        await storage.createDriver({
          userId: dbDriver.userId,
          driverCode: dbDriver.driverCode, // Use the permanent code from DB
          fullName: dbDriver.fullName,
          email: dbDriver.email,
          phone: dbDriver.phone,
          vehicleType: dbDriver.vehicleType || "car",
          vehicleRegistration: dbDriver.vehicleRegistration,
          vehicleMake: dbDriver.vehicleMake,
          vehicleModel: dbDriver.vehicleModel,
          vehicleColor: dbDriver.vehicleColor,
          isAvailable: dbDriver.isAvailable ?? false,
          isVerified: dbDriver.isVerified ?? false,
          rating: dbDriver.rating ?? "5.00",
          totalJobs: dbDriver.totalJobs ?? 0,
        });
      }
      return res.json(dbDriver);
    }
    
    // Check in-memory storage
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
                  is_available: driver.isAvailable ?? false,
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
          if (safeBody.isAvailable !== undefined) supabaseUpdateData.is_available = safeBody.isAvailable;
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

  // Delete driver permanently
  app.delete("/api/drivers/:id", asyncHandler(async (req, res) => {
    const driverId = req.params.id;
    
    // Check if driver exists (include inactive)
    const allDrivers = await storage.getDrivers({ includeInactive: true });
    const driver = allDrivers.find(d => d.id === driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Delete from in-memory storage
    const deleted = await storage.deleteDriver(driverId);
    if (!deleted) {
      return res.status(500).json({ error: "Failed to delete driver" });
    }
    
    // Delete from PostgreSQL
    try {
      const { db } = await import("./db");
      const { drivers: driversTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.delete(driversTable).where(eq(driversTable.id, driverId));
      console.log(`[Drivers] Deleted driver from PostgreSQL: ${driverId}`);
    } catch (e) {
      console.error("Failed to delete driver from PostgreSQL:", e);
    }
    
    // Delete from Supabase drivers table
    try {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin
          .from('drivers')
          .delete()
          .or(`id.eq.${driverId},user_id.eq.${driverId}`);
        
        if (error) {
          console.error("Failed to delete driver from Supabase:", error);
        } else {
          console.log(`[Drivers] Deleted driver from Supabase: ${driverId}`);
        }
      }
    } catch (e) {
      console.error("Failed to delete driver from Supabase:", e);
    }
    
    console.log(`[Drivers] Permanently deleted driver ${driverId}`);
    res.json({ success: true, message: "Driver permanently deleted" });
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
    
    // First try to get documents from PostgreSQL database for persistence
    try {
      const { db } = await import("./db");
      const { documents: documentsTable } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      let dbDocuments;
      
      // Build query with proper condition handling
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
      
      if (dbDocuments && dbDocuments.length > 0) {
        return res.json(dbDocuments);
      }
    } catch (e) {
      console.error("Failed to fetch documents from PostgreSQL, falling back to memory:", e);
    }
    
    // Fallback to in-memory storage
    const documents = await storage.getDocuments({
      driverId: driverId as string | undefined,
      status: status as string | undefined,
      type: type as string | undefined,
    });
    res.json(documents);
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
    const { status, reviewedBy, reviewNotes } = req.body;
    const reviewedAt = new Date();
    
    // First try in-memory storage
    let document = await storage.reviewDocument(req.params.id, status, reviewedBy, reviewNotes);
    
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
  app.get("/api/invoices", asyncHandler(async (req, res) => {
    const { customerId, status } = req.query;
    const invoices = await storage.getInvoices({
      customerId: customerId as string,
      status: status as any,
    });
    res.json(invoices);
  }));

  app.get("/api/invoices/:id", asyncHandler(async (req, res) => {
    const invoice = await storage.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(invoice);
  }));

  app.get("/api/invoices/:id/details", asyncHandler(async (req, res) => {
    const result = await storage.getInvoiceWithJobs(req.params.id);
    if (!result) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(result);
  }));

  app.patch("/api/invoices/:id", asyncHandler(async (req, res) => {
    const invoice = await storage.updateInvoice(req.params.id, req.body);
    // Send admin notification if invoice was created
    if (invoice && req.body.status) {
      await sendPaymentNotification(invoice.invoiceNumber, invoice.total, new Date(invoice.dueDate).toLocaleDateString()).catch(err => console.error('Failed to send payment notification:', err));
    }
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(invoice);
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
    const { jobId, driverId, assignedBy, driverPrice, expiresAt } = req.body;
    
    if (!jobId || !driverId || !assignedBy || !driverPrice) {
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
