import { supabase, handleSupabaseError } from './base';
import type { DriverApplication } from './base';
import type { VehicleType, DriverApplicationStatus } from '@shared/schema';

export async function listDriverApplications(status?: DriverApplicationStatus): Promise<DriverApplication[]> {
  let query = supabase
    .from('driver_applications')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  
  if (error) throw handleSupabaseError(error);
  return (data || []).map(mapApplicationFromDb);
}

export async function getApplicationById(id: string): Promise<DriverApplication | null> {
  const { data, error } = await supabase
    .from('driver_applications')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapApplicationFromDb(data) : null;
}

export async function createDriverApplication(applicationData: {
  email: string;
  fullName: string;
  phone: string;
  postcode: string;
  address?: string;
  vehicleType: VehicleType;
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  nationality?: string;
  isBritish?: boolean;
  nationalInsuranceNumber?: string;
  rightToWorkShareCode?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankSortCode?: string;
}): Promise<DriverApplication> {
  const dbData = {
    id: crypto.randomUUID(),
    email: applicationData.email.toLowerCase(),
    full_name: applicationData.fullName,
    phone: applicationData.phone,
    postcode: applicationData.postcode,
    address: applicationData.address || null,
    vehicle_type: applicationData.vehicleType,
    vehicle_registration: applicationData.vehicleRegistration || null,
    vehicle_make: applicationData.vehicleMake || null,
    vehicle_model: applicationData.vehicleModel || null,
    vehicle_color: applicationData.vehicleColor || null,
    nationality: applicationData.nationality || null,
    is_british: applicationData.isBritish ?? true,
    national_insurance_number: applicationData.nationalInsuranceNumber || null,
    right_to_work_share_code: applicationData.rightToWorkShareCode || null,
    bank_name: applicationData.bankName || null,
    bank_account_name: applicationData.bankAccountName || null,
    bank_account_number: applicationData.bankAccountNumber || null,
    bank_sort_code: applicationData.bankSortCode || null,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('driver_applications')
    .insert(dbData)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return mapApplicationFromDb(data);
}

export async function updateApplicationStatus(
  id: string,
  status: DriverApplicationStatus,
  reviewedBy: string,
  reviewNotes?: string
): Promise<DriverApplication | null> {
  const { data, error } = await supabase
    .from('driver_applications')
    .update({
      status,
      reviewed_by: reviewedBy,
      review_notes: reviewNotes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapApplicationFromDb(data) : null;
}

function mapApplicationFromDb(row: Record<string, unknown>): DriverApplication {
  return {
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string,
    phone: row.phone as string,
    postcode: row.postcode as string,
    address: row.address as string | null,
    vehicleType: row.vehicle_type as VehicleType,
    vehicleRegistration: row.vehicle_registration as string | null,
    vehicleMake: row.vehicle_make as string | null,
    vehicleModel: row.vehicle_model as string | null,
    vehicleColor: row.vehicle_color as string | null,
    nationality: row.nationality as string | null,
    isBritish: row.is_british as boolean,
    nationalInsuranceNumber: row.national_insurance_number as string | null,
    rightToWorkShareCode: row.right_to_work_share_code as string | null,
    bankName: row.bank_name as string | null,
    bankAccountName: row.bank_account_name as string | null,
    bankAccountNumber: row.bank_account_number as string | null,
    bankSortCode: row.bank_sort_code as string | null,
    status: row.status as DriverApplicationStatus,
    reviewedBy: row.reviewed_by as string | null,
    reviewNotes: row.review_notes as string | null,
    createdAt: row.created_at as string,
    reviewedAt: row.reviewed_at as string | null,
  };
}

export function subscribeToApplications(callback: (payload: { eventType: string; new: DriverApplication | null }) => void) {
  return supabase
    .channel('driver-applications-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'driver_applications' },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new ? mapApplicationFromDb(payload.new as Record<string, unknown>) : null,
        });
      }
    )
    .subscribe();
}
