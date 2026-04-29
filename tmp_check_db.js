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
  const { data, error } = await supabase
    .from('jobs')
    .select('id, pod_photo_url, updated_at')
    .not('pod_photo_url', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
  } else {
    console.log("Recent jobs with PODs:");
    data.forEach(j => {
      console.log(`Job ${j.id}: ${j.pod_photo_url}`);
    });
  }
}

main();
