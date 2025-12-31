# Run Courier - Full System Audit Report

**Date:** December 31, 2025  
**Auditor:** Systems Audit  
**Scope:** End-to-end production readiness for Supabase-only architecture

---

## Executive Summary

The Run Courier platform has made significant progress in migrating to a Supabase-only backend. However, several critical issues need addressing before production deployment, particularly around RLS policy application and missing database tables.

---

## 1. AUTH & IDENTITY

### OK
- Supabase Auth is correctly configured in both website (`client/src/lib/supabase.ts`) and mobile app (`attached_assets/mobile_app/RUN-COURIER/lib/supabase.ts`)
- Website uses `anon` key (CORRECT)
- Mobile app uses `anon` key (CORRECT)
- Server uses `service_role` key only for privileged operations (CORRECT)
- Role system defined: `admin`, `driver`, `customer`, `dispatcher`, `vendor`
- User roles stored in both `auth.users.user_metadata.role` AND `public.users.role` table
- Token verification properly implemented in `server/supabaseAdmin.ts` with fallback to JWT payload

### MISSING
- **P1**: No server-side role validation middleware for web API routes - routes rely on frontend checks
- **P2**: No trigger to sync `auth.users.user_metadata.role` changes to `public.users.role`

### RISKY
- **P0**: JWT fallback logic (lines 56-74 in `supabaseAdmin.ts`) could allow stale role access if token is valid but user was deleted

### Recommended Fix - Role Sync Trigger:
```sql
-- Create trigger to sync role changes from users table to auth metadata
CREATE OR REPLACE FUNCTION sync_user_role_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = 
    jsonb_set(raw_user_meta_data, '{role}', to_jsonb(NEW.role))
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_role_update ON public.users;
CREATE TRIGGER on_user_role_update
  AFTER UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_role_to_auth();
```

---

## 2. DATABASE & DATA INTEGRITY

### OK
- All critical tables defined in `shared/schema.ts` and `supabase/migrations/001_full_schema.sql`:
  - `users`, `drivers`, `jobs`, `job_assignments`, `documents`, `notifications`
  - `invoices`, `driver_applications`, `delivery_contacts`, `driver_payments`, `payment_links`
- All tables have `created_at` timestamps
- UUID primary keys used consistently
- Column naming follows snake_case in DB, camelCase in TypeScript (properly mapped in `supabaseStorage.ts`)

### MISSING
- **P0**: `driver_devices` table for push notifications NOT created in Supabase
- **P1**: Missing foreign key constraints on several tables (documents.driver_id, notifications.user_id, etc.)
- **P2**: Missing indexes on frequently queried columns

### BROKEN
- **P0**: Push notification registration fails with "Table not configured" error (line 91-92 `pushNotifications.ts`)

### Recommended Fix - Create driver_devices Table:
```sql
-- P0 FIX: Create driver_devices table for push notifications
CREATE TABLE IF NOT EXISTS public.driver_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL,
    push_token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    app_version TEXT,
    device_info TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(driver_id, push_token)
);

-- Index for fast lookups
CREATE INDEX idx_driver_devices_driver_id ON driver_devices(driver_id);

-- Enable RLS
ALTER TABLE driver_devices ENABLE ROW LEVEL SECURITY;

-- Drivers can manage their own devices
CREATE POLICY "drivers_manage_own_devices" ON driver_devices
  FOR ALL USING (auth.uid() = driver_id);

-- Admins can view all devices
CREATE POLICY "admins_view_all_devices" ON driver_devices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
```

### Recommended Fix - Add Missing Foreign Keys:
```sql
-- Add foreign key constraints (run after verifying data integrity)
ALTER TABLE public.documents
  ADD CONSTRAINT fk_documents_driver 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD CONSTRAINT fk_notifications_user 
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.job_assignments
  ADD CONSTRAINT fk_job_assignments_job 
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

ALTER TABLE public.job_assignments
  ADD CONSTRAINT fk_job_assignments_driver 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
```

---

## 3. ROW LEVEL SECURITY (RLS)

### OK
- RLS policies defined in `supabase/rls-policies.sql`
- Helper function `auth.user_role()` created for role checks
- Comprehensive policies for all major tables

### RISKY
- **P0**: CANNOT verify if RLS is actually ENABLED on tables - policies may exist but RLS might be OFF
- **P1**: `documents` table policy references `user_id` column which doesn't exist (should be `driver_id`)
- **P1**: `delivery_contacts` table policy references `user_id` column which doesn't exist (should be `customer_id`)

### BROKEN - Policy Fixes Required:
```sql
-- FIX: Documents table - wrong column reference
DROP POLICY IF EXISTS "documents_select_driver" ON documents;
CREATE POLICY "documents_select_driver" ON documents
  FOR SELECT USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "documents_insert_driver" ON documents;
CREATE POLICY "documents_insert_driver" ON documents
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

-- FIX: Delivery contacts - wrong column reference
DROP POLICY IF EXISTS "delivery_contacts_select_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_select_own" ON delivery_contacts
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "delivery_contacts_insert_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_insert_own" ON delivery_contacts
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "delivery_contacts_update_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_update_own" ON delivery_contacts
  FOR UPDATE USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "delivery_contacts_delete_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_delete_own" ON delivery_contacts
  FOR DELETE USING (auth.uid() = customer_id);
```

