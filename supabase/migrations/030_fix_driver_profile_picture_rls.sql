-- Fix RLS policies for driver profile picture uploads
-- This enables drivers to:
-- 1. Upload files to Supabase Storage (DRIVER-DOCUMENTS bucket)
-- 2. Update their own profile_picture_url in the drivers table

-- ============================================
-- DRIVERS TABLE RLS POLICIES
-- ============================================

-- Enable RLS on drivers table
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "drivers_select_own" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_own" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_own_profile" ON public.drivers;
DROP POLICY IF EXISTS "allow_driver_self_update" ON public.drivers;

-- Policy: Drivers can SELECT their own record
CREATE POLICY "drivers_select_own" ON public.drivers
    FOR SELECT
    USING (auth.uid() = id OR auth.uid()::text = id::text);

-- Policy: Drivers can UPDATE their own record
CREATE POLICY "drivers_update_own" ON public.drivers
    FOR UPDATE
    USING (auth.uid() = id OR auth.uid()::text = id::text)
    WITH CHECK (auth.uid() = id OR auth.uid()::text = id::text);

-- Grant permissions to authenticated users
GRANT SELECT, UPDATE ON public.drivers TO authenticated;

-- ============================================
-- STORAGE BUCKET RLS POLICIES
-- ============================================

-- Create the bucket if it doesn't exist (with public access for profile pictures)
INSERT INTO storage.buckets (id, name, public)
VALUES ('DRIVER-DOCUMENTS', 'DRIVER-DOCUMENTS', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Also check for lowercase version
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-documents', 'driver-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies to avoid conflicts
DROP POLICY IF EXISTS "driver_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "driver_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "driver_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "driver_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can update their own documents" ON storage.objects;

-- Policy: Authenticated users can upload files to their own folder
CREATE POLICY "driver_storage_insert" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id IN ('DRIVER-DOCUMENTS', 'driver-documents')
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Authenticated users can view files in their own folder OR public files
CREATE POLICY "driver_storage_select" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id IN ('DRIVER-DOCUMENTS', 'driver-documents')
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR bucket_id IN (SELECT id FROM storage.buckets WHERE public = true)
        )
    );

-- Policy: Authenticated users can update files in their own folder
CREATE POLICY "driver_storage_update" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id IN ('DRIVER-DOCUMENTS', 'driver-documents')
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id IN ('DRIVER-DOCUMENTS', 'driver-documents')
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Authenticated users can delete files in their own folder
CREATE POLICY "driver_storage_delete" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id IN ('DRIVER-DOCUMENTS', 'driver-documents')
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow public/anonymous read access to the bucket (for displaying profile pictures)
CREATE POLICY "public_storage_select" ON storage.objects
    FOR SELECT
    TO anon
    USING (
        bucket_id IN ('DRIVER-DOCUMENTS', 'driver-documents')
    );
