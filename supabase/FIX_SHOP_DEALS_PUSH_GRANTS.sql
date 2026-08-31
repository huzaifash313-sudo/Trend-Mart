-- =============================================================================
-- TrendsMart — Fix shop_deals + push_subscriptions REST permissions
-- =============================================================================
-- Symptoms:
--   • GET /rest/v1/shop_deals?select=*&is_active=eq.true → 404 (Not Found)
--   • POST /api/push/subscribe → 500 (Internal Server Error)
--
-- Root cause: public.shop_deals and public.push_subscriptions were created
-- with RLS policies but WITHOUT table-level GRANTs to anon/authenticated.
-- PostgREST rejects every request before RLS can even run (same bug that hit
-- promotional_ads — see 20260819010000_fix_promotional_ads_grants.sql), so the
-- homepage deals feed 404s and the web-push subscribe endpoint 500s.
--
-- This script is idempotent: it also creates both tables + columns if they are
-- missing entirely, so it works whether the tables exist or not.
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1) shop_deals ─────────────────────────────────────────────────────────────
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

-- Columns that arrived in later migrations (idempotent no-ops if present).
ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS badge_text text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS original_price numeric(12, 2);

CREATE INDEX IF NOT EXISTS idx_shop_deals_shop_id ON public.shop_deals (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_deals_active ON public.shop_deals (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_shop_deals_featured
  ON public.shop_deals (is_featured, is_active)
  WHERE is_featured = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_shop_deals_product_id
  ON public.shop_deals (product_id)
  WHERE product_id IS NOT NULL;

-- Table-level grants — THE ACTUAL FIX. Without these PostgREST returns 404.
GRANT SELECT ON public.shop_deals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_deals TO authenticated;

-- RLS + policies (safe to re-run).
ALTER TABLE public.shop_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_deals_public_read_active" ON public.shop_deals;
CREATE POLICY "shop_deals_public_read_active"
  ON public.shop_deals FOR SELECT
  USING (is_active = true OR auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

DROP POLICY IF EXISTS "shop_deals_owner_all" ON public.shop_deals;
CREATE POLICY "shop_deals_owner_all"
  ON public.shop_deals FOR ALL
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- ── 2) push_subscriptions ─────────────────────────────────────────────────────
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

-- Table-level grants — THE ACTUAL FIX. Without these upsert 500s.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- RLS + policies (safe to re-run).
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

-- ── 3) Refresh PostgREST schema cache so the new grants take effect
--       immediately — no API restart or cache wait needed.
NOTIFY pgrst, 'reload schema';

COMMIT;
