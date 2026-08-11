-- TrendMart: 01a_core_roles_shops_orders.sql
-- Run in Supabase SQL Editor. If Failed to fetch: refresh, wait, retry this file only.

BEGIN;

-- =============================================================================
-- SECTION 0: EXTENSIONS & ENUMS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

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

-- Safety net: if this table already existed from an older/partial migration,
-- make sure every column this script (and the app) expects is present.
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'customer';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================================================
-- SECTION 2: ADMIN HELPER FUNCTION (used by multiple RLS policies)
-- Must exist BEFORE any policy that checks admin status on user_roles itself.
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

DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

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

-- Safety net: backfill any columns missing from an older/partial "shops" table.
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS instagram_handle text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS business_hours text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS operating_status text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS accent_color text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS store_bio text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS announcement text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS announcement_expires_at timestamptz DEFAULT NULL;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2);
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS call_out_charge numeric(10, 2);
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS emergency_available boolean DEFAULT false;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_type text DEFAULT 'retail';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.shops.announcement IS 'Optional promotional announcement displayed as a marquee banner on the storefront page.';

CREATE INDEX IF NOT EXISTS idx_shops_owner ON public.shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_category ON public.shops(category);
CREATE INDEX IF NOT EXISTS idx_shops_shop_type ON public.shops(shop_type) WHERE shop_type = 'service';
CREATE INDEX IF NOT EXISTS idx_shops_service_area ON public.shops USING GIN (to_tsvector('simple', COALESCE(service_area, '')));

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shops_public_read" ON public.shops;
CREATE POLICY "shops_public_read"
  ON public.shops FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "shops_owner_insert" ON public.shops;
CREATE POLICY "shops_owner_insert"
  ON public.shops FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "shops_owner_update" ON public.shops;
CREATE POLICY "shops_owner_update"
  ON public.shops FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "shops_owner_delete" ON public.shops;
CREATE POLICY "shops_owner_delete"
  ON public.shops FOR DELETE
  USING (auth.uid() = owner_id);

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

