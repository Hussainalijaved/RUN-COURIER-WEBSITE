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
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (error || !user) {
      console.error('Token verification failed:', error?.message);
      return null;
    }

    const metadata = user.user_metadata || {};
    
    return {
      id: user.id,
      email: user.email || '',
      role: metadata.role || 'customer',
      userType: metadata.userType,
      fullName: metadata.fullName || metadata.full_name,
    };
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}
