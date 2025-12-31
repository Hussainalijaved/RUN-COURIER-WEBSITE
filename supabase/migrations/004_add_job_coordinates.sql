-- Add coordinate columns to jobs table for map display
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_latitude DECIMAL(10, 8);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_longitude DECIMAL(11, 8);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 8);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(11, 8);

-- Add index for coordinate-based queries (optional performance optimization)
CREATE INDEX IF NOT EXISTS idx_jobs_pickup_coords ON jobs (pickup_latitude, pickup_longitude) WHERE pickup_latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_delivery_coords ON jobs (delivery_latitude, delivery_longitude) WHERE delivery_latitude IS NOT NULL;

COMMENT ON COLUMN jobs.pickup_latitude IS 'Latitude coordinate of pickup location (geocoded from pickup_address)';
COMMENT ON COLUMN jobs.pickup_longitude IS 'Longitude coordinate of pickup location (geocoded from pickup_address)';
COMMENT ON COLUMN jobs.delivery_latitude IS 'Latitude coordinate of delivery location (geocoded from delivery_address)';
COMMENT ON COLUMN jobs.delivery_longitude IS 'Longitude coordinate of delivery location (geocoded from delivery_address)';
