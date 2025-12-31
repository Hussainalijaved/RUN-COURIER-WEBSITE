import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import { supabase, Driver } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomerProfile, CustomerRole } from '@/lib/customer-types';
import { customerService } from '@/services/customerService';
import { notificationService } from '@/services/notificationService';

const API_TIMEOUT_MS = 8000;
const CACHED_ROLE_KEY = '@cached_user_role';
const CACHED_DRIVER_KEY = '@cached_driver_data';

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = API_TIMEOUT_MS): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

// Helper functions to cache and retrieve user role for offline/timeout resilience
const cacheUserRole = async (role: UserRole, driverData?: Driver | null) => {
  try {
    if (role) {
      await AsyncStorage.setItem(CACHED_ROLE_KEY, role);
      if (driverData && role === 'driver') {
        await AsyncStorage.setItem(CACHED_DRIVER_KEY, JSON.stringify(driverData));
      }
      console.log('[AUTH] Cached user role:', role);
    } else {
      // Clear cache on logout
      await AsyncStorage.multiRemove([CACHED_ROLE_KEY, CACHED_DRIVER_KEY]);
      console.log('[AUTH] Cleared cached user role');
    }
  } catch (error) {
    console.warn('[AUTH] Failed to cache user role:', error);
  }
};

const getCachedUserRole = async (): Promise<{ role: UserRole; driver: Driver | null }> => {
  try {
    const role = await AsyncStorage.getItem(CACHED_ROLE_KEY) as UserRole;
    let driver: Driver | null = null;
    if (role === 'driver') {
      const driverJson = await AsyncStorage.getItem(CACHED_DRIVER_KEY);
      if (driverJson) {
        driver = JSON.parse(driverJson);
      }
    }
    console.log('[AUTH] Retrieved cached role:', role);
    return { role, driver };
  } catch (error) {
    console.warn('[AUTH] Failed to get cached user role:', error);
    return { role: null, driver: null };
  }
};

// Generate a unique driver ID in format: RC + 2 digits + 1 letter (e.g., "RC11A")
const generateDriverId = async (): Promise<string> => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluding I and O to avoid confusion with 1 and 0
  
  // Get current count of drivers to use as a base for the number portion
  const { count } = await supabase
    .from('drivers')
    .select('*', { count: 'exact', head: true });
  
  const baseNumber = (count || 0) + 1;
  
  // Try to find a unique ID - format: RC + 2 digits (00-99) + 1 letter (A-Z)
  // Total possible: 100 numbers * 24 letters = 2,400 unique IDs
  for (let attempt = 0; attempt < 50; attempt++) {
    // Calculate number based on driver count + attempt
    const number = (baseNumber + attempt) % 100;
    const paddedNumber = number.toString().padStart(2, '0');
    
    // Pick a letter based on attempt to spread across the alphabet
    const letterIndex = (baseNumber + attempt) % letters.length;
    const letter = letters[letterIndex];
    
    const driverId = `RC${paddedNumber}${letter}`;
    
    // Check if this ID already exists
    const { data, error } = await supabase
      .from('drivers')
      .select('driver_id')
      .eq('driver_id', driverId)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking driver_id uniqueness:', error);
      continue;
    }
    
    // If no match found, this ID is unique
    if (!data) {
      return driverId;
    }
    
    console.log('Driver ID collision, trying again:', driverId);
  }
  
  // Fallback: use random combination
  const randomNum = Math.floor(Math.random() * 100);
  const randomLetter = letters[Math.floor(Math.random() * letters.length)];
  return `RC${randomNum.toString().padStart(2, '0')}${randomLetter}`;
};

export type UserRole = 'driver' | 'individual' | 'business' | null;

