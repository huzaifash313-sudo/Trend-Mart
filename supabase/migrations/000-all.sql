-- =============================================================================
-- TrendsMart — Full Schema Migration (Cumulative)
-- Run in Supabase SQL Editor for initial setup or migration reset.
-- =============================================================================

-- 1. Shops table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shops (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name              text NOT NULL,
  category          text NOT NULL,
  location          text NOT NULL DEFAULT '',
  whatsapp_number   text NOT NULL DEFAULT '',
  logo_url          text,
  banner_url        text,
  is_live           boolean DEFAULT false,
  instagram_handle  text,
  facebook_url      text,
  secondary_phone   text,
  created_at        timestamptz DEFAULT now()
);

-- 2. Products table (with variants support) -----------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text DEFAULT '',
  price         numeric(10,2) NOT NULL DEFAULT 0,
  currency      text DEFAULT 'PKR',
  image_url     text,
  is_available  boolean DEFAULT true,
  variants      jsonb DEFAULT NULL,  -- Array of VariantGroup {name, options: [{label, price_adj?, is_available?}]}
  created_at    timestamptz DEFAULT now()
);

-- 3. Orders table (enhanced) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name   text DEFAULT '',
  customer_phone  text DEFAULT '',
  items_json      jsonb DEFAULT '[]'::jsonb,
  total_amount    numeric(10,2) DEFAULT 0,
  status          text DEFAULT 'Pending',
  created_at      timestamptz DEFAULT now()
);

-- 4. Analytics logs -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  event_type    text NOT NULL DEFAULT 'shop_view',
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  visitor_ip    text,
  user_agent    text,
  created_at    timestamptz DEFAULT now()
);

-- 5. Reviews ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id        uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name  text NOT NULL,
  rating         smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment        text DEFAULT '',
  created_at     timestamptz DEFAULT now()
);

-- 6. Stories ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  image_url   text,
  caption     text,
  expires_at  timestamptz DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz DEFAULT now()
);

-- 6b. Coupons / Promo Codes ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id           uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  code              text NOT NULL,
  discount_percent  numeric(5,2) DEFAULT NULL,
  discount_amount   numeric(10,2) DEFAULT NULL,
  expiry_date       timestamptz DEFAULT NULL,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  CONSTRAINT coupons_discount_check CHECK (
    (discount_percent IS NOT NULL AND discount_amount IS NULL) OR
    (discount_amount IS NOT NULL AND discount_percent IS NULL)
  ),
  CONSTRAINT coupons_code_shop_unique UNIQUE (shop_id, code)
);

-- 7. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON public.products(shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_category ON public.shops(category);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_analytics_shop_id ON public.analytics_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_shop_id ON public.reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_stories_shop_id ON public.stories(shop_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_coupons_shop_id ON public.coupons(shop_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active);

-- 8. Enable RLS on all tables -------------------------------------------------
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies (clean-slate) -----------------------------------------------

-- SHOPS
DROP POLICY IF EXISTS "shops_public_read" ON public.shops;
DROP POLICY IF EXISTS "shops_owner_insert" ON public.shops;
DROP POLICY IF EXISTS "shops_owner_update" ON public.shops;
DROP POLICY IF EXISTS "shops_owner_delete" ON public.shops;
DROP POLICY IF EXISTS "Allow public read on shops" ON public.shops;

CREATE POLICY "shops_public_read" ON public.shops FOR SELECT USING (true);
CREATE POLICY "shops_owner_insert" ON public.shops FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "shops_owner_update" ON public.shops FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "shops_owner_delete" ON public.shops FOR DELETE USING (auth.uid() = owner_id);

-- PRODUCTS
DROP POLICY IF EXISTS "products_public_read" ON public.products;
DROP POLICY IF EXISTS "products_owner_insert" ON public.products;
DROP POLICY IF EXISTS "products_owner_update" ON public.products;
DROP POLICY IF EXISTS "products_owner_delete" ON public.products;
DROP POLICY IF EXISTS "Allow public read on products" ON public.products;

CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_owner_insert" ON public.products FOR INSERT WITH CHECK (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));
CREATE POLICY "products_owner_update" ON public.products FOR UPDATE USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)) WITH CHECK (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));
CREATE POLICY "products_owner_delete" ON public.products FOR DELETE USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

-- ORDERS
DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_public_select_by_phone" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_read" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;

CREATE POLICY "orders_public_insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_public_select_by_phone" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders_owner_read" ON public.orders FOR SELECT USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));
CREATE POLICY "orders_owner_update" ON public.orders FOR UPDATE USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

-- ANALYTICS
DROP POLICY IF EXISTS "analytics_public_insert" ON public.analytics_logs;
DROP POLICY IF EXISTS "analytics_owner_read" ON public.analytics_logs;

CREATE POLICY "analytics_public_insert" ON public.analytics_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_owner_read" ON public.analytics_logs FOR SELECT USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

-- REVIEWS
DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
DROP POLICY IF EXISTS "reviews_public_insert" ON public.reviews;

CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews_public_insert" ON public.reviews FOR INSERT WITH CHECK (true);

-- STORIES
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
DROP POLICY IF EXISTS "stories_owner_insert" ON public.stories;
DROP POLICY IF EXISTS "stories_owner_delete" ON public.stories;

CREATE POLICY "stories_public_read" ON public.stories FOR SELECT USING (true);
CREATE POLICY "stories_owner_insert" ON public.stories FOR INSERT WITH CHECK (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));
CREATE POLICY "stories_owner_delete" ON public.stories FOR DELETE USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

-- COUPONS
CREATE POLICY "coupons_public_read_active" ON public.coupons FOR SELECT USING (is_active = true);
CREATE POLICY "coupons_owner_all" ON public.coupons FOR ALL
  USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id))
  WITH CHECK (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));
