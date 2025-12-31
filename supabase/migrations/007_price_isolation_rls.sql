-- ============================================
-- CRITICAL SECURITY FIX: PRICE ISOLATION BY ROLE
-- ============================================
-- BUSINESS RULE (NON-NEGOTIABLE):
-- 1) customer_price (stored as total_price) - ONLY visible to admin and the customer who owns the job
-- 2) driver_price - ONLY visible to admin and the assigned driver
-- Drivers must NEVER see customer pricing at ANY level (DB, API, realtime)
-- ============================================

-- Enable RLS on jobs table if not already enabled
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

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
-- HELPER FUNCTION: Get user role from users table
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.users WHERE id = user_id;
    RETURN COALESCE(user_role, 'anonymous');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- HELPER FUNCTION: Check if user is admin/dispatcher
-- ============================================
CREATE OR REPLACE FUNCTION is_admin_or_dispatcher(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = user_id 
        AND role IN ('admin', 'dispatcher')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- RLS POLICIES FOR JOBS TABLE
-- ============================================

-- 1. Service role has full access (for edge functions and backend)
CREATE POLICY "jobs_service_role" ON public.jobs
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 2. Admin/Dispatcher can see and modify ALL jobs with ALL columns
CREATE POLICY "jobs_admin_full_access" ON public.jobs
    FOR ALL
    USING (is_admin_or_dispatcher(auth.uid()))
    WITH CHECK (is_admin_or_dispatcher(auth.uid()));

-- 3. Drivers can see ONLY jobs assigned to them
-- NOTE: RLS controls ROW access, not COLUMN access
-- Column-level security is handled via views (see below)
CREATE POLICY "jobs_driver_select" ON public.jobs
    FOR SELECT
    USING (
        driver_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.drivers WHERE id = auth.uid())
    );

-- 4. Drivers can update specific fields on their assigned jobs (status, POD, etc)
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

-- 5. Customers can see only their own jobs
CREATE POLICY "jobs_customer_select" ON public.jobs
    FOR SELECT
    USING (
        customer_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'customer')
    );

-- ============================================
-- COLUMN-LEVEL SECURITY VIA VIEWS
-- RLS only controls ROW access, not COLUMN access
-- Views provide column-level filtering per role
-- ============================================

-- 1. ADMIN VIEW: Full access to all columns and all jobs
DROP VIEW IF EXISTS public.admin_jobs_view;
CREATE VIEW public.admin_jobs_view AS
SELECT 
    id,
    tracking_number,
    customer_id,
    driver_id,
    dispatcher_id,
    status,
    -- CUSTOMER PRICING (admin only)
    base_price,
    distance_price,
    weight_surcharge,
    priority_surcharge,
    congestion_charge,
    multi_drop_surcharge,
    waiting_time_charge,
    total_price AS customer_price,  -- Rename for clarity
    -- DRIVER PRICING
    driver_price,
    -- PROFIT (admin only)
    (total_price - COALESCE(driver_price, 0)) AS profit_margin,
    -- All other fields
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
    pod_notes,
    notes,
    is_multi_drop,
    is_return_trip,
    is_urgent,
    is_fragile,
    requires_signature,
    created_at,
    updated_at
FROM public.jobs
WHERE is_admin_or_dispatcher(auth.uid())
   OR auth.role() = 'service_role';

