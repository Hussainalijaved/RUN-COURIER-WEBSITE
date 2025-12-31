# CRITICAL: Mobile App Price Isolation Fix

## Problem Summary
Drivers are seeing customer prices instead of driver prices because the mobile app:
1. Uses `.select('*')` which fetches ALL columns including `total_price`
2. Displays `price_customer` / `price` instead of `driver_price`

## Files That Need Changes

### 1. lib/supabase.ts - Add driver_price to Job type

**Location:** Around line 265-310 in the `Job` type definition

**Add this field** after `price?: number;`:
```typescript
driver_price?: number;  // ADD THIS - The price admin sets for driver (ONLY this should be displayed)
```

**Full Job type should look like:**
```typescript
export type Job = {
  id: string | number;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  pickup_latitude?: number;
  pickup_longitude?: number;
  delivery_latitude?: number;
  delivery_longitude?: number;
  price_customer?: number;  // NEVER display this to drivers!
  notes?: string;
  parcel_weight?: number;
  priority?: string;
  vehicle_type?: string;
  scheduled_pickup_time?: string;
  status: JobStatus;
  driver_id: string | null;
  tracking_number?: string;
  created_at: string;
  updated_at?: string;
  rejection_reason?: string;
  pod_photo_url?: string;
  pod_photos?: string[];
  pod_signature_url?: string;
  pod_notes?: string;
  recipient_name?: string;
  signature_data?: string;
  delivered_at?: string;
  pickup_postcode?: string;
  delivery_postcode?: string;
  delivery_address?: string;
  pickup_instructions?: string;
  delivery_instructions?: string;
  pickup_contact_name?: string;
  pickup_contact_phone?: string;
  distance?: number;
  price?: number;  // NEVER display this to drivers!
  driver_price?: number;  // THIS is what drivers should see
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  sender_name?: string;
  sender_phone?: string;
  recipient_phone?: string;
  assigned_driver_id?: string | null;
  current_latitude?: number;
  current_longitude?: number;
  last_location_update?: string;
  pickup_barcode?: string;
  delivery_barcode?: string;
  failure_reason?: string;
};
```

---

### 1b. lib/supabase.ts (or create lib/constants.ts) - Add Shared Column Constant

Add this constant that can be reused across all screens:

```typescript
// SECURITY: Driver-safe job columns - NEVER include total_price, price_customer, base_price, etc.
// This list includes both new column names (pickup_latitude) and legacy names (pickup_lat) for compatibility
export const DRIVER_SAFE_JOB_COLUMNS = 'id,tracking_number,status,driver_price,vehicle_type,priority,pickup_address,pickup_postcode,pickup_latitude,pickup_longitude,pickup_lat,pickup_lng,pickup_instructions,pickup_contact_name,pickup_contact_phone,delivery_address,delivery_postcode,delivery_latitude,delivery_longitude,dropoff_lat,dropoff_lng,dropoff_address,delivery_instructions,recipient_name,recipient_phone,sender_name,sender_phone,parcel_weight,distance,scheduled_pickup_time,pod_signature_url,pod_photo_url,pod_photos,pod_notes,notes,created_at,updated_at,driver_id,rejection_reason,delivered_at';
```

Then import this constant in each screen:
```typescript
import { DRIVER_SAFE_JOB_COLUMNS } from '@/lib/supabase';
```

---

### 2. screens/driver/JobOffersScreen.tsx

#### Fix A: Change select('*') to explicit columns (around line 327-332)

**BEFORE:**
```typescript
const queryPromise = supabase
  .from('jobs')
  .select('*')
  .in('driver_id', allDriverIds)
  .in('status', ['assigned', 'offered'])
  .order('created_at', { ascending: false });
```

**AFTER:**
```typescript
// SECURITY: Only select driver-safe columns - NEVER include total_price/price_customer
// IMPORTANT: No spaces or newlines in column list - Supabase will error on whitespace
const DRIVER_SAFE_JOB_COLUMNS = 'id,tracking_number,status,driver_price,vehicle_type,priority,pickup_address,pickup_postcode,pickup_latitude,pickup_longitude,pickup_lat,pickup_lng,pickup_instructions,pickup_contact_name,pickup_contact_phone,delivery_address,delivery_postcode,delivery_latitude,delivery_longitude,dropoff_lat,dropoff_lng,dropoff_address,delivery_instructions,recipient_name,recipient_phone,sender_name,sender_phone,parcel_weight,distance,scheduled_pickup_time,pod_signature_url,pod_photo_url,pod_photos,pod_notes,notes,created_at,updated_at,driver_id,rejection_reason';

const queryPromise = supabase
  .from('jobs')
  .select(DRIVER_SAFE_JOB_COLUMNS)
  .in('driver_id', allDriverIds)
  .in('status', ['assigned', 'offered'])
  .not('driver_price', 'is', null)  // Only show jobs with admin-assigned price
  .order('created_at', { ascending: false });
```

#### Fix B: Change price display (around line 628)

**BEFORE:**
```typescript
const jobPrice = job.price_customer ?? job.price ?? 0;
```

