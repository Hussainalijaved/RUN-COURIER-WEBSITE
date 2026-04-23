import { supabase, handleSupabaseError } from './base';
import type { Driver } from './base';
import type { VehicleType } from '@shared/schema';
import { supabaseFunctions, type CreateDriverData } from '../supabaseFunctions';

export interface DriverFilters {
  isAvailable?: boolean;
  isVerified?: boolean;
  vehicleType?: VehicleType;
  isActive?: boolean;
  limit?: number;
}

export async function listDrivers(filters: DriverFilters = {}): Promise<Driver[]> {
  let query = supabase
    .from('drivers')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.isAvailable !== undefined) {
    query = query.eq('online_status', filters.isAvailable ? 'online' : 'offline');
  }
  if (filters.isVerified !== undefined) {
    query = query.eq('is_verified', filters.isVerified);
  }
  if (filters.vehicleType) {
    query = query.eq('vehicle_type', filters.vehicleType);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  } else {
    query = query.eq('is_active', true);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  
  if (error) throw handleSupabaseError(error);
  return (data || []).map(mapDriverFromDb);
}

export async function getDriverById(id: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

export async function getDriverByUserId(userId: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

export async function getDriverByCode(driverCode: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('driver_code', driverCode)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

export async function updateDriver(id: string, updates: Partial<Driver>): Promise<Driver | null> {
  const dbUpdates: Record<string, unknown> = {};
  
  if (updates.isAvailable !== undefined) dbUpdates.online_status = updates.isAvailable ? 'online' : 'offline';
  if (updates.isVerified !== undefined) dbUpdates.is_verified = updates.isVerified;
  if (updates.currentLatitude !== undefined) dbUpdates.current_latitude = updates.currentLatitude;
  if (updates.currentLongitude !== undefined) dbUpdates.current_longitude = updates.currentLongitude;
  if (updates.lastLocationUpdate !== undefined) dbUpdates.last_location_update = updates.lastLocationUpdate;
  if (updates.profilePictureUrl !== undefined) dbUpdates.profile_picture_url = updates.profilePictureUrl;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.postcode !== undefined) dbUpdates.postcode = updates.postcode;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.vehicleType !== undefined) dbUpdates.vehicle_type = updates.vehicleType;
  if (updates.vehicleRegistration !== undefined) dbUpdates.vehicle_registration = updates.vehicleRegistration;
  if (updates.vehicleMake !== undefined) dbUpdates.vehicle_make = updates.vehicleMake;
  if (updates.vehicleModel !== undefined) dbUpdates.vehicle_model = updates.vehicleModel;
  if (updates.vehicleColor !== undefined) dbUpdates.vehicle_color = updates.vehicleColor;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.deactivatedAt !== undefined) dbUpdates.deactivated_at = updates.deactivatedAt;
  if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
  if (updates.totalJobs !== undefined) dbUpdates.total_jobs = updates.totalJobs;

  const { data, error } = await supabase
    .from('drivers')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

export async function updateDriverLocation(
  id: string,
  latitude: number,
  longitude: number
): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .update({
      current_latitude: latitude.toString(),
      current_longitude: longitude.toString(),
      last_location_update: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

export async function updateDriverAvailability(
  id: string,
  isAvailable: boolean
): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .update({ online_status: isAvailable ? 'online' : 'offline' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

export async function deactivateDriver(id: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      online_status: 'offline',
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

export async function reactivateDriver(id: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .update({
      is_active: true,
      deactivated_at: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapDriverFromDb(data) : null;
}

function mapDriverFromDb(row: Record<string, unknown>): Driver {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    driverCode: row.driver_code as string | null,
    fullName: row.full_name as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    postcode: row.postcode as string | null,
    address: row.address as string | null,
    nationality: row.nationality as string | null,
    isBritish: row.is_british as boolean,
    nationalInsuranceNumber: row.national_insurance_number as string | null,
    rightToWorkShareCode: row.right_to_work_share_code as string | null,
    dbsChecked: row.dbs_checked as boolean,
    dbsCertificateUrl: row.dbs_certificate_url as string | null,
    dbsCheckDate: row.dbs_check_date as string | null,
    vehicleType: row.vehicle_type as VehicleType,
    vehicleRegistration: row.vehicle_registration as string | null,
    vehicleMake: row.vehicle_make as string | null,
    vehicleModel: row.vehicle_model as string | null,
    vehicleColor: row.vehicle_color as string | null,
    isAvailable: (row.online_status === 'online' || row.is_available === true),
    isVerified: row.is_verified as boolean,
    currentLatitude: row.current_latitude as string | null,
    currentLongitude: row.current_longitude as string | null,
    lastLocationUpdate: row.last_location_update as string | null,
    rating: row.rating as string,
    totalJobs: row.total_jobs as number,
    profilePictureUrl: row.profile_picture_url as string | null,
    isActive: row.is_active as boolean,
    deactivatedAt: row.deactivated_at as string | null,
    createdAt: row.created_at as string,
  };
}

export function subscribeToDrivers(callback: (payload: { eventType: string; new: Driver | null; old: Driver | null }) => void) {
  return supabase
    .channel('drivers-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'drivers' },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new ? mapDriverFromDb(payload.new as Record<string, unknown>) : null,
          old: payload.old ? mapDriverFromDb(payload.old as Record<string, unknown>) : null,
        });
      }
    )
    .subscribe();
}

export async function createDriver(data: CreateDriverData): Promise<Driver> {
  const response = await supabaseFunctions.createDriver(data);
  return {
    id: response.id,
    userId: response.user_id,
    driverCode: response.driver_id,
    fullName: response.full_name,
    email: response.email,
    phone: response.phone,
    postcode: null,
    address: null,
    nationality: null,
    isBritish: false,
    nationalInsuranceNumber: null,
    rightToWorkShareCode: null,
    dbsChecked: false,
    dbsCertificateUrl: null,
    dbsCheckDate: null,
    vehicleType: 'car' as VehicleType,
    vehicleRegistration: null,
    vehicleMake: null,
    vehicleModel: null,
    vehicleColor: null,
    isAvailable: response.is_available,
    isVerified: response.is_verified,
    currentLatitude: null,
    currentLongitude: null,
    lastLocationUpdate: null,
    rating: '5.0',
    totalJobs: 0,
    profilePictureUrl: null,
    isActive: response.is_active,
    deactivatedAt: null,
    createdAt: new Date().toISOString(),
  };
}
