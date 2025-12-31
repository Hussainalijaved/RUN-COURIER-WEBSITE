-- FIX DRIVER PRICE DATA LEAK
-- Run this in Supabase SQL Editor to correct jobs where driver_price was incorrectly set to total_price

-- Step 1: Show current problem (preview - don't execute, just view)
-- SELECT id, tracking_number, total_price, driver_price, status
-- FROM jobs 
-- WHERE driver_price IS NOT NULL AND total_price IS NOT NULL AND driver_price = total_price
-- LIMIT 20;

-- Step 2: Update driver_price from job_assignments where admin set a different price
-- This uses the CORRECT price from the assignment record (what admin actually set)
-- Note: Cast job_id to match jobs.id type
UPDATE jobs j
SET driver_price = ja.driver_price
FROM job_assignments ja
WHERE j.id::text = ja.job_id::text
  AND ja.driver_price IS NOT NULL
  AND ja.driver_price != j.driver_price
  AND j.driver_price IS NOT NULL
  AND ja.status IN ('sent', 'accepted', 'pending');

-- Step 3: For jobs where driver_price equals total_price but NO assignment record exists,
-- we need to clear driver_price since we don't know what the admin intended
-- WARNING: This will hide these jobs from drivers until reassigned with correct price
UPDATE jobs
SET driver_price = NULL
WHERE driver_price IS NOT NULL 
  AND total_price IS NOT NULL 
  AND driver_price::numeric = total_price::numeric
  AND id::text NOT IN (
    SELECT DISTINCT job_id::text FROM job_assignments WHERE driver_price IS NOT NULL
  );

-- Step 4: Verify the fix
SELECT 
  id, 
  tracking_number,
  total_price as customer_price, 
  driver_price,
  CASE 
    WHEN driver_price = total_price THEN 'STILL WRONG - NEEDS REASSIGN'
    WHEN driver_price IS NULL THEN 'CLEARED - NEEDS REASSIGN'
    ELSE 'OK'
  END as price_status,
  status
FROM jobs 
WHERE driver_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
