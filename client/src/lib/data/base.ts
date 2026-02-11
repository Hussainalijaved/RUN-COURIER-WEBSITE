import { supabase } from '../supabase';
import type { 
  JobStatus, 
  VehicleType, 
  UserRole,
  DocumentStatus,
  DriverApplicationStatus 
} from '@shared/schema';

export { supabase };

export type Job = {
  id: string;
  trackingNumber: string;
  customerId: string;
  driverId: string | null;
  dispatcherId: string | null;
  vendorId: string | null;
  status: JobStatus;
  vehicleType: VehicleType;
  pickupAddress: string;
  pickupPostcode: string;
  pickupLatitude: string | null;
  pickupLongitude: string | null;
  pickupInstructions: string | null;
  pickupBuildingName: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryLatitude: string | null;
  deliveryLongitude: string | null;
  deliveryInstructions: string | null;
  deliveryBuildingName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  weight: string;
  distance: string | null;
  isMultiDrop: boolean;
  isReturnTrip: boolean;
  returnToSameLocation: boolean;
  returnAddress: string | null;
  returnPostcode: string | null;
  isScheduled: boolean;
  scheduledPickupTime: string | null;
  scheduledDeliveryTime: string | null;
  isCentralLondon: boolean;
  isRushHour: boolean;
  basePrice: string;
  distancePrice: string;
  weightSurcharge: string;
  multiDropCharge: string;
  returnTripCharge: string;
  centralLondonCharge: string;
  waitingTimeCharge: string;
  totalPrice: string;
  driverPrice: string | null;
  paymentStatus: string;
  paymentIntentId: string | null;
  podPhotoUrl: string | null;
  podSignatureUrl: string | null;
  podRecipientName: string | null;
  deliveredAt: string | null;
  rejectionReason: string | null;
  estimatedPickupTime: string | null;
  estimatedDeliveryTime: string | null;
  actualPickupTime: string | null;
  actualDeliveryTime: string | null;
  driverHidden: boolean;
  driverHiddenAt: string | null;
  driverHiddenBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * SECURITY: Driver-safe job type that excludes customer pricing fields.
 * Drivers should ONLY see their admin-set driver_price, never total_price or pricing breakdown.
 * This type is intentionally minimal to prevent accidental price leakage.
 */
export type DriverJob = {
  id: string;
  trackingNumber: string;
  customerId: string;
  driverId: string | null;
  dispatcherId: string | null;
  vendorId: string | null;
  status: JobStatus;
  vehicleType: VehicleType;
  pickupAddress: string;
  pickupPostcode: string;
  pickupLatitude: string | null;
  pickupLongitude: string | null;
  pickupInstructions: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryLatitude: string | null;
  deliveryLongitude: string | null;
  deliveryInstructions: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  parcelDescription?: string | null;
  parcelWeight?: string | null;
  parcelDimensions?: string | null;
  weight: string | null;
  distance: string | null;
  distanceMiles?: string | null;
  isMultiDrop: boolean;
  isReturnTrip: boolean;
  isUrgent?: boolean;
  isFragile?: boolean;
  requiresSignature?: boolean;
  driverPrice: string | null;
  scheduledPickupTime: string | null;
  estimatedDeliveryTime: string | null;
  actualPickupTime: string | null;
  actualDeliveryTime: string | null;
  podSignatureUrl: string | null;
  podPhotoUrl: string | null;
  podNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Driver = {
  id: string;
  userId: string;
  driverCode: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  address: string | null;
  nationality: string | null;
  isBritish: boolean;
  nationalInsuranceNumber: string | null;
  rightToWorkShareCode: string | null;
  dbsChecked: boolean;
  dbsCertificateUrl: string | null;
  dbsCheckDate: string | null;
  vehicleType: VehicleType;
  vehicleRegistration: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  isAvailable: boolean;
  isVerified: boolean;
  currentLatitude: string | null;
  currentLongitude: string | null;
  lastLocationUpdate: string | null;
  rating: string;
  totalJobs: number;
  profilePictureUrl: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  password: string | null;
  fullName: string;
  phone: string | null;
  postcode: string | null;
  address: string | null;
  buildingName: string | null;
  role: UserRole;
  userType: 'individual' | 'business';
  companyName: string | null;
  registrationNumber: string | null;
  businessAddress: string | null;
  vatNumber: string | null;
  stripeCustomerId: string | null;
  payLaterEnabled: boolean;
  completedBookingsCount: number;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  data: Record<string, unknown> | null;
  createdAt: string;
};

export type DriverApplication = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  postcode: string;
  address: string | null;
  vehicleType: VehicleType;
  vehicleRegistration: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  nationality: string | null;
  isBritish: boolean;
  nationalInsuranceNumber: string | null;
  rightToWorkShareCode: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSortCode: string | null;
  status: DriverApplicationStatus;
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type JobAssignment = {
  id: string;
  jobId: string;
  driverId: string;
  assignedBy: string;
  driverPrice: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

export function handleSupabaseError(error: unknown): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String((error as { message: string }).message));
  }
  return new Error('An unknown error occurred');
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  
  const metadata = session.user.user_metadata;
  let role = metadata?.role || 'customer';
  
  if (role === 'business' || role === 'individual') {
    role = 'customer';
  }
  
  return role as UserRole;
}
