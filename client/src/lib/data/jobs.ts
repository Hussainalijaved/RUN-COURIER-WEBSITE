import { supabase, handleSupabaseError, getCurrentUserId, getCurrentUserRole } from './base';
import type { Job, JobAssignment } from './base';
import type { JobStatus, VehicleType } from '@shared/schema';

export interface JobFilters {
  status?: JobStatus;
  customerId?: string;
  driverId?: string;
  vendorId?: string;
  limit?: number;
}

export async function listJobs(filters: JobFilters = {}): Promise<Job[]> {
  let query = supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  if (filters.driverId) {
    query = query.eq('driver_id', filters.driverId);
  }
  if (filters.vendorId) {
    query = query.eq('vendor_id', filters.vendorId);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  
  if (error) throw handleSupabaseError(error);
  return (data || []).map(mapJobFromDb);
}

export async function getJobById(id: string): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapJobFromDb(data) : null;
}

export async function getJobByTrackingNumber(trackingNumber: string): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('tracking_number', trackingNumber.toUpperCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapJobFromDb(data) : null;
}

export async function createJob(jobData: Partial<Job>): Promise<Job> {
  const trackingNumber = await generateTrackingNumber();
  
  const dbData = {
    id: crypto.randomUUID(),
    tracking_number: trackingNumber,
    customer_id: jobData.customerId,
    driver_id: jobData.driverId || null,
    dispatcher_id: jobData.dispatcherId || null,
    vendor_id: jobData.vendorId || null,
    status: jobData.status || 'pending',
    vehicle_type: jobData.vehicleType,
    pickup_address: jobData.pickupAddress,
    pickup_postcode: jobData.pickupPostcode,
    pickup_latitude: jobData.pickupLatitude || null,
    pickup_longitude: jobData.pickupLongitude || null,
    pickup_instructions: jobData.pickupInstructions || null,
    pickup_building_name: jobData.pickupBuildingName || null,
    pickup_contact_name: jobData.pickupContactName || null,
    pickup_contact_phone: jobData.pickupContactPhone || null,
    delivery_address: jobData.deliveryAddress,
    delivery_postcode: jobData.deliveryPostcode,
    delivery_latitude: jobData.deliveryLatitude || null,
    delivery_longitude: jobData.deliveryLongitude || null,
    delivery_instructions: jobData.deliveryInstructions || null,
    delivery_building_name: jobData.deliveryBuildingName || null,
    recipient_name: jobData.recipientName || null,
    recipient_phone: jobData.recipientPhone || null,
    weight: jobData.weight,
    distance: jobData.distance || null,
    is_multi_drop: jobData.isMultiDrop || false,
    is_return_trip: jobData.isReturnTrip || false,
    return_to_same_location: jobData.returnToSameLocation ?? true,
    return_address: jobData.returnAddress || null,
    return_postcode: jobData.returnPostcode || null,
    is_scheduled: jobData.isScheduled || false,
    scheduled_pickup_time: jobData.scheduledPickupTime || null,
    scheduled_delivery_time: jobData.scheduledDeliveryTime || null,
    is_central_london: jobData.isCentralLondon || false,
    is_rush_hour: jobData.isRushHour || false,
    base_price: jobData.basePrice,
    distance_price: jobData.distancePrice,
    weight_surcharge: jobData.weightSurcharge || '0',
    multi_drop_charge: jobData.multiDropCharge || '0',
    return_trip_charge: jobData.returnTripCharge || '0',
    central_london_charge: jobData.centralLondonCharge || '0',
    waiting_time_charge: jobData.waitingTimeCharge || '0',
    total_price: jobData.totalPrice,
    driver_price: jobData.driverPrice || null,
    payment_status: jobData.paymentStatus || 'pending',
    payment_intent_id: jobData.paymentIntentId || null,
  };

  const { data, error } = await supabase
    .from('jobs')
    .insert(dbData)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return mapJobFromDb(data);
}