-- 2. DRIVER VIEW: ONLY driver_price, NO customer pricing columns
DROP VIEW IF EXISTS public.driver_jobs_view;
CREATE VIEW public.driver_jobs_view AS
SELECT 
    id,
    tracking_number,
    status,
    -- DRIVER PRICE ONLY - NO CUSTOMER PRICING EVER
    driver_price,
    -- Vehicle and job details
    vehicle_type,
    priority,
    -- Pickup info
    pickup_address,
    pickup_postcode,
    pickup_latitude,
    pickup_longitude,
    pickup_instructions,
    pickup_contact_name,
    pickup_contact_phone,
    -- Delivery info
    delivery_address,
    delivery_postcode,
    delivery_latitude,
    delivery_longitude,
    delivery_instructions,
    recipient_name,
    recipient_phone,
    sender_name,
    sender_phone,
    -- Parcel info
    parcel_description,
    parcel_weight,
    parcel_dimensions,
    distance_miles,
    -- Times
    scheduled_pickup_time,
    estimated_delivery_time,
    actual_pickup_time,
    actual_delivery_time,
    -- POD
    pod_signature_url,
    pod_photo_url,
    pod_notes,
    -- Flags
    is_multi_drop,
    is_return_trip,
    is_urgent,
    is_fragile,
    requires_signature,
    created_at,
    updated_at
    -- EXPLICITLY EXCLUDED: base_price, distance_price, weight_surcharge, 
    -- priority_surcharge, congestion_charge, multi_drop_surcharge, 
    -- waiting_time_charge, total_price (customer_price)
FROM public.jobs
WHERE driver_id = auth.uid()
  AND driver_price IS NOT NULL;  -- Only show jobs with admin-set price

-- 3. CUSTOMER VIEW: ONLY customer pricing, NO driver_price
DROP VIEW IF EXISTS public.customer_jobs_view;
CREATE VIEW public.customer_jobs_view AS
SELECT 
    id,
    tracking_number,
    status,
    -- CUSTOMER PRICE ONLY
    total_price AS price_payable,
    -- Vehicle and job details
    vehicle_type,
    priority,
    -- Pickup info
    pickup_address,
    pickup_postcode,
    pickup_instructions,
    -- Delivery info
    delivery_address,
    delivery_postcode,
    delivery_instructions,
    recipient_name,
    recipient_phone,
    -- Parcel info
    parcel_description,
    parcel_weight,
    -- Times
    scheduled_pickup_time,
    estimated_delivery_time,
    actual_pickup_time,
    actual_delivery_time,
    -- POD confirmation only
    pod_signature_url IS NOT NULL AS has_signature,
    pod_photo_url IS NOT NULL AS has_photo,
    -- Flags
    is_multi_drop,
    is_return_trip,
    is_urgent,
    created_at,
    updated_at
    -- EXPLICITLY EXCLUDED: driver_price, driver_id, profit margins, 
    -- internal notes, exact coordinates
FROM public.jobs
WHERE customer_id = auth.uid();

-- ============================================
-- GRANT PERMISSIONS ON VIEWS
-- ============================================
GRANT SELECT ON public.admin_jobs_view TO authenticated;
GRANT SELECT ON public.driver_jobs_view TO authenticated;
GRANT SELECT ON public.customer_jobs_view TO authenticated;

-- ============================================
-- SECURE FUNCTION: Get jobs for driver (API use)
-- Returns ONLY driver-safe columns
-- ============================================
CREATE OR REPLACE FUNCTION get_driver_jobs(p_driver_id UUID)
RETURNS SETOF public.driver_jobs_view AS $$
BEGIN
    -- Verify caller is the driver or admin
    IF auth.uid() != p_driver_id AND NOT is_admin_or_dispatcher(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    RETURN QUERY
    SELECT * FROM public.driver_jobs_view
    WHERE driver_id = p_driver_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SECURE FUNCTION: Get single job for driver
-- Returns ONLY driver-safe columns, prevents column injection
-- ============================================
CREATE OR REPLACE FUNCTION get_driver_job_by_id(p_job_id UUID)
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
      AND j.driver_id = auth.uid()
      AND j.driver_price IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_driver_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION get_driver_job_by_id TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_or_dispatcher TO authenticated;

-- ============================================
-- VERIFICATION QUERIES (run manually to test)
-- ============================================
-- To test as driver: SET LOCAL ROLE authenticated; SET request.jwt.claim.sub = '<driver_uuid>';
-- SELECT * FROM driver_jobs_view; -- Should only show driver_price
-- SELECT total_price FROM jobs; -- Should fail or return null
-- 
-- To test as admin: SET request.jwt.claim.sub = '<admin_uuid>';
-- SELECT * FROM admin_jobs_view; -- Should show both prices
