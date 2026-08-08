/* -------------------------------------------------------------------------- */
/*  TrendMart — Advanced Query Performance Indexes (Prompt 4)                   */
/*                                                                             */
/*  Strategic indexes on frequently queried columns to minimize execution       */
/*  time under high concurrency loads.                                          */
/*                                                                             */
/*  Target areas:                                                               */
/*   1. Product search: ILIKE-optimized trigram indexes                         */
/*   2. Foreign key joins: products ↔ categories ↔ sub_categories              */
/*   3. Geo-radius filtering: shop location coordinates                         */
/*   4. Order history: timestamp-based tracking & status filtering             */
/*   5. Analytics: event type + timestamp compound indexes                      */
/*   6. Wishlist: user-scoped de-duplication indexes                            */
/*   7. Full-text search: GIN indexes for product names/descriptions           */
/* -------------------------------------------------------------------------- */

-- ─── Enable required extensions ────────────────────────────────────────────────
-- Trigram extension for fuzzy / ILIKE-optimized search
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- ─── 1. Product Search Optimization ────────────────────────────────────────────

-- Trigram GIN index for fast ILIKE / similarity searches on product names
-- This enables sub-100ms searches even with 100k+ product rows
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products
  USING GIN (name gin_trgm_ops);

-- Trigram GIN index on product descriptions for full-text-like search
CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON public.products
  USING GIN (description gin_trgm_ops);

-- B-tree index for exact product name lookups (sorting, prefix matching)
CREATE INDEX IF NOT EXISTS idx_products_name_btree
  ON public.products (name text_pattern_ops);

-- ─── 2. Foreign Key Join Optimization ──────────────────────────────────────────

-- Composite index: products by shop → speeds up merchant storefront queries
-- This is the most frequently accessed pattern (loading a shop's products)
CREATE INDEX IF NOT EXISTS idx_products_shop_id_available
  ON public.products (shop_id, is_available)
  INCLUDE (name, price, image_url, created_at);

-- Products by category (FK to categories table)
CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON public.products (category_id)
  WHERE category_id IS NOT NULL;

-- Products by sub_category (FK to sub_categories table)
CREATE INDEX IF NOT EXISTS idx_products_sub_category_id
  ON public.products (sub_category_id)
  WHERE sub_category_id IS NOT NULL;

-- Sub-categories by parent category → speeds up dynamic sub-category filtering
CREATE INDEX IF NOT EXISTS idx_sub_categories_category_active
  ON public.sub_categories (category, is_active)
  INCLUDE (name, slug, sort_order);

-- Shops by category → category-based browsing/filtering
CREATE INDEX IF NOT EXISTS idx_shops_category_live
  ON public.shops (category, is_live)
  INCLUDE (name, location, logo_url);

-- Shops by owner → merchant dashboard lookup
CREATE INDEX IF NOT EXISTS idx_shops_owner_id
  ON public.shops (owner_id)
  WHERE owner_id IS NOT NULL;

-- ─── 3. Geo-Radius Filtering ───────────────────────────────────────────────────

-- If shops have lat/lng columns for geo-radius queries (future feature),
-- create a GiST index for fast bounding-box and radius searches.
-- NOTE: This is a forward-looking index; it will only be effective once
-- location coordinates are stored in the shops table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'latitude'
  ) THEN
    -- Create geolocation index on coordinates
    CREATE INDEX IF NOT EXISTS idx_shops_location_coords
      ON public.shops (latitude, longitude);
  END IF;

  -- If PostGIS geometry column exists, create spatial index
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'geom'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_shops_geom
      ON public.shops
      USING GIST (geom);
  END IF;
END $$;

-- ─── 4. Order History & Timestamp Tracking ─────────────────────────────────────

-- Orders by shop + status → merchant order management dashboard
CREATE INDEX IF NOT EXISTS idx_orders_shop_status
  ON public.orders (shop_id, status)
  INCLUDE (customer_name, total_amount, created_at);

-- Orders by creation timestamp → chronological listing, analytics time-windows
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC);

-- Orders by updated_at → tracking recent modifications
CREATE INDEX IF NOT EXISTS idx_orders_updated_at
  ON public.orders (updated_at DESC)
  WHERE updated_at IS NOT NULL;

-- Orders by customer phone → customer order history lookup
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
  ON public.orders (customer_phone text_pattern_ops);

