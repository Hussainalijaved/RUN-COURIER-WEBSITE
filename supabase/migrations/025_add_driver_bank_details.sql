-- Add bank details columns to drivers table for payment management
-- Run this in Supabase SQL Editor

-- Add bank details columns to drivers table
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS account_holder_name TEXT,
ADD COLUMN IF NOT EXISTS sort_code TEXT,
ADD COLUMN IF NOT EXISTS account_number TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.drivers.bank_name IS 'Driver bank name for payments';
COMMENT ON COLUMN public.drivers.account_holder_name IS 'Name on the bank account';
COMMENT ON COLUMN public.drivers.sort_code IS 'Bank sort code (UK format: XX-XX-XX)';
COMMENT ON COLUMN public.drivers.account_number IS 'Bank account number';
