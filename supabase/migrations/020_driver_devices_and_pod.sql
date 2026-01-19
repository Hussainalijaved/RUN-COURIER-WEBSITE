-- Migration: Create driver_devices table and ensure POD columns exist
-- Run this in Supabase SQL Editor

-- ================================================
-- 1. CREATE DRIVER_DEVICES TABLE (for push notifications)
-- ================================================
CREATE TABLE IF NOT EXISTS public.driver_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version TEXT,
  device_info TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(driver_id, push_token)
);

-- Enable RLS
ALTER TABLE public.driver_devices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_devices
-- Drivers can only see and manage their own devices
CREATE POLICY "Drivers can view own devices" ON public.driver_devices
  FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own devices" ON public.driver_devices
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update own devices" ON public.driver_devices
  FOR UPDATE USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can delete own devices" ON public.driver_devices
  FOR DELETE USING (auth.uid() = driver_id);

-- Admins can view all devices for monitoring
CREATE POLICY "Admins can view all devices" ON public.driver_devices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email')
    OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'dispatcher'))
  );

-- Service role bypass for edge functions
CREATE POLICY "Service role full access" ON public.driver_devices
  FOR ALL USING (auth.role() = 'service_role');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_driver_devices_driver_id ON public.driver_devices(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_devices_push_token ON public.driver_devices(push_token);

-- ================================================
-- 2. ENSURE POD COLUMNS EXIST IN JOBS TABLE
-- ================================================
DO $$
BEGIN
  -- Add POD photo URL column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'pod_photo_url') THEN
    ALTER TABLE public.jobs ADD COLUMN pod_photo_url TEXT;
  END IF;
  
  -- Add POD photos array column (for multiple photos)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'pod_photos') THEN
    ALTER TABLE public.jobs ADD COLUMN pod_photos JSONB;
  END IF;
  
  -- Add POD signature URL column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'pod_signature_url') THEN
    ALTER TABLE public.jobs ADD COLUMN pod_signature_url TEXT;
  END IF;
  
  -- Add POD recipient name column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'pod_recipient_name') THEN
    ALTER TABLE public.jobs ADD COLUMN pod_recipient_name TEXT;
  END IF;
  
  -- Add POD notes column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'pod_notes') THEN
    ALTER TABLE public.jobs ADD COLUMN pod_notes TEXT;
  END IF;
  
  -- Ensure coordinate columns exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'pickup_latitude') THEN
    ALTER TABLE public.jobs ADD COLUMN pickup_latitude NUMERIC;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'pickup_longitude') THEN
    ALTER TABLE public.jobs ADD COLUMN pickup_longitude NUMERIC;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'delivery_latitude') THEN
    ALTER TABLE public.jobs ADD COLUMN delivery_latitude NUMERIC;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'delivery_longitude') THEN
    ALTER TABLE public.jobs ADD COLUMN delivery_longitude NUMERIC;
  END IF;
END $$;

-- ================================================
-- 3. CREATE POD-IMAGES STORAGE BUCKET
-- ================================================
-- Note: This must be run via Supabase dashboard or API
-- Storage buckets cannot be created via SQL

-- ================================================
-- 4. GRANT PERMISSIONS
-- ================================================
GRANT ALL ON public.driver_devices TO authenticated;
GRANT SELECT ON public.driver_devices TO anon;

-- ================================================
-- SUCCESS MESSAGE
-- ================================================
DO $$ BEGIN RAISE NOTICE 'Migration completed successfully. driver_devices table created and POD columns verified.'; END $$;
