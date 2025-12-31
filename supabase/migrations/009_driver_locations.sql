-- =====================================================
-- DRIVER LOCATIONS TABLE FOR REAL-TIME GPS TRACKING
-- =====================================================
-- This table stores real-time driver location updates linked to jobs.
-- Mobile app writes location, web app reads via real-time subscription.

-- Create driver_locations table
CREATE TABLE IF NOT EXISTS driver_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID, -- Nullable when driver is just online (not on a job)
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  accuracy DECIMAL(10, 2), -- GPS accuracy in meters
  heading DECIMAL(5, 2), -- Direction in degrees (0-360)
  speed DECIMAL(6, 2), -- Speed in m/s
  altitude DECIMAL(10, 2), -- Altitude in meters
  battery_level INTEGER, -- Battery percentage (0-100)
  is_moving BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'gps', -- 'gps', 'network', 'fused'
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create unique constraint for upsert (one location per driver per job)
-- This ensures we update rather than duplicate
CREATE UNIQUE INDEX IF NOT EXISTS driver_locations_driver_job_idx 
  ON driver_locations(driver_id, COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- Create index for fast lookups by driver
CREATE INDEX IF NOT EXISTS driver_locations_driver_id_idx ON driver_locations(driver_id);

-- Create index for fast lookups by job
CREATE INDEX IF NOT EXISTS driver_locations_job_id_idx ON driver_locations(job_id);

-- Create index for real-time queries (most recent locations)
CREATE INDEX IF NOT EXISTS driver_locations_updated_at_idx ON driver_locations(updated_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Drivers can insert/update their own location
CREATE POLICY "Drivers can insert their own location" ON driver_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update their own location" ON driver_locations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

-- Policy: Drivers can read their own locations
CREATE POLICY "Drivers can read their own location" ON driver_locations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = driver_id);

-- Policy: Admins and dispatchers can read all locations
-- Uses the existing users table role column
CREATE POLICY "Admins can read all locations" ON driver_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid()::text 
      AND users.role IN ('admin', 'dispatcher')
    )
  );

-- Policy: Customers can read location for their jobs only
CREATE POLICY "Customers can read driver location for their jobs" ON driver_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = driver_locations.job_id 
      AND jobs.customer_id = auth.uid()
      AND jobs.status IN ('assigned', 'picked_up', 'in_transit')
    )
  );

-- =====================================================
-- UPSERT FUNCTION FOR LOCATION UPDATES
-- =====================================================
-- This function handles inserting or updating driver location in one call

CREATE OR REPLACE FUNCTION upsert_driver_location(
  p_driver_id UUID,
  p_job_id UUID,
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_accuracy DECIMAL DEFAULT NULL,
  p_heading DECIMAL DEFAULT NULL,
  p_speed DECIMAL DEFAULT NULL,
  p_altitude DECIMAL DEFAULT NULL,
  p_battery_level INTEGER DEFAULT NULL,
  p_is_moving BOOLEAN DEFAULT true,
  p_source TEXT DEFAULT 'gps'
)
RETURNS driver_locations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result driver_locations;
BEGIN
  -- Verify the caller is the driver
  IF auth.uid() != p_driver_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only update your own location';
  END IF;

  INSERT INTO driver_locations (
    driver_id,
    job_id,
    latitude,
    longitude,
    accuracy,
    heading,
    speed,
    altitude,
    battery_level,
    is_moving,
    source,
    updated_at
  ) VALUES (
    p_driver_id,
    p_job_id,
    p_latitude,
    p_longitude,
    p_accuracy,
    p_heading,
    p_speed,
    p_altitude,
    p_battery_level,
    p_is_moving,
    p_source,
    NOW()
  )
  ON CONFLICT (driver_id, COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::UUID))
  DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    accuracy = EXCLUDED.accuracy,
    heading = EXCLUDED.heading,
    speed = EXCLUDED.speed,
    altitude = EXCLUDED.altitude,
    battery_level = EXCLUDED.battery_level,
    is_moving = EXCLUDED.is_moving,
    source = EXCLUDED.source,
    updated_at = NOW()
  RETURNING * INTO result;

  -- Also update the drivers table with current location
  UPDATE drivers SET
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    last_location_update = NOW(),
    is_available = true
  WHERE id = p_driver_id;

  RETURN result;
END;
$$;

-- =====================================================
-- REALTIME SUBSCRIPTION SETUP
-- =====================================================
-- Enable realtime for driver_locations table

-- Add to realtime publication (if not already added)
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;

-- =====================================================
-- CLEANUP FUNCTION (Optional - for old locations)
-- =====================================================
-- Delete locations older than 24 hours to prevent table bloat

CREATE OR REPLACE FUNCTION cleanup_old_driver_locations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM driver_locations
  WHERE updated_at < NOW() - INTERVAL '24 hours'
  AND job_id IS NOT NULL; -- Keep "idle" locations for 24h
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION upsert_driver_location TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_driver_locations TO authenticated;
