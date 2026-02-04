-- Migration: Fix driver profile picture update RLS
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- This allows drivers to update their own profile_picture_url

-- ============================================
-- 1. ENSURE RLS IS ENABLED ON DRIVERS TABLE
-- ============================================
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. DROP EXISTING UPDATE POLICIES (if any)
-- ============================================
DROP POLICY IF EXISTS "drivers_update_own" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_own_profile" ON public.drivers;
DROP POLICY IF EXISTS "drivers_update_admin" ON public.drivers;

-- ============================================
-- 3. CREATE RLS POLICIES FOR DRIVERS TABLE
-- ============================================

-- Policy: Drivers can update their own record (where id = auth.uid())
CREATE POLICY "drivers_update_own" ON public.drivers
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Admins can update any driver
CREATE POLICY "drivers_update_admin" ON public.drivers
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.admins 
      WHERE admins.email = auth.jwt()->>'email'
    )
  );

-- ============================================
-- 4. ENSURE SELECT POLICIES EXIST
-- ============================================
DROP POLICY IF EXISTS "drivers_select_own" ON public.drivers;
DROP POLICY IF EXISTS "drivers_select_admin" ON public.drivers;

-- Drivers can read their own record
CREATE POLICY "drivers_select_own" ON public.drivers
  FOR SELECT 
  USING (auth.uid() = id);

-- Admins can read all drivers
CREATE POLICY "drivers_select_admin" ON public.drivers
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.admins 
      WHERE admins.email = auth.jwt()->>'email'
    )
  );

-- ============================================
-- 5. GRANT PERMISSIONS
-- ============================================
GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;

-- ============================================
-- 6. VERIFICATION - Run these queries to verify
-- ============================================
-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'drivers';

-- Check policies exist:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'drivers';

-- Test as a driver (replace with actual driver ID):
-- SELECT * FROM drivers WHERE id = 'your-driver-id';
