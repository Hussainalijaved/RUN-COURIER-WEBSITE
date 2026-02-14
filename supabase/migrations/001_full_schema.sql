-- Run Courier - Full Supabase Schema Migration
-- This creates all tables needed to run the platform entirely on Supabase
-- Run this in the Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password TEXT,
    full_name TEXT NOT NULL,
    phone TEXT,
    postcode TEXT,
    address TEXT,
    building_name TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'driver', 'customer', 'dispatcher', 'vendor')),
    user_type TEXT DEFAULT 'individual' CHECK (user_type IN ('individual', 'business')),
    company_name TEXT,
    registration_number TEXT,
    business_address TEXT,
    vat_number TEXT,
    stripe_customer_id TEXT,
    pay_later_enabled BOOLEAN DEFAULT false,
    completed_bookings_count INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true,
    deactivated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DRIVERS TABLE (Extended from existing)
-- ============================================
-- Note: If drivers table exists, this adds missing columns
DO $$ 
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'postcode') THEN
        ALTER TABLE public.drivers ADD COLUMN postcode TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'address') THEN
        ALTER TABLE public.drivers ADD COLUMN address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'nationality') THEN
        ALTER TABLE public.drivers ADD COLUMN nationality TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'is_british') THEN
        ALTER TABLE public.drivers ADD COLUMN is_british BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'national_insurance_number') THEN
        ALTER TABLE public.drivers ADD COLUMN national_insurance_number TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'right_to_work_share_code') THEN
        ALTER TABLE public.drivers ADD COLUMN right_to_work_share_code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dbs_checked') THEN
        ALTER TABLE public.drivers ADD COLUMN dbs_checked BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dbs_certificate_url') THEN
        ALTER TABLE public.drivers ADD COLUMN dbs_certificate_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'dbs_check_date') THEN
        ALTER TABLE public.drivers ADD COLUMN dbs_check_date TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'vehicle_registration') THEN
        ALTER TABLE public.drivers ADD COLUMN vehicle_registration TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'vehicle_make') THEN
        ALTER TABLE public.drivers ADD COLUMN vehicle_make TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'vehicle_model') THEN
        ALTER TABLE public.drivers ADD COLUMN vehicle_model TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'vehicle_color') THEN
        ALTER TABLE public.drivers ADD COLUMN vehicle_color TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'current_latitude') THEN
        ALTER TABLE public.drivers ADD COLUMN current_latitude DECIMAL(10, 7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'current_longitude') THEN
        ALTER TABLE public.drivers ADD COLUMN current_longitude DECIMAL(10, 7);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'last_location_update') THEN
        ALTER TABLE public.drivers ADD COLUMN last_location_update TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'rating') THEN
        ALTER TABLE public.drivers ADD COLUMN rating DECIMAL(3, 2) DEFAULT 5.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'total_jobs') THEN
        ALTER TABLE public.drivers ADD COLUMN total_jobs INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'profile_picture_url') THEN
        ALTER TABLE public.drivers ADD COLUMN profile_picture_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'is_active') THEN
        ALTER TABLE public.drivers ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'deactivated_at') THEN
        ALTER TABLE public.drivers ADD COLUMN deactivated_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================
-- VEHICLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL UNIQUE CHECK (type IN ('motorbike', 'car', 'small_van', 'medium_van')),
    name TEXT NOT NULL,
    description TEXT,
    max_weight INTEGER NOT NULL,
    base_charge DECIMAL(10, 2) NOT NULL,
    per_mile_rate DECIMAL(10, 2) NOT NULL,
    rush_hour_rate DECIMAL(10, 2),
    icon_url TEXT
);

-- ============================================
-- PRICING SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.pricing_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    central_london_surcharge DECIMAL(10, 2) DEFAULT 15.00,
    multi_drop_charge DECIMAL(10, 2) DEFAULT 5.00,
    return_trip_multiplier DECIMAL(5, 2) DEFAULT 0.60,
    waiting_time_free_minutes INTEGER DEFAULT 10,
    waiting_time_per_minute DECIMAL(10, 2) DEFAULT 0.50,
    rush_hour_start TEXT DEFAULT '07:00',
    rush_hour_end TEXT DEFAULT '09:00',
    rush_hour_start_evening TEXT DEFAULT '17:00',
    rush_hour_end_evening TEXT DEFAULT '19:00',
    weight_surcharges JSONB DEFAULT '{"4-10": 5, "10-20": 10, "20-30": 15, "30-50": 20, "50+": 50}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- JOBS TABLE (Extended from existing)
