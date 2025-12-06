import { Resend } from 'resend';

let connectionSettings: any;

async function getResendCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.warn('X_REPLIT_TOKEN not found - email notifications disabled');
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
      console.warn('Resend connection not found - email notifications disabled');
      return null;
    }
    
    return {
      apiKey: connectionSettings.settings.api_key,
      fromEmail: connectionSettings.settings.from_email || 'noreply@runcourier.co.uk'
    };
  } catch (error) {
    console.error('Failed to fetch Resend credentials:', error);
    return null;
  }
}

export async function sendEmailNotification(
  recipient: string,
  subject: string,
  htmlContent: string,
  textContent?: string
): Promise<boolean> {
  try {
    const credentials = await getResendCredentials();
    if (!credentials) {
      console.warn('Resend not configured - email notification not sent');
      return false;
    }

    const resend = new Resend(credentials.apiKey);
    const result = await resend.emails.send({
      from: credentials.fromEmail,
      to: recipient,
      subject,
      html: htmlContent,
      text: textContent
    });

    if (result.error) {
      console.error('Failed to send email:', result.error);
      return false;
    }

    console.log('Email notification sent:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Error sending email notification:', error);
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
