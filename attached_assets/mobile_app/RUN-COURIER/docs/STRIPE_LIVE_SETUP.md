# Stripe Live Mode Setup Guide

This guide explains how to configure Stripe Live mode for production payments.

## Prerequisites

1. A verified Stripe account
2. Your Replit app deployed (published)

## Step 1: Verify Stripe Connection in Replit

The app uses Replit's Stripe Connector which automatically manages your API keys.

1. In Replit, go to the **Integrations** panel
2. Ensure Stripe is connected for both development and production environments
3. The connector automatically detects production vs development based on deployment status

## Step 2: Configure Webhook (Required for Production)

Webhooks ensure reliable payment confirmation even if the customer closes their browser.

### Get Your Webhook URL

Your webhook URL will be:
```
https://YOUR-PUBLISHED-APP-URL:8082/api/stripe/webhook
```

Replace `YOUR-PUBLISHED-APP-URL` with your actual published Replit domain.

### Configure in Stripe Dashboard

1. Go to [Stripe Dashboard - Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter your webhook URL
4. Select these events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)

### Add Webhook Secret to Replit

1. In Replit, go to **Secrets** (lock icon)
2. Add a new secret:
   - Key: `STRIPE_WEBHOOK_SECRET`
   - Value: Your signing secret (whsec_...)
3. Restart your deployment

## Step 3: Test Live Payments

Before going fully live:

1. **Use Stripe Test Mode first** - The app automatically uses test keys in development
2. **Test a small payment** - Make a real payment with a small amount
3. **Verify webhook delivery** - Check Stripe dashboard for successful webhook deliveries
4. **Test refund flow** - Ensure refunds work correctly

## Payment Flow

1. Customer initiates payment in the app
2. App creates a PaymentIntent on the server (with bookingId in metadata)
3. Customer completes payment via Stripe's payment sheet
4. App verifies payment server-side before confirming success
5. Webhook provides backup confirmation (updates database if needed)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stripe/config` | GET | Get publishable key |
| `/api/stripe/create-payment-intent` | POST | Create new payment |
| `/api/stripe/confirm-payment` | POST | Verify payment status |
| `/api/stripe/refund` | POST | Create a refund |
| `/api/stripe/payment-status/:id` | GET | Get payment status |
| `/api/stripe/webhook` | POST | Receive Stripe events |

## Processing Refunds

To refund a payment:

```javascript
POST /api/stripe/refund
{
  "paymentIntentId": "pi_xxx",
  "amount": 10.00,  // Optional: partial refund amount in GBP
  "reason": "requested_by_customer"  // Optional
}
```

Reasons can be: `duplicate`, `fraudulent`, or `requested_by_customer`

## Troubleshooting

### Payment not showing as confirmed
- Check Stripe dashboard for payment status
- Verify webhook is receiving events (Stripe dashboard - Webhooks - Event logs)
- Ensure `STRIPE_WEBHOOK_SECRET` is correctly set

### Webhook errors
- Verify the webhook URL is accessible
- Check the signing secret is correct
- Look at server logs for error messages

### Keys not working in production
- Ensure Stripe integration is connected for production in Replit
- The app automatically uses live keys when deployed (`REPLIT_DEPLOYMENT === '1'`)

## Security Notes

- Never log or expose secret keys
- Webhook secret should only be in environment secrets
- All payment verification happens server-side
- Replit Connector manages key rotation automatically
