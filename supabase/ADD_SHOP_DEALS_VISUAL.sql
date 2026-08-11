-- Paste in Supabase SQL Editor if shop_deals already exists without visual columns.
-- Safe to re-run.

ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shop_deals_featured
  ON public.shop_deals (is_featured, is_active)
  WHERE is_featured = true AND is_active = true;
