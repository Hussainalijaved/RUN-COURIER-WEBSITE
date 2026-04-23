import { supabaseAdmin } from './server/supabaseAdmin';

async function fixBucket() {
  if (!supabaseAdmin) {
    console.error('No supabaseAdmin');
    process.exit(1);
  }

  console.log('Checking pod-images bucket...');
  const { data: bucket, error: getError } = await supabaseAdmin.storage.getBucket('pod-images');
  
  if (getError) {
    console.error('Error fetching bucket:', getError);
  } else {
    console.log('Bucket details:', bucket);
    
    if (!bucket.public) {
      console.log('Bucket is not public. Attempting to make it public...');
      const { data, error } = await supabaseAdmin.storage.updateBucket('pod-images', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      });
      
      if (error) {
        console.error('Failed to update bucket:', error);
      } else {
        console.log('Successfully updated bucket to be public!');
      }
    } else {
      console.log('Bucket is already public.');
    }
  }
  
  process.exit(0);
}

fixBucket();
