-- =============================================================================
-- TrendMart — Discount Coupons & Promo Codes Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id           uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  code              text NOT NULL,
  discount_percent  numeric(5,2) DEFAULT NULL,  -- e.g. 10.00 = 10%
  discount_amount   numeric(10,2) DEFAULT NULL,  -- e.g. 200.00 = Rs. 200 off
  expiry_date       timestamptz DEFAULT NULL,   -- NULL = never expires
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  CONSTRAINT coupons_discount_check CHECK (
    (discount_percent IS NOT NULL AND discount_amount IS NULL) OR
    (discount_amount IS NOT NULL AND discount_percent IS NULL)
  ),
  CONSTRAINT coupons_code_shop_unique UNIQUE (shop_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_shop_id ON public.coupons(shop_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read active coupons (for validation)
CREATE POLICY "coupons_public_read_active"
  ON public.coupons FOR SELECT
  USING (is_active = true);

-- Owner: full CRUD on their shop's coupons
CREATE POLICY "coupons_owner_all"
  ON public.coupons FOR ALL
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );