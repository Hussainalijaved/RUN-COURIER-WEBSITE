import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = (): string => {
  const extra = 
    Constants.expoConfig?.extra ||
    (Constants as any).manifest?.extra ||
    (Constants as any).manifest2?.extra?.expoClient?.extra ||
    {};
  
  return extra.apiUrl || process.env.EXPO_PUBLIC_API_URL || '';
};

export interface PODEmailData {
  jobId: string;
  customerName: string;
  customerEmail: string;
  recipientName: string;
  pickupAddress: string;
  deliveryAddress: string;
  deliveredAt: string;
  driverName: string;
  trackingNumber: string;
  podNotes?: string;
  podPhotoUrls: string[];
  signatureUrl?: string;
}

export interface BookingConfirmationData {
  customerEmail: string;
  customerName: string;
  trackingNumber: string;
  pickupAddress: string;
  deliveryAddress: string;
  scheduledDate: string;
  scheduledTime?: string;
  price?: number;
  vehicleType?: string;
}

export interface JobRejectionEmailData {
  jobId: string;
  pickupAddress: string;
  deliveryAddress: string;
  driverName: string;
  rejectionReason: string;
  price: number;
  scheduledPickupTime?: string;
}

export async function sendPODEmail(data: PODEmailData): Promise<{ success: boolean; error?: string }> {
  const apiUrl = getApiUrl();
  
  if (!apiUrl) {
    console.log('[EMAIL] API URL not configured - POD email will be sent from backend');
    return { success: true };
  }

  try {
    console.log('[EMAIL] Sending POD notification via API');
    
    const response = await fetch(`${apiUrl}/api/email/pod-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        trackingNumber: data.trackingNumber,
        recipientName: data.recipientName,
        deliveryAddress: data.deliveryAddress,
        deliveredAt: data.deliveredAt,
        driverName: data.driverName,
        podPhotoUrls: data.podPhotoUrls,
        signatureUrl: data.signatureUrl,
        podNotes: data.podNotes,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('[EMAIL] POD email failed:', result.error);
      return { success: false, error: result.error };
    }

    console.log('[EMAIL] POD notification sent:', result.emailId || 'skipped');
    return { success: true };
  } catch (error: any) {
    console.error('[EMAIL] Error sending POD email:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendBookingConfirmationEmail(data: BookingConfirmationData): Promise<{ success: boolean; error?: string }> {
  const apiUrl = getApiUrl();
  
  if (!apiUrl) {
    console.log('[EMAIL] API URL not configured - booking confirmation will be sent from backend');
    return { success: true };
  }

  try {
    console.log('[EMAIL] Sending booking confirmation via API');
    
    const response = await fetch(`${apiUrl}/api/email/booking-confirmation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('[EMAIL] Booking confirmation failed:', result.error);
      return { success: false, error: result.error };
    }

    console.log('[EMAIL] Booking confirmation sent:', result.emailId || 'skipped');
    return { success: true };
  } catch (error: any) {
    console.error('[EMAIL] Error sending booking confirmation:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendJobRejectionEmail(data: JobRejectionEmailData): Promise<{ success: boolean; error?: string }> {
  console.log('[EMAIL] Job rejection recorded - admin will be notified via dashboard');
  return { success: true };
}

export async function testEmailConnection(): Promise<boolean> {
  const apiUrl = getApiUrl();
  
  if (!apiUrl) {
    return false;
  }

  try {
    const response = await fetch(`${apiUrl}/api/email/test`);
    const result = await response.json();
    return result.connected === true;
  } catch (error) {
    return false;
  }
}
