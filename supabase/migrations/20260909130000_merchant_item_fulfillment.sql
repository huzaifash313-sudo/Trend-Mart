-- Merchant item-level fulfillment + shop dine-in kill switch + ads realtime.
-- Lets merchants pause delivery/pickup per product or deal without taking
-- the whole store offline, and pause QR dine-in shop-wide.

-- ── Products: per-item channel flags (default = allow) ───────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS accepts_delivery boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS accepts_pickup boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.accepts_delivery IS
  'When false, this product cannot be ordered for home delivery (pickup/dine-in may still work).';
COMMENT ON COLUMN public.products.accepts_pickup IS
  'When false, this product cannot be ordered for self-pickup.';

-- ── Shop deals: same channel flags ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shop_deals'
  ) THEN
    ALTER TABLE public.shop_deals
      ADD COLUMN IF NOT EXISTS accepts_delivery boolean NOT NULL DEFAULT true;
    ALTER TABLE public.shop_deals
      ADD COLUMN IF NOT EXISTS accepts_pickup boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ── Shops: shop-wide dine-in pause (restaurants) ─────────────────────────────
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS accepts_dine_in boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.shops.accepts_dine_in IS
  'When false, QR dine-in orders are rejected even if tables remain listed.';

-- ── Ads realtime so merchant dashboard stats update live ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'promotional_ads'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.promotional_ads;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;
