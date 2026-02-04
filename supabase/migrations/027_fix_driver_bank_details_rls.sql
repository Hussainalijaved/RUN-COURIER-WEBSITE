-- Migration: Fix RLS policy for driver profile updates (bank details + profile picture) from mobile app
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. DROP AND RECREATE DRIVER UPDATE POLICIES
-- ============================================

-- Drop existing update policies to avoid conflicts
DROP POLICY IF EXISTS "drivers_update_own" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_admin" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own profile" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_own_profile" ON public.drivers;

-- ============================================
-- 2. CREATE COMPREHENSIVE UPDATE POLICY FOR DRIVERS
-- ============================================

-- Drivers can update their own profile (all columns including bank details and profile picture)
CREATE POLICY "drivers_update_own" ON public.drivers
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any driver
CREATE POLICY "drivers_update_admin" ON public.drivers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.admins 
      WHERE admins.email = auth.jwt()->>'email'
    )
  );

-- ============================================
-- 3. ENSURE RLS IS ENABLED
-- ============================================

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. GRANT PROPER PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;

-- ============================================
-- 5. VERIFY ALL PROFILE COLUMNS EXIST
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'bank_name') THEN
        ALTER TABLE public.drivers ADD COLUMN bank_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'account_holder_name') THEN
        ALTER TABLE public.drivers ADD COLUMN account_holder_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'sort_code') THEN
        ALTER TABLE public.drivers ADD COLUMN sort_code TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'account_number') THEN
        ALTER TABLE public.drivers ADD COLUMN account_number TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'profile_picture_url') THEN
        ALTER TABLE public.drivers ADD COLUMN profile_picture_url TEXT;
    END IF;
END $$;

-- ============================================
-- 6. FIX STORAGE BUCKET FOR DRIVER DOCUMENTS
-- ============================================

-- Create or update the driver-documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('driver-documents', 'driver-documents', true, 10485760)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 10485760;

-- ============================================
-- 7. FIX STORAGE POLICIES FOR PROFILE PICTURES
-- ============================================

-- Drop ALL existing storage policies to recreate them cleanly
DROP POLICY IF EXISTS "driver_docs_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_read_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_read_admin" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_update_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "driver_docs_public_read" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_delete" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_select" ON storage.objects;

-- Policy: Any authenticated user can upload to driver-documents bucket
CREATE POLICY "driver_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driver-documents');

-- Policy: Any authenticated user can update files in driver-documents bucket  
CREATE POLICY "driver_documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'driver-documents');

-- Policy: Any authenticated user can delete files in driver-documents bucket
CREATE POLICY "driver_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'driver-documents');

-- Policy: Public read access for driver documents (bucket is public for profile pictures)
CREATE POLICY "driver_documents_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'driver-documents');

-- ============================================
-- VERIFICATION (run these queries to verify)
-- ============================================
-- SELECT * FROM pg_policies WHERE tablename = 'drivers' AND policyname LIKE 'drivers_update%';
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'driver_docs%';
-- SELECT * FROM storage.buckets WHERE id = 'driver-documents';
