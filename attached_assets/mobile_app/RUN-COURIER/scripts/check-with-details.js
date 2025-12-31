const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl ? supabaseUrl.substring(0, 40) + '...' : 'NOT SET');
console.log('Anon Key set:', !!supabaseKey);
console.log('Service Key set:', !!serviceKey);

// Try with service role key if available
const keyToUse = serviceKey || supabaseKey;
const keyType = serviceKey ? 'service_role' : 'anon';

if (!supabaseUrl || !keyToUse) {
  console.error('\nMissing Supabase credentials');
  process.exit(1);
}

console.log(`\nUsing ${keyType} key to query...\n`);

const supabase = createClient(supabaseUrl, keyToUse);

async function check() {
  // Check drivers with count
  const { data: drivers, error, count } = await supabase
    .from('drivers')
    .select('*', { count: 'exact' });
  
  console.log('Drivers query result:');
  console.log('  Error:', error?.message || 'none');
  console.log('  Count:', count);
  console.log('  Data length:', drivers?.length || 0);
  
  if (drivers && drivers.length > 0) {
    console.log('\n  First driver:', JSON.stringify(drivers[0], null, 2));
  }
  
  // Also try auth.users to see if there are any authenticated users
  console.log('\n\nChecking auth.users (requires service role)...');
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.log('  Auth error:', authError.message);
  } else {
    console.log('  Found', users?.length || 0, 'auth users');
    if (users && users.length > 0) {
      users.forEach((u, i) => {
        console.log(`  ${i+1}. ${u.email} (id: ${u.id})`);
      });
    }
  }
}

check();
