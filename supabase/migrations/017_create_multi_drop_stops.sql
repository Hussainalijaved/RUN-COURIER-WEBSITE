-- Create multi_drop_stops table for storing individual stops in multi-drop deliveries
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.multi_drop_stops (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::varchar(36),
  job_id varchar(36) NOT NULL,
  stop_order integer NOT NULL,
  address text NOT NULL,
  postcode text NOT NULL,
  latitude decimal(10, 7),
  longitude decimal(10, 7),
  recipient_name text,
  recipient_phone text,
  instructions text,
  status text DEFAULT 'pending',
  delivered_at timestamp with time zone,
  pod_photo_url text,
  pod_signature_url text,
  pod_recipient_name text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create index for efficient job lookups
CREATE INDEX IF NOT EXISTS idx_multi_drop_stops_job_id ON public.multi_drop_stops(job_id);
CREATE INDEX IF NOT EXISTS idx_multi_drop_stops_status ON public.multi_drop_stops(status);

-- Enable RLS
ALTER TABLE public.multi_drop_stops ENABLE ROW LEVEL SECURITY;

-- Admin access policy
CREATE POLICY "admin_multi_drop_stops_all" ON public.multi_drop_stops
  FOR ALL
  TO authenticated
  USING (public.is_admin_by_email());

-- Drivers can view stops for their assigned jobs
CREATE POLICY "driver_view_assigned_stops" ON public.multi_drop_stops
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id::varchar = multi_drop_stops.job_id
      AND j.driver_id = auth.uid()::varchar
    )
  );

-- Drivers can update POD for their stops
CREATE POLICY "driver_update_pod_stops" ON public.multi_drop_stops
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id::varchar = multi_drop_stops.job_id
      AND j.driver_id = auth.uid()::varchar
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id::varchar = multi_drop_stops.job_id
      AND j.driver_id = auth.uid()::varchar
    )
  );

COMMENT ON TABLE public.multi_drop_stops IS 'Individual delivery stops for multi-drop jobs';
