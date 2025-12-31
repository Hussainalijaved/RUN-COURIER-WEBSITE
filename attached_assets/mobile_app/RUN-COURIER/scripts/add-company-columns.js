const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function addCompanyColumns() {
  console.log('Adding company columns to profiles table...');

  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE profiles 
        ADD COLUMN IF NOT EXISTS company_address TEXT,
        ADD COLUMN IF NOT EXISTS contact_person_name TEXT,
        ADD COLUMN IF NOT EXISTS contact_person_phone TEXT;
      `
    });

    if (error) {
      console.error('RPC error (expected if exec_sql not available):', error.message);
      console.log('\n========================================');
      console.log('Please run this SQL in your Supabase SQL Editor:');
      console.log('========================================\n');
      console.log(`ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS company_address TEXT,
ADD COLUMN IF NOT EXISTS contact_person_name TEXT,
ADD COLUMN IF NOT EXISTS contact_person_phone TEXT;`);
      console.log('\n========================================');
      console.log('Steps:');
      console.log('1. Go to your Supabase dashboard');
      console.log('2. Click on "SQL Editor" in the left sidebar');
      console.log('3. Paste the SQL above and click "Run"');
      console.log('========================================\n');
    } else {
      console.log('Columns added successfully!');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

addCompanyColumns();
