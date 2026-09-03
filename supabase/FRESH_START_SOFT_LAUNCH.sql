-- =============================================================================
-- TrendsMart — FRESH START (SOFT LAUNCH) — SINGLE FILE FOR FINAL TESTING
-- =============================================================================
--
-- WHAT THIS DOES
--   1) Applies latest schema patches (chat, tokens, ratings, wallets, …)
--   2) WIPES ALL marketplace + auth signup data → blank slate
--   3) Keeps / re-seeds reference catalogs (sub_categories, free ad plans)
--   4) Soft-launch flags: PAID features OFF (fees/tokens not required)
--
-- HOW TO RUN
--   Supabase → SQL Editor → New query → paste ENTIRE file → Run
--
-- PREREQUISITE
--   Core tables must already exist (shops, products, orders, …).
--   If this is a brand-new empty project, FIRST run once:
--     supabase/RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql
--   Then run THIS file.
--
-- ⚠️ IRREVERSIBLE — deletes all shops, products, orders, chats, users, etc.
-- Any city (Gujranwala / Lahore / …) can still register after this wipe.
-- =============================================================================

BEGIN;

-- #############################################################################
-- A) LATEST SCHEMA PATCHES (idempotent)
-- #############################################################################

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Orders realtime
DO $$ BEGIN
  ALTER TABLE public.orders REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Product ratings aggregate columns (if products exists)
DO $$ BEGIN
  ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Notifications: allow type=message (chat was coerced to system → bell spam)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT '',
  p_link_url text DEFAULT '',
  p_entity_id text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL OR p_title IS NULL OR p_title = '' THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link_url, entity_id)
    VALUES (
      p_user_id,
      CASE WHEN p_type IN ('support', 'order', 'sale', 'inquiry', 'message', 'system')
           THEN p_type ELSE 'system' END,
      left(p_title, 160),
      left(COALESCE(p_body, ''), 500),
      left(COALESCE(p_link_url, ''), 300),
      left(COALESCE(p_entity_id, ''), 64)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

DO $$ BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('support', 'order', 'sale', 'inquiry', 'message', 'system'));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Conversations (chat) — create if missing
CREATE TABLE IF NOT EXISTS public.conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name         text NOT NULL DEFAULT '',
  customer_phone        text DEFAULT '',
  order_id              uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  last_message_preview  text NOT NULL DEFAULT '',
  merchant_unread_count int NOT NULL DEFAULT 0,
  customer_unread_count int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_role      text NOT NULL CHECK (sender_role IN ('customer', 'merchant')),
  sender_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body             text NOT NULL,
  is_deleted       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  read_at          timestamptz
);

-- Soft-launch / platform settings
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (key, value) VALUES
  ('soft_launch', jsonb_build_object(
    'paid_features_enabled', false,
    'pitch_city', 'Gujranwala',
    'any_city_accounts_ok', true,
    'free_ads', true,
    'notes', 'Soft launch: fees/tokens disabled. Pitch Gujranwala; Lahore+ accounts still work.'
  ))
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

-- Token wallet tables (exist for later; unused while paid_features_enabled=false)
CREATE TABLE IF NOT EXISTS public.shop_token_wallets (
  shop_id      uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  balance      integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_token_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  delta         integer NOT NULL,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason        text NOT NULL,
  ref_type      text,
  ref_id        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.token_packs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  tokens        integer NOT NULL CHECK (tokens > 0),
  price_pkr     integer NOT NULL CHECK (price_pkr >= 0),
  bonus_tokens  integer NOT NULL DEFAULT 0 CHECK (bonus_tokens >= 0),
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('tokens', 'subscription')),
  provider        text NOT NULL DEFAULT 'manual',
  amount_pkr      integer NOT NULL CHECK (amount_pkr >= 0),
  tokens_credit   integer NOT NULL DEFAULT 0 CHECK (tokens_credit >= 0),
  pack_id         uuid REFERENCES public.token_packs(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'expired')),
  provider_ref    text,
  checkout_url    text,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.promotional_ads
    ADD COLUMN IF NOT EXISTS tokens_spent integer,
    ADD COLUMN IF NOT EXISTS auto_approved_via_tokens boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ad_plan_id uuid,
    ADD COLUMN IF NOT EXISTS price_paid numeric,
    ADD COLUMN IF NOT EXISTS paid_at timestamptz;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Free soft-launch ad publish (0 tokens OK; auto-approve)
