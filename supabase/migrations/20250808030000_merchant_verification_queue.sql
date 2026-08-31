/* -------------------------------------------------------------------------- */
/*  TrendsMart — Merchant Verification / Super-Admin Approval Queue            */
/*                                                                             */
/*  Introduces a distinct `verification_status` on shops, separate from       */
/*  `is_live` (which merchants control themselves to open/close for          */
/*  business). This lets the Super-Admin gate NEW stores from appearing on   */
/*  the public storefront until reviewed, per .cursorrules §1:              */
/*  "Strict Admin Approval queue: New merchant accounts remain pending until */
/*  approved by the Super-Admin."                                            */
/*                                                                             */
/*  Effective public visibility becomes:                                     */
/*    is_live = true  AND  verification_status = 'approved'                  */
/* -------------------------------------------------------------------------- */

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'approved', 'rejected'));

-- Backfill: shops that already exist predate this feature and were already
-- operating under the old is_live-only model — grandfather them in as
-- 'approved' so this migration never hides a pre-existing, working store.
UPDATE public.shops SET verification_status = 'approved' WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_shops_verification_status ON public.shops(verification_status);
CREATE INDEX IF NOT EXISTS idx_shops_public_visible ON public.shops(is_live, verification_status)
  WHERE is_live = true AND verification_status = 'approved';

-- ============================================================================
-- SMART DELIVERY & MINIMUM ORDER SLABS
-- ============================================================================
-- Per .cursorrules §4 "Smart Delivery & Minimum Order Conditions (Slabs)":
--   - Minimum order amount below which checkout is blocked
--   - Free delivery threshold that waives delivery fees above a subtotal
--   - Radius-based delivery fee: flat fee + optional per-km surcharge
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10, 2) DEFAULT 0 CHECK (min_order_amount >= 0),
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2) DEFAULT NULL CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_flat NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee_flat >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_per_km NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee_per_km >= 0);

-- ── RLS: anonymous/public reads must also respect the approval gate ────────
-- (Owners still see their own shop/products regardless of status via the
-- `auth.uid() = owner_id` clause; admins have a separate all-access policy.)
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

-- ── Re-gate get_nearby_shops() to respect the approval queue too ───────────
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

-- ============================================================================
-- SUPER-ADMIN CATEGORY TAXONOMY CONTROL
-- ============================================================================
-- Tighten the sub_categories write policy: previously ANY authenticated user
-- could insert/update/delete rows ("only authenticated users for now,
-- tightened later" — see 20250806060000_sub_categories_and_product_enhancements.sql).
-- This closes that gap by requiring the admin role, matching every other
-- privileged-write policy in the schema.
DROP POLICY IF EXISTS "sub_categories_admin_manage" ON public.sub_categories;
CREATE POLICY "sub_categories_admin_manage" ON public.sub_categories
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- REALTIME: ensure the orders table broadcasts changes
-- ============================================================================
-- Required for the Live Order Tracking module (customer tracking page) and
-- merchant dashboard order feeds, both of which subscribe to postgres_changes
-- on public.orders. Guarded so re-running this migration never errors if the
-- table is already part of the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Publication may not exist on some local/self-hosted setups — skip gracefully.
  NULL;
END $$;
