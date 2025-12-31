const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Get URL from env (might reference another env var)
let supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (supabaseUrl && supabaseUrl.startsWith('${')) {
  const refKey = supabaseUrl.replace('${', '').replace('}', '');
  supabaseUrl = process.env[refKey];
}

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Service Key exists:', !!supabaseServiceKey);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Please ensure these are set in your environment or secrets');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function fixRLSPolicies() {
  console.log('Connecting to Supabase...');
  console.log('URL:', supabaseUrl);
  
  try {
    // First, let's check the current table structure
    console.log('\n1. Checking drivers table structure...');
    const { data: columns, error: columnsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'drivers' 
        ORDER BY ordinal_position;
      `
    });
    
    if (columnsError) {
      console.log('Could not query columns via RPC, trying direct query...');
      // Try a simple select to see what columns exist
      const { data: sample, error: sampleError } = await supabase
        .from('drivers')
        .select('*')
        .limit(1);
      
      if (sampleError) {
        console.error('Error querying drivers:', sampleError);
      } else if (sample && sample.length > 0) {
        console.log('Columns in drivers table:', Object.keys(sample[0]));
      } else {
        console.log('No drivers found in table');
      }
    } else {
      console.log('Columns:', columns);
    }

    // Check current RLS policies
    console.log('\n2. Checking current RLS policies...');
    const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies 
        WHERE tablename = 'drivers';
      `
    });
    
    if (policiesError) {
      console.log('Could not query policies via RPC:', policiesError.message);
    } else {
      console.log('Current policies:', JSON.stringify(policies, null, 2));
    }

    // Test update with service role (bypasses RLS)
    console.log('\n3. Testing update with service role key (bypasses RLS)...');
    const testDriverId = '95eb5692-d444-4528-bb37-f91a7cf594c3';
    
    const { data: updateTest, error: updateError } = await supabase
      .from('drivers')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', testDriverId)
      .select();
    
    if (updateError) {
      console.error('Update error:', updateError);
    } else if (!updateTest || updateTest.length === 0) {
      console.log('No rows updated - driver ID may not exist');
      
      // Let's check if driver exists
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, email, full_name')
        .eq('id', testDriverId)
        .single();
      
      if (driverError) {
        console.log('Driver lookup error:', driverError);
      } else if (driver) {
        console.log('Driver exists:', driver);
        console.log('But update still returned empty - checking if id column matches auth.uid format...');
      } else {
        console.log('Driver with ID', testDriverId, 'does not exist');
      }
    } else {
      console.log('Update successful with service role!');
      console.log('Updated driver:', updateTest[0]);
    }

    // List all drivers to find the correct ID format
    console.log('\n4. Listing all drivers...');
    const { data: allDrivers, error: allError } = await supabase
      .from('drivers')
      .select('id, email, full_name')
      .limit(10);
    
    if (allError) {
      console.error('Error listing drivers:', allError);
    } else {
      console.log('Drivers in database:');
      allDrivers?.forEach(d => console.log(`  - ID: ${d.id}, Email: ${d.email}, Name: ${d.full_name}`));
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

fixRLSPolicies();
