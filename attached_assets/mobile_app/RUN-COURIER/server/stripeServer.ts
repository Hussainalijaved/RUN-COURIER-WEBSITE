import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { Resend } from 'resend';
import { getUncachableStripeClient, getStripePublishableKey } from '../lib/stripeClient';
import { updateBookingPaymentStatus, getBookingByPaymentIntent } from '../lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';

// ==================== RESEND EMAIL CLIENT ====================
// Uses Replit's Resend integration for email notifications
let resendConnectionSettings: any = null;

async function getResendCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    console.log('[EMAIL] Resend credentials not available (running locally)');
    return null;
  }

  try {
    resendConnectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    if (!resendConnectionSettings || !resendConnectionSettings.settings?.api_key) {
      console.log('[EMAIL] Resend not connected');
      return null;
    }

    return {
      apiKey: resendConnectionSettings.settings.api_key,
      fromEmail: resendConnectionSettings.settings.from_email || 'noreply@runcourier.co.uk'
    };
  } catch (error) {
    console.error('[EMAIL] Failed to get Resend credentials:', error);
    return null;
  }
}

async function getResendClient() {
  const credentials = await getResendCredentials();
  if (!credentials) return null;

  return {
    client: new Resend(credentials.apiKey),
    fromEmail: credentials.fromEmail
  };
}

const app = express();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
const PORT = parseInt(process.env.PORT || process.env.STRIPE_SERVER_PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// ==================== HEALTH CHECK ====================
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Supabase admin client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Google Maps API endpoints for distance calculation
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// Geocode a postcode to lat/lng (uses Google Maps first, falls back to postcodes.io)
app.post('/api/geocode', async (req: Request, res: Response) => {
  try {
    const { postcode } = req.body;

    if (!postcode) {
      return res.status(400).json({ error: 'Postcode is required' });
    }

    console.log('[GEOCODE] Request for postcode:', postcode);

    // Try Google Maps API first if configured
    if (GOOGLE_MAPS_API_KEY) {
      try {
        const encodedPostcode = encodeURIComponent(`${postcode}, UK`);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedPostcode}&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const location = data.results[0].geometry.location;
          console.log('[GEOCODE] Google Maps success:', postcode, '→', location);

          return res.json({
            lat: location.lat,
            lng: location.lng,
            formattedAddress: data.results[0].formatted_address,
            source: 'google'
          });
        }
        console.log('[GEOCODE] Google Maps failed, trying fallback:', data.status);
      } catch (googleError: any) {
        console.log('[GEOCODE] Google Maps error, trying fallback:', googleError.message);
      }
    }

    // Fallback to free postcodes.io API (UK postcodes only)
    try {
      const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
      const fallbackUrl = `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`;

      const fallbackResponse = await fetch(fallbackUrl);
      const fallbackData = await fallbackResponse.json();

      if (fallbackData.status === 200 && fallbackData.result) {
        console.log('[GEOCODE] Postcodes.io success:', cleanPostcode);

        return res.json({
          lat: fallbackData.result.latitude,
          lng: fallbackData.result.longitude,
          formattedAddress: `${fallbackData.result.postcode}, ${fallbackData.result.admin_district || 'UK'}`,
          source: 'postcodes.io'
        });
      }
      console.log('[GEOCODE] Postcodes.io failed:', fallbackData.error || 'Unknown error');
    } catch (fallbackError: any) {
      console.log('[GEOCODE] Postcodes.io error:', fallbackError.message);
    }

    // Both services failed
    return res.status(400).json({ error: 'Could not geocode postcode' });

  } catch (error: any) {
    console.error('[GEOCODE] Error:', error.message);
    res.status(500).json({ error: 'Failed to geocode postcode' });
  }
});

// Calculate distance between two coordinates using Google Distance Matrix API
app.post('/api/calculate-distance', async (req: Request, res: Response) => {
  try {
    const { pickup, delivery } = req.body;

    if (!pickup || !pickup.lat || !pickup.lng) {
      return res.status(400).json({ error: 'Pickup coordinates are required' });
    }

    if (!delivery || !delivery.lat || !delivery.lng) {
      return res.status(400).json({ error: 'Delivery coordinates are required' });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return res.status(500).json({ error: 'Distance service not configured' });
    }

    const origins = `${pickup.lat},${pickup.lng}`;
    const destinations = `${delivery.lat},${delivery.lng}`;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins}&destinations=${destinations}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;

    console.log('[DISTANCE] Request:', { pickup, delivery });

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.log('[DISTANCE] API error:', data.status);
      return res.status(400).json({ error: 'Distance Matrix API error', status: data.status });
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      console.log('[DISTANCE] No route found:', element?.status);
      return res.status(400).json({ error: 'No route found', status: element?.status });
    }

    const distanceMeters = element.distance.value;
    const distanceMiles = distanceMeters / 1609.344; // Convert meters to miles

    console.log('[DISTANCE] Success:', { distanceMeters, distanceMiles: distanceMiles.toFixed(2) });

    res.json({
      distanceMeters,
      distanceMiles: parseFloat(distanceMiles.toFixed(2)),
      durationSeconds: element.duration?.value || 0,
      durationText: element.duration?.text || ''
    });
  } catch (error: any) {
    console.error('[DISTANCE] Error:', error.message);
    res.status(500).json({ error: 'Failed to calculate distance' });
  }
});

// Google Places Autocomplete endpoint
app.post('/api/places/autocomplete', async (req: Request, res: Response) => {
  try {
    const { input } = req.body;

    if (!input || input.trim().length < 2) {
      return res.json({ predictions: [] });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      console.error('[PLACES] GOOGLE_MAPS_API_KEY not configured');
      return res.status(500).json({ error: 'Places API not configured' });
    }

    console.log('[PLACES AUTOCOMPLETE] Request:', input);

    const encodedInput = encodeURIComponent(input);
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodedInput}&components=country:uk&types=geocode|postal_code&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      console.log('[PLACES AUTOCOMPLETE] Success:', data.predictions?.length || 0, 'results');
      return res.json({
        predictions: data.predictions?.map((p: any) => ({
          place_id: p.place_id,
          description: p.description,
          structured_formatting: p.structured_formatting,
        })) || []
      });
    }

    console.log('[PLACES AUTOCOMPLETE] Error:', data.status, data.error_message);
    return res.status(400).json({ error: data.error_message || data.status });

  } catch (error: any) {
    console.error('[PLACES AUTOCOMPLETE] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch autocomplete suggestions' });
  }
});

