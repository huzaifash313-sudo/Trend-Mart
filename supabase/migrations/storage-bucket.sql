-- =============================================================================
-- TrendsMart Storage Bucket Migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/olbxprailtqjbxmkrbhe
-- =============================================================================

-- Create a public storage bucket for shop logos and product images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trendsmart-media',
  'trendsmart-media',
  TRUE,                          -- public access
  5242880,                       -- 5 MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read files from the bucket
CREATE POLICY "Public read access"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'trendsmart-media');

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'trendsmart-media'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to update their own files
CREATE POLICY "Owners can update their files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'trendsmart-media'
    AND auth.uid() = owner
  );

-- Allow authenticated users to delete their own files
CREATE POLICY "Owners can delete their files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'trendsmart-media'
    AND auth.uid() = owner
  );