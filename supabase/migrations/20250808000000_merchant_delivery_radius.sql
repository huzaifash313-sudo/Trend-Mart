-- ============================================================================
-- TrendsMart: Merchant Delivery Radius (idempotent, additive)
--
-- Ensures the shop geo-location columns and proximity helper functions exist
-- regardless of whether `20250806050000_geo_radius_and_analytics_extensions.sql`
-- or the fresh consolidated schema was the one actually applied to this
-- database. Safe to run multiple times.
-- ============================================================================

-- 1. Geo-location & delivery radius columns on shops
ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS service_radius_km INTEGER DEFAULT 10 CHECK (service_radius_km > 0 AND service_radius_km <= 500),
ADD COLUMN IF NOT EXISTS delivery_zones TEXT[] DEFAULT '{}'::TEXT[],
ADD COLUMN IF NOT EXISTS address_display TEXT;

-- 2. Helper function: Haversine distance in km between two coordinates
CREATE OR REPLACE FUNCTION public.calculate_distance_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r DOUBLE PRECISION := 6371; -- Earth radius in km
  dlat DOUBLE PRECISION;
  dlng DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) * sin(dlat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlng / 2) * sin(dlng / 2);
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  RETURN r * c;
END;
$$;

-- 3. Function: Get nearby shops within their own service radius, ordered by proximity
CREATE OR REPLACE FUNCTION public.get_nearby_shops(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_distance_km INTEGER DEFAULT 50
) RETURNS TABLE(
  id UUID,
  name TEXT,
  category TEXT,
  location TEXT,
  whatsapp_number TEXT,
  logo_url TEXT,
  banner_url TEXT,
  is_live BOOLEAN,
  created_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  service_radius_km INTEGER,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.category,
    s.location,
    s.whatsapp_number,
    s.logo_url,
    s.banner_url,
    s.is_live,
    s.created_at,
    s.latitude,
    s.longitude,
    s.service_radius_km,
    public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) AS distance_km
  FROM public.shops s
  WHERE s.is_live = true
    AND (
      s.latitude IS NULL
      OR s.longitude IS NULL
      OR s.service_radius_km IS NULL
      OR public.calculate_distance_km(user_lat, user_lng, s.latitude, s.longitude) <= s.service_radius_km
    )
    AND public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) <= max_distance_km
  ORDER BY distance_km ASC;
END;
$$;

-- 4. Index to speed up geo-filtered lookups (requires earthdistance/cube extensions)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS cube;
  CREATE EXTENSION IF NOT EXISTS earthdistance;
EXCEPTION WHEN OTHERS THEN
  -- Extensions may be unavailable on some hosted plans; index creation below
  -- is skipped gracefully in that case.
  NULL;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_shops_geo_coords
  ON public.shops USING gist (
    ll_to_earth(
      COALESCE(latitude, 31.5204),
      COALESCE(longitude, 74.3587)
    )
  ) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 5. Plain B-tree fallback index (always safe, no extension dependency)
CREATE INDEX IF NOT EXISTS idx_shops_lat_lng
ON public.shops (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
