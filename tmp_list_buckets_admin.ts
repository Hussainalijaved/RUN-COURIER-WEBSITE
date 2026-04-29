import { supabaseAdmin } from './server/supabaseAdmin';

async function main() {
  if (!supabaseAdmin) {
    console.error("Supabase admin not initialized");
    return;
  }
  const { data, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    console.error(error);
  } else {
    console.log("Buckets:", data.map(b => b.name));
  }
}

main();
