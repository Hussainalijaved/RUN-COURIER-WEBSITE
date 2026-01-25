-- Add driver payment status tracking columns to jobs table
-- Run this in Supabase SQL Editor

-- Add driver_payment_status column with default 'unpaid'
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS driver_payment_status TEXT DEFAULT 'unpaid';

-- Add driver_paid_at timestamp column
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS driver_paid_at TIMESTAMP;

-- Add index for filtering by payment status
CREATE INDEX IF NOT EXISTS idx_jobs_driver_payment_status ON jobs(driver_payment_status);

-- Update existing jobs with driver_price to have 'unpaid' status
UPDATE jobs 
SET driver_payment_status = 'unpaid' 
WHERE driver_price IS NOT NULL 
AND driver_payment_status IS NULL;
