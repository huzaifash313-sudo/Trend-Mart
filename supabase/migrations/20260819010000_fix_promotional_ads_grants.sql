-- =============================================================================
-- TrendMart — Fix promotional_ads REST permissions + storage bucket safety
-- =============================================================================
-- Symptoms:
--   • GET  /rest/v1/promotional_ads?select=*  → 400 / 403
--   • POST /rest/v1/promotional_ads           → 403 (admin can't publish ads)
--   • Admin Ads tab shows nothing / image upload preview is broken
--
-- Root cause: public.promotional_ads was created with RLS policies but WITHOUT
-- table-level GRANTs to anon/authenticated. PostgREST rejects every request
-- before RLS can even run, so the homepage carousel and the whole admin Ads
-- tab fail with 400/403. The storage bucket is also re-asserted idempotently
-- so ad-banner uploads always have a target.
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run (idempotent).
-- =============================================================================

BEGIN;

-- 1) Table-level grants — the actual fix.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotional_ads TO authenticated;
GRANT SELECT ON public.promotional_ads TO anon;

-- 1b) is_admin() — also honour service-role-written app_metadata.role.
--     Admins promoted ONLY via app_metadata (no user_roles row yet) would
--     otherwise be invisible to the admin RLS policy and still get 403 on
--     admin-only tables like promotional_ads. user_metadata is deliberately
--     ignored (user-editable); app_metadata is only writable by the service
--     role, exactly like the middleware's role resolution.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user_id AND role = 'admin'
    )
    OR (
      p_user_id = auth.uid()
      AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    )
  );
$$;

-- 2) Storage: make sure the public media bucket + policies exist (admin
--    panel uploads ad banners to the "ads" folder inside this bucket).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trendmart-media',
  'trendmart-media',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trendmart-media');

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trendmart-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Owners can update their files" ON storage.objects;
CREATE POLICY "Owners can update their files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'trendmart-media' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Owners can delete their files" ON storage.objects;
CREATE POLICY "Owners can delete their files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trendmart-media' AND auth.uid() = owner);

-- 3) Refresh PostgREST's schema cache so the new grants are honoured and the
--    ads↔shops relationship (if you ever need the embed again) is picked up
--    immediately — no need to wait or restart the API.
NOTIFY pgrst, 'reload schema';

COMMIT;
