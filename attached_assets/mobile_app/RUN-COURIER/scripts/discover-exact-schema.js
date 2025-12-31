const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function discoverSchema() {
  // The error shows: Failing row contains (45, 2025-12-06 03:12:39.070613+00, null, null, null, null, null, assigned, null, null, null, null, null, null, null, null, null, null, null, null, 2025-12-06 03:12:39.070613, null, RC973425560GB, null, 0, null, f, null, null, null, null, null, null, null, null, null, null, null, null, null, null, on-demand, null, null)
  // That's 44 columns. Let's try with pickup_address only
  
  const testData = {
    pickup_address: '10 Downing Street, London SW1A 1AA',
    status: 'assigned',
  };
  
  console.log('Attempting insert with pickup_address and status...');
  const { data, error } = await supabase
    .from('jobs')
    .insert(testData)
    .select();
  
  if (error) {
    console.log('Error:', error.message);
    console.log('Full error:', error);
    return;
  }
  
  console.log('\nCreated job successfully!');
  console.log('All columns:', Object.keys(data[0]).join(', '));
  console.log('\nJob data:', JSON.stringify(data[0], null, 2));
  
  // Delete the test job
  const jobId = data[0].id;
  console.log('\nDeleting test job', jobId);
  await supabase.from('jobs').delete().eq('id', jobId);
}

discoverSchema();
