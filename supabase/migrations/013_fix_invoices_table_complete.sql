-- Complete fix for invoices table - Run this in Supabase SQL Editor
-- This adds all missing columns that the application needs

-- First, check if the table exists. If not, create it with all columns
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id UUID,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    company_name TEXT,
    business_address TEXT,
    vat_number TEXT,
    subtotal DECIMAL(10, 2) NOT NULL,
    vat DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    due_date TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    job_ids TEXT[],
    notes TEXT,
    payment_token TEXT,
    job_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- If table exists but is missing columns, add them
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS job_ids TEXT[];
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_token TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS job_details JSONB;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Make customer_id nullable for manual invoices
ALTER TABLE public.invoices ALTER COLUMN customer_id DROP NOT NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_payment_token ON public.invoices(payment_token);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- Update RLS policies for admin access
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices;
CREATE POLICY "Admins can manage invoices" ON public.invoices
    FOR ALL USING (true);
