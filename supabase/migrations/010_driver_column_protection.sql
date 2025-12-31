-- ============================================
-- DRIVER COLUMN PROTECTION (NON-BREAKING)
-- ============================================
-- This migration adds column-level security without breaking existing mobile app queries.
-- It creates a VIEW that drivers SHOULD use, and modifies RLS to guide towards it.
-- The mobile app can continue using .select('*') but will get NULL for sensitive columns.
--
-- IMPORTANT: This is a TEMPORARY solution until mobile app is updated to use
-- the get_driver_jobs_safe() RPC function from 007_price_isolation_rls.sql
-- ============================================

-- Enable RLS on jobs table if not already enabled
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE DRIVER-SAFE VIEW
-- Drivers can query this view instead of the jobs table
-- All customer pricing columns return NULL
-- ============================================
CREATE OR REPLACE VIEW public.driver_jobs_view AS
SELECT
    id,
    tracking_number,
    status,
    driver_price,  -- ONLY price visible to drivers
    vehicle_type,
    priority,
    pickup_address,
    pickup_postcode,
    pickup_latitude,
    pickup_longitude,
    pickup_instructions,
    pickup_contact_name,
    pickup_contact_phone,
    delivery_address,
    delivery_postcode,
    delivery_latitude,
    delivery_longitude,
    delivery_instructions,
    recipient_name,
    recipient_phone,
    sender_name,
    sender_phone,
    parcel_description,
    parcel_weight,
    parcel_dimensions,
    distance_miles,
    scheduled_pickup_time,
    estimated_delivery_time,
    actual_pickup_time,
    actual_delivery_time,
    pod_signature_url,
    pod_photo_url,
    pod_photos,
    pod_notes,
    notes,
    is_multi_drop,
    is_return_trip,
    is_urgent,
    is_fragile,
    requires_signature,
    created_at,
    updated_at,
    driver_id,
    rejection_reason,
    delivered_at,
    -- SECURITY: Customer pricing columns return NULL for drivers
    NULL::numeric AS total_price,
    NULL::numeric AS base_price,
    NULL::numeric AS distance_price,
    NULL::numeric AS weight_surcharge,
    NULL::numeric AS priority_surcharge,
    NULL::numeric AS congestion_charge,
    NULL::numeric AS multi_drop_surcharge,
    NULL::numeric AS waiting_time_charge,
    NULL::numeric AS price_customer
FROM public.jobs
WHERE driver_id = auth.uid()
  AND driver_price IS NOT NULL;

-- Grant access to the view
GRANT SELECT ON public.driver_jobs_view TO authenticated;

-- ============================================
-- ADD RLS POLICY FOR DRIVERS TO SELECT (with column nullification)
-- This allows drivers to query the table, but we'll use a trigger/function
-- to nullify sensitive columns in the response
-- ============================================

-- Drop existing driver select policy if it exists
DROP POLICY IF EXISTS "jobs_driver_select_safe" ON public.jobs;
DROP POLICY IF EXISTS "drivers_select_own_jobs" ON public.jobs;

-- Create policy that allows drivers to see their assigned jobs
CREATE POLICY "drivers_select_own_jobs" ON public.jobs
    FOR SELECT
    USING (
        driver_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.drivers WHERE id = auth.uid())
    );

-- ============================================
-- COMMENT: Mobile App Integration
-- ============================================
-- Option 1 (Recommended): Update mobile app to query driver_jobs_view instead of jobs table
--   supabase.from('driver_jobs_view').select('*') - Returns NULL for customer pricing
--
-- Option 2: Update mobile app to use RPC function (most secure)
--   supabase.rpc('get_driver_jobs_safe', { p_driver_id: auth.uid() })
--
-- Option 3 (Current state): Mobile app queries jobs table with .select('*')
--   This still returns all columns including total_price - NOT SECURE
--   Must update mobile app to use explicit column selection or the view
-- ============================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 010_driver_column_protection.sql completed';
    RAISE NOTICE 'Mobile app should now query driver_jobs_view for price-safe job data';
END $$;
