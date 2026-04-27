import { supabaseAdmin } from '../server/supabaseAdmin.js';

async function backfill() {
  if (!supabaseAdmin) {
    console.error('Supabase admin not initialized. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    return;
  }

  console.log('Starting POD backfill and consolidation...');

  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from('jobs')
    .select('id, pod_photo_url, pod_photos, pod_signature_url');

  if (jobsError) {
    console.error('Error fetching jobs:', jobsError);
    return;
  }

  console.log(`Processing ${jobs.length} jobs...`);

  const TARGET_BUCKET = 'pod-images';
  const LEGACY_BUCKETS = ['pod', 'driver-documents', 'DRIVER-DOCUMENTS'];

  let movedCount = 0;
  let alreadyCorrectCount = 0;
  let errorCount = 0;

  for (const job of jobs) {
    const jobId = job.id;

    // 1. Process pod_photo_url
    if (job.pod_photo_url) {
      const result = await moveIfLegacy(jobId, 'pod_photo_url', job.pod_photo_url);
      if (result === 'moved') movedCount++;
      else if (result === 'correct') alreadyCorrectCount++;
      else if (result === 'error') errorCount++;
    }

    // 2. Process pod_signature_url
    if (job.pod_signature_url) {
      const result = await moveIfLegacy(jobId, 'pod_signature_url', job.pod_signature_url);
      if (result === 'moved') movedCount++;
      else if (result === 'correct') alreadyCorrectCount++;
      else if (result === 'error') errorCount++;
    }

    // 3. Process pod_photos array
    if (Array.isArray(job.pod_photos) && job.pod_photos.length > 0) {
      const newArray = [...job.pod_photos];
      let arrayChanged = false;

      for (let i = 0; i < newArray.length; i++) {
        const result = await moveIfLegacy(jobId, `pod_photos[${i}]`, newArray[i], true);
        if (result && typeof result === 'string' && result.startsWith('pod-images/')) {
          newArray[i] = result;
          arrayChanged = true;
          movedCount++;
        }
      }

      if (arrayChanged) {
        const { error: updateError } = await supabaseAdmin!
          .from('jobs')
          .update({ pod_photos: newArray })
          .eq('id', jobId);
        
        if (updateError) {
          console.error(`Failed to update pod_photos array for job ${jobId}:`, updateError.message);
          errorCount++;
        }
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total items moved to ${TARGET_BUCKET}: ${movedCount}`);
  console.log(`Already correct: ${alreadyCorrectCount}`);
  console.log(`Errors: ${errorCount}`);
}

async function moveIfLegacy(jobId: any, field: string, path: string, returnPath = false): Promise<string | null> {
  let storagePath = path;
  let currentBucket = '';

  if (path.startsWith('http')) {
    const match = path.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^\/]+)\/(.+?)(?:\?.*)?$/);
    if (match) {
      currentBucket = match[1];
      storagePath = decodeURIComponent(match[2].split('?')[0]);
    } else {
      return returnPath ? path : 'correct';
    }
  } else {
    const parts = path.split('/');
    if (parts.length > 1 && ['pod', 'pod-images', 'driver-documents', 'DRIVER-DOCUMENTS'].includes(parts[0])) {
      currentBucket = parts[0];
      storagePath = decodeURIComponent(path.substring(parts[0].length + 1));
    } else {
      storagePath = decodeURIComponent(path.replace(/^\/+/, '').split('?')[0]);
      // If no bucket prefix, we have to guess. 
      // But the resolver fix will handle it over time. 
      // For backfill, we only handle explicit legacy buckets.
    }
  }

  if (currentBucket === 'pod-images') return returnPath ? `pod-images/${storagePath}` : 'correct';
  if (!['pod', 'driver-documents', 'DRIVER-DOCUMENTS'].includes(currentBucket)) {
      if (!currentBucket) {
          // Check if it exists in legacy buckets
          for (const lb of ['pod', 'driver-documents']) {
              const { data } = await supabaseAdmin!.storage.from(lb).list(storagePath.split('/').slice(0, -1).join('/'), {
                  search: storagePath.split('/').pop()
              });
              if (data && data.length > 0) {
                  currentBucket = lb;
                  break;
              }
          }
      }
      if (!currentBucket) return returnPath ? path : 'correct';
  }

  console.log(`[Job ${jobId}] Found ${field} in legacy bucket "${currentBucket}". Consolidating...`);

  try {
    const { data: fileData, error: downloadError } = await supabaseAdmin!.storage
      .from(currentBucket)
      .download(storagePath);

    if (downloadError) {
      console.warn(`  - Download failed for ${storagePath} in ${currentBucket}:`, downloadError.message);
      return returnPath ? path : 'error';
    }

    const { error: uploadError } = await supabaseAdmin!.storage
      .from('pod-images')
      .upload(storagePath, fileData!, { upsert: true, contentType: 'image/jpeg' });

    if (uploadError) {
      console.error(`  - Upload failed for ${storagePath} to pod-images:`, uploadError.message);
      return returnPath ? path : 'error';
    }

    const fullNewPath = `pod-images/${storagePath}`;

    if (!returnPath) {
      const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase(); // simple camel to snake
      const { error: updateError } = await supabaseAdmin!
        .from('jobs')
        .update({ [dbField]: fullNewPath })
        .eq('id', jobId);

      if (updateError) {
        console.error(`  - DB update failed for job ${jobId}:`, updateError.message);
        return 'error';
      }
    }

    console.log(`  - Successfully moved to pod-images/${storagePath}`);
    return returnPath ? fullNewPath : 'moved';

  } catch (err: any) {
    console.error(`  - Exception moving ${field} for job ${jobId}:`, err.message);
    return returnPath ? path : 'error';
  }
}

backfill().catch(console.error);
