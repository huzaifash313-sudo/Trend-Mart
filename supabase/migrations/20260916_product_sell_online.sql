-- POS-only products: opt a product out of the public storefront while it stays
-- sellable at the physical counter. Default true = no behavior change for
-- existing products.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sell_online boolean NOT NULL DEFAULT true;
