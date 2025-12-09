import { Resend } from 'resend';

let connectionSettings: any;

// Logo URL - use current deployment or production
const LOGO_URL = 'https://945d2f5a-7336-462a-b33f-10fb0e78a123-00-2bep7zisdjcv3.spock.replit.dev/logo-email.jpg';

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
        <a href="tel:+447311121217" style="color: #007BFF;">+44 7311 121 217</a>
      </p>
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
  return sendEmailNotification('almashriqi2010@gmail.com', subject, htmlContent, textContent);
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

  return sendEmailNotification('almashriqi2010@gmail.com', `New Booking - ${jobDetails.trackingNumber}`, htmlContent, textContent);
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

  return sendEmailNotification('almashriqi2010@gmail.com', `Contact Form: ${subject}`, htmlContent, textContent);
}
