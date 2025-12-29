# Supabase Edge Functions Deployment Guide

This guide explains how to deploy the Supabase Edge Functions for Run Courier.

## Prerequisites

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

## Required Secrets

Before deploying, set these secrets in your Supabase project:

```bash
# Set Stripe secret key
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxx

# Set Stripe webhook secret (after creating webhook in Stripe dashboard)
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Set Resend API key for emails
supabase secrets set RESEND_API_KEY=re_xxxxx
```

## Deploy Edge Functions

Deploy all functions:

```bash
supabase functions deploy create-job
supabase functions deploy update-job-status
supabase functions deploy assign-driver
supabase functions deploy stripe-create-payment-intent
supabase functions deploy stripe-webhook
supabase functions deploy send-email
```

Or deploy all at once:

```bash
supabase functions deploy
```

## Configure Stripe Webhook

1. Go to Stripe Dashboard > Webhooks
2. Add endpoint: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `checkout.session.completed`
   - `customer.created`
   - `customer.updated`
4. Copy the webhook signing secret and set it as a secret:
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

## Apply RLS Policies

1. Go to Supabase Dashboard > SQL Editor
2. Copy the contents of `rls-policies.sql`
3. Execute the SQL to apply all RLS policies

## Function URLs

After deployment, your functions will be available at:

- Create Job: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-job`
- Update Job Status: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/update-job-status`
- Assign Driver: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/assign-driver`
- Create Payment Intent: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-create-payment-intent`
- Stripe Webhook: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
- Send Email: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email`

## Frontend Integration

Update your frontend to call these Edge Functions instead of the Express backend API.

Example usage:

```typescript
import { supabase } from '@/lib/supabase';

// Create a job
const { data: session } = await supabase.auth.getSession();
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-job`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.session?.access_token}`,
    },
    body: JSON.stringify(jobData),
  }
);
const job = await response.json();
```

## Testing

Test functions locally before deployment:

```bash
supabase functions serve create-job --env-file .env.local
```

## Monitoring

View function logs:

```bash
supabase functions logs create-job
```

Or in the Supabase Dashboard > Edge Functions > Logs
