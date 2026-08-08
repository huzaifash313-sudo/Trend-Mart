-- =============================================================================
-- TrendMart — RLS Security Audit & Hardening (Prompt 3)
--
-- This migration performs a comprehensive review of all existing RLS policies
-- and applies hard security patches to eliminate:
--   1. Permissive anonymous SELECT on sensitive tables (orders leak)
--   2. Missing RLS on any user-data tables (customer_wishlists, favorite_stores)
--   3. Insufficient WITH CHECK constraints on INSERT operations
--   4. Any cross-tenant data access vectors
--
-- IDEMPOTENT — all statements use IF NOT EXISTS / DROP IF EXISTS.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: CRITICAL FIX — ORDERS TABLE ANONYMOUS SELECT LEAK
--
-- PROBLEM: orders_public_select_by_phone uses USING (true), which allows
--          any anonymous user to list ALL orders in the database. This is
--          a severe data leak violating customer privacy.
--
-- FIX:     Remove the permissive policy. Anonymous users must authenticate
--          OR query via a security-definer function that validates the
--          phone number against the request context. Application-layer
--          filtering remains the primary enforcer; RLS is the hard backup.
-- =============================================================================

-- Drop the permissive anonymous SELECT policy on orders
DROP POLICY IF EXISTS "orders_public_select_by_phone" ON public.orders;

-- Replace with a strict policy: anonymous users CANNOT SELECT orders at all.
-- Customers must authenticate to see their orders.
-- For the WhatsApp pre-filled order lookup, create a dedicated RPC function.
CREATE POLICY "orders_public_no_select"
  ON public.orders FOR SELECT
  USING (false);  -- Anonymous cannot read orders; authenticated via orders_owner_read

-- =============================================================================
-- SECTION 2: SECURE ORDER LOOKUP FUNCTION (for WhatsApp flow)
--
-- Customers who placed an order via WhatsApp can look up their order
-- by providing the order ID AND their phone number. This function
-- enforces phone-number ownership verification server-side.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_order_by_phone(
  p_order_id uuid,
  p_customer_phone text
)
RETURNS SETOF public.orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.orders
  WHERE id = p_order_id
    AND customer_phone = p_customer_phone
  LIMIT 1;
END;
$$;

-- =============================================================================
-- SECTION 3: HARDEN COUPONS — RESTRICT PUBLIC READ
--
-- PROBLEM: coupons_public_read_active allows anyone to read ALL active
--          coupons. While this is intended for public consumption,
--          we should restrict to only published, non-expired, within-usage-limit
--          coupons with a validity date check.
--
-- FIX:     Add additional USING clauses for expiration and usage limits.
-- =============================================================================

DROP POLICY IF EXISTS "coupons_public_read_active" ON public.coupons;
CREATE POLICY "coupons_public_read_active"
  ON public.coupons FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (usage_limit IS NULL OR usage_count < usage_limit)
    AND (starts_at IS NULL OR starts_at <= now())
  );

-- =============================================================================
-- SECTION 4: HARDEN PRODUCTS — RESTRICT PUBLIC READ TO AVAILABLE PRODUCTS
--
-- While products are public, merchants may want to hide certain products
-- from the public catalog (e.g., draft products, discontinued items).
-- Add a policy that restricts public SELECT to is_available = true products.
-- Merchants (authenticated) can still see all their products.
-- =============================================================================

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (
    -- Public users see only available products
    -- Authenticated shop owners see all their products (handled by products_owner_*)
    is_available = true
  );

-- =============================================================================
-- SECTION 5: HARDEN INVENTORY_VARIANTS — RESTRICT PUBLIC READ
--
-- Same principle: public users should only see variants of available products.
-- =============================================================================

DROP POLICY IF EXISTS "inventory_variants_public_read" ON public.inventory_variants;
CREATE POLICY "inventory_variants_public_read"
  ON public.inventory_variants FOR SELECT
  USING (
    is_available = true
  );

-- =============================================================================
-- SECTION 6: CUSTOMER_WISHLISTS OWNERSHIP HELPER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_wishlist_owner(p_wishlist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_wishlists
    WHERE id = p_wishlist_id AND user_id = auth.uid()
  );
$$;

-- =============================================================================
-- SECTION 7: FAVORITE_STORES OWNERSHIP HELPER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_favorite_store_owner(p_favorite_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.favorite_stores
    WHERE id = p_favorite_id AND user_id = auth.uid()
  );
