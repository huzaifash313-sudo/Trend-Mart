-- =============================================================================
-- TrendsMart — CLEAN SLATE + TEST ACCOUNTS
-- -----------------------------------------------------------------------------
-- Wipes ALL marketplace/business data (shops, products, orders, stories, ads,
-- reviews, wishlists, analytics, notifications, …) and ALL existing signups.
-- Then seeds 8 fresh, verified accounts so you can test the app like a new user.
--
-- ⚠️ IRREVERSIBLE — only run this when you're sure you want a blank slate.
--
-- 🔑 ALL accounts share the password:  Trend@123
--
-- CUSTOMERS (role: customer)
--   customer1@trendsmart.pk  (Ahmed Raza)
--   customer2@trendsmart.pk  (Sana Malik)
--   customer3@trendsmart.pk  (Bilal Khan)
--
-- MERCHANTS (role: merchant — build your store from the dashboard)
--   merchant1@trendsmart.pk  (Ali Hassan)
--   merchant2@trendsmart.pk  (Fatima Noor)
--   merchant3@trendsmart.pk  (Usman Tariq)
--   merchant4@trendsmart.pk  (Zainab Iqbal)
--   merchant5@trendsmart.pk  (Hamza Sheikh)
--
-- NOTE: sub_categories + pricing catalogs (ad_plans/story_plans) are reference
-- data, not store data — they're preserved so product forms keep working.
-- The old Super-Admin account is also removed; make a new admin via
-- ADMIN_BOOTSTRAP_EMAIL/PASSWORD, or run the UPDATE at the bottom.
-- =============================================================================

-- ── 1) Wipe every marketplace/business table that exists ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN (
         'shops','products','inventory_variants','service_packages',
         'service_portfolio','service_availability','orders','leads',
         'customer_inquiries','reviews','customer_wishlists','favorite_stores',
         'coupons','stories','analytics_logs','finance_entries',
         'customer_addresses','merchant_subscriptions','billing_invoices',
         'subscription_audit_log','admin_audit_logs','security_audit_log',
         'push_subscriptions','notifications','support_tickets',
         'promotional_ads','maintenance_logs','orders_archive',
         'ad_plans','story_plans','dine_in_tables',
         'user_roles','user_profiles'
       )
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
  END LOOP;
END $$;

-- ── 2) Remove every existing signup (children first, then auth.users) ────────
DELETE FROM auth.identities;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;
DELETE FROM auth.users;

-- ── 3) Seed 8 test accounts ──────────────────────────────────────────────────

-- 3a) auth.users
INSERT INTO auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'customer1@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Ahmed Raza"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'customer2@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Sana Malik"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'customer3@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Bilal Khan"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'merchant1@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Ali Hassan"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'merchant2@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Fatima Noor"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'merchant3@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Usman Tariq"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'merchant4@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Zainab Iqbal"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'merchant5@trendsmart.pk',
   crypt('Trend@123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Hamza Sheikh"}', now(), now())
ON CONFLICT DO NOTHING;

-- 3b) auth.identities (required for email/password sign-in)
INSERT INTO auth.identities
  (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   '{"sub":"c0000000-0000-4000-8000-000000000001","email":"customer1@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'c0000000-0000-4000-8000-000000000001', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   '{"sub":"c0000000-0000-4000-8000-000000000002","email":"customer2@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'c0000000-0000-4000-8000-000000000002', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   '{"sub":"c0000000-0000-4000-8000-000000000003","email":"customer3@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'c0000000-0000-4000-8000-000000000003', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   '{"sub":"d0000000-0000-4000-8000-000000000001","email":"merchant1@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'd0000000-0000-4000-8000-000000000001', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002',
   '{"sub":"d0000000-0000-4000-8000-000000000002","email":"merchant2@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'd0000000-0000-4000-8000-000000000002', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003',
   '{"sub":"d0000000-0000-4000-8000-000000000003","email":"merchant3@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'd0000000-0000-4000-8000-000000000003', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004',
   '{"sub":"d0000000-0000-4000-8000-000000000004","email":"merchant4@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'd0000000-0000-4000-8000-000000000004', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005',
   '{"sub":"d0000000-0000-4000-8000-000000000005","email":"merchant5@trendsmart.pk","email_verified":true,"phone_verified":false}',
   'email', 'd0000000-0000-4000-8000-000000000005', now(), now(), now())
ON CONFLICT DO NOTHING;

-- 3c) user_profiles (name/phone autofill at checkout)
INSERT INTO public.user_profiles (user_id, full_name, phone, address, created_at, updated_at)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Ahmed Raza',    '0300-1234001', '', now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'Sana Malik',    '0300-1234002', '', now(), now()),
  ('c0000000-0000-4000-8000-000000000003', 'Bilal Khan',    '0300-1234003', '', now(), now()),
  ('d0000000-0000-4000-8000-000000000001', 'Ali Hassan',    '0301-5551001', '', now(), now()),
  ('d0000000-0000-4000-8000-000000000002', 'Fatima Noor',   '0301-5551002', '', now(), now()),
  ('d0000000-0000-4000-8000-000000000003', 'Usman Tariq',   '0301-5551003', '', now(), now()),
  ('d0000000-0000-4000-8000-000000000004', 'Zainab Iqbal',  '0301-5551004', '', now(), now()),
  ('d0000000-0000-4000-8000-000000000005', 'Hamza Sheikh',  '0301-5551005', '', now(), now())
ON CONFLICT DO NOTHING;

-- 3d) user_roles (RBAC — customer vs merchant)
INSERT INTO public.user_roles (user_id, role, created_at, updated_at)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'customer', now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'customer', now(), now()),
  ('c0000000-0000-4000-8000-000000000003', 'customer', now(), now()),
  ('d0000000-0000-4000-8000-000000000001', 'merchant', now(), now()),
  ('d0000000-0000-4000-8000-000000000002', 'merchant', now(), now()),
  ('d0000000-0000-4000-8000-000000000003', 'merchant', now(), now()),
  ('d0000000-0000-4000-8000-000000000004', 'merchant', now(), now()),
  ('d0000000-0000-4000-8000-000000000005', 'merchant', now(), now())
ON CONFLICT DO NOTHING;

-- 3e) FIX GoTrue NULL-token scan error (auth/users manually inserted rows leave
--     these columns NULL, so /auth/v1/token returns HTTP 500). Empty-string any
--     token column that is NULL. Safe to re-run.
DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'confirmation_token','recovery_token','email_change',
    'email_change_token_new','email_change_token_current',
    'phone_change','phone_change_token','reauthentication_token'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = col
    ) THEN
      EXECUTE format('UPDATE auth.users SET %I = COALESCE(%I, '''') WHERE %I IS NULL', col, col, col);
    END IF;
  END LOOP;
END $$;

-- ── 4) OPTIONAL: make merchant1 a Super-Admin (uncomment to enable /admin) ──
-- UPDATE public.user_roles SET role = 'admin' WHERE user_id = 'd0000000-0000-4000-8000-000000000001';
