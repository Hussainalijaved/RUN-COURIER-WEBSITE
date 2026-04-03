import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { requireSupabaseAuth, requireDriverRole } from "./mobileAuth";
import { broadcastLocationUpdate, broadcastDriverAvailability, broadcastJobUpdate } from "./realtime";
import { db } from "./db";
import { jobs as jobsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { JobStatus, Job } from "@shared/schema";
import multer from "multer";
import path from "path";
import { supabaseAdmin } from "./supabaseAdmin";
import { registerDriverDevice, unregisterDriverDevice, getDriverDevices } from "./pushNotifications";
import { geocodeAddress } from "./geocoding";
import { sendDeliveryConfirmationEmail } from "./emailService";
import { ensureJobNumber } from "./jobNumbers";

// Helper to map Supabase job to local Job format for mobile API response
// CRITICAL: Only expose driver_price to drivers, NEVER total_price or customer pricing
function mapSupabaseJobToMobileFormat(job: any, multiDropStops?: any[]) {
  const pickupLat = job.pickup_latitude?.toString() || job.pickup_lat?.toString() || null;
  const pickupLng = job.pickup_longitude?.toString() || job.pickup_lng?.toString() || null;
  const deliveryLat = job.delivery_latitude?.toString() || job.dropoff_lat?.toString() || null;
  const deliveryLng = job.delivery_longitude?.toString() || job.dropoff_lng?.toString() || null;
  const senderName = job.pickup_contact_name || job.sender_name || job.customer_name || null;
  const senderPhone = job.pickup_contact_phone || job.sender_phone || job.customer_phone || null;
  const recipientPhone = job.recipient_phone || null;
  
  let staticMapUrl: string | null = null;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey && pickupLat && pickupLng) {
    if (job.is_multi_drop && multiDropStops && multiDropStops.length > 0) {
      let mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&markers=color:green|label:P|${pickupLat},${pickupLng}`;
      let pathPoints = `${pickupLat},${pickupLng}`;
      
      for (let i = 0; i < multiDropStops.length; i++) {
        const stop = multiDropStops[i];
        const sLat = stop.latitude?.toString();
        const sLng = stop.longitude?.toString();
        if (sLat && sLng) {
          const label = String.fromCharCode(65 + i); // A, B, C, D...
          mapUrl += `&markers=color:red|label:${label}|${sLat},${sLng}`;
          pathPoints += `|${sLat},${sLng}`;
        }
      }
      
      mapUrl += `&path=color:0x007BFF|weight:4|${pathPoints}&key=${apiKey}`;
      staticMapUrl = mapUrl;
    } else if (deliveryLat && deliveryLng) {
      staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&markers=color:green|label:P|${pickupLat},${pickupLng}&markers=color:red|label:D|${deliveryLat},${deliveryLng}&path=color:0x007BFF|weight:4|${pickupLat},${pickupLng}|${deliveryLat},${deliveryLng}&key=${apiKey}`;
    }
  }
  
  // Map multi-drop stops to mobile format (include both camelCase and snake_case for compatibility)
  if (job.is_multi_drop) {
    console.log(`[mapToMobile] Job ${job.id} is multi-drop, has ${(multiDropStops || []).length} stops`);
  }
  const mappedStops = (multiDropStops || []).map(stop => ({
    id: String(stop.id),
    stopOrder: stop.stop_order ?? stop.stopOrder,
    stop_order: stop.stop_order ?? stop.stopOrder,
    order: stop.stop_order ?? stop.stopOrder,
    address: stop.address,
    postcode: stop.postcode || null,
    contactName: stop.contact_name || stop.recipient_name || null,
    contact_name: stop.contact_name || stop.recipient_name || null,
    contactPhone: stop.contact_phone || stop.recipient_phone || null,
    contact_phone: stop.contact_phone || stop.recipient_phone || null,
    recipientName: stop.recipient_name || stop.contact_name || null,
    recipient_name: stop.recipient_name || stop.contact_name || null,
    recipientPhone: stop.recipient_phone || stop.contact_phone || null,
    recipient_phone: stop.recipient_phone || stop.contact_phone || null,
    instructions: stop.instructions || null,
    latitude: stop.latitude?.toString() || null,
    longitude: stop.longitude?.toString() || null,
    status: stop.status || 'pending',
    completedAt: stop.completed_at || stop.completedAt || null,
    completed_at: stop.completed_at || stop.completedAt || null,
  }));
  
  return {
    id: String(job.id),
    trackingNumber: job.tracking_number,
    jobNumber: job.job_number || null,
    status: job.status,
    pickupAddress: job.pickup_address || job.dropoff_address,
    pickupPostcode: job.pickup_postcode || null,
    pickupInstructions: job.pickup_instructions || job.notes,
    pickupLatitude: pickupLat,
    pickupLongitude: pickupLng,
    deliveryAddress: job.delivery_address || job.dropoff_address,
    deliveryPostcode: job.delivery_postcode || null,
    deliveryInstructions: job.delivery_instructions || null,
    deliveryBuildingName: job.delivery_building_name || null,
    deliveryLatitude: deliveryLat,
    deliveryLongitude: deliveryLng,
    recipientName: job.recipient_name,
    recipientPhone: recipientPhone,
    senderName: senderName,
    senderPhone: senderPhone,
    pickupContactPhone: job.pickup_contact_phone || job.sender_phone || null,
    pickupContactName: job.pickup_contact_name || job.sender_name || null,
    pickupBuildingName: job.pickup_building_name || null,
    customerName: job.customer_name || null,
    customerPhone: job.customer_phone || null,
    vehicleType: job.vehicle_type,
    distance: job.distance?.toString() || null,
    weight: job.weight?.toString() || null,
    driverPrice: job.driver_price !== null && job.driver_price !== undefined ? String(job.driver_price) : null,
    scheduledPickupTime: job.scheduled_pickup_time,
    isMultiDrop: job.is_multi_drop || false,
    isReturnTrip: job.is_return_trip || false,
    multiDropStops: mappedStops,
    stops: mappedStops,
    totalStops: mappedStops.length,
    staticMapUrl: staticMapUrl,
    routePolyline: null as string | null,
    routeDistance: null as string | null,
    routeDuration: null as string | null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

async function fetchRouteDataForJob(pickupLat: string | null, pickupLng: string | null, deliveryLat: string | null, deliveryLng: string | null): Promise<{
  routePolyline: string | null;
  routeDistance: string | null;
  routeDuration: string | null;
  staticMapUrl: string | null;
} | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !pickupLat || !pickupLng || !deliveryLat || !deliveryLng) return null;
  
  try {
    const origin = `${pickupLat},${pickupLng}`;
    const destination = `${deliveryLat},${deliveryLng}`;
    
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${apiKey}`;
    const response = await fetch(directionsUrl);
    const data = await response.json();
    
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&markers=color:green|label:P|${pickupLat},${pickupLng}&markers=color:red|label:D|${deliveryLat},${deliveryLng}&path=color:0x007BFF|weight:4|${pickupLat},${pickupLng}|${deliveryLat},${deliveryLng}&key=${apiKey}`;
    
    if (data.status === 'OK' && data.routes?.length > 0) {
      const route = data.routes[0];
      const leg = route.legs?.[0];
      return {
        routePolyline: route.overview_polyline?.points || null,
        routeDistance: leg?.distance?.text || null,
        routeDuration: leg?.duration?.text || null,
        staticMapUrl,
      };
    }
    
    return { routePolyline: null, routeDistance: null, routeDuration: null, staticMapUrl };
  } catch (err) {
    console.error('[Mobile Maps] Error fetching route data:', err);
    return null;
  }
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

  const bucket = 'pod-images';
  
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
  failed: [],
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
        hideJob: "/api/mobile/v1/driver/jobs/:jobId/hide",
        assignedJobs: "/api/mobile/v1/driver/assigned-jobs",
        jobOffers: "/api/mobile/v1/driver/job-offers",
        location: "/api/mobile/v1/driver/location",
        availability: "/api/mobile/v1/driver/availability",
        status: "/api/driver/status",
        websocket: "/ws/realtime",
        pushToken: "/api/mobile/v1/driver/push-token",
        directions: "/api/mobile/v1/directions",
        staticMap: "/api/mobile/v1/static-map",
        geocode: "/api/mobile/v1/geocode"
      }
    });
  });

  // GET /api/mobile/v1/driver/assigned-jobs - Fetch geocoded assigned jobs for driver
  app.get("/api/mobile/v1/driver/assigned-jobs",
    requireSupabaseAuth,
    asyncHandler(async (req, res) => {
      const authUser = req.auth!;
      const authUserId = authUser.id;

      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Server not configured", code: "NO_SUPABASE" });
      }

      // Look up driver record to get the driver record ID (may differ from auth UUID)
      // Admin assigns jobs using driver record ID, mobile app authenticates with auth UUID
      const allDriverIds: string[] = [authUserId];
      try {
        // Try by user_id first
        let { data: driverRecord } = await supabaseAdmin
          .from('drivers')
          .select('id')
          .eq('user_id', authUserId)
          .single();
        
        // If not found by user_id, try by id directly (some drivers have id = auth UUID)
        if (!driverRecord) {
          const { data: dr2 } = await supabaseAdmin
            .from('drivers')
            .select('id')
            .eq('id', authUserId)
            .single();
          driverRecord = dr2;
        }
        
        // If still not found, try by email from auth user
        if (!driverRecord && authUser.email) {
          const { data: dr3 } = await supabaseAdmin
            .from('drivers')
            .select('id')
            .eq('email', authUser.email)
            .single();
          driverRecord = dr3;
        }
        
        if (driverRecord && driverRecord.id && driverRecord.id !== authUserId) {
          allDriverIds.push(driverRecord.id);
          console.log(`[Job Offers API] Found driver record ID ${driverRecord.id} for auth user ${authUserId}`);
        }
      } catch (e) {
        // Non-critical - continue with auth ID only
      }
      console.log(`[Job Offers API] Looking up jobs for driver IDs: ${allDriverIds.join(', ')}`);

      const driverSafeColumns = 'id, tracking_number, status, driver_price, vehicle_type, priority, pickup_address, pickup_postcode, pickup_latitude, pickup_longitude, pickup_instructions, pickup_contact_name, pickup_contact_phone, dropoff_address, delivery_address, delivery_postcode, delivery_latitude, delivery_longitude, delivery_instructions, recipient_name, recipient_phone, sender_name, sender_phone, customer_name, customer_phone, parcel_description, parcel_weight, parcel_dimensions, distance_miles, scheduled_pickup_time, estimated_delivery_time, actual_pickup_time, actual_delivery_time, driver_id, created_at, updated_at, job_number, is_multi_drop, pickup_building_name, delivery_building_name, distance';

      // Also check job_assignments table for this driver
      let assignmentJobIds: string[] = [];
      for (const dId of allDriverIds) {
        const { data: assignments } = await supabaseAdmin
          .from('job_assignments')
          .select('job_id')
          .eq('driver_id', dId)
          .in('status', ['sent', 'pending', 'offered', 'assigned']);
        if (assignments) {
          assignmentJobIds.push(...assignments.map(a => String(a.job_id)));
        }
      }

      // Query jobs by driver_id OR from active assignments
      let jobsQuery = supabaseAdmin
        .from('jobs')
        .select(driverSafeColumns)
        .in('status', ['assigned', 'offered', 'pending']);
      
      if (assignmentJobIds.length > 0) {
        // Get jobs where driver_id matches OR job is in active assignments
        jobsQuery = supabaseAdmin
          .from('jobs')
          .select(driverSafeColumns)
          .or(`driver_id.in.(${allDriverIds.join(',')}),id.in.(${assignmentJobIds.join(',')})`)
          .in('status', ['assigned', 'offered', 'pending']);
      } else {
        jobsQuery = jobsQuery.in('driver_id', allDriverIds);
      }

      const { data: jobsData, error } = await jobsQuery.order('created_at', { ascending: false });

      if (error) {
        console.error('[Job Offers API] Query error:', error);
        return res.status(500).json({ error: "Failed to fetch jobs", code: "QUERY_ERROR" });
      }

      const jobs = jobsData || [];
      console.log(`[Job Offers API] Found ${jobs.length} jobs for driver IDs: ${allDriverIds.join(', ')}`);

      for (const job of jobs) {
        let updated = false;
        const updates: Record<string, any> = {};

        const hasPickupCoords = job.pickup_latitude && job.pickup_longitude;
        if (!hasPickupCoords) {
          const addr = job.pickup_address || job.pickup_postcode;
          if (addr) {
            const geo = await geocodeAddress(addr);
            if (geo) {
              job.pickup_latitude = String(geo.lat);
              job.pickup_longitude = String(geo.lng);
              updates.pickup_latitude = String(geo.lat);
              updates.pickup_longitude = String(geo.lng);
              updated = true;
              console.log(`[Job Offers API] Geocoded pickup for job ${job.id}: ${geo.lat}, ${geo.lng}`);
            }
          }
        }

        const hasDeliveryCoords = job.delivery_latitude && job.delivery_longitude;
        if (!hasDeliveryCoords) {
          const addr = job.delivery_address || job.dropoff_address || job.delivery_postcode;
          if (addr) {
            const geo = await geocodeAddress(addr);
            if (geo) {
              job.delivery_latitude = String(geo.lat);
              job.delivery_longitude = String(geo.lng);
              updates.delivery_latitude = String(geo.lat);
              updates.delivery_longitude = String(geo.lng);
              updated = true;
              console.log(`[Job Offers API] Geocoded delivery for job ${job.id}: ${geo.lat}, ${geo.lng}`);
            }
          }
        }

        if (updated) {
          const { error: updateError } = await supabaseAdmin
            .from('jobs')
            .update(updates)
            .eq('id', job.id);
          if (updateError) {
            console.error(`[Job Offers API] Failed to cache geocoded coords for job ${job.id}:`, updateError);
          }
        }
      }

      // Fetch multi-drop stops for multi-drop jobs
      const multiDropJobIds = jobs
        .filter(j => j.is_multi_drop === true)
        .map(j => String(j.id));
      
      let multiDropStopsMap: Record<string, any[]> = {};
      if (multiDropJobIds.length > 0) {
        console.log(`[Job Offers API] Fetching multi-drop stops for ${multiDropJobIds.length} jobs`);
        const { data: allStops, error: stopsError } = await supabaseAdmin
          .from('multi_drop_stops')
          .select('*')
          .in('job_id', multiDropJobIds)
          .order('stop_order', { ascending: true });
        
        if (!stopsError && allStops) {
          for (const stop of allStops) {
            const jobId = String(stop.job_id);
            if (!multiDropStopsMap[jobId]) multiDropStopsMap[jobId] = [];
            multiDropStopsMap[jobId].push(stop);
          }
          console.log(`[Job Offers API] Found ${allStops.length} multi-drop stops`);
        }
      }

      const parsedJobs = jobs.map(job => {
        const stops = multiDropStopsMap[String(job.id)] || [];
        const mappedStops = stops.map((stop: any) => ({
          id: String(stop.id),
          stopOrder: stop.stop_order,
          stop_order: stop.stop_order,
          order: stop.stop_order,
          address: stop.address,
          postcode: stop.postcode || null,
          contactName: stop.contact_name || stop.recipient_name || null,
          contact_name: stop.contact_name || stop.recipient_name || null,
          contactPhone: stop.contact_phone || stop.recipient_phone || null,
          contact_phone: stop.contact_phone || stop.recipient_phone || null,
          recipientName: stop.recipient_name || stop.contact_name || null,
          recipient_name: stop.recipient_name || stop.contact_name || null,
          recipientPhone: stop.recipient_phone || stop.contact_phone || null,
          recipient_phone: stop.recipient_phone || stop.contact_phone || null,
          instructions: stop.instructions || null,
          latitude: stop.latitude?.toString() || null,
          longitude: stop.longitude?.toString() || null,
          status: stop.status || 'pending',
          completedAt: stop.completed_at || null,
          completed_at: stop.completed_at || null,
        }));

        return {
          ...job,
          dropoff_address: job.dropoff_address || job.delivery_address || null,
          delivery_address: job.delivery_address || job.dropoff_address || null,
          pickup_latitude: job.pickup_latitude ? parseFloat(String(job.pickup_latitude)) : null,
          pickup_longitude: job.pickup_longitude ? parseFloat(String(job.pickup_longitude)) : null,
          delivery_latitude: job.delivery_latitude ? parseFloat(String(job.delivery_latitude)) : null,
          delivery_longitude: job.delivery_longitude ? parseFloat(String(job.delivery_longitude)) : null,
          senderName: job.pickup_contact_name || job.sender_name || job.customer_name || null,
          senderPhone: job.pickup_contact_phone || job.sender_phone || job.customer_phone || null,
          pickupContactName: job.pickup_contact_name || job.sender_name || null,
          pickupContactPhone: job.pickup_contact_phone || job.sender_phone || null,
          recipientName: job.recipient_name || null,
          recipientPhone: job.recipient_phone || null,
          customerName: job.customer_name || null,
          customerPhone: job.customer_phone || null,
          isMultiDrop: job.is_multi_drop || false,
          is_multi_drop: job.is_multi_drop || false,
          multiDropStops: mappedStops,
          stops: mappedStops,
          totalStops: mappedStops.length,
          total_stops: mappedStops.length,
          numberOfDrops: mappedStops.length,
        };
      });

      // Fetch route data for each job
      for (const job of parsedJobs) {
        const rd = await fetchRouteDataForJob(
          job.pickup_latitude?.toString() || null,
          job.pickup_longitude?.toString() || null,
          job.delivery_latitude?.toString() || null,
          job.delivery_longitude?.toString() || null
        );
        if (rd) {
          (job as any).routePolyline = rd.routePolyline;
          (job as any).routeDistance = rd.routeDistance;
          (job as any).routeDuration = rd.routeDuration;
          (job as any).staticMapUrl = rd.staticMapUrl;
        }
      }

      res.json({ success: true, jobs: parsedJobs });
    })
  );

  // Register push notification token for driver
  app.post("/api/mobile/v1/driver/push-token",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { pushToken, platform, appVersion, deviceInfo } = req.body;

      console.log(`[Push Token] Registration attempt — driver: ${driver.driverCode || driver.id}, platform: ${platform}, token prefix: ${pushToken?.substring(0, 40)}, body keys: ${Object.keys(req.body).join(',')}`);

      if (!pushToken || typeof pushToken !== 'string') {
        console.log(`[Push Token] Rejected — missing pushToken field`);
        return res.status(400).json({ 
          error: "Push token is required",
          code: "INVALID_PUSH_TOKEN"
        });
      }

      // Accept ios/android case-insensitively; default to 'android' if missing
      const normalizedPlatform = (platform || 'android').toString().toLowerCase().trim();
      const validPlatform: "ios" | "android" = normalizedPlatform.startsWith('i') ? 'ios' : 'android';

      const result = await registerDriverDevice(
        driver.id,
        pushToken,
        validPlatform,
        appVersion,
        deviceInfo
      );

      if (result.success) {
        console.log(`[Push Token] Registered successfully for driver ${driver.driverCode || driver.id} (${validPlatform})`);
        res.json({
          success: true,
          deviceId: result.deviceId,
          message: "Push token registered successfully"
        });
      } else {
        console.log(`[Push Token] Registration FAILED for driver ${driver.driverCode || driver.id}: ${result.error}`);
        res.status(500).json({
          success: false,
          error: result.error || "Failed to register push token"
        });
      }
    })
  );

  // Unregister push notification token
  app.delete("/api/mobile/v1/driver/push-token",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { pushToken } = req.body;

      if (!pushToken || typeof pushToken !== 'string') {
        return res.status(400).json({ 
          error: "Push token is required",
          code: "INVALID_PUSH_TOKEN"
        });
      }

      const result = await unregisterDriverDevice(driver.id, pushToken);

      if (result.success) {
        console.log(`[Push Token] Unregistered for driver ${driver.driverCode || driver.id}`);
        res.json({
          success: true,
          message: "Push token unregistered successfully"
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || "Failed to unregister push token"
        });
      }
    })
  );

  // Get registered devices for current driver (for debugging)
  app.get("/api/mobile/v1/driver/devices",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const devices = await getDriverDevices(driver.id);

      res.json({
        success: true,
        devices: devices.map(d => ({
          id: d.id,
          platform: d.platform,
          appVersion: d.app_version,
          lastSeenAt: d.last_seen_at,
          createdAt: d.created_at
        }))
      });
    })
  );

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
          await storage.updateDriverLocation(driver.id, lat.toFixed(7), lng.toFixed(7), {
            speed: speed ? parseFloat(String(speed)) : undefined,
            heading: heading ? parseFloat(String(heading)) : undefined,
          });
          locationUpdated = true;
          
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
      const driver = req.driver! as any;
      
      // Fetch full driver data from Supabase for document URLs
      let fullDriverData: any = driver;
      let totalJobs = 0;
      let totalEarnings = 0;
      let totalMiles = 0;
      let weeklyJobs = 0;
      let weeklyEarnings = 0;
      let weeklyMiles = 0;
      
      if (supabaseAdmin) {
        // Get driver data
        const { data } = await supabaseAdmin
          .from('drivers')
          .select('*')
          .eq('id', driver.id)
          .single();
        if (data) {
          fullDriverData = data;
        }
        
        // Calculate stats from completed jobs
        const { data: completedJobs } = await supabaseAdmin
          .from('jobs')
          .select('id, driver_price, distance, delivered_at, updated_at')
          .eq('driver_id', driver.id)
          .eq('status', 'delivered');
        
        if (completedJobs && completedJobs.length > 0) {
          totalJobs = completedJobs.length;
          totalEarnings = completedJobs.reduce((sum, job) => sum + (parseFloat(job.driver_price) || 0), 0);
          totalMiles = completedJobs.reduce((sum, job) => sum + (parseFloat(job.distance) || 0), 0);
          
          // Calculate this week's stats (Monday to Sunday)
          const now = new Date();
          const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - daysSinceMonday);
          weekStart.setHours(0, 0, 0, 0);
          
          const thisWeekJobs = completedJobs.filter(job => {
            const deliveredDate = new Date(job.delivered_at || job.updated_at);
            return deliveredDate >= weekStart;
          });
          
          weeklyJobs = thisWeekJobs.length;
          weeklyEarnings = thisWeekJobs.reduce((sum, job) => sum + (parseFloat(job.driver_price) || 0), 0);
          weeklyMiles = thisWeekJobs.reduce((sum, job) => sum + (parseFloat(job.distance) || 0), 0);
          
          console.log(`[Driver Profile] Driver ${driver.id}: Total: ${totalJobs} jobs, £${totalEarnings.toFixed(2)}, ${totalMiles.toFixed(1)} miles | This Week: ${weeklyJobs} jobs, £${weeklyEarnings.toFixed(2)}, ${weeklyMiles.toFixed(1)} miles`);
        }
      }
      
      res.json({
        id: driver.id,
        userId: driver.userId,
        driverCode: driver.driverCode,
        driver_id: driver.driverCode,
        fullName: driver.fullName,
        full_name: driver.fullName,
        name: driver.fullName,
        email: driver.email,
        phone: driver.phone,
        postcode: driver.postcode,
        address: driver.address || fullDriverData.address || fullDriverData.full_address,
        nationality: driver.nationality || fullDriverData.nationality,
        isBritish: driver.isBritish ?? fullDriverData.is_british,
        is_british: driver.isBritish ?? fullDriverData.is_british,
        nationalInsuranceNumber: driver.nationalInsuranceNumber || fullDriverData.national_insurance_number,
        national_insurance_number: driver.nationalInsuranceNumber || fullDriverData.national_insurance_number,
        rightToWorkShareCode: driver.rightToWorkShareCode || fullDriverData.right_to_work_share_code,
        right_to_work_share_code: driver.rightToWorkShareCode || fullDriverData.right_to_work_share_code,
        vehicleType: driver.vehicleType || fullDriverData.vehicle_type,
        vehicle_type: driver.vehicleType || fullDriverData.vehicle_type,
        vehicleRegistration: driver.vehicleRegistration || fullDriverData.vehicle_registration,
        vehicle_registration: driver.vehicleRegistration || fullDriverData.vehicle_registration,
        vehicleMake: driver.vehicleMake || fullDriverData.vehicle_make,
        vehicle_make: driver.vehicleMake || fullDriverData.vehicle_make,
        vehicleModel: driver.vehicleModel || fullDriverData.vehicle_model,
        vehicle_model: driver.vehicleModel || fullDriverData.vehicle_model,
        vehicleColor: driver.vehicleColor || fullDriverData.vehicle_color,
        vehicle_color: driver.vehicleColor || fullDriverData.vehicle_color,
        isAvailable: driver.isAvailable,
        isVerified: driver.isVerified,
        rating: driver.rating,
        totalJobs: totalJobs,
        totalEarnings: totalEarnings,
        totalMiles: Math.round(totalMiles * 10) / 10,
        // Weekly stats (this week, Monday to Sunday)
        weeklyJobs: weeklyJobs,
        weeklyEarnings: weeklyEarnings,
        weeklyMiles: Math.round(weeklyMiles * 10) / 10,
        currentLatitude: driver.currentLatitude,
        currentLongitude: driver.currentLongitude,
        lastLocationUpdate: driver.lastLocationUpdate,
        // Bank details (include ALL variants for mobile app compatibility)
        bankName: driver.bankName || fullDriverData.bank_name,
        bank_name: driver.bankName || fullDriverData.bank_name,
        accountHolderName: driver.accountHolderName || fullDriverData.account_holder_name,
        account_holder_name: driver.accountHolderName || fullDriverData.account_holder_name,
        // Mobile app BankDetailsScreen expects these field names:
        bank_account_name: driver.accountHolderName || fullDriverData.account_holder_name,
        sortCode: driver.sortCode || fullDriverData.sort_code,
        sort_code: driver.sortCode || fullDriverData.sort_code,
        bank_sort_code: driver.sortCode || fullDriverData.sort_code,
        accountNumber: driver.accountNumber || fullDriverData.account_number,
        account_number: driver.accountNumber || fullDriverData.account_number,
        bank_account_number: driver.accountNumber || fullDriverData.account_number,
        profilePictureUrl: driver.profilePictureUrl || fullDriverData.profile_picture_url,
        profile_picture_url: driver.profilePictureUrl || fullDriverData.profile_picture_url,
        drivingLicenceFrontUrl: fullDriverData.driving_licence_front_url,
        driving_licence_front_url: fullDriverData.driving_licence_front_url,
        drivingLicenceBackUrl: fullDriverData.driving_licence_back_url,
        driving_licence_back_url: fullDriverData.driving_licence_back_url,
        dbsCertificateUrl: driver.dbsCertificateUrl || fullDriverData.dbs_certificate_url,
        dbs_certificate_url: driver.dbsCertificateUrl || fullDriverData.dbs_certificate_url,
        goodsInTransitInsuranceUrl: fullDriverData.goods_in_transit_insurance_url,
        goods_in_transit_insurance_url: fullDriverData.goods_in_transit_insurance_url,
        goods_in_transit_url: fullDriverData.goods_in_transit_insurance_url,
        hireRewardInsuranceUrl: fullDriverData.hire_reward_insurance_url,
        hire_reward_insurance_url: fullDriverData.hire_reward_insurance_url,
        hire_and_reward_url: fullDriverData.hire_reward_insurance_url,
        license_url: fullDriverData.driving_licence_front_url,
        insurance_url: fullDriverData.hire_reward_insurance_url,
      });
    })
  );

  // Update driver profile - allows drivers to update their own details
  app.patch("/api/mobile/v1/driver/profile",
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

      // Fields that drivers are allowed to update
      // Note: 'address' is the field name in local storage, mobile may send 'fullAddress'
      // Note: 'fullName' is the field name, mobile may send 'name' as alias
      const allowedFields = [
        'fullName',
        'name', // alias for fullName
        'phone',
        'postcode',
        'address',
        'nationality',
        'isBritish',
        'nationalInsuranceNumber',
        'rightToWorkShareCode',
        'vehicleType',
        'vehicleRegistration',
        'vehicleMake',
        'vehicleModel',
        'vehicleColor',
        // Bank details fields
        'bankName',
        'accountHolderName',
        'sortCode',
        'accountNumber',
        // Document URLs (for mobile app uploads via Supabase Storage)
        'profilePictureUrl',
        'drivingLicenceFrontUrl',
        'drivingLicenceBackUrl',
        'dbsCertificateUrl',
        'goodsInTransitInsuranceUrl',
        'hireRewardInsuranceUrl',
      ];

      // Filter to only allowed fields
      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      
      // Handle fullAddress alias (mobile app may send fullAddress instead of address)
      if (req.body.fullAddress !== undefined && updateData.address === undefined) {
        updateData.address = req.body.fullAddress;
      }
      
      // Handle name alias (mobile app may send name instead of fullName)
      if (req.body.name !== undefined && updateData.fullName === undefined) {
        updateData.fullName = req.body.name;
      }
      
      // Handle profile_picture_url alias (mobile app may send snake_case)
      if (req.body.profile_picture_url !== undefined && updateData.profilePictureUrl === undefined) {
        updateData.profilePictureUrl = req.body.profile_picture_url;
      }
      // Handle profile_picture alias (mobile app may send this variant)
      if (req.body.profile_picture !== undefined && updateData.profilePictureUrl === undefined) {
        updateData.profilePictureUrl = req.body.profile_picture;
      }
      
      // Handle bank details snake_case aliases
      if (req.body.bank_name !== undefined && updateData.bankName === undefined) {
        updateData.bankName = req.body.bank_name;
      }
      if (req.body.account_holder_name !== undefined && updateData.accountHolderName === undefined) {
        updateData.accountHolderName = req.body.account_holder_name;
      }
      if (req.body.sort_code !== undefined && updateData.sortCode === undefined) {
        updateData.sortCode = req.body.sort_code;
      }
      if (req.body.account_number !== undefined && updateData.accountNumber === undefined) {
        updateData.accountNumber = req.body.account_number;
      }
      
      // Handle mobile app BankDetailsScreen field names (bank_account_name, bank_sort_code, bank_account_number)
      if (req.body.bank_account_name !== undefined && updateData.accountHolderName === undefined) {
        updateData.accountHolderName = req.body.bank_account_name;
      }
      if (req.body.bank_sort_code !== undefined && updateData.sortCode === undefined) {
        updateData.sortCode = req.body.bank_sort_code;
      }
      if (req.body.bank_account_number !== undefined && updateData.accountNumber === undefined) {
        updateData.accountNumber = req.body.bank_account_number;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          error: "No valid fields to update",
          code: "NO_FIELDS_TO_UPDATE",
          allowedFields
        });
      }

      console.log(`[Mobile Profile] Request body received:`, JSON.stringify(req.body));
      console.log(`[Mobile Profile] Driver ${driver.driverCode || driver.id} updating fields:`, Object.keys(updateData));
      console.log(`[Mobile Profile] Update payload:`, JSON.stringify(updateData));
      console.log(`[Mobile Profile] Driver ID for update:`, driver.id);
      console.log(`[Mobile Profile] fullName in body:`, req.body.fullName, '| fullName in updateData:', updateData.fullName);

      // Update in memory storage
      const updatedDriver = await storage.updateDriver(driver.id, updateData);

      if (!updatedDriver) {
        return res.status(404).json({
          error: "Driver not found",
          code: "DRIVER_NOT_FOUND"
        });
      }

      // Sync to Supabase (primary source of truth)
      if (supabaseAdmin) {
        try {
          // Convert camelCase to snake_case for Supabase
          const snakeCaseData: Record<string, any> = {};
          for (const [key, value] of Object.entries(updateData)) {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            snakeCaseData[snakeKey] = value;
          }
          snakeCaseData.updated_at = new Date().toISOString();

          console.log(`[Mobile Profile] Supabase update payload:`, JSON.stringify(snakeCaseData));

          const { data: supabaseUpdated, error } = await supabaseAdmin
            .from('drivers')
            .update(snakeCaseData)
            .eq('id', driver.id)
            .select()
            .single();

          if (error) {
            console.error(`[Mobile Profile] Supabase sync FAILED:`, error.message, error.code, error.details);
          } else {
            console.log(`[Mobile Profile] Supabase sync SUCCESS for driver ${driver.driverCode || driver.id}`);
            console.log(`[Mobile Profile] Updated values in Supabase:`, JSON.stringify({
              full_name: supabaseUpdated?.full_name,
              phone: supabaseUpdated?.phone,
              address: supabaseUpdated?.address,
              postcode: supabaseUpdated?.postcode,
              profile_picture_url: supabaseUpdated?.profile_picture_url,
              updated_at: supabaseUpdated?.updated_at,
            }));
          }
        } catch (err) {
          console.error(`[Mobile Profile] Exception syncing to Supabase:`, err);
        }
      } else {
        console.error(`[Mobile Profile] supabaseAdmin not available - cannot sync to Supabase!`);
      }

      res.json({
        success: true,
        message: "Profile updated successfully",
        updatedFields: Object.keys(updateData),
        driver: {
          id: updatedDriver.id,
          driverCode: updatedDriver.driverCode,
          fullName: updatedDriver.fullName,
          full_name: updatedDriver.fullName,
          name: updatedDriver.fullName,
          phone: updatedDriver.phone,
          postcode: updatedDriver.postcode,
          address: updatedDriver.address,
          vehicleType: updatedDriver.vehicleType,
          vehicle_type: updatedDriver.vehicleType,
          vehicleRegistration: updatedDriver.vehicleRegistration,
          vehicle_registration: updatedDriver.vehicleRegistration,
          vehicleMake: updatedDriver.vehicleMake,
          vehicle_make: updatedDriver.vehicleMake,
          vehicleModel: updatedDriver.vehicleModel,
          vehicle_model: updatedDriver.vehicleModel,
          vehicleColor: updatedDriver.vehicleColor,
          vehicle_color: updatedDriver.vehicleColor,
          profilePictureUrl: updatedDriver.profilePictureUrl,
          profile_picture_url: updatedDriver.profilePictureUrl,
          bankName: updatedDriver.bankName,
          bank_name: updatedDriver.bankName,
          accountHolderName: updatedDriver.accountHolderName,
          account_holder_name: updatedDriver.accountHolderName,
          sortCode: updatedDriver.sortCode,
          sort_code: updatedDriver.sortCode,
          accountNumber: updatedDriver.accountNumber,
          account_number: updatedDriver.accountNumber,
        }
      });
    })
  );

  // Dedicated endpoint for profile picture updates
  // Mobile app should call this after uploading to Supabase Storage
  app.post("/api/mobile/v1/driver/profile-picture",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { url, profile_picture_url, profilePictureUrl } = req.body;
      
      // Accept any of these field names
      const pictureUrl = url || profile_picture_url || profilePictureUrl;

      if (!pictureUrl) {
        return res.status(400).json({ 
          error: "Profile picture URL is required (url, profile_picture_url, or profilePictureUrl)",
          code: "MISSING_URL"
        });
      }

      console.log(`[Mobile Profile Picture] Driver ${driver.driverCode || driver.id} updating profile picture: ${pictureUrl}`);

      // Update memory storage
      await storage.updateDriver(driver.id, { profilePictureUrl: pictureUrl });

      // Sync to Supabase using admin client (bypasses RLS)
      if (supabaseAdmin) {
        const { error: dbError, data: updatedData } = await supabaseAdmin
          .from('drivers')
          .update({ 
            profile_picture_url: pictureUrl, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', driver.id)
          .select('profile_picture_url')
          .single();

        if (dbError) {
          console.error('[Mobile Profile Picture] Supabase update failed:', dbError);
          return res.status(500).json({
            error: "Failed to save profile picture",
            code: "DB_ERROR"
          });
        }
        
        console.log(`[Mobile Profile Picture] Supabase update SUCCESS:`, updatedData);
      }

      res.json({
        success: true,
        message: "Profile picture updated successfully",
        profilePictureUrl: pictureUrl,
        profile_picture_url: pictureUrl,
      });
    })
  );

  // List all documents for the authenticated driver from the shared driver_documents table
  app.get("/api/mobile/v1/driver/documents",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;

      if (driver.isActive === false) {
        return res.status(403).json({ error: "Your account has been deactivated.", code: "ACCOUNT_DEACTIVATED" });
      }

      // Fetch from shared driver_documents table
      const { data: dbDocs, error: dbErr } = await supabaseAdmin!
        .from('driver_documents')
        .select('*')
        .eq('driver_id', driver.id)
        .order('uploaded_at', { ascending: false });

      if (dbErr) {
        console.error('[Mobile Docs List] driver_documents fetch error:', dbErr);
      }

      // Also synthesize documents from the drivers table URL columns (for application-uploaded docs
      // that may not have a driver_documents entry yet)
      const { data: driverRow } = await supabaseAdmin!
        .from('drivers')
        .select('driving_licence_front_url, driving_licence_back_url, dbs_certificate_url, goods_in_transit_insurance_url, hire_reward_insurance_url, profile_picture_url')
        .eq('id', driver.id)
        .maybeSingle();

      const urlColMap: Array<{ col: keyof typeof driverRow; docType: string }> = [
        { col: 'driving_licence_front_url',     docType: 'driving_license' },
        { col: 'driving_licence_back_url',      docType: 'driving_license_back' },
        { col: 'dbs_certificate_url',           docType: 'dbs_certificate' },
        { col: 'goods_in_transit_insurance_url',docType: 'goods_in_transit_insurance' },
        { col: 'hire_reward_insurance_url',     docType: 'hire_and_reward_insurance' },
        { col: 'profile_picture_url',           docType: 'profile_picture' },
      ];

      const existingTypes = new Set((dbDocs || []).map((d: any) => d.doc_type));
      const synthesized: any[] = [];

      if (driverRow) {
        for (const { col, docType } of urlColMap) {
          const url = (driverRow as any)[col];
          if (url && !existingTypes.has(docType)) {
            synthesized.push({
              id: `driver-col-${docType}`,
              driver_id: driver.id,
              doc_type: docType,
              file_url: url,
              status: 'approved',
              uploaded_at: null,
            });
          }
        }
      }

      const allDocs = [...(dbDocs || []), ...synthesized];

      // Normalize each document entry
      const normalized = allDocs.map((doc: any) => ({
        id: doc.id,
        driverId: doc.driver_id,
        documentType: doc.doc_type || doc.document_type || 'unknown',
        fileUrl: doc.file_url || doc.url || '',
        storagePath: doc.storage_path || null,
        bucket: doc.bucket || 'DRIVER-DOCUMENTS',
        fileName: doc.file_name || null,
        status: doc.status || 'pending',
        expiryDate: doc.expiry_date || null,
        reviewNotes: doc.review_notes || doc.admin_notes || null,
        uploadedAt: doc.uploaded_at || null,
        reviewedAt: doc.reviewed_at || null,
      }));

      res.json({ success: true, documents: normalized });
    })
  );

  // Alternative endpoint for mobile apps that upload directly to Supabase Storage
  // This accepts a document URL instead of a file upload
  app.post("/api/mobile/v1/driver/documents/register",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { documentType, fileUrl, fileName } = req.body;

      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }

      if (!documentType || !fileUrl) {
        return res.status(400).json({ 
          error: "documentType and fileUrl are required",
          code: "MISSING_FIELDS"
        });
      }

      console.log(`[Mobile Docs Register] Driver ${driver.driverCode || driver.id} registering ${documentType}: ${fileUrl}`);

      // Normalize document type
      let normalizedDocType = documentType;
      if (documentType === 'driving_licence_front') normalizedDocType = 'driving_license';
      if (documentType === 'driving_licence_back') normalizedDocType = 'driving_license_back';
      if (documentType === 'hire_reward_insurance') normalizedDocType = 'hire_and_reward_insurance';

      // Map normalized document type to driver field
      const documentFieldMap: Record<string, string | null> = {
        'profile_picture': 'profilePictureUrl',
        'driving_license': 'drivingLicenceFrontUrl',
        'driving_license_back': 'drivingLicenceBackUrl',
        'dbs_certificate': 'dbsCertificateUrl',
        'goods_in_transit_insurance': 'goodsInTransitInsuranceUrl',
        'hire_and_reward_insurance': 'hireRewardInsuranceUrl',
        'proof_of_identity': null,
        'proof_of_address': null,
        'vehicle_photo_front': null,
        'vehicle_photo_back': null,
        'vehicle_photo_left': null,
        'vehicle_photo_right': null,
        'vehicle_photo_load_space': null,
      };

      const fieldName = documentFieldMap[normalizedDocType];

      // Update driver with document URL if it maps to a driver field
      if (fieldName) {
        const updateData: Record<string, any> = { [fieldName]: fileUrl };
        await storage.updateDriver(driver.id, updateData);

        // Sync to Supabase drivers table
        if (supabaseAdmin) {
          const snakeFieldName = fieldName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          const { error: dbError } = await supabaseAdmin
            .from('drivers')
            .update({ [snakeFieldName]: fileUrl, updated_at: new Date().toISOString() })
            .eq('id', driver.id);

          if (dbError) {
            console.error('[Mobile Docs Register] Failed to update driver record:', dbError);
          }
        }
      }

      // Create a document record for tracking/approval
      try {
        const { error: docError } = await supabaseAdmin!
          .from('driver_documents')
          .insert({
            driver_id: driver.id,
            doc_type: normalizedDocType,
            file_url: fileUrl,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (docError) {
          console.error('[Mobile Docs Register] Failed to create document in driver_documents:', docError);
          
          // Fallback to storage layer
          try {
            await storage.createDocument({
              driverId: driver.id,
              type: normalizedDocType as any,
              fileName: fileName || 'document',
              fileUrl: fileUrl,
              status: 'pending',
            });
            console.log('[Mobile Docs Register] Created document in storage/documents table');
          } catch (storageErr) {
            console.error('[Mobile Docs Register] Storage createDocument also failed:', storageErr);
          }
        } else {
          console.log('[Mobile Docs Register] Created document in driver_documents table');
        }
      } catch (err) {
        console.error('[Mobile Docs Register] Error creating document record:', err);
      }

      res.json({
        success: true,
        message: "Document registered successfully",
        documentType: normalizedDocType,
        url: fileUrl,
      });
    })
  );

  // Document upload for drivers - allows drivers to upload their documents
  const uploadDriverDocument = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
      }
    }
  });

  app.post("/api/mobile/v1/driver/documents/upload",
    requireSupabaseAuth,
    requireDriverRole,
    (req, res, next) => {
      uploadDriverDocument.single('file')(req, res, (err) => {
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
      const file = req.file;
      const { documentType } = req.body;

      // Check if driver is active
      if (driver.isActive === false) {
        return res.status(403).json({ 
          error: "Your account has been deactivated. Please contact support.",
          code: "ACCOUNT_DEACTIVATED"
        });
      }

      if (!file) {
        return res.status(400).json({ error: "No file uploaded", code: "NO_FILE" });
      }

      // Valid document types that drivers can upload - support both mobile and web naming conventions
      const validDocumentTypes = [
        'profile_picture',
        // Driving license - support both spellings (licence/license) and naming conventions
        'driving_licence_front',
        'driving_licence_back',
        'driving_license',       // Web uses this for front
        'driving_license_back',  // Web uses this for back
        // Other documents
        'dbs_certificate',
        'goods_in_transit_insurance',
        'hire_reward_insurance',
        'hire_and_reward_insurance',  // Web uses this
        'proof_of_identity',
        'proof_of_address',
        // Vehicle photos
        'vehicle_photo_front',
        'vehicle_photo_back',
        'vehicle_photo_left',
        'vehicle_photo_right',
        'vehicle_photo_load_space',
      ];

      if (!documentType || !validDocumentTypes.includes(documentType)) {
        return res.status(400).json({
          error: "Invalid document type",
          code: "INVALID_DOCUMENT_TYPE",
          validTypes: validDocumentTypes
        });
      }

      // Normalize document type to standard format for storage
      let normalizedDocType = documentType;
      if (documentType === 'driving_licence_front') normalizedDocType = 'driving_license';
      if (documentType === 'driving_licence_back') normalizedDocType = 'driving_license_back';
      if (documentType === 'hire_reward_insurance') normalizedDocType = 'hire_and_reward_insurance';

      console.log(`[Mobile Docs] Driver ${driver.driverCode || driver.id} uploading ${documentType} (normalized: ${normalizedDocType})`);

      // Upload to Supabase Storage
      const bucket = 'driver-documents';
      const timestamp = Date.now();
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `${driver.id}/${normalizedDocType}_${timestamp}${ext}`;

      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Storage not available", code: "STORAGE_ERROR" });
      }

      // Ensure bucket exists
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.find(b => b.name === bucket)) {
        const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024,
        });
        if (createError && !createError.message.includes('already exists')) {
          console.error('[Mobile Docs] Failed to create bucket:', createError);
        }
      }

      // Upload file
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(bucket)
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error('[Mobile Docs] Upload error:', uploadError);
        return res.status(500).json({ error: "Failed to upload file", code: "UPLOAD_FAILED" });
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(filename);

      const publicUrl = urlData.publicUrl;

      // Map normalized document type to driver field (for documents stored on driver record)
      const documentFieldMap: Record<string, string | null> = {
        'profile_picture': 'profilePictureUrl',
        'driving_license': 'drivingLicenceFrontUrl',
        'driving_license_back': 'drivingLicenceBackUrl',
        'dbs_certificate': 'dbsCertificateUrl',
        'goods_in_transit_insurance': 'goodsInTransitInsuranceUrl',
        'hire_and_reward_insurance': 'hireRewardInsuranceUrl',
        // These don't map to driver fields - only stored as documents
        'proof_of_identity': null,
        'proof_of_address': null,
        'vehicle_photo_front': null,
        'vehicle_photo_back': null,
        'vehicle_photo_left': null,
        'vehicle_photo_right': null,
        'vehicle_photo_load_space': null,
      };

      const fieldName = documentFieldMap[normalizedDocType];

      // Update driver with document URL only if it maps to a driver field
      if (fieldName) {
        const updateData: Record<string, any> = { [fieldName]: publicUrl };
        await storage.updateDriver(driver.id, updateData);

        // Sync to Supabase drivers table
        const snakeFieldName = fieldName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        const { error: dbError } = await supabaseAdmin
          .from('drivers')
          .update({ [snakeFieldName]: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', driver.id);

        if (dbError) {
          console.error('[Mobile Docs] Failed to update driver record:', dbError);
        }
      }

      // Create a document record in driver_documents table for tracking/approval
      // This is the same table the web app reads from
      try {
        // Try with doc_type column first (primary column name in driver_documents)
        const { error: docError } = await supabaseAdmin
          .from('driver_documents')
          .insert({
            driver_id: driver.id,
            doc_type: normalizedDocType,
            file_url: publicUrl,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (docError) {
          console.error('[Mobile Docs] Failed to create document in driver_documents:', docError);
          
          // Fallback: try storage layer which uses 'documents' table
          try {
            await storage.createDocument({
              driverId: driver.id,
              type: normalizedDocType as any,
              fileName: file.originalname,
              fileUrl: publicUrl,
              status: 'pending',
            });
            console.log('[Mobile Docs] Created document in storage/documents table');
          } catch (storageErr) {
            console.error('[Mobile Docs] Storage createDocument also failed:', storageErr);
          }
        } else {
          console.log('[Mobile Docs] Created document in driver_documents table');
        }
      } catch (err) {
        console.error('[Mobile Docs] Error creating document record:', err);
      }

      console.log(`[Mobile Docs] Successfully uploaded ${documentType} for driver ${driver.driverCode || driver.id}`);

      res.json({
        success: true,
        message: "Document uploaded successfully",
        documentType,
        url: publicUrl,
        fileName: file.originalname,
        fileSize: file.size,
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

      console.log(`[GPS Update] ${driver.driverCode || driver.id}: lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}, speed=${speed||'n/a'}, accuracy=${accuracy||'n/a'}`);

      const updatedDriver = await storage.updateDriverLocation(
        driver.id, 
        lat.toFixed(7), 
        lng.toFixed(7),
        {
          speed: speed ? parseFloat(speed) : undefined,
          heading: heading ? parseFloat(heading) : undefined,
          accuracy: accuracy ? parseFloat(accuracy) : undefined,
        }
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

      console.log(`[Mobile Jobs] *** FETCHING JOBS for driver ${driver.driverCode} (id=${driver.id}) ***`);
      console.log(`[Mobile Jobs] Driver auth userId: ${driver.userId}, driverCode: ${driver.driverCode}`);

      let mobileJobs: any[] = [];

      // Build list of all possible driver IDs (id, userId, auth UUID may differ)
      const allDriverIds: string[] = [driver.id];
      if (driver.userId && driver.userId !== driver.id) {
        allDriverIds.push(driver.userId);
      }
      console.log(`[Mobile Jobs] Using driver IDs: ${allDriverIds.join(', ')}`);

      // CRITICAL: Query Supabase FIRST as it's the source of truth
      // SECURITY: Explicitly select ONLY driver-safe columns - NEVER include total_price/base_price/customer pricing
      if (supabaseAdmin) {
        console.log("[Mobile Jobs] Querying Supabase for jobs (driver-safe columns only)...");
        
        // STEP 1: Get job_assignments for this driver (exclude rejected/expired/withdrawn)
        // CRITICAL: Don't show jobs from rejected assignments - driver declined them
        let allAssignments: any[] = [];
        for (const dId of allDriverIds) {
          const { data: assignments, error: assignmentsError } = await supabaseAdmin
            .from('job_assignments')
            .select('job_id, driver_price, status')
            .eq('driver_id', dId)
            .not('status', 'in', '("rejected","expired","withdrawn","cancelled")');
          
          if (assignmentsError) {
            console.log(`[Mobile Jobs] Error fetching assignments for ${dId}:`, assignmentsError.message);
          } else if (assignments) {
            allAssignments.push(...assignments);
          }
        }
        
        // Filter to only include valid assignments
        const validAssignments = allAssignments.filter(a => 
          !['rejected', 'expired', 'withdrawn', 'cancelled'].includes(a.status)
        );
        const assignmentJobIds = validAssignments.map(a => String(a.job_id));
        console.log(`[Mobile Jobs] Found ${allAssignments.length} job assignments for driver ${driver.id} (${assignmentJobIds.length} valid)`);
        
        // STEP 2: Get jobs where driver_id is set OR job has an assignment for this driver
        let supabaseJobs: any[] = [];
        
        const driverSafeSelect = `
            id,
            tracking_number,
            job_number,
            status,
            driver_price,
            vehicle_type,
            priority,
            pickup_address,
            pickup_postcode,
            pickup_latitude,
            pickup_longitude,
            pickup_instructions,
            pickup_contact_name,
            pickup_contact_phone,
            pickup_building_name,
            delivery_address,
            delivery_postcode,
            delivery_latitude,
            delivery_longitude,
            delivery_instructions,
            delivery_building_name,
            recipient_name,
            recipient_phone,
            sender_name,
            sender_phone,
            customer_name,
            customer_phone,
            weight,
            distance,
            scheduled_pickup_time,
            estimated_delivery_time,
            actual_pickup_time,
            actual_delivery_time,
            pod_signature_url,
            pod_photo_url,
            pod_notes,
            is_multi_drop,
            is_return_trip,
            driver_hidden,
            notes,
            created_at,
            updated_at
          `;
        
        // 7-day cutoff for completed jobs — computed once, applied at query level
        const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Query jobs directly assigned to driver.
        // DB-level filter: show job if status is NOT completed, OR if it was updated within 7 days.
        console.log(`[Mobile Jobs] Querying jobs with driver_id IN [${allDriverIds.join(', ')}]`);
        const { data: directJobs, error: directError } = await supabaseAdmin
          .from('jobs')
          .select(driverSafeSelect)
          .in('driver_id', allDriverIds)
          .or(`status.not.in.(delivered,cancelled,failed),updated_at.gte.${sevenDaysAgoIso}`)
          .order('created_at', { ascending: false });
        
        if (directError) {
          console.log("[Mobile Jobs] Supabase direct jobs query error:", directError.message);
        } else if (directJobs) {
          supabaseJobs = [...directJobs];
          console.log(`[Mobile Jobs] Found ${directJobs.length} directly assigned jobs`);
        }
        
        // Also fetch jobs from assignments (for pending/sent offers not yet accepted)
        if (assignmentJobIds.length > 0) {
          const { data: assignedJobs, error: assignedError } = await supabaseAdmin
            .from('jobs')
            .select(driverSafeSelect)
            .in('id', assignmentJobIds.map(id => parseInt(id) || id))
            .or(`status.not.in.(delivered,cancelled,failed),updated_at.gte.${sevenDaysAgoIso}`);
          
          if (assignedError) {
            console.log("[Mobile Jobs] Supabase assigned jobs query error:", assignedError.message);
          } else if (assignedJobs) {
            // Merge, avoiding duplicates
            const existingIds = new Set(supabaseJobs.map(j => String(j.id)));
            for (const job of assignedJobs) {
              if (!existingIds.has(String(job.id))) {
                supabaseJobs.push(job);
              }
            }
            console.log(`[Mobile Jobs] Added ${assignedJobs.length} jobs from assignments, total: ${supabaseJobs.length}`);
          }
        }
        
        if (supabaseJobs.length > 0) {
          console.log(`[Mobile Jobs] Total ${supabaseJobs.length} jobs found for driver ${driver.id}`);
          
          // CRITICAL: Filter out hidden jobs (admin can hide jobs from driver view)
          const beforeHiddenFilter = supabaseJobs.length;
          supabaseJobs = supabaseJobs.filter(j => j.driver_hidden !== true);
          console.log(`[Mobile Jobs] Filtered ${beforeHiddenFilter - supabaseJobs.length} hidden jobs, ${supabaseJobs.length} remaining`);

          // AUTO-WITHDRAW: JS safety net — belt-and-braces after the DB-level filter above.
          // Removes completed jobs older than 7 days in case any slipped through.
          const completedJobStatuses = ['delivered', 'cancelled', 'failed'];
          const beforeAgeFilter = supabaseJobs.length;
          supabaseJobs = supabaseJobs.filter(j => {
            if (!completedJobStatuses.includes(j.status)) return true;
            const jobDate = j.updated_at || j.created_at;
            return jobDate && jobDate > sevenDaysAgoIso;
          });
          if (beforeAgeFilter - supabaseJobs.length > 0) {
            console.log(`[Mobile Jobs] Auto-withdrew ${beforeAgeFilter - supabaseJobs.length} completed jobs older than 7 days, ${supabaseJobs.length} remaining`);
          }
          
          // Create assignment map for driver_price lookup (using filtered valid assignments)
          const assignments = validAssignments || [];
          console.log(`[Mobile Jobs] Found ${assignments.length} valid assignments (excluded rejected/expired/withdrawn)`);
          
          // Create a map of job_id -> assignment with driver_price
          const assignmentMap = new Map<string, { driver_price: number | null, status: string }>();
          if (assignments) {
            for (const a of assignments) {
              // Prefer accepted assignments, then sent, then pending
              const existing = assignmentMap.get(String(a.job_id));
              if (!existing || 
                  (a.status === 'accepted' && existing.status !== 'accepted') ||
                  (a.status === 'sent' && existing.status === 'pending')) {
                assignmentMap.set(String(a.job_id), { driver_price: a.driver_price, status: a.status });
                console.log(`[Mobile Jobs] Assignment for job ${a.job_id}: driver_price=${a.driver_price}, status=${a.status}`);
              }
            }
          }
          
          // Enrich jobs with driver_price from assignments (fallback to job.driver_price)
          let enrichedJobs = supabaseJobs.map(j => {
            const assignment = assignmentMap.get(String(j.id));
            const driverPrice = assignment?.driver_price ?? j.driver_price;
            if (assignment) {
              console.log(`[Mobile Jobs] Job ${j.id}: using assignment driver_price=${driverPrice}`);
            }
            return { ...j, driver_price: driverPrice };
          });
          
          // Apply status filters first
          // "active" = jobs the driver has ACCEPTED and is working on
          // "pending" = job offers waiting for driver to accept/decline
          // "completed" = job history (delivered, cancelled, failed)
          if (status === "active") {
            enrichedJobs = enrichedJobs.filter(j => 
              ["accepted", "on_the_way_pickup", "arrived_pickup", "collected", "on_the_way_delivery", "picked_up", "on_the_way"].includes(j.status)
            );
            // For active jobs, require driver_price (driver needs to know earnings)
            enrichedJobs = enrichedJobs.filter(j => j.driver_price != null);
          } else if (status === "pending") {
            enrichedJobs = enrichedJobs.filter(j => ["assigned", "pending", "offered"].includes(j.status));
            // For pending jobs, show offers even without driver_price (pricing may be pending)
            // Driver can still see and respond to offers
          } else if (status === "completed") {
            // For history/completed jobs, show ALL jobs regardless of driver_price
            // This ensures drivers can see their full job history
            enrichedJobs = enrichedJobs.filter(j => ["delivered", "cancelled", "failed"].includes(j.status));
          } else {
            // No filter specified - show all jobs but filter by driver_price for non-completed
            const completedStatuses = ["delivered", "cancelled", "failed"];
            enrichedJobs = enrichedJobs.filter(j => 
              completedStatuses.includes(j.status) || j.driver_price != null
            );
          }
          
          console.log(`[Mobile Jobs] ${enrichedJobs.length} jobs after filtering`);
          
          // CRITICAL: Fetch multi-drop stops for jobs that have is_multi_drop = true
          const multiDropJobIds = enrichedJobs
            .filter(j => j.is_multi_drop === true)
            .map(j => String(j.id)); // Convert to strings for varchar job_id column
          
          let multiDropStopsMap: Record<string, any[]> = {};
          
          if (multiDropJobIds.length > 0) {
            console.log(`[Mobile Jobs] Fetching multi-drop stops for ${multiDropJobIds.length} jobs:`, multiDropJobIds);
            const { data: allStops, error: stopsError } = await supabaseAdmin
              .from('multi_drop_stops')
              .select('*')
              .in('job_id', multiDropJobIds)
              .order('stop_order', { ascending: true });
            
            if (stopsError) {
              console.log(`[Mobile Jobs] Error fetching multi-drop stops:`, stopsError.message);
            } else if (allStops) {
              // Group stops by job_id
              for (const stop of allStops) {
                const jobId = String(stop.job_id);
                if (!multiDropStopsMap[jobId]) {
                  multiDropStopsMap[jobId] = [];
                }
                multiDropStopsMap[jobId].push(stop);
              }
              console.log(`[Mobile Jobs] Found ${allStops.length} multi-drop stops for ${Object.keys(multiDropStopsMap).length} jobs`);
            }
          }
          
          // Map jobs with their multi-drop stops
          mobileJobs = enrichedJobs.map(j => {
            const stops = multiDropStopsMap[String(j.id)] || [];
            const mapped = mapSupabaseJobToMobileFormat(j, stops);
            // Ensure job number is consistent with website (in-memory cache + Supabase persist)
            if (!mapped.jobNumber) {
              const numbered = ensureJobNumber({ id: j.id, jobNumber: j.job_number || null });
              (mapped as any).jobNumber = numbered.jobNumber;
            }
            return mapped;
          });
          
          // Fetch route data for each job with coordinates
          for (const mj of mobileJobs) {
            const rd = await fetchRouteDataForJob(
              mj.pickupLatitude?.toString() || null,
              mj.pickupLongitude?.toString() || null,
              mj.deliveryLatitude?.toString() || null,
              mj.deliveryLongitude?.toString() || null
            );
            if (rd) {
              (mj as any).routePolyline = rd.routePolyline;
              (mj as any).routeDistance = rd.routeDistance;
              (mj as any).routeDuration = rd.routeDuration;
              (mj as any).staticMapUrl = rd.staticMapUrl;
            }
          }
          
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
      
      // Apply status filters
      // "active" = jobs the driver has ACCEPTED and is working on
      // "pending" = job offers waiting for driver to accept/decline
      // "completed" = job history (delivered, cancelled, failed)
      const completedStatuses = ["delivered", "cancelled", "failed"];

      // AUTO-WITHDRAW: Remove completed jobs older than 7 days (fallback path)
      const fallbackSevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      jobs = jobs.filter(j => {
        if (!completedStatuses.includes(j.status)) return true;
        const jobDate = new Date((j as any).createdAt || (j as any).created_at || 0);
        return jobDate > fallbackSevenDaysAgo;
      });
      
      if (status === "active") {
        // Filter out hidden jobs for active view
        jobs = jobs.filter(j => (j as any).driverHidden !== true);
        jobs = jobs.filter(j => 
          ["accepted", "on_the_way_pickup", "arrived_pickup", "collected", "on_the_way_delivery", "picked_up", "on_the_way"].includes(j.status)
        );
        // For active jobs, require driver_price
        jobs = jobs.filter(j => j.driverPrice != null);
      } else if (status === "pending") {
        // Filter out hidden jobs for pending view
        jobs = jobs.filter(j => (j as any).driverHidden !== true);
        jobs = jobs.filter(j => ["assigned", "pending", "offered"].includes(j.status));
      } else if (status === "completed") {
        // For history/completed jobs, show only recent completed jobs (already age-filtered above)
        jobs = jobs.filter(j => completedStatuses.includes(j.status));
      } else {
        // No filter - show all, only filter hidden for non-completed
        jobs = jobs.filter(j => {
          if (completedStatuses.includes(j.status)) return true;
          return (j as any).driverHidden !== true && j.driverPrice != null;
        });
      }
      
      console.log(`[Mobile Jobs] After status filter (${status || 'all'}): ${jobs.length} jobs`);

      // Fetch multi-drop stops for fallback path
      const fallbackMultiDropIds = jobs
        .filter(j => (j as any).isMultiDrop === true)
        .map(j => String(j.id));
      
      let fallbackStopsMap: Record<string, any[]> = {};
      if (fallbackMultiDropIds.length > 0 && supabaseAdmin) {
        const { data: fbStops } = await supabaseAdmin
          .from('multi_drop_stops')
          .select('*')
          .in('job_id', fallbackMultiDropIds)
          .order('stop_order', { ascending: true });
        
        if (fbStops) {
          for (const stop of fbStops) {
            const jId = String(stop.job_id);
            if (!fallbackStopsMap[jId]) fallbackStopsMap[jId] = [];
            fallbackStopsMap[jId].push(stop);
          }
        }
      }

      mobileJobs = jobs.map(job => {
        const j = job as any;
        const stops = fallbackStopsMap[String(job.id)] || [];
        const mappedStops = stops.map((stop: any) => ({
          id: String(stop.id),
          stopOrder: stop.stop_order,
          stop_order: stop.stop_order,
          order: stop.stop_order,
          address: stop.address,
          postcode: stop.postcode || null,
          contactName: stop.contact_name || stop.recipient_name || null,
          contact_name: stop.contact_name || stop.recipient_name || null,
          contactPhone: stop.contact_phone || stop.recipient_phone || null,
          contact_phone: stop.contact_phone || stop.recipient_phone || null,
          recipientName: stop.recipient_name || stop.contact_name || null,
          recipient_name: stop.recipient_name || stop.contact_name || null,
          recipientPhone: stop.recipient_phone || stop.contact_phone || null,
          recipient_phone: stop.recipient_phone || stop.contact_phone || null,
          instructions: stop.instructions || null,
          latitude: stop.latitude?.toString() || null,
          longitude: stop.longitude?.toString() || null,
          status: stop.status || 'pending',
          completedAt: stop.completed_at || null,
          completed_at: stop.completed_at || null,
        }));

        return {
          id: job.id,
          trackingNumber: job.trackingNumber,
          jobNumber: j.jobNumber || null,
          status: job.status,
          pickupAddress: job.pickupAddress,
          pickupPostcode: job.pickupPostcode,
          pickupInstructions: job.pickupInstructions,
          pickupLatitude: job.pickupLatitude?.toString() || null,
          pickupLongitude: job.pickupLongitude?.toString() || null,
          deliveryAddress: job.deliveryAddress,
          deliveryPostcode: job.deliveryPostcode,
          deliveryInstructions: job.deliveryInstructions,
          deliveryLatitude: job.deliveryLatitude?.toString() || null,
          deliveryLongitude: job.deliveryLongitude?.toString() || null,
          recipientName: job.recipientName,
          recipientPhone: job.recipientPhone || null,
          senderName: j.pickupContactName || j.senderName || j.customerName || null,
          senderPhone: j.pickupContactPhone || j.senderPhone || j.customerPhone || null,
          pickupContactPhone: j.pickupContactPhone || j.senderPhone || null,
          pickupContactName: j.pickupContactName || j.senderName || null,
          customerName: j.customerName || null,
          customerPhone: j.customerPhone || null,
          vehicleType: job.vehicleType,
          distance: job.distance?.toString() || null,
          weight: job.weight?.toString() || null,
          driverPrice: job.driverPrice !== null && job.driverPrice !== undefined ? String(job.driverPrice) : null,
          scheduledPickupTime: job.scheduledPickupTime,
          isMultiDrop: job.isMultiDrop || false,
          is_multi_drop: (job as any).isMultiDrop || false,
          isReturnTrip: job.isReturnTrip,
          multiDropStops: mappedStops,
          stops: mappedStops,
          totalStops: mappedStops.length,
          total_stops: mappedStops.length,
          numberOfDrops: mappedStops.length,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        };
      });

      res.json({
        jobs: mobileJobs,
        count: mobileJobs.length,
      });
    })
  );

  // Hide a job from driver's view (for failed/cancelled/completed jobs)
  app.post("/api/mobile/v1/driver/jobs/:jobId/hide",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { jobId } = req.params;
      
      console.log(`[Mobile] Driver ${driver.driverCode} hiding job ${jobId}`);
      
      // Verify this job belongs to the driver
      if (supabaseAdmin) {
        const { data: job, error } = await supabaseAdmin
          .from('jobs')
          .select('id, driver_id, status')
          .eq('id', jobId)
          .single();
        
        if (error || !job) {
          return res.status(404).json({
            success: false,
            error: "Job not found"
          });
        }
        
        if (job.driver_id !== driver.id) {
          return res.status(403).json({
            success: false,
            error: "You can only hide your own jobs"
          });
        }
        
        // Only allow hiding completed jobs (delivered, cancelled, failed)
        const allowedStatuses = ['delivered', 'cancelled', 'failed'];
        if (!allowedStatuses.includes(job.status)) {
          return res.status(400).json({
            success: false,
            error: "Can only hide completed, cancelled, or failed jobs"
          });
        }
        
        // Mark job as hidden from driver view
        const { error: updateError } = await supabaseAdmin
          .from('jobs')
          .update({ 
            driver_hidden: true,
            driver_hidden_at: new Date().toISOString()
          })
          .eq('id', jobId);
        
        if (updateError) {
          console.error(`[Mobile] Failed to hide job ${jobId}:`, updateError.message);
          return res.status(500).json({
            success: false,
            error: "Failed to hide job"
          });
        }
        
        console.log(`[Mobile] Job ${jobId} hidden for driver ${driver.driverCode}`);
        
        return res.json({
          success: true,
          message: "Job hidden successfully"
        });
      }
      
      // Fallback to local storage
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job not found"
        });
      }
      
      if (job.driverId !== driver.id) {
        return res.status(403).json({
          success: false,
          error: "You can only hide your own jobs"
        });
      }
      
      // Only allow hiding completed jobs (delivered, cancelled, failed)
      const allowedStatuses = ['delivered', 'cancelled', 'failed'];
      if (!allowedStatuses.includes(job.status)) {
        return res.status(400).json({
          success: false,
          error: "Can only hide completed, cancelled, or failed jobs"
        });
      }
      
      await storage.updateJob(jobId, { driverHidden: true, driverHiddenAt: new Date() } as any);
      
      res.json({
        success: true,
        message: "Job hidden successfully"
      });
    })
  );

  // Complete an individual multi-drop stop
  // Allows drivers to mark each stop as delivered one by one
  app.patch("/api/mobile/v1/driver/jobs/:jobId/stops/:stopId/complete",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { jobId, stopId } = req.params;
      const { podPhotoUrl, podSignatureUrl, recipientName, notes } = req.body;
      
      console.log(`[Multi-Drop] Driver ${driver.driverCode} completing stop ${stopId} for job ${jobId}`);
      
      if (!supabaseAdmin) {
        return res.status(500).json({
          success: false,
          error: "Database not available"
        });
      }
      
      // Verify the job belongs to this driver
      const { data: job, error: jobError } = await supabaseAdmin
        .from('jobs')
        .select('id, driver_id, is_multi_drop, status')
        .eq('id', jobId)
        .single();
      
      if (jobError || !job) {
        return res.status(404).json({
          success: false,
          error: "Job not found"
        });
      }
      
      if (job.driver_id !== driver.id) {
        return res.status(403).json({
          success: false,
          error: "This job is not assigned to you"
        });
      }
      
      if (!job.is_multi_drop) {
        return res.status(400).json({
          success: false,
          error: "This is not a multi-drop job"
        });
      }
      
      // Verify the stop exists and belongs to this job
      const { data: stop, error: stopError } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('*')
        .eq('id', stopId)
        .eq('job_id', String(jobId))
        .single();
      
      if (stopError || !stop) {
        return res.status(404).json({
          success: false,
          error: "Stop not found"
        });
      }
      
      if (stop.status === 'delivered') {
        return res.status(400).json({
          success: false,
          error: "This stop has already been completed"
        });
      }
      
      // Update the stop as completed
      const { data: updatedStop, error: updateError } = await supabaseAdmin
        .from('multi_drop_stops')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          pod_photo_url: podPhotoUrl || null,
          pod_signature_url: podSignatureUrl || null,
          pod_recipient_name: recipientName || null,
          notes: notes || stop.notes,
        })
        .eq('id', stopId)
        .select()
        .single();
      
      if (updateError) {
        console.error(`[Multi-Drop] Failed to complete stop ${stopId}:`, updateError.message);
        return res.status(500).json({
          success: false,
          error: "Failed to complete stop"
        });
      }
      
      // Check if all stops are now completed
      const { data: allStops, error: allStopsError } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('id, status, pod_photo_url, pod_recipient_name, stop_order')
        .eq('job_id', String(jobId))
        .order('stop_order', { ascending: true });
      
      const allCompleted = allStops && allStops.length > 0 && allStops.every(s => s.status === 'delivered');
      const completedCount = allStops?.filter(s => s.status === 'delivered').length || 0;
      const totalCount = allStops?.length || 0;
      
      console.log(`[Multi-Drop] Stop ${stopId} completed. Progress: ${completedCount}/${totalCount}`);
      
      if (allCompleted) {
        console.log(`[Multi-Drop] All ${totalCount} stops delivered for job ${jobId} — auto-completing job`);

        // Build synthetic POD from stop data
        const syntheticPodRecipient = updatedStop.pod_recipient_name || 'Multi-drop complete';
        const syntheticPodPhoto = allStops!.find(s => s.pod_photo_url)?.pod_photo_url || null;

        // Set synthetic POD on the main job
        await storage.updateJob(String(jobId), {
          podNotes: `Multi-drop delivery completed. ${totalCount} stops delivered.`,
          podRecipientName: syntheticPodRecipient,
          podPhotoUrl: syntheticPodPhoto,
        });

        // Mark job as delivered
        const deliveredJob = await storage.updateJobStatus(String(jobId), 'delivered');

        if (deliveredJob) {
          console.log(`[Multi-Drop] Job ${jobId} auto-completed successfully`);

          // Broadcast WebSocket update
          broadcastJobUpdate({
            id: deliveredJob.id,
            trackingNumber: deliveredJob.trackingNumber,
            status: 'delivered',
            previousStatus: job.status,
            customerId: deliveredJob.customerId,
            driverId: deliveredJob.driverId,
            updatedAt: deliveredJob.updatedAt,
          });

          // Send delivery confirmation email (non-blocking)
          (async () => {
            try {
              let customerEmail = (deliveredJob as any).customerEmail;
              if (!customerEmail && deliveredJob.customerId) {
                const customer = await storage.getUser(deliveredJob.customerId);
                customerEmail = customer?.email;
              }
              if (!customerEmail && supabaseAdmin) {
                const { data: sJob } = await supabaseAdmin
                  .from('jobs')
                  .select('customer_email')
                  .eq('id', String(jobId))
                  .single();
                if (sJob?.customer_email) customerEmail = sJob.customer_email;
              }
              if (customerEmail) {
                await sendDeliveryConfirmationEmail(customerEmail, {
                  trackingNumber: deliveredJob.trackingNumber,
                  jobNumber: deliveredJob.jobNumber || '',
                  pickupAddress: deliveredJob.pickupAddress,
                  pickupPostcode: deliveredJob.pickupPostcode,
                  deliveryAddress: deliveredJob.deliveryAddress,
                  deliveryPostcode: deliveredJob.deliveryPostcode,
                  recipientName: deliveredJob.recipientName,
                  podRecipientName: syntheticPodRecipient,
                  podPhotoUrl: syntheticPodPhoto,
                  deliveredAt: new Date().toISOString(),
                });
                console.log(`[Multi-Drop] Delivery confirmation email sent for job ${jobId}`);
              }
            } catch (emailErr) {
              console.error(`[Multi-Drop] Failed to send delivery email for job ${jobId}:`, emailErr);
            }
          })();
        }

        return res.json({
          success: true,
          jobCompleted: true,
          stop: {
            id: updatedStop.id,
            stopOrder: updatedStop.stop_order,
            address: updatedStop.address,
            status: updatedStop.status,
            deliveredAt: updatedStop.delivered_at,
          },
          progress: {
            completed: completedCount,
            total: totalCount,
            allCompleted: true,
          },
          message: `All ${totalCount} stops delivered. Job completed.`,
        });
      }

      res.json({
        success: true,
        jobCompleted: false,
        stop: {
          id: updatedStop.id,
          stopOrder: updatedStop.stop_order,
          address: updatedStop.address,
          status: updatedStop.status,
          deliveredAt: updatedStop.delivered_at,
        },
        progress: {
          completed: completedCount,
          total: totalCount,
          allCompleted: false,
        },
        message: `Stop ${completedCount} of ${totalCount} completed.`,
      });
    })
  );

  // Get all stops for a multi-drop job
  app.get("/api/mobile/v1/driver/jobs/:jobId/stops",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { jobId } = req.params;
      
      if (!supabaseAdmin) {
        return res.status(500).json({
          success: false,
          error: "Database not available"
        });
      }
      
      // Verify the job belongs to this driver
      const { data: job, error: jobError } = await supabaseAdmin
        .from('jobs')
        .select('id, driver_id, is_multi_drop')
        .eq('id', jobId)
        .single();
      
      if (jobError || !job) {
        return res.status(404).json({
          success: false,
          error: "Job not found"
        });
      }
      
      if (job.driver_id !== driver.id) {
        return res.status(403).json({
          success: false,
          error: "This job is not assigned to you"
        });
      }
      
      // Get all stops for this job
      const { data: stops, error: stopsError } = await supabaseAdmin
        .from('multi_drop_stops')
        .select('*')
        .eq('job_id', String(jobId))
        .order('stop_order', { ascending: true });
      
      if (stopsError) {
        console.error(`[Multi-Drop] Error fetching stops for job ${jobId}:`, stopsError.message);
        return res.status(500).json({
          success: false,
          error: "Failed to fetch stops"
        });
      }
      
      // Geocode stops missing coordinates and persist them
      for (const stop of (stops || [])) {
        if (!stop.latitude || !stop.longitude) {
          const addr = stop.address || stop.postcode;
          if (addr) {
            try {
              const geo = await geocodeAddress(addr);
              if (geo) {
                stop.latitude = String(geo.lat);
                stop.longitude = String(geo.lng);
                await supabaseAdmin
                  .from('multi_drop_stops')
                  .update({ latitude: stop.latitude, longitude: stop.longitude })
                  .eq('id', stop.id);
                console.log(`[Multi-Drop] Geocoded stop ${stop.stop_order} for job ${jobId}: ${geo.lat}, ${geo.lng}`);
              }
            } catch (e) { /* non-critical */ }
          }
        }
      }

      const mappedStops = (stops || []).map(stop => ({
        id: String(stop.id),
        stopOrder: stop.stop_order,
        stop_order: stop.stop_order,
        order: stop.stop_order,
        address: stop.address,
        postcode: stop.postcode || null,
        contactName: stop.contact_name || stop.recipient_name || null,
        contact_name: stop.contact_name || stop.recipient_name || null,
        contactPhone: stop.contact_phone || stop.recipient_phone || null,
        contact_phone: stop.contact_phone || stop.recipient_phone || null,
        recipientName: stop.recipient_name || stop.contact_name || null,
        recipient_name: stop.recipient_name || stop.contact_name || null,
        recipientPhone: stop.recipient_phone || stop.contact_phone || null,
        recipient_phone: stop.recipient_phone || stop.contact_phone || null,
        instructions: stop.instructions || null,
        latitude: stop.latitude?.toString() || null,
        longitude: stop.longitude?.toString() || null,
        status: stop.status || 'pending',
        deliveredAt: stop.delivered_at || null,
        delivered_at: stop.delivered_at || null,
        podPhotoUrl: stop.pod_photo_url || null,
        pod_photo_url: stop.pod_photo_url || null,
        podSignatureUrl: stop.pod_signature_url || null,
        pod_signature_url: stop.pod_signature_url || null,
      }));
      
      console.log(`[Multi-Drop Stops] Returning ${mappedStops.length} stops for job ${jobId}:`, JSON.stringify(mappedStops.map(s => ({ order: s.stopOrder, address: s.address, postcode: s.postcode }))));
      
      const completedCount = mappedStops.filter(s => s.status === 'delivered').length;
      
      res.json({
        success: true,
        stops: mappedStops,
        multiDropStops: mappedStops,
        progress: {
          completed: completedCount,
          total: mappedStops.length,
          allCompleted: completedCount === mappedStops.length && mappedStops.length > 0,
        }
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
      
      // If not found, query Supabase directly with DRIVER-SAFE columns only
      // SECURITY: Never select total_price, base_price, or other customer pricing columns
      if (!job && supabaseAdmin) {
        console.log(`[Job Details] Job ${jobId} not in storage, querying Supabase (driver-safe columns)...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select(`
            id,
            tracking_number,
            job_number,
            status,
            driver_id,
            driver_price,
            vehicle_type,
            priority,
            pickup_address,
            pickup_postcode,
            pickup_latitude,
            pickup_longitude,
            pickup_instructions,
            pickup_contact_name,
            pickup_contact_phone,
            pickup_building_name,
            delivery_address,
            delivery_postcode,
            delivery_latitude,
            delivery_longitude,
            delivery_instructions,
            delivery_building_name,
            recipient_name,
            recipient_phone,
            sender_name,
            sender_phone,
            customer_name,
            customer_phone,
            customer_email,
            weight,
            distance,
            scheduled_pickup_time,
            estimated_delivery_time,
            actual_pickup_time,
            actual_delivery_time,
            pod_signature_url,
            pod_photo_url,
            pod_photos,
            pod_notes,
            pod_recipient_name,
            delivered_at,
            is_multi_drop,
            is_return_trip,
            notes,
            created_at,
            updated_at
          `)
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

      // Look up driver_price from job_assignments as it's more reliable than jobs.driver_price
      // IMPORTANT: job_assignments.job_id is TEXT, so convert jobId to string
      let assignmentDriverPrice: number | null = null;
      if (supabaseAdmin) {
        const { data: assignment } = await supabaseAdmin
          .from('job_assignments')
          .select('driver_price')
          .eq('job_id', String(jobId))
          .eq('driver_id', driver.id)
          .in('status', ['accepted', 'sent', 'pending'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        // CRITICAL: Use explicit null/undefined check — never treat 0 as missing
        // driver_price of £0.00 is a valid admin-assigned price and must be preserved
        if (assignment !== null && assignment !== undefined
            && assignment.driver_price !== null && assignment.driver_price !== undefined) {
          assignmentDriverPrice = typeof assignment.driver_price === 'number'
            ? assignment.driver_price
            : parseFloat(String(assignment.driver_price));
          console.log(`[Job Details] Found driver_price ${assignmentDriverPrice} from job_assignments (raw: ${assignment.driver_price})`);
        }
      }

      // Include driver's current location for map display
      const driverLocation = {
        latitude: driver.currentLatitude,
        longitude: driver.currentLongitude,
        lastUpdate: driver.lastLocationUpdate,
      };

      // Geocode missing coordinates
      if (supabaseAdmin) {
        const effectiveJob = job || supabaseJob;
        const pickupAddr = effectiveJob?.pickupAddress || effectiveJob?.pickup_address || effectiveJob?.pickupPostcode || effectiveJob?.pickup_postcode;
        const deliveryAddr = effectiveJob?.deliveryAddress || effectiveJob?.delivery_address || effectiveJob?.deliveryPostcode || effectiveJob?.delivery_postcode;
        
        let pickupLat = job?.pickupLatitude?.toString() || supabaseJob?.pickup_latitude?.toString() || null;
        let pickupLng = job?.pickupLongitude?.toString() || supabaseJob?.pickup_longitude?.toString() || null;
        let deliveryLat = job?.deliveryLatitude?.toString() || supabaseJob?.delivery_latitude?.toString() || null;
        let deliveryLng = job?.deliveryLongitude?.toString() || supabaseJob?.delivery_longitude?.toString() || null;
        
        if (!pickupLat || !pickupLng) {
          if (pickupAddr) {
            const geo = await geocodeAddress(pickupAddr);
            if (geo) {
              pickupLat = String(geo.lat);
              pickupLng = String(geo.lng);
              await supabaseAdmin.from('jobs').update({ pickup_latitude: pickupLat, pickup_longitude: pickupLng }).eq('id', jobId);
              if (job) { (job as any).pickupLatitude = pickupLat; (job as any).pickupLongitude = pickupLng; }
              if (supabaseJob) { supabaseJob.pickup_latitude = pickupLat; supabaseJob.pickup_longitude = pickupLng; }
            }
          }
        }
        
        if (!deliveryLat || !deliveryLng) {
          if (deliveryAddr) {
            const geo = await geocodeAddress(deliveryAddr);
            if (geo) {
              deliveryLat = String(geo.lat);
              deliveryLng = String(geo.lng);
              await supabaseAdmin.from('jobs').update({ delivery_latitude: deliveryLat, delivery_longitude: deliveryLng }).eq('id', jobId);
              if (job) { (job as any).deliveryLatitude = deliveryLat; (job as any).deliveryLongitude = deliveryLng; }
              if (supabaseJob) { supabaseJob.delivery_latitude = deliveryLat; supabaseJob.delivery_longitude = deliveryLng; }
            }
          }
        }
      }

      // Fetch route data from Google Directions
      const pLat = job?.pickupLatitude?.toString() || supabaseJob?.pickup_latitude?.toString() || null;
      const pLng = job?.pickupLongitude?.toString() || supabaseJob?.pickup_longitude?.toString() || null;
      const dLat = job?.deliveryLatitude?.toString() || supabaseJob?.delivery_latitude?.toString() || null;
      const dLng = job?.deliveryLongitude?.toString() || supabaseJob?.delivery_longitude?.toString() || null;
      const routeData = await fetchRouteDataForJob(pLat, pLng, dLat, dLng);

      // Fetch multi-drop stops if this is a multi-drop job
      const effectiveJob = job || supabaseJob;
      const isMultiDrop = job ? (job as any).isMultiDrop : (supabaseJob?.is_multi_drop || false);
      let multiDropStops: any[] = [];
      
      if (isMultiDrop && supabaseAdmin) {
        console.log(`[Job Details] Fetching multi-drop stops for job ${jobId}`);
        const { data: stops, error: stopsError } = await supabaseAdmin
          .from('multi_drop_stops')
          .select('*')
          .eq('job_id', String(jobId))
          .order('stop_order', { ascending: true });
        
        if (!stopsError && stops) {
          multiDropStops = stops.map((stop: any) => ({
            id: String(stop.id),
            stopOrder: stop.stop_order,
            stop_order: stop.stop_order,
            order: stop.stop_order,
            address: stop.address,
            postcode: stop.postcode || null,
            contactName: stop.contact_name || stop.recipient_name || null,
            contact_name: stop.contact_name || stop.recipient_name || null,
            contactPhone: stop.contact_phone || stop.recipient_phone || null,
            contact_phone: stop.contact_phone || stop.recipient_phone || null,
            recipientName: stop.recipient_name || stop.contact_name || null,
            recipient_name: stop.recipient_name || stop.contact_name || null,
            recipientPhone: stop.recipient_phone || stop.contact_phone || null,
            recipient_phone: stop.recipient_phone || stop.contact_phone || null,
            instructions: stop.instructions || null,
            latitude: stop.latitude?.toString() || null,
            longitude: stop.longitude?.toString() || null,
            status: stop.status || 'pending',
            completedAt: stop.completed_at || null,
            completed_at: stop.completed_at || null,
          }));
          console.log(`[Job Details] Found ${multiDropStops.length} multi-drop stops for job ${jobId}:`, JSON.stringify(multiDropStops));
        }
      }

      // Build response from either source
      if (job) {
        const effectiveDriverPrice = job.driverPrice ?? assignmentDriverPrice;
        const j = ensureJobNumber(job as any);
        res.json({
          id: job.id,
          trackingNumber: job.trackingNumber,
          jobNumber: j.jobNumber || null,
          status: job.status,
          pickupAddress: job.pickupAddress,
          pickupPostcode: job.pickupPostcode,
          pickupInstructions: job.pickupInstructions,
          pickupBuildingName: j.pickupBuildingName || null,
          pickupLatitude: job.pickupLatitude?.toString() || null,
          pickupLongitude: job.pickupLongitude?.toString() || null,
          deliveryAddress: job.deliveryAddress,
          deliveryPostcode: job.deliveryPostcode,
          deliveryInstructions: job.deliveryInstructions,
          deliveryBuildingName: j.deliveryBuildingName || null,
          deliveryLatitude: job.deliveryLatitude?.toString() || null,
          deliveryLongitude: job.deliveryLongitude?.toString() || null,
          recipientName: job.recipientName,
          recipientPhone: job.recipientPhone || null,
          senderName: j.pickupContactName || j.senderName || j.customerName || null,
          senderPhone: j.pickupContactPhone || j.senderPhone || j.customerPhone || null,
          pickupContactPhone: j.pickupContactPhone || j.senderPhone || null,
          pickupContactName: j.pickupContactName || j.senderName || null,
          customerName: j.customerName || null,
          customerPhone: j.customerPhone || null,
          vehicleType: job.vehicleType,
          distance: job.distance?.toString() || null,
          weight: job.weight?.toString() || null,
          driverPrice: effectiveDriverPrice !== null && effectiveDriverPrice !== undefined ? String(effectiveDriverPrice) : null,
          scheduledPickupTime: job.scheduledPickupTime,
          isMultiDrop: (job as any).isMultiDrop || false,
          isReturnTrip: job.isReturnTrip,
          multiDropStops: multiDropStops,
          stops: multiDropStops,
          totalStops: multiDropStops.length,
          podPhotoUrl: job.podPhotoUrl,
          podPhotos: job.podPhotos || [],
          podSignatureUrl: job.podSignatureUrl,
          podNotes: job.podNotes,
          podRecipientName: job.podRecipientName,
          deliveredAt: job.deliveredAt,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          routePolyline: routeData?.routePolyline || null,
          routeDistance: routeData?.routeDistance || null,
          routeDuration: routeData?.routeDuration || null,
          staticMapUrl: routeData?.staticMapUrl || null,
          driverLocation,
        });
      } else {
        const effectiveDriverPrice = supabaseJob.driver_price ?? assignmentDriverPrice;
        const numberedSupabaseJob = ensureJobNumber({ id: supabaseJob.id, jobNumber: supabaseJob.job_number || null });
        res.json({
          id: String(supabaseJob.id),
          trackingNumber: supabaseJob.tracking_number,
          jobNumber: numberedSupabaseJob.jobNumber || null,
          status: supabaseJob.status,
          pickupAddress: supabaseJob.pickup_address,
          pickupPostcode: supabaseJob.pickup_postcode || null,
          pickupInstructions: supabaseJob.notes || supabaseJob.pickup_instructions,
          pickupBuildingName: supabaseJob.pickup_building_name || null,
          pickupLatitude: supabaseJob.pickup_latitude?.toString() || supabaseJob.pickup_lat?.toString() || null,
          pickupLongitude: supabaseJob.pickup_longitude?.toString() || supabaseJob.pickup_lng?.toString() || null,
          deliveryAddress: supabaseJob.delivery_address || supabaseJob.dropoff_address,
          deliveryPostcode: supabaseJob.delivery_postcode || null,
          deliveryInstructions: supabaseJob.delivery_instructions || null,
          deliveryBuildingName: supabaseJob.delivery_building_name || null,
          deliveryLatitude: supabaseJob.delivery_latitude?.toString() || supabaseJob.dropoff_lat?.toString() || null,
          deliveryLongitude: supabaseJob.delivery_longitude?.toString() || supabaseJob.dropoff_lng?.toString() || null,
          recipientName: supabaseJob.recipient_name,
          recipientPhone: supabaseJob.recipient_phone || null,
          senderName: supabaseJob.pickup_contact_name || supabaseJob.sender_name || supabaseJob.customer_name || null,
          senderPhone: supabaseJob.pickup_contact_phone || supabaseJob.sender_phone || supabaseJob.customer_phone || null,
          pickupContactPhone: supabaseJob.pickup_contact_phone || supabaseJob.sender_phone || null,
          pickupContactName: supabaseJob.pickup_contact_name || supabaseJob.sender_name || null,
          customerName: supabaseJob.customer_name || null,
          customerPhone: supabaseJob.customer_phone || null,
          customerEmail: supabaseJob.customer_email || null,
          vehicleType: supabaseJob.vehicle_type,
          distance: supabaseJob.distance?.toString() || null,
          weight: supabaseJob.weight?.toString() || null,
          driverPrice: effectiveDriverPrice !== null && effectiveDriverPrice !== undefined ? String(effectiveDriverPrice) : null,
          scheduledPickupTime: supabaseJob.scheduled_pickup_time,
          isMultiDrop: supabaseJob.is_multi_drop || false,
          isReturnTrip: supabaseJob.is_return_trip || false,
          multiDropStops: multiDropStops,
          stops: multiDropStops,
          totalStops: multiDropStops.length,
          podPhotoUrl: supabaseJob.pod_photo_url,
          podPhotos: supabaseJob.pod_photos || [],
          podSignatureUrl: supabaseJob.pod_signature_url,
          podNotes: supabaseJob.pod_notes,
          podRecipientName: supabaseJob.pod_recipient_name,
          deliveredAt: supabaseJob.delivered_at,
          createdAt: supabaseJob.created_at,
          updatedAt: supabaseJob.updated_at,
          routePolyline: routeData?.routePolyline || null,
          routeDistance: routeData?.routeDistance || null,
          routeDuration: routeData?.routeDuration || null,
          staticMapUrl: routeData?.staticMapUrl || null,
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
      
      // SECURITY: Only select fields needed for validation - NEVER total_price/customer pricing
      if (!job && supabaseAdmin) {
        console.log(`[Status Update] Job ${jobId} not in storage, querying Supabase...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select('id, driver_id, status, pod_photo_url, pod_signature_url')
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

      // If the job is already in the requested status (idempotent) — return success immediately.
      // This handles multi-drop auto-completion: the server already marked the job delivered
      // when the last stop was saved, so the mobile app's "Mark as Delivered" tap is a no-op.
      if (effectiveStatus === status) {
        const existingJob = job || await storage.getJob(jobId);
        console.log(`[Status Update] Job ${jobId} already in status '${status}' — returning success (idempotent)`);
        return res.json({
          success: true,
          alreadyInStatus: true,
          job: {
            id: jobId,
            trackingNumber: existingJob?.trackingNumber || '',
            status,
            updatedAt: existingJob?.updatedAt || new Date(),
          },
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

      // Broadcast real-time status change to all connected clients (admin, dispatcher, customer)
      broadcastJobUpdate({
        id: updatedJob.id,
        trackingNumber: updatedJob.trackingNumber,
        status: updatedJob.status,
        previousStatus: effectiveStatus,
        customerId: updatedJob.customerId,
        driverId: updatedJob.driverId || driver.id,
        updatedAt: updatedJob.updatedAt,
      });

      if (status === "delivered" && supabaseAdmin) {
        (async () => {
          try {
            const { data: fullJob } = await supabaseAdmin
              .from('jobs')
              .select('id, tracking_number, job_number, pickup_address, pickup_postcode, delivery_address, delivery_postcode, recipient_name, pod_recipient_name, pod_photo_url, pod_photos, pod_signature_url, delivered_at, customer_email, customer_id')
              .eq('id', jobId)
              .single();

            if (!fullJob) {
              console.log(`[Delivery Email] Job ${jobId} not found in Supabase, skipping email`);
              return;
            }

            let customerEmail = fullJob.customer_email;
            if (!customerEmail && fullJob.customer_id) {
              const { data: customer } = await supabaseAdmin
                .from('users')
                .select('email')
                .eq('id', fullJob.customer_id)
                .single();
              if (customer?.email) customerEmail = customer.email;
            }

            if (!customerEmail) {
              console.log(`[Delivery Email] No customer email for job ${jobId}, skipping`);
              return;
            }

            let podPhotoUrl = fullJob.pod_photo_url || null;
            let podPhotos: string[] = fullJob.pod_photos || [];
            let podSignatureUrl = fullJob.pod_signature_url || null;

            const resolveUrl = async (storagePath: string): Promise<string> => {
              if (storagePath.startsWith('http')) return storagePath;
              const { data } = supabaseAdmin!.storage.from('pod-images').getPublicUrl(storagePath);
              return data?.publicUrl || storagePath;
            };

            if (podPhotoUrl) podPhotoUrl = await resolveUrl(podPhotoUrl);
            if (podPhotos.length > 0) podPhotos = await Promise.all(podPhotos.map(resolveUrl));
            if (podSignatureUrl) podSignatureUrl = await resolveUrl(podSignatureUrl);

            console.log(`[Delivery Email] Sending to ${customerEmail} for job ${jobId}`);
            await sendDeliveryConfirmationEmail(customerEmail, {
              trackingNumber: fullJob.tracking_number,
              jobNumber: fullJob.job_number,
              pickupAddress: fullJob.pickup_address,
              pickupPostcode: fullJob.pickup_postcode,
              deliveryAddress: fullJob.delivery_address,
              deliveryPostcode: fullJob.delivery_postcode,
              recipientName: fullJob.recipient_name,
              podRecipientName: fullJob.pod_recipient_name,
              podPhotoUrl,
              podPhotos,
              podSignatureUrl,
              deliveredAt: fullJob.delivered_at || new Date().toISOString(),
            });
          } catch (err) {
            console.error(`[Delivery Email] Error sending for job ${jobId}:`, err);
          }
        })();
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
    type: string
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

      const bucket = 'pod-images';
      
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
      const { podPhotoUrl, podSignatureUrl, photo, signature, recipientName, photos, podPhotos, podNotes, notes } = req.body;

      // Extract base64 data - handle multiple formats mobile app might send
      // Could be: string, { base64: string }, { uri: string, base64: string }
      const extractBase64 = (data: any): string | null => {
        if (!data) return null;
        if (typeof data === 'string') return data;
        if (typeof data === 'object') {
          if (data.base64) return data.base64;
          if (data.uri && data.uri.startsWith('data:')) return data.uri;
        }
        return null;
      };

      const photoBase64 = extractBase64(photo);
      const signatureBase64 = extractBase64(signature);

      // Handle photos array - could be array of strings or array of objects
      let photosBase64Array: string[] = [];
      const photosArray = photos || podPhotos;
      if (Array.isArray(photosArray)) {
        photosBase64Array = photosArray.map(p => extractBase64(p)).filter((p): p is string => p !== null);
      }

      console.log(`[POD Upload] Received POD for job ${jobId}:`, {
        hasPhotoUrl: !!podPhotoUrl,
        hasSignatureUrl: !!podSignatureUrl,
        hasPhotoBase64: !!photoBase64,
        hasSignatureBase64: !!signatureBase64,
        photosArrayCount: photosBase64Array.length,
        recipientName: recipientName || 'none',
        notes: podNotes || notes || 'none',
        rawPhotoType: typeof photo,
        rawSignatureType: typeof signature
      });

      // Try storage first, then query Supabase directly
      let job = await storage.getJob(jobId);
      let supabaseJob: any = null;
      
      // SECURITY: Only select fields needed for POD validation - NEVER total_price/customer pricing
      if (!job && supabaseAdmin) {
        console.log(`[POD Upload] Job ${jobId} not in local storage, querying Supabase...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select('id, driver_id, status, pod_photo_url, pod_photos, pod_signature_url, pod_recipient_name, pod_notes')
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
      const existingPhotos: string[] = job?.podPhotos || supabaseJob?.pod_photos || [];
      const existingSignatureUrl = job?.podSignatureUrl || supabaseJob?.pod_signature_url;
      const existingRecipientName = job?.podRecipientName || supabaseJob?.pod_recipient_name;
      const existingNotes = job?.podNotes || supabaseJob?.pod_notes;

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
      if (photoBase64) {
        // It's base64 data, upload to Supabase
        const uploadedUrl = await uploadBase64ToSupabase(photoBase64, jobId, 'photo');
        if (uploadedUrl) {
          finalPhotoUrl = uploadedUrl;
        } else {
          return res.status(500).json({ 
            error: "Failed to upload photo",
            code: "PHOTO_UPLOAD_FAILED"
          });
        }
      }

      // Handle multiple photos array
      let finalPhotosArray: string[] = existingPhotos || [];
      if (photosBase64Array.length > 0) {
        for (let i = 0; i < photosBase64Array.length; i++) {
          const uploadedUrl = await uploadBase64ToSupabase(photosBase64Array[i], jobId, `photo_${i}`);
          if (uploadedUrl) {
            finalPhotosArray.push(uploadedUrl);
          }
        }
      }

      // Handle signature - either URL or base64
      let finalSignatureUrl = podSignatureUrl || existingSignatureUrl;
      if (signatureBase64) {
        // It's base64 data, upload to Supabase
        const uploadedUrl = await uploadBase64ToSupabase(signatureBase64, jobId, 'signature');
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
      const finalNotes = podNotes || notes || existingNotes;
      const updatedJob = await storage.updateJobPOD(jobId, finalPhotoUrl, finalSignatureUrl, finalRecipientName, finalPhotosArray, finalNotes);

      if (!updatedJob) {
        return res.status(500).json({ 
          error: "Failed to save POD",
          code: "POD_UPLOAD_FAILED"
        });
      }

      console.log(`[POD Upload] Job ${jobId} POD saved: photo=${finalPhotoUrl ? 'yes' : 'no'}, photos=${finalPhotosArray.length}, signature=${finalSignatureUrl ? 'yes' : 'no'}`);

      res.json({
        success: true,
        pod: {
          photoUrl: updatedJob.podPhotoUrl,
          photos: updatedJob.podPhotos || [],
          signatureUrl: updatedJob.podSignatureUrl,
          recipientName: updatedJob.podRecipientName,
          notes: updatedJob.podNotes,
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
      
      // SECURITY: Only select fields needed for validation - NEVER total_price/customer pricing
      if (!job && supabaseAdmin) {
        console.log(`[POD File Upload] Job ${jobId} not in local storage, querying Supabase...`);
        const { data, error } = await supabaseAdmin
          .from('jobs')
          .select('id, driver_id, status, pod_photo_url, pod_signature_url, pod_recipient_name')
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

      let updatedJob = await storage.updateJobPOD(jobId, finalPhotoUrl, finalSignatureUrl, finalRecipientName);

      // Fallback: Update Supabase directly if storage layer fails
      if (!updatedJob && supabaseAdmin) {
        console.log(`[POD Upload] Storage layer failed, updating Supabase directly for job ${jobId}`);
        const { data: directUpdate, error: directError } = await supabaseAdmin
          .from('jobs')
          .update({
            pod_photo_url: finalPhotoUrl,
            pod_signature_url: finalSignatureUrl,
            pod_recipient_name: finalRecipientName,
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId)
          .select('id, pod_photo_url, pod_signature_url, pod_recipient_name')
          .single();
        
        if (directError) {
          console.error(`[POD Upload] Direct Supabase update failed:`, directError);
          return res.status(500).json({ 
            error: "Failed to save POD to database",
            code: "POD_SAVE_FAILED",
            details: directError.message
          });
        }
        
        updatedJob = {
          podPhotoUrl: directUpdate.pod_photo_url,
          podSignatureUrl: directUpdate.pod_signature_url,
          podRecipientName: directUpdate.pod_recipient_name
        } as any;
        console.log(`[POD Upload] Direct Supabase update successful for job ${jobId}`);
      }

      if (!updatedJob) {
        return res.status(500).json({ 
          error: "Failed to save POD to database",
          code: "POD_SAVE_FAILED"
        });
      }

      console.log(`[POD Upload] Job ${jobId}: photo=${finalPhotoUrl || 'none'}, signature=${finalSignatureUrl || 'none'}, recipient=${finalRecipientName || 'none'}`);

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

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/mobile/v1/quote
  // Authoritative price calculator for the mobile app.
  // The mobile app MUST use this endpoint — never calculate prices locally.
  // Returns the exact same result as the website's pricing engine.
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/api/mobile/v1/quote",
    asyncHandler(async (req, res) => {
      const {
        vehicleType,
        distance,         // miles — first leg (pickup → first drop)
        weight,           // kg
        multiDropDistances, // miles[] — additional legs beyond first drop
        scheduledTime,    // ISO string or null → used for rush-hour check
        waitingTimeMinutes, // number or 0
        pickupPostcode,
        deliveryPostcode,
      } = req.body;

      const VALID_VEHICLES = ['motorbike','car','small_van','medium_van','lwb_van','luton_van'];
      if (!vehicleType || !VALID_VEHICLES.includes(vehicleType)) {
        return res.status(400).json({ error: 'Invalid or missing vehicleType' });
      }
      if (typeof distance !== 'number' || distance < 0) {
        return res.status(400).json({ error: 'distance must be a non-negative number (miles)' });
      }

      // Load live settings from DB (already cached in storage)
      const pricingSettings = await storage.getPricingSettings();
      const vehicles = await storage.getVehicles();
      const vehicle = vehicles.find(v => v.type === vehicleType);
      if (!vehicle) return res.status(400).json({ error: 'Vehicle type not found in database' });

      // ── Rush hour check ──────────────────────────────────────────────────
      const parseTime = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const checkAt = scheduledTime ? new Date(scheduledTime) : new Date();
      const currentMinutes = checkAt.getHours() * 60 + checkAt.getMinutes();
      const morningStart = parseTime(pricingSettings.rushHourStart || '07:00');
      const morningEnd   = parseTime(pricingSettings.rushHourEnd   || '09:00');
      const eveningStart = parseTime(pricingSettings.rushHourStartEvening || '14:00');
      const eveningEnd   = parseTime(pricingSettings.rushHourEndEvening   || '19:00');
      const rushHour = (currentMinutes >= morningStart && currentMinutes <= morningEnd)
                    || (currentMinutes >= eveningStart && currentMinutes <= eveningEnd);

      // ── Per-mile rate ────────────────────────────────────────────────────
      const baseCharge  = parseFloat(vehicle.baseCharge)   || 0;
      const stdRate     = parseFloat(vehicle.perMileRate)   || 0;
      const rushRate    = parseFloat(vehicle.rushHourRate || vehicle.perMileRate) || stdRate;
      const perMileRate = rushHour ? rushRate : stdRate;

      // ── Distance charge (first leg) ──────────────────────────────────────
      const distanceCharge = distance * perMileRate;

      // ── Multi-drop ───────────────────────────────────────────────────────
      // First stop: included. Second stop: included. Third stop onward: +£5 each.
      // multiDropDistances[0] = pickup→stop2 leg, [1] = stop2→stop3 leg (+£5), etc.
      const drops: number[] = Array.isArray(multiDropDistances) ? multiDropDistances : [];
      const totalMultiDropDistance = drops.reduce((s, d) => s + d, 0);
      const multiDropDistanceCharge = totalMultiDropDistance * perMileRate;
      const extraStopCharge = Math.max(0, drops.length - 1) * 5; // free for 1st+2nd drop

      // ── Weight surcharge ─────────────────────────────────────────────────
      const kg = typeof weight === 'number' ? weight : 0;
      const surchargeMap = (pricingSettings.weightSurcharges || {}) as Record<string, number>;
      let weightSurcharge = 0;
      if (kg > 400) weightSurcharge = surchargeMap['400-1200'] ?? 70;
      else if (kg > 100) weightSurcharge = surchargeMap['100-400'] ?? 50;
      else if (kg > 50)  weightSurcharge = surchargeMap['50-100']  ?? 40;
      else if (kg > 30)  weightSurcharge = surchargeMap['30-50']   ?? 20;
      else if (kg > 20)  weightSurcharge = surchargeMap['20-30']   ?? 15;
      else if (kg > 10)  weightSurcharge = surchargeMap['10-20']   ?? 10;
      // 0–10 kg is FREE

      // ── Waiting time charge ──────────────────────────────────────────────
      const waitMins = typeof waitingTimeMinutes === 'number' ? waitingTimeMinutes : 0;
      const freeMinutes = pricingSettings.waitingTimeFreeMinutes ?? 10;
      const ratePerMin  = parseFloat(pricingSettings.waitingTimePerMinute || '0.50');
      const waitingTimeCharge = waitMins > freeMinutes
        ? (waitMins - freeMinutes) * ratePerMin
        : 0;

      // ── Final total ──────────────────────────────────────────────────────
      const subtotal = baseCharge + distanceCharge + multiDropDistanceCharge + extraStopCharge + weightSurcharge;
      const totalPrice = Math.round((subtotal + waitingTimeCharge) * 100) / 100;

      // ── Debug log (as required by spec) ─────────────────────────────────
      const numStops = 1 + drops.length; // first drop + additional
      console.log('[Mobile Quote]', {
        vehicleType,
        distance,
        weight: kg,
        rushHour,
        base: baseCharge,
        rate: perMileRate,
        weightSurcharge,
        waitingTimeCharge,
        numStops,
        extraStopCharge,
        finalPrice: totalPrice,
      });

      res.json({
        vehicleType,
        baseCharge:             Math.round(baseCharge * 100) / 100,
        distanceCharge:         Math.round(distanceCharge * 100) / 100,
        multiDropDistanceCharge:Math.round(multiDropDistanceCharge * 100) / 100,
        extraStopCharge:        Math.round(extraStopCharge * 100) / 100,
        weightSurcharge:        Math.round(weightSurcharge * 100) / 100,
        waitingTimeCharge:      Math.round(waitingTimeCharge * 100) / 100,
        totalPrice,
        rushHour,
        perMileRate,
        distance,
        totalDistance:          distance + totalMultiDropDistance,
        numStops,
        debug: {
          vehicleType,
          distance,
          weight: kg,
          rushHour,
          baseUsed:           baseCharge,
          rateUsed:           perMileRate,
          weightSurcharge,
          waitingTimeCharge,
          numStops,
          extraStopCharge,
          finalPrice:         totalPrice,
        },
      });
    })
  );

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
        centralLondonSurcharge: parseFloat(pricingSettings.centralLondonSurcharge || '18.15'),
        multiDropCharge: parseFloat(pricingSettings.multiDropCharge || '5'),
        returnTripMultiplier: parseFloat(pricingSettings.returnTripMultiplier || '0.60'),
        waitingTimeFreeMinutes: pricingSettings.waitingTimeFreeMinutes || 10,
        waitingTimePerMinute: parseFloat(pricingSettings.waitingTimePerMinute || '0.50'),
        rushHourPeriods: [
          { start: pricingSettings.rushHourStart || '07:00', end: pricingSettings.rushHourEnd || '09:00' },
          { start: pricingSettings.rushHourStartEvening || '14:00', end: pricingSettings.rushHourEndEvening || '19:00' },
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
      
      console.log(`[Job Offers] Fetching job offers for driver ${driver.driverCode} (${driver.id})`);
      
      // Get all pending/sent job assignments for this driver
      const assignments = await storage.getJobAssignments({ 
        driverId: driver.id,
        status: "sent" // Only show sent offers (pending means admin hasn't sent yet)
      });
      console.log(`[Job Offers] Found ${assignments.length} sent assignments`);
      
      // Also get "pending" status assignments that are ready to be viewed
      const pendingAssignments = await storage.getJobAssignments({ 
        driverId: driver.id,
        status: "pending"
      });
      console.log(`[Job Offers] Found ${pendingAssignments.length} pending assignments`);
      
      const allAssignments = [...assignments, ...pendingAssignments];
      console.log(`[Job Offers] Total assignments: ${allAssignments.length}`);
      
      // Debug: Log driver prices from assignments
      for (const a of allAssignments) {
        console.log(`[Job Offers] Assignment ${a.id} for job ${a.jobId}: driverPrice=${a.driverPrice}, status=${a.status}`);
      }
      
      // Enrich with job details and filter hidden jobs
      const enrichedOffers = await Promise.all(
        allAssignments.map(async (assignment) => {
          const job = await storage.getJob(assignment.jobId);
          if (job && (job as any).driverHidden === true) {
            return null;
          }
          
          let offerStops: any[] = [];
          if (job && (job as any).isMultiDrop && supabaseAdmin) {
            const { data: stops } = await supabaseAdmin
              .from('multi_drop_stops')
              .select('*')
              .eq('job_id', String(job.id))
              .order('stop_order', { ascending: true });
            
            if (stops) {
              offerStops = stops.map((stop: any) => ({
                id: String(stop.id),
                stopOrder: stop.stop_order,
                stop_order: stop.stop_order,
                order: stop.stop_order,
                address: stop.address,
                postcode: stop.postcode || null,
                contactName: stop.contact_name || stop.recipient_name || null,
                contact_name: stop.contact_name || stop.recipient_name || null,
                contactPhone: stop.contact_phone || stop.recipient_phone || null,
                contact_phone: stop.contact_phone || stop.recipient_phone || null,
                recipientName: stop.recipient_name || stop.contact_name || null,
                recipient_name: stop.recipient_name || stop.contact_name || null,
                recipientPhone: stop.recipient_phone || stop.contact_phone || null,
                recipient_phone: stop.recipient_phone || stop.contact_phone || null,
                instructions: stop.instructions || null,
                latitude: stop.latitude?.toString() || null,
                longitude: stop.longitude?.toString() || null,
                status: stop.status || 'pending',
                completedAt: stop.completed_at || null,
                completed_at: stop.completed_at || null,
              }));
            }
          }

          const numberedJob = job ? ensureJobNumber(job) : null;
          // CRITICAL: Always format driverPrice as a decimal string ('0.00', '12.50', etc.)
          // so that the mobile app can distinguish "zero pounds" from "no price set".
          // Raw number 0 is falsy in JS; the string '0.00' is truthy and unambiguous.
          const offerDriverPrice = assignment.driverPrice !== null && assignment.driverPrice !== undefined
            ? parseFloat(String(assignment.driverPrice)).toFixed(2)
            : null;
          return {
            id: assignment.id,
            jobId: assignment.jobId,
            status: assignment.status,
            driverPrice: offerDriverPrice,
            expiresAt: assignment.expiresAt,
            createdAt: assignment.createdAt,
            job: job ? {
              id: job.id,
              jobNumber: numberedJob?.jobNumber || null,
              trackingNumber: job.trackingNumber,
              vehicleType: job.vehicleType,
              pickupAddress: job.pickupAddress,
              pickupPostcode: job.pickupPostcode,
              pickupBuildingName: (job as any).pickupBuildingName || null,
              pickupContactName: (job as any).pickupContactName || (job as any).senderName || null,
              pickupContactPhone: (job as any).pickupContactPhone || (job as any).senderPhone || null,
              senderName: (job as any).pickupContactName || (job as any).senderName || (job as any).customerName || null,
              senderPhone: (job as any).pickupContactPhone || (job as any).senderPhone || (job as any).customerPhone || null,
              pickupLatitude: job.pickupLatitude ? parseFloat(String(job.pickupLatitude)) : null,
              pickupLongitude: job.pickupLongitude ? parseFloat(String(job.pickupLongitude)) : null,
              deliveryAddress: job.deliveryAddress,
              deliveryPostcode: job.deliveryPostcode,
              deliveryBuildingName: (job as any).deliveryBuildingName || null,
              deliveryLatitude: job.deliveryLatitude ? parseFloat(String(job.deliveryLatitude)) : null,
              deliveryLongitude: job.deliveryLongitude ? parseFloat(String(job.deliveryLongitude)) : null,
              recipientName: job.recipientName,
              recipientPhone: job.recipientPhone,
              weight: job.weight,
              distance: job.distance,
              isMultiDrop: (job as any).isMultiDrop || false,
              isReturnTrip: job.isReturnTrip,
              multiDropStops: offerStops,
              stops: offerStops,
              totalStops: offerStops.length,
              driverPrice: offerDriverPrice,
              pickupInstructions: job.pickupInstructions,
              deliveryInstructions: job.deliveryInstructions,
              scheduledPickupTime: job.scheduledPickupTime,
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
        const previousJobStatus = job.status;
        await storage.updateJob(assignment.jobId, { 
          driverId: driver.id,
          status: "accepted",
          driverPrice: assignment.driverPrice
        });
        
        console.log(`[Mobile] Driver ${driver.driverCode} accepted job ${job.trackingNumber}`);

        // Broadcast real-time status update — admin dashboard reflects acceptance instantly
        broadcastJobUpdate({
          id: job.id,
          trackingNumber: job.trackingNumber,
          status: "accepted",
          previousStatus: previousJobStatus,
          customerId: job.customerId,
          driverId: driver.id,
          updatedAt: new Date(),
        });
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
      
      // CRITICAL: Clear driver_id from job or mark as hidden so rejected jobs don't appear in driver's list
      // If job.driver_id equals this driver, clear it so job returns to unassigned pool
      if (supabaseAdmin) {
        const { data: job } = await supabaseAdmin
          .from('jobs')
          .select('id, tracking_number, driver_id, status, customer_id')
          .eq('id', assignment.jobId)
          .single();
        
        if (job && job.driver_id === driver.id) {
          // Job was assigned to this driver - return to unassigned pool
          // Only if job status is still pending/assigned (not already picked up)
          if (['pending', 'assigned', 'offered'].includes(job.status)) {
            const previousJobStatus = job.status;
            await supabaseAdmin
              .from('jobs')
              .update({ 
                driver_id: null,
                driver_price: null,
                status: 'pending'
              })
              .eq('id', assignment.jobId);
            console.log(`[Mobile] Cleared driver_id from job ${assignment.jobId} after rejection`);

            // Broadcast job returning to unassigned pool — admin sees it instantly
            broadcastJobUpdate({
              id: job.id,
              trackingNumber: job.tracking_number || '',
              status: 'pending',
              previousStatus: previousJobStatus,
              customerId: job.customer_id || '',
              driverId: null,
              updatedAt: new Date(),
            });
          }
        }
      }
      
      console.log(`[Mobile] Driver ${driver.driverCode} rejected job offer ${assignmentId}`);
      
      res.json({
        success: true,
        message: "Job offer rejected"
      });
    })
  );

  // ==================== Google Maps Endpoints ====================

  // GET /api/mobile/v1/directions - Get route directions between points
  app.get("/api/mobile/v1/directions",
    requireSupabaseAuth,
    asyncHandler(async (req, res) => {
      const { origin, destination, waypoints, mode } = req.query;

      if (!origin || !destination) {
        return res.status(400).json({
          error: "origin and destination query params are required (format: lat,lng)",
          code: "MISSING_PARAMS"
        });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error("[Mobile Maps] GOOGLE_MAPS_API_KEY not configured");
        return res.status(500).json({
          error: "Maps service not configured",
          code: "MAPS_NOT_CONFIGURED"
        });
      }

      try {
        const travelMode = (mode as string) || "driving";
        console.log(`[Mobile Maps] Directions request: origin=${origin}, destination=${destination}, mode=${travelMode}`);

        const params = new URLSearchParams({
          origin: origin as string,
          destination: destination as string,
          mode: travelMode,
          key: apiKey,
        });

        if (waypoints) {
          params.append("waypoints", waypoints as string);
        }

        const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
        const response = await fetch(directionsUrl);
        const data = await response.json();

        if (data.status !== "OK") {
          console.error("[Mobile Maps] Directions API error:", data.status, data.error_message);
          return res.status(400).json({
            error: `Directions API error: ${data.status}`,
            details: data.error_message || null,
            code: "DIRECTIONS_API_ERROR"
          });
        }

        const routes = data.routes.map((route: any) => ({
          polyline: route.overview_polyline?.points || "",
          distance: route.legs.reduce(
            (acc: any, leg: any) => ({
              text: acc.text || leg.distance?.text,
              value: (acc.value || 0) + (leg.distance?.value || 0),
            }),
            { text: null, value: 0 }
          ),
          duration: route.legs.reduce(
            (acc: any, leg: any) => ({
              text: acc.text || leg.duration?.text,
              value: (acc.value || 0) + (leg.duration?.value || 0),
            }),
            { text: null, value: 0 }
          ),
          legs: route.legs.map((leg: any) => ({
            start: {
              lat: leg.start_location?.lat,
              lng: leg.start_location?.lng,
            },
            end: {
              lat: leg.end_location?.lat,
              lng: leg.end_location?.lng,
            },
            distance: leg.distance || { text: "", value: 0 },
            duration: leg.duration || { text: "", value: 0 },
            polyline: leg.steps
              ? leg.steps.map((s: any) => s.polyline?.points || "").join("")
              : "",
          })),
        }));

        console.log(`[Mobile Maps] Directions returned ${routes.length} route(s)`);
        res.json({ routes });
      } catch (err: any) {
        console.error("[Mobile Maps] Directions fetch error:", err.message);
        res.status(500).json({
          error: "Failed to fetch directions",
          code: "DIRECTIONS_FETCH_ERROR"
        });
      }
    })
  );

  // GET /api/mobile/v1/static-map - Generate a Google Static Maps URL
  app.get("/api/mobile/v1/static-map",
    requireSupabaseAuth,
    asyncHandler(async (req, res) => {
      const { pickupLat, pickupLng, deliveryLat, deliveryLng, driverLat, driverLng, size } = req.query;

      if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng) {
        return res.status(400).json({
          error: "pickupLat, pickupLng, deliveryLat, and deliveryLng are required",
          code: "MISSING_PARAMS"
        });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error("[Mobile Maps] GOOGLE_MAPS_API_KEY not configured");
        return res.status(500).json({
          error: "Maps service not configured",
          code: "MAPS_NOT_CONFIGURED"
        });
      }

      try {
        const mapSize = (size as string) || "600x300";
        console.log(`[Mobile Maps] Static map request: pickup=${pickupLat},${pickupLng} delivery=${deliveryLat},${deliveryLng} size=${mapSize}`);

        const params = new URLSearchParams({
          size: mapSize,
          maptype: "roadmap",
          key: apiKey,
        });

        params.append("markers", `color:green|label:P|${pickupLat},${pickupLng}`);
        params.append("markers", `color:red|label:D|${deliveryLat},${deliveryLng}`);

        const markers: any = {
          pickup: { lat: parseFloat(pickupLat as string), lng: parseFloat(pickupLng as string) },
          delivery: { lat: parseFloat(deliveryLat as string), lng: parseFloat(deliveryLng as string) },
        };

        if (driverLat && driverLng) {
          params.append("markers", `color:blue|label:C|${driverLat},${driverLng}`);
          markers.driver = { lat: parseFloat(driverLat as string), lng: parseFloat(driverLng as string) };
        }

        params.append("path", `color:0x4285F4FF|weight:4|${pickupLat},${pickupLng}|${deliveryLat},${deliveryLng}`);

        const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;

        console.log("[Mobile Maps] Static map URL generated successfully");
        res.json({ mapUrl, markers });
      } catch (err: any) {
        console.error("[Mobile Maps] Static map error:", err.message);
        res.status(500).json({
          error: "Failed to generate static map URL",
          code: "STATIC_MAP_ERROR"
        });
      }
    })
  );

  // Geocode an address - returns coordinates for mobile app map fallback
  app.get("/api/mobile/v1/geocode",
    requireSupabaseAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ error: "Address parameter is required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Geocoding service not configured" });
      }

      try {
        const encodedAddress = encodeURIComponent(address);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results?.length > 0) {
          const location = data.results[0].geometry.location;
          res.json({ 
            lat: location.lat, 
            lng: location.lng,
            formattedAddress: data.results[0].formatted_address 
          });
        } else {
          res.json({ lat: null, lng: null, error: "Address not found" });
        }
      } catch (err: any) {
        console.error("[Mobile Geocode] Error:", err.message);
        res.status(500).json({ error: "Geocoding failed" });
      }
    })
  );

  // ============= WAITING TIME =============
  // POST /api/mobile/v1/driver/jobs/:jobId/waiting-time
  // Driver logs waiting time at pickup. First 10 min free, then £0.20/min, max 50 min total.
  app.post("/api/mobile/v1/driver/jobs/:jobId/waiting-time",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { jobId } = req.params;
      const { minutes } = req.body;

      const FREE_MINUTES = 10;
      const CUSTOMER_RATE = 0.50; // £0.50/min charged to customer (after free period)
      const DRIVER_RATE = 0.20;   // £0.20/min paid to driver (after free period)
      const MAX_MINUTES = 60;

      const totalMinutes = parseInt(String(minutes), 10);
      if (isNaN(totalMinutes) || totalMinutes < 1 || totalMinutes > MAX_MINUTES) {
        return res.status(400).json({ error: `Waiting time must be between 1 and ${MAX_MINUTES} minutes` });
      }

      // Fetch current job to verify ownership and get current prices
      const { data: job, error: jobError } = await supabaseAdmin!
        .from('jobs')
        .select('id, driver_id, driver_price, waiting_time_charge, status')
        .eq('id', String(jobId))
        .single();

      if (jobError || !job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Ensure job belongs to this driver
      const driverIds = [String(driver.id), driver.authUserId ? String(driver.authUserId) : ''].filter(Boolean);
      if (!driverIds.includes(String(job.driver_id))) {
        return res.status(403).json({ error: 'Not authorized for this job' });
      }

      // Business logic — first 10 min free, then separate rates
      const chargeableMinutes = Math.max(0, totalMinutes - FREE_MINUTES);
      const newCustomerCharge = parseFloat((chargeableMinutes * CUSTOMER_RATE).toFixed(2));
      const newDriverWaitPay = parseFloat((chargeableMinutes * DRIVER_RATE).toFixed(2));

      // Replace old waiting pay with new one (idempotent)
      const oldDriverWaitPay = parseFloat(String(job.waiting_time_charge || 0));
      const currentDriverPrice = parseFloat(String(job.driver_price || 0));
      const newDriverPrice = parseFloat((currentDriverPrice - oldDriverWaitPay + newDriverWaitPay).toFixed(2));

      // Update waiting_time_charge (customer-facing), driver_price, and waiting_time_minutes
      const { error: updateError } = await supabaseAdmin!
        .from('jobs')
        .update({
          waiting_time_charge: String(newCustomerCharge),
          waiting_time_minutes: totalMinutes,
          driver_price: String(newDriverPrice),
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(jobId));

      if (updateError) {
        console.error('[WaitingTime] Failed to update job:', updateError);
        return res.status(500).json({ error: 'Failed to save waiting time' });
      }

      console.log(`[WaitingTime] Job ${jobId}: ${totalMinutes} min, customer charge £${newCustomerCharge}, driver pay +£${newDriverWaitPay}, new driver_price £${newDriverPrice}`);

      res.json({
        success: true,
        waitingTimeMinutes: totalMinutes,
        waitingTimeCharge: newCustomerCharge,
        driverWaitPay: newDriverWaitPay,
        chargeableMinutes,
        driverPrice: newDriverPrice,
      });
    })
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOMER MOBILE API  /api/mobile/v1/customer/*
  // Allows individual & business customers to access their account from the
  // mobile app using the same Supabase credentials as the website.
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/mobile/v1/customer/profile
  app.get(
    "/api/mobile/v1/customer/profile",
    requireSupabaseAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.auth!.id;
        let profile = await storage.getUser(userId);

        // Auto-create user row from Supabase auth metadata if missing
        if (!profile && supabaseAdmin) {
          const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
          if (authUser) {
            const meta = authUser.user_metadata || {};
            profile = await storage.createUserWithId(userId, {
              id: userId,
              email: authUser.email || '',
              fullName: meta.fullName || meta.full_name || '',
              phone: meta.phone || null,
              postcode: meta.postcode || null,
              address: meta.address || null,
              buildingName: meta.buildingName || null,
              role: meta.role || 'customer',
              userType: meta.userType || 'individual',
              companyName: meta.companyName || null,
              registrationNumber: meta.registrationNumber || null,
              isActive: true,
              payLaterEnabled: meta.payLaterEnabled || false,
            });
          }
        }

        if (!profile) return res.status(404).json({ error: "Profile not found" });
        res.json(profile);
      } catch (err: any) {
        console.error("[Customer Mobile] profile GET error:", err?.message);
        res.status(500).json({ error: "Failed to load profile" });
      }
    }
  );

  // PATCH /api/mobile/v1/customer/profile
  app.patch(
    "/api/mobile/v1/customer/profile",
    requireSupabaseAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.auth!.id;
        const allowed = [
          'fullName', 'phone', 'postcode', 'address', 'buildingName',
          'companyName', 'registrationNumber', 'businessAddress', 'vatNumber',
        ];
        const updates: Record<string, any> = {};
        for (const key of allowed) {
          if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        let profile = await storage.getUser(userId);
        if (!profile) {
          // Create row if it doesn't exist yet
          profile = await storage.createUserWithId(userId, {
            id: userId,
            email: req.body.email || req.auth!.email || '',
            fullName: updates.fullName || '',
            phone: updates.phone || null,
            postcode: updates.postcode || null,
            address: updates.address || null,
            buildingName: updates.buildingName || null,
            role: 'customer',
            userType: req.body.userType || 'individual',
            isActive: true,
            payLaterEnabled: false,
          });
        }

        const updated = await storage.updateUser(userId, updates);
        res.json(updated);
      } catch (err: any) {
        console.error("[Customer Mobile] profile PATCH error:", err?.message);
        res.status(500).json({ error: "Failed to update profile" });
      }
    }
  );

  // GET /api/mobile/v1/customer/bookings
  app.get(
    "/api/mobile/v1/customer/bookings",
    requireSupabaseAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.auth!.id;
        const jobs = await storage.getJobs({ customerId: userId });

        // Return customer-safe fields (no driver pricing)
        const safe = jobs.map((j: any) => ({
          id: j.id,
          jobNumber: j.jobNumber,
          trackingNumber: j.trackingNumber,
          status: j.status,
          pickupAddress: j.pickupAddress,
          pickupPostcode: j.pickupPostcode,
          deliveryAddress: j.deliveryAddress,
          deliveryPostcode: j.deliveryPostcode,
          totalPrice: j.totalPrice,
          vehicleType: j.vehicleType,
          parcelDescription: j.parcelDescription,
          createdAt: j.createdAt,
          scheduledPickupTime: j.scheduledPickupTime,
          actualDeliveryTime: j.actualDeliveryTime,
          isMultiDrop: j.isMultiDrop,
          distance: j.distance,
          serviceType: j.serviceType,
        }));

        res.json(safe);
      } catch (err: any) {
        console.error("[Customer Mobile] bookings GET error:", err?.message);
        res.status(500).json({ error: "Failed to load bookings" });
      }
    }
  );

  // DELETE /api/mobile/v1/customer/bookings/:id
  // Hides the booking from the customer's view (soft delete — admin still sees it)
  app.delete(
    "/api/mobile/v1/customer/bookings/:id",
    requireSupabaseAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.auth!.id;
        const jobId = req.params.id;

        const job = await storage.getJob(jobId);
        if (!job) return res.status(404).json({ error: "Booking not found" });
        if (String(job.customerId) !== String(userId)) {
          return res.status(403).json({ error: "Access denied" });
        }

        if (supabaseAdmin) {
          await supabaseAdmin.from('jobs').update({ customer_hidden: true }).eq('id', jobId);
        }

        res.status(204).send();
      } catch (err: any) {
        console.error("[Customer Mobile] bookings DELETE error:", err?.message);
        res.status(500).json({ error: "Failed to remove booking" });
      }
    }
  );

}
