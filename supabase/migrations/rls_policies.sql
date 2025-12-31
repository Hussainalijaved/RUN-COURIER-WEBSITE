-- =============================================
-- RUN COURIER - SUPABASE RLS POLICIES (SECURE)
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable RLS on all tables
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS driver_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS delivery_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS driver_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS multi_drop_stops ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTION: Get user role from JWT
-- =============================================
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role'),
    current_setting('request.jwt.claims', true)::json->>'role',
    'customer'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- HELPER FUNCTION: Check if user is admin
-- =============================================
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT auth.user_role() = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- USERS TABLE POLICIES
-- Only admin can see all users, users can only see/update their own
-- =============================================
DROP POLICY IF EXISTS "users_admin_all" ON users;
DROP POLICY IF EXISTS "users_self_read" ON users;
DROP POLICY IF EXISTS "users_self_update" ON users;

CREATE POLICY "users_admin_all" ON users
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "users_self_read" ON users
  FOR SELECT 
  USING (NOT auth.is_admin() AND auth.uid()::text = id);

CREATE POLICY "users_self_update" ON users
  FOR UPDATE 
  USING (NOT auth.is_admin() AND auth.uid()::text = id)
  WITH CHECK (NOT auth.is_admin() AND auth.uid()::text = id);

-- =============================================
-- DRIVERS TABLE POLICIES
-- Admin can see all, drivers can only see/update themselves
-- NO public access - customers cannot see driver records directly
-- =============================================
DROP POLICY IF EXISTS "drivers_admin_all" ON drivers;
DROP POLICY IF EXISTS "drivers_self_read" ON drivers;
DROP POLICY IF EXISTS "drivers_self_update" ON drivers;
DROP POLICY IF EXISTS "drivers_public_read_active" ON drivers;

CREATE POLICY "drivers_admin_all" ON drivers
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "drivers_self_read" ON drivers
  FOR SELECT 
  USING (
    auth.user_role() = 'driver' AND 
    auth.uid()::text = id
  );

CREATE POLICY "drivers_self_update" ON drivers
  FOR UPDATE 
  USING (
    auth.user_role() = 'driver' AND 
    auth.uid()::text = id
  )
  WITH CHECK (
    auth.user_role() = 'driver' AND 
    auth.uid()::text = id
  );

-- =============================================
-- JOBS TABLE POLICIES
-- Admin full access, drivers only assigned jobs, customers only own jobs
-- =============================================
DROP POLICY IF EXISTS "jobs_admin_all" ON jobs;
DROP POLICY IF EXISTS "jobs_driver_read_assigned" ON jobs;
DROP POLICY IF EXISTS "jobs_driver_update_own" ON jobs;
DROP POLICY IF EXISTS "jobs_customer_read_own" ON jobs;
DROP POLICY IF EXISTS "jobs_customer_insert" ON jobs;

CREATE POLICY "jobs_admin_all" ON jobs
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "jobs_driver_read_assigned" ON jobs
  FOR SELECT 
  USING (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  );

CREATE POLICY "jobs_driver_update_own" ON jobs
  FOR UPDATE 
  USING (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  )
  WITH CHECK (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  );

CREATE POLICY "jobs_customer_read_own" ON jobs
  FOR SELECT 
  USING (
    auth.user_role() = 'customer' AND 
    customer_id = auth.uid()::text
  );

CREATE POLICY "jobs_customer_insert" ON jobs
  FOR INSERT 
  WITH CHECK (
    auth.user_role() = 'customer' AND 
    customer_id = auth.uid()::text
  );

-- =============================================
-- JOB_ASSIGNMENTS TABLE POLICIES
-- Admin full access, drivers only their assignments
-- =============================================
DROP POLICY IF EXISTS "job_assignments_admin_all" ON job_assignments;
DROP POLICY IF EXISTS "job_assignments_driver_read" ON job_assignments;
DROP POLICY IF EXISTS "job_assignments_driver_update" ON job_assignments;

CREATE POLICY "job_assignments_admin_all" ON job_assignments
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "job_assignments_driver_read" ON job_assignments
  FOR SELECT 
  USING (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  );

CREATE POLICY "job_assignments_driver_update" ON job_assignments
  FOR UPDATE 
  USING (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  )
  WITH CHECK (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  );

-- =============================================
-- DOCUMENTS TABLE POLICIES
-- Admin full access, drivers only their own documents
-- NO customer access
-- =============================================
DROP POLICY IF EXISTS "documents_admin_all" ON documents;
DROP POLICY IF EXISTS "documents_driver_read_own" ON documents;
DROP POLICY IF EXISTS "documents_driver_insert_own" ON documents;

CREATE POLICY "documents_admin_all" ON documents
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "documents_driver_read_own" ON documents
  FOR SELECT 
  USING (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  );

CREATE POLICY "documents_driver_insert_own" ON documents
  FOR INSERT 
  WITH CHECK (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  );

