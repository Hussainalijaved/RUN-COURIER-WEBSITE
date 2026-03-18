-- Add office_city and created_by columns to the jobs table
-- office_city: the supervisor's city/office that created or handled the booking
-- created_by: human-readable label (e.g. "Admin: John", "Supervisor: Jane")

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS office_city TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Index for fast filtering by office
CREATE INDEX IF NOT EXISTS idx_jobs_office_city ON public.jobs(office_city);
