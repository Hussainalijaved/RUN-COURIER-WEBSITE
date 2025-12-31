const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupCustomerTables() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  console.log('Connecting to database...');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!\n');

    // Create tables one at a time
    console.log('Creating customer_bookings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL,
        tracking_number TEXT UNIQUE,
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
        payment_option TEXT NOT NULL DEFAULT 'pay_now',
        price_estimate DECIMAL(10, 2),
        price_final DECIMAL(10, 2),
        status TEXT NOT NULL DEFAULT 'draft',
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
    `);
    console.log('✓ customer_bookings created');

    console.log('Creating booking_stops table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_stops (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES customer_bookings(id) ON DELETE CASCADE NOT NULL,
        stop_order INTEGER NOT NULL,
        stop_type TEXT NOT NULL,
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
    `);
    console.log('✓ booking_stops created');

    console.log('Creating booking_payments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES customer_bookings(id) ON DELETE CASCADE NOT NULL,
        stripe_payment_intent_id TEXT,
        stripe_charge_id TEXT,
        amount DECIMAL(10, 2) NOT NULL,
        currency TEXT DEFAULT 'gbp',
        status TEXT NOT NULL DEFAULT 'pending',
        payment_method TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ booking_payments created');

    console.log('Creating customer_invoices table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        week_start_date DATE NOT NULL,
        week_end_date DATE NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        stripe_invoice_id TEXT,
        due_date DATE NOT NULL,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ customer_invoices created');

    console.log('\nEnabling Row Level Security...');
    await client.query(`ALTER TABLE customer_bookings ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE booking_stops ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY;`);
    console.log('✓ RLS enabled');

    console.log('\nCreating RLS policies...');
    
    // Drop and recreate policies for customer_bookings
    await client.query(`DROP POLICY IF EXISTS "Users can view own bookings" ON customer_bookings;`);
    await client.query(`
      CREATE POLICY "Users can view own bookings" ON customer_bookings 
      FOR SELECT USING (customer_id = auth.uid());
    `);
    
    await client.query(`DROP POLICY IF EXISTS "Users can insert own bookings" ON customer_bookings;`);
    await client.query(`
      CREATE POLICY "Users can insert own bookings" ON customer_bookings 
      FOR INSERT WITH CHECK (customer_id = auth.uid());
    `);
    
    await client.query(`DROP POLICY IF EXISTS "Users can update own bookings" ON customer_bookings;`);
    await client.query(`
      CREATE POLICY "Users can update own bookings" ON customer_bookings 
      FOR UPDATE USING (customer_id = auth.uid());
    `);

    // Policies for booking_stops
    await client.query(`DROP POLICY IF EXISTS "Users can manage own booking stops" ON booking_stops;`);
    await client.query(`
      CREATE POLICY "Users can manage own booking stops" ON booking_stops 
      FOR ALL USING (
        booking_id IN (SELECT id FROM customer_bookings WHERE customer_id = auth.uid())
      );
    `);

    // Policies for booking_payments
    await client.query(`DROP POLICY IF EXISTS "Users can view own payments" ON booking_payments;`);
    await client.query(`
      CREATE POLICY "Users can view own payments" ON booking_payments 
      FOR SELECT USING (
        booking_id IN (SELECT id FROM customer_bookings WHERE customer_id = auth.uid())
      );
    `);

    // Policies for customer_invoices
    await client.query(`DROP POLICY IF EXISTS "Users can view own invoices" ON customer_invoices;`);
    await client.query(`
      CREATE POLICY "Users can view own invoices" ON customer_invoices 
      FOR SELECT USING (customer_id = auth.uid());
    `);

    console.log('✓ RLS policies created');

    console.log('\nCreating indexes...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_bookings_customer ON customer_bookings(customer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_bookings_status ON customer_bookings(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_bookings_tracking ON customer_bookings(tracking_number);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_booking_stops_booking ON booking_stops(booking_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON booking_payments(booking_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer ON customer_invoices(customer_id);`);
    console.log('✓ Indexes created');

    console.log('\n========================================');
    console.log('All customer tables created successfully!');
    console.log('========================================');

  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('password authentication failed') || error.message.includes('connection')) {
      console.log('\n--- Alternative: Manual SQL ---');
      console.log('Please run this SQL in your Supabase SQL Editor:\n');
      
      const sqlPath = path.join(__dirname, '..', 'database', 'customer-tables.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      console.log(sqlContent);
    }
  } finally {
    await client.end();
  }
}

setupCustomerTables().catch(console.error);
