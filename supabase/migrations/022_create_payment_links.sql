-- Create payment_links table for job payment tracking
-- Run this migration in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.payment_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id VARCHAR(36) NOT NULL,
    customer_id VARCHAR(36) NOT NULL,
    customer_email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'paid', 'cancelled', 'expired')),
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    stripe_receipt_url TEXT,
    sent_via_email BOOLEAN DEFAULT false,
    sent_via_sms BOOLEAN DEFAULT false,
    audit_log JSONB DEFAULT '[]',
    expires_at TIMESTAMPTZ NOT NULL,
    opened_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(36)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_links_job_id ON public.payment_links(job_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_customer_id ON public.payment_links(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_token_hash ON public.payment_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_payment_links_expires_at ON public.payment_links(expires_at);

-- Enable Row Level Security
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_links

-- Admins can do everything
CREATE POLICY "Admins can manage payment links" ON public.payment_links
    FOR ALL
    TO authenticated
    USING (public.is_admin_by_email());

-- Customers can view their own payment links
CREATE POLICY "Customers can view own payment links" ON public.payment_links
    FOR SELECT
    TO authenticated
    USING (customer_id = auth.uid()::text);

-- Grant permissions
GRANT ALL ON public.payment_links TO authenticated;
GRANT ALL ON public.payment_links TO service_role;
