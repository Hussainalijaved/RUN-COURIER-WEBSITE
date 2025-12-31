# RUN COURIER — FULL SYSTEM HEALTH REPORT

**Report Date:** December 31, 2025  
**System:** Website (Hostinger) + Expo Mobile App (TestFlight)  
**Backend:** Supabase (Auth, Database, Storage, Realtime)

---

## SECTION 1 — SYSTEM SUMMARY

### Overall Health: ⚠️ WARNING

The system has a solid foundation with correct authentication and role-based architecture. However, several critical gaps prevent production readiness, particularly around push notifications, RLS enforcement, and payment webhook security.

### Main Risk Areas:
- Push notification infrastructure incomplete (missing database table)
- RLS policies reference non-existent columns in 2 tables
- Stripe webhook accepts unsigned requests without secret verification
- Realtime subscriptions lack proper cleanup on logout
- Mobile app needs iOS-specific foreground handling

---

## SECTION 2 — CONFIRMED OK

The following components appear correctly implemented:

### Authentication
- ✅ Supabase Auth correctly integrated in website and mobile app
- ✅ Website uses `anon` key (correct for client-side)
- ✅ Mobile app uses `anon` key (correct for client-side)
- ✅ Server uses `service_role` key for privileged operations
- ✅ Role system defined: `admin`, `driver`, `customer`, `dispatcher`, `vendor`
- ✅ User roles stored in `auth.users.user_metadata.role` and `public.users.role`
- ✅ JWT verification implemented in `server/supabaseAdmin.ts`

### Database Structure
- ✅ All core tables exist: `users`, `drivers`, `jobs`, `job_assignments`, `documents`, `notifications`, `invoices`, `driver_applications`, `delivery_contacts`
- ✅ UUID primary keys used consistently
- ✅ Timestamps present on all tables (`created_at`)
- ✅ Proper snake_case naming in database
- ✅ TypeScript models properly mapped with camelCase

### Storage
- ✅ Storage buckets defined: `driver-documents`, `pod-images`, `profile-pictures`
- ✅ File size limits configured (10MB documents, 5MB POD, 2MB profile pics)
- ✅ MIME type restrictions in place
- ✅ Signed URL generation implemented

### Mobile API
- ✅ Authentication middleware properly validates Supabase JWT
- ✅ Driver role verification before sensitive operations
- ✅ POD upload to Supabase Storage working
- ✅ Job status transition validation implemented
- ✅ Valid state machine for job status changes

### Payments
- ✅ Stripe webhook updates database on payment events
- ✅ Payment status stored in `jobs` table as source of truth
- ✅ Webhook handles `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed`

### Realtime
- ✅ Realtime subscriptions exist for jobs and job assignments
- ✅ Proper cleanup on component unmount (`supabase.removeChannel`)
- ✅ Query invalidation on realtime events

---

## SECTION 3 — ISSUES FOUND

### ISSUE 1: Missing `driver_devices` Table

**Severity:** P0 (CRITICAL)

**Impact:**
- Push notifications completely broken
- Mobile app cannot register device tokens
- Drivers will not receive job offer notifications
- Critical for driver engagement and job acceptance rates

**Root Cause:**
The `server/pushNotifications.ts` file attempts to query/insert into a `driver_devices` table that does not exist in Supabase. The error handling shows "Table not configured" message.

**Required Action:**
Create the `driver_devices` table in Supabase with columns for `id`, `driver_id`, `push_token`, `platform`, `app_version`, `device_info`, `last_seen_at`, and `created_at`. Add RLS policies for drivers to manage their own devices.

---

### ISSUE 2: RLS Policies Reference Wrong Columns

**Severity:** P0 (CRITICAL)

**Impact:**
- `documents` table: Drivers cannot view/upload their own documents
- `delivery_contacts` table: Customers cannot manage their saved contacts
- Features appear broken even though data exists

**Root Cause:**
- `documents` table policies use `user_id` column but table has `driver_id`
- `delivery_contacts` table policies use `user_id` column but table has `customer_id`

**Required Action:**
Update RLS policies to reference correct column names:
- `documents` → change `user_id` to `driver_id`
- `delivery_contacts` → change `user_id` to `customer_id`

