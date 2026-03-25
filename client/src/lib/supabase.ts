import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase is properly configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ SUPABASE NOT CONFIGURED: Login will not work. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      storageKey: 'runcourier-auth',
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'driver' | 'customer' | 'dispatcher' | 'vendor' | 'supervisor';
  userType?: 'individual' | 'business';
  companyName?: string;
  registrationNumber?: string;
  phone?: string;
  isActive: boolean;
};

export const signUp = async (email: string, password: string, metadata: Record<string, any>) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });
  
  if (data?.user && !error) {
    try {
      await fetch('/api/auth/registration-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          name: metadata.full_name || metadata.fullName || email.split('@')[0],
          role: metadata.user_type || metadata.userType || 'customer',
          company: metadata.company_name || metadata.companyName
        })
      });
    } catch (err) {
      console.error('Failed to send registration emails:', err);
    }
  }
  
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};

export const uploadFile = async (bucket: string, path: string, file: File) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });
  return { data, error };
};

export const getPublicUrl = (bucket: string, path: string) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

export const subscribeToChannel = (
  channelName: string,
  table: string,
  callback: (payload: any) => void
) => {
  return supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      callback
    )
    .subscribe();
};

export const getSignedUrl = async (bucket: string, path: string, expiresIn = 3600): Promise<string | null> => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    
    if (error) {
      console.error('Failed to get signed URL:', error);
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }
};

export const fetchWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number = 15000,
  errorMessage: string = 'Request timed out'
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
};
