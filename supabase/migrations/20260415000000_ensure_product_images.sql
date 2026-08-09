-- Ensure product gallery column exists (jsonb array of image URLs)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products.images IS
  'JSON array of product gallery image URLs. First image is mirrored in image_url as the cover.';
