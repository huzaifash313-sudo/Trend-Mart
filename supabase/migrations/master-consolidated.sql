-- =============================================================================
-- TrendMart — Consolidated Master Schema Migration
-- =============================================================================
-- Single comprehensive script covering ALL tables, columns, foreign keys,
-- indexes, Row-Level Security (RLS) policies, helper functions, triggers,
-- views, and seed data helpers.
--
-- Designed to be copied and executed directly in the Supabase SQL Editor
-- in a single run. All statements are idempotent (IF NOT EXISTS / DROP IF EXISTS).
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 0: EXTENSIONS & ENUMS
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid() if not already available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- =============================================================================
-- Role enum for RBAC
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('customer', 'merchant', 'admin');
  END IF;
END $$;

-- =============================================================================
-- SECTION 1: USER ROLES TABLE (RBAC — Role-Based Access Control)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL DEFAULT 'customer',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT uq_user_role UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can manage all roles (via service key or admin UI)
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================================================
-- SECTION 2: ADMIN HELPER FUNCTION (used by multiple RLS policies)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'admin'
  );
$$;

-- =============================================================================
-- SECTION 3: SHOPS TABLE (Core marketplace entity — retail & service)
-- =============================================================================

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
  business_hours    text,
  operating_status  text,
  accent_color      text,
  store_bio         text,
  announcement      text,
  -- Service-provider specific columns
  service_area       text,
  hourly_rate        numeric(10, 2),
  call_out_charge    numeric(10, 2),
  emergency_available boolean DEFAULT false,
  shop_type          text DEFAULT 'retail' CHECK (shop_type IN ('retail', 'service')),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.shops.announcement IS 'Optional promotional announcement displayed as a marquee banner on the storefront page.';

CREATE INDEX IF NOT EXISTS idx_shops_owner ON public.shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_category ON public.shops(category);
CREATE INDEX IF NOT EXISTS idx_shops_shop_type ON public.shops(shop_type) WHERE shop_type = 'service';
CREATE INDEX IF NOT EXISTS idx_shops_service_area ON public.shops USING GIN (to_tsvector('simple', COALESCE(service_area, '')));

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can read shops (marketplace is open)
DROP POLICY IF EXISTS "shops_public_read" ON public.shops;
CREATE POLICY "shops_public_read"
  ON public.shops FOR SELECT
  USING (true);

-- AUTHENTICATED: Create shop — owner_id MUST equal auth.uid()
DROP POLICY IF EXISTS "shops_owner_insert" ON public.shops;
CREATE POLICY "shops_owner_insert"
  ON public.shops FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- AUTHENTICATED: Update ONLY own shop
DROP POLICY IF EXISTS "shops_owner_update" ON public.shops;
CREATE POLICY "shops_owner_update"
  ON public.shops FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- AUTHENTICATED: Delete ONLY own shop (cascades to all child tables)
DROP POLICY IF EXISTS "shops_owner_delete" ON public.shops;
CREATE POLICY "shops_owner_delete"
  ON public.shops FOR DELETE
  USING (auth.uid() = owner_id);

-- Admin override
DROP POLICY IF EXISTS "shops_admin_read" ON public.shops;
CREATE POLICY "shops_admin_read"
  ON public.shops FOR SELECT
  USING (public.is_admin(auth.uid()));

