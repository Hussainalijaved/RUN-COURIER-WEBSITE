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
import { getStripePublishableKey } from "./stripeClient";
import { registerMobileRoutes } from "./mobileRoutes";
import { sendNewJobNotification, sendDriverApplicationNotification, sendDocumentUploadNotification, sendPaymentNotification, sendContactFormSubmission, sendPasswordResetEmail } from "./emailService";

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

function generateTrackingNumber(): string {
  const prefix = "RC";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
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

  app.get("/api/jobs/:id", asyncHandler(async (req, res) => {
    const job = await storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  }));

  app.get("/api/jobs/track/:trackingNumber", asyncHandler(async (req, res) => {
    const job = await storage.getJobByTrackingNumber(req.params.trackingNumber);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  }));

  app.post("/api/jobs", asyncHandler(async (req, res) => {
    // Preprocess data to handle type coercion
    const preprocessedBody = {
      ...req.body,
      trackingNumber: generateTrackingNumber(),
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
    // Send admin notification
    await sendNewJobNotification(job.id, job).catch(err => console.error('Failed to send job notification:', err));
    res.status(201).json(job);
  }));

  app.patch("/api/jobs/:id", asyncHandler(async (req, res) => {
    const job = await storage.updateJob(req.params.id, req.body);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  }));

  app.patch("/api/jobs/:id/status", asyncHandler(async (req, res) => {
    const { status, rejectionReason } = req.body;
    const job = await storage.updateJobStatus(req.params.id, status, rejectionReason);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  }));

  app.patch("/api/jobs/:id/assign", asyncHandler(async (req, res) => {
    const { driverId, dispatcherId } = req.body;
    const job = await storage.assignDriver(req.params.id, driverId, dispatcherId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  }));

  app.patch("/api/jobs/:id/pod", asyncHandler(async (req, res) => {
    const { podPhotoUrl, podSignatureUrl } = req.body;
    const job = await storage.updateJobPOD(req.params.id, podPhotoUrl, podSignatureUrl);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  }));

  app.delete("/api/jobs/:id", asyncHandler(async (req, res) => {
    await storage.deleteJob(req.params.id);
    res.status(204).send();
  }));

  app.get("/api/drivers", asyncHandler(async (req, res) => {
    const { isAvailable, isVerified, vehicleType } = req.query;
    const drivers = await storage.getDrivers({
      isAvailable: isAvailable === "true" ? true : isAvailable === "false" ? false : undefined,
      isVerified: isVerified === "true" ? true : isVerified === "false" ? false : undefined,
      vehicleType: vehicleType as VehicleType | undefined,
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
    let driver = await storage.getDriverByUserId(req.params.userId);
    if (!driver) {
      const { supabaseAdmin } = await import("./supabaseAdmin");
      let fullName: string | null = null;
      let email: string | null = null;
      let phone: string | null = null;
      
      if (supabaseAdmin) {
        try {
          const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(req.params.userId);
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
        userId: req.params.userId,
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
      
      // Insert into PostgreSQL database directly via Drizzle ORM (bypassing Supabase REST API schema cache)
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
              driverCode: driver.driverCode,
              fullName: driver.fullName,
              email: driver.email,
              phone: driver.phone,
              vehicleType: driver.vehicleType,
            }
          });
          
          console.log("Driver successfully inserted/updated in PostgreSQL:", driver.id);
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
    const driver = await storage.updateDriver(req.params.id, req.body);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // Sync update to PostgreSQL database via Drizzle
    try {
      const { db } = await import("./db");
      const { drivers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const updateData: Partial<typeof drivers.$inferSelect> = {};
      if (req.body.vehicleType !== undefined) updateData.vehicleType = req.body.vehicleType;
      if (req.body.vehicleRegistration !== undefined) updateData.vehicleRegistration = req.body.vehicleRegistration;
      if (req.body.vehicleMake !== undefined) updateData.vehicleMake = req.body.vehicleMake;
      if (req.body.vehicleModel !== undefined) updateData.vehicleModel = req.body.vehicleModel;
      if (req.body.vehicleColor !== undefined) updateData.vehicleColor = req.body.vehicleColor;
      if (req.body.fullName !== undefined) updateData.fullName = req.body.fullName;
      if (req.body.email !== undefined) updateData.email = req.body.email;
      if (req.body.phone !== undefined) updateData.phone = req.body.phone;
      if (req.body.postcode !== undefined) updateData.postcode = req.body.postcode;
      if (req.body.address !== undefined) updateData.address = req.body.address;
      if (req.body.isAvailable !== undefined) updateData.isAvailable = req.body.isAvailable;
      if (req.body.isVerified !== undefined) updateData.isVerified = req.body.isVerified;
      
      if (Object.keys(updateData).length > 0) {
        await db.update(drivers).set(updateData).where(eq(drivers.id, req.params.id));
        console.log("Driver successfully updated in PostgreSQL:", req.params.id);
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

  app.delete("/api/drivers/:id", asyncHandler(async (req, res) => {
    const driverId = req.params.id;
    
    // Check if driver exists
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    // If driver has a userId, also delete the user account from Supabase Auth first
    if (driver.userId) {
      const supabaseAdmin = (await import('./supabaseAdmin')).supabaseAdmin;
      if (!supabaseAdmin) {
        console.error('[Drivers] Supabase admin not configured, cannot delete driver');
        return res.status(500).json({ error: "Account deletion service unavailable" });
      }
      
      try {
        const { error: supabaseError } = await supabaseAdmin.auth.admin.deleteUser(driver.userId);
        if (supabaseError) {
          console.error('Error deleting user from Supabase:', supabaseError);
          return res.status(500).json({ error: "Failed to delete account from authentication service" });
        }
        console.log(`[Drivers] Deleted user ${driver.userId} from Supabase Auth`);
      } catch (supabaseError) {
        console.error('Error deleting user from Supabase:', supabaseError);
        return res.status(500).json({ error: "Failed to delete account from authentication service" });
      }
      
      // Delete user from local storage
      await storage.deleteUser(driver.userId);
    }
    
    // Delete driver record
    await storage.deleteDriver(driverId);
    console.log(`[Drivers] Deleted driver ${driverId}`);
    
    res.json({ success: true, message: "Driver account deleted successfully" });
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

      // Get existing drivers from Supabase database (for permanent driver codes)
      const { data: supabaseDrivers } = await supabaseAdmin
        .from('drivers')
        .select('id, user_id, driver_code');
      
      // Build a map: user_id -> { id, driver_code }
      const supabaseDriverMap = new Map<string, { id: string; driver_code: string | null }>();
      for (const d of (supabaseDrivers || [])) {
        const key = d.user_id || d.id;
        supabaseDriverMap.set(key, { id: d.id, driver_code: d.driver_code });
      }

      // Get local drivers for driver codes
      const localDrivers = await storage.getDrivers();
      const localDriverMap = new Map(localDrivers.map(d => [d.userId || d.id, d]));

      // Filter for driver role users
      const driverUsersList = users.filter(user => user.user_metadata?.role === 'driver');
      
      // Process drivers sequentially to avoid race conditions
      const driverUsers = [];
      for (const user of driverUsersList) {
        const supabaseDriver = supabaseDriverMap.get(user.id);
        let driverCode = supabaseDriver?.driver_code || null;
        
        // Check if driver exists locally
        let localDriver = localDriverMap.get(user.id);
        
        if (!localDriver) {
          // Create a local driver record - will generate code if not in Supabase
          localDriver = await storage.createDriver({
            userId: user.id,
            fullName: user.user_metadata?.fullName || user.user_metadata?.full_name || null,
            email: user.email || null,
            phone: user.user_metadata?.phone || null,
            vehicleType: 'car',
            isAvailable: false,
            isVerified: false,
            driverCode: driverCode || undefined, // Use existing Supabase code if available
          });
          localDriverMap.set(user.id, localDriver);
        }

        // If no code in Supabase yet, save the generated code permanently using upsert
        if (!driverCode && localDriver?.driverCode) {
          driverCode = localDriver.driverCode;
          
          // Use upsert with onConflict to prevent race conditions
          // This ensures the driver_code is only set if not already present
          const { error: upsertError } = await supabaseAdmin
            .from('drivers')
            .upsert({
              id: supabaseDriver?.id || user.id,
              user_id: user.id,
              driver_code: driverCode,
              full_name: user.user_metadata?.fullName || user.user_metadata?.full_name || null,
              email: user.email || null,
              phone: user.user_metadata?.phone || null,
              vehicle_type: localDriver.vehicleType || 'car',
              is_available: localDriver.isAvailable || false,
              is_verified: localDriver.isVerified || false,
            }, { 
              onConflict: 'user_id',
              ignoreDuplicates: false 
            });

          if (upsertError) {
            console.error(`Error upserting driver ${user.id}:`, upsertError);
          } else {
            console.log(`Saved permanent driver code ${driverCode} to Supabase for user ${user.id}`);
          }
        }

        driverUsers.push({
          id: user.id,
          email: user.email,
          fullName: user.user_metadata?.fullName || user.user_metadata?.full_name || 'Unknown Driver',
          phone: user.user_metadata?.phone || null,
          role: user.user_metadata?.role || 'driver',
          driverCode: driverCode || localDriver?.driverCode || null,
          createdAt: user.created_at,
        });
      }

      res.json(driverUsers);
    } catch (err) {
      console.error("Error in supabase-drivers:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }));

  app.get("/api/users", asyncHandler(async (req, res) => {
    const { role, isActive } = req.query;
    const users = await storage.getUsers({
      role: role as string | undefined,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
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

  app.delete("/api/users/:id", asyncHandler(async (req, res) => {
    const userId = req.params.id;
    
    // Check if user exists
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Delete from Supabase Auth first - this must succeed before we delete local data
    const supabaseAdmin = (await import('./supabaseAdmin')).supabaseAdmin;
    if (!supabaseAdmin) {
      console.error('[Users] Supabase admin not configured, cannot delete user');
      return res.status(500).json({ error: "Account deletion service unavailable" });
    }
    
    try {
      const { error: supabaseError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (supabaseError) {
        console.error('Error deleting user from Supabase:', supabaseError);
        return res.status(500).json({ error: "Failed to delete account from authentication service" });
      }
      console.log(`[Users] Deleted user ${userId} from Supabase Auth`);
    } catch (supabaseError) {
      console.error('Error deleting user from Supabase:', supabaseError);
      return res.status(500).json({ error: "Failed to delete account from authentication service" });
    }
    
    // If user is a driver, delete driver record too
    const driver = await storage.getDriverByUserId(userId);
    if (driver) {
      await storage.deleteDriver(driver.id);
      console.log(`[Users] Deleted driver record for user ${userId}`);
    }
    
    // Delete user from local storage
    await storage.deleteUser(userId);
    console.log(`[Users] Deleted user ${userId} from local storage`);
    
    res.json({ success: true, message: "Account deleted successfully" });
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
    const { driverId: rawDriverId, documentType: rawDocumentType } = req.body;
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
    
    if (existingDocId) {
      // Update existing document in memory
      document = await storage.updateDocument(existingDocId, {
        fileName: file.originalname,
        fileUrl,
        status: 'pending' as const,
        uploadedAt,
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

    res.status(201).json(document);
  }));

  app.patch("/api/documents/:id/review", asyncHandler(async (req, res) => {
    const { status, reviewedBy, reviewNotes } = req.body;
    const document = await storage.reviewDocument(req.params.id, status, reviewedBy, reviewNotes);
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    // Sync review status to PostgreSQL database
    try {
      const { db } = await import("./db");
      const { documents } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(documents).set({
        status: document.status,
        reviewedBy: document.reviewedBy,
        reviewNotes: document.reviewNotes,
        reviewedAt: document.reviewedAt,
      }).where(eq(documents.id, req.params.id));
      console.log("Document review synced to PostgreSQL:", req.params.id);
    } catch (e) {
      console.error("Failed to sync document review to PostgreSQL:", e);
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

    const trackingNumber = generateTrackingNumber();
    const basePrice = bookingData.basePrice || bookingData.totalPrice * 0.3;
    const distancePrice = bookingData.distancePrice || bookingData.totalPrice * 0.7;
    
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
      basePrice: String(basePrice),
      distancePrice: String(distancePrice),
      totalPrice: String(bookingData.totalPrice || 0),
      distance: String(bookingData.distance || 0),
      customerId: bookingData.customerId,
      customerEmail: bookingData.customerEmail || customer.email,
      paymentStatus: 'pay_later',
      status: 'pending' as JobStatus,
      isMultiDrop: bookingData.isMultiDrop || false,
      isReturnTrip: bookingData.isReturnTrip || false,
      scheduledPickupTime: bookingData.scheduledPickupTime ? new Date(bookingData.scheduledPickupTime) : null,
      scheduledDeliveryTime: bookingData.scheduledDeliveryTime ? new Date(bookingData.scheduledDeliveryTime) : null,
      isScheduled: !!bookingData.scheduledPickupTime,
    };

    const job = await storage.createJob(jobData);
    
    await storage.incrementCompletedBookings(bookingData.customerId);
    console.log(`[Pay Later Booking] Created job ${trackingNumber} for customer ${bookingData.customerId} - payment to be invoiced weekly`);
    
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

    const trackingNumber = generateTrackingNumber();
    const totalPrice = parseFloat(metadata.totalPrice || '0');
    const basePrice = parseFloat(metadata.basePrice || String(totalPrice * 0.3));
    const distancePrice = parseFloat(metadata.distancePrice || String(totalPrice * 0.7));
    
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
      basePrice: String(basePrice),
      distancePrice: String(distancePrice),
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
      scheduledPickupTime: metadata.scheduledPickupTime ? new Date(metadata.scheduledPickupTime) : null,
      scheduledDeliveryTime: metadata.scheduledDeliveryTime ? new Date(metadata.scheduledDeliveryTime) : null,
      isScheduled: !!metadata.scheduledPickupTime,
    };

    const job = await storage.createJob(jobData);
    
    if (metadata.customerId) {
      await storage.incrementCompletedBookings(metadata.customerId);
      console.log(`[Booking] Incremented completed bookings count for user ${metadata.customerId}. Discount was ${metadata.discountApplied === 'true' ? 'applied' : 'not applied'}`);
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

    // Check if driver exists
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // Check for existing active assignment
    const existingAssignment = await storage.getActiveAssignmentForJob(jobId);
    if (existingAssignment) {
      return res.status(400).json({ error: "Job already has an active assignment. Cancel it first before reassigning." });
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

    // Create notification for driver
    if (driver.userId) {
      await storage.createNotification({
        userId: driver.userId,
        title: "New Job Assignment",
        message: `You have been assigned a new job (${job.trackingNumber}). Driver payment: £${driverPrice}. Please accept or decline.`,
        type: "job_assigned",
        data: { assignmentId: assignment.id, jobId },
      });
    }

    res.status(201).json(assignment);
  }));

  app.patch("/api/job-assignments/:id", asyncHandler(async (req, res) => {
    const assignment = await storage.updateJobAssignment(req.params.id, req.body);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.json(assignment);
  }));

  app.patch("/api/job-assignments/:id/respond", asyncHandler(async (req, res) => {
    const { accepted } = req.body;
    
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

    const newStatus: JobAssignmentStatus = accepted ? "accepted" : "rejected";
    const updated = await storage.updateJobAssignment(req.params.id, {
      status: newStatus,
      respondedAt: new Date(),
    });

    // If accepted, assign the driver to the job
    if (accepted && updated) {
      await storage.assignDriver(assignment.jobId, assignment.driverId);
      
      // Update job status to assigned
      await storage.updateJobStatus(assignment.jobId, "assigned" as any);
    }

    // Notify admin of response
    await storage.createNotification({
      userId: assignment.assignedBy,
      title: `Job Assignment ${accepted ? "Accepted" : "Rejected"}`,
      message: `Driver has ${accepted ? "accepted" : "rejected"} the job assignment for job ${assignment.jobId}`,
      type: "assignment_response",
      data: { assignmentId: assignment.id, jobId: assignment.jobId },
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
