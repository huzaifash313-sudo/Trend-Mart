-- =============================================================================
-- TrendsMart — Token wallet + payment orders + token auto-approve for ads
-- =============================================================================
-- • Merchants buy affordable token packs (1 token ≈ Rs 1).
-- • Spending tokens on an ad plan auto-approves the ad (no admin queue wait).
-- • First-month free trial stays on merchant_subscriptions (app-side).
-- Idempotent — safe to re-run in Supabase SQL editor.
-- =============================================================================

-- 1) Wallet per shop ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_token_wallets (
  shop_id      uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  balance      integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_token_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_wallets_owner_read" ON public.shop_token_wallets;
CREATE POLICY "token_wallets_owner_read"
  ON public.shop_token_wallets FOR SELECT
  USING (public.is_shop_owner(shop_id) OR public.is_admin());

DROP POLICY IF EXISTS "token_wallets_admin_all" ON public.shop_token_wallets;
CREATE POLICY "token_wallets_admin_all"
  ON public.shop_token_wallets FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.shop_token_wallets TO authenticated;

-- 2) Ledger --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_token_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  delta        integer NOT NULL,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason       text NOT NULL,
  ref_type     text,
  ref_id       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_shop_created
  ON public.shop_token_ledger(shop_id, created_at DESC);

ALTER TABLE public.shop_token_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_ledger_owner_read" ON public.shop_token_ledger;
CREATE POLICY "token_ledger_owner_read"
  ON public.shop_token_ledger FOR SELECT
  USING (public.is_shop_owner(shop_id) OR public.is_admin());

GRANT SELECT ON public.shop_token_ledger TO authenticated;

-- 3) Token packs catalog -------------------------------------------------------
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

ALTER TABLE public.token_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_packs_public_read" ON public.token_packs;
CREATE POLICY "token_packs_public_read"
  ON public.token_packs FOR SELECT
  USING (is_active = true OR public.is_admin());

GRANT SELECT ON public.token_packs TO anon, authenticated;

INSERT INTO public.token_packs (name, tokens, price_pkr, bonus_tokens, is_active, sort_order)
SELECT v.name, v.tokens, v.price_pkr, v.bonus_tokens, true, v.sort_order
FROM (VALUES
  ('Starter Pack',   500,  500,   0, 1),
  ('Popular Pack',  1200, 1000, 200, 2),
  ('Pro Pack',      3000, 2500, 500, 3)
) AS v(name, tokens, price_pkr, bonus_tokens, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.token_packs t WHERE t.name = v.name);

-- 4) Payment orders (subscription + tokens) ------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('tokens', 'subscription')),
  provider        text NOT NULL DEFAULT 'manual'
                    CHECK (provider IN ('manual', 'jazzcash', 'easypaisa', 'stripe', 'sandbox')),
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

CREATE INDEX IF NOT EXISTS idx_payment_orders_shop ON public.payment_orders(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON public.payment_orders(status);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_orders_owner_read" ON public.payment_orders;
CREATE POLICY "payment_orders_owner_read"
  ON public.payment_orders FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "payment_orders_admin_all" ON public.payment_orders;
CREATE POLICY "payment_orders_admin_all"
  ON public.payment_orders FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.payment_orders TO authenticated;

-- 5) Ad columns for token spend ------------------------------------------------
ALTER TABLE public.promotional_ads
  ADD COLUMN IF NOT EXISTS tokens_spent integer,
  ADD COLUMN IF NOT EXISTS auto_approved_via_tokens boolean NOT NULL DEFAULT false;

-- Soften seeded ad prices (affordable PK market) if still at old defaults.
UPDATE public.ad_plans SET price = 299, description = 'One week homepage spotlight — ~299 tokens.'
WHERE name = 'Starter Banner — 7 Days' AND price >= 350;
UPDATE public.ad_plans SET price = 799, description = 'Full month homepage visibility — ~799 tokens.'
WHERE name = 'Popular Banner — 1 Month' AND price >= 1000;
UPDATE public.ad_plans SET price = 1199, description = 'Premium first-slot month — ~1199 tokens.'
WHERE name = 'Premium Top Spot — 1 Month' AND price >= 1500;

INSERT INTO public.ad_plans (name, placement, duration_days, price, description, is_active, sort_order)
SELECT v.name, v.placement, v.duration_days, v.price, v.description, true, v.sort_order
FROM (VALUES
  ('Deals Page Banner — 7 Days', 'deals_top', 7, 249,
   'Spotlight on the deals page for a week.', 4),
  ('Products Page Banner — 7 Days', 'products_top', 7, 249,
   'Spotlight on the products browse page for a week.', 5)
) AS v(name, placement, duration_days, price, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.ad_plans a WHERE a.name = v.name);

