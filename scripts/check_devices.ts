import { createClient } from '@supabase/supabase-js';

// Manual env var check for the script
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDevices() {
  console.log(`Checking devices at ${supabaseUrl}...`);
  const { data, count, error } = await supabase
    .from('driver_devices')
    .select('*', { count: 'exact' });

  if (error) {
    console.error('Error fetching devices:', error);
  } else {
    console.log(`Total registered devices: ${count}`);
    if (data && data.length > 0) {
      console.log('Sample devices:');
      data.slice(0, 5).forEach(d => {
        console.log(`- Driver: ${d.driver_id}, Token: ${d.push_token.substring(0, 20)}..., Platform: ${d.platform}`);
      });
    }
    
    const expoTokens = data?.filter(d => d.push_token.startsWith('ExponentPushToken') || d.push_token.startsWith('ExpoPushToken'));
    console.log(`Expo tokens found: ${expoTokens?.length}`);
  }
}

checkDevices();
