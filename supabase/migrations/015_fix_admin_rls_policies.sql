-- ============================================
-- FIX ADMIN RLS POLICIES (FINAL SAFE VERSION)
-- ============================================
-- Problem: Admin panel shows zero drivers/jobs, document approvals fail
-- Root cause: Admin recognition broken in RLS policies
-- 
-- Admin identity model: auth.jwt()->>'email' matching admins.email
-- 
-- Security requirements:
-- - Admins: FULL read/write access to all tables
-- - Dispatchers: READ-only access (SELECT) on drivers, jobs, assignments
-- - Drivers: See only their own jobs/documents
-- - Customers: See only their own jobs
-- - Price isolation: Drivers/customers use SECURITY DEFINER functions, not direct SELECT
--
-- This migration:
-- 1. Creates admins table and email-based admin check function
-- 2. Updates is_admin_or_dispatcher() to check email first
-- 3. Adds SEPARATE policies for admin (full) and dispatcher (read-only)
-- 4. Does NOT modify driver/customer access or break price isolation
-- ============================================

-- Ensure pgcrypto extension for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- STEP 1: CREATE ADMINS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the primary admin if not exists
INSERT INTO public.admins (email, name)
VALUES ('runcourier1@gmail.com', 'Run Courier Admin')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- STEP 2: HELPER FUNCTIONS
-- ============================================

-- Check if user is admin by email (PRIMARY admin identification)
CREATE OR REPLACE FUNCTION public.is_admin_by_email()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admins 
        WHERE email = auth.jwt()->>'email'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Check if user is dispatcher (role-based only)
