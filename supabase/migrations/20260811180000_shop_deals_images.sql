-- Multi-image gallery for shop deals (parity with products.images).
ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.shop_deals.images IS
  'JSON array of image URLs for deal gallery; image_url remains the cover (first).';
