import { Resend } from 'resend';

let connectionSettings: any;

// Logo URL - use current deployment or production
const LOGO_URL = 'https://945d2f5a-7336-462a-b33f-10fb0e78a123-00-2bep7zisdjcv3.spock.replit.dev/logo-email.jpg';

// Base URL for tracking links - uses current deployment or production
const BASE_URL = process.env.APP_URL || 'https://945d2f5a-7336-462a-b33f-10fb0e78a123-00-2bep7zisdjcv3.spock.replit.dev';

// Mobile app store URLs
const GOOGLE_PLAY_URL = process.env.GOOGLE_PLAY_URL || 'https://play.google.com/store/apps/details?id=com.runcourier.app';
const APP_STORE_URL = process.env.APP_STORE_URL || 'https://apps.apple.com/us/app/run-courier/id6756506175';

// Official store badge image URLs (Google and Apple hosted)
const GOOGLE_PLAY_BADGE_URL = 'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
const APP_STORE_BADGE_URL = 'https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg';

// Reusable email header with logo
function getEmailHeader(title?: string): string {
  return `
    <div style="background-color: #007BFF; padding: 20px; text-align: center;">
      <img src="${LOGO_URL}" alt="Run Courier" style="max-width: 120px; height: auto; margin-bottom: 10px;" />
      ${title ? `<h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>` : ''}
    </div>
  `;
}

// Reusable email footer
function getEmailFooter(): string {
  return `
    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
    <div style="text-align: center;">
      <img src="${LOGO_URL}" alt="Run Courier" style="max-width: 60px; height: auto; margin-bottom: 10px;" />
      <p style="color: #999; font-size: 12px; margin: 0;">
        Run Courier - Same Day Delivery Across the UK<br>
        <a href="https://www.runcourier.co.uk" style="color: #007BFF;">www.runcourier.co.uk</a> | 
        <a href="tel:+442046346100" style="color: #007BFF;">+44 20 4634 6100</a>
      </p>
    </div>
  `;
}

// Reusable mobile app download section for all emails
function getAppDownloadSection(): string {
  return `
    <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; margin: 30px 0 20px 0; text-align: center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="text-align: center; padding-bottom: 12px;">
            <h3 style="color: #333333; font-size: 18px; font-weight: 600; margin: 0 0 8px 0; font-family: Arial, sans-serif;">
              Get the Run Courier Mobile App
            </h3>
            <p style="color: #666666; font-size: 14px; margin: 0; line-height: 1.5; font-family: Arial, sans-serif;">
              Track deliveries, receive job updates, and manage your account anytime, anywhere.
            </p>
          </td>
        </tr>
        <tr>
          <td style="text-align: center; padding-top: 16px;">
            <!--[if mso]>
            <table role="presentation" cellpadding="0" cellspacing="0" align="center">
            <tr>
            <td style="padding-right: 10px;">
            <![endif]-->
            <a href="${APP_STORE_URL}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin: 0 8px 8px 8px; text-decoration: none;">
              <img src="${APP_STORE_BADGE_URL}" alt="Download on the App Store" width="135" height="40" style="border: 0; display: inline-block; vertical-align: middle; max-width: 135px; height: auto;" />
            </a>
            <!--[if mso]>
            </td>
            <td style="padding-left: 10px;">
            <![endif]-->
            <a href="${GOOGLE_PLAY_URL}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin: 0 8px 8px 8px; text-decoration: none;">
              <img src="${GOOGLE_PLAY_BADGE_URL}" alt="Get it on Google Play" width="155" height="60" style="border: 0; display: inline-block; vertical-align: middle; max-width: 155px; height: auto;" />
            </a>
            <!--[if mso]>
            </td>
            </tr>
            </table>
            <![endif]-->
          </td>
        </tr>
      </table>
    </div>
  `;
}

// Wrap content in standard email template
function wrapEmailContent(content: string, headerTitle?: string): string {
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
      fromEmail: process.env.RESEND_FROM_EMAIL || 'RUN COURIER <info@runcourier.co.uk>'
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
          'X_REPLIT_TOKEN': xReplitToken
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
      fromEmail: connectionSettings.settings.from_email || 'RUN COURIER <info@runcourier.co.uk>'
    };
  } catch (error) {
    console.error('[Email] Failed to fetch Resend credentials:', error);
    return null;
  }
}