// Google Places Details endpoint
app.post('/api/places/details', async (req: Request, res: Response) => {
  try {
    const { place_id } = req.body;

    if (!place_id) {
      return res.status(400).json({ error: 'place_id is required' });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      console.error('[PLACES DETAILS] GOOGLE_MAPS_API_KEY not configured');
      return res.status(500).json({ error: 'Places API not configured' });
    }

    console.log('[PLACES DETAILS] Request:', place_id);

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=formatted_address,geometry,address_components&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.result) {
      const result = data.result;
      const location = result.geometry?.location;

      // Extract postcode from address components
      let postcode = '';
      const addressComponents = result.address_components || [];
      for (const comp of addressComponents) {
        if (comp.types?.includes('postal_code')) {
          postcode = comp.long_name;
          break;
        }
      }

      console.log('[PLACES DETAILS] Success:', {
        address: result.formatted_address,
        lat: location?.lat,
        lng: location?.lng,
        postcode
      });

      return res.json({
        formatted_address: result.formatted_address,
        lat: location?.lat,
        lng: location?.lng,
        postcode,
        address_components: addressComponents
      });
    }

    console.log('[PLACES DETAILS] Error:', data.status, data.error_message);
    return res.status(400).json({ error: data.error_message || data.status });

  } catch (error: any) {
    console.error('[PLACES DETAILS] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event: any;

  try {
    const stripe = await getUncachableStripeClient();
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log('Payment succeeded:', paymentIntent.id);

        const bookingId = paymentIntent.metadata?.bookingId;
        if (bookingId) {
          try {
            await updateBookingPaymentStatus(bookingId, paymentIntent.id, 'confirmed');
            console.log(`Booking ${bookingId} updated to confirmed`);
          } catch (dbError) {
            console.error('Failed to update booking status:', dbError);
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        console.log('Payment failed:', paymentIntent.id);

        const bookingId = paymentIntent.metadata?.bookingId;
        if (bookingId) {
          try {
            await updateBookingPaymentStatus(bookingId, paymentIntent.id, 'failed');
            console.log(`Booking ${bookingId} marked as failed`);
          } catch (dbError) {
            console.error('Failed to update booking status:', dbError);
          }
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        console.log('Charge refunded:', charge.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error: any) {
    console.error('Error processing webhook event:', error.message);
  }

  res.json({ received: true });
});

app.get('/api/stripe/config', async (req: Request, res: Response) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error: any) {
    console.error('Error getting Stripe config:', error.message);
    res.status(500).json({ error: 'Failed to get Stripe configuration' });
  }
});

// New user discount: 20% off first 3 bookings
const NEW_USER_DISCOUNT_PERCENT = 20;
const NEW_USER_DISCOUNT_MAX_BOOKINGS = 3;

async function getCustomerCompletedBookingsCount(customerId: string): Promise<number> {
  if (!supabaseAdmin || !customerId) return 999;

  try {
    const { count, error } = await supabaseAdmin
      .from('customer_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .in('status', ['delivered', 'completed', 'paid']);

    if (error) {
      console.log('[DISCOUNT] Error fetching booking count:', error.message);
      return 999;
    }

    console.log('[DISCOUNT] Customer', customerId, 'has', count, 'completed bookings');
    return count || 0;
  } catch (e: any) {
    console.log('[DISCOUNT] Exception:', e.message);
    return 999;
  }
}

function calculateNewUserDiscount(originalAmount: number, completedBookings: number): {
  isEligible: boolean;
  discountAmount: number;
  finalAmount: number;
  discountPercent: number;
  remainingDiscountBookings: number;
} {
  const isEligible = completedBookings < NEW_USER_DISCOUNT_MAX_BOOKINGS;
  const discountPercent = isEligible ? NEW_USER_DISCOUNT_PERCENT : 0;
  const discountAmount = isEligible ? Math.round(originalAmount * (discountPercent / 100) * 100) / 100 : 0;
  const finalAmount = Math.round((originalAmount - discountAmount) * 100) / 100;
  const remainingDiscountBookings = Math.max(0, NEW_USER_DISCOUNT_MAX_BOOKINGS - completedBookings - 1);

  return {
    isEligible,
    discountAmount,
    finalAmount,
    discountPercent,
    remainingDiscountBookings,
  };
}

app.post('/api/stripe/create-payment-intent', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'gbp', bookingId, trackingNumber, customerId, customerEmail, applyNewUserDiscount = true } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const stripe = await getUncachableStripeClient();

    // Check for new user discount eligibility
    let finalAmount = amount;
    let discountInfo = null;

    if (applyNewUserDiscount && customerId) {
      const completedBookings = await getCustomerCompletedBookingsCount(customerId);
      const discount = calculateNewUserDiscount(amount, completedBookings);

      if (discount.isEligible) {
        finalAmount = discount.finalAmount;
        discountInfo = {
          originalAmount: amount,
          discountPercent: discount.discountPercent,
          discountAmount: discount.discountAmount,
          finalAmount: discount.finalAmount,
          remainingDiscountBookings: discount.remainingDiscountBookings,
          message: `New customer ${discount.discountPercent}% off! ${discount.remainingDiscountBookings > 0 ? `${discount.remainingDiscountBookings} more discounted booking${discount.remainingDiscountBookings > 1 ? 's' : ''} remaining.` : 'This is your last discounted booking.'}`,
        };
        console.log('[DISCOUNT] Applied', discount.discountPercent, '% discount:', amount, '->', finalAmount);
      }
    }

    const amountInPence = Math.round(finalAmount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPence,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        bookingId: bookingId || '',
        trackingNumber: trackingNumber || '',
        customerId: customerId || '',
        originalAmount: String(amount),
        discountApplied: discountInfo ? 'true' : 'false',
        discountPercent: discountInfo ? String(discountInfo.discountPercent) : '0',
      },
      receipt_email: customerEmail,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      discount: discountInfo,
      finalAmount,
      originalAmount: amount,
    });
  } catch (error: any) {
    console.error('Error creating payment intent:', error.message);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

app.post('/api/stripe/confirm-payment', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, bookingId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    const stripe = await getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const succeeded = paymentIntent.status === 'succeeded';

    if (succeeded) {
      const metadataBookingId = paymentIntent.metadata?.bookingId;

      if (!metadataBookingId) {
        console.error('No bookingId in PaymentIntent metadata');
        return res.json({ status: paymentIntent.status, succeeded, error: 'No booking associated with payment' });
      }

      if (bookingId && bookingId !== metadataBookingId) {
        console.error(`Booking ID mismatch: requested ${bookingId}, payment has ${metadataBookingId}`);
        return res.status(403).json({ error: 'Booking ID does not match payment' });
      }

      try {
        await updateBookingPaymentStatus(metadataBookingId, paymentIntentId, 'confirmed');
      } catch (dbError) {
        console.error('Failed to update booking via confirm-payment:', dbError);
        return res.status(500).json({ error: 'Failed to update booking status' });
      }
    }

    res.json({
      status: paymentIntent.status,
      succeeded,
    });
  } catch (error: any) {
    console.error('Error confirming payment:', error.message);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

app.post('/api/stripe/refund', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, amount, reason } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    const stripe = await getUncachableStripeClient();

    const refundParams: any = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundParams.amount = Math.round(amount * 100);
    }

    if (reason) {
      refundParams.reason = reason;
    }

    const refund = await stripe.refunds.create(refundParams);

    res.json({
      refundId: refund.id,
      status: refund.status,
      amount: refund.amount / 100,
    });
  } catch (error: any) {
    console.error('Error creating refund:', error.message);
    res.status(500).json({ error: error.message || 'Failed to create refund' });
  }
});

