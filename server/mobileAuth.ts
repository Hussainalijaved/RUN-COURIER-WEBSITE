import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type VerifiedUser } from "./supabaseAdmin";
import { storage } from "./storage";
import { db } from "./db";
import { drivers as driversTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Driver } from "@shared/schema";

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
    // First try to get driver from in-memory storage
    let driver = await storage.getDriver(req.auth.id);
    
    // If not found in memory, try the database
    if (!driver) {
      const dbDrivers = await db.select().from(driversTable).where(eq(driversTable.id, req.auth.id));
      if (dbDrivers.length > 0) {
        driver = dbDrivers[0];
      }
    }
    
    if (!driver) {
      res.status(403).json({ 
        error: "Driver profile not found. Please complete driver registration.",
        code: "NO_DRIVER_PROFILE"
      });
      return;
    }

    if (!driver.isVerified) {
      res.status(403).json({ 
        error: "Driver account is pending verification",
        code: "DRIVER_NOT_VERIFIED"
      });
      return;
    }

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
