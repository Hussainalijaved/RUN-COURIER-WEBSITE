import { supabaseAdmin } from './supabaseAdmin';
import { 
  type User, type InsertUser,
  type Driver, type InsertDriver,
  type Job, type InsertJob,
  type Document, type InsertDocument,
  type Notification, type InsertNotification,
  type VendorApiKey, type InsertVendorApiKey,
  type DriverApplication, type InsertDriverApplication,
  type Invoice, type InsertInvoice,
  type JobAssignment, type InsertJobAssignment,
  type DeliveryContact, type InsertDeliveryContact,
  type DriverPayment, type InsertDriverPayment,
  type PaymentLink, type InsertPaymentLink,
  type DriverApplicationStatus,
  type InvoiceStatus,
  type JobAssignmentStatus,
  type DocumentType,
  type DocumentStatus,
  type DriverPaymentStatus,
  type PaymentLinkStatus,
  type PricingSettings,
  type Vehicle,
  type JobStatus,
  type VehicleType,
  type UserType,
  type UserRole,
  type BookingQuoteInput,
  driverApplications,
  jobs,
  users,
  paymentLinks,
  jobAssignments,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(filters?: { role?: string; isActive?: boolean; includeInactive?: boolean }): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithId(id: string, user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  incrementCompletedBookings(id: string): Promise<User | undefined>;
  deactivateUser(id: string): Promise<User | undefined>;
  reactivateUser(id: string): Promise<User | undefined>;

  getDriver(id: string): Promise<Driver | undefined>;
  getDriverByUserId(userId: string): Promise<Driver | undefined>;
  getDriverByDriverCode(driverCode: string): Promise<Driver | undefined>;
  getDrivers(filters?: { isAvailable?: boolean; isVerified?: boolean; vehicleType?: VehicleType; includeInactive?: boolean }): Promise<Driver[]>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriver(id: string, data: Partial<Driver>): Promise<Driver | undefined>;
  updateDriverAvailability(id: string, isAvailable: boolean): Promise<Driver | undefined>;
  updateDriverLocation(id: string, latitude: string, longitude: string, extras?: { speed?: number; heading?: number; accuracy?: number; jobId?: string }): Promise<Driver | undefined>;
  verifyDriver(id: string, isVerified: boolean): Promise<Driver | undefined>;
  deactivateDriver(id: string): Promise<Driver | undefined>;
  reactivateDriver(id: string): Promise<Driver | undefined>;
  deleteDriver(id: string): Promise<boolean>;

  getJob(id: string): Promise<Job | undefined>;
  getJobByTrackingNumber(trackingNumber: string): Promise<Job | undefined>;
  getJobs(filters?: { status?: JobStatus; customerId?: string; driverId?: string; vendorId?: string; limit?: number }): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, data: Partial<Job>): Promise<Job | undefined>;
  updateJobStatus(id: string, status: JobStatus, rejectionReason?: string): Promise<Job | undefined>;
  assignDriver(id: string, driverId: string, dispatcherId?: string): Promise<Job | undefined>;
  updateJobPOD(id: string, podPhotoUrl?: string, podSignatureUrl?: string, podRecipientName?: string, podPhotos?: string[], podNotes?: string): Promise<Job | undefined>;
  deleteJob(id: string): Promise<void>;

  getDocument(id: string): Promise<Document | undefined>;
  getDocuments(filters?: { driverId?: string; status?: string; type?: string }): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, data: Partial<Document>): Promise<Document | undefined>;
  reviewDocument(id: string, status: string, reviewedBy: string, reviewNotes?: string): Promise<Document | undefined>;

  getNotifications(filters?: { userId?: string; isRead?: boolean }): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;

  getPricingSettings(): Promise<PricingSettings>;
  updatePricingSettings(data: Partial<PricingSettings>): Promise<PricingSettings>;
  
  getVehicles(): Promise<Vehicle[]>;
  updateVehicle(type: VehicleType, data: Partial<Vehicle>): Promise<Vehicle | undefined>;

  calculateQuote(input: BookingQuoteInput): Promise<any>;

  getVendorApiKeys(vendorId: string): Promise<VendorApiKey[]>;
  createVendorApiKey(apiKey: InsertVendorApiKey): Promise<VendorApiKey>;
  updateVendorApiKey(id: string, data: Partial<VendorApiKey>): Promise<VendorApiKey | undefined>;
  deleteVendorApiKey(id: string): Promise<void>;

  getAdminStats(): Promise<any>;
  getDriverStats(driverId: string): Promise<any>;
  getCustomerStats(customerId: string): Promise<any>;
  getDispatcherStats(): Promise<any>;
  getVendorStats(vendorId: string): Promise<any>;

  getDriverApplication(id: string): Promise<DriverApplication | undefined>;
  getDriverApplicationByEmail(email: string): Promise<DriverApplication | undefined>;
  getDriverApplicationByPhone(phone: string): Promise<DriverApplication | undefined>;
  getDriverApplications(filters?: { status?: DriverApplicationStatus }): Promise<DriverApplication[]>;
  createDriverApplication(application: InsertDriverApplication): Promise<DriverApplication>;
  updateDriverApplication(id: string, data: Partial<DriverApplication>): Promise<DriverApplication | undefined>;
  reviewDriverApplication(id: string, status: DriverApplicationStatus, reviewedBy: string, reviewNotes?: string, rejectionReason?: string): Promise<DriverApplication | undefined>;
  deleteDriverApplication(id: string): Promise<boolean>;

  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined>;
  getInvoices(filters?: { customerId?: string; status?: InvoiceStatus }): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined>;
  getInvoiceWithJobs(id: string): Promise<{ invoice: Invoice; jobs: Job[] } | undefined>;

  getJobAssignment(id: string): Promise<JobAssignment | undefined>;
  getJobAssignments(filters?: { jobId?: string; driverId?: string; status?: JobAssignmentStatus }): Promise<JobAssignment[]>;
  createJobAssignment(assignment: InsertJobAssignment): Promise<JobAssignment>;
  updateJobAssignment(id: string, data: Partial<JobAssignment>): Promise<JobAssignment | undefined>;
  cancelJobAssignment(id: string, reason?: string): Promise<JobAssignment | undefined>;
  getActiveAssignmentForJob(jobId: string): Promise<JobAssignment | undefined>;

  getDeliveryContact(id: string): Promise<DeliveryContact | undefined>;
  getDeliveryContacts(customerId: string): Promise<DeliveryContact[]>;
  createDeliveryContact(contact: InsertDeliveryContact): Promise<DeliveryContact>;
  updateDeliveryContact(id: string, data: Partial<DeliveryContact>): Promise<DeliveryContact | undefined>;
  deleteDeliveryContact(id: string): Promise<void>;

  getDriverPayment(id: string): Promise<DriverPayment | undefined>;
  getDriverPayments(filters?: { driverId?: string; status?: DriverPaymentStatus; jobId?: string }): Promise<DriverPayment[]>;
  getDriverPaymentStats(driverId: string): Promise<{ totalEarnings: number; pendingAmount: number; paidAmount: number; totalJobs: number }>;
  createDriverPayment(payment: InsertDriverPayment): Promise<DriverPayment>;
  updateDriverPayment(id: string, data: Partial<DriverPayment>): Promise<DriverPayment | undefined>;
  deleteDriverPayment(id: string): Promise<boolean>;

  getPaymentLink(id: string): Promise<PaymentLink | undefined>;
  getPaymentLinkByToken(token: string): Promise<PaymentLink | undefined>;
  getPaymentLinkByTokenHash(tokenHash: string): Promise<PaymentLink | undefined>;
  getPaymentLinks(filters?: { jobId?: string; customerId?: string; status?: PaymentLinkStatus }): Promise<PaymentLink[]>;
  getActivePaymentLinkForJob(jobId: string): Promise<PaymentLink | undefined>;
  createPaymentLink(link: InsertPaymentLink): Promise<PaymentLink>;
  updatePaymentLink(id: string, data: Partial<PaymentLink>): Promise<PaymentLink | undefined>;
  appendPaymentLinkAuditLog(id: string, event: string, actor?: string, details?: string): Promise<PaymentLink | undefined>;
  cancelPaymentLink(id: string, actor?: string): Promise<PaymentLink | undefined>;
  expirePaymentLinks(): Promise<number>;

  getContractTemplates(): Promise<any[]>;
  getContractTemplate(id: string): Promise<any | undefined>;
  createContractTemplate(data: { title: string; content: string }): Promise<any>;
  updateContractTemplate(id: string, data: { title?: string; content?: string }): Promise<any | undefined>;
  deleteContractTemplate(id: string): Promise<boolean>;

  getDriverContracts(filters?: { driverId?: string; status?: string; templateId?: string }): Promise<any[]>;
  getDriverContract(id: string): Promise<any | undefined>;
  getDriverContractByToken(token: string): Promise<any | undefined>;
  createDriverContract(data: { templateId: string; driverId: string; driverName: string; driverEmail?: string; contractContent: string; token: string; status: string; sentAt?: string }): Promise<any>;
  updateDriverContract(id: string, data: Partial<any>): Promise<any | undefined>;
  deleteDriverContract(id: string): Promise<boolean>;

  getNoticeTemplates(filters?: { category?: string; isActive?: boolean }): Promise<any[]>;
  getNoticeTemplate(id: string): Promise<any | undefined>;
  createNoticeTemplate(data: { title: string; subject: string; message: string; category: string; requires_acknowledgement: boolean; created_by?: string }): Promise<any>;
  updateNoticeTemplate(id: string, data: Partial<any>): Promise<any | undefined>;
  deleteNoticeTemplate(id: string): Promise<boolean>;

  getDriverNotices(filters?: { status?: string }): Promise<any[]>;
  getDriverNotice(id: string): Promise<any | undefined>;
  createDriverNotice(data: { template_id?: string; title: string; subject: string; message: string; category: string; sent_by?: string; sent_at?: string; target_type: string; requires_acknowledgement: boolean; status: string }): Promise<any>;
  updateDriverNotice(id: string, data: Partial<any>): Promise<any | undefined>;

  getNoticeRecipients(noticeId: string): Promise<any[]>;
  createNoticeRecipient(data: { notice_id: string; driver_id: string; driver_email?: string; delivery_channel: string }): Promise<any>;
  updateNoticeRecipient(id: string, data: Partial<any>): Promise<any | undefined>;
  getDriverNoticeRecipients(driverId: string): Promise<any[]>;
  getDriverNoticeRecipient(noticeId: string, driverId: string): Promise<any | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private drivers: Map<string, Driver>;
  private jobs: Map<string, Job>;
  private documents: Map<string, Document>;
  private notifications: Map<string, Notification>;
  private vendorApiKeys: Map<string, VendorApiKey>;
  private driverApplications: Map<string, DriverApplication>;
  private invoices: Map<string, Invoice>;
  private jobAssignments: Map<string, JobAssignment>;
  private deliveryContacts: Map<string, DeliveryContact>;
  private driverPayments: Map<string, DriverPayment>;
  private paymentLinksMap: Map<string, PaymentLink>;
  private pricingSettings: PricingSettings;
  private vehicles: Map<VehicleType, Vehicle>;

  constructor() {
    this.users = new Map();
    this.drivers = new Map();
    this.jobs = new Map();
    this.documents = new Map();
    this.notifications = new Map();
    this.vendorApiKeys = new Map();
    this.driverApplications = new Map();
    this.invoices = new Map();
    this.jobAssignments = new Map();
    this.deliveryContacts = new Map();
    this.driverPayments = new Map();
    this.paymentLinksMap = new Map();
    
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
      updatedAt: new Date(),
    };

    this.vehicles = new Map([
      ["motorbike", {
        id: "1",
        type: "motorbike" as VehicleType,
        name: "Motorbike",
        description: "Fast delivery for small items up to 5kg",
        maxWeight: 5,
        baseCharge: "0.00",
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
        baseCharge: "25.00",
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
        baseCharge: "25.00",
        perMileRate: "1.40",
        rushHourRate: "1.70",
        iconUrl: null,
      }],
    ]);

    // No demo data seeding - drivers come from Supabase and PostgreSQL
    // this.seedData();
  }


  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0] || undefined;
    } catch (error) {
      console.error('[Storage] Error getting user from database:', error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.email, username)).limit(1);
      return result[0] || undefined;
    } catch (error) {
      console.error('[Storage] Error getting user by username:', error);
      return undefined;
    }
  }

  async getUsers(filters?: { role?: string; isActive?: boolean; includeInactive?: boolean }): Promise<User[]> {
    try {
      const conditions = [];
      
      if (filters?.role) {
        conditions.push(eq(users.role, filters.role as UserRole));
      }
      
      // Filter by isActive status - exclude inactive by default unless includeInactive is true
      if (filters?.isActive !== undefined) {
        conditions.push(eq(users.isActive, filters.isActive));
      } else if (!filters?.includeInactive) {
        conditions.push(eq(users.isActive, true));
      }
      
      if (conditions.length > 0) {
        return await db.select().from(users).where(and(...conditions));
      }
      return await db.select().from(users);
    } catch (error) {
      console.error('[Storage] Error getting users:', error);
      return [];
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    return this.createUserWithId(id, insertUser);
  }

  async createUserWithId(id: string, insertUser: InsertUser): Promise<User> {
    try {
      // Check if user already exists
      const existing = await this.getUser(id);
      if (existing) {
        // Return existing user instead of throwing error
        return existing;
      }
      
      const userData = {
        id,
        email: insertUser.email,
        fullName: insertUser.fullName,
        password: insertUser.password || null,
        phone: insertUser.phone || null,
        postcode: insertUser.postcode || null,
        address: insertUser.address || null,
        buildingName: insertUser.buildingName || null,
        role: (insertUser.role || "customer") as UserRole,
        userType: (insertUser.userType || "individual") as UserType,
        companyName: insertUser.companyName || null,
        registrationNumber: insertUser.registrationNumber || null,
        businessAddress: insertUser.businessAddress || null,
        vatNumber: insertUser.vatNumber || null,
        stripeCustomerId: insertUser.stripeCustomerId || null,
        payLaterEnabled: insertUser.payLaterEnabled || false,
        completedBookingsCount: insertUser.completedBookingsCount || 0,
        isActive: insertUser.isActive ?? true,
        deactivatedAt: null,
        createdAt: new Date(),
      };
      
      const result = await db.insert(users).values(userData).returning();
      console.log(`[Storage] Created user ${id} in database`);
      return result[0];
    } catch (error: any) {
      // Handle unique constraint violation - user might already exist
      if (error.code === '23505') {
        const existing = await this.getUser(id);
        if (existing) return existing;
      }
      console.error('[Storage] Error creating user:', error);
      throw error;
    }
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    try {
      // Remove id from update data to avoid issues
      const { id: _, ...updateData } = data;
      
      const result = await db.update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log(`[Storage] Updated user ${id} in database`);
        return result[0];
      }
      return undefined;
    } catch (error) {
      console.error('[Storage] Error updating user:', error);
      return undefined;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      const result = await db.delete(users)
        .where(eq(users.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log(`[Storage] Deleted user ${id} from database`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Storage] Error deleting user:', error);
      return false;
    }
  }

  async incrementCompletedBookings(id: string): Promise<User | undefined> {
    try {
      const result = await db.update(users)
        .set({ 
          completedBookingsCount: sql`${users.completedBookingsCount} + 1` 
        })
        .where(eq(users.id, id))
        .returning();
      return result[0] || undefined;
    } catch (error) {
      console.error('[Storage] Error incrementing completed bookings:', error);
      return undefined;
    }
  }

  async deactivateUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.update(users)
        .set({ 
          isActive: false,
          deactivatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log(`[Storage] Deactivated user ${id}`);
        return result[0];
      }
      return undefined;
    } catch (error) {
      console.error('[Storage] Error deactivating user:', error);
      throw error;
    }
  }

  async reactivateUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.update(users)
        .set({ 
          isActive: true,
          deactivatedAt: null
        })
        .where(eq(users.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log(`[Storage] Reactivated user ${id}`);
        return result[0];
      }
      return undefined;
    } catch (error) {
      console.error('[Storage] Error reactivating user:', error);
      throw error;
    }
  }

  async getDriver(id: string): Promise<Driver | undefined> {
    return this.drivers.get(id);
  }

  async getDriverByUserId(userId: string): Promise<Driver | undefined> {
    return Array.from(this.drivers.values()).find((d) => d.userId === userId);
  }

  async getDriverByDriverCode(driverCode: string): Promise<Driver | undefined> {
    return Array.from(this.drivers.values()).find((d) => d.driverCode === driverCode);
  }

  async getDrivers(filters?: { isAvailable?: boolean; isVerified?: boolean; vehicleType?: VehicleType; includeInactive?: boolean }): Promise<Driver[]> {
    let drivers = Array.from(this.drivers.values());
    
    // Filter out inactive drivers by default unless includeInactive is true
    if (!filters?.includeInactive) {
      drivers = drivers.filter((d) => d.isActive !== false);
    }
    
    if (filters?.isAvailable !== undefined) {
      drivers = drivers.filter((d) => d.isAvailable === filters.isAvailable);
    }
    if (filters?.isVerified !== undefined) {
      drivers = drivers.filter((d) => d.isVerified === filters.isVerified);
    }
    if (filters?.vehicleType) {
      drivers = drivers.filter((d) => d.vehicleType === filters.vehicleType);
    }
    return drivers;
  }

  private generateDriverCode(): string {
    // Format: RC + 2 numbers + 1 letter (e.g., RC02C, RC15A, RC99Z)
    const existingCodes = new Set(
      Array.from(this.drivers.values())
        .map(d => d.driverCode)
        .filter(Boolean)
    );
    
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let attempts = 0;
    const maxAttempts = 1000;
    
    while (attempts < maxAttempts) {
      // Generate 2 random numbers (00-99) + 1 random letter
      const num1 = Math.floor(Math.random() * 10);
      const num2 = Math.floor(Math.random() * 10);
      const letter = letters[Math.floor(Math.random() * letters.length)];
      const code = `RC${num1}${num2}${letter}`;
      
      if (!existingCodes.has(code)) {
        return code;
      }
      attempts++;
    }
    
    // Fallback: use timestamp-based code with RC prefix
    const ts = Date.now().toString(36).toUpperCase().slice(-3);
    return `RC${ts}`;
  }

  async createDriver(insertDriver: InsertDriver): Promise<Driver> {
    // Use the Supabase userId as the driver ID for consistency with mobile app
    const id = insertDriver.userId;
    const driverCode = insertDriver.driverCode || this.generateDriverCode();
    const driver: Driver = {
      id,
      userId: insertDriver.userId,
      driverCode,
      fullName: insertDriver.fullName || null,
      email: insertDriver.email || null,
      phone: insertDriver.phone || null,
      postcode: insertDriver.postcode || null,
      address: insertDriver.address || null,
      nationality: insertDriver.nationality || null,
      isBritish: insertDriver.isBritish || null,
      nationalInsuranceNumber: insertDriver.nationalInsuranceNumber || null,
      rightToWorkShareCode: insertDriver.rightToWorkShareCode || null,
      dbsChecked: insertDriver.dbsChecked || null,
      dbsCertificateUrl: insertDriver.dbsCertificateUrl || null,
      dbsCheckDate: insertDriver.dbsCheckDate || null,
      vehicleType: insertDriver.vehicleType as VehicleType,
      vehicleRegistration: insertDriver.vehicleRegistration || null,
      vehicleMake: insertDriver.vehicleMake || null,
      vehicleModel: insertDriver.vehicleModel || null,
      vehicleColor: insertDriver.vehicleColor || null,
      isAvailable: insertDriver.isAvailable || false,
      isVerified: insertDriver.isVerified || false,
      currentLatitude: insertDriver.currentLatitude || null,
      currentLongitude: insertDriver.currentLongitude || null,
      lastLocationUpdate: insertDriver.lastLocationUpdate || null,
      rating: insertDriver.rating || "5.00",
      totalJobs: insertDriver.totalJobs || 0,
      profilePictureUrl: insertDriver.profilePictureUrl || null,
      isActive: true,
      deactivatedAt: null,
      createdAt: new Date(),
    };
    this.drivers.set(id, driver);
    return driver;
  }

  async updateDriver(id: string, data: Partial<Driver>): Promise<Driver | undefined> {
    const driver = this.drivers.get(id);
    if (!driver) return undefined;
    // Never allow updating id, userId, or driverCode - these are permanent identifiers
    const { driverCode: _, id: __, userId: ___, ...safeData } = data;
    const updated = { ...driver, ...safeData };
    this.drivers.set(id, updated);
    return updated;
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
    const driver = this.drivers.get(id);
    if (driver) {
      const updated = { 
        ...driver, 
        isActive: false, 
        deactivatedAt: new Date(),
        isAvailable: false 
      };
      this.drivers.set(id, updated);
      console.log(`[Storage] Deactivated driver ${id}`);
      return updated;
    }
    return undefined;
  }

  async reactivateDriver(id: string): Promise<Driver | undefined> {
    const driver = this.drivers.get(id);
    if (driver) {
      const updated = { 
        ...driver, 
        isActive: true, 
        deactivatedAt: null 
      };
      this.drivers.set(id, updated);
      console.log(`[Storage] Reactivated driver ${id}`);
      return updated;
    }
    return undefined;
  }

  async deleteDriver(id: string): Promise<boolean> {
    const driver = this.drivers.get(id);
    if (driver) {
      this.drivers.delete(id);
      console.log(`[Storage] Permanently deleted driver ${id}`);
      return true;
    }
    return false;
  }

  async getJob(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async getJobByTrackingNumber(trackingNumber: string): Promise<Job | undefined> {
    return Array.from(this.jobs.values()).find((j) => j.trackingNumber === trackingNumber);
  }

  async getJobs(filters?: { status?: JobStatus; customerId?: string; driverId?: string; vendorId?: string; limit?: number }): Promise<Job[]> {
    let jobs = Array.from(this.jobs.values());
    if (filters?.status) {
      jobs = jobs.filter((j) => j.status === filters.status);
    }
    if (filters?.customerId) {
      jobs = jobs.filter((j) => j.customerId === filters.customerId);
    }
    if (filters?.driverId) {
      jobs = jobs.filter((j) => j.driverId === filters.driverId);
    }
    if (filters?.vendorId) {
      jobs = jobs.filter((j) => j.vendorId === filters.vendorId);
    }
    jobs.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    if (filters?.limit) {
      jobs = jobs.slice(0, filters.limit);
    }
    return jobs;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const id = randomUUID();
    const job: Job = {
      id,
      trackingNumber: insertJob.trackingNumber,
      customerType: (insertJob.customerType || 'individual') as 'individual' | 'business',
      customerId: insertJob.customerId,
      driverId: insertJob.driverId || null,
      dispatcherId: insertJob.dispatcherId || null,
      vendorId: insertJob.vendorId || null,
      status: (insertJob.status || "pending") as JobStatus,
      vehicleType: insertJob.vehicleType as VehicleType,
      pickupAddress: insertJob.pickupAddress,
      pickupPostcode: insertJob.pickupPostcode,
      pickupLatitude: insertJob.pickupLatitude || null,
      pickupLongitude: insertJob.pickupLongitude || null,
      pickupInstructions: insertJob.pickupInstructions || null,
      pickupBuildingName: insertJob.pickupBuildingName || null,
      pickupContactName: insertJob.pickupContactName || null,
      pickupContactPhone: insertJob.pickupContactPhone || null,
      deliveryAddress: insertJob.deliveryAddress,
      deliveryPostcode: insertJob.deliveryPostcode,
      deliveryLatitude: insertJob.deliveryLatitude || null,
      deliveryLongitude: insertJob.deliveryLongitude || null,
      deliveryInstructions: insertJob.deliveryInstructions || null,
      deliveryBuildingName: insertJob.deliveryBuildingName || null,
      recipientName: insertJob.recipientName || null,
      recipientPhone: insertJob.recipientPhone || null,
      weight: insertJob.weight,
      distance: insertJob.distance || null,
      isMultiDrop: insertJob.isMultiDrop || false,
      isReturnTrip: insertJob.isReturnTrip || false,
      returnToSameLocation: insertJob.returnToSameLocation ?? true,
      returnAddress: insertJob.returnAddress || null,
      returnPostcode: insertJob.returnPostcode || null,
      isScheduled: insertJob.isScheduled || false,
      scheduledPickupTime: insertJob.scheduledPickupTime || null,
      scheduledDeliveryTime: insertJob.scheduledDeliveryTime || null,
      isCentralLondon: insertJob.isCentralLondon || false,
      isRushHour: insertJob.isRushHour || false,
      basePrice: insertJob.basePrice,
      distancePrice: insertJob.distancePrice,
      weightSurcharge: insertJob.weightSurcharge || "0",
      multiDropCharge: insertJob.multiDropCharge || "0",
      returnTripCharge: insertJob.returnTripCharge || "0",
      centralLondonCharge: insertJob.centralLondonCharge || "0",
      waitingTimeCharge: insertJob.waitingTimeCharge || "0",
      totalPrice: insertJob.totalPrice,
      driverPrice: insertJob.driverPrice || null,
      paymentStatus: insertJob.paymentStatus || "pending",
      paymentIntentId: insertJob.paymentIntentId || null,
      podPhotoUrl: insertJob.podPhotoUrl || null,
      podPhotos: insertJob.podPhotos || [],
      podSignatureUrl: insertJob.podSignatureUrl || null,
      podNotes: insertJob.podNotes || null,
      podRecipientName: insertJob.podRecipientName || null,
      deliveredAt: insertJob.deliveredAt || null,
      rejectionReason: insertJob.rejectionReason || null,
      estimatedPickupTime: insertJob.estimatedPickupTime || null,
      estimatedDeliveryTime: insertJob.estimatedDeliveryTime || null,
      actualPickupTime: insertJob.actualPickupTime || null,
      actualDeliveryTime: insertJob.actualDeliveryTime || null,
      driverHidden: insertJob.driverHidden || false,
      driverHiddenAt: insertJob.driverHiddenAt || null,
      driverHiddenBy: insertJob.driverHiddenBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(id, job);
    
    // Also persist to database
    try {
      await db.insert(jobs).values({
        id: job.id,
        trackingNumber: job.trackingNumber,
        customerId: job.customerId,
        driverId: job.driverId,
        dispatcherId: job.dispatcherId,
        vendorId: job.vendorId,
        status: job.status,
        vehicleType: job.vehicleType,
        pickupAddress: job.pickupAddress,
        pickupPostcode: job.pickupPostcode,
        pickupLatitude: job.pickupLatitude,
        pickupLongitude: job.pickupLongitude,
        pickupInstructions: job.pickupInstructions,
        deliveryAddress: job.deliveryAddress,
        deliveryPostcode: job.deliveryPostcode,
        deliveryLatitude: job.deliveryLatitude,
        deliveryLongitude: job.deliveryLongitude,
        deliveryInstructions: job.deliveryInstructions,
        recipientName: job.recipientName,
        recipientPhone: job.recipientPhone,
        weight: job.weight,
        distance: job.distance,
        isMultiDrop: job.isMultiDrop,
        isReturnTrip: job.isReturnTrip,
        returnToSameLocation: job.returnToSameLocation,
        returnAddress: job.returnAddress,
        returnPostcode: job.returnPostcode,
        isScheduled: job.isScheduled,
        scheduledPickupTime: job.scheduledPickupTime,
        scheduledDeliveryTime: job.scheduledDeliveryTime,
        isCentralLondon: job.isCentralLondon,
        isRushHour: job.isRushHour,
        basePrice: job.basePrice,
        distancePrice: job.distancePrice,
        weightSurcharge: job.weightSurcharge,
        multiDropCharge: job.multiDropCharge,
        returnTripCharge: job.returnTripCharge,
        centralLondonCharge: job.centralLondonCharge,
        waitingTimeCharge: job.waitingTimeCharge,
        totalPrice: job.totalPrice,
        driverPrice: job.driverPrice,
        paymentStatus: job.paymentStatus,
        paymentIntentId: job.paymentIntentId,
        podPhotoUrl: job.podPhotoUrl,
        podSignatureUrl: job.podSignatureUrl,
        deliveredAt: job.deliveredAt,
        rejectionReason: job.rejectionReason,
        estimatedPickupTime: job.estimatedPickupTime,
        estimatedDeliveryTime: job.estimatedDeliveryTime,
        actualPickupTime: job.actualPickupTime,
        actualDeliveryTime: job.actualDeliveryTime,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    } catch (err) {
      console.error('Failed to persist job to database:', err);
    }
    
    return job;
  }

  async updateJob(id: string, data: Partial<Job>): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...data, updatedAt: new Date() };
    this.jobs.set(id, updated);
    return updated;
  }

  async updateJobStatus(id: string, status: JobStatus, rejectionReason?: string): Promise<Job | undefined> {
    const updateData: Partial<Job> = { status };
    if (rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }
    if (status === "delivered") {
      updateData.deliveredAt = new Date();
      updateData.actualDeliveryTime = new Date();
    }
    if (status === "collected") {
      updateData.actualPickupTime = new Date();
    }
    return this.updateJob(id, updateData);
  }

  async assignDriver(id: string, driverId: string, dispatcherId?: string): Promise<Job | undefined> {
    // Validate driver is active before assignment
    const driver = await this.getDriver(driverId);
    if (driver && driver.isActive === false) {
      // Return undefined instead of throwing to allow callers to handle gracefully
      return undefined;
    }
    
    const updatedJob = await this.updateJob(id, { 
      driverId, 
      dispatcherId: dispatcherId || null, 
      status: "assigned" 
    });
    
    if (updatedJob) {
      // Also create a job_assignments record so mobile app can see it
      const existingAssignment = Array.from(this.jobAssignments.values()).find(
        a => a.jobId === id && a.driverId === driverId && 
        ['pending', 'sent', 'offered', 'assigned', 'accepted'].includes(a.status)
      );
      
      if (!existingAssignment) {
        const assignmentId = randomUUID();
        const now = new Date();
        const assignment: JobAssignment = {
          id: assignmentId,
          jobId: id,
          driverId: driverId,
          assignedBy: dispatcherId || null,
          driverPrice: String(updatedJob.driverPrice || 0),
          status: 'offered' as JobAssignmentStatus,
          sentAt: now,
          expiresAt: null,
          acceptedAt: null,
          declinedAt: null,
          declineReason: null,
          createdAt: now,
          updatedAt: now,
        };
        this.jobAssignments.set(assignmentId, assignment);
        console.log(`[MemStorage] assignDriver: Created job assignment for job ${id} to driver ${driverId}`);
      }
    }
    
    return updatedJob;
  }

  async updateJobPOD(id: string, podPhotoUrl?: string, podSignatureUrl?: string, podRecipientName?: string, podPhotos?: string[], podNotes?: string): Promise<Job | undefined> {
    const updates: Partial<Job> = {};
    if (podPhotoUrl !== undefined) updates.podPhotoUrl = podPhotoUrl || null;
    if (podSignatureUrl !== undefined) updates.podSignatureUrl = podSignatureUrl || null;
    if (podRecipientName !== undefined) updates.podRecipientName = podRecipientName || null;
    if (podPhotos !== undefined) updates.podPhotos = podPhotos;
    if (podNotes !== undefined) updates.podNotes = podNotes || null;
    return this.updateJob(id, updates);
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async getDocuments(filters?: { driverId?: string; status?: string; type?: string }): Promise<Document[]> {
    let documents = Array.from(this.documents.values());
    if (filters?.driverId) {
      documents = documents.filter((d) => d.driverId === filters.driverId);
    }
    if (filters?.status) {
      documents = documents.filter((d) => d.status === filters.status);
    }
    if (filters?.type) {
      documents = documents.filter((d) => d.type === filters.type);
    }
    return documents;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = randomUUID();
    const document: Document = {
      id,
      driverId: insertDocument.driverId,
      type: insertDocument.type as DocumentType,
      fileName: insertDocument.fileName,
      fileUrl: insertDocument.fileUrl,
      status: (insertDocument.status || "pending") as DocumentStatus,
      reviewedBy: insertDocument.reviewedBy || null,
      reviewNotes: insertDocument.reviewNotes || null,
      expiryDate: insertDocument.expiryDate || null,
      uploadedAt: new Date(),
      reviewedAt: null,
    };
    this.documents.set(id, document);
    return document;
  }

  async updateDocument(id: string, data: Partial<Document>): Promise<Document | undefined> {
    const document = this.documents.get(id);
    if (!document) return undefined;
    const updated = { ...document, ...data };
    this.documents.set(id, updated);
    return updated;
  }

  async reviewDocument(id: string, status: string, reviewedBy: string, reviewNotes?: string): Promise<Document | undefined> {
    const document = this.documents.get(id);
    if (!document) return undefined;
    const updated = { 
      ...document, 
      status: status as Document["status"],
      reviewedBy, 
      reviewNotes: reviewNotes || null, 
      reviewedAt: new Date() 
    };
    this.documents.set(id, updated);
    return updated;
  }

  async getNotifications(filters?: { userId?: string; isRead?: boolean }): Promise<Notification[]> {
    let notifications = Array.from(this.notifications.values());
    if (filters?.userId) {
      notifications = notifications.filter((n) => n.userId === filters.userId);
    }
    if (filters?.isRead !== undefined) {
      notifications = notifications.filter((n) => n.isRead === filters.isRead);
    }
    notifications.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return notifications;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification: Notification = {
      ...insertNotification,
      id,
      type: insertNotification.type || "info",
      isRead: insertNotification.isRead || false,
      data: insertNotification.data || null,
      createdAt: new Date(),
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const notification = this.notifications.get(id);
    if (!notification) return undefined;
    const updated = { ...notification, isRead: true };
    this.notifications.set(id, updated);
    return updated;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    const notifications = Array.from(this.notifications.values()).filter((n) => n.userId === userId);
    notifications.forEach((n) => {
      this.notifications.set(n.id, { ...n, isRead: true });
    });
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
    if (!vehicle) throw new Error("Invalid vehicle type");

    const baseCharge = parseFloat(vehicle.baseCharge);
    const perMileRate = parseFloat(vehicle.perMileRate);
    const rushHourRate = parseFloat(vehicle.rushHourRate || vehicle.perMileRate);

    const distance = 10;

    const scheduledDateTime = input.pickupDate && input.pickupTime 
      ? new Date(`${input.pickupDate}T${input.pickupTime}`)
      : null;
    const isScheduledRushHour = scheduledDateTime 
      ? this.checkRushHour(scheduledDateTime)
      : this.checkRushHour(new Date());

    const rate = isScheduledRushHour ? rushHourRate : perMileRate;
    const distanceCharge = distance * rate;

    const weightSurcharge = this.getWeightSurcharge(input.weight);

    const centralLondon = this.isCentralLondon(input.pickupPostcode) || this.isCentralLondon(input.deliveryPostcode);
    const centralLondonCharge = centralLondon ? parseFloat(this.pricingSettings.centralLondonSurcharge || "18.15") : 0;

    const multiDropCount = input.multiDropStops?.length || 0;
    const multiDropCharge = input.isMultiDrop 
      ? multiDropCount * parseFloat(this.pricingSettings.multiDropCharge || "5") 
      : 0;

    let returnTripCharge = 0;
    if (input.isReturnTrip) {
      const returnMultiplier = parseFloat(this.pricingSettings.returnTripMultiplier || "0.60");
      returnTripCharge = distance * rate * returnMultiplier;
    }

    const totalPrice = baseCharge + distanceCharge + weightSurcharge + centralLondonCharge + multiDropCharge + returnTripCharge;

    return {
      vehicleType: input.vehicleType,
      vehicleName: vehicle.name,
      distance,
      weight: input.weight,
      baseCharge,
      distanceCharge: Math.round(distanceCharge * 100) / 100,
      weightSurcharge,
      centralLondonCharge,
      multiDropCharge,
      returnTripCharge: Math.round(returnTripCharge * 100) / 100,
      rushHourApplied: isScheduledRushHour,
      isCentralLondon: centralLondon,
      totalPrice: Math.round(totalPrice * 100) / 100,
    };
  }

  private checkRushHour(date: Date): boolean {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const time = hours * 60 + minutes;
    
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
    return Array.from(this.vendorApiKeys.values()).filter((k) => k.vendorId === vendorId);
  }

  async createVendorApiKey(insertApiKey: InsertVendorApiKey): Promise<VendorApiKey> {
    const id = randomUUID();
    const apiKey: VendorApiKey = {
      ...insertApiKey,
      id,
      isActive: insertApiKey.isActive ?? true,
      lastUsedAt: null,
      createdAt: new Date(),
    };
    this.vendorApiKeys.set(id, apiKey);
    return apiKey;
  }

  async updateVendorApiKey(id: string, data: Partial<VendorApiKey>): Promise<VendorApiKey | undefined> {
    const apiKey = this.vendorApiKeys.get(id);
    if (!apiKey) return undefined;
    const updated = { ...apiKey, ...data };
    this.vendorApiKeys.set(id, updated);
    return updated;
  }

  async deleteVendorApiKey(id: string): Promise<void> {
    this.vendorApiKeys.delete(id);
  }

  async getAdminStats(): Promise<any> {
    const jobs = Array.from(this.jobs.values());
    const drivers = Array.from(this.drivers.values());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysJobs = jobs.filter((j) => j.createdAt && j.createdAt >= today);
    const activeDrivers = drivers.filter((d) => d.isAvailable);
    const pendingJobs = jobs.filter((j) => j.status === "pending");
    const completedToday = todaysJobs.filter((j) => j.status === "delivered");

    const totalRevenue = jobs
      .filter((j) => j.paymentStatus === "paid")
      .reduce((sum, j) => sum + parseFloat(j.totalPrice), 0);

    const todayRevenue = todaysJobs
      .filter((j) => j.paymentStatus === "paid")
      .reduce((sum, j) => sum + parseFloat(j.totalPrice), 0);

    return {
      todaysJobs: todaysJobs.length,
      activeDrivers: activeDrivers.length,
      totalDrivers: drivers.length,
      pendingJobs: pendingJobs.length,
      completedToday: completedToday.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      totalJobs: jobs.length,
    };
  }

  async getDriverStats(driverId: string): Promise<any> {
    const jobs = Array.from(this.jobs.values()).filter((j) => j.driverId === driverId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysJobs = jobs.filter((j) => j.createdAt && j.createdAt >= today);
    const completedJobs = jobs.filter((j) => j.status === "delivered");
    const activeJobs = jobs.filter((j) => !["delivered", "cancelled"].includes(j.status));

    const totalEarnings = completedJobs.reduce((sum, j) => sum + parseFloat(j.totalPrice) * 0.8, 0);

    return {
      todaysJobs: todaysJobs.length,
      completedJobs: completedJobs.length,
      activeJobs: activeJobs.length,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalJobs: jobs.length,
    };
  }

  async getCustomerStats(customerId: string): Promise<any> {
    const jobs = Array.from(this.jobs.values()).filter((j) => j.customerId === customerId);
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
    const jobs = Array.from(this.jobs.values());
    const drivers = Array.from(this.drivers.values());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingJobs = jobs.filter((j) => j.status === "pending");
    const activeDrivers = drivers.filter((d) => d.isAvailable && d.isVerified);
    const inProgressJobs = jobs.filter((j) => 
      !["pending", "delivered", "cancelled"].includes(j.status)
    );
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
    const jobs = Array.from(this.jobs.values()).filter((j) => j.vendorId === vendorId);
    const apiKeys = Array.from(this.vendorApiKeys.values()).filter((k) => k.vendorId === vendorId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const jobsCreated = jobs.length;
    const monthlyJobs = jobs.filter((j) => j.createdAt && j.createdAt >= monthStart);
    const monthlySpend = monthlyJobs
      .filter((j) => j.paymentStatus === "paid")
      .reduce((sum, j) => sum + parseFloat(j.totalPrice), 0);

    return {
      apiCallsToday: apiKeys.length > 0 ? Math.floor(Math.random() * 500) + 100 : 0,
      jobsCreated,
      successRate: jobs.length > 0 ? 99.2 : 100,
      monthlySpend: Math.round(monthlySpend * 100) / 100,
    };
  }

  async getDriverApplication(id: string): Promise<DriverApplication | undefined> {
    // Use PostgreSQL database for persistence
    const [application] = await db.select().from(driverApplications).where(eq(driverApplications.id, id));
    return application;
  }

  async getDriverApplicationByEmail(email: string): Promise<DriverApplication | undefined> {
    // Use PostgreSQL database for persistence
    const results = await db.select().from(driverApplications);
    return results.find((app) => app.email.toLowerCase() === email.toLowerCase());
  }

  async getDriverApplicationByPhone(phone: string): Promise<DriverApplication | undefined> {
    const normalized = phone.replace(/\D/g, '');
    const results = await db.select().from(driverApplications);
    return results.find((app) => app.phone.replace(/\D/g, '') === normalized);
  }

  async getDriverApplications(filters?: { status?: DriverApplicationStatus }): Promise<DriverApplication[]> {
    // Use PostgreSQL database for persistence
    let results = await db.select().from(driverApplications).orderBy(desc(driverApplications.submittedAt));
    if (filters?.status) {
      results = results.filter((app) => app.status === filters.status);
    }
    return results;
  }

  async createDriverApplication(application: InsertDriverApplication): Promise<DriverApplication> {
    const id = randomUUID();
    const newApplication: DriverApplication = {
      id,
      fullName: application.fullName,
      email: application.email.toLowerCase(),
      phone: application.phone,
      postcode: application.postcode,
      fullAddress: application.fullAddress,
      nationality: application.nationality,
      nationalInsuranceNumber: application.nationalInsuranceNumber,
      vehicleType: application.vehicleType as VehicleType,
      bankName: application.bankName,
      accountHolderName: application.accountHolderName,
      sortCode: application.sortCode,
      accountNumber: application.accountNumber,
      status: (application.status || "pending") as DriverApplicationStatus,
      isBritish: application.isBritish || false,
      buildingName: application.buildingName || null,
      profilePictureUrl: application.profilePictureUrl || null,
      rightToWorkShareCode: application.rightToWorkShareCode || null,
      drivingLicenceFrontUrl: application.drivingLicenceFrontUrl || null,
      drivingLicenceBackUrl: application.drivingLicenceBackUrl || null,
      dbsCertificateUrl: application.dbsCertificateUrl || null,
      goodsInTransitInsuranceUrl: application.goodsInTransitInsuranceUrl || null,
      hireAndRewardUrl: application.hireAndRewardUrl || null,
      reviewedBy: null,
      reviewNotes: null,
      rejectionReason: null,
      submittedAt: new Date(),
      reviewedAt: null,
    };
    
    console.log('[DriverApplication] Creating application in PostgreSQL:', { 
      id, 
      fullName: newApplication.fullName, 
      fullAddress: newApplication.fullAddress,
      postcode: newApplication.postcode 
    });
    
    // Insert into PostgreSQL database
    await db.insert(driverApplications).values(newApplication);
    
    // Also keep in memory for backwards compatibility
    this.driverApplications.set(id, newApplication);
    return newApplication;
  }

  async updateDriverApplication(id: string, data: Partial<DriverApplication>): Promise<DriverApplication | undefined> {
    // Check PostgreSQL database first
    const [existing] = await db.select().from(driverApplications).where(eq(driverApplications.id, id));
    if (!existing) return undefined;
    
    // Update in PostgreSQL
    await db.update(driverApplications).set(data).where(eq(driverApplications.id, id));
    
    // Fetch updated record
    const [updated] = await db.select().from(driverApplications).where(eq(driverApplications.id, id));
    
    // Also update in-memory cache
    if (updated) {
      this.driverApplications.set(id, updated);
    }
    return updated;
  }

  async reviewDriverApplication(
    id: string, 
    status: DriverApplicationStatus, 
    reviewedBy: string, 
    reviewNotes?: string, 
    rejectionReason?: string
  ): Promise<DriverApplication | undefined> {
    // Check PostgreSQL database first
    const [existing] = await db.select().from(driverApplications).where(eq(driverApplications.id, id));
    if (!existing) return undefined;
    
    const updateData = {
      status,
      reviewedBy,
      reviewNotes: reviewNotes || null,
      rejectionReason: status === "rejected" ? rejectionReason || null : null,
      reviewedAt: new Date(),
    };
    
    // Update in PostgreSQL
    await db.update(driverApplications).set(updateData).where(eq(driverApplications.id, id));
    
    // Fetch updated record
    const [updated] = await db.select().from(driverApplications).where(eq(driverApplications.id, id));
    
    // Also update in-memory cache
    if (updated) {
      this.driverApplications.set(id, updated);
    }
    return updated;
  }

  async deleteDriverApplication(id: string): Promise<boolean> {
    return this.driverApplications.delete(id);
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return this.invoices.get(id);
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    return Array.from(this.invoices.values()).find(
      (inv) => inv.invoiceNumber === invoiceNumber
    );
  }

  async getInvoices(filters?: { customerId?: string; status?: InvoiceStatus }): Promise<Invoice[]> {
    let invoices = Array.from(this.invoices.values());
    if (filters?.customerId) {
      invoices = invoices.filter((inv) => inv.customerId === filters.customerId);
    }
    if (filters?.status) {
      invoices = invoices.filter((inv) => inv.status === filters.status);
    }
    return invoices.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const id = randomUUID();
    const newInvoice: Invoice = {
      id,
      ...invoice,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      companyName: invoice.companyName || null,
      businessAddress: invoice.businessAddress || null,
      vatNumber: invoice.vatNumber || null,
      subtotal: invoice.subtotal,
      vat: invoice.vat || "0",
      total: invoice.total,
      status: (invoice.status || "pending") as InvoiceStatus,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt || null,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      jobIds: invoice.jobIds || null,
      notes: invoice.notes || null,
      createdAt: new Date(),
    };
    this.invoices.set(id, newInvoice);
    return newInvoice;
  }

  async updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined> {
    const invoice = this.invoices.get(id);
    if (!invoice) return undefined;
    const updated = { ...invoice, ...data };
    this.invoices.set(id, updated);
    return updated;
  }

  async getInvoiceWithJobs(id: string): Promise<{ invoice: Invoice; jobs: Job[] } | undefined> {
    const invoice = this.invoices.get(id);
    if (!invoice) return undefined;
    
    const jobs: Job[] = [];
    if (invoice.jobIds && Array.isArray(invoice.jobIds)) {
      for (const jobId of invoice.jobIds) {
        const job = this.jobs.get(jobId);
        if (job) {
          jobs.push(job);
        }
      }
    }
    
    return { invoice, jobs };
  }

  async getJobAssignment(id: string): Promise<JobAssignment | undefined> {
    // Check memory first
    let assignment = this.jobAssignments.get(id);
    if (assignment) return assignment;
    
    // Check database
    try {
      const dbResult = await db.select().from(jobAssignments).where(eq(jobAssignments.id, id));
      if (dbResult.length > 0) {
        assignment = dbResult[0];
        this.jobAssignments.set(id, assignment);
        return assignment;
      }
    } catch (err) {
      console.error("[Storage] Failed to get job assignment from database:", err);
    }
    
    return undefined;
  }

  async getJobAssignments(filters?: { jobId?: string; driverId?: string; status?: JobAssignmentStatus }): Promise<JobAssignment[]> {
    // Get from memory first
    let assignments = Array.from(this.jobAssignments.values());
    
    // Also get from database and merge
    try {
      const dbAssignments = await db.select().from(jobAssignments);
      const seenIds = new Set(assignments.map(a => a.id));
      for (const dbAssign of dbAssignments) {
        if (!seenIds.has(dbAssign.id)) {
          assignments.push(dbAssign);
          this.jobAssignments.set(dbAssign.id, dbAssign);
        }
      }
    } catch (err) {
      console.error("[Storage] Failed to get job assignments from database:", err);
    }
    
    if (filters?.jobId) {
      assignments = assignments.filter(a => a.jobId === filters.jobId);
    }
    if (filters?.driverId) {
      assignments = assignments.filter(a => a.driverId === filters.driverId);
    }
    if (filters?.status) {
      assignments = assignments.filter(a => a.status === filters.status);
    }
    
    return assignments.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async createJobAssignment(assignment: InsertJobAssignment): Promise<JobAssignment> {
    const id = randomUUID();
    const now = new Date();
    const newAssignment: JobAssignment = {
      id,
      jobId: assignment.jobId,
      driverId: assignment.driverId,
      assignedBy: assignment.assignedBy,
      driverPrice: assignment.driverPrice,
      status: (assignment.status || "pending") as JobAssignmentStatus,
      sentAt: assignment.status === "sent" ? now : (assignment.sentAt || null),
      respondedAt: assignment.respondedAt || null,
      cancelledAt: assignment.cancelledAt || null,
      cancellationReason: assignment.cancellationReason || null,
      rejectionReason: assignment.rejectionReason || null,
      expiresAt: assignment.expiresAt || null,
      batchGroupId: assignment.batchGroupId || null,
      withdrawnAt: assignment.withdrawnAt || null,
      withdrawnBy: assignment.withdrawnBy || null,
      removedAt: assignment.removedAt || null,
      removedBy: assignment.removedBy || null,
      cleanedAt: assignment.cleanedAt || null,
      cleanedBy: assignment.cleanedBy || null,
      createdAt: now,
    };
    this.jobAssignments.set(id, newAssignment);
    
    // Also persist to database
    try {
      await db.insert(jobAssignments).values(newAssignment);
      console.log(`[Storage] Job assignment ${id} saved to database`);
    } catch (err) {
      console.error(`[Storage] Failed to save job assignment to database:`, err);
    }
    
    return newAssignment;
  }

  async updateJobAssignment(id: string, data: Partial<JobAssignment>): Promise<JobAssignment | undefined> {
    let assignment = await this.getJobAssignment(id);
    if (!assignment) return undefined;
    const updated = { ...assignment, ...data };
    this.jobAssignments.set(id, updated);
    
    // Also update in database
    try {
      await db.update(jobAssignments).set(data).where(eq(jobAssignments.id, id));
      console.log(`[Storage] Job assignment ${id} updated in database`);
    } catch (err) {
      console.error(`[Storage] Failed to update job assignment in database:`, err);
    }
    
    return updated;
  }

  async cancelJobAssignment(id: string, reason?: string): Promise<JobAssignment | undefined> {
    const assignment = this.jobAssignments.get(id);
    if (!assignment) return undefined;
    const updated: JobAssignment = {
      ...assignment,
      status: "cancelled" as JobAssignmentStatus,
      cancelledAt: new Date(),
      cancellationReason: reason || null,
    };
    this.jobAssignments.set(id, updated);
    return updated;
  }

  async getActiveAssignmentForJob(jobId: string): Promise<JobAssignment | undefined> {
    const assignments = Array.from(this.jobAssignments.values());
    return assignments.find(a => 
      a.jobId === jobId && 
      (a.status === "pending" || a.status === "sent" || a.status === "accepted")
    );
  }

  async getDeliveryContact(id: string): Promise<DeliveryContact | undefined> {
    return this.deliveryContacts.get(id);
  }

  async getDeliveryContacts(customerId: string): Promise<DeliveryContact[]> {
    const contacts = Array.from(this.deliveryContacts.values());
    return contacts
      .filter(c => c.customerId === customerId)
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }

  async createDeliveryContact(contact: InsertDeliveryContact): Promise<DeliveryContact> {
    const id = randomUUID();
    const newContact: DeliveryContact = {
      id,
      customerId: contact.customerId,
      label: contact.label,
      recipientName: contact.recipientName,
      recipientPhone: contact.recipientPhone,
      deliveryAddress: contact.deliveryAddress,
      deliveryPostcode: contact.deliveryPostcode,
      buildingName: contact.buildingName || null,
      deliveryInstructions: contact.deliveryInstructions || null,
      isDefault: contact.isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.deliveryContacts.set(id, newContact);
    return newContact;
  }

  async updateDeliveryContact(id: string, data: Partial<DeliveryContact>): Promise<DeliveryContact | undefined> {
    const contact = this.deliveryContacts.get(id);
    if (!contact) return undefined;
    const updated: DeliveryContact = { ...contact, ...data, updatedAt: new Date() };
    this.deliveryContacts.set(id, updated);
    return updated;
  }

  async deleteDeliveryContact(id: string): Promise<void> {
    this.deliveryContacts.delete(id);
  }

  async getDriverPayment(id: string): Promise<DriverPayment | undefined> {
    return this.driverPayments.get(id);
  }

  async getDriverPayments(filters?: { driverId?: string; status?: DriverPaymentStatus; jobId?: string }): Promise<DriverPayment[]> {
    let payments = Array.from(this.driverPayments.values());
    if (filters?.driverId) {
      payments = payments.filter(p => p.driverId === filters.driverId);
    }
    if (filters?.status) {
      payments = payments.filter(p => p.status === filters.status);
    }
    if (filters?.jobId) {
      payments = payments.filter(p => p.jobId === filters.jobId);
    }
    return payments.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getDriverPaymentStats(driverId: string): Promise<{ totalEarnings: number; pendingAmount: number; paidAmount: number; totalJobs: number }> {
    const payments = await this.getDriverPayments({ driverId });
    const totalEarnings = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const pendingAmount = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.netAmount), 0);
    const paidAmount = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.netAmount), 0);
    const totalJobs = payments.filter(p => p.jobId).length;
    return { totalEarnings, pendingAmount, paidAmount, totalJobs };
  }

  async createDriverPayment(payment: InsertDriverPayment): Promise<DriverPayment> {
    const id = randomUUID();
    const newPayment: DriverPayment = {
      id,
      driverId: payment.driverId,
      jobId: payment.jobId || null,
      amount: payment.amount,
      platformFee: payment.platformFee || "0.00",
      netAmount: payment.netAmount,
      status: (payment.status || "pending") as DriverPaymentStatus,
      payoutReference: payment.payoutReference || null,
      description: payment.description || null,
      jobTrackingNumber: payment.jobTrackingNumber || null,
      paidAt: payment.paidAt || null,
      createdAt: new Date(),
    };
    this.driverPayments.set(id, newPayment);
    return newPayment;
  }

  async updateDriverPayment(id: string, data: Partial<DriverPayment>): Promise<DriverPayment | undefined> {
    const payment = this.driverPayments.get(id);
    if (!payment) return undefined;
    const updatedPayment = { ...payment, ...data };
    this.driverPayments.set(id, updatedPayment);
    return updatedPayment;
  }

  async deleteDriverPayment(id: string): Promise<boolean> {
    return this.driverPayments.delete(id);
  }

  async getPaymentLink(id: string): Promise<PaymentLink | undefined> {
    return this.paymentLinksMap.get(id);
  }

  async getPaymentLinkByToken(token: string): Promise<PaymentLink | undefined> {
    const links = Array.from(this.paymentLinksMap.values());
    return links.find(l => l.token === token);
  }

  async getPaymentLinkByTokenHash(tokenHash: string): Promise<PaymentLink | undefined> {
    const links = Array.from(this.paymentLinksMap.values());
    return links.find(l => l.tokenHash === tokenHash);
  }

  async getPaymentLinks(filters?: { jobId?: string; customerId?: string; status?: PaymentLinkStatus }): Promise<PaymentLink[]> {
    let links = Array.from(this.paymentLinksMap.values());
    if (filters?.jobId) {
      links = links.filter(l => l.jobId === filters.jobId);
    }
    if (filters?.customerId) {
      links = links.filter(l => l.customerId === filters.customerId);
    }
    if (filters?.status) {
      links = links.filter(l => l.status === filters.status);
    }
    return links.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getActivePaymentLinkForJob(jobId: string): Promise<PaymentLink | undefined> {
    const links = Array.from(this.paymentLinksMap.values());
    return links.find(l => 
      l.jobId === jobId && 
      (l.status === "pending" || l.status === "sent" || l.status === "opened") &&
      new Date(l.expiresAt) > new Date()
    );
  }

  async createPaymentLink(link: InsertPaymentLink): Promise<PaymentLink> {
    const id = randomUUID();
    const newLink: PaymentLink = {
      id,
      jobId: link.jobId,
      customerId: link.customerId,
      customerEmail: link.customerEmail,
      token: link.token,
      tokenHash: link.tokenHash,
      amount: link.amount,
      status: (link.status || "pending") as PaymentLinkStatus,
      stripeSessionId: link.stripeSessionId || null,
      stripePaymentIntentId: link.stripePaymentIntentId || null,
      stripeReceiptUrl: link.stripeReceiptUrl || null,
      sentViaEmail: link.sentViaEmail || false,
      sentViaSms: link.sentViaSms || false,
      auditLog: link.auditLog || [],
      expiresAt: link.expiresAt,
      openedAt: link.openedAt || null,
      paidAt: link.paidAt || null,
      cancelledAt: link.cancelledAt || null,
      createdAt: new Date(),
      createdBy: link.createdBy || null,
    };
    this.paymentLinksMap.set(id, newLink);
    
    try {
      await db.insert(paymentLinks).values({
        id,
        jobId: newLink.jobId,
        customerId: newLink.customerId,
        customerEmail: newLink.customerEmail,
        token: newLink.token,
        tokenHash: newLink.tokenHash,
        amount: newLink.amount,
        status: newLink.status,
        stripeSessionId: newLink.stripeSessionId,
        stripePaymentIntentId: newLink.stripePaymentIntentId,
        stripeReceiptUrl: newLink.stripeReceiptUrl,
        sentViaEmail: newLink.sentViaEmail,
        sentViaSms: newLink.sentViaSms,
        auditLog: newLink.auditLog,
        expiresAt: newLink.expiresAt,
        openedAt: newLink.openedAt,
        paidAt: newLink.paidAt,
        cancelledAt: newLink.cancelledAt,
        createdAt: newLink.createdAt,
        createdBy: newLink.createdBy,
      });
    } catch (err) {
      console.error('Failed to persist payment link to database:', err);
    }
    
    return newLink;
  }

  async updatePaymentLink(id: string, data: Partial<PaymentLink>): Promise<PaymentLink | undefined> {
    const link = this.paymentLinksMap.get(id);
    if (!link) return undefined;
    const updated = { ...link, ...data };
    this.paymentLinksMap.set(id, updated);
    
    try {
      await db.update(paymentLinks).set(data).where(eq(paymentLinks.id, id));
    } catch (err) {
      console.error('Failed to update payment link in database:', err);
    }
    
    return updated;
  }

  async appendPaymentLinkAuditLog(id: string, event: string, actor?: string, details?: string): Promise<PaymentLink | undefined> {
    const link = this.paymentLinksMap.get(id);
    if (!link) return undefined;
    
    const auditEntry = {
      event,
      timestamp: new Date().toISOString(),
      actor: actor || undefined,
      details: details || undefined,
    };
    
    const newAuditLog = [...(link.auditLog || []), auditEntry];
    return this.updatePaymentLink(id, { auditLog: newAuditLog });
  }

  async cancelPaymentLink(id: string, actor?: string): Promise<PaymentLink | undefined> {
    const link = this.paymentLinksMap.get(id);
    if (!link) return undefined;
    
    const updated = await this.updatePaymentLink(id, {
      status: "cancelled" as PaymentLinkStatus,
      cancelledAt: new Date(),
    });
    
    if (updated) {
      await this.appendPaymentLinkAuditLog(id, "cancelled", actor);
    }
    
    return updated;
  }

  async expirePaymentLinks(): Promise<number> {
    const now = new Date();
    let expiredCount = 0;
    
    for (const [id, link] of Array.from(this.paymentLinksMap.entries())) {
      if ((link.status === "pending" || link.status === "sent" || link.status === "opened") && 
          new Date(link.expiresAt) < now) {
        this.paymentLinksMap.set(id, { ...link, status: "expired" as PaymentLinkStatus });
        expiredCount++;
        
        try {
          await db.update(paymentLinks).set({ status: "expired" }).where(eq(paymentLinks.id, id));
        } catch (err) {
          console.error('Failed to expire payment link in database:', err);
        }
      }
    }
    
    return expiredCount;
  }

  async getContractTemplates(): Promise<any[]> { return []; }
  async getContractTemplate(id: string): Promise<any | undefined> { return undefined; }
  async createContractTemplate(data: { title: string; content: string }): Promise<any> { return { id: crypto.randomUUID(), ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
  async updateContractTemplate(id: string, data: { title?: string; content?: string }): Promise<any | undefined> { return undefined; }
  async deleteContractTemplate(id: string): Promise<boolean> { return false; }
  async getDriverContracts(filters?: { driverId?: string; status?: string; templateId?: string }): Promise<any[]> { return []; }
  async getDriverContract(id: string): Promise<any | undefined> { return undefined; }
  async getDriverContractByToken(token: string): Promise<any | undefined> { return undefined; }
  async createDriverContract(data: any): Promise<any> { return { id: crypto.randomUUID(), ...data, created_at: new Date().toISOString() }; }
  async updateDriverContract(id: string, data: Partial<any>): Promise<any | undefined> { return undefined; }
  async deleteDriverContract(id: string): Promise<boolean> { return false; }

  async getNoticeTemplates(filters?: { category?: string; isActive?: boolean }): Promise<any[]> { return []; }
  async getNoticeTemplate(id: string): Promise<any | undefined> { return undefined; }
  async createNoticeTemplate(data: any): Promise<any> { return { id: crypto.randomUUID(), ...data, created_at: new Date().toISOString() }; }
  async updateNoticeTemplate(id: string, data: Partial<any>): Promise<any | undefined> { return undefined; }
  async deleteNoticeTemplate(id: string): Promise<boolean> { return false; }
  async getDriverNotices(filters?: { status?: string }): Promise<any[]> { return []; }
  async getDriverNotice(id: string): Promise<any | undefined> { return undefined; }
  async createDriverNotice(data: any): Promise<any> { return { id: crypto.randomUUID(), ...data }; }
  async updateDriverNotice(id: string, data: Partial<any>): Promise<any | undefined> { return undefined; }
  async getNoticeRecipients(noticeId: string): Promise<any[]> { return []; }
  async createNoticeRecipient(data: any): Promise<any> { return { id: crypto.randomUUID(), ...data }; }
  async updateNoticeRecipient(id: string, data: Partial<any>): Promise<any | undefined> { return undefined; }
  async getDriverNoticeRecipients(driverId: string): Promise<any[]> { return []; }
  async getDriverNoticeRecipient(noticeId: string, driverId: string): Promise<any | undefined> { return undefined; }
}

// Use SupabaseStorage when Supabase is configured, otherwise fall back to MemStorage
// Note: Dynamic import to avoid circular dependency
async function createStorage(): Promise<IStorage> {
  if (supabaseAdmin) {
    const { SupabaseStorage } = await import('./supabaseStorage');
    console.log('[Storage] Using Supabase storage');
    const store = new SupabaseStorage();
    await store.loadPricingFromDatabase();
    await store.loadVehiclesFromDatabase();
    return store;
  }
  console.log('[Storage] Using Memory storage');
  return new MemStorage();
}

// For immediate synchronous access, default to MemStorage until async init completes
let _storage: IStorage = new MemStorage();

// Initialize async storage
createStorage().then(s => {
  _storage = s;
}).catch(err => {
  console.error('[Storage] Failed to initialize Supabase storage, using MemStorage:', err);
});

export const storage: IStorage = new Proxy({} as IStorage, {
  get: (_, prop) => (_storage as any)[prop]?.bind?.(_storage) ?? (_storage as any)[prop]
});
