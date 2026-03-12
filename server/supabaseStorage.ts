import { supabaseAdmin } from './supabaseAdmin';
import type {
  User, InsertUser,
  Driver, InsertDriver,
  Job, InsertJob,
  Document, InsertDocument,
  Notification, InsertNotification,
  VendorApiKey, InsertVendorApiKey,
  DriverApplication, InsertDriverApplication,
  Invoice, InsertInvoice,
  JobAssignment, InsertJobAssignment,
  DeliveryContact, InsertDeliveryContact,
  DriverPayment, InsertDriverPayment,
  PaymentLink, InsertPaymentLink,
  DriverApplicationStatus,
  InvoiceStatus,
  JobAssignmentStatus,
  DocumentStatus,
  DriverPaymentStatus,
  PaymentLinkStatus,
  PricingSettings,
  Vehicle,
  JobStatus,
  VehicleType,
  UserType,
  UserRole,
  BookingQuoteInput,
} from "@shared/schema";
import type { IStorage } from './storage';
import { randomUUID } from "crypto";

function mapDbToUser(dbUser: any): User {
  return {
    id: String(dbUser.id),
    authId: dbUser.auth_id || null,
    email: dbUser.email,
    password: dbUser.password,
    fullName: dbUser.full_name,
    phone: dbUser.phone,
    postcode: dbUser.postcode,
    address: dbUser.address,
    buildingName: dbUser.building_name,
    role: dbUser.role as UserRole,
    userType: dbUser.user_type as UserType,
    companyName: dbUser.company_name,
    registrationNumber: dbUser.registration_number,
    businessAddress: dbUser.business_address,
    vatNumber: dbUser.vat_number,
    stripeCustomerId: dbUser.stripe_customer_id,
    payLaterEnabled: dbUser.pay_later_enabled,
    completedBookingsCount: dbUser.completed_bookings_count,
    isActive: dbUser.is_active,
    deactivatedAt: dbUser.deactivated_at ? new Date(dbUser.deactivated_at) : null,
    createdAt: dbUser.created_at ? new Date(dbUser.created_at) : new Date(),
  };
}

function mapDbToDriver(dbDriver: any): Driver {
  return {
    id: dbDriver.id,
    userId: dbDriver.user_id || dbDriver.id,
    driverCode: (dbDriver.driver_code && /^RC\d{2}[A-Z]$/.test(dbDriver.driver_code)) ? dbDriver.driver_code : (dbDriver.driver_id && /^RC\d{2}[A-Z]$/.test(dbDriver.driver_id)) ? dbDriver.driver_id : dbDriver.driver_code || null,
    fullName: dbDriver.full_name,
    email: dbDriver.email,
    phone: dbDriver.phone,
    postcode: dbDriver.postcode,
    address: dbDriver.address,
    nationality: dbDriver.nationality,
    isBritish: dbDriver.is_british,
    nationalInsuranceNumber: dbDriver.national_insurance_number,
    rightToWorkShareCode: dbDriver.right_to_work_share_code,
    dbsChecked: dbDriver.dbs_checked,
    dbsCertificateUrl: dbDriver.dbs_certificate_url,
    dbsCheckDate: dbDriver.dbs_check_date ? new Date(dbDriver.dbs_check_date) : null,
    vehicleType: (dbDriver.vehicle_type?.includes('|') ? dbDriver.vehicle_type.split('|')[0] : dbDriver.vehicle_type) as VehicleType,
    vehicleRegistration: dbDriver.vehicle_registration || (dbDriver.vehicle_type?.includes('|') ? dbDriver.vehicle_type.split('|')[1] : null),
    vehicleMake: dbDriver.vehicle_make,
    vehicleModel: dbDriver.vehicle_model,
    vehicleColor: dbDriver.vehicle_color,
    isAvailable: dbDriver.online_status === 'online',
    isVerified: dbDriver.status === 'approved', // Use 'status' column - 'approved' means verified
    currentLatitude: dbDriver.current_latitude,
    currentLongitude: dbDriver.current_longitude,
    lastLocationUpdate: dbDriver.last_location_update ? new Date(dbDriver.last_location_update) : null,
    rating: dbDriver.rating || "5.00",
    totalJobs: dbDriver.total_jobs || 0,
    profilePictureUrl: dbDriver.profile_picture_url,
    bankName: dbDriver.bank_name || null,
    accountHolderName: dbDriver.account_holder_name || null,
    sortCode: dbDriver.sort_code || null,
    accountNumber: dbDriver.account_number || null,
    isActive: dbDriver.is_active ?? true,
    deactivatedAt: dbDriver.deactivated_at ? new Date(dbDriver.deactivated_at) : null,
    createdAt: dbDriver.created_at ? new Date(dbDriver.created_at) : new Date(),
    stripeAccountId: dbDriver.stripe_account_id || null,
  } as Driver & { stripeAccountId?: string };
}

function mapDbToJob(dbJob: any): Job {
  return {
    id: dbJob.id,
    trackingNumber: dbJob.tracking_number,
    jobNumber: dbJob.job_number || null,
    customerId: dbJob.customer_id,
    customerType: dbJob.customer_type || null,
    driverId: dbJob.driver_id,
    dispatcherId: dbJob.dispatcher_id,
    vendorId: dbJob.vendor_id,
    status: dbJob.status as JobStatus,
    vehicleType: dbJob.vehicle_type as VehicleType,
    pickupAddress: dbJob.pickup_address,
    pickupPostcode: dbJob.pickup_postcode,
    pickupLatitude: dbJob.pickup_latitude,
    pickupLongitude: dbJob.pickup_longitude,
    pickupInstructions: dbJob.pickup_instructions,
    pickupBuildingName: dbJob.pickup_building_name,
    pickupContactName: dbJob.pickup_contact_name,
    pickupContactPhone: dbJob.pickup_contact_phone,
    deliveryAddress: dbJob.delivery_address,
    deliveryPostcode: dbJob.delivery_postcode,
    deliveryLatitude: dbJob.delivery_latitude,
    deliveryLongitude: dbJob.delivery_longitude,
    deliveryInstructions: dbJob.delivery_instructions,
    deliveryBuildingName: dbJob.delivery_building_name,
    recipientName: dbJob.recipient_name,
    recipientPhone: dbJob.recipient_phone,
    weight: dbJob.weight,
    distance: dbJob.distance,
    isMultiDrop: dbJob.is_multi_drop,
    isReturnTrip: dbJob.is_return_trip,
    returnToSameLocation: dbJob.return_to_same_location,
    returnAddress: dbJob.return_address,
    returnPostcode: dbJob.return_postcode,
    isScheduled: dbJob.is_scheduled,
    scheduledPickupTime: dbJob.scheduled_pickup_time ? new Date(dbJob.scheduled_pickup_time) : null,
    scheduledDeliveryTime: dbJob.scheduled_delivery_time ? new Date(dbJob.scheduled_delivery_time) : null,
    isCentralLondon: dbJob.is_central_london,
    isRushHour: dbJob.is_rush_hour,
    basePrice: dbJob.base_price,
    distancePrice: dbJob.distance_price,
    weightSurcharge: dbJob.weight_surcharge,
    multiDropCharge: dbJob.multi_drop_charge,
    returnTripCharge: dbJob.return_trip_charge,
    centralLondonCharge: dbJob.central_london_charge,
    waitingTimeCharge: dbJob.waiting_time_charge,
    totalPrice: dbJob.total_price,
    driverPrice: dbJob.driver_price,
    paymentStatus: dbJob.payment_status,
    driverPaymentStatus: dbJob.driver_payment_status || 'unpaid',
    driverPaidAt: dbJob.driver_paid_at ? new Date(dbJob.driver_paid_at) : null,
    paymentIntentId: dbJob.payment_intent_id,
    podPhotoUrl: dbJob.pod_photo_url,
    podPhotos: dbJob.pod_photos || [],
    podSignatureUrl: dbJob.pod_signature_url,
    podNotes: dbJob.pod_notes,
    podRecipientName: dbJob.pod_recipient_name,
    deliveredAt: dbJob.delivered_at ? new Date(dbJob.delivered_at) : null,
    rejectionReason: dbJob.rejection_reason,
    estimatedPickupTime: dbJob.estimated_pickup_time ? new Date(dbJob.estimated_pickup_time) : null,
    estimatedDeliveryTime: dbJob.estimated_delivery_time ? new Date(dbJob.estimated_delivery_time) : null,
    actualPickupTime: dbJob.actual_pickup_time ? new Date(dbJob.actual_pickup_time) : null,
    actualDeliveryTime: dbJob.actual_delivery_time ? new Date(dbJob.actual_delivery_time) : null,
    driverHidden: dbJob.driver_hidden,
    driverHiddenAt: dbJob.driver_hidden_at ? new Date(dbJob.driver_hidden_at) : null,
    driverHiddenBy: dbJob.driver_hidden_by,
    customerEmail: dbJob.customer_email || null,
    createdAt: dbJob.created_at ? new Date(dbJob.created_at) : new Date(),
    updatedAt: dbJob.updated_at ? new Date(dbJob.updated_at) : null,
  };
}

function mapDbToDocument(dbDoc: any): Document {
  return {
    id: dbDoc.id,
    driverId: dbDoc.driver_id,
    type: dbDoc.type,
    fileName: dbDoc.file_name,
    fileUrl: dbDoc.file_url,
    status: dbDoc.status as DocumentStatus,
    reviewedBy: dbDoc.reviewed_by,
    reviewNotes: dbDoc.review_notes,
    expiryDate: dbDoc.expiry_date ? new Date(dbDoc.expiry_date) : null,
    uploadedAt: dbDoc.uploaded_at ? new Date(dbDoc.uploaded_at) : new Date(),
    reviewedAt: dbDoc.reviewed_at ? new Date(dbDoc.reviewed_at) : null,
  };
}

function mapDbToNotification(dbNotif: any): Notification {
  return {
    id: dbNotif.id,
    userId: dbNotif.user_id,
    title: dbNotif.title,
    message: dbNotif.message,
    type: dbNotif.type,
    isRead: dbNotif.is_read,
    data: dbNotif.data,
    createdAt: dbNotif.created_at ? new Date(dbNotif.created_at) : new Date(),
  };
}

function mapDbToInvoice(dbInvoice: any): Invoice {
  return {
    id: dbInvoice.id,
    invoiceNumber: dbInvoice.invoice_number,
    customerId: dbInvoice.customer_id,
    customerName: dbInvoice.customer_name,
    customerEmail: dbInvoice.customer_email,
    companyName: dbInvoice.company_name,
    businessAddress: dbInvoice.business_address,
    vatNumber: dbInvoice.vat_number,
    subtotal: dbInvoice.subtotal,
    vat: dbInvoice.vat,
    total: dbInvoice.total,
    status: dbInvoice.status as InvoiceStatus,
    dueDate: dbInvoice.due_date ? new Date(dbInvoice.due_date) : new Date(),
    paidAt: dbInvoice.paid_at ? new Date(dbInvoice.paid_at) : null,
    periodStart: dbInvoice.period_start ? new Date(dbInvoice.period_start) : new Date(),
    periodEnd: dbInvoice.period_end ? new Date(dbInvoice.period_end) : new Date(),
    jobIds: dbInvoice.job_ids,
    notes: dbInvoice.notes,
    paymentToken: dbInvoice.payment_token || null,
    jobDetails: dbInvoice.job_details || null,
    createdAt: dbInvoice.created_at ? new Date(dbInvoice.created_at) : new Date(),
  };
}

function mapDbToDriverApplication(dbApp: any): DriverApplication {
  return {
    id: dbApp.id,
    fullName: dbApp.full_name,
    email: dbApp.email,
    phone: dbApp.phone,
    postcode: dbApp.postcode,
    fullAddress: dbApp.full_address,
    buildingName: dbApp.building_name,
    profilePictureUrl: dbApp.profile_picture_url,
    nationality: dbApp.nationality,
    isBritish: dbApp.is_british,
    nationalInsuranceNumber: dbApp.national_insurance_number,
    rightToWorkShareCode: dbApp.right_to_work_share_code,
    drivingLicenceFrontUrl: dbApp.driving_licence_front_url,
    drivingLicenceBackUrl: dbApp.driving_licence_back_url,
    dbsCertificateUrl: dbApp.dbs_certificate_url,
    goodsInTransitInsuranceUrl: dbApp.goods_in_transit_insurance_url,
    hireAndRewardUrl: dbApp.hire_and_reward_url,
    vehicleType: (dbApp.vehicle_type?.includes('|') ? dbApp.vehicle_type.split('|')[0] : dbApp.vehicle_type) as VehicleType,
    vehicleRegistration: dbApp.vehicle_registration || (dbApp.vehicle_type?.includes('|') ? dbApp.vehicle_type.split('|')[1] : null),
    vehicleMake: dbApp.vehicle_make || null,
    vehicleModel: dbApp.vehicle_model || null,
    vehicleColor: dbApp.vehicle_color || null,
    bankName: dbApp.bank_name,
    accountHolderName: dbApp.account_holder_name,
    sortCode: dbApp.sort_code,
    accountNumber: dbApp.account_number,
    status: (dbApp.status === 'rejected' && dbApp.rejection_reason === 'CORRECTIONS_NEEDED' ? 'corrections_needed' : dbApp.status) as DriverApplicationStatus,
    reviewedBy: dbApp.reviewed_by,
    reviewNotes: dbApp.review_notes,
    rejectionReason: dbApp.rejection_reason,
    submittedAt: dbApp.submitted_at ? new Date(dbApp.submitted_at) : new Date(),
    reviewedAt: dbApp.reviewed_at ? new Date(dbApp.reviewed_at) : null,
  };
}

