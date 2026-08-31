-- =============================================================================
-- TrendsMart — Customer Wishlists & Favorite Stores (Prompt 2)
-- 
-- Dedicated database tables for user bookmarks with secure RLS policies.
-- Replaces localStorage with persistent, multi-device synchronised storage.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: CUSTOMER_WISHLISTS TABLE
-- Stores product bookmarks per authenticated user.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_wishlists (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES public.products(id) ON DELETE CASCADE,
  shop_id       uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('shop', 'product')),
  name          text NOT NULL,
  image_url     text,
  shop_name     text,
  added_at      timestamptz DEFAULT now(),
  -- Prevent duplicate bookmarks per user
  CONSTRAINT uq_wishlist_user_item UNIQUE (user_id, product_id, type)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON public.customer_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON public.customer_wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_shop_id ON public.customer_wishlists(shop_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_added_at ON public.customer_wishlists(added_at DESC);

-- Enable RLS
ALTER TABLE public.customer_wishlists ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 2: FAVORITE_STORES TABLE
-- Stores store/favorite bookmarks per authenticated user.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.favorite_stores (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  shop_name     text NOT NULL,
  logo_url      text,
  added_at      timestamptz DEFAULT now(),
  -- Prevent duplicate store favorites per user
  CONSTRAINT uq_favorite_user_shop UNIQUE (user_id, shop_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_favorite_user_id ON public.favorite_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_shop_id ON public.favorite_stores(shop_id);
CREATE INDEX IF NOT EXISTS idx_favorite_added_at ON public.favorite_stores(added_at DESC);

-- Enable RLS
ALTER TABLE public.favorite_stores ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 3: RLS POLICIES — CUSTOMER_WISHLISTS
-- Users can ONLY access their own wishlist items.
-- =============================================================================

-- 3.1 Authenticated user can SELECT their own wishlist items
DROP POLICY IF EXISTS "wishlist_user_select" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_select"
  ON public.customer_wishlists FOR SELECT
  USING (auth.uid() = user_id);

-- 3.2 Authenticated user can INSERT their own wishlist items
DROP POLICY IF EXISTS "wishlist_user_insert" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_insert"
  ON public.customer_wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3.3 Authenticated user can DELETE their own wishlist items
DROP POLICY IF EXISTS "wishlist_user_delete" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_delete"
  ON public.customer_wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- 3.4 Authenticated user can UPDATE their own wishlist items (e.g. rename)
DROP POLICY IF EXISTS "wishlist_user_update" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_update"
  ON public.customer_wishlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- SECTION 4: RLS POLICIES — FAVORITE_STORES
-- Users can ONLY access their own favorite stores.
-- =============================================================================

-- 4.1 Authenticated user can SELECT their own favorite stores
DROP POLICY IF EXISTS "favorite_stores_user_select" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_select"
  ON public.favorite_stores FOR SELECT
  USING (auth.uid() = user_id);

-- 4.2 Authenticated user can INSERT their own favorite stores
DROP POLICY IF EXISTS "favorite_stores_user_insert" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_insert"
  ON public.favorite_stores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4.3 Authenticated user can DELETE their own favorite stores
DROP POLICY IF EXISTS "favorite_stores_user_delete" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_delete"
  ON public.favorite_stores FOR DELETE
  USING (auth.uid() = user_id);

-- 4.4 Authenticated user can UPDATE their own favorite stores
DROP POLICY IF EXISTS "favorite_stores_user_update" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_update"
  ON public.favorite_stores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- SECTION 5: AUTO-MIGRATION OF EXISTING LOCALSTORAGE DATA
-- This function can be called from an API route to migrate anonymous
-- localStorage bookmarks into the database after a user signs up/signs in.
-- 
-- Call from client:
--   SELECT public.migrate_wishlist_item(
--     p_user_id, p_product_id, p_type, p_name, p_image_url, p_shop_id, p_shop_name
--   );
-- =============================================================================

CREATE OR REPLACE FUNCTION public.migrate_wishlist_item(
  p_user_id    uuid,
  p_product_id uuid,
  p_type       text,
  p_name       text,
  p_image_url  text DEFAULT NULL,
  p_shop_id    uuid DEFAULT NULL,
  p_shop_name  text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Only allow inserting for the calling user
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot migrate wishlist items for another user.';
  END IF;

  INSERT INTO public.customer_wishlists (
    user_id, product_id, shop_id, type, name, image_url, shop_name
  ) VALUES (
    p_user_id, p_product_id, p_shop_id, p_type, p_name, p_image_url, p_shop_name
  )
  ON CONFLICT (user_id, product_id, type) DO NOTHING;

  RETURN true;
END;
$$;

-- =============================================================================
-- SECTION 6: MIGRATE FAVORITE STORE
-- Same pattern for favorite stores migration from localStorage.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.migrate_favorite_store(
  p_user_id   uuid,
  p_shop_id   uuid,
  p_shop_name text,
  p_logo_url  text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot migrate favorite stores for another user.';
  END IF;

  INSERT INTO public.favorite_stores (user_id, shop_id, shop_name, logo_url)
  VALUES (p_user_id, p_shop_id, p_shop_name, p_logo_url)
  ON CONFLICT (user_id, shop_id) DO NOTHING;

  RETURN true;
END;
$$;

-- =============================================================================
-- SECTION 7: UPDATED_AT TRIGGERS
-- =============================================================================

-- Add updated_at columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_wishlists' AND column_name='updated_at' AND table_schema='public') THEN
    ALTER TABLE public.customer_wishlists ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='favorite_stores' AND column_name='updated_at' AND table_schema='public') THEN
    ALTER TABLE public.favorite_stores ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS trg_customer_wishlists_updated_at ON public.customer_wishlists;
CREATE TRIGGER trg_customer_wishlists_updated_at
  BEFORE UPDATE ON public.customer_wishlists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_favorite_stores_updated_at ON public.favorite_stores;
CREATE TRIGGER trg_favorite_stores_updated_at
  BEFORE UPDATE ON public.favorite_stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- =============================================================================
-- ✅ POST-MIGRATION VERIFICATION:
--
-- 1. Verify tables exist:
--    SELECT table_name FROM information_schema.tables 
--    WHERE table_schema = 'public' AND table_name IN ('customer_wishlists', 'favorite_stores');
--
-- 2. Verify RLS is enabled:
--    SELECT tablename, rowsecurity FROM pg_tables 
--    WHERE schemaname = 'public' AND tablename IN ('customer_wishlists', 'favorite_stores');
--
-- 3. Test as authenticated user:
--    - User A cannot see User B's wishlist items
--    - User A cannot see User B's favorite stores
--    - User A cannot insert/update/delete User B's records
--
-- 4. Test migration functions:
--    SELECT public.migrate_wishlist_item(auth.uid(), 'product-uuid', 'product', 'Cool Shirt');
--    SELECT public.migrate_favorite_store(auth.uid(), 'shop-uuid', 'Cool Shop');
-- =============================================================================