-- ============================================================================
-- TrendsMart — RUN THIS IN SUPABASE SQL EDITOR (demo promotional ads)
-- Fixes placement constraint, then seeds 12 test ads (3 per page).
-- Safe to re-run.
-- ============================================================================

-- 1) Allow all placement values the app uses
ALTER TABLE public.promotional_ads DROP CONSTRAINT IF EXISTS promotional_ads_placement_check;
ALTER TABLE public.promotional_ads ADD CONSTRAINT promotional_ads_placement_check
  CHECK (placement IN (
    'homepage_top',
    'homepage_feed',
    'store_top',
    'deals_top',
    'products_top'
  ));

-- 2) Seed ads (platform + demo shops — skips rows if shop FK missing)
INSERT INTO public.promotional_ads (
  id, shop_id, title, subtitle, image_url, link_url, badge_label,
  placement, status, is_active, sort_order, reviewed_at
)
SELECT * FROM (VALUES
  ('f0000001-0000-4000-8000-000000000001'::uuid, NULL::uuid,
    'TrendsMart — Your Neighborhood Marketplace',
    'Discover 600+ products from local Gujranwala shops',
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
    '/products', 'Featured', 'homepage_top', 'approved', true, 0, now()),

  ('f0000001-0000-4000-8000-000000000002'::uuid,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'Tandoori Express — Free Delivery',
    'Orders above Rs 1,500 deliver free across Satellite Town',
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-tandoori', 'Hot Deal', 'homepage_top', 'approved', true, 1, now()),

  ('f0000001-0000-4000-8000-000000000003'::uuid,
    'a0000000-0000-4000-8000-000000000002'::uuid,
    'Pizza Palace Family Combo',
    'Large pizza + 1.5L drink at Rs 1,499 — this week only',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-pizza', 'Limited Time', 'homepage_top', 'approved', true, 2, now()),

  ('f0000001-0000-4000-8000-000000000004'::uuid, NULL::uuid,
    'Browse Everything Near You',
    'Filter by category, distance, and best discounts',
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
    '/products', 'Sponsored', 'products_top', 'approved', true, 0, now()),

  ('f0000001-0000-4000-8000-000000000005'::uuid,
    'a0000000-0000-4000-8000-000000000003'::uuid,
    'Al-Madina Super Store',
    'Daily kiryana staples — delivery in 30 minutes',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-grocery', 'Trusted Shop', 'products_top', 'approved', true, 1, now()),

  ('f0000001-0000-4000-8000-000000000006'::uuid,
    'a0000000-0000-4000-8000-000000000007'::uuid,
    'Trendy Threads — New Arrivals',
    'Fresh kurta designs & polos — buy 2 get 5% off',
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-clothes', 'New', 'products_top', 'approved', true, 2, now()),

  ('f0000001-0000-4000-8000-000000000007'::uuid, NULL::uuid,
    'Today''s Best Deals',
    'Hand-picked discounts updated every morning',
    'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=80',
    '/deals', 'Featured', 'deals_top', 'approved', true, 0, now()),

  ('f0000001-0000-4000-8000-000000000008'::uuid,
    'a0000000-0000-4000-8000-000000000004'::uuid,
    'Sweet Bites — Custom Cakes',
    'Order 24 hrs ahead · free message on top',
    'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-bakery', 'Sweet Deal', 'deals_top', 'approved', true, 1, now()),

  ('f0000001-0000-4000-8000-000000000009'::uuid,
    'a0000000-0000-4000-8000-000000000005'::uuid,
    'Dera Desi Karahi Combo',
    'Chicken karahi + 4 naan at Rs 1,999',
    'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-desi', 'Hot Deal', 'deals_top', 'approved', true, 2, now()),

  ('f0000001-0000-4000-8000-000000000010'::uuid,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'Wood-Fired Pizza Week',
    'All medium pizzas 15% off — dine-in or delivery',
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-tandoori', 'Store Pick', 'store_top', 'approved', true, 0, now()),

  ('f0000001-0000-4000-8000-000000000011'::uuid,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'Zinger Burger Combo',
    'Zinger + fries + drink at Rs 699',
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-tandoori', 'Combo Deal', 'store_top', 'approved', true, 1, now()),

  ('f0000001-0000-4000-8000-000000000012'::uuid,
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'QR Dine-in — Scan & Order',
    'No app needed · table order in 30 seconds',
    'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=1200&q=80',
    '/shop/demo-tandoori', 'New', 'store_top', 'approved', true, 2, now())
) AS v(id, shop_id, title, subtitle, image_url, link_url, badge_label, placement, status, is_active, sort_order, reviewed_at)
WHERE v.shop_id IS NULL
   OR EXISTS (SELECT 1 FROM public.shops s WHERE s.id = v.shop_id)
ON CONFLICT (id) DO UPDATE SET
  shop_id = EXCLUDED.shop_id,
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  image_url = EXCLUDED.image_url,
  link_url = EXCLUDED.link_url,
  badge_label = EXCLUDED.badge_label,
  placement = EXCLUDED.placement,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 4) Fix any previously seeded broken Unsplash URLs (404 photos)
UPDATE public.promotional_ads
SET image_url = 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
    updated_at = now()
WHERE image_url LIKE '%photo-1607082348824%';

UPDATE public.promotional_ads
SET image_url = 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=80',
    updated_at = now()
WHERE image_url LIKE '%photo-1607083206869%';

-- 3) Verify (should return 12 rows)
SELECT placement, count(*) FROM public.promotional_ads
WHERE id::text LIKE 'f0000001-%'
GROUP BY placement
ORDER BY placement;
