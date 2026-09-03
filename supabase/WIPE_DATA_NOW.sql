-- =============================================================================
-- TrendsMart — FULL WIPE (shops + products + ALL users + everything)
-- =============================================================================
-- Supabase SQL Editor mein yeh poori file RUN karo.
-- Schema / tables structure rehti hai — sirf DATA udti hai.
--
-- Deletes:
--   • auth.users (saare customers, merchants, admins — login accounts)
--   • sessions, identities, refresh tokens, OTPs
--   • shops, products, orders, deals, ads, chats, notifications, wallets…
-- Keeps:
--   • table structure
--   • sub_categories + platform_settings (taxonomy / soft-launch flags)
-- =============================================================================

-- 1) Fix placement check FIRST
ALTER TABLE public.ad_plans DROP CONSTRAINT IF EXISTS ad_plans_placement_check;
ALTER TABLE public.ad_plans
  ADD CONSTRAINT ad_plans_placement_check
  CHECK (placement IN (
    'homepage_top', 'homepage_feed', 'deals_top', 'products_top', 'store_top'
  ));

DO $$ BEGIN
  ALTER TABLE public.promotional_ads DROP CONSTRAINT IF EXISTS promotional_ads_placement_check;
  ALTER TABLE public.promotional_ads
    ADD CONSTRAINT promotional_ads_placement_check
    CHECK (placement IN (
      'homepage_top', 'homepage_feed', 'deals_top', 'products_top', 'store_top'
    ));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 2) Truncate EVERY public business table (CASCADE = child rows too)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT IN (
         'sub_categories',
         'platform_settings',
         'spatial_ref_sys',
         'geometry_columns',
         'geography_columns'
       )
       AND tablename NOT LIKE 'pg\_%'
  LOOP
    BEGIN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.tablename);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %: %', r.tablename, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE '[OK] Public tables wiped (incl. user_profiles / roles / wallets).';
END $$;

-- 3) Wipe ALL auth users (must run after public truncate)
DO $$
BEGIN
  BEGIN DELETE FROM auth.refresh_tokens;  EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN RAISE NOTICE 'auth.refresh_tokens: no privilege'; END;
  BEGIN DELETE FROM auth.sessions;        EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN RAISE NOTICE 'auth.sessions: no privilege'; END;
  BEGIN DELETE FROM auth.mfa_amr_claims;  EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_challenges;  EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_factors;     EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.one_time_tokens; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.identities;      EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN RAISE NOTICE 'auth.identities: no privilege'; END;
  BEGIN DELETE FROM auth.users;           EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN RAISE EXCEPTION 'Cannot delete auth.users — use service role / SQL Editor as postgres'; END;
  RAISE NOTICE '[OK] All auth users deleted.';
END $$;

-- Optional: clear uploaded files in Storage (ignore if no access)
DO $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id IN ('shops', 'products', 'avatars', 'ads', 'stories', 'uploads');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'storage wipe skipped: %', SQLERRM;
END $$;

-- 4) Soft-launch free ad plans (blank marketplace config)
INSERT INTO public.ad_plans (name, placement, duration_days, price, description, is_active, sort_order)
SELECT v.name, v.placement, v.duration_days, v.price, v.description, true, v.sort_order
FROM (VALUES
  ('Soft Launch — Home (Free)', 'homepage_top', 30, 0, 'Free during soft launch.', 1),
  ('Soft Launch — Deals (Free)', 'deals_top', 30, 0, 'Free during soft launch.', 2),
  ('Soft Launch — Products (Free)', 'products_top', 30, 0, 'Free during soft launch.', 3),
  ('Soft Launch — Store (Free)', 'store_top', 30, 0, 'Free during soft launch.', 4)
) AS v(name, placement, duration_days, price, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.ad_plans a WHERE a.name = v.name);

UPDATE public.ad_plans SET is_active = false WHERE price > 0;
UPDATE public.token_packs SET is_active = false WHERE true;

INSERT INTO public.platform_settings (key, value) VALUES
  ('soft_launch', jsonb_build_object(
    'paid_features_enabled', false,
    'pitch_city', 'Gujranwala',
    'any_city_accounts_ok', true,
    'free_ads', true
  ))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 5) Prove wipe worked — shops AND users must be 0
DO $$
DECLARE
  n_shops int;
  n_users int;
  n_profiles int := 0;
BEGIN
  SELECT count(*) INTO n_shops FROM public.shops;
  SELECT count(*) INTO n_users FROM auth.users;

  BEGIN
    SELECT count(*) INTO n_profiles FROM public.user_profiles;
  EXCEPTION WHEN undefined_table THEN
    n_profiles := 0;
  END;

  RAISE NOTICE 'shops remaining     = % (must be 0)', n_shops;
  RAISE NOTICE 'auth.users remaining = % (must be 0)', n_users;
  RAISE NOTICE 'user_profiles remaining = % (must be 0)', n_profiles;

  IF n_shops > 0 THEN
    RAISE EXCEPTION 'WIPE FAILED — % shops still exist', n_shops;
  END IF;
  IF n_users > 0 THEN
    RAISE EXCEPTION 'WIPE FAILED — % auth users still exist (login accounts not cleared)', n_users;
  END IF;
  IF n_profiles > 0 THEN
    RAISE EXCEPTION 'WIPE FAILED — % user_profiles still exist', n_profiles;
  END IF;

  RAISE NOTICE 'FULL WIPE OK — blank platform. Fresh signups only.';
END $$;
