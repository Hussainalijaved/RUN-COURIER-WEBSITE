import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getConfig = () => {
  try {
    const extra = 
      Constants.expoConfig?.extra ||
      (Constants as any).manifest?.extra ||
      (Constants as any).manifest2?.extra?.expoClient?.extra ||
      {};
    
    const extraUrl = extra.supabaseUrl;
    const extraKey = extra.supabaseAnonKey;
    
    const isValidExtraUrl = extraUrl && 
      typeof extraUrl === 'string' && 
      extraUrl.startsWith('http') && 
      !extraUrl.includes('${');
    
    const isValidExtraKey = extraKey && 
      typeof extraKey === 'string' && 
      extraKey.length > 20 &&
      !extraKey.includes('${');
    
    const supabaseUrl = isValidExtraUrl 
      ? extraUrl 
      : (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL) || '';
    
    const supabaseAnonKey = isValidExtraKey 
      ? extraKey 
      : (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) || '';

    if (__DEV__) {
      console.log('Supabase config loaded:', { 
        urlPresent: !!supabaseUrl && supabaseUrl.startsWith('http'), 
        keyPresent: !!supabaseAnonKey && supabaseAnonKey.length > 20,
        source: isValidExtraUrl ? 'Constants.extra' : 'process.env',
        urlPreview: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'empty',
      });
    }

    return { supabaseUrl, supabaseAnonKey };
  } catch (error) {
    console.warn('Failed to load config from Constants:', error);
    return {
      supabaseUrl: (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL) || '',
      supabaseAnonKey: (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) || '',
    };
  }
};

const config = getConfig();
const supabaseUrl = config.supabaseUrl;
const supabaseAnonKey = config.supabaseAnonKey;

export function getConfigStatus(): { isValid: boolean; missingItems: string[] } {
  const missing: string[] = [];
  
  if (!supabaseUrl || supabaseUrl.trim() === '') {
    missing.push('Supabase URL');
  }
  if (!supabaseAnonKey || supabaseAnonKey.trim() === '') {
    missing.push('Supabase API Key');
  }
  
  return {
    isValid: missing.length === 0,
    missingItems: missing,
  };
}

export function refreshConfig(): { isValid: boolean; missingItems: string[] } {
  const newConfig = getConfig();
  return {
    isValid: !!newConfig.supabaseUrl && !!newConfig.supabaseAnonKey,
    missingItems: getConfigStatus().missingItems,
  };
}