### Verification Script (Run in Supabase SQL Editor):
```sql
-- Check RLS status for all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- If rowsecurity is FALSE for any table, run:
-- ALTER TABLE <tablename> ENABLE ROW LEVEL SECURITY;
```

---

## 4. STORAGE (FILES)

### OK
- Storage buckets defined:
  - `driver-documents` (private, 10MB limit)
  - `pod-images` (private, 5MB limit)
  - `profile-pictures` (public, 2MB limit)
- Storage policies exist for upload/download by role
- Signed URLs implemented in `client/src/lib/supabase.ts` (getSignedUrl function)

### MISSING
- **P2**: No cleanup mechanism for orphaned files when jobs/documents are deleted

### RISKY
- **P1**: `pod-images` bucket created as `public: true` in `mobileRoutes.ts` line 77, but should be private
- **P1**: Inconsistent bucket naming: `pod-images` vs `pod-photos` in different files

### Recommended Fix:
```sql
-- Ensure pod-images bucket is private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'pod-images';

-- Add policy for pod-images (if not exists)
CREATE POLICY "pod_images_driver_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pod-images');

CREATE POLICY "pod_images_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pod-images');
```

---

## 5. REALTIME

### OK
- Realtime subscriptions implemented in `client/src/hooks/useRealtimeJobs.ts` and `useRealtimeDrivers.ts`
- Proper cleanup on unmount (`supabase.removeChannel(channel)`)
- Query invalidation on changes

### MISSING
- **P1**: No auth state change listener to unsubscribe on logout
- **P2**: No reconnection logic on app foreground (critical for iOS)

### RISKY
- **P1**: Subscriptions in `useRealtimeJobs.ts` subscribe to ALL jobs changes, not filtered by user - could expose data via realtime events

### Recommended Fix - Logout Cleanup:
```typescript
// In client/src/context/AuthContext.tsx or equivalent
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      // Remove all realtime channels
      supabase.removeAllChannels();
    }
  });
  
  return () => subscription.unsubscribe();
}, []);
```

### Recommended Fix - Mobile App Foreground Reconnect:
```typescript
// In mobile app - add AppState listener
import { AppState } from 'react-native';

useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.realtime.connect();
    }
  });
  return () => subscription.remove();
}, []);
```

---

## 6. FRONTEND DATA FLOW

### OK
- TanStack Query used for data fetching with proper loading states
- Error handling present in most API calls
- `fetchWithTimeout` helper exists (15 second default)

### RISKY
- **P1**: Some screens may hang if Supabase queries fail without timeout
- **P2**: Mock client fallback in mobile app could mask connection issues

### File-Level Issues:
| File | Issue | Severity |
|------|-------|----------|
| `client/src/lib/supabase.ts` | `fetchWithTimeout` not used consistently | P2 |
| Mobile `supabase.ts` | Mock client fallback hides real errors | P1 |

### Recommended Fix - Consistent Timeout:
```typescript
// Wrap all Supabase queries with timeout
const safeQuery = async <T>(queryFn: () => Promise<T>, timeoutMs = 10000): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const result = await queryFn();
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
};
```

---

## 7. PAYMENTS (STRIPE)

### OK
- Stripe webhook properly configured in `supabase/functions/stripe-webhook/index.ts`
- Webhook updates DB on:
  - `payment_intent.succeeded` → `payment_status: 'paid'`
  - `payment_intent.payment_failed` → `payment_status: 'failed'`
  - `checkout.session.completed` → marks job as paid
- Webhook signature verification implemented
- DB is source of truth for payment status

### MISSING
- **P1**: Missing `stripe_session_id` column referenced in webhook (line 103)
- **P2**: No retry logic for failed webhook processing

### RISKY
- **P0**: Webhook Secret (`STRIPE_WEBHOOK_SECRET`) optional - webhook can process unsigned events (line 49-51)

### Recommended Fix:
```sql
-- Add missing column if not exists
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
```

