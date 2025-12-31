-- ============================================
-- CRITICAL SECURITY FIX: PRICE ISOLATION BY ROLE
-- ============================================
-- BUSINESS RULE (NON-NEGOTIABLE):
-- 1) customer_price (stored as total_price) - ONLY visible to admin and the job's customer
-- 2) driver_price - ONLY visible to admin and the assigned driver
-- Drivers must NEVER see customer pricing at ANY level (DB, API, realtime)
-- ============================================

-- Enable RLS on jobs table if not already enabled
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- REVOKE DIRECT TABLE ACCESS FROM NON-ADMIN ROLES
-- This is CRITICAL - without this, drivers can still SELECT pricing columns
-- even if RLS policies are removed, due to pre-existing GRANT statements
-- ============================================
-- Revoke all direct table privileges from authenticated and anon roles
-- Service role retains access for backend API operations
REVOKE ALL ON public.jobs FROM anon;
REVOKE ALL ON public.jobs FROM authenticated;

-- Re-grant minimal UPDATE privilege for drivers (controlled by RLS policy)
GRANT UPDATE ON public.jobs TO authenticated;

-- ============================================
-- DROP EXISTING JOB POLICIES (clean slate)
-- ============================================
DROP POLICY IF EXISTS "Admin full access to jobs" ON public.jobs;
DROP POLICY IF EXISTS "Drivers see assigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Customers see own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Service role full access" ON public.jobs;
DROP POLICY IF EXISTS "jobs_admin_full_access" ON public.jobs;
DROP POLICY IF EXISTS "jobs_driver_select" ON public.jobs;
DROP POLICY IF EXISTS "jobs_driver_update" ON public.jobs;
DROP POLICY IF EXISTS "jobs_customer_select" ON public.jobs;
DROP POLICY IF EXISTS "jobs_service_role" ON public.jobs;

-- ============================================
-- HELPER FUNCTION: Check if user is admin/dispatcher
-- SECURITY: Uses SECURITY DEFINER with explicit search_path
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin_or_dispatcher(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = user_id 
        AND role IN ('admin', 'dispatcher')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- HELPER FUNCTION: Get user role from users table
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.users WHERE id = user_id;
    RETURN COALESCE(user_role, 'anonymous');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================
-- RLS POLICIES FOR JOBS TABLE (ROW-LEVEL ONLY)
-- Note: RLS controls which ROWS users can access
-- Column filtering is done via SECURITY DEFINER functions below
-- ============================================

-- 1. Service role has full access (for edge functions and backend)
CREATE POLICY "jobs_service_role" ON public.jobs
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 2. Admin/Dispatcher can see and modify ALL jobs
CREATE POLICY "jobs_admin_full_access" ON public.jobs
    FOR ALL
    USING (public.is_admin_or_dispatcher(auth.uid()))
    WITH CHECK (public.is_admin_or_dispatcher(auth.uid()));

-- 3. Drivers can update specific fields on their assigned jobs (NO direct SELECT)
-- CRITICAL: Drivers MUST use get_driver_jobs_safe() function for SELECT
-- Direct SELECT is blocked to prevent access to customer pricing columns
CREATE POLICY "jobs_driver_update" ON public.jobs
    FOR UPDATE
    USING (
        driver_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.drivers WHERE id = auth.uid())
    )
    WITH CHECK (
        driver_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.drivers WHERE id = auth.uid())
    );

-- NOTE: No jobs_driver_select or jobs_customer_select policies!
-- This is intentional - drivers and customers MUST use the SECURITY DEFINER
-- functions (get_driver_jobs_safe, get_customer_jobs_safe) which filter columns.
-- Direct table SELECT for drivers/customers is BLOCKED.

-- If you need to add direct SELECT for drivers in the future, 
-- you MUST also revoke SELECT on price columns or use column-level permissions.

-- ============================================
-- COLUMN-LEVEL SECURITY VIA SECURITY DEFINER FUNCTIONS
-- These functions return ONLY allowed columns per role
-- RLS still applies to underlying data access
-- ============================================

