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

async function fixPaths() {
  console.log('=== Phase 1: List all storage files across both buckets ===\n');
  
  const allFiles: Map<string, { bucket: string; path: string }> = new Map();
  
  for (const bucket of BUCKETS) {
    const files = await listAllStorageFiles(bucket);
    console.log(`${bucket}: ${files.length} files`);
    for (const f of files) {
      const basename = f.split('/').pop() || '';
      allFiles.set(basename, { bucket, path: f });
      allFiles.set(f, { bucket, path: f });
    }
  }
  
  console.log(`\nTotal unique files indexed: ${allFiles.size}\n`);
  
  console.log('=== Phase 2: Fetch and fix driver_documents records ===\n');
  
  const { data: docs, error } = await supabase
    .from('driver_documents')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error || !docs) {
    console.error('Error fetching documents:', error?.message);
    return;
  }
  
  console.log(`Total document records: ${docs.length}\n`);
  
  let updated = 0, alreadyGood = 0, notFound = 0;
  const notFoundList: string[] = [];
  
  for (const doc of docs) {
    const fileUrl = doc.file_url || '';
    
    if (fileUrl.startsWith('drivers/') || fileUrl.startsWith('applications/') || fileUrl.startsWith('pod/')) {
      const match = allFiles.get(fileUrl);
      if (match) {
        alreadyGood++;
        continue;
      }
    }
    
    const filename = fileUrl.split('/').pop() || '';
    
    let matchedFile = allFiles.get(filename);
    
    if (!matchedFile && doc.driver_id) {
      for (const bucket of BUCKETS) {
        const driverPrefixes = [
          `drivers/${doc.driver_id}/`,
          `${doc.driver_id}/`,
          `applications/${doc.driver_id}/`,
        ];
        for (const [key, val] of allFiles.entries()) {
          if (val.bucket === bucket) {
            for (const prefix of driverPrefixes) {
              if (key.startsWith(prefix)) {
                const basename = key.split('/').pop() || '';
                const docType = doc.doc_type || '';
                if (basename.toLowerCase().includes(docType.replace(/_/g, '').toLowerCase()) ||
                    basename.toLowerCase().replace(/licence/g, 'license').includes(docType.replace(/_/g, '').toLowerCase().replace(/licence/g, 'license'))) {
                  matchedFile = val;
                  break;
                }
              }
            }
            if (matchedFile) break;
          }
        }
        if (matchedFile) break;
      }
    }

    if (!matchedFile) {
      const appPendingPath = `applications/pending/${filename}`;
      matchedFile = allFiles.get(appPendingPath);
    }

    if (matchedFile) {
      const { error: updateErr } = await supabase
        .from('driver_documents')
        .update({
          file_url: matchedFile.path,
          storage_path: matchedFile.path,
          bucket: matchedFile.bucket,
        })
        .eq('id', doc.id);
      
      if (updateErr) {
        console.error(`  FAIL ${doc.id}: ${updateErr.message}`);
      } else {
        console.log(`  UPDATED ${doc.id}: "${fileUrl}" → ${matchedFile.bucket}/${matchedFile.path}`);
        updated++;
      }
    } else {
      console.log(`  NOT FOUND: ${doc.id} driver=${doc.driver_id} type=${doc.doc_type} url=${fileUrl}`);
      notFoundList.push(`${doc.driver_id}/${doc.doc_type}: ${fileUrl}`);
      notFound++;
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Already correct: ${alreadyGood}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  
  if (notFoundList.length > 0) {
    console.log('\nNot found details:');
    notFoundList.forEach(x => console.log(`  - ${x}`));
  }
}

fixPaths().catch(console.error);
