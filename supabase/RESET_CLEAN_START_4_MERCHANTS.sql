-- =============================================================================
-- TrendMart — FULL DATA RESET + 4 VERIFIED MERCHANT ACCOUNTS ONLY
-- =============================================================================
--
-- WHAT THIS DOES
-- --------------
--   1. Wipes ALL public app data (shops, products, orders, stories, etc.)
--   2. Deletes ALL auth users / sessions / identities
--   3. Creates EXACTLY these 4 merchants (email already verified):
--        • huzaifash313@gmail.com
--        • huzzi11266@gmail.com
--        • huzaiffa12344321@gmail.com
--        • abdwhaw99@gmail.com
--   4. Password for ALL FOUR: Huzaifash1133@
--   5. Leaves schema / columns / RLS / functions untouched
--   6. Does NOT create any shops, products, coupons, stories, or demo rows
--
-- HOW TO USE
-- ----------
--   A) First ensure schema exists:
--        Run: supabase/RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql  (once)
--   B) Then run THIS file in Supabase → SQL Editor → Run
--
-- Safe to re-run: it always wipes data and recreates only these 4 users.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Wipe every public table (keeps table definitions / columns / policies)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT
    'TRUNCATE TABLE '
      || string_agg(format('public.%I', tablename), ', ')
      || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public';

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
    RAISE NOTICE '✅ Public tables truncated.';
  ELSE
    RAISE NOTICE '⚠️ No public tables found to truncate.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Wipe auth (sessions, identities, all users)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Best-effort clears for tables that may/may not exist across Supabase versions
  BEGIN DELETE FROM auth.refresh_tokens; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.sessions; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_challenges; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_factors; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.one_time_tokens; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.identities; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.users; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE '✅ Auth users / sessions cleared.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Create the 4 verified merchant users
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_password constant text := 'Huzaifash1133@';
  v_hash text := crypt(v_password, gen_salt('bf'));
  v_instance uuid := '00000000-0000-0000-0000-000000000000';

  -- Stable IDs so re-runs stay predictable
  u1 uuid := 'a1111111-1111-4111-8111-111111111111';
  u2 uuid := 'a2222222-2222-4222-8222-222222222222';
  u3 uuid := 'a3333333-3333-4333-8333-333333333333';
  u4 uuid := 'a4444444-4444-4444-8444-444444444444';

  r record;
BEGIN
  -- Create users
  FOR r IN
    SELECT * FROM (VALUES
      (u1, 'huzaifash313@gmail.com'::text, 'Huzaifa'),
      (u2, 'huzzi11266@gmail.com'::text, 'Huzzi'),
      (u3, 'huzaiffa12344321@gmail.com'::text, 'Huzaiffa'),
      (u4, 'abdwhaw99@gmail.com'::text, 'Abdullah')
    ) AS t(id, email, display_name)
  LOOP
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      phone_change,
      phone_change_token,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at
    ) VALUES (
      v_instance,
      r.id,
      'authenticated',
      'authenticated',
      lower(r.email),
      v_hash,
      now(),                 -- email auto-verified
      NULL,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'merchant', 'full_name', r.display_name),
      false,
      now(),
      now()
    );

    -- Newer Supabase columns (ignore if missing)
    BEGIN
      UPDATE auth.users
      SET is_sso_user = false
      WHERE id = r.id AND is_sso_user IS DISTINCT FROM false;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    BEGIN
      UPDATE auth.users
      SET is_anonymous = false
      WHERE id = r.id AND is_anonymous IS DISTINCT FROM false;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;

    -- Email identity (required for password login)
    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        r.id,
        jsonb_build_object(
          'sub', r.id::text,
          'email', lower(r.email),
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        r.id::text,
        now(),
        now(),
        now()
      );
    EXCEPTION WHEN undefined_column THEN
      -- Older schemas without provider_id
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        r.id,
        jsonb_build_object(
          'sub', r.id::text,
          'email', lower(r.email),
          'email_verified', true
        ),
        'email',
        now(),
        now(),
        now()
      );
    END;

    -- App role = merchant (trigger may have inserted customer — force merchant)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.id, 'merchant')
    ON CONFLICT (user_id) DO UPDATE SET role = 'merchant', updated_at = now();

    -- Empty profile shell (no shop yet)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_profiles'
    ) THEN
      INSERT INTO public.user_profiles (user_id, full_name, updated_at)
      VALUES (r.id, r.display_name, now())
      ON CONFLICT (user_id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            updated_at = now();
    END IF;

    RAISE NOTICE 'Merchant ready: %', lower(r.email);
  END LOOP;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Verification (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  user_count integer;
  shop_count integer;
  product_count integer;
  role_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users;
  SELECT count(*) INTO role_count FROM public.user_roles WHERE role = 'merchant';
  SELECT count(*) INTO shop_count FROM public.shops;
  SELECT count(*) INTO product_count FROM public.products;

  RAISE NOTICE '────────────────────────────────────────';
  RAISE NOTICE 'TrendMart clean start complete';
  RAISE NOTICE '  auth.users          = % (expect 4)', user_count;
  RAISE NOTICE '  merchant roles      = % (expect 4)', role_count;
  RAISE NOTICE '  shops               = % (expect 0)', shop_count;
  RAISE NOTICE '  products            = % (expect 0)', product_count;
  RAISE NOTICE '  password (all four) = Huzaifash1133@';
  RAISE NOTICE '────────────────────────────────────────';

  IF user_count <> 4 OR role_count <> 4 OR shop_count <> 0 THEN
    RAISE WARNING 'Counts did not match expectations — review notices above.';
  END IF;
END $$;

-- Login emails (all password: Huzaifash1133@):
--   huzaifash313@gmail.com
--   huzzi11266@gmail.com
--   huzaiffa12344321@gmail.com
--   abdwhaw99@gmail.com
