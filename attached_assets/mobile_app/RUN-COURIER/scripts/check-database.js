const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('Checking database...\n');
  
  // Try different table names
  const tables = ['drivers', 'driver', 'users', 'profiles', 'driver_profiles'];
  
  for (const table of tables) {
    console.log(`Checking table: ${table}`);
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: false })
      .limit(5);
    
    if (error) {
      console.log(`  Error: ${error.message}`);
    } else {
      console.log(`  Found ${data?.length || 0} rows`);
      if (data && data.length > 0) {
        console.log(`  Columns: ${Object.keys(data[0]).join(', ')}`);
        console.log(`  Sample data:`, JSON.stringify(data[0], null, 2));
      }
    }
    console.log('');
  }
  
  // Also check jobs table
  console.log('Checking jobs table:');
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('*')
    .limit(5);
  
  if (jobsError) {
    console.log(`  Error: ${jobsError.message}`);
  } else {
    console.log(`  Found ${jobs?.length || 0} jobs`);
    if (jobs && jobs.length > 0) {
      console.log(`  Columns: ${Object.keys(jobs[0]).join(', ')}`);
    }
  }
}

checkDatabase();