-- 6) Credit tokens (SECURITY DEFINER — called from payment webhook / sandbox) --
CREATE OR REPLACE FUNCTION public.credit_shop_tokens(
  p_shop_id uuid,
  p_tokens integer,
  p_reason text,
  p_ref_type text DEFAULT NULL,
  p_ref_id text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_bal integer;
BEGIN
  IF p_shop_id IS NULL OR p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'invalid_credit';
  END IF;

  INSERT INTO public.shop_token_wallets (shop_id, balance)
  VALUES (p_shop_id, 0)
  ON CONFLICT (shop_id) DO NOTHING;

  UPDATE public.shop_token_wallets
  SET balance = balance + p_tokens, updated_at = now()
  WHERE shop_id = p_shop_id
  RETURNING balance INTO new_bal;

  INSERT INTO public.shop_token_ledger (shop_id, delta, balance_after, reason, ref_type, ref_id)
  VALUES (p_shop_id, p_tokens, new_bal, COALESCE(NULLIF(p_reason, ''), 'credit'), p_ref_type, p_ref_id);

  RETURN new_bal;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_shop_tokens(uuid, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_shop_tokens(uuid, integer, text, text, text) TO service_role;

-- 7) Publish ad by spending tokens (merchant-callable) -------------------------
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
BEGIN
  SELECT * INTO ad FROM public.promotional_ads WHERE id = p_ad_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ad_not_found';
  END IF;
  IF ad.shop_id IS NULL THEN
    RAISE EXCEPTION 'platform_ad';
  END IF;
  IF ad.status = 'approved' AND COALESCE(ad.auto_approved_via_tokens, false) THEN
    RETURN ad;
  END IF;
  IF ad.status = 'approved' THEN
    RAISE EXCEPTION 'already_approved';
  END IF;

  SELECT public.is_shop_owner(ad.shop_id) INTO owner_ok;
  IF NOT owner_ok AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  cost := GREATEST(0, COALESCE(ad.price_paid, 0)::integer);
  IF cost <= 0 THEN
    RAISE EXCEPTION 'missing_plan_price';
  END IF;

  INSERT INTO public.shop_token_wallets (shop_id, balance)
  VALUES (ad.shop_id, 0)
  ON CONFLICT (shop_id) DO NOTHING;

  SELECT balance INTO bal FROM public.shop_token_wallets WHERE shop_id = ad.shop_id FOR UPDATE;
  IF bal < cost THEN
    RAISE EXCEPTION 'insufficient_tokens';
  END IF;

  UPDATE public.shop_token_wallets
  SET balance = balance - cost, updated_at = now()
  WHERE shop_id = ad.shop_id
  RETURNING balance INTO new_bal;

  INSERT INTO public.shop_token_ledger (shop_id, delta, balance_after, reason, ref_type, ref_id)
  VALUES (ad.shop_id, -cost, new_bal, 'ad_publish', 'promotional_ad', ad.id::text);

  -- Allow guard trigger to accept this auto-approve.
  PERFORM set_config('trendsmart.allow_token_approve', '1', true);

  UPDATE public.promotional_ads
  SET
    status = 'approved',
    is_active = true,
    tokens_spent = cost,
    auto_approved_via_tokens = true,
    paid_at = COALESCE(paid_at, now()),
    reviewed_at = now(),
    rejection_reason = NULL
  WHERE id = ad.id
  RETURNING * INTO ad;

  RETURN ad;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_ad_with_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_ad_with_tokens(uuid) TO authenticated, service_role;

-- 8) Guard: allow token auto-approve path --------------------------------------
CREATE OR REPLACE FUNCTION public.guard_promotional_ads_review_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Token auto-publish (session GUC set only inside publish_ad_with_tokens).
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

  -- Merchants cannot forge token spend / auto-approve fields.
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
CREATE TRIGGER trg_guard_promotional_ads_review_fields
  BEFORE INSERT OR UPDATE ON public.promotional_ads
  FOR EACH ROW EXECUTE FUNCTION public.guard_promotional_ads_review_fields();

-- Ensure every existing shop has a wallet row (0 balance).
INSERT INTO public.shop_token_wallets (shop_id, balance)
SELECT s.id, 0 FROM public.shops s
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_token_wallets w WHERE w.shop_id = s.id
);
