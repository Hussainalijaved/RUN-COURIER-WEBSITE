-- Migration to fix job_id column type in job_assignments table
-- This allows both integer and UUID job IDs to be stored

-- First, drop the existing index
DROP INDEX IF EXISTS idx_job_assignments_job_id;

-- Alter the column type from UUID to TEXT to support both integer and UUID formats
ALTER TABLE public.job_assignments 
ALTER COLUMN job_id TYPE TEXT USING job_id::TEXT;

-- Recreate the index
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON public.job_assignments(job_id);

-- Note: Run this migration in the Supabase SQL editor to fix the type mismatch
