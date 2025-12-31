import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type VerifiedUser, supabaseAdmin } from "./supabaseAdmin";
import { storage } from "./storage";
import { db } from "./db";
import { drivers as driversTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Driver } from "@shared/schema";

// Helper to convert Supabase driver to local Driver type
function mapSupabaseDriverToLocal(supabaseDriver: any): Driver {
  return {
    id: supabaseDriver.id,
    userId: supabaseDriver.id, // In Supabase, id IS the auth uid
    fullName: supabaseDriver.full_name || null,
    email: supabaseDriver.email || null,
    phone: supabaseDriver.phone || null,
    vehicleType: supabaseDriver.vehicle_type || 'small_van',
    vehicleRegistration: supabaseDriver.vehicle_reg || supabaseDriver.vehicle_registration || null,
    vehicleMake: supabaseDriver.vehicle_make || null,
    vehicleModel: supabaseDriver.vehicle_model || null,
    vehicleColor: supabaseDriver.vehicle_color || null,
    address: supabaseDriver.address || null,
    postcode: supabaseDriver.postcode || null,
    nationality: supabaseDriver.nationality || null,
    isBritish: true,
    nationalInsuranceNumber: supabaseDriver.ni_number || supabaseDriver.national_insurance || null,
    rightToWorkShareCode: null,
    dbsChecked: false,
    dbsCertificateUrl: null,
    dbsCheckDate: null,
    driverCode: supabaseDriver.driver_id || null, // driver_id in Supabase is the RC##L code
    isAvailable: supabaseDriver.online_status === 'online',
    isVerified: supabaseDriver.approval_status === 'approved',
    isActive: true,
    currentLatitude: supabaseDriver.latitude?.toString() || null,
    currentLongitude: supabaseDriver.longitude?.toString() || null,
    lastLocationUpdate: null,
    rating: null,
    totalJobs: 0,
    profilePictureUrl: supabaseDriver.profile_picture_url || supabaseDriver.profile_picture || null,
    createdAt: supabaseDriver.created_at ? new Date(supabaseDriver.created_at) : null,
    deactivatedAt: null,
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: VerifiedUser;
      driver?: Driver;
    }
  }
}

export async function requireSupabaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ 
      error: "Authentication required",
      code: "NO_TOKEN"
    });
    return;
  }

  const token = authHeader.substring(7);
  
  try {
    const user = await verifyAccessToken(token);
    
    if (!user) {
      res.status(401).json({ 
        error: "Invalid or expired token",
        code: "INVALID_TOKEN"
      });
      return;
    }

    req.auth = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ 
      error: "Authentication failed",
      code: "AUTH_ERROR"
    });
  }
}

export async function requireDriverRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ 
      error: "Authentication required",
      code: "NO_AUTH"
    });
    return;
  }

  try {
    console.log("[Mobile Auth] Looking for driver with ID:", req.auth.id);
    
    let driver: Driver | null = null;
    
    // CRITICAL: Query Supabase FIRST as it's the source of truth
    // The mobile app and website share Supabase as the single source of truth
    if (supabaseAdmin) {
      console.log("[Mobile Auth] Querying Supabase for driver...");
      const { data: supabaseDriver, error: supabaseError } = await supabaseAdmin
        .from('drivers')
        .select('*')
        .eq('id', req.auth.id)
        .single();
      
      if (supabaseError) {
        console.log("[Mobile Auth] Supabase query error:", supabaseError.message);
      } else if (supabaseDriver) {
        console.log("[Mobile Auth] Driver found in Supabase:", supabaseDriver.driver_id, "approval:", supabaseDriver.approval_status);
        driver = mapSupabaseDriverToLocal(supabaseDriver);
      }
    }
    
    // Fallback to local storage if Supabase lookup fails
    if (!driver) {
      console.log("[Mobile Auth] Falling back to local storage...");
      const localDriver = await storage.getDriver(req.auth.id);
      if (localDriver) {
        driver = localDriver;
      } else {
        const localDriverByUserId = await storage.getDriverByUserId(req.auth.id);
        if (localDriverByUserId) {
          driver = localDriverByUserId;
        }
      }
    }
    
    // Final fallback to local database
    if (!driver) {
      const dbDrivers = await db.select().from(driversTable).where(eq(driversTable.id, req.auth.id));
      if (dbDrivers.length > 0) {
        driver = dbDrivers[0];
      }
    }
    
    if (!driver) {
      console.log("[Mobile Auth] No driver found for ID:", req.auth.id);
      res.status(403).json({ 
        error: "Driver profile not found. Please complete driver registration.",
        code: "NO_DRIVER_PROFILE"
      });
      return;
    }

    if (!driver.isVerified) {
      console.log("[Mobile Auth] Driver not verified. approval_status check failed for:", driver.driverCode);
      res.status(403).json({ 
        error: "Driver account is pending verification",
        code: "DRIVER_NOT_VERIFIED"
      });
      return;
    }

    console.log("[Mobile Auth] Driver authenticated successfully:", driver.driverCode, "verified:", driver.isVerified);
    req.driver = driver;
    next();
  } catch (error) {
    console.error("Driver role check error:", error);
    res.status(500).json({ 
      error: "Failed to verify driver status",
      code: "DRIVER_CHECK_ERROR"
    });
  }
}

export async function requireAdminOrDispatcher(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ 
      error: "Authentication required",
      code: "NO_AUTH"
    });
    return;
  }

  if (!["admin", "dispatcher"].includes(req.auth.role)) {
    res.status(403).json({ 
      error: "Admin or dispatcher access required",
      code: "INSUFFICIENT_ROLE"
    });
    return;
  }

  next();
}
