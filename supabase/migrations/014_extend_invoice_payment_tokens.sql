-- Extend invoice_payment_tokens with additional invoice fields
-- Run this in Supabase SQL Editor

-- Add company/business details
ALTER TABLE invoice_payment_tokens ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE invoice_payment_tokens ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE invoice_payment_tokens ADD COLUMN IF NOT EXISTS vat_number TEXT;

-- Add financial breakdown
ALTER TABLE invoice_payment_tokens ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2);
ALTER TABLE invoice_payment_tokens ADD COLUMN IF NOT EXISTS vat DECIMAL(10, 2) DEFAULT 0;

-- Add job details as JSON
ALTER TABLE invoice_payment_tokens ADD COLUMN IF NOT EXISTS job_details JSONB;
ALTER TABLE invoice_payment_tokens ADD COLUMN IF NOT EXISTS job_ids TEXT[];

-- Update existing rows to have subtotal = amount where subtotal is null
UPDATE invoice_payment_tokens SET subtotal = amount WHERE subtotal IS NULL;