type AuthContextType = {
  session: Session | null;
  user: User | null;
  driver: Driver | null;
  customerProfile: CustomerProfile | null;
  userRole: UserRole;
  loading: boolean;
  isPasswordRecovery: boolean;
  setPasswordRecoveryMode: (value: boolean) => void;
  clearPasswordRecovery: () => void;
  signUp: (email: string, password: string, vehicleType?: string) => Promise<{ error: Error | null }>;
  signUpCustomer: (email: string, password: string, fullName: string, role: CustomerRole, companyDetails?: { companyName: string; companyRegNumber?: string }) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updateDriver: (updates: Partial<Driver>) => Promise<{ error: Error | null }>;
  updateCustomerProfile: (updates: Partial<CustomerProfile>) => Promise<{ error: Error | null }>;
  refreshDriver: () => Promise<void>;
  refreshCustomerProfile: () => Promise<void>;
  deleteCustomerAccount: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initialize push notifications for driver
const initializeDriverNotifications = async (driverId: string) => {
  try {
    console.log('Initializing push notifications for driver:', driverId);
    const token = await notificationService.initialize();
    
    if (token) {
      console.log('Push token obtained:', token.substring(0, 20) + '...');
      await notificationService.saveTokenToDatabase(driverId);
      
      // Set up notification listeners
      notificationService.setupNotificationListeners(
        (notification) => {
          console.log('Received notification:', notification.request.content.title);
        },
        (response) => {
          const data = response.notification.request.content.data;
          console.log('User responded to notification:', data);
          // Handle notification tap - navigate to job if applicable
        }
      );
    } else {
      console.log('No push token available (not a physical device or permission denied)');
    }
  } catch (error) {
    console.error('Failed to initialize driver notifications:', error);
  }
};

// Retry guard to prevent timer storms
let backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
  };

  const setPasswordRecoveryMode = (value: boolean) => {
    setIsPasswordRecovery(value);
  };

  useEffect(() => {
    // SIMPLIFIED HOTFIX: Completely non-blocking initialization
    // No awaits in the main flow - UI renders immediately
    const startTime = Date.now();
    console.log(`[AUTH] initAuth START (simplified) - platform: ${Platform.OS}`);
    
    // STEP 1: Set loading=false IMMEDIATELY to prevent freeze
    // Auth listener will handle actual state updates
    setLoading(false);
    console.log(`[AUTH] Loading=false set immediately at ${Date.now() - startTime}ms`);
    
    // STEP 2: Fire cache hydration in background (no await)
    getCachedUserRole().then(cached => {
      if (cached.role) {
        console.log('[AUTH] Cache hydrated:', cached.role);
        setUserRole(cached.role);
        if (cached.driver) {
          setDriver(cached.driver);
        }
      }
    }).catch(err => {
      console.warn('[AUTH] Cache hydration failed:', err);
    });
    
    // STEP 3: Fire session fetch in background (no await)
    // Auth listener will handle the result
    supabase.auth.getSession().then(({ data, error }: { data: { session: Session | null }; error: Error | null }) => {
      if (error) {
        console.warn('[AUTH] Background session fetch error:', error);
        return;
      }
      const session = data?.session;
      console.log(`[AUTH] Background session fetched, hasUser: ${!!session?.user}`);
      setSession(session ?? null);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Fetch profile in background - no await, no blocking
        fetchUserProfile(session.user.id, session.user.email).catch((err: Error) => {
          console.warn('[AUTH] Background profile fetch failed:', err);
        });
      }
    }).catch((err: Error) => {
      console.warn('[AUTH] Background session fetch failed:', err);
    });

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((event: any, session: any) => {
        console.log('[AUTH] Auth state change:', event, 'hasSession:', !!session);
        
        if (event === 'PASSWORD_RECOVERY') {
          console.log('[AUTH] Password recovery mode detected');
          setIsPasswordRecovery(true);
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // User is authenticated - fetch their profile
          fetchUserProfile(session.user.id, session.user.email);
        } else if (event === 'SIGNED_OUT') {
          // ONLY clear state on explicit sign out - not on transient errors
          console.log('[AUTH] User signed out - clearing state');
          setDriver(null);
          setCustomerProfile(null);
          setUserRole(null);
          setLoading(false);
        } else {
          // For other null session events (transient errors), preserve existing state
          // This prevents the login loop on temporary Supabase hiccups
          console.log('[AUTH] Session null but not SIGNED_OUT - preserving current state');
          setLoading(false);
        }
      });
      subscription = data?.subscription;
    } catch (error) {
      console.error('[AUTH] Error setting up auth listener:', error);
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const fetchUserProfile = async (userId: string, userEmail?: string | null, isRetry: boolean = false) => {
    const startTime = Date.now();
    console.log(`[AUTH] fetchUserProfile START - userId: ${userId}, platform: ${Platform.OS}, isRetry: ${isRetry}`);
    
    let driverFetchFailed = false;
    let customerFetchFailed = false;
    
    try {
      // First, try to find a driver profile with timeout
      console.log('[AUTH] Fetching driver data...');
      let driverData: Driver | null = null;
      try {
        driverData = await withTimeout(fetchDriverData(userId, userEmail), API_TIMEOUT_MS);
        console.log(`[AUTH] Driver fetch completed in ${Date.now() - startTime}ms`);
      } catch (fetchError: any) {
        driverFetchFailed = true;
        console.warn('[AUTH] Driver fetch failed:', fetchError?.message || fetchError);
      }
      
      if (driverData) {
        console.log('[AUTH] User is a driver, setting state and navigating to Home');
        setDriver(driverData);
        setCustomerProfile(null);
        setUserRole('driver');
        setLoading(false);
        console.log(`[AUTH] Driver state set, loading=false after ${Date.now() - startTime}ms`);
        
        // Cache the successful role for offline resilience
        cacheUserRole('driver', driverData);
        
        // Initialize push notifications in background - NEVER block UI
        setTimeout(() => {
          initializeDriverNotifications(driverData!.id).catch(err => 
            console.warn('[AUTH] Background notification init failed:', err)
          );
        }, 100);
        return;
      }
      
      // If not a driver, try to find a customer profile with timeout
      console.log('[AUTH] Not a driver, checking for customer profile...');
      let customerData: CustomerProfile | null = null;
      try {
        customerData = await withTimeout(customerService.getCustomerProfile(userId), API_TIMEOUT_MS);
        console.log(`[AUTH] Customer fetch completed in ${Date.now() - startTime}ms`);
      } catch (fetchError: any) {
        customerFetchFailed = true;
        console.warn('[AUTH] Customer fetch failed:', fetchError?.message || fetchError);
      }
      
      if (customerData) {
        console.log('[AUTH] User is a customer:', customerData.role);
        setCustomerProfile(customerData);
        setDriver(null);
        const customerRole = customerData.role === 'business' ? 'business' : 'individual';
        setUserRole(customerRole);
        setLoading(false);
        console.log(`[AUTH] Customer state set, loading=false after ${Date.now() - startTime}ms`);
        
        // Cache the successful role for offline resilience
        cacheUserRole(customerRole);
        return;
      }
      
      // CRITICAL: If ANY fetch failed (timeout, network error, 5xx, RLS, etc.), handle gracefully
      // This ensures authenticated users always see Home screen even with backend issues
      if (driverFetchFailed || customerFetchFailed) {
        if (isRetry) {
          // On background retry, ALWAYS preserve current state on any failure
          // NEVER clear userRole on retry - keep showing Home screen
          console.log('[AUTH] Background retry failed - preserving current state');
          return;
        }
        
        // First failure - use driver fallback to prevent freeze
        console.log('[AUTH] Fetch failed - using driver fallback to prevent freeze');
        const fallbackDriver: Driver = {
          id: userId,
          driver_id: '',
          email: userEmail || '',
          full_name: '',
          phone: '',
          postcode: '',
          vehicle_type: 'car',
          status: 'pending_verification',
          created_at: new Date().toISOString(),
        };
        setDriver(fallbackDriver);
        setCustomerProfile(null);
        setUserRole('driver');
        setLoading(false);
        console.log(`[AUTH] Fallback driver set, loading=false after ${Date.now() - startTime}ms`);
        
        // CRITICAL: Cache the fallback driver so next cold start also shows Home
        cacheUserRole('driver', fallbackDriver);
        
        // Retry fetching the real profile in background after 2 seconds
        setTimeout(() => {
          console.log('[AUTH] Background retry for real profile...');
          fetchUserProfile(userId, userEmail, true).catch(err => 
            console.warn('[AUTH] Background profile retry failed:', err)
          );
        }, 2000);
        return;
      }
      
      // No profile found AND no errors - user is new and needs to complete setup
      // This is the ONLY path where userRole becomes null (legitimate new user)
      console.log('[AUTH] No driver or customer profile found for user - new user needs setup');
      setDriver(null);
      setCustomerProfile(null);
      setUserRole(null);
      setLoading(false);
      console.log(`[AUTH] No profile found (new user), loading=false after ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[AUTH] Error in fetchUserProfile:', error);
      if (isRetry) {
        // On retry, ALWAYS preserve state - never clear on any error
        console.log('[AUTH] Background retry error - preserving current state');
        return;
      }
      // Initial load error - use fallback driver to ensure Home renders
      console.log('[AUTH] Initial fetch error - using fallback driver');
      const fallbackDriver: Driver = {
        id: userId,
        driver_id: '',
        email: userEmail || '',
        full_name: '',
        phone: '',
        postcode: '',
        vehicle_type: 'car',
        status: 'pending_verification',
        created_at: new Date().toISOString(),
      };
      setDriver(fallbackDriver);
      setCustomerProfile(null);
      setUserRole('driver');
      setLoading(false);
      console.log(`[AUTH] Fallback driver set on error, loading=false after ${Date.now() - startTime}ms`);
      
      // CRITICAL: Cache the fallback driver so next cold start also shows Home
      cacheUserRole('driver', fallbackDriver);
      
      // Retry in background
      setTimeout(() => {
        fetchUserProfile(userId, userEmail, true).catch(err => 
          console.warn('[AUTH] Background retry failed:', err)
        );
      }, 2000);
    }
  };

  const fetchDriverData = async (userId: string, userEmail?: string | null): Promise<Driver | null> => {
    // IMPORTANT: This function THROWS on network/server errors so caller can detect failures
    // It only returns null for legitimate "not found" cases (PGRST116)
    let data = null;
    let error = null;
    
    if (userEmail) {
      // Look up by email, excluding archived records
      const result = await supabase
        .from('drivers')
        .select('*')
        .eq('email', userEmail)
        .single();
      data = result.data;
      error = result.error;
    }
    
    if (!data && error?.code === 'PGRST116') {
      // Fallback to ID lookup, also excluding archived
      const result = await supabase
        .from('drivers')
        .select('*')
        .eq('id', userId)
        .single();
      data = result.data;
      error = result.error;
    }
    
    // CRITICAL: Throw on non-404 errors so caller knows it's a failure, not "not found"
    if (error && error.code !== 'PGRST116') {
      console.error('[AUTH] Error fetching driver (will throw):', error);
      throw new Error(`Driver fetch error: ${error.message || error.code}`);
    }
    
    if (data) {
      console.log('[AUTH] Driver found:', data.id, data.email, 'driver_id:', data.driver_id);
      
      // If driver doesn't have a driver_id or has old format (not starting with RC), generate new one
      const needsNewId = !data.driver_id || !data.driver_id.startsWith('RC');
      if (needsNewId) {
        console.log('[AUTH] Driver needs new RC format ID. Current:', data.driver_id);
        try {
          const newDriverId = await generateDriverId();
          console.log('[AUTH] Generated new driver_id:', newDriverId);
          
          const { error: updateError } = await supabase
            .from('drivers')
            .update({ driver_id: newDriverId })
            .eq('id', data.id);
          
          if (updateError) {
            console.error('[AUTH] Error assigning driver_id:', updateError);
          } else {
            data.driver_id = newDriverId;
          }
        } catch (idError) {
          console.warn('[AUTH] Failed to generate new driver_id, continuing with existing:', idError);
        }
      }
      
      return {
        ...data,
        full_name: data.full_name || data.name,
        national_insurance: data.national_insurance || data.ni_number,
        vehicle_registration: data.vehicle_registration || data.vehicle_reg,
      };
    }
    
    // No data and no error (or 404) - legitimate "not found"
    return null;
  };

  const fetchDriver = async (userId: string) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const driverData = await fetchDriverData(userId, authUser?.email);
      if (driverData) {
        setDriver(driverData);
        setUserRole('driver');
      }
    } catch (error) {
      // NEVER clear driver state on error - preserve existing state
      console.warn('[AUTH] fetchDriver error - preserving current state:', error);
    }
  };

  const refreshDriver = useCallback(async () => {
    if (user) {
      try {
        await fetchDriver(user.id);
      } catch (error) {
        // NEVER clear driver state on error - preserve existing state
        console.warn('[AUTH] refreshDriver error - preserving current state:', error);
      }
    }
  }, [user?.id]);

  const refreshCustomerProfile = useCallback(async () => {
    if (user) {
      try {
        const customerData = await customerService.getCustomerProfile(user.id);
        if (customerData) {
          setCustomerProfile(customerData);
          setUserRole(customerData.role === 'business' ? 'business' : 'individual');
        }
      } catch (error) {
        // NEVER clear customer state on error - preserve existing state
        console.warn('[AUTH] refreshCustomerProfile error - preserving current state:', error);
      }
    }
  }, [user?.id]);

  const signUp = async (email: string, password: string, vehicleType?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          vehicle_type: vehicleType || 'car',
          role: 'driver',
        },
      },
    });
    
    if (error) {
      return { error: error as Error };
    }
    
    // Create or link driver record in the drivers table
    if (data?.user) {
      console.log('[AUTH] Checking for existing driver record with email:', normalizedEmail);
      
      // CRITICAL: Check if ANY driver exists with this email (handles duplicates safely)
      const { data: existingDrivers, error: lookupError } = await supabase
        .from('drivers')
        .select('*')
        .eq('email', normalizedEmail)
        .order('created_at', { ascending: true })
        .limit(1);
      
      if (lookupError) {
        console.error('[AUTH] Error checking for existing driver:', lookupError);
      }
      
      const existingDriver = existingDrivers && existingDrivers.length > 0 ? existingDrivers[0] : null;
      
      if (existingDriver) {
        // Driver already exists with this email - DO NOT create a new one
        console.log('[AUTH] Found existing driver record:', existingDriver.id, 'driver_id:', existingDriver.driver_id);
        console.log('[AUTH] Using existing driver record - no new record will be created');
        
        // Ensure driver has a driver_id (RC format) if missing
        if (!existingDriver.driver_id || !existingDriver.driver_id.startsWith('RC')) {
          try {
            const newDriverId = await generateDriverId();
            console.log('[AUTH] Assigning new driver_id to existing driver:', newDriverId);
            await supabase
              .from('drivers')
              .update({ driver_id: newDriverId })
              .eq('id', existingDriver.id);
          } catch (idError) {
            console.warn('[AUTH] Could not assign driver_id:', idError);
          }
        }
        
        // Note: The fetchDriverData function already looks up by email first,
        // so login will find this driver record correctly
        return { error: null };
      }
      
      // No existing driver - create new one with auth user ID as primary key
      const driverId = await generateDriverId();
      console.log('[AUTH] Creating NEW driver record for auth user:', data.user.id, 'driver_id:', driverId);
      
      const { error: driverError } = await supabase
        .from('drivers')
        .insert({
          id: data.user.id,
          driver_id: driverId,
          email: normalizedEmail,
          full_name: '',
          phone: '',
          postcode: '',
          vehicle_type: vehicleType || 'car',
          status: 'pending_verification',
          created_at: new Date().toISOString(),
        });
      
      if (driverError) {
        console.error('Error creating driver record:', driverError);
        // If email already exists (code 23505), the driver record already exists
        if (driverError.code === '23505') {
          // This is actually OK - a driver record exists, login will find it
          console.log('[AUTH] Driver record already exists (unique constraint), will use existing on login');
          return { error: null };
        }
        // For other errors, still allow auth account to exist - driver record can be created during profile setup
      }
    }
    
    return { error: null };
  };

  const signUpCustomer = async (
    email: string, 
    password: string, 
    fullName: string, 
    role: CustomerRole,
    companyDetails?: { companyName: string; companyRegNumber?: string }
  ) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            role: role,
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        return { error: signUpError as Error };
      }

      if (data.user) {
        console.log('Creating customer profile for auth user:', data.user.id);
        
        const profileData: any = {
          auth_user_id: data.user.id,
          email: normalizedEmail,
          full_name: fullName,
          role,
        };

        if (role === 'business' && companyDetails) {
          profileData.company_name = companyDetails.companyName;
          profileData.company_reg_number = companyDetails.companyRegNumber;
        }

        const profile = await customerService.createCustomerProfile(profileData);
        
        if (!profile) {
          console.error('Failed to create customer profile');
          // If profile creation failed, likely due to email conflict
          return { error: new Error('An account with this email already exists. Please contact support to restore your account.') };
        } else {
          setCustomerProfile(profile);
          setUserRole(role === 'business' ? 'business' : 'individual');
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log(`[AUTH] signIn START - email: ${email}, platform: ${Platform.OS}`);
    const startTime = Date.now();
    
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }),
        API_TIMEOUT_MS
      ) as { error: any };
      
      console.log(`[AUTH] signIn completed in ${Date.now() - startTime}ms, success: ${!error}`);
      return { error: error as Error | null };
    } catch (timeoutError) {
      console.error('[AUTH] signIn timed out');
      return { error: new Error('Login timed out. Please try again.') };
    }
  };

  const signOut = async () => {
    // Clean up notifications before signing out
    if (driver?.id) {
      await notificationService.removeTokenFromDatabase(driver.id);
    }
    notificationService.removeListeners();
    
    // Clear cached role data
    await cacheUserRole(null);
    
    await supabase.auth.signOut();
    setDriver(null);
    setCustomerProfile(null);
    setUserRole(null);
  };

  const resetPassword = async (email: string) => {
    let redirectUrl: string;
    
    if (Platform.OS === 'web') {
      redirectUrl = `${window.location.origin}/reset-password`;
    } else {
      redirectUrl = 'runcourier://reset-password';
    }
    
    console.log('Reset password redirect URL:', redirectUrl);
    
    const isMockClient = (supabase as any)._isMock === true;
    console.log('Supabase client type:', isMockClient ? 'MOCK (emails will NOT send!)' : 'REAL');
    
    if (isMockClient) {
      console.error('[AUTH] WARNING: Using mock Supabase client - password reset email will NOT be sent!');
      return { error: new Error('App configuration error. Please contact support.') };
    }
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    
    console.log('Reset password result:', error ? `Error: ${error.message}` : 'Success - email should be sent');
    return { error: error as Error | null };
  };

  const updateDriver = async (updates: Partial<Driver>) => {
    if (!user) return { error: new Error('Not authenticated') };

    const driverId = driver?.id;
    
    if (!driverId) {
      console.error('No driver ID available for update');
      return { error: new Error('Driver profile not found') };
    }
    
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };
    
    const columnMapping: Record<string, string> = {
      'name': 'full_name',
      'national_insurance': 'ni_number',
      'vehicle_registration': 'vehicle_reg',
      'registration_number': 'vehicle_reg',
      'current_latitude': 'latitude',
      'current_longitude': 'longitude',
    };
    
    const validColumns = [
      'full_name', 'phone', 'postcode', 'address', 'nationality',
      'ni_number', 'vehicle_type', 'vehicle_reg',
      'vehicle_make', 'vehicle_model', 'vehicle_color',
      'profile_picture_url', 'profile_picture',
      'latitude', 'longitude',
      'bank_name', 'account_name', 'sort_code', 'account_number',
      'bank_account_name', 'bank_sort_code', 'bank_account_number',
      'sound_enabled', 'online_status'
    ];
    
    Object.keys(updates).forEach(key => {
      const value = (updates as any)[key];
      if (value !== undefined && key !== 'id') {
        const dbColumn = columnMapping[key] || key;
        if (validColumns.includes(dbColumn)) {
          updateData[dbColumn] = value;
        } else if (validColumns.includes(key)) {
          updateData[key] = value;
        }
      }
    });
    
    console.log('Updating driver:', driverId, 'with data:', updateData);
    
    const { error, data } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', driverId)
      .select();

    if (error) {
      console.error('Driver update error:', error);
    } else if (!data || data.length === 0) {
      console.error('Driver update: No rows matched. Driver ID:', driverId);
      setDriver(prev => prev ? { ...prev, ...updates } : null);
    } else {
      console.log('Driver update success:', data);
      if (data[0]) {
        setDriver({
          ...data[0],
          full_name: data[0].full_name || data[0].name,
          national_insurance: data[0].national_insurance || data[0].ni_number,
          vehicle_registration: data[0].vehicle_registration || data[0].vehicle_reg,
        });
      }
    }

    return { error: error as Error | null };
  };

  const updateCustomerProfile = async (updates: Partial<CustomerProfile>) => {
    if (!user) return { error: new Error('Not authenticated') };
    if (!customerProfile) return { error: new Error('Customer profile not found') };

    try {
      const updatedProfile = await customerService.updateCustomerProfile(customerProfile.id, updates);
      
      if (updatedProfile) {
        setCustomerProfile(updatedProfile);
        return { error: null };
      }
      
      return { error: new Error('Failed to update customer profile') };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const deleteCustomerAccount = async () => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const success = await customerService.deleteCustomerAccount(user.id);
      
      if (success) {
        await signOut();
        return { error: null };
      }
      
      return { error: new Error('Failed to delete account') };
    } catch (error) {
      return { error: error as Error };
    }
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      driver,
      customerProfile,
      userRole,
      loading,
      isPasswordRecovery,
      setPasswordRecoveryMode,
      clearPasswordRecovery,
      signUp,
      signUpCustomer,
      signIn,
      signOut,
      resetPassword,
      updateDriver,
      updateCustomerProfile,
      refreshDriver,
      refreshCustomerProfile,
      deleteCustomerAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
