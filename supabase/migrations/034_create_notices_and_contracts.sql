-- 034_create_notices_and_contracts.sql
-- This migration ensures that Notice and Contract tables exist in Supabase
-- to move away from the hybrid PostgreSQL setup.

-- 1. Notice Templates
CREATE TABLE IF NOT EXISTS public.notice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    requires_acknowledgement BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Driver Notices (the actual sent notices)
CREATE TABLE IF NOT EXISTS public.driver_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.notice_templates(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    sent_by TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    target_type TEXT NOT NULL DEFAULT 'all', -- 'all', 'specific', 'group'
    requires_acknowledgement BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'sent', -- 'sent', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Driver Notice Recipients (tracking who received/read what)
CREATE TABLE IF NOT EXISTS public.driver_notice_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id UUID NOT NULL REFERENCES public.driver_notices(id) ON DELETE CASCADE,
    driver_id TEXT NOT NULL, -- UUID string
    driver_email TEXT,
    delivery_channel TEXT DEFAULT 'app', -- 'app', 'email', 'sms'
    viewed_at TIMESTAMPTZ,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Contracts (Ensuring these exist as well)
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.contract_templates(id),
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_email TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signature_data TEXT,
  signed_name TEXT,
  token TEXT UNIQUE NOT NULL,
  contract_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_driver_notice_recipients_driver_id ON public.driver_notice_recipients(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_notice_recipients_notice_id ON public.driver_notice_recipients(notice_id);
CREATE INDEX IF NOT EXISTS idx_driver_notices_sent_at ON public.driver_notices(sent_at);
CREATE INDEX IF NOT EXISTS idx_driver_contracts_driver_id ON public.driver_contracts(driver_id);
