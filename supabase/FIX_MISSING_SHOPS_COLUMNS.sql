-- =============================================================================
-- TrendsMart — FIX MISSING SHOPS COLUMNS
-- -----------------------------------------------------------------------------
-- Fixes browser console errors like:
--    GET .../products?... 400 (Bad Request)
--    column shops_1.free_delivery_radius_km does not exist  (code 42703)
--
-- The app's marketplace queries reference shops.free_delivery_radius_km and
-- shops.free_delivery_areas. Those columns are added by two migrations that
-- were NOT applied to this database yet. Run this once in the Supabase SQL
-- editor. Safe to re-run (IF NOT EXISTS).
-- =============================================================================

-- 1) Free-delivery radius (km) — free delivery inside a shop-set circle.
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS free_delivery_radius_km numeric;

COMMENT ON COLUMN public.shops.free_delivery_radius_km IS
  'Customers within this many km of the shop pin get FREE delivery (null/0 = off). Overrides flat/per-km fees inside the circle; free areas, free threshold and paid rates still apply outside.';

-- 2) Free-delivery named localities (always free, regardless of distance/subtotal).
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS free_delivery_areas text[] DEFAULT '{}';

COMMENT ON COLUMN public.shops.free_delivery_areas IS
  'Localities (mohallas/colonies) where delivery is always FREE.';

-- Backfill our seeded test shops so delivery UI/tickers read consistently.
UPDATE public.shops
SET free_delivery_radius_km = 3
WHERE free_delivery_radius_km IS NULL
  AND delivery_zones IS NOT NULL
  AND delivery_zones <> '{}';

-- =============================================================================
-- After running, hard-refresh the app — the 400 console errors will be gone
-- and the marketplace uses its full query (ratings + delivery offers).
-- =============================================================================
