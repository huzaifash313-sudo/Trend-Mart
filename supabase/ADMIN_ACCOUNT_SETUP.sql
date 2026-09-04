-- =============================================================================
-- TrendsMart — Super Admin Account Setup
-- =============================================================================
-- Paste into:  Supabase → SQL Editor → Run  (as postgres / service role)
-- Creates (or safely resets) a Super Admin you can log in with.
--
-- HOW IT WORKS
--   • Creates a real auth.users row (email + bcrypt password).
--   • Marks the email confirmed so sign-in skips OTP.
--   • Sets app_metadata.role = 'admin'  → sign-in response returns role=admin.
--   • Upserts public.user_roles = 'admin' → all is_admin() RLS checks pass.
--   • Upserts public.user_profiles so the name shows in the UI.
--
-- SAFE TO RE-RUN: finds the user by email first; updates instead of duplicating.
-- =============================================================================

-- ⚠️  EDIT THESE 3 VALUES BELOW BEFORE RUNNING ⚠️
--   v_email    → your admin login email
--   v_password → a strong password (min 8 chars)
--   v_fullname → display name (optional)
-- ⚠️  Then delete this warning block mentally and run. ⚠️

-- pgcrypto gives us crypt() + gen_salt() for bcrypt password hashing.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_email    text := 'admin@trendsmart.pk';   -- ← EDIT: admin email
  v_password text := 'Admin@12345';            -- ← EDIT: strong password
  v_fullname text := 'Super Admin';            -- ← EDIT: display name
  v_phone    text := '03000000000';
  v_id       uuid;
BEGIN
  -- 1) Find the user if it already exists (idempotent).
  SELECT id INTO v_id
  FROM auth.users
  WHERE email = lower(v_email)
  LIMIT 1;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_id,
      'authenticated',
      'authenticated',
      lower(v_email),
      crypt(v_password, gen_salt('bf', 10)),
      now(),
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'role', 'admin'
      ),
      jsonb_build_object('role', 'admin', 'full_name', v_fullname),
      now(),
      now()
    );
  ELSE
    -- Existing user: reset password + confirm email + re-assert admin metadata
    -- so this script always leaves you with a working admin login.
    UPDATE auth.users
    SET encrypted_password  = crypt(v_password, gen_salt('bf', 10)),
        email_confirmed_at = now(),
        raw_app_meta_data  = jsonb_build_object(
                               'provider', 'email',
                               'providers', jsonb_build_array('email'),
                               'role', 'admin'
                             ),
        raw_user_meta_data = jsonb_build_object('role', 'admin', 'full_name', v_fullname),
        updated_at         = now()
    WHERE id = v_id;
  END IF;

  -- 2) Promote to admin in user_roles (powers public.is_admin() RLS).
  --    NOTE: the on_auth_user_created trigger may have inserted a 'customer'
  --    row first — this upsert overrides it to 'admin'.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_id, 'admin')
  ON CONFLICT (user_id)
  DO UPDATE SET role = 'admin', updated_at = now();

  -- 3) Create / refresh the profile row.
  INSERT INTO public.user_profiles (user_id, full_name, phone)
  VALUES (v_id, v_fullname, v_phone)
  ON CONFLICT (user_id)
  DO UPDATE SET full_name = EXCLUDED.full_name,
                phone     = EXCLUDED.phone;

  RAISE NOTICE 'Admin account ready → email: %, id: %', v_email, v_id;
END $$;
