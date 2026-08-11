-- FIX: shop_deals 400 / missing columns (paste once in Supabase SQL Editor)
-- Safe to re-run. Fixes product_id / price / images / visual columns + owner RLS.

-- Visual + gallery
ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Product link + deal pricing (cart / order / wishlist)
ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS original_price numeric(12, 2);

CREATE INDEX IF NOT EXISTS idx_shop_deals_product_id
  ON public.shop_deals (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_deals_featured
  ON public.shop_deals (is_featured, is_active)
  WHERE is_featured = true AND is_active = true;

-- Ensure merchants can manage their deals; public can read active ones
ALTER TABLE public.shop_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_deals_public_read_active" ON public.shop_deals;
CREATE POLICY "shop_deals_public_read_active"
  ON public.shop_deals FOR SELECT
  USING (is_active = true OR auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

DROP POLICY IF EXISTS "shop_deals_owner_all" ON public.shop_deals;
CREATE POLICY "shop_deals_owner_all"
  ON public.shop_deals FOR ALL
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- Refresh PostgREST relationship cache (product embed)
NOTIFY pgrst, 'reload schema';
