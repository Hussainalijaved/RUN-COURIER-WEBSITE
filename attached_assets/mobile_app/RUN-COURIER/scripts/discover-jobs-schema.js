const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function discoverSchema() {
  // Try inserting with minimal data to see what columns are required
  const minimalJob = {
    status: 'assigned',
  };
  
  console.log('Attempting insert with just status...');
  const { data, error } = await supabase
    .from('jobs')
    .insert(minimalJob)
    .select();
  
  if (error) {
    console.log('Error:', error);
    
    // If that fails, check the information schema directly
    console.log('\nChecking information schema...');
    const { data: cols, error: colsError } = await supabase.rpc('get_table_columns', { table_name: 'jobs' });
    if (cols) {
      console.log('Columns:', cols);
    } else {
      console.log('RPC error:', colsError);
    }
    return;
  }
  
  console.log('Created job:', data);
  if (data && data.length > 0) {
    console.log('All columns:', Object.keys(data[0]));
  }
}

discoverSchema();
