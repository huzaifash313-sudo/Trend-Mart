-- =============================================================================
-- TrendsMart — Create Super Admin (one script to create OR reset an admin)
-- =============================================================================
-- HOW TO USE
--   1) Open:  Supabase Dashboard → SQL Editor
--   2) Replace the 4 values in the block below (email / password / name / phone)
--   3) Click RUN
--
-- WHAT IT DOES (idempotent — safe to run again)
--   • Creates the user in auth.users with a bcrypt password + confirmed email
--     (so OTP is skipped and you can log straight in with email + password).
--   • If the email already exists → resets the password, re-confirms email,
--     and re-asserts the admin role (fixes a broken/forgotten admin).
--   • Inserts public.user_roles  role = 'admin'   → powers RLS is_admin()
--     and the server-side get_my_role() check.
--   • Sets app_metadata.role = 'admin'            → client middleware sees admin.
--   • Upserts public.user_profiles so the name shows correctly in the UI.
-- =============================================================================

-- pgcrypto gives crypt() + gen_salt('bf') for the password hash.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  -- ╔══════════════════════════════════════════════════════════════════════╗
  -- ║  ✏️  EDIT THESE 4 VALUES BEFORE RUNNING                              ║
  -- ╚══════════════════════════════════════════════════════════════════════╝
  v_email    text := 'admin@trendsmart.pk';  -- ← admin login email
  v_password text := 'Admin@12345';          -- ← strong password (min 8 chars)
  v_fullname text := 'Super Admin';          -- ← display name in the UI
  v_phone    text := '03000000000';          -- ← optional phone number
  -- ════════════════════════════════════════════════════════════════════════
  v_id uuid;
BEGIN
  -- 1) Look up the user by email (idempotent: find first, then create/update).
  SELECT id INTO v_id
  FROM auth.users
  WHERE email = lower(v_email)
  LIMIT 1;

  IF v_id IS NULL THEN
    -- ── NEW USER ────────────────────────────────────────────────────────────
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role,
      email, encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_id,
      'authenticated',
      'authenticated',
      lower(v_email),
      crypt(v_password, gen_salt('bf', 10)),
      now(),
      jsonb_build_object(
        'provider',   'email',
        'providers',  jsonb_build_array('email'),
        'role',       'admin'
      ),
      jsonb_build_object('role', 'admin', 'full_name', v_fullname),
      now(),
      now()
    );
  ELSE
    -- ── EXISTING USER → reset password + confirm email + re-assert admin ──
    UPDATE auth.users
    SET encrypted_password  = crypt(v_password, gen_salt('bf', 10)),
        email_confirmed_at = now(),
        raw_app_meta_data  = jsonb_build_object(
                               'provider',   'email',
                               'providers',  jsonb_build_array('email'),
                               'role',       'admin'
                             ),
        raw_user_meta_data = jsonb_build_object('role', 'admin', 'full_name', v_fullname),
        updated_at         = now()
    WHERE id = v_id;
  END IF;

  -- 2) Role assignment → drives RLS is_admin() + server get_my_role().
  --    NOTE: the on_auth_user_created trigger inserts a 'customer' row first;
  --    this upsert safely overrides it to 'admin'.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_id, 'admin')
  ON CONFLICT (user_id)
  DO UPDATE SET role = 'admin', updated_at = now();

  -- 3) Profile row so the dashboard shows the admin name / phone.
  INSERT INTO public.user_profiles (user_id, full_name, phone)
  VALUES (v_id, v_fullname, v_phone)
  ON CONFLICT (user_id)
  DO UPDATE SET full_name = EXCLUDED.full_name,
                phone     = EXCLUDED.phone;

  RAISE NOTICE '✅ Super Admin ready → email: %,  role: admin,  user_id: %',
               lower(v_email), v_id;
END $$;

-- =============================================================================
-- VERIFICATION — lists every current admin in the system.
-- Your new admin must appear here with role = 'admin' and confirmed = true.
-- =============================================================================
SELECT
  u.email,
  r.role,
  (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
  p.full_name
FROM auth.users u
LEFT JOIN public.user_roles   r ON r.user_id = u.id
LEFT JOIN public.user_profiles p ON p.user_id = u.id
WHERE r.role = 'admin'
ORDER BY u.created_at DESC;
