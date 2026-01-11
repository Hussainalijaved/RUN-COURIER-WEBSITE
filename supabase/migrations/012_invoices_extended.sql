-- Add new columns to invoices table for payment tokens and job details
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_token TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS job_details TEXT;

-- Make customer_id nullable for manual invoices
ALTER TABLE invoices ALTER COLUMN customer_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_payment_token ON invoices(payment_token);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_email ON invoices(customer_email);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

COMMENT ON TABLE invoices IS 'Stores all invoices sent to customers with job details and payment status';
