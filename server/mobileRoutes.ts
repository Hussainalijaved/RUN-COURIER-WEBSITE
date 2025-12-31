import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { requireSupabaseAuth, requireDriverRole } from "./mobileAuth";
import { broadcastLocationUpdate, broadcastDriverAvailability } from "./realtime";
import { db } from "./db";
import { jobs as jobsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { JobStatus, Job } from "@shared/schema";
import multer from "multer";
import path from "path";
import { supabaseAdmin } from "./supabaseAdmin";

// Helper to map Supabase job to local Job format for mobile API response
function mapSupabaseJobToMobileFormat(job: any) {
  return {
    id: String(job.id),
    trackingNumber: job.tracking_number,
    status: job.status,
    pickupAddress: job.pickup_address,
    pickupPostcode: null,
    pickupInstructions: job.notes,
    pickupLatitude: job.pickup_lat?.toString() || null,
    pickupLongitude: job.pickup_lng?.toString() || null,
    deliveryAddress: job.dropoff_address,
    deliveryPostcode: null,
    deliveryInstructions: null,
    deliveryLatitude: job.dropoff_lat?.toString() || null,
    deliveryLongitude: job.dropoff_lng?.toString() || null,
    recipientName: job.recipient_name,
    recipientPhone: job.recipient_phone,
    senderName: job.sender_name,
    senderPhone: job.sender_phone,
    vehicleType: job.vehicle_type,
    distance: job.distance_miles?.toString() || null,
    weight: job.parcel_weight?.toString() || null,
    driverPrice: job.price_driver?.toString() || null,
    scheduledPickupTime: job.scheduled_pickup_time,
    isMultiDrop: false,
    isReturnTrip: false,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

// POD uploads - use memory storage for Supabase upload
const uploadPod = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

// Upload file to Supabase Storage and return public URL
async function uploadToSupabaseStorage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string | null> {
  if (!supabaseAdmin) {
    console.error('[POD Upload] Supabase admin client not initialized');
    return null;
  }

  const bucket = 'pod-uploads';
  
  // Ensure bucket exists (only needed once, but safe to call)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.find(b => b.name === bucket)) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
    });
    if (createError && !createError.message.includes('already exists')) {
      console.error('[POD Upload] Failed to create bucket:', createError);
    }
  }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error('[POD Upload] Supabase upload error:', error);
    return null;
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(filename);

  return urlData.publicUrl;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const VALID_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending: [],
  assigned: ["accepted", "cancelled"],
  offered: ["accepted", "cancelled"],
  accepted: ["on_the_way_pickup", "cancelled"],
  on_the_way_pickup: ["arrived_pickup", "cancelled"],
  arrived_pickup: ["collected", "picked_up", "cancelled"],
  picked_up: ["on_the_way", "on_the_way_delivery", "cancelled"],
  collected: ["on_the_way_delivery", "cancelled"],
  on_the_way: ["delivered", "cancelled"],
  on_the_way_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function registerMobileRoutes(app: Express): void {
  
  // Logging middleware for all mobile API calls
  app.use("/api/mobile", (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[Mobile API] ${timestamp} ${req.method} ${req.path} from ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
    if (req.headers.authorization) {
      console.log(`[Mobile API] Auth header present: ${req.headers.authorization.substring(0, 20)}...`);
    }
    next();
  });
  
  // Health check endpoint - no auth required
  app.get("/api/mobile/v1/health", (req, res) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: "/api/mobile/v1/debug/auth",
        profile: "/api/mobile/v1/driver/profile",
        jobs: "/api/mobile/v1/driver/jobs",
        jobOffers: "/api/mobile/v1/driver/job-offers",
        location: "/api/mobile/v1/driver/location",
        availability: "/api/mobile/v1/driver/availability",
        status: "/api/driver/status",
        websocket: "/ws/realtime"
      }
    });
  });

  // Combined status endpoint for mobile app - handles both online status and location
  // This is what the mobile app calls when going online/offline
  app.post("/api/driver/status",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { isOnline, latitude, longitude, heading, speed } = req.body;

      // Check if driver is active
      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }

      // Determine online status - default to current state if not specified
      const newOnlineStatus = typeof isOnline === 'boolean' ? isOnline : (driver.isAvailable === true);
      
      console.log(`[Driver Status] ${driver.driverCode || driver.id} updating: online=${newOnlineStatus}, lat=${latitude}, lng=${longitude}`);

      // Update availability
      const updatedDriver = await storage.updateDriverAvailability(driver.id, newOnlineStatus);

      if (!updatedDriver) {
        return res.status(404).json({ 
          error: "Driver not found",
          code: "DRIVER_NOT_FOUND"
        });
      }

      // Update location if provided
      let locationUpdated = false;
      if (latitude !== undefined && longitude !== undefined) {
        const lat = parseFloat(String(latitude));
        const lng = parseFloat(String(longitude));
        
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          await storage.updateDriverLocation(driver.id, lat.toFixed(7), lng.toFixed(7));
          locationUpdated = true;
          
          // Broadcast location update to WebSocket for admin maps
          broadcastLocationUpdate(driver.id, lat, lng, newOnlineStatus ? "available" : "offline");
        }
      }

      // Always broadcast availability change to WebSocket subscribers
      // This ensures admin map gets updates even when no location is provided
      await broadcastDriverAvailability(driver.id, newOnlineStatus === true);

      res.json({
        success: true,
        isOnline: updatedDriver.isAvailable,
        driverId: driver.id,
        driverCode: driver.driverCode,
        locationUpdated,
      });
    })
  );

  // Debug endpoint to check auth and driver lookup
  app.get("/api/mobile/v1/debug/auth",
    requireSupabaseAuth,
    asyncHandler(async (req, res) => {
      const authUser = req.auth!;
      console.log("[Mobile Debug] Auth user ID:", authUser.id);
      console.log("[Mobile Debug] Auth user email:", authUser.email);
      console.log("[Mobile Debug] Auth user role:", authUser.role);
      
      // Try to find driver by the auth ID directly
      const memoryDriverById = await storage.getDriver(authUser.id);
      // Try to find driver by userId
      const memoryDriverByUserId = await storage.getDriverByUserId(authUser.id);
      const driver = memoryDriverById || memoryDriverByUserId;
      
      // Get jobs for this driver
      let jobCount = 0;
      let jobs: any[] = [];
      if (driver) {
        const memoryJobs = await storage.getJobs({ driverId: driver.id });
        const dbJobs = await db.select().from(jobsTable).where(eq(jobsTable.driverId, driver.id));
        // Merge
        const jobMap = new Map<string, any>();
        memoryJobs.forEach(j => jobMap.set(j.id, j));
        dbJobs.forEach(j => jobMap.set(j.id, j));
        jobs = Array.from(jobMap.values());
        jobCount = jobs.length;
      }
      
      res.json({
        authUserId: authUser.id,
        authEmail: authUser.email,
        authRole: authUser.role,
        driverFoundById: !!memoryDriverById,
        driverFoundByUserId: !!memoryDriverByUserId,
        driverId: driver?.id || null,
        driverCode: driver?.driverCode || null,
        isVerified: driver?.isVerified || false,
        isActive: driver?.isActive !== false,
        jobCount,
        jobs: jobs.map(j => ({ id: j.id, trackingNumber: j.trackingNumber, status: j.status, driverId: j.driverId })),
        message: driver ? `Driver found! ID: ${driver.id}, Code: ${driver.driverCode}` : "Driver NOT found"
      });
    })
  );

  // Debug endpoint to list all drivers (admin use only - for debugging)
  app.get("/api/mobile/v1/debug/drivers",
    asyncHandler(async (req, res) => {
      const allDrivers = await storage.getDrivers({ includeInactive: true });
      res.json({
        count: allDrivers.length,
        drivers: allDrivers.map(d => ({
          id: d.id,
          userId: d.userId,
          driverCode: d.driverCode,
          fullName: d.fullName,
          email: d.email,
          isVerified: d.isVerified,
          isActive: d.isActive !== false
        }))
      });
    })
  );

  app.get("/api/mobile/v1/driver/profile", 
    requireSupabaseAuth, 
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      
      res.json({
        id: driver.id,
        userId: driver.userId,
        vehicleType: driver.vehicleType,
        vehicleRegistration: driver.vehicleRegistration,
        vehicleMake: driver.vehicleMake,
        vehicleModel: driver.vehicleModel,
        vehicleColor: driver.vehicleColor,
        isAvailable: driver.isAvailable,
        isVerified: driver.isVerified,
        rating: driver.rating,
        totalJobs: driver.totalJobs,
        currentLatitude: driver.currentLatitude,
        currentLongitude: driver.currentLongitude,
        lastLocationUpdate: driver.lastLocationUpdate,
      });
    })
  );

  app.patch("/api/mobile/v1/driver/location",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      
      // Check if driver is active
      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }
      
      const { latitude, longitude, speed, heading, accuracy } = req.body;

      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ 
          error: "Latitude and longitude are required",
          code: "MISSING_COORDINATES"
        });
      }

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ 
          error: "Invalid coordinates",
          code: "INVALID_COORDINATES"
        });
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ 
          error: "Coordinates out of range",
          code: "COORDINATES_OUT_OF_RANGE"
        });
      }

      const updatedDriver = await storage.updateDriverLocation(
        driver.id, 
        lat.toFixed(7), 
        lng.toFixed(7)
      );

      if (!updatedDriver) {
        return res.status(404).json({ 
          error: "Driver not found",
          code: "DRIVER_NOT_FOUND"
        });
      }

      broadcastLocationUpdate(driver.id, lat, lng, driver.isAvailable ? "available" : "busy");

      res.json({
        success: true,
        location: {
          latitude: updatedDriver.currentLatitude,
          longitude: updatedDriver.currentLongitude,
          updatedAt: updatedDriver.lastLocationUpdate,
        },
        websocket: {
          url: "/ws/realtime",
          hint: "Use WebSocket for real-time location updates when available"
        }
      });
    })
  );

  app.patch("/api/mobile/v1/driver/availability",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      
      // Check if driver is active
      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }
      
      const { isAvailable } = req.body;

      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ 
          error: "isAvailable must be a boolean",
          code: "INVALID_AVAILABILITY"
        });
      }

      const updatedDriver = await storage.updateDriverAvailability(driver.id, isAvailable);

      if (!updatedDriver) {
        return res.status(404).json({ 
          error: "Driver not found",
          code: "DRIVER_NOT_FOUND"
        });
      }

      // Broadcast driver online/offline status to admin maps
      await broadcastDriverAvailability(driver.id, isAvailable);
      console.log(`[Mobile] Driver ${driver.driverCode || driver.id} is now ${isAvailable ? 'ONLINE' : 'OFFLINE'}`);

      res.json({
        success: true,
        isAvailable: updatedDriver.isAvailable,
      });
    })
  );

  app.get("/api/mobile/v1/driver/jobs",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { status } = req.query;

      console.log(`[Mobile Jobs] Fetching jobs for driver ${driver.driverCode} (${driver.id})`);

      let mobileJobs: any[] = [];

      // CRITICAL: Query Supabase FIRST as it's the source of truth
      if (supabaseAdmin) {
        console.log("[Mobile Jobs] Querying Supabase for jobs...");
        const { data: supabaseJobs, error: supabaseError } = await supabaseAdmin
          .from('jobs')
          .select('*')
          .eq('driver_id', driver.id)
          .order('created_at', { ascending: false });
        
        if (supabaseError) {
          console.log("[Mobile Jobs] Supabase query error:", supabaseError.message);
        } else if (supabaseJobs && supabaseJobs.length > 0) {
          console.log(`[Mobile Jobs] Found ${supabaseJobs.length} jobs in Supabase`);
          
          let filteredJobs = supabaseJobs;
          
          // CRITICAL: Only show jobs to drivers that have a price set by admin
          // Jobs without price_driver should not appear in the driver's app
          filteredJobs = filteredJobs.filter(j => j.price_driver != null);
          console.log(`[Mobile Jobs] After price filter: ${filteredJobs.length} jobs with price set`);
          
          // Apply status filters
          // "active" = jobs the driver has ACCEPTED and is working on
          // "pending" = job offers waiting for driver to accept/decline
          if (status === "active") {
            filteredJobs = filteredJobs.filter(j => 
              ["accepted", "on_the_way_pickup", "arrived_pickup", "collected", "on_the_way_delivery", "picked_up", "on_the_way"].includes(j.status)
            );
          } else if (status === "pending") {
            filteredJobs = filteredJobs.filter(j => ["assigned", "pending", "offered"].includes(j.status));
          } else if (status === "completed") {
            filteredJobs = filteredJobs.filter(j => ["delivered", "cancelled", "failed"].includes(j.status));
          }
          
          mobileJobs = filteredJobs.map(mapSupabaseJobToMobileFormat);
          
          return res.json({
            jobs: mobileJobs,
            count: mobileJobs.length,
          });
        }
      }

      // Fallback to local storage/database if Supabase query fails or returns empty
      console.log("[Mobile Jobs] Falling back to local storage...");
      let memoryJobs = await storage.getJobs({ driverId: driver.id });
      const dbJobs = await db.select().from(jobsTable).where(eq(jobsTable.driverId, driver.id));
      
      // Merge jobs, preferring database versions for duplicates
      const jobMap = new Map<string, Job>();
      memoryJobs.forEach(j => jobMap.set(j.id, j));
      dbJobs.forEach(j => jobMap.set(j.id, j));
      let jobs = Array.from(jobMap.values());
      
      // Filter out hidden jobs (unless viewing completed/history)
      jobs = jobs.filter(j => (j as any).driverHidden !== true);
      
      // CRITICAL: Only show jobs with admin-assigned price
      jobs = jobs.filter(j => j.driverPrice != null);

      // "active" = jobs the driver has ACCEPTED and is working on
      // "pending" = job offers waiting for driver to accept/decline
      if (status === "active") {
        jobs = jobs.filter(j => 
          ["accepted", "on_the_way_pickup", "arrived_pickup", "collected", "on_the_way_delivery", "picked_up", "on_the_way"].includes(j.status)
        );
      } else if (status === "pending") {
        jobs = jobs.filter(j => ["assigned", "pending", "offered"].includes(j.status));
      } else if (status === "completed") {
        jobs = jobs.filter(j => ["delivered", "cancelled"].includes(j.status));
      }

      mobileJobs = jobs.map(job => ({
        id: job.id,
        trackingNumber: job.trackingNumber,
        status: job.status,
        pickupAddress: job.pickupAddress,
        pickupPostcode: job.pickupPostcode,
        pickupInstructions: job.pickupInstructions,
        pickupLatitude: job.pickupLatitude,
        pickupLongitude: job.pickupLongitude,
        deliveryAddress: job.deliveryAddress,
        deliveryPostcode: job.deliveryPostcode,
        deliveryInstructions: job.deliveryInstructions,
        deliveryLatitude: job.deliveryLatitude,
        deliveryLongitude: job.deliveryLongitude,
        recipientName: job.recipientName,
        recipientPhone: job.recipientPhone,
        vehicleType: job.vehicleType,
        distance: job.distance,
        weight: job.weight,
        driverPrice: job.driverPrice,
        scheduledPickupTime: job.scheduledPickupTime,
        isMultiDrop: job.isMultiDrop,
        isReturnTrip: job.isReturnTrip,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }));

      res.json({
        jobs: mobileJobs,
        count: mobileJobs.length,
      });
    })
  );

  app.get("/api/mobile/v1/driver/jobs/:jobId",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { jobId } = req.params;

      // Try storage first (which queries Supabase)
      let job = await storage.getJob(jobId);
      let supabaseJob: any = null;
      
      // If not found, query Supabase directly
      if (!job && supabaseAdmin) {
        console.log(`[Job Details] Job ${jobId} not in storage, querying Supabase...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (!error && data) {
          supabaseJob = data;
          console.log(`[Job Details] Found job ${jobId} in Supabase`);
        }
      }

      if (!job && !supabaseJob) {
        return res.status(404).json({ 
          error: "Job not found",
          code: "JOB_NOT_FOUND"
        });
      }

      // Use Supabase data if local job not found
      const effectiveDriverId = job?.driverId || supabaseJob?.driver_id;
      
      if (effectiveDriverId !== driver.id) {
        return res.status(403).json({ 
          error: "This job is not assigned to you",
          code: "NOT_YOUR_JOB"
        });
      }

      // Include driver's current location for map display
      const driverLocation = {
        latitude: driver.currentLatitude,
        longitude: driver.currentLongitude,
        lastUpdate: driver.lastLocationUpdate,
      };

      // Build response from either source
      if (job) {
        res.json({
          id: job.id,
          trackingNumber: job.trackingNumber,
          status: job.status,
          pickupAddress: job.pickupAddress,
          pickupPostcode: job.pickupPostcode,
          pickupInstructions: job.pickupInstructions,
          pickupLatitude: job.pickupLatitude,
          pickupLongitude: job.pickupLongitude,
          deliveryAddress: job.deliveryAddress,
          deliveryPostcode: job.deliveryPostcode,
          deliveryInstructions: job.deliveryInstructions,
          deliveryLatitude: job.deliveryLatitude,
          deliveryLongitude: job.deliveryLongitude,
          recipientName: job.recipientName,
          recipientPhone: job.recipientPhone,
          vehicleType: job.vehicleType,
          distance: job.distance,
          weight: job.weight,
          driverPrice: job.driverPrice,
          scheduledPickupTime: job.scheduledPickupTime,
          isMultiDrop: job.isMultiDrop,
          isReturnTrip: job.isReturnTrip,
          podPhotoUrl: job.podPhotoUrl,
          podPhotos: job.podPhotos || [],
          podSignatureUrl: job.podSignatureUrl,
          podNotes: job.podNotes,
          podRecipientName: job.podRecipientName,
          deliveredAt: job.deliveredAt,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          driverLocation,
        });
      } else {
        // Map from Supabase format (snake_case to camelCase)
        res.json({
          id: String(supabaseJob.id),
          trackingNumber: supabaseJob.tracking_number,
          status: supabaseJob.status,
          pickupAddress: supabaseJob.pickup_address,
          pickupPostcode: supabaseJob.pickup_postcode || null,
          pickupInstructions: supabaseJob.notes || supabaseJob.pickup_instructions,
          pickupLatitude: supabaseJob.pickup_lat?.toString() || supabaseJob.pickup_latitude || null,
          pickupLongitude: supabaseJob.pickup_lng?.toString() || supabaseJob.pickup_longitude || null,
          deliveryAddress: supabaseJob.dropoff_address || supabaseJob.delivery_address,
          deliveryPostcode: supabaseJob.delivery_postcode || null,
          deliveryInstructions: supabaseJob.delivery_instructions || null,
          deliveryLatitude: supabaseJob.dropoff_lat?.toString() || supabaseJob.delivery_latitude || null,
          deliveryLongitude: supabaseJob.dropoff_lng?.toString() || supabaseJob.delivery_longitude || null,
          recipientName: supabaseJob.recipient_name,
          recipientPhone: supabaseJob.recipient_phone,
          senderName: supabaseJob.sender_name || supabaseJob.pickup_contact_name,
          senderPhone: supabaseJob.sender_phone || supabaseJob.pickup_contact_phone,
          customerName: supabaseJob.customer_name,
          customerPhone: supabaseJob.customer_phone,
          customerEmail: supabaseJob.customer_email,
          vehicleType: supabaseJob.vehicle_type,
          distance: supabaseJob.distance_miles?.toString() || supabaseJob.distance || null,
          weight: supabaseJob.parcel_weight?.toString() || supabaseJob.weight || null,
          driverPrice: supabaseJob.price_driver?.toString() || supabaseJob.driver_price || null,
          scheduledPickupTime: supabaseJob.scheduled_pickup_time,
          isMultiDrop: supabaseJob.is_multi_drop || false,
          isReturnTrip: supabaseJob.is_return_trip || false,
          podPhotoUrl: supabaseJob.pod_photo_url,
          podPhotos: supabaseJob.pod_photos || [],
          podSignatureUrl: supabaseJob.pod_signature_url,
          podNotes: supabaseJob.pod_notes,
          podRecipientName: supabaseJob.pod_recipient_name,
          deliveredAt: supabaseJob.delivered_at,
          createdAt: supabaseJob.created_at,
          updatedAt: supabaseJob.updated_at,
          driverLocation,
        });
      }
    })
  );

  app.patch("/api/mobile/v1/driver/jobs/:jobId/status",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      
      // Check if driver is active
      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }
      
      const { jobId } = req.params;
      const { status, rejectionReason } = req.body;

      // Try storage first, then query Supabase directly
      let job = await storage.getJob(jobId);
      let supabaseJob: any = null;
      
      if (!job && supabaseAdmin) {
        console.log(`[Status Update] Job ${jobId} not in storage, querying Supabase...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (!error && data) {
          supabaseJob = data;
          console.log(`[Status Update] Found job ${jobId} in Supabase, status: ${data.status}`);
        }
      }

      if (!job && !supabaseJob) {
        return res.status(404).json({ 
          error: "Job not found",
          code: "JOB_NOT_FOUND"
        });
      }

      // Use Supabase data if local job not found
      const effectiveDriverId = job?.driverId || supabaseJob?.driver_id;
      const effectiveStatus = job?.status || supabaseJob?.status;
      const existingPhotoUrl = job?.podPhotoUrl || supabaseJob?.pod_photo_url;
      const existingSignatureUrl = job?.podSignatureUrl || supabaseJob?.pod_signature_url;

      if (effectiveDriverId !== driver.id) {
        return res.status(403).json({ 
          error: "This job is not assigned to you",
          code: "NOT_YOUR_JOB"
        });
      }

      const allowedTransitions = VALID_JOB_TRANSITIONS[effectiveStatus as JobStatus] || [];
      
      if (!allowedTransitions.includes(status)) {
        return res.status(400).json({ 
          error: `Cannot transition from '${effectiveStatus}' to '${status}'`,
          code: "INVALID_TRANSITION",
          currentStatus: effectiveStatus,
          allowedTransitions,
        });
      }

      // Require POD (photo or signature) before marking as delivered
      if (status === "delivered") {
        if (!existingPhotoUrl && !existingSignatureUrl) {
          return res.status(400).json({ 
            error: "Proof of Delivery (photo or signature) is required before marking as delivered",
            code: "POD_REQUIRED",
            hint: "Please upload POD using the /api/mobile/v1/driver/jobs/:jobId/pod endpoint first"
          });
        }
      }

      const updatedJob = await storage.updateJobStatus(jobId, status, rejectionReason);

      if (!updatedJob) {
        return res.status(500).json({ 
          error: "Failed to update job status",
          code: "UPDATE_FAILED"
        });
      }

      res.json({
        success: true,
        job: {
          id: updatedJob.id,
          trackingNumber: updatedJob.trackingNumber,
          status: updatedJob.status,
          updatedAt: updatedJob.updatedAt,
        },
      });
    })
  );

  // Helper to upload base64 image to Supabase Storage
  async function uploadBase64ToSupabase(
    base64Data: string,
    jobId: string,
    type: 'photo' | 'signature'
  ): Promise<string | null> {
    if (!supabaseAdmin) {
      console.error('[POD Upload] Supabase admin client not initialized');
      return null;
    }

    try {
      console.log(`[POD Upload] Processing ${type} for job ${jobId}, data length: ${base64Data?.length || 0}`);
      
      if (!base64Data || typeof base64Data !== 'string') {
        console.error('[POD Upload] Invalid base64 data - empty or not a string');
        return null;
      }

      // Handle base64 data - remove data URL prefix if present
      let base64String = base64Data;
      let contentType = 'image/jpeg';
      
      if (base64Data.includes(',')) {
        const parts = base64Data.split(',');
        if (parts.length < 2 || !parts[1]) {
          console.error('[POD Upload] Invalid base64 data URL format - missing data after comma');
          return null;
        }
        base64String = parts[1];
        // Extract content type from data URL
        const match = parts[0].match(/data:([^;]+);/);
        if (match) {
          contentType = match[1];
        }
      }

      if (!base64String || base64String.length === 0) {
        console.error('[POD Upload] Empty base64 string after parsing');
        return null;
      }

      console.log(`[POD Upload] Creating buffer from base64 string, length: ${base64String.length}, contentType: ${contentType}`);
      const buffer = Buffer.from(base64String, 'base64');
      
      if (buffer.length === 0) {
        console.error('[POD Upload] Buffer is empty after base64 decode');
        return null;
      }
      
      console.log(`[POD Upload] Buffer created, size: ${buffer.length} bytes`);
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      const filename = `job_${jobId}/${type}_${timestamp}_${random}${ext}`;

      const bucket = 'pod-uploads';
      
      // Ensure bucket exists
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.find(b => b.name === bucket)) {
        const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024,
        });
        if (createError && !createError.message.includes('already exists')) {
          console.error('[POD Upload] Failed to create bucket:', createError);
        }
      }

      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(filename, buffer, {
          contentType,
          upsert: true,
        });

      if (error) {
        console.error('[POD Upload] Supabase upload error:', error);
        return null;
      }

      const { data: urlData } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(filename);

      console.log(`[POD Upload] Base64 ${type} uploaded to: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    } catch (err) {
      console.error('[POD Upload] Error processing base64:', err);
      return null;
    }
  }

  app.post("/api/mobile/v1/driver/jobs/:jobId/pod",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      
      // Check if driver is active
      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }
      
      const { jobId } = req.params;
      const { podPhotoUrl, podSignatureUrl, photo, signature, recipientName } = req.body;

      console.log(`[POD Upload] Received POD for job ${jobId}:`, {
        hasPhotoUrl: !!podPhotoUrl,
        hasSignatureUrl: !!podSignatureUrl,
        hasPhotoBase64: !!photo,
        hasSignatureBase64: !!signature,
        recipientName: recipientName || 'none'
      });

      // Try storage first, then query Supabase directly
      let job = await storage.getJob(jobId);
      let supabaseJob: any = null;
      
      if (!job && supabaseAdmin) {
        console.log(`[POD Upload] Job ${jobId} not in local storage, querying Supabase...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (!error && data) {
          supabaseJob = data;
          console.log(`[POD Upload] Found job ${jobId} in Supabase, status: ${data.status}`);
        } else {
          console.log(`[POD Upload] Job ${jobId} not found in Supabase:`, error?.message);
        }
      }

      if (!job && !supabaseJob) {
        return res.status(404).json({ 
          error: "Job not found",
          code: "JOB_NOT_FOUND"
        });
      }

      // Use Supabase job data if local job not found
      const effectiveDriverId = job?.driverId || supabaseJob?.driver_id;
      const effectiveStatus = job?.status || supabaseJob?.status;
      const existingPhotoUrl = job?.podPhotoUrl || supabaseJob?.pod_photo_url;
      const existingSignatureUrl = job?.podSignatureUrl || supabaseJob?.pod_signature_url;
      const existingRecipientName = job?.podRecipientName || supabaseJob?.pod_recipient_name;

      if (effectiveDriverId !== driver.id) {
        return res.status(403).json({ 
          error: "This job is not assigned to you",
          code: "NOT_YOUR_JOB"
        });
      }

      if (!["on_the_way_delivery", "delivered"].includes(effectiveStatus)) {
        console.log(`[POD Upload] Invalid status for job ${jobId}: ${effectiveStatus}`);
        return res.status(400).json({ 
          error: "POD can only be uploaded during delivery phase",
          code: "INVALID_POD_TIMING"
        });
      }

      // Handle photo - either URL or base64
      let finalPhotoUrl = podPhotoUrl || existingPhotoUrl;
      if (photo && typeof photo === 'string') {
        // It's base64 data, upload to Supabase
        const uploadedUrl = await uploadBase64ToSupabase(photo, jobId, 'photo');
        if (uploadedUrl) {
          finalPhotoUrl = uploadedUrl;
        } else {
          return res.status(500).json({ 
            error: "Failed to upload photo",
            code: "PHOTO_UPLOAD_FAILED"
          });
        }
      }

      // Handle signature - either URL or base64
      let finalSignatureUrl = podSignatureUrl || existingSignatureUrl;
      if (signature && typeof signature === 'string') {
        // It's base64 data, upload to Supabase
        const uploadedUrl = await uploadBase64ToSupabase(signature, jobId, 'signature');
        if (uploadedUrl) {
          finalSignatureUrl = uploadedUrl;
        } else {
          return res.status(500).json({ 
            error: "Failed to upload signature",
            code: "SIGNATURE_UPLOAD_FAILED"
          });
        }
      }

      const finalRecipientName = recipientName || existingRecipientName;
      const updatedJob = await storage.updateJobPOD(jobId, finalPhotoUrl, finalSignatureUrl, finalRecipientName);

      if (!updatedJob) {
        return res.status(500).json({ 
          error: "Failed to save POD",
          code: "POD_UPLOAD_FAILED"
        });
      }

      console.log(`[POD Upload] Job ${jobId} POD saved: photo=${finalPhotoUrl ? 'yes' : 'no'}, signature=${finalSignatureUrl ? 'yes' : 'no'}`);

      res.json({
        success: true,
        pod: {
          photoUrl: updatedJob.podPhotoUrl,
          signatureUrl: updatedJob.podSignatureUrl,
          recipientName: updatedJob.podRecipientName,
        },
      });
    })
  );

  // POD File Upload endpoint - accepts actual image files
  // Fields: 'photo' for delivery photo, 'signature' for recipient signature
  app.post("/api/mobile/v1/driver/jobs/:jobId/pod/upload",
    requireSupabaseAuth,
    requireDriverRole,
    (req, res, next) => {
      uploadPod.fields([
        { name: 'photo', maxCount: 1 },
        { name: 'signature', maxCount: 1 }
      ])(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ error: "File size exceeds 10MB limit", code: "FILE_TOO_LARGE" });
            }
            return res.status(400).json({ error: err.message, code: "UPLOAD_ERROR" });
          }
          return res.status(400).json({ error: err.message || "Invalid file", code: "INVALID_FILE" });
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      
      // Check if driver is active
      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }
      
      const { jobId } = req.params;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const recipientName = req.body.recipientName as string | undefined;

      // Try storage first, then query Supabase directly
      let job = await storage.getJob(jobId);
      let supabaseJob: any = null;
      
      if (!job && supabaseAdmin) {
        console.log(`[POD File Upload] Job ${jobId} not in local storage, querying Supabase...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (!error && data) {
          supabaseJob = data;
          console.log(`[POD File Upload] Found job ${jobId} in Supabase, status: ${data.status}`);
        } else {
          console.log(`[POD File Upload] Job ${jobId} not found in Supabase:`, error?.message);
        }
      }

      if (!job && !supabaseJob) {
        return res.status(404).json({ 
          error: "Job not found",
          code: "JOB_NOT_FOUND"
        });
      }

      // Use Supabase job data if local job not found
      const effectiveDriverId = job?.driverId || supabaseJob?.driver_id;
      const effectiveStatus = job?.status || supabaseJob?.status;
      const existingPhotoUrl = job?.podPhotoUrl || supabaseJob?.pod_photo_url;
      const existingSignatureUrl = job?.podSignatureUrl || supabaseJob?.pod_signature_url;
      const existingRecipientName = job?.podRecipientName || supabaseJob?.pod_recipient_name;

      if (effectiveDriverId !== driver.id) {
        return res.status(403).json({ 
          error: "This job is not assigned to you",
          code: "NOT_YOUR_JOB"
        });
      }

      if (!["on_the_way_delivery", "delivered"].includes(effectiveStatus)) {
        console.log(`[POD File Upload] Invalid status for job ${jobId}: ${effectiveStatus}`);
        return res.status(400).json({ 
          error: "POD can only be uploaded during delivery phase",
          code: "INVALID_POD_TIMING"
        });
      }

      // Upload files to Supabase Storage
      let podPhotoUrl: string | undefined;
      let podSignatureUrl: string | undefined;

      if (files['photo'] && files['photo'][0]) {
        const file = files['photo'][0];
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `job_${jobId}/photo_${timestamp}_${random}${ext}`;
        
        const url = await uploadToSupabaseStorage(file.buffer, filename, file.mimetype);
        if (url) {
          podPhotoUrl = url;
          console.log(`[POD Upload] Photo uploaded to Supabase: ${url}`);
        } else {
          return res.status(500).json({ 
            error: "Failed to upload photo to storage",
            code: "PHOTO_UPLOAD_FAILED"
          });
        }
      }

      if (files['signature'] && files['signature'][0]) {
        const file = files['signature'][0];
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(file.originalname) || '.png';
        const filename = `job_${jobId}/signature_${timestamp}_${random}${ext}`;
        
        const url = await uploadToSupabaseStorage(file.buffer, filename, file.mimetype);
        if (url) {
          podSignatureUrl = url;
          console.log(`[POD Upload] Signature uploaded to Supabase: ${url}`);
        } else {
          return res.status(500).json({ 
            error: "Failed to upload signature to storage",
            code: "SIGNATURE_UPLOAD_FAILED"
          });
        }
      }

      if (!podPhotoUrl && !podSignatureUrl) {
        return res.status(400).json({ 
          error: "At least one file (photo or signature) is required",
          code: "NO_FILES_UPLOADED"
        });
      }

      // Keep existing POD if not uploading new one
      const finalPhotoUrl = podPhotoUrl || existingPhotoUrl || undefined;
      const finalSignatureUrl = podSignatureUrl || existingSignatureUrl || undefined;
      const finalRecipientName = recipientName || existingRecipientName || undefined;

      const updatedJob = await storage.updateJobPOD(jobId, finalPhotoUrl, finalSignatureUrl, finalRecipientName);

      if (!updatedJob) {
        return res.status(500).json({ 
          error: "Failed to save POD to database",
          code: "POD_SAVE_FAILED"
        });
      }

      console.log(`[POD Upload] Job ${jobId}: photo=${podPhotoUrl || 'none'}, signature=${podSignatureUrl || 'none'}, recipient=${recipientName || 'none'}`);

      res.json({
        success: true,
        message: "Proof of Delivery uploaded successfully",
        pod: {
          photoUrl: updatedJob.podPhotoUrl,
          signatureUrl: updatedJob.podSignatureUrl,
          recipientName: updatedJob.podRecipientName,
        },
      });
    })
  );

  app.get("/api/mobile/v1/config", (req, res) => {
    res.json({
      version: "1.0.0",
      websocket: {
        url: "/ws/realtime",
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
      },
      locationUpdate: {
        intervalMs: 10000,
        minAccuracyMeters: 50,
      },
      supportedJobStatuses: Object.keys(VALID_JOB_TRANSITIONS),
      validTransitions: VALID_JOB_TRANSITIONS,
    });
  });

  // Public pricing endpoint for mobile app - no auth required
  app.get("/api/mobile/v1/pricing",
    asyncHandler(async (req, res) => {
      // Fetch pricing settings
      const pricingSettings = await storage.getPricingSettings();
      
      // Fetch vehicles
      const vehicles = await storage.getVehicles();
      
      // Transform weight surcharges to array format
      const weightSurchargesArray: { min: number; max: number | null; charge: number }[] = [];
      if (pricingSettings.weightSurcharges) {
        const surcharges = pricingSettings.weightSurcharges as Record<string, number>;
        Object.entries(surcharges).forEach(([range, charge]) => {
          if (range.includes('+')) {
            const min = parseInt(range.replace('+', ''));
            weightSurchargesArray.push({ min, max: null, charge });
          } else if (range.includes('-')) {
            const [minStr, maxStr] = range.split('-');
            weightSurchargesArray.push({ min: parseInt(minStr), max: parseInt(maxStr), charge });
          }
        });
        weightSurchargesArray.sort((a, b) => a.min - b.min);
      }
      
      // Transform vehicles to config format
      const vehiclesConfig: Record<string, {
        name: string;
        baseCharge: number;
        perMileRate: number;
        rushHourRate: number;
        maxWeight: number;
      }> = {};
      
      vehicles.forEach((v) => {
        vehiclesConfig[v.type] = {
          name: v.name,
          baseCharge: parseFloat(v.baseCharge) || 0,
          perMileRate: parseFloat(v.perMileRate) || 0,
          rushHourRate: parseFloat(v.rushHourRate || '0') || 0,
          maxWeight: v.maxWeight || 0,
        };
      });
      
      // Return pricing config in the same format as frontend expects
      res.json({
        vehicles: vehiclesConfig,
        weightSurcharges: weightSurchargesArray,
        centralLondonSurcharge: parseFloat(pricingSettings.centralLondonSurcharge || '15'),
        multiDropCharge: parseFloat(pricingSettings.multiDropCharge || '5'),
        returnTripMultiplier: parseFloat(pricingSettings.returnTripMultiplier || '0.60'),
        waitingTimeFreeMinutes: pricingSettings.waitingTimeFreeMinutes || 10,
        waitingTimePerMinute: parseFloat(pricingSettings.waitingTimePerMinute || '0.50'),
        rushHourPeriods: [
          { start: pricingSettings.rushHourStart || '07:00', end: pricingSettings.rushHourEnd || '09:00' },
          { start: pricingSettings.rushHourStartEvening || '17:00', end: pricingSettings.rushHourEndEvening || '19:00' },
        ],
        centralLondonPostcodes: [
          "EC1", "EC2", "EC3", "EC4",
          "WC1", "WC2",
          "W1", "SW1", "SE1", "E1", "N1", "NW1",
        ],
      });
    })
  );

  // ============= JOB OFFERS (Admin Assignments) =============
  // Get pending job offers for this driver
  app.get("/api/mobile/v1/driver/job-offers",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      
      // Get all pending/sent job assignments for this driver
      const assignments = await storage.getJobAssignments({ 
        driverId: driver.id,
        status: "sent" // Only show sent offers (pending means admin hasn't sent yet)
      });
      
      // Also get "pending" status assignments that are ready to be viewed
      const pendingAssignments = await storage.getJobAssignments({ 
        driverId: driver.id,
        status: "pending"
      });
      
      const allAssignments = [...assignments, ...pendingAssignments];
      
      // Enrich with job details and filter hidden jobs
      const enrichedOffers = await Promise.all(
        allAssignments.map(async (assignment) => {
          const job = await storage.getJob(assignment.jobId);
          // Skip if job is hidden from driver view
          if (job && (job as any).driverHidden === true) {
            return null;
          }
          return {
            id: assignment.id,
            jobId: assignment.jobId,
            status: assignment.status,
            driverPrice: assignment.driverPrice,
            expiresAt: assignment.expiresAt,
            createdAt: assignment.createdAt,
            job: job ? {
              id: job.id,
              trackingNumber: job.trackingNumber,
              vehicleType: job.vehicleType,
              pickupAddress: job.pickupAddress,
              pickupPostcode: job.pickupPostcode,
              deliveryAddress: job.deliveryAddress,
              deliveryPostcode: job.deliveryPostcode,
              recipientName: job.recipientName,
              recipientPhone: job.recipientPhone,
              weight: job.weight,
              distance: job.distance,
              isMultiDrop: job.isMultiDrop,
              isReturnTrip: job.isReturnTrip,
              totalPrice: job.totalPrice,
              pickupInstructions: job.pickupInstructions,
              deliveryInstructions: job.deliveryInstructions,
            } : null
          };
        })
      );
      
      // Filter out null entries (hidden jobs) and jobs without data
      const visibleOffers = enrichedOffers.filter(o => o !== null && o.job !== null);
      
      res.json({
        success: true,
        offers: visibleOffers,
        count: visibleOffers.length
      });
    })
  );

  // Accept a job offer
  app.post("/api/mobile/v1/driver/job-offers/:id/accept",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const assignmentId = req.params.id;
      
      const assignment = await storage.getJobAssignment(assignmentId);
      
      if (!assignment) {
        return res.status(404).json({ 
          success: false, 
          error: "Job offer not found" 
        });
      }
      
      if (assignment.driverId !== driver.id) {
        return res.status(403).json({ 
          success: false, 
          error: "This job offer is not for you" 
        });
      }
      
      if (assignment.status !== "sent" && assignment.status !== "pending") {
        return res.status(400).json({ 
          success: false, 
          error: `Cannot accept offer with status: ${assignment.status}` 
        });
      }
      
      // Check if expired
      if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
        await storage.updateJobAssignment(assignmentId, { status: "expired" });
        return res.status(400).json({ 
          success: false, 
          error: "This job offer has expired" 
        });
      }
      
      // Accept the assignment
      await storage.updateJobAssignment(assignmentId, { 
        status: "accepted" as any,
        respondedAt: new Date()
      });
      
      // Update the job to assign this driver
      const job = await storage.getJob(assignment.jobId);
      if (job) {
        await storage.updateJob(assignment.jobId, { 
          driverId: driver.id,
          status: "accepted",
          driverPrice: assignment.driverPrice
        });
        
        console.log(`[Mobile] Driver ${driver.driverCode} accepted job ${job.trackingNumber}`);
      }
      
      res.json({
        success: true,
        message: "Job offer accepted successfully",
        jobId: assignment.jobId
      });
    })
  );

  // Reject a job offer
  app.post("/api/mobile/v1/driver/job-offers/:id/reject",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const assignmentId = req.params.id;
      const { reason } = req.body;
      
      const assignment = await storage.getJobAssignment(assignmentId);
      
      if (!assignment) {
        return res.status(404).json({ 
          success: false, 
          error: "Job offer not found" 
        });
      }
      
      if (assignment.driverId !== driver.id) {
        return res.status(403).json({ 
          success: false, 
          error: "This job offer is not for you" 
        });
      }
      
      if (assignment.status !== "sent" && assignment.status !== "pending") {
        return res.status(400).json({ 
          success: false, 
          error: `Cannot reject offer with status: ${assignment.status}` 
        });
      }
      
      // Reject the assignment
      await storage.updateJobAssignment(assignmentId, { 
        status: "rejected" as any,
        respondedAt: new Date(),
        rejectionReason: reason || null
      });
      
      console.log(`[Mobile] Driver ${driver.driverCode} rejected job offer ${assignmentId}`);
      
      res.json({
        success: true,
        message: "Job offer rejected"
      });
    })
  );
}
