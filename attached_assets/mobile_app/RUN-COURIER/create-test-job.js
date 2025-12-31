const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestJob() {
  const driverEmail = 'driver@test.com';
  
  // First, let's see the schema by fetching an existing job
  const { data: existingJobs, error: schemaError } = await supabase
    .from('jobs')
    .select('*')
    .limit(1);
  
  if (existingJobs && existingJobs.length > 0) {
    console.log('Existing job columns:', Object.keys(existingJobs[0]));
  } else {
    console.log('No existing jobs found, checking schema...');
  }
  
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, full_name, email')
    .eq('email', driverEmail)
    .single();

  if (driverError || !driver) {
    console.error('Driver not found:', driverEmail, driverError);
    process.exit(1);
  }

  console.log('Found driver:', driver.full_name, '(', driver.id, ')');

  const trackingNumber = 'RC' + Date.now().toString(36).toUpperCase() + 'TEST';

  // Use all required columns
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      driver_id: driver.id,
      pickup_address: '123 Test Street, London',
      dropoff_address: '456 Delivery Road, Manchester',
      pickup_lat: 51.5074,
      pickup_lng: -0.1278,
      dropoff_lat: 53.4808,
      dropoff_lng: -2.2426,
      status: 'pending',
      price_customer: 25.00,
      price_driver: 20.00,
      parcel_weight: 2.5,
      distance_miles: 200,
      tracking_number: trackingNumber,
      notes: 'Test job for website sync verification',
      priority: 'normal',
      vehicle_type: 'car',
      booking_type: 'on-demand',
      scheduled_pickup_time: new Date().toISOString(),
      sender_name: 'Test Sender',
      sender_email: 'sender@test.com',
      sender_phone: '07700123456',
      recipient_name: 'Test Recipient',
      recipient_email: 'recipient@test.com',
      recipient_phone: '07700654321',
    })
    .select()
    .single();

  if (jobError) {
    console.error('Failed to create job:', jobError);
    process.exit(1);
  }

  console.log('Test job created successfully!');
  console.log('Job ID:', job.id);
  console.log('Tracking:', job.tracking_number);
  console.log('Assigned to:', driver.full_name, '(', driver.email, ')');
  console.log('Status:', job.status);
}

createTestJob();