-- ─── 5. Analytics & Event Tracking ─────────────────────────────────────────────

-- Analytics logs by shop + event type + timestamp → dashboard aggregation
CREATE INDEX IF NOT EXISTS idx_analytics_logs_shop_event_time
  ON public.analytics_logs (shop_id, event_type, created_at DESC);

-- Analytics logs by creation date (daily aggregation queries)
CREATE INDEX IF NOT EXISTS idx_analytics_logs_created_at
  ON public.analytics_logs (created_at DESC);

-- ─── 6. Wishlist / Favorites Performance ───────────────────────────────────────

-- Customer wishlists by user → loading user's full wishlist
CREATE INDEX IF NOT EXISTS idx_customer_wishlists_user_id
  ON public.customer_wishlists (user_id, type)
  INCLUDE (product_id, shop_id, name, added_at);

-- Unique constraint index for wishlist deduplication (user + product + type)
-- Already exists via unique constraint; this is a covering index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_wishlists_user_product_type
  ON public.customer_wishlists (user_id, product_id, type)
  WHERE product_id IS NOT NULL;

-- Favorite stores by user
CREATE INDEX IF NOT EXISTS idx_favorite_stores_user_id
  ON public.favorite_stores (user_id, shop_id);

-- ─── 7. Reviews ─────────────────────────────────────────────────────────────────

-- Reviews by shop → storefront review listing (sorted by newest)
CREATE INDEX IF NOT EXISTS idx_reviews_shop_created
  ON public.reviews (shop_id, created_at DESC);

-- ─── 8. Coupons ─────────────────────────────────────────────────────────────────

-- Coupons by shop + active status → applying discounts at checkout
CREATE INDEX IF NOT EXISTS idx_coupons_shop_active
  ON public.coupons (shop_id, is_active)
  WHERE is_active = TRUE;

-- Coupons by code → quick lookup during checkout validation
CREATE INDEX IF NOT EXISTS idx_coupons_code
  ON public.coupons (code text_pattern_ops);

-- ─── 9. Full-Text Search (GIN) for advanced product discovery ──────────────────

-- Composite tsvector column for full-text search (name + description weighted)
-- This provides relevance-ranked search results significantly faster than ILIKE
DO $$
BEGIN
  -- Add a generated tsvector column if it doesn't exist
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

    -- GIN index on the full-text search vector
    CREATE INDEX idx_products_search_vector
      ON public.products
      USING GIN (search_vector);
  END IF;
END $$;

-- ─── 10. Composite Indexes for Common Query Patterns ────────────────────────────

-- Products sorted by price within a shop (storefront browsing)
CREATE INDEX IF NOT EXISTS idx_products_shop_price
  ON public.products (shop_id, price)
  WHERE is_available = TRUE;

-- Products sorted by newest within a shop
CREATE INDEX IF NOT EXISTS idx_products_shop_created
  ON public.products (shop_id, created_at DESC)
  WHERE is_available = TRUE;

-- ─── 11. Stories (temporary content, filtered by expiry) ────────────────────────

CREATE INDEX IF NOT EXISTS idx_stories_shop_expires
  ON public.stories (shop_id, expires_at DESC)
  WHERE expires_at > NOW();

-- ─── 12. Inquiries / Leads ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inquiries_shop_created
  ON public.inquiries (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_shop_created
  ON public.leads (shop_id, created_at DESC);

-- ─── Maintenance: Update table statistics for query planner ────────────────────

ANALYZE public.products;
ANALYZE public.shops;
ANALYZE public.orders;
ANALYZE public.analytics_logs;
ANALYZE public.customer_wishlists;
ANALYZE public.favorite_stores;
ANALYZE public.sub_categories;
ANALYZE public.reviews;
ANALYZE public.coupons;

COMMENT ON INDEX idx_products_name_trgm IS 'Trigram GIN index for fast ILIKE/substring product search (Prompt 4)';
COMMENT ON INDEX idx_products_shop_id_available IS 'Covering index for merchant storefront product listings (Prompt 4)';
COMMENT ON INDEX idx_orders_shop_status IS 'Composite index for merchant order management dashboard (Prompt 4)';
COMMENT ON INDEX idx_analytics_logs_shop_event_time IS 'Compound index for analytics aggregation queries (Prompt 4)';