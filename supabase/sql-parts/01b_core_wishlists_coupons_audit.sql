-- TrendMart: 01b_core_wishlists_coupons_audit.sql
-- Run in Supabase SQL Editor. If Failed to fetch: refresh, wait, retry this file only.

BEGIN;

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


COMMIT;
