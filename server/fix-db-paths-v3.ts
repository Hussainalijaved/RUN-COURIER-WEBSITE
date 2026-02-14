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
  console.log('=== Listing all Supabase Storage files ===\n');
  
  const fileIndex: Map<string, { bucket: string; path: string }> = new Map();
  
  for (const bucket of BUCKETS) {
    const files = await listAllStorageFiles(bucket);
    console.log(`${bucket}: ${files.length} files`);
    for (const f of files) {
      const basename = f.split('/').pop() || '';
      if (!fileIndex.has(basename)) {
        fileIndex.set(basename, { bucket, path: f });
      }
      fileIndex.set(`${bucket}:${f}`, { bucket, path: f });
    }
  }
  
  console.log('\n=== Fetching driver_documents records ===\n');
  
  const { data: docs, error } = await supabase
    .from('driver_documents')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error || !docs) {
    console.error('Error:', error?.message);
    return;
  }
  
  console.log(`Total records: ${docs.length}\n`);
  
  let updated = 0, alreadyGood = 0, textRecords = 0, notFound = 0;
  const notFoundList: string[] = [];
  
  for (const doc of docs) {
    const fileUrl = doc.file_url || '';
    
    if (fileUrl.startsWith('text:')) {
      textRecords++;
      continue;
    }
    
    if (fileUrl.startsWith('https://') && fileUrl.includes('supabase.co')) {
      const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/);
      if (match) {
        const bucket = match[1];
        const storagePath = decodeURIComponent(match[2]);
        
        const { error: updateErr } = await supabase
          .from('driver_documents')
          .update({
            file_url: storagePath,
            storage_path: storagePath,
            bucket: bucket,
          })
          .eq('id', doc.id);
        
        if (!updateErr) {
          console.log(`  FIXED URL: ${doc.id} → ${bucket}/${storagePath}`);
          updated++;
        } else {
          console.error(`  FAIL: ${doc.id}: ${updateErr.message}`);
        }
        continue;
      }
    }
    
    if ((fileUrl.startsWith('drivers/') || fileUrl.startsWith('applications/') || fileUrl.startsWith('pod/')) && doc.bucket) {
      const key = `${doc.bucket}:${fileUrl}`;
      if (fileIndex.has(key)) {
        alreadyGood++;
        continue;
      }
    }
    
    const filename = fileUrl.split('/').pop() || '';
    let matchedFile = fileIndex.get(filename);
    
    if (!matchedFile && doc.driver_id) {
      for (const bucket of BUCKETS) {
        for (const [key, val] of fileIndex.entries()) {
          if (!key.startsWith(`${bucket}:`)) continue;
          const path = key.replace(`${bucket}:`, '');
          
          if (path.includes(doc.driver_id)) {
            const basename = path.split('/').pop() || '';
            const docType = (doc.doc_type || '').toLowerCase().replace(/[_\s]/g, '');
            const fileBase = basename.toLowerCase().replace(/[_\s]/g, '').replace(/_\d{13,}.*$/, '');
            
            if (fileBase.includes(docType) || docType.includes(fileBase.replace(/\d+.*$/, ''))) {
              matchedFile = val;
              break;
            }
          }
        }
        if (matchedFile) break;
      }
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
      
      if (!updateErr) {
        console.log(`  UPDATED: ${doc.id} → ${matchedFile.bucket}/${matchedFile.path}`);
        updated++;
      }
    } else {
      notFoundList.push(`${doc.driver_id}/${doc.doc_type}: ${fileUrl}`);
      notFound++;
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Already correct: ${alreadyGood}`);
  console.log(`Updated/Fixed: ${updated}`);
  console.log(`Text records (ok): ${textRecords}`);
  console.log(`Files not found: ${notFound}`);
  
  if (notFoundList.length > 0) {
    console.log('\nNot found:');
    notFoundList.forEach(x => console.log(`  - ${x}`));
  }
}

fixPaths().catch(console.error);
