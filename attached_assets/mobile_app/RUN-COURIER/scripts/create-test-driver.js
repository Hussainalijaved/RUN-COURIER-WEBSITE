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

async function createTestDriver() {
  const email = 'driver@test.com';
  const password = '12345678';

  console.log('Creating test driver account...');

  try {
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      return;
    }

    const existingUser = existingUsers.users.find(u => u.email === email);
    
    let userId;

    if (existingUser) {
      console.log('User already exists in auth, updating password...');
      userId = existingUser.id;
      
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: password,
      });
      
      if (updateError) {
        console.error('Error updating user:', updateError);
        return;
      }
      console.log('Password updated successfully');
    } else {
      console.log('Creating new user in auth...');
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          vehicle_type: 'car',
          role: 'driver',
        },
      });

      if (authError) {
        console.error('Error creating auth user:', authError);
        return;
      }

      userId = authData.user.id;
      console.log('Auth user created with ID:', userId);
    }

    const { data: existingDriver, error: checkError } = await supabase
      .from('drivers')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingDriver) {
      console.log('Driver profile already exists');
    } else {
      console.log('Creating driver profile...');
      const { error: driverError } = await supabase
        .from('drivers')
        .insert({
          id: userId,
          email: email,
          full_name: 'Test Driver',
          phone: '07123456789',
          postcode: 'SW1A 1AA',
          vehicle_type: 'car',
          created_at: new Date().toISOString(),
        });

      if (driverError) {
        console.error('Error creating driver profile:', driverError);
        console.log('Trying with minimal fields...');
        const { error: minimalError } = await supabase
          .from('drivers')
          .insert({
            id: userId,
            email: email,
          });
        if (minimalError) {
          console.error('Minimal insert also failed:', minimalError);
          return;
        }
        console.log('Driver profile created with minimal fields');
      } else {
        console.log('Driver profile created successfully');
      }
    }

    console.log('\n========================================');
    console.log('Test driver account ready!');
    console.log('Email: driver@test.com');
    console.log('Password: 12345678');
    console.log('========================================\n');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createTestDriver();
