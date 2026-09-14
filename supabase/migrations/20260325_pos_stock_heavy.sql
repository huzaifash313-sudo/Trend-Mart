-- =============================================================================
-- >>> RUN ME #4 of 4 — TrendsMart POS
-- Open in Supabase SQL Editor → Select all → Run
-- Guide: supabase/migrations/POS_RUN_THESE_IN_ORDER.md
-- =============================================================================
-- TrendsMart POS — heavy inventory fields (batch / expiry / reorder)
-- Safe to re-run.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS expiry_date date DEFAULT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS batch_no text DEFAULT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reorder_level integer DEFAULT NULL;

COMMENT ON COLUMN public.products.expiry_date IS
  'Optional expiry (pharmacy / grocery / bakery POS alerts)';

COMMENT ON COLUMN public.products.batch_no IS
  'Optional batch / lot code for POS inventory';

COMMENT ON COLUMN public.products.reorder_level IS
  'Per-SKU low-stock override; null = use shop pos_settings.low_stock_threshold';

CREATE INDEX IF NOT EXISTS idx_products_shop_expiry
  ON public.products (shop_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_shop_stock_qty
  ON public.products (shop_id, stock_qty)
  WHERE stock_qty IS NOT NULL;

COMMIT;
