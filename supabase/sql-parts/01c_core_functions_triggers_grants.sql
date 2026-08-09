-- TrendMart: 01c_core_functions_triggers_grants.sql
-- Run in Supabase SQL Editor. If Failed to fetch: refresh, wait, retry this file only.

BEGIN;

-- =============================================================================
-- SECTION 25: HELPER FUNCTIONS — Ownership verification
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_shop_owner_id(p_shop_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT owner_id FROM public.shops WHERE id = p_shop_id;
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_product_shop_id(p_product_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT shop_id FROM public.products WHERE id = p_product_id;
$$;

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
-- SECTION 26: HELPER FUNCTIONS — Inventory operations
-- =============================================================================

CREATE OR REPLACE FUNCTION public.deduct_variant_stock(
  p_variant_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_stock integer;
BEGIN
  SELECT stock INTO v_current_stock
  FROM public.inventory_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_current_stock < p_quantity THEN
    RETURN false;
  END IF;

  UPDATE public.inventory_variants
  SET stock = stock - p_quantity,
      updated_at = now()
  WHERE id = p_variant_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_variant_stock(
  p_variant_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.inventory_variants
  SET stock = stock + p_quantity,
      updated_at = now()
  WHERE id = p_variant_id;

  RETURN FOUND;
END;
$$;

-- =============================================================================
-- SECTION 27: HELPER FUNCTIONS — Order & migration
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

CREATE OR REPLACE FUNCTION public.migrate_wishlist_item(
  p_user_id    uuid,
  p_product_id uuid,
  p_type       text,
  p_name       text,
  p_image_url  text DEFAULT NULL,
  p_shop_id    uuid DEFAULT NULL,
  p_shop_name  text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot migrate wishlist items for another user.';
  END IF;

  INSERT INTO public.customer_wishlists (
    user_id, product_id, shop_id, type, name, image_url, shop_name
  ) VALUES (
    p_user_id, p_product_id, p_shop_id, p_type, p_name, p_image_url, p_shop_name
  )
  ON CONFLICT (user_id, product_id, type) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.migrate_favorite_store(
  p_user_id   uuid,
  p_shop_id   uuid,
  p_shop_name text,
  p_logo_url  text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot migrate favorite stores for another user.';
  END IF;

  INSERT INTO public.favorite_stores (user_id, shop_id, shop_name, logo_url)
  VALUES (p_user_id, p_shop_id, p_shop_name, p_logo_url)
  ON CONFLICT (user_id, shop_id) DO NOTHING;

  RETURN true;
END;
$$;

-- =============================================================================
-- SECTION 28: TRIGGER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chosen text;
  resolved public.app_role;
BEGIN
  chosen := lower(coalesce(NEW.raw_user_meta_data->>'role', 'customer'));
  IF chosen = 'merchant' THEN
    resolved := 'merchant';
  ELSE
    resolved := 'customer';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, resolved)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.promote_to_merchant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.owner_id, 'merchant')
  ON CONFLICT (user_id)
  DO UPDATE SET role = 'merchant', updated_at = now()
  WHERE public.user_roles.role = 'customer';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_shop_created ON public.shops;
CREATE TRIGGER after_shop_created
  AFTER INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_to_merchant();

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

  INSERT INTO public.security_audit_log (
    actor_id, table_name, record_id, action, ip_address, user_agent, metadata
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    record_id_val,
    action_type,
    NULL,
    NULL,
    jsonb_build_object('schema', TG_TABLE_SCHEMA, 'operation', TG_OP)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 29: APPLY UPDATED_AT TRIGGERS TO ALL RELEVANT TABLES
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'shops','products','orders','reviews','stories','coupons',
      'customer_inquiries','inventory_variants','analytics_logs',
      'customer_wishlists','favorite_stores','customer_addresses',
      'service_packages','service_portfolio','service_availability',
      'merchant_subscriptions','user_roles'
    ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;
      CREATE TRIGGER trg_%s_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ', tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 30: APPLY MASS DELETE PREVENTION TRIGGERS
-- =============================================================================

DO $$
DECLARE
  tbl text;
  trigger_name text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products','orders','inventory_variants','reviews','stories','coupons',
      'customer_inquiries','analytics_logs','customer_wishlists','favorite_stores'
    ])
  LOOP
    trigger_name := 'trg_prevent_mass_delete_' || tbl;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', trigger_name, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_mass_delete();',
      trigger_name, tbl
    );
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 31: APPLY AUDIT TRIGGERS TO CRITICAL TABLES
-- =============================================================================

DO $$
DECLARE
  tbl text;
  trigger_name text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products','orders','inventory_variants','reviews','coupons','customer_inquiries'
    ])
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
-- SECTION 32: GRANT PERMISSIONS
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT SELECT ON public.shops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT INSERT, SELECT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT, INSERT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT SELECT ON public.stories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT SELECT ON public.coupons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_inquiries TO authenticated;
GRANT INSERT ON public.customer_inquiries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_logs TO authenticated;
GRANT INSERT ON public.analytics_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_variants TO authenticated;
GRANT SELECT ON public.inventory_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT INSERT ON public.leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_wishlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_packages TO authenticated;
GRANT SELECT ON public.service_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_portfolio TO authenticated;
GRANT SELECT ON public.service_portfolio TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_availability TO authenticated;
GRANT SELECT ON public.service_availability TO anon;
GRANT SELECT ON public.merchant_subscriptions TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT SELECT ON public.subscription_audit_log TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- =============================================================================
-- SECTION 33: RLS AUDIT SUMMARY VIEW
-- =============================================================================

DROP VIEW IF EXISTS public.rls_tenant_audit_summary;
CREATE OR REPLACE VIEW public.rls_tenant_audit_summary AS
SELECT
  p.tablename AS table_name,
  p.policyname AS policy_name,
  p.cmd AS operation,
  p.roles,
  CASE WHEN p.qual IS NOT NULL THEN 'Restricted' ELSE 'Open (no USING)' END AS using_clause,
  CASE WHEN p.with_check IS NOT NULL THEN 'Restricted' ELSE 'Open (no WITH CHECK)' END AS check_clause,
  CASE
    WHEN p.cmd IN ('INSERT', 'UPDATE', 'DELETE') AND p.with_check IS NULL THEN 'CRITICAL'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL
         AND p.tablename IN ('orders', 'analytics_logs', 'customer_inquiries',
                             'customer_wishlists', 'favorite_stores', 'inventory_variants',
                             'admin_audit_logs', 'security_audit_log') THEN 'HIGH'
    WHEN p.cmd = 'SELECT' AND p.qual IS NULL THEN 'PUBLIC'
    ELSE 'SECURE'
  END AS risk_level
FROM pg_policies p
WHERE p.schemaname = 'public'
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

COMMENT ON VIEW public.rls_tenant_audit_summary IS 'Multi-tenant RLS security audit view. Run: SELECT * FROM public.rls_tenant_audit_summary ORDER BY risk_level, table_name;';

-- =============================================================================
-- SECTION 34: SEED DEFAULT SERVICE AVAILABILITY FOR EXISTING SERVICE SHOPS
-- =============================================================================

DO $$
DECLARE
  svc_shop RECORD;
  d int;
BEGIN
  FOR svc_shop IN SELECT id FROM public.shops WHERE shop_type = 'service'
  LOOP
    FOR d IN 0..6 LOOP
      INSERT INTO public.service_availability (shop_id, day_of_week, is_working_day, start_time, end_time)
      VALUES (svc_shop.id, d, d NOT IN (0), '09:00'::TIME, '18:00'::TIME)
      ON CONFLICT (shop_id, day_of_week) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;


COMMIT;
