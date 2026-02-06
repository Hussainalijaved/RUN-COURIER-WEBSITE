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
import { registerDriverDevice, unregisterDriverDevice, getDriverDevices } from "./pushNotifications";

// Helper to map Supabase job to local Job format for mobile API response
// CRITICAL: Only expose driver_price to drivers, NEVER total_price or customer pricing
function mapSupabaseJobToMobileFormat(job: any, multiDropStops?: any[]) {
  const pickupLat = job.pickup_latitude?.toString() || job.pickup_lat?.toString() || null;
  const pickupLng = job.pickup_longitude?.toString() || job.pickup_lng?.toString() || null;
  const deliveryLat = job.delivery_latitude?.toString() || job.dropoff_lat?.toString() || null;
  const deliveryLng = job.delivery_longitude?.toString() || job.dropoff_lng?.toString() || null;
  const senderPhone = job.sender_phone || job.pickup_contact_phone || null;
  const recipientPhone = job.recipient_phone || null;
  
  // Map multi-drop stops to mobile format
  const mappedStops = (multiDropStops || []).map(stop => ({
    id: String(stop.id),
    stopOrder: stop.stop_order,
    address: stop.address,
    postcode: stop.postcode || null,
    contactName: stop.contact_name || null,
    contactPhone: stop.contact_phone || null,
    instructions: stop.instructions || null,
    latitude: stop.latitude?.toString() || null,
    longitude: stop.longitude?.toString() || null,
    status: stop.status || 'pending',
    completedAt: stop.completed_at || null,
  }));
  
  return {
    id: String(job.id),
    trackingNumber: job.tracking_number,
    status: job.status,
    pickupAddress: job.pickup_address || job.dropoff_address,
    pickupPostcode: job.pickup_postcode || null,
    pickupInstructions: job.pickup_instructions || job.notes,
    pickupLatitude: pickupLat,
    pickupLongitude: pickupLng,
    deliveryAddress: job.delivery_address || job.dropoff_address,
    deliveryPostcode: job.delivery_postcode || null,
    deliveryInstructions: job.delivery_instructions || null,
    deliveryLatitude: deliveryLat,
    deliveryLongitude: deliveryLng,
    recipientName: job.recipient_name,
    recipientPhone: recipientPhone,
    senderName: job.sender_name || job.pickup_contact_name,
    senderPhone: senderPhone,
    // Also include pickupContactPhone directly for mobile app compatibility
    pickupContactPhone: job.pickup_contact_phone || null,
    pickupContactName: job.pickup_contact_name || null,
    vehicleType: job.vehicle_type,
    distance: job.distance?.toString() || job.distance_miles?.toString() || null,
    weight: job.weight?.toString() || job.parcel_weight?.toString() || null,
    // CRITICAL: Use driver_price column (admin-set price), NEVER total_price
    driverPrice: job.driver_price?.toString() || null,
    scheduledPickupTime: job.scheduled_pickup_time,
    isMultiDrop: job.is_multi_drop || false,
    isReturnTrip: job.is_return_trip || false,
    // Include multi-drop stops for the driver to see all delivery points
    multiDropStops: mappedStops,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    // SECURITY: Explicitly exclude customer pricing fields - these must NEVER be exposed to drivers
    // Excluded: total_price, base_price, distance_price, weight_surcharge, etc.
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
        jobOffers: "/api/mobile/v1/driver/job-offers",
        location: "/api/mobile/v1/driver/location",
        availability: "/api/mobile/v1/driver/availability",
        status: "/api/driver/status",
        websocket: "/ws/realtime",
        pushToken: "/api/mobile/v1/driver/push-token"
      }
    });
  });

  // Register push notification token for driver
  app.post("/api/mobile/v1/driver/push-token",
    requireSupabaseAuth,
    requireDriverRole,
    asyncHandler(async (req, res) => {
      const driver = req.driver!;
      const { pushToken, platform, appVersion, deviceInfo } = req.body;

      if (!pushToken || typeof pushToken !== 'string') {
        return res.status(400).json({ 
          error: "Push token is required",
          code: "INVALID_PUSH_TOKEN"
        });
      }

      if (!platform || !['ios', 'android'].includes(platform)) {
        return res.status(400).json({ 
          error: "Platform must be 'ios' or 'android'",
          code: "INVALID_PLATFORM"
        });
      }

      const result = await registerDriverDevice(
        driver.id,
        pushToken,
        platform,
        appVersion,
        deviceInfo
      );

      if (result.success) {
        console.log(`[Push Token] Registered for driver ${driver.driverCode || driver.id}`);
        res.json({
          success: true,
          deviceId: result.deviceId,
          message: "Push token registered successfully"
        });
      } else {
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

      console.log(`[Mobile Jobs] *** FETCHING JOBS for driver ${driver.driverCode} (id=${driver.id}) ***`);
      console.log(`[Mobile Jobs] Driver auth userId: ${driver.userId}, driverCode: ${driver.driverCode}`);

      let mobileJobs: any[] = [];

      // CRITICAL: Query Supabase FIRST as it's the source of truth
      // SECURITY: Explicitly select ONLY driver-safe columns - NEVER include total_price/base_price/customer pricing
      if (supabaseAdmin) {
        console.log("[Mobile Jobs] Querying Supabase for jobs (driver-safe columns only)...");
        
        // STEP 1: Get job_assignments for this driver (exclude rejected/expired/withdrawn)
        // CRITICAL: Don't show jobs from rejected assignments - driver declined them
        const { data: allAssignments, error: assignmentsError } = await supabaseAdmin
          .from('job_assignments')
          .select('job_id, driver_price, status')
          .eq('driver_id', driver.id)
          .not('status', 'in', '("rejected","expired","withdrawn")');
        
        if (assignmentsError) {
          console.log(`[Mobile Jobs] Error fetching assignments:`, assignmentsError.message);
        }
        
        // Filter to only include valid (non-rejected) assignments
        const validAssignments = (allAssignments || []).filter(a => 
          !['rejected', 'expired', 'withdrawn'].includes(a.status)
        );
        const assignmentJobIds = validAssignments.map(a => String(a.job_id));
        console.log(`[Mobile Jobs] Found ${allAssignments?.length || 0} job assignments for driver ${driver.id}`);
        
        // STEP 2: Get jobs where driver_id is set OR job has an assignment for this driver
        let supabaseJobs: any[] = [];
        
        // Query jobs directly assigned to driver (exclude hidden jobs)
        console.log(`[Mobile Jobs] Querying jobs with driver_id=${driver.id}`);
        const { data: directJobs, error: directError } = await supabaseAdmin
          .from('jobs')
          .select(`
            id,
            tracking_number,
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
            delivery_address,
            delivery_postcode,
            delivery_latitude,
            delivery_longitude,
            delivery_instructions,
            recipient_name,
            recipient_phone,
            sender_name,
            sender_phone,
            parcel_description,
            parcel_weight,
            parcel_dimensions,
            distance_miles,
            scheduled_pickup_time,
            estimated_delivery_time,
            actual_pickup_time,
            actual_delivery_time,
            pod_signature_url,
            pod_photo_url,
            pod_notes,
            is_multi_drop,
            is_return_trip,
            is_urgent,
            is_fragile,
            requires_signature,
            driver_hidden,
            created_at,
            updated_at
          `)
          .eq('driver_id', driver.id)
          .or('driver_hidden.is.null,driver_hidden.eq.false')
          .order('created_at', { ascending: false });
        
        if (directError) {
          console.log("[Mobile Jobs] Supabase direct jobs query error:", directError.message);
        } else if (directJobs) {
          supabaseJobs = [...directJobs];
          console.log(`[Mobile Jobs] Found ${directJobs.length} directly assigned jobs`);
        }
        
        // Also fetch jobs from assignments (for pending/sent offers not yet accepted, exclude hidden)
        if (assignmentJobIds.length > 0) {
          const { data: assignedJobs, error: assignedError } = await supabaseAdmin
            .from('jobs')
            .select(`
              id,
              tracking_number,
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
              delivery_address,
              delivery_postcode,
              delivery_latitude,
              delivery_longitude,
              delivery_instructions,
              recipient_name,
              recipient_phone,
              sender_name,
              sender_phone,
              parcel_description,
              parcel_weight,
              parcel_dimensions,
              distance_miles,
              scheduled_pickup_time,
              estimated_delivery_time,
              actual_pickup_time,
              actual_delivery_time,
              pod_signature_url,
              pod_photo_url,
              pod_notes,
              is_multi_drop,
              is_return_trip,
              is_urgent,
              is_fragile,
              requires_signature,
              driver_hidden,
              created_at,
              updated_at
            `)
            .in('id', assignmentJobIds.map(id => parseInt(id) || id))
            .or('driver_hidden.is.null,driver_hidden.eq.false');
          
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
            return mapSupabaseJobToMobileFormat(j, stops);
          });
          
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

      // Apply status filters
      // "active" = jobs the driver has ACCEPTED and is working on
      // "pending" = job offers waiting for driver to accept/decline
      // "completed" = job history (delivered, cancelled, failed)
      if (status === "active") {
        jobs = jobs.filter(j => 
          ["accepted", "on_the_way_pickup", "arrived_pickup", "collected", "on_the_way_delivery", "picked_up", "on_the_way"].includes(j.status)
        );
        // For active jobs, require driver_price
        jobs = jobs.filter(j => j.driverPrice != null);
      } else if (status === "pending") {
        jobs = jobs.filter(j => ["assigned", "pending", "offered"].includes(j.status));
        // For pending jobs, show offers even without driver_price (pricing may be pending)
      } else if (status === "completed") {
        // For history/completed jobs, show ALL jobs regardless of driver_price
        jobs = jobs.filter(j => ["delivered", "cancelled", "failed"].includes(j.status));
      } else {
        // No filter - show all but require driver_price for non-completed
        const completedStatuses = ["delivered", "cancelled", "failed"];
        jobs = jobs.filter(j => completedStatuses.includes(j.status) || j.driverPrice != null);
      }

      mobileJobs = jobs.map(job => {
        const j = job as any;
        return {
          id: job.id,
          trackingNumber: job.trackingNumber,
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
          senderName: j.senderName || j.pickupContactName || null,
          senderPhone: j.senderPhone || j.pickupContactPhone || null,
          pickupContactPhone: j.pickupContactPhone || null,
          pickupContactName: j.pickupContactName || null,
          vehicleType: job.vehicleType,
          distance: job.distance?.toString() || null,
          weight: job.weight?.toString() || null,
          driverPrice: job.driverPrice?.toString() || null,
          scheduledPickupTime: job.scheduledPickupTime,
          isMultiDrop: job.isMultiDrop,
          isReturnTrip: job.isReturnTrip,
          // Include multi-drop stops (empty array for fallback path - would need separate query)
          multiDropStops: [],
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
        .select('id, status')
        .eq('job_id', String(jobId));
      
      const allCompleted = allStops && allStops.every(s => s.status === 'delivered');
      const completedCount = allStops?.filter(s => s.status === 'delivered').length || 0;
      const totalCount = allStops?.length || 0;
      
      console.log(`[Multi-Drop] Stop ${stopId} completed. Progress: ${completedCount}/${totalCount}`);
      
      res.json({
        success: true,
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
          allCompleted,
        },
        message: allCompleted 
          ? "All stops completed! You can now mark the job as delivered."
          : `Stop ${completedCount} of ${totalCount} completed.`
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
      
      const mappedStops = (stops || []).map(stop => ({
        id: String(stop.id),
        stopOrder: stop.stop_order,
        address: stop.address,
        postcode: stop.postcode || null,
        contactName: stop.contact_name || stop.recipient_name || null,
        contactPhone: stop.contact_phone || stop.recipient_phone || null,
        instructions: stop.instructions || null,
        latitude: stop.latitude?.toString() || null,
        longitude: stop.longitude?.toString() || null,
        status: stop.status || 'pending',
        deliveredAt: stop.delivered_at || null,
        podPhotoUrl: stop.pod_photo_url || null,
        podSignatureUrl: stop.pod_signature_url || null,
      }));
      
      const completedCount = mappedStops.filter(s => s.status === 'delivered').length;
      
      res.json({
        success: true,
        stops: mappedStops,
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
            delivery_address,
            delivery_postcode,
            delivery_latitude,
            delivery_longitude,
            delivery_instructions,
            recipient_name,
            recipient_phone,
            sender_name,
            sender_phone,
            customer_name,
            customer_phone,
            customer_email,
            parcel_description,
            parcel_weight,
            parcel_dimensions,
            distance_miles,
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
            is_urgent,
            is_fragile,
            requires_signature,
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
        
        if (assignment?.driver_price) {
          assignmentDriverPrice = assignment.driver_price;
          console.log(`[Job Details] Found driver_price ${assignmentDriverPrice} from job_assignments`);
        }
      }

      // Include driver's current location for map display
      const driverLocation = {
        latitude: driver.currentLatitude,
        longitude: driver.currentLongitude,
        lastUpdate: driver.lastLocationUpdate,
      };

      // Build response from either source
      if (job) {
        // Use assignment driver_price if job.driverPrice is null
        const effectiveDriverPrice = job.driverPrice ?? assignmentDriverPrice;
        const j = job as any;
        res.json({
          id: job.id,
          trackingNumber: job.trackingNumber,
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
          senderName: j.senderName || j.pickupContactName || null,
          senderPhone: j.senderPhone || j.pickupContactPhone || null,
          pickupContactPhone: j.pickupContactPhone || null,
          pickupContactName: j.pickupContactName || null,
          vehicleType: job.vehicleType,
          distance: job.distance?.toString() || null,
          weight: job.weight?.toString() || null,
          driverPrice: effectiveDriverPrice?.toString() || null,
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
        // Use assignment driver_price if supabaseJob.driver_price is null
        const effectiveDriverPrice = supabaseJob.driver_price ?? assignmentDriverPrice;
        // Map from Supabase format (snake_case to camelCase)
        res.json({
          id: String(supabaseJob.id),
          trackingNumber: supabaseJob.tracking_number,
          status: supabaseJob.status,
          pickupAddress: supabaseJob.pickup_address,
          pickupPostcode: supabaseJob.pickup_postcode || null,
          pickupInstructions: supabaseJob.notes || supabaseJob.pickup_instructions,
          pickupLatitude: supabaseJob.pickup_latitude?.toString() || supabaseJob.pickup_lat?.toString() || null,
          pickupLongitude: supabaseJob.pickup_longitude?.toString() || supabaseJob.pickup_lng?.toString() || null,
          deliveryAddress: supabaseJob.delivery_address || supabaseJob.dropoff_address,
          deliveryPostcode: supabaseJob.delivery_postcode || null,
          deliveryInstructions: supabaseJob.delivery_instructions || null,
          deliveryLatitude: supabaseJob.delivery_latitude?.toString() || supabaseJob.dropoff_lat?.toString() || null,
          deliveryLongitude: supabaseJob.delivery_longitude?.toString() || supabaseJob.dropoff_lng?.toString() || null,
          recipientName: supabaseJob.recipient_name,
          recipientPhone: supabaseJob.recipient_phone || null,
          senderName: supabaseJob.sender_name || supabaseJob.pickup_contact_name || null,
          senderPhone: supabaseJob.sender_phone || supabaseJob.pickup_contact_phone || null,
          pickupContactPhone: supabaseJob.pickup_contact_phone || null,
          pickupContactName: supabaseJob.pickup_contact_name || null,
          customerName: supabaseJob.customer_name,
          customerPhone: supabaseJob.customer_phone,
          customerEmail: supabaseJob.customer_email,
          vehicleType: supabaseJob.vehicle_type,
          distance: supabaseJob.distance_miles?.toString() || supabaseJob.distance || null,
          weight: supabaseJob.parcel_weight?.toString() || supabaseJob.weight || null,
          // CRITICAL: Use driver_price (admin-set), NEVER total_price
          driverPrice: effectiveDriverPrice?.toString() || null,
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
              pickupLatitude: job.pickupLatitude,
              pickupLongitude: job.pickupLongitude,
              deliveryAddress: job.deliveryAddress,
              deliveryPostcode: job.deliveryPostcode,
              deliveryLatitude: job.deliveryLatitude,
              deliveryLongitude: job.deliveryLongitude,
              recipientName: job.recipientName,
              recipientPhone: job.recipientPhone,
              weight: job.weight,
              distance: job.distance,
              isMultiDrop: job.isMultiDrop,
              isReturnTrip: job.isReturnTrip,
              driverPrice: assignment.driverPrice,
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
      
      // CRITICAL: Clear driver_id from job or mark as hidden so rejected jobs don't appear in driver's list
      // If job.driver_id equals this driver, clear it so job returns to unassigned pool
      if (supabaseAdmin) {
        const { data: job } = await supabaseAdmin
          .from('jobs')
          .select('id, driver_id, status')
          .eq('id', assignment.jobId)
          .single();
        
        if (job && job.driver_id === driver.id) {
          // Job was assigned to this driver - return to unassigned pool
          // Only if job status is still pending/assigned (not already picked up)
          if (['pending', 'assigned', 'offered'].includes(job.status)) {
            await supabaseAdmin
              .from('jobs')
              .update({ 
                driver_id: null,
                driver_price: null,
                status: 'pending'
              })
              .eq('id', assignment.jobId);
            console.log(`[Mobile] Cleared driver_id from job ${assignment.jobId} after rejection`);
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

}