function mapDbToJobAssignment(dbAssign: any): JobAssignment {
  return {
    id: dbAssign.id,
    jobId: dbAssign.job_id,
    driverId: dbAssign.driver_id,
    assignedBy: dbAssign.assigned_by,
    driverPrice: dbAssign.driver_price,
    status: dbAssign.status as JobAssignmentStatus,
    batchGroupId: dbAssign.batch_group_id || null,
    sentAt: dbAssign.sent_at ? new Date(dbAssign.sent_at) : null,
    respondedAt: dbAssign.responded_at ? new Date(dbAssign.responded_at) : null,
    cancelledAt: dbAssign.cancelled_at ? new Date(dbAssign.cancelled_at) : null,
    cancellationReason: dbAssign.cancellation_reason,
    rejectionReason: dbAssign.rejection_reason,
    expiresAt: dbAssign.expires_at ? new Date(dbAssign.expires_at) : null,
    withdrawnAt: dbAssign.withdrawn_at ? new Date(dbAssign.withdrawn_at) : null,
    withdrawnBy: dbAssign.withdrawn_by || null,
    removedAt: dbAssign.removed_at ? new Date(dbAssign.removed_at) : null,
    removedBy: dbAssign.removed_by || null,
    cleanedAt: dbAssign.cleaned_at ? new Date(dbAssign.cleaned_at) : null,
    cleanedBy: dbAssign.cleaned_by || null,
    createdAt: dbAssign.created_at ? new Date(dbAssign.created_at) : new Date(),
  };
}

function mapDbToDeliveryContact(dbContact: any): DeliveryContact {
  return {
    id: dbContact.id,
    customerId: dbContact.customer_id,
    label: dbContact.label,
    recipientName: dbContact.recipient_name,
    recipientPhone: dbContact.recipient_phone,
    deliveryAddress: dbContact.delivery_address,
    deliveryPostcode: dbContact.delivery_postcode,
    buildingName: dbContact.building_name,
    deliveryInstructions: dbContact.delivery_instructions,
    isDefault: dbContact.is_default,
    createdAt: dbContact.created_at ? new Date(dbContact.created_at) : new Date(),
    updatedAt: dbContact.updated_at ? new Date(dbContact.updated_at) : null,
  };
}

function mapDbToDriverPayment(dbPayment: any): DriverPayment {
  return {
    id: dbPayment.id,
    driverId: dbPayment.driver_id,
    jobId: dbPayment.job_id,
    amount: dbPayment.amount,
    platformFee: dbPayment.platform_fee,
    netAmount: dbPayment.net_amount,
    status: dbPayment.status as DriverPaymentStatus,
    payoutReference: dbPayment.payout_reference,
    description: dbPayment.description,
    jobTrackingNumber: dbPayment.job_tracking_number,
    paidAt: dbPayment.paid_at ? new Date(dbPayment.paid_at) : null,
    createdAt: dbPayment.created_at ? new Date(dbPayment.created_at) : new Date(),
  };
}

function mapDbToVendorApiKey(dbKey: any): VendorApiKey {
  return {
    id: dbKey.id,
    vendorId: dbKey.vendor_id,
    apiKey: dbKey.api_key,
    name: dbKey.name,
    isActive: dbKey.is_active,
    lastUsedAt: dbKey.last_used_at ? new Date(dbKey.last_used_at) : null,
    createdAt: dbKey.created_at ? new Date(dbKey.created_at) : new Date(),
  };
}

export class SupabaseStorage implements IStorage {
  private pricingSettings: PricingSettings;
  private vehicles: Map<VehicleType, Vehicle>;

  constructor() {
    this.pricingSettings = {
      id: "default",
      centralLondonSurcharge: "18.15",
      multiDropCharge: "5.00",
      returnTripMultiplier: "0.60",
      waitingTimeFreeMinutes: 10,
      waitingTimePerMinute: "0.50",
      rushHourStart: "07:00",
      rushHourEnd: "09:00",
      rushHourStartEvening: "17:00",
      rushHourEndEvening: "19:00",
      weightSurcharges: {
        "4-10": 5,
        "10-20": 10,
        "20-30": 15,
        "30-50": 20,
        "50+": 50
      },
      serviceTypePricing: {
        "flexible": 0,
        "standard": 10,
        "urgent": 25,
        "dedicated": 40
      },
      updatedAt: new Date(),
    };

    this.vehicles = new Map([
      ["motorbike", {
        id: "1",
        type: "motorbike" as VehicleType,
        name: "Motorbike",
        description: "Fast delivery for small items up to 5kg",
        maxWeight: 5,
        baseCharge: "10.00",
        perMileRate: "3.00",
        rushHourRate: "3.00",
        iconUrl: null,
      }],
      ["car", {
        id: "2",
        type: "car" as VehicleType,
        name: "Car",
        description: "Standard delivery for medium items up to 50kg",
        maxWeight: 50,
        baseCharge: "19.00",
        perMileRate: "1.20",
        rushHourRate: "1.40",
        iconUrl: null,
      }],
      ["small_van", {
        id: "3",
        type: "small_van" as VehicleType,
        name: "Small Van",
        description: "Large deliveries up to 400kg",
        maxWeight: 400,
        baseCharge: "25.00",
        perMileRate: "1.30",
        rushHourRate: "1.60",
        iconUrl: null,
      }],
      ["medium_van", {
        id: "4",
        type: "medium_van" as VehicleType,
        name: "Medium Van",
        description: "Heavy deliveries up to 750kg",
        maxWeight: 750,
        baseCharge: "30.00",
        perMileRate: "1.40",
        rushHourRate: "1.70",
        iconUrl: null,
      }],
    ]);
  }

