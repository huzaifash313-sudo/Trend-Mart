-- Paste in Supabase SQL Editor (safe to re-run).
-- Prefer the full fix: FIX_SHOP_DEALS_SCHEMA.sql
-- Enables product-linked deals with price + original_price for cart/order/wishlist.

ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS original_price numeric(12, 2);

CREATE INDEX IF NOT EXISTS idx_shop_deals_product_id
  ON public.shop_deals (product_id)
  WHERE product_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
