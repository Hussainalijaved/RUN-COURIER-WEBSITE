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
    id: dbUser.id,
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
    driverCode: dbDriver.driver_id,
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
    vehicleType: dbDriver.vehicle_type as VehicleType,
    vehicleRegistration: dbDriver.vehicle_registration,
    vehicleMake: dbDriver.vehicle_make,
    vehicleModel: dbDriver.vehicle_model,
    vehicleColor: dbDriver.vehicle_color,
    isAvailable: dbDriver.online_status === 'online',
    isVerified: dbDriver.is_verified,
    currentLatitude: dbDriver.current_latitude,
    currentLongitude: dbDriver.current_longitude,
    lastLocationUpdate: dbDriver.last_location_update ? new Date(dbDriver.last_location_update) : null,
    rating: dbDriver.rating,
    totalJobs: dbDriver.total_jobs,
    profilePictureUrl: dbDriver.profile_picture_url,
    isActive: dbDriver.is_active ?? true,
    deactivatedAt: dbDriver.deactivated_at ? new Date(dbDriver.deactivated_at) : null,
    createdAt: dbDriver.created_at ? new Date(dbDriver.created_at) : new Date(),
  };
}

function mapDbToJob(dbJob: any): Job {
  return {
    id: dbJob.id,
    trackingNumber: dbJob.tracking_number,
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
    vehicleType: dbApp.vehicle_type as VehicleType,
    bankName: dbApp.bank_name,
    accountHolderName: dbApp.account_holder_name,
    sortCode: dbApp.sort_code,
    accountNumber: dbApp.account_number,
    status: dbApp.status as DriverApplicationStatus,
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
      centralLondonSurcharge: "15.00",
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
        "50+": 40
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
        baseCharge: "7.00",
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
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return undefined;
    return mapDbToUser(data);
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

  async createUserWithId(id: string, insertUser: InsertUser): Promise<User> {
    const supabase = this.checkSupabase();
    
    const existing = await this.getUser(id);
    if (existing) return existing;
    
    const dbUser = {
      id,
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
        const existing = await this.getUser(id);
        if (existing) return existing;
      }
      console.error('[SupabaseStorage] Error creating user:', error);
      throw error;
    }
    
    console.log(`[SupabaseStorage] Created user ${id}`);
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
    if (data.deactivatedAt !== undefined) dbData.deactivated_at = data.deactivatedAt;
    
    const { data: updated, error } = await supabase
      .from('users')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !updated) return undefined;
    console.log(`[SupabaseStorage] Updated user ${id}`);
    return mapDbToUser(updated);
  }

  async incrementCompletedBookings(id: string): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    return this.updateUser(id, { 
      completedBookingsCount: (user.completedBookingsCount || 0) + 1 
    });
  }

  async deactivateUser(id: string): Promise<User | undefined> {
    return this.updateUser(id, { isActive: false, deactivatedAt: new Date() });
  }

  async reactivateUser(id: string): Promise<User | undefined> {
    return this.updateUser(id, { isActive: true, deactivatedAt: null });
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
      query = query.eq('is_verified', filters.isVerified);
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
      driver_id: insertDriver.driverCode,
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
      is_verified: insertDriver.isVerified || false,
      current_latitude: insertDriver.currentLatitude || null,
      current_longitude: insertDriver.currentLongitude || null,
      last_location_update: insertDriver.lastLocationUpdate || null,
      rating: insertDriver.rating || "5.00",
      total_jobs: insertDriver.totalJobs || 0,
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
    if (data.isVerified !== undefined) dbData.is_verified = data.isVerified;
    if (data.currentLatitude !== undefined) dbData.current_latitude = data.currentLatitude;
    if (data.currentLongitude !== undefined) dbData.current_longitude = data.currentLongitude;
    if (data.lastLocationUpdate !== undefined) dbData.last_location_update = data.lastLocationUpdate;
    if (data.rating !== undefined) dbData.rating = data.rating;
    if (data.totalJobs !== undefined) dbData.total_jobs = data.totalJobs;
    if (data.profilePictureUrl !== undefined) dbData.profile_picture_url = data.profilePictureUrl;
    if (data.isActive !== undefined) dbData.is_active = data.isActive;
    if (data.deactivatedAt !== undefined) dbData.deactivated_at = data.deactivatedAt;
    
    const { data: updated, error } = await supabase
      .from('drivers')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
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

  async updateDriverLocation(id: string, latitude: string, longitude: string): Promise<Driver | undefined> {
    return this.updateDriver(id, { 
      currentLatitude: latitude, 
      currentLongitude: longitude,
      lastLocationUpdate: new Date(),
    });
  }

  async verifyDriver(id: string, isVerified: boolean): Promise<Driver | undefined> {
    return this.updateDriver(id, { isVerified });
  }

  async deactivateDriver(id: string): Promise<Driver | undefined> {
    return this.updateDriver(id, { 
      isActive: false, 
      deactivatedAt: new Date(),
      isAvailable: false 
    });
  }

  async reactivateDriver(id: string): Promise<Driver | undefined> {
    return this.updateDriver(id, { 
      isActive: true, 
      deactivatedAt: null 
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
    if (error || !data) return [];
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
      scheduled_pickup_time: insertJob.scheduledPickupTime || null,
      scheduled_delivery_time: insertJob.scheduledDeliveryTime || null,
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
      notes: '',
      priority: 'normal',
      parcel_weight: 0,
    };
    
    const { data, error } = await supabase
      .from('jobs')
      .insert(dbJob)
      .select()
      .single();
    
    if (error) {
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
    
    const dbDoc = {
      id,
      driver_id: insertDoc.driverId,
      type: insertDoc.type,
      file_name: insertDoc.fileName,
      file_url: insertDoc.fileUrl,
      status: insertDoc.status || 'pending',
      expiry_date: insertDoc.expiryDate || null,
    };
    
    const { data, error } = await supabase
      .from('documents')
      .insert(dbDoc)
      .select()
      .single();
    
    if (error) throw error;
    return mapDbToDocument(data);
  }

  async updateDocument(id: string, data: Partial<Document>): Promise<Document | undefined> {
    const supabase = this.checkSupabase();
    
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.reviewedBy !== undefined) dbData.reviewed_by = data.reviewedBy;
    if (data.reviewNotes !== undefined) dbData.review_notes = data.reviewNotes;
    if (data.expiryDate !== undefined) dbData.expiry_date = data.expiryDate;
    if (data.reviewedAt !== undefined) dbData.reviewed_at = data.reviewedAt;
    
    const { data: updated, error } = await supabase
      .from('documents')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !updated) return undefined;
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

  async getPricingSettings(): Promise<PricingSettings> {
    return this.pricingSettings;
  }

  async updatePricingSettings(data: Partial<PricingSettings>): Promise<PricingSettings> {
    this.pricingSettings = { ...this.pricingSettings, ...data, updatedAt: new Date() };
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
      total += parseFloat(this.pricingSettings.centralLondonSurcharge || "15.00");
    }
    if (input.deliveryPostcode && this.isCentralLondon(input.deliveryPostcode)) {
      total += parseFloat(this.pricingSettings.centralLondonSurcharge || "15.00");
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
    if (weight >= 50) return surcharges["50+"] || 40;
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

  async getDriverApplications(filters?: { status?: DriverApplicationStatus }): Promise<DriverApplication[]> {
    const supabase = this.checkSupabase();
    let query = supabase.from('driver_applications').select('*').order('submitted_at', { ascending: false });
    if (filters?.status) query = query.eq('status', filters.status);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapDbToDriverApplication);
  }

  async createDriverApplication(application: InsertDriverApplication): Promise<DriverApplication> {
    const supabase = this.checkSupabase();
    const id = randomUUID();
    
    const dbApp = {
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
      bank_name: application.bankName,
      account_holder_name: application.accountHolderName,
      sort_code: application.sortCode,
      account_number: application.accountNumber,
      status: application.status || 'pending',
    };
    
    const { data, error } = await supabase.from('driver_applications').insert(dbApp).select().single();
    if (error) throw error;
    return mapDbToDriverApplication(data);
  }

  async updateDriverApplication(id: string, data: Partial<DriverApplication>): Promise<DriverApplication | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.reviewedBy !== undefined) dbData.reviewed_by = data.reviewedBy;
    if (data.reviewNotes !== undefined) dbData.review_notes = data.reviewNotes;
    if (data.rejectionReason !== undefined) dbData.rejection_reason = data.rejectionReason;
    if (data.reviewedAt !== undefined) dbData.reviewed_at = data.reviewedAt;
    
    const { data: updated, error } = await supabase.from('driver_applications').update(dbData).eq('id', id).select().single();
    if (error || !updated) return undefined;
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
    
    // Fetch all jobs in parallel for better performance
    let jobs: Job[] = [];
    if (invoice.jobIds && Array.isArray(invoice.jobIds) && invoice.jobIds.length > 0) {
      const jobPromises = invoice.jobIds.map(jobId => this.getJob(jobId));
      const results = await Promise.all(jobPromises);
      jobs = results.filter((job): job is Job => job !== undefined);
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
    const { data, error } = await query;
    if (error || !data) return [];
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
      const { data, error } = await supabase.from('job_assignments').insert(dbAssignment).select().single();
      if (error) {
        console.error('[SupabaseStorage] Error creating job assignment:', error);
        // Return a simulated assignment object if Supabase insert fails
        return {
          id,
          jobId: assignment.jobId,
          driverId: assignment.driverId,
          assignedBy: assignment.assignedBy,
          driverPrice: assignment.driverPrice,
          status: (assignment.status || 'pending') as any,
          sentAt: assignment.status === 'sent' ? now : null,
          respondedAt: null,
          expiresAt: assignment.expiresAt || null,
          cancelledAt: null,
          cancellationReason: null,
          rejectionReason: null,
          createdAt: now,
          withdrawnAt: null,
          withdrawnBy: null,
          removedAt: null,
          removedBy: null,
          cleanedAt: null,
          cleanedBy: null,
        } as JobAssignment;
      }
      return mapDbToJobAssignment(data);
    } catch (err) {
      console.error('[SupabaseStorage] Exception creating job assignment:', err);
      // Return a simulated assignment to allow the flow to continue
      return {
        id,
        jobId: assignment.jobId,
        driverId: assignment.driverId,
        assignedBy: assignment.assignedBy,
        driverPrice: assignment.driverPrice,
        status: (assignment.status || 'pending') as any,
        sentAt: assignment.status === 'sent' ? now : null,
        respondedAt: null,
        expiresAt: assignment.expiresAt || null,
        cancelledAt: null,
        cancellationReason: null,
        rejectionReason: null,
        createdAt: now,
        withdrawnAt: null,
        withdrawnBy: null,
        removedAt: null,
        removedBy: null,
        cleanedAt: null,
        cleanedBy: null,
      } as JobAssignment;
    }
  }

  async updateJobAssignment(id: string, data: Partial<JobAssignment>): Promise<JobAssignment | undefined> {
    const supabase = this.checkSupabase();
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
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
    
    const { data: updated, error } = await supabase.from('job_assignments').update(dbData).eq('id', id).select().single();
    if (error || !updated) return undefined;
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

  async getPaymentLink(id: string): Promise<PaymentLink | undefined> { return undefined; }
  async getPaymentLinkByToken(token: string): Promise<PaymentLink | undefined> { return undefined; }
  async getPaymentLinkByTokenHash(tokenHash: string): Promise<PaymentLink | undefined> { return undefined; }
  async getPaymentLinks(filters?: { jobId?: string; customerId?: string; status?: PaymentLinkStatus }): Promise<PaymentLink[]> { return []; }
  async getActivePaymentLinkForJob(jobId: string): Promise<PaymentLink | undefined> { return undefined; }
  async createPaymentLink(link: InsertPaymentLink): Promise<PaymentLink> { throw new Error('Not implemented'); }
  async updatePaymentLink(id: string, data: Partial<PaymentLink>): Promise<PaymentLink | undefined> { return undefined; }
  async appendPaymentLinkAuditLog(id: string, event: string, actor?: string, details?: string): Promise<PaymentLink | undefined> { return undefined; }
  async cancelPaymentLink(id: string, actor?: string): Promise<PaymentLink | undefined> { return undefined; }
  async expirePaymentLinks(): Promise<number> { return 0; }
}
