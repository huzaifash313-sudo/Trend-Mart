-- Structured weekly shop hours + per-channel windows (delivery / pickup / dine-in).
-- Free-text `business_hours` stays as a display cache; `operating_status` remains
-- the merchant emergency Open/Closed override.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS shop_schedule jsonb;

COMMENT ON COLUMN public.shops.shop_schedule IS
  'Weekly store hours + optional delivery/pickup/dine_in windows. See lib/shopHours.ts.';
