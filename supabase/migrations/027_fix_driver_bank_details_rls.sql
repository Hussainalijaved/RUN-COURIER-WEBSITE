-- Migration: Fix RLS policy for driver bank details updates from mobile app
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

-- Drivers can update their own profile (all columns including bank details)
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
-- 5. VERIFY BANK DETAILS COLUMNS EXIST
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
END $$;

-- ============================================
-- VERIFICATION (run these queries to verify)
-- ============================================
-- SELECT * FROM pg_policies WHERE tablename = 'drivers' AND policyname LIKE 'drivers_update%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name IN ('bank_name', 'account_holder_name', 'sort_code', 'account_number');
