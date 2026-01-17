// Twilio SMS Service - Integration for Run Courier
// Uses Replit's Twilio connector for secure credential management

import twilio from 'twilio';

// In-memory store for verification codes (expires after 10 minutes)
const verificationCodes: Map<string, { code: string; expiresAt: number; attempts: number }> = new Map();

// Store for verified phones (token -> phone mapping, expires after 30 minutes)
const verifiedPhones: Map<string, { phone: string; expiresAt: number }> = new Map();

// Clean up expired codes and tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  const codeEntries = Array.from(verificationCodes.entries());
  for (const [phone, data] of codeEntries) {
    if (data.expiresAt < now) {
      verificationCodes.delete(phone);
    }
  }
  const tokenEntries = Array.from(verifiedPhones.entries());
  for (const [token, data] of tokenEntries) {
    if (data.expiresAt < now) {
      verifiedPhones.delete(token);
    }
  }
}, 5 * 60 * 1000);

let connectionSettings: any;

async function getCredentials() {
  // First try environment variables (user-provided secrets)
  const envAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const envAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const envPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  if (envAccountSid && envAuthToken && envPhoneNumber) {
    console.log('[Twilio] Using environment variable credentials');
    return {
      accountSid: envAccountSid,
      authToken: envAuthToken,
      phoneNumber: envPhoneNumber,
      useAuthToken: true
    };
  }

  // Fallback to Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number,
    useAuthToken: false
  };
}

export async function getTwilioClient() {
  const creds = await getCredentials();
  
  if (creds.useAuthToken) {
    // Using Account SID + Auth Token (from environment variables)
    return twilio(creds.accountSid, creds.authToken);
  } else {
    // Using API Key authentication (from Replit connector)
    return twilio(creds.apiKey, creds.apiKeySecret, {
      accountSid: creds.accountSid
    });
  }
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

// Format UK phone number to E.164 format
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle UK numbers
  if (cleaned.startsWith('44')) {
    return '+' + cleaned;
  } else if (cleaned.startsWith('0')) {
    return '+44' + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    // Assume UK mobile without leading 0
    return '+44' + cleaned;
  }
  
  // If already has + prefix, return as is
  if (phone.startsWith('+')) {
    return phone;
  }
  
  return '+44' + cleaned;
}

