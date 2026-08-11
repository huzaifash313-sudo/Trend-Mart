-- Link deals to products + deal pricing (cart / order / wishlist parity).
-- Safe to re-run.

ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS original_price numeric(12, 2);

CREATE INDEX IF NOT EXISTS idx_shop_deals_product_id
  ON public.shop_deals (product_id)
  WHERE product_id IS NOT NULL;

COMMENT ON COLUMN public.shop_deals.product_id IS
  'Optional linked product — deal card behaves like that product with schedule-gated Order.';
COMMENT ON COLUMN public.shop_deals.price IS
  'Deal / discounted price shown on the card (PKR).';
COMMENT ON COLUMN public.shop_deals.original_price IS
  'Strike-through original price when higher than price.';
