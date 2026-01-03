// Twilio SMS Service - Integration for Run Courier
// Uses Replit's Twilio connector for secure credential management

import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
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
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
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