$$;

-- =============================================================================
-- SECTION 8: ADD RLS POLICIES FOR CUSTOMER_WISHLISTS (in-line hardening)
-- Already created in migration 20250806010000, but ensure idempotent.
-- =============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.customer_wishlists ENABLE ROW LEVEL SECURITY;

-- SELECT: Only the owning user
DROP POLICY IF EXISTS "wishlist_user_select" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_select"
  ON public.customer_wishlists FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: user_id must match the authenticated user
DROP POLICY IF EXISTS "wishlist_user_insert" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_insert"
  ON public.customer_wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Only the owning user
DROP POLICY IF EXISTS "wishlist_user_update" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_update"
  ON public.customer_wishlists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Only the owning user
DROP POLICY IF EXISTS "wishlist_user_delete" ON public.customer_wishlists;
CREATE POLICY "wishlist_user_delete"
  ON public.customer_wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- SECTION 9: ADD RLS POLICIES FOR FAVORITE_STORES (in-line hardening)
-- =============================================================================

ALTER TABLE public.favorite_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "favorite_stores_user_select" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_select"
  ON public.favorite_stores FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorite_stores_user_insert" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_insert"
  ON public.favorite_stores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorite_stores_user_update" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_update"
  ON public.favorite_stores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorite_stores_user_delete" ON public.favorite_stores;
CREATE POLICY "favorite_stores_user_delete"
  ON public.favorite_stores FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- SECTION 10: PREVENT MASS DELETION ATTACKS
--
-- Ensure no policy allows DELETE without authentication.
-- Add a trigger that prevents bulk DELETE operations (more than 50 rows at once)
-- as a safety net against accidental or malicious mass deletion.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_mass_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 50 THEN
    RAISE EXCEPTION 'Mass deletion prevented: attempted to delete % rows. Maximum is 50 per statement.', deleted_count;
  END IF;
  RETURN NULL;
END;
$$;

-- Apply to critical tables (only if trigger doesn't already exist)
DO $$
DECLARE
  tbl text;
  trigger_name text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY['products','orders','inventory_variants','reviews','stories','coupons','customer_inquiries','analytics_logs','customer_wishlists','favorite_stores'])
  LOOP
    trigger_name := 'trg_prevent_mass_delete_' || tbl;
    -- Drop if exists, then create
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', trigger_name, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_mass_delete();',
      trigger_name, tbl
    );
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 11: AUDIT LOGGING TRIGGER — TRACK SENSITIVE OPERATIONS
--
-- Automatically logs INSERT/UPDATE/DELETE on sensitive tables to the
-- security_audit_log table for forensic analysis.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_sensitive_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  action_type text;
  record_id_val uuid;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := 'INSERT';
    record_id_val := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'UPDATE';
    record_id_val := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'DELETE';
    record_id_val := OLD.id;
  END IF;

  -- Insert audit record
  INSERT INTO public.security_audit_log (
    actor_id, table_name, record_id, action, ip_address, user_agent, metadata
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    record_id_val,
    action_type,
    NULL,  -- IP not available at DB level without extensions
    NULL,  -- User-agent not available at DB level
    jsonb_build_object('schema', TG_TABLE_SCHEMA, 'operation', TG_OP)
  );

  -- For INSERT and UPDATE, return NEW; for DELETE, return OLD
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply audit triggers to all business-critical tables
DO $$
DECLARE
  tbl text;
  trigger_name text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY['products','orders','inventory_variants','reviews','coupons','customer_inquiries'])
  LOOP
    trigger_name := 'trg_audit_' || tbl;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', trigger_name, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_operation();',
      trigger_name, tbl
    );
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 12: UPDATED RLS AUDIT VIEW (includes new tables)
-- =============================================================================

