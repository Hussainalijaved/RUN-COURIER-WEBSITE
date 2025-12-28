import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export type UserRole = "admin" | "driver" | "customer" | "dispatcher" | "vendor";
export type UserType = "individual" | "business";
export type JobStatus = "pending" | "assigned" | "accepted" | "on_the_way_pickup" | "arrived_pickup" | "collected" | "on_the_way_delivery" | "delivered" | "cancelled";
export type VehicleType = "motorbike" | "car" | "small_van" | "medium_van";
export type DocumentType = 
  | "id_passport" | "driving_licence" | "right_to_work" | "vehicle_photo" | "insurance" | "goods_in_transit" | "hire_reward"
  | "driving_license" | "hire_and_reward_insurance" | "goods_in_transit_insurance" | "proof_of_identity" | "proof_of_address"
  | "vehicle_photo_front" | "vehicle_photo_rear" | "vehicle_photo_side"
  | "profilePicture" | "drivingLicenceFront" | "drivingLicenceBack" | "dbsCertificate" | "goodsInTransitInsurance" | "hireAndReward"
  | string;
export type DocumentStatus = "pending" | "approved" | "rejected";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password"),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  postcode: text("postcode"),
  address: text("address"),
  buildingName: text("building_name"),
  role: text("role").$type<UserRole>().notNull().default("customer"),
  userType: text("user_type").$type<UserType>().default("individual"),
  companyName: text("company_name"),
  registrationNumber: text("registration_number"),
  businessAddress: text("business_address"),
  vatNumber: text("vat_number"),
  stripeCustomerId: text("stripe_customer_id"),
  payLaterEnabled: boolean("pay_later_enabled").default(false),
  completedBookingsCount: integer("completed_bookings_count").default(0).notNull(),
  isActive: boolean("is_active").default(true),
  deactivatedAt: timestamp("deactivated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivers = pgTable("drivers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  driverCode: text("driver_code").unique(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  postcode: text("postcode"),
  address: text("address"),
  nationality: text("nationality"),
  isBritish: boolean("is_british").default(true),
  nationalInsuranceNumber: text("national_insurance_number"),
  rightToWorkShareCode: text("right_to_work_share_code"),
  dbsChecked: boolean("dbs_checked").default(false),
  dbsCertificateUrl: text("dbs_certificate_url"),
  dbsCheckDate: timestamp("dbs_check_date"),
  vehicleType: text("vehicle_type").$type<VehicleType>().notNull(),
  vehicleRegistration: text("vehicle_registration"),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleColor: text("vehicle_color"),
  isAvailable: boolean("is_available").default(false),
  isVerified: boolean("is_verified").default(false),
  currentLatitude: decimal("current_latitude", { precision: 10, scale: 7 }),
  currentLongitude: decimal("current_longitude", { precision: 10, scale: 7 }),
  lastLocationUpdate: timestamp("last_location_update"),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
  totalJobs: integer("total_jobs").default(0),
  profilePictureUrl: text("profile_picture_url"),
  isActive: boolean("is_active").default(true),
  deactivatedAt: timestamp("deactivated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: text("type").$type<VehicleType>().notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  maxWeight: integer("max_weight").notNull(),
  baseCharge: decimal("base_charge", { precision: 10, scale: 2 }).notNull(),
  perMileRate: decimal("per_mile_rate", { precision: 10, scale: 2 }).notNull(),
  rushHourRate: decimal("rush_hour_rate", { precision: 10, scale: 2 }),
  iconUrl: text("icon_url"),
});

export const pricingSettings = pgTable("pricing_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  centralLondonSurcharge: decimal("central_london_surcharge", { precision: 10, scale: 2 }).default("15.00"),
  multiDropCharge: decimal("multi_drop_charge", { precision: 10, scale: 2 }).default("5.00"),
  returnTripMultiplier: decimal("return_trip_multiplier", { precision: 5, scale: 2 }).default("0.60"),
  waitingTimeFreeMinutes: integer("waiting_time_free_minutes").default(10),
  waitingTimePerMinute: decimal("waiting_time_per_minute", { precision: 10, scale: 2 }).default("0.50"),
  rushHourStart: text("rush_hour_start").default("07:00"),
  rushHourEnd: text("rush_hour_end").default("09:00"),
  rushHourStartEvening: text("rush_hour_start_evening").default("17:00"),
  rushHourEndEvening: text("rush_hour_end_evening").default("19:00"),
  weightSurcharges: jsonb("weight_surcharges").$type<Record<string, number>>().default({
    "4-10": 5,
    "10-20": 10,
    "20-30": 15,
    "30-50": 20,
    "50+": 40
  }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  trackingNumber: text("tracking_number").notNull().unique(),
  customerId: varchar("customer_id", { length: 36 }).notNull(),
  driverId: varchar("driver_id", { length: 36 }),
  dispatcherId: varchar("dispatcher_id", { length: 36 }),
  vendorId: varchar("vendor_id", { length: 36 }),
  status: text("status").$type<JobStatus>().notNull().default("pending"),
  vehicleType: text("vehicle_type").$type<VehicleType>().notNull(),
  pickupAddress: text("pickup_address").notNull(),
  pickupPostcode: text("pickup_postcode").notNull(),
  pickupLatitude: decimal("pickup_latitude", { precision: 10, scale: 7 }),
  pickupLongitude: decimal("pickup_longitude", { precision: 10, scale: 7 }),
  pickupInstructions: text("pickup_instructions"),
  pickupBuildingName: text("pickup_building_name"),
  pickupContactName: text("pickup_contact_name"),
  pickupContactPhone: text("pickup_contact_phone"),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryPostcode: text("delivery_postcode").notNull(),
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 7 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 10, scale: 7 }),
  deliveryInstructions: text("delivery_instructions"),
  deliveryBuildingName: text("delivery_building_name"),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  weight: decimal("weight", { precision: 10, scale: 2 }).notNull(),
  distance: decimal("distance", { precision: 10, scale: 2 }),
  isMultiDrop: boolean("is_multi_drop").default(false),
  isReturnTrip: boolean("is_return_trip").default(false),
  returnToSameLocation: boolean("return_to_same_location").default(true),
  returnAddress: text("return_address"),
  returnPostcode: text("return_postcode"),
  isScheduled: boolean("is_scheduled").default(false),
  scheduledPickupTime: timestamp("scheduled_pickup_time"),
  scheduledDeliveryTime: timestamp("scheduled_delivery_time"),
  isCentralLondon: boolean("is_central_london").default(false),
  isRushHour: boolean("is_rush_hour").default(false),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  distancePrice: decimal("distance_price", { precision: 10, scale: 2 }).notNull(),
  weightSurcharge: decimal("weight_surcharge", { precision: 10, scale: 2 }).default("0"),
  multiDropCharge: decimal("multi_drop_charge", { precision: 10, scale: 2 }).default("0"),
  returnTripCharge: decimal("return_trip_charge", { precision: 10, scale: 2 }).default("0"),
  centralLondonCharge: decimal("central_london_charge", { precision: 10, scale: 2 }).default("0"),
  waitingTimeCharge: decimal("waiting_time_charge", { precision: 10, scale: 2 }).default("0"),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  driverPrice: decimal("driver_price", { precision: 10, scale: 2 }),
  paymentStatus: text("payment_status").default("pending"),
  paymentIntentId: text("payment_intent_id"),
  podPhotoUrl: text("pod_photo_url"),
  podSignatureUrl: text("pod_signature_url"),
  podRecipientName: text("pod_recipient_name"),
  deliveredAt: timestamp("delivered_at"),
  rejectionReason: text("rejection_reason"),
  estimatedPickupTime: timestamp("estimated_pickup_time"),
  estimatedDeliveryTime: timestamp("estimated_delivery_time"),
  actualPickupTime: timestamp("actual_pickup_time"),
  actualDeliveryTime: timestamp("actual_delivery_time"),
  driverHidden: boolean("driver_hidden").default(false),
  driverHiddenAt: timestamp("driver_hidden_at"),
  driverHiddenBy: varchar("driver_hidden_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const multiDropStops = pgTable("multi_drop_stops", {
  id: varchar("id", { length: 36 }).primaryKey(),
  jobId: varchar("job_id", { length: 36 }).notNull(),
  stopOrder: integer("stop_order").notNull(),
  address: text("address").notNull(),
  postcode: text("postcode").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  instructions: text("instructions"),
  status: text("status").default("pending"),
  deliveredAt: timestamp("delivered_at"),
  podPhotoUrl: text("pod_photo_url"),
  podSignatureUrl: text("pod_signature_url"),
  podRecipientName: text("pod_recipient_name"),
});

