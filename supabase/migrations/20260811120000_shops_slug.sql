-- TrendsMart: persist SEO-friendly shop slugs for share / QR / deep links
-- Safe to re-run.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS shops_slug_unique
  ON public.shops (slug)
  WHERE slug IS NOT NULL AND length(trim(slug)) > 0;

COMMENT ON COLUMN public.shops.slug IS
  'URL slug for /shop/{slug}. Generated from name + short id on create/update.';
