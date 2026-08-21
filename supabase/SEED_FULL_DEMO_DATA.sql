-- =============================================================================
-- TrendMart — FULL RESET + DEMO TEST DATA (run AFTER RUN_ALL_IN_ONE_20260820.sql)
-- =============================================================================
-- WHAT THIS DOES
--   1. Deletes EVERY existing account (auth.users) and wipes ALL public tables.
--   2. Creates fresh accounts with the exact emails/passwords/roles below.
--   3. Creates 6 live shops (5 merchants each get a shop).
--   4. Seeds 20 products per shop = 120 products, every one with a DIFFERENT
--      image (Unsplash — allowed by next.config remotePatterns).
--   5. Seeds 5 deals per shop = 30 deals.
--   6. Seeds orders (not zero), reviews, coupons, an address + analytics rows.
--
-- ⚠️  DANGER: this TRUNCATES all public tables and DELETES all auth users.
--     Only run this when you are 100% sure you want a clean test database.
--     Run the master schema script FIRST:
--         supabase/RUN_ALL_IN_ONE_20260820.sql
--     Then run THIS file.
-- =============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- ACCOUNTS THAT WILL BE CREATED (password = Huzaifash1133@ unless shown)
-- ═════════════════════════════════════════════════════════════════════════════
--   huzaifash313@gmail.com      Huzaifash1133@#$%     → ADMIN
--   huzaiffa12344321@gmail.com  Huzaifash1133@        → MERCHANT (Huzaiffa Fresh Mart)
--   huzzi11266@gmail.com        Huzaifash1133@        → MERCHANT (Huzzi Fashion House)
--   huzzi8564@gmail.com         Huzaifash1133@        → MERCHANT (Huzzi Gadget Zone)
--   abdwhaw99@gmail.com         Huzaifash1133@        → CUSTOMER
--   test123@gmail.com           Huzaifash1133@        → MERCHANT (TestMart Grocers)
--   test1234@gmail.com          Huzaifash1133@        → MERCHANT (TestMart Bakers)
--   test12345@gmail.com         Huzaifash1133@        → MERCHANT (TestMart Care)
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0) Guard: the master schema script must have been run first ─────────────
DO $$
BEGIN
  IF to_regclass('public.shops') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.shop_deals') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION 'Schema is not ready. Run supabase/RUN_ALL_IN_ONE_20260820.sql FIRST, then run this seed file.';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'shops' AND column_name = 'verification_status'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'short_code'
     ) THEN
    RAISE EXCEPTION 'Newer schema columns are missing. Run supabase/RUN_ALL_IN_ONE_20260820.sql FIRST, then run this seed file.';
  END IF;
END $$;

-- ── 1) WIPE everything ───────────────────────────────────────────────────────
-- Public tables: truncate all (keeps table definitions / columns / policies).
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT
    'TRUNCATE TABLE ' || string_agg(format('public.%I', tablename), ', ')
      || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public'
    -- Never touch PostGIS / system catalog tables if they happen to exist.
    AND tablename NOT IN ('spatial_ref_sys', 'geometry_columns', 'geography_columns')
    AND tablename NOT LIKE 'pg\_%'
    AND tablename NOT LIKE 'rls\_%';

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
    RAISE NOTICE '[OK] All public tables truncated.';
  END IF;
END $$;

-- Auth: delete every existing user/session (must be after public wipe).
DO $$
BEGIN
  BEGIN DELETE FROM auth.refresh_tokens; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.sessions;      EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_challenges; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.mfa_factors;    EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.one_time_tokens; EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.identities;    EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM auth.users;         EXCEPTION WHEN undefined_table THEN NULL; WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE '[OK] All auth users / sessions deleted.';
END $$;

COMMIT;


BEGIN;

-- ── 2) Seed helpers (dropped at the end of this file) ────────────────────────
-- Deterministic image picker from a pool of real Unsplash photo IDs
-- (host whitelisted in next.config.ts images.remotePatterns).
CREATE OR REPLACE FUNCTION public.seed_img(p_seed text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'https://images.unsplash.com/photo-' || (
    ARRAY[
      'photo-1542838132-92c53300491e',
      'photo-1505740420928-5e560c06d30e',
      'photo-1542291026-7eec264c27ff',
      'photo-1523275335684-37898b6baf30',
      'photo-1543163521-1bf539c55dd2',
      'photo-1496181133206-80ce9b88a853',
      'photo-1526170375885-4d8ecf77b99f',
      'photo-1560343090-f0409e92791a',
      'photo-1546868871-7041f2a55e12',
      'photo-1509042239860-f550ce710b93',
      'photo-1546069901-ba9599a7e63c',
      'photo-1565299624946-b28f40a0ae38',
      'photo-1504674900247-0877df9cc836',
      'photo-1484723091739-30a097e8f929',
      'photo-1512621776951-a57141f2eefd',
      'photo-1476224203421-9ac39bcb3327',
      'photo-1540189549336-e6e99c3679fe',
      'photo-1567620905732-2d1ec7ab7445',
      'photo-1551028719-00167b16eac5',
      'photo-1521572163474-6864f9cf17ab',
      'photo-1583743814966-8936f5b7be1a',
      'photo-1434389677669-e08b4cac3105',
      'photo-1441986300917-64674bd600d8',
      'photo-1487222477894-8943e31ef7b2',
      'photo-1509631179647-0177331693ae',
      'photo-1549298916-b41d501d3772',
      'photo-1590874103328-eac38a683ce7',
      'photo-1515372039744-b8f02a3ae446',
      'photo-1584917865442-de89df76afd3',
      'photo-1584308666744-24d5c474f2ae',
      'photo-1587854692152-cbe660dbde88',
      'photo-1550831107-1553da8c8464',
      'photo-1576602976047-174e57a47881',
      'photo-1607619056574-7b8d3ee536b2',
      'photo-1509440159596-0249088772ff',
      'photo-1549931319-a545dcf3bc73',
      'photo-1578985545062-69928b1d9587',
      'photo-1488477181946-6428a0291777',
      'photo-1509365465985-25d11c17e812',
      'photo-1544716278-ca5e3f4abd8c',
      'photo-1495446815901-a7297e633e8d',
      'photo-1512820790803-83ca734da794',
      'photo-1585386959984-a4155224a1ad',
      'photo-1556228720-195a672e8a03',
      'photo-1526947425960-945c6e72858f',
      'photo-1542038784456-1ea8e935640e',
      'photo-1531297484001-80022131f5a1',
      'photo-1583394838336-acd977736f90'
    ]
  )[1 + ((abs(hashtextextended(p_seed, 0)) % 48)::int)] || '?auto=format&fit=crop&w=600&q=60';
$$;

-- Random 8-char URL-safe product short code (matches the app generator).
CREATE OR REPLACE FUNCTION public.seed_short_code()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT string_agg(
    substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 1 + floor(random() * 62)::int, 1),
    ''
  ) FROM generate_series(1, 8);
