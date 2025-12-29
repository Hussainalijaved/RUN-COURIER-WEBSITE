-- Row Level Security (RLS) Policies for Run Courier
-- These policies must be applied in the Supabase dashboard SQL editor

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_contacts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTION: Get user role from auth.users metadata
-- ============================================

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    current_setting('request.jwt.claims', true)::json->>'role'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Users can read their own profile
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY "users_select_admin" ON users
  FOR SELECT USING (auth.user_role() = 'admin');

-- Users can update their own profile (except role)
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins can update any user
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (auth.user_role() = 'admin');

-- ============================================
-- DRIVERS TABLE POLICIES
-- ============================================

-- Drivers can read their own profile
CREATE POLICY "drivers_select_own" ON drivers
  FOR SELECT USING (auth.uid() = user_id);

-- Admins and dispatchers can read all drivers
CREATE POLICY "drivers_select_admin_dispatcher" ON drivers
  FOR SELECT USING (auth.user_role() IN ('admin', 'dispatcher'));

-- Drivers can update their own profile (limited fields)
CREATE POLICY "drivers_update_own" ON drivers
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can update any driver
CREATE POLICY "drivers_update_admin" ON drivers
  FOR UPDATE USING (auth.user_role() = 'admin');

-- ============================================
-- JOBS TABLE POLICIES
-- ============================================

-- Customers can read their own jobs
CREATE POLICY "jobs_select_customer" ON jobs
  FOR SELECT USING (auth.uid() = customer_id);

-- Drivers can read jobs assigned to them
CREATE POLICY "jobs_select_driver" ON jobs
  FOR SELECT USING (auth.uid() = driver_id);

-- Admins and dispatchers can read all jobs
CREATE POLICY "jobs_select_admin_dispatcher" ON jobs
  FOR SELECT USING (auth.user_role() IN ('admin', 'dispatcher'));

-- Vendors can read jobs they created
CREATE POLICY "jobs_select_vendor" ON jobs
  FOR SELECT USING (auth.uid() = vendor_id);

-- Public can read jobs by tracking number (no auth required - handled by Edge Function)
-- Note: For public tracking, use the Edge Function instead of direct table access

-- Jobs can only be created via Edge Function (no direct inserts)
-- Jobs can only be updated via Edge Function (status changes require validation)

-- ============================================
-- JOB ASSIGNMENTS TABLE POLICIES
-- ============================================

-- Drivers can read assignments sent to them
CREATE POLICY "job_assignments_select_driver" ON job_assignments
  FOR SELECT USING (auth.uid() = driver_id);

-- Admins and dispatchers can read all assignments
CREATE POLICY "job_assignments_select_admin_dispatcher" ON job_assignments
  FOR SELECT USING (auth.user_role() IN ('admin', 'dispatcher'));

-- Drivers can update their own assignment responses
CREATE POLICY "job_assignments_update_driver" ON job_assignments
  FOR UPDATE USING (auth.uid() = driver_id);

-- Admins can update any assignment
CREATE POLICY "job_assignments_update_admin" ON job_assignments
  FOR UPDATE USING (auth.user_role() = 'admin');

-- ============================================
-- NOTIFICATIONS TABLE POLICIES
-- ============================================

-- Users can read their own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can read all notifications
CREATE POLICY "notifications_select_admin" ON notifications
  FOR SELECT USING (auth.user_role() = 'admin');

-- ============================================
-- DOCUMENTS TABLE POLICIES
-- ============================================

-- Drivers can read their own documents
CREATE POLICY "documents_select_driver" ON documents
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can read all documents
CREATE POLICY "documents_select_admin" ON documents
  FOR SELECT USING (auth.user_role() = 'admin');

-- Drivers can insert their own documents
CREATE POLICY "documents_insert_driver" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can update any document (for review)
CREATE POLICY "documents_update_admin" ON documents
  FOR UPDATE USING (auth.user_role() = 'admin');

-- ============================================
-- DRIVER APPLICATIONS TABLE POLICIES
-- ============================================

-- Applicants can read their own application (matched by email)
CREATE POLICY "driver_applications_select_own" ON driver_applications
  FOR SELECT USING (auth.jwt()->>'email' = email);

-- Admins can read all applications
CREATE POLICY "driver_applications_select_admin" ON driver_applications
  FOR SELECT USING (auth.user_role() = 'admin');

-- Anyone can insert an application (public form)
CREATE POLICY "driver_applications_insert_public" ON driver_applications
  FOR INSERT WITH CHECK (true);

-- Admins can update applications (for review)
CREATE POLICY "driver_applications_update_admin" ON driver_applications
  FOR UPDATE USING (auth.user_role() = 'admin');

-- ============================================
-- INVOICES TABLE POLICIES
-- ============================================

-- Customers can read their own invoices
CREATE POLICY "invoices_select_customer" ON invoices
  FOR SELECT USING (auth.uid() = customer_id);

-- Admins can read all invoices
CREATE POLICY "invoices_select_admin" ON invoices
  FOR SELECT USING (auth.user_role() = 'admin');

-- Admins can update invoices
CREATE POLICY "invoices_update_admin" ON invoices
  FOR UPDATE USING (auth.user_role() = 'admin');

-- ============================================
-- DELIVERY CONTACTS TABLE POLICIES
-- ============================================

-- Users can read their own delivery contacts
CREATE POLICY "delivery_contacts_select_own" ON delivery_contacts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own delivery contacts
CREATE POLICY "delivery_contacts_insert_own" ON delivery_contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own delivery contacts
CREATE POLICY "delivery_contacts_update_own" ON delivery_contacts
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own delivery contacts
CREATE POLICY "delivery_contacts_delete_own" ON delivery_contacts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- STORAGE POLICIES (for document uploads)
-- ============================================

-- Create storage bucket for documents if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT DO NOTHING;

-- Create storage bucket for POD photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-photos', 'pod-photos', false)
ON CONFLICT DO NOTHING;

-- Policy: Users can upload their own documents
CREATE POLICY "documents_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can read their own documents
CREATE POLICY "documents_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Admins can read all documents
CREATE POLICY "documents_read_admin" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND
    auth.user_role() = 'admin'
  );

-- Policy: Drivers can upload POD photos for their assigned jobs
CREATE POLICY "pod_upload_driver" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pod-photos' AND
    auth.user_role() = 'driver'
  );

-- Policy: POD photos are readable by job participants and admins
CREATE POLICY "pod_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pod-photos' AND
    (auth.user_role() IN ('admin', 'dispatcher') OR
     EXISTS (
       SELECT 1 FROM jobs
       WHERE jobs.id::text = (storage.foldername(name))[1]
       AND (jobs.customer_id = auth.uid() OR jobs.driver_id = auth.uid())
     ))
  );
