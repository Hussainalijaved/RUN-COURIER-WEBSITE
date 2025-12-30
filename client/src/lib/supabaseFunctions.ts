import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function callEdgeFunction<T>(
  functionName: string,
  body: object
): Promise<T> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Function ${functionName} failed`);
  }

  return data;
}

export interface CreateJobData {
  customerId?: string;
  customerEmail?: string;
  pickupAddress: string;
  pickupPostcode: string;
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupInstructions?: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryInstructions?: string;
  vehicleType: string;
  weight?: string;
  distance?: string;
  basePrice: string;
  distancePrice?: string;
  weightSurcharge?: string;
  multiDropCharge?: string;
  returnTripCharge?: string;
  centralLondonCharge?: string;
  waitingTimeCharge?: string;
  totalPrice: string;
  scheduledPickupTime?: string;
  scheduledDeliveryTime?: string;
  isMultiDrop?: boolean;
  isReturnTrip?: boolean;
  paymentStatus?: string;
}

export interface UpdateJobStatusData {
  jobId: string;
  status: string;
  rejectionReason?: string;
}

export interface AssignDriverData {
  jobId: string;
  driverId: string;
  driverPrice?: string;
  dispatcherId?: string;
}

export interface CreatePaymentIntentData {
  amount: number;
  currency?: string;
  jobId?: string;
  customerId?: string;
  customerEmail?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface SendEmailData {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface UpdateDriverData {
  driverId: string;
  isVerified?: boolean;
  isAvailable?: boolean;
  isActive?: boolean;
  fullName?: string;
  phone?: string;
  address?: string;
  postcode?: string;
  vehicleType?: string;
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  bypassDocumentCheck?: boolean;
}

export interface DeleteDriverData {
  driverId: string;
}

export const supabaseFunctions = {
  async createJob(data: CreateJobData) {
    return callEdgeFunction('create-job', data);
  },

  async updateJobStatus(data: UpdateJobStatusData) {
    return callEdgeFunction('update-job-status', data);
  },

  async assignDriver(data: AssignDriverData) {
    return callEdgeFunction('assign-driver', data);
  },

  async createPaymentIntent(data: CreatePaymentIntentData): Promise<PaymentIntentResponse> {
    return callEdgeFunction<PaymentIntentResponse>('stripe-create-payment-intent', data);
  },

  async sendEmail(data: SendEmailData) {
    return callEdgeFunction('send-email', data);
  },

  async updateDriver(data: UpdateDriverData) {
    return callEdgeFunction('update-driver', data);
  },

  async deleteDriver(data: DeleteDriverData) {
    return callEdgeFunction('delete-driver', data);
  },
};

export default supabaseFunctions;
