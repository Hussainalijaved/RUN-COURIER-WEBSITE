import { Resend } from 'resend';

let connectionSettings: any;

// Base URL for tracking links - always use production domain in emails
const BASE_URL = process.env.APP_URL || 'https://runcourier.co.uk';

// Logo URL - derived from BASE_URL to stay consistent across deployments
const LOGO_URL = `${BASE_URL}/logo-email.jpg`;

// Mobile app store URLs
const GOOGLE_PLAY_URL = process.env.GOOGLE_PLAY_URL || 'https://play.google.com/store/apps/details?id=com.runcourier.app';
const APP_STORE_URL = process.env.APP_STORE_URL || 'https://apps.apple.com/us/app/run-courier/id6756506175';

// Official store badge image URLs (Google and Apple hosted)
const GOOGLE_PLAY_BADGE_URL = 'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
const APP_STORE_BADGE_URL = 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83';

// Primary notification emails - Centralized configuration
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sales@runcourier.co.uk';
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@runcourier.co.uk';
export const INFO_EMAIL = process.env.INFO_EMAIL || 'info@runcourier.co.uk';

// VERIFIED SENDER - Must be from a domain verified in Resend (runcourier.co.uk)
export const SENDER_EMAIL = process.env.RESEND_FROM_EMAIL || 'Run Courier <info@runcourier.co.uk>';

// Reusable email header with logo
function getEmailHeader(title?: string): string {
  return `
    <div style="background-color: #007BFF; padding: 24px 20px; text-align: center;">
      <img src="${LOGO_URL}" alt="Run Courier" style="max-width: 180px; height: auto; margin-bottom: ${title ? '12px' : '0'}; display: inline-block;" />
      ${title ? `<h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">${title}</h1>` : ''}
    </div>
  `;
}

// Reusable email footer
function getEmailFooter(): string {
  return `
    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
    <div style="text-align: center;">
      <img src="${LOGO_URL}" alt="Run Courier" style="max-width: 60px; height: auto; margin-bottom: 10px;" />
      <p style="color: #555; font-size: 12px; margin: 0;">
        Run Courier - Same Day Delivery Across the UK<br>
        <a href="https://runcourier.co.uk" style="color: #007BFF; text-decoration: underline; font-weight: bold;">Visit Our Website</a> | 
        <a href="tel:+442046346100" style="color: #007BFF;">+44 20 4634 6100</a>
      </p>
    </div>
  `;
}

// Reusable mobile app download section for all emails
function getAppDownloadSection(): string {
  return `
    <div style="background-color: #f0f4ff; border: 2px solid #007BFF; border-radius: 8px; padding: 24px; margin: 30px 0 20px 0; text-align: center;">
      <h3 style="color: #007BFF; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">
        Get the Run Courier Mobile App
      </h3>
      <p style="color: #333; font-size: 14px; margin: 0 0 20px 0; line-height: 1.5;">
        Track deliveries, receive job updates, and manage your account anytime, anywhere.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
        <tr>
          <td style="padding: 0 8px;">
            <a href="${APP_STORE_URL}" target="_blank" rel="noopener noreferrer" style="background-color: #000000; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: bold; display: inline-block;">
              App Store
            </a>
          </td>
          <td style="padding: 0 8px;">
            <a href="${GOOGLE_PLAY_URL}" target="_blank" rel="noopener noreferrer" style="background-color: #01875f; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: bold; display: inline-block;">
              Google Play
            </a>
          </td>
        </tr>
      </table>
    </div>
  `;
}

// Wrap content in standard email template
export function wrapEmailContent(content: string, headerTitle?: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${getEmailHeader(headerTitle)}
      <div style="padding: 30px; background-color: #f9f9f9;">
        ${content}
        ${getAppDownloadSection()}
        ${getEmailFooter()}
      </div>
    </div>
  `;
}

async function getResendCredentials() {
  // First try environment variable (manual setup)
  if (process.env.RESEND_API_KEY) {
    console.log('[Email] Using RESEND_API_KEY from environment');
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: SENDER_EMAIL
    };
  }

  // Fall back to Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!hostname) {
    console.warn('[Email] REPLIT_CONNECTORS_HOSTNAME not found');
  }
  if (!xReplitToken) {
    console.warn('[Email] X_REPLIT_TOKEN not found - email notifications disabled. Set RESEND_API_KEY manually.');
    return null;
  }

  try {
    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X-Replit-Token': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    if (!connectionSettings?.settings?.api_key) {
      console.warn('[Email] Resend connection not found - email notifications disabled. Set RESEND_API_KEY manually.');
      return null;
    }
    
    console.log('[Email] Using Resend credentials from Replit connector');
    return {
      apiKey: connectionSettings.settings.api_key,
      fromEmail: connectionSettings.settings.from_email || SENDER_EMAIL
    };
  } catch (error) {
    console.error('[Email] Failed to fetch Resend credentials:', error);
    return null;
  }
}

let lastEmailSentAt = 0;
const EMAIL_MIN_INTERVAL_MS = 600;

export async function sendEmailNotification(
  recipient: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  fromEmail?: string
): Promise<boolean> {
  console.log(`[Email] Attempting to send "${subject}" to ${recipient}`);
  try {
    const credentials = await getResendCredentials();
    if (!credentials) {
      console.warn('[Email] Resend not configured - email notification not sent');
      return false;
    }

    const now = Date.now();
    const elapsed = now - lastEmailSentAt;
    if (elapsed < EMAIL_MIN_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, EMAIL_MIN_INTERVAL_MS - elapsed));
    }

    const senderEmail = fromEmail || credentials.fromEmail;
    const resend = new Resend(credentials.apiKey);
    console.log(`[Email] Sending from ${senderEmail} to ${recipient}`);
    lastEmailSentAt = Date.now();
    
    const result = await resend.emails.send({
      from: senderEmail,
      to: recipient,
      subject,
      html: htmlContent,
      text: textContent
    });

    if (result.error) {
      console.error('[Email] Failed to send email:', result.error);
      return false;
    }

    console.log('[Email] Email notification sent successfully:', result.data?.id);
    return true;
  } catch (error) {
    console.error('[Email] Error sending email notification:', error);
    return false;
  }
}

export async function sendAdminNotification(
  subject: string,
  htmlContent: string,
  textContent?: string
): Promise<boolean> {
  return sendEmailNotification(ADMIN_EMAIL, subject, htmlContent, textContent);
}

export async function sendQuoteNotification(data: {
  pickupPostcode: string;
  deliveryPostcode: string;
  vehicleType: string;
  weight: number;
  distance: number;
  totalPrice: number;
  isMultiDrop?: boolean;
  multiDropStops?: string[];
  isReturnTrip?: boolean;
  pickupDate?: string;
  pickupTime?: string;
  serviceType?: string;
  serviceTypePercent?: number;
}): Promise<boolean> {
  const vehicleNames: Record<string, string> = {
    motorbike: 'Motorbike',
    car: 'Car',
    small_van: 'Small Van',
    medium_van: 'Medium Van',
    lwb_van: 'LWB Van',
    luton_van: 'Luton Van',
  };
  const vehicle = vehicleNames[data.vehicleType] || data.vehicleType;
  const dateStr = data.pickupDate ? new Date(data.pickupDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : 'Not specified';
  const timeStr = data.pickupTime || 'Not specified';

  const serviceLevelNames: Record<string, string> = {
    flexible: 'Flexible',
    urgent: 'Urgent',
  };
  const serviceLevelDisplay = data.serviceType ? serviceLevelNames[data.serviceType] || data.serviceType : 'Flexible';
  const serviceLevelPercent = data.serviceTypePercent ?? 0;

  const stopsHtml = data.isMultiDrop && data.multiDropStops?.length
    ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Multi-Drop Stops</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.multiDropStops.join(' → ')}</td></tr>`
    : '';

  const quoteContent = `
    <p style="color:#333;margin-bottom:16px;">A customer has requested a delivery quote on the website.</p>
    <div style="background:#fff;border-radius:8px;border:1px solid #e0e0e0;overflow:hidden;margin-bottom:12px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;width:40%;">Pickup</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${data.pickupPostcode}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Delivery</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${data.deliveryPostcode}</td></tr>
        ${stopsHtml}
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Vehicle</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${vehicle}</td></tr>
        ${data.weight && Number(data.weight) > 0 ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Weight</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.weight} kg</td></tr>` : ''}
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Distance</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.distance.toFixed(1)} miles</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Return Trip</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.isReturnTrip ? 'Yes' : 'No'}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Pickup Date</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Pickup Time</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${timeStr}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">Service Level</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${serviceLevelDisplay}${serviceLevelPercent > 0 ? ` (+${serviceLevelPercent}%)` : ''}</td></tr>
        <tr style="background:#f0fdf4;"><td style="padding:10px 12px;color:#555;font-weight:600;">Quoted Price</td><td style="padding:10px 12px;font-weight:700;font-size:18px;color:#16a34a;">£${data.totalPrice.toFixed(2)}</td></tr>
      </table>
    </div>
    <p style="color:#888;font-size:12px;margin-top:8px;">This quote was generated on the website. The customer has not yet completed a booking.</p>
  `;
  const htmlContent = wrapEmailContent(quoteContent, 'New Quote Request');

  const textContent = `New Quote Request\nPickup: ${data.pickupPostcode}\nDelivery: ${data.deliveryPostcode}\nVehicle: ${vehicle}\n${data.weight && Number(data.weight) > 0 ? `Weight: ${data.weight}kg\n` : ''}Distance: ${data.distance.toFixed(1)} miles\nDate: ${dateStr} ${timeStr}\nService Level: ${serviceLevelDisplay}\nQuoted Price: £${data.totalPrice.toFixed(2)}`;

  return sendEmailNotification(
    ADMIN_EMAIL,
    `Quote Request: ${data.pickupPostcode} → ${data.deliveryPostcode} (£${data.totalPrice.toFixed(2)})`,
    htmlContent,
    textContent,
    SENDER_EMAIL
  );
}

export async function sendWelcomeEmail(
  email: string,
  name: string,
  role: string
): Promise<boolean> {
  const roleText = role === 'business' ? 'Business Account' : 'Customer Account';
  const content = `
    <h2 style="color: #333;">Hello ${name}!</h2>
    <p style="color: #333; font-size: 16px;">
      Thank you for registering with Run Courier. Your ${roleText} has been successfully created.
    </p>
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">What you can do now:</h3>
      <ul style="color: #333; line-height: 1.8;">
        <li>Book same-day deliveries across the UK</li>
        <li>Track your parcels in real-time</li>
        <li>View your booking history</li>
        ${role === 'business' ? '<li>Access Pay Later invoicing options</li>' : ''}
        <li>Get 24/7 customer support</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://runcourier.co.uk/book" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Book Your First Delivery
      </a>
    </div>
    <p style="color: #333; font-size: 14px;">
      If you have any questions, our support team is here to help 24/7.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Welcome to Run Courier!');
  const textContent = `Welcome to Run Courier!\n\nHello ${name}!\n\nThank you for registering with Run Courier. Your ${roleText} has been successfully created.\n\nWhat you can do now:\n- Book same-day deliveries across the UK\n- Track your parcels in real-time\n- View your booking history\n- Get 24/7 customer support\n\nVisit https://runcourier.co.uk/book to book your first delivery.\n\nRun Courier - https://runcourier.co.uk`;

  return sendEmailNotification(email, 'Welcome to Run Courier!', htmlContent, textContent);
}

