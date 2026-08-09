-- =============================================================================
-- TrendMart — COMPLETE DATABASE SETUP (single file, run once in Supabase)
-- =============================================================================
--
-- HOW TO USE
-- ----------
--   1. Open your Supabase project → SQL Editor → "New query"
--   2. Paste this ENTIRE file, then click "Run"
--   3. Wait for it to finish (a few seconds) — you should see
--      "Success. No rows returned" with some NOTICE/WARNING lines above it.
--   4. Done. Every table, function, trigger, RLS policy this app needs exists.
--
-- IF YOU SEE: Failed to fetch (api.supabase.com)
--   The dashboard timed out on this large paste (network / size). Do NOT panic.
--   Instead run the smaller files in order from:
--     supabase/sql-parts/   (see README.md there)
--   Then run: supabase/RESET_CLEAN_START_4_MERCHANTS.sql
--
-- This script is 100% idempotent — every statement uses
-- IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS, so it is
-- completely safe to paste and run again (e.g. after pulling new app code)
-- without duplicating data or throwing errors.
--
-- It merges, in dependency order, everything previously spread across
-- supabase/migrations/*.sql:
--   PART 1  Core schema   (shops, products, orders, reviews, wishlists,
--           coupons, stories, analytics, service-provider tables,
--           finance ledger, customer addresses, subscriptions, audit logs)
--   PART 2  Sub-categories + product markdown-pricing/gallery columns
--   PART 3  Geo-radius helpers + chat/theme/sales-analytics tables
--   PART 4  Merchant delivery radius (safe Haversine distance functions)
--   PART 5  Merchant verification queue + delivery slabs (min order /
--           free delivery threshold / per-km fee)
--   PART 6  Support desk + legal-acceptance audit trail
--   PART 7  Promotional ads carousel
--   PART 8  Customer checkout profile (name/phone/address autofill)
--   PART 9  Query performance indexes
--   PART 10 Optional demo seed data (only inserted on an empty database)
-- =============================================================================


-- #############################################################################
-- PART 1 — CORE SCHEMA
-- #############################################################################

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

-- Safety net: backfill any columns missing from an older/partial "customer_wishlists" table.
ALTER TABLE public.customer_wishlists ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.customer_wishlists ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE;
ALTER TABLE public.customer_wishlists ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.customer_wishlists ADD COLUMN IF NOT EXISTS shop_name text;
ALTER TABLE public.customer_wishlists ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now();
ALTER TABLE public.customer_wishlists ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON public.customer_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON public.customer_wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_shop_id ON public.customer_wishlists(shop_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_added_at ON public.customer_wishlists(added_at DESC);

ALTER TABLE public.customer_wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wishlist_user_select" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_select"
  ON public.customer_wishlists FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wishlist_user_insert" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_insert"
  ON public.customer_wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wishlist_user_update" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_update"
  ON public.customer_wishlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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

-- Safety net: backfill any columns missing from an older/partial "favorite_stores" table.
ALTER TABLE public.favorite_stores ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.favorite_stores ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now();
ALTER TABLE public.favorite_stores ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

-- Safety net: backfill any columns missing from an older/partial "coupons" table.
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS discount_percent numeric(5, 2) DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS discount_amount numeric(10, 2) DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS expiry_date timestamptz DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS starts_at timestamptz DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS usage_limit integer DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_coupons_shop_id ON public.coupons(shop_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_public_read_active" ON public.coupons;
CREATE POLICY "coupons_public_read_active"
  ON public.coupons FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (usage_limit IS NULL OR usage_count < usage_limit)
    AND (starts_at IS NULL OR starts_at <= now())
  );

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

-- Safety net: backfill any columns missing from an older/partial "stories" table.
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS caption text DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '24 hours');
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_stories_shop_id ON public.stories(shop_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON public.stories(created_at DESC);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_public_read_active" ON public.stories;
CREATE POLICY "stories_public_read_active"
  ON public.stories FOR SELECT
  USING (expires_at > now());

DROP POLICY IF EXISTS "stories_owner_insert" ON public.stories;
CREATE POLICY "stories_owner_insert"
  ON public.stories FOR INSERT
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "stories_owner_update" ON public.stories;
CREATE POLICY "stories_owner_update"
  ON public.stories FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "analytics_logs" table.
ALTER TABLE public.analytics_logs ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'shop_view';
ALTER TABLE public.analytics_logs ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.analytics_logs ADD COLUMN IF NOT EXISTS visitor_ip text;
ALTER TABLE public.analytics_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.analytics_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.analytics_logs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_analytics_logs_shop_id ON public.analytics_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_shop_event ON public.analytics_logs(shop_id, event_type);

ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_public_insert" ON public.analytics_logs;
CREATE POLICY "analytics_public_insert"
  ON public.analytics_logs FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "analytics_owner_read" ON public.analytics_logs;
CREATE POLICY "analytics_owner_read"
  ON public.analytics_logs FOR SELECT
  USING (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "finance_entries" table.
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other';
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_finance_entries_shop_id ON public.finance_entries(shop_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON public.finance_entries(shop_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_entries_type ON public.finance_entries(shop_id, type);

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_entries_owner_all" ON public.finance_entries;
CREATE POLICY "finance_entries_owner_all"
  ON public.finance_entries FOR ALL
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "customer_addresses" table.
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'Home';
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS delivery_notes text;
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON public.customer_addresses(user_id, is_default);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_addresses_owner_all" ON public.customer_addresses;
CREATE POLICY "customer_addresses_owner_all"
  ON public.customer_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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

-- Safety net: backfill any columns missing from an older/partial "merchant_subscriptions" table.
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free_trial';
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS current_period_start timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days');
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS products_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS storage_used_mb numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS grace_period_until timestamptz;
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS suspended_reason text;
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.merchant_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_merchant_subs_shop ON public.merchant_subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_merchant_subs_status ON public.merchant_subscriptions(status);

ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_owner_read" ON public.merchant_subscriptions;
CREATE POLICY "subs_owner_read"
  ON public.merchant_subscriptions FOR SELECT
  USING (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "subs_admin_read" ON public.merchant_subscriptions;
CREATE POLICY "subs_admin_read"
  ON public.merchant_subscriptions FOR SELECT
  USING (public.is_admin(auth.uid()));

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

-- Safety net: backfill any columns missing from an older/partial "billing_invoices" table.
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS amount_pkr integer NOT NULL DEFAULT 0;
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS commission_pkr integer NOT NULL DEFAULT 0;
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS period_start timestamptz DEFAULT now();
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS period_end timestamptz DEFAULT now();
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS due_date timestamptz DEFAULT now();
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_billing_invoices_shop ON public.billing_invoices(shop_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status);

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_owner_read" ON public.billing_invoices;
CREATE POLICY "invoices_owner_read"
  ON public.billing_invoices FOR SELECT
  USING (public.is_shop_owner(shop_id));

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

-- Safety net: backfill any columns missing from an older/partial "subscription_audit_log" table.
ALTER TABLE public.subscription_audit_log ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.merchant_subscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.subscription_audit_log ADD COLUMN IF NOT EXISTS old_value jsonb;
ALTER TABLE public.subscription_audit_log ADD COLUMN IF NOT EXISTS new_value jsonb;
ALTER TABLE public.subscription_audit_log ADD COLUMN IF NOT EXISTS performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.subscription_audit_log ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.subscription_audit_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sub_audit_shop ON public.subscription_audit_log(shop_id);

ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_audit_admin_read" ON public.subscription_audit_log;
CREATE POLICY "sub_audit_admin_read"
  ON public.subscription_audit_log FOR SELECT
  USING (public.is_admin(auth.uid()));

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

-- Safety net: backfill any columns missing from an older/partial "admin_audit_logs" table.
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS old_value jsonb;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS new_value jsonb;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS performed_by_email text;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_admin_audit_event_type ON public.admin_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_performed_by ON public.admin_audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_severity ON public.admin_audit_logs(severity);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_select" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_select"
  ON public.admin_audit_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

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

-- Safety net: backfill any columns missing from an older/partial "security_audit_log" table.
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS record_id uuid;
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_security_audit_actor ON public.security_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_table ON public.security_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log(created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_audit_insert" ON public.security_audit_log;
CREATE POLICY "security_audit_insert"
  ON public.security_audit_log FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

DROP POLICY IF EXISTS "security_audit_service_read" ON public.security_audit_log;
CREATE POLICY "security_audit_service_read"
  ON public.security_audit_log FOR SELECT
  USING (auth.role() = 'service_role');

-- =============================================================================
-- SECTION 25: HELPER FUNCTIONS — Ownership verification
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_shop_owner_id(p_shop_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT owner_id FROM public.shops WHERE id = p_shop_id;
$$;

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

CREATE OR REPLACE FUNCTION public.get_product_shop_id(p_product_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT shop_id FROM public.products WHERE id = p_product_id;
$$;

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
  SELECT stock INTO v_current_stock
  FROM public.inventory_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_current_stock < p_quantity THEN
    RETURN false;
  END IF;

  UPDATE public.inventory_variants
  SET stock = stock - p_quantity,
      updated_at = now()
  WHERE id = p_variant_id;

  RETURN true;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chosen text;
  resolved public.app_role;
BEGIN
  chosen := lower(coalesce(NEW.raw_user_meta_data->>'role', 'customer'));
  IF chosen = 'merchant' THEN
    resolved := 'merchant';
  ELSE
    resolved := 'customer';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, resolved)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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
  CASE WHEN p.qual IS NOT NULL THEN 'Restricted' ELSE 'Open (no USING)' END AS using_clause,
  CASE WHEN p.with_check IS NOT NULL THEN 'Restricted' ELSE 'Open (no WITH CHECK)' END AS check_clause,
  CASE
    WHEN p.cmd IN ('INSERT', 'UPDATE', 'DELETE') AND p.with_check IS NULL THEN 'CRITICAL'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL
         AND p.tablename IN ('orders', 'analytics_logs', 'customer_inquiries',
                             'customer_wishlists', 'favorite_stores', 'inventory_variants',
                             'admin_audit_logs', 'security_audit_log') THEN 'HIGH'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL THEN 'PUBLIC'
    ELSE 'SECURE'
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
-- SECTION 34: SEED DEFAULT SERVICE AVAILABILITY FOR EXISTING SERVICE SHOPS
-- =============================================================================

DO $$
DECLARE
  svc_shop RECORD;
  d int;
BEGIN
  FOR svc_shop IN SELECT id FROM public.shops WHERE shop_type = 'service'
  LOOP
    FOR d IN 0..6 LOOP
      INSERT INTO public.service_availability (shop_id, day_of_week, is_working_day, start_time, end_time)
      VALUES (svc_shop.id, d, d NOT IN (0), '09:00'::TIME, '18:00'::TIME)
      ON CONFLICT (shop_id, day_of_week) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMIT;


-- #############################################################################
-- PART 2 — SUB-CATEGORIES + PRODUCT MARKDOWN-PRICING / GALLERY ENHANCEMENTS
-- #############################################################################

BEGIN;

-- Canonical markdown-pricing field used by lib/formatters.ts::getProductDiscount().
-- (compare_at_price, added further below, is kept only as a legacy fallback.)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price numeric(10,2) DEFAULT NULL;

-- ── 1. Sub-Categories Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sub_categories (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category        text NOT NULL,               -- Parent main category (matches shops.category)
  name            text NOT NULL,               -- Sub-category display name
  slug            text NOT NULL,               -- URL-friendly slug
  description     text DEFAULT '',             -- Optional description
  icon            text DEFAULT '📦',           -- Emoji icon
  is_active       boolean DEFAULT true,        -- Enable/disable toggle
  sort_order      integer DEFAULT 0,           -- Display ordering
  is_others       boolean DEFAULT false,       -- Flag: this is the 'Others' fallback entry
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  -- Each category must have exactly one 'Others' entry (enforced by app logic + partial unique)
  CONSTRAINT sub_categories_category_slug_unique UNIQUE (category, slug)
);

-- Safety net: backfill any columns missing from an older/partial "sub_categories" table.
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS icon text DEFAULT '📦';
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS is_others boolean DEFAULT false;
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


-- Index for fast lookup by category
CREATE INDEX IF NOT EXISTS idx_sub_categories_category ON public.sub_categories(category, sort_order);

-- ── 2. Seed sub-categories with 'Others' for all main categories ─────────────
DO $$
DECLARE
  cat record;
BEGIN
  FOR cat IN
    SELECT unnest(ARRAY[
      'Grocery & Kiryana',
      'Fruits & Vegetables',
      'Bakery & Sweets',
      'Fast Food & Restaurants',
      'Pharmacy & Medical',
      'Fashion & Apparel',
      'Electronics & Gadgets',
      'Home & Living',
      'Health & Beauty',
      'Books & Stationery',
      'Sports & Fitness',
      'Toys & Baby Care',
      'Automotive Accessories',
      'Handmade & Crafts',
      'Home Maintenance & Repair',
      'Security & Surveillance',
      'Tech & IT Services',
      'Personal & Professional Services',
      'Others / Universal'
    ]) AS category_name
  LOOP
    INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others)
    VALUES (
      cat.category_name,
      'Others / General',
      lower(regexp_replace(cat.category_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-others',
      'Items that do not fit specific sub-categories within ' || cat.category_name,
      '📦',
      999,
      true
    )
    ON CONFLICT (category, slug) DO NOTHING;
  END LOOP;
END $$;

-- ── 3. Seed meaningful sub-categories for key categories ────────────────────

-- Local retail (Pakistan)
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Grocery & Kiryana', 'Dry Goods & Spices', 'dry-goods-spices', 'Atta, daal, rice, masala, and pantry staples', '🫙', 1),
  ('Grocery & Kiryana', 'Dairy & Eggs', 'dairy-eggs', 'Milk, yogurt, cheese, and eggs', '🥛', 2),
  ('Grocery & Kiryana', 'Snacks & Beverages', 'snacks-beverages', 'Chips, biscuits, juices, and soft drinks', '🧃', 3),
  ('Grocery & Kiryana', 'Household Essentials', 'household-essentials', 'Cleaning, toiletries, and daily-use items', '🧴', 4),
  ('Grocery & Kiryana', 'Frozen & Packaged', 'frozen-packaged', 'Frozen foods and packaged convenience items', '🧊', 5)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fruits & Vegetables', 'Seasonal Fruits', 'seasonal-fruits', 'Fresh seasonal fruit by the kilo', '🍎', 1),
  ('Fruits & Vegetables', 'Fresh Vegetables', 'fresh-vegetables', 'Daily sabzi and leafy greens', '🥦', 2),
  ('Fruits & Vegetables', 'Herbs & Roots', 'herbs-roots', 'Adrak, lehsan, pudina, and kitchen herbs', '🌿', 3),
  ('Fruits & Vegetables', 'Exotic & Imported', 'exotic-imported', 'Imported and specialty produce', '🥑', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Bakery & Sweets', 'Bread & Buns', 'bread-buns', 'Fresh bread, rusk, and bakery buns', '🍞', 1),
  ('Bakery & Sweets', 'Cakes & Pastries', 'cakes-pastries', 'Birthday cakes, cupcakes, and pastries', '🎂', 2),
  ('Bakery & Sweets', 'Mithai & Traditional', 'mithai-traditional', 'Gulab jamun, barfi, jalebi, and mithai boxes', '🍬', 3),
  ('Bakery & Sweets', 'Cookies & Desserts', 'cookies-desserts', 'Cookies, brownies, and sweet treats', '🍪', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fast Food & Restaurants', 'Burgers', 'burgers', 'Burgers, smash burgers, and combo meals', '🍔', 1),
  ('Fast Food & Restaurants', 'Shawarma & Rolls', 'shawarma-rolls', 'Shawarma, wraps, rolls, and sandwiches', '🌯', 2),
  ('Fast Food & Restaurants', 'Deals & Combos', 'deals-combos', 'Family deals, meal boxes, and special offers', '🔥', 3),
  ('Fast Food & Restaurants', 'Desi & BBQ', 'desi-bbq', 'Biryani, karahi, BBQ, and Pakistani classics', '🍖', 4),
  ('Fast Food & Restaurants', 'Pizza & Pasta', 'pizza-pasta', 'Pizza, pasta, and Italian-style meals', '🍕', 5),
  ('Fast Food & Restaurants', 'Fries & Sides', 'fries-sides', 'Fries, nuggets, and side snacks', '🍟', 6),
  ('Fast Food & Restaurants', 'Cafe & Beverages', 'cafe-beverages', 'Coffee, chai, shakes, and soft drinks', '☕', 7),
  ('Fast Food & Restaurants', 'Chinese & Asian', 'chinese-asian', 'Chinese, Thai, and Asian favourites', '🥡', 8)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Pharmacy & Medical', 'Prescription Medicines', 'prescription-medicines', 'Prescribed medicines and pharmacy counter', '💊', 1),
  ('Pharmacy & Medical', 'OTC & First Aid', 'otc-first-aid', 'Over-the-counter medicines and first-aid', '🩹', 2),
  ('Pharmacy & Medical', 'Personal Care', 'personal-care-medical', 'Hygiene, skincare, and wellness products', '🧴', 3),
  ('Pharmacy & Medical', 'Medical Devices', 'medical-devices', 'BP monitors, thermometers, and devices', '🩺', 4),
  ('Pharmacy & Medical', 'Baby & Mother Care', 'baby-mother-care', 'Infant formula, diapers, and mother care', '🍼', 5)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fashion & Apparel', 'Women''s Clothing', 'womens-clothing', 'Dresses, tops, kurtis, and casual wear', '👗', 1),
  ('Fashion & Apparel', 'Men''s Clothing', 'mens-clothing', 'Shalwar kameez, shirts, trousers, and suits', '👔', 2),
  ('Fashion & Apparel', 'Kids'' Wear', 'kids-wear', 'Children''s clothing, uniforms, and accessories', '👶', 3),
  ('Fashion & Apparel', 'Footwear', 'footwear', 'Shoes, sandals, sneakers, and formal wear', '👟', 4),
  ('Fashion & Apparel', 'Accessories', 'accessories', 'Bags, watches, jewelry, and sunglasses', '👜', 5),
  ('Fashion & Apparel', 'Winter Collection', 'winter-collection', 'Sweaters, jackets, shawls, and warm wear', '🧥', 6),
  ('Fashion & Apparel', 'Wedding & Formal', 'wedding-formal', 'Bridal wear, sherwani, and formal suits', '💍', 7)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Electronics & Gadgets', 'Smartphones', 'smartphones', 'Mobile phones, accessories, and repairs', '📱', 1),
  ('Electronics & Gadgets', 'Laptops & Computers', 'laptops-computers', 'Notebooks, desktops, and peripherals', '💻', 2),
  ('Electronics & Gadgets', 'Audio & Headphones', 'audio-headphones', 'Speakers, earphones, headphones, and audio gear', '🎧', 3),
  ('Electronics & Gadgets', 'Chargers & Cables', 'chargers-cables', 'Power banks, chargers, USB cables, and adapters', '🔌', 4),
  ('Electronics & Gadgets', 'Cameras', 'cameras', 'DSLR, mirrorless, action cams, and accessories', '📷', 5),
  ('Electronics & Gadgets', 'Home Appliances', 'home-appliances', 'Irons, blenders, microwaves, and kitchen gadgets', '🏠', 6)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Home & Living', 'Furniture', 'furniture', 'Beds, sofas, tables, chairs, and storage', '🛋️', 1),
  ('Home & Living', 'Kitchen & Dining', 'kitchen-dining', 'Cookware, utensils, dinner sets, and glassware', '🍽️', 2),
  ('Home & Living', 'Home Décor', 'home-decor', 'Vases, wall art, clocks, mirrors, and candles', '🖼️', 3),
  ('Home & Living', 'Bedding & Linens', 'bedding-linens', 'Bed sheets, pillows, blankets, and towels', '🛏️', 4),
  ('Home & Living', 'Lighting', 'lighting', 'Lamps, bulbs, chandeliers, and decorative lights', '💡', 5),
  ('Home & Living', 'Cleaning & Supplies', 'cleaning-supplies', 'Cleaning tools, detergents, and organizers', '🧹', 6)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Health & Beauty', 'Skincare', 'skincare', 'Creams, serums, sunscreens, and face masks', '🧴', 1),
  ('Health & Beauty', 'Makeup', 'makeup', 'Lipsticks, foundations, eyeshadows, and palettes', '💄', 2),
  ('Health & Beauty', 'Hair Care', 'hair-care', 'Shampoos, conditioners, oils, and styling products', '💇', 3),
  ('Health & Beauty', 'Fragrances', 'fragrances', 'Perfumes, attars, body sprays, and deodorants', '🌸', 4),
  ('Health & Beauty', 'Personal Care', 'personal-care', 'Soaps, lotions, oral care, and hygiene products', '🧼', 5)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Sports & Fitness', 'Exercise Equipment', 'exercise-equipment', 'Treadmills, dumbbells, yoga mats, and resistance bands', '🏋️', 1),
  ('Sports & Fitness', 'Sportswear', 'sportswear', 'Activewear, gym clothes, tracksuits, and sports shoes', '👟', 2),
  ('Sports & Fitness', 'Outdoor & Adventure', 'outdoor-adventure', 'Camping gear, hiking, cycling, and sports accessories', '⛺', 3),
  ('Sports & Fitness', 'Supplements', 'supplements', 'Protein powders, vitamins, energy bars, and nutrition', '💊', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Books & Stationery', 'Fiction & Novels', 'fiction-novels', 'Novels, literature, and fiction books', '📖', 1),
  ('Books & Stationery', 'Educational', 'educational', 'Textbooks, guides, exam prep, and academic books', '📚', 2),
  ('Books & Stationery', 'Stationery', 'stationery', 'Pens, notebooks, art supplies, and office essentials', '✏️', 3),
  ('Books & Stationery', 'Islamic & Religious', 'islamic-religious', 'Quran, Islamic books, and religious literature', '☪️', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Toys & Baby Care', 'Toys & Games', 'toys-games', 'Action figures, puzzles, board games, and dolls', '🧸', 1),
  ('Toys & Baby Care', 'Baby Gear', 'baby-gear', 'Strollers, baby carriers, high chairs, and walkers', '👶', 2),
  ('Toys & Baby Care', 'Baby Clothing', 'baby-clothing', 'Onesies, bibs, baby suits, and infant wear', '🍼', 3),
  ('Toys & Baby Care', 'Diapers & Wipes', 'diapers-wipes', 'Diapers, baby wipes, and changing essentials', '🧷', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Automotive Accessories', 'Car Electronics', 'car-electronics', 'Stereos, speakers, dashcams, and GPS', '📻', 1),
  ('Automotive Accessories', 'Car Care', 'car-care', 'Cleaning kits, waxes, polishes, and air fresheners', '🧽', 2),
  ('Automotive Accessories', 'Interior Accessories', 'interior-accessories', 'Seat covers, mats, steering covers, and organizers', '💺', 3),
  ('Automotive Accessories', 'Exterior & Parts', 'exterior-parts', 'Mirrors, lights, bumpers, and body kits', '🔧', 4),
  ('Automotive Accessories', 'Motorcycle Accessories', 'motorcycle-accessories', 'Helmets, gloves, bike covers, and parts', '🏍️', 5)
ON CONFLICT (category, slug) DO NOTHING;

-- ── 4. Products Table Enhancements ───────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id text DEFAULT NULL;

-- Older "fresh_consolidated" migrations created category_id as uuid, but the
-- app stores main-category NAMES (e.g. "Tech & IT Services") here. Convert
-- any leftover uuid column to text so inserts stop failing with 22P02.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'category_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.products
      ALTER COLUMN category_id DROP DEFAULT;
    ALTER TABLE public.products
      ALTER COLUMN category_id TYPE text USING category_id::text;
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_category_id uuid DEFAULT NULL REFERENCES public.sub_categories(id) ON DELETE SET NULL;

-- Legacy fallback field — see lib/formatters.ts::getProductDiscount()
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2) DEFAULT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_status text DEFAULT 'in_stock'
  CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'pre_order'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS title text DEFAULT NULL;

UPDATE public.products SET title = name WHERE title IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sub_category_id ON public.products(sub_category_id);
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON public.products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_compare_at_price ON public.products(compare_at_price)
  WHERE compare_at_price IS NOT NULL AND compare_at_price > 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON public.products USING gin (description gin_trgm_ops);

-- ── 5. Enable RLS on sub_categories ──────────────────────────────────────────
ALTER TABLE public.sub_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_categories_public_read" ON public.sub_categories;
CREATE POLICY "sub_categories_public_read" ON public.sub_categories
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "sub_categories_admin_manage" ON public.sub_categories;
CREATE POLICY "sub_categories_admin_manage" ON public.sub_categories
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

COMMIT;


-- #############################################################################
-- PART 3 — GEO-RADIUS HELPERS + CHAT / THEME / SALES-ANALYTICS TABLES
-- #############################################################################

BEGIN;

-- 1. Sales events table for detailed analytics
CREATE TABLE IF NOT EXISTS public.sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  event_type TEXT NOT NULL DEFAULT 'sale' CHECK (event_type IN ('sale', 'refund', 'lead', 'inquiry')),
  customer_phone TEXT,
  customer_name TEXT,
  source TEXT DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'catalog', 'chatbot', 'direct', 'other')),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "sales_events" table.
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'whatsapp';
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sales_events_shop_date ON public.sales_events(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_events_type ON public.sales_events(event_type);

-- Daily revenue snapshot for charts
CREATE TABLE IF NOT EXISTS public.daily_revenue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  unique_customers INTEGER DEFAULT 0,
  top_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  top_product_name TEXT,
  top_product_revenue DECIMAL(12,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, snapshot_date)
);

-- Safety net: backfill any columns missing from an older/partial "daily_revenue_snapshots" table.
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS unique_customers INTEGER DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS top_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS top_product_name TEXT;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS top_product_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_daily_revenue_shop_date ON public.daily_revenue_snapshots(shop_id, snapshot_date DESC);

-- 2. AI Chat logs table
CREATE TABLE IF NOT EXISTS public.chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  visitor_ip TEXT,
  user_message TEXT NOT NULL,
  bot_response TEXT NOT NULL,
  intent TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.0,
  resolved BOOLEAN DEFAULT false,
  feedback TEXT CHECK (feedback IS NULL OR feedback IN ('helpful', 'not_helpful')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "chat_logs" table.
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS visitor_ip TEXT;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 0.0;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_chat_logs_shop ON public.chat_logs(shop_id, created_at DESC);

-- 3. Merchant theme preferences table
CREATE TABLE IF NOT EXISTS public.merchant_theme_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL UNIQUE REFERENCES public.shops(id) ON DELETE CASCADE,
  layout_style TEXT DEFAULT 'grid' CHECK (layout_style IN ('grid', 'compact', 'large_cards', 'list', 'gallery')),
  accent_color_override TEXT,
  font_scale DECIMAL(2,1) DEFAULT 1.0 CHECK (font_scale >= 0.8 AND font_scale <= 1.5),
  dark_mode_default BOOLEAN DEFAULT false,
  show_announcement_banner BOOLEAN DEFAULT true,
  show_whatsapp_floating_button BOOLEAN DEFAULT true,
  product_card_style TEXT DEFAULT 'default' CHECK (product_card_style IN ('default', 'minimal', 'detailed', 'service')),
  custom_css TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "merchant_theme_preferences" table.
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS layout_style TEXT DEFAULT 'grid';
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS accent_color_override TEXT;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS font_scale DECIMAL(2,1) DEFAULT 1.0;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS dark_mode_default BOOLEAN DEFAULT false;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS show_announcement_banner BOOLEAN DEFAULT true;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS show_whatsapp_floating_button BOOLEAN DEFAULT true;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS product_card_style TEXT DEFAULT 'default';
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS custom_css TEXT;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_theme_prefs_shop ON public.merchant_theme_preferences(shop_id);

-- 4. RLS Policies

ALTER TABLE public.sales_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their shop sales events" ON public.sales_events;
CREATE POLICY "Owners can view their shop sales events"
ON public.sales_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = sales_events.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Public can insert sales events" ON public.sales_events;
CREATE POLICY "Public can insert sales events"
ON public.sales_events FOR INSERT
WITH CHECK (true);

ALTER TABLE public.daily_revenue_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their revenue snapshots" ON public.daily_revenue_snapshots;
CREATE POLICY "Owners can view their revenue snapshots"
ON public.daily_revenue_snapshots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = daily_revenue_snapshots.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "System can insert revenue snapshots" ON public.daily_revenue_snapshots;
CREATE POLICY "System can insert revenue snapshots"
ON public.daily_revenue_snapshots FOR INSERT
WITH CHECK (true);

ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their chat logs" ON public.chat_logs;
CREATE POLICY "Owners can view their chat logs"
ON public.chat_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = chat_logs.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_logs;
CREATE POLICY "Anyone can insert chat messages"
ON public.chat_logs FOR INSERT
WITH CHECK (true);

ALTER TABLE public.merchant_theme_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage their theme preferences" ON public.merchant_theme_preferences;
CREATE POLICY "Owners can manage their theme preferences"
ON public.merchant_theme_preferences FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = merchant_theme_preferences.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Public can read theme preferences" ON public.merchant_theme_preferences;
CREATE POLICY "Public can read theme preferences"
ON public.merchant_theme_preferences
FOR SELECT
USING (true);

-- 5. Function: Aggregate daily revenue snapshot
CREATE OR REPLACE FUNCTION public.generate_daily_revenue_snapshot(
  p_shop_id UUID,
  p_date DATE DEFAULT CURRENT_DATE - 1
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_revenue DECIMAL(12,2);
  v_order_count INTEGER;
  v_unique_customers INTEGER;
  v_top_product_id UUID;
  v_top_product_name TEXT;
  v_top_product_revenue DECIMAL(12,2);
BEGIN
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*),
    COUNT(DISTINCT customer_phone)
  INTO v_total_revenue, v_order_count, v_unique_customers
  FROM public.sales_events
  WHERE shop_id = p_shop_id
    AND event_type = 'sale'
    AND created_at::DATE = p_date;

  SELECT
    se.product_id,
    se.product_name,
    SUM(se.amount) as product_total
  INTO v_top_product_id, v_top_product_name, v_top_product_revenue
  FROM public.sales_events se
  WHERE se.shop_id = p_shop_id
    AND se.event_type = 'sale'
    AND se.created_at::DATE = p_date
    AND se.product_id IS NOT NULL
  GROUP BY se.product_id, se.product_name
  ORDER BY product_total DESC
  LIMIT 1;

  INSERT INTO public.daily_revenue_snapshots (
    shop_id, snapshot_date, total_revenue, order_count,
    unique_customers, top_product_id, top_product_name, top_product_revenue
  ) VALUES (
    p_shop_id, p_date, v_total_revenue, v_order_count,
    v_unique_customers, v_top_product_id, v_top_product_name,
    COALESCE(v_top_product_revenue, 0)
  )
  ON CONFLICT (shop_id, snapshot_date)
  DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue,
    order_count = EXCLUDED.order_count,
    unique_customers = EXCLUDED.unique_customers,
    top_product_id = EXCLUDED.top_product_id,
    top_product_name = EXCLUDED.top_product_name,
    top_product_revenue = EXCLUDED.top_product_revenue,
    metadata = EXCLUDED.metadata;
END;
$$;

COMMIT;


-- #############################################################################
-- PART 4 — MERCHANT DELIVERY RADIUS (safe geo columns + Haversine functions)
-- #############################################################################
-- Additive & idempotent regardless of whether Part 3 already added these
-- columns — safe to run multiple times.

BEGIN;

ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS service_radius_km INTEGER DEFAULT 10 CHECK (service_radius_km > 0 AND service_radius_km <= 500),
ADD COLUMN IF NOT EXISTS delivery_zones TEXT[] DEFAULT '{}'::TEXT[],
ADD COLUMN IF NOT EXISTS address_display TEXT;

CREATE OR REPLACE FUNCTION public.calculate_distance_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r DOUBLE PRECISION := 6371;
  dlat DOUBLE PRECISION;
  dlng DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) * sin(dlat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlng / 2) * sin(dlng / 2);
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  RETURN r * c;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_nearby_shops(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_distance_km INTEGER DEFAULT 50
) RETURNS TABLE(
  id UUID,
  name TEXT,
  category TEXT,
  location TEXT,
  whatsapp_number TEXT,
  logo_url TEXT,
  banner_url TEXT,
  is_live BOOLEAN,
  created_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  service_radius_km INTEGER,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.category,
    s.location,
    s.whatsapp_number,
    s.logo_url,
    s.banner_url,
    s.is_live,
    s.created_at,
    s.latitude,
    s.longitude,
    s.service_radius_km,
    public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) AS distance_km
  FROM public.shops s
  WHERE s.is_live = true
    AND (
      s.latitude IS NULL
      OR s.longitude IS NULL
      OR s.service_radius_km IS NULL
      OR public.calculate_distance_km(user_lat, user_lng, s.latitude, s.longitude) <= s.service_radius_km
    )
    AND public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) <= max_distance_km
  ORDER BY distance_km ASC;
END;
$$;

-- Optional extensions/index — skipped gracefully if unavailable on this plan.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS cube;
  CREATE EXTENSION IF NOT EXISTS earthdistance;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_shops_geo_coords
  ON public.shops USING gist (
    ll_to_earth(
      COALESCE(latitude, 31.5204),
      COALESCE(longitude, 74.3587)
    )
  ) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Plain B-tree fallback index (always safe, no extension dependency)
CREATE INDEX IF NOT EXISTS idx_shops_lat_lng
ON public.shops (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;


-- #############################################################################
-- PART 5 — SHOP VERIFICATION STATUS + DELIVERY SLABS
-- (Approval queue disabled: default is 'approved'; stores go live on create.)
-- #############################################################################

BEGIN;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (verification_status IN ('pending', 'approved', 'rejected'));

-- Ensure default is approved even if the column already existed as pending
ALTER TABLE public.shops
  ALTER COLUMN verification_status SET DEFAULT 'approved';

-- Backfill: any leftover pending rows become approved + live (auto-live policy)
UPDATE public.shops
SET verification_status = 'approved', is_live = true
WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_shops_verification_status ON public.shops(verification_status);
CREATE INDEX IF NOT EXISTS idx_shops_public_visible ON public.shops(is_live, verification_status)
  WHERE is_live = true AND verification_status = 'approved';

-- Smart delivery & minimum order slabs
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10, 2) DEFAULT 0 CHECK (min_order_amount >= 0),
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2) DEFAULT NULL CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_flat NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee_flat >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_per_km NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee_per_km >= 0);

-- Public reads must also respect the approval gate
DROP POLICY IF EXISTS "shops_public_read" ON public.shops;
CREATE POLICY "shops_public_read"
  ON public.shops FOR SELECT
  USING (
    (is_live = true AND verification_status = 'approved')
    OR auth.uid() = owner_id
  );

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = products.shop_id
      AND shops.is_live = true
      AND shops.verification_status = 'approved'
    )
    OR
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = products.shop_id)
  );

-- Re-gate get_nearby_shops() to respect the approval queue too
CREATE OR REPLACE FUNCTION public.get_nearby_shops(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_distance_km INTEGER DEFAULT 50
) RETURNS TABLE(
  id UUID,
  name TEXT,
  category TEXT,
  location TEXT,
  whatsapp_number TEXT,
  logo_url TEXT,
  banner_url TEXT,
  is_live BOOLEAN,
  created_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  service_radius_km INTEGER,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.category,
    s.location,
    s.whatsapp_number,
    s.logo_url,
    s.banner_url,
    s.is_live,
    s.created_at,
    s.latitude,
    s.longitude,
    s.service_radius_km,
    public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) AS distance_km
  FROM public.shops s
  WHERE s.is_live = true
    AND s.verification_status = 'approved'
    AND (
      s.latitude IS NULL
      OR s.longitude IS NULL
      OR s.service_radius_km IS NULL
      OR public.calculate_distance_km(user_lat, user_lng, s.latitude, s.longitude) <= s.service_radius_km
    )
    AND public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) <= max_distance_km
  ORDER BY distance_km ASC;
END;
$$;

-- Tighten sub_categories write policy to admin-only
DROP POLICY IF EXISTS "sub_categories_admin_manage" ON public.sub_categories;
CREATE POLICY "sub_categories_admin_manage" ON public.sub_categories
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Realtime: ensure the orders table broadcasts changes (Live Order Tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

COMMIT;


-- #############################################################################
-- PART 6 — SUPPORT DESK + LEGAL ACCEPTANCE AUDIT TRAIL
-- #############################################################################

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general'
                CHECK (category IN ('general', 'order', 'merchant', 'technical', 'billing', 'other')),
  subject       TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes   TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "support_tickets" table.
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS admin_notes TEXT DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_public_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_public_insert"
  ON public.support_tickets FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "support_tickets_own_read" ON public.support_tickets;
CREATE POLICY "support_tickets_own_read"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_tickets_admin_all" ON public.support_tickets;
CREATE POLICY "support_tickets_admin_all"
  ON public.support_tickets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_support_tickets_updated_at'
  ) THEN
    CREATE TRIGGER trg_support_tickets_updated_at
      BEFORE UPDATE ON public.support_tickets
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document      TEXT NOT NULL CHECK (document IN ('terms', 'privacy', 'merchant_guidelines')),
  version       TEXT NOT NULL DEFAULT 'v1',
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hint       TEXT DEFAULT ''
);

-- Safety net: backfill any columns missing from an older/partial "legal_acceptances" table.
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS ip_hint TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_id ON public.legal_acceptances(user_id);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_acceptances_own_insert" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_insert"
  ON public.legal_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "legal_acceptances_own_read" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_read"
  ON public.legal_acceptances FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "legal_acceptances_admin_read" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_admin_read"
  ON public.legal_acceptances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

COMMIT;


-- #############################################################################
-- PART 7 — PROMOTIONAL ADS CAROUSEL
-- #############################################################################

BEGIN;

CREATE TABLE IF NOT EXISTS public.promotional_ads (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id            uuid REFERENCES public.shops(id) ON DELETE CASCADE, -- NULL = platform/house ad
  title              text NOT NULL,
  subtitle           text,
  image_url          text NOT NULL,
  link_url           text NOT NULL,
  badge_label        text,
  placement          text NOT NULL DEFAULT 'homepage_top' CHECK (placement IN ('homepage_top', 'homepage_feed')),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_active          boolean NOT NULL DEFAULT true,
  starts_at          timestamptz,
  ends_at            timestamptz,
  sort_order         integer NOT NULL DEFAULT 0,
  impression_count   bigint NOT NULL DEFAULT 0,
  click_count        bigint NOT NULL DEFAULT 0,
  rejection_reason   text,
  reviewed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "promotional_ads" table.
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS subtitle text;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS badge_label text;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'homepage_top';
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS impression_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS click_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_promotional_ads_shop_id ON public.promotional_ads(shop_id);
CREATE INDEX IF NOT EXISTS idx_promotional_ads_live
  ON public.promotional_ads(placement, sort_order)
  WHERE status = 'approved' AND is_active = true;

CREATE OR REPLACE FUNCTION public.touch_promotional_ads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promotional_ads_updated_at ON public.promotional_ads;
CREATE TRIGGER trg_promotional_ads_updated_at
  BEFORE UPDATE ON public.promotional_ads
  FOR EACH ROW EXECUTE FUNCTION public.touch_promotional_ads_updated_at();

CREATE OR REPLACE FUNCTION public.guard_promotional_ads_review_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.impression_count := 0;
    NEW.click_count := 0;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.subtitle IS DISTINCT FROM OLD.subtitle
     OR NEW.image_url IS DISTINCT FROM OLD.image_url
     OR NEW.link_url IS DISTINCT FROM OLD.link_url
     OR NEW.badge_label IS DISTINCT FROM OLD.badge_label
     OR NEW.placement IS DISTINCT FROM OLD.placement
  THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.status := OLD.status;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  NEW.impression_count := OLD.impression_count;
  NEW.click_count := OLD.click_count;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_promotional_ads_review_fields ON public.promotional_ads;
CREATE TRIGGER trg_guard_promotional_ads_review_fields
  BEFORE INSERT OR UPDATE ON public.promotional_ads
  FOR EACH ROW EXECUTE FUNCTION public.guard_promotional_ads_review_fields();

ALTER TABLE public.promotional_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotional_ads_public_read" ON public.promotional_ads;
CREATE POLICY "promotional_ads_public_read"
  ON public.promotional_ads FOR SELECT
  USING (
    status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

DROP POLICY IF EXISTS "promotional_ads_owner_manage" ON public.promotional_ads;
CREATE POLICY "promotional_ads_owner_manage"
  ON public.promotional_ads FOR ALL
  USING (shop_id IS NOT NULL AND public.is_shop_owner(shop_id))
  WITH CHECK (shop_id IS NOT NULL AND public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "promotional_ads_admin_manage" ON public.promotional_ads;
CREATE POLICY "promotional_ads_admin_manage"
  ON public.promotional_ads FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.increment_ad_impression(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.promotional_ads
  SET impression_count = impression_count + 1
  WHERE id = p_ad_id
    AND status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now());
$$;

CREATE OR REPLACE FUNCTION public.increment_ad_click(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.promotional_ads
  SET click_count = click_count + 1
  WHERE id = p_ad_id
    AND status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now());
$$;

GRANT EXECUTE ON FUNCTION public.increment_ad_impression(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(uuid) TO anon, authenticated;

COMMENT ON TABLE public.promotional_ads IS
  'Sponsored homepage banners. Merchant requests default to pending review; only Super-Admin approval (via is_admin()) makes them publicly visible, enforced by both RLS and the guard trigger above.';

COMMIT;


-- #############################################################################
-- PART 8 — CUSTOMER CHECKOUT PROFILE (name / phone / address autofill)
-- #############################################################################
-- Backs the "Smart Checkout Auto-Fill" feature in WhatsAppCheckoutModal.tsx,
-- which reads full_name/phone/address from this table to pre-fill checkout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  address     text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "user_profiles" table.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz DEFAULT NULL;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_owner_all" ON public.user_profiles;
CREATE POLICY "user_profiles_owner_all"
  ON public.user_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_admin_read" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_read"
  ON public.user_profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_profiles_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_profiles_updated_at
      BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;

COMMIT;


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


-- #############################################################################
-- PART 10 — DEMO SEED DATA (DISABLED)
-- #############################################################################
-- Fake/demo shops are intentionally NOT inserted anymore.
-- After schema setup, run:
--   supabase/RESET_CLEAN_START_4_MERCHANTS.sql
-- to wipe data and create only the 4 verified merchant logins (no shops).
--
-- Legacy demo block kept below but hard-disabled (always returns).

DO $$
DECLARE
  shop_karachi_biryani uuid;
  shop_lahore_lawn uuid;
  shop_isb_tech uuid;
  shop_ghw_furniture uuid;
  shop_khi_beauty uuid;
  shop_lhr_books uuid;
BEGIN
  -- DISABLED: keep DB empty for real merchant onboarding
  RETURN;

  IF EXISTS (SELECT 1 FROM public.shops LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.shops (
    name, category, location, whatsapp_number, is_live, verification_status,
    store_bio, shop_type, operating_status, latitude, longitude, service_radius_km,
    min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km
  ) VALUES
  ('Karachi Biryani House', 'Fashion & Apparel', 'Gulistan-e-Johar, Karachi', '+923001234567', true, 'approved',
   'Authentic Karachi-style boutique. Premium fabrics, fast delivery.', 'retail', 'Open Today: 11 AM - 11 PM',
   24.9200, 67.1250, 8, 500, 3000, 100, 15)
  RETURNING id INTO shop_karachi_biryani;

  INSERT INTO public.shops (
    name, category, location, whatsapp_number, is_live, verification_status,
    store_bio, shop_type, operating_status, latitude, longitude, service_radius_km,
    min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km
  ) VALUES
  ('Lahore Lawn Collection', 'Fashion & Apparel', 'Anarkali, Lahore', '+923211234567', true, 'approved',
   'Premium Pakistani lawn suits, stitched & unstitched, wholesale rates available.', 'retail', 'Open Today: 10 AM - 9 PM',
   31.5820, 74.3300, 10, 1000, 2000, 150, 10)
  RETURNING id INTO shop_lahore_lawn;

  INSERT INTO public.shops (
    name, category, location, whatsapp_number, is_live, verification_status,
    store_bio, shop_type, operating_status, latitude, longitude, service_radius_km
  ) VALUES
  ('Islamabad Tech Hub', 'Electronics & Gadgets', 'Blue Area, Islamabad', '+923331234567', true, 'approved',
   'Authorized reseller of Samsung, Apple, and Huawei. Genuine products with warranty.', 'retail', 'Open Today: 11 AM - 10 PM',
   33.7180, 73.0650, 12)
  RETURNING id INTO shop_isb_tech;

  INSERT INTO public.shops (
    name, category, location, whatsapp_number, is_live, verification_status,
    store_bio, shop_type, operating_status
  ) VALUES
  ('Gujranwala Furniture', 'Home & Living', 'G.T. Road, Gujranwala', '+923001234568', true, 'approved',
   'Handcrafted wooden furniture. Custom designs available.', 'retail', 'Open Today: 9 AM - 8 PM')
  RETURNING id INTO shop_ghw_furniture;

  INSERT INTO public.shops (
    name, category, location, whatsapp_number, is_live, verification_status,
    store_bio, shop_type, operating_status
  ) VALUES
  ('Karachi Beauty Salon', 'Health & Beauty', 'Clifton, Karachi', '+923451234567', true, 'approved',
   'Bridal makeup, skincare treatments, and beauty courses. Professional staff.', 'retail', 'Open Today: 10 AM - 8 PM')
  RETURNING id INTO shop_khi_beauty;

  INSERT INTO public.shops (
    name, category, location, whatsapp_number, is_live, verification_status,
    store_bio, shop_type, operating_status
  ) VALUES
  ('Pakistan Book Store', 'Books & Stationery', 'Urdu Bazaar, Lahore', '+923221234567', true, 'approved',
   'Largest collection of Urdu, English, and Islamic books. School supplies available.', 'retail', 'Open Today: 9 AM - 7 PM')
  RETURNING id INTO shop_lhr_books;

  -- Products with markdown pricing (original_price > price triggers discount badge)
  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, is_available, images) VALUES
  (shop_karachi_biryani, 'Embroidered Lawn Suit', 'Embroidered Lawn Suit', '3-piece embroidered lawn suit with chiffon dupatta. Summer collection.', 4500, 5500, 'PKR', true, '[]'::jsonb),
  (shop_karachi_biryani, 'Premium Khaddar Suit', 'Premium Khaddar Suit', 'Winter khaddar suit with intricate hand-embroidery.', 6500, NULL, 'PKR', true, '[]'::jsonb),
  (shop_karachi_biryani, 'Plain Silk Kameez', 'Plain Silk Kameez', 'Pure silk kameez with trouser. Elegant design for formal occasions.', 8500, 9800, 'PKR', true, '[]'::jsonb);

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, is_available, images) VALUES
  (shop_lahore_lawn, 'Bridal Lawn Collection', 'Bridal Lawn Collection', 'Exclusive bridal lawn with heavy embroidery and net dupatta.', 12000, 15000, 'PKR', true, '[]'::jsonb),
  (shop_lahore_lawn, 'Casual Printed Lawn', 'Casual Printed Lawn', 'Everyday printed lawn suit, unstitched, 3-piece.', 2200, NULL, 'PKR', true, '[]'::jsonb);

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, is_available, images) VALUES
  (shop_isb_tech, 'Samsung Galaxy A54', 'Samsung Galaxy A54', '6.4" Super AMOLED, 128GB storage, 8GB RAM, 50MP camera. PTA approved.', 124999, 134999, 'PKR', true, '[]'::jsonb),
  (shop_isb_tech, 'Apple AirPods Pro 2', 'Apple AirPods Pro 2', 'Active noise cancellation, spatial audio, adaptive EQ. Genuine with warranty.', 89000, NULL, 'PKR', true, '[]'::jsonb),
  (shop_isb_tech, 'Xiaomi Power Bank 20000mAh', 'Xiaomi Power Bank 20000mAh', 'Fast charging, USB-C and USB-A ports, LED indicator. 18W output.', 4500, 5200, 'PKR', true, '[]'::jsonb);

  INSERT INTO public.products (shop_id, name, title, description, price, currency, is_available, images) VALUES
  (shop_ghw_furniture, 'Solid Wood Dining Table', 'Solid Wood Dining Table', '6-seater Sheesham wood dining table. Hand-polished finish.', 85000, 'PKR', true, '[]'::jsonb),
  (shop_ghw_furniture, 'Sofa Set 3+1+1', 'Sofa Set 3+1+1', 'Premium velvet fabric sofa set with center table. Free delivery in Gujranwala.', 125000, 'PKR', true, '[]'::jsonb);

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, is_available, images) VALUES
  (shop_khi_beauty, 'Bridal Makeup Package', 'Bridal Makeup Package', 'Complete bridal makeup including doli and mehndi. Trial session included.', 35000, 42000, 'PKR', true, '[]'::jsonb),
  (shop_khi_beauty, 'HydraFacial Treatment', 'HydraFacial Treatment', 'Advanced hydrafacial with LED therapy. 60-minute session.', 8000, NULL, 'PKR', true, '[]'::jsonb);

  INSERT INTO public.products (shop_id, name, title, description, price, currency, is_available, images) VALUES
  (shop_lhr_books, 'Bestseller Book Set', 'Bestseller Book Set', 'Collection of 5 bestselling novels. Perfect gift for book lovers.', 2500, 'PKR', true, '[]'::jsonb),
  (shop_lhr_books, 'Islamic Studies Kit', 'Islamic Studies Kit', 'Quran with translation, prayer mat, and tasbeeh. Complete set.', 1800, 'PKR', true, '[]'::jsonb);

  -- Sample reviews
  INSERT INTO public.reviews (shop_id, customer_name, rating, comment) VALUES
  (shop_karachi_biryani, 'Ahmed Khan', 5, 'Excellent service! Highly recommended. Very professional and delivered on time.'),
  (shop_lahore_lawn, 'Fatima Ali', 4, 'Good quality products. The delivery was a bit late but overall satisfied.'),
  (shop_isb_tech, 'Usman Tariq', 5, 'Amazing experience! Will definitely order again. The owner was very helpful.'),
  (shop_ghw_furniture, 'Ayesha Noor', 4, 'Great craftsmanship on the dining table. Very happy with the purchase.');
END $$;


-- #############################################################################
-- ✅ DONE — verification helper queries (read-only, safe to run any time)
-- #############################################################################

DO $$
DECLARE
  missing_rls text;
  table_count integer;
BEGIN
  SELECT count(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'shops','products','orders','reviews','stories','coupons',
      'customer_inquiries','analytics_logs','security_audit_log',
      'inventory_variants','customer_wishlists','favorite_stores',
      'leads','finance_entries','customer_addresses','user_roles',
      'merchant_subscriptions','billing_invoices','subscription_audit_log',
      'admin_audit_logs','service_packages','service_portfolio','service_availability',
      'sub_categories','sales_events','daily_revenue_snapshots','chat_logs',
      'merchant_theme_preferences','support_tickets','legal_acceptances',
      'promotional_ads','user_profiles'
    );

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
      'admin_audit_logs','service_packages','service_portfolio','service_availability',
      'sub_categories','sales_events','daily_revenue_snapshots','chat_logs',
      'merchant_theme_preferences','support_tickets','legal_acceptances',
      'promotional_ads','user_profiles'
    );

  RAISE NOTICE '✅ TrendMart database setup complete! % / 30 expected tables exist.', table_count;

  IF missing_rls IS NOT NULL THEN
    RAISE WARNING '⚠️ The following tables have RLS DISABLED: %', missing_rls;
  ELSE
    RAISE NOTICE '✅ All tables have Row Level Security enabled.';
  END IF;
END $$;

-- To make your OWN Supabase account a Super-Admin (so you can access
-- /admin/dashboard), run this once after signing up in the app, replacing
-- the email with your own account's email:
--
--   UPDATE public.user_roles SET role = 'admin'
--   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
 