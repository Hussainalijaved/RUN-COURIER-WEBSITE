import { 
  type User, type InsertUser,
  type Driver, type InsertDriver,
  type Job, type InsertJob,
  type Document, type InsertDocument,
  type Notification, type InsertNotification,
  type VendorApiKey, type InsertVendorApiKey,
  type DriverApplication, type InsertDriverApplication,
  type DriverApplicationStatus,
  type DocumentType,
  type DocumentStatus,
  type PricingSettings,
  type Vehicle,
  type JobStatus,
  type VehicleType,
  type BookingQuoteInput,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(filters?: { role?: string; isActive?: boolean }): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithId(id: string, user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  getDriver(id: string): Promise<Driver | undefined>;
  getDriverByUserId(userId: string): Promise<Driver | undefined>;
  getDrivers(filters?: { isAvailable?: boolean; isVerified?: boolean; vehicleType?: VehicleType }): Promise<Driver[]>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriver(id: string, data: Partial<Driver>): Promise<Driver | undefined>;
  updateDriverAvailability(id: string, isAvailable: boolean): Promise<Driver | undefined>;
  updateDriverLocation(id: string, latitude: string, longitude: string): Promise<Driver | undefined>;
  verifyDriver(id: string, isVerified: boolean): Promise<Driver | undefined>;

  getJob(id: string): Promise<Job | undefined>;
  getJobByTrackingNumber(trackingNumber: string): Promise<Job | undefined>;
  getJobs(filters?: { status?: JobStatus; customerId?: string; driverId?: string; vendorId?: string; limit?: number }): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, data: Partial<Job>): Promise<Job | undefined>;
  updateJobStatus(id: string, status: JobStatus, rejectionReason?: string): Promise<Job | undefined>;
  assignDriver(id: string, driverId: string, dispatcherId?: string): Promise<Job | undefined>;
  updateJobPOD(id: string, podPhotoUrl?: string, podSignatureUrl?: string): Promise<Job | undefined>;
  deleteJob(id: string): Promise<void>;

  getDocument(id: string): Promise<Document | undefined>;
  getDocuments(filters?: { driverId?: string; status?: string; type?: string }): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
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
  getDriverApplications(filters?: { status?: DriverApplicationStatus }): Promise<DriverApplication[]>;
  createDriverApplication(application: InsertDriverApplication): Promise<DriverApplication>;
  updateDriverApplication(id: string, data: Partial<DriverApplication>): Promise<DriverApplication | undefined>;
  reviewDriverApplication(id: string, status: DriverApplicationStatus, reviewedBy: string, reviewNotes?: string, rejectionReason?: string): Promise<DriverApplication | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private drivers: Map<string, Driver>;
  private jobs: Map<string, Job>;
  private documents: Map<string, Document>;
  private notifications: Map<string, Notification>;
  private vendorApiKeys: Map<string, VendorApiKey>;
  private driverApplications: Map<string, DriverApplication>;
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

    this.seedData();
  }

  private seedData() {
    const adminUser: User = {
      id: "admin-1",
      email: "admin@runcourier.co.uk",
      password: null,
      fullName: "Admin User",
      phone: "07700900001",
      role: "admin",
      userType: "individual",
      companyName: null,
      businessAddress: null,
      vatNumber: null,
      stripeCustomerId: null,
      payLaterEnabled: false,
      isActive: true,
      createdAt: new Date(),
    };
    this.users.set(adminUser.id, adminUser);

    const drivers = [
      { id: "driver-1", userId: "user-d1", name: "John Smith", code: "JS01", vehicle: "car" as VehicleType, lat: "51.5074", lng: "-0.1278" },
      { id: "driver-2", userId: "user-d2", name: "Sarah Wilson", code: "SW02", vehicle: "small_van" as VehicleType, lat: "51.5155", lng: "-0.1420" },
      { id: "driver-3", userId: "user-d3", name: "Mike Johnson", code: "MJ03", vehicle: "motorbike" as VehicleType, lat: "51.4995", lng: "-0.1248" },
      { id: "driver-4", userId: "user-d4", name: "Emma Brown", code: "EB04", vehicle: "medium_van" as VehicleType, lat: "51.5225", lng: "-0.0800" },
    ];

    drivers.forEach((d, i) => {
      const user: User = {
        id: d.userId,
        email: `${d.name.toLowerCase().replace(" ", ".")}@runcourier.co.uk`,
        password: null,
        fullName: d.name,
        phone: `0770090000${i + 2}`,
        role: "driver",
        userType: "individual",
        companyName: null,
        businessAddress: null,
        vatNumber: null,
        stripeCustomerId: null,
        payLaterEnabled: false,
        isActive: true,
        createdAt: new Date(),
      };
      this.users.set(user.id, user);

      const driver: Driver = {
        id: d.id,
        userId: d.userId,
        driverCode: d.code,
        vehicleType: d.vehicle,
        vehicleRegistration: `AB${i + 1}0 XYZ`,
        vehicleMake: d.vehicle === "motorbike" ? "Honda" : d.vehicle === "car" ? "Toyota" : "Ford",
        vehicleModel: d.vehicle === "motorbike" ? "CBR" : d.vehicle === "car" ? "Corolla" : "Transit",
        vehicleColor: ["White", "Silver", "Blue", "Black"][i],
        isAvailable: i < 3,
        isVerified: true,
        currentLatitude: d.lat,
        currentLongitude: d.lng,
        lastLocationUpdate: new Date(),
        rating: (4.5 + Math.random() * 0.5).toFixed(2),
        totalJobs: Math.floor(Math.random() * 500) + 50,
        createdAt: new Date(),
      };
      this.drivers.set(driver.id, driver);

      // Create sample documents for each driver
      const docTypes: Array<{ type: DocumentType; name: string }> = [
        { type: "id_passport", name: "Passport.pdf" },
        { type: "driving_licence", name: "Driving_Licence.pdf" },
        { type: "right_to_work", name: "Right_to_Work_Certificate.pdf" },
        { type: "vehicle_photo", name: "Vehicle_Photo.jpg" },
        { type: "insurance", name: "Insurance_Certificate.pdf" },
        { type: "goods_in_transit", name: "Goods_in_Transit_Insurance.pdf" },
        { type: "hire_reward", name: "Hire_Reward_Policy.pdf" },
      ];

      // First driver has all approved docs, second has mix, third has pending, fourth has rejected
      const docStatuses: DocumentStatus[][] = [
        ["approved", "approved", "approved", "approved", "approved", "approved", "approved"],
        ["approved", "approved", "pending", "approved", "pending", "pending", "pending"],
        ["pending", "pending", "pending", "pending", "pending", "pending", "pending"],
        ["approved", "approved", "rejected", "approved", "pending", "rejected", "pending"],
      ];

      docTypes.forEach((docType, docIndex) => {
        const docId = `doc-${d.id}-${docType.type}`;
        const status = docStatuses[i][docIndex];
        const document: Document = {
          id: docId,
          driverId: d.id,
          type: docType.type,
          fileName: docType.name,
          fileUrl: `https://storage.example.com/drivers/${d.id}/${docType.name}`,
          status,
          reviewedBy: status !== "pending" ? "admin-1" : null,
          reviewNotes: status === "rejected" ? "Document expired or unclear, please resubmit" : null,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          uploadedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random within last 30 days
          reviewedAt: status !== "pending" ? new Date() : null,
        };
        this.documents.set(docId, document);
      });
    });

    const customers = [
      { id: "customer-1", name: "ABC Logistics Ltd", type: "business" as const },
      { id: "customer-2", name: "Jane Cooper", type: "individual" as const },
      { id: "customer-3", name: "Tech Solutions Inc", type: "business" as const },
    ];

    customers.forEach((c, i) => {
      const user: User = {
        id: c.id,
        email: c.type === "business" 
          ? `orders@${c.name.toLowerCase().replace(/\s/g, "").replace(/ltd|inc/gi, "")}.com`
          : `${c.name.toLowerCase().replace(" ", ".")}@email.com`,
        password: null,
        fullName: c.name,
        phone: `0770090001${i}`,
        role: "customer",
        userType: c.type,
        companyName: c.type === "business" ? c.name : null,
        businessAddress: c.type === "business" ? `${i + 1} Business Park, London` : null,
        vatNumber: c.type === "business" ? `GB${100000000 + i}` : null,
        stripeCustomerId: null,
        payLaterEnabled: c.type === "business",
        isActive: true,
        createdAt: new Date(),
      };
      this.users.set(user.id, user);
    });

    const sampleJobs: Partial<Job>[] = [
      {
        id: "job-1",
        trackingNumber: "RC2024001ABC",
        customerId: "customer-1",
        driverId: "driver-1",
        status: "on_the_way_delivery",
        vehicleType: "car",
        pickupAddress: "123 Oxford Street, London",
        pickupPostcode: "W1D 2LG",
        pickupLatitude: "51.5150",
        pickupLongitude: "-0.1419",
        deliveryAddress: "456 King's Road, Chelsea",
        deliveryPostcode: "SW3 5UD",
        deliveryLatitude: "51.4873",
        deliveryLongitude: "-0.1745",
        recipientName: "James Smith",
        recipientPhone: "07700900100",
        weight: "5.50",
        distance: "4.2",
        basePrice: "25.00",
        distancePrice: "5.04",
        totalPrice: "30.04",
        isCentralLondon: true,
        isRushHour: false,
        paymentStatus: "paid",
      },
      {
        id: "job-2",
        trackingNumber: "RC2024002DEF",
        customerId: "customer-2",
        status: "pending",
        vehicleType: "small_van",
        pickupAddress: "10 Brick Lane, London",
        pickupPostcode: "E1 6RF",
        pickupLatitude: "51.5218",
        pickupLongitude: "-0.0717",
        deliveryAddress: "25 Camden High Street",
        deliveryPostcode: "NW1 7JE",
        deliveryLatitude: "51.5392",
        deliveryLongitude: "-0.1426",
        recipientName: "Alice Johnson",
        recipientPhone: "07700900101",
        weight: "45.00",
        distance: "5.8",
        basePrice: "25.00",
        distancePrice: "7.54",
        weightSurcharge: "20.00",
        totalPrice: "52.54",
        isCentralLondon: true,
        paymentStatus: "pending",
      },
      {
        id: "job-3",
        trackingNumber: "RC2024003GHI",
        customerId: "customer-3",
        driverId: "driver-2",
        status: "collected",
        vehicleType: "small_van",
        pickupAddress: "50 Liverpool Street",
        pickupPostcode: "EC2M 7PY",
        pickupLatitude: "51.5178",
        pickupLongitude: "-0.0823",
        deliveryAddress: "100 Victoria Street",
        deliveryPostcode: "SW1E 5JL",
        deliveryLatitude: "51.4965",
        deliveryLongitude: "-0.1376",
        recipientName: "Robert Brown",
        recipientPhone: "07700900102",
        weight: "120.00",
        distance: "3.5",
        isMultiDrop: true,
        basePrice: "25.00",
        distancePrice: "4.55",
        multiDropCharge: "10.00",
        weightSurcharge: "40.00",
        totalPrice: "79.55",
        isCentralLondon: true,
        paymentStatus: "paid",
      },
      {
        id: "job-4",
        trackingNumber: "RC2024004JKL",
        customerId: "customer-1",
        driverId: "driver-3",
        status: "delivered",
        vehicleType: "motorbike",
        pickupAddress: "1 Canary Wharf",
        pickupPostcode: "E14 5AB",
        pickupLatitude: "51.5054",
        pickupLongitude: "-0.0235",
        deliveryAddress: "15 Regent Street",
        deliveryPostcode: "SW1Y 4LR",
        deliveryLatitude: "51.5098",
        deliveryLongitude: "-0.1342",
        recipientName: "Emily Davis",
        recipientPhone: "07700900103",
        weight: "2.00",
        distance: "8.1",
        basePrice: "0.00",
        distancePrice: "24.30",
        totalPrice: "24.30",
        podPhotoUrl: "https://example.com/pod-photo-1.jpg",
        podSignatureUrl: "https://example.com/pod-sig-1.png",
        deliveredAt: new Date(Date.now() - 3600000),
        paymentStatus: "paid",
      },
    ];

    sampleJobs.forEach((job) => {
      const fullJob: Job = {
        id: job.id!,
        trackingNumber: job.trackingNumber!,
        customerId: job.customerId!,
        driverId: job.driverId || null,
        dispatcherId: null,
        vendorId: null,
        status: job.status as JobStatus || "pending",
        vehicleType: job.vehicleType as VehicleType,
        pickupAddress: job.pickupAddress!,
        pickupPostcode: job.pickupPostcode!,
        pickupLatitude: job.pickupLatitude || null,
        pickupLongitude: job.pickupLongitude || null,
        pickupInstructions: null,
        deliveryAddress: job.deliveryAddress!,
        deliveryPostcode: job.deliveryPostcode!,
        deliveryLatitude: job.deliveryLatitude || null,
        deliveryLongitude: job.deliveryLongitude || null,
        deliveryInstructions: null,
        recipientName: job.recipientName || null,
        recipientPhone: job.recipientPhone || null,
        weight: job.weight!,
        distance: job.distance || null,
        isMultiDrop: job.isMultiDrop || false,
        isReturnTrip: job.isReturnTrip || false,
        returnToSameLocation: true,
        returnAddress: null,
        returnPostcode: null,
        isScheduled: false,
        scheduledPickupTime: null,
        isCentralLondon: job.isCentralLondon || false,
        isRushHour: job.isRushHour || false,
        basePrice: job.basePrice!,
        distancePrice: job.distancePrice!,
        weightSurcharge: job.weightSurcharge || "0",
        multiDropCharge: job.multiDropCharge || "0",
        returnTripCharge: job.returnTripCharge || "0",
        centralLondonCharge: job.isCentralLondon ? "15.00" : "0",
        waitingTimeCharge: "0",
        totalPrice: job.totalPrice!,
        paymentStatus: job.paymentStatus || "pending",
        paymentIntentId: null,
        podPhotoUrl: job.podPhotoUrl || null,
        podSignatureUrl: job.podSignatureUrl || null,
        deliveredAt: job.deliveredAt || null,
        rejectionReason: null,
        estimatedPickupTime: null,
        estimatedDeliveryTime: null,
        actualPickupTime: null,
        actualDeliveryTime: null,
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 7),
        updatedAt: new Date(),
      };
      this.jobs.set(fullJob.id, fullJob);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === username,
    );
  }

  async getUsers(filters?: { role?: string; isActive?: boolean }): Promise<User[]> {
    let users = Array.from(this.users.values());
    if (filters?.role) {
      users = users.filter((u) => u.role === filters.role);
    }
    if (filters?.isActive !== undefined) {
      users = users.filter((u) => u.isActive === filters.isActive);
    }
    return users;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    return this.createUserWithId(id, insertUser);
  }

  async createUserWithId(id: string, insertUser: InsertUser): Promise<User> {
    if (this.users.has(id)) {
      throw new Error(`User with id ${id} already exists`);
    }
    const user: User = { 
      ...insertUser, 
      id,
      password: insertUser.password || null,
      phone: insertUser.phone || null,
      userType: insertUser.userType || "individual",
      companyName: insertUser.companyName || null,
      businessAddress: insertUser.businessAddress || null,
      vatNumber: insertUser.vatNumber || null,
      stripeCustomerId: insertUser.stripeCustomerId || null,
      payLaterEnabled: insertUser.payLaterEnabled || false,
      isActive: insertUser.isActive ?? true,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...data };
    this.users.set(id, updated);
    return updated;
  }

  async getDriver(id: string): Promise<Driver | undefined> {
    return this.drivers.get(id);
  }

  async getDriverByUserId(userId: string): Promise<Driver | undefined> {
    return Array.from(this.drivers.values()).find((d) => d.userId === userId);
  }

  async getDrivers(filters?: { isAvailable?: boolean; isVerified?: boolean; vehicleType?: VehicleType }): Promise<Driver[]> {
    let drivers = Array.from(this.drivers.values());
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
    const existingCodes = new Set(
      Array.from(this.drivers.values())
        .map(d => d.driverCode)
        .filter(Boolean)
    );
    
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let attempts = 0;
    const maxAttempts = 1000;
    
    while (attempts < maxAttempts) {
      const l1 = letters[Math.floor(Math.random() * letters.length)];
      const l2 = letters[Math.floor(Math.random() * letters.length)];
      const n1 = Math.floor(Math.random() * 10);
      const n2 = Math.floor(Math.random() * 10);
      const code = `${l1}${l2}${n1}${n2}`;
      
      if (!existingCodes.has(code)) {
        return code;
      }
      attempts++;
    }
    
    // Fallback: use timestamp-based code
    const ts = Date.now().toString(36).toUpperCase().slice(-4);
    return ts;
  }

  async createDriver(insertDriver: InsertDriver): Promise<Driver> {
    // Use the Supabase userId as the driver ID for consistency with mobile app
    const id = insertDriver.userId;
    const driverCode = insertDriver.driverCode || this.generateDriverCode();
    const driver: Driver = {
      ...insertDriver,
      id,
      driverCode,
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
      createdAt: new Date(),
    };
    this.drivers.set(id, driver);
    return driver;
  }

  async updateDriver(id: string, data: Partial<Driver>): Promise<Driver | undefined> {
    const driver = this.drivers.get(id);
    if (!driver) return undefined;
    // Never allow updating driverCode or id - these are permanent identifiers
    const { driverCode: _, id: __, ...safeData } = data;
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
      ...insertJob,
      id,
      driverId: insertJob.driverId || null,
      dispatcherId: insertJob.dispatcherId || null,
      vendorId: insertJob.vendorId || null,
      status: insertJob.status || "pending",
      pickupLatitude: insertJob.pickupLatitude || null,
      pickupLongitude: insertJob.pickupLongitude || null,
      pickupInstructions: insertJob.pickupInstructions || null,
      deliveryLatitude: insertJob.deliveryLatitude || null,
      deliveryLongitude: insertJob.deliveryLongitude || null,
      deliveryInstructions: insertJob.deliveryInstructions || null,
      recipientName: insertJob.recipientName || null,
      recipientPhone: insertJob.recipientPhone || null,
      distance: insertJob.distance || null,
      isMultiDrop: insertJob.isMultiDrop || false,
      isReturnTrip: insertJob.isReturnTrip || false,
      returnToSameLocation: insertJob.returnToSameLocation ?? true,
      returnAddress: insertJob.returnAddress || null,
      returnPostcode: insertJob.returnPostcode || null,
      isScheduled: insertJob.isScheduled || false,
      scheduledPickupTime: insertJob.scheduledPickupTime || null,
      isCentralLondon: insertJob.isCentralLondon || false,
      isRushHour: insertJob.isRushHour || false,
      weightSurcharge: insertJob.weightSurcharge || "0",
      multiDropCharge: insertJob.multiDropCharge || "0",
      returnTripCharge: insertJob.returnTripCharge || "0",
      centralLondonCharge: insertJob.centralLondonCharge || "0",
      waitingTimeCharge: insertJob.waitingTimeCharge || "0",
      paymentStatus: insertJob.paymentStatus || "pending",
      paymentIntentId: insertJob.paymentIntentId || null,
      podPhotoUrl: insertJob.podPhotoUrl || null,
      podSignatureUrl: insertJob.podSignatureUrl || null,
      deliveredAt: insertJob.deliveredAt || null,
      rejectionReason: insertJob.rejectionReason || null,
      estimatedPickupTime: insertJob.estimatedPickupTime || null,
      estimatedDeliveryTime: insertJob.estimatedDeliveryTime || null,
      actualPickupTime: insertJob.actualPickupTime || null,
      actualDeliveryTime: insertJob.actualDeliveryTime || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(id, job);
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
    return this.updateJob(id, { 
      driverId, 
      dispatcherId: dispatcherId || null, 
      status: "assigned" 
    });
  }

  async updateJobPOD(id: string, podPhotoUrl?: string, podSignatureUrl?: string): Promise<Job | undefined> {
    return this.updateJob(id, { 
      podPhotoUrl: podPhotoUrl || null, 
      podSignatureUrl: podSignatureUrl || null 
    });
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
      ...insertDocument,
      id,
      status: insertDocument.status || "pending",
      reviewedBy: insertDocument.reviewedBy || null,
      reviewNotes: insertDocument.reviewNotes || null,
      expiryDate: insertDocument.expiryDate || null,
      uploadedAt: new Date(),
      reviewedAt: null,
    };
    this.documents.set(id, document);
    return document;
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

    const isScheduledRushHour = input.scheduledPickupTime 
      ? this.checkRushHour(new Date(input.scheduledPickupTime))
      : this.checkRushHour(new Date());

    const rate = isScheduledRushHour ? rushHourRate : perMileRate;
    const distanceCharge = distance * rate;

    const weightSurcharge = this.getWeightSurcharge(input.weight);

    const centralLondon = this.isCentralLondon(input.pickupPostcode) || this.isCentralLondon(input.deliveryPostcode);
    const centralLondonCharge = centralLondon ? parseFloat(this.pricingSettings.centralLondonSurcharge || "15") : 0;

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
    return this.driverApplications.get(id);
  }

  async getDriverApplicationByEmail(email: string): Promise<DriverApplication | undefined> {
    return Array.from(this.driverApplications.values()).find(
      (app) => app.email.toLowerCase() === email.toLowerCase()
    );
  }

  async getDriverApplications(filters?: { status?: DriverApplicationStatus }): Promise<DriverApplication[]> {
    let applications = Array.from(this.driverApplications.values());
    if (filters?.status) {
      applications = applications.filter((app) => app.status === filters.status);
    }
    return applications.sort((a, b) => {
      const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async createDriverApplication(application: InsertDriverApplication): Promise<DriverApplication> {
    const id = randomUUID();
    const newApplication: DriverApplication = {
      id,
      ...application,
      status: (application.status || "pending") as DriverApplicationStatus,
      isBritish: application.isBritish || false,
      buildingName: application.buildingName || null,
      profilePictureUrl: application.profilePictureUrl || null,
      rightToWorkUrl: application.rightToWorkUrl || null,
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
    this.driverApplications.set(id, newApplication);
    return newApplication;
  }

  async updateDriverApplication(id: string, data: Partial<DriverApplication>): Promise<DriverApplication | undefined> {
    const application = this.driverApplications.get(id);
    if (!application) return undefined;
    const updated = { ...application, ...data };
    this.driverApplications.set(id, updated);
    return updated;
  }

  async reviewDriverApplication(
    id: string, 
    status: DriverApplicationStatus, 
    reviewedBy: string, 
    reviewNotes?: string, 
    rejectionReason?: string
  ): Promise<DriverApplication | undefined> {
    const application = this.driverApplications.get(id);
    if (!application) return undefined;
    const updated: DriverApplication = {
      ...application,
      status,
      reviewedBy,
      reviewNotes: reviewNotes || null,
      rejectionReason: status === "rejected" ? rejectionReason || null : null,
      reviewedAt: new Date(),
    };
    this.driverApplications.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