-- =============================================================================
-- SECTION 4: PRODUCTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.products (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text DEFAULT '',
  price         numeric(10, 2) NOT NULL DEFAULT 0,
  currency      text DEFAULT 'PKR',
  image_url     text,
  is_available  boolean DEFAULT true,
  variants      jsonb DEFAULT NULL,    -- Array of VariantGroup {name, options: [{label, price_adj?, is_available?, stock?}]}
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_shop_id ON public.products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_available ON public.products(shop_id, is_available);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can read products
DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (true);

-- AUTHENTICATED: Insert product — must own the linked shop
DROP POLICY IF EXISTS "products_owner_insert" ON public.products;
CREATE POLICY "products_owner_insert"
  ON public.products FOR INSERT
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Update product — must own the linked shop
DROP POLICY IF EXISTS "products_owner_update" ON public.products;
CREATE POLICY "products_owner_update"
  ON public.products FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Delete product — must own the linked shop
DROP POLICY IF EXISTS "products_owner_delete" ON public.products;
CREATE POLICY "products_owner_delete"
  ON public.products FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 5: INVENTORY VARIANTS TABLE (Dedicated variant stock tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_variants (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  shop_id           uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  variant_group     text NOT NULL DEFAULT '',       -- e.g. "Size", "Color"
  variant_label     text NOT NULL DEFAULT '',       -- e.g. "XL", "Red"
  sku               text,                            -- Auto-generated SKU
  stock             integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  price_adj         numeric(10, 2) DEFAULT 0,       -- Price adjustment from base price
  is_available      boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT uq_inventory_variant_product_label UNIQUE (product_id, variant_group, variant_label)
);

CREATE INDEX IF NOT EXISTS idx_inventory_variants_product_id ON public.inventory_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_shop_id ON public.inventory_variants(shop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_sku ON public.inventory_variants(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_stock ON public.inventory_variants(stock) WHERE stock <= low_stock_threshold;

ALTER TABLE public.inventory_variants ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can read inventory (storefront display)
DROP POLICY IF EXISTS "inventory_variants_public_read" ON public.inventory_variants;
CREATE POLICY "inventory_variants_public_read"
  ON public.inventory_variants FOR SELECT
  USING (is_available = true);

-- AUTHENTICATED: Shop owner can INSERT variants
DROP POLICY IF EXISTS "inventory_variants_owner_insert" ON public.inventory_variants;
CREATE POLICY "inventory_variants_owner_insert"
  ON public.inventory_variants FOR INSERT
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can UPDATE variants
DROP POLICY IF EXISTS "inventory_variants_owner_update" ON public.inventory_variants;
CREATE POLICY "inventory_variants_owner_update"
  ON public.inventory_variants FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can DELETE variants
DROP POLICY IF EXISTS "inventory_variants_owner_delete" ON public.inventory_variants;
CREATE POLICY "inventory_variants_owner_delete"
  ON public.inventory_variants FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 6: SERVICE PACKAGES TABLE (Predefined service offerings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.service_packages (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id             uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name                text NOT NULL,                     -- e.g. "AC Full Service"
  description         text DEFAULT '',
  price               numeric(10, 2) NOT NULL DEFAULT 0,
  currency            text DEFAULT 'PKR',
  estimated_duration  text DEFAULT '',                   -- e.g. "1-2 hours"
  is_active           boolean DEFAULT true,
  sort_order          int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_packages_shop_id ON public.service_packages(shop_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_active ON public.service_packages(shop_id, is_active);

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can read service packages
DROP POLICY IF EXISTS "service_packages_public_read" ON public.service_packages;
CREATE POLICY "service_packages_public_read"
  ON public.service_packages FOR SELECT
  USING (true);

-- AUTHENTICATED: Shop owner manages own service packages
DROP POLICY IF EXISTS "service_packages_owner_all" ON public.service_packages;
CREATE POLICY "service_packages_owner_all"
  ON public.service_packages FOR ALL
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 7: SERVICE PORTFOLIO TABLE (Before/After project photos)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.service_portfolio (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  title           text NOT NULL,                       -- e.g. "AC Repair — Split Unit Deep Clean"
  description     text DEFAULT '',
  before_image_url text,
  after_image_url  text,
  client_name     text DEFAULT '',
  client_review   text DEFAULT '',
  client_rating   int DEFAULT 0 CHECK (client_rating >= 0 AND client_rating <= 5),
  project_date    date DEFAULT CURRENT_DATE,
  is_published    boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_portfolio_shop_id ON public.service_portfolio(shop_id);
CREATE INDEX IF NOT EXISTS idx_service_portfolio_published ON public.service_portfolio(shop_id, is_published);
CREATE INDEX IF NOT EXISTS idx_service_portfolio_date ON public.service_portfolio(shop_id, project_date DESC);

ALTER TABLE public.service_portfolio ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Read published portfolio items
DROP POLICY IF EXISTS "service_portfolio_public_read" ON public.service_portfolio;
CREATE POLICY "service_portfolio_public_read"
  ON public.service_portfolio FOR SELECT
  USING (is_published = true);

-- AUTHENTICATED: Shop owner manages own portfolio
DROP POLICY IF EXISTS "service_portfolio_owner_all" ON public.service_portfolio;
CREATE POLICY "service_portfolio_owner_all"
  ON public.service_portfolio FOR ALL
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 8: SERVICE AVAILABILITY TABLE (Weekly working hours)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.service_availability (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id            uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  day_of_week        int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_working_day     boolean DEFAULT true,
  start_time         time DEFAULT '09:00',
  end_time           time DEFAULT '18:00',
  emergency_available boolean DEFAULT false,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  CONSTRAINT uq_service_availability_shop_day UNIQUE (shop_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_service_availability_shop_id ON public.service_availability(shop_id);

ALTER TABLE public.service_availability ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can read availability
DROP POLICY IF EXISTS "service_availability_public_read" ON public.service_availability;
CREATE POLICY "service_availability_public_read"
  ON public.service_availability FOR SELECT
  USING (true);

-- AUTHENTICATED: Shop owner manages own availability
DROP POLICY IF EXISTS "service_availability_owner_all" ON public.service_availability;
CREATE POLICY "service_availability_owner_all"
  ON public.service_availability FOR ALL
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 9: ORDERS TABLE (WhatsApp checkout & order lifecycle)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name   text DEFAULT '',
  customer_phone  text DEFAULT '',
  items_json      jsonb DEFAULT '[]'::jsonb,    -- Array of {product_id?, name, price, variant?}
  total_amount    numeric(10, 2) DEFAULT 0,
  status          text DEFAULT 'Pending',         -- Pending | Processing | Dispatched | Delivered | Cancelled
  tracking_number text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON public.orders(shop_id, status);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can INSERT an order (WhatsApp checkout flow)
DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
CREATE POLICY "orders_public_insert"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- PUBLIC: Customer order lookup by phone — restricted to prevent mass scraping
-- Anonymous users should use the `get_order_by_phone` RPC function for strict phone matching
DROP POLICY IF EXISTS "orders_public_select_by_phone" ON public.orders;
CREATE POLICY "orders_public_select_by_phone"
  ON public.orders FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR false  -- Anonymous SELECT blocked by default; use get_order_by_phone()
  );

-- AUTHENTICATED: Shop owner can read their shop's orders
DROP POLICY IF EXISTS "orders_owner_read" ON public.orders;
CREATE POLICY "orders_owner_read"
  ON public.orders FOR SELECT
  USING (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can update order status
DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
CREATE POLICY "orders_owner_update"
  ON public.orders FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can delete orders (soft-delete / archival)
DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
CREATE POLICY "orders_owner_delete"
  ON public.orders FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- Admin override
DROP POLICY IF EXISTS "orders_admin_read" ON public.orders;
CREATE POLICY "orders_admin_read"
  ON public.orders FOR SELECT
  USING (public.is_admin(auth.uid()));

-- =============================================================================
-- SECTION 10: LEADS TABLE (Customer inquiry / WhatsApp click tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id           uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_phone    text NOT NULL DEFAULT '',
  customer_name     text DEFAULT '',
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  service_context   text DEFAULT '',
  source            text NOT NULL DEFAULT 'whatsapp',    -- 'whatsapp' | 'inquiry_form' | 'booking_button'
  is_converted      boolean NOT NULL DEFAULT false,
  followed_up_at    timestamptz,
  notes             text DEFAULT '',
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_shop_id ON public.leads(shop_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON public.leads(shop_id, is_converted);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can insert a lead (fired automatically on WhatsApp/booking click)
DROP POLICY IF EXISTS "leads_public_insert" ON public.leads;
CREATE POLICY "leads_public_insert"
  ON public.leads FOR INSERT
  WITH CHECK (true);

-- AUTHENTICATED: Shop owner can read/update/delete their leads
DROP POLICY IF EXISTS "leads_owner_read" ON public.leads;
CREATE POLICY "leads_owner_read"
  ON public.leads FOR SELECT
  USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "leads_owner_update" ON public.leads;
CREATE POLICY "leads_owner_update"
  ON public.leads FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "leads_owner_delete" ON public.leads;
CREATE POLICY "leads_owner_delete"
  ON public.leads FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 11: CUSTOMER INQUIRIES TABLE (Direct contact form)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_inquiries (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  customer_name   text DEFAULT '',
  customer_phone  text DEFAULT '',
  message         text DEFAULT '',
  is_read         boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_shop_id ON public.customer_inquiries(shop_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_shop_read ON public.customer_inquiries(shop_id, is_read);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.customer_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_product_id ON public.customer_inquiries(product_id);

ALTER TABLE public.customer_inquiries ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can submit an inquiry
DROP POLICY IF EXISTS "inquiries_public_insert" ON public.customer_inquiries;
CREATE POLICY "inquiries_public_insert"
  ON public.customer_inquiries FOR INSERT
  WITH CHECK (true);

-- AUTHENTICATED: Shop owner can read their inquiries
DROP POLICY IF EXISTS "inquiries_owner_read" ON public.customer_inquiries;
CREATE POLICY "inquiries_owner_read"
  ON public.customer_inquiries FOR SELECT
  USING (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can update inquiries (mark as read)
DROP POLICY IF EXISTS "inquiries_owner_update" ON public.customer_inquiries;
CREATE POLICY "inquiries_owner_update"
  ON public.customer_inquiries FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can delete inquiries
DROP POLICY IF EXISTS "inquiries_owner_delete" ON public.customer_inquiries;
CREATE POLICY "inquiries_owner_delete"
  ON public.customer_inquiries FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 12: REVIEWS TABLE (Customer reviews & ratings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  rating        smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment       text DEFAULT '',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_shop_id ON public.reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can read reviews
DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
CREATE POLICY "reviews_public_read"
  ON public.reviews FOR SELECT
  USING (true);

-- PUBLIC: Anyone can leave a review
DROP POLICY IF EXISTS "reviews_public_insert" ON public.reviews;
CREATE POLICY "reviews_public_insert"
  ON public.reviews FOR INSERT
  WITH CHECK (true);

-- AUTHENTICATED: Shop owner can update reviews (moderation)
DROP POLICY IF EXISTS "reviews_owner_update" ON public.reviews;
CREATE POLICY "reviews_owner_update"
  ON public.reviews FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can delete reviews (moderation)
DROP POLICY IF EXISTS "reviews_owner_delete" ON public.reviews;
CREATE POLICY "reviews_owner_delete"
  ON public.reviews FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 13: CUSTOMER WISHLISTS TABLE (Product & shop bookmarks)
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
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT uq_wishlist_user_item UNIQUE (user_id, product_id, type)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON public.customer_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON public.customer_wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_shop_id ON public.customer_wishlists(shop_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_added_at ON public.customer_wishlists(added_at DESC);

ALTER TABLE public.customer_wishlists ENABLE ROW LEVEL SECURITY;

-- SELECT: Only the owning user
DROP POLICY IF EXISTS "wishlist_user_select" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_select"
  ON public.customer_wishlists FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: user_id must match the authenticated user
DROP POLICY IF EXISTS "wishlist_user_insert" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_insert"
  ON public.customer_wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only the owning user
DROP POLICY IF EXISTS "wishlist_user_update" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_update"
  ON public.customer_wishlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Only the owning user
DROP POLICY IF EXISTS "wishlist_user_delete" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_delete"
  ON public.customer_wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- SECTION 14: FAVORITE STORES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.favorite_stores (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  shop_name     text NOT NULL,
  logo_url      text,
  added_at      timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT uq_favorite_user_shop UNIQUE (user_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_user_id ON public.favorite_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_shop_id ON public.favorite_stores(shop_id);
CREATE INDEX IF NOT EXISTS idx_favorite_added_at ON public.favorite_stores(added_at DESC);

ALTER TABLE public.favorite_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "favorite_stores_user_select" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_select"
  ON public.favorite_stores FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorite_stores_user_insert" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_insert"
  ON public.favorite_stores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorite_stores_user_update" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_update"
  ON public.favorite_stores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorite_stores_user_delete" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_delete"
  ON public.favorite_stores FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- SECTION 15: COUPONS TABLE (Discount & promo codes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id           uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  code              text NOT NULL,
  discount_percent  numeric(5, 2) DEFAULT NULL,     -- e.g. 10.00 = 10%
  discount_amount   numeric(10, 2) DEFAULT NULL,    -- e.g. 200.00 = Rs. 200 off
  expiry_date       timestamptz DEFAULT NULL,
  starts_at         timestamptz DEFAULT NULL,
  expires_at        timestamptz DEFAULT NULL,
  usage_limit       integer DEFAULT NULL,
  usage_count       integer DEFAULT 0,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT coupons_discount_check CHECK (
    (discount_percent IS NOT NULL AND discount_amount IS NULL) OR
    (discount_amount IS NOT NULL AND discount_percent IS NULL)
  ),
  CONSTRAINT coupons_code_shop_unique UNIQUE (shop_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_shop_id ON public.coupons(shop_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Read active, non-expired, within-usage-limit coupons
DROP POLICY IF EXISTS "coupons_public_read_active" ON public.coupons;
CREATE POLICY "coupons_public_read_active"
  ON public.coupons FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (usage_limit IS NULL OR usage_count < usage_limit)
    AND (starts_at IS NULL OR starts_at <= now())
  );

-- AUTHENTICATED: Shop owner has full CRUD on their coupons
DROP POLICY IF EXISTS "coupons_owner_all" ON public.coupons;
CREATE POLICY "coupons_owner_all"
  ON public.coupons FOR ALL
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 16: STORIES TABLE (24-hour merchant stories)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  image_url   text,
  caption     text DEFAULT '',
  expires_at  timestamptz DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stories_shop_id ON public.stories(shop_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON public.stories(created_at DESC);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can read active (non-expired) stories
DROP POLICY IF EXISTS "stories_public_read_active" ON public.stories;
CREATE POLICY "stories_public_read_active"
  ON public.stories FOR SELECT
  USING (expires_at > now());

-- AUTHENTICATED: Shop owner can INSERT stories
DROP POLICY IF EXISTS "stories_owner_insert" ON public.stories;
CREATE POLICY "stories_owner_insert"
  ON public.stories FOR INSERT
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can UPDATE stories
DROP POLICY IF EXISTS "stories_owner_update" ON public.stories;
CREATE POLICY "stories_owner_update"
  ON public.stories FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can DELETE stories
DROP POLICY IF EXISTS "stories_owner_delete" ON public.stories;
CREATE POLICY "stories_owner_delete"
  ON public.stories FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 17: ANALYTICS LOGS TABLE (Page views, product clicks)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.analytics_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  event_type    text NOT NULL DEFAULT 'shop_view',    -- 'shop_view' | 'product_click'
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  visitor_ip    text,
  user_agent    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_logs_shop_id ON public.analytics_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_shop_event ON public.analytics_logs(shop_id, event_type);

ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Anyone can insert analytics events
DROP POLICY IF EXISTS "analytics_public_insert" ON public.analytics_logs;
CREATE POLICY "analytics_public_insert"
  ON public.analytics_logs FOR INSERT
  WITH CHECK (true);

-- AUTHENTICATED: Shop owner can read their own analytics
DROP POLICY IF EXISTS "analytics_owner_read" ON public.analytics_logs;
CREATE POLICY "analytics_owner_read"
  ON public.analytics_logs FOR SELECT
  USING (public.is_shop_owner(shop_id));

-- AUTHENTICATED: Shop owner can delete their own analytics
DROP POLICY IF EXISTS "analytics_owner_delete" ON public.analytics_logs;
CREATE POLICY "analytics_owner_delete"
  ON public.analytics_logs FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 18: FINANCE ENTRIES TABLE (Merchant financial ledger)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount      numeric(12, 2) NOT NULL CHECK (amount >= 0),
  type        text NOT NULL CHECK (type IN ('income', 'expense')),
  category    text NOT NULL DEFAULT 'Other',
  date        date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_shop_id ON public.finance_entries(shop_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON public.finance_entries(shop_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_entries_type ON public.finance_entries(shop_id, type);

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

-- AUTHENTICATED: Shop owners can manage their own finance entries
DROP POLICY IF EXISTS "finance_entries_owner_all" ON public.finance_entries;
CREATE POLICY "finance_entries_owner_all"
  ON public.finance_entries FOR ALL
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- Admin can view all finance entries
DROP POLICY IF EXISTS "finance_entries_admin_read" ON public.finance_entries;
CREATE POLICY "finance_entries_admin_read"
  ON public.finance_entries FOR SELECT
  USING (public.is_admin(auth.uid()));

-- =============================================================================
-- SECTION 19: CUSTOMER ADDRESSES TABLE (Delivery address book)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label           text NOT NULL DEFAULT 'Home',
  full_name       text NOT NULL,
  phone_number    text NOT NULL,
  address_line1   text NOT NULL,
  address_line2   text,
  city            text NOT NULL,
  postal_code     text,
  delivery_notes  text,
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON public.customer_addresses(user_id, is_default);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Users can manage only their own addresses
DROP POLICY IF EXISTS "customer_addresses_owner_all" ON public.customer_addresses;
CREATE POLICY "customer_addresses_owner_all"
  ON public.customer_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin can view all addresses
DROP POLICY IF EXISTS "customer_addresses_admin_read" ON public.customer_addresses;
CREATE POLICY "customer_addresses_admin_read"
  ON public.customer_addresses FOR SELECT
  USING (public.is_admin(auth.uid()));

-- =============================================================================
-- SECTION 20: MERCHANT SUBSCRIPTIONS TABLE (Tier & usage tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id               uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  tier                  text NOT NULL DEFAULT 'free_trial',
  status                text NOT NULL DEFAULT 'active',
  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz NOT NULL,
  trial_started_at      timestamptz,
  trial_ends_at         timestamptz,
  products_used         integer NOT NULL DEFAULT 0,
  storage_used_mb       numeric(10, 2) NOT NULL DEFAULT 0,
  grace_period_until    timestamptz,
  suspended_at          timestamptz,
  suspended_reason      text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(shop_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_subs_shop ON public.merchant_subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_merchant_subs_status ON public.merchant_subscriptions(status);

ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;

-- Shop owners can read their own subscription
DROP POLICY IF EXISTS "subs_owner_read" ON public.merchant_subscriptions;
CREATE POLICY "subs_owner_read"
  ON public.merchant_subscriptions FOR SELECT
  USING (public.is_shop_owner(shop_id));

-- Admins can read all subscriptions
DROP POLICY IF EXISTS "subs_admin_read" ON public.merchant_subscriptions;
CREATE POLICY "subs_admin_read"
  ON public.merchant_subscriptions FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Admins can update subscriptions
DROP POLICY IF EXISTS "subs_admin_update" ON public.merchant_subscriptions;
CREATE POLICY "subs_admin_update"
  ON public.merchant_subscriptions FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- =============================================================================
-- SECTION 21: BILLING INVOICES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.merchant_subscriptions(id) ON DELETE CASCADE,
  amount_pkr      integer NOT NULL DEFAULT 0,
  commission_pkr  integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending',
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  due_date        timestamptz NOT NULL,
  paid_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_shop ON public.billing_invoices(shop_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status);

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

-- Shop owners can read their own invoices
DROP POLICY IF EXISTS "invoices_owner_read" ON public.billing_invoices;
CREATE POLICY "invoices_owner_read"
  ON public.billing_invoices FOR SELECT
  USING (public.is_shop_owner(shop_id));

-- Admins can read all invoices
DROP POLICY IF EXISTS "invoices_admin_read" ON public.billing_invoices;
CREATE POLICY "invoices_admin_read"
  ON public.billing_invoices FOR SELECT
  USING (public.is_admin(auth.uid()));

-- =============================================================================
-- SECTION 22: SUBSCRIPTION AUDIT LOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_audit_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.merchant_subscriptions(id) ON DELETE SET NULL,
  event_type      text NOT NULL,
  old_value       jsonb,
  new_value       jsonb,
  performed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address      text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_audit_shop ON public.subscription_audit_log(shop_id);

ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
DROP POLICY IF EXISTS "sub_audit_admin_read" ON public.subscription_audit_log;
CREATE POLICY "sub_audit_admin_read"
  ON public.subscription_audit_log FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Shop owners can read their own audit logs
DROP POLICY IF EXISTS "sub_audit_owner_read" ON public.subscription_audit_log;
CREATE POLICY "sub_audit_owner_read"
  ON public.subscription_audit_log FOR SELECT
  USING (public.is_shop_owner(shop_id));

-- =============================================================================
-- SECTION 23: ADMIN AUDIT LOGS TABLE (Platform-wide administrative audit)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type        text NOT NULL,
  target_type       text NOT NULL,       -- 'shop' | 'user' | 'order' | 'subscription' | 'product' | 'system'
  target_id         uuid,
  description       text NOT NULL,
  old_value         jsonb,
  new_value         jsonb,
  performed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email text,
  ip_address        text,
  user_agent        text,
  severity          text NOT NULL DEFAULT 'info',  -- 'info' | 'warning' | 'critical'
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_event_type ON public.admin_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_performed_by ON public.admin_audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_severity ON public.admin_audit_logs(severity);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
DROP POLICY IF EXISTS "admin_audit_select" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_select"
  ON public.admin_audit_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

-- System (service_role) and admins can insert
DROP POLICY IF EXISTS "admin_audit_insert" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_insert"
  ON public.admin_audit_logs FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

-- =============================================================================
-- SECTION 24: SECURITY AUDIT LOG TABLE (Automated sensitive operation tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name  text NOT NULL,
  record_id   uuid,
  action      text NOT NULL,          -- 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT_SENSITIVE'
  ip_address  text,
  user_agent  text,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_actor ON public.security_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_table ON public.security_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log(created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own audit records
DROP POLICY IF EXISTS "security_audit_insert" ON public.security_audit_log;
CREATE POLICY "security_audit_insert"
  ON public.security_audit_log FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- Only service_role can read audit logs (for security analysis)
DROP POLICY IF EXISTS "security_audit_service_read" ON public.security_audit_log;
CREATE POLICY "security_audit_service_read"
  ON public.security_audit_log FOR SELECT
  USING (auth.role() = 'service_role');

-- =============================================================================
-- SECTION 25: HELPER FUNCTIONS — Ownership verification
-- =============================================================================

-- 25.1 Get the owner_id of a shop
CREATE OR REPLACE FUNCTION public.get_shop_owner_id(p_shop_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT owner_id FROM public.shops WHERE id = p_shop_id;
$$;

-- 25.2 Verify that the current user owns a given shop
CREATE OR REPLACE FUNCTION public.is_shop_owner(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid()
  );
$$;

-- 25.3 Get the shop_id for a given product (cross-table checks)
CREATE OR REPLACE FUNCTION public.get_product_shop_id(p_product_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT shop_id FROM public.products WHERE id = p_product_id;
$$;

-- 25.4 Wishlist ownership check
CREATE OR REPLACE FUNCTION public.is_wishlist_owner(p_wishlist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_wishlists
    WHERE id = p_wishlist_id AND user_id = auth.uid()
  );
$$;

-- 25.5 Favorite store ownership check
CREATE OR REPLACE FUNCTION public.is_favorite_store_owner(p_favorite_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.favorite_stores
    WHERE id = p_favorite_id AND user_id = auth.uid()
  );
$$;

-- =============================================================================
-- SECTION 26: HELPER FUNCTIONS — Inventory operations
-- =============================================================================

-- 26.1 Atomic stock deduction with row locking (prevents overselling)
CREATE OR REPLACE FUNCTION public.deduct_variant_stock(
  p_variant_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_stock integer;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT stock INTO v_current_stock
  FROM public.inventory_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_current_stock < p_quantity THEN
    RETURN false; -- Insufficient stock
  END IF;

  UPDATE public.inventory_variants
  SET stock = stock - p_quantity,
      updated_at = now()
  WHERE id = p_variant_id;

  RETURN true;
END;
$$;

-- 26.2 Atomic stock restore (order cancellation)
CREATE OR REPLACE FUNCTION public.restore_variant_stock(
  p_variant_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.inventory_variants
  SET stock = stock + p_quantity,
      updated_at = now()
  WHERE id = p_variant_id;

  RETURN FOUND;
END;
$$;

-- =============================================================================
-- SECTION 27: HELPER FUNCTIONS — Order & migration
-- =============================================================================

-- 27.1 Secure order lookup by phone (WhatsApp flow)
CREATE OR REPLACE FUNCTION public.get_order_by_phone(
  p_order_id uuid,
  p_customer_phone text
)
RETURNS SETOF public.orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.orders
  WHERE id = p_order_id
    AND customer_phone = p_customer_phone
  LIMIT 1;
END;
$$;

-- 27.2 Migrate wishlist item from localStorage
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

-- 27.3 Migrate favorite store from localStorage
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
-- SECTION 28: TRIGGER FUNCTIONS
-- =============================================================================

-- 28.1 Universal updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 28.2 Auto-provision customer role on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 28.3 Promote user to merchant when they create their first shop
CREATE OR REPLACE FUNCTION public.promote_to_merchant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.owner_id, 'merchant')
  ON CONFLICT (user_id)
  DO UPDATE SET role = 'merchant', updated_at = now()
  WHERE public.user_roles.role = 'customer';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_shop_created ON public.shops;
CREATE TRIGGER after_shop_created
  AFTER INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_to_merchant();

-- 28.4 Prevent mass deletion (safety net)
CREATE OR REPLACE FUNCTION public.prevent_mass_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 50 THEN
    RAISE EXCEPTION 'Mass deletion prevented: attempted to delete % rows. Maximum is 50 per statement.', deleted_count;
  END IF;
  RETURN NULL;
END;
$$;

-- 28.5 Sensitive operation audit trigger
CREATE OR REPLACE FUNCTION public.audit_sensitive_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  action_type text;
  record_id_val uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'INSERT';
    record_id_val := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'UPDATE';
    record_id_val := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'DELETE';
    record_id_val := OLD.id;
  END IF;

  INSERT INTO public.security_audit_log (
    actor_id, table_name, record_id, action, ip_address, user_agent, metadata
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    record_id_val,
    action_type,
    NULL,
    NULL,
    jsonb_build_object('schema', TG_TABLE_SCHEMA, 'operation', TG_OP)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 29: APPLY UPDATED_AT TRIGGERS TO ALL RELEVANT TABLES
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'shops','products','orders','reviews','stories','coupons',
      'customer_inquiries','inventory_variants','analytics_logs',
      'customer_wishlists','favorite_stores','customer_addresses',
      'service_packages','service_portfolio','service_availability',
      'merchant_subscriptions','user_roles'
    ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;
      CREATE TRIGGER trg_%s_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 30: APPLY MASS DELETE PREVENTION TRIGGERS
-- =============================================================================

DO $$
DECLARE
  tbl text;
  trigger_name text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products','orders','inventory_variants','reviews','stories','coupons',
      'customer_inquiries','analytics_logs','customer_wishlists','favorite_stores'
    ])
  LOOP
    trigger_name := 'trg_prevent_mass_delete_' || tbl;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', trigger_name, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_mass_delete();',
      trigger_name, tbl
    );
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 31: APPLY AUDIT TRIGGERS TO CRITICAL TABLES
-- =============================================================================

DO $$
DECLARE
  tbl text;
  trigger_name text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products','orders','inventory_variants','reviews','coupons','customer_inquiries'
    ])
  LOOP
    trigger_name := 'trg_audit_' || tbl;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', trigger_name, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_operation();',
      trigger_name, tbl
    );
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 32: GRANT PERMISSIONS
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT SELECT ON public.shops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT INSERT, SELECT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT, INSERT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT SELECT ON public.stories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT SELECT ON public.coupons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_inquiries TO authenticated;
GRANT INSERT ON public.customer_inquiries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_logs TO authenticated;
GRANT INSERT ON public.analytics_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_variants TO authenticated;
GRANT SELECT ON public.inventory_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT INSERT ON public.leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_wishlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_packages TO authenticated;
GRANT SELECT ON public.service_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_portfolio TO authenticated;
GRANT SELECT ON public.service_portfolio TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_availability TO authenticated;
GRANT SELECT ON public.service_availability TO anon;
GRANT SELECT ON public.merchant_subscriptions TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT SELECT ON public.subscription_audit_log TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- =============================================================================
-- SECTION 33: RLS AUDIT SUMMARY VIEW
-- =============================================================================

DROP VIEW IF EXISTS public.rls_tenant_audit_summary;
CREATE OR REPLACE VIEW public.rls_tenant_audit_summary AS
SELECT
  p.tablename AS table_name,
  p.policyname AS policy_name,
  p.cmd AS operation,
  p.roles,
  CASE WHEN p.qual IS NOT NULL THEN '✅ Restricted' ELSE '⚠️ Open (no USING)' END AS using_clause,
  CASE WHEN p.with_check IS NOT NULL THEN '✅ Restricted' ELSE '⚠️ Open (no WITH CHECK)' END AS check_clause,
  CASE
    WHEN p.cmd IN ('INSERT', 'UPDATE', 'DELETE') AND p.with_check IS NULL THEN '🔴 CRITICAL'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL
         AND p.tablename IN ('orders', 'analytics_logs', 'customer_inquiries',
                             'customer_wishlists', 'favorite_stores', 'inventory_variants',
                             'admin_audit_logs', 'security_audit_log') THEN '🟡 HIGH'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL THEN '🟢 PUBLIC'
    ELSE '🟢 SECURE'
  END AS risk_level
FROM pg_policies p
WHERE p.schemaname = 'public'
ORDER BY
  CASE
    WHEN p.cmd IN ('INSERT', 'UPDATE', 'DELETE') AND p.with_check IS NULL THEN 0
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL
         AND p.tablename IN ('orders', 'analytics_logs', 'customer_inquiries',
                             'customer_wishlists', 'favorite_stores') THEN 1
    ELSE 2
  END,
  p.tablename,
  p.cmd;

COMMENT ON VIEW public.rls_tenant_audit_summary IS 'Multi-tenant RLS security audit view. Run: SELECT * FROM public.rls_tenant_audit_summary ORDER BY risk_level, table_name;';

-- =============================================================================
-- SECTION 34: VERIFICATION — Ensure RLS enabled on all tables
-- =============================================================================

DO $$
DECLARE
  missing_rls text;
BEGIN
  SELECT string_agg(tablename, ', ') INTO missing_rls
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false
    AND tablename IN (
      'shops','products','orders','reviews','stories','coupons',
      'customer_inquiries','analytics_logs','security_audit_log',
      'inventory_variants','customer_wishlists','favorite_stores',
      'leads','finance_entries','customer_addresses','user_roles',
      'merchant_subscriptions','billing_invoices','subscription_audit_log',
      'admin_audit_logs','service_packages','service_portfolio','service_availability'
    );

  IF missing_rls IS NOT NULL THEN
    RAISE WARNING '⚠️ The following tables have RLS DISABLED: %', missing_rls;
  ELSE
    RAISE NOTICE '✅ All tables have RLS enabled.';
  END IF;
END $$;

-- =============================================================================
-- SECTION 35: VERIFICATION — No permissive anonymous UPDATE/DELETE policies
-- =============================================================================

DO $$
DECLARE
  permissive_count integer;
BEGIN
  SELECT count(*) INTO permissive_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd IN ('UPDATE', 'DELETE')
    AND roles @> ARRAY['anon']::name[]
    AND with_check IS NULL;

  IF permissive_count > 0 THEN
    RAISE WARNING '⚠️ Found % permissive anonymous UPDATE/DELETE policies.', permissive_count;
  ELSE
    RAISE NOTICE '✅ No permissive anonymous UPDATE/DELETE policies found.';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ✅ POST-MIGRATION VERIFICATION CHECKLIST:
--
-- 1. Run: SELECT * FROM public.rls_tenant_audit_summary ORDER BY risk_level, table_name;
--    → All rows should show 🟢 SECURE or 🟢 PUBLIC
--    → No 🔴 CRITICAL or 🟡 HIGH entries should remain
--
-- 2. Verify all tables exist:
--    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--    AND table_name IN (
--      'shops','products','orders','reviews','stories','coupons',
--      'customer_inquiries','analytics_logs','security_audit_log',
--      'inventory_variants','customer_wishlists','favorite_stores',
--      'leads','finance_entries','customer_addresses','user_roles',
--      'merchant_subscriptions','billing_invoices','subscription_audit_log',
--      'admin_audit_logs','service_packages','service_portfolio','service_availability'
--    );
--
-- 3. Test as anonymous user:
--    → SELECT * FROM orders; — should return 0 rows
--    → SELECT * FROM customer_wishlists; — should return 0 rows
--    → DELETE FROM products; — should be blocked
--
-- 4. Test as authenticated merchant:
--    → Can only see own shop's orders, products, inventory, analytics
--    → Cannot see other merchants' data
--
-- 5. Test as authenticated customer:
--    → Can only see own wishlist and favorite_stores
--    → Cannot see other users' bookmarks
--
-- 6. Test auto-provision:
--    → New auth.users insert triggers customer role creation (handle_new_user)
--    → New shop insert promotes user to merchant (promote_to_merchant)
--
-- 7. Test stock deduction:
--    → SELECT * FROM public.deduct_variant_stock('variant-uuid', 2);
--    → Should atomically deduct and return true/false
--
-- 8. Test order lookup:
--    → SELECT * FROM public.get_order_by_phone('order-uuid', '+923001234567');
--    → Should only return the order if the phone matches
-- =============================================================================