app.get('/api/stripe/payment-status/:paymentIntentId', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.params;

    const stripe = await getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    res.json({
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
    });
  } catch (error: any) {
    console.error('Error getting payment status:', error.message);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

// ==================== PUSH NOTIFICATIONS ====================

// Admin API key for securing notification endpoints
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Middleware to verify admin API key
const verifyAdminKey = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.replace('Bearer ', '') || req.headers['x-api-key'];

  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    console.error('[AUTH] Invalid or missing admin API key');
    return res.status(401).json({ error: 'Unauthorized - invalid API key' });
  }

  next();
};

// Send push notification to a specific driver (admin only)
app.post('/api/notifications/send', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    const { driverId, title, body, data } = req.body;

    if (!driverId) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    if (!supabaseAdmin) {
      console.error('[PUSH] Supabase admin client not configured');
      return res.status(500).json({ error: 'Push service not configured' });
    }

    // Get driver's push token
    const { data: driver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('push_token, full_name, email')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) {
      console.error('[PUSH] Driver not found:', driverError);
      return res.status(404).json({ error: 'Driver not found' });
    }

    if (!driver.push_token) {
      console.log('[PUSH] Driver has no push token:', driverId);
      return res.status(400).json({ error: 'Driver has no push token registered' });
    }

    // Send via Expo Push API
    const message = {
      to: driver.push_token,
      sound: 'default',
      title: title || 'New Job Available',
      body: body || 'You have a new job offer!',
      data: data || {},
      priority: 'high',
      channelId: 'job-alerts',
    };

    console.log('[PUSH] Sending notification to:', driver.email);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('[PUSH] Expo response:', result);

    if (result.data?.status === 'error') {
      return res.status(400).json({
        error: 'Failed to send notification',
        details: result.data.message
      });
    }

    res.json({ success: true, ticketId: result.data?.id });
  } catch (error: any) {
    console.error('[PUSH] Error sending notification:', error.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Send job offer notification to driver (admin only)
app.post('/api/notifications/job-offer', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    const { jobId, driverId } = req.body;

    if (!jobId || !driverId) {
      return res.status(400).json({ error: 'Job ID and Driver ID are required' });
    }

    if (!supabaseAdmin) {
      console.error('[PUSH] Supabase admin client not configured');
      return res.status(500).json({ error: 'Push service not configured' });
    }

    // Get job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('[PUSH] Job not found:', jobError);
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get driver's push token
    const { data: driver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('push_token, full_name, email')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) {
      console.error('[PUSH] Driver not found:', driverError);
      return res.status(404).json({ error: 'Driver not found' });
    }

    if (!driver.push_token) {
      console.log('[PUSH] Driver has no push token:', driverId);
      return res.status(400).json({ error: 'Driver has no push token registered' });
    }

    // Format job details for notification
    const pickupShort = job.pickup_address?.split(',')[0] || 'Unknown';
    const dropoffShort = job.dropoff_address?.split(',')[0] || 'Unknown';
    const price = job.price_customer ? `£${job.price_customer.toFixed(2)}` : 'Quote pending';

    const message = {
      to: driver.push_token,
      sound: 'notification.mp3',
      title: 'NEW JOB OFFER!',
      body: `${pickupShort} → ${dropoffShort} | ${price}`,
      data: {
        jobId: job.id,
        action: 'job_offer',
        pickup: job.pickup_address,
        dropoff: job.dropoff_address,
        price: job.price_customer,
      },
      priority: 'high',
      channelId: 'job-alerts',
      categoryId: 'job_offer',
    };

    console.log('[PUSH] Sending job offer to:', driver.email, 'Job:', jobId);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('[PUSH] Expo response:', result);

    if (result.data?.status === 'error') {
      return res.status(400).json({
        error: 'Failed to send notification',
        details: result.data.message
      });
    }

    res.json({ success: true, ticketId: result.data?.id });
  } catch (error: any) {
    console.error('[PUSH] Error sending job offer notification:', error.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Assign job to driver and send notification (admin only)
app.post('/api/jobs/assign', verifyAdminKey, async (req: Request, res: Response) => {
  try {
    const { jobId, driverId } = req.body;

    if (!jobId || !driverId) {
      return res.status(400).json({ error: 'Job ID and Driver ID are required' });
    }

    if (!supabaseAdmin) {
      console.error('[ASSIGN] Supabase admin client not configured');
      return res.status(500).json({ error: 'Service not configured' });
    }

    // Update job with driver assignment
    const { data: job, error: updateError } = await supabaseAdmin
      .from('jobs')
      .update({
        driver_id: driverId,
        status: 'assigned',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select()
      .single();

    if (updateError || !job) {
      console.error('[ASSIGN] Failed to update job:', updateError);
      return res.status(500).json({ error: 'Failed to assign job' });
    }

    // Get driver's push token
    const { data: driver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('push_token, full_name, email')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) {
      console.error('[ASSIGN] Driver not found:', driverError);
      return res.json({ success: true, job, notificationSent: false, reason: 'Driver not found' });
    }

    if (!driver.push_token) {
      console.log('[ASSIGN] Driver has no push token:', driverId);
      return res.json({ success: true, job, notificationSent: false, reason: 'No push token' });
    }

    // Send push notification
    const pickupShort = job.pickup_address?.split(',')[0] || 'Unknown';
    const dropoffShort = job.dropoff_address?.split(',')[0] || 'Unknown';
    const price = job.price_customer ? `£${job.price_customer.toFixed(2)}` : 'Quote pending';

    const message = {
      to: driver.push_token,
      sound: 'notification.mp3',
      title: 'NEW JOB ASSIGNED!',
      body: `${pickupShort} → ${dropoffShort} | ${price}`,
      data: {
        jobId: job.id,
        action: 'job_offer',
        pickup: job.pickup_address,
        dropoff: job.dropoff_address,
        price: job.price_customer,
      },
      priority: 'high',
      channelId: 'job-alerts',
    };

    console.log('[ASSIGN] Sending notification to:', driver.email);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('[ASSIGN] Expo response:', result);

    res.json({
      success: true,
      job,
      notificationSent: result.data?.status !== 'error',
      ticketId: result.data?.id
    });
  } catch (error: any) {
    console.error('[ASSIGN] Error:', error.message);
    res.status(500).json({ error: 'Failed to assign job' });
  }
});

// ==================== END PUSH NOTIFICATIONS ====================

// ==================== EMAIL NOTIFICATIONS ====================
// All email notifications go through this API - used by both mobile app and website

// Send booking confirmation email
app.post('/api/email/booking-confirmation', async (req: Request, res: Response) => {
  try {
    const {
      customerEmail,
      customerName,
      trackingNumber,
      pickupAddress,
      deliveryAddress,
      scheduledDate,
      scheduledTime,
      price,
      vehicleType
    } = req.body;

    if (!customerEmail || !trackingNumber) {
      return res.status(400).json({ error: 'Customer email and tracking number are required' });
    }

    console.log('[EMAIL] Sending booking confirmation to:', customerEmail, 'tracking:', trackingNumber);

    const resend = await getResendClient();
    if (!resend) {
      console.log('[EMAIL] Resend not configured - skipping email');
      return res.json({ success: true, skipped: true, reason: 'Email service not configured' });
    }

    const formattedDate = new Date(scheduledDate).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const { data, error } = await resend.client.emails.send({
      from: `Run Courier <${resend.fromEmail}>`,
      to: customerEmail,
      subject: `Booking Confirmed - ${trackingNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #FF6B35; margin: 0;">Run Courier</h1>
            <p style="color: #666; margin: 5px 0;">Your Delivery Partner</p>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #333; margin-top: 0;">Booking Confirmed!</h2>
            <p>Hi ${customerName || 'Customer'},</p>
            <p>Your delivery booking has been confirmed. Here are your booking details:</p>
          </div>
          
          <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Tracking Number</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #FF6B35;">${trackingNumber}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Pickup Address</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${pickupAddress}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Delivery Address</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${deliveryAddress}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Scheduled Date</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${formattedDate}${scheduledTime ? ' at ' + scheduledTime : ''}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Vehicle Type</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${vehicleType || 'Standard'}</td>
              </tr>
              ${price ? `<tr>
                <td style="padding: 10px 0; color: #666;">Price</td>
                <td style="padding: 10px 0; font-weight: bold; font-size: 18px;">£${parseFloat(price).toFixed(2)}</td>
              </tr>` : ''}
            </table>
          </div>
          
          <div style="background: #e8f5e9; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; color: #2e7d32;">
              <strong>Track Your Delivery:</strong> Use your tracking number ${trackingNumber} to monitor your delivery status on our website or app.
            </p>
          </div>
          
          <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
            <p>Thank you for choosing Run Courier!</p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('[EMAIL] Failed to send booking confirmation:', error);
      return res.status(500).json({ error: 'Failed to send email', details: error.message });
    }

    console.log('[EMAIL] Booking confirmation sent successfully:', data?.id);
    res.json({ success: true, emailId: data?.id });
  } catch (error: any) {
    console.error('[EMAIL] Error sending booking confirmation:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Send proof of delivery email
app.post('/api/email/pod-notification', async (req: Request, res: Response) => {
  try {
    const {
      customerEmail,
      customerName,
      trackingNumber,
      recipientName,
      deliveryAddress,
      deliveredAt,
      driverName,
      podPhotoUrls,
      signatureUrl,
      podNotes
    } = req.body;

    if (!customerEmail || !trackingNumber) {
      return res.status(400).json({ error: 'Customer email and tracking number are required' });
    }

    console.log('[EMAIL] Sending POD notification to:', customerEmail, 'tracking:', trackingNumber);

    const resend = await getResendClient();
    if (!resend) {
      console.log('[EMAIL] Resend not configured - skipping email');
      return res.json({ success: true, skipped: true, reason: 'Email service not configured' });
    }

    const formattedTime = new Date(deliveredAt).toLocaleString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const photoSection = podPhotoUrls && podPhotoUrls.length > 0 ? `
      <div style="margin-top: 20px;">
        <h3 style="color: #333; margin-bottom: 10px;">Proof of Delivery Photos</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 10px;">
          ${podPhotoUrls.slice(0, 3).map((url: string) => `
            <img src="${url}" alt="Delivery Photo" style="max-width: 180px; border-radius: 8px; border: 1px solid #e0e0e0;">
          `).join('')}
        </div>
      </div>
    ` : '';

    const signatureSection = signatureUrl ? `
      <div style="margin-top: 20px;">
        <h3 style="color: #333; margin-bottom: 10px;">Recipient Signature</h3>
        <img src="${signatureUrl}" alt="Signature" style="max-width: 300px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff;">
      </div>
    ` : '';

    const { data, error } = await resend.client.emails.send({
      from: `Run Courier <${resend.fromEmail}>`,
      to: customerEmail,
      subject: `Delivery Completed - ${trackingNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #FF6B35; margin: 0;">Run Courier</h1>
            <p style="color: #666; margin: 5px 0;">Your Delivery Partner</p>
          </div>
          
          <div style="background: #e8f5e9; border-radius: 10px; padding: 20px; margin-bottom: 20px; text-align: center;">
            <h2 style="color: #2e7d32; margin: 0;">Delivery Completed!</h2>
            <p style="color: #666; margin: 10px 0 0;">Your package has been successfully delivered</p>
          </div>
          
          <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Tracking Number</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #FF6B35;">${trackingNumber}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Delivered To</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${deliveryAddress}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Received By</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${recipientName || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666;">Delivered At</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${formattedTime}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #666;">Driver</td>
                <td style="padding: 10px 0;">${driverName || 'Run Courier Driver'}</td>
              </tr>
            </table>
            
            ${podNotes ? `<div style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 5px;"><strong>Delivery Notes:</strong> ${podNotes}</div>` : ''}
            ${photoSection}
            ${signatureSection}
          </div>
          
          <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
            <p>Thank you for choosing Run Courier!</p>
            <p>We hope you're satisfied with our service.</p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('[EMAIL] Failed to send POD notification:', error);
      return res.status(500).json({ error: 'Failed to send email', details: error.message });
    }

    console.log('[EMAIL] POD notification sent successfully:', data?.id);
    res.json({ success: true, emailId: data?.id });
  } catch (error: any) {
    console.error('[EMAIL] Error sending POD notification:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Send password reset email (for custom flows, Supabase handles its own)
app.post('/api/email/password-reset', async (req: Request, res: Response) => {
  try {
    const { email, resetLink, userName } = req.body;

    if (!email || !resetLink) {
      return res.status(400).json({ error: 'Email and reset link are required' });
    }

    console.log('[EMAIL] Sending password reset to:', email);

    const resend = await getResendClient();
    if (!resend) {
      console.log('[EMAIL] Resend not configured - skipping email');
      return res.json({ success: true, skipped: true, reason: 'Email service not configured' });
    }

    const { data, error } = await resend.client.emails.send({
      from: `Run Courier <${resend.fromEmail}>`,
      to: email,
      subject: 'Reset Your Password - Run Courier',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #FF6B35; margin: 0;">Run Courier</h1>
            <p style="color: #666; margin: 5px 0;">Password Reset Request</p>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
            <p>Hi ${userName || 'there'},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: #FF6B35; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          
          <div style="background: #fff3cd; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; color: #856404;">
              <strong>Security Note:</strong> This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
            </p>
          </div>
          
          <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetLink}</p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('[EMAIL] Failed to send password reset:', error);
      return res.status(500).json({ error: 'Failed to send email', details: error.message });
    }

    console.log('[EMAIL] Password reset sent successfully:', data?.id);
    res.json({ success: true, emailId: data?.id });
  } catch (error: any) {
    console.error('[EMAIL] Error sending password reset:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Test email connection
app.get('/api/email/test', async (req: Request, res: Response) => {
  try {
    const resend = await getResendClient();
    if (!resend) {
      return res.json({ connected: false, reason: 'Email service not configured' });
    }
    res.json({ connected: true, fromEmail: resend.fromEmail });
  } catch (error: any) {
    res.json({ connected: false, error: error.message });
  }
});

// ==================== END EMAIL NOTIFICATIONS ====================

// ==================== BARCODE SCAN VALIDATION ====================

// Validate scanned barcode against backend jobs
app.post('/api/jobs/scan', async (req: Request, res: Response) => {
  const { trackingCode, driverId } = req.body;

  console.log('[BARCODE SCAN] Request received');
  console.log('[BARCODE SCAN] Tracking code:', trackingCode);
  console.log('[BARCODE SCAN] Driver ID:', driverId);

  try {
    if (!supabaseAdmin) {
      console.error('[BARCODE SCAN] Supabase admin client not configured');
      return res.status(500).json({ error: 'Database service not configured' });
    }

    if (!trackingCode) {
      return res.status(400).json({ error: 'Tracking code is required' });
    }

    // Search for job by tracking_number
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('id, tracking_number, status, driver_id, pickup_address, dropoff_address, sender_name, recipient_name, price_driver')
      .eq('tracking_number', trackingCode)
      .single();

    if (jobError || !job) {
      console.log('[BARCODE SCAN] Job not found for tracking code:', trackingCode);
      return res.status(404).json({
        error: 'Invalid barcode',
        message: 'No job found with this tracking code'
      });
    }

    console.log('[BARCODE SCAN] Job found:', job.id, 'status:', job.status);

    // Check if job is already completed
    if (job.status === 'delivered') {
      return res.status(400).json({
        error: 'Job already completed',
        message: 'This delivery has already been completed',
        jobId: job.id,
        trackingCode: job.tracking_number
      });
    }

    if (job.status === 'failed') {
      return res.status(400).json({
        error: 'Job failed',
        message: 'This delivery was marked as failed',
        jobId: job.id,
        trackingCode: job.tracking_number
      });
    }

    // If driverId provided, verify it matches
    if (driverId && job.driver_id !== driverId) {
      console.log('[BARCODE SCAN] Driver mismatch:', job.driver_id, '!=', driverId);
      return res.status(403).json({
        error: 'Job not assigned to you',
        message: 'This job is assigned to a different driver'
      });
    }

    // Return job details
    res.json({
      success: true,
      jobId: job.id,
      trackingCode: job.tracking_number,
      status: job.status,
      pickup: job.pickup_address,
      delivery: job.dropoff_address,
      senderName: job.sender_name,
      recipientName: job.recipient_name,
      price: job.price_driver
    });

  } catch (error: any) {
    console.error('[BARCODE SCAN] Error:', error.message);
    res.status(500).json({ error: 'Failed to validate barcode' });
  }
});

// ==================== END BARCODE SCAN ====================

// ==================== POD UPLOAD ====================

// Upload Proof of Delivery photos and data
app.post('/api/jobs/:jobId/upload-pod', upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'signature', maxCount: 1 }
]), async (req: Request, res: Response) => {
  const { jobId } = req.params;

  console.log('[POD UPLOAD] Request received for job:', jobId);
  console.log('[POD UPLOAD] Body:', JSON.stringify(req.body));

  try {
    if (!supabaseAdmin) {
      console.error('[POD UPLOAD] Supabase admin client not configured');
      return res.status(500).json({ error: 'Storage service not configured' });
    }

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    // Get the uploaded files
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const photos = files?.photos || [];
    const signatureFiles = files?.signature || [];

    console.log('[POD UPLOAD] Photos received:', photos.length);
    console.log('[POD UPLOAD] Signature received:', signatureFiles.length > 0);

    // Verify job exists and get driver_id
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select('id, driver_id, tracking_number')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('[POD UPLOAD] Job not found:', jobError);
      return res.status(404).json({ error: 'Job not found' });
    }

    const driverId = job.driver_id;
    const trackingNumber = job.tracking_number || jobId;
    const uploadedPhotoUrls: string[] = [];
    let signatureUrl: string | null = null;

    // Upload photos to Supabase Storage
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const fileName = `pod_${trackingNumber}_${Date.now()}_${i}.jpg`;
      const filePath = `job_${jobId}/${fileName}`;

      console.log('[POD UPLOAD] Uploading photo:', filePath, 'size:', photo.size);

      const { error: uploadError } = await supabaseAdmin.storage
        .from('pod-images')
        .upload(filePath, photo.buffer, {
          contentType: photo.mimetype || 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.error('[POD UPLOAD] Photo upload failed:', uploadError);
        continue;
      }

      const { data: urlData } = supabaseAdmin.storage
        .from('pod-images')
        .getPublicUrl(filePath);

      uploadedPhotoUrls.push(urlData.publicUrl);
      console.log('[POD UPLOAD] Photo uploaded:', urlData.publicUrl);
    }

    // Upload signature if provided
    if (signatureFiles.length > 0) {
      const signature = signatureFiles[0];
      const sigFileName = `signature_${trackingNumber}_${Date.now()}.png`;
      const sigFilePath = `job_${jobId}/${sigFileName}`;

      console.log('[POD UPLOAD] Uploading signature:', sigFilePath);

      const { error: sigError } = await supabaseAdmin.storage
        .from('pod-images')
        .upload(sigFilePath, signature.buffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (!sigError) {
        const { data: sigUrlData } = supabaseAdmin.storage
          .from('pod-images')
          .getPublicUrl(sigFilePath);
        signatureUrl = sigUrlData.publicUrl;
        console.log('[POD UPLOAD] Signature uploaded:', signatureUrl);
      } else {
        console.error('[POD UPLOAD] Signature upload failed:', sigError);
      }
    }

    // Update job with POD data
    const { recipientName, notes } = req.body;
    const updateData: any = {
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (uploadedPhotoUrls.length > 0) {
      updateData.pod_photo_url = uploadedPhotoUrls[0];
      updateData.pod_photos = uploadedPhotoUrls;
    }

    if (signatureUrl) {
      updateData.pod_signature_url = signatureUrl;
    }

    if (recipientName) {
      updateData.recipient_name = recipientName;
    }

    if (notes) {
      updateData.pod_notes = notes;
    }

    console.log('[POD UPLOAD] Updating job:', jobId, 'with:', JSON.stringify(updateData));

    const { error: updateError } = await supabaseAdmin
      .from('jobs')
      .update(updateData)
      .eq('id', jobId);

    if (updateError) {
      console.error('[POD UPLOAD] Job update failed:', updateError);
      return res.status(500).json({
        error: 'Failed to update job',
        photos: uploadedPhotoUrls,
        signature: signatureUrl
      });
    }

    // Also sync to customer_bookings if linked
    try {
      const { data: booking } = await supabaseAdmin
        .from('customer_bookings')
        .select('id')
        .eq('driver_job_id', String(jobId))
        .single();

      if (booking) {
        await supabaseAdmin
          .from('customer_bookings')
          .update({
            status: 'delivered',
            delivered_at: updateData.delivered_at,
            pod_photo_url: updateData.pod_photo_url,
            pod_photos: updateData.pod_photos,
            pod_signature_url: updateData.pod_signature_url,
            pod_notes: updateData.pod_notes,
            recipient_name: updateData.recipient_name,
            updated_at: new Date().toISOString()
          })
          .eq('id', booking.id);
        console.log('[POD UPLOAD] Customer booking synced:', booking.id);
      }
    } catch (syncError) {
      console.log('[POD UPLOAD] No linked customer booking');
    }

    console.log('[POD UPLOAD] Success! Photos:', uploadedPhotoUrls.length);

    res.json({
      success: true,
      jobId,
      photos: uploadedPhotoUrls,
      signature: signatureUrl,
      message: 'Proof of delivery uploaded successfully'
    });
  } catch (error: any) {
    console.error('[POD UPLOAD] Error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to upload proof of delivery', details: error.message });
  }
});

// ==================== END POD UPLOAD ====================

// ==================== DRIVER STATUS ENDPOINTS ====================

// Helper: Verify driver auth token from Supabase
async function verifyDriverAuth(authHeader: string | undefined, expectedDriverId: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid authorization header' };
  }

  if (!supabaseAdmin) {
    return { valid: false, error: 'Database not configured' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return { valid: false, error: 'Invalid or expired token' };
    }

    // Verify the user owns this driver record
    const { data: driver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('id, user_id')
      .eq('id', expectedDriverId)
      .single();

    if (driverError || !driver) {
      return { valid: false, error: 'Driver not found' };
    }

    // Check if driver belongs to this user (user_id matches OR id matches for legacy)
    if (driver.user_id !== user.id && driver.id !== user.id) {
      return { valid: false, error: 'Unauthorized: driver does not belong to this user' };
    }

    return { valid: true, userId: user.id };
  } catch (error: any) {
    return { valid: false, error: 'Token verification failed' };
  }
}

// Update driver online/offline status with location
app.post('/api/driver/status', async (req: Request, res: Response) => {
  try {
    const { driverId, isOnline, latitude, longitude, heading, speed } = req.body;

    if (!driverId) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Verify driver authentication
    const authResult = await verifyDriverAuth(req.headers.authorization, driverId);
    if (!authResult.valid) {
      return res.status(401).json({ error: authResult.error });
    }

    const updateData: any = {
      is_online: isOnline,
      status_updated_at: new Date().toISOString(),
    };

    if (latitude !== undefined && longitude !== undefined) {
      updateData.current_latitude = latitude;
      updateData.current_longitude = longitude;
      updateData.location_updated_at = new Date().toISOString();
      if (heading !== undefined) updateData.heading = heading;
      if (speed !== undefined) updateData.speed = speed;
    }

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .update(updateData)
      .eq('id', driverId)
      .select('id, full_name, is_online, current_latitude, current_longitude, status_updated_at')
      .single();

    if (error) {
      console.error('[DRIVER STATUS] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to update driver status' });
    }

    console.log('[DRIVER STATUS]', data?.full_name, 'is now', isOnline ? 'ONLINE' : 'OFFLINE',
      latitude ? `at ${latitude.toFixed(4)},${longitude.toFixed(4)}` : '');

    res.json({ success: true, driver: data });
  } catch (error: any) {
    console.error('[DRIVER STATUS] Error:', error.message);
    res.status(500).json({ error: 'Failed to update driver status' });
  }
});

// Get driver status (authenticated - only own status)
app.get('/api/driver/status/:driverId', async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Verify driver authentication
    const authResult = await verifyDriverAuth(req.headers.authorization, driverId);
    if (!authResult.valid) {
      return res.status(401).json({ error: authResult.error });
    }

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select('id, full_name, is_online, current_latitude, current_longitude, status_updated_at, location_updated_at')
      .eq('id', driverId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json(data);
  } catch (error: any) {
    console.error('[DRIVER STATUS] Error:', error.message);
    res.status(500).json({ error: 'Failed to get driver status' });
  }
});

// Admin endpoint: Get all online drivers with locations for map
app.get('/api/admin/drivers/online', async (req: Request, res: Response) => {
  try {
    // Require admin API key
    const apiKey = req.headers['x-admin-api-key'] || req.headers.authorization?.replace('Bearer ', '');
    if (!apiKey || apiKey !== ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Admin API key required' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Get drivers who are online OR have been active in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select(`
        id,
        full_name,
        vehicle_type,
        is_online,
        current_latitude,
        current_longitude,
        heading,
        speed,
        status_updated_at,
        location_updated_at
      `)
      .or(`is_online.eq.true,status_updated_at.gte.${tenMinutesAgo}`)
      .not('current_latitude', 'is', null)
      .not('current_longitude', 'is', null);

    if (error) {
      console.error('[ADMIN DRIVERS] Query error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch drivers' });
    }

    // Enrich with active job info (no sensitive data)
    const enrichedDrivers = await Promise.all((data || []).map(async (driver) => {
      const { data: activeJob } = await supabaseAdmin
        .from('jobs')
        .select('id, tracking_number, status, pickup_address, dropoff_address')
        .eq('driver_id', driver.id)
        .in('status', ['accepted', 'picked_up', 'on_the_way'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      return {
        ...driver,
        activeJob: activeJob || null,
        isStale: driver.location_updated_at
          ? new Date(driver.location_updated_at) < new Date(Date.now() - 2 * 60 * 1000)
          : true,
      };
    }));

    console.log('[ADMIN DRIVERS] Found', enrichedDrivers.length, 'drivers with locations');
    res.json({
      drivers: enrichedDrivers,
      count: enrichedDrivers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[ADMIN DRIVERS] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch online drivers' });
  }
});

// ==================== END DRIVER STATUS ====================

// ==================== MOBILE-SPECIFIC ENDPOINTS ====================
// These are aliases for mobile app compatibility

// Mobile payment endpoints
app.post('/api/mobile/stripe/create-payment-intent', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'gbp', bookingId, trackingNumber, customerId, customerEmail, applyNewUserDiscount = true } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const stripe = await getUncachableStripeClient();

    // Check for new user discount eligibility
    let finalAmount = amount;
    let discountInfo = null;

    if (applyNewUserDiscount && customerId) {
      const completedBookings = await getCustomerCompletedBookingsCount(customerId);
      const discount = calculateNewUserDiscount(amount, completedBookings);

      if (discount.isEligible) {
        finalAmount = discount.finalAmount;
        discountInfo = {
          originalAmount: amount,
          discountPercent: discount.discountPercent,
          discountAmount: discount.discountAmount,
          finalAmount: discount.finalAmount,
          remainingDiscountBookings: discount.remainingDiscountBookings,
          message: `New customer ${discount.discountPercent}% off! ${discount.remainingDiscountBookings > 0 ? `${discount.remainingDiscountBookings} more discounted booking${discount.remainingDiscountBookings > 1 ? 's' : ''} remaining.` : 'This is your last discounted booking.'}`,
        };
        console.log('[MOBILE DISCOUNT] Applied', discount.discountPercent, '% discount:', amount, '->', finalAmount);
      }
    }

    const amountInPence = Math.round(finalAmount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPence,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        bookingId: bookingId || '',
        trackingNumber: trackingNumber || '',
        customerId: customerId || '',
        source: 'mobile',
        originalAmount: String(amount),
        discountApplied: discountInfo ? 'true' : 'false',
        discountPercent: discountInfo ? String(discountInfo.discountPercent) : '0',
      },
      receipt_email: customerEmail,
    });

    console.log('[MOBILE PAYMENT] Created intent:', paymentIntent.id, discountInfo ? '(with discount)' : '');
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      discount: discountInfo,
      finalAmount,
      originalAmount: amount,
    });
  } catch (error: any) {
    console.error('[MOBILE PAYMENT] Error:', error.message);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Check discount eligibility endpoint
app.post('/api/discount/check-eligibility', async (req: Request, res: Response) => {
  try {
    const { customerId, amount } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const completedBookings = await getCustomerCompletedBookingsCount(customerId);
    const discount = calculateNewUserDiscount(amount || 100, completedBookings);

    res.json({
      isEligible: discount.isEligible,
      discountPercent: discount.discountPercent,
      completedBookings,
      remainingDiscountBookings: discount.isEligible ? NEW_USER_DISCOUNT_MAX_BOOKINGS - completedBookings : 0,
      message: discount.isEligible
        ? `You have ${NEW_USER_DISCOUNT_MAX_BOOKINGS - completedBookings} discounted booking${NEW_USER_DISCOUNT_MAX_BOOKINGS - completedBookings > 1 ? 's' : ''} remaining (${NEW_USER_DISCOUNT_PERCENT}% off)`
        : 'You have used all your new customer discounts',
    });
  } catch (error: any) {
    console.error('[DISCOUNT CHECK] Error:', error.message);
    res.status(500).json({ error: 'Failed to check discount eligibility' });
  }
});

app.post('/api/mobile/stripe/confirm', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, bookingId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    const stripe = await getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const succeeded = paymentIntent.status === 'succeeded';

    if (succeeded) {
      const metadataBookingId = paymentIntent.metadata?.bookingId;
      if (metadataBookingId) {
        try {
          await updateBookingPaymentStatus(metadataBookingId, paymentIntentId, 'confirmed');
          console.log('[MOBILE PAYMENT] Booking updated:', metadataBookingId);
        } catch (dbError) {
          console.error('[MOBILE PAYMENT] Failed to update booking:', dbError);
        }
      }
    }

    res.json({ status: paymentIntent.status, succeeded });
  } catch (error: any) {
    console.error('[MOBILE PAYMENT] Error:', error.message);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Mobile photo upload endpoint (uses Supabase Storage)
// Note: Mobile app uses direct Supabase storage upload with user auth token
// This endpoint is for admin/webhook use only and requires authentication
app.post('/api/mobile/upload', verifyAdminKey, express.json({ limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const { base64Data, fileName, contentType, folder, userId } = req.body;

    if (!base64Data) {
      return res.status(400).json({ error: 'base64Data is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId is required for file organization' });
    }

    if (!supabaseAdmin) {
      console.error('[UPLOAD] Supabase admin not configured');
      return res.status(500).json({ error: 'Storage service not configured' });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const finalFileName = fileName || `upload_${Date.now()}.jpg`;
    const finalFolder = folder || 'delivery-photos';
    const filePath = `${userId}/${finalFolder}/${finalFileName}`;

    const { data, error } = await supabaseAdmin.storage
      .from('driver-documents')
      .upload(filePath, buffer, {
        contentType: contentType || 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[UPLOAD] Storage error:', error);
      return res.status(500).json({ error: 'Failed to upload file', details: error.message });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('driver-documents')
      .getPublicUrl(filePath);

    console.log('[UPLOAD] Success:', publicUrlData.publicUrl);
    res.json({
      success: true,
      url: publicUrlData.publicUrl,
      path: filePath,
    });
  } catch (error: any) {
    console.error('[UPLOAD] Error:', error.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ==================== ACCOUNT DELETION ENDPOINT ====================
// Deletes user from Supabase Auth so they can re-register with the same email

// Middleware to verify user's own JWT token
const verifyUserToken = async (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request for use in endpoint
    (req as any).user = user;
    next();
  } catch (error: any) {
    console.error('[AUTH] Token verification error:', error.message);
    return res.status(401).json({ error: 'Token verification failed' });
  }
};

app.post('/api/account/delete', verifyUserToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.id;

    console.log('[ACCOUNT DELETE] Request for user:', userId);

    if (!supabaseAdmin) {
      console.error('[ACCOUNT DELETE] Supabase admin not configured');
      return res.status(500).json({ error: 'Server not configured' });
    }

    // 1. Recursively delete ALL storage files under user's prefix from driver-documents bucket
    const allFilePaths: string[] = [];

    async function listAllFiles(bucket: string, prefix: string): Promise<string[]> {
      const paths: string[] = [];
      let offset = 0;
      const limit = 100; // Supabase default limit

      try {
        // Paginate through all files
        while (true) {
          const { data, error } = await supabaseAdmin!.storage.from(bucket).list(prefix, {
            limit,
            offset,
          });

          if (error) {
            console.log(`[ACCOUNT DELETE] Error listing ${prefix}:`, error.message);
            break;
          }
          if (!data || data.length === 0) break;

          for (const item of data) {
            const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

            // In Supabase Storage:
            // - Files have an 'id' property (UUID string)
            // - Folders have 'id' as null
            if (item.id === null) {
              // It's a folder - recurse into it
              const nestedFiles = await listAllFiles(bucket, fullPath);
              paths.push(...nestedFiles);
            } else {
              // It's a file
              paths.push(fullPath);
            }
          }

          // If we got fewer items than limit, we've reached the end
          if (data.length < limit) break;
          offset += limit;
        }
      } catch (e: any) {
        console.log(`[ACCOUNT DELETE] Exception listing ${prefix}:`, e.message);
      }
      return paths;
    }

    try {
      const userFiles = await listAllFiles('driver-documents', userId);
      allFilePaths.push(...userFiles);

      if (allFilePaths.length > 0) {
        console.log('[ACCOUNT DELETE] Found', allFilePaths.length, 'storage files to delete');

        // Delete in batches of 100 (Supabase limit)
        const batchSize = 100;
        for (let i = 0; i < allFilePaths.length; i += batchSize) {
          const batch = allFilePaths.slice(i, i + batchSize);
          const { error: deleteError } = await supabaseAdmin.storage
            .from('driver-documents')
            .remove(batch);

          if (deleteError) {
            console.error('[ACCOUNT DELETE] Storage deletion failed:', deleteError.message);
            return res.status(500).json({
              error: 'Failed to delete account files. Please contact support.',
              details: deleteError.message
            });
          }
        }
        console.log('[ACCOUNT DELETE] All storage files deleted successfully');
      } else {
        console.log('[ACCOUNT DELETE] No storage files found for user');
      }
    } catch (storageError: any) {
      console.error('[ACCOUNT DELETE] Storage cleanup failed:', storageError.message);
      return res.status(500).json({
        error: 'Failed to clean up account files. Please contact support.',
        details: storageError.message
      });
    }

    // 2. Delete driver documents from database
    const { error: docsError } = await supabaseAdmin
      .from('driver_documents')
      .delete()
      .eq('driver_id', userId);

    if (docsError) {
      console.error('[ACCOUNT DELETE] Failed to delete driver_documents:', docsError.message);
      return res.status(500).json({
        error: 'Failed to delete account documents. Please contact support.',
        details: docsError.message
      });
    }
    console.log('[ACCOUNT DELETE] Driver documents deleted from database');

    // 3. Delete driver record
    const { error: driverError } = await supabaseAdmin
      .from('drivers')
      .delete()
      .eq('id', userId);

    if (driverError) {
      console.error('[ACCOUNT DELETE] Failed to delete driver record:', driverError.message);
      return res.status(500).json({
        error: 'Failed to delete driver profile. Please contact support.',
        details: driverError.message
      });
    }
    console.log('[ACCOUNT DELETE] Driver record deleted');

    // 4. Delete from auth.users (this is the key part!)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('[ACCOUNT DELETE] Auth deletion failed:', authError.message);
      return res.status(500).json({
        error: 'Failed to delete authentication account',
        details: authError.message
      });
    }

    console.log('[ACCOUNT DELETE] User fully deleted from auth.users:', userId);

    res.json({
      success: true,
      message: 'Account permanently deleted. You can now re-register with the same email.'
    });

  } catch (error: any) {
    console.error('[ACCOUNT DELETE] Error:', error.message);
    res.status(500).json({ error: 'Failed to delete account', details: error.message });
  }
});

// ==================== END MOBILE ENDPOINTS ====================

// Serve static website files from static-build directory
const staticPath = path.join(__dirname, '../../static-build');
app.use(express.static(staticPath));

// Fallback to index.html for SPA routing
app.get('/{*splat}', (req: Request, res: Response) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving static files from: ${staticPath}`);
  console.log(`Stripe API available at /api/stripe/*`);
});

export default app;