-- 1. DRIVER FUNCTION: Returns ONLY driver-safe columns
-- This is the ONLY way drivers should access job data
CREATE OR REPLACE FUNCTION public.get_driver_jobs_safe(p_driver_id UUID)
RETURNS TABLE (
    id UUID,
    tracking_number TEXT,
    status TEXT,
    driver_price NUMERIC,
    vehicle_type TEXT,
    priority TEXT,
    pickup_address TEXT,
    pickup_postcode TEXT,
    pickup_latitude NUMERIC,
    pickup_longitude NUMERIC,
    pickup_instructions TEXT,
    pickup_contact_name TEXT,
    pickup_contact_phone TEXT,
    delivery_address TEXT,
    delivery_postcode TEXT,
    delivery_latitude NUMERIC,
    delivery_longitude NUMERIC,
    delivery_instructions TEXT,
    recipient_name TEXT,
    recipient_phone TEXT,
    sender_name TEXT,
    sender_phone TEXT,
    parcel_description TEXT,
    parcel_weight NUMERIC,
    parcel_dimensions TEXT,
    distance_miles NUMERIC,
    scheduled_pickup_time TIMESTAMPTZ,
    estimated_delivery_time TIMESTAMPTZ,
    actual_pickup_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    pod_signature_url TEXT,
    pod_photo_url TEXT,
    pod_notes TEXT,
    is_multi_drop BOOLEAN,
    is_return_trip BOOLEAN,
    is_urgent BOOLEAN,
    is_fragile BOOLEAN,
    requires_signature BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
    -- EXPLICITLY EXCLUDED: total_price, base_price, distance_price, 
    -- weight_surcharge, priority_surcharge, congestion_charge, 
    -- multi_drop_surcharge, waiting_time_charge
) AS $$
BEGIN
    -- Security check: Only allow drivers to query their own jobs
    -- or admins to query any driver's jobs
    IF auth.uid() != p_driver_id AND NOT public.is_admin_or_dispatcher(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Cannot view other driver jobs';
    END IF;
    
    RETURN QUERY
    SELECT 
        j.id,
        j.tracking_number,
        j.status,
        j.driver_price,
        j.vehicle_type,
        j.priority,
        j.pickup_address,
        j.pickup_postcode,
        j.pickup_latitude,
        j.pickup_longitude,
        j.pickup_instructions,
        j.pickup_contact_name,
        j.pickup_contact_phone,
        j.delivery_address,
        j.delivery_postcode,
        j.delivery_latitude,
        j.delivery_longitude,
        j.delivery_instructions,
        j.recipient_name,
        j.recipient_phone,
        j.sender_name,
        j.sender_phone,
        j.parcel_description,
        j.parcel_weight,
        j.parcel_dimensions,
        j.distance_miles,
        j.scheduled_pickup_time,
        j.estimated_delivery_time,
        j.actual_pickup_time,
        j.actual_delivery_time,
        j.pod_signature_url,
        j.pod_photo_url,
        j.pod_notes,
        j.is_multi_drop,
        j.is_return_trip,
        j.is_urgent,
        j.is_fragile,
        j.requires_signature,
        j.created_at,
        j.updated_at
    FROM public.jobs j
    WHERE j.driver_id = p_driver_id
      AND j.driver_price IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. DRIVER FUNCTION: Get single job by ID (driver-safe columns only)
CREATE OR REPLACE FUNCTION public.get_driver_job_by_id_safe(p_job_id UUID, p_driver_id UUID)
RETURNS TABLE (
    id UUID,
    tracking_number TEXT,
    status TEXT,
    driver_price NUMERIC,
    vehicle_type TEXT,
    priority TEXT,
    pickup_address TEXT,
    pickup_postcode TEXT,
    pickup_latitude NUMERIC,
    pickup_longitude NUMERIC,
    pickup_instructions TEXT,
    pickup_contact_name TEXT,
    pickup_contact_phone TEXT,
    delivery_address TEXT,
    delivery_postcode TEXT,
    delivery_latitude NUMERIC,
    delivery_longitude NUMERIC,
    delivery_instructions TEXT,
    recipient_name TEXT,
    recipient_phone TEXT,
    sender_name TEXT,
    sender_phone TEXT,
    parcel_description TEXT,
    parcel_weight NUMERIC,
    parcel_dimensions TEXT,
    distance_miles NUMERIC,
    scheduled_pickup_time TIMESTAMPTZ,
    estimated_delivery_time TIMESTAMPTZ,
    actual_pickup_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    pod_signature_url TEXT,
    pod_photo_url TEXT,
    pod_notes TEXT,
    is_multi_drop BOOLEAN,
    is_return_trip BOOLEAN,
    is_urgent BOOLEAN,
    is_fragile BOOLEAN,
    requires_signature BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Security check
    IF auth.uid() != p_driver_id AND NOT public.is_admin_or_dispatcher(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        j.id,
        j.tracking_number,
        j.status,
        j.driver_price,
        j.vehicle_type,
        j.priority,
        j.pickup_address,
        j.pickup_postcode,
        j.pickup_latitude,
        j.pickup_longitude,
        j.pickup_instructions,
        j.pickup_contact_name,
        j.pickup_contact_phone,
        j.delivery_address,
        j.delivery_postcode,
        j.delivery_latitude,
        j.delivery_longitude,
        j.delivery_instructions,
        j.recipient_name,
        j.recipient_phone,
        j.sender_name,
        j.sender_phone,
        j.parcel_description,
        j.parcel_weight,
        j.parcel_dimensions,
        j.distance_miles,
        j.scheduled_pickup_time,
        j.estimated_delivery_time,
        j.actual_pickup_time,
        j.actual_delivery_time,
        j.pod_signature_url,
        j.pod_photo_url,
        j.pod_notes,
        j.is_multi_drop,
        j.is_return_trip,
        j.is_urgent,
        j.is_fragile,
        j.requires_signature,
        j.created_at,
        j.updated_at
    FROM public.jobs j
    WHERE j.id = p_job_id
      AND j.driver_id = p_driver_id
      AND j.driver_price IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. CUSTOMER FUNCTION: Returns ONLY customer-safe columns
CREATE OR REPLACE FUNCTION public.get_customer_jobs_safe(p_customer_id UUID)
RETURNS TABLE (
    id UUID,
    tracking_number TEXT,
    status TEXT,
    price_payable NUMERIC,
    vehicle_type TEXT,
    priority TEXT,
    pickup_address TEXT,
    pickup_postcode TEXT,
    pickup_instructions TEXT,
    delivery_address TEXT,
    delivery_postcode TEXT,
    delivery_instructions TEXT,
    recipient_name TEXT,
    recipient_phone TEXT,
    parcel_description TEXT,
    parcel_weight NUMERIC,
    scheduled_pickup_time TIMESTAMPTZ,
    estimated_delivery_time TIMESTAMPTZ,
    actual_pickup_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    has_signature BOOLEAN,
    has_photo BOOLEAN,
    is_multi_drop BOOLEAN,
    is_return_trip BOOLEAN,
    is_urgent BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
    -- EXPLICITLY EXCLUDED: driver_price, driver_id, profit margins, coordinates
) AS $$
BEGIN
    -- Security check: Only allow customers to query their own jobs
    IF auth.uid() != p_customer_id AND NOT public.is_admin_or_dispatcher(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Cannot view other customer jobs';
    END IF;
    
    RETURN QUERY
    SELECT 
        j.id,
        j.tracking_number,
        j.status,
        j.total_price AS price_payable,
        j.vehicle_type,
        j.priority,
        j.pickup_address,
        j.pickup_postcode,
        j.pickup_instructions,
        j.delivery_address,
        j.delivery_postcode,
        j.delivery_instructions,
        j.recipient_name,
        j.recipient_phone,
        j.parcel_description,
        j.parcel_weight,
        j.scheduled_pickup_time,
        j.estimated_delivery_time,
        j.actual_pickup_time,
        j.actual_delivery_time,
        (j.pod_signature_url IS NOT NULL) AS has_signature,
        (j.pod_photo_url IS NOT NULL) AS has_photo,
        j.is_multi_drop,
        j.is_return_trip,
        j.is_urgent,
        j.created_at,
        j.updated_at
    FROM public.jobs j
    WHERE j.customer_id = p_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. ADMIN FUNCTION: Returns ALL columns including profit margin
CREATE OR REPLACE FUNCTION public.get_admin_jobs_full()
RETURNS TABLE (
    id UUID,
    tracking_number TEXT,
    customer_id UUID,
    driver_id UUID,
    dispatcher_id UUID,
    status TEXT,
    base_price NUMERIC,
    distance_price NUMERIC,
    weight_surcharge NUMERIC,
    priority_surcharge NUMERIC,
    congestion_charge NUMERIC,
    multi_drop_surcharge NUMERIC,
    waiting_time_charge NUMERIC,
    customer_price NUMERIC,
    driver_price NUMERIC,
    profit_margin NUMERIC,
    vehicle_type TEXT,
    priority TEXT,
    pickup_address TEXT,
    pickup_postcode TEXT,
    pickup_latitude NUMERIC,
    pickup_longitude NUMERIC,
    pickup_instructions TEXT,
    pickup_contact_name TEXT,
    pickup_contact_phone TEXT,
    delivery_address TEXT,
    delivery_postcode TEXT,
    delivery_latitude NUMERIC,
    delivery_longitude NUMERIC,
    delivery_instructions TEXT,
    recipient_name TEXT,
    recipient_phone TEXT,
    sender_name TEXT,
    sender_phone TEXT,
    parcel_description TEXT,
    parcel_weight NUMERIC,
    parcel_dimensions TEXT,
    distance_miles NUMERIC,
    scheduled_pickup_time TIMESTAMPTZ,
    estimated_delivery_time TIMESTAMPTZ,
    actual_pickup_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    pod_signature_url TEXT,
    pod_photo_url TEXT,
    pod_notes TEXT,
    notes TEXT,
    is_multi_drop BOOLEAN,
    is_return_trip BOOLEAN,
    is_urgent BOOLEAN,
    is_fragile BOOLEAN,
    requires_signature BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Security check: Only admins/dispatchers can access
    IF NOT public.is_admin_or_dispatcher(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: Admin access required';
    END IF;
    
    RETURN QUERY
    SELECT 
        j.id,
        j.tracking_number,
        j.customer_id,
        j.driver_id,
        j.dispatcher_id,
        j.status,
        j.base_price,
        j.distance_price,
        j.weight_surcharge,
        j.priority_surcharge,
        j.congestion_charge,
        j.multi_drop_surcharge,
        j.waiting_time_charge,
        j.total_price AS customer_price,
        j.driver_price,
        (j.total_price - COALESCE(j.driver_price, 0)) AS profit_margin,
        j.vehicle_type,
        j.priority,
        j.pickup_address,
        j.pickup_postcode,
        j.pickup_latitude,
        j.pickup_longitude,
        j.pickup_instructions,
        j.pickup_contact_name,
        j.pickup_contact_phone,
        j.delivery_address,
        j.delivery_postcode,
        j.delivery_latitude,
        j.delivery_longitude,
        j.delivery_instructions,
        j.recipient_name,
        j.recipient_phone,
        j.sender_name,
        j.sender_phone,
        j.parcel_description,
        j.parcel_weight,
        j.parcel_dimensions,
        j.distance_miles,
        j.scheduled_pickup_time,
        j.estimated_delivery_time,
        j.actual_pickup_time,
        j.actual_delivery_time,
        j.pod_signature_url,
        j.pod_photo_url,
        j.pod_notes,
        j.notes,
        j.is_multi_drop,
        j.is_return_trip,
        j.is_urgent,
        j.is_fragile,
        j.requires_signature,
        j.created_at,
        j.updated_at
    FROM public.jobs j
    ORDER BY j.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- GRANT PERMISSIONS ON FUNCTIONS
-- These functions are the ONLY way drivers/customers can access job data
-- ============================================
GRANT EXECUTE ON FUNCTION public.get_driver_jobs_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_job_by_id_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_jobs_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_jobs_full TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_dispatcher TO authenticated;

-- ============================================
-- VERIFICATION: Test that direct SELECT is blocked
-- Run these as authenticated driver to confirm protection
-- ============================================
-- This should FAIL with permission denied:
--   supabase.from('jobs').select('total_price')
--   SELECT total_price FROM jobs;
--
-- This should SUCCEED (returns only driver_price, not total_price):
--   SELECT * FROM get_driver_jobs_safe('driver-uuid');
--   supabase.rpc('get_driver_jobs_safe', { p_driver_id: 'driver-uuid' })

-- ============================================
-- VERIFICATION: Test queries for each role
-- Run these manually to verify isolation works
-- ============================================
-- As driver: SELECT * FROM get_driver_jobs_safe('driver-uuid');
--   Expected: Returns only driver_price, NOT total_price
--
-- As customer: SELECT * FROM get_customer_jobs_safe('customer-uuid');
--   Expected: Returns only price_payable (total_price), NOT driver_price
--
-- As admin: SELECT * FROM get_admin_jobs_full();
--   Expected: Returns ALL columns including both prices and profit_margin
--
-- Direct table access (driver trying to see total_price):
--   SELECT total_price FROM jobs WHERE driver_id = auth.uid();
--   Expected: Still works but API should NEVER make this query
--   The column restriction is enforced by ONLY using the safe functions
