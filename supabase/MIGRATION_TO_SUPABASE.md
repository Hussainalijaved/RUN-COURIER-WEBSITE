# Migrating Run Courier to Supabase-Only Storage

This guide explains how to migrate all data from Replit's local database to Supabase, so you can close your Replit account.

## Overview

Currently, data is split between:
- **Replit local PostgreSQL**: users, drivers (extended), documents, jobs, notifications, invoices, etc.
- **Supabase**: authentication, partial driver data, partial job data

After migration, **everything** will be in Supabase.

## Step 1: Run Schema Migration

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Copy the contents of `supabase/migrations/001_full_schema.sql`
5. Paste and run it

This creates all the tables needed for the full application.

## Step 2: Set Up Storage Buckets

1. In the SQL Editor, copy and run `supabase/migrations/002_storage_buckets.sql`
2. This creates storage buckets for:
   - `driver-documents` - Driver licenses, insurance, DBS certificates
   - `pod-images` - Proof of delivery photos
   - `profile-pictures` - Driver profile photos

## Step 3: Apply RLS Policies

1. In the SQL Editor, copy and run `supabase/rls-policies.sql`
2. This secures all tables with Row Level Security

## Step 4: Export Data from Replit

Before closing Replit, export your data:

### Export via API (Recommended)
The app has export endpoints you can call:

```bash
# Export all drivers
curl https://your-replit-app.replit.app/api/drivers > drivers.json

# Export all users  
curl https://your-replit-app.replit.app/api/users > users.json

# Export all documents
curl https://your-replit-app.replit.app/api/documents > documents.json

# Export all jobs
curl https://your-replit-app.replit.app/api/jobs > jobs.json
```

### Download Document Files
Document files are stored in `/uploads/documents/` on Replit. Download this folder before closing your account.

## Step 5: Import Data to Supabase

Use the Supabase dashboard or API to import your exported data:

1. Go to **Table Editor** in Supabase
2. For each table, click **Insert** > **Import from JSON/CSV**
3. Upload your exported files

### Upload Documents to Storage
1. Go to **Storage** in Supabase
2. Open the `driver-documents` bucket
3. Create folders for each driver (using their UUID)
4. Upload their document files
5. Update the `file_url` in the documents table to point to Supabase Storage URLs

## Step 6: Update Environment Variables

When hosting on another platform (like Hostinger), you only need these environment variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=your-stripe-key
STRIPE_PUBLISHABLE_KEY=your-publishable-key
RESEND_API_KEY=your-resend-key
GOOGLE_MAPS_API_KEY=your-maps-key
```

## Step 7: Deploy Edge Functions

Deploy all Supabase Edge Functions:

```bash
supabase functions deploy create-driver
supabase functions deploy update-driver
supabase functions deploy delete-driver
supabase functions deploy create-job
supabase functions deploy update-job-status
supabase functions deploy assign-driver
supabase functions deploy withdraw-assignment
supabase functions deploy stripe-create-payment-intent
supabase functions deploy stripe-webhook
supabase functions deploy send-email
```

## Tables Summary

After migration, Supabase will have these tables:

| Table | Description |
|-------|-------------|
| `users` | All customer, admin, dispatcher accounts |
| `drivers` | Driver profiles with full details |
| `jobs` | All delivery jobs |
| `job_assignments` | Job-to-driver assignments |
| `multi_drop_stops` | Multi-drop delivery stops |
| `documents` | Driver document metadata |
| `notifications` | User notifications |
| `invoices` | Customer invoices |
| `driver_applications` | Pending driver applications |
| `delivery_contacts` | Saved delivery addresses |
| `driver_payments` | Driver payment records |
| `payment_links` | Payment link tokens |
| `vehicles` | Vehicle type configurations |
| `pricing_settings` | Pricing rules |
| `vendor_api_keys` | Vendor API keys |

## Storage Buckets

| Bucket | Description |
|--------|-------------|
| `driver-documents` | Private - driver licenses, insurance, DBS |
| `pod-images` | Private - proof of delivery photos |
| `profile-pictures` | Public - driver profile photos |

## Important Notes

1. **Driver IDs**: The `driver_id` field in Supabase (RC##L format) remains the permanent identifier
2. **Authentication**: Users authenticate via Supabase Auth - no passwords stored in users table
3. **Edge Functions**: All sensitive operations go through Edge Functions for security
4. **RLS**: Row Level Security ensures users can only access their own data

## Support

If you need help with the migration, the Edge Functions handle most operations. The mobile app and website both use the same Supabase backend.
