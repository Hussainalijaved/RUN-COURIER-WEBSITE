-- Migration: Fix driver profile updates and storage policies
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CREATE DRIVER-DOCUMENTS STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('driver-documents', 'driver-documents', true, 10485760)
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- ============================================
-- 2. STORAGE POLICIES FOR DRIVER-DOCUMENTS BUCKET
-- ============================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "driver_docs_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_read_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_read_admin" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_update_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_public_read" ON storage.objects;

-- Policy: Drivers can upload their own documents (folder = their auth.uid())
CREATE POLICY "driver_docs_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'driver-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Drivers can update/overwrite their own documents
CREATE POLICY "driver_docs_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'driver-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Drivers can read their own documents
CREATE POLICY "driver_docs_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'driver-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Admins can read all driver documents
CREATE POLICY "driver_docs_read_admin" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'driver-documents' AND
    EXISTS (
      SELECT 1 FROM public.admins 
      WHERE admins.email = auth.jwt()->>'email'
    )
  );

-- Policy: Public read access for driver documents (bucket is public)
CREATE POLICY "driver_docs_public_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'driver-documents'
  );

-- ============================================
-- 3. ENSURE DRIVERS TABLE HAS PROPER COLUMNS
-- ============================================

-- Add document URL columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'profile_picture_url') THEN
        ALTER TABLE public.drivers ADD COLUMN profile_picture_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'driving_licence_front_url') THEN
        ALTER TABLE public.drivers ADD COLUMN driving_licence_front_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'driving_licence_back_url') THEN
        ALTER TABLE public.drivers ADD COLUMN driving_licence_back_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dbs_certificate_url') THEN
        ALTER TABLE public.drivers ADD COLUMN dbs_certificate_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'goods_in_transit_insurance_url') THEN
        ALTER TABLE public.drivers ADD COLUMN goods_in_transit_insurance_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'hire_reward_insurance_url') THEN
        ALTER TABLE public.drivers ADD COLUMN hire_reward_insurance_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'updated_at') THEN
        ALTER TABLE public.drivers ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================
-- 4. FIX DRIVER RLS POLICIES
-- ============================================

-- Drop and recreate driver update policies to ensure they work correctly
DROP POLICY IF EXISTS "drivers_update_own" ON drivers;
DROP POLICY IF EXISTS "drivers_update_admin" ON drivers;

-- Drivers can update their own profile
CREATE POLICY "drivers_update_own" ON drivers
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any driver
CREATE POLICY "drivers_update_admin" ON drivers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.admins 
      WHERE admins.email = auth.jwt()->>'email'
    )
  );

-- ============================================
-- 5. GRANT PERMISSIONS
-- ============================================

-- Ensure authenticated users have proper permissions on drivers table
GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.drivers TO service_role;

-- Ensure service_role can bypass RLS (for admin operations)
ALTER TABLE public.drivers FORCE ROW LEVEL SECURITY;

-- ============================================
-- VERIFICATION QUERIES (run these to verify)
-- ============================================

-- Check bucket exists:
-- SELECT * FROM storage.buckets WHERE id = 'driver-documents';

-- Check RLS policies on drivers:
-- SELECT * FROM pg_policies WHERE tablename = 'drivers';

-- Check storage policies:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'driver_docs%';
