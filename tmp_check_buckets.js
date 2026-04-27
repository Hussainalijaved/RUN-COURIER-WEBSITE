
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase config");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBuckets() {
  console.log("--- BUCKETS ---");
  const { data: buckets, error: bError } = await supabase.storage.listBuckets();
  if (bError) {
    console.error("Error listing buckets:", bError.message);
  } else {
    buckets.forEach(b => console.log(`Bucket: ${b.name}`));
  }

  const bucketsToCheck = ['pod-images', 'pod', 'driver-documents', 'DRIVER-DOCUMENTS'];
  for (const bucket of bucketsToCheck) {
    console.log(`\n--- LISTING ${bucket} ---`);
    const { data: files, error: fError } = await supabase.storage.from(bucket).list('', { limit: 10 });
    if (fError) {
      console.error(`Error listing ${bucket}:`, fError.message);
    } else if (files) {
      console.log(`Files in ${bucket}: ${files.length} items`);
      files.forEach(f => console.log(` - ${f.name} (${f.id ? 'File' : 'Dir'})`));
    }
  }
}

checkBuckets();
