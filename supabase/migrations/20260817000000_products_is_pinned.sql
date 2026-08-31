-- TrendsMart — merchant "pin to top" for products.
-- Adds an is_pinned flag so a store owner can pin products to the top of
-- their storefront (and their own manage view). Idempotent.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_shop_pinned
  ON public.products (shop_id, is_pinned);
