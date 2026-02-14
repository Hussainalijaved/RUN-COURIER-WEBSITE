import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
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
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.pdf': 'application/pdf',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractDocType(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const withoutTimestamp = withoutExt.replace(/_\d{13,}.*$/, '');
  return withoutTimestamp || 'unknown';
}

function getStoragePath(localPath: string): string {
  const relative = path.relative(UPLOADS_DIR, localPath);
  const parts = relative.split(path.sep);

  if (parts[0] === 'documents') {
    const folder = parts[1];
    const filename = parts.slice(2).join('/') || parts[parts.length - 1];

    if (folder === 'application-pending') {
      return `applications/pending/${filename}`;
    }
    if (folder?.startsWith('application-')) {
      const uuid = folder.replace('application-', '');
      return `applications/${uuid}/${filename}`;
    }
    const docType = extractDocType(path.basename(localPath));
    return `drivers/${folder}/${docType}/${path.basename(localPath)}`;
  }

  if (parts[0] === 'pod') {
    return parts.join('/');
  }

  return `misc/${parts.join('/')}`;
}

async function updateDbRecord(driverId: string, docType: string, storagePath: string) {
  const normalizedDocType = docType.replace(/_/g, '_');
  
  const { data: existing } = await supabase
    .from('driver_documents')
    .select('id, file_url, storage_path')
    .eq('driver_id', driverId)
    .ilike('doc_type', normalizedDocType)
    .limit(1);

  if (existing && existing.length > 0) {
    const record = existing[0];
    if (record.storage_path === storagePath && record.file_url?.startsWith('drivers/')) {
      return 'already_updated';
    }
    const { error } = await supabase
      .from('driver_documents')
      .update({
        file_url: storagePath,
        storage_path: storagePath,
        bucket: BUCKET,
      })
      .eq('id', record.id);
    
    if (error) {
      console.error(`  DB update error for ${driverId}/${docType}:`, error.message);
      return 'db_error';
    }
    return 'updated';
  }
  return 'no_record';
}

async function migrate() {
  console.log('Starting local → Supabase Storage migration...\n');

  const allFiles = getAllFiles(UPLOADS_DIR);
  console.log(`Found ${allFiles.length} local files to migrate\n`);

  let migrated = 0, failed = 0, skipped = 0, dbUpdated = 0;
  const errors: string[] = [];

  const batchSize = 5;
  for (let i = 0; i < allFiles.length; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (localPath) => {
      const storagePath = getStoragePath(localPath);
      const contentType = getMimeType(localPath);
      const fileBuffer = fs.readFileSync(localPath);
      
      try {
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, fileBuffer, { contentType, upsert: true });
        
        if (uploadErr) {
          console.error(`  FAIL: ${storagePath} - ${uploadErr.message}`);
          errors.push(`${storagePath}: ${uploadErr.message}`);
          failed++;
          return;
        }
        
        console.log(`  OK: ${storagePath}`);
        migrated++;

        const relative = path.relative(UPLOADS_DIR, localPath);
        const parts = relative.split(path.sep);
        if (parts[0] === 'documents' && parts[1] && parts[1] !== 'application-pending' && !parts[1].startsWith('application-')) {
          const driverId = parts[1];
          const docType = extractDocType(path.basename(localPath));
          const result = await updateDbRecord(driverId, docType, storagePath);
          if (result === 'updated') {
            dbUpdated++;
            console.log(`    DB updated: ${driverId}/${docType}`);
          } else if (result === 'no_record') {
            console.log(`    No DB record found for ${driverId}/${docType}`);
          }
        }
      } catch (err: any) {
        console.error(`  ERROR: ${storagePath} - ${err.message}`);
        errors.push(`${storagePath}: ${err.message}`);
        failed++;
      }
    }));
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Total files: ${allFiles.length}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Failed: ${failed}`);
  console.log(`DB records updated: ${dbUpdated}`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e}`));
  }
}

migrate().catch(console.error);
