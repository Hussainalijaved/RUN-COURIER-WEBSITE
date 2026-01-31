import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type VerifiedUser, supabaseAdmin, isAdminByEmail } from "./supabaseAdmin";
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
    isBritish: supabaseDriver.is_british || true,
    nationalInsuranceNumber: supabaseDriver.national_insurance_number || supabaseDriver.ni_number || null,
    rightToWorkShareCode: supabaseDriver.right_to_work_share_code || null,
    dbsChecked: supabaseDriver.dbs_checked || false,
    dbsCertificateUrl: supabaseDriver.dbs_certificate_url || null,
    dbsCheckDate: supabaseDriver.dbs_check_date || null,
    driverCode: supabaseDriver.driver_code || null, // driver_code is the RC##L code
    isAvailable: supabaseDriver.online_status === 'online',
    isVerified: supabaseDriver.status === 'approved', // Use 'status' column, not 'approval_status'
    isActive: supabaseDriver.is_active !== false, // Default to true if not set
    currentLatitude: supabaseDriver.current_latitude?.toString() || null,
    currentLongitude: supabaseDriver.current_longitude?.toString() || null,
    lastLocationUpdate: supabaseDriver.last_location_update || null,
    rating: null,
    totalJobs: 0,
    profilePictureUrl: supabaseDriver.profile_picture_url || null,
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

/**
 * Middleware to verify Supabase authentication for mobile routes
 * Uses direct Supabase auth verification - no JWT payload fallback
 */
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
    // Use direct Supabase auth verification - no fallback to JWT payload decoding
    if (!supabaseAdmin) {
      console.error("[Mobile Auth] Supabase admin client not initialized");
      res.status(500).json({ 
        error: "Authentication service unavailable",
        code: "AUTH_SERVICE_ERROR"
      });
      return;
    }
    
    const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !authUser) {
      console.log("[Mobile Auth] Token verification failed:", error?.message);
      res.status(401).json({ 
        error: "Invalid or expired token",
        code: "INVALID_TOKEN"
      });
      return;
    }

    // Set verified user info
    req.auth = {
      id: authUser.id,
      email: authUser.email || '',
      role: authUser.user_metadata?.role || 'user',
      fullName: authUser.user_metadata?.fullName || authUser.user_metadata?.full_name,
    };
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

/**
 * Middleware for admin/dispatcher access on mobile routes
 * 
 * SECURITY: Uses email-based verification via admins table
 * No JWT role fallback - prevents bypass via stale/incorrect role claims
 */
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

  // AUTHORITATIVE CHECK: verify email is in admins table
  // This is the SINGLE SOURCE OF TRUTH per the admin identity model
  // No JWT role fallback - email in admins table is the only valid admin verification
  const emailIsAdmin = await isAdminByEmail(req.auth.email);
  
  if (!emailIsAdmin) {
    console.log(`[Admin Auth] Access denied for: ${req.auth.email} (not in admins table)`);
    res.status(403).json({ 
      error: "Admin access required",
      code: "NOT_ADMIN"
    });
    return;
  }

  // Email is in admins table - grant access
  console.log(`[Admin Auth] Access granted via admins table for: ${req.auth.email}`);
  next();
}

/**
 * Middleware specifically for admin-only routes (no dispatcher fallback)
 * Uses email-based verification against admins table
 */
export async function requireAdminRole(
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

  const emailIsAdmin = await isAdminByEmail(req.auth.email);
  
  if (!emailIsAdmin) {
    console.log(`[Admin Auth] Admin access denied for: ${req.auth.email}`);
    res.status(403).json({ 
      error: "Admin access required",
      code: "NOT_ADMIN"
    });
    return;
  }

  console.log(`[Admin Auth] Admin access granted for: ${req.auth.email}`);
  next();
}