export async function sendEmailNotification(
  recipient: string,
  subject: string,
  htmlContent: string,
  textContent?: string
): Promise<boolean> {
  console.log(`[Email] Attempting to send "${subject}" to ${recipient}`);
  try {
    const credentials = await getResendCredentials();
    if (!credentials) {
      console.warn('[Email] Resend not configured - email notification not sent');
      return false;
    }

    const resend = new Resend(credentials.apiKey);
    console.log(`[Email] Sending from ${credentials.fromEmail} to ${recipient}`);
    
    const result = await resend.emails.send({
      from: credentials.fromEmail,
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
  return sendEmailNotification('info@runcourier.co.uk', subject, htmlContent, textContent);
}

export async function sendWelcomeEmail(
  email: string,
  name: string,
  role: string
): Promise<boolean> {
  const roleText = role === 'business' ? 'Business Account' : 'Customer Account';
  const content = `
    <h2 style="color: #333;">Hello ${name}!</h2>
    <p style="color: #666; font-size: 16px;">
      Thank you for registering with Run Courier. Your ${roleText} has been successfully created.
    </p>
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">What you can do now:</h3>
      <ul style="color: #666; line-height: 1.8;">
        <li>Book same-day deliveries across the UK</li>
        <li>Track your parcels in real-time</li>
        <li>View your booking history</li>
        ${role === 'business' ? '<li>Access Pay Later invoicing options</li>' : ''}
        <li>Get 24/7 customer support</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://www.runcourier.co.uk/book" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Book Your First Delivery
      </a>
    </div>
    <p style="color: #666; font-size: 14px;">
      If you have any questions, our support team is here to help 24/7.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Welcome to Run Courier!');
  const textContent = `Welcome to Run Courier!\n\nHello ${name}!\n\nThank you for registering with Run Courier. Your ${roleText} has been successfully created.\n\nWhat you can do now:\n- Book same-day deliveries across the UK\n- Track your parcels in real-time\n- View your booking history\n- Get 24/7 customer support\n\nVisit https://www.runcourier.co.uk/book to book your first delivery.\n\nRun Courier - www.runcourier.co.uk`;

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
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 120px;"><strong>Name:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Email:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><a href="mailto:${email}" style="color: #007BFF;">${email}</a></td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Account Type:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${role === 'business' ? 'Business' : 'Individual'}</td>
        </tr>
        ${company ? `
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Company:</strong></td>
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
    
    <!-- Tracking & Status -->
    <div style="background-color: #007BFF; color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center;">
      <p style="margin: 0; font-size: 14px;">Tracking Number</p>
      <p style="margin: 5px 0 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;">${jobDetails.trackingNumber || 'N/A'}</p>
    </div>
    
    <div style="background-color: white; border-radius: 0 0 8px 8px; padding: 20px; border: 1px solid #eee; border-top: none;">
      
      <!-- Pickup Details -->
      <h3 style="color: #007BFF; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #007BFF; padding-bottom: 8px;">PICKUP DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px; vertical-align: top;"><strong>Postcode:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupPostcode || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupAddress || 'N/A'}</td>
        </tr>
        ${jobDetails.pickupBuildingName ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Building:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupBuildingName}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Contact Name:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.pickupContactName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Contact Phone:</strong></td>
          <td style="padding: 8px 0; color: #333;"><a href="tel:${jobDetails.pickupContactPhone}" style="color: #007BFF;">${jobDetails.pickupContactPhone || 'N/A'}</a></td>
        </tr>
        ${jobDetails.pickupInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.pickupInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledPickup ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Scheduled Time:</strong></td>
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
            <td style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;"><strong>Postcode:</strong></td>
            <td style="padding: 5px 0; color: #333;">${stop.postcode || 'N/A'}</td>
          </tr>
          ${stop.address ? `
          <tr>
            <td style="padding: 5px 0; color: #666; vertical-align: top;"><strong>Address:</strong></td>
            <td style="padding: 5px 0; color: #333;">${stop.address}</td>
          </tr>
          ` : ''}
          ${stop.recipientName ? `
          <tr>
            <td style="padding: 5px 0; color: #666; vertical-align: top;"><strong>Recipient:</strong></td>
            <td style="padding: 5px 0; color: #333;">${stop.recipientName}</td>
          </tr>
          ` : ''}
          ${stop.recipientPhone ? `
          <tr>
            <td style="padding: 5px 0; color: #666; vertical-align: top;"><strong>Phone:</strong></td>
            <td style="padding: 5px 0; color: #333;"><a href="tel:${stop.recipientPhone}" style="color: #007BFF;">${stop.recipientPhone}</a></td>
          </tr>
          ` : ''}
          ${stop.instructions ? `
          <tr>
            <td style="padding: 5px 0; color: #666; vertical-align: top;"><strong>Instructions:</strong></td>
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
          <td style="padding: 8px 0; color: #666; width: 140px; vertical-align: top;"><strong>Postcode:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.deliveryPostcode || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.deliveryAddress || 'N/A'}</td>
        </tr>
        ${jobDetails.deliveryBuildingName ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Building:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.deliveryBuildingName}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Recipient Name:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.recipientName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Recipient Phone:</strong></td>
          <td style="padding: 8px 0; color: #333;"><a href="tel:${jobDetails.recipientPhone}" style="color: #007BFF;">${jobDetails.recipientPhone || 'N/A'}</a></td>
        </tr>
        ${jobDetails.deliveryInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.deliveryInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledDelivery ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Scheduled Time:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${scheduledDelivery}</td>
        </tr>
        ` : ''}
      </table>
      `}

      <!-- Delivery Options -->
      <h3 style="color: #6c757d; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #6c757d; padding-bottom: 8px;">DELIVERY OPTIONS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px;"><strong>Vehicle Type:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.weight || '0'} kg</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.distance || '0'} miles</td>
        </tr>
        ${jobDetails.isMultiDrop ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Multi-Drop:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes</td>
        </tr>
        ` : ''}
        ${jobDetails.isReturnTrip ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Return Trip:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Return To:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.returnToSameLocation ? 'Same as Pickup' : (jobDetails.returnAddress || jobDetails.returnPostcode || 'Not specified')}</td>
        </tr>
        ${!jobDetails.returnToSameLocation && jobDetails.returnPostcode ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Return Postcode:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.returnPostcode}</td>
        </tr>
        ` : ''}
        ${!jobDetails.returnToSameLocation && jobDetails.returnAddress ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Return Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.returnAddress}</td>
        </tr>
        ` : ''}
        ` : ''}
        ${jobDetails.isCentralLondon ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Central London:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes (Congestion charge applies)</td>
        </tr>
        ` : ''}
      </table>

      <!-- Pricing -->
      <h3 style="color: #dc3545; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #dc3545; padding-bottom: 8px;">PRICING BREAKDOWN</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px;"><strong>Base Price:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.basePrice || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Distance Price:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.distancePrice || 0).toFixed(2)}</td>
        </tr>
        ${parseFloat(jobDetails.weightSurcharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Weight Surcharge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.weightSurcharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.multiDropCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Multi-Drop Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.multiDropCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.returnTripCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Return Trip Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.returnTripCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.centralLondonCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Central London Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.centralLondonCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
        ${parseFloat(jobDetails.waitingTimeCharge || 0) > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Waiting Time Charge:</strong></td>
          <td style="padding: 8px 0; color: #333;">£${parseFloat(jobDetails.waitingTimeCharge).toFixed(2)}</td>
        </tr>
        ` : ''}
      </table>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; text-align: right;">
        <span style="color: #666; font-size: 16px;">Total: </span>
        <span style="color: #007BFF; font-size: 24px; font-weight: bold;">£${parseFloat(jobDetails.totalPrice || 0).toFixed(2)}</span>
      </div>

      <!-- Payment & Status -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <tr>
          <td style="padding: 15px; color: #666; width: 50%;"><strong>Payment Status:</strong></td>
          <td style="padding: 15px; color: #333; text-align: right;">
            <span style="background-color: ${jobDetails.paymentStatus === 'paid' ? '#28a745' : jobDetails.paymentStatus === 'pay_later' ? '#ffc107' : '#dc3545'}; color: ${jobDetails.paymentStatus === 'pay_later' ? '#333' : 'white'}; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
              ${(jobDetails.paymentStatus || 'pending').toUpperCase().replace('_', ' ')}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding: 15px; color: #666;"><strong>Job Status:</strong></td>
          <td style="padding: 15px; color: #333; text-align: right;">
            <span style="background-color: #6c757d; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
              ${(jobDetails.status || 'pending').toUpperCase()}
            </span>
          </td>
        </tr>
        ${jobDetails.customerEmail ? `
        <tr>
          <td style="padding: 15px; color: #666;"><strong>Customer Email:</strong></td>
          <td style="padding: 15px; color: #333; text-align: right;">
            <a href="mailto:${jobDetails.customerEmail}" style="color: #007BFF;">${jobDetails.customerEmail}</a>
          </td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p style="color: #666; font-size: 14px; margin-top: 20px; text-align: center;">
      Please log in to the <a href="https://www.runcourier.co.uk/admin" style="color: #007BFF;">admin dashboard</a> to manage this booking.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'New Booking');
  
  const textContent = `NEW BOOKING RECEIVED

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
Weight: ${jobDetails.weight || '0'} kg
Distance: ${jobDetails.distance || '0'} miles
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
Run Courier - www.runcourier.co.uk`;

  return sendEmailNotification('sales@runcourier.co.uk', `New Booking - ${jobDetails.trackingNumber}`, htmlContent, textContent);
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
    <p style="color: #666; font-size: 16px;">Your delivery has been confirmed and is being processed. Here are your booking details:</p>
    
    <!-- Tracking Number Banner -->
    <div style="background-color: #007BFF; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px;">Your Tracking Number</p>
      <p style="margin: 10px 0 5px; font-size: 28px; font-weight: bold; letter-spacing: 3px;">${jobDetails.trackingNumber || 'N/A'}</p>
      <p style="margin: 0; font-size: 12px; opacity: 0.9;">Use this to track your delivery at runcourier.co.uk</p>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; border: 1px solid #eee;">
      
      <!-- Pickup Details -->
      <h3 style="color: #007BFF; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #007BFF; padding-bottom: 8px;">COLLECTION DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.pickupBuildingName ? `${jobDetails.pickupBuildingName}<br>` : ''}
            ${jobDetails.pickupAddress || 'N/A'}<br>
            <strong>${jobDetails.pickupPostcode || 'N/A'}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Contact:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.pickupContactName || 'N/A'}<br>
            <a href="tel:${jobDetails.pickupContactPhone}" style="color: #007BFF;">${jobDetails.pickupContactPhone || 'N/A'}</a>
          </td>
        </tr>
        ${jobDetails.pickupInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.pickupInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledPickup ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Scheduled:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${scheduledPickup}</td>
        </tr>
        ` : ''}
      </table>

      <!-- Delivery Details -->
      <h3 style="color: #28a745; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #28a745; padding-bottom: 8px;">DELIVERY DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.deliveryBuildingName ? `${jobDetails.deliveryBuildingName}<br>` : ''}
            ${jobDetails.deliveryAddress || 'N/A'}<br>
            <strong>${jobDetails.deliveryPostcode || 'N/A'}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Recipient:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${jobDetails.recipientName || 'N/A'}<br>
            <a href="tel:${jobDetails.recipientPhone}" style="color: #007BFF;">${jobDetails.recipientPhone || 'N/A'}</a>
          </td>
        </tr>
        ${jobDetails.deliveryInstructions ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Instructions:</strong></td>
          <td style="padding: 8px 0; color: #333; font-style: italic;">${jobDetails.deliveryInstructions}</td>
        </tr>
        ` : ''}
        ${scheduledDelivery ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Scheduled:</strong></td>
          <td style="padding: 8px 0; color: #333; font-weight: bold;">${scheduledDelivery}</td>
        </tr>
        ` : ''}
      </table>

      <!-- Service Details -->
      <h3 style="color: #6c757d; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #6c757d; padding-bottom: 8px;">SERVICE DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 130px;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.weight || '0'} kg</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${jobDetails.distance || '0'} miles</td>
        </tr>
        ${jobDetails.isMultiDrop ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Service:</strong></td>
          <td style="padding: 8px 0; color: #333;">Multi-Drop Delivery</td>
        </tr>
        ` : ''}
        ${jobDetails.isReturnTrip ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Return Trip:</strong></td>
          <td style="padding: 8px 0; color: #333;">Yes - Driver will return to pickup location</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Booked:</strong></td>
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
      <p style="color: #666; margin: 0 0 10px; font-size: 14px;"><strong>Need Help?</strong></p>
      <p style="color: #333; margin: 0; font-size: 14px;">
        Call us: <a href="tel:+447311121217" style="color: #007BFF; font-weight: bold;">+44 7311 121 217</a><br>
        Email: <a href="mailto:info@runcourier.co.uk" style="color: #007BFF;">info@runcourier.co.uk</a>
      </p>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Booking Confirmed');
  
  const textContent = `BOOKING CONFIRMATION

Thank you for booking with Run Courier!

Your Tracking Number: ${jobDetails.trackingNumber || 'N/A'}

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
Weight: ${jobDetails.weight || '0'} kg
Distance: ${jobDetails.distance || '0'} miles
${jobDetails.isMultiDrop ? 'Multi-Drop: Yes\n' : ''}${jobDetails.isReturnTrip ? 'Return Trip: Yes\n' : ''}

TOTAL AMOUNT: £${parseFloat(jobDetails.totalPrice || 0).toFixed(2)}
Payment Status: ${jobDetails.paymentStatus === 'paid' ? 'CONFIRMED' : jobDetails.paymentStatus === 'pay_later' ? 'PAY LATER' : 'PENDING'}

Track your delivery: ${BASE_URL}/track?ref=${jobDetails.trackingNumber}

Need help? Call +44 7311 121 217 or email info@runcourier.co.uk

Run Courier - Same Day Delivery Across the UK
www.runcourier.co.uk`;

  return sendEmailNotification(customerEmail, `Booking Confirmed - ${jobDetails.trackingNumber}`, htmlContent, textContent);
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
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 120px;"><strong>Applicant:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${applicantName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Status:</strong></td>
          <td style="padding: 10px 0; color: #333;">${status}</td>
        </tr>
      </table>
    </div>
    <p style="color: #666; font-size: 14px; margin-top: 20px;">Please log in to the admin dashboard to review pending driver applications.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Driver Application');
  const textContent = `Driver Application Update\n\nApplicant: ${applicantName}\nStatus: ${status}\n\nPlease log in to the admin dashboard to review.`;

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
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 140px;"><strong>Driver:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${driverName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Document Type:</strong></td>
          <td style="padding: 10px 0; color: #333;">${documentType}</td>
        </tr>
      </table>
    </div>
    <p style="color: #666; font-size: 14px; margin-top: 20px;">Please log in to the admin dashboard to review and approve the document.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Document Upload');
  const textContent = `New Document Upload\n\nDriver: ${driverName}\nDocument Type: ${documentType}\n\nPlease log in to the admin dashboard to review and approve.`;

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
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 140px;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Amount Due:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">£${amount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Due Date:</strong></td>
          <td style="padding: 10px 0; color: #333;">${dueDate}</td>
        </tr>
      </table>
    </div>
    <p style="color: #666; font-size: 14px; margin-top: 20px;">Please log in to the customer portal to view the full invoice.</p>
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
    <p style="color: #666; font-size: 16px;">Dear ${customerName},</p>
    <p style="color: #666; font-size: 16px;">Please find below details of your invoice:</p>
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 140px;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Amount Due:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold; font-size: 18px;">£${amount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Period:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${periodStart} - ${periodEnd}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Due Date:</strong></td>
          <td style="padding: 10px 0; color: #d9534f; font-weight: bold;">${dueDate}</td>
        </tr>
      </table>
    </div>
    ${notes ? `
    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="color: #666; margin: 0;"><strong>Notes:</strong></p>
      <p style="color: #666; margin: 10px 0 0 0; white-space: pre-wrap;">${notes}</p>
    </div>
    ` : ''}
    <div style="background-color: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">Payment Methods</h3>
      
      <p style="color: #333; margin-bottom: 10px; font-weight: bold;">Option 1: Bank Transfer</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Account Name:</strong></td>
          <td style="padding: 5px 0; color: #333;">RUN COURIER</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Sort Code:</strong></td>
          <td style="padding: 5px 0; color: #333;">30-99-50</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Account Number:</strong></td>
          <td style="padding: 5px 0; color: #333;">36113363</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Reference:</strong></td>
          <td style="padding: 5px 0; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
      </table>
      
      <p style="color: #333; margin-bottom: 10px; font-weight: bold;">Option 2: Pay by Card (Stripe)</p>
      <p style="color: #666; margin: 0;">Pay securely online via Stripe at <a href="https://runcourier.co.uk/pay" style="color: #0066cc; text-decoration: underline;">runcourier.co.uk/pay</a></p>
    </div>
    <p style="color: #666; font-size: 14px;">If you have any questions about this invoice, please contact us at info@runcourier.co.uk</p>
    <p style="color: #666; font-size: 14px;">Thank you for choosing Run Courier.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Invoice');
  const textContent = `Invoice from Run Courier\n\nDear ${customerName},\n\nPlease find below details of your invoice:\n\nInvoice Number: ${invoiceNumber}\nAmount Due: £${amount}\nPeriod: ${periodStart} - ${periodEnd}\nDue Date: ${dueDate}\n\n${notes ? `Notes: ${notes}\n\n` : ''}PAYMENT METHODS\n\nOption 1: Bank Transfer\nAccount Name: RUN COURIER\nSort Code: 30-99-50\nAccount Number: 36113363\nReference: ${invoiceNumber}\n\nOption 2: Pay by Card (Stripe)\nPay securely online at: https://runcourier.co.uk/pay\n\nIf you have any questions, please contact us at info@runcourier.co.uk\n\nThank you for choosing Run Courier.`;

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
            <p style="margin: 0 0 8px 0; color: #495057; font-weight: bold; font-size: 11px;">MULTI-DROP STOPS (${stops.length} stops):</p>
            ${stops.map((stop, i) => `
              <div style="margin: 5px 0; padding: 5px 0; ${i < stops.length - 1 ? 'border-bottom: 1px dashed #cde1f7;' : ''}">
                <span style="display: inline-block; background-color: #007BFF; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; margin-right: 8px;">Stop ${stop.stopOrder}</span>
                <span style="color: #333; font-size: 11px;">${stop.address || stop.postcode}</span>
                ${stop.recipientName ? `<span style="color: #666; font-size: 10px; margin-left: 10px;">(${stop.recipientName})</span>` : ''}
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
            <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057;">Pickup</th>
            <th style="padding: 10px 8px; text-align: left; border-bottom: 2px solid #dee2e6; color: #495057;">Delivery</th>
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
                ${job.isMultiDrop ? '<span style="background-color: #17a2b8; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; margin-left: 5px;">MULTI-DROP</span>' : ''}
              </td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #666; max-width: 150px;">${job.pickupAddress.substring(0, 40)}${job.pickupAddress.length > 40 ? '...' : ''}</td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #666; max-width: 150px;">
                ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 
                  ? `See ${job.multiDropStops.length} stops below` 
                  : (job.deliveryAddress ? (job.deliveryAddress.substring(0, 40) + (job.deliveryAddress.length > 40 ? '...' : '')) : (job.recipientName || 'N/A'))}
              </td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #666;">${job.scheduledDate}</td>
              <td style="padding: 10px 8px; border-bottom: ${job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0 ? 'none' : '1px solid #dee2e6'}; color: #666;">${formatVehicleType(job.vehicleType)}</td>
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
      <p style="margin: 0; color: #666;">${customerName}</p>
      ${companyName ? `<p style="margin: 5px 0 0 0; color: #666;">${companyName}</p>` : ''}
      ${businessAddress ? `<p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">${businessAddress}</p>` : ''}
    </div>
  ` : '';

  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #007BFF; margin: 0; font-size: 32px;">INVOICE</h1>
      <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">RUN COURIER</p>
    </div>
    
    ${customerInfoHtml}
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e1e5eb;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Invoice Date:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Period:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${periodStart} - ${periodEnd}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Due Date:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">${dueDate}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Amount Due:</strong></td>
          <td style="padding: 10px 0; color: #007BFF; font-size: 24px; font-weight: bold;">£${typeof amount === 'number' ? amount.toFixed(2) : amount}</td>
        </tr>
      </table>
    </div>
    
    ${jobsTableHtml}
    
    ${notes ? `<div style="background-color: #fff3cd; border-radius: 8px; padding: 15px; margin-bottom: 20px; border-left: 4px solid #ffc107;"><p style="color: #856404; margin: 0;"><strong>Notes:</strong> ${notes}</p></div>` : ''}
    
    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="color: #2e7d32; font-size: 18px; font-weight: bold; margin-top: 0;">Pay Now with Card</p>
      <p style="color: #666; margin-bottom: 15px;">Click the button below to pay securely with your card via Stripe:</p>
      <a href="${paymentUrl}" style="background-color: #007BFF; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 18px; font-weight: bold; display: inline-block;">
        Pay £${typeof amount === 'number' ? amount.toFixed(2) : amount} Now
      </a>
      <p style="color: #888; font-size: 12px; margin-top: 15px; margin-bottom: 0;">Apple Pay, Google Pay & all major cards accepted</p>
    </div>
    
    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #333; margin-bottom: 10px; font-weight: bold;">Or Pay by Bank Transfer</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Account Name:</strong></td>
          <td style="padding: 5px 0; color: #333;">RUN COURIER</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Sort Code:</strong></td>
          <td style="padding: 5px 0; color: #333;">30-99-50</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Account Number:</strong></td>
          <td style="padding: 5px 0; color: #333;">36113363</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;"><strong>Reference:</strong></td>
          <td style="padding: 5px 0; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
      </table>
    </div>
    
    <p style="color: #666; font-size: 14px;">If you have any questions about this invoice, please contact us at info@runcourier.co.uk</p>
    <p style="color: #666; font-size: 14px;">Thank you for choosing Run Courier.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Invoice');
  
  const jobsTextList = jobDetails && jobDetails.length > 0 ? 
    `\nDELIVERY DETAILS:\n${jobDetails.map(job => 
      `- ${job.trackingNumber}: ${job.pickupAddress.substring(0, 30)}... to ${job.deliveryAddress ? job.deliveryAddress.substring(0, 30) + '...' : job.recipientName || 'N/A'} (${job.scheduledDate}) - £${job.price.toFixed(2)}`
    ).join('\n')}\n` : '';
  
  const textContent = `INVOICE from Run Courier\n\n${companyName ? `Bill To: ${customerName}\n${companyName}\n${businessAddress || ''}\n\n` : `Dear ${customerName},\n\n`}Please find below details of your invoice:\n\nInvoice Number: ${invoiceNumber}\nInvoice Date: ${new Date().toLocaleDateString('en-GB')}\nAmount Due: £${typeof amount === 'number' ? amount.toFixed(2) : amount}\nPeriod: ${periodStart} - ${periodEnd}\nDue Date: ${dueDate}\n${jobsTextList}\n${notes ? `Notes: ${notes}\n\n` : ''}PAY NOW WITH CARD\nClick this link to pay securely via Stripe:\n${paymentUrl}\n\nOR PAY BY BANK TRANSFER\nAccount Name: RUN COURIER\nSort Code: 30-99-50\nAccount Number: 36113363\nReference: ${invoiceNumber}\n\nIf you have any questions, please contact us at info@runcourier.co.uk\n\nThank you for choosing Run Courier.`;

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
    <p style="color: #666; font-size: 16px;">Dear ${customerName},</p>
    <p style="color: #666; font-size: 16px;">We have received your payment. Thank you for your business!</p>
    
    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="width: 60px; height: 60px; background-color: #4caf50; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 30px;">&#10003;</span>
      </div>
      <p style="color: #2e7d32; font-size: 18px; font-weight: bold; margin: 0;">Payment Successful</p>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e1e5eb;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Invoice Number:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Amount Paid:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333; font-size: 20px; font-weight: bold;">£${typeof amount === 'number' ? amount.toFixed(2) : amount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Payment Reference:</strong></td>
          <td style="padding: 10px 0; color: #333; font-family: monospace;">${paymentReference}</td>
        </tr>
      </table>
    </div>
    
    <p style="color: #666; font-size: 14px;">This email serves as your payment receipt. Please keep it for your records.</p>
    <p style="color: #666; font-size: 14px;">If you have any questions, please contact us at info@runcourier.co.uk</p>
    <p style="color: #666; font-size: 14px;">Thank you for choosing Run Courier.</p>
  `;

  const htmlContent = wrapEmailContent(content, 'Payment Confirmation');
  const textContent = `Payment Received - Thank You!\n\nDear ${customerName},\n\nWe have received your payment. Thank you for your business!\n\nPayment Details:\nInvoice Number: ${invoiceNumber}\nAmount Paid: £${typeof amount === 'number' ? amount.toFixed(2) : amount}\nPayment Reference: ${paymentReference}\n\nThis email serves as your payment receipt. Please keep it for your records.\n\nIf you have any questions, please contact us at info@runcourier.co.uk\n\nThank you for choosing Run Courier.`;

  return sendEmailNotification(customerEmail, `Payment Received - Invoice ${invoiceNumber} - Run Courier`, htmlContent, textContent);
}

export async function sendEmailVerification(
  email: string,
  verificationLink: string,
  fullName: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333;">Welcome to Run Courier!</h2>
    <p style="color: #666; font-size: 16px;">
      Hi ${fullName},
    </p>
    <p style="color: #666; font-size: 16px;">
      Thank you for registering. Please verify your email address by clicking the button below:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationLink}" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Verify Email Address
      </a>
    </div>
    <p style="color: #666; font-size: 14px;">
      If you didn't create an account, you can safely ignore this email.
    </p>
    <p style="color: #666; font-size: 14px;">
      This link will expire in 24 hours.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Verify Your Email');
  const textContent = `Welcome to Run Courier!\n\nHi ${fullName},\n\nThank you for registering. Please verify your email address by clicking this link:\n\n${verificationLink}\n\nIf you didn't create an account, you can safely ignore this email.\n\nThis link will expire in 24 hours.\n\nRun Courier - www.runcourier.co.uk`;

  return sendEmailNotification(email, 'Verify Your Email - Run Courier', htmlContent, textContent);
}

export async function sendPasswordResetEmail(
  email: string,
  resetLink: string
): Promise<boolean> {
  const content = `
    <h2 style="color: #333;">Reset Your Password</h2>
    <p style="color: #666; font-size: 16px;">
      You requested to reset your password. Click the button below to create a new password:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Reset Password
      </a>
    </div>
    <p style="color: #666; font-size: 14px;">
      If you didn't request this, you can safely ignore this email.
    </p>
    <p style="color: #666; font-size: 14px;">
      This link will expire in 1 hour.
    </p>
  `;

  const htmlContent = wrapEmailContent(content, 'Password Reset');
  const textContent = `Reset Your Password\n\nYou requested to reset your password. Click this link to create a new password:\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n\nThis link will expire in 1 hour.\n\nRun Courier - www.runcourier.co.uk`;

  return sendEmailNotification(email, 'Reset Your Password - Run Courier', htmlContent, textContent);
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
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; width: 120px;"><strong>Name:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Email:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><a href="mailto:${email}" style="color: #007BFF;">${email}</a></td>
        </tr>
        ${phone ? `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;"><strong>Phone:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><a href="tel:${phone}" style="color: #007BFF;">${phone}</a></td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 10px 0; color: #666;"><strong>Subject:</strong></td>
          <td style="padding: 10px 0; color: #333;">${subject}</td>
        </tr>
      </table>
    </div>
    <div style="background-color: white; border-radius: 8px; padding: 20px;">
      <h3 style="color: #333; margin-top: 0;">Message:</h3>
      <p style="color: #666; line-height: 1.6; margin: 0;">${message.replace(/\n/g, '<br>')}</p>
    </div>
    <div style="text-align: center; margin-top: 20px;">
      <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject)}" style="background-color: #007BFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reply to ${name}</a>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Contact Form');
  const textContent = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n${phone ? `Phone: ${phone}\n` : ''}Subject: ${subject}\n\nMessage:\n${message}`;

  return sendEmailNotification('support@runcourier.co.uk', `Contact Form: ${subject}`, htmlContent, textContent);
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
    <p style="color: #666; font-size: 16px;">
      Dear ${data.customerName || 'Customer'},
    </p>
    <p style="color: #666; font-size: 16px;">
      Your delivery booking has been created and is awaiting payment. Please complete the payment to confirm your booking.
    </p>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #007BFF; padding-bottom: 10px;">Booking Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px;"><strong>Tracking #:</strong></td>
          <td style="padding: 8px 0; color: #333; font-family: monospace; font-weight: bold;">${data.trackingNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.weight} kg</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.distance} miles</td>
        </tr>
      </table>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #007BFF; padding-bottom: 10px;">Route${data.isMultiDrop ? ' (Multi-Drop)' : ''}${data.isReturnTrip ? ' + Return' : ''}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px; vertical-align: top;"><strong>Pickup:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.pickupAddress}<br><span style="font-family: monospace; color: #007BFF;">${data.pickupPostcode}</span></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Drop 1:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.deliveryAddress}<br><span style="font-family: monospace; color: #007BFF;">${data.deliveryPostcode}</span></td>
        </tr>
        ${data.isMultiDrop && data.multiDropStops && data.multiDropStops.length > 0 ? data.multiDropStops.map((stop, index) => `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Drop ${index + 2}:</strong></td>
          <td style="padding: 8px 0; color: #333;">${stop.address}${stop.recipientName ? ` (${stop.recipientName})` : ''}<br><span style="font-family: monospace; color: #007BFF;">${stop.postcode}</span></td>
        </tr>
        `).join('') : ''}
        ${data.isReturnTrip ? `
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Return:</strong></td>
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
    
    <p style="color: #666; font-size: 14px; margin-top: 30px;">
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
- Weight: ${data.weight} kg
- Distance: ${data.distance} miles

Route${data.isMultiDrop ? ' (Multi-Drop)' : ''}${data.isReturnTrip ? ' + Return' : ''}:
- Pickup: ${data.pickupAddress} (${data.pickupPostcode})
- Drop 1: ${data.deliveryAddress} (${data.deliveryPostcode})
${multiDropStopsText}${returnTripText}

Amount Due: ${data.amount}

Pay now: ${data.paymentLink}

This payment link expires on ${data.expiresAt}.

Run Courier - www.runcourier.co.uk`;

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
    <p style="color: #666; font-size: 16px;">
      Dear ${data.customerName || 'Customer'},
    </p>
    <p style="color: #666; font-size: 16px;">
      Thank you for your payment. Your delivery booking is now confirmed and a driver will be assigned shortly.
    </p>
    
    <div style="background-color: #d4edda; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="color: #155724; font-size: 18px; margin: 0;">Payment Received: <strong>${data.amount}</strong></p>
    </div>
    
    <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">Booking Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px;"><strong>Tracking #:</strong></td>
          <td style="padding: 8px 0; color: #333; font-family: monospace; font-weight: bold;">${data.trackingNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Pickup:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.pickupAddress}<br><span style="font-family: monospace;">${data.pickupPostcode}</span></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Delivery:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.deliveryAddress}<br><span style="font-family: monospace;">${data.deliveryPostcode}</span></td>
        </tr>
      </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${BASE_URL}/track/${data.trackingNumber}" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Track Your Delivery
      </a>
    </div>
    
    ${data.stripeReceiptUrl ? `
    <p style="color: #666; font-size: 14px; text-align: center;">
      <a href="${data.stripeReceiptUrl}" style="color: #007BFF;">View Payment Receipt</a>
    </p>
    ` : ''}
    
    <p style="color: #666; font-size: 14px;">
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

Track your delivery: ${BASE_URL}/track/${data.trackingNumber}

Run Courier - www.runcourier.co.uk`;

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
    <p style="color: #666; font-size: 16px;">
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
      <p style="color: #666; font-size: 14px; word-break: break-all;">
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

Run Courier - www.runcourier.co.uk`;

  return sendEmailNotification('info@runcourier.co.uk', `Payment Link Email Failed - ${data.trackingNumber}`, htmlContent, textContent);
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
  }
): Promise<boolean> {
  const vehicleNames: Record<string, string> = {
    motorbike: 'Motorbike',
    car: 'Car',
    small_van: 'Small Van',
    medium_van: 'Medium Van',
  };

  // Show both postcode and full address in the email
  const legsHtml = data.quote.legs.map((leg, i) => {
    const fromPostcode = i === 0 ? data.pickupPostcode : data.drops[i - 1]?.postcode || '';
    const fromAddress = i === 0 ? data.pickupAddress : data.drops[i - 1]?.address || leg.from;
    const toPostcode = data.drops[i]?.postcode || '';
    const toAddress = data.drops[i]?.address || leg.to;
    return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666; vertical-align: top;">${i + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; vertical-align: top;">
        <div style="color: #333; font-weight: 600;">${fromPostcode}</div>
        <div style="color: #666; font-size: 12px; margin-top: 4px;">${fromAddress}</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; vertical-align: top;">
        <div style="color: #333; font-weight: 600;">${toPostcode}</div>
        <div style="color: #666; font-size: 12px; margin-top: 4px;">${toAddress}</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; color: #333; text-align: right; vertical-align: top;">${leg.distance.toFixed(1)} miles</td>
    </tr>
  `;
  }).join('');

  const content = `
    <h2 style="color: #333; margin-top: 0;">Your Business Delivery Quote</h2>
    ${data.customerName ? `<p style="color: #666; font-size: 16px;">Dear ${data.customerName},</p>` : ''}
    <p style="color: #666; font-size: 16px;">
      Thank you for your enquiry. Here is your personalised multi-drop delivery quote:
    </p>
    
    ${data.companyName ? `<p style="color: #666; font-size: 14px;"><strong>Company:</strong> ${data.companyName}</p>` : ''}
    
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
            <th style="padding: 10px; text-align: left; color: #666; font-size: 12px;">STOP</th>
            <th style="padding: 10px; text-align: left; color: #666; font-size: 12px;">FROM</th>
            <th style="padding: 10px; text-align: left; color: #666; font-size: 12px;">TO</th>
            <th style="padding: 10px; text-align: right; color: #666; font-size: 12px;">DISTANCE</th>
          </tr>
        </thead>
        <tbody>
          ${legsHtml}
        </tbody>
      </table>
      
      <div style="background-color: #f8f9fa; padding: 15px; margin-top: 15px; border-radius: 5px;">
        <table style="width: 100%;">
          <tr>
            <td style="color: #666;">Total Distance:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${data.quote.totalDistance.toFixed(1)} miles</td>
          </tr>
          <tr>
            <td style="color: #666;">Estimated Duration:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${data.quote.totalDuration} mins</td>
          </tr>
          <tr>
            <td style="color: #666;">Vehicle Type:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${vehicleNames[data.vehicleType] || data.vehicleType}</td>
          </tr>
          <tr>
            <td style="color: #666;">Number of Drops:</td>
            <td style="text-align: right; font-weight: bold; color: #333;">${data.drops.length}</td>
          </tr>
        </table>
      </div>
    </div>
    
    <div style="background-color: #007BFF; color: white; border-radius: 8px; padding: 25px; margin: 20px 0; text-align: center;">
      <p style="font-size: 14px; margin: 0 0 10px 0; opacity: 0.9;">TOTAL QUOTE</p>
      <p style="font-size: 36px; font-weight: bold; margin: 0;">&pound;${data.quote.breakdown.totalPrice.toFixed(2)}</p>
    </div>
    
    ${data.notes ? `
    <div style="background-color: #fff3cd; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h4 style="color: #856404; margin: 0 0 10px 0;">Additional Notes</h4>
      <p style="color: #856404; margin: 0; white-space: pre-line;">${data.notes}</p>
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 30px 0;">
      <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
        Ready to book? Contact us to confirm your delivery:
      </p>
      <a href="tel:+442046346100" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block; margin: 5px;">
        Call Now
      </a>
      <a href="mailto:info@runcourier.co.uk?subject=Business%20Quote%20-%20${data.companyName || 'Enquiry'}" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block; margin: 5px;">
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

TOTAL QUOTE: £${data.quote.breakdown.totalPrice.toFixed(2)}

${data.notes ? `NOTES: ${data.notes}` : ''}

Ready to book? Contact us to confirm your delivery:
- Phone: +44 20 4634 6100
- Email: info@runcourier.co.uk

This quote is valid for 7 days. Prices may vary based on actual pickup time and conditions.

Run Courier - www.runcourier.co.uk`;

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
  const content = `
    <h2 style="color: #dc3545; margin-top: 0;">Booking Cancelled</h2>
    <p style="color: #666; font-size: 16px;">
      Dear ${data.customerName || 'Valued Customer'},
    </p>
    <p style="color: #666; font-size: 16px;">
      We regret to inform you that your delivery booking has been cancelled.
    </p>
    
    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333; margin-top: 0;">Booking Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 140px;"><strong>Tracking #:</strong></td>
          <td style="padding: 8px 0; color: #333; font-family: monospace; font-weight: bold;">${data.trackingNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Pickup:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.pickupPostcode}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Delivery:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.deliveryPostcode}</td>
        </tr>
        ${data.totalPrice ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Amount:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.totalPrice}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    ${data.cancellationReason ? `
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #856404; margin-top: 0;">Reason for Cancellation</h3>
      <p style="color: #856404; font-size: 14px; margin: 0;">
        ${data.cancellationReason}
      </p>
    </div>
    ` : ''}
    
    <p style="color: #666; font-size: 14px;">
      If you have already made a payment for this booking, a refund will be processed within 5-7 business days.
    </p>
    
    <p style="color: #666; font-size: 14px;">
      If you have any questions or would like to rebook, please don't hesitate to contact us.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${BASE_URL}/book" style="background-color: #007BFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Book Another Delivery
      </a>
    </div>
    
    <div style="text-align: center; margin: 20px 0;">
      <a href="tel:+442046346100" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 14px; display: inline-block;">
        Call Us: +44 20 4634 6100
      </a>
    </div>
  `;

  const htmlContent = wrapEmailContent(content, 'Booking Cancelled');
  const textContent = `Booking Cancelled

Dear ${data.customerName || 'Valued Customer'},

We regret to inform you that your delivery booking has been cancelled.

Booking Details:
- Tracking #: ${data.trackingNumber}
- Pickup: ${data.pickupPostcode}
- Delivery: ${data.deliveryPostcode}
${data.totalPrice ? `- Amount: ${data.totalPrice}` : ''}

${data.cancellationReason ? `Reason for Cancellation:
${data.cancellationReason}` : ''}

If you have already made a payment for this booking, a refund will be processed within 5-7 business days.

If you have any questions or would like to rebook, please contact us at +44 20 4634 6100.

Run Courier - www.runcourier.co.uk`;

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
    <p style="color: #666; font-size: 16px;">We're sorry to inform you that we were unable to complete your delivery. Our driver attempted delivery but was unsuccessful.</p>
    
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
          <td style="padding: 8px 0; color: #666; width: 130px;"><strong>Attempted:</strong></td>
          <td style="padding: 8px 0; color: #333;">${attemptedTime}</td>
        </tr>
        ${data.driverName ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Driver:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.driverName}</td>
        </tr>
        ` : ''}
      </table>

      <!-- Collection Details -->
      <h3 style="color: #007BFF; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #007BFF; padding-bottom: 8px;">COLLECTION DETAILS</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
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
          <td style="padding: 8px 0; color: #666; width: 130px; vertical-align: top;"><strong>Address:</strong></td>
          <td style="padding: 8px 0; color: #333;">
            ${data.deliveryBuildingName ? `${data.deliveryBuildingName}<br>` : ''}
            ${data.deliveryAddress || 'N/A'}<br>
            <strong>${data.deliveryPostcode || 'N/A'}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Recipient:</strong></td>
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
          <td style="padding: 8px 0; color: #666; width: 130px;"><strong>Vehicle:</strong></td>
          <td style="padding: 8px 0; color: #333;">${vehicleDisplay}</td>
        </tr>
        ${data.weight ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Weight:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.weight} kg</td>
        </tr>
        ` : ''}
        ${data.distance ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Distance:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.distance} miles</td>
        </tr>
        ` : ''}
        ${data.totalPrice ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Amount:</strong></td>
          <td style="padding: 8px 0; color: #333;">${data.totalPrice}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p style="color: #666; font-size: 14px; margin: 20px 0;">
      Our team will be in touch shortly to arrange a redelivery or discuss alternative options. If you'd like to speak with us immediately, please contact our customer service team.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="tel:+442046346100" style="background-color: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
        Call Us: +44 20 4634 6100
      </a>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
      <p style="color: #666; margin: 0 0 10px; font-size: 14px;"><strong>Need Help?</strong></p>
      <p style="color: #333; margin: 0; font-size: 14px;">
        Call us: <a href="tel:+447311121217" style="color: #007BFF; font-weight: bold;">+44 7311 121 217</a><br>
        Email: <a href="mailto:info@runcourier.co.uk" style="color: #007BFF;">info@runcourier.co.uk</a>
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

Run Courier - www.runcourier.co.uk`;

  return sendEmailNotification(customerEmail, `Delivery Failed - ${data.trackingNumber}`, htmlContent, textContent);
}