---

### ISSUE 3: RLS Enabled Status Unknown

**Severity:** P0 (CRITICAL)

**Impact:**
- If RLS is disabled, ALL data is exposed to ALL authenticated users
- Complete data breach risk
- Drivers could see other drivers' data
- Customers could access all jobs

**Root Cause:**
RLS policies are defined in SQL files but we cannot verify if `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` was actually executed on each table.

**Required Action:**
Run verification query in Supabase SQL Editor to confirm RLS is ENABLED on all tables. If any table shows `rowsecurity = false`, enable RLS on that table.

---

### ISSUE 4: Stripe Webhook Accepts Unsigned Events

**Severity:** P0 (CRITICAL)

**Impact:**
- Attackers can send fake payment confirmations
- Jobs could be marked as paid without actual payment
- Financial fraud risk

**Root Cause:**
In `stripe-webhook/index.ts` lines 49-51, if `STRIPE_WEBHOOK_SECRET` is not set, the webhook falls back to parsing the body directly without signature verification.

**Required Action:**
Set `STRIPE_WEBHOOK_SECRET` as a required environment variable. Reject all webhook requests if the secret is not configured.

---

### ISSUE 5: No Realtime Cleanup on Logout

**Severity:** P1 (HIGH)

**Impact:**
- Stale subscriptions after logout
- Memory leaks
- Potential data leakage if user logs out and another user logs in
- Subscriptions may show data from previous session

**Root Cause:**
No auth state change listener that calls `supabase.removeAllChannels()` on `SIGNED_OUT` event.

**Required Action:**
Add auth state listener in the main app context that removes all realtime channels when user signs out.

---

### ISSUE 6: POD Bucket Inconsistently Configured

**Severity:** P1 (HIGH)

**Impact:**
- POD images may be publicly accessible
- Privacy violation for delivery recipients
- Signature images exposed

**Root Cause:**
`mobileRoutes.ts` creates bucket with `public: true` while storage migration file specifies `public: false`. Inconsistent configuration.

**Required Action:**
Verify POD images bucket is set to private in Supabase. Only authenticated users with appropriate roles should access POD images.

---

### ISSUE 7: Mobile App Mock Client Fallback

**Severity:** P1 (HIGH)

**Impact:**
- Real connection errors masked
- Debugging difficult
- App may appear to work when it's not actually connecting

**Root Cause:**
Mobile app `supabase.ts` has mock client fallback that silently handles errors without logging.

**Required Action:**
Add proper error logging even when using mock client. Surface connection issues to developers via console logs.

---

### ISSUE 8: No iOS Foreground Reconnection

**Severity:** P1 (HIGH)

**Impact:**
- Realtime subscriptions die when iOS app goes to background
- Returning to app shows stale data
- Job offers not received until manual refresh
- Poor user experience on iOS

**Root Cause:**
No `AppState` listener to reconnect Supabase realtime when app returns to foreground.

**Required Action:**
Add AppState event listener that calls `supabase.realtime.connect()` when app state changes to 'active'.

---

### ISSUE 9: Realtime Subscriptions Not Filtered by User

**Severity:** P1 (HIGH)

**Impact:**
- All users subscribed to ALL jobs changes
- Potential information leakage via realtime payload
- Performance impact from unnecessary updates

**Root Cause:**
`useRealtimeJobs.ts` subscribes to all changes on `jobs` table without filtering by `customer_id` or `driver_id`.

**Required Action:**
Add filter to realtime subscriptions so users only receive updates for jobs they own or are assigned to.

---

### ISSUE 10: Missing Foreign Key Constraints

**Severity:** P2 (MEDIUM)

**Impact:**
- Orphaned records possible (e.g., documents without drivers)
- Data integrity issues
- Cascading deletes not automatic

**Root Cause:**
Tables like `documents`, `notifications`, `job_assignments` don't have explicit foreign key constraints to parent tables.

**Required Action:**
Add foreign key constraints with appropriate `ON DELETE` behavior (CASCADE or SET NULL depending on business logic).

---

### ISSUE 11: Inconsistent Timeout Handling

**Severity:** P2 (MEDIUM)

