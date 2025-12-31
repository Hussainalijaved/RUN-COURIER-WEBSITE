-- Customer Tables for Individual and Business Users
-- Run this in your Supabase SQL Editor

-- Create enum types
CREATE TYPE customer_role AS ENUM ('individual', 'business');
CREATE TYPE payment_option AS ENUM ('pay_now', 'pay_later');
CREATE TYPE booking_status AS ENUM (
  'draft',
  'pending_payment',
  'paid',
  'confirmed',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled'
);
CREATE TYPE invoice_status AS ENUM ('pending', 'sent', 'paid', 'overdue');
CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE stop_type AS ENUM ('pickup', 'delivery', 'return');

-- Customer Profiles Table
CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role customer_role NOT NULL DEFAULT 'individual',
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  postcode TEXT,
  company_name TEXT,
  company_reg_number TEXT,
  company_address TEXT,
  contact_person_name TEXT,
  contact_person_phone TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Bookings Table
CREATE TABLE customer_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE NOT NULL,
  tracking_number TEXT UNIQUE NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_postcode TEXT NOT NULL,
  pickup_lat DECIMAL(10, 8),
  pickup_lng DECIMAL(11, 8),
  delivery_address TEXT NOT NULL,
  delivery_postcode TEXT NOT NULL,
  delivery_lat DECIMAL(10, 8),
  delivery_lng DECIMAL(11, 8),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  vehicle_type TEXT NOT NULL DEFAULT 'car',
  parcel_weight DECIMAL(10, 2),
  parcel_description TEXT,
  is_multi_drop BOOLEAN DEFAULT FALSE,
  is_return_required BOOLEAN DEFAULT FALSE,
  payment_option payment_option NOT NULL DEFAULT 'pay_now',
  price_estimate DECIMAL(10, 2),
  price_final DECIMAL(10, 2),
  status booking_status NOT NULL DEFAULT 'draft',
  driver_job_id TEXT,
  stripe_payment_intent_id TEXT,
  invoice_id UUID,
  notes TEXT,
  sender_name TEXT,
  sender_phone TEXT,
  recipient_name TEXT,
  recipient_phone TEXT,
  pod_photo_url TEXT,
  pod_photos TEXT[],
  pod_signature_url TEXT,
  pod_notes TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Booking Stops Table (for multi-drop deliveries)
CREATE TABLE booking_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES customer_bookings(id) ON DELETE CASCADE NOT NULL,
  stop_order INTEGER NOT NULL,
  stop_type stop_type NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  recipient_name TEXT,
  recipient_phone TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Booking Payments Table
CREATE TABLE booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES customer_bookings(id) ON DELETE CASCADE NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'gbp',
  status payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Weekly Invoices Table (for business users)
CREATE TABLE customer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customer_profiles(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'pending',
  stripe_invoice_id TEXT,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add booking reference to invoices
ALTER TABLE customer_bookings 
ADD CONSTRAINT fk_invoice 
FOREIGN KEY (invoice_id) REFERENCES customer_invoices(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_customer_profiles_auth_user ON customer_profiles(auth_user_id);
CREATE INDEX idx_customer_profiles_email ON customer_profiles(email);
CREATE INDEX idx_customer_bookings_customer ON customer_bookings(customer_id);
CREATE INDEX idx_customer_bookings_status ON customer_bookings(status);
CREATE INDEX idx_customer_bookings_tracking ON customer_bookings(tracking_number);
CREATE INDEX idx_booking_stops_booking ON booking_stops(booking_id);
CREATE INDEX idx_booking_payments_booking ON booking_payments(booking_id);
CREATE INDEX idx_customer_invoices_customer ON customer_invoices(customer_id);

-- Row Level Security (RLS) Policies
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY;

-- Customers can only see and modify their own profile
CREATE POLICY "Customers can view own profile" ON customer_profiles
  FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Customers can update own profile" ON customer_profiles
  FOR UPDATE USING (auth.uid() = auth_user_id);

CREATE POLICY "Customers can insert own profile" ON customer_profiles
  FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

-- Customers can only see and modify their own bookings
CREATE POLICY "Customers can view own bookings" ON customer_bookings
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customer_profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Customers can insert own bookings" ON customer_bookings
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM customer_profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Customers can update own bookings" ON customer_bookings
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customer_profiles WHERE auth_user_id = auth.uid())
  );

-- Booking stops follow booking access
CREATE POLICY "Customers can view own booking stops" ON booking_stops
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM customer_bookings WHERE customer_id IN (
        SELECT id FROM customer_profiles WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Customers can manage own booking stops" ON booking_stops
  FOR ALL USING (
    booking_id IN (
      SELECT id FROM customer_bookings WHERE customer_id IN (
        SELECT id FROM customer_profiles WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Booking payments follow booking access
CREATE POLICY "Customers can view own payments" ON booking_payments
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM customer_bookings WHERE customer_id IN (
        SELECT id FROM customer_profiles WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Invoices are customer-specific
CREATE POLICY "Customers can view own invoices" ON customer_invoices
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customer_profiles WHERE auth_user_id = auth.uid())
  );

-- Function to generate tracking numbers
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := 'RC';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate tracking number
CREATE OR REPLACE FUNCTION set_tracking_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tracking_number IS NULL THEN
    NEW.tracking_number := generate_tracking_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_insert_booking
  BEFORE INSERT ON customer_bookings
  FOR EACH ROW
  EXECUTE FUNCTION set_tracking_number();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customer_bookings_updated_at
  BEFORE UPDATE ON customer_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
