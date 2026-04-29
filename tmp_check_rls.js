import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.rpc('get_policies', { table_name: 'jobs' });

  if (error) {
    // If rpc not available, try raw query if we have it, otherwise just report error
    console.error("Error fetching policies via RPC:", error.message);
    console.log("Attempting to query pg_policies...");
    const { data: data2, error: error2 } = await supabase.from('pg_policies').select('*').eq('tablename', 'jobs');
    if (error2) {
        console.error("Error querying pg_policies:", error2.message);
    } else {
        console.log("Policies for 'jobs' table:");
        console.log(JSON.stringify(data2, null, 2));
    }
  } else {
    console.log("Policies for 'jobs' table:");
    console.log(JSON.stringify(data, null, 2));
  }
}

main();