const storage = Platform.OS === 'web' ? {
  getItem: (key: string) => {
    if (typeof window !== 'undefined') {
      return Promise.resolve(window.localStorage.getItem(key));
    }
    return Promise.resolve(null);
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
    return Promise.resolve();
  },
} : {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

const isValidUrl = (url: string | undefined): boolean => {
  if (!url || url.trim() === '' || url === 'undefined') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const hasValidCredentials = isValidUrl(supabaseUrl) && 
                            supabaseAnonKey && 
                            supabaseAnonKey.trim() !== '' && 
                            supabaseAnonKey !== 'undefined' &&
                            supabaseAnonKey.length > 10;

const createMockAuth = () => ({
  getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  getUser: () => Promise.resolve({ data: { user: null }, error: null }),
  onAuthStateChange: (callback: any) => {
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
  signUp: ({ email, password }: any) => {
    return Promise.resolve({ 
      data: { user: { id: 'demo-user', email }, session: null }, 
      error: null 
    });
  },
  signInWithPassword: ({ email, password }: any) => {
    const mockSession = {
      user: { id: 'demo-user-123', email },
      access_token: 'mock-token',
      refresh_token: 'mock-refresh',
      expires_at: Date.now() + 3600000,
    };
    return Promise.resolve({ 
      data: { user: mockSession.user, session: mockSession }, 
      error: null 
    });
  },
  signOut: () => Promise.resolve({ error: null }),
  updateUser: (data: any) => Promise.resolve({ data: null, error: null }),
  resetPasswordForEmail: (email: string, options: any) => Promise.resolve({ data: null, error: null }),
  setSession: (session: any) => Promise.resolve({ data: { session: null }, error: null }),
});

const createMockFrom = (table: string) => {
  const createChain = () => {
    const chain: any = {
      eq: (column: string, value: any) => chain,
      in: (column: string, values: any[]) => chain,
      order: (col: string, opts: any) => chain,
      limit: (n: number) => chain,
      single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: [], count: 0, error: null }),
    };
    return chain;
  };

  return {
    select: (columns?: string, options?: any) => createChain(),
    insert: (data: any) => ({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    update: (data: any) => ({
      eq: (column: string, value: any) => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    upsert: (data: any) => ({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    delete: () => ({
      eq: (column: string, value: any) => Promise.resolve({ data: null, error: null }),
    }),
  };
};

const createMockChannel = (name: string) => {
  const mockChannel = {
    on: (event: string, opts: any, callback?: any) => mockChannel,
    subscribe: () => mockChannel,
    unsubscribe: () => Promise.resolve(),
  };
  return mockChannel;
};

const createMockStorage = () => ({
  from: (bucket: string) => ({
    upload: (path: string, file: any, options?: any) => Promise.resolve({ data: { path }, error: null }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: '' } }),
    remove: (paths: string[]) => Promise.resolve({ data: null, error: null }),
    download: (path: string) => Promise.resolve({ data: null, error: null }),
  }),
});

let supabase: any;

if (hasValidCredentials) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    supabase = {
      auth: createMockAuth(),
      from: createMockFrom,
      channel: createMockChannel,
      removeChannel: (channel: any) => Promise.resolve({ error: null }),
      storage: createMockStorage(),
    };
  }
} else {
  console.warn('Supabase credentials not found. Using mock client for demo mode.');
  supabase = {
    _isMock: true,
    auth: createMockAuth(),
    from: createMockFrom,
    channel: createMockChannel,
    removeChannel: (channel: any) => Promise.resolve({ error: null }),
    storage: createMockStorage(),
  };
}

export { supabase };

export type JobStatus = 
  | 'new'
  | 'pending_review'
  | 'awaiting_assignment'
  | 'assigned'
  | 'accepted'
  | 'arrived_pickup'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'failed'
  | 'rejected'
  | 'pending';

// CANONICAL JOB IDENTIFIER: tracking_number
// - tracking_number is the human-readable job reference (format: RC2024001ABC)
// - Must match website format EXACTLY - set by admin/website, NEVER generated by mobile app
// - id is the internal database primary key - used for queries only, never for display
// - All screens (driver app, customer app, website) must display only tracking_number
export type Job = {
  id: string | number;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  delivery_latitude?: number;
  delivery_longitude?: number;
  price_customer?: number;
  notes?: string;
  parcel_weight?: number;
  priority?: string;
  vehicle_type?: string;
  scheduled_pickup_time?: string;
  status: JobStatus;
  driver_id: string | null;
  tracking_number?: string;
  created_at: string;
  updated_at?: string;
  rejection_reason?: string;
  pod_photo_url?: string;
  pod_photos?: string[];
  pod_signature_url?: string;
  pod_notes?: string;
  recipient_name?: string;
  signature_data?: string;
  delivered_at?: string;
  pickup_postcode?: string;
  delivery_postcode?: string;
  delivery_address?: string;
  distance?: number;
  price?: number;
  driver_price?: number;  // CRITICAL: This is the ONLY price drivers should ever see
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  sender_name?: string;
  sender_phone?: string;
  recipient_phone?: string;
  assigned_driver_id?: string | null;
  current_latitude?: number;
  current_longitude?: number;
  last_location_update?: string;
  pickup_barcode?: string;
  delivery_barcode?: string;
  failure_reason?: string;
  static_map_url?: string | null;
  staticMapUrl?: string | null;
};

export type Driver = {
  id: string;
  driver_id?: string;
  user_id?: string;
  email: string;
  full_name: string;
  name?: string;
  phone: string;
  phone_number?: string;
  postcode: string;
  address?: string;
  nationality?: string;
  national_insurance?: string;
  vehicle_type: 'motorbike' | 'car' | 'small_van' | 'medium_van';
  vehicle_registration?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  profile_picture_url?: string;
  profile_picture?: string;
  profile_photo?: string;
  license_url?: string;
  insurance_url?: string;
  goods_in_transit_url?: string;
  hire_and_reward_url?: string;
  vehicle_photo_url?: string;
  status?: 'pending_verification' | 'verified';
  status_reason?: string;
  is_active?: boolean;
  current_latitude?: number;
  current_longitude?: number;
  last_location_update?: string;
  created_at: string;
};

export type DriverLocation = {
  driver_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
};
