-- Create driver_locations table for reliable GPS tracking
CREATE TABLE IF NOT EXISTS driver_locations (
  id BIGSERIAL PRIMARY KEY,
  driver_id UUID NOT NULL,
  job_id UUID,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed REAL,
  heading REAL,
  accuracy REAL,
  is_moving BOOLEAN DEFAULT false,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one row per driver (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_locations_driver_id 
  ON driver_locations (driver_id);

-- Index for fast lookups by job
CREATE INDEX IF NOT EXISTS idx_driver_locations_job_id 
  ON driver_locations (job_id) WHERE job_id IS NOT NULL;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_driver_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_driver_locations_updated_at ON driver_locations;
CREATE TRIGGER trigger_driver_locations_updated_at
  BEFORE UPDATE ON driver_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_driver_locations_updated_at();

-- Enable RLS
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

-- Drivers can insert/update their own location
CREATE POLICY driver_locations_driver_write ON driver_locations
  FOR ALL
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- Admins can read all locations
CREATE POLICY driver_locations_admin_read ON driver_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Service role bypass (for server-side upserts)
CREATE POLICY driver_locations_service_all ON driver_locations
  FOR ALL
  USING (auth.role() = 'service_role');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;

-- Upsert function for atomic location updates
CREATE OR REPLACE FUNCTION upsert_driver_location(
  p_driver_id UUID,
  p_job_id UUID DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT 0,
  p_longitude DOUBLE PRECISION DEFAULT 0,
  p_speed REAL DEFAULT NULL,
  p_heading REAL DEFAULT NULL,
  p_accuracy REAL DEFAULT NULL,
  p_is_moving BOOLEAN DEFAULT false
) RETURNS void AS $$
BEGIN
  INSERT INTO driver_locations (driver_id, job_id, latitude, longitude, speed, heading, accuracy, is_moving, recorded_at, updated_at)
  VALUES (p_driver_id, p_job_id, p_latitude, p_longitude, p_speed, p_heading, p_accuracy, p_is_moving, NOW(), NOW())
  ON CONFLICT (driver_id)
  DO UPDATE SET
    job_id = EXCLUDED.job_id,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    speed = EXCLUDED.speed,
    heading = EXCLUDED.heading,
    accuracy = EXCLUDED.accuracy,
    is_moving = EXCLUDED.is_moving,
    recorded_at = NOW(),
    updated_at = NOW();
    
  -- Also update drivers table for backward compatibility
  UPDATE drivers SET
    current_latitude = p_latitude::text,
    current_longitude = p_longitude::text,
    last_location_update = NOW()
  WHERE id = p_driver_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