// Send SMS notification
export async function sendSMS(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    const formattedTo = formatPhoneNumber(to);
    
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedTo
    });
    
    console.log(`[Twilio] SMS sent successfully to ${formattedTo}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('[Twilio] Failed to send SMS:', error.message);
    return { success: false, error: error.message };
  }
}

// Send booking confirmation SMS to customer
export async function sendBookingConfirmationSMS(phone: string, trackingNumber: string, pickupAddress: string): Promise<{ success: boolean; error?: string }> {
  const message = `Run Courier: Your booking is confirmed! Tracking: ${trackingNumber}. Pickup from: ${pickupAddress}. Track at: runcourier.co.uk/track/${trackingNumber}`;
  return sendSMS(phone, message);
}

// Send pickup notification to customer
export async function sendPickupNotificationSMS(phone: string, trackingNumber: string, driverName?: string): Promise<{ success: boolean; error?: string }> {
  const driverInfo = driverName ? ` Driver: ${driverName}.` : '';
  const message = `Run Courier: Your parcel has been picked up!${driverInfo} Tracking: ${trackingNumber}. Track at: runcourier.co.uk/track/${trackingNumber}`;
  return sendSMS(phone, message);
}

// Send delivery notification to recipient
export async function sendDeliveryNotificationSMS(phone: string, trackingNumber: string, estimatedTime?: string): Promise<{ success: boolean; error?: string }> {
  const timeInfo = estimatedTime ? ` ETA: ${estimatedTime}.` : '';
  const message = `Run Courier: Your delivery is on its way!${timeInfo} Tracking: ${trackingNumber}. Track at: runcourier.co.uk/track/${trackingNumber}`;
  return sendSMS(phone, message);
}

// Send delivered confirmation to recipient
export async function sendDeliveredSMS(phone: string, trackingNumber: string): Promise<{ success: boolean; error?: string }> {
  const message = `Run Courier: Your parcel has been delivered! Tracking: ${trackingNumber}. Thank you for using Run Courier.`;
  return sendSMS(phone, message);
}

// Send job assignment notification to driver
export async function sendDriverJobAssignmentSMS(phone: string, pickupPostcode: string, deliveryPostcode: string, driverPrice: number): Promise<{ success: boolean; error?: string }> {
  const message = `Run Courier Job: New job assigned! Pickup: ${pickupPostcode} → Delivery: ${deliveryPostcode}. Payment: £${driverPrice.toFixed(2)}. Open the app to accept.`;
  return sendSMS(phone, message);
}

// Send status update to customer
export async function sendStatusUpdateSMS(phone: string, trackingNumber: string, status: string): Promise<{ success: boolean; error?: string }> {
  const statusMessages: Record<string, string> = {
    'pending': 'Your booking is being processed.',
    'assigned': 'A driver has been assigned to your delivery.',
    'picked_up': 'Your parcel has been picked up and is on its way.',
    'in_transit': 'Your parcel is in transit.',
    'delivered': 'Your parcel has been delivered successfully!',
    'cancelled': 'Your booking has been cancelled.',
  };
  
  const statusMessage = statusMessages[status] || `Status updated to: ${status}`;
  const message = `Run Courier: ${statusMessage} Tracking: ${trackingNumber}`;
  return sendSMS(phone, message);
}

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize phone number for storage key
function normalizePhoneKey(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Send phone verification code
export async function sendVerificationCode(phone: string): Promise<{ success: boolean; error?: string }> {
  try {
    const phoneKey = normalizePhoneKey(phone);
    
    // Check rate limiting (max 3 requests per 10 minutes)
    const existing = verificationCodes.get(phoneKey);
    if (existing && existing.attempts >= 3 && existing.expiresAt > Date.now()) {
      return { success: false, error: 'Too many verification attempts. Please wait 10 minutes.' };
    }
    
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    verificationCodes.set(phoneKey, { 
      code, 
      expiresAt, 
      attempts: (existing?.attempts || 0) + 1 
    });
    
    const message = `Run Courier: Your verification code is ${code}. This code expires in 10 minutes.`;
    const result = await sendSMS(phone, message);
    
    if (!result.success) {
      verificationCodes.delete(phoneKey);
      return { success: false, error: result.error || 'Failed to send verification code' };
    }
    
    console.log(`[Twilio] Verification code sent to ${phoneKey.slice(-4)}`);
    return { success: true };
  } catch (error: any) {
    console.error('[Twilio] Failed to send verification code:', error.message);
    return { success: false, error: error.message };
  }
}

// Generate a random verification token
function generateVerificationToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Verify the code and return a verification token
export async function verifyCode(phone: string, code: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const phoneKey = normalizePhoneKey(phone);
  const stored = verificationCodes.get(phoneKey);
  
  if (!stored) {
    return { success: false, error: 'No verification code found. Please request a new code.' };
  }
  
  if (stored.expiresAt < Date.now()) {
    verificationCodes.delete(phoneKey);
    return { success: false, error: 'Verification code has expired. Please request a new code.' };
  }
  
  if (stored.code !== code) {
    return { success: false, error: 'Invalid verification code. Please try again.' };
  }
  
  // Code is valid - remove it and create a verification token
  verificationCodes.delete(phoneKey);
  
  // Create a verification token valid for 30 minutes
  const token = generateVerificationToken();
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
  verifiedPhones.set(token, { phone: phoneKey, expiresAt });
  
  console.log(`[Twilio] Phone verified successfully: ${phoneKey.slice(-4)}, token issued`);
  return { success: true, token };
}

// Validate a verification token and return the phone number
export function validateVerificationToken(token: string): { valid: boolean; phone?: string } {
  const data = verifiedPhones.get(token);
  
  if (!data) {
    return { valid: false };
  }
  
  if (data.expiresAt < Date.now()) {
    verifiedPhones.delete(token);
    return { valid: false };
  }
  
  return { valid: true, phone: data.phone };
}

// Consume a verification token (use once and invalidate)
export function consumeVerificationToken(token: string): { valid: boolean; phone?: string } {
  const result = validateVerificationToken(token);
  if (result.valid) {
    verifiedPhones.delete(token);
  }
  return result;
}
