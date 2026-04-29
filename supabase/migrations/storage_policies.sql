-- =============================================
-- RUN COURIER - SUPABASE STORAGE POLICIES (SECURE)
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- CREATE STORAGE BUCKETS (if not exist)
-- ALL buckets are PRIVATE
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pod',
  'pod',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pod',
  'pod',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pod-images',
  'pod-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-applications',
  'driver-applications',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760;

-- =============================================
-- DROP EXISTING POLICIES
-- =============================================
DROP POLICY IF EXISTS "pod_admin_all" ON storage.objects;
DROP POLICY IF EXISTS "pod_driver_upload" ON storage.objects;
DROP POLICY IF EXISTS "pod_driver_read_own" ON storage.objects;
DROP POLICY IF EXISTS "pod_customer_read_own" ON storage.objects;
DROP POLICY IF EXISTS "pod_images_admin_all" ON storage.objects;
DROP POLICY IF EXISTS "pod_images_driver_upload" ON storage.objects;
DROP POLICY IF EXISTS "pod_images_driver_read_own" ON storage.objects;
DROP POLICY IF EXISTS "pod_images_customer_read_own" ON storage.objects;
DROP POLICY IF EXISTS "documents_admin_all" ON storage.objects;
DROP POLICY IF EXISTS "documents_driver_upload" ON storage.objects;
DROP POLICY IF EXISTS "documents_driver_read_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_apps_admin_all" ON storage.objects;
DROP POLICY IF EXISTS "driver_apps_public_upload" ON storage.objects;

-- =============================================
-- POD & POD-IMAGES BUCKET POLICIES
-- =============================================

-- Admin can do everything in POD buckets
CREATE POLICY "pod_images_admin_all" ON storage.objects
  FOR ALL 
  USING (
    (bucket_id = 'pod' OR bucket_id = 'pod-images') AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  )
  WITH CHECK (
    (bucket_id = 'pod' OR bucket_id = 'pod-images') AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  );

-- Drivers can upload POD files for their assigned jobs
CREATE POLICY "pod_images_driver_upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    (bucket_id = 'pod' OR bucket_id = 'pod-images') AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'driver' AND
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.driver_id = auth.uid()::text 
      AND (
        storage.objects.name LIKE jobs.id || '/%' OR
        storage.objects.name LIKE 'pod/' || jobs.id || '/%' OR
        storage.objects.name LIKE 'job_' || jobs.id || '/%'
      )
    )
  );

-- Drivers can read POD files for their assigned jobs
CREATE POLICY "pod_images_driver_read_own" ON storage.objects
  FOR SELECT 
  USING (
    (bucket_id = 'pod' OR bucket_id = 'pod-images') AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'driver' AND
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.driver_id = auth.uid()::text 
      AND (
        storage.objects.name LIKE jobs.id || '/%' OR
        storage.objects.name LIKE 'pod/' || jobs.id || '/%' OR
        storage.objects.name LIKE 'job_' || jobs.id || '/%'
      )
    )
  );

-- Customers can read POD files for their own jobs
CREATE POLICY "pod_images_customer_read_own" ON storage.objects
  FOR SELECT 
  USING (
    (bucket_id = 'pod' OR bucket_id = 'pod-images') AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'customer' AND
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.customer_id = auth.uid()::text 
      AND (
        storage.objects.name LIKE jobs.id || '/%' OR
        storage.objects.name LIKE 'pod/' || jobs.id || '/%' OR
        storage.objects.name LIKE 'job_' || jobs.id || '/%'
      )
    )
  );

-- =============================================
-- DOCUMENTS BUCKET POLICIES
-- =============================================

-- Admin can do everything
CREATE POLICY "documents_admin_all" ON storage.objects
  FOR ALL 
  USING (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  );

-- Drivers can upload to their own folder
CREATE POLICY "documents_driver_upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'driver' AND
    storage.objects.name LIKE auth.uid()::text || '/%'
  );

-- Drivers can read their own documents
CREATE POLICY "documents_driver_read_own" ON storage.objects
  FOR SELECT 
  USING (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'driver' AND
    storage.objects.name LIKE auth.uid()::text || '/%'
  );

-- =============================================
-- DRIVER-APPLICATIONS BUCKET POLICIES
-- =============================================

-- Admin can do everything
CREATE POLICY "driver_apps_admin_all" ON storage.objects
  FOR ALL 
  USING (
    bucket_id = 'driver-applications' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'driver-applications' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  );

-- Public can upload
CREATE POLICY "driver_apps_public_upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'driver-applications'
  );

-- =============================================
-- DOCUMENTS BUCKET POLICIES
-- Path convention: documents/{driverId}/{filename}
-- =============================================

-- Admin can do everything in documents bucket
CREATE POLICY "documents_admin_all" ON storage.objects
  FOR ALL 
  USING (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  );

-- Drivers can upload to their own folder only
CREATE POLICY "documents_driver_upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'driver' AND
    storage.objects.name LIKE auth.uid()::text || '/%'
  );

-- Drivers can read their own documents only
CREATE POLICY "documents_driver_read_own" ON storage.objects
  FOR SELECT 
  USING (
    bucket_id = 'documents' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'driver' AND
    storage.objects.name LIKE auth.uid()::text || '/%'
  );

-- =============================================
-- DRIVER-APPLICATIONS BUCKET POLICIES
-- Path convention: driver-applications/{applicationId}/{filename}
-- =============================================

-- Admin can do everything
CREATE POLICY "driver_apps_admin_all" ON storage.objects
  FOR ALL 
  USING (
    bucket_id = 'driver-applications' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'driver-applications' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
  );

-- Public can upload to driver-applications (for new applicants without auth)
CREATE POLICY "driver_apps_public_upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'driver-applications'
  );

-- =============================================
-- VERIFICATION QUERIES
-- =============================================
-- Check buckets are private:
-- SELECT id, name, public FROM storage.buckets;

-- Check policies:
-- SELECT policyname, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE schemaname = 'storage' AND tablename = 'objects';
