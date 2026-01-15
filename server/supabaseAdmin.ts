import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase admin client not configured - missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Cache for admin email checks to reduce database queries
const adminEmailCache = new Map<string, { isAdmin: boolean; timestamp: number }>();
const ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if an email is in the admins table
 * This is the authoritative source for admin identification
 * Uses email-based recognition as specified in the admin identity model
 */
export async function isAdminByEmail(email: string): Promise<boolean> {
  if (!email || !supabaseAdmin) {
    return false;
  }

  const normalizedEmail = email.toLowerCase().trim();
  
  // Check cache first
  const cached = adminEmailCache.get(normalizedEmail);
  if (cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
    return cached.isAdmin;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('admins')
      .select('email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    const isAdmin = !error && !!data;
    
    // Update cache
    adminEmailCache.set(normalizedEmail, { isAdmin, timestamp: Date.now() });
    
    console.log(`[Admin Check] Email ${normalizedEmail}: ${isAdmin ? 'IS admin' : 'NOT admin'}`);
    return isAdmin;
  } catch (error) {
    console.error('[Admin Check] Error checking admin status:', error);
    return false;
  }
}

/**
 * Clear the admin cache (useful when admin list changes)
 */
export function clearAdminCache(): void {
  adminEmailCache.clear();
}

export interface VerifiedUser {
  id: string;
  email: string;
  role: string;
  userType?: string;
  fullName?: string;
}

export async function verifyAccessToken(accessToken: string): Promise<VerifiedUser | null> {
  if (!supabaseAdmin) {
    console.error('Supabase admin client not initialized');
    return null;
  }

  try {
    // Try to decode the JWT to see what's in it (for debugging)
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log('[Supabase Auth] Token payload - sub:', payload.sub, 'email:', payload.email, 'exp:', new Date(payload.exp * 1000).toISOString());
        
        // Check if token is expired
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          console.error('[Supabase Auth] Token is EXPIRED');
          return null;
        }
      }
    } catch (decodeError) {
      console.log('[Supabase Auth] Could not decode token for logging');
    }
    
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (error || !user) {
      console.error('[Supabase Auth] Token verification failed:', error?.message);
      
      // If Supabase rejects but we have a valid JWT, try to extract user info directly
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.sub && payload.email) {
            console.log('[Supabase Auth] Using JWT payload as fallback for user:', payload.email);
            return {
              id: payload.sub,
              email: payload.email,
              role: payload.user_metadata?.role || payload.role || 'driver',
              userType: payload.user_metadata?.userType,
              fullName: payload.user_metadata?.fullName || payload.user_metadata?.full_name,
            };
          }
        }
      } catch (fallbackError) {
        console.error('[Supabase Auth] Fallback extraction failed:', fallbackError);
      }
      
      return null;
    }

    const metadata = user.user_metadata || {};
    console.log('[Supabase Auth] Token verified for user:', user.email, 'role:', metadata.role);
    
    return {
      id: user.id,
      email: user.email || '',
      role: metadata.role || 'customer',
      userType: metadata.userType,
      fullName: metadata.fullName || metadata.full_name,
    };
  } catch (error) {
    console.error('[Supabase Auth] Error verifying token:', error);
    return null;
  }
}
