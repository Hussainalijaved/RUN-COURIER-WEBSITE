import { supabase, handleSupabaseError } from './base';
import type { User } from './base';
import type { UserRole } from '@shared/schema';

export interface UserFilters {
  role?: UserRole;
  isActive?: boolean;
  limit?: number;
}

export async function listUsers(filters: UserFilters = {}): Promise<User[]> {
  let query = supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.role) {
    query = query.eq('role', filters.role);
  }
  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  
  if (error) throw handleSupabaseError(error);
  return (data || []).map(mapUserFromDb);
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapUserFromDb(data) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapUserFromDb(data) : null;
}

export async function createUser(userData: Partial<User>): Promise<User> {
  const dbData = {
    id: userData.id || crypto.randomUUID(),
    email: userData.email?.toLowerCase(),
    full_name: userData.fullName,
    phone: userData.phone || null,
    postcode: userData.postcode || null,
    address: userData.address || null,
    building_name: userData.buildingName || null,
    role: userData.role || 'customer',
    user_type: userData.userType || 'individual',
    company_name: userData.companyName || null,
    registration_number: userData.registrationNumber || null,
    business_address: userData.businessAddress || null,
    vat_number: userData.vatNumber || null,
    stripe_customer_id: userData.stripeCustomerId || null,
    pay_later_enabled: userData.payLaterEnabled || false,
    completed_bookings_count: userData.completedBookingsCount || 0,
    is_active: userData.isActive ?? true,
  };

  const { data, error } = await supabase
    .from('users')
    .insert(dbData)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return mapUserFromDb(data);
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  const dbUpdates: Record<string, unknown> = {};
  
  if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.postcode !== undefined) dbUpdates.postcode = updates.postcode;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.buildingName !== undefined) dbUpdates.building_name = updates.buildingName;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.userType !== undefined) dbUpdates.user_type = updates.userType;
  if (updates.companyName !== undefined) dbUpdates.company_name = updates.companyName;
  if (updates.registrationNumber !== undefined) dbUpdates.registration_number = updates.registrationNumber;
  if (updates.businessAddress !== undefined) dbUpdates.business_address = updates.businessAddress;
  if (updates.vatNumber !== undefined) dbUpdates.vat_number = updates.vatNumber;
  if (updates.stripeCustomerId !== undefined) dbUpdates.stripe_customer_id = updates.stripeCustomerId;
  if (updates.payLaterEnabled !== undefined) dbUpdates.pay_later_enabled = updates.payLaterEnabled;
  if (updates.completedBookingsCount !== undefined) dbUpdates.completed_bookings_count = updates.completedBookingsCount;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.deactivatedAt !== undefined) dbUpdates.deactivated_at = updates.deactivatedAt;

  const { data, error } = await supabase
    .from('users')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapUserFromDb(data) : null;
}

export async function deactivateUser(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapUserFromDb(data) : null;
}

export async function reactivateUser(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
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
  
  return data ? mapUserFromDb(data) : null;
}

function mapUserFromDb(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    password: row.password as string | null,
    fullName: row.full_name as string,
    phone: row.phone as string | null,
    postcode: row.postcode as string | null,
    address: row.address as string | null,
    buildingName: row.building_name as string | null,
    role: row.role as UserRole,
    userType: (row.user_type as 'individual' | 'business') || 'individual',
    companyName: row.company_name as string | null,
    registrationNumber: row.registration_number as string | null,
    businessAddress: row.business_address as string | null,
    vatNumber: row.vat_number as string | null,
    stripeCustomerId: row.stripe_customer_id as string | null,
    payLaterEnabled: row.pay_later_enabled as boolean,
    completedBookingsCount: row.completed_bookings_count as number,
    isActive: row.is_active as boolean,
    deactivatedAt: row.deactivated_at as string | null,
    createdAt: row.created_at as string,
  };
}

export function subscribeToUsers(callback: (payload: { eventType: string; new: User | null; old: User | null }) => void) {
  return supabase
    .channel('users-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new ? mapUserFromDb(payload.new as Record<string, unknown>) : null,
          old: payload.old ? mapUserFromDb(payload.old as Record<string, unknown>) : null,
        });
      }
    )
    .subscribe();
}
