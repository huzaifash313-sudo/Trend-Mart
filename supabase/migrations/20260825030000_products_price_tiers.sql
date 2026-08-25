-- Quantity-based bulk pricing tiers for products.
-- Merchant defines price breakpoints (e.g. 1 = Rs 200, 6 = Rs 1100); the app
-- auto-interpolates between them and holds the last tier price for higher qty.
-- Safe to re-run.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_tiers jsonb;

COMMENT ON COLUMN public.products.price_tiers IS
  'Optional quantity price tiers: [{min_qty, price}, ...]. Per-unit price at a given quantity.';
