export type CustomerRole = 'individual' | 'business';

export type PaymentOption = 'pay_now' | 'pay_later';

export type BookingStatus = 
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'confirmed'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export type CustomerProfile = {
  id: string;
  auth_user_id: string;
  role: CustomerRole;
  email: string;
  full_name: string;
  phone?: string;
  address?: string;
  postcode?: string;
  company_name?: string;
  company_reg_number?: string;
  company_address?: string;
  contact_person_name?: string;
  contact_person_phone?: string;
  stripe_customer_id?: string;
  pay_later_enabled?: boolean;
  created_at: string;
  updated_at?: string;
};

export type CustomerBooking = {
  id: string;
  customer_id: string;
  tracking_number: string;
  pickup_address: string;
  pickup_postcode: string;
  pickup_lat?: number;
  pickup_lng?: number;
  delivery_address: string;
  delivery_postcode: string;
  delivery_lat?: number;
  delivery_lng?: number;
  scheduled_date: string;
  scheduled_time?: string;
  vehicle_type: 'motorbike' | 'car' | 'small_van' | 'medium_van';
  parcel_weight?: number;
  parcel_description?: string;
  is_multi_drop: boolean;
  is_return_required: boolean;
  payment_option: PaymentOption;
  price_estimate?: number;
  price_final?: number;
  status: BookingStatus;
  driver_job_id?: string;
  stripe_payment_intent_id?: string;
  invoice_id?: string;
  notes?: string;
  sender_name?: string;
  sender_phone?: string;
  recipient_name?: string;
  recipient_phone?: string;
  pod_photo_url?: string;
  pod_photos?: string[];
  pod_signature_url?: string;
  pod_notes?: string;
  delivered_at?: string;
  created_at: string;
  updated_at?: string;
};

export type BookingStop = {
  id: string;
  booking_id: string;
  stop_order: number;
  stop_type: 'pickup' | 'delivery' | 'return';
  address: string;
  postcode: string;
  lat?: number;
  lng?: number;
  recipient_name?: string;
  recipient_phone?: string;
  notes?: string;
  completed_at?: string;
  created_at: string;
};

export type BookingPayment = {
  id: string;
  booking_id: string;
  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  payment_method?: string;
  created_at: string;
};

export type CustomerInvoice = {
  id: string;
  customer_id: string;
  invoice_number: string;
  week_start_date: string;
  week_end_date: string;
  week_ending: string;
  total_jobs: number;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: 'pending' | 'sent' | 'paid' | 'overdue';
  stripe_invoice_id?: string;
  due_date: string;
  paid_at?: string;
  created_at: string;
};