CREATE OR REPLACE FUNCTION public.is_dispatcher()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role = 'dispatcher'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Combined check for backwards compatibility
CREATE OR REPLACE FUNCTION public.is_admin_or_dispatcher(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check admins table by email
    IF EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email') THEN
        RETURN TRUE;
    END IF;
    -- Check users table for admin/dispatcher role
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = user_id 
        AND role IN ('admin', 'dispatcher')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_admin_by_email TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_by_email TO anon;
GRANT EXECUTE ON FUNCTION public.is_dispatcher TO authenticated;

-- ============================================
-- STEP 3: FIX DRIVERS TABLE RLS
-- Admin: FULL access, Dispatcher: READ-only, Driver: own profile
-- ============================================
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate cleanly
DROP POLICY IF EXISTS "drivers_admin_full_access" ON public.drivers;
DROP POLICY IF EXISTS "drivers_select_admin_dispatcher" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_admin" ON public.drivers;
DROP POLICY IF EXISTS "drivers_service_role" ON public.drivers;
DROP POLICY IF EXISTS "drivers_select_own" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_own" ON public.drivers;
DROP POLICY IF EXISTS "Admin full access to drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can read their own profile" ON public.drivers;

-- 1. Service role full access
CREATE POLICY "drivers_service_role" ON public.drivers
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 2. Admin FULL access (email-based)
CREATE POLICY "drivers_admin_full_access" ON public.drivers
    FOR ALL
    USING (public.is_admin_by_email())
    WITH CHECK (public.is_admin_by_email());

-- 3. Dispatcher READ-only access
CREATE POLICY "drivers_dispatcher_select" ON public.drivers
    FOR SELECT
    USING (public.is_dispatcher());

-- 4. Drivers can view their own profile
CREATE POLICY "drivers_select_own" ON public.drivers
    FOR SELECT
    USING (auth.uid() = id);

-- 5. Drivers can update their own profile
CREATE POLICY "drivers_update_own" ON public.drivers
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- STEP 4: FIX JOBS TABLE RLS
-- Admin: FULL access, Dispatcher: READ-only
-- NOTE: NO direct SELECT for drivers/customers (price isolation)
-- ============================================
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "jobs_admin_full_access" ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_admin_dispatcher" ON public.jobs;
DROP POLICY IF EXISTS "jobs_service_role" ON public.jobs;
DROP POLICY IF EXISTS "Admin full access to jobs" ON public.jobs;
DROP POLICY IF EXISTS "Service role full access" ON public.jobs;

-- 1. Service role full access
CREATE POLICY "jobs_service_role" ON public.jobs
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 2. Admin FULL access (email-based)
CREATE POLICY "jobs_admin_full_access" ON public.jobs
    FOR ALL
    USING (public.is_admin_by_email())
    WITH CHECK (public.is_admin_by_email());

-- 3. Dispatcher READ-only access
CREATE POLICY "jobs_dispatcher_select" ON public.jobs
    FOR SELECT
    USING (public.is_dispatcher());

-- NOTE: Driver/customer direct SELECT policies are intentionally NOT added
-- Price isolation is enforced via SECURITY DEFINER functions from migration 007:
-- - get_driver_jobs_safe() for drivers
-- - get_customer_jobs_safe() for customers
-- The jobs_driver_update policy from migration 007 allows driver status updates

-- ============================================
-- STEP 5: FIX DRIVER_DOCUMENTS TABLE RLS
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_documents' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "driver_documents_admin_full_access" ON public.driver_documents';
        EXECUTE 'DROP POLICY IF EXISTS "driver_documents_select_admin" ON public.driver_documents';
        EXECUTE 'DROP POLICY IF EXISTS "driver_documents_update_admin" ON public.driver_documents';
        EXECUTE 'DROP POLICY IF EXISTS "driver_documents_service_role" ON public.driver_documents';
        EXECUTE 'DROP POLICY IF EXISTS "driver_documents_dispatcher_select" ON public.driver_documents';
        EXECUTE 'DROP POLICY IF EXISTS "driver_documents_select_own" ON public.driver_documents';
        EXECUTE 'DROP POLICY IF EXISTS "driver_documents_insert_own" ON public.driver_documents';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "driver_documents_service_role" ON public.driver_documents
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "driver_documents_admin_full_access" ON public.driver_documents
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "driver_documents_dispatcher_select" ON public.driver_documents
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Drivers can view their own documents
        EXECUTE 'CREATE POLICY "driver_documents_select_own" ON public.driver_documents
            FOR SELECT USING (auth.uid() = driver_id)';
        
        -- 5. Drivers can insert their own documents
        EXECUTE 'CREATE POLICY "driver_documents_insert_own" ON public.driver_documents
            FOR INSERT WITH CHECK (auth.uid() = driver_id)';
    END IF;
END $$;

-- Also fix 'documents' table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "documents_admin_full_access" ON public.documents';
        EXECUTE 'DROP POLICY IF EXISTS "documents_select_admin" ON public.documents';
        EXECUTE 'DROP POLICY IF EXISTS "documents_update_admin" ON public.documents';
        EXECUTE 'DROP POLICY IF EXISTS "documents_service_role" ON public.documents';
        EXECUTE 'DROP POLICY IF EXISTS "documents_dispatcher_select" ON public.documents';
        EXECUTE 'DROP POLICY IF EXISTS "documents_select_driver" ON public.documents';
        EXECUTE 'DROP POLICY IF EXISTS "documents_insert_driver" ON public.documents';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "documents_service_role" ON public.documents
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "documents_admin_full_access" ON public.documents
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "documents_dispatcher_select" ON public.documents
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Users can view their own documents
        EXECUTE 'CREATE POLICY "documents_select_own" ON public.documents
            FOR SELECT USING (auth.uid() = user_id)';
        
        -- 5. Users can insert their own documents
        EXECUTE 'CREATE POLICY "documents_insert_own" ON public.documents
            FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
END $$;

-- ============================================
-- STEP 6: FIX NOTIFICATIONS TABLE RLS
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "notifications_admin_full_access" ON public.notifications';
        EXECUTE 'DROP POLICY IF EXISTS "notifications_select_admin" ON public.notifications';
        EXECUTE 'DROP POLICY IF EXISTS "notifications_service_role" ON public.notifications';
        EXECUTE 'DROP POLICY IF EXISTS "notifications_dispatcher_select" ON public.notifications';
        EXECUTE 'DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications';
        EXECUTE 'DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "notifications_service_role" ON public.notifications
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "notifications_admin_full_access" ON public.notifications
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "notifications_dispatcher_select" ON public.notifications
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Users can view their own notifications
        EXECUTE 'CREATE POLICY "notifications_select_own" ON public.notifications
            FOR SELECT USING (auth.uid() = user_id)';
        
        -- 5. Users can update their own notifications (mark as read)
        EXECUTE 'CREATE POLICY "notifications_update_own" ON public.notifications
            FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    END IF;
END $$;

-- ============================================
-- STEP 7: FIX JOB_ASSIGNMENTS TABLE RLS
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_assignments' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "job_assignments_admin_full_access" ON public.job_assignments';
        EXECUTE 'DROP POLICY IF EXISTS "job_assignments_select_admin_dispatcher" ON public.job_assignments';
        EXECUTE 'DROP POLICY IF EXISTS "job_assignments_update_admin" ON public.job_assignments';
        EXECUTE 'DROP POLICY IF EXISTS "job_assignments_service_role" ON public.job_assignments';
        EXECUTE 'DROP POLICY IF EXISTS "job_assignments_dispatcher_select" ON public.job_assignments';
        EXECUTE 'DROP POLICY IF EXISTS "job_assignments_select_driver" ON public.job_assignments';
        EXECUTE 'DROP POLICY IF EXISTS "job_assignments_update_driver" ON public.job_assignments';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "job_assignments_service_role" ON public.job_assignments
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "job_assignments_admin_full_access" ON public.job_assignments
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "job_assignments_dispatcher_select" ON public.job_assignments
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Drivers can view their assignments
        EXECUTE 'CREATE POLICY "job_assignments_select_driver" ON public.job_assignments
            FOR SELECT USING (auth.uid() = driver_id)';
        
        -- 5. Drivers can update their own assignments (accept/decline)
        EXECUTE 'CREATE POLICY "job_assignments_update_driver" ON public.job_assignments
            FOR UPDATE USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id)';
    END IF;
END $$;

-- ============================================
-- DEBUG QUERY (Run manually to confirm admin access)
-- ============================================
-- SELECT email FROM public.admins WHERE email = auth.jwt()->>'email';
-- SELECT public.is_admin_by_email();
-- SELECT public.is_dispatcher();
-- 
-- If you are an admin, is_admin_by_email() should return true
-- If you are a dispatcher, is_dispatcher() should return true
-- ============================================

-- ============================================
-- VERIFICATION STEPS (After running this migration):
-- ============================================
-- 1. Login as admin - verify can see all drivers, jobs, documents
-- 2. Verify admin can approve/reject documents
-- 3. Verify admin can assign drivers to jobs
-- 4. Login as dispatcher - verify can see all drivers, jobs (read-only)
-- 5. Verify dispatcher CANNOT modify jobs or driver records
-- 6. Verify drivers still only see their assigned jobs (via mobile app)
-- 7. Verify customers only see their own jobs
-- ============================================
