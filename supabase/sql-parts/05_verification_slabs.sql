-- TrendMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- PART 5 — SHOP VERIFICATION STATUS + DELIVERY SLABS
-- (Approval queue disabled: default is 'approved'; stores go live on create.)
-- #############################################################################

BEGIN;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (verification_status IN ('pending', 'approved', 'rejected'));

-- Ensure default is approved even if the column already existed as pending
ALTER TABLE public.shops
  ALTER COLUMN verification_status SET DEFAULT 'approved';

-- Backfill: any leftover pending rows become approved + live (auto-live policy)
UPDATE public.shops
SET verification_status = 'approved', is_live = true
WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_shops_verification_status ON public.shops(verification_status);
CREATE INDEX IF NOT EXISTS idx_shops_public_visible ON public.shops(is_live, verification_status)
  WHERE is_live = true AND verification_status = 'approved';

-- Smart delivery & minimum order slabs
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10, 2) DEFAULT 0 CHECK (min_order_amount >= 0),
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2) DEFAULT NULL CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_flat NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee_flat >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_per_km NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee_per_km >= 0);

-- Public reads must also respect the approval gate
DROP POLICY IF EXISTS "shops_public_read" ON public.shops;
CREATE POLICY "shops_public_read"
  ON public.shops FOR SELECT
  USING (
    (is_live = true AND verification_status = 'approved')
    OR auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = products.shop_id
      AND shops.is_live = true
      AND shops.verification_status = 'approved'
    )
    OR
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = products.shop_id)
  );

-- Re-gate get_nearby_shops() to respect the approval queue too
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
    AND s.verification_status = 'approved'
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

-- Tighten sub_categories write policy to admin-only
DROP POLICY IF EXISTS "sub_categories_admin_manage" ON public.sub_categories;
CREATE POLICY "sub_categories_admin_manage" ON public.sub_categories
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Realtime: ensure the orders table broadcasts changes (Live Order Tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

COMMIT;