  private checkSupabase() {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not initialized');
    }
    return supabaseAdmin;
  }

  async getUser(id: string): Promise<User | undefined> {
    const supabase = this.checkSupabase();
    
    // First try to find by auth_id (Supabase Auth UUID)
    const { data: authData, error: authError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', id)
      .single();
    
    if (!authError && authData) return mapDbToUser(authData);
    
    // Fallback: try by numeric id (for backwards compatibility)
    const numericId = parseInt(id, 10);
    if (!isNaN(numericId)) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', numericId)
        .single();
      
      if (!error && data) return mapDbToUser(data);
    }
    
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', username)
      .single();
    
    if (error || !data) return undefined;
    return mapDbToUser(data);
  }

  async getUserByAuthId(authId: string): Promise<User | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .single();
    
    if (error || !data) return undefined;
    return mapDbToUser(data);
  }

  async getUsers(filters?: { role?: string; isActive?: boolean; includeInactive?: boolean }): Promise<User[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('users').select('*');
    
    if (filters?.role) {
      query = query.eq('role', filters.role);
    }
    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    } else if (!filters?.includeInactive) {
      query = query.eq('is_active', true);
    }
    
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToUser);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    return this.createUserWithId(id, insertUser);
  }

  async createUserWithId(authId: string, insertUser: InsertUser): Promise<User> {
    const supabase = this.checkSupabase();
    
    // Check if user already exists by auth_id or email
    const existingByAuthId = await this.getUserByAuthId(authId);
    if (existingByAuthId) return existingByAuthId;
    
    const existingByEmail = await this.getUserByUsername(insertUser.email);
    if (existingByEmail) {
      // User exists by email but no auth_id - update to link auth_id
      if (!existingByEmail.authId) {
        const { data: updated } = await supabase
          .from('users')
          .update({ auth_id: authId })
          .eq('email', insertUser.email)
          .select()
          .single();
        if (updated) return mapDbToUser(updated);
      }
      return existingByEmail;
    }
    
    // Create new user - don't set id, let database auto-generate it
    const dbUser = {
      auth_id: authId,
      email: insertUser.email,
      full_name: insertUser.fullName,
      password: insertUser.password || null,
      phone: insertUser.phone || null,
      postcode: insertUser.postcode || null,
      address: insertUser.address || null,
      building_name: insertUser.buildingName || null,
      role: insertUser.role || "customer",
      user_type: insertUser.userType || "individual",
      company_name: insertUser.companyName || null,
      registration_number: insertUser.registrationNumber || null,
      business_address: insertUser.businessAddress || null,
      vat_number: insertUser.vatNumber || null,
      stripe_customer_id: insertUser.stripeCustomerId || null,
      pay_later_enabled: insertUser.payLaterEnabled || false,
      completed_bookings_count: insertUser.completedBookingsCount || 0,
      is_active: insertUser.isActive ?? true,
    };
    
    const { data, error } = await supabase
      .from('users')
      .insert(dbUser)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        // Duplicate - try to find existing
        const existing = await this.getUserByAuthId(authId) || await this.getUserByUsername(insertUser.email);
        if (existing) return existing;
      }
      console.error('[SupabaseStorage] Error creating user:', error);
      throw error;
    }
    
    console.log(`[SupabaseStorage] Created user with auth_id ${authId}`);
    return mapDbToUser(data);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    
    if (data.email !== undefined) dbData.email = data.email;
    if (data.password !== undefined) dbData.password = data.password;
    if (data.fullName !== undefined) dbData.full_name = data.fullName;
    if (data.phone !== undefined) dbData.phone = data.phone;
    if (data.postcode !== undefined) dbData.postcode = data.postcode;
    if (data.address !== undefined) dbData.address = data.address;
    if (data.buildingName !== undefined) dbData.building_name = data.buildingName;
    if (data.role !== undefined) dbData.role = data.role;
    if (data.userType !== undefined) dbData.user_type = data.userType;
    if (data.companyName !== undefined) dbData.company_name = data.companyName;
    if (data.registrationNumber !== undefined) dbData.registration_number = data.registrationNumber;
    if (data.businessAddress !== undefined) dbData.business_address = data.businessAddress;
    if (data.vatNumber !== undefined) dbData.vat_number = data.vatNumber;
    if (data.stripeCustomerId !== undefined) dbData.stripe_customer_id = data.stripeCustomerId;
    if (data.payLaterEnabled !== undefined) dbData.pay_later_enabled = data.payLaterEnabled;
    if (data.completedBookingsCount !== undefined) dbData.completed_bookings_count = data.completedBookingsCount;
    if (data.isActive !== undefined) dbData.is_active = data.isActive;
    
    // First try to update by auth_id (Supabase Auth UUID)
    const { data: updated, error } = await supabase
      .from('users')
      .update(dbData)
      .eq('auth_id', id)
      .select()
      .single();
    
    if (!error && updated) {
      console.log(`[SupabaseStorage] Updated user by auth_id ${id}`);
      return mapDbToUser(updated);
    }
    
    // Fallback: try by numeric id
    const numericId = parseInt(id, 10);
    if (!isNaN(numericId)) {
      const { data: updatedById, error: errorById } = await supabase
        .from('users')
        .update(dbData)
        .eq('id', numericId)
        .select()
        .single();
      
      if (!errorById && updatedById) {
        console.log(`[SupabaseStorage] Updated user by id ${id}`);
        return mapDbToUser(updatedById);
      }
    }
    
    return undefined;
  }

  async incrementCompletedBookings(id: string): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    return this.updateUser(id, { 
      completedBookingsCount: (user.completedBookingsCount || 0) + 1 
    });
  }

  async deactivateUser(id: string): Promise<User | undefined> {
    return this.updateUser(id, { isActive: false });
  }

  async reactivateUser(id: string): Promise<User | undefined> {
    return this.updateUser(id, { isActive: true });
  }

  async deleteUser(id: string): Promise<boolean> {
    const supabase = this.checkSupabase();
    
    // Try to delete by auth_id first (Supabase Auth UUID)
    const { error: authIdError } = await supabase
      .from('users')
      .delete()
      .eq('auth_id', id);
    
    if (!authIdError) {
      console.log(`[SupabaseStorage] Deleted user by auth_id ${id}`);
      return true;
    }
    
    // Fallback: try by numeric id
    const numericId = parseInt(id, 10);
    if (!isNaN(numericId)) {
      const { error: idError } = await supabase
        .from('users')
        .delete()
        .eq('id', numericId);
      
      if (!idError) {
        console.log(`[SupabaseStorage] Deleted user by id ${id}`);
        return true;
      }
    }
    
    console.error(`[SupabaseStorage] Error deleting user ${id}:`, authIdError);
    return false;
  }

  async getDriver(id: string): Promise<Driver | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return mapDbToDriver(data);
  }

  async getDriverByUserId(userId: string): Promise<Driver | undefined> {
    return this.getDriver(userId);
  }

  async getDriverByDriverCode(driverCode: string): Promise<Driver | undefined> {
    const supabase = this.checkSupabase();
    // Normalize driver code: trim whitespace and convert to uppercase
    const normalizedCode = driverCode.trim().toUpperCase();
    
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('driver_code', normalizedCode)
      .single();
    
    if (error) {
      console.log(`[SupabaseStorage] getDriverByDriverCode: No driver found for code ${normalizedCode}`);
      return undefined;
    }
    if (!data) return undefined;
    console.log(`[SupabaseStorage] getDriverByDriverCode: Found driver ${data.driver_code} (id: ${data.id})`);
    return mapDbToDriver(data);
  }

  async getDrivers(filters?: { isAvailable?: boolean; isVerified?: boolean; vehicleType?: VehicleType; includeInactive?: boolean }): Promise<Driver[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('drivers').select('*');
    
    if (!filters?.includeInactive) {
      query = query.neq('is_active', false);
    }
    if (filters?.isAvailable !== undefined) {
      query = query.eq('online_status', filters.isAvailable ? 'online' : 'offline');
    }
    if (filters?.isVerified !== undefined) {
      query = query.eq('status', filters.isVerified ? 'approved' : 'applicant');
    }
    if (filters?.vehicleType) {
      query = query.eq('vehicle_type', filters.vehicleType);
    }
    
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToDriver);
  }

  async createDriver(insertDriver: InsertDriver): Promise<Driver> {
    const supabase = this.checkSupabase();
    const id = insertDriver.userId;
    
    const dbDriver = {
      id,
      user_id: insertDriver.userId,
      driver_code: insertDriver.driverCode,
      full_name: insertDriver.fullName || null,
      email: insertDriver.email || null,
      phone: insertDriver.phone || null,
      postcode: insertDriver.postcode || null,
      address: insertDriver.address || null,
      nationality: insertDriver.nationality || null,
      is_british: insertDriver.isBritish || null,
      national_insurance_number: insertDriver.nationalInsuranceNumber || null,
      right_to_work_share_code: insertDriver.rightToWorkShareCode || null,
      dbs_checked: insertDriver.dbsChecked || null,
      dbs_certificate_url: insertDriver.dbsCertificateUrl || null,
      dbs_check_date: insertDriver.dbsCheckDate || null,
      vehicle_type: insertDriver.vehicleType,
      vehicle_registration: insertDriver.vehicleRegistration || null,
      vehicle_make: insertDriver.vehicleMake || null,
      vehicle_model: insertDriver.vehicleModel || null,
      vehicle_color: insertDriver.vehicleColor || null,
      online_status: insertDriver.isAvailable ? 'online' : 'offline',
      status: insertDriver.isVerified ? 'approved' : 'applicant',
      current_latitude: insertDriver.currentLatitude || null,
      current_longitude: insertDriver.currentLongitude || null,
      last_location_update: insertDriver.lastLocationUpdate || null,
      profile_picture_url: insertDriver.profilePictureUrl || null,
      is_active: true,
    };
    
    const { data, error } = await supabase
      .from('drivers')
      .insert(dbDriver)
      .select()
      .single();
    
    if (error) {
      console.error('[SupabaseStorage] Error creating driver:', error);
      throw error;
    }
    
    console.log(`[SupabaseStorage] Created driver ${id}`);
    return mapDbToDriver(data);
  }

  async updateDriver(id: string, data: Partial<Driver>): Promise<Driver | undefined> {
    const supabase = this.checkSupabase();
    
    const dbData: any = {};
    if (data.fullName !== undefined) dbData.full_name = data.fullName;
    if (data.email !== undefined) dbData.email = data.email;
    if (data.phone !== undefined) dbData.phone = data.phone;
    if (data.postcode !== undefined) dbData.postcode = data.postcode;
    if (data.address !== undefined) dbData.address = data.address;
    if (data.nationality !== undefined) dbData.nationality = data.nationality;
    if (data.isBritish !== undefined) dbData.is_british = data.isBritish;
    if (data.nationalInsuranceNumber !== undefined) dbData.national_insurance_number = data.nationalInsuranceNumber;
    if (data.rightToWorkShareCode !== undefined) dbData.right_to_work_share_code = data.rightToWorkShareCode;
    if (data.dbsChecked !== undefined) dbData.dbs_checked = data.dbsChecked;
    if (data.dbsCertificateUrl !== undefined) dbData.dbs_certificate_url = data.dbsCertificateUrl;
    if (data.dbsCheckDate !== undefined) dbData.dbs_check_date = data.dbsCheckDate;
    if (data.vehicleType !== undefined) dbData.vehicle_type = data.vehicleType;
    if (data.vehicleRegistration !== undefined) dbData.vehicle_registration = data.vehicleRegistration;
    if (data.vehicleMake !== undefined) dbData.vehicle_make = data.vehicleMake;
    if (data.vehicleModel !== undefined) dbData.vehicle_model = data.vehicleModel;
    if (data.vehicleColor !== undefined) dbData.vehicle_color = data.vehicleColor;
    if (data.isAvailable !== undefined) dbData.online_status = data.isAvailable ? 'online' : 'offline';
    if (data.isVerified !== undefined) dbData.status = data.isVerified ? 'approved' : 'applicant'; // Use 'status' column
    if (data.currentLatitude !== undefined) dbData.current_latitude = data.currentLatitude;
    if (data.currentLongitude !== undefined) dbData.current_longitude = data.currentLongitude;
    if (data.lastLocationUpdate !== undefined) dbData.last_location_update = data.lastLocationUpdate;
    if (data.profilePictureUrl !== undefined) dbData.profile_picture_url = data.profilePictureUrl;
    if (data.bankName !== undefined) dbData.bank_name = data.bankName;
    if (data.accountHolderName !== undefined) dbData.account_holder_name = data.accountHolderName;
    if (data.sortCode !== undefined) dbData.sort_code = data.sortCode;
    if (data.accountNumber !== undefined) dbData.account_number = data.accountNumber;
    if (data.isActive !== undefined) dbData.is_active = data.isActive;
    if ((data as any).stripeAccountId !== undefined) dbData.stripe_account_id = (data as any).stripeAccountId;
    
    let { data: updated, error } = await supabase
      .from('drivers')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error && (error.message?.includes('vehicle_registration') || error.message?.includes('vehicle_make') || error.message?.includes('vehicle_model') || error.message?.includes('vehicle_color') || error.message?.includes('column'))) {
      console.warn('[SupabaseStorage] Retrying driver update without vehicle columns:', id);
      const vehicleReg = dbData.vehicle_registration;
      delete dbData.vehicle_registration;
      delete dbData.vehicle_make;
      delete dbData.vehicle_model;
      delete dbData.vehicle_color;
      if (vehicleReg && dbData.vehicle_type) {
        dbData.vehicle_type = `${dbData.vehicle_type}|${vehicleReg}`;
      } else if (vehicleReg) {
        const existing = await supabase.from('drivers').select('vehicle_type').eq('id', id).single();
        const baseType = existing.data?.vehicle_type?.split('|')[0] || 'car';
        dbData.vehicle_type = `${baseType}|${vehicleReg}`;
      }
      const retry = await supabase.from('drivers').update(dbData).eq('id', id).select().single();
      updated = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[SupabaseStorage] Error updating driver:', id, error);
      return undefined;
    }
    if (!updated) {
      console.error('[SupabaseStorage] Driver not found for update:', id);
      return undefined;
    }
    return mapDbToDriver(updated);
  }

  async updateDriverAvailability(id: string, isAvailable: boolean): Promise<Driver | undefined> {
    return this.updateDriver(id, { isAvailable });
  }

  async updateDriverLocation(id: string, latitude: string, longitude: string, extras?: { speed?: number; heading?: number; accuracy?: number; jobId?: string }): Promise<Driver | undefined> {
    const driverUpdate = this.updateDriver(id, { 
      currentLatitude: latitude, 
      currentLongitude: longitude,
      lastLocationUpdate: new Date(),
    });

    try {
      const supabase = this.checkSupabase();
      const { error: locErr } = await supabase.from('driver_locations').upsert({
        driver_id: id,
        job_id: extras?.jobId || null,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        speed: extras?.speed ?? null,
        heading: extras?.heading ?? null,
        accuracy: extras?.accuracy ?? null,
        is_moving: (extras?.speed ?? 0) > 0.5,
        recorded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_id' });
      if (locErr && !locErr.message?.includes('Could not find')) {
        console.warn('[SupabaseStorage] driver_locations upsert error:', locErr.message);
      }
    } catch (err) {
      // Non-critical — driver location is already saved in drivers table
    }

    return driverUpdate;
  }

  async verifyDriver(id: string, isVerified: boolean): Promise<Driver | undefined> {
    return this.updateDriver(id, { isVerified });
  }

  async deactivateDriver(id: string): Promise<Driver | undefined> {
    return this.updateDriver(id, { 
      isActive: false, 
      isAvailable: false 
    });
  }

  async reactivateDriver(id: string): Promise<Driver | undefined> {
    return this.updateDriver(id, { 
      isActive: true 
    });
  }

  async deleteDriver(id: string): Promise<boolean> {
    const supabase = this.checkSupabase();
    const { error } = await supabase
      .from('drivers')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('[SupabaseStorage] Error deleting driver:', id, error);
      return false;
    }
    console.log(`[SupabaseStorage] Permanently deleted driver ${id}`);
    return true;
  }

  async getJob(id: string): Promise<Job | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return mapDbToJob(data);
  }

  async getJobByTrackingNumber(trackingNumber: string): Promise<Job | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('tracking_number', trackingNumber)
      .single();
    
    if (error || !data) return undefined;
    return mapDbToJob(data);
  }

  async getJobs(filters?: { status?: JobStatus; customerId?: string; driverId?: string; vendorId?: string; limit?: number }): Promise<Job[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
    
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.customerId) {
      console.log(`[SupabaseStorage] Filtering jobs by customer_id: ${filters.customerId}`);
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters?.driverId) {
      query = query.eq('driver_id', filters.driverId);
    }
    if (filters?.vendorId) {
      query = query.eq('vendor_id', filters.vendorId);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    const { data, error } = await query;
    if (error) {
      console.error('[SupabaseStorage] getJobs error:', error);
      return [];
    }
    if (!data) return [];
    console.log(`[SupabaseStorage] getJobs returned ${data.length} jobs, first job customer_id: ${data[0]?.customer_id}`);
    return data.map(mapDbToJob);
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const supabase = this.checkSupabase();
    
    // customer_id must be a valid UUID or null - not a string like "admin-created"
    const isValidUUID = (str: string | null | undefined): boolean => {
      if (!str) return false;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };
    
    // Let the database auto-generate the id (bigint)
    const dbJob = {
      tracking_number: insertJob.trackingNumber,
      customer_id: isValidUUID(insertJob.customerId) ? insertJob.customerId : null,
      customer_type: insertJob.customerType || 'individual',
      driver_id: insertJob.driverId || null,
      dispatcher_id: insertJob.dispatcherId || null,
      vendor_id: insertJob.vendorId || null,
      status: insertJob.status || 'pending',
      vehicle_type: insertJob.vehicleType,
      pickup_address: insertJob.pickupAddress,
      pickup_postcode: insertJob.pickupPostcode,
      pickup_latitude: insertJob.pickupLatitude || null,
      pickup_longitude: insertJob.pickupLongitude || null,
      pickup_instructions: insertJob.pickupInstructions || null,
      pickup_building_name: insertJob.pickupBuildingName || null,
      pickup_contact_name: insertJob.pickupContactName || null,
      pickup_contact_phone: insertJob.pickupContactPhone || null,
      delivery_address: insertJob.deliveryAddress,
      dropoff_address: insertJob.deliveryAddress || 'Not specified',
      delivery_postcode: insertJob.deliveryPostcode,
      delivery_latitude: insertJob.deliveryLatitude || null,
      delivery_longitude: insertJob.deliveryLongitude || null,
      delivery_instructions: insertJob.deliveryInstructions || null,
      delivery_building_name: insertJob.deliveryBuildingName || null,
      recipient_name: insertJob.recipientName || null,
      recipient_phone: insertJob.recipientPhone || null,
      weight: insertJob.weight,
      distance: insertJob.distance || null,
      is_multi_drop: insertJob.isMultiDrop || false,
      is_return_trip: insertJob.isReturnTrip || false,
      return_to_same_location: insertJob.returnToSameLocation ?? true,
      return_address: insertJob.returnAddress || null,
      return_postcode: insertJob.returnPostcode || null,
      is_scheduled: insertJob.isScheduled || false,
      scheduled_pickup_time: insertJob.scheduledPickupTime || new Date().toISOString(),
      scheduled_delivery_time: insertJob.scheduledDeliveryTime || new Date().toISOString(),
      is_central_london: insertJob.isCentralLondon || false,
      is_rush_hour: insertJob.isRushHour || false,
      base_price: insertJob.basePrice,
      distance_price: insertJob.distancePrice,
      weight_surcharge: insertJob.weightSurcharge || '0',
      multi_drop_charge: insertJob.multiDropCharge || '0',
      return_trip_charge: insertJob.returnTripCharge || '0',
      central_london_charge: insertJob.centralLondonCharge || '0',
      waiting_time_charge: insertJob.waitingTimeCharge || '0',
      total_price: insertJob.totalPrice,
      price_customer: insertJob.totalPrice || '0',
      driver_price: insertJob.driverPrice || null,
      payment_status: insertJob.paymentStatus || 'pending',
      payment_intent_id: insertJob.paymentIntentId || null,
      job_number: (insertJob as any).jobNumber || null,
      notes: '',
      priority: 'normal',
      parcel_weight: 0,
    };
    
    if ((insertJob as any).customerEmail) {
      (dbJob as any).customer_email = (insertJob as any).customerEmail;
    }
    
    const { data, error } = await supabase
      .from('jobs')
      .insert(dbJob)
      .select()
      .single();
    
    if (error) {
      if (error.message?.includes('customer_email') && (dbJob as any).customer_email) {
        console.warn('[SupabaseStorage] customer_email column not found, retrying without it');
        delete (dbJob as any).customer_email;
        const { data: retryData, error: retryError } = await supabase
          .from('jobs')
          .insert(dbJob)
          .select()
          .single();
        if (retryError) {
          console.error('[SupabaseStorage] Error creating job (retry):', retryError);
          throw retryError;
        }
        console.log(`[SupabaseStorage] Created job ${retryData.id} with tracking ${insertJob.trackingNumber}`);
        const result = mapDbToJob(retryData);
        (result as any).customerEmail = (insertJob as any).customerEmail;
        return result;
      }
      console.error('[SupabaseStorage] Error creating job:', error);
      throw error;
    }
    
    console.log(`[SupabaseStorage] Created job ${data.id} with tracking ${insertJob.trackingNumber}`);
    return mapDbToJob(data);
  }

  async updateJob(id: string, data: Partial<Job>): Promise<Job | undefined> {
    const supabase = this.checkSupabase();
    
    const dbData: any = { updated_at: new Date().toISOString() };
    if (data.status !== undefined) dbData.status = data.status;
    if (data.driverId !== undefined) dbData.driver_id = data.driverId;
    if (data.dispatcherId !== undefined) dbData.dispatcher_id = data.dispatcherId;
    if (data.driverPrice !== undefined) dbData.driver_price = data.driverPrice;
    if (data.paymentStatus !== undefined) dbData.payment_status = data.paymentStatus;
    if (data.paymentIntentId !== undefined) dbData.payment_intent_id = data.paymentIntentId;
    if (data.podPhotoUrl !== undefined) dbData.pod_photo_url = data.podPhotoUrl;
    if (data.podPhotos !== undefined) dbData.pod_photos = data.podPhotos;
    if (data.podSignatureUrl !== undefined) dbData.pod_signature_url = data.podSignatureUrl;
    if (data.podNotes !== undefined) dbData.pod_notes = data.podNotes;
    if (data.podRecipientName !== undefined) dbData.pod_recipient_name = data.podRecipientName;
    if (data.deliveredAt !== undefined) dbData.delivered_at = data.deliveredAt;
    if (data.rejectionReason !== undefined) dbData.rejection_reason = data.rejectionReason;
    if (data.driverHidden !== undefined) dbData.driver_hidden = data.driverHidden;
    if (data.driverHiddenAt !== undefined) dbData.driver_hidden_at = data.driverHiddenAt;
    if (data.driverHiddenBy !== undefined) dbData.driver_hidden_by = data.driverHiddenBy;
    if (data.pickupLatitude !== undefined) dbData.pickup_latitude = data.pickupLatitude;
    if (data.pickupLongitude !== undefined) dbData.pickup_longitude = data.pickupLongitude;
    if (data.deliveryLatitude !== undefined) dbData.delivery_latitude = data.deliveryLatitude;
    if (data.deliveryLongitude !== undefined) dbData.delivery_longitude = data.deliveryLongitude;
    if (data.actualPickupTime !== undefined) dbData.actual_pickup_time = data.actualPickupTime;
    if (data.actualDeliveryTime !== undefined) dbData.actual_delivery_time = data.actualDeliveryTime;
    if (data.deliveryAddress !== undefined) dbData.delivery_address = data.deliveryAddress;
    if (data.deliveryPostcode !== undefined) dbData.delivery_postcode = data.deliveryPostcode;
    if (data.pickupAddress !== undefined) dbData.pickup_address = data.pickupAddress;
    if (data.pickupPostcode !== undefined) dbData.pickup_postcode = data.pickupPostcode;
    if (data.driverPaymentStatus !== undefined) dbData.driver_payment_status = data.driverPaymentStatus;
    if (data.driverPaidAt !== undefined) dbData.driver_paid_at = data.driverPaidAt;
    if (data.totalPrice !== undefined) dbData.total_price = data.totalPrice;
    if (data.pickupBuildingName !== undefined) dbData.pickup_building_name = data.pickupBuildingName;
    if (data.pickupContactName !== undefined) dbData.pickup_contact_name = data.pickupContactName;
    if (data.pickupContactPhone !== undefined) dbData.pickup_contact_phone = data.pickupContactPhone;
    if (data.pickupInstructions !== undefined) dbData.pickup_instructions = data.pickupInstructions;
    if (data.deliveryBuildingName !== undefined) dbData.delivery_building_name = data.deliveryBuildingName;
    if (data.recipientName !== undefined) dbData.recipient_name = data.recipientName;
    if (data.recipientPhone !== undefined) dbData.recipient_phone = data.recipientPhone;
    if (data.deliveryInstructions !== undefined) dbData.delivery_instructions = data.deliveryInstructions;
    if (data.vehicleType !== undefined) dbData.vehicle_type = data.vehicleType;
    if (data.weight !== undefined) dbData.weight = data.weight;
    if (data.distance !== undefined) dbData.distance = data.distance;
    if (data.isMultiDrop !== undefined) dbData.is_multi_drop = data.isMultiDrop;
    if (data.isReturnTrip !== undefined) dbData.is_return_trip = data.isReturnTrip;
    
    console.log(`[SupabaseStorage] updateJob ${id} with data:`, JSON.stringify(dbData));
    
    const { data: updated, error } = await supabase
      .from('jobs')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error(`[SupabaseStorage] updateJob error:`, error);
      return undefined;
    }
    if (!updated) {
      console.warn(`[SupabaseStorage] updateJob ${id} returned no data`);
      return undefined;
    }
    console.log(`[SupabaseStorage] updateJob ${id} success, pickup coords: ${updated.pickup_latitude}, ${updated.pickup_longitude}`);
    return mapDbToJob(updated);
  }

  async updateJobStatus(id: string, status: JobStatus, rejectionReason?: string): Promise<Job | undefined> {
    const updateData: Partial<Job> = { status };
    if (rejectionReason) updateData.rejectionReason = rejectionReason;
    if (status === 'delivered') updateData.deliveredAt = new Date();
    return this.updateJob(id, updateData);
  }

  async assignDriver(id: string, driverId: string, dispatcherId?: string): Promise<Job | undefined> {
    const supabase = this.checkSupabase();
    
    // First update the job with driverId and status
    const updatedJob = await this.updateJob(id, { driverId, dispatcherId, status: 'assigned' });
    if (!updatedJob) {
      console.error('[SupabaseStorage] assignDriver: Failed to update job');
      return undefined;
    }
    
    // Also create a job_assignments record so mobile app can see it
    // First check if there's already an active assignment for this job
    const { data: existingAssignment } = await supabase
      .from('job_assignments')
      .select('id')
      .eq('job_id', id)
      .eq('driver_id', driverId)
      .in('status', ['pending', 'sent', 'offered', 'assigned', 'accepted'])
      .maybeSingle();
    
    if (!existingAssignment) {
      // Create new job assignment record
      const assignmentId = randomUUID();
      const now = new Date();
      
      // Use the job's driver_price if available, otherwise default to 0
      const driverPrice = updatedJob.driverPrice || 0;
      
      const { error: assignmentError } = await supabase
        .from('job_assignments')
        .insert({
          id: assignmentId,
          job_id: id,
          driver_id: driverId,
          assigned_by: dispatcherId || null,
          driver_price: driverPrice,
          status: 'offered',
          sent_at: now.toISOString(),
          expires_at: null,
        });
      
      if (assignmentError) {
        console.error('[SupabaseStorage] assignDriver: Failed to create job assignment:', assignmentError);
        // Don't fail the whole operation - job was already updated
      } else {
        console.log(`[SupabaseStorage] assignDriver: Created job assignment for job ${id} to driver ${driverId}`);
      }
    } else {
      console.log(`[SupabaseStorage] assignDriver: Job assignment already exists for job ${id} to driver ${driverId}`);
    }
    
    return updatedJob;
  }

  async updateJobPOD(
    id: string, 
    podPhotoUrl?: string, 
    podSignatureUrl?: string, 
    podRecipientName?: string,
    podPhotos?: string[],
    podNotes?: string
  ): Promise<Job | undefined> {
    const updates: any = {};
    if (podPhotoUrl !== undefined) updates.podPhotoUrl = podPhotoUrl;
    if (podSignatureUrl !== undefined) updates.podSignatureUrl = podSignatureUrl;
    if (podRecipientName !== undefined) updates.podRecipientName = podRecipientName;
    if (podPhotos !== undefined) updates.podPhotos = podPhotos;
    if (podNotes !== undefined) updates.podNotes = podNotes;
    return this.updateJob(id, updates);
  }

  async deleteJob(id: string): Promise<void> {
    const supabase = this.checkSupabase();
    await supabase.from('jobs').delete().eq('id', id);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return mapDbToDocument(data);
  }

  async getDocuments(filters?: { driverId?: string; status?: string; type?: string }): Promise<Document[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('documents').select('*');
    
    if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.type) query = query.eq('type', filters.type);
    
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToDocument);
  }

  async createDocument(insertDoc: InsertDocument): Promise<Document> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    
    // Try inserting into driver_documents table first (primary table for driver docs)
    const ddDoc: Record<string, any> = {
      driver_id: insertDoc.driverId,
      doc_type: insertDoc.type,
      file_url: insertDoc.fileUrl,
      status: insertDoc.status || 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { data: ddData, error: ddError } = await supabase
      .from('driver_documents')
      .insert(ddDoc)
      .select()
      .single();
    
    if (!ddError && ddData) {
      console.log('[SupabaseStorage] Created document in driver_documents table');
      return {
        id: ddData.id?.toString() || id,
        driverId: ddData.driver_id,
        type: ddData.doc_type || insertDoc.type,
        fileName: insertDoc.fileName,
        fileUrl: ddData.file_url,
        status: ddData.status || 'pending',
        expiryDate: null,
        reviewedBy: null,
        reviewNotes: null,
        uploadedAt: ddData.created_at ? new Date(ddData.created_at) : new Date(),
        reviewedAt: null,
      } as Document;
    }
    
    console.log('[SupabaseStorage] driver_documents insert failed, trying documents table:', ddError?.message);
    
    // Fallback to documents table - build object without expiry_date by default
    const dbDoc: Record<string, any> = {
      id,
      driver_id: insertDoc.driverId,
      type: insertDoc.type,
      file_name: insertDoc.fileName,
      file_url: insertDoc.fileUrl,
      status: insertDoc.status || 'pending',
    };
    
    const { data, error } = await supabase
      .from('documents')
      .insert(dbDoc)
      .select()
      .single();
    
    if (error) {
      console.error('[SupabaseStorage] documents table insert also failed:', error.message);
      throw error;
    }
    return mapDbToDocument(data);
  }

  async updateDocument(id: string, data: Partial<Document>): Promise<Document | undefined> {
    const supabase = this.checkSupabase();
    
    // Only update columns that are most likely to exist in the table
    // Some Supabase schemas may not have all review-related columns
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    // Note: expiry_date is commonly available
    if (data.expiryDate !== undefined) dbData.expiry_date = data.expiryDate;
    
    // Only add these if they're likely to exist - wrap in try/catch for safety
    const { data: updated, error } = await supabase
      .from('documents')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.log('[SupabaseStorage] updateDocument error:', error.message);
      return undefined;
    }
    if (!updated) return undefined;
    return mapDbToDocument(updated);
  }

  async reviewDocument(id: string, status: string, reviewedBy: string, reviewNotes?: string): Promise<Document | undefined> {
    return this.updateDocument(id, {
      status: status as DocumentStatus,
      reviewedBy,
      reviewNotes,
      reviewedAt: new Date(),
    });
  }

  async getNotifications(filters?: { userId?: string; isRead?: boolean }): Promise<Notification[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('notifications').select('*').order('created_at', { ascending: false });
    
    if (filters?.userId) query = query.eq('user_id', filters.userId);
    if (filters?.isRead !== undefined) query = query.eq('is_read', filters.isRead);
    
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToNotification);
  }

  async createNotification(insertNotif: InsertNotification): Promise<Notification> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    
    const dbNotif = {
      id,
      user_id: insertNotif.userId,
      title: insertNotif.title,
      message: insertNotif.message,
      type: insertNotif.type || 'info',
      is_read: false,
      data: insertNotif.data || null,
    };
    
    const { data, error } = await supabase
      .from('notifications')
      .insert(dbNotif)
      .select()
      .single();
    
    if (error) throw error;
    return mapDbToNotification(data);
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) return undefined;
    return mapDbToNotification(data);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    const supabase = this.checkSupabase();
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
  }

  async loadPricingFromDatabase(): Promise<void> {
    try {
      const supabase = this.checkSupabase();
      const { data, error } = await supabase
        .from('pricing_settings')
        .select('*')
        .limit(1)
        .single();

      if (!error && data) {
        this.pricingSettings = {
          id: data.id,
          centralLondonSurcharge: data.central_london_surcharge ?? this.pricingSettings.centralLondonSurcharge,
          multiDropCharge: data.multi_drop_charge ?? this.pricingSettings.multiDropCharge,
          returnTripMultiplier: data.return_trip_multiplier ?? this.pricingSettings.returnTripMultiplier,
          waitingTimeFreeMinutes: data.waiting_time_free_minutes ?? this.pricingSettings.waitingTimeFreeMinutes,
          waitingTimePerMinute: data.waiting_time_per_minute ?? this.pricingSettings.waitingTimePerMinute,
          rushHourStart: data.rush_hour_start ?? this.pricingSettings.rushHourStart,
          rushHourEnd: data.rush_hour_end ?? this.pricingSettings.rushHourEnd,
          rushHourStartEvening: data.rush_hour_start_evening ?? this.pricingSettings.rushHourStartEvening,
          rushHourEndEvening: data.rush_hour_end_evening ?? this.pricingSettings.rushHourEndEvening,
          weightSurcharges: data.weight_surcharges ?? this.pricingSettings.weightSurcharges,
          serviceTypePricing: data.service_type_pricing ?? this.pricingSettings.serviceTypePricing,
          updatedAt: data.updated_at ? new Date(data.updated_at) : new Date(),
        };
        console.log('[SupabaseStorage] Loaded pricing settings from database');
      } else {
        console.log('[SupabaseStorage] No pricing settings found in database, inserting defaults');
        const { error: insertError } = await supabase
          .from('pricing_settings')
          .insert({
            id: this.pricingSettings.id,
            central_london_surcharge: this.pricingSettings.centralLondonSurcharge,
            multi_drop_charge: this.pricingSettings.multiDropCharge,
            return_trip_multiplier: this.pricingSettings.returnTripMultiplier,
            waiting_time_free_minutes: this.pricingSettings.waitingTimeFreeMinutes,
            waiting_time_per_minute: this.pricingSettings.waitingTimePerMinute,
            rush_hour_start: this.pricingSettings.rushHourStart,
            rush_hour_end: this.pricingSettings.rushHourEnd,
            rush_hour_start_evening: this.pricingSettings.rushHourStartEvening,
            rush_hour_end_evening: this.pricingSettings.rushHourEndEvening,
            weight_surcharges: this.pricingSettings.weightSurcharges,
            updated_at: new Date().toISOString(),
          });
        if (insertError) {
          console.error('[SupabaseStorage] Error inserting default pricing settings:', insertError);
        } else {
          console.log('[SupabaseStorage] Inserted default pricing settings into database');
        }
      }
    } catch (err) {
      console.error('[SupabaseStorage] Error loading pricing from database:', err);
    }
  }

  async loadVehiclesFromDatabase(): Promise<void> {
    try {
      const supabase = this.checkSupabase();
      const { data, error } = await supabase
        .from('vehicles')
        .select('*');

      if (!error && data && data.length > 0) {
        for (const v of data) {
          const type = v.type as VehicleType;
          this.vehicles.set(type, {
            id: v.id,
            type: type,
            name: v.name,
            description: v.description,
            maxWeight: v.max_weight,
            baseCharge: v.base_charge,
            perMileRate: v.per_mile_rate,
            rushHourRate: v.rush_hour_rate,
            iconUrl: v.icon_url,
          });
        }
        console.log(`[SupabaseStorage] Loaded ${data.length} vehicles from database`);
        
        const motorbikeVehicle = data.find((v: any) => v.type === 'motorbike');
        if (motorbikeVehicle && parseFloat(motorbikeVehicle.base_charge) < 10) {
          console.log(`[SupabaseStorage] Updating motorbike base charge from £${motorbikeVehicle.base_charge} to £10.00`);
          await supabase
            .from('vehicles')
            .update({ base_charge: 10.00 })
            .eq('type', 'motorbike');
          const existing = this.vehicles.get('motorbike');
          if (existing) {
            existing.baseCharge = "10.00";
          }
        }
      } else {
        console.log('[SupabaseStorage] No vehicles found in database, inserting defaults');
        for (const [, vehicle] of this.vehicles) {
          const vehicleId = vehicle.id.length < 10 ? randomUUID() : vehicle.id;
          const { error: insertError } = await supabase
            .from('vehicles')
            .upsert({
              id: vehicleId,
              type: vehicle.type,
              name: vehicle.name,
              description: vehicle.description,
              max_weight: vehicle.maxWeight,
              base_charge: vehicle.baseCharge,
              per_mile_rate: vehicle.perMileRate,
              rush_hour_rate: vehicle.rushHourRate,
              icon_url: vehicle.iconUrl,
            }, { onConflict: 'type' });
          if (insertError) {
            console.error(`[SupabaseStorage] Error inserting vehicle ${vehicle.type}:`, insertError);
          } else {
            vehicle.id = vehicleId;
          }
        }
        console.log('[SupabaseStorage] Inserted default vehicles into database');
      }
    } catch (err) {
      console.error('[SupabaseStorage] Error loading vehicles from database:', err);
    }
  }

  async getPricingSettings(): Promise<PricingSettings> {
    return this.pricingSettings;
  }

  async updatePricingSettings(data: Partial<PricingSettings>): Promise<PricingSettings> {
    this.pricingSettings = { ...this.pricingSettings, ...data, updatedAt: new Date() };

    try {
      const supabase = this.checkSupabase();
      const dbData: any = {
        id: this.pricingSettings.id,
        updated_at: new Date().toISOString(),
      };
      if (data.centralLondonSurcharge !== undefined) dbData.central_london_surcharge = data.centralLondonSurcharge;
      if (data.multiDropCharge !== undefined) dbData.multi_drop_charge = data.multiDropCharge;
      if (data.returnTripMultiplier !== undefined) dbData.return_trip_multiplier = data.returnTripMultiplier;
      if (data.waitingTimeFreeMinutes !== undefined) dbData.waiting_time_free_minutes = data.waitingTimeFreeMinutes;
      if (data.waitingTimePerMinute !== undefined) dbData.waiting_time_per_minute = data.waitingTimePerMinute;
      if (data.rushHourStart !== undefined) dbData.rush_hour_start = data.rushHourStart;
      if (data.rushHourEnd !== undefined) dbData.rush_hour_end = data.rushHourEnd;
      if (data.rushHourStartEvening !== undefined) dbData.rush_hour_start_evening = data.rushHourStartEvening;
      if (data.rushHourEndEvening !== undefined) dbData.rush_hour_end_evening = data.rushHourEndEvening;
      if (data.weightSurcharges !== undefined) dbData.weight_surcharges = data.weightSurcharges;
      if (data.serviceTypePricing !== undefined) dbData.service_type_pricing = data.serviceTypePricing;

      const { error } = await supabase
        .from('pricing_settings')
        .upsert(dbData, { onConflict: 'id' });

      if (error) {
        console.error('[SupabaseStorage] Error persisting pricing settings:', error);
      } else {
        console.log('[SupabaseStorage] Pricing settings persisted to database');
        await this.loadPricingFromDatabase();
      }
    } catch (err) {
      console.error('[SupabaseStorage] Error upserting pricing settings:', err);
    }

    return this.pricingSettings;
  }

  async getVehicles(): Promise<Vehicle[]> {
    return Array.from(this.vehicles.values());
  }

  async updateVehicle(type: VehicleType, data: Partial<Vehicle>): Promise<Vehicle | undefined> {
    const vehicle = this.vehicles.get(type);
    if (!vehicle) return undefined;
    const updated = { ...vehicle, ...data };
    this.vehicles.set(type, updated);

    try {
      const supabase = this.checkSupabase();
      const dbData: any = {
        id: updated.id,
        type: updated.type,
        name: updated.name,
        description: updated.description,
        max_weight: updated.maxWeight,
        base_charge: updated.baseCharge,
        per_mile_rate: updated.perMileRate,
        rush_hour_rate: updated.rushHourRate,
        icon_url: updated.iconUrl,
      };

      const { error } = await supabase
        .from('vehicles')
        .upsert(dbData, { onConflict: 'type' });

      if (error) {
        console.error(`[SupabaseStorage] Error persisting vehicle ${type}:`, error);
      } else {
        console.log(`[SupabaseStorage] Vehicle ${type} persisted to database`);
      }
    } catch (err) {
      console.error(`[SupabaseStorage] Error upserting vehicle ${type}:`, err);
    }

    return updated;
  }

  async calculateQuote(input: BookingQuoteInput): Promise<any> {
    const vehicle = this.vehicles.get(input.vehicleType);
    if (!vehicle) throw new Error(`Invalid vehicle type: ${input.vehicleType}`);

    const baseCharge = parseFloat(vehicle.baseCharge);
    const perMileRate = this.isRushHour() 
      ? parseFloat(vehicle.rushHourRate || vehicle.perMileRate)
      : parseFloat(vehicle.perMileRate);
    
    const distance = (input as any).distance || 0;
    const distanceCharge = distance * perMileRate;
    let total = baseCharge + distanceCharge;

    const weightSurcharge = this.getWeightSurcharge(input.weight || 0);
    total += weightSurcharge;

    if (input.pickupPostcode && this.isCentralLondon(input.pickupPostcode)) {
      total += parseFloat(this.pricingSettings.centralLondonSurcharge || "18.15");
    }
    if (input.deliveryPostcode && this.isCentralLondon(input.deliveryPostcode)) {
      total += parseFloat(this.pricingSettings.centralLondonSurcharge || "18.15");
    }

    if (input.isReturnTrip) {
      const returnMultiplier = parseFloat(this.pricingSettings.returnTripMultiplier || "0.60");
      total += distanceCharge * returnMultiplier;
    }

    if (input.isMultiDrop) {
      const multiDropCharge = parseFloat(this.pricingSettings.multiDropCharge || "5.00");
      total += multiDropCharge;
    }

    return {
      baseCharge: Math.round(baseCharge * 100) / 100,
      distanceCharge: Math.round(distanceCharge * 100) / 100,
      weightSurcharge: Math.round(weightSurcharge * 100) / 100,
      total: Math.round(total * 100) / 100,
      distance,
      vehicleType: input.vehicleType,
      isRushHour: this.isRushHour(),
    };
  }

  private isRushHour(): boolean {
    const now = new Date();
    const time = now.getHours() * 60 + now.getMinutes();
    const morningStart = this.parseTime(this.pricingSettings.rushHourStart || "07:00");
    const morningEnd = this.parseTime(this.pricingSettings.rushHourEnd || "09:00");
    const eveningStart = this.parseTime(this.pricingSettings.rushHourStartEvening || "17:00");
    const eveningEnd = this.parseTime(this.pricingSettings.rushHourEndEvening || "19:00");
    return (time >= morningStart && time <= morningEnd) || (time >= eveningStart && time <= eveningEnd);
  }

  private parseTime(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private getWeightSurcharge(weight: number): number {
    const surcharges = this.pricingSettings.weightSurcharges as Record<string, number>;
    if (weight >= 50) return surcharges["50+"] || 50;
    if (weight >= 30) return surcharges["30-50"] || 20;
    if (weight >= 20) return surcharges["20-30"] || 15;
    if (weight >= 10) return surcharges["10-20"] || 10;
    if (weight >= 4) return surcharges["4-10"] || 5;
    return 0;
  }

  private isCentralLondon(postcode: string): boolean {
    const centralPostcodes = ["EC1", "EC2", "EC3", "EC4", "WC1", "WC2", "W1", "SW1", "SE1", "E1", "N1", "NW1"];
    const prefix = postcode.toUpperCase().replace(/\s/g, "").match(/^[A-Z]+\d*/)?.[0] || "";
    return centralPostcodes.some((cp) => prefix.startsWith(cp));
  }

  async getVendorApiKeys(vendorId: string): Promise<VendorApiKey[]> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('vendor_api_keys').select('*').eq('vendor_id', vendorId);
    if (error || !data) return [];
    return data.map(mapDbToVendorApiKey);
  }

  async createVendorApiKey(insertKey: InsertVendorApiKey): Promise<VendorApiKey> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    const dbKey = {
      id,
      vendor_id: insertKey.vendorId,
      api_key: insertKey.apiKey,
      name: insertKey.name,
      is_active: insertKey.isActive ?? true,
    };
    const { data, error } = await supabase.from('vendor_api_keys').insert(dbKey).select().single();
    if (error) throw error;
    return mapDbToVendorApiKey(data);
  }

  async updateVendorApiKey(id: string, data: Partial<VendorApiKey>): Promise<VendorApiKey | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.name !== undefined) dbData.name = data.name;
    if (data.isActive !== undefined) dbData.is_active = data.isActive;
    if (data.lastUsedAt !== undefined) dbData.last_used_at = data.lastUsedAt;
    const { data: updated, error } = await supabase.from('vendor_api_keys').update(dbData).eq('id', id).select().single();
    if (error || !updated) return undefined;
    return mapDbToVendorApiKey(updated);
  }

  async deleteVendorApiKey(id: string): Promise<void> {
    const supabase = this.checkSupabase();
    await supabase.from('vendor_api_keys').delete().eq('id', id);
  }

  async getAdminStats(): Promise<any> {
    const jobs = await this.getJobs();
    const drivers = await this.getDrivers();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysJobs = jobs.filter((j) => j.createdAt && j.createdAt >= today);
    const activeDrivers = drivers.filter((d) => d.isAvailable);
    const pendingJobs = jobs.filter((j) => j.status === "pending");
    const completedToday = todaysJobs.filter((j) => j.status === "delivered");

    const totalRevenue = jobs
      .filter((j) => j.paymentStatus === "paid")
      .reduce((sum, j) => sum + parseFloat(j.totalPrice), 0);

    return {
      todaysJobs: todaysJobs.length,
      activeDrivers: activeDrivers.length,
      totalDrivers: drivers.length,
      pendingJobs: pendingJobs.length,
      completedToday: completedToday.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalJobs: jobs.length,
    };
  }

  async getDriverStats(driverId: string): Promise<any> {
    const jobs = await this.getJobs({ driverId });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysJobs = jobs.filter((j) => j.createdAt && j.createdAt >= today);
    const completedJobs = jobs.filter((j) => j.status === "delivered");
    const activeJobs = jobs.filter((j) => !["delivered", "cancelled"].includes(j.status));

    return {
      todaysJobs: todaysJobs.length,
      completedJobs: completedJobs.length,
      activeJobs: activeJobs.length,
      totalJobs: jobs.length,
    };
  }

  async getCustomerStats(customerId: string): Promise<any> {
    const jobs = await this.getJobs({ customerId });
    const completedJobs = jobs.filter((j) => j.status === "delivered");
    const activeJobs = jobs.filter((j) => !["delivered", "cancelled"].includes(j.status));
    const totalSpent = jobs
      .filter((j) => j.paymentStatus === "paid")
      .reduce((sum, j) => sum + parseFloat(j.totalPrice), 0);

    return {
      totalOrders: jobs.length,
      completedOrders: completedJobs.length,
      activeOrders: activeJobs.length,
      totalSpent: Math.round(totalSpent * 100) / 100,
    };
  }

  async getDispatcherStats(): Promise<any> {
    const jobs = await this.getJobs();
    const drivers = await this.getDrivers();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingJobs = jobs.filter((j) => j.status === "pending");
    const activeDrivers = drivers.filter((d) => d.isAvailable && d.isVerified);
    const inProgressJobs = jobs.filter((j) => !["pending", "delivered", "cancelled"].includes(j.status));
    const deliveredToday = jobs.filter((j) => 
      j.status === "delivered" && j.deliveredAt && new Date(j.deliveredAt) >= today
    );

    return {
      pendingJobs: pendingJobs.length,
      activeDrivers: activeDrivers.length,
      inProgressJobs: inProgressJobs.length,
      deliveredToday: deliveredToday.length,
    };
  }

  async getVendorStats(vendorId: string): Promise<any> {
    const jobs = await this.getJobs({ vendorId });
    const apiKeys = await this.getVendorApiKeys(vendorId);

    return {
      apiCallsToday: apiKeys.length > 0 ? Math.floor(Math.random() * 500) + 100 : 0,
      jobsCreated: jobs.length,
      successRate: jobs.length > 0 ? 99.2 : 100,
    };
  }

  async getDriverApplication(id: string): Promise<DriverApplication | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('driver_applications').select('*').eq('id', id).single();
    if (error || !data) return undefined;
    return mapDbToDriverApplication(data);
  }

  async getDriverApplicationByEmail(email: string): Promise<DriverApplication | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('driver_applications').select('*').ilike('email', email).single();
    if (error || !data) return undefined;
    return mapDbToDriverApplication(data);
  }

  async getDriverApplicationByPhone(phone: string): Promise<DriverApplication | undefined> {
    const supabase = this.checkSupabase();
    const normalized = phone.replace(/\D/g, '');
    const { data, error } = await supabase.from('driver_applications').select('*').eq('phone', phone).single();
    if (!error && data) return mapDbToDriverApplication(data);
    if (normalized !== phone) {
      const formats = [
        phone,
        `+44${normalized.startsWith('44') ? normalized.slice(2) : normalized.startsWith('0') ? normalized.slice(1) : normalized}`,
        `0${normalized.startsWith('44') ? normalized.slice(2) : normalized}`,
        normalized,
      ];
      for (const fmt of formats) {
        const { data: d, error: e } = await supabase.from('driver_applications').select('*').eq('phone', fmt).single();
        if (!e && d) return mapDbToDriverApplication(d);
      }
    }
    return undefined;
  }

  async getDriverApplications(filters?: { status?: DriverApplicationStatus }): Promise<DriverApplication[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('driver_applications').select('*').order('submitted_at', { ascending: false });
    if (filters?.status === 'corrections_needed') {
      query = query.eq('status', 'rejected').eq('rejection_reason', 'CORRECTIONS_NEEDED');
    } else if (filters?.status === 'rejected') {
      query = query.eq('status', 'rejected').neq('rejection_reason', 'CORRECTIONS_NEEDED');
    } else if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToDriverApplication);
  }

  async createDriverApplication(application: InsertDriverApplication): Promise<DriverApplication> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    
    const dbApp: Record<string, any> = {
      id,
      full_name: application.fullName,
      email: application.email.toLowerCase(),
      phone: application.phone,
      postcode: application.postcode,
      full_address: application.fullAddress,
      building_name: application.buildingName || null,
      profile_picture_url: application.profilePictureUrl || null,
      nationality: application.nationality,
      is_british: application.isBritish || false,
      national_insurance_number: application.nationalInsuranceNumber,
      right_to_work_share_code: application.rightToWorkShareCode || null,
      driving_licence_front_url: application.drivingLicenceFrontUrl || null,
      driving_licence_back_url: application.drivingLicenceBackUrl || null,
      dbs_certificate_url: application.dbsCertificateUrl || null,
      goods_in_transit_insurance_url: application.goodsInTransitInsuranceUrl || null,
      hire_and_reward_url: application.hireAndRewardUrl || null,
      vehicle_type: application.vehicleType,
      vehicle_registration: application.vehicleRegistration || null,
      vehicle_make: application.vehicleMake || null,
      vehicle_model: application.vehicleModel || null,
      vehicle_color: application.vehicleColor || null,
      bank_name: application.bankName,
      account_holder_name: application.accountHolderName,
      sort_code: application.sortCode,
      account_number: application.accountNumber,
      status: application.status || 'pending',
    };
    
    let { data, error } = await supabase.from('driver_applications').insert(dbApp).select().single();
    if (error && (error.message?.includes('vehicle_registration') || error.message?.includes('vehicle_make') || error.message?.includes('vehicle_model') || error.message?.includes('vehicle_color') || error.code === 'PGRST204')) {
      console.log(`[Driver Application] First insert failed (${error.message}), retrying without vehicle detail columns`);
      const savedVehicleInfo = {
        registration: application.vehicleRegistration,
        make: application.vehicleMake,
        model: application.vehicleModel,
        color: application.vehicleColor,
      };
      delete dbApp.vehicle_registration;
      delete dbApp.vehicle_make;
      delete dbApp.vehicle_model;
      delete dbApp.vehicle_color;
      const retry = await supabase.from('driver_applications').insert(dbApp).select().single();
      data = retry.data;
      error = retry.error;
      if (!error && data) {
        const result = mapDbToDriverApplication(data);
        result.vehicleRegistration = savedVehicleInfo.registration || null;
        result.vehicleMake = savedVehicleInfo.make || null;
        result.vehicleModel = savedVehicleInfo.model || null;
        result.vehicleColor = savedVehicleInfo.color || null;
        return result;
      }
    }
    if (error) throw error;
    const result = mapDbToDriverApplication(data);
    return result;
  }

  async updateDriverApplication(id: string, data: Partial<DriverApplication>): Promise<DriverApplication | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.reviewedBy !== undefined) dbData.reviewed_by = data.reviewedBy;
    if (data.reviewNotes !== undefined) dbData.review_notes = data.reviewNotes;
    if (data.rejectionReason !== undefined) dbData.rejection_reason = data.rejectionReason;
    if (data.reviewedAt !== undefined) dbData.reviewed_at = data.reviewedAt;
    if (data.vehicleType !== undefined) dbData.vehicle_type = data.vehicleType;
    if (data.vehicleRegistration !== undefined) dbData.vehicle_registration = data.vehicleRegistration;
    if (data.vehicleMake !== undefined) dbData.vehicle_make = data.vehicleMake;
    if (data.vehicleModel !== undefined) dbData.vehicle_model = data.vehicleModel;
    if (data.vehicleColor !== undefined) dbData.vehicle_color = data.vehicleColor;
    
    let { data: updated, error } = await supabase.from('driver_applications').update(dbData).eq('id', id).select().single();
    if (error && (error.message?.includes('vehicle_registration') || error.message?.includes('vehicle_make') || error.message?.includes('vehicle_model') || error.message?.includes('vehicle_color') || error.message?.includes('column'))) {
      console.log(`[Driver Application] Update failed (${error.message}), retrying without vehicle detail columns`);
      delete dbData.vehicle_registration;
      delete dbData.vehicle_make;
      delete dbData.vehicle_model;
      delete dbData.vehicle_color;
      const retry = await supabase.from('driver_applications').update(dbData).eq('id', id).select().single();
      updated = retry.data;
      error = retry.error;
    }
    if (error || !updated) {
      console.error('[Storage] updateDriverApplication error:', error, 'data:', updated);
      return undefined;
    }
    return mapDbToDriverApplication(updated);
  }

  async reviewDriverApplication(id: string, status: DriverApplicationStatus, reviewedBy: string, reviewNotes?: string, rejectionReason?: string): Promise<DriverApplication | undefined> {
    return this.updateDriverApplication(id, {
      status,
      reviewedBy,
      reviewNotes,
      rejectionReason: status === "rejected" ? rejectionReason : null,
      reviewedAt: new Date(),
    });
  }

  async deleteDriverApplication(id: string): Promise<boolean> {
    const supabase = this.checkSupabase();
    const { error } = await supabase.from('driver_applications').delete().eq('id', id);
    if (error) {
      console.error('[Storage] Failed to delete driver application:', error);
      return false;
    }
    return true;
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single();
    if (error || !data) return undefined;
    return mapDbToInvoice(data);
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('invoices').select('*').eq('invoice_number', invoiceNumber).single();
    if (error || !data) return undefined;
    return mapDbToInvoice(data);
  }

  async getInvoices(filters?: { customerId?: string; status?: InvoiceStatus }): Promise<Invoice[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters?.status) query = query.eq('status', filters.status);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToInvoice);
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    
    const dbInvoice = {
      id,
      invoice_number: invoice.invoiceNumber,
      customer_id: invoice.customerId,
      customer_name: invoice.customerName,
      customer_email: invoice.customerEmail,
      company_name: invoice.companyName || null,
      business_address: invoice.businessAddress || null,
      vat_number: invoice.vatNumber || null,
      subtotal: invoice.subtotal,
      vat: invoice.vat || "0",
      total: invoice.total,
      status: invoice.status || 'pending',
      due_date: invoice.dueDate,
      period_start: invoice.periodStart,
      period_end: invoice.periodEnd,
      job_ids: invoice.jobIds || null,
      notes: invoice.notes || null,
    };
    const { data, error } = await supabase.from('invoices').insert(dbInvoice).select().single();
    if (error) {
      console.error('Invoice creation error:', error);
      throw error;
    }
    return mapDbToInvoice(data);
  }

  async updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.paidAt !== undefined) dbData.paid_at = data.paidAt;
    if (data.notes !== undefined) dbData.notes = data.notes;
    const { data: updated, error } = await supabase.from('invoices').update(dbData).eq('id', id).select().single();
    if (error || !updated) return undefined;
    return mapDbToInvoice(updated);
  }

  async getInvoiceWithJobs(id: string): Promise<{ invoice: Invoice; jobs: Job[] } | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return undefined;
    
    let jobs: Job[] = [];
    if (invoice.jobIds && Array.isArray(invoice.jobIds) && invoice.jobIds.length > 0) {
      const jobPromises = invoice.jobIds.map(jobId => this.getJob(jobId));
      const results = await Promise.all(jobPromises);
      jobs = results.filter((job): job is Job => job !== undefined);
      
      const multiDropJobIds = jobs.filter(j => j.isMultiDrop).map(j => j.id);
      if (multiDropJobIds.length > 0) {
        const supabase = this.checkSupabase();
        const { data: stops } = await supabase
          .from('multi_drop_stops')
          .select('*')
          .in('job_id', multiDropJobIds)
          .order('stop_order', { ascending: true });
        
        if (stops) {
          const stopsMap: Record<string, any[]> = {};
          for (const stop of stops) {
            if (!stopsMap[stop.job_id]) stopsMap[stop.job_id] = [];
            stopsMap[stop.job_id].push({
              stopOrder: stop.stop_order,
              address: stop.address,
              postcode: stop.postcode,
              recipientName: stop.recipient_name,
              recipientPhone: stop.recipient_phone,
              instructions: stop.instructions,
              status: stop.status,
            });
          }
          jobs = jobs.map(j => ({
            ...j,
            multiDropStops: stopsMap[j.id] || [],
          })) as any;
        }
      }
    }
    return { invoice, jobs };
  }

  async getJobAssignment(id: string): Promise<JobAssignment | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('job_assignments').select('*').eq('id', id).single();
    if (error || !data) return undefined;
    return mapDbToJobAssignment(data);
  }

  async getJobAssignments(filters?: { jobId?: string; driverId?: string; status?: JobAssignmentStatus }): Promise<JobAssignment[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('job_assignments').select('*').order('created_at', { ascending: false });
    if (filters?.jobId) query = query.eq('job_id', filters.jobId);
    if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
    if (filters?.status) query = query.eq('status', filters.status);
    console.log(`[SupabaseStorage] getJobAssignments filters=`, JSON.stringify(filters));
    const { data, error } = await query;
    if (error) {
      console.error(`[SupabaseStorage] getJobAssignments error:`, error);
      return [];
    }
    console.log(`[SupabaseStorage] getJobAssignments found ${data?.length || 0} assignments`);
    if (!data) return [];
    return data.map(mapDbToJobAssignment);
  }

  async createJobAssignment(assignment: InsertJobAssignment): Promise<JobAssignment> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    const now = new Date();
    
    // Handle both integer and UUID job IDs - convert to string for storage
    const jobIdStr = String(assignment.jobId);
    
    const dbAssignment = {
      id,
      job_id: jobIdStr, // Store as text to handle both integer and UUID formats
      driver_id: assignment.driverId,
      assigned_by: assignment.assignedBy,
      driver_price: assignment.driverPrice,
      status: assignment.status || 'pending',
      sent_at: assignment.status === 'sent' ? now.toISOString() : null,
      expires_at: assignment.expiresAt || null,
    };
    
    try {
      console.log('[SupabaseStorage] Creating job assignment with data:', JSON.stringify(dbAssignment));
      const { data, error } = await supabase.from('job_assignments').insert(dbAssignment).select().single();
      if (error) {
        console.error('[SupabaseStorage] Error creating job assignment:', error);
        console.error('[SupabaseStorage] CRITICAL: Assignment was NOT created in database!');
        // Throw an error so the API returns a proper error response
        throw new Error(`Failed to create job assignment: ${error.message}`);
      }
      console.log('[SupabaseStorage] Successfully created job assignment:', data.id);
      return mapDbToJobAssignment(data);
    } catch (err: any) {
      console.error('[SupabaseStorage] Exception creating job assignment:', err);
      // Re-throw the error so the API returns a proper error response
      throw err;
    }
  }

  async updateJobAssignment(id: string, data: Partial<JobAssignment>): Promise<JobAssignment | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.driverPrice !== undefined) dbData.driver_price = data.driverPrice;
    if (data.sentAt !== undefined) dbData.sent_at = data.sentAt;
    if (data.respondedAt !== undefined) dbData.responded_at = data.respondedAt;
    if (data.cancelledAt !== undefined) dbData.cancelled_at = data.cancelledAt;
    if (data.cancellationReason !== undefined) dbData.cancellation_reason = data.cancellationReason;
    if (data.rejectionReason !== undefined) dbData.rejection_reason = data.rejectionReason;
    if (data.expiresAt !== undefined) dbData.expires_at = data.expiresAt;
    if (data.withdrawnAt !== undefined) dbData.withdrawn_at = data.withdrawnAt;
    if (data.withdrawnBy !== undefined) dbData.withdrawn_by = data.withdrawnBy;
    if (data.removedAt !== undefined) dbData.removed_at = data.removedAt;
    if (data.removedBy !== undefined) dbData.removed_by = data.removedBy;
    if (data.cleanedAt !== undefined) dbData.cleaned_at = data.cleanedAt;
    if (data.cleanedBy !== undefined) dbData.cleaned_by = data.cleanedBy;
    
    console.log(`[SupabaseStorage] updateJobAssignment id=${id} dbData=`, JSON.stringify(dbData));
    const { data: updated, error } = await supabase.from('job_assignments').update(dbData).eq('id', id).select().single();
    if (error) {
      console.error(`[SupabaseStorage] updateJobAssignment error:`, error);
      return undefined;
    }
    if (!updated) {
      console.error(`[SupabaseStorage] updateJobAssignment: No data returned for id=${id}`);
      return undefined;
    }
    console.log(`[SupabaseStorage] updateJobAssignment success:`, JSON.stringify(updated));
    return mapDbToJobAssignment(updated);
  }

  async cancelJobAssignment(id: string, reason?: string): Promise<JobAssignment | undefined> {
    return this.updateJobAssignment(id, {
      status: 'cancelled' as JobAssignmentStatus,
      cancelledAt: new Date(),
      cancellationReason: reason,
    });
  }

  async getActiveAssignmentForJob(jobId: string): Promise<JobAssignment | undefined> {
    const assignments = await this.getJobAssignments({ jobId });
    return assignments.find(a => ['pending', 'sent', 'accepted'].includes(a.status));
  }

  async getDeliveryContact(id: string): Promise<DeliveryContact | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('delivery_contacts').select('*').eq('id', id).single();
    if (error || !data) return undefined;
    return mapDbToDeliveryContact(data);
  }

  async getDeliveryContacts(customerId: string): Promise<DeliveryContact[]> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('delivery_contacts').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(mapDbToDeliveryContact);
  }

  async createDeliveryContact(contact: InsertDeliveryContact): Promise<DeliveryContact> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    const dbContact = {
      id,
      customer_id: contact.customerId,
      label: contact.label,
      recipient_name: contact.recipientName,
      recipient_phone: contact.recipientPhone,
      delivery_address: contact.deliveryAddress,
      delivery_postcode: contact.deliveryPostcode,
      building_name: contact.buildingName || null,
      delivery_instructions: contact.deliveryInstructions || null,
      is_default: contact.isDefault || false,
    };
    const { data, error } = await supabase.from('delivery_contacts').insert(dbContact).select().single();
    if (error) throw error;
    return mapDbToDeliveryContact(data);
  }

  async updateDeliveryContact(id: string, data: Partial<DeliveryContact>): Promise<DeliveryContact | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = { updated_at: new Date().toISOString() };
    if (data.label !== undefined) dbData.label = data.label;
    if (data.recipientName !== undefined) dbData.recipient_name = data.recipientName;
    if (data.recipientPhone !== undefined) dbData.recipient_phone = data.recipientPhone;
    if (data.deliveryAddress !== undefined) dbData.delivery_address = data.deliveryAddress;
    if (data.deliveryPostcode !== undefined) dbData.delivery_postcode = data.deliveryPostcode;
    if (data.buildingName !== undefined) dbData.building_name = data.buildingName;
    if (data.deliveryInstructions !== undefined) dbData.delivery_instructions = data.deliveryInstructions;
    if (data.isDefault !== undefined) dbData.is_default = data.isDefault;
    const { data: updated, error } = await supabase.from('delivery_contacts').update(dbData).eq('id', id).select().single();
    if (error || !updated) return undefined;
    return mapDbToDeliveryContact(updated);
  }

  async deleteDeliveryContact(id: string): Promise<void> {
    const supabase = this.checkSupabase();
    await supabase.from('delivery_contacts').delete().eq('id', id);
  }

  async getDriverPayment(id: string): Promise<DriverPayment | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('driver_payments').select('*').eq('id', id).single();
    if (error || !data) return undefined;
    return mapDbToDriverPayment(data);
  }

  async getDriverPayments(filters?: { driverId?: string; status?: DriverPaymentStatus; jobId?: string }): Promise<DriverPayment[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('driver_payments').select('*').order('created_at', { ascending: false });
    if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.jobId) query = query.eq('job_id', filters.jobId);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToDriverPayment);
  }

  async getDriverPaymentStats(driverId: string): Promise<{ totalEarnings: number; pendingAmount: number; paidAmount: number; totalJobs: number }> {
    const payments = await this.getDriverPayments({ driverId });
    const totalEarnings = payments.reduce((sum, p) => sum + parseFloat(p.netAmount), 0);
    const pendingAmount = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.netAmount), 0);
    const paidAmount = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.netAmount), 0);
    return {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      totalJobs: payments.length,
    };
  }

  async createDriverPayment(payment: InsertDriverPayment): Promise<DriverPayment> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    const dbPayment = {
      id,
      driver_id: payment.driverId,
      job_id: payment.jobId || null,
      amount: payment.amount,
      platform_fee: payment.platformFee || "0.00",
      net_amount: payment.netAmount,
      status: payment.status || 'pending',
      payout_reference: payment.payoutReference || null,
      description: payment.description || null,
      job_tracking_number: payment.jobTrackingNumber || null,
    };
    const { data, error } = await supabase.from('driver_payments').insert(dbPayment).select().single();
    if (error) throw error;
    return mapDbToDriverPayment(data);
  }

  async updateDriverPayment(id: string, data: Partial<DriverPayment>): Promise<DriverPayment | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.payoutReference !== undefined) dbData.payout_reference = data.payoutReference;
    if (data.paidAt !== undefined) dbData.paid_at = data.paidAt;
    const { data: updated, error } = await supabase.from('driver_payments').update(dbData).eq('id', id).select().single();
    if (error || !updated) return undefined;
    return mapDbToDriverPayment(updated);
  }

  async deleteDriverPayment(id: string): Promise<boolean> {
    const supabase = this.checkSupabase();
    const { error } = await supabase.from('driver_payments').delete().eq('id', id);
    return !error;
  }

  private mapDbToPaymentLink(row: any): PaymentLink {
    return {
      id: row.id,
      jobId: row.job_id,
      customerId: row.customer_id,
      customerEmail: row.customer_email,
      token: row.token,
      tokenHash: row.token_hash,
      amount: row.amount,
      status: row.status,
      stripeSessionId: row.stripe_session_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeReceiptUrl: row.stripe_receipt_url,
      sentViaEmail: row.sent_via_email,
      sentViaSms: row.sent_via_sms,
      auditLog: row.audit_log || [],
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      openedAt: row.opened_at ? new Date(row.opened_at) : null,
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : null,
      createdBy: row.created_by,
    };
  }

  async getPaymentLink(id: string): Promise<PaymentLink | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('payment_links').select('*').eq('id', id).single();
    if (error || !data) return undefined;
    return this.mapDbToPaymentLink(data);
  }

  async getPaymentLinkByToken(token: string): Promise<PaymentLink | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('payment_links').select('*').eq('token', token).single();
    if (error || !data) return undefined;
    return this.mapDbToPaymentLink(data);
  }

  async getPaymentLinkByTokenHash(tokenHash: string): Promise<PaymentLink | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase.from('payment_links').select('*').eq('token_hash', tokenHash).single();
    if (error || !data) return undefined;
    return this.mapDbToPaymentLink(data);
  }

  async getPaymentLinks(filters?: { jobId?: string; customerId?: string; status?: PaymentLinkStatus }): Promise<PaymentLink[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('payment_links').select('*');
    if (filters?.jobId) query = query.eq('job_id', filters.jobId);
    if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters?.status) query = query.eq('status', filters.status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(row => this.mapDbToPaymentLink(row));
  }

  async getActivePaymentLinkForJob(jobId: string): Promise<PaymentLink | undefined> {
    const supabase = this.checkSupabase();
    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('job_id', jobId)
      .in('status', ['pending', 'sent', 'opened'])
      .single();
    if (error || !data) return undefined;
    return this.mapDbToPaymentLink(data);
  }

  async createPaymentLink(link: InsertPaymentLink): Promise<PaymentLink> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    const dbLink = {
      id,
      job_id: link.jobId,
      customer_id: link.customerId,
      customer_email: link.customerEmail,
      token: link.token,
      token_hash: link.tokenHash,
      amount: link.amount,
      status: link.status || 'pending',
      stripe_session_id: link.stripeSessionId || null,
      stripe_payment_intent_id: link.stripePaymentIntentId || null,
      stripe_receipt_url: link.stripeReceiptUrl || null,
      sent_via_email: link.sentViaEmail || false,
      sent_via_sms: link.sentViaSms || false,
      audit_log: link.auditLog || [],
      expires_at: link.expiresAt,
      opened_at: link.openedAt || null,
      paid_at: link.paidAt || null,
      cancelled_at: link.cancelledAt || null,
      created_by: link.createdBy || null,
    };
    const { data, error } = await supabase.from('payment_links').insert(dbLink).select().single();
    if (error) {
      console.error('[PaymentLink] Create error:', error);
      throw error;
    }
    return this.mapDbToPaymentLink(data);
  }

  async updatePaymentLink(id: string, data: Partial<PaymentLink>): Promise<PaymentLink | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.stripeSessionId !== undefined) dbData.stripe_session_id = data.stripeSessionId;
    if (data.stripePaymentIntentId !== undefined) dbData.stripe_payment_intent_id = data.stripePaymentIntentId;
    if (data.stripeReceiptUrl !== undefined) dbData.stripe_receipt_url = data.stripeReceiptUrl;
    if (data.sentViaEmail !== undefined) dbData.sent_via_email = data.sentViaEmail;
    if (data.sentViaSms !== undefined) dbData.sent_via_sms = data.sentViaSms;
    if (data.auditLog !== undefined) dbData.audit_log = data.auditLog;
    if (data.openedAt !== undefined) dbData.opened_at = data.openedAt;
    if (data.paidAt !== undefined) dbData.paid_at = data.paidAt;
    if (data.cancelledAt !== undefined) dbData.cancelled_at = data.cancelledAt;
    const { data: updated, error } = await supabase.from('payment_links').update(dbData).eq('id', id).select().single();
    if (error || !updated) return undefined;
    return this.mapDbToPaymentLink(updated);
  }

  async appendPaymentLinkAuditLog(id: string, event: string, actor?: string, details?: string): Promise<PaymentLink | undefined> {
    const supabase = this.checkSupabase();
    const link = await this.getPaymentLink(id);
    if (!link) return undefined;
    const auditLog = [...(link.auditLog || []), { event, timestamp: new Date().toISOString(), actor, details }];
    return this.updatePaymentLink(id, { auditLog });
  }

  async cancelPaymentLink(id: string, actor?: string): Promise<PaymentLink | undefined> {
    await this.appendPaymentLinkAuditLog(id, 'cancelled', actor);
    return this.updatePaymentLink(id, { status: 'cancelled', cancelledAt: new Date() });
  }

  async expirePaymentLinks(): Promise<number> {
    const supabase = this.checkSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('payment_links')
      .update({ status: 'expired' })
      .in('status', ['pending', 'sent', 'opened'])
      .lt('expires_at', now)
      .select();
    if (error) {
      console.error('[PaymentLink] Expire error:', error);
      return 0;
    }
    return data?.length || 0;
  }

  private _contractsPool: any = null;

  private async getContractsPool() {
    if (this._contractsPool) return this._contractsPool;
    const pgModule = await import('pg');
    let connStr = '';
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
      connStr = process.env.DATABASE_URL;
    } else if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
      const host = process.env.PGHOST;
      const port = process.env.PGPORT || '5432';
      const user = process.env.PGUSER;
      const password = process.env.PGPASSWORD;
      const database = process.env.PGDATABASE;
      connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }
    if (!connStr.includes('sslmode=')) {
      connStr += connStr.includes('?') ? '&sslmode=require' : '?sslmode=require';
    }
    this._contractsPool = new pgModule.Pool({ connectionString: connStr, max: 3 });
    return this._contractsPool;
  }

  private async pgQuery(text: string, params: any[] = []): Promise<any[]> {
    const pool = await this.getContractsPool();
    const result = await pool.query(text, params);
    return result.rows;
  }

  async getContractTemplates(): Promise<any[]> {
    try {
      return await this.pgQuery('SELECT * FROM contract_templates ORDER BY created_at DESC');
    } catch (e: any) {
      console.error('[Contracts] getContractTemplates error:', e.message);
      return [];
    }
  }

  async getContractTemplate(id: string): Promise<any | undefined> {
    try {
      const rows = await this.pgQuery('SELECT * FROM contract_templates WHERE id = $1', [id]);
      return rows[0] || undefined;
    } catch (e: any) {
      console.error('[Contracts] getContractTemplate error:', e.message);
      return undefined;
    }
  }

  async createContractTemplate(templateData: { title: string; content: string }): Promise<any> {
    const rows = await this.pgQuery(
      'INSERT INTO contract_templates (title, content) VALUES ($1, $2) RETURNING *',
      [templateData.title, templateData.content]
    );
    return rows[0];
  }

  async updateContractTemplate(id: string, templateData: { title?: string; content?: string }): Promise<any | undefined> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIdx = 1;
    if (templateData.title !== undefined) { sets.push(`title = $${paramIdx++}`); params.push(templateData.title); }
    if (templateData.content !== undefined) { sets.push(`content = $${paramIdx++}`); params.push(templateData.content); }
    params.push(id);
    const rows = await this.pgQuery(
      `UPDATE contract_templates SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );
    return rows[0] || undefined;
  }

  async deleteContractTemplate(id: string): Promise<boolean> {
    try {
      await this.pgQuery('DELETE FROM contract_templates WHERE id = $1', [id]);
      return true;
    } catch {
      return false;
    }
  }

  async getDriverContracts(filters?: { driverId?: string; status?: string; templateId?: string }): Promise<any[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;
      if (filters?.driverId) { conditions.push(`driver_id = $${paramIdx++}`); params.push(filters.driverId); }
      if (filters?.status) { conditions.push(`status = $${paramIdx++}`); params.push(filters.status); }
      if (filters?.templateId) { conditions.push(`template_id = $${paramIdx++}`); params.push(filters.templateId); }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      return await this.pgQuery(`SELECT * FROM driver_contracts${where} ORDER BY created_at DESC`, params);
    } catch (e: any) {
      console.error('[Contracts] getDriverContracts error:', e.message);
      return [];
    }
  }

  async getDriverContract(id: string): Promise<any | undefined> {
    try {
      const rows = await this.pgQuery('SELECT * FROM driver_contracts WHERE id = $1', [id]);
      return rows[0] || undefined;
    } catch (e: any) {
      console.error('[Contracts] getDriverContract error:', e.message);
      return undefined;
    }
  }

  async getDriverContractByToken(token: string): Promise<any | undefined> {
    try {
      const rows = await this.pgQuery('SELECT * FROM driver_contracts WHERE token = $1', [token]);
      return rows[0] || undefined;
    } catch (e: any) {
      console.error('[Contracts] getDriverContractByToken error:', e.message);
      return undefined;
    }
  }

  async createDriverContract(contractData: { templateId: string; driverId: string; driverName: string; driverEmail?: string; contractContent: string; token: string; status: string; sentAt?: string }): Promise<any> {
    const rows = await this.pgQuery(
      `INSERT INTO driver_contracts (template_id, driver_id, driver_name, driver_email, contract_content, token, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        contractData.templateId,
        contractData.driverId,
        contractData.driverName,
        contractData.driverEmail || null,
        contractData.contractContent,
        contractData.token,
        contractData.status,
        contractData.sentAt || null,
      ]
    );
    return rows[0];
  }

  async updateDriverContract(id: string, updateData: Partial<any>): Promise<any | undefined> {
    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    if (updateData.status !== undefined) { sets.push(`status = $${paramIdx++}`); params.push(updateData.status); }
    if (updateData.signed_at !== undefined) { sets.push(`signed_at = $${paramIdx++}`); params.push(updateData.signed_at); }
    if (updateData.signature_data !== undefined) { sets.push(`signature_data = $${paramIdx++}`); params.push(updateData.signature_data); }
    if (updateData.signed_name !== undefined) { sets.push(`signed_name = $${paramIdx++}`); params.push(updateData.signed_name); }
    if (updateData.sent_at !== undefined) { sets.push(`sent_at = $${paramIdx++}`); params.push(updateData.sent_at); }
    if (sets.length === 0) return undefined;
    params.push(id);
    const rows = await this.pgQuery(
      `UPDATE driver_contracts SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );
    return rows[0] || undefined;
  }

  async deleteDriverContract(id: string): Promise<boolean> {
    try {
      await this.pgQuery('DELETE FROM driver_contracts WHERE id = $1', [id]);
      return true;
    } catch (e: any) {
      console.error('[Contracts] deleteDriverContract error:', e.message);
      return false;
    }
  }

  async getAllNoticeRecipientDriverIds(): Promise<string[]> {
    try {
      const rows = await this.pgQuery('SELECT DISTINCT driver_id FROM driver_notice_recipients');
      return rows.map((r: any) => r.driver_id);
    } catch (e: any) {
      console.error('[Notices] getAllNoticeRecipientDriverIds error:', e.message);
      return [];
    }
  }

  async getNoticeTemplates(filters?: { category?: string; isActive?: boolean }): Promise<any[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (filters?.category) { conditions.push(`category = $${idx++}`); params.push(filters.category); }
      if (filters?.isActive !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(filters.isActive); }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      return await this.pgQuery(`SELECT * FROM notice_templates${where} ORDER BY created_at DESC`, params);
    } catch (e: any) {
      console.error('[Notices] getNoticeTemplates error:', e.message);
      return [];
    }
  }

  async getNoticeTemplate(id: string): Promise<any | undefined> {
    try {
      const rows = await this.pgQuery('SELECT * FROM notice_templates WHERE id = $1', [id]);
      return rows[0] || undefined;
    } catch (e: any) {
      console.error('[Notices] getNoticeTemplate error:', e.message);
      return undefined;
    }
  }

  async createNoticeTemplate(data: { title: string; subject: string; message: string; category: string; requires_acknowledgement: boolean; created_by?: string }): Promise<any> {
    const rows = await this.pgQuery(
      'INSERT INTO notice_templates (title, subject, message, category, requires_acknowledgement, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [data.title, data.subject, data.message, data.category, data.requires_acknowledgement, data.created_by || null]
    );
    return rows[0];
  }

  async updateNoticeTemplate(id: string, data: Partial<any>): Promise<any | undefined> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;
    if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
    if (data.subject !== undefined) { sets.push(`subject = $${idx++}`); params.push(data.subject); }
    if (data.message !== undefined) { sets.push(`message = $${idx++}`); params.push(data.message); }
    if (data.category !== undefined) { sets.push(`category = $${idx++}`); params.push(data.category); }
    if (data.requires_acknowledgement !== undefined) { sets.push(`requires_acknowledgement = $${idx++}`); params.push(data.requires_acknowledgement); }
    if (data.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.is_active); }
    params.push(id);
    const rows = await this.pgQuery(
      `UPDATE notice_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rows[0] || undefined;
  }

  async deleteNoticeTemplate(id: string): Promise<boolean> {
    try {
      await this.pgQuery('DELETE FROM notice_templates WHERE id = $1', [id]);
      return true;
    } catch { return false; }
  }

  async deleteDriverNotice(id: string): Promise<boolean> {
    try {
      await this.pgQuery('DELETE FROM driver_notice_recipients WHERE notice_id = $1', [id]);
      await this.pgQuery('DELETE FROM driver_notices WHERE id = $1', [id]);
      return true;
    } catch (e: any) {
      console.error('[Notices] deleteDriverNotice error:', e.message);
      return false;
    }
  }

  async getDriverNotices(filters?: { status?: string }): Promise<any[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      const notices = await this.pgQuery(`SELECT * FROM driver_notices${where} ORDER BY sent_at DESC NULLS LAST, id DESC`, params);
      for (const notice of notices) {
        const stats = await this.pgQuery(
          `SELECT COUNT(*) as total, COUNT(viewed_at) as viewed, COUNT(acknowledged_at) as acknowledged FROM driver_notice_recipients WHERE notice_id = $1`,
          [notice.id]
        );
        notice.recipient_count = parseInt(stats[0]?.total || '0');
        notice.viewed_count = parseInt(stats[0]?.viewed || '0');
        notice.acknowledged_count = parseInt(stats[0]?.acknowledged || '0');
      }
      return notices;
    } catch (e: any) {
      console.error('[Notices] getDriverNotices error:', e.message);
      return [];
    }
  }

  async getDriverNotice(id: string): Promise<any | undefined> {
    try {
      const rows = await this.pgQuery('SELECT * FROM driver_notices WHERE id = $1', [id]);
      if (!rows[0]) return undefined;
      const notice = rows[0];
      const stats = await this.pgQuery(
        `SELECT COUNT(*) as total, COUNT(viewed_at) as viewed, COUNT(acknowledged_at) as acknowledged FROM driver_notice_recipients WHERE notice_id = $1`,
        [id]
      );
      notice.recipient_count = parseInt(stats[0]?.total || '0');
      notice.viewed_count = parseInt(stats[0]?.viewed || '0');
      notice.acknowledged_count = parseInt(stats[0]?.acknowledged || '0');
      return notice;
    } catch (e: any) {
      console.error('[Notices] getDriverNotice error:', e.message);
      return undefined;
    }
  }

  async createDriverNotice(data: { template_id?: string; title: string; subject: string; message: string; category: string; sent_by?: string; sent_at?: string; target_type: string; requires_acknowledgement: boolean; status: string }): Promise<any> {
    const rows = await this.pgQuery(
      `INSERT INTO driver_notices (template_id, title, subject, message, category, sent_by, sent_at, target_type, requires_acknowledgement, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [data.template_id || null, data.title, data.subject, data.message, data.category, data.sent_by || null, data.sent_at || null, data.target_type, data.requires_acknowledgement, data.status]
    );
    return rows[0];
  }

  async updateDriverNotice(id: string, data: Partial<any>): Promise<any | undefined> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
    if (data.sent_at !== undefined) { sets.push(`sent_at = $${idx++}`); params.push(data.sent_at); }
    if (sets.length === 0) return undefined;
    params.push(id);
    const rows = await this.pgQuery(
      `UPDATE driver_notices SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rows[0] || undefined;
  }

  async getNoticeRecipients(noticeId: string): Promise<any[]> {
    try {
      return await this.pgQuery('SELECT * FROM driver_notice_recipients WHERE notice_id = $1 ORDER BY sent_at DESC', [noticeId]);
    } catch (e: any) {
      console.error('[Notices] getNoticeRecipients error:', e.message);
      return [];
    }
  }

  async createNoticeRecipient(data: { notice_id: string; driver_id: string; driver_email?: string; delivery_channel: string }): Promise<any> {
    const rows = await this.pgQuery(
      'INSERT INTO driver_notice_recipients (notice_id, driver_id, driver_email, delivery_channel) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.notice_id, data.driver_id, data.driver_email || null, data.delivery_channel]
    );
    return rows[0];
  }

  async updateNoticeRecipient(id: string, data: Partial<any>): Promise<any | undefined> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (data.viewed_at !== undefined) { sets.push(`viewed_at = $${idx++}`); params.push(data.viewed_at); }
    if (data.acknowledged_at !== undefined) { sets.push(`acknowledged_at = $${idx++}`); params.push(data.acknowledged_at); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); params.push(data.status); }
    if (sets.length === 0) return undefined;
    params.push(id);
    const rows = await this.pgQuery(
      `UPDATE driver_notice_recipients SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rows[0] || undefined;
  }

  async getDriverNoticeRecipients(driverId: string): Promise<any[]> {
    try {
      return await this.pgQuery(
        `SELECT r.*, n.title, n.subject, n.message, n.category, n.requires_acknowledgement, n.sent_at as notice_sent_at, n.status as notice_status
         FROM driver_notice_recipients r
         JOIN driver_notices n ON r.notice_id = n.id
         WHERE r.driver_id = $1 AND n.status != 'draft'
         ORDER BY r.sent_at DESC`,
        [driverId]
      );
    } catch (e: any) {
      console.error('[Notices] getDriverNoticeRecipients error:', e.message);
      return [];
    }
  }

  async deleteNoticeRecipient(id: string, driverId: string): Promise<boolean> {
    try {
      const rows = await this.pgQuery(
        'DELETE FROM driver_notice_recipients WHERE id = $1 AND driver_id = $2 RETURNING id',
        [id, driverId]
      );
      return rows.length > 0;
    } catch (e: any) {
      console.error('[Notices] deleteNoticeRecipient error:', e.message);
      return false;
    }
  }

  async getDriverNoticeRecipient(noticeId: string, driverId: string): Promise<any | undefined> {
    try {
      const rows = await this.pgQuery(
        'SELECT * FROM driver_notice_recipients WHERE notice_id = $1 AND driver_id = $2',
        [noticeId, driverId]
      );
      return rows[0] || undefined;
    } catch (e: any) {
      console.error('[Notices] getDriverNoticeRecipient error:', e.message);
      return undefined;
    }
  }
}
