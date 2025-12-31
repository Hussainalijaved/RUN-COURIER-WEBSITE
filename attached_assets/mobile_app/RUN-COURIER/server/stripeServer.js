const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 8082;

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseServer = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

async function updateBookingPaymentStatus(bookingId, paymentIntentId, status) {
  if (!supabaseServer) {
    console.warn('Supabase server not configured - skipping booking update');
    return null;
  }

  const { data, error } = await supabaseServer
    .from('customer_bookings')
    .update({ 
      status,
      payment_intent_id: paymentIntentId,
      payment_confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (error) {
    console.error('Error updating booking payment status:', error);
    throw error;
  }

  return data;
}

app.use(cors());

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;
  
  try {
    const stripe = await getStripeClient();
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
    
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
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
  } catch (error) {
    console.error('Error processing webhook event:', error.message);
  }

  res.json({ received: true });
});

app.use(express.json());

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

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

async function getStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey);
}

async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

app.get('/api/stripe/config', async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error) {
    console.error('Error getting Stripe config:', error.message);
    res.status(500).json({ error: 'Failed to get Stripe configuration' });
  }
});

app.post('/api/stripe/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'gbp', bookingId, customerId, customerEmail } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const stripe = await getStripeClient();
    const amountInPence = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPence,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        bookingId: bookingId || '',
        customerId: customerId || '',
      },
      receipt_email: customerEmail,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error.message);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

app.post('/api/stripe/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, bookingId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    const stripe = await getStripeClient();
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
  } catch (error) {
    console.error('Error confirming payment:', error.message);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

app.post('/api/stripe/refund', async (req, res) => {
  try {
    const { paymentIntentId, amount, reason } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    const stripe = await getStripeClient();

    const refundParams = {
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
  } catch (error) {
    console.error('Error creating refund:', error.message);
    res.status(500).json({ error: error.message || 'Failed to create refund' });
  }
});

app.get('/api/stripe/payment-status/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    res.json({
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
    });
  } catch (error) {
    console.error('Error getting payment status:', error.message);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stripe payment server running on port ${PORT}`);
});