$$;

-- ── 3) Create accounts ───────────────────────────────────────────────────────
DO $$
DECLARE
  rec record;
  v_hash text;
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('a1111111-1111-4111-8111-111111111111'::uuid, 'huzaifash313@gmail.com',      'Huzaifash1133@#$%', 'Huzaifa Sheikh', 'admin'),
      ('b2222222-2222-4222-8222-222222222222'::uuid, 'huzaiffa12344321@gmail.com',  'Huzaifash1133@',     'Huzaiffa',       'merchant'),
      ('c3333333-3333-4333-8333-333333333333'::uuid, 'huzzi11266@gmail.com',        'Huzaifash1133@',     'Huzzi',          'merchant'),
      ('d4444444-4444-4444-8444-444444444444'::uuid, 'huzzi8564@gmail.com',         'Huzaifash1133@',     'Huzzi 8564',     'merchant'),
      ('e5555555-5555-4555-8555-555555555555'::uuid, 'abdwhaw99@gmail.com',         'Huzaifash1133@',     'Abdullah',       'customer'),
      ('f6666666-6666-4666-8666-666666666666'::uuid, 'test123@gmail.com',           'Huzaifash1133@',     'Test One',       'merchant'),
      ('7a777777-7777-4777-8777-777777777777'::uuid, 'test1234@gmail.com',          'Huzaifash1133@',     'Test Two',       'merchant'),
      ('88888888-8888-4888-8888-888888888888'::uuid, 'test12345@gmail.com',         'Huzaifash1133@',     'Test Three',     'merchant')
    ) AS t(uid, email, pass, full_name, role)
  LOOP
    v_hash := crypt(rec.pass, gen_salt('bf'));

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      invited_at, confirmation_token, recovery_token, email_change_token_new,
      email_change, phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
    ) VALUES (
      v_instance, rec.uid, 'authenticated', 'authenticated', lower(rec.email), v_hash, now(),
      NULL, '', '', '', '', '', '', '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', rec.role),
      jsonb_build_object('role', rec.role, 'full_name', rec.full_name),
      false, now(), now()
    );

    -- Newer Supabase columns (ignore if missing)
    BEGIN
      UPDATE auth.users SET is_sso_user = false WHERE id = rec.uid AND is_sso_user IS DISTINCT FROM false;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    BEGIN
      UPDATE auth.users SET is_anonymous = false WHERE id = rec.uid AND is_anonymous IS DISTINCT FROM false;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;

    -- Email identity (required for password login)
    BEGIN
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), rec.uid,
        jsonb_build_object('sub', rec.uid::text, 'email', lower(rec.email), 'email_verified', true, 'phone_verified', false),
        'email', rec.uid::text, now(), now(), now()
      );
    EXCEPTION WHEN undefined_column THEN
      INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), rec.uid,
        jsonb_build_object('sub', rec.uid::text, 'email', lower(rec.email), 'email_verified', true),
        'email', now(), now(), now()
      );
    END;
  END LOOP;

  RAISE NOTICE '[OK] % accounts created.', 8;
END $$;

-- ── 4) Roles (user_roles) ───────────────────────────────────────────────────
INSERT INTO public.user_roles (user_id, role)
SELECT uid, role::public.app_role
FROM (VALUES
  ('a1111111-1111-4111-8111-111111111111'::uuid, 'admin'),
  ('b2222222-2222-4222-8222-222222222222'::uuid, 'merchant'),
  ('c3333333-3333-4333-8333-333333333333'::uuid, 'merchant'),
  ('d4444444-4444-4444-8444-444444444444'::uuid, 'merchant'),
  ('e5555555-5555-4555-8555-555555555555'::uuid, 'customer'),
  ('f6666666-6666-4666-8666-666666666666'::uuid, 'merchant'),
  ('7a777777-7777-4777-8777-777777777777'::uuid, 'merchant'),
  ('88888888-8888-4888-8888-888888888888'::uuid, 'merchant')
) AS t(uid, role)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

-- ── 5) Profiles (user_profiles) ─────────────────────────────────────────────
INSERT INTO public.user_profiles (user_id, full_name, phone, onboarding_seen_at)
SELECT uid, full_name, phone, now()
FROM (VALUES
  ('a1111111-1111-4111-8111-111111111111'::uuid, 'Huzaifa Sheikh', '923001234500'),
  ('b2222222-2222-4222-8222-222222222222'::uuid, 'Huzaiffa',       '923001234501'),
  ('c3333333-3333-4333-8333-333333333333'::uuid, 'Huzzi',          '923001234502'),
  ('d4444444-4444-4444-8444-444444444444'::uuid, 'Huzzi 8564',     '923001234503'),
  ('e5555555-5555-4555-8555-555555555555'::uuid, 'Abdullah',       '923001234504'),
  ('f6666666-6666-4666-8666-666666666666'::uuid, 'Test One',       '923001234505'),
  ('7a777777-7777-4777-8777-777777777777'::uuid, 'Test Two',       '923001234506'),
  ('88888888-8888-4888-8888-888888888888'::uuid, 'Test Three',     '923001234507')
) AS t(uid, full_name, phone)
ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;

-- ── 6) Customer delivery address (checkout auto-fill) ───────────────────────
INSERT INTO public.customer_addresses (user_id, label, full_name, phone_number, address_line1, address_line2, city, postal_code, delivery_notes, is_default)
VALUES (
  'e5555555-5555-4555-8555-555555555555'::uuid, 'Home', 'Abdullah', '03001234567',
  'House 12, Street 5, Model Town', '', 'Lahore', '54000', 'Call before delivery', true
);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- PART B — SHOPS + PRODUCTS + DEALS + ORDERS + REVIEWS + COUPONS
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_shop1 uuid; v_shop2 uuid; v_shop3 uuid;
  v_shop4 uuid; v_shop5 uuid; v_shop6 uuid;