-- ============================================
DO $$ 
BEGIN
    -- Add missing columns to jobs table if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'dispatcher_id') THEN
        ALTER TABLE public.jobs ADD COLUMN dispatcher_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'vendor_id') THEN
        ALTER TABLE public.jobs ADD COLUMN vendor_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'pickup_building_name') THEN
        ALTER TABLE public.jobs ADD COLUMN pickup_building_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'pickup_contact_name') THEN
        ALTER TABLE public.jobs ADD COLUMN pickup_contact_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'pickup_contact_phone') THEN
        ALTER TABLE public.jobs ADD COLUMN pickup_contact_phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'delivery_building_name') THEN
        ALTER TABLE public.jobs ADD COLUMN delivery_building_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'return_to_same_location') THEN
        ALTER TABLE public.jobs ADD COLUMN return_to_same_location BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'return_address') THEN
        ALTER TABLE public.jobs ADD COLUMN return_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'return_postcode') THEN
        ALTER TABLE public.jobs ADD COLUMN return_postcode TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'is_scheduled') THEN
        ALTER TABLE public.jobs ADD COLUMN is_scheduled BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'scheduled_pickup_time') THEN
        ALTER TABLE public.jobs ADD COLUMN scheduled_pickup_time TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'scheduled_delivery_time') THEN
        ALTER TABLE public.jobs ADD COLUMN scheduled_delivery_time TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'is_central_london') THEN
        ALTER TABLE public.jobs ADD COLUMN is_central_london BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'is_rush_hour') THEN
        ALTER TABLE public.jobs ADD COLUMN is_rush_hour BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'distance_price') THEN
        ALTER TABLE public.jobs ADD COLUMN distance_price DECIMAL(10, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'weight_surcharge') THEN
        ALTER TABLE public.jobs ADD COLUMN weight_surcharge DECIMAL(10, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'multi_drop_charge') THEN
        ALTER TABLE public.jobs ADD COLUMN multi_drop_charge DECIMAL(10, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'return_trip_charge') THEN
        ALTER TABLE public.jobs ADD COLUMN return_trip_charge DECIMAL(10, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'central_london_charge') THEN
        ALTER TABLE public.jobs ADD COLUMN central_london_charge DECIMAL(10, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'waiting_time_charge') THEN
        ALTER TABLE public.jobs ADD COLUMN waiting_time_charge DECIMAL(10, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'driver_price') THEN
        ALTER TABLE public.jobs ADD COLUMN driver_price DECIMAL(10, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'payment_intent_id') THEN
        ALTER TABLE public.jobs ADD COLUMN payment_intent_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'pod_photo_url') THEN
        ALTER TABLE public.jobs ADD COLUMN pod_photo_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'pod_signature_url') THEN
        ALTER TABLE public.jobs ADD COLUMN pod_signature_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'pod_recipient_name') THEN
        ALTER TABLE public.jobs ADD COLUMN pod_recipient_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'delivered_at') THEN
        ALTER TABLE public.jobs ADD COLUMN delivered_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'rejection_reason') THEN
        ALTER TABLE public.jobs ADD COLUMN rejection_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'estimated_pickup_time') THEN
        ALTER TABLE public.jobs ADD COLUMN estimated_pickup_time TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'estimated_delivery_time') THEN
        ALTER TABLE public.jobs ADD COLUMN estimated_delivery_time TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'actual_pickup_time') THEN
        ALTER TABLE public.jobs ADD COLUMN actual_pickup_time TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'actual_delivery_time') THEN
        ALTER TABLE public.jobs ADD COLUMN actual_delivery_time TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'driver_hidden') THEN
        ALTER TABLE public.jobs ADD COLUMN driver_hidden BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'driver_hidden_at') THEN
        ALTER TABLE public.jobs ADD COLUMN driver_hidden_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'driver_hidden_by') THEN
        ALTER TABLE public.jobs ADD COLUMN driver_hidden_by UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'updated_at') THEN
        ALTER TABLE public.jobs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================
-- MULTI-DROP STOPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.multi_drop_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    stop_order INTEGER NOT NULL,
    address TEXT NOT NULL,
    postcode TEXT NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    recipient_name TEXT,
    recipient_phone TEXT,
    instructions TEXT,
    status TEXT DEFAULT 'pending',
    delivered_at TIMESTAMPTZ,
    pod_photo_url TEXT,
    pod_signature_url TEXT,
    pod_recipient_name TEXT
);

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL,
    type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID,
    review_notes TEXT,
    expiry_date TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VENDOR API KEYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.vendor_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INVOICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DRIVER APPLICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.driver_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    postcode TEXT NOT NULL,
    full_address TEXT NOT NULL,
    building_name TEXT,
    profile_picture_url TEXT,
    nationality TEXT NOT NULL,
    is_british BOOLEAN DEFAULT false,
    national_insurance_number TEXT NOT NULL,
    right_to_work_share_code TEXT,
    driving_licence_front_url TEXT,
    driving_licence_back_url TEXT,
    dbs_certificate_url TEXT,
    goods_in_transit_insurance_url TEXT,
    hire_and_reward_url TEXT,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('motorbike', 'car', 'small_van', 'medium_van')),
    bank_name TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    sort_code TEXT NOT NULL,
    account_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID,
    review_notes TEXT,
    rejection_reason TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- ============================================
-- JOB ASSIGNMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.job_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    assigned_by UUID NOT NULL,
    driver_price DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'rejected', 'cancelled', 'expired', 'withdrawn', 'removed', 'cleaned')),
    batch_group_id UUID,
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    rejection_reason TEXT,
    expires_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    withdrawn_by UUID,
    removed_at TIMESTAMPTZ,
    removed_by UUID,
    cleaned_at TIMESTAMPTZ,
    cleaned_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DELIVERY CONTACTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.delivery_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    label TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_postcode TEXT NOT NULL,
    building_name TEXT,
    delivery_instructions TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DRIVER PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.driver_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL,
    job_id UUID,
    amount DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2) DEFAULT 0.00,
    net_amount DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    payout_reference TEXT,
    description TEXT,
    job_tracking_number TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYMENT LINKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.payment_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL,
    customer_id UUID NOT NULL,
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
    created_by UUID
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_driver_id ON public.jobs(driver_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_tracking_number ON public.jobs(tracking_number);
CREATE INDEX IF NOT EXISTS idx_documents_driver_id ON public.documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON public.job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_driver_id ON public.job_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_contacts_customer_id ON public.delivery_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_driver_payments_driver_id ON public.driver_payments(driver_id);

-- ============================================
-- ENABLE REALTIME FOR KEY TABLES
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Note: Run RLS policies from supabase/rls-policies.sql after this migration