CREATE OR REPLACE FUNCTION public.publish_ad_with_tokens(p_ad_id uuid)
RETURNS public.promotional_ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ad public.promotional_ads%ROWTYPE;
  cost integer;
  bal integer;
  new_bal integer;
  owner_ok boolean;
  paid_on boolean;
BEGIN
  SELECT * INTO ad FROM public.promotional_ads WHERE id = p_ad_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ad_not_found'; END IF;
  IF ad.shop_id IS NULL THEN RAISE EXCEPTION 'platform_ad'; END IF;
  IF ad.status = 'approved' THEN RETURN ad; END IF;

  SELECT public.is_shop_owner(ad.shop_id) INTO owner_ok;
  IF NOT owner_ok AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  paid_on := COALESCE(
    (SELECT (value->>'paid_features_enabled')::boolean
       FROM public.platform_settings WHERE key = 'soft_launch'),
    false
  );

  cost := GREATEST(0, COALESCE(ad.price_paid, 0)::integer);

  -- Soft launch OR free plan → approve without charging tokens
  IF (NOT paid_on) OR cost <= 0 THEN
    PERFORM set_config('trendsmart.allow_token_approve', '1', true);
    UPDATE public.promotional_ads
    SET status = 'approved',
        is_active = true,
        tokens_spent = 0,
        auto_approved_via_tokens = true,
        price_paid = 0,
        paid_at = COALESCE(paid_at, now()),
        reviewed_at = now(),
        rejection_reason = NULL
    WHERE id = ad.id
    RETURNING * INTO ad;
    RETURN ad;
  END IF;

  INSERT INTO public.shop_token_wallets (shop_id, balance)
  VALUES (ad.shop_id, 0) ON CONFLICT (shop_id) DO NOTHING;

  SELECT balance INTO bal FROM public.shop_token_wallets WHERE shop_id = ad.shop_id FOR UPDATE;
  IF bal < cost THEN RAISE EXCEPTION 'insufficient_tokens'; END IF;

  UPDATE public.shop_token_wallets
  SET balance = balance - cost, updated_at = now()
  WHERE shop_id = ad.shop_id
  RETURNING balance INTO new_bal;

  INSERT INTO public.shop_token_ledger (shop_id, delta, balance_after, reason, ref_type, ref_id)
  VALUES (ad.shop_id, -cost, new_bal, 'ad_publish', 'promotional_ad', ad.id::text);

  PERFORM set_config('trendsmart.allow_token_approve', '1', true);
  UPDATE public.promotional_ads
  SET status = 'approved', is_active = true, tokens_spent = cost,
      auto_approved_via_tokens = true, paid_at = COALESCE(paid_at, now()),
      reviewed_at = now(), rejection_reason = NULL
  WHERE id = ad.id
  RETURNING * INTO ad;
  RETURN ad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_ad_with_tokens(uuid) TO authenticated, service_role;

-- Guard allows soft-launch / token approve GUC
CREATE OR REPLACE FUNCTION public.guard_promotional_ads_review_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF current_setting('trendsmart.allow_token_approve', true) = '1' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.impression_count := 0;
    NEW.click_count := 0;
    NEW.tokens_spent := NULL;
    NEW.auto_approved_via_tokens := false;
    RETURN NEW;
  END IF;
  NEW.tokens_spent := OLD.tokens_spent;
  NEW.auto_approved_via_tokens := OLD.auto_approved_via_tokens;
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
DO $$ BEGIN
  CREATE TRIGGER trg_guard_promotional_ads_review_fields
    BEFORE INSERT OR UPDATE ON public.promotional_ads
    FOR EACH ROW EXECUTE FUNCTION public.guard_promotional_ads_review_fields();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.credit_shop_tokens(
  p_shop_id uuid, p_tokens integer, p_reason text,
  p_ref_type text DEFAULT NULL, p_ref_id text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_bal integer;
BEGIN
  IF p_shop_id IS NULL OR p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'invalid_credit';
  END IF;
  INSERT INTO public.shop_token_wallets (shop_id, balance)
  VALUES (p_shop_id, 0) ON CONFLICT (shop_id) DO NOTHING;
  UPDATE public.shop_token_wallets
  SET balance = balance + p_tokens, updated_at = now()
  WHERE shop_id = p_shop_id RETURNING balance INTO new_bal;
  INSERT INTO public.shop_token_ledger (shop_id, delta, balance_after, reason, ref_type, ref_id)
  VALUES (p_shop_id, p_tokens, new_bal, COALESCE(NULLIF(p_reason, ''), 'credit'), p_ref_type, p_ref_id);
  RETURN new_bal;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_shop_tokens(uuid, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_shop_tokens(uuid, integer, text, text, text) TO service_role;

COMMIT;

-- #############################################################################
-- B) NUCLEAR WIPE — all business + auth data
-- #############################################################################

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN (
         'conversation_messages','conversations','customer_inquiries',
         'shops','products','inventory_variants','service_packages',
         'service_portfolio','service_availability','orders','leads',
         'reviews','customer_wishlists','favorite_stores',
         'coupons','stories','story_views','analytics_logs','finance_entries',
         'customer_addresses','merchant_subscriptions','billing_invoices',
         'subscription_audit_log','admin_audit_logs','security_audit_log',
         'push_subscriptions','notifications','support_tickets',
         'promotional_ads','maintenance_logs','orders_archive',
         'dine_in_tables','dine_in_orders','shop_deals','shop_deal_products',
         'shop_token_wallets','shop_token_ledger','payment_orders',
         'email_verification_otps','auth_otps','legal_acceptances',
         'user_roles','user_profiles'
       )
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
  END LOOP;
END $$;

-- Wipe auth (fresh accounts on next signup)
DO $$
BEGIN
  DELETE FROM auth.identities;
  DELETE FROM auth.refresh_tokens;
  DELETE FROM auth.sessions;
  BEGIN DELETE FROM auth.mfa_amr_claims; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_challenges; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_factors; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM auth.one_time_tokens; EXCEPTION WHEN undefined_table THEN NULL; END;
  DELETE FROM auth.users;
END $$;

-- #############################################################################
-- C) REFERENCE SEEDS (catalogs — NOT store data)
-- #############################################################################

