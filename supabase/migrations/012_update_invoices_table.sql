-- Migration: Add missing columns to invoices table for invoice management system
-- Run this in Supabase SQL Editor

-- Make customer_id nullable for manual invoices
ALTER TABLE public.invoices ALTER COLUMN customer_id DROP NOT NULL;

-- Add payment_token column for payment links
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_token TEXT;

-- Add job_details column to store job breakdown
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS job_details JSONB;

-- Create index on payment_token for quick lookups
CREATE INDEX IF NOT EXISTS idx_invoices_payment_token ON public.invoices(payment_token);

-- Create index on invoice_number
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
