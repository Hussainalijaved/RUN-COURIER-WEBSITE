import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const paths = [
  { bucket: 'driver-documents', path: 'ddaba6cd-ea8a-4d98-a4c8-01937b1f776c/proof_of_identity_1771006084270.jpeg' },
  { bucket: 'driver-documents', path: '8fe1cc96-e425-40a0-bbb9-f533c720974c/proof_of_address_1770733962579.jpg' },
  { bucket: 'driver-documents', path: '5a35d0e5-6b96-47a0-a7d2-bea30a71f774/proof_of_identity_1770731781742.jpg' },
  { bucket: 'driver-documents', path: 'bba877cb-ff9b-4ae2-b560-e9d1f85deba2/proof_of_address_1769938684972.png' },
  { bucket: 'DRIVER-DOCUMENTS', path: 'b2150678-ecec-48e9-9882-adbcc1ec6cf5/vehicle_photos_front_1769851767749.jpg' },
  { bucket: 'DRIVER-DOCUMENTS', path: 'b2150678-ecec-48e9-9882-adbcc1ec6cf5/driving_licence_front_1769851709180.jpg' },
];

async function verify() {
  for (const { bucket, path } of paths) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    console.log(`${bucket}/${path}: ${data?.signedUrl ? 'OK' : 'FAIL'} ${error?.message || ''}`);
  }
}
verify();
