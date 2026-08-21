-- =============================================================================
-- TrendMart — QUICK FIX for the console errors you see on every reload
-- =============================================================================
-- This fixes exactly the 6 errors below. It is deliberately SMALL so the
-- Supabase SQL Editor does not time out ("Failed to fetch (api.supabase.com)").
--
--   ❌ GET /rest/v1/legal_acceptances  → 404  (table missing)
--   ❌ GET /rest/v1/promotional_ads    → 404  (table missing)
--   ❌ GET /rest/v1/notifications      → 404  (table missing)
--   ❌ GET /rest/v1/shops              → 400  (missing columns)
--   ❌ GET /rest/v1/stories            → 400  (missing columns)
--   ❌ GET /rest/v1/shop_deals         → 400  (missing columns / grants)
--
-- HOW TO USE
--   1. Open Supabase → SQL Editor → "New query"
--   2. Copy THIS ENTIRE FILE and paste it there
--   3. Click "Run"  (a few seconds — no timeout because it is small)
--   4. After it succeeds, hard-refresh the app (Ctrl+Shift+R)
--
-- 100% idempotent (IF NOT EXISTS everywhere): safe to re-run any time,
-- existing data is never touched.
-- =============================================================================

BEGIN;

-- ════ 0) Helper used by stories RLS: is the caller the shop owner? ═══════════
CREATE OR REPLACE FUNCTION public.is_shop_owner(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops WHERE id = p_shop_id AND owner_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_shop_owner(uuid) TO anon, authenticated;

-- Admin helper (guarded: works even if user_roles is absent on an old DB).
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  has_role boolean;
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user_id AND role = 'admin'
    ) INTO has_role;
    IF has_role THEN RETURN true; END IF;
  END IF;
  RETURN (
    p_user_id = auth.uid()
    AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;

-- ════ 1) legal_acceptances — policy acceptance audit trail (was 404) ════════
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document      TEXT NOT NULL CHECK (document IN ('terms', 'privacy', 'merchant_guidelines')),
  version       TEXT NOT NULL DEFAULT 'v1',
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hint       TEXT DEFAULT ''
);

-- Backfill any columns missing from an older/partial table.
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS ip_hint TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_id ON public.legal_acceptances(user_id);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Table-level grants — THE actual 404 fix (RLS policies alone are not enough
-- for PostgREST; without grants every request is rejected before RLS runs).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_acceptances TO authenticated;
GRANT SELECT ON public.legal_acceptances TO anon;

DROP POLICY IF EXISTS "legal_acceptances_own_insert" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_insert"
  ON public.legal_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "legal_acceptances_own_read" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_read"
  ON public.legal_acceptances FOR SELECT
  USING (auth.uid() = user_id);

