-- =============================================================================
-- TrendMart — Customer Reviews & Ratings Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  rating        integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment       text DEFAULT '',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_shop_id ON public.reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
CREATE POLICY "reviews_public_read"
  ON public.reviews FOR SELECT
  USING (true);

-- Anyone can insert a review (public submission)
CREATE POLICY "reviews_public_insert"
  ON public.reviews FOR INSERT
  WITH CHECK (true);