export async function updateJob(id: string, updates: Partial<Job>): Promise<Job | null> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.driverId !== undefined) dbUpdates.driver_id = updates.driverId;
  if (updates.driverPrice !== undefined) dbUpdates.driver_price = updates.driverPrice;
  if (updates.paymentStatus !== undefined) dbUpdates.payment_status = updates.paymentStatus;
  if (updates.podPhotoUrl !== undefined) dbUpdates.pod_photo_url = updates.podPhotoUrl;
  if (updates.podSignatureUrl !== undefined) dbUpdates.pod_signature_url = updates.podSignatureUrl;
  if (updates.podRecipientName !== undefined) dbUpdates.pod_recipient_name = updates.podRecipientName;
  if (updates.deliveredAt !== undefined) dbUpdates.delivered_at = updates.deliveredAt;
  if (updates.rejectionReason !== undefined) dbUpdates.rejection_reason = updates.rejectionReason;
  if (updates.actualPickupTime !== undefined) dbUpdates.actual_pickup_time = updates.actualPickupTime;
  if (updates.actualDeliveryTime !== undefined) dbUpdates.actual_delivery_time = updates.actualDeliveryTime;
  if (updates.driverHidden !== undefined) dbUpdates.driver_hidden = updates.driverHidden;
  if (updates.driverHiddenAt !== undefined) dbUpdates.driver_hidden_at = updates.driverHiddenAt;
  if (updates.driverHiddenBy !== undefined) dbUpdates.driver_hidden_by = updates.driverHiddenBy;

  const { data, error } = await supabase
    .from('jobs')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapJobFromDb(data) : null;
}

export async function updateJobStatus(
  id: string, 
  status: JobStatus, 
  rejectionReason?: string
): Promise<Job | null> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (rejectionReason) {
    updates.rejection_reason = rejectionReason;
  }

  if (status === 'delivered') {
    updates.delivered_at = new Date().toISOString();
    updates.actual_delivery_time = new Date().toISOString();
  }

  if (status === 'collected') {
    updates.actual_pickup_time = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapJobFromDb(data) : null;
}

export async function assignJobToDriver(
  jobId: string,
  driverId: string,
  driverPrice?: string
): Promise<Job | null> {
  const updates: Record<string, unknown> = {
    driver_id: driverId,
    status: 'assigned',
    updated_at: new Date().toISOString(),
  };

  if (driverPrice) {
    updates.driver_price = driverPrice;
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapJobFromDb(data) : null;
}

export async function getJobAssignmentsForDriver(driverId: string): Promise<JobAssignment[]> {
  const { data, error } = await supabase
    .from('job_assignments')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data || []).map(mapJobAssignmentFromDb);
}

export async function acceptJobAssignment(assignmentId: string): Promise<JobAssignment | null> {
  const { data, error } = await supabase
    .from('job_assignments')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', assignmentId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapJobAssignmentFromDb(data) : null;
}

export async function rejectJobAssignment(
  assignmentId: string, 
  reason?: string
): Promise<JobAssignment | null> {
  const { data, error } = await supabase
    .from('job_assignments')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: reason || null,
    })
    .eq('id', assignmentId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapJobAssignmentFromDb(data) : null;
}

async function generateTrackingNumber(): Promise<string> {
  const prefix = 'RC';
  const year = new Date().getFullYear();
  
  const { data, error } = await supabase
    .from('jobs')
    .select('tracking_number')
    .like('tracking_number', `RC${year}%`)
    .order('tracking_number', { ascending: false })
    .limit(1);

  let sequence = 1;
  if (!error && data && data.length > 0) {
    const match = data[0].tracking_number.match(/RC\d{4}(\d{3})/);
    if (match) {
      sequence = parseInt(match[1], 10) + 1;
    }
  }

  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomSuffix = Array.from({ length: 3 }, () =>
    letters.charAt(Math.floor(Math.random() * letters.length))
  ).join('');

  const sequenceStr = sequence.toString().padStart(3, '0');
  return `${prefix}${year}${sequenceStr}${randomSuffix}`;
}