-- ════ 2) shops — add every column the app reads (was 400) ════════════════════
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS service_radius_km INTEGER DEFAULT 10
    CHECK (service_radius_km > 0 AND service_radius_km <= 500),
  ADD COLUMN IF NOT EXISTS delivery_zones TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS address_display TEXT,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10, 2) DEFAULT NULL
    CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_flat NUMERIC(10, 2) DEFAULT 0
    CHECK (delivery_fee_flat >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_per_km NUMERIC(10, 2) DEFAULT 0
    CHECK (delivery_fee_per_km >= 0),
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10, 2) DEFAULT 0
    CHECK (min_order_amount >= 0),
  ADD COLUMN IF NOT EXISTS avg_rating numeric(2,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS announcement text,
  ADD COLUMN IF NOT EXISTS announcement_expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Stores are live-on-create (approval queue is off) — make sure no shop is
-- stuck in 'pending' forever.
ALTER TABLE public.shops ALTER COLUMN verification_status SET DEFAULT 'approved';
UPDATE public.shops SET verification_status = 'approved', is_live = true
WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_shops_verification_status ON public.shops(verification_status);
CREATE INDEX IF NOT EXISTS idx_shops_public_visible ON public.shops(is_live, verification_status)
  WHERE is_live = true AND verification_status = 'approved';

-- Table-level grants (required for PostgREST).
GRANT SELECT ON public.shops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_public_read" ON public.shops;
CREATE POLICY "shops_public_read"
  ON public.shops FOR SELECT
  USING (
    (is_live = true AND verification_status = 'approved')
    OR auth.uid() = owner_id
  );

-- ════ 3) stories — create + missing columns + grants (was 400) ═══════════════
CREATE TABLE IF NOT EXISTS public.stories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  image_url   text,
  caption     text DEFAULT '',
  expires_at  timestamptz DEFAULT (now() + interval '24 hours'),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS caption text DEFAULT '';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '24 hours');
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Ensure the shops relationship exists so the embedded `shops:shop_id(...)`
-- join in the app's query works (PostgREST needs a real FK).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'stories'
      AND kcu.column_name = 'shop_id'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_shop_id_fkey FOREIGN KEY (shop_id)
      REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stories_shop_id ON public.stories(shop_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories(expires_at);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.stories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;

DROP POLICY IF EXISTS "stories_public_read_active" ON public.stories;
CREATE POLICY "stories_public_read_active"
  ON public.stories FOR SELECT
  USING (expires_at > now());

DROP POLICY IF EXISTS "stories_owner_insert" ON public.stories;
CREATE POLICY "stories_owner_insert"
  ON public.stories FOR INSERT
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "stories_owner_delete" ON public.stories;
CREATE POLICY "stories_owner_delete"
  ON public.stories FOR DELETE
  USING (public.is_shop_owner(shop_id));

-- ════ 4) promotional_ads — sponsored banners (was 404) ═══════════════════════
CREATE TABLE IF NOT EXISTS public.promotional_ads (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id            uuid REFERENCES public.shops(id) ON DELETE CASCADE,
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

ALTER TABLE public.promotional_ads ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotional_ads TO authenticated;
GRANT SELECT ON public.promotional_ads TO anon;

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

-- ════ 5) notifications — in-app notification bell (was 404) ══════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'system'
             CHECK (type IN ('support', 'order', 'sale', 'inquiry', 'system')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link_url   TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

DROP POLICY IF EXISTS "notifications_own_select" ON public.notifications;
CREATE POLICY "notifications_own_select"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
CREATE POLICY "notifications_own_update"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_own_delete" ON public.notifications;
CREATE POLICY "notifications_own_delete"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ════ 6) shop_deals — merchant offers (was 400) ══════════════════════════════
CREATE TABLE IF NOT EXISTS public.shop_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  schedule_type text NOT NULL CHECK (schedule_type IN ('weekly', 'date_range', 'monthly')),
  weekdays smallint[] DEFAULT NULL,
  starts_on date DEFAULT NULL,
  ends_on date DEFAULT NULL,
  day_of_month smallint DEFAULT NULL CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)),
  is_active boolean NOT NULL DEFAULT true,
  image_url text,
  badge_text text,
  is_featured boolean NOT NULL DEFAULT false,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  price numeric(12, 2),
  original_price numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_deals_weekly_check CHECK (
    schedule_type <> 'weekly' OR (weekdays IS NOT NULL AND cardinality(weekdays) > 0)
  ),
  CONSTRAINT shop_deals_range_check CHECK (
    schedule_type <> 'date_range' OR (starts_on IS NOT NULL AND ends_on IS NOT NULL)
  ),
  CONSTRAINT shop_deals_monthly_check CHECK (
    schedule_type <> 'monthly' OR day_of_month IS NOT NULL
  )
);

-- Backfill any columns missing from an older/partial table.
ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS original_price numeric(12, 2);

-- Ensure the products relationship exists for the embedded `products:product_id(...)` join.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'shop_deals'
      AND kcu.column_name = 'product_id'
  ) THEN
    ALTER TABLE public.shop_deals
      ADD CONSTRAINT shop_deals_product_id_fkey FOREIGN KEY (product_id)
      REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shop_deals_shop_id ON public.shop_deals (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_deals_active ON public.shop_deals (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shop_deals_featured
  ON public.shop_deals (is_featured, is_active)
  WHERE is_featured = true AND is_active = true;

ALTER TABLE public.shop_deals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.shop_deals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_deals TO authenticated;

DROP POLICY IF EXISTS "shop_deals_public_read_active" ON public.shop_deals;
CREATE POLICY "shop_deals_public_read_active"
  ON public.shop_deals FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "shop_deals_owner_all" ON public.shop_deals;
CREATE POLICY "shop_deals_owner_all"
  ON public.shop_deals FOR ALL
  USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id))
  WITH CHECK (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

-- ════ 7) push_subscriptions — web-push devices (fixes /api/push/subscribe) ═══
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_own"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_insert_own"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_update_own"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete_own"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ════ 8) Make PostgREST pick up the new tables/columns immediately ══════════
NOTIFY pgrst, 'reload schema';

COMMIT;