-- =============================================
-- NOTIFICATIONS TABLE POLICIES
-- Admin full access, users only their own notifications
-- =============================================
DROP POLICY IF EXISTS "notifications_admin_all" ON notifications;
DROP POLICY IF EXISTS "notifications_user_read_own" ON notifications;
DROP POLICY IF EXISTS "notifications_user_update_own" ON notifications;

CREATE POLICY "notifications_admin_all" ON notifications
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "notifications_user_read_own" ON notifications
  FOR SELECT 
  USING (
    NOT auth.is_admin() AND 
    user_id = auth.uid()::text
  );

CREATE POLICY "notifications_user_update_own" ON notifications
  FOR UPDATE 
  USING (
    NOT auth.is_admin() AND 
    user_id = auth.uid()::text
  )
  WITH CHECK (
    NOT auth.is_admin() AND 
    user_id = auth.uid()::text
  );

-- =============================================
-- DRIVER_APPLICATIONS TABLE POLICIES
-- Admin full access, public insert only (no read for applicants)
-- =============================================
DROP POLICY IF EXISTS "driver_applications_admin_all" ON driver_applications;
DROP POLICY IF EXISTS "driver_applications_insert" ON driver_applications;

CREATE POLICY "driver_applications_admin_all" ON driver_applications
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "driver_applications_insert" ON driver_applications
  FOR INSERT 
  WITH CHECK (true);

-- =============================================
-- INVOICES TABLE POLICIES
-- Admin full access, customers only their own invoices
-- =============================================
DROP POLICY IF EXISTS "invoices_admin_all" ON invoices;
DROP POLICY IF EXISTS "invoices_customer_read_own" ON invoices;

CREATE POLICY "invoices_admin_all" ON invoices
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "invoices_customer_read_own" ON invoices
  FOR SELECT 
  USING (
    auth.user_role() = 'customer' AND 
    customer_id = auth.uid()::text
  );

-- =============================================
-- DELIVERY_CONTACTS TABLE POLICIES
-- Admin full access, customers manage their own contacts
-- =============================================
DROP POLICY IF EXISTS "delivery_contacts_admin_all" ON delivery_contacts;
DROP POLICY IF EXISTS "delivery_contacts_customer_all" ON delivery_contacts;

CREATE POLICY "delivery_contacts_admin_all" ON delivery_contacts
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "delivery_contacts_customer_all" ON delivery_contacts
  FOR ALL 
  USING (
    NOT auth.is_admin() AND 
    customer_id = auth.uid()::text
  )
  WITH CHECK (
    NOT auth.is_admin() AND 
    customer_id = auth.uid()::text
  );

-- =============================================
-- DRIVER_PAYMENTS TABLE POLICIES
-- Admin full access, drivers only their own payments
-- =============================================
DROP POLICY IF EXISTS "driver_payments_admin_all" ON driver_payments;
DROP POLICY IF EXISTS "driver_payments_driver_read" ON driver_payments;

CREATE POLICY "driver_payments_admin_all" ON driver_payments
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "driver_payments_driver_read" ON driver_payments
  FOR SELECT 
  USING (
    auth.user_role() = 'driver' AND 
    driver_id = auth.uid()::text
  );

-- =============================================
-- MULTI_DROP_STOPS TABLE POLICIES
-- Admin full access, access based on job ownership
-- =============================================
DROP POLICY IF EXISTS "multi_drop_stops_admin_all" ON multi_drop_stops;
DROP POLICY IF EXISTS "multi_drop_stops_driver_access" ON multi_drop_stops;
DROP POLICY IF EXISTS "multi_drop_stops_customer_read" ON multi_drop_stops;

CREATE POLICY "multi_drop_stops_admin_all" ON multi_drop_stops
  FOR ALL 
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

CREATE POLICY "multi_drop_stops_driver_access" ON multi_drop_stops
  FOR ALL 
  USING (
    auth.user_role() = 'driver' AND
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = multi_drop_stops.job_id 
      AND jobs.driver_id = auth.uid()::text
    )
  )
  WITH CHECK (
    auth.user_role() = 'driver' AND
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = multi_drop_stops.job_id 
      AND jobs.driver_id = auth.uid()::text
    )
  );

CREATE POLICY "multi_drop_stops_customer_read" ON multi_drop_stops
  FOR SELECT 
  USING (
    auth.user_role() = 'customer' AND
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = multi_drop_stops.job_id 
      AND jobs.customer_id = auth.uid()::text
    )
  );

-- =============================================
-- GRANT REALTIME ACCESS (if not already configured)
-- =============================================
-- Note: Run these only if realtime is not already enabled
-- ALTER publication supabase_realtime ADD TABLE jobs;
-- ALTER publication supabase_realtime ADD TABLE drivers;
-- ALTER publication supabase_realtime ADD TABLE job_assignments;
-- ALTER publication supabase_realtime ADD TABLE notifications;

-- =============================================
-- VERIFICATION QUERY
-- =============================================
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('users', 'drivers', 'jobs', 'documents', 'job_assignments');
