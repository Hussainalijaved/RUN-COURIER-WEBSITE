-- Migration: Add RLS policies for pod-images bucket
-- This ensures drivers can upload POD images to the public pod-images bucket

-- 1. Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pod-images',
  'pod-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760;

-- 2. Drop existing policies if any
DROP POLICY IF EXISTS "pod_images_admin_all" ON storage.objects;
DROP POLICY IF EXISTS "pod_images_driver_upload" ON storage.objects;
DROP POLICY IF EXISTS "pod_images_driver_read" ON storage.objects;
DROP POLICY IF EXISTS "pod_images_public_read" ON storage.objects;

-- 3. Admin full access
CREATE POLICY "pod_images_admin_all" ON storage.objects
  FOR ALL 
  USING (
    bucket_id = 'pod-images' AND
    (
      (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'admin'
    )
  );

-- 4. Drivers can upload to their own job folders
-- Path convention: pod-images/pod/{jobId}/{filename} (to match mobile app pathing or server pathing)
CREATE POLICY "pod_images_driver_upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'pod-images' AND
    auth.role() = 'authenticated' AND
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role') = 'driver' AND
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.driver_id = auth.uid() 
      AND (
        storage.objects.name LIKE 'pod/' || jobs.id::text || '/%' OR
        storage.objects.name LIKE 'job_' || jobs.id::text || '/%' OR
        storage.objects.name LIKE jobs.id::text || '/%'
      )
    )
  );

-- 5. Public read access (since it's a public bucket, but let's be explicit)
CREATE POLICY "pod_images_public_read" ON storage.objects
  FOR SELECT 
  USING (bucket_id = 'pod-images');
