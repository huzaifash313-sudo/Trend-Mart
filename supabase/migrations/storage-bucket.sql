-- =============================================================================
-- TrendsMart Storage Bucket
-- Live bucket id is still "trendmart-media" (pre-rebrand name). Do not rename.
-- Run in Supabase SQL Editor if the bucket / policies are missing.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trendmart-media',
  'trendmart-media',
  TRUE,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'trendmart-media');

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'trendmart-media'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Owners can update their files" ON storage.objects;
CREATE POLICY "Owners can update their files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'trendmart-media'
    AND auth.uid() = owner
  );

DROP POLICY IF EXISTS "Owners can delete their files" ON storage.objects;
CREATE POLICY "Owners can delete their files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'trendmart-media'
    AND auth.uid() = owner
  );