-- Safety net: backfill any columns missing from an older/partial "products" table.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PKR';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variants jsonb DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_products_shop_id ON public.products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_available ON public.products(shop_id, is_available);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "products_owner_insert" ON public.products;
CREATE POLICY "products_owner_insert"
  ON public.products FOR INSERT
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "products_owner_update" ON public.products;
CREATE POLICY "products_owner_update"
  ON public.products FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "inventory_variants" table.
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS variant_group text NOT NULL DEFAULT '';
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS variant_label text NOT NULL DEFAULT '';
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS price_adj numeric(10, 2) DEFAULT 0;
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_variants ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_inventory_variants_product_id ON public.inventory_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_shop_id ON public.inventory_variants(shop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_sku ON public.inventory_variants(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_stock ON public.inventory_variants(stock) WHERE stock <= low_stock_threshold;

ALTER TABLE public.inventory_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_variants_public_read" ON public.inventory_variants;
CREATE POLICY "inventory_variants_public_read"
  ON public.inventory_variants FOR SELECT
  USING (is_available = true);

DROP POLICY IF EXISTS "inventory_variants_owner_insert" ON public.inventory_variants;
CREATE POLICY "inventory_variants_owner_insert"
  ON public.inventory_variants FOR INSERT
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "inventory_variants_owner_update" ON public.inventory_variants;
CREATE POLICY "inventory_variants_owner_update"
  ON public.inventory_variants FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "service_packages" table.
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS price numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PKR';
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS estimated_duration text DEFAULT '';
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_service_packages_shop_id ON public.service_packages(shop_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_active ON public.service_packages(shop_id, is_active);

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_packages_public_read" ON public.service_packages;
CREATE POLICY "service_packages_public_read"
  ON public.service_packages FOR SELECT
  USING (true);

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

-- Safety net: backfill any columns missing from an older/partial "service_portfolio" table.
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS before_image_url text;
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS after_image_url text;
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS client_name text DEFAULT '';
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS client_review text DEFAULT '';
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS client_rating int DEFAULT 0;
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS project_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true;
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.service_portfolio ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_service_portfolio_shop_id ON public.service_portfolio(shop_id);
CREATE INDEX IF NOT EXISTS idx_service_portfolio_published ON public.service_portfolio(shop_id, is_published);
CREATE INDEX IF NOT EXISTS idx_service_portfolio_date ON public.service_portfolio(shop_id, project_date DESC);

ALTER TABLE public.service_portfolio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_portfolio_public_read" ON public.service_portfolio;
CREATE POLICY "service_portfolio_public_read"
  ON public.service_portfolio FOR SELECT
  USING (is_published = true);

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

-- Safety net: backfill any columns missing from an older/partial "service_availability" table.
ALTER TABLE public.service_availability ADD COLUMN IF NOT EXISTS is_working_day boolean DEFAULT true;
ALTER TABLE public.service_availability ADD COLUMN IF NOT EXISTS start_time time DEFAULT '09:00';
ALTER TABLE public.service_availability ADD COLUMN IF NOT EXISTS end_time time DEFAULT '18:00';
ALTER TABLE public.service_availability ADD COLUMN IF NOT EXISTS emergency_available boolean DEFAULT false;
ALTER TABLE public.service_availability ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.service_availability ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_service_availability_shop_id ON public.service_availability(shop_id);

ALTER TABLE public.service_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_availability_public_read" ON public.service_availability;
CREATE POLICY "service_availability_public_read"
  ON public.service_availability FOR SELECT
  USING (true);

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

-- Safety net: backfill any columns missing from an older/partial "orders" table.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items_json jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'Pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON public.orders(shop_id, status);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
CREATE POLICY "orders_public_insert"
  ON public.orders FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "orders_public_select_by_phone" ON public.orders;
CREATE POLICY "orders_public_select_by_phone"
  ON public.orders FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR false  -- Anonymous SELECT blocked by default; use get_order_by_phone()
  );

DROP POLICY IF EXISTS "orders_owner_read" ON public.orders;
CREATE POLICY "orders_owner_read"
  ON public.orders FOR SELECT
  USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
CREATE POLICY "orders_owner_update"
  ON public.orders FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
CREATE POLICY "orders_owner_delete"
  ON public.orders FOR DELETE
  USING (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "leads" table
-- (e.g. an earlier version of this table only had customer_name/customer_phone/
-- source/metadata and was missing is_converted, product_id, etc.)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_phone text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS service_context text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'whatsapp';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_converted boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS followed_up_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_leads_shop_id ON public.leads(shop_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON public.leads(shop_id, is_converted);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_public_insert" ON public.leads;
CREATE POLICY "leads_public_insert"
  ON public.leads FOR INSERT
  WITH CHECK (true);

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

-- Safety net: backfill any columns missing from an older/partial "customer_inquiries" table.
ALTER TABLE public.customer_inquiries ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.customer_inquiries ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';
ALTER TABLE public.customer_inquiries ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT '';
ALTER TABLE public.customer_inquiries ADD COLUMN IF NOT EXISTS message text DEFAULT '';
ALTER TABLE public.customer_inquiries ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.customer_inquiries ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.customer_inquiries ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_inquiries_shop_id ON public.customer_inquiries(shop_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_shop_read ON public.customer_inquiries(shop_id, is_read);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.customer_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_product_id ON public.customer_inquiries(product_id);

ALTER TABLE public.customer_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inquiries_public_insert" ON public.customer_inquiries;
CREATE POLICY "inquiries_public_insert"
  ON public.customer_inquiries FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "inquiries_owner_read" ON public.customer_inquiries;
CREATE POLICY "inquiries_owner_read"
  ON public.customer_inquiries FOR SELECT
  USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "inquiries_owner_update" ON public.customer_inquiries;
CREATE POLICY "inquiries_owner_update"
  ON public.customer_inquiries FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "reviews" table.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS comment text DEFAULT '';
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_reviews_shop_id ON public.reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
CREATE POLICY "reviews_public_read"
  ON public.reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "reviews_public_insert" ON public.reviews;
CREATE POLICY "reviews_public_insert"
  ON public.reviews FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "reviews_owner_update" ON public.reviews;
CREATE POLICY "reviews_owner_update"
  ON public.reviews FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "reviews_owner_delete" ON public.reviews;
CREATE POLICY "reviews_owner_delete"
  ON public.reviews FOR DELETE
  USING (public.is_shop_owner(shop_id));


COMMIT;