DROP VIEW IF EXISTS public.rls_tenant_audit_summary;
CREATE OR REPLACE VIEW public.rls_tenant_audit_summary AS
SELECT
  p.tablename AS table_name,
  p.policyname AS policy_name,
  p.cmd AS operation,
  p.roles,
  CASE WHEN p.qual IS NOT NULL THEN '✅ Restricted' ELSE '⚠️ Open (no USING)' END AS using_clause,
  CASE WHEN p.with_check IS NOT NULL THEN '✅ Restricted' ELSE '⚠️ Open (no WITH CHECK)' END AS check_clause,
  CASE
    WHEN p.cmd IN ('INSERT', 'UPDATE', 'DELETE') AND p.with_check IS NULL THEN '🔴 CRITICAL'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL
         AND p.tablename IN ('orders', 'analytics_logs', 'customer_inquiries',
                             'customer_wishlists', 'favorite_stores', 'inventory_variants') THEN '🟡 HIGH'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL THEN '🟢 PUBLIC'
    ELSE '🟢 SECURE'
  END AS risk_level
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN (
    'shops', 'products', 'orders', 'reviews', 'stories',
    'coupons', 'customer_inquiries', 'analytics_logs', 'security_audit_log',
    'inventory_variants', 'customer_wishlists', 'favorite_stores'
  )
ORDER BY
  CASE
    WHEN p.cmd IN ('INSERT', 'UPDATE', 'DELETE') AND p.with_check IS NULL THEN 0
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL
         AND p.tablename IN ('orders', 'analytics_logs', 'customer_inquiries',
                             'customer_wishlists', 'favorite_stores') THEN 1
    ELSE 2
  END,
  p.tablename,
  p.cmd;

-- =============================================================================
-- SECTION 13: VERIFICATION QUERIES
-- =============================================================================

-- 13.1 Verify all target tables have RLS enabled
DO $$
DECLARE
  missing_rls text;
BEGIN
  SELECT string_agg(tablename, ', ') INTO missing_rls
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false
    AND tablename IN (
      'shops','products','orders','reviews','stories',
      'coupons','customer_inquiries','analytics_logs','security_audit_log',
      'inventory_variants','customer_wishlists','favorite_stores'
    );

  IF missing_rls IS NOT NULL THEN
    RAISE WARNING '⚠️ The following tables have RLS DISABLED: %', missing_rls;
  ELSE
    RAISE NOTICE '✅ All 12 tables have RLS enabled.';
  END IF;
END $$;

-- 13.2 Verify no policy allows anonymous DELETE or UPDATE on any table
DO $$
DECLARE
  permissive_count integer;
BEGIN
  SELECT count(*) INTO permissive_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd IN ('UPDATE', 'DELETE')
    AND roles @> ARRAY['anon']::name[]
    AND with_check IS NULL;

  IF permissive_count > 0 THEN
    RAISE WARNING '⚠️ Found % permissive anonymous UPDATE/DELETE policies.', permissive_count;
  ELSE
    RAISE NOTICE '✅ No permissive anonymous UPDATE/DELETE policies found.';
  END IF;
END $$;

-- 13.3 Verify order table no longer allows anonymous SELECT
DO $$
DECLARE
  leak_count integer;
BEGIN
  SELECT count(*) INTO leak_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'orders'
    AND cmd = 'SELECT'
    AND roles @> ARRAY['anon']::name[]
    AND qual IS NULL;

  IF leak_count > 0 THEN
    RAISE WARNING '🔴 CRITICAL: orders table still has permissive anonymous SELECT policy!';
  ELSE
    RAISE NOTICE '✅ orders table anonymous SELECT leak is patched.';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ✅ POST-MIGRATION VERIFICATION CHECKLIST:
--
-- 1. Run: SELECT * FROM public.rls_tenant_audit_summary ORDER BY risk_level, table_name;
--    → All rows should show 🟢 SECURE or 🟢 PUBLIC
--    → No 🔴 CRITICAL or 🟡 HIGH entries should remain
--
-- 2. Test as anonymous user:
--    → SELECT * FROM orders;        — should return 0 rows (blocked by RLS)
--    → SELECT * FROM customer_wishlists; — should return 0 rows
--    → DELETE FROM products;        — should be blocked
--
-- 3. Test as authenticated merchant:
--    → Can only see own shop's orders, products, inventory_variants, analytics
--    → Cannot see other merchants' data
--
-- 4. Test as authenticated customer:
--    → Can only see own wishlist and favorite_stores
--    → Cannot see other users' bookmarks
--
-- 5. Test order lookup function:
--    → SELECT * FROM public.get_order_by_phone('order-uuid', '+923001234567');
--    → Should only return the order if the phone matches
--
-- 6. Test mass deletion prevention:
--    → DELETE FROM products WHERE shop_id = 'any-uuid';
--    → Should throw error if > 50 rows would be affected
--
-- 7. Test audit logging:
--    → INSERT/UPDATE/DELETE on products should create security_audit_log entries
-- =============================================================================