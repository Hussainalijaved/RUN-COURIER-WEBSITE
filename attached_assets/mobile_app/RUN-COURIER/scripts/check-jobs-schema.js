const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkJobsSchema() {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error:', error.message);
    
    // Try to insert minimal job to see what columns exist
    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        status: 'assigned'
      })
      .select();
    
    console.log('Insert error:', insertError);
    return;
  }
  
  if (jobs && jobs.length > 0) {
    console.log('Jobs table columns:', Object.keys(jobs[0]));
    console.log('Sample job:', JSON.stringify(jobs[0], null, 2));
  } else {
    console.log('No jobs in database. Let me check what columns the table accepts.');
    
    // Get the table structure by looking at RLS policies or similar
    const { data, error: testError } = await supabase.rpc('get_jobs_columns');
    console.log('RPC result:', data, testError);
  }
}

checkJobsSchema();
