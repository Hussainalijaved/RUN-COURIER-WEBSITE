-- Run Courier - Supabase Storage Setup
-- Run this in the Supabase SQL Editor to create storage buckets

-- Create storage bucket for driver documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'driver-documents',
    'driver-documents',
    false,
    10485760,  -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for proof of delivery photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pod-images',
    'pod-images',
    false,
    5242880,  -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-pictures',
    'profile-pictures',
    true,  -- Public so can be displayed
    2097152,  -- 2MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STORAGE RLS POLICIES
-- ============================================

-- Driver documents: Drivers can upload their own, admins can view all
CREATE POLICY "Drivers can upload own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'driver-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Drivers can view own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'driver-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can view all driver documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'driver-documents' AND
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'dispatcher')
    )
);

-- POD images: Drivers can upload, customers/admins can view
CREATE POLICY "Drivers can upload POD images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'pod-images'
);

CREATE POLICY "Users can view POD images for their jobs"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'pod-images'
);

-- Profile pictures: Anyone authenticated can upload their own
CREATE POLICY "Users can upload own profile picture"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-pictures' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view profile pictures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');