-- Expand placement check to match app (home / deals / products / store).
DO $$
BEGIN
  ALTER TABLE public.ad_plans DROP CONSTRAINT IF EXISTS ad_plans_placement_check;
  ALTER TABLE public.ad_plans
    ADD CONSTRAINT ad_plans_placement_check
    CHECK (placement IN (
      'homepage_top', 'homepage_feed', 'deals_top', 'products_top', 'store_top'
    ));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.promotional_ads DROP CONSTRAINT IF EXISTS promotional_ads_placement_check;
  ALTER TABLE public.promotional_ads
    ADD CONSTRAINT promotional_ads_placement_check
    CHECK (placement IN (
      'homepage_top', 'homepage_feed', 'deals_top', 'products_top', 'store_top'
    ));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Free soft-launch ad plans (price 0 → instant publish)
INSERT INTO public.ad_plans (name, placement, duration_days, price, description, is_active, sort_order)
SELECT v.name, v.placement, v.duration_days, v.price, v.description, true, v.sort_order
FROM (VALUES
  ('Soft Launch — Home (Free)', 'homepage_top', 30, 0,
   'Free during soft launch. Go live instantly.', 1),
  ('Soft Launch — Deals (Free)', 'deals_top', 30, 0,
   'Free during soft launch.', 2),
  ('Soft Launch — Products (Free)', 'products_top', 30, 0,
   'Free during soft launch.', 3),
  ('Soft Launch — Store (Free)', 'store_top', 30, 0,
   'Free during soft launch.', 4)
) AS v(name, placement, duration_days, price, description, sort_order)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ad_plans')
  AND NOT EXISTS (SELECT 1 FROM public.ad_plans a WHERE a.name = v.name);

-- Deactivate old paid plans during soft launch (keep rows for history)
UPDATE public.ad_plans
   SET is_active = false
 WHERE price > 0
   AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ad_plans');

-- Token packs dormant (inactive) until paid features re-enabled
INSERT INTO public.token_packs (name, tokens, price_pkr, bonus_tokens, is_active, sort_order)
SELECT v.name, v.tokens, v.price_pkr, v.bonus_tokens, false, v.sort_order
FROM (VALUES
  ('Starter Pack', 500, 500, 0, 1),
  ('Popular Pack', 1200, 1000, 200, 2),
  ('Pro Pack', 3000, 2500, 500, 3)
) AS v(name, tokens, price_pkr, bonus_tokens, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.token_packs t WHERE t.name = v.name);

UPDATE public.token_packs SET is_active = false;

-- Soft-launch settings again (after wipe of nothing — platform_settings not truncated)
INSERT INTO public.platform_settings (key, value) VALUES
  ('soft_launch', jsonb_build_object(
    'paid_features_enabled', false,
    'pitch_city', 'Gujranwala',
    'any_city_accounts_ok', true,
    'free_ads', true
  ))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Done notice
DO $$
BEGIN
  RAISE NOTICE 'TrendsMart FRESH START complete. Soft launch: paid OFF. Sign up new accounts and test.';
END $$;
