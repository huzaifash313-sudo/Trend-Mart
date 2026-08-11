-- Shop scheduled deals (weekly / date range / monthly)

CREATE TABLE IF NOT EXISTS public.shop_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  schedule_type text NOT NULL CHECK (schedule_type IN ('weekly', 'date_range', 'monthly')),
  weekdays smallint[] DEFAULT NULL,
  starts_on date DEFAULT NULL,
  ends_on date DEFAULT NULL,
  day_of_month smallint DEFAULT NULL CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)),
  is_active boolean NOT NULL DEFAULT true,
  image_url text,
  badge_text text,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_deals_weekly_check CHECK (
    schedule_type <> 'weekly' OR (weekdays IS NOT NULL AND cardinality(weekdays) > 0)
  ),
  CONSTRAINT shop_deals_range_check CHECK (
    schedule_type <> 'date_range' OR (starts_on IS NOT NULL AND ends_on IS NOT NULL)
  ),
  CONSTRAINT shop_deals_monthly_check CHECK (
    schedule_type <> 'monthly' OR day_of_month IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_shop_deals_shop_id ON public.shop_deals (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_deals_active ON public.shop_deals (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shop_deals_featured
  ON public.shop_deals (is_featured, is_active)
  WHERE is_featured = true AND is_active = true;

ALTER TABLE public.shop_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_deals_public_read_active" ON public.shop_deals;
CREATE POLICY "shop_deals_public_read_active"
  ON public.shop_deals FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "shop_deals_owner_all" ON public.shop_deals;
CREATE POLICY "shop_deals_owner_all"
  ON public.shop_deals FOR ALL
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );
