-- =============================================================================
-- TrendMart — FRESH Consolidated Master Schema
-- PROMPT: Clean slate with all tables, RLS, indexes, seed data
-- Drop everything and recreate without losing existing auth.users
-- =============================================================================

BEGIN;
 
-- =============================================================================
-- SECTION 0: EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- =============================================================================
-- SECTION 1: CLEANUP (drop existing tables in reverse dependency order)
-- =============================================================================
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'spatial_ref_sys') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    DROP TYPE public.app_role CASCADE;
  END IF;
END $$;

-- =============================================================================
-- SECTION 2: ENUMS
-- =============================================================================
CREATE TYPE public.app_role AS ENUM ('customer', 'merchant', 'admin');

-- =============================================================================
-- SECTION 3: AUTO-UPDATE TIMESTAMP FUNCTION (no table dependency)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 4: USER ROLES TABLE (RBAC)
-- =============================================================================
CREATE TABLE public.user_roles (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL DEFAULT 'customer',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_roles_updated_at BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECTION 5: SHOPS TABLE
-- =============================================================================
CREATE TABLE public.shops (
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
  business_hours    text,
  operating_status  text,
  accent_color      text,
  store_bio         text,
  announcement      text,
  service_area      text,
  hourly_rate       numeric(10, 2),
  call_out_charge   numeric(10, 2),
  emergency_available boolean DEFAULT false,
  shop_type         text DEFAULT 'retail' CHECK (shop_type IN ('retail', 'service')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_shops_owner ON public.shops(owner_id);
CREATE INDEX idx_shops_category ON public.shops(category);
CREATE INDEX idx_shops_is_live ON public.shops(is_live) WHERE is_live = true;
CREATE INDEX idx_shops_name_trgm ON public.shops USING gin (name gin_trgm_ops);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shops_public_read" ON public.shops FOR SELECT USING (true);
CREATE POLICY "shops_owner_insert" ON public.shops FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "shops_owner_update" ON public.shops FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "shops_owner_delete" ON public.shops FOR DELETE USING (auth.uid() = owner_id);

CREATE TRIGGER trg_shops_updated_at BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECTION 6: PRODUCTS TABLE
-- =============================================================================
CREATE TABLE public.products (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name            text NOT NULL,
  title           text,
  description     text DEFAULT '',
  price           numeric(10, 2) NOT NULL DEFAULT 0,
  original_price  numeric(10, 2),
  compare_at_price numeric(10, 2),
  currency        text DEFAULT 'PKR',
  image_url       text,
  images          jsonb DEFAULT '[]',
  is_available    boolean DEFAULT true,
  stock_status    text,
  variants        jsonb,
  category_id     uuid,
  sub_category_id uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_products_shop_id ON public.products(shop_id);
CREATE INDEX idx_products_shop_available ON public.products(shop_id, is_available);
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX idx_products_price ON public.products(price);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_owner_insert" ON public.products FOR INSERT WITH CHECK (public.is_shop_owner(shop_id));
CREATE POLICY "products_owner_update" ON public.products FOR UPDATE USING (public.is_shop_owner(shop_id)) WITH CHECK (public.is_shop_owner(shop_id));
CREATE POLICY "products_owner_delete" ON public.products FOR DELETE USING (public.is_shop_owner(shop_id));

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECTION 6.5: HELPER FUNCTIONS (defined AFTER all tables they reference)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(p_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid()
  );
$$;

-- =============================================================================
-- SECTION 7: ORDERS TABLE
-- =============================================================================
CREATE TABLE public.orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name   text NOT NULL,
  customer_phone  text NOT NULL DEFAULT '',
  items_json      jsonb DEFAULT '[]',
  total_amount    numeric(10, 2) NOT NULL DEFAULT 0,
  status          text DEFAULT 'Pending' CHECK (status IN ('Pending', 'Processing', 'Dispatched', 'Delivered', 'Cancelled')),
  tracking_number text,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_public_insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_public_select" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders_owner_update" ON public.orders FOR UPDATE USING (public.is_shop_owner(shop_id));

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECTION 8: REVIEWS TABLE
-- =============================================================================
CREATE TABLE public.reviews (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  rating        integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment       text DEFAULT '',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_reviews_shop_id ON public.reviews(shop_id);
CREATE INDEX idx_reviews_rating ON public.reviews(rating);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews_public_insert" ON public.reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "reviews_owner_delete" ON public.reviews FOR DELETE USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 9: SUB_CATEGORIES TABLE
-- =============================================================================
CREATE TABLE public.sub_categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category    text NOT NULL,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  icon        text,
  is_active   boolean DEFAULT true,
  is_others   boolean DEFAULT false,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_sub_categories_category ON public.sub_categories(category);
CREATE INDEX idx_sub_categories_slug ON public.sub_categories(slug);

ALTER TABLE public.sub_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_categories_public_read" ON public.sub_categories FOR SELECT USING (true);

-- =============================================================================
-- SECTION 10: ANALYTICS_LOGS TABLE
-- =============================================================================
CREATE TABLE public.analytics_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('shop_view', 'product_click', 'search_query', 'whatsapp_click')),
  product_id  uuid REFERENCES public.products(id) ON DELETE SET NULL,
  visitor_ip  text,
  user_agent  text,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_analytics_shop_id ON public.analytics_logs(shop_id);
CREATE INDEX idx_analytics_event_type ON public.analytics_logs(event_type);
CREATE INDEX idx_analytics_created_at ON public.analytics_logs(created_at DESC);

ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_public_insert" ON public.analytics_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_owner_select" ON public.analytics_logs FOR SELECT USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 11: STORIES TABLE
-- =============================================================================
CREATE TABLE public.stories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  image_url   text,
  caption     text,
  expires_at  timestamptz DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_stories_shop_id ON public.stories(shop_id);
CREATE INDEX idx_stories_expires ON public.stories(expires_at);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stories_public_read" ON public.stories FOR SELECT USING (expires_at > now());
CREATE POLICY "stories_owner_insert" ON public.stories FOR INSERT WITH CHECK (public.is_shop_owner(shop_id));
CREATE POLICY "stories_owner_delete" ON public.stories FOR DELETE USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 12: WISHLISTS / FAVORITES TABLE
-- =============================================================================
CREATE TABLE public.wishlists (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL,
  item_type   text NOT NULL CHECK (item_type IN ('shop', 'product')),
  name        text DEFAULT '',
  image_url   text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, item_id, item_type)
);

CREATE INDEX idx_wishlists_user_id ON public.wishlists(user_id);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wishlists_owner_all" ON public.wishlists FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- SECTION 13: COUPONS TABLE
-- =============================================================================
CREATE TABLE public.coupons (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE,
  discount_percent integer CHECK (discount_percent >= 1 AND discount_percent <= 100),
  discount_amount  numeric(10, 2),
  max_uses        integer DEFAULT 100,
  used_count      integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  starts_at       timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT (now() + interval '30 days'),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_public_read" ON public.coupons FOR SELECT USING (is_active = true AND used_count < max_uses AND now() BETWEEN starts_at AND expires_at);
CREATE POLICY "coupons_owner_all" ON public.coupons FOR ALL USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 14: INQUIRIES TABLE
-- =============================================================================
CREATE TABLE public.inquiries (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name   text NOT NULL,
  customer_phone  text NOT NULL,
  message         text NOT NULL,
  is_resolved     boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiries_public_insert" ON public.inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "inquiries_owner_select" ON public.inquiries FOR SELECT USING (public.is_shop_owner(shop_id));
CREATE POLICY "inquiries_owner_update" ON public.inquiries FOR UPDATE USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 15: LEADS TABLE (WhatsApp lead generation)
-- =============================================================================
CREATE TABLE public.leads (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name   text,
  customer_phone  text NOT NULL,
  source          text DEFAULT 'whatsapp',
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_public_insert" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "leads_owner_select" ON public.leads FOR SELECT USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 20: STORAGE BUCKETS
-- =============================================================================
-- Note: Storage buckets must be created via Supabase Dashboard or API
-- INSERT INTO storage.buckets (id, name, public) VALUES ('shop-logos', 'shop-logos', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT DO NOTHING;

COMMIT;
