import { Resend } from 'resend';

let connectionSettings: any;

async function getResendCredentials() {
  // First try environment variable (manual setup)
  if (process.env.RESEND_API_KEY) {
    console.log('[Email] Using RESEND_API_KEY from environment');
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL || 'info@runcourier.co.uk'
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
      fromEmail: connectionSettings.settings.from_email || 'info@runcourier.co.uk'
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

export async function sendNewJobNotification(jobId: string, jobDetails: any): Promise<boolean> {
  const htmlContent = `
    <h2>New Booking</h2>
    <p><strong>Job ID:</strong> ${jobId}</p>
    <p><strong>Tracking Number:</strong> ${jobDetails.trackingNumber || 'N/A'}</p>
    <p><strong>Pickup Location:</strong> ${jobDetails.pickupPostcode || 'N/A'}</p>
    <p><strong>Delivery Location:</strong> ${jobDetails.deliveryPostcode || 'N/A'}</p>
    <p><strong>Vehicle Type:</strong> ${jobDetails.vehicleType || 'N/A'}</p>
    <p><strong>Price:</strong> £${jobDetails.totalPrice || '0.00'}</p>
    <p><strong>Status:</strong> ${jobDetails.status || 'Pending'}</p>
    <p>Please log in to the sales dashboard to review and manage this booking.</p>
  `;

  const textContent = `New Booking\n\nJob ID: ${jobId}\nTracking Number: ${jobDetails.trackingNumber || 'N/A'}\nPickup: ${jobDetails.pickupPostcode || 'N/A'}\nDelivery: ${jobDetails.deliveryPostcode || 'N/A'}\nVehicle: ${jobDetails.vehicleType || 'N/A'}\nPrice: £${jobDetails.totalPrice || '0.00'}\n\nPlease log in to the sales dashboard to review.`;

  return sendEmailNotification('sales@runcourier.co.uk', 'New Booking', htmlContent, textContent);
}

export async function sendDriverApplicationNotification(
  applicantName: string,
  status: string
): Promise<boolean> {
  const htmlContent = `
    <h2>Driver Application Update</h2>
    <p><strong>Applicant:</strong> ${applicantName}</p>
    <p><strong>Status:</strong> ${status}</p>
    <p>Please log in to the admin dashboard to review pending driver applications.</p>
  `;

  const textContent = `Driver Application Update\n\nApplicant: ${applicantName}\nStatus: ${status}\n\nPlease log in to the admin dashboard to review.`;

  return sendAdminNotification('Driver Application Update', htmlContent, textContent);
}

export async function sendDocumentUploadNotification(
  driverName: string,
  documentType: string
): Promise<boolean> {
  const htmlContent = `
    <h2>New Document Upload</h2>
    <p><strong>Driver:</strong> ${driverName}</p>
    <p><strong>Document Type:</strong> ${documentType}</p>
    <p>Please log in to the admin dashboard to review and approve the document.</p>
  `;

  const textContent = `New Document Upload\n\nDriver: ${driverName}\nDocument Type: ${documentType}\n\nPlease log in to the admin dashboard to review and approve.`;

  return sendAdminNotification('New Document Upload', htmlContent, textContent);
}

export async function sendPaymentNotification(
  invoiceNumber: string,
  amount: string,
  dueDate: string
): Promise<boolean> {
  const htmlContent = `
    <h2>New Invoice Generated</h2>
    <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
    <p><strong>Amount Due:</strong> £${amount}</p>
    <p><strong>Due Date:</strong> ${dueDate}</p>
    <p>Please log in to the customer portal to view the full invoice.</p>
  `;

  const textContent = `New Invoice Generated\n\nInvoice Number: ${invoiceNumber}\nAmount Due: £${amount}\nDue Date: ${dueDate}\n\nPlease log in to view the full invoice.`;

  return sendAdminNotification('New Invoice Generated', htmlContent, textContent);
}

export async function sendPasswordResetEmail(
  email: string,
  resetLink: string
): Promise<boolean> {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #007BFF; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Run Courier</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9;">
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
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          Run Courier - Same Day Delivery Across the UK<br>
          www.runcourier.co.uk
        </p>
      </div>
    </div>
  `;

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
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #007BFF; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Run Courier</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9;">
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
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          Run Courier - Same Day Delivery Across the UK<br>
          www.runcourier.co.uk
        </p>
      </div>
    </div>
  `;

  const textContent = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n${phone ? `Phone: ${phone}\n` : ''}Subject: ${subject}\n\nMessage:\n${message}`;

  return sendEmailNotification('info@runcourier.co.uk', `Contact Form: ${subject}`, htmlContent, textContent);
}