**AFTER:**
```typescript
const jobPrice = job.driver_price ?? 0;  // CRITICAL: Only show admin-assigned driver price
```

#### Fix C: Change price in email (around line 527)

**BEFORE:**
```typescript
price: selectedJob.price_customer ?? selectedJob.price ?? 0,
```

**AFTER:**
```typescript
price: selectedJob.driver_price ?? 0,  // Use driver price for rejection email
```

---

### 3. screens/driver/ActiveJobScreen.tsx

#### Fix A: Change select('*') (around line 159)

**BEFORE:**
```typescript
.select('*')
```

**AFTER:**
```typescript
// SECURITY: Only select driver-safe columns - NO WHITESPACE IN COLUMN LIST
.select('id,tracking_number,status,driver_price,vehicle_type,priority,pickup_address,pickup_postcode,pickup_latitude,pickup_longitude,pickup_lat,pickup_lng,pickup_instructions,pickup_contact_name,pickup_contact_phone,delivery_address,delivery_postcode,delivery_latitude,delivery_longitude,dropoff_lat,dropoff_lng,dropoff_address,delivery_instructions,recipient_name,recipient_phone,sender_name,sender_phone,parcel_weight,distance,scheduled_pickup_time,pod_signature_url,pod_photo_url,pod_photos,pod_notes,notes,created_at,updated_at,driver_id,rejection_reason,delivered_at')
```

#### Fix B: Change price display (around line 1590)

**BEFORE:**
```typescript
£{(activeJob.price_customer ?? activeJob.price ?? 0).toFixed(2)}
```

**AFTER:**
```typescript
£{(activeJob.driver_price ?? 0).toFixed(2)}
```

---

### 4. screens/driver/CompletedJobsScreen.tsx

#### Fix A: Change select('*') (around line 33)

**BEFORE:**
```typescript
.select('*')
```

**AFTER:**
```typescript
// SECURITY: Only select driver-safe columns - NO WHITESPACE IN COLUMN LIST
.select('id,tracking_number,status,driver_price,vehicle_type,pickup_address,pickup_postcode,delivery_address,delivery_postcode,dropoff_address,scheduled_pickup_time,delivered_at,pod_signature_url,pod_photo_url,pod_photos,pod_notes,created_at,updated_at,driver_id,rejection_reason')
```

#### Fix B: Change earnings calculation (around line 43)

**BEFORE:**
```typescript
const earnings = deliveredJobs.reduce((sum: number, job: Job) => sum + (job.price_customer ?? job.price ?? 0), 0);
```

**AFTER:**
```typescript
const earnings = deliveredJobs.reduce((sum: number, job: Job) => sum + (job.driver_price ?? 0), 0);
```

#### Fix C: Change price display in list (around line 152)

**BEFORE:**
```typescript
£{(job.price_customer ?? job.price ?? 0).toFixed(2)}
```

**AFTER:**
```typescript
£{(job.driver_price ?? 0).toFixed(2)}
```

---

## Summary of All Changes

| File | Line | Change |
|------|------|--------|
| lib/supabase.ts | ~296 | Add `driver_price?: number;` to Job type |
| lib/supabase.ts | end of file | Add `DRIVER_SAFE_JOB_COLUMNS` constant |
| JobOffersScreen.tsx | ~329 | Change `.select('*')` to `DRIVER_SAFE_JOB_COLUMNS` |
| JobOffersScreen.tsx | ~628 | Change `price_customer ?? price` to `driver_price` |
| JobOffersScreen.tsx | ~527 | Change price in email to `driver_price` |
| ActiveJobScreen.tsx | ~159 | Change `.select('*')` to `DRIVER_SAFE_JOB_COLUMNS` |
| ActiveJobScreen.tsx | ~1590 | Change `price_customer ?? price` to `driver_price` |
| CompletedJobsScreen.tsx | ~33 | Change `.select('*')` to `DRIVER_SAFE_JOB_COLUMNS` |
| CompletedJobsScreen.tsx | ~43 | Change earnings calc to use `driver_price` |
| CompletedJobsScreen.tsx | ~152 | Change price display to `driver_price` |

## Testing After Changes

1. Rebuild the mobile app: `npx expo start --clear` or `eas build`
2. Assign a test job with driver_price = £5.00 and total_price = £10.00
3. Verify driver ONLY sees £5.00 on all screens
4. Check completed jobs earnings show correct driver totals

## Files That Are SAFE (No Changes Needed)

- **context/PendingJobsContext.tsx** - Only counts jobs, doesn't return pricing data
- **components/JobOfferMapPreview.tsx** - Only displays map coordinates, no pricing

## Why This Happened

The original code used `.select('*')` which returns ALL columns from the database, including `total_price` (customer pricing). Even though the Supabase column is named `total_price`, it was being read as `price_customer` in the app.

The fix ensures:
1. Only driver-safe columns are ever fetched
2. The `driver_price` field (set by admin) is displayed
3. Drivers never see customer pricing information

---

**IMPORTANT:** After applying these changes, you should also deploy the RLS migration (007_price_isolation_rls.sql) to your Supabase project. This adds database-level protection that blocks drivers from accessing customer pricing even if they try to bypass the app.
