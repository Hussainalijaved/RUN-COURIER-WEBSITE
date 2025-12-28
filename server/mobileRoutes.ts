import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { requireSupabaseAuth, requireDriverRole } from "./mobileAuth";
import { broadcastLocationUpdate } from "./realtime";
import { db } from "./db";
import { jobs as jobsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { JobStatus, Job } from "@shared/schema";

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const VALID_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending: [],
  assigned: ["accepted", "cancelled"],
  accepted: ["on_the_way_pickup", "cancelled"],
  on_the_way_pickup: ["arrived_pickup", "cancelled"],
  arrived_pickup: ["collected", "cancelled"],
  collected: ["on_the_way_delivery", "cancelled"],
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
        websocket: "/ws/realtime"
      }
    });
  });

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

      // Get jobs from both in-memory storage and database
      let memoryJobs = await storage.getJobs({ driverId: driver.id });
      const dbJobs = await db.select().from(jobsTable).where(eq(jobsTable.driverId, driver.id));
      
      // Merge jobs, preferring database versions for duplicates
      const jobMap = new Map<string, Job>();
      memoryJobs.forEach(j => jobMap.set(j.id, j));
      dbJobs.forEach(j => jobMap.set(j.id, j));
      let jobs = Array.from(jobMap.values());

      if (status === "active") {
        jobs = jobs.filter(j => 
          ["assigned", "accepted", "on_the_way_pickup", "arrived_pickup", "collected", "on_the_way_delivery"].includes(j.status)
        );
      } else if (status === "pending") {
        jobs = jobs.filter(j => j.status === "assigned");
      } else if (status === "completed") {
        jobs = jobs.filter(j => ["delivered", "cancelled"].includes(j.status));
      }

      const mobileJobs = jobs.map(job => ({
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

      // Try memory first, then database
      let job = await storage.getJob(jobId);
      if (!job) {
        const dbJobs = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
        if (dbJobs.length > 0) {
          job = dbJobs[0];
        }
      }

      if (!job) {
        return res.status(404).json({ 
          error: "Job not found",
          code: "JOB_NOT_FOUND"
        });
      }

      if (job.driverId !== driver.id) {
        return res.status(403).json({ 
          error: "This job is not assigned to you",
          code: "NOT_YOUR_JOB"
        });
      }

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
        podSignatureUrl: job.podSignatureUrl,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
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

      const job = await storage.getJob(jobId);

      if (!job) {
        return res.status(404).json({ 
          error: "Job not found",
          code: "JOB_NOT_FOUND"
        });
      }

      if (job.driverId !== driver.id) {
        return res.status(403).json({ 
          error: "This job is not assigned to you",
          code: "NOT_YOUR_JOB"
        });
      }

      const allowedTransitions = VALID_JOB_TRANSITIONS[job.status as JobStatus] || [];
      
      if (!allowedTransitions.includes(status)) {
        return res.status(400).json({ 
          error: `Cannot transition from '${job.status}' to '${status}'`,
          code: "INVALID_TRANSITION",
          currentStatus: job.status,
          allowedTransitions,
        });
      }

      // Require POD (photo or signature) before marking as delivered
      if (status === "delivered") {
        if (!job.podPhotoUrl && !job.podSignatureUrl) {
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
      const { podPhotoUrl, podSignatureUrl } = req.body;

      const job = await storage.getJob(jobId);

      if (!job) {
        return res.status(404).json({ 
          error: "Job not found",
          code: "JOB_NOT_FOUND"
        });
      }

      if (job.driverId !== driver.id) {
        return res.status(403).json({ 
          error: "This job is not assigned to you",
          code: "NOT_YOUR_JOB"
        });
      }

      if (!["on_the_way_delivery", "delivered"].includes(job.status)) {
        return res.status(400).json({ 
          error: "POD can only be uploaded during delivery phase",
          code: "INVALID_POD_TIMING"
        });
      }

      const updatedJob = await storage.updateJobPOD(jobId, podPhotoUrl, podSignatureUrl);

      if (!updatedJob) {
        return res.status(500).json({ 
          error: "Failed to upload POD",
          code: "POD_UPLOAD_FAILED"
        });
      }

      res.json({
        success: true,
        pod: {
          photoUrl: updatedJob.podPhotoUrl,
          signatureUrl: updatedJob.podSignatureUrl,
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
      
      // Enrich with job details
      const enrichedOffers = await Promise.all(
        allAssignments.map(async (assignment) => {
          const job = await storage.getJob(assignment.jobId);
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
      
      res.json({
        success: true,
        offers: enrichedOffers.filter(o => o.job !== null),
        count: enrichedOffers.filter(o => o.job !== null).length
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
