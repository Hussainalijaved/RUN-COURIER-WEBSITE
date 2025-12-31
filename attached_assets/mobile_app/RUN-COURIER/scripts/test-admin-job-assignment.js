const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.log('Set these environment variables before running this script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAdminJobAssignment() {
  console.log('\n=== Admin to Driver Job Assignment Test ===\n');

  const { data: drivers, error: driverError } = await supabase
    .from('drivers')
    .select('id, full_name, email, vehicle_type')
    .order('created_at', { ascending: false })
    .limit(10);

  if (driverError) {
    console.error('Failed to fetch drivers:', driverError);
    return;
  }

  if (!drivers || drivers.length === 0) {
    console.log('No drivers found. Please register a driver in the mobile app first.');
    return;
  }

  console.log('Available Drivers:');
  drivers.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.full_name} (${d.email}) - ${d.vehicle_type || 'N/A'}`);
    console.log(`     Driver ID: ${d.id}`);
  });

  const targetDriver = drivers[0];
  console.log(`\nAssigning test job to: ${targetDriver.full_name} (${targetDriver.email})`);

  const trackingNumber = 'RC' + Date.now().toString(36).toUpperCase() + 'ADMIN';

  const jobData = {
    driver_id: targetDriver.id,
    pickup_address: '10 Downing Street, London SW1A 2AA',
    dropoff_address: '221B Baker Street, London NW1 6XE',
    pickup_lat: 51.5034,
    pickup_lng: -0.1276,
    dropoff_lat: 51.5238,
    dropoff_lng: -0.1585,
    status: 'assigned',
    price_customer: 35.00,
    price_driver: 28.00,
    parcel_weight: 1.5,
    distance_miles: 2.5,
    tracking_number: trackingNumber,
    notes: 'Admin test assignment - please accept or reject in the mobile app',
    priority: 'normal',
    vehicle_type: targetDriver.vehicle_type || 'car',
    booking_type: 'on-demand',
    scheduled_pickup_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    sender_name: 'Admin Test Sender',
    sender_email: 'admin@runcourier.com',
    sender_phone: '07700100200',
    recipient_name: 'Test Recipient',
    recipient_email: 'recipient@test.com',
    recipient_phone: '07700300400',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert(jobData)
    .select()
    .single();

  if (jobError) {
    console.error('Failed to create job:', jobError);
    console.log('\nIf you see column errors, your jobs table schema may differ.');
    console.log('Required columns: driver_id, pickup_address, dropoff_address, status, price_customer');
    return;
  }

  console.log('\nJob assigned successfully!');
  console.log('----------------------------------------');
  console.log(`Job ID: ${job.id}`);
  console.log(`Tracking: ${job.tracking_number}`);
  console.log(`Driver: ${targetDriver.full_name}`);
  console.log(`From: ${job.pickup_address}`);
  console.log(`To: ${job.dropoff_address}`);
  console.log(`Price: £${job.price_customer}`);
  console.log(`Status: ${job.status}`);
  console.log('----------------------------------------');

  // Send push notification to driver
  const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://expo-messenger--almashriqi2010.replit.app';
  console.log('\nSending push notification to driver...');
  
  try {
    const notifyResponse = await fetch(`${API_URL}/api/notifications/job-offer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        jobId: job.id,
        driverId: targetDriver.id,
      }),
    });
    
    const notifyResult = await notifyResponse.json();
    if (notifyResult.success) {
      console.log('Push notification sent successfully!');
    } else {
      console.log('Push notification failed:', notifyResult.error || 'Unknown error');
      if (notifyResult.error?.includes('no push token')) {
        console.log('(Driver needs to enable notifications in the app)');
      }
    }
  } catch (notifyError) {
    console.log('Could not send push notification:', notifyError.message);
  }

  console.log('\nThe driver should now see this job in the "Job Offers" screen');
  console.log('in the mobile app. They can accept or reject it.');
  console.log('\nThe mobile app uses Supabase real-time subscriptions to');
  console.log('instantly receive new job assignments.\n');

  console.log('Waiting 10 seconds and checking job status...\n');
  
  await new Promise(resolve => setTimeout(resolve, 10000));

  const { data: updatedJob, error: checkError } = await supabase
    .from('jobs')
    .select('status, updated_at, rejection_reason')
    .eq('id', job.id)
    .single();

  if (!checkError && updatedJob) {
    console.log(`Current job status: ${updatedJob.status}`);
    if (updatedJob.status === 'accepted') {
      console.log('Driver has accepted the job!');
    } else if (updatedJob.status === 'rejected') {
      console.log('Driver rejected the job. Reason:', updatedJob.rejection_reason || 'Not specified');
    } else {
      console.log('Job is still pending driver action.');
    }
  }
}

async function listRecentJobs() {
  console.log('\n=== Recent Jobs ===\n');

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, status, driver_id, tracking_number, pickup_address, dropoff_address, price_customer, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Failed to fetch jobs:', error);
    return;
  }

  if (!jobs || jobs.length === 0) {
    console.log('No jobs found.');
    return;
  }

  jobs.forEach(job => {
    console.log(`${job.tracking_number || job.id} | ${job.status} | £${job.price_customer || 0}`);
    console.log(`  From: ${job.pickup_address?.substring(0, 40)}...`);
    console.log(`  To: ${job.dropoff_address?.substring(0, 40)}...`);
    console.log(`  Created: ${new Date(job.created_at).toLocaleString()}`);
    console.log('');
  });
}

const command = process.argv[2] || 'assign';

if (command === 'list') {
  listRecentJobs();
} else {
  testAdminJobAssignment();
}