function mapJobFromDb(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    trackingNumber: row.tracking_number as string,
    customerId: row.customer_id as string,
    driverId: row.driver_id as string | null,
    dispatcherId: row.dispatcher_id as string | null,
    vendorId: row.vendor_id as string | null,
    status: row.status as JobStatus,
    vehicleType: row.vehicle_type as VehicleType,
    pickupAddress: row.pickup_address as string,
    pickupPostcode: row.pickup_postcode as string,
    pickupLatitude: row.pickup_latitude as string | null,
    pickupLongitude: row.pickup_longitude as string | null,
    pickupInstructions: row.pickup_instructions as string | null,
    pickupBuildingName: row.pickup_building_name as string | null,
    pickupContactName: row.pickup_contact_name as string | null,
    pickupContactPhone: row.pickup_contact_phone as string | null,
    deliveryAddress: row.delivery_address as string,
    deliveryPostcode: row.delivery_postcode as string,
    deliveryLatitude: row.delivery_latitude as string | null,
    deliveryLongitude: row.delivery_longitude as string | null,
    deliveryInstructions: row.delivery_instructions as string | null,
    deliveryBuildingName: row.delivery_building_name as string | null,
    recipientName: row.recipient_name as string | null,
    recipientPhone: row.recipient_phone as string | null,
    weight: row.weight as string,
    distance: row.distance as string | null,
    isMultiDrop: row.is_multi_drop as boolean,
    isReturnTrip: row.is_return_trip as boolean,
    returnToSameLocation: row.return_to_same_location as boolean,
    returnAddress: row.return_address as string | null,
    returnPostcode: row.return_postcode as string | null,
    isScheduled: row.is_scheduled as boolean,
    scheduledPickupTime: row.scheduled_pickup_time as string | null,
    scheduledDeliveryTime: row.scheduled_delivery_time as string | null,
    isCentralLondon: row.is_central_london as boolean,
    isRushHour: row.is_rush_hour as boolean,
    basePrice: row.base_price as string,
    distancePrice: row.distance_price as string,
    weightSurcharge: row.weight_surcharge as string,
    multiDropCharge: row.multi_drop_charge as string,
    returnTripCharge: row.return_trip_charge as string,
    centralLondonCharge: row.central_london_charge as string,
    waitingTimeCharge: row.waiting_time_charge as string,
    totalPrice: row.total_price as string,
    driverPrice: row.driver_price as string | null,
    paymentStatus: row.payment_status as string,
    paymentIntentId: row.payment_intent_id as string | null,
    podPhotoUrl: row.pod_photo_url as string | null,
    podSignatureUrl: row.pod_signature_url as string | null,
    podRecipientName: row.pod_recipient_name as string | null,
    deliveredAt: row.delivered_at as string | null,
    rejectionReason: row.rejection_reason as string | null,
    estimatedPickupTime: row.estimated_pickup_time as string | null,
    estimatedDeliveryTime: row.estimated_delivery_time as string | null,
    actualPickupTime: row.actual_pickup_time as string | null,
    actualDeliveryTime: row.actual_delivery_time as string | null,
    driverHidden: row.driver_hidden as boolean,
    driverHiddenAt: row.driver_hidden_at as string | null,
    driverHiddenBy: row.driver_hidden_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapJobAssignmentFromDb(row: Record<string, unknown>): JobAssignment {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    driverId: row.driver_id as string,
    assignedBy: row.assigned_by as string,
    driverPrice: row.driver_price as string,
    status: row.status as string,
    expiresAt: row.expires_at as string,
    acceptedAt: row.accepted_at as string | null,
    rejectedAt: row.rejected_at as string | null,
    rejectionReason: row.rejection_reason as string | null,
    createdAt: row.created_at as string,
  };
}

export function subscribeToJobs(callback: (payload: { eventType: string; new: Job | null; old: Job | null }) => void) {
  return supabase
    .channel('jobs-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jobs' },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new ? mapJobFromDb(payload.new as Record<string, unknown>) : null,
          old: payload.old ? mapJobFromDb(payload.old as Record<string, unknown>) : null,
        });
      }
    )
    .subscribe();
}
