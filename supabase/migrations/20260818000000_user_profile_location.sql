-- TrendsMart: persist the customer's precise location captured at signup so
-- checkout and the profile page can auto-fill name / phone / address / pin.
-- Safe / idempotent — run once in Supabase SQL Editor.

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS location_label text;

COMMENT ON COLUMN public.user_profiles.latitude IS 'Customer precise location latitude (from signup GPS)';
COMMENT ON COLUMN public.user_profiles.longitude IS 'Customer precise location longitude (from signup GPS)';
COMMENT ON COLUMN public.user_profiles.city IS 'Customer city (reverse geocoded or manual selection)';
COMMENT ON COLUMN public.user_profiles.location_label IS 'Human-readable address / area label';

COMMIT;
