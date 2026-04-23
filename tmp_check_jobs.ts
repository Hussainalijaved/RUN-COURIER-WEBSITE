import { supabaseAdmin } from './server/supabaseAdmin';

async function run() {
  if (!supabaseAdmin) {
    console.error('No supabaseAdmin');
    process.exit(1);
  }
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id, tracking_number, status, pod_photo_url, pod_signature_url, pod_photos')
    .eq('status', 'delivered')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching jobs:', error);
    process.exit(1);
  }
  
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

run();