**Impact:**
- Some screens may hang indefinitely
- Poor user experience on slow networks
- No feedback to user when requests fail

**Root Cause:**
`fetchWithTimeout` helper exists but not consistently used across all API calls.

**Required Action:**
Wrap all Supabase queries with consistent timeout handling. Display appropriate error UI when timeout occurs.

---

### ISSUE 12: No Role Sync Trigger

**Severity:** P2 (MEDIUM)

**Impact:**
- If admin changes user role in `users` table, JWT still has old role
- User must log out and log back in for role change to take effect

**Root Cause:**
No database trigger to sync role changes from `users` table to `auth.users.raw_user_meta_data`.

**Required Action:**
Create trigger function that updates `auth.users` metadata when `users.role` is updated.

---

## SECTION 4 — APP STORE RISK ASSESSMENT

### Risk 1: App Hang on Network Failure

**Issue:** If Supabase is unreachable, screens may show infinite loading spinners without timeout.

**Why Apple Would Reject:** Apps that freeze or don't respond are rejected. Apple requires graceful degradation and user feedback.

**Mitigation Required:** Add timeout handling to all network requests. Show error messages and retry options.

---

### Risk 2: Missing Offline Mode Handling

**Issue:** App requires network connectivity with no offline fallback.

**Why Apple Would Reject:** While not strictly required, apps that crash or become unusable without network are poorly reviewed and may be rejected for poor user experience.

**Mitigation Required:** Add network connectivity check. Display friendly message when offline rather than errors.

---

### Risk 3: Push Notification Permission Without Feature

**Issue:** App requests push notification permission but notifications don't work (missing database table).

**Why Apple Would Reject:** Apps that request permissions for features that don't work may be rejected.

**Mitigation Required:** Fix push notification infrastructure before production release.

---

### Risk 4: Potential Data Privacy Concerns

**Issue:** If RLS is not properly enabled, user data could leak between accounts.

**Why Apple Would Reject:** Privacy violations are grounds for immediate rejection and potential developer account action.

**Mitigation Required:** Verify RLS is enabled and policies work correctly.

---

## SECTION 5 — PRIORITY ACTION PLAN

Execute these actions in order to stabilize the system:

### Priority 1: Critical Database Fixes
1. **Create `driver_devices` table** — Required for push notifications to function
2. **Verify RLS is ENABLED** — Run verification query on all tables
3. **Fix RLS policy column references** — Update `documents` and `delivery_contacts` policies

### Priority 2: Security Hardening
4. **Require Stripe webhook secret** — Make `STRIPE_WEBHOOK_SECRET` mandatory
5. **Verify POD bucket is private** — Check and fix storage bucket access

### Priority 3: iOS Stability
6. **Add auth logout cleanup** — Remove realtime channels on sign out
7. **Add iOS foreground handler** — Reconnect realtime when app returns from background
8. **Add network request timeouts** — Prevent infinite loading states

### Priority 4: Data Integrity
9. **Filter realtime subscriptions** — Users only receive their own data updates
10. **Add foreign key constraints** — Prevent orphaned records
11. **Create role sync trigger** — Keep auth metadata in sync with users table

### Priority 5: Production Polish
12. **Remove mock client fallback** — Or add proper error logging
13. **Add offline mode messaging** — Friendly UX when network unavailable

---

## INFORMATION REQUIRED TO COMPLETE AUDIT

The following information could not be verified from codebase review alone:

1. **Supabase Dashboard Verification Needed:**
   - Actual RLS enabled/disabled status per table
   - Storage bucket public/private settings
   - Edge Function environment variables set

2. **Production Environment:**
   - Is `STRIPE_WEBHOOK_SECRET` set in production?
   - Is webhook URL configured in Stripe dashboard?
   - Are all required environment variables present?

3. **Data State:**
   - Are there existing orphaned records in the database?
   - Are there duplicate device tokens?
   - What is the current state of payment statuses?

4. **TestFlight Specific:**
   - What iOS versions are being tested?
   - Are push notification certificates configured correctly in Apple Developer Console?
   - Is APNs correctly configured with Expo?

---

**END OF SYSTEM HEALTH REPORT**

*This report is for informational purposes only. No code was modified during this audit.*