BEGIN

  -- ==========================================================================
  -- SHOP 1 — Huzaiffa Fresh Mart  (Grocery & Kiryana)  — owner huzaiffa
  -- ==========================================================================
  INSERT INTO public.shops (
    owner_id, name, slug, category, location, whatsapp_number, logo_url, banner_url,
    is_live, verification_status, latitude, longitude, service_radius_km, delivery_zones,
    address_display, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km,
    avg_rating, review_count, store_bio, announcement, shop_type, accent_color,
    business_hours, operating_status, created_at
  ) VALUES (
    'b2222222-2222-4222-8222-222222222222', 'Huzaiffa Fresh Mart', 'huzaiffa-fresh-mart',
    'Grocery & Kiryana', 'Model Town, Lahore', '923001234501',
    public.seed_img('logo-huzaiffa'), public.seed_img('banner-huzaiffa'),
    true, 'approved', 31.4837, 74.3445, 10, ARRAY['__pk_city__:Lahore'],
    'Main Market, Model Town, Lahore', 0, 1500, 0, 0, 4.6, 12,
    'Fresh groceries and daily essentials delivered fast across Model Town.',
    'Eid offers live now — free delivery over Rs. 1500!', 'retail', '#10b981',
    'Mon-Sat: 9 AM - 11 PM', 'Open now', now()
  ) RETURNING id INTO v_shop1;

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, image_url, images, is_available, is_pinned, stock_status, category_id, created_at, short_code)
  SELECT v_shop1, n.name, n.name, 'Fresh ' || n.name || ' — order on WhatsApp: 0300 1234501. Fast delivery across Lahore.',
         n.price, n.orig, 'PKR',
         public.seed_img('s1p' || n.i),
         jsonb_build_array(public.seed_img('s1p' || n.i)),
         true, (n.i <= 5), 'in_stock', 'Grocery & Kiryana',
         now() - ((20 - n.i) * interval '1 day'), public.seed_short_code()
  FROM unnest(
    ARRAY['Fine Sugar 1kg','Basmati Rice 5kg','Cooking Oil 1L','Tapal Danedar Tea 475g','Milk Powder 800g','Chana Daal 1kg','Masoor Daal 1kg','Fine Atta 10kg','Desi Ghee 1kg','Sea Salt 800g','Family Biscuits 200g','Fresh Orange Juice 1L','Tomato Ketchup 500g','Mayonnaise 400g','Lifebuoy Soap 120g','Anti-Dandruff Shampoo 250ml','Surf Detergent 1kg','Toothpaste 150g','Instant Noodles (6 pack)','Mineral Water 1.5L (6 pack)']::text[],
    ARRAY[180,1450,650,950,1450,280,320,950,750,60,120,250,220,280,110,350,380,250,180,420]::numeric[],
    ARRAY[200,1600,700,1050,1550,320,360,1050,850,80,150,300,250,330,130,420,450,290,210,480]::numeric[]
  ) WITH ORDINALITY AS n(name, price, orig, i);

  INSERT INTO public.shop_deals (shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, image_url, images, badge_text, is_featured, product_id, price, original_price, created_at)
  SELECT v_shop1, d.title, d.description, d.schedule_type,
         CASE d.i
           WHEN 1 THEN ARRAY[0,1,2,3,4,5,6]::smallint[]
           WHEN 2 THEN ARRAY[5,6]::smallint[]
           ELSE NULL::smallint[]
         END AS weekdays,
         d.starts_on, d.ends_on, d.day_of_month, true,
         public.seed_img('s1d' || d.i), jsonb_build_array(public.seed_img('s1d' || d.i)), d.badge, d.featured,
         (SELECT id FROM public.products WHERE shop_id = v_shop1 ORDER BY created_at ASC LIMIT 1 OFFSET d.off),
         d.price, d.orig, now() - ((6 - d.i) * interval '1 day')
  FROM unnest(
    ARRAY['Weekly Mega Savings','Weekend Combo Deal','Month-End Clearance','Ramzan Special','Mid-Month Offer']::text[],
    ARRAY['Flat 10% off selected items all week.','Buy 2 get 5% extra — every weekend.','Clearance sale on rice & oil.','Special Ramadan bundle pricing.','Mid-month savings on daily staples.']::text[],
    ARRAY['weekly','weekly','date_range','date_range','monthly']::text[],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE, CURRENT_DATE + 3, NULL::date],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE + 7, CURRENT_DATE + 10, NULL::date],
    ARRAY[NULL::smallint, NULL::smallint, NULL::smallint, NULL::smallint, 15::smallint],
    ARRAY['10% OFF','Weekend Deal','15% OFF','Special','Monthly Deal']::text[],
    ARRAY[true, false, true, false, false]::boolean[],
    ARRAY[0,1,2,3,4]::int[],
    ARRAY[900,1200,1150,1400,800]::numeric[],
    ARRAY[1000,1350,1350,1600,950]::numeric[]
  ) WITH ORDINALITY AS d(title, description, schedule_type, starts_on, ends_on, day_of_month, badge, featured, off, price, orig, i);

  -- ==========================================================================
  -- SHOP 2 — Huzzi Fashion House  (Fashion & Apparel)  — owner huzzi11266
  -- ==========================================================================
  INSERT INTO public.shops (
    owner_id, name, slug, category, location, whatsapp_number, logo_url, banner_url,
    is_live, verification_status, latitude, longitude, service_radius_km, delivery_zones,
    address_display, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km,
    avg_rating, review_count, store_bio, announcement, shop_type, accent_color,
    business_hours, operating_status, created_at
  ) VALUES (
    'c3333333-3333-4333-8333-333333333333', 'Huzzi Fashion House', 'huzzi-fashion-house',
    'Fashion & Apparel', 'Gulberg, Lahore', '923001234502',
    public.seed_img('logo-huzzi-fashion'), public.seed_img('banner-huzzi-fashion'),
    true, 'approved', 31.5204, 74.3587, 12, ARRAY['__pk_city__:Lahore'],
    'Liberty Market, Gulberg III, Lahore', 0, 2000, 0, 0, 4.8, 25,
    'Latest Pakistani fashion — kurtas, shalwar kameez, sneakers and more.',
    'New winter collection just landed!', 'retail', '#ec4899',
    'Mon-Sun: 10 AM - 10 PM', 'Open now', now()
  ) RETURNING id INTO v_shop2;

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, image_url, images, is_available, is_pinned, stock_status, category_id, created_at, short_code)
  SELECT v_shop2, n.name, n.name, n.name || ' — order on WhatsApp: 0300 1234502. Sizes M / L / XL available.',
         n.price, n.orig, 'PKR',
         public.seed_img('s2p' || n.i),
         jsonb_build_array(public.seed_img('s2p' || n.i)),
         true, (n.i <= 5), 'in_stock', 'Fashion & Apparel',
         now() - ((20 - n.i) * interval '1 day'), public.seed_short_code()
  FROM unnest(
    ARRAY['Men Casual Shirt','Women Shalwar Kameez','Kids Printed T-Shirt','Men Premium Kurta','Women Khusa (pair)','Men Running Sneakers','Ladies Handbag','Silk Dupatta','Men Slim Jeans','Embroidered Shawl','Unisex Hoodie','Men Leather Sandals','Gold-Plated Earrings','Men Analog Watch','Formal 2-Piece Suit','Beaded Clutch Purse','Cotton Cap','Ankle Socks (3 pairs)','Women Abaya','Men Sherwani']::text[],
    ARRAY[1200,1800,600,1600,900,2400,1500,450,1900,700,1700,1100,350,3200,7500,950,400,300,2900,8900]::numeric[],
    ARRAY[1500,2200,750,2000,1100,3000,1900,600,2300,900,2100,1400,500,4000,9000,1200,500,380,3500,11000]::numeric[]
  ) WITH ORDINALITY AS n(name, price, orig, i);

  INSERT INTO public.shop_deals (shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, image_url, images, badge_text, is_featured, product_id, price, original_price, created_at)
  SELECT v_shop2, d.title, d.description, d.schedule_type,
         CASE d.i
           WHEN 1 THEN ARRAY[0,1,2,3,4,5,6]::smallint[]
           WHEN 2 THEN ARRAY[5]::smallint[]
           ELSE NULL::smallint[]
         END AS weekdays,
         d.starts_on, d.ends_on, d.day_of_month, true,
         public.seed_img('s2d' || d.i), jsonb_build_array(public.seed_img('s2d' || d.i)), d.badge, d.featured,
         (SELECT id FROM public.products WHERE shop_id = v_shop2 ORDER BY created_at ASC LIMIT 1 OFFSET d.off),
         d.price, d.orig, now() - ((6 - d.i) * interval '1 day')
  FROM unnest(
    ARRAY['Trendy Week Sale','Friday Flash Deal','Festive Collection','Winter Arrivals','Member Monthly Deal']::text[],
    ARRAY['Up to 20% off trending outfits.','Flash sale every Friday.','Festive wear bundle pricing.','New winter styles with early-bird discount.','Monthly members-only offer.']::text[],
    ARRAY['weekly','weekly','date_range','date_range','monthly']::text[],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE, CURRENT_DATE + 5, NULL::date],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE + 14, CURRENT_DATE + 20, NULL::date],
    ARRAY[NULL::smallint, NULL::smallint, NULL::smallint, NULL::smallint, 20::smallint],
    ARRAY['20% OFF','Flash','New Drop','Sale','Member']::text[],
    ARRAY[true, false, true, false, false]::boolean[],
    ARRAY[0,1,2,3,4]::int[],
    ARRAY[1440,2160,4800,2320,3040]::numeric[],
    ARRAY[1800,2700,6000,2900,3800]::numeric[]
  ) WITH ORDINALITY AS d(title, description, schedule_type, starts_on, ends_on, day_of_month, badge, featured, off, price, orig, i);

  -- ==========================================================================
  -- SHOP 3 — Huzzi Gadget Zone  (Electronics & Gadgets)  — owner huzzi8564
  -- ==========================================================================
  INSERT INTO public.shops (
    owner_id, name, slug, category, location, whatsapp_number, logo_url, banner_url,
    is_live, verification_status, latitude, longitude, service_radius_km, delivery_zones,
    address_display, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km,
    avg_rating, review_count, store_bio, announcement, shop_type, accent_color,
    business_hours, operating_status, created_at
  ) VALUES (
    'd4444444-4444-4444-8444-444444444444', 'Huzzi Gadget Zone', 'huzzi-gadget-zone',
    'Electronics & Gadgets', 'DHA Phase 5, Lahore', '923001234503',
    public.seed_img('logo-gadget'), public.seed_img('banner-gadget'),
    true, 'approved', 31.4720, 74.3977, 10, ARRAY['__pk_city__:Lahore'],
    'Y-Block, DHA Phase 5, Lahore', 0, 3000, 0, 0, 4.4, 18,
    'Genuine electronics, accessories and gadgets with warranty.',
    'Cash on delivery available across Lahore.', 'retail', '#3b82f6',
    'Mon-Sun: 11 AM - 11 PM', 'Open now', now()
  ) RETURNING id INTO v_shop3;

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, image_url, images, is_available, is_pinned, stock_status, category_id, created_at, short_code)
  SELECT v_shop3, n.name, n.name, n.name || ' — order on WhatsApp: 0300 1234503. 1-week replacement warranty.',
         n.price, n.orig, 'PKR',
         public.seed_img('s3p' || n.i),
         jsonb_build_array(public.seed_img('s3p' || n.i)),
         true, (n.i <= 5), 'in_stock', 'Electronics & Gadgets',
         now() - ((20 - n.i) * interval '1 day'), public.seed_short_code()
  FROM unnest(
    ARRAY['Wireless Earbuds','Bluetooth Speaker','Smart Watch','Power Bank 20000mAh','USB-C Fast Cable','Shockproof Phone Case','LED Strip Light 5m','HD Webcam','Gaming Mouse','RGB Mechanical Keyboard','24" Full HD Monitor','Wi-Fi 6 Router','Rechargeable Fan','Electric Kettle 1.8L','Hair Dryer 2000W','Beard Trimmer','Smart Plug','4K Action Camera','Mini Projector','USB Condenser Mic']::text[],
    ARRAY[1500,2200,3500,2800,350,400,900,1800,1400,4500,18500,4200,1200,1600,2000,2400,750,12500,18000,3200]::numeric[],
    ARRAY[2200,2800,4500,3500,450,550,1200,2300,1800,5500,22000,5200,1500,2000,2500,3000,950,15000,22000,4000]::numeric[]
  ) WITH ORDINALITY AS n(name, price, orig, i);

  INSERT INTO public.shop_deals (shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, image_url, images, badge_text, is_featured, product_id, price, original_price, created_at)
  SELECT v_shop3, d.title, d.description, d.schedule_type,
         CASE d.i
           WHEN 1 THEN ARRAY[2]::smallint[]
           WHEN 2 THEN ARRAY[5,6]::smallint[]
           ELSE NULL::smallint[]
         END AS weekdays,
         d.starts_on, d.ends_on, d.day_of_month, true,
         public.seed_img('s3d' || d.i), jsonb_build_array(public.seed_img('s3d' || d.i)), d.badge, d.featured,
         (SELECT id FROM public.products WHERE shop_id = v_shop3 ORDER BY created_at ASC LIMIT 1 OFFSET d.off),
         d.price, d.orig, now() - ((6 - d.i) * interval '1 day')
  FROM unnest(
    ARRAY['Tech Tuesday','Weekend Gadget Sale','Clearance Electronics','New Arrivals Fest','Member Monthly Deal']::text[],
    ARRAY['Audio & wearables on discount every Tuesday.','Weekend price drop on gadgets.','Old stock clearance — limited units.','New gadgets with launch discount.','Monthly member-only gadget offer.']::text[],
    ARRAY['weekly','weekly','date_range','date_range','monthly']::text[],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE, CURRENT_DATE + 6, NULL::date],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE + 9, CURRENT_DATE + 12, NULL::date],
    ARRAY[NULL::smallint, NULL::smallint, NULL::smallint, NULL::smallint, 25::smallint],
    ARRAY['Tech Deal','Sale','Clearance','New','Member']::text[],
    ARRAY[true, false, true, false, false]::boolean[],
    ARRAY[0,1,2,3,4]::int[],
    ARRAY[1760,1320,14800,10000,14400]::numeric[],
    ARRAY[2200,1650,18500,12500,18000]::numeric[]
  ) WITH ORDINALITY AS d(title, description, schedule_type, starts_on, ends_on, day_of_month, badge, featured, off, price, orig, i);

  -- ==========================================================================
  -- SHOP 4 — TestMart Grocers  (Grocery & Kiryana)  — owner test123
  -- ==========================================================================
  INSERT INTO public.shops (
    owner_id, name, slug, category, location, whatsapp_number, logo_url, banner_url,
    is_live, verification_status, latitude, longitude, service_radius_km, delivery_zones,
    address_display, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km,
    avg_rating, review_count, store_bio, announcement, shop_type, accent_color,
    business_hours, operating_status, created_at
  ) VALUES (
    'f6666666-6666-4666-8666-666666666666', 'TestMart Grocers', 'testmart-grocers',
    'Grocery & Kiryana', 'Faisal Town, Lahore', '923001234505',
    public.seed_img('logo-testgrocers'), public.seed_img('banner-testgrocers'),
    true, 'approved', 31.4699, 74.2738, 8, ARRAY['__pk_city__:Lahore'],
    'Main Boulevard, Faisal Town, Lahore', 0, 1000, 0, 0, 4.2, 9,
    'Everyday groceries at the best prices.',
    'Free delivery on orders above Rs. 1000.', 'retail', '#f59e0b',
    'Mon-Sat: 8 AM - 10 PM', 'Open now', now()
  ) RETURNING id INTO v_shop4;

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, image_url, images, is_available, is_pinned, stock_status, category_id, created_at, short_code)
  SELECT v_shop4, n.name, n.name, n.name || ' — order on WhatsApp: 0300 1234505. Low prices every day.',
         n.price, n.orig, 'PKR',
         public.seed_img('s4p' || n.i),
         jsonb_build_array(public.seed_img('s4p' || n.i)),
         true, (n.i <= 5), 'in_stock', 'Grocery & Kiryana',
         now() - ((20 - n.i) * interval '1 day'), public.seed_short_code()
  FROM unnest(
    ARRAY['Cornflakes 500g','Peanut Butter 340g','Mixed Fruit Jam','Natural Honey 500g','Premium Dates 1kg','Rolled Oats 1kg','Party Chips 200g','Cola 1.5L','Nescafe Classic 50g','Sugar-Free Sweetener','Chicken Nuggets 500g','Cheese Slices 250g','Butter 200g','Fresh Yogurt 1kg','Mixed Pickle 500g','Cooking Cream 200ml','Olive Oil 500ml','Black Pepper 100g','Cinnamon Powder 100g','Green Tea (25 bags)']::text[],
    ARRAY[550,850,280,900,750,600,450,220,500,350,800,600,450,300,320,380,1600,250,180,450]::numeric[],
    ARRAY[650,1000,340,1100,900,700,550,250,600,420,950,700,550,350,400,450,2000,300,220,550]::numeric[]
  ) WITH ORDINALITY AS n(name, price, orig, i);

  INSERT INTO public.shop_deals (shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, image_url, images, badge_text, is_featured, product_id, price, original_price, created_at)
  SELECT v_shop4, d.title, d.description, d.schedule_type,
         CASE d.i
           WHEN 1 THEN ARRAY[0,1,2,3,4,5,6]::smallint[]
           WHEN 2 THEN ARRAY[6]::smallint[]
           ELSE NULL::smallint[]
         END AS weekdays,
         d.starts_on, d.ends_on, d.day_of_month, true,
         public.seed_img('s4d' || d.i), jsonb_build_array(public.seed_img('s4d' || d.i)), d.badge, d.featured,
         (SELECT id FROM public.products WHERE shop_id = v_shop4 ORDER BY created_at ASC LIMIT 1 OFFSET d.off),
         d.price, d.orig, now() - ((6 - d.i) * interval '1 day')
  FROM unnest(
    ARRAY['Breakfast Special','Snack Saturday','Pantry Sale','Festive Pack','Monthly Deal']::text[],
    ARRAY['Breakfast essentials bundle.','Snack-time discounts every Saturday.','Stock up the pantry at lower prices.','Festive packing with gift-ready items.','Monthly savings on household staples.']::text[],
    ARRAY['weekly','weekly','date_range','date_range','monthly']::text[],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE, CURRENT_DATE + 4, NULL::date],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE + 8, CURRENT_DATE + 11, NULL::date],
    ARRAY[NULL::smallint, NULL::smallint, NULL::smallint, NULL::smallint, 10::smallint],
    ARRAY['Bundle','Saturday','Sale','Gift','Monthly']::text[],
    ARRAY[true, false, true, false, false]::boolean[],
    ARRAY[0,1,2,3,4]::int[],
    ARRAY[720,360,760,600,2560]::numeric[],
    ARRAY[900,450,950,750,3200]::numeric[]
  ) WITH ORDINALITY AS d(title, description, schedule_type, starts_on, ends_on, day_of_month, badge, featured, off, price, orig, i);

  -- ==========================================================================
  -- SHOP 5 — TestMart Bakers  (Bakery & Sweets)  — owner test1234
  -- ==========================================================================
  INSERT INTO public.shops (
    owner_id, name, slug, category, location, whatsapp_number, logo_url, banner_url,
    is_live, verification_status, latitude, longitude, service_radius_km, delivery_zones,
    address_display, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km,
    avg_rating, review_count, store_bio, announcement, shop_type, accent_color,
    business_hours, operating_status, created_at
  ) VALUES (
    '7a777777-7777-4777-8777-777777777777', 'TestMart Bakers', 'testmart-bakers',
    'Bakery & Sweets', 'Johar Town, Lahore', '923001234506',
    public.seed_img('logo-bakers'), public.seed_img('banner-bakers'),
    true, 'approved', 31.4667, 74.2555, 8, ARRAY['__pk_city__:Lahore'],
    'Sector C, Johar Town, Lahore', 0, 1200, 0, 0, 4.7, 21,
    'Freshly baked cakes, pastries and sweets every day.',
    'Order birthday cakes 24 hours in advance!', 'retail', '#f97316',
    'Mon-Sun: 8 AM - 11 PM', 'Open now', now()
  ) RETURNING id INTO v_shop5;

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, image_url, images, is_available, is_pinned, stock_status, category_id, created_at, short_code)
  SELECT v_shop5, n.name, n.name, n.name || ' — order on WhatsApp: 0300 1234506. Baked fresh daily.',
         n.price, n.orig, 'PKR',
         public.seed_img('s5p' || n.i),
         jsonb_build_array(public.seed_img('s5p' || n.i)),
         true, (n.i <= 5), 'in_stock', 'Bakery & Sweets',
         now() - ((20 - n.i) * interval '1 day'), public.seed_short_code()
  FROM unnest(
    ARRAY['Chocolate Cake 1kg','Pineapple Cake','Cupcakes (box of 6)','Butter Croissants (4)','Chocolate Brownie Box','Glazed Donuts (6)','Garlic Bread','Fresh White Bread','Brown Bread 500g','Crispy Rusk 500g','Party Nimco 500g','Chicken Patties (6)','Samosa Chaat Pack','French Macarons (6)','Cheesecake Slice','Blueberry Muffin','Almond Biscotti 250g','Fresh Fruit Tart','Burger Buns (6)','Sandwich Roll']::text[],
    ARRAY[1500,1400,900,500,700,750,350,150,180,250,350,480,300,950,550,300,400,650,220,420]::numeric[],
    ARRAY[1800,1700,1100,650,850,900,450,180,220,300,420,600,380,1200,700,380,500,800,280,520]::numeric[]
  ) WITH ORDINALITY AS n(name, price, orig, i);

  INSERT INTO public.shop_deals (shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, image_url, images, badge_text, is_featured, product_id, price, original_price, created_at)
  SELECT v_shop5, d.title, d.description, d.schedule_type,
         CASE d.i
           WHEN 1 THEN ARRAY[0,1,2,3,4,5,6]::smallint[]
           WHEN 2 THEN ARRAY[5]::smallint[]
           ELSE NULL::smallint[]
         END AS weekdays,
         d.starts_on, d.ends_on, d.day_of_month, true,
         public.seed_img('s5d' || d.i), jsonb_build_array(public.seed_img('s5d' || d.i)), d.badge, d.featured,
         (SELECT id FROM public.products WHERE shop_id = v_shop5 ORDER BY created_at ASC LIMIT 1 OFFSET d.off),
         d.price, d.orig, now() - ((6 - d.i) * interval '1 day')
  FROM unnest(
    ARRAY['Cake of the Week','Fresh Friday','Sweet Festive Sale','Custom Cake Offer','Monthly Sweet Deal']::text[],
    ARRAY['Featured cake at a discount this week.','Freshly baked bakes every Friday.','Sweets bundle for festive occasions.','Order a custom cake and save.','Monthly deal on our sweet classics.']::text[],
    ARRAY['weekly','weekly','date_range','date_range','monthly']::text[],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE, CURRENT_DATE + 7, NULL::date],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE + 10, CURRENT_DATE + 15, NULL::date],
    ARRAY[NULL::smallint, NULL::smallint, NULL::smallint, NULL::smallint, 12::smallint],
    ARRAY['Deal','Friday','Sale','Custom','Monthly']::text[],
    ARRAY[true, false, true, false, false]::boolean[],
    ARRAY[0,1,2,3,4]::int[],
    ARRAY[1200,280,1120,520,360]::numeric[],
    ARRAY[1500,350,1400,650,450]::numeric[]
  ) WITH ORDINALITY AS d(title, description, schedule_type, starts_on, ends_on, day_of_month, badge, featured, off, price, orig, i);

  -- ==========================================================================
  -- SHOP 6 — TestMart Care  (Pharmacy & Medical)  — owner test12345
  -- ==========================================================================
  INSERT INTO public.shops (
    owner_id, name, slug, category, location, whatsapp_number, logo_url, banner_url,
    is_live, verification_status, latitude, longitude, service_radius_km, delivery_zones,
    address_display, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km,
    avg_rating, review_count, store_bio, announcement, shop_type, accent_color,
    business_hours, operating_status, created_at
  ) VALUES (
    '88888888-8888-4888-8888-888888888888', 'TestMart Care', 'testmart-care',
    'Pharmacy & Medical', 'Wapda Town, Lahore', '923001234507',
    public.seed_img('logo-care'), public.seed_img('banner-care'),
    true, 'approved', 31.4521, 74.2667, 8, ARRAY['__pk_city__:Lahore'],
    'Main Wapda Town Road, Lahore', 0, 1500, 0, 0, 4.3, 14,
    'Medicines and healthcare essentials with authentic products.',
    '24/7 order support on WhatsApp.', 'retail', '#14b8a6',
    'Mon-Sun: 24 hours', 'Open now', now()
  ) RETURNING id INTO v_shop6;

  INSERT INTO public.products (shop_id, name, title, description, price, original_price, currency, image_url, images, is_available, is_pinned, stock_status, category_id, created_at, short_code)
  SELECT v_shop6, n.name, n.name, n.name || ' — order on WhatsApp: 0300 1234507. Genuine products only.',
         n.price, n.orig, 'PKR',
         public.seed_img('s6p' || n.i),
         jsonb_build_array(public.seed_img('s6p' || n.i)),
         true, (n.i <= 5), 'in_stock', 'Pharmacy & Medical',
         now() - ((20 - n.i) * interval '1 day'), public.seed_short_code()
  FROM unnest(
    ARRAY['Panadol (20 tabs)','Vitamin C 500mg','Multivitamin Complex','Calcium + D3','Omega-3 Fish Oil','Cough Syrup 120ml','Antiseptic Liquid 500ml','Hand Sanitizer 250ml','Surgical Mask (50 pcs)','Digital Thermometer','BP Monitor','Glucometer Kit','First Aid Box','Gauze Bandage Pack','Eye Drops 10ml','Antibacterial Cream','ORS Sachets (10)','Heating Pad','Muscle Pain Gel','Cough Lozenges']::text[],
    ARRAY[150,350,900,800,1100,280,400,350,600,850,6500,3800,1200,300,250,200,180,1500,550,200]::numeric[],
    ARRAY[180,450,1100,950,1400,340,480,420,750,1050,8000,4800,1500,380,300,250,220,1900,700,250]::numeric[]
  ) WITH ORDINALITY AS n(name, price, orig, i);

  INSERT INTO public.shop_deals (shop_id, title, description, schedule_type, weekdays, starts_on, ends_on, day_of_month, is_active, image_url, images, badge_text, is_featured, product_id, price, original_price, created_at)
  SELECT v_shop6, d.title, d.description, d.schedule_type,
         CASE d.i
           WHEN 1 THEN ARRAY[3]::smallint[]
           WHEN 2 THEN ARRAY[5,6]::smallint[]
           ELSE NULL::smallint[]
         END AS weekdays,
         d.starts_on, d.ends_on, d.day_of_month, true,
         public.seed_img('s6d' || d.i), jsonb_build_array(public.seed_img('s6d' || d.i)), d.badge, d.featured,
         (SELECT id FROM public.products WHERE shop_id = v_shop6 ORDER BY created_at ASC LIMIT 1 OFFSET d.off),
         d.price, d.orig, now() - ((6 - d.i) * interval '1 day')
  FROM unnest(
    ARRAY['Wellness Wednesday','Health Weekend','Immunity Pack','Diabetes Care Sale','Monthly Health Deal']::text[],
    ARRAY['Vitamins & wellness discounts.','Health essentials on weekends.','Immunity booster bundle.','Glucose monitors and strips on sale.','Monthly deal on everyday medicines.']::text[],
    ARRAY['weekly','weekly','date_range','date_range','monthly']::text[],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE, CURRENT_DATE + 8, NULL::date],
    ARRAY[NULL::date, NULL::date, CURRENT_DATE + 12, CURRENT_DATE + 16, NULL::date],
    ARRAY[NULL::smallint, NULL::smallint, NULL::smallint, NULL::smallint, 18::smallint],
    ARRAY['Wellness','Weekend','Pack','Sale','Monthly']::text[],
    ARRAY[true, false, true, false, false]::boolean[],
    ARRAY[0,1,2,3,4]::int[],
    ARRAY[120,280,720,3040,440]::numeric[],
    ARRAY[150,350,900,3800,550]::numeric[]
  ) WITH ORDINALITY AS d(title, description, schedule_type, starts_on, ends_on, day_of_month, badge, featured, off, price, orig, i);

  -- ==========================================================================
  -- ORDERS (so orders are NOT zero) — customer: abdwhaw99
  -- ==========================================================================
  INSERT INTO public.orders (shop_id, customer_name, customer_phone, items_json, total_amount, subtotal_amount, discount_amount, delivery_fee, status, customer_user_id, tracking_number, notes, created_at, updated_at)
  VALUES
    (v_shop1, 'Abdullah', '03001234567',
     jsonb_build_array(
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop1 ORDER BY created_at ASC LIMIT 1 OFFSET 0), 'name', 'Fine Sugar 1kg', 'price', 180, 'quantity', 2),
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop1 ORDER BY created_at ASC LIMIT 1 OFFSET 1), 'name', 'Basmati Rice 5kg', 'price', 1450, 'quantity', 1)
     ), 1810, 1810, 0, 0, 'Delivered', 'e5555555-5555-4555-8555-555555555555', 'TM-1001', 'Test order', now() - interval '4 days', now() - interval '4 days'),
    (v_shop1, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop1 ORDER BY created_at ASC LIMIT 1 OFFSET 2), 'name', 'Cooking Oil 1L', 'price', 650, 'quantity', 1)),
     650, 650, 0, 0, 'Processing', 'e5555555-5555-4555-8555-555555555555', 'TM-1002', NULL, now() - interval '1 day', now() - interval '1 day'),
    (v_shop1, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop1 ORDER BY created_at ASC LIMIT 1 OFFSET 3), 'name', 'Tapal Danedar Tea 475g', 'price', 950, 'quantity', 1)),
     950, 950, 0, 0, 'Pending', 'e5555555-5555-4555-8555-555555555555', 'TM-1003', NULL, now(), now()),
    (v_shop2, 'Abdullah', '03001234567',
     jsonb_build_array(
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop2 ORDER BY created_at ASC LIMIT 1 OFFSET 0), 'name', 'Men Casual Shirt', 'price', 1200, 'quantity', 1),
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop2 ORDER BY created_at ASC LIMIT 1 OFFSET 4), 'name', 'Women Khusa (pair)', 'price', 900, 'quantity', 2)
     ), 3000, 3000, 0, 0, 'Delivered', 'e5555555-5555-4555-8555-555555555555', 'TM-2001', 'Test order', now() - interval '5 days', now() - interval '5 days'),
    (v_shop2, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop2 ORDER BY created_at ASC LIMIT 1 OFFSET 6), 'name', 'Ladies Handbag', 'price', 1500, 'quantity', 1)),
     1500, 1500, 0, 0, 'Dispatched', 'e5555555-5555-4555-8555-555555555555', 'TM-2002', NULL, now() - interval '2 days', now() - interval '1 day'),
    (v_shop2, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop2 ORDER BY created_at ASC LIMIT 1 OFFSET 8), 'name', 'Men Slim Jeans', 'price', 1900, 'quantity', 1)),
     1900, 1900, 0, 0, 'Pending', 'e5555555-5555-4555-8555-555555555555', 'TM-2003', NULL, now(), now()),
    (v_shop3, 'Abdullah', '03001234567',
     jsonb_build_array(
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop3 ORDER BY created_at ASC LIMIT 1 OFFSET 0), 'name', 'Wireless Earbuds', 'price', 1500, 'quantity', 2),
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop3 ORDER BY created_at ASC LIMIT 1 OFFSET 2), 'name', 'Smart Watch', 'price', 3500, 'quantity', 1)
     ), 6500, 6500, 0, 0, 'Delivered', 'e5555555-5555-4555-8555-555555555555', 'TM-3001', 'Test order', now() - interval '3 days', now() - interval '3 days'),
    (v_shop3, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop3 ORDER BY created_at ASC LIMIT 1 OFFSET 3), 'name', 'Power Bank 20000mAh', 'price', 2800, 'quantity', 1)),
     2800, 2800, 0, 0, 'Processing', 'e5555555-5555-4555-8555-555555555555', 'TM-3002', NULL, now() - interval '1 day', now() - interval '1 day'),
    (v_shop3, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop3 ORDER BY created_at ASC LIMIT 1 OFFSET 7), 'name', 'HD Webcam', 'price', 1800, 'quantity', 1)),
     1800, 1800, 0, 0, 'Pending', 'e5555555-5555-4555-8555-555555555555', 'TM-3003', NULL, now(), now()),
    (v_shop4, 'Abdullah', '03001234567',
     jsonb_build_array(
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop4 ORDER BY created_at ASC LIMIT 1 OFFSET 0), 'name', 'Cornflakes 500g', 'price', 550, 'quantity', 2),
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop4 ORDER BY created_at ASC LIMIT 1 OFFSET 1), 'name', 'Peanut Butter 340g', 'price', 850, 'quantity', 1)
     ), 1950, 1950, 0, 0, 'Delivered', 'e5555555-5555-4555-8555-555555555555', 'TM-4001', 'Test order', now() - interval '2 days', now() - interval '2 days'),
    (v_shop5, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop5 ORDER BY created_at ASC LIMIT 1 OFFSET 0), 'name', 'Chocolate Cake 1kg', 'price', 1500, 'quantity', 1)),
     1500, 1500, 0, 0, 'Delivered', 'e5555555-5555-4555-8555-555555555555', 'TM-5001', 'Birthday cake', now() - interval '3 days', now() - interval '3 days'),
    (v_shop5, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop5 ORDER BY created_at ASC LIMIT 1 OFFSET 2), 'name', 'Cupcakes (box of 6)', 'price', 900, 'quantity', 2)),
     1800, 1800, 0, 0, 'Pending', 'e5555555-5555-4555-8555-555555555555', 'TM-5002', NULL, now(), now()),
    (v_shop6, 'Abdullah', '03001234567',
     jsonb_build_array(
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop6 ORDER BY created_at ASC LIMIT 1 OFFSET 0), 'name', 'Panadol (20 tabs)', 'price', 150, 'quantity', 3),
       jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop6 ORDER BY created_at ASC LIMIT 1 OFFSET 1), 'name', 'Vitamin C 500mg', 'price', 350, 'quantity', 1)
     ), 800, 800, 0, 0, 'Delivered', 'e5555555-5555-4555-8555-555555555555', 'TM-6001', 'Test order', now() - interval '1 day', now() - interval '1 day'),
    (v_shop6, 'Abdullah', '03001234567',
     jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM public.products WHERE shop_id = v_shop6 ORDER BY created_at ASC LIMIT 1 OFFSET 2), 'name', 'Multivitamin Complex', 'price', 900, 'quantity', 1)),
     900, 900, 0, 0, 'Processing', 'e5555555-5555-4555-8555-555555555555', 'TM-6002', NULL, now(), now());

  -- ==========================================================================
  -- REVIEWS (from the customer account)
  -- ==========================================================================
  INSERT INTO public.reviews (shop_id, customer_name, rating, comment, created_at, user_id, verified_purchase)
  VALUES
    (v_shop1, 'Abdullah', 5, 'Very fresh groceries and quick delivery!', now() - interval '2 days', 'e5555555-5555-4555-8555-555555555555', true),
    (v_shop2, 'Abdullah', 5, 'Loved the kurtas — great stitching.', now() - interval '4 days', 'e5555555-5555-4555-8555-555555555555', true),
    (v_shop3, 'Abdullah', 4, 'Genuine products with fast service.', now() - interval '3 days', 'e5555555-5555-4555-8555-555555555555', true),
    (v_shop4, 'Abdullah', 4, 'Good prices on everyday items.', now() - interval '2 days', 'e5555555-5555-4555-8555-555555555555', true),
    (v_shop5, 'Abdullah', 5, 'Best birthday cake I have ordered!', now() - interval '3 days', 'e5555555-5555-4555-8555-555555555555', true),
    (v_shop6, 'Abdullah', 4, 'Genuine medicines, delivered on time.', now() - interval '1 day', 'e5555555-5555-4555-8555-555555555555', true);

  -- ==========================================================================
  -- COUPONS (one per shop — visible under Best Discounts)
  -- ==========================================================================
  INSERT INTO public.coupons (shop_id, code, discount_percent, discount_amount, expiry_date, starts_at, expires_at, usage_limit, usage_count, is_active, min_order_amount)
  VALUES
    (v_shop1, 'HFRESH10', 10, NULL, now() + interval '30 days', now(), now() + interval '30 days', 100, 4, true, 500),
    (v_shop2, 'HFASHION15', 15, NULL, now() + interval '30 days', now(), now() + interval '30 days', 100, 2, true, 1000),
    (v_shop3, 'HGADGET10', 10, NULL, now() + interval '30 days', now(), now() + interval '30 days', 100, 6, true, 1500),
    (v_shop4, 'TGROCER5', 5, NULL, now() + interval '30 days', now(), now() + interval '30 days', 100, 1, true, 500),
    (v_shop5, 'TBAKER10', 10, NULL, now() + interval '30 days', now(), now() + interval '30 days', 100, 3, true, 500),
    (v_shop6, 'TCARE5', 5, NULL, now() + interval '30 days', now(), now() + interval '30 days', 100, 0, true, 500);

  -- ==========================================================================
  -- ANALYTICS (shop views + product clicks — powers "Popular/Trending")
  -- ==========================================================================
  INSERT INTO public.analytics_logs (shop_id, event_type, product_id, visitor_ip, created_at)
  SELECT shop_id, 'shop_view', NULL, '203.0.113.10', now() - (g || ' hours')::interval
  FROM unnest(ARRAY[v_shop1, v_shop2, v_shop3, v_shop4, v_shop5, v_shop6]::uuid[]) AS s(shop_id)
  CROSS JOIN generate_series(1, 6) AS g;

  INSERT INTO public.analytics_logs (shop_id, event_type, product_id, visitor_ip, created_at)
  SELECT p.shop_id, 'product_click', p.id, '203.0.113.11', now() - (g || ' hours')::interval
  FROM public.products p
  CROSS JOIN generate_series(1, 3) AS g
  WHERE p.id IN (
    SELECT id FROM public.products ORDER BY created_at ASC LIMIT 18
  );

  RAISE NOTICE '[OK] Seed complete: 6 shops, 120 products, 30 deals, orders/reviews/coupons created.';
END $$;

COMMIT;

-- ── 7) Drop the temporary seed helpers ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.seed_img(text);
DROP FUNCTION IF EXISTS public.seed_short_code();

-- ── 8) Reload PostgREST schema cache so everything answers immediately ───────
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- [OK] Done. Logins (password Huzaifash1133@ unless shown):
--   admin     huzaifash313@gmail.com      Huzaifash1133@#$%
--   merchant  huzaiffa12344321@gmail.com
--   merchant  huzzi11266@gmail.com
--   merchant  huzzi8564@gmail.com
--   merchant  test123@gmail.com
--   merchant  test1234@gmail.com
--   merchant  test12345@gmail.com
--   customer  abdwhaw99@gmail.com
-- =============================================================================
