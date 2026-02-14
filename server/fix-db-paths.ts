import { createClient } from '@supabase/supabase-js';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const BUCKET = 'driver-documents';

async function listAllStorageFiles(prefix: string = ''): Promise<string[]> {
  const results: string[] = [];
  const { data: entries } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (!entries) return results;
  
  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) {
      results.push(fullPath);
    } else {
      const subFiles = await listAllStorageFiles(fullPath);
      results.push(...subFiles);
    }
  }
  return results;
}

function extractDocType(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const withoutTimestamp = withoutExt.replace(/_\d{13,}.*$/, '');
  return withoutTimestamp || 'unknown';
}

async function fixPaths() {
  console.log('Fetching all driver_documents records...\n');
  
  const { data: docs, error } = await supabase
    .from('driver_documents')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching documents:', error.message);
    return;
  }
  
  console.log(`Found ${docs?.length || 0} document records\n`);
  
  const needsUpdate = docs?.filter(d => {
    const url = d.file_url || '';
    return url.startsWith('/api/uploads/') || url.startsWith('uploads/') || 
           (url && !url.startsWith('drivers/') && !url.startsWith('applications/') && !url.startsWith('pod/') && !url.startsWith('http'));
  }) || [];
  
  console.log(`${needsUpdate.length} records need path updates\n`);
  
  if (needsUpdate.length === 0) {
    console.log('All records already have correct paths!');
    return;
  }

  console.log('Listing all files in Supabase Storage...\n');
  const storageFiles = await listAllStorageFiles();
  console.log(`Found ${storageFiles.length} files in storage\n`);

  let updated = 0, notFound = 0;

  for (const doc of needsUpdate) {
    const fileUrl = doc.file_url || '';
    const driverId = doc.driver_id;
    const docType = doc.doc_type;
    
    let localFilename = '';
    if (fileUrl.includes('/')) {
      localFilename = fileUrl.split('/').pop() || '';
    } else {
      localFilename = fileUrl;
    }

    let matchedPath = '';

    for (const sp of storageFiles) {
      if (localFilename && sp.endsWith(localFilename)) {
        matchedPath = sp;
        break;
      }
    }

    if (!matchedPath && driverId) {
      const driverPrefix = `drivers/${driverId}/`;
      const candidates = storageFiles.filter(f => f.startsWith(driverPrefix));
      
      for (const sp of candidates) {
        const fname = path.basename(sp);
        const spDocType = extractDocType(fname);
        if (spDocType === docType || spDocType.replace(/_/g, '') === docType?.replace(/_/g, '')) {
          matchedPath = sp;
          break;
        }
      }
    }

    if (matchedPath) {
      const { error: updateErr } = await supabase
        .from('driver_documents')
        .update({
          file_url: matchedPath,
          storage_path: matchedPath,
          bucket: BUCKET,
        })
        .eq('id', doc.id);
      
      if (updateErr) {
        console.error(`  FAIL update ${doc.id}: ${updateErr.message}`);
      } else {
        console.log(`  UPDATED ${doc.id}: ${fileUrl} → ${matchedPath}`);
        updated++;
      }
    } else {
      console.log(`  NOT FOUND: ${doc.id} (${driverId}/${docType}) file_url=${fileUrl}`);
      notFound++;
    }
  }

  console.log('\n=== Path Fix Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Not found in storage: ${notFound}`);
}

fixPaths().catch(console.error);