export async function sendNewRegistrationNotification(
  email: string,
  name: string,
  role: string,
  company?: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">New User Registration</h2>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; width: 120px;"><strong>Name:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Email:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><a href="mailto:${email}" style="color: #007BFF;">${email}</a></td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Account Type:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${role === 'business' ? 'Business' : 'Individual'}</td>
        </tr>
        ${company ? `
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Company:</strong></td>
          <td style="padding: 10px 0; color: #333;">${company}</td>
        </tr>
        ` : ''}
      </table>
    </div>
  `;

  const htmlContent = wrapEmailContent(content);
  const textContent = `New User Registration\n\nName: ${name}\nEmail: ${email}\nAccount Type: ${role === 'business' ? 'Business' : 'Individual'}${company ? `\nCompany: ${company}` : ''}\n\nRun Courier`;

  return sendAdminNotification('New User Registration', htmlContent, textContent);
}

export async function sendNewJobNotification(jobId: string, jobDetails: any): Promise<boolean> {
  // Format vehicle type for display
  const vehicleDisplay = (jobDetails.vehicleType || 'car').replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  
  // Format date/time for scheduled deliveries
  const formatDateTime = (date: string | Date | null) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleString('en-GB', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const scheduledPickup = formatDateTime(jobDetails.scheduledPickupTime);
  const scheduledDelivery = formatDateTime(jobDetails.scheduledDeliveryTime);

  const content = `
    <h2 style="color: #333; margin-top: 0;">New Booking Received</h2>
    
    <!-- Job Number & Tracking -->
    <div style="background-color: #007BFF; color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="text-align: center; padding: 0 10px; width: 50%; border-right: 1px solid rgba(255,255,255,0.3);">
            <p style="margin: 0; font-size: 12px; opacity: 0.9;">Job Number</p>
            <p style="margin: 5px 0 0; font-size: 28px; font-weight: bold; letter-spacing: 2px;">${jobDetails.jobNumber || 'N/A'}</p>
          </td>
          <td style="text-align: center; padding: 0 10px; width: 50%;">
            <p style="margin: 0; font-size: 12px; opacity: 0.9;">Tracking Number</p>
            <p style="margin: 5px 0 0; font-size: 18px; font-weight: bold; letter-spacing: 1px;">${jobDetails.trackingNumber || 'N/A'}</p>
          </td>
        </tr>
      </table>
    </div>
    
    <div style="background-color: white; border-radius: 0 0 8px 8px; padding: 20px; border: 1px solid #eee; border-top: none;">
      
      <!-- Pickup Details -->
      <h3 style="color: #007BFF; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #007BFF; padding-bottom: 8px;">PICKUP DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 140px; vertical-align: top;"><strong>Postcode:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupPostcode || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupAddress || 'N/A'}</td>
        </tr>
        ${jobDetails.pickupBuildingName ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Building:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupBuildingName}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Contact Name:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupContactName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Contact Phone:</strong></td>
          <td style="padding: 8px 0; color: #333;"><a href="tel:${jobDetails.pickupContactPhone}" style="color: #007BFF;">${jobDetails.pickupContactPhone || 'N/A'}</a></td>
        </tr>
        ${jobDetails.pickupInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.pickupInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledPickup ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Scheduled Time:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${scheduledPickup}</td>
        </tr>
        ` : ''}
      </table>

      <!-- Delivery Details -->
      ${jobDetails.isMultiDrop && jobDetails.multiDropStops && jobDetails.multiDropStops.length > 0 ? `
      <h3 style="color: #28a745; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #28a745; padding-bottom: 8px;">MULTI-DROP DELIVERY (${jobDetails.multiDropStops.length} STOPS)</h3>
      ${jobDetails.multiDropStops.map((stop: any, index: number) => `
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 15px; border-left: 4px solid #28a745;">
        <h4 style="color: #28a745; margin: 0 0 10px; font-size: 14px;">Stop ${index + 1}</h4>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; color: #333; width: 120px; vertical-align: top;"><strong>Postcode:</strong></td>
            <td style="padding: 5px 0; color: #333;">${stop.postcode || 'N/A'}</td>
          </tr>
          ${stop.address ? `
          <tr>
            <td style="padding: 5px 0; color: #333; vertical-align: top;"><strong>Address:</strong></td>
            <td style="padding: 5px 0; color: #333;">${stop.address}</td>
          </tr>
          ` : ''}
          ${stop.recipientName ? `
          <tr>
            <td style="padding: 5px 0; color: #333; vertical-align: top;"><strong>Recipient:</strong></td>
            <td style="padding: 5px 0; color: #333;">${stop.recipientName}</td>
          </tr>
          ` : ''}
          ${stop.recipientPhone ? `
          <tr>
            <td style="padding: 5px 0; color: #333; vertical-align: top;"><strong>Phone:</strong></td>
            <td style="padding: 5px 0; color: #333;"><a href="tel:${stop.recipientPhone}" style="color: #007BFF;">${stop.recipientPhone}</a></td>
          </tr>
          ` : ''}
          ${stop.instructions ? `
          <tr>
            <td style="padding: 5px 0; color: #333; vertical-align: top;"><strong>Instructions:</strong></td>
            <td style="padding: 5px 0; color: #333; font-style: italic;">${stop.instructions}</td>
          </tr>
          ` : ''}
        </table>
      </div>
      `).join('')}
      ` : `
      <h3 style="color: #28a745; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #28a745; padding-bottom: 8px;">DELIVERY DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 140px; vertical-align: top;"><strong>Postcode:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.deliveryPostcode || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.deliveryAddress || 'N/A'}</td>
        </tr>
        ${jobDetails.deliveryBuildingName ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Building:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.deliveryBuildingName}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Recipient Name:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.recipientName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Recipient Phone:</strong></td>
          <td style="padding: 8px 0; color: #333;"><a href="tel:${jobDetails.recipientPhone}" style="color: #007BFF;">${jobDetails.recipientPhone || 'N/A'}</a></td>
        </tr>
        ${jobDetails.deliveryInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.deliveryInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledDelivery ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Scheduled Time:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${scheduledDelivery}</td>
        </tr>
        ` : ''}
      </table>
      `}

      <!-- Delivery Options -->
      <h3 style="color: #6c757d; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #6c757d; padding-bottom: 8px;">DELIVERY OPTIONS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 140px;"><strong>Vehicle Type:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleDisplay}</td>
        </tr>
        ${jobDetails.weight && Number(jobDetails.weight) > 0 ? `<tr>
          <td style="padding: 8px 0; color: #333;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.weight} kg</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.distance || '0'} miles</td>
        </tr>
        ${jobDetails.isMultiDrop ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Multi-Drop:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes</td>
        </tr>
        ` : ''}
        ${jobDetails.isReturnTrip ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Return Trip:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Return To:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.returnToSameLocation ? 'Same as Pickup' : (jobDetails.returnAddress || jobDetails.returnPostcode || 'Not specified')}</td>
        </tr>
        ${!jobDetails.returnToSameLocation && jobDetails.returnPostcode ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Return Postcode:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.returnPostcode}</td>
        </tr>
        ` : ''}
        ${!jobDetails.returnToSameLocation && jobDetails.returnAddress ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Return Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.returnAddress}</td>
        </tr>
        ` : ''}
        ` : ''}
        ${jobDetails.isCentralLondon ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Central London:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes (Congestion charge applies)</td>
        </tr>
        ` : ''}
      </table>

      <!-- Pricing -->
      <h3 style="color: #dc3545; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #dc3545; padding-bottom: 8px;">PRICING BREAKDOWN</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 140px;"><strong>Base Price:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.basePrice || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Distance Price:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.distancePrice || 0).toFixed(2)}</td>
        </tr>
        ${parseFloat(jobDetails.weightSurcharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Weight Surcharge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.weightSurcharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.multiDropCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Multi-Drop Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.multiDropCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.returnTripCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Return Trip Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.returnTripCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.centralLondonCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Central London Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.centralLondonCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.waitingTimeCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Waiting Time Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.waitingTimeCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${jobDetails.serviceType && jobDetails.serviceType !== 'flexible' ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Service Level:</strong></td>
          <td style="padding: 8px 0; color: #333;">${{ flexible: 'Flexible', urgent: 'Urgent' }[jobDetails.serviceType as string] || jobDetails.serviceType}${jobDetails.serviceTypePercent > 0 ? ` (+${jobDetails.serviceTypePercent}%)` : ''}</td>
        </tr>
        ${parseFloat(jobDetails.serviceTypeAmount || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Service Surcharge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.serviceTypeAmount).toFixed(2)}</td>
        </tr>
        ` : ''}
        ` : `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Service Level:</strong></td>
          <td style="padding: 8px 0; color: #333;">Flexible</td>
        </tr>
        `}
      </table>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; text-align: right;">
        <span style="color: #333; font-size: 16px;">Total: </span>
        <span style="color: #007BFF; font-size: 24px; font-weight: bold;">£${parseFloat(jobDetails.totalPrice || 0).toFixed(2)}</span>
      </div>

      <!-- Payment & Status -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <tr>
          <td style="padding: 15px; color: #333; width: 50%;"><strong>Payment Status:</strong></td>
          <td style="padding: 15px; color: #333; text-align: right;">
            <span style="background-color: ${jobDetails.paymentStatus === 'paid' ? '#28a745' : jobDetails.paymentStatus === 'pay_later' ? '#ffc107' : '#dc3545'}; color: ${jobDetails.paymentStatus === 'pay_later' ? '#333' : 'white'}; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
              ${(jobDetails.paymentStatus || 'pending').toUpperCase().replace('_', ' ')}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding: 15px; color: #333;"><strong>Job Status:</strong></td>
          <td style="padding: 15px; color: #333; text-align: right;">
            <span style="background-color: #6c757d; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
              ${(jobDetails.status || 'pending').toUpperCase()}
            </span>
          </td>
        </tr>
        ${jobDetails.customerEmail ? `
        <tr>
          <td style="padding: 15px; color: #333;"><strong>Customer Email:</strong></td>
          <td style="padding: 15px; color: #333; text-align: right;">
            <a href="mailto:${jobDetails.customerEmail}" style="color: #007BFF;">${jobDetails.customerEmail}</a>
          </td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p style="color: #333; font-size: 14px; margin-top: 20px; text-align: center;">
      Please log in to the <a href="https://runcourier.co.uk/admin/jobs" style="color: #007BFF;">admin dashboard</a> to manage this booking.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'New Booking');
  
  const textContent = `NEW BOOKING RECEIVED

Job Number: ${jobDetails.jobNumber || 'N/A'}
Tracking Number: ${jobDetails.trackingNumber || 'N/A'}

PICKUP DETAILS
--------------
Postcode: ${jobDetails.pickupPostcode || 'N/A'}
Address: ${jobDetails.pickupAddress || 'N/A'}
${jobDetails.pickupBuildingName ? `Building: ${jobDetails.pickupBuildingName}\n` : ''}Contact: ${jobDetails.pickupContactName || 'N/A'}
Phone: ${jobDetails.pickupContactPhone || 'N/A'}
${jobDetails.pickupInstructions ? `Instructions: ${jobDetails.pickupInstructions}\n` : ''}${scheduledPickup ? `Scheduled: ${scheduledPickup}\n` : ''}

DELIVERY DETAILS
----------------
Postcode: ${jobDetails.deliveryPostcode || 'N/A'}
Address: ${jobDetails.deliveryAddress || 'N/A'}
${jobDetails.deliveryBuildingName ? `Building: ${jobDetails.deliveryBuildingName}\n` : ''}Recipient: ${jobDetails.recipientName || 'N/A'}
Phone: ${jobDetails.recipientPhone || 'N/A'}
${jobDetails.deliveryInstructions ? `Instructions: ${jobDetails.deliveryInstructions}\n` : ''}${scheduledDelivery ? `Scheduled: ${scheduledDelivery}\n` : ''}

DELIVERY OPTIONS
----------------
Vehicle: ${vehicleDisplay}
${jobDetails.weight && Number(jobDetails.weight) > 0 ? `Weight: ${jobDetails.weight} kg\n` : ''}Distance: ${jobDetails.distance || '0'} miles
${jobDetails.isMultiDrop ? 'Multi-Drop: Yes\n' : ''}${jobDetails.isReturnTrip ? 'Return Trip: Yes\n' : ''}${jobDetails.isCentralLondon ? 'Central London: Yes\n' : ''}

PRICING
-------
Base Price: £${parseFloat(jobDetails.basePrice || 0).toFixed(2)}
Distance Price: £${parseFloat(jobDetails.distancePrice || 0).toFixed(2)}
${parseFloat(jobDetails.weightSurcharge || 0) > 0 ? `Weight Surcharge: £${parseFloat(jobDetails.weightSurcharge).toFixed(2)}\n` : ''}${parseFloat(jobDetails.multiDropCharge || 0) > 0 ? `Multi-Drop: £${parseFloat(jobDetails.multiDropCharge).toFixed(2)}\n` : ''}${parseFloat(jobDetails.returnTripCharge || 0) > 0 ? `Return Trip: £${parseFloat(jobDetails.returnTripCharge).toFixed(2)}\n` : ''}${parseFloat(jobDetails.centralLondonCharge || 0) > 0 ? `Central London: £${parseFloat(jobDetails.centralLondonCharge).toFixed(2)}\n` : ''}TOTAL: £${parseFloat(jobDetails.totalPrice || 0).toFixed(2)}

Payment Status: ${(jobDetails.paymentStatus || 'pending').toUpperCase()}
Job Status: ${(jobDetails.status || 'pending').toUpperCase()}
${jobDetails.customerEmail ? `Customer Email: ${jobDetails.customerEmail}\n` : ''}

Please log in to the admin dashboard to manage this booking.
Run Courier - https://runcourier.co.uk`;

  const adminEmails = [ADMIN_EMAIL, 'runcourier1@gmail.com'];
  let anySuccess = false;
  for (const email of adminEmails) {
    try {
      const result = await sendEmailNotification(email, `New Booking #${jobDetails.jobNumber || 'N/A'} - ${jobDetails.trackingNumber || 'N/A'}`, htmlContent, textContent);
      if (result) anySuccess = true;
    } catch (err) {
      console.error(`[Email] Failed to send admin notification to ${email}:`, err);
    }
  }
  return anySuccess;
}

// Send booking confirmation email to customer
export async function sendCustomerBookingConfirmation(customerEmail: string, jobDetails: any): Promise<boolean> {
  // Format vehicle type for display
  const vehicleDisplay = (jobDetails.vehicleType || 'car').replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  
  // Format date/time for scheduled deliveries
  const formatDateTime = (date: string | Date | null) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleString('en-GB', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const scheduledPickup = formatDateTime(jobDetails.scheduledPickupTime);
  const scheduledDelivery = formatDateTime(jobDetails.scheduledDeliveryTime);
  const createdAt = formatDateTime(jobDetails.createdAt) || formatDateTime(new Date());

  const content = `
    <h2 style="color: #333; margin-top: 0;">Thank You for Your Booking!</h2>
    <p style="color: #333; font-size: 16px;">Your delivery has been confirmed and is being processed. Here are your booking details:</p>
    
    <!-- Job Number & Tracking Banner -->
    <div style="background-color: #007BFF; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="text-align: center; padding: 0 10px; width: 50%; border-right: 1px solid rgba(255,255,255,0.3);">
            <p style="margin: 0; font-size: 12px; opacity: 0.9;">Job Number</p>
            <p style="margin: 5px 0 0; font-size: 24px; font-weight: bold;">${jobDetails.jobNumber || 'N/A'}</p>
          </td>
          <td style="text-align: center; padding: 0 10px; width: 50%;">
            <p style="margin: 0; font-size: 12px; opacity: 0.9;">Tracking Number</p>
            <p style="margin: 5px 0 0; font-size: 18px; font-weight: bold; letter-spacing: 1px;">${jobDetails.trackingNumber || 'N/A'}</p>
          </td>
        </tr>
      </table>
      <p style="margin: 12px 0 0; font-size: 12px; opacity: 0.85;">Use your tracking number to track your delivery at runcourier.co.uk</p>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; border: 1px solid #eee;">
      
      <!-- Pickup Details -->
      <h3 style="color: #007BFF; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #007BFF; padding-bottom: 8px;">COLLECTION DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.pickupBuildingName ? `${jobDetails.pickupBuildingName}<br>` : ''}
            ${jobDetails.pickupAddress || 'N/A'}<br>
            <strong>${jobDetails.pickupPostcode || 'N/A'}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Contact:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.pickupContactName || 'N/A'}<br>
            <a href="tel:${jobDetails.pickupContactPhone}" style="color: #007BFF;">${jobDetails.pickupContactPhone || 'N/A'}</a>
          </td>
        </tr>
        ${jobDetails.pickupInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.pickupInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledPickup ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Scheduled:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${scheduledPickup}</td>
        </tr>
        ` : ''}
      </table>

      <!-- Delivery Details -->
      <h3 style="color: #28a745; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #28a745; padding-bottom: 8px;">DELIVERY DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.deliveryBuildingName ? `${jobDetails.deliveryBuildingName}<br>` : ''}
            ${jobDetails.deliveryAddress || 'N/A'}<br>
            <strong>${jobDetails.deliveryPostcode || 'N/A'}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Recipient:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.recipientName || 'N/A'}<br>
            <a href="tel:${jobDetails.recipientPhone}" style="color: #007BFF;">${jobDetails.recipientPhone || 'N/A'}</a>
          </td>
        </tr>
        ${jobDetails.deliveryInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.deliveryInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledDelivery ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Scheduled:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${scheduledDelivery}</td>
        </tr>
        ` : ''}
      </table>

      <!-- Service Details -->
      <h3 style="color: #6c757d; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #6c757d; padding-bottom: 8px;">SERVICE DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 130px;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleDisplay}</td>
        </tr>
        ${jobDetails.weight && Number(jobDetails.weight) > 0 ? `<tr>
          <td style="padding: 8px 0; color: #333;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.weight} kg</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.distance || '0'} miles</td>
        </tr>
        ${jobDetails.isMultiDrop ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Service:</strong></td>
          <td style="padding: 8px 0; color: #333;">Multi-Drop Delivery</td>
        </tr>
        ` : ''}
        ${jobDetails.isReturnTrip ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Return Trip:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes - Driver will return to pickup location</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Booked:</strong></td>
          <td style="padding: 8px 0; color: #333;">${createdAt}</td>
        </tr>
      </table>

      <!-- Total Price -->
      <div style="background-color: #007BFF; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; opacity: 0.9;">Total Amount</p>
        <p style="margin: 10px 0 0; font-size: 32px; font-weight: bold;">£${parseFloat(jobDetails.totalPrice || 0).toFixed(2)}</p>
      </div>

      <!-- Payment Status -->
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: center;">
        <span style="background-color: ${jobDetails.paymentStatus === 'paid' ? '#28a745' : jobDetails.paymentStatus === 'pay_later' ? '#ffc107' : '#dc3545'}; color: ${jobDetails.paymentStatus === 'pay_later' ? '#333' : 'white'}; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: bold;">
          ${jobDetails.paymentStatus === 'paid' ? 'PAYMENT CONFIRMED' : jobDetails.paymentStatus === 'pay_later' ? 'PAY LATER - INVOICE PENDING' : 'PAYMENT PENDING'}
        </span>
      </div>
    </div>

    <!-- Track Your Delivery CTA -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${BASE_URL}/track?ref=${jobDetails.trackingNumber}" style="background-color: #007BFF; color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
        Track Your Delivery
      </a>
    </div>

    <!-- Contact Info -->
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
      <p style="color: #333; margin: 0 0 10px; font-size: 14px;"><strong>Need Help?</strong></p>
      <p style="color: #333; margin: 0; font-size: 14px;">
        Call us: <a href="tel:+447311121217" style="color: #007BFF; font-weight: bold;">+44 7311 121 217</a><br>
        Email: <a href="mailto:${INFO_EMAIL}" style="color: #007BFF;">${INFO_EMAIL}</a>
      </p>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Booking Confirmed');
  
  const textContent = `BOOKING CONFIRMATION

Thank you for booking with Run Courier!

Job Number: ${jobDetails.jobNumber || 'N/A'}
Tracking Number: ${jobDetails.trackingNumber || 'N/A'}

COLLECTION DETAILS
------------------
${jobDetails.pickupBuildingName ? `${jobDetails.pickupBuildingName}\n` : ''}${jobDetails.pickupAddress || 'N/A'}
${jobDetails.pickupPostcode || 'N/A'}
Contact: ${jobDetails.pickupContactName || 'N/A'}
Phone: ${jobDetails.pickupContactPhone || 'N/A'}
${jobDetails.pickupInstructions ? `Instructions: ${jobDetails.pickupInstructions}\n` : ''}${scheduledPickup ? `Scheduled: ${scheduledPickup}\n` : ''}

DELIVERY DETAILS
----------------
${jobDetails.deliveryBuildingName ? `${jobDetails.deliveryBuildingName}\n` : ''}${jobDetails.deliveryAddress || 'N/A'}
${jobDetails.deliveryPostcode || 'N/A'}
Recipient: ${jobDetails.recipientName || 'N/A'}
Phone: ${jobDetails.recipientPhone || 'N/A'}
${jobDetails.deliveryInstructions ? `Instructions: ${jobDetails.deliveryInstructions}\n` : ''}${scheduledDelivery ? `Scheduled: ${scheduledDelivery}\n` : ''}

SERVICE DETAILS
---------------
Vehicle: ${vehicleDisplay}
${jobDetails.weight && Number(jobDetails.weight) > 0 ? `Weight: ${jobDetails.weight} kg\n` : ''}Distance: ${jobDetails.distance || '0'} miles
${jobDetails.isMultiDrop ? 'Multi-Drop: Yes\n' : ''}${jobDetails.isReturnTrip ? 'Return Trip: Yes\n' : ''}

TOTAL AMOUNT: £${parseFloat(jobDetails.totalPrice || 0).toFixed(2)}
Payment Status: ${jobDetails.paymentStatus === 'paid' ? 'CONFIRMED' : jobDetails.paymentStatus === 'pay_later' ? 'PAY LATER' : 'PENDING'}

Track your delivery: ${BASE_URL}/track?ref=${jobDetails.trackingNumber}

Need help? Call +44 7311 121 217 or email ${INFO_EMAIL}

Run Courier - Same Day Delivery Across the UK
runcourier.co.uk`;

  return sendEmailNotification(customerEmail, `Booking Confirmed #${jobDetails.jobNumber || 'N/A'} - ${jobDetails.trackingNumber}`, htmlContent, textContent);
}

export async function sendDriverApplicationNotification(
  applicantName: string,
  status: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">Driver Application Update</h2>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; width: 120px;"><strong>Applicant:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${applicantName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Status:</strong></td>
          <td style="padding: 10px 0; color: #333;">${status}</td>
        </tr>
      </table>
    </div>
    <p style="color: #333; font-size: 14px; margin-top: 20px;">Please log in to the <a href="https://runcourier.co.uk/admin/applications" style="color: #007BFF;">admin dashboard</a> to review pending driver applications.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Driver Application');
  const textContent = `Driver Application Update\n\nApplicant: ${applicantName}\nStatus: ${status}\n\nPlease log in to the admin dashboard to review: https://runcourier.co.uk/admin/applications`;

  return sendAdminNotification('Driver Application Update', htmlContent, textContent);
}

export async function sendDocumentUploadNotification(
  driverName: string,
  documentType: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">New Document Upload</h2>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; width: 140px;"><strong>Driver:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${driverName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Document Type:</strong></td>
          <td style="padding: 10px 0; color: #333;">${documentType}</td>
        </tr>
      </table>
    </div>
    <p style="color: #333; font-size: 14px; margin-top: 20px;">Please log in to the <a href="https://runcourier.co.uk/admin/documents" style="color: #007BFF;">admin dashboard</a> to review and approve the document.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Document Upload');
  const textContent = `New Document Upload\n\nDriver: ${driverName}\nDocument Type: ${documentType}\n\nPlease log in to the admin dashboard to review and approve: https://runcourier.co.uk/admin/documents`;

  return sendAdminNotification('New Document Upload', htmlContent, textContent);
}

export async function sendPaymentNotification(
  invoiceNumber: string,
  amount: string,
  dueDate: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">New Invoice Generated</h2>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; width: 140px;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Amount Due:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">£${amount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Due Date:</strong></td>
          <td style="padding: 10px 0; color: #333;">${dueDate}</td>
        </tr>
      </table>
    </div>
    <p style="color: #333; font-size: 14px; margin-top: 20px;">Please log in to the customer portal to view the full invoice.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'New Invoice');
  const textContent = `New Invoice Generated\n\nInvoice Number: ${invoiceNumber}\nAmount Due: £${amount}\nDue Date: ${dueDate}\n\nPlease log in to view the full invoice.`;

  return sendAdminNotification('New Invoice Generated', htmlContent, textContent);
}

// Send invoice to customer email
export async function sendInvoiceToCustomer(
  customerEmail: string,
  customerName: string,
  invoiceNumber: string,
  amount: string,
  dueDate: string,
  periodStart: string,
  periodEnd: string,
  notes?: string | null
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">Invoice from Run Courier</h2>
    <p style="color: #333; font-size: 16px;">Dear ${customerName},</p>
    <p style="color: #333; font-size: 16px;">Please find below details of your invoice:</p>
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; width: 140px;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Amount Due:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold; font-size: 18px;">£${amount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Period:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${periodStart} - ${periodEnd}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Due Date:</strong></td>
          <td style="padding: 10px 0; color: #d9534f; font-weight: bold;">${dueDate}</td>
        </tr>
      </table>
    </div>
    ${notes ? `
    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="color: #333; margin: 0;"><strong>Notes:</strong></p>
      <p style="color: #333; margin: 10px 0 0 0; white-space: pre-wrap;">${notes}</p>
    </div>
    ` : ''}
    <div style="background-color: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">Payment Methods</h3>
      
      <p style="color: #333; margin-bottom: 10px; font-weight: bold;">Option 1: Bank Transfer</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Account Name:</strong></td>
          <td style="padding: 5px 0; color: #333;">RUN COURIER</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Sort Code:</strong></td>
          <td style="padding: 5px 0; color: #333;">30-99-50</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Account Number:</strong></td>
          <td style="padding: 5px 0; color: #333;">36113363</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Reference:</strong></td>
          <td style="padding: 5px 0; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
      </table>
      
      <p style="color: #333; margin-bottom: 10px; font-weight: bold;">Option 2: Pay by Card (Stripe)</p>
      <p style="color: #333; margin: 0;">Pay securely online via Stripe at <a href="https://runcourier.co.uk/pay" style="color: #0066cc; text-decoration: underline;">runcourier.co.uk/pay</a></p>
    </div>
    <p style="color: #333; font-size: 14px;">If you have any questions about this invoice, please contact us at <a href="mailto:${INFO_EMAIL}" style="color: #007BFF;">${INFO_EMAIL}</a></p>
    <p style="color: #333; font-size: 14px;">Thank you for choosing Run Courier.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Invoice');
  const textContent = `Invoice from Run Courier\n\nDear ${customerName},\n\nPlease find below details of your invoice:\n\nInvoice Number: ${invoiceNumber}\nAmount Due: £${amount}\nPeriod: ${periodStart} - ${periodEnd}\nDue Date: ${dueDate}\n\n${notes ? `Notes: ${notes}\n\n` : ''}PAYMENT METHODS\n\nOption 1: Bank Transfer\nAccount Name: RUN COURIER\nSort Code: 30-99-50\nAccount Number: 36113363\nReference: ${invoiceNumber}\n\nOption 2: Pay by Card (Stripe)\nPay securely online at: https://runcourier.co.uk/pay\n\nIf you have any questions, please contact us at ${INFO_EMAIL}\n\nThank you for choosing Run Courier.`;

  return sendEmailNotification(customerEmail, `Invoice ${invoiceNumber} - Run Courier`, htmlContent, textContent);
}

export interface MultiDropStop {
  stopOrder: number;
  postcode: string;
  address: string;
  recipientName: string | null;
  recipientPhone: string | null;
  instructions: string | null;
}

export interface InvoiceJobDetail {
  trackingNumber: string;
  pickupAddress: string;
  deliveryAddress: string | null;
  recipientName: string | null;
  scheduledDate: string;
  vehicleType: string;
  price: number;
  isMultiDrop?: boolean;
  multiDropStops?: MultiDropStop[];
}

export async function sendInvoiceToCustomerWithPaymentLink(
  customerEmail: string,
  customerName: string,
  invoiceNumber: string,
  amount: number,
  dueDate: string,
  periodStart: string,
  periodEnd: string,
  notes: string | null,
  paymentUrl: string,
  companyName?: string | null,
  businessAddress?: string | null,
  jobDetails?: InvoiceJobDetail[]
): Promise<boolean> {
  const formatVehicleType = (type: string) => {
    const types: Record<string, string> = {
      'motorbike': 'Motorbike',
      'car': 'Car',
      'small_van': 'Small Van',
      'medium_van': 'Medium Van',
    };
    return types[type] || type;
  };

  // Generate multi-drop stops HTML for a job
  const renderMultiDropStops = (stops: MultiDropStop[]) => {
    if (!stops || stops.length === 0) return '';
    return `
      <tr>
        <td colspan="6" style="padding: 0; border-bottom: 1px solid #dee2e6;">
          <div style="background-color: #f0f7ff; padding: 10px 15px; margin: 0;">
            <p style="margin: 0 0 8px 0; color: #495057; font-weight: bold; font-size: 11px;">DELIVERY ADDRESSES (${stops.length} drop-offs):</p>
            ${stops.map((stop, i) => `
              <div style="margin: 5px 0; padding: 5px 0; ${i < stops.length - 1 ? 'border-bottom: 1px dashed #cde1f7;' : ''}">
                <span style="display: inline-block; background-color: #007BFF; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; margin-right: 8px;">Drop-off ${stop.stopOrder}</span>
                <span style="color: #333; font-size: 11px;">${stop.address || stop.postcode}</span>
                ${stop.recipientName ? `<span style="color: #333; font-size: 10px; margin-left: 10px;">&mdash; ${stop.recipientName}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </td>
      </tr>
    `;
  };

  const jobsTableHtml = jobDetails && jobDetails.length > 0 ? `
    <div style="margin: 20px 0;">
      <h3 style="color: #333; margin-bottom: 15px; font-size: 16px;">Delivery Details</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057;">Tracking</th>
            <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057;">Collected From</th>
            <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057;">Delivered To</th>
            <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057;">Date</th>
            <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057;">Vehicle</th>
            <th style="padding: 10px 8px; text-align: right; border-bottom: 2px solid #dee2e6; color: #495057;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${jobDetails.map((job, index) => `
            <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #333; font-weight: bold;">
                ${job.trackingNumber}
                ${job.isMultiDrop ? '<span style="background-color: #17a2b8; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; margin-left: 5px;">MULTIPLE DROP-OFFS</span>' : ''}
              </td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #333; max-width: 150px;">${job.pickupAddress.substring(0, 40)}${job.pickupAddress.length > 40 ? '...' : ''}</td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #333; max-width: 150px;">
                ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 
                  ? `${job.multiDropStops.length} drop-off addresses below` 
                  : (job.deliveryAddress ? (job.deliveryAddress.substring(0, 40) + (job.deliveryAddress.length > 40 ? '...' : '')) : (job.recipientName || 'N/A'))}
              </td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #333;">${job.scheduledDate}</td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #333;">${formatVehicleType(job.vehicleType)}</td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #333; text-align: right; font-weight: bold;">£${job.price.toFixed(2)}</td>
            </tr>
            ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? renderMultiDropStops(job.multiDropStops) : ''}
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background-color: #e9ecef;">
            <td colspan="5" style="padding: 12px 8px; text-align: right; font-weight: bold; color: #333; border-top: 2px solid #dee2e6;">Total Amount Due:</td>
            <td style="padding: 12px 8px; text-align: right; font-weight: bold; color: #007BFF; font-size: 16px; border-top: 2px solid #dee2e6;">£${amount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  ` : '';

  const customerInfoHtml = companyName || businessAddress ? `
    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
      <p style="margin: 0 0 5px 0; color: #333;"><strong>Bill To:</strong></p>
      <p style="margin: 0; color: #333;">${customerName}</p>
      ${companyName ? `<p style="margin: 5px 0 0 0; color: #333;">${companyName}</p>` : ''}
      ${businessAddress ? `<p style="margin: 5px 0 0 0; color: #333; font-size: 14px;">${businessAddress}</p>` : ''}
    </div>
  ` : '';

  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #007BFF; margin: 0; font-size: 32px;">INVOICE</h1>
      <p style="color: #333; margin: 10px 0 0 0; font-size: 14px;">RUN COURIER</p>
    </div>
    
    ${customerInfoHtml}
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e1e5eb;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Invoice Date:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Period:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${periodStart} - ${periodEnd}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Due Date:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">${dueDate}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Amount Due:</strong></td>
          <td style="padding: 10px 0; color: #007BFF; font-size: 24px; font-weight: bold;">£${typeof amount === 'number' ? amount.toFixed(2) : amount}</td>
        </tr>
      </table>
    </div>
    
    ${jobsTableHtml}
    
    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="color: #2e7d32; font-size: 18px; font-weight: bold; margin-top: 0;">Pay Now with Card</p>
      <p style="color: #333; margin-bottom: 15px;">Click the button below to pay securely with your card via Stripe:</p>
      <a href="${paymentUrl}" style="background-color: #007BFF; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 18px; font-weight: bold; display: inline-block;">
        Pay £${typeof amount === 'number' ? amount.toFixed(2) : amount} Now
      </a>
      <p style="color: #888; font-size: 12px; margin-top: 15px; margin-bottom: 0;">Apple Pay, Google Pay & all major cards accepted</p>
    </div>
    
    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #333; margin-bottom: 10px; font-weight: bold;">Or Pay by Bank Transfer</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Account Name:</strong></td>
          <td style="padding: 5px 0; color: #333;">RUN COURIER</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Sort Code:</strong></td>
          <td style="padding: 5px 0; color: #333;">30-99-50</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Account Number:</strong></td>
          <td style="padding: 5px 0; color: #333;">36113363</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #333;"><strong>Reference:</strong></td>
          <td style="padding: 5px 0; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
      </table>
    </div>
    
    <p style="color: #333; font-size: 14px;">If you have any questions about this invoice, please contact us at <a href="mailto:INFO_EMAIL" style="color: #007BFF;">INFO_EMAIL</a></p>
    <p style="color: #333; font-size: 14px;">Thank you for choosing Run Courier.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Invoice');
  
  const jobsTextList = jobDetails && jobDetails.length > 0 ? 
    `\nDELIVERY DETAILS:\n${jobDetails.map(job => 
      `- ${job.trackingNumber}: ${job.pickupAddress.substring(0, 30)}... to ${job.deliveryAddress ? job.deliveryAddress.substring(0, 30) + '...' : job.recipientName || 'N/A'} (${job.scheduledDate}) - £${job.price.toFixed(2)}`
    ).join('\n')}\n` : '';
  
  const textContent = `INVOICE from Run Courier\n\n${companyName ? `Bill To: ${customerName}\n${companyName}\n${businessAddress || ''}\n\n` : `Dear ${customerName},\n\n`}Please find below details of your invoice:\n\nInvoice Number: ${invoiceNumber}\nInvoice Date: ${new Date().toLocaleDateString('en-GB')}\nAmount Due: £${typeof amount === 'number' ? amount.toFixed(2) : amount}\nPeriod: ${periodStart} - ${periodEnd}\nDue Date: ${dueDate}\n${jobsTextList}\nPAY NOW WITH CARD\nClick this link to pay securely via Stripe:\n${paymentUrl}\n\nOR PAY BY BANK TRANSFER\nAccount Name: RUN COURIER\nSort Code: 30-99-50\nAccount Number: 36113363\nReference: ${invoiceNumber}\n\nIf you have any questions, please contact us at INFO_EMAIL\n\nThank you for choosing Run Courier.`;

  return sendEmailNotification(customerEmail, `Invoice ${invoiceNumber} - Run Courier`, htmlContent, textContent);
}

export async function sendPaymentReceivedConfirmation(
  customerEmail: string,
  customerName: string,
  invoiceNumber: string,
  amount: number,
  paymentReference: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">Payment Received - Thank You!</h2>
    <p style="color: #333; font-size: 16px;">Dear ${customerName},</p>
    <p style="color: #333; font-size: 16px;">We have received your payment. Thank you for your business!</p>
    
    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="width: 60px; height: 60px; background-color: #4caf50; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 30px;">&#10003;</span>
      </div>
      <p style="color: #2e7d32; font-size: 18px; font-weight: bold; margin: 0;">Payment Successful</p>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e1e5eb;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Amount Paid:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-size: 20px; font-weight: bold;">£${typeof amount === 'number' ? amount.toFixed(2) : amount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Payment Reference:</strong></td>
          <td style="padding: 10px 0; color: #333; font-family: monospace;">${paymentReference}</td>
        </tr>
      </table>
    </div>
    
    <p style="color: #333; font-size: 14px;">This email serves as your payment receipt. Please keep it for your records.</p>
    <p style="color: #333; font-size: 14px;">If you have any questions, please contact us at <a href="mailto:${INFO_EMAIL}" style="color: #007BFF;">${INFO_EMAIL}</a></p>
    <p style="color: #333; font-size: 14px;">Thank you for choosing Run Courier.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Payment Confirmation');
  const textContent = `Payment Received - Thank You!\n\nDear ${customerName},\n\nWe have received your payment. Thank you for your business!\n\nPayment Details:\nInvoice Number: ${invoiceNumber}\nAmount Paid: £${typeof amount === 'number' ? amount.toFixed(2) : amount}\nPayment Reference: ${paymentReference}\n\nThis email serves as your payment receipt. Please keep it for your records.\n\nIf you have any questions, please contact us at ${INFO_EMAIL}\n\nThank you for choosing Run Courier.`;

  return sendEmailNotification(customerEmail, `Payment Received - Invoice ${invoiceNumber} - Run Courier`, htmlContent, textContent);
}

export async function sendEmailVerification(
  email: string,
  verificationLink: string,
  fullName: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333;">Welcome to Run Courier!</h2>
    <p style="color: #333; font-size: 16px;">
      Hi ${fullName},
    </p>
    <p style="color: #333; font-size: 16px;">
      Thank you for registering. Please verify your email address by clicking the button below:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationLink}" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Verify Email Address
      </a>
    </div>
    <p style="color: #333; font-size: 14px;">
      If you didn't create an account, you can safely ignore this email.
    </p>
    <p style="color: #333; font-size: 14px;">
      This link will expire in 24 hours.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Verify Your Email');
  const textContent = `Welcome to Run Courier!\n\nHi ${fullName},\n\nThank you for registering. Please verify your email address by clicking this link:\n\n${verificationLink}\n\nIf you didn't create an account, you can safely ignore this email.\n\nThis link will expire in 24 hours.\n\nRun Courier - https://runcourier.co.uk`;

  return sendEmailNotification(email, 'Verify Your Email - Run Courier', htmlContent, textContent);
}

export async function sendPasswordResetEmail(
  email: string,
  code: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333;">Reset Your Password</h2>
    <p style="color: #333; font-size: 16px;">
      You requested to reset your password. Use the verification code below to create a new password:
    </p>
    <div style="text-align: center; margin: 30px 0; padding: 25px; background-color: #f0f4f8; border-radius: 8px;">
      <p style="color: #333; font-size: 14px; margin: 0 0 10px 0;">Your verification code:</p>
      <div style="font-size: 36px; font-weight: bold; color: #007BFF; font-family: 'Courier New', monospace; padding: 10px 0;">
        ${code}
      </div>
    </div>
    <p style="color: #333; font-size: 15px; text-align: center; font-weight: 500;">
      Enter this code on the password reset page to create your new password.
    </p>
    <p style="color: #333; font-size: 14px;">
      If you didn't request this, you can safely ignore this email.
    </p>
    <p style="color: #333; font-size: 14px;">
      This code will expire in 1 hour.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Password Reset');
  const textContent = `Reset Your Password\n\nYou requested to reset your password.\n\nYour verification code: ${code}\n\nEnter this code on the password reset page to create your new password.\n\nIf you didn't request this, you can safely ignore this email.\n\nThis code will expire in 1 hour.\n\nRun Courier - https://runcourier.co.uk`;

  return sendEmailNotification(email, 'Reset Your Password - Run Courier', htmlContent, textContent);
}

export async function sendDriverApprovalEmail(
  email: string,
  fullName: string,
  driverCode: string,
  tempPassword: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333;">Hello ${fullName},</h2>
    <p style="color: #333; font-size: 16px;">
      Your Run Courier driver application has been <span style="color: #28a745; font-weight: bold;">&#10004; approved</span>.
    </p>
    <p style="color: #333; font-size: 16px;">
      Your Driver ID is: <strong style="color: #007BFF; font-size: 18px;">${driverCode}</strong>
    </p>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #007BFF;">
      <h3 style="color: #007BFF; margin-top: 0;">STEP 1 - Login to the Driver Portal (Website) and upload documents</h3>
      <p style="color: #333; font-size: 15px;">
        Go to the Driver Portal to complete your setup:
      </p>
      <div style="text-align: center; margin: 15px 0;">
        <a href="https://runcourier.co.uk/driver/login" style="background-color: #007BFF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 15px; display: inline-block;">
          Login to Driver Portal
        </a>
      </div>
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin: 15px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #333; width: 120px;"><strong>Email:</strong></td>
            <td style="padding: 8px 0; color: #333; font-size: 15px;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #333;"><strong>Temporary Password:</strong></td>
            <td style="padding: 8px 0;">
              <span style="display: inline-block; background-color: #e8f4fd; border: 2px solid #007BFF; border-radius: 6px; padding: 8px 16px; color: #333; font-size: 18px; font-family: monospace; font-weight: bold; letter-spacing: 2px;">${tempPassword}</span>
            </td>
          </tr>
        </table>
      </div>
      <div style="background-color: #fff3cd; border-radius: 8px; padding: 12px; margin: 10px 0;">
        <p style="color: #856404; font-size: 14px; margin: 0;">
          <strong>Important:</strong> When you log in for the first time, you must change your password immediately for security.
        </p>
      </div>
    </div>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745;">
      <h3 style="color: #28a745; margin-top: 0;">STEP 2 - Complete your profile and upload all required documents</h3>
      <ul style="color: #333; line-height: 1.8; margin: 0; padding-left: 20px;">
        <li>Confirm your personal details are correct</li>
        <li>Upload all required documents (driving licence, insurance, DBS, etc.)</li>
        <li>Make sure every document shows as <strong>"Uploaded/Complete"</strong></li>
      </ul>
    </div>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #6f42c1;">
      <h3 style="color: #6f42c1; margin-top: 0;">STEP 3 - Download the Run Courier Driver App (iPhone)</h3>
      <p style="color: #333; font-size: 15px;">
        Download the app from the App Store:
      </p>
      <div style="text-align: center; margin: 15px 0;">
        <a href="https://apps.apple.com/gb/app/run-courier/id6756506175" style="background-color: #000000; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 15px; display: inline-block;">
          Download on App Store
        </a>
      </div>
    </div>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #fd7e14;">
      <h3 style="color: #fd7e14; margin-top: 0;">STEP 4 - Login to the mobile app using the SAME email and password</h3>
      <p style="color: #333; font-size: 15px;">
        Use the same email and the password you set after changing it on the website to log in to the mobile app.
      </p>
    </div>

    <p style="color: #333; font-size: 14px; margin-top: 20px;">
      If you have any issues logging in or uploading documents, reply to this email and we will help.
    </p>
    <p style="color: #333; font-size: 14px;">
      Kind regards,<br>
      <strong>Run Courier Team</strong>
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Application Approved!');
  const textContent = `Hello ${fullName},\n\nYour Run Courier driver application has been approved.\n\nYour Driver ID: ${driverCode}\n\nSTEP 1 - Login to the Driver Portal (Website) and upload documents\n------------------------------------------------------------------\nLogin here: https://runcourier.co.uk/driver/login\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nImportant: When you log in for the first time, you must change your password immediately for security.\n\nSTEP 2 - Complete your profile and upload all required documents\n----------------------------------------------------------------\n- Confirm your personal details are correct\n- Upload all required documents (driving licence, insurance, DBS, etc.)\n- Make sure every document shows as "Uploaded/Complete"\n\nSTEP 3 - Download the Run Courier Driver App (iPhone)\n-----------------------------------------------------\nDownload from the App Store: https://apps.apple.com/gb/app/run-courier/id6756506175\n\nSTEP 4 - Login to the mobile app using the SAME email and password\n------------------------------------------------------------------\nUse the same email and the password you set after changing it on the website.\n\nIf you have any issues logging in or uploading documents, reply to this email and we will help.\n\nKind regards,\nRun Courier Team\n\nRun Courier - https://runcourier.co.uk`;

  return sendEmailNotification(email, 'Run Courier - Driver Application Approved (Next Steps)', htmlContent, textContent);
}

export async function sendDriverApprovalEmailExisting(
  email: string,
  fullName: string,
  driverCode: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333;">Hello ${fullName},</h2>
    <p style="color: #333; font-size: 16px;">
      Your Run Courier driver application has been <span style="color: #28a745; font-weight: bold;">&#10004; approved</span>.
    </p>
    <p style="color: #333; font-size: 16px;">
      Your Driver ID is: <strong style="color: #007BFF; font-size: 18px;">${driverCode}</strong>
    </p>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #007BFF;">
      <h3 style="color: #007BFF; margin-top: 0;">STEP 1 - Login to the Driver Portal</h3>
      <p style="color: #333; font-size: 15px;">
        Go to the Driver Portal and log in using your existing credentials:
      </p>
      <div style="text-align: center; margin: 15px 0;">
        <a href="https://runcourier.co.uk/driver/login" style="background-color: #007BFF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 15px; display: inline-block;">
          Login to Driver Portal
        </a>
      </div>
      <p style="color: #333; font-size: 14px;">
        Use your existing email (<strong>${email}</strong>) and password to log in.
      </p>
    </div>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745;">
      <h3 style="color: #28a745; margin-top: 0;">STEP 2 - Complete your profile and upload all required documents</h3>
      <ul style="color: #333; line-height: 1.8; margin: 0; padding-left: 20px;">
        <li>Confirm your personal details are correct</li>
        <li>Upload all required documents (driving licence, insurance, DBS, etc.)</li>
        <li>Make sure every document shows as <strong>"Uploaded/Complete"</strong></li>
      </ul>
    </div>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #6f42c1;">
      <h3 style="color: #6f42c1; margin-top: 0;">STEP 3 - Download the Run Courier Driver App (iPhone)</h3>
      <p style="color: #333; font-size: 15px;">
        Download the app from the App Store:
      </p>
      <div style="text-align: center; margin: 15px 0;">
        <a href="https://apps.apple.com/gb/app/run-courier/id6756506175" style="background-color: #000000; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 15px; display: inline-block;">
          Download on App Store
        </a>
      </div>
    </div>

    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #fd7e14;">
      <h3 style="color: #fd7e14; margin-top: 0;">STEP 4 - Login to the mobile app using the SAME email and password</h3>
      <p style="color: #333; font-size: 15px;">
        Use the same email and password you use on the website to log in to the mobile app.
      </p>
    </div>

    <p style="color: #333; font-size: 14px; margin-top: 20px;">
      If you have any issues logging in or uploading documents, reply to this email and we will help.
    </p>
    <p style="color: #333; font-size: 14px;">
      Kind regards,<br>
      <strong>Run Courier Team</strong>
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Application Approved!');
  const textContent = `Hello ${fullName},\n\nYour Run Courier driver application has been approved.\n\nYour Driver ID: ${driverCode}\n\nSTEP 1 - Login to the Driver Portal\n------------------------------------\nLogin here: https://runcourier.co.uk/driver/login\nUse your existing email (${email}) and password to log in.\n\nSTEP 2 - Complete your profile and upload all required documents\n----------------------------------------------------------------\n- Confirm your personal details are correct\n- Upload all required documents (driving licence, insurance, DBS, etc.)\n- Make sure every document shows as "Uploaded/Complete"\n\nSTEP 3 - Download the Run Courier Driver App (iPhone)\n-----------------------------------------------------\nDownload from the App Store: https://apps.apple.com/gb/app/run-courier/id6756506175\n\nSTEP 4 - Login to the mobile app using the SAME email and password\n------------------------------------------------------------------\nUse the same email and password you use on the website.\n\nIf you have any issues logging in or uploading documents, reply to this email and we will help.\n\nKind regards,\nRun Courier Team\n\nRun Courier - https://runcourier.co.uk`;

  return sendEmailNotification(email, 'Run Courier - Driver Application Approved (Next Steps)', htmlContent, textContent);
}

export async function sendApplicationCorrectionEmail(
  email: string,
  fullName: string,
  feedback: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">Application Requires Corrections</h2>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <p style="color: #333; font-size: 16px;">Dear ${fullName},</p>
      <p style="color: #333;">Thank you for your application to join Run Courier. After reviewing your submission, we need you to make some corrections before we can proceed.</p>
      <div style="background-color: #FFF7ED; border-left: 4px solid #F97316; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <strong style="color: #C2410C;">What needs to be fixed:</strong>
        <p style="color: #333; white-space: pre-line; margin-top: 8px;">${feedback}</p>
      </div>
      <p style="color: #333;">Please visit <a href="https://runcourier.co.uk/apply" style="color: #007BFF;">runcourier.co.uk/apply</a> to resubmit your application with the required corrections.</p>
    </div>
    <p style="color: #333; font-size: 14px; margin-top: 20px;">If you have any questions, please contact us at <a href="mailto:INFO_EMAIL" style="color: #007BFF;">INFO_EMAIL</a> or call +44 20 4634 6100.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Corrections Required');
  const textContent = `Dear ${fullName},\n\nThank you for your application to join Run Courier. After reviewing your submission, we need you to make some corrections.\n\nWhat needs to be fixed:\n${feedback}\n\nPlease visit runcourier.co.uk/apply to resubmit your application.\n\nIf you have questions, contact INFO_EMAIL or call +44 20 4634 6100.\n\nRun Courier - https://runcourier.co.uk`;

  return sendEmailNotification(email, 'Application Corrections Required - Run Courier', htmlContent, textContent);
}

export async function sendDocumentRequestEmail(
  email: string,
  fullName: string,
  message: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">Document Upload Required</h2>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <p style="color: #333; font-size: 16px;">Dear ${fullName},</p>
      <p style="color: #333;">Thank you for your application to join Run Courier. We need you to upload some additional documents before we can complete your review.</p>
      <div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <strong style="color: #1D4ED8;">Message from our team:</strong>
        <p style="color: #333; white-space: pre-line; margin-top: 8px;">${message}</p>
      </div>
      <p style="color: #333;">Please reply to this email with the requested documents, or contact us if you have any questions.</p>
    </div>
    <p style="color: #333; font-size: 14px; margin-top: 20px;">If you have any questions, please contact us at <a href="mailto:INFO_EMAIL" style="color: #007BFF;">INFO_EMAIL</a> or call +44 20 4634 6100.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Documents Required');
  const textContent = `Dear ${fullName},\n\nThank you for your application to join Run Courier. We need you to upload some additional documents before we can complete your review.\n\nMessage from our team:\n${message}\n\nPlease reply to this email with the requested documents, or contact us if you have any questions.\n\nIf you have questions, contact INFO_EMAIL or call +44 20 4634 6100.\n\nRun Courier - https://runcourier.co.uk`;

  return sendEmailNotification(email, 'Documents Required - Run Courier', htmlContent, textContent);
}

export async function sendContactFormSubmission(
  name: string,
  email: string,
  phone: string | undefined,
  subject: string,
  message: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333; margin-top: 0;">New Contact Form Submission</h2>
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; width: 120px;"><strong>Name:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Email:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><a href="mailto:${email}" style="color: #007BFF;">${email}</a></td>
        </tr>
        ${phone ? `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><strong>Phone:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><a href="tel:${phone}" style="color: #007BFF;">${phone}</a></td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 10px 0; color: #333;"><strong>Subject:</strong></td>
          <td style="padding: 10px 0; color: #333;">${subject}</td>
        </tr>
      </table>
    </div>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <h3 style="color: #333; margin-top: 0;">Message:</h3>
      <p style="color: #333; line-height: 1.6; margin: 0;">${message.replace(/\n/g, '<br>')}</p>
    </div>
    <div style="text-align: center; margin-top: 20px;">
      <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject)}" style="background-color: #007BFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reply to ${name}</a>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Contact Form');
  const textContent = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n${phone ? `Phone: ${phone}\n` : ''}Subject: ${subject}\n\nMessage:\n${message}`;

  return sendEmailNotification(SUPPORT_EMAIL, `Contact Form: ${subject}`, htmlContent, textContent);
}

export interface PaymentLinkEmailData {
  customerName: string;
  trackingNumber: string;
  paymentLink: string;
  amount: string;
  expiresAt: string;
  pickupAddress: string;
  pickupPostcode: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  vehicleType: string;
  weight: string;
  distance: string;
  basePrice?: string;
  distancePrice?: string;
  weightSurcharge?: string;
  centralLondonCharge?: string;
  multiDropCharge?: string;
  returnTripCharge?: string;
  isMultiDrop?: boolean;
  isReturnTrip?: boolean;
  multiDropStops?: Array<{
    address: string;
    postcode: string;
    recipientName?: string;
  }>;
}

export async function sendPaymentLinkEmail(
  customerEmail: string,
  data: PaymentLinkEmailData
): Promise<boolean> {
  const vehicleName = data.vehicleType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  const content = `
    <h2 style="color: #333; margin-top: 0;">Payment Required for Your Delivery</h2>
    <p style="color: #333; font-size: 16px;">
      Dear ${data.customerName || 'Customer'},
    </p>
    <p style="color: #333; font-size: 16px;">
      Your delivery booking has been created and is awaiting payment. Please complete the payment to confirm your booking.
    </p>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #007BFF; padding-bottom: 10px;">Booking Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 140px;"><strong>Tracking #:</strong></td>
          <td style="padding: 8px 0; color: #333; font-family: monospace; font-weight: bold;">${data.trackingNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleName}</td>
        </tr>
        ${data.weight && Number(data.weight) > 0 ? `<tr>
          <td style="padding: 8px 0; color: #333;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.weight} kg</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.distance} miles</td>
        </tr>
      </table>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #007BFF; padding-bottom: 10px;">Route${data.isMultiDrop ? ' (Multi-Drop)' : ''}${data.isReturnTrip ? ' + Return' : ''}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 140px; vertical-align: top;"><strong>Pickup:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.pickupAddress}<br><span style="font-family: monospace; color: #007BFF;">${data.pickupPostcode}</span></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Drop 1:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.deliveryAddress}<br><span style="font-family: monospace; color: #007BFF;">${data.deliveryPostcode}</span></td>
        </tr>
        ${data.isMultiDrop && data.multiDropStops && data.multiDropStops.length > 0 ? data.multiDropStops.map((stop, index) => `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Drop ${index + 2}:</strong></td>
          <td style="padding: 8px 0; color: #333;">${stop.address}${stop.recipientName ? ` (${stop.recipientName})` : ''}<br><span style="font-family: monospace; color: #007BFF;">${stop.postcode}</span></td>
        </tr>
        `).join('') : ''}
        ${data.isReturnTrip ? `
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Return:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.pickupAddress}<br><span style="font-family: monospace; color: #28a745;">${data.pickupPostcode}</span></td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <div style="background-color: #f0f7ff; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="color: #333; font-size: 18px; margin: 0 0 10px 0;">Amount Due:</p>
      <p style="color: #007BFF; font-size: 36px; font-weight: bold; margin: 0;">${data.amount}</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.paymentLink}" style="background-color: #28a745; color: white; padding: 18px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block;">
        Pay Now Securely
      </a>
    </div>
    
    <p style="color: #999; font-size: 12px; text-align: center;">
      This payment link expires on ${data.expiresAt}.<br>
      Secure payment powered by Stripe. We accept all major cards, Apple Pay, and Google Pay.
    </p>
    
    <p style="color: #333; font-size: 14px; margin-top: 30px;">
      If you did not request this booking, please ignore this email or contact us.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Payment Required');
  // Build multi-drop stops text
  const multiDropStopsText = data.isMultiDrop && data.multiDropStops && data.multiDropStops.length > 0
    ? data.multiDropStops.map((stop, index) => `- Drop ${index + 2}: ${stop.address}${stop.recipientName ? ` (${stop.recipientName})` : ''} (${stop.postcode})`).join('\n')
    : '';
  const returnTripText = data.isReturnTrip ? `- Return: ${data.pickupAddress} (${data.pickupPostcode})` : '';

  const textContent = `Payment Required for Your Delivery

Dear ${data.customerName || 'Customer'},

Your delivery booking has been created and is awaiting payment.

Booking Details:
- Tracking #: ${data.trackingNumber}
- Vehicle: ${vehicleName}
${data.weight && Number(data.weight) > 0 ? `- Weight: ${data.weight} kg\n` : ''}- Distance: ${data.distance} miles

Route${data.isMultiDrop ? ' (Multi-Drop)' : ''}${data.isReturnTrip ? ' + Return' : ''}:
- Pickup: ${data.pickupAddress} (${data.pickupPostcode})
- Drop 1: ${data.deliveryAddress} (${data.deliveryPostcode})
${multiDropStopsText}${returnTripText}

Amount Due: ${data.amount}

Pay now: ${data.paymentLink}

This payment link expires on ${data.expiresAt}.

Run Courier - https://runcourier.co.uk`;

  return sendEmailNotification(customerEmail, `Payment Required - Booking ${data.trackingNumber}`, htmlContent, textContent);
}

export async function sendPaymentConfirmationEmail(
  customerEmail: string,
  data: {
    customerName: string;
    trackingNumber: string;
    amount: string;
    pickupAddress: string;
    pickupPostcode: string;
    deliveryAddress: string;
    deliveryPostcode: string;
    vehicleType: string;
    stripeReceiptUrl?: string;
  }
): Promise<boolean> {
  const vehicleName = data.vehicleType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  const content = `
    <h2 style="color: #28a745; margin-top: 0;">Payment Confirmed!</h2>
    <p style="color: #333; font-size: 16px;">
      Dear ${data.customerName || 'Customer'},
    </p>
    <p style="color: #333; font-size: 16px;">
      Thank you for your payment. Your delivery booking is now confirmed and a driver will be assigned shortly.
    </p>
    
    <div style="background-color: #d4edda; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="color: #155724; font-size: 18px; margin: 0;">Payment Received: <strong>${data.amount}</strong></p>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">Booking Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 140px;"><strong>Tracking #:</strong></td>
          <td style="padding: 8px 0; color: #333; font-family: monospace; font-weight: bold;">${data.trackingNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Pickup:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.pickupAddress}<br><span style="font-family: monospace;">${data.pickupPostcode}</span></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Delivery:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.deliveryAddress}<br><span style="font-family: monospace;">${data.deliveryPostcode}</span></td>
        </tr>
      </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${BASE_URL}/track?ref=${data.trackingNumber}" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Track Your Delivery
      </a>
    </div>
    
    ${data.stripeReceiptUrl ? `
    <p style="color: #333; font-size: 14px; text-align: center;">
      <a href="${data.stripeReceiptUrl}" style="color: #007BFF;">View Payment Receipt</a>
    </p>
    ` : ''}
    
    <p style="color: #333; font-size: 14px;">
      We'll notify you when a driver is assigned and when your delivery is on the way.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Payment Confirmed');
  const textContent = `Payment Confirmed!

Dear ${data.customerName || 'Customer'},

Thank you for your payment of ${data.amount}. Your delivery booking is now confirmed.

Booking Details:
- Tracking #: ${data.trackingNumber}
- Vehicle: ${vehicleName}
- Pickup: ${data.pickupAddress} (${data.pickupPostcode})
- Delivery: ${data.deliveryAddress} (${data.deliveryPostcode})

Track your delivery: ${BASE_URL}/track?ref=${data.trackingNumber}

Run Courier - https://runcourier.co.uk`;

  return sendEmailNotification(customerEmail, `Payment Confirmed - ${data.trackingNumber}`, htmlContent, textContent);
}

export async function sendPaymentLinkFailureNotification(
  data: {
    customerName: string;
    customerEmail: string;
    trackingNumber: string;
    amount: string;
    paymentLink: string;
    jobId: string;
  }
): Promise<boolean> {
  const content = `
    <h2 style="color: #dc3545; margin-top: 0;">Payment Link Email Failed to Send</h2>
    <p style="color: #333; font-size: 16px;">
      The payment link email could not be delivered to the customer. Please contact them manually or resend the link.
    </p>
    
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #856404; margin-top: 0;">Customer Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #856404; width: 140px;"><strong>Name:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.customerName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #856404;"><strong>Email:</strong></td>
          <td style="padding: 8px 0; color: #333;"><a href="mailto:${data.customerEmail}" style="color: #007BFF;">${data.customerEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #856404;"><strong>Tracking #:</strong></td>
          <td style="padding: 8px 0; color: #333; font-family: monospace; font-weight: bold;">${data.trackingNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #856404;"><strong>Amount:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${data.amount}</td>
        </tr>
      </table>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">Payment Link</h3>
      <p style="color: #333; font-size: 14px; word-break: break-all;">
        <a href="${data.paymentLink}" style="color: #007BFF;">${data.paymentLink}</a>
      </p>
      <p style="color: #999; font-size: 12px;">
        You can copy this link and send it to the customer manually via email, SMS, or WhatsApp.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="mailto:${data.customerEmail}?subject=Payment%20Link%20for%20Booking%20${data.trackingNumber}&body=Hello%20${encodeURIComponent(data.customerName)},%0A%0APlease%20use%20the%20following%20link%20to%20complete%20your%20payment:%0A%0A${encodeURIComponent(data.paymentLink)}%0A%0AAmount%20Due:%20${encodeURIComponent(data.amount)}%0A%0AThank%20you,%0ARun%20Courier" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Email Customer Manually
      </a>
    </div>
    
    <div style="text-align: center; margin: 20px 0;">
      <a href="${BASE_URL}/admin/jobs" style="background-color: #6c757d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 14px; display: inline-block;">
        Go to Admin Jobs
      </a>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Email Delivery Failed');
  const textContent = `Payment Link Email Failed to Send

The payment link email could not be delivered to the customer.

Customer Details:
- Name: ${data.customerName}
- Email: ${data.customerEmail}
- Tracking #: ${data.trackingNumber}
- Amount: ${data.amount}

Payment Link:
${data.paymentLink}

Please contact the customer manually or resend the link from the admin panel.

Run Courier - https://runcourier.co.uk`;

  return sendEmailNotification(ADMIN_EMAIL, `Payment Link Email Failed - ${data.trackingNumber}`, htmlContent, textContent);
}

export async function sendBusinessQuoteEmail(
  customerEmail: string,
  data: {
    customerName?: string;
    companyName?: string;
    pickupPostcode: string;
    pickupAddress: string;
    pickupDate?: string;
    pickupTime?: string;
    drops: Array<{ postcode: string; address: string }>;
    vehicleType: string;
    weight: number;
    quote: {
      breakdown: {
        baseCharge: number;
        distanceCharge: number;
        multiDropDistanceCharge: number;
        weightSurcharge: number;
        centralLondonCharge: number;
        rushHourApplied: boolean;
        totalPrice: number;
      };
      legs: Array<{ from: string; to: string; distance: number; duration: number }>;
      totalDistance: number;
      totalDuration: number;
    };
    notes?: string;
    serviceType?: string;
    serviceTypePercent?: number;
    serviceTypeAmount?: number;
    finalTotal?: number;
  }
): Promise<boolean> {
  const vehicleNames: Record<string, string> = {
    motorbike: 'Motorbike',
    car: 'Car',
    small_van: 'Small Van',
    medium_van: 'Medium Van',
    lwb_van: 'LWB Van',
    luton_van: 'Luton Van',
  };

  // Show both postcode and full address in the email
  const legsHtml = data.quote.legs.map((leg, i) => {
    const fromPostcode = i === 0 ? data.pickupPostcode : data.drops[i - 1]?.postcode || '';
    const fromAddress = i === 0 ? data.pickupAddress : data.drops[i - 1]?.address || leg.from;
    const toPostcode = data.drops[i]?.postcode || '';
    const toAddress = data.drops[i]?.address || leg.to;
    return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee; color: #333; vertical-align: top;">${i + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; vertical-align: top;">
        <div style="color: #333; font-weight: 600;">${fromPostcode}</div>
        <div style="color: #333; font-size: 12px; margin-top: 4px;">${fromAddress}</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; vertical-align: top;">
        <div style="color: #333; font-weight: 600;">${toPostcode}</div>
        <div style="color: #333; font-size: 12px; margin-top: 4px;">${toAddress}</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; color: #333; text-align: right; vertical-align: top;">${leg.distance.toFixed(1)} miles</td>
    </tr>
  `;
  }).join('');

  const content = `
    <h2 style="color: #333; margin-top: 0;">Your Business Delivery Quote</h2>
    ${data.customerName ? `<p style="color: #333; font-size: 16px;">Dear ${data.customerName},</p>` : ''}
    <p style="color: #333; font-size: 16px;">
      Thank you for your enquiry. Here is your personalised multi-drop delivery quote:
    </p>
    
    ${data.companyName ? `<p style="color: #333; font-size: 14px;"><strong>Company:</strong> ${data.companyName}</p>` : ''}
    
    ${(data.pickupDate || data.pickupTime) ? `
    <div style="background-color: #f0f7ff; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #007BFF;">
      <p style="margin: 0; color: #333; font-size: 14px;">
        <strong>Requested Pickup:</strong> 
        ${data.pickupDate ? new Date(data.pickupDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
        ${data.pickupTime ? ` at ${data.pickupTime}` : ''}
      </p>
    </div>
    ` : ''}
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e0e0e0;">
      <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #007BFF; padding-bottom: 10px;">Route Details</h3>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 10px; text-align: left; color: #333; font-size: 12px;">STOP</th>
            <th style="padding: 10px; text-align: left; color: #333; font-size: 12px;">FROM</th>
            <th style="padding: 10px; text-align: left; color: #333; font-size: 12px;">TO</th>
            <th style="padding: 10px; text-align: right; color: #333; font-size: 12px;">DISTANCE</th>
          </tr>
        </thead>
        <tbody>
          ${legsHtml}
        </tbody>
      </table>
      
      <div style="background-color: #f8f9fa; padding: 15px; margin-top: 15px; border-radius: 5px;">
        <table style="width: 100%;">
          <tr>
            <td style="color: #333;">Total Distance:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${data.quote.totalDistance.toFixed(1)} miles</td>
          </tr>
          <tr>
            <td style="color: #333;">Estimated Duration:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${data.quote.totalDuration} mins</td>
          </tr>
          <tr>
            <td style="color: #333;">Vehicle Type:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${vehicleNames[data.vehicleType] || data.vehicleType}</td>
          </tr>
          <tr>
            <td style="color: #333;">Number of Drops:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${data.drops.length}</td>
          </tr>
        </table>
      </div>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e0e0e0;">
      <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #007BFF; padding-bottom: 10px;">Price Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #555; border-bottom: 1px solid #f0f0f0;">Base Charge</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: 500; border-bottom: 1px solid #f0f0f0;">&pound;${data.quote.breakdown.baseCharge.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555; border-bottom: 1px solid #f0f0f0;">Distance (${data.quote.totalDistance.toFixed(1)} miles)</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: 500; border-bottom: 1px solid #f0f0f0;">&pound;${data.quote.breakdown.distanceCharge.toFixed(2)}</td>
        </tr>
        ${data.quote.breakdown.multiDropDistanceCharge > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #555; border-bottom: 1px solid #f0f0f0;">Multi-Drop Distance</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: 500; border-bottom: 1px solid #f0f0f0;">&pound;${data.quote.breakdown.multiDropDistanceCharge.toFixed(2)}</td>
        </tr>` : ''}
        ${data.quote.breakdown.weightSurcharge > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #555; border-bottom: 1px solid #f0f0f0;">Weight Surcharge</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: 500; border-bottom: 1px solid #f0f0f0;">&pound;${data.quote.breakdown.weightSurcharge.toFixed(2)}</td>
        </tr>` : ''}
        ${(data.quote.breakdown.centralLondonCharge ?? (data.quote.breakdown as any).congestionZoneCharge ?? 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #555; border-bottom: 1px solid #f0f0f0;">Congestion Zone Charge</td>
          <td style="padding: 8px 0; text-align: right; color: #333; font-weight: 500; border-bottom: 1px solid #f0f0f0;">&pound;${((data.quote.breakdown.centralLondonCharge ?? (data.quote.breakdown as any).congestionZoneCharge ?? 0)).toFixed(2)}</td>
        </tr>` : ''}
        ${data.quote.breakdown.rushHourApplied ? `
        <tr>
          <td style="padding: 8px 0; color: #b45309; border-bottom: 1px solid #f0f0f0;">Rush Hour Rate Applied</td>
          <td style="padding: 8px 0; text-align: right; color: #b45309; font-weight: 500; border-bottom: 1px solid #f0f0f0;">Yes</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="background-color: #007BFF; color: white; border-radius: 8px; padding: 25px; margin: 20px 0; text-align: center;">
      <p style="font-size: 14px; margin: 0 0 10px 0; opacity: 0.9;">TOTAL QUOTE</p>
      <p style="font-size: 36px; font-weight: bold; margin: 0;">&pound;${(data.finalTotal ?? data.quote.breakdown.totalPrice).toFixed(2)}</p>
    </div>
    
    ${data.notes ? `
    <div style="background-color: #fff3cd; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h4 style="color: #856404; margin: 0 0 10px 0;">Additional Notes</h4>
      <p style="color: #856404; margin: 0; white-space: pre-line;">${data.notes}</p>
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 30px 0;">
      <p style="color: #333; font-size: 14px; margin-bottom: 20px;">
        Ready to book? Contact us to confirm your delivery:
      </p>
      <a href="tel:+442046346100" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block; margin: 5px;">
        Call Now
      </a>
      <a href="mailto:${INFO_EMAIL}?subject=Business%20Quote%20-%20${data.companyName || 'Enquiry'}" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block; margin: 5px;">
        Email Us
      </a>
    </div>
    
    <p style="color: #999; font-size: 12px; text-align: center;">
      This quote is valid for 7 days. Prices may vary based on actual pickup time and conditions.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Business Delivery Quote');
  
  // Show both postcode and full address in plain text version
  const legsText = data.quote.legs.map((leg, i) => {
    const fromPostcode = i === 0 ? data.pickupPostcode : data.drops[i - 1]?.postcode || '';
    const fromAddress = i === 0 ? data.pickupAddress : data.drops[i - 1]?.address || leg.from;
    const toPostcode = data.drops[i]?.postcode || '';
    const toAddress = data.drops[i]?.address || leg.to;
    return `${i + 1}. FROM: ${fromPostcode}\n   ${fromAddress}\n   TO: ${toPostcode}\n   ${toAddress}\n   Distance: ${leg.distance.toFixed(1)} miles`;
  }).join('\n\n');
  
  const textContent = `Your Business Delivery Quote

${data.customerName ? `Dear ${data.customerName},` : ''}

Thank you for your enquiry. Here is your personalised multi-drop delivery quote:

${data.companyName ? `Company: ${data.companyName}` : ''}

ROUTE DETAILS
${legsText}

Total Distance: ${data.quote.totalDistance.toFixed(1)} miles
Estimated Duration: ${data.quote.totalDuration} mins
Vehicle Type: ${vehicleNames[data.vehicleType] || data.vehicleType}
Number of Drops: ${data.drops.length}

PRICE BREAKDOWN
Base Charge: £${data.quote.breakdown.baseCharge.toFixed(2)}
Distance: £${data.quote.breakdown.distanceCharge.toFixed(2)}${data.quote.breakdown.multiDropDistanceCharge > 0 ? `\nMulti-Drop Distance: £${data.quote.breakdown.multiDropDistanceCharge.toFixed(2)}` : ''}${data.quote.breakdown.weightSurcharge > 0 ? `\nWeight Surcharge: £${data.quote.breakdown.weightSurcharge.toFixed(2)}` : ''}${(data.quote.breakdown.centralLondonCharge ?? (data.quote.breakdown as any).congestionZoneCharge ?? 0) > 0 ? `\nCongestion Zone: £${((data.quote.breakdown.centralLondonCharge ?? (data.quote.breakdown as any).congestionZoneCharge ?? 0)).toFixed(2)}` : ''}${data.quote.breakdown.rushHourApplied ? `\nRush Hour Rate: Applied` : ''}

TOTAL QUOTE: £${(data.finalTotal ?? data.quote.breakdown.totalPrice).toFixed(2)}

${data.notes ? `NOTES: ${data.notes}` : ''}

Ready to book? Contact us to confirm your delivery:
- Phone: +44 20 4634 6100
- Email: ${INFO_EMAIL}

This quote is valid for 7 days. Prices may vary based on actual pickup time and conditions.

Run Courier - https://runcourier.co.uk`;

  return sendEmailNotification(
    customerEmail, 
    `Your Business Delivery Quote${data.companyName ? ` - ${data.companyName}` : ''}`, 
    htmlContent, 
    textContent
  );
}

export async function sendJobCancellationEmail(
  customerEmail: string,
  data: {
    customerName?: string;
    trackingNumber: string;
    pickupPostcode: string;
    deliveryPostcode: string;
    cancellationReason?: string;
    totalPrice?: string;
  }
): Promise<boolean> {
  // ── Amount is the original paid amount passed in from the DB (already in £).
  // It is formatted by the caller as `£X.XX` — never recalculated here.
  const amountDisplay = data.totalPrice || null;

  const content = `
    <!-- Header message -->
    <h2 style="color: #dc3545; margin: 0 0 16px 0; font-size: 22px; font-weight: bold;">Booking Cancelled</h2>
    <p style="color: #333; font-size: 16px; margin: 0 0 8px 0;">
      Dear ${data.customerName || 'Valued Customer'},
    </p>
    <p style="color: #555; font-size: 15px; margin: 0 0 24px 0; line-height: 1.5;">
      We regret to inform you that your delivery booking has been cancelled.
    </p>

    <!-- Booking details — full-width table, label column capped so it never overflows on 320px screens -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="border-collapse: collapse; background-color: #f8f9fa; border-radius: 8px; margin: 0 0 20px 0;">
      <tr>
        <td style="padding: 20px 20px 8px 20px;">
          <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: bold; color: #333; text-transform: uppercase; letter-spacing: 0.5px;">Booking Details</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 20px 20px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;">
            <tr>
              <td style="padding: 7px 12px 7px 0; color: #666; font-size: 14px; width: 38%; vertical-align: top; white-space: nowrap;">Tracking #</td>
              <td style="padding: 7px 0; color: #111; font-size: 14px; font-family: 'Courier New', Courier, monospace; font-weight: bold; word-break: break-all;">${data.trackingNumber}</td>
            </tr>
            <tr style="border-top: 1px solid #e9ecef;">
              <td style="padding: 7px 12px 7px 0; color: #666; font-size: 14px; vertical-align: top; white-space: nowrap;">Pickup</td>
              <td style="padding: 7px 0; color: #333; font-size: 14px;">${data.pickupPostcode}</td>
            </tr>
            <tr style="border-top: 1px solid #e9ecef;">
              <td style="padding: 7px 12px 7px 0; color: #666; font-size: 14px; vertical-align: top; white-space: nowrap;">Delivery</td>
              <td style="padding: 7px 0; color: #333; font-size: 14px;">${data.deliveryPostcode}</td>
            </tr>
            ${amountDisplay ? `
            <tr style="border-top: 1px solid #e9ecef;">
              <td style="padding: 7px 12px 7px 0; color: #666; font-size: 14px; vertical-align: top; white-space: nowrap;">Amount Paid</td>
              <td style="padding: 7px 0; color: #111; font-size: 16px; font-weight: bold;">${amountDisplay}</td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    ${data.cancellationReason ? `
    <!-- Cancellation reason box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="border-collapse: collapse; background-color: #fff8e1; border: 1px solid #ffc107; border-radius: 8px; margin: 0 0 20px 0;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: bold; color: #856404; text-transform: uppercase; letter-spacing: 0.5px;">Reason for Cancellation</p>
          <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">${data.cancellationReason}</p>
        </td>
      </tr>
    </table>
    ` : ''}

    <!-- Refund notice -->
    ${amountDisplay ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="border-collapse: collapse; background-color: #e8f4fd; border-radius: 8px; margin: 0 0 20px 0;">
      <tr>
        <td style="padding: 14px 20px;">
          <p style="margin: 0; color: #0c5460; font-size: 14px; line-height: 1.5;">
            <strong>Refund information:</strong> A refund of <strong>${amountDisplay}</strong> will be returned to your original payment method within 5&ndash;7 business days.
          </p>
        </td>
      </tr>
    </table>
    ` : `
    <p style="color: #555; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
      If you have already made a payment for this booking, a refund will be processed within 5&ndash;7 business days.
    </p>
    `}

    <p style="color: #555; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0;">
      If you have any questions or would like to rebook, please don't hesitate to contact us.
    </p>

    <!-- CTA buttons — table-based so they render full-width on mobile without media queries -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse; margin: 0 0 12px 0;">
      <tr>
        <td align="center" style="padding: 0 0 12px 0;">
          <a href="${BASE_URL}/book"
             style="background-color: #007BFF; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold;
                    display: block; width: 100%; max-width: 320px; box-sizing: border-box;
                    padding: 15px 24px; border-radius: 6px; text-align: center; mso-padding-alt: 0;">
            Book Another Delivery
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 0 0 12px 0;">
          <a href="tel:+442046346100"
             style="background-color: #28a745; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: bold;
                    display: block; width: 100%; max-width: 320px; box-sizing: border-box;
                    padding: 13px 24px; border-radius: 6px; text-align: center; mso-padding-alt: 0;">
            Call Us: +44 20 4634 6100
          </a>
        </td>
      </tr>
    </table>

    <!-- Bottom spacer — prevents content being hidden behind Gmail mobile reply bar -->
    <div style="height: 48px; line-height: 48px; font-size: 1px;">&nbsp;</div>
  `;

  const htmlContent = wrapEmailContent(content, 'Booking Cancelled');
  const textContent = `Booking Cancelled

Dear ${data.customerName || 'Valued Customer'},

We regret to inform you that your delivery booking has been cancelled.

Booking Details:
  Tracking #: ${data.trackingNumber}
  Pickup:     ${data.pickupPostcode}
  Delivery:   ${data.deliveryPostcode}
${amountDisplay ? `  Amount Paid: ${amountDisplay}` : ''}

${data.cancellationReason ? `Reason for Cancellation:
${data.cancellationReason}

` : ''}${amountDisplay ? `A refund of ${amountDisplay} will be returned to your original payment method within 5-7 business days.` : 'If you have already made a payment for this booking, a refund will be processed within 5-7 business days.'}

To rebook or for any questions, please contact us:
  Phone: +44 20 4634 6100
  Web:   ${BASE_URL}/book

Run Courier — ${BASE_URL}`;

  return sendEmailNotification(customerEmail, `Booking Cancelled - ${data.trackingNumber}`, htmlContent, textContent);
}

// Send failed delivery notification email to customer
export async function sendFailedDeliveryEmail(customerEmail: string, data: {
  customerName?: string;
  trackingNumber: string;
  pickupAddress?: string;
  pickupPostcode?: string;
  pickupBuildingName?: string;
  deliveryAddress?: string;
  deliveryPostcode?: string;
  deliveryBuildingName?: string;
  recipientName?: string;
  recipientPhone?: string;
  vehicleType?: string;
  weight?: string;
  distance?: string;
  failureReason?: string;
  attemptedAt?: string | Date;
  driverName?: string;
  totalPrice?: string;
}): Promise<boolean> {
  const vehicleDisplay = (data.vehicleType || 'car').replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  
  const formatDateTime = (date: string | Date | null | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleString('en-GB', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const attemptedTime = formatDateTime(data.attemptedAt) || formatDateTime(new Date());

  const content = `
    <h2 style="color: #dc3545; margin-top: 0;">Delivery Attempt Failed</h2>
    <p style="color: #333; font-size: 16px;">We're sorry to inform you that we were unable to complete your delivery. Our driver attempted delivery but was unsuccessful.</p>
    
    <!-- Tracking Number Banner -->
    <div style="background-color: #dc3545; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px;">Tracking Number</p>
      <p style="margin: 10px 0 5px; font-size: 28px; font-weight: bold; letter-spacing: 3px;">${data.trackingNumber || 'N/A'}</p>
      <p style="margin: 0; font-size: 12px; opacity: 0.9;">Delivery Attempt Failed</p>
    </div>
    
    ${data.failureReason ? `
    <!-- Failure Reason -->
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #856404; margin-top: 0; font-size: 16px;">Reason for Failed Delivery</h3>
      <p style="color: #856404; font-size: 14px; margin: 0;">
        ${data.failureReason}
      </p>
    </div>
    ` : ''}
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; border: 1px solid #eee;">
      
      <!-- Delivery Attempt Details -->
      <h3 style="color: #dc3545; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #dc3545; padding-bottom: 8px;">DELIVERY ATTEMPT DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 130px;"><strong>Attempted:</strong></td>
          <td style="padding: 8px 0; color: #333;">${attemptedTime}</td>
        </tr>
        ${data.driverName ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Driver:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.driverName}</td>
        </tr>
        ` : ''}
      </table>

      <!-- Collection Details -->
      <h3 style="color: #007BFF; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #007BFF; padding-bottom: 8px;">COLLECTION DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${data.pickupBuildingName ? `${data.pickupBuildingName}<br>` : ''}
            ${data.pickupAddress || 'N/A'}<br>
            <strong>${data.pickupPostcode || 'N/A'}</strong>
          </td>
        </tr>
      </table>

      <!-- Delivery Details -->
      <h3 style="color: #6c757d; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #6c757d; padding-bottom: 8px;">DELIVERY DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${data.deliveryBuildingName ? `${data.deliveryBuildingName}<br>` : ''}
            ${data.deliveryAddress || 'N/A'}<br>
            <strong>${data.deliveryPostcode || 'N/A'}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #333; vertical-align: top;"><strong>Recipient:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${data.recipientName || 'N/A'}<br>
            ${data.recipientPhone ? `<a href="tel:${data.recipientPhone}" style="color: #007BFF;">${data.recipientPhone}</a>` : 'N/A'}
          </td>
        </tr>
      </table>

      <!-- Service Details -->
      <h3 style="color: #6c757d; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #6c757d; padding-bottom: 8px;">SERVICE DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #333; width: 130px;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleDisplay}</td>
        </tr>
        ${data.weight ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.weight} kg</td>
        </tr>
        ` : ''}
        ${data.distance ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.distance} miles</td>
        </tr>
        ` : ''}
        ${data.totalPrice ? `
        <tr>
          <td style="padding: 8px 0; color: #333;"><strong>Amount:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.totalPrice}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p style="color: #333; font-size: 14px; margin: 20px 0;">
      Our team will be in touch shortly to arrange a redelivery or discuss alternative options. If you'd like to speak with us immediately, please contact our customer service team.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="tel:+442046346100" style="background-color: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Call Us: +44 20 4634 6100
      </a>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
      <p style="color: #333; margin: 0 0 10px; font-size: 14px;"><strong>Need Help?</strong></p>
      <p style="color: #333; margin: 0; font-size: 14px;">
        Call us: <a href="tel:+447311121217" style="color: #007BFF; font-weight: bold;">+44 7311 121 217</a><br>
        Email: <a href="mailto:INFO_EMAIL" style="color: #007BFF;">INFO_EMAIL</a>
      </p>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Delivery Failed');
  
  const textContent = `DELIVERY ATTEMPT FAILED

Dear ${data.customerName || 'Valued Customer'},

We're sorry to inform you that we were unable to complete your delivery.

Tracking Number: ${data.trackingNumber}
Attempted: ${attemptedTime}
${data.driverName ? `Driver: ${data.driverName}` : ''}

${data.failureReason ? `REASON FOR FAILED DELIVERY
--------------------------
${data.failureReason}

` : ''}COLLECTION DETAILS
------------------
${data.pickupBuildingName ? `${data.pickupBuildingName}\n` : ''}${data.pickupAddress || 'N/A'}
${data.pickupPostcode || 'N/A'}

DELIVERY DETAILS
----------------
${data.deliveryBuildingName ? `${data.deliveryBuildingName}\n` : ''}${data.deliveryAddress || 'N/A'}
${data.deliveryPostcode || 'N/A'}
Recipient: ${data.recipientName || 'N/A'}
${data.recipientPhone ? `Phone: ${data.recipientPhone}` : ''}

SERVICE DETAILS
---------------
Vehicle: ${vehicleDisplay}
${data.weight ? `Weight: ${data.weight} kg` : ''}
${data.distance ? `Distance: ${data.distance} miles` : ''}
${data.totalPrice ? `Amount: ${data.totalPrice}` : ''}

Our team will be in touch shortly to arrange a redelivery or discuss alternative options.

If you'd like to speak with us immediately, please contact our customer service team at +44 20 4634 6100.

Run Courier - https://runcourier.co.uk`;

  return sendEmailNotification(customerEmail, `Delivery Failed - ${data.trackingNumber}`, htmlContent, textContent);
}

export async function sendDriverPaymentConfirmation(
  driverEmail: string,
  data: {
    driverName: string;
    amount: string;
    description: string;
    reference?: string;
    bankName?: string;
    sortCode?: string;
    accountNumber?: string;
    paidAt: string;
  }
): Promise<{ success: boolean }> {
  const formattedDate = new Date(data.paidAt).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const maskedAccount = data.accountNumber 
    ? `****${data.accountNumber.slice(-4)}`
    : 'N/A';

  const htmlContent = `
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #28a745; margin-bottom: 15px;">Payment Confirmation</h2>
      <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
        Hi ${data.driverName},
      </p>
      <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
        We're pleased to confirm that a payment has been made to you from Run Courier.
      </p>
      
      <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
              <strong style="color: #333;">Amount Paid:</strong>
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
              <span style="color: #28a745; font-size: 20px; font-weight: bold;">£${data.amount}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
              <strong style="color: #333;">Description:</strong>
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
              ${data.description}
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
              <strong style="color: #333;">Payment Date:</strong>
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
              ${formattedDate}
            </td>
          </tr>
          ${data.reference ? `
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
              <strong style="color: #333;">Reference:</strong>
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
              ${data.reference}
            </td>
          </tr>
          ` : ''}
          ${data.bankName ? `
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
              <strong style="color: #333;">Bank:</strong>
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
              ${data.bankName}
            </td>
          </tr>
          ` : ''}
          ${data.sortCode ? `
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
              <strong style="color: #333;">Sort Code:</strong>
            </td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">
              ${data.sortCode}
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 10px 0;">
              <strong style="color: #333;">Account:</strong>
            </td>
            <td style="padding: 10px 0; text-align: right;">
              ${maskedAccount}
            </td>
          </tr>
        </table>
      </div>
      
      <p style="color: #333; font-size: 14px; margin-top: 20px;">
        This payment should appear in your bank account within 1-3 working days, depending on your bank.
      </p>
      
      <p style="color: #333; font-size: 14px;">
        If you have any questions about this payment, please contact our team.
      </p>
    </div>
  `;

  const textContent = `
Payment Confirmation - Run Courier

Hi ${data.driverName},

We're pleased to confirm that a payment has been made to you from Run Courier.

PAYMENT DETAILS
---------------
Amount Paid: £${data.amount}
Description: ${data.description}
Payment Date: ${formattedDate}
${data.reference ? `Reference: ${data.reference}` : ''}
${data.bankName ? `Bank: ${data.bankName}` : ''}
${data.sortCode ? `Sort Code: ${data.sortCode}` : ''}
Account: ${maskedAccount}

This payment should appear in your bank account within 1-3 working days, depending on your bank.

If you have any questions about this payment, please contact our team.

Run Courier - https://runcourier.co.uk`;

  const result = await sendEmailNotification(driverEmail, `Payment Confirmation - £${data.amount} - Run Courier`, wrapEmailContent(htmlContent, 'Payment Confirmation'), textContent);
  return { success: result };
}

export async function sendDeliveryConfirmationEmail(
  customerEmail: string,
  jobDetails: {
    trackingNumber: string;
    jobNumber?: string | null;
    pickupAddress?: string;
    pickupPostcode?: string;
    deliveryAddress?: string;
    deliveryPostcode?: string;
    recipientName?: string | null;
    podRecipientName?: string | null;
    podPhotoUrl?: string | null;
    podPhotos?: string[];
    podSignatureUrl?: string | null;
    deliveredAt?: string | null;
  }
): Promise<boolean> {
  const signedByName = jobDetails.podRecipientName || jobDetails.recipientName || 'Recipient';
  const deliveredTime = jobDetails.deliveredAt
    ? new Date(jobDetails.deliveredAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/London' })
    : new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/London' });

  const jobRef = jobDetails.jobNumber || jobDetails.trackingNumber;

  let podImageHtml = '';
  const photoUrl = jobDetails.podPhotoUrl || (jobDetails.podPhotos && jobDetails.podPhotos.length > 0 ? jobDetails.podPhotos[0] : null);
  if (photoUrl) {
    podImageHtml = `
      <div style="margin: 20px 0; text-align: center;">
        <p style="color: #555; font-size: 14px; margin-bottom: 8px; font-weight: 600;">Proof of Delivery Photo:</p>
        <img src="${photoUrl}" alt="Proof of Delivery" style="max-width: 100%; width: 400px; border-radius: 8px; border: 1px solid #ddd;" />
      </div>
    `;
  }

  let signatureHtml = '';
  if (jobDetails.podSignatureUrl) {
    signatureHtml = `
      <div style="margin: 20px 0; text-align: center;">
        <p style="color: #555; font-size: 14px; margin-bottom: 8px; font-weight: 600;">Signature:</p>
        <img src="${jobDetails.podSignatureUrl}" alt="Recipient Signature" style="max-width: 300px; border-radius: 4px; border: 1px solid #ddd; background: #fff; padding: 8px;" />
      </div>
    `;
  }

  const content = `
    <h2 style="color: #333; margin-bottom: 4px;">Your Delivery is Complete</h2>
    <p style="color: #555; font-size: 16px; margin-top: 0;">
      Great news! Your parcel has been successfully delivered.
    </p>

    <div style="background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #777; font-size: 14px; width: 140px;">Job Number:</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">#${jobRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #777; font-size: 14px;">Tracking Number:</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px;">${jobDetails.trackingNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #777; font-size: 14px;">Delivered To:</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px;">${jobDetails.deliveryAddress || ''} ${jobDetails.deliveryPostcode || ''}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #777; font-size: 14px;">Received By:</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${signedByName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #777; font-size: 14px;">Delivered At:</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px;">${deliveredTime}</td>
        </tr>
      </table>
    </div>

    ${podImageHtml}
    ${signatureHtml}

    <p style="color: #555; font-size: 14px; margin-top: 20px;">
      Thank you for choosing Run Courier. We hope you had a great experience!
    </p>
    <div style="text-align: center; margin-top: 20px;">
      <a href="${BASE_URL}/track?ref=${jobDetails.trackingNumber}" style="display: inline-block; background-color: #007BFF; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
        View Delivery Details
      </a>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Delivery Complete');
  const textContent = `Your Delivery is Complete\n\nGreat news! Your parcel has been successfully delivered.\n\nJob Number: #${jobRef}\nTracking Number: ${jobDetails.trackingNumber}\nDelivered To: ${jobDetails.deliveryAddress || ''} ${jobDetails.deliveryPostcode || ''}\nReceived By: ${signedByName}\nDelivered At: ${deliveredTime}\n\nThank you for choosing Run Courier!\n\nTrack: ${BASE_URL}/track?ref=${jobDetails.trackingNumber}`;

  return sendEmailNotification(customerEmail, `Delivery Complete #${jobRef} - ${jobDetails.trackingNumber} - Run Courier`, htmlContent, textContent);
}

export async function sendContractSigningEmail(
  driverEmail: string,
  data: { driverName: string; contractTitle: string; signingUrl: string }
): Promise<boolean> {
  const content = `
    <h2 style="color: #1a1a1a; margin-bottom: 16px;">Contract Ready for Signing</h2>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
      Hi ${data.driverName},
    </p>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
      A new contract has been prepared for you: <strong>${data.contractTitle}</strong>
    </p>
    <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
      Please review and sign the contract by clicking the button below.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.signingUrl}" style="display: inline-block; background-color: #007BFF; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Review &amp; Sign Contract
      </a>
    </div>
    <p style="color: #888; font-size: 13px; line-height: 1.6;">
      If you have any questions about this contract, please contact us at sales@runcourier.co.uk
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Contract Signing');
  const textContent = `Contract Ready for Signing\n\nHi ${data.driverName},\n\nA new contract has been prepared for you: ${data.contractTitle}\n\nPlease review and sign at: ${data.signingUrl}\n\nIf you have questions, contact sales@runcourier.co.uk`;

  return sendEmailNotification(driverEmail, `Contract Ready for Signing - ${data.contractTitle} - Run Courier`, htmlContent, textContent);
}

export async function sendApiAccessEmail(data: {
  toEmail: string;
  contactName: string;
  companyName: string;
  apiKey: string;
  permissions: string[];
}): Promise<boolean> {
  const permLabels: Record<string, string> = {
    quote: 'Quote API',
    booking: 'Booking API',
    tracking: 'Tracking API',
    cancel: 'Cancel API',
  };
  const permList = data.permissions.map(p => permLabels[p] || p).join(', ');

  const content = `
    <h2 style="color:#1a1a1a;margin-bottom:8px;">API Access Approved</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;">
      Hi ${data.contactName},<br><br>
      Your API integration request for <strong>${data.companyName}</strong> has been reviewed and approved.
      You can now start integrating with the Run Courier API using the credentials below.
    </p>

    <div style="background:#f0f7ff;border:1px solid #bcd6f5;border-radius:8px;padding:20px;margin:24px 0;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#555;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your API Key</p>
      <p style="font-family:monospace;font-size:15px;font-weight:700;color:#0077B6;word-break:break-all;margin:0 0 12px 0;">${data.apiKey}</p>
      <p style="margin:0;font-size:12px;color:#e55;">
        <strong>Important:</strong> This key will not be shown again. Store it securely in an environment variable and never commit it to source control.
      </p>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tbody>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#666;font-size:14px;width:140px;white-space:nowrap;">Base URL</td>
          <td style="padding:8px 0;font-size:14px;color:#111;font-weight:500;font-family:monospace;">https://runcourier.co.uk</td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#666;font-size:14px;">Permissions</td>
          <td style="padding:8px 0;font-size:14px;color:#111;font-weight:500;">${permList || 'Quote, Tracking'}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#666;font-size:14px;">Documentation</td>
          <td style="padding:8px 0;font-size:14px;">
            <a href="https://runcourier.co.uk/developers" style="color:#007BFF;">runcourier.co.uk/developers</a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#666;font-size:14px;">Rate Limit</td>
          <td style="padding:8px 0;font-size:14px;color:#111;">60 requests per minute</td>
        </tr>
      </tbody>
    </table>

    <h3 style="color:#1a1a1a;font-size:16px;margin:24px 0 8px 0;">Authentication</h3>
    <p style="color:#555;font-size:14px;margin-bottom:12px;">
      Include your API key on every request using either of these headers:
    </p>
    <div style="background:#f4f4f4;border-radius:6px;padding:14px;font-family:monospace;font-size:13px;color:#333;margin-bottom:24px;">
      Authorization: Bearer ${data.apiKey}<br><br>
      <span style="color:#888;"># or alternatively:</span><br>
      X-Api-Key: ${data.apiKey}
    </div>

    <div style="text-align:center;margin:28px 0 16px 0;">
      <a href="https://runcourier.co.uk/developers"
         style="background-color:#007BFF;color:#ffffff;padding:12px 32px;border-radius:6px;
                text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
        View Documentation
      </a>
    </div>

    <p style="color:#888;font-size:13px;line-height:1.6;">
      Need help? Contact our integration team at
      <a href="mailto:sales@runcourier.co.uk" style="color:#007BFF;">sales@runcourier.co.uk</a>
      or visit <a href="https://runcourier.co.uk/contact" style="color:#007BFF;">runcourier.co.uk/contact</a>.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'API Access Approved');
  const textContent = [
    `API Access Approved — Run Courier`,
    ``,
    `Hi ${data.contactName},`,
    ``,
    `Your API integration request for ${data.companyName} has been approved.`,
    ``,
    `YOUR API KEY (save this — it will not be shown again):`,
    data.apiKey,
    ``,
    `Base URL: https://runcourier.co.uk`,
    `Permissions: ${permList}`,
    `Documentation: https://runcourier.co.uk/developers`,
    `Rate limit: 60 requests per minute`,
    ``,
    `Questions? Email sales@runcourier.co.uk`,
  ].join('\n');

  return sendEmailNotification(
    data.toEmail,
    `API Access Approved — Run Courier`,
    htmlContent,
    textContent,
  );
}

export async function sendSupervisorInviteEmail(supervisorEmail: string, data: {
  supervisorName?: string;
  inviteUrl: string;
  invitedBy: string;
  expiresAt: Date;
}): Promise<boolean> {
  const content = `
    <h2 style="color: #1a1a1a; margin-bottom: 8px;">You've Been Invited as a Supervisor</h2>
    <p style="color: #555; font-size: 15px; line-height: 1.6;">
      Hi${data.supervisorName ? ` ${data.supervisorName}` : ''},<br><br>
      ${data.invitedBy} has invited you to join <strong>Run Courier</strong> as a Supervisor.
      As a supervisor, you will be able to manage jobs, view driver activity, and oversee daily operations.
    </p>
    <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #555; font-size: 14px;">
        <strong>Invitation expires:</strong> ${data.expiresAt.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.inviteUrl}" style="display: inline-block; background-color: #007BFF; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Accept Invitation &amp; Create Account
      </a>
    </div>
    <p style="color: #888; font-size: 13px; line-height: 1.6;">
      If you did not expect this invitation or believe this was sent in error, please ignore this email.
      For questions, contact us at sales@runcourier.co.uk
    </p>
    <p style="color: #aaa; font-size: 12px;">
      Or copy this link into your browser:<br>
      <a href="${data.inviteUrl}" style="color: #007BFF; word-break: break-all;">${data.inviteUrl}</a>
    </p>
  `;
  const htmlContent = wrapEmailContent(content, 'Supervisor Invitation');
  const textContent = `You've Been Invited as a Supervisor\n\nHi${data.supervisorName ? ` ${data.supervisorName}` : ''},\n\n${data.invitedBy} has invited you to join Run Courier as a Supervisor.\n\nAccept your invitation at: ${data.inviteUrl}\n\nThis invitation expires on ${data.expiresAt.toLocaleDateString('en-GB')}.\n\nQuestions? Contact sales@runcourier.co.uk`;
  return sendEmailNotification(supervisorEmail, 'You\'ve Been Invited as a Supervisor - Run Courier', htmlContent, textContent);
}

export async function sendApiInvoiceEmail(data: {
  toEmail: string;
  companyName: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  totalAmount: string;
  jobItems: Array<{
    trackingNumber: string;
    pickupAddress: string;
    deliveryAddress: string;
    vehicleType: string;
    scheduledDate: string;
    amount: number;
  }>;
}): Promise<boolean> {
  const jobRows = data.jobItems.map(job => `
    <tr>
      <td style="padding:9px 8px;color:#333;font-family:monospace;font-size:13px;border-bottom:1px solid #eee;">${job.trackingNumber}</td>
      <td style="padding:9px 8px;color:#333;font-size:13px;border-bottom:1px solid #eee;">${job.scheduledDate}</td>
      <td style="padding:9px 8px;color:#333;font-size:13px;border-bottom:1px solid #eee;">${job.pickupAddress}</td>
      <td style="padding:9px 8px;color:#333;font-size:13px;border-bottom:1px solid #eee;">${job.deliveryAddress}</td>
      <td style="padding:9px 8px;color:#333;font-size:13px;border-bottom:1px solid #eee;text-transform:capitalize;">${job.vehicleType}</td>
      <td style="padding:9px 8px;color:#333;font-size:13px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">£${job.amount.toFixed(2)}</td>
    </tr>
  `).join('');

  const content = `
    <h2 style="color:#1a1a1a;margin-bottom:8px;">Invoice from Run Courier</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;">
      Dear ${data.companyName},<br><br>
      Please find your invoice for the period <strong>${data.periodStart}</strong> to <strong>${data.periodEnd}</strong>.
    </p>

    <div style="background:#f0f7ff;border:1px solid #bcd6f5;border-radius:8px;padding:20px;margin:20px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:7px 0;color:#555;width:160px;"><strong>Invoice Number:</strong></td>
          <td style="padding:7px 0;color:#111;font-weight:700;font-family:monospace;">${data.invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#555;"><strong>Billing Period:</strong></td>
          <td style="padding:7px 0;color:#111;">${data.periodStart} — ${data.periodEnd}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#555;"><strong>Total Jobs:</strong></td>
          <td style="padding:7px 0;color:#111;">${data.jobItems.length}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#555;"><strong>Total Amount:</strong></td>
          <td style="padding:7px 0;color:#111;font-weight:700;font-size:20px;">£${data.totalAmount}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:#555;"><strong>Payment Due:</strong></td>
          <td style="padding:7px 0;color:#d9534f;font-weight:700;">${data.dueDate}</td>
        </tr>
      </table>
    </div>

    <h3 style="color:#1a1a1a;margin:24px 0 12px 0;">Delivery Breakdown</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:10px 8px;text-align:left;color:#333;font-size:12px;border-bottom:2px solid #ddd;text-transform:uppercase;letter-spacing:.4px;">Reference</th>
            <th style="padding:10px 8px;text-align:left;color:#333;font-size:12px;border-bottom:2px solid #ddd;text-transform:uppercase;letter-spacing:.4px;">Date</th>
            <th style="padding:10px 8px;text-align:left;color:#333;font-size:12px;border-bottom:2px solid #ddd;text-transform:uppercase;letter-spacing:.4px;">Pickup</th>
            <th style="padding:10px 8px;text-align:left;color:#333;font-size:12px;border-bottom:2px solid #ddd;text-transform:uppercase;letter-spacing:.4px;">Delivery</th>
            <th style="padding:10px 8px;text-align:left;color:#333;font-size:12px;border-bottom:2px solid #ddd;text-transform:uppercase;letter-spacing:.4px;">Vehicle</th>
            <th style="padding:10px 8px;text-align:right;color:#333;font-size:12px;border-bottom:2px solid #ddd;text-transform:uppercase;letter-spacing:.4px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${jobRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="padding:12px 8px;text-align:right;font-weight:700;color:#333;border-top:2px solid #ddd;font-size:14px;">Total Due:</td>
            <td style="padding:12px 8px;text-align:right;font-weight:700;color:#111;font-size:17px;border-top:2px solid #ddd;">£${data.totalAmount}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="background:#e8f4fd;border-radius:8px;padding:20px;margin:24px 0;">
      <h3 style="color:#333;margin-top:0;">Payment Instructions</h3>

      <p style="color:#333;margin-bottom:10px;font-weight:600;">Option 1: Bank Transfer</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:5px 0;color:#333;width:160px;"><strong>Account Name:</strong></td><td style="padding:5px 0;color:#333;">RUN COURIER</td></tr>
        <tr><td style="padding:5px 0;color:#333;"><strong>Sort Code:</strong></td><td style="padding:5px 0;color:#333;">30-99-50</td></tr>
        <tr><td style="padding:5px 0;color:#333;"><strong>Account Number:</strong></td><td style="padding:5px 0;color:#333;">36113363</td></tr>
        <tr><td style="padding:5px 0;color:#333;"><strong>Reference:</strong></td><td style="padding:5px 0;color:#333;font-weight:700;font-family:monospace;">${data.invoiceNumber}</td></tr>
      </table>

      <p style="color:#333;margin-bottom:10px;font-weight:600;">Option 2: Pay by Card</p>
      <p style="color:#333;margin:0;">Pay securely online at <a href="https://runcourier.co.uk/pay" style="color:#0066cc;">runcourier.co.uk/pay</a></p>
    </div>

    <p style="color:#555;font-size:14px;">Questions about this invoice? Contact us at <a href="mailto:accounts@runcourier.co.uk" style="color:#007BFF;">accounts@runcourier.co.uk</a></p>
    <p style="color:#555;font-size:14px;">Thank you for your business.</p>
  `;

  const htmlContent = wrapEmailContent(content, `Invoice ${data.invoiceNumber}`);
  const textContent = [
    `Invoice ${data.invoiceNumber} — Run Courier`,
    ``,
    `Dear ${data.companyName},`,
    ``,
    `Period: ${data.periodStart} to ${data.periodEnd}`,
    `Jobs: ${data.jobItems.length}`,
    `Total: £${data.totalAmount}`,
    `Due: ${data.dueDate}`,
    ``,
    `Payment:`,
    `  Bank Transfer — Sort: 30-99-50, Acc: 36113363, Ref: ${data.invoiceNumber}`,
    `  Online — https://runcourier.co.uk/pay`,
    ``,
    `Questions? accounts@runcourier.co.uk`,
  ].join('\n');

  return sendEmailNotification(
    data.toEmail,
    `Invoice ${data.invoiceNumber} — Run Courier API Account`,
    htmlContent,
    textContent
  );
}
