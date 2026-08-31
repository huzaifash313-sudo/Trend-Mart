-- TrendsMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- PART 9 — QUERY PERFORMANCE INDEXES
-- #############################################################################

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products
  USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON public.products
  USING GIN (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_name_btree
  ON public.products (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_products_shop_id_available
  ON public.products (shop_id, is_available)
  INCLUDE (name, price, image_url, created_at);

CREATE INDEX IF NOT EXISTS idx_products_category_id_perf
  ON public.products (category_id)
  WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_sub_category_id_perf
  ON public.products (sub_category_id)
  WHERE sub_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sub_categories_category_active
  ON public.sub_categories (category, is_active)
  INCLUDE (name, slug, sort_order);

CREATE INDEX IF NOT EXISTS idx_shops_category_live
  ON public.shops (category, is_live)
  INCLUDE (name, location, logo_url);

CREATE INDEX IF NOT EXISTS idx_shops_owner_id
  ON public.shops (owner_id)
  WHERE owner_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'latitude'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_shops_location_coords
      ON public.shops (latitude, longitude);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'geom'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_shops_geom
      ON public.shops
      USING GIST (geom);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_shop_status_perf
  ON public.orders (shop_id, status)
  INCLUDE (customer_name, total_amount, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_updated_at
  ON public.orders (updated_at DESC)
  WHERE updated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_pattern
  ON public.orders (customer_phone text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_analytics_logs_shop_event_time
  ON public.analytics_logs (shop_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_wishlists_user_id_perf
  ON public.customer_wishlists (user_id, type)
  INCLUDE (product_id, shop_id, name, added_at);

CREATE INDEX IF NOT EXISTS idx_customer_wishlists_user_product_type
  ON public.customer_wishlists (user_id, product_id, type)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_favorite_stores_user_id_perf
  ON public.favorite_stores (user_id, shop_id);

CREATE INDEX IF NOT EXISTS idx_reviews_shop_created
  ON public.reviews (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coupons_shop_active
  ON public.coupons (shop_id, is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_coupons_code_pattern
  ON public.coupons (code text_pattern_ops);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B')
      ) STORED;

    CREATE INDEX idx_products_search_vector
      ON public.products
      USING GIN (search_vector);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_shop_price
  ON public.products (shop_id, price)
  WHERE is_available = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_shop_created
  ON public.products (shop_id, created_at DESC)
  WHERE is_available = TRUE;

-- NOTE: no WHERE clause here — NOW()/CURRENT_TIMESTAMP are STABLE, not
-- IMMUTABLE, and Postgres rejects non-IMMUTABLE functions in index
-- predicates (error 42P17). Stories expire after 24h so the table stays
-- small anyway; a plain index still serves the "active stories" query fast.
CREATE INDEX IF NOT EXISTS idx_stories_shop_expires
  ON public.stories (shop_id, expires_at DESC);

-- NOTE: fixed to reference customer_inquiries (the table this app actually
-- uses); the original per-feature migration mistakenly referenced a
-- never-created `inquiries` table here.
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_shop_created
  ON public.customer_inquiries (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_shop_created
  ON public.leads (shop_id, created_at DESC);

ANALYZE public.products;
ANALYZE public.shops;
ANALYZE public.orders;
ANALYZE public.analytics_logs;
ANALYZE public.customer_wishlists;
ANALYZE public.favorite_stores;
ANALYZE public.sub_categories;
ANALYZE public.reviews;
ANALYZE public.coupons;

COMMIT;
