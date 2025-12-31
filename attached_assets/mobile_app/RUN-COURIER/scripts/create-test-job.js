const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestJob() {
  try {
    console.log('Connecting to Supabase...');
    
    // First, get list of drivers to assign the job to
    console.log('\nFetching drivers...');
    const { data: drivers, error: driverError } = await supabase
      .from('drivers')
      .select('*')
      .limit(10);
    
    if (driverError) {
      console.error('Error fetching drivers:', driverError);
      return;
    }
    
    if (!drivers || drivers.length === 0) {
      console.log('No drivers found. Please create a driver account first by signing up in the mobile app.');
      return;
    }
    
    console.log('\nFound drivers:');
    console.log('First driver columns:', Object.keys(drivers[0]));
    drivers.forEach((d, i) => {
      const name = d.full_name || d.name || d.first_name || 'Unknown';
      const email = d.email || 'no-email';
      console.log(`  ${i + 1}. ${name} (${email}) - id: ${d.id}`);
    });
    
    // Find target driver - check command line args for driver_id or email
    const targetArg = process.argv[2] || null;
    let driver;
    
    if (targetArg) {
      driver = drivers.find(d => 
        (d.driver_id && d.driver_id.toUpperCase() === targetArg.toUpperCase()) ||
        (d.email && d.email.toLowerCase().includes(targetArg.toLowerCase()))
      );
      if (!driver) {
        console.log(`No driver found matching: ${targetArg}`);
        console.log('Available drivers:', drivers.map(d => `${d.driver_id || 'no-id'} (${d.email})`).join(', '));
        return;
      }
    } else {
      driver = drivers[0];
    }
    const driverId = driver.id;
    
    console.log(`\nCreating test job for driver: ${driver.full_name || driver.name || driver.email}`);
    
    // Create a test job assigned to this driver
    // Using columns that match the actual DB schema
    const now = new Date().toISOString();
    
    // Random locations in Manchester for variety
    const locations = [
      { pickup: '123 High Street, Manchester M1 1AA', dropoff: '456 Oxford Road, Manchester M13 9PL', pLat: 53.4808, pLng: -2.2426, dLat: 53.4631, dLng: -2.2310 },
      { pickup: '78 Deansgate, Manchester M3 2FW', dropoff: '15 Piccadilly, Manchester M1 1LY', pLat: 53.4784, pLng: -2.2510, dLat: 53.4796, dLng: -2.2368 },
      { pickup: '200 Market Street, Manchester M4 3AJ', dropoff: '50 Portland Street, Manchester M1 4QX', pLat: 53.4833, pLng: -2.2407, dLat: 53.4759, dLng: -2.2384 },
    ];
    const loc = locations[Math.floor(Math.random() * locations.length)];
    
    const testJob = {
      pickup_address: loc.pickup,
      dropoff_address: loc.dropoff,
      pickup_lat: loc.pLat,
      pickup_lng: loc.pLng,
      dropoff_lat: loc.dLat,
      dropoff_lng: loc.dLng,
      price_customer: 15.50 + Math.floor(Math.random() * 10),
      notes: 'TEST JOB - Please handle with care',
      parcel_weight: 5,
      priority: 'normal',
      vehicle_type: driver.vehicle_type || 'car',
      scheduled_pickup_time: now,
      status: 'assigned',
      driver_id: driverId,
    };
    
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert(testJob)
      .select()
      .single();
    
    if (jobError) {
      console.error('Error creating job:', jobError);
      return;
    }
    
    console.log('\n✓ Test job created successfully!');
    console.log('  Job ID:', job.id);
    console.log('  Status:', job.status);
    console.log('  Driver ID:', job.driver_id);
    console.log('  Pickup:', job.pickup_address);
    console.log('  Delivery:', job.delivery_address);
    console.log('  Price: £', job.price);
    console.log('\nThe mobile app should now show this job in the "Jobs" tab and play the sound alarm!');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createTestJob();
