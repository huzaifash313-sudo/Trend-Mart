-- =============================================================================
-- >>> RUN ME #2 of 4 — TrendsMart POS
-- Open in Supabase SQL Editor → Select all → Run
-- Guide: supabase/migrations/POS_RUN_THESE_IN_ORDER.md
-- =============================================================================
-- TrendsMart POS strength — optional product barcodes + favourites flag
-- Safe to re-run. Barcode is optional: shops that don't need it can leave blank.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode text DEFAULT NULL;

COMMENT ON COLUMN public.products.barcode IS
  'Optional EAN/UPC/custom barcode for POS scan. Unique per shop when set.';

-- One barcode per shop (NULLs allowed many times)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_barcode_unique
  ON public.products (shop_id, barcode)
  WHERE barcode IS NOT NULL AND length(trim(barcode)) > 0;

CREATE INDEX IF NOT EXISTS idx_products_shop_barcode
  ON public.products (shop_id, barcode)
  WHERE barcode IS NOT NULL;

-- Quick-add favourite for POS counter strip
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pos_favourite boolean DEFAULT false;

COMMENT ON COLUMN public.products.pos_favourite IS
  'When true, product appears in POS counter favourites strip.';

CREATE INDEX IF NOT EXISTS idx_products_shop_pos_favourite
  ON public.products (shop_id)
  WHERE pos_favourite = true;

COMMIT;
