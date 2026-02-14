import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const BUCKETS = ['driver-documents', 'DRIVER-DOCUMENTS'];

async function listAllStorageFiles(bucket: string, prefix: string = ''): Promise<string[]> {
  const results: string[] = [];
  try {
    const { data: entries } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (!entries) return results;
    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        results.push(fullPath);
      } else {
        const subFiles = await listAllStorageFiles(bucket, fullPath);
        results.push(...subFiles);
      }
    }
  } catch (e) {}
  return results;
}

async function run() {
  console.log('=== Building complete file index ===\n');
  
  const filesByBasename: Map<string, { bucket: string; path: string }[]> = new Map();
  
  for (const bucket of BUCKETS) {
    const files = await listAllStorageFiles(bucket);
    console.log(`${bucket}: ${files.length} files`);
    for (const f of files) {
      const basename = f.split('/').pop() || '';
      if (!filesByBasename.has(basename)) {
        filesByBasename.set(basename, []);
      }
      filesByBasename.get(basename)!.push({ bucket, path: f });
    }
  }
  
  console.log(`\nTotal unique basenames: ${filesByBasename.size}\n`);
  
  const { data: docs, error } = await supabase
    .from('driver_documents')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error || !docs) {
    console.error('Error:', error?.message);
    return;
  }
  
  const needsFix = docs.filter(d => {
    const url = d.file_url || '';
    return url.startsWith('/api/') || url.startsWith('/uploads/') || url.startsWith('application-pending/');
  });
  
  console.log(`${needsFix.length} records still need fixing\n`);
  
  let updated = 0, notFound = 0;
  
  for (const doc of needsFix) {
    const fileUrl = doc.file_url || '';
    const filename = fileUrl.split('/').pop() || '';
    
    const candidates = filesByBasename.get(filename) || [];
    
    let match = candidates[0];
    
    if (candidates.length > 1 && doc.driver_id) {
      const driverMatch = candidates.find(c => c.path.includes(doc.driver_id));
      if (driverMatch) match = driverMatch;
    }
    
    if (!match) {
      const storagePath = doc.storage_path || '';
      const spBasename = storagePath.split('/').pop() || '';
      if (spBasename && spBasename !== filename) {
        const spCandidates = filesByBasename.get(spBasename) || [];
        match = spCandidates[0];
        if (spCandidates.length > 1 && doc.driver_id) {
          const driverMatch = spCandidates.find(c => c.path.includes(doc.driver_id));
          if (driverMatch) match = driverMatch;
        }
      }
    }
    
    if (match) {
      const { error: updateErr } = await supabase
        .from('driver_documents')
        .update({
          file_url: match.path,
          storage_path: match.path,
          bucket: match.bucket,
        })
        .eq('id', doc.id);
      
      if (!updateErr) {
        console.log(`  OK: ${doc.id} → ${match.bucket}/${match.path}`);
        updated++;
      } else {
        console.error(`  FAIL: ${doc.id}: ${updateErr.message}`);
      }
    } else {
      console.log(`  MISSING: ${doc.id} (${doc.driver_id}/${doc.doc_type}) filename=${filename}`);
      notFound++;
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Fixed: ${updated}`);
  console.log(`Genuinely missing: ${notFound}`);
}

run().catch(console.error);
