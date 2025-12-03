import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAdminUser() {
  const email = 'runcourier1@gmail.com';
  const password = 'Romania@1974';
  const fullName = 'Run Courier Admin';

  console.log('Creating admin user...');

  try {
    // Check if user already exists in Supabase Auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    if (existingUser) {
      console.log('User already exists in Supabase Auth, updating...');
      
      // Update the user's password and metadata
      const { error } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password: password,
        email_confirm: true,
        user_metadata: {
          fullName: fullName,
          full_name: fullName,
          role: 'admin',
          userType: 'individual',
          isActive: true
        }
      });

      if (error) {
        console.error('Error updating user:', error.message);
        process.exit(1);
      }

      console.log('✅ Admin user updated successfully!');
    } else {
      // Create new user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          fullName: fullName,
          full_name: fullName,
          role: 'admin',
          userType: 'individual',
          isActive: true
        }
      });

      if (authError) {
        console.error('Error creating user in Supabase Auth:', authError.message);
        process.exit(1);
      }

      console.log('✅ Admin user created successfully!');
      console.log('User ID:', authData.user?.id);
    }

    console.log('');
    console.log('Login credentials:');
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('  Role: admin');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

createAdminUser();