```typescript
// Make webhook secret required in production
if (!webhookSecret) {
  console.error("STRIPE_WEBHOOK_SECRET not configured - rejecting webhook");
  return new Response(JSON.stringify({ error: "Webhook not configured" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

## 8. APP STORE / PRODUCTION READINESS

### OK
- Mobile app uses proper platform detection
- AsyncStorage for session persistence
- Expo Push Notifications configured

### BROKEN
- **P0**: Push notifications fail - `driver_devices` table doesn't exist

### RISKY
- **P1**: Mock Supabase client in mobile app masks real connection failures
- **P1**: No network connectivity check before API calls
- **P2**: No graceful degradation for offline mode

### iOS-Specific Fixes Required:
1. Add network reachability check before Supabase calls
2. Implement foreground app state handler for realtime reconnection
3. Add loading timeouts (max 10 seconds) on all screens

---

## PRIORITY FIX LIST

### P0 - CRITICAL (Must Fix Before Production)
| Issue | Location | Fix |
|-------|----------|-----|
| `driver_devices` table missing | Supabase DB | Run CREATE TABLE SQL above |
| RLS may not be enabled | Supabase DB | Run verification script above |
| Webhook accepts unsigned events | `stripe-webhook/index.ts` | Require STRIPE_WEBHOOK_SECRET |
| Push notifications broken | All | Create driver_devices table |

### P1 - HIGH (Fix Within 1 Week)
| Issue | Location | Fix |
|-------|----------|-----|
| Wrong column in RLS policies | `documents`, `delivery_contacts` | Run policy fix SQL |
| No logout realtime cleanup | Website auth context | Add SIGNED_OUT handler |
| No foreground reconnect | Mobile app | Add AppState listener |
| POD bucket created as public | `mobileRoutes.ts` | Set public: false |
| Mock client masks errors | Mobile supabase.ts | Add error logging even in mock |

### P2 - MEDIUM (Fix Within 1 Month)
| Issue | Location | Fix |
|-------|----------|-----|
| Missing foreign key constraints | Multiple tables | Run ALTER TABLE SQL |
| Inconsistent timeout usage | Frontend queries | Wrap with safeQuery |
| No orphan file cleanup | Storage buckets | Create cleanup function |
| Missing indexes | Frequently queried columns | Create indexes |

---

## FINAL VERIFICATION CHECKLIST

Before going live, verify each item:

### Database
- [ ] All tables exist in Supabase (run `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
- [ ] `driver_devices` table created
- [ ] RLS enabled on ALL tables (verify with script above)
- [ ] All RLS policies created and correct

### Authentication
- [ ] Login works for all roles (admin, driver, customer)
- [ ] Role stored in both auth metadata AND users table
- [ ] Logout clears session completely

### Storage
- [ ] All buckets created (driver-documents, pod-images, profile-pictures)
- [ ] pod-images bucket is PRIVATE
- [ ] Drivers can upload documents
- [ ] Admins can view all documents

### Realtime
- [ ] Job updates broadcast to admin dashboard
- [ ] Driver receives assignment notifications
- [ ] Subscriptions cleaned up on logout

### Payments
- [ ] STRIPE_WEBHOOK_SECRET is set
- [ ] Webhook URL configured in Stripe dashboard
- [ ] Test payment flows end-to-end

### Mobile App
- [ ] Login works on iOS and Android
- [ ] Push notifications received
- [ ] App doesn't freeze on slow network
- [ ] POD photos upload to Supabase Storage

### Website
- [ ] All dashboards load without infinite spinners
- [ ] Admin can create/assign jobs
- [ ] Customer can track jobs
- [ ] Driver documents visible to admin

---

## SQL SCRIPT - COMPLETE FIX PACKAGE

Run this entire script in Supabase SQL Editor:

```sql
-- ================================================
-- RUN COURIER - COMPLETE FIX PACKAGE
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Create missing driver_devices table
CREATE TABLE IF NOT EXISTS public.driver_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL,
    push_token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    app_version TEXT,
    device_info TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(driver_id, push_token)
);
CREATE INDEX IF NOT EXISTS idx_driver_devices_driver_id ON driver_devices(driver_id);

-- 2. Add missing stripe_session_id column
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- 3. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_devices ENABLE ROW LEVEL SECURITY;

-- 4. Fix documents policies (use driver_id not user_id)
DROP POLICY IF EXISTS "documents_select_driver" ON documents;
CREATE POLICY "documents_select_driver" ON documents
  FOR SELECT USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "documents_insert_driver" ON documents;
CREATE POLICY "documents_insert_driver" ON documents
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

-- 5. Fix delivery_contacts policies (use customer_id not user_id)
DROP POLICY IF EXISTS "delivery_contacts_select_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_select_own" ON delivery_contacts
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "delivery_contacts_insert_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_insert_own" ON delivery_contacts
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "delivery_contacts_update_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_update_own" ON delivery_contacts
  FOR UPDATE USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "delivery_contacts_delete_own" ON delivery_contacts;
CREATE POLICY "delivery_contacts_delete_own" ON delivery_contacts
  FOR DELETE USING (auth.uid() = customer_id);

-- 6. Add driver_devices policies
DROP POLICY IF EXISTS "drivers_manage_own_devices" ON driver_devices;
CREATE POLICY "drivers_manage_own_devices" ON driver_devices
  FOR ALL USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "admins_view_all_devices" ON driver_devices;
CREATE POLICY "admins_view_all_devices" ON driver_devices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- 7. Ensure pod-images bucket is private
UPDATE storage.buckets SET public = false WHERE id = 'pod-images';

-- 8. Verify RLS status (run separately to check)
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

SELECT 'FIX PACKAGE COMPLETE - Run the verification query above to confirm RLS status' AS status;
```

---

**End of Audit Report**