export const documents = pgTable("documents", {
  id: varchar("id", { length: 36 }).primaryKey(),
  driverId: varchar("driver_id", { length: 36 }).notNull(),
  type: text("type").$type<DocumentType>().notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  status: text("status").$type<DocumentStatus>().notNull().default("pending"),
  reviewedBy: varchar("reviewed_by", { length: 36 }),
  reviewNotes: text("review_notes"),
  expiryDate: timestamp("expiry_date"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info"),
  isRead: boolean("is_read").default(false),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vendorApiKeys = pgTable("vendor_api_keys", {
  id: varchar("id", { length: 36 }).primaryKey(),
  vendorId: varchar("vendor_id", { length: 36 }).notNull(),
  apiKey: text("api_key").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DriverApplicationStatus = "pending" | "approved" | "rejected";
export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";
export type JobAssignmentStatus = "pending" | "sent" | "accepted" | "rejected" | "cancelled" | "expired" | "withdrawn" | "removed" | "cleaned";

export const invoices = pgTable("invoices", {
  id: varchar("id", { length: 36 }).primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: varchar("customer_id", { length: 36 }).notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  companyName: text("company_name"),
  businessAddress: text("business_address"),
  vatNumber: text("vat_number"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  vat: decimal("vat", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<InvoiceStatus>().notNull().default("pending"),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  jobIds: text("job_ids").array(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const driverApplications = pgTable("driver_applications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  
  // Personal Information
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  postcode: text("postcode").notNull(),
  fullAddress: text("full_address").notNull(),
  buildingName: text("building_name"),
  profilePictureUrl: text("profile_picture_url"),
  nationality: text("nationality").notNull(),
  isBritish: boolean("is_british").default(false),
  nationalInsuranceNumber: text("national_insurance_number").notNull(),
  
  // Right to Work (for non-British citizens)
  rightToWorkShareCode: text("right_to_work_share_code"),
  
  // Documents
  drivingLicenceFrontUrl: text("driving_licence_front_url"),
  drivingLicenceBackUrl: text("driving_licence_back_url"),
  dbsCertificateUrl: text("dbs_certificate_url"),
  goodsInTransitInsuranceUrl: text("goods_in_transit_insurance_url"),
  hireAndRewardUrl: text("hire_and_reward_url"),
  
  // Vehicle Information
  vehicleType: text("vehicle_type").$type<VehicleType>().notNull(),
  
  // Bank Details
  bankName: text("bank_name").notNull(),
  accountHolderName: text("account_holder_name").notNull(),
  sortCode: text("sort_code").notNull(),
  accountNumber: text("account_number").notNull(),
  
  // Application Status
  status: text("status").$type<DriverApplicationStatus>().notNull().default("pending"),
  reviewedBy: varchar("reviewed_by", { length: 36 }),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),
  
  // Timestamps
  submittedAt: timestamp("submitted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const jobAssignments = pgTable("job_assignments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  jobId: varchar("job_id", { length: 36 }).notNull(),
  driverId: varchar("driver_id", { length: 36 }).notNull(),
  assignedBy: varchar("assigned_by", { length: 36 }).notNull(),
  driverPrice: decimal("driver_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<JobAssignmentStatus>().notNull().default("pending"),
  batchGroupId: varchar("batch_group_id", { length: 36 }),
  sentAt: timestamp("sent_at"),
  respondedAt: timestamp("responded_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  rejectionReason: text("rejection_reason"),
  expiresAt: timestamp("expires_at"),
  withdrawnAt: timestamp("withdrawn_at"),
  withdrawnBy: varchar("withdrawn_by", { length: 36 }),
  removedAt: timestamp("removed_at"),
  removedBy: varchar("removed_by", { length: 36 }),
  cleanedAt: timestamp("cleaned_at"),
  cleanedBy: varchar("cleaned_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deliveryContacts = pgTable("delivery_contacts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  customerId: varchar("customer_id", { length: 36 }).notNull(),
  label: text("label").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryPostcode: text("delivery_postcode").notNull(),
  buildingName: text("building_name"),
  deliveryInstructions: text("delivery_instructions"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DriverPaymentStatus = "pending" | "processing" | "paid" | "failed";

export const driverPayments = pgTable("driver_payments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  driverId: varchar("driver_id", { length: 36 }).notNull(),
  jobId: varchar("job_id", { length: 36 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0.00"),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<DriverPaymentStatus>().notNull().default("pending"),
  payoutReference: text("payout_reference"),
  description: text("description"),
  jobTrackingNumber: text("job_tracking_number"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PaymentLinkStatus = "pending" | "sent" | "opened" | "paid" | "cancelled" | "expired";

export const paymentLinks = pgTable("payment_links", {
  id: varchar("id", { length: 36 }).primaryKey(),
  jobId: varchar("job_id", { length: 36 }).notNull(),
  customerId: varchar("customer_id", { length: 36 }).notNull(),
  customerEmail: text("customer_email").notNull(),
  token: text("token").notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<PaymentLinkStatus>().notNull().default("pending"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeReceiptUrl: text("stripe_receipt_url"),
  sentViaEmail: boolean("sent_via_email").default(false),
  sentViaSms: boolean("sent_via_sms").default(false),
  auditLog: jsonb("audit_log").$type<Array<{ event: string; timestamp: string; actor?: string; details?: string }>>().default([]),
  expiresAt: timestamp("expires_at").notNull(),
  openedAt: timestamp("opened_at"),
  paidAt: timestamp("paid_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by", { length: 36 }),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertDriverSchema = createInsertSchema(drivers).omit({ id: true, createdAt: true });
export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true });
export const insertPricingSettingsSchema = createInsertSchema(pricingSettings).omit({ id: true, updatedAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMultiDropStopSchema = createInsertSchema(multiDropStops).omit({ id: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertVendorApiKeySchema = createInsertSchema(vendorApiKeys).omit({ id: true, createdAt: true });
export const insertDriverApplicationSchema = createInsertSchema(driverApplications).omit({ id: true, submittedAt: true, reviewedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertJobAssignmentSchema = createInsertSchema(jobAssignments).omit({ id: true, createdAt: true });
export const insertDeliveryContactSchema = createInsertSchema(deliveryContacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDriverPaymentSchema = createInsertSchema(driverPayments).omit({ id: true, createdAt: true });
export const insertPaymentLinkSchema = createInsertSchema(paymentLinks).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof drivers.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertPricingSettings = z.infer<typeof insertPricingSettingsSchema>;
export type PricingSettings = typeof pricingSettings.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertMultiDropStop = z.infer<typeof insertMultiDropStopSchema>;
export type MultiDropStop = typeof multiDropStops.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertVendorApiKey = z.infer<typeof insertVendorApiKeySchema>;
export type VendorApiKey = typeof vendorApiKeys.$inferSelect;
export type InsertDriverApplication = z.infer<typeof insertDriverApplicationSchema>;
export type DriverApplication = typeof driverApplications.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertJobAssignment = z.infer<typeof insertJobAssignmentSchema>;
export type JobAssignment = typeof jobAssignments.$inferSelect;
export type InsertDeliveryContact = z.infer<typeof insertDeliveryContactSchema>;
export type DeliveryContact = typeof deliveryContacts.$inferSelect;
export type InsertDriverPayment = z.infer<typeof insertDriverPaymentSchema>;
export type DriverPayment = typeof driverPayments.$inferSelect;
export type InsertPaymentLink = z.infer<typeof insertPaymentLinkSchema>;
export type PaymentLink = typeof paymentLinks.$inferSelect;

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .regex(/^(\+44|0044|0)?[1-9]\d{8,10}$/, "Please enter a valid UK phone number"),
  postcode: z.string()
    .min(5, "Please enter a valid UK postcode")
    .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, "Please enter a valid UK postcode"),
  address: z.string().min(5, "Please enter your full address"),
  buildingName: z.string().optional(),
  role: z.enum(["customer", "driver", "vendor"]).default("customer"),
  userType: z.enum(["individual", "business"]).default("individual"),
  companyName: z.string().optional(),
  registrationNumber: z.string().optional(),
  businessAddress: z.string().optional(),
});

export const bookingQuoteSchema = z.object({
  pickupPostcode: z.string().min(3, "Valid postcode required"),
  deliveryPostcode: z.string().min(3, "Valid postcode required"),
  weight: z.number().min(0.1, "Weight must be greater than 0"),
  vehicleType: z.enum(["motorbike", "car", "small_van", "medium_van"]),
  isMultiDrop: z.boolean().default(false),
  multiDropStops: z.array(z.object({
    postcode: z.string(),
    address: z.string().optional(),
  })).optional(),
  isReturnTrip: z.boolean().default(false),
  returnToSameLocation: z.boolean().default(true),
  returnPostcode: z.string().optional(),
  pickupDate: z.string().min(1, "Pickup date is required"),
  pickupTime: z.string().min(1, "Pickup time is required"),
  deliveryDate: z.string().optional(),
  deliveryTime: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type BookingQuoteInput = z.infer<typeof bookingQuoteSchema>;
