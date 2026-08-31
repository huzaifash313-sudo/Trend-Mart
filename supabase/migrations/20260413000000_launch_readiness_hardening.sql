-- =============================================================================
-- TrendsMart — Launch Readiness Hardening (WhatsApp-First Soft Launch)
-- =============================================================================
-- This migration is idempotent and safe to re-run. It fixes four concrete,
-- provable production bugs found during a full RLS/security audit:
--
--   1. `user_roles` — the admin policy shipped in 20250805170000_roles_rbac.sql
--      queries `public.user_roles` from inside its OWN USING clause, which
--      Postgres flags as "infinite recursion detected in policy for relation
--      user_roles" → PostgREST surfaces this as a 500 on any GET to
--      /rest/v1/user_roles. We replace it with the non-recursive
--      `public.is_admin()` helper (SECURITY DEFINER, already used safely by
--      every later migration in this repo).
--
--   2. `claimSignupRole()` (services/authService.ts) calls an RPC named
--      `set_my_signup_role` that was NEVER defined in any migration — the
--      call always fails and falls back to a raw client-side upsert into
--      `user_roles`, which then fails RLS because no INSERT/UPDATE policy
--      ever existed for regular users. This is the root cause of "become a
--      merchant" silently failing after the auto-approval flow was added.
--      We define the missing RPC (SECURITY DEFINER, role allow-list only
--      'customer'/'merchant' — never 'admin', closing a privilege-escalation
--      hole) and also add narrow self-serve INSERT/UPDATE policies as a
--      defense-in-depth fallback.
--
--   3. Admin Moderation — `20250807000000_fresh_consolidated.sql` reset
--      `shops`/`products` RLS to owner-only for writes, with no admin
--      override. The Admin Panel's Suspend/Activate/Approve/Reject/Delete
--      actions run as the logged-in admin's own session (not a service key),
--      so every one of those actions was silently failing for shops the
--      admin doesn't personally own — and pending/rejected/suspended shops
--      owned by *other* users weren't even visible to the admin's SELECT
--      query. We grant admins full CRUD via `public.is_admin()`.
--
--   4. Orders PII leak — `fresh_consolidated` also reset the orders SELECT
--      policy to `USING (true)`, letting *anyone* (no auth required) read
--      every customer's name, phone number, delivery address and order
--      contents platform-wide via a raw REST call. We restrict direct table
--      reads to the shop owner and admins, and add two narrow SECURITY
--      DEFINER RPCs (`track_orders_by_phone`, `track_order_by_id`) so the
--      guest-facing "Track My Order" pages keep working without exposing
--      the whole table.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: is_admin() / is_shop_owner() — re-affirm (idempotent no-op if
-- already correct). These are SECURITY DEFINER + empty search_path, so their
-- internal queries run as the function owner and bypass RLS — safe to call
-- from inside other tables' policies without recursion.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(p_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(uuid) TO anon, authenticated;

-- =============================================================================
-- SECTION 2: USER_ROLES — kill the recursive policy, add safe replacements
-- =============================================================================

-- Drop every known-bad/legacy policy name this table has ever had, from any
-- of the overlapping migration files in this repo's history.
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_own" ON public.user_roles;

-- 2.1 Users can always read their own role row.
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- 2.2 Admins can read/write every role row — via the non-recursive helper.
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2.3 Defense-in-depth: a signed-in user may create their OWN role row if one
-- doesn't exist yet (normally handled by the handle_new_user trigger below,
-- but this covers accounts created before the trigger existed). Regular
-- users may never write 'admin' — only the admin-all policy above can.
CREATE POLICY "user_roles_insert_own"
  ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

-- 2.4 Defense-in-depth: a signed-in user may update their OWN role between
-- 'customer' and 'merchant' only (e.g. the become-merchant flow's fallback
-- path when the RPC below is unavailable). Never to/from 'admin'.
CREATE POLICY "user_roles_update_own"
  ON public.user_roles FOR UPDATE
  USING (auth.uid() = user_id AND role <> 'admin')
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

-- 2.5 The missing RPC — `services/authService.ts#claimSignupRole()` calls
-- this first and only falls back to the raw upsert above if it 404s. Define
-- it so the primary (correct, atomic) path actually works.
CREATE OR REPLACE FUNCTION public.set_my_signup_role(desired_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Never allow self-service promotion to admin.
  IF desired_role NOT IN ('customer', 'merchant') THEN
    RAISE EXCEPTION 'Invalid role: %', desired_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), desired_role::public.app_role)
  ON CONFLICT (user_id)
  DO UPDATE SET role = desired_role::public.app_role, updated_at = now()
  WHERE public.user_roles.role <> 'admin';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_signup_role(text) TO authenticated;

-- 2.6 Re-affirm the auto-provision-on-signup trigger (SECURITY DEFINER,
-- bypasses RLS, so every new auth.users row always gets a default
-- 'customer' role regardless of the policies above).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- SECTION 3: SHOPS — instant-live confirmation + admin moderation access
-- =============================================================================

-- 3.1 New stores are live + approved immediately (no admin queue). This is
-- enforced in application code (services/shopService.ts#createShop), but we
-- also relax the column default so any future direct DB insert defaults to
-- live rather than hidden.
ALTER TABLE public.shops ALTER COLUMN is_live SET DEFAULT true;

-- 3.2 Admins get full CRUD on every shop — this is what actually powers the
-- Admin Panel's Approve / Reject / Suspend / Activate / Delete actions,
-- which run as the admin's own authenticated session (not a service key).
DROP POLICY IF EXISTS "shops_admin_all" ON public.shops;
DROP POLICY IF EXISTS "shops_admin_read" ON public.shops;
CREATE POLICY "shops_admin_all"
  ON public.shops FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3.3 Re-affirm owner delete policy also covers the merchant's own
-- self-service store deletion (unchanged behavior, just idempotent).
DROP POLICY IF EXISTS "shops_owner_delete" ON public.shops;
CREATE POLICY "shops_owner_delete"
  ON public.shops FOR DELETE
  USING (auth.uid() = owner_id);

-- 3.4 Re-affirm merchant role promotion. fresh_consolidated wiped the
-- function + trigger; recreate both so this migration never fails mid-way.
CREATE OR REPLACE FUNCTION public.promote_to_merchant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;
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

-- =============================================================================
-- SECTION 4: PRODUCTS — admin moderation access (remove violating listings)
-- =============================================================================
DROP POLICY IF EXISTS "products_admin_all" ON public.products;
CREATE POLICY "products_admin_all"
  ON public.products FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- SECTION 5: ORDERS — close the anonymous full-table-read PII leak
-- =============================================================================

-- Ensure columns referenced by tracking RPCs exist on older schemas.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes text;

-- Drop every known-bad/legacy SELECT policy name for this table.
DROP POLICY IF EXISTS "orders_public_select" ON public.orders;
DROP POLICY IF EXISTS "orders_public_select_by_phone" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_read" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_read" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;

-- 5.1 Guests can still place orders (WhatsApp checkout requires no login).
DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
CREATE POLICY "orders_public_insert"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- 5.2 Only the owning merchant or an admin may read orders directly.
-- Anonymous/guest order lookups ("Track My Order") go through the
-- SECURITY DEFINER RPCs below instead of a raw table read.
CREATE POLICY "orders_owner_select"
  ON public.orders FOR SELECT
  USING (public.is_shop_owner(shop_id));

CREATE POLICY "orders_admin_select"
  ON public.orders FOR SELECT
  USING (public.is_admin());

-- 5.3 Merchant can update their own orders' status; admins can too.
DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
CREATE POLICY "orders_owner_update"
  ON public.orders FOR UPDATE
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_admin_update"
  ON public.orders FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5.4 Narrow, purpose-built lookups for the guest-facing order tracking
-- pages (app/orders/page.tsx, app/orders/tracking/page.tsx). These run as
-- SECURITY DEFINER so they bypass the now-strict RLS above, but they only
-- ever return orders matching the exact phone/id the caller supplies —
-- never the whole table.
CREATE OR REPLACE FUNCTION public.track_orders_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  shop_name text,
  customer_name text,
  customer_phone text,
  items_json jsonb,
  total_amount numeric,
  status text,
  tracking_number text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT CASE
      WHEN length(regexp_replace(p_phone, '\D', '', 'g')) >= 11
           AND left(regexp_replace(p_phone, '\D', '', 'g'), 1) = '0'
        THEN '92' || substr(regexp_replace(p_phone, '\D', '', 'g'), 2)
      WHEN length(regexp_replace(p_phone, '\D', '', 'g')) = 10
           AND left(regexp_replace(p_phone, '\D', '', 'g'), 1) = '3'
        THEN '92' || regexp_replace(p_phone, '\D', '', 'g')
      ELSE regexp_replace(p_phone, '\D', '', 'g')
    END AS digits
  )
  SELECT
    o.id, o.shop_id, s.name AS shop_name, o.customer_name, o.customer_phone,
    o.items_json, o.total_amount, o.status, o.tracking_number,
    o.created_at, o.updated_at
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  CROSS JOIN normalized n
  WHERE length(n.digits) >= 10
    AND (
      regexp_replace(o.customer_phone, '\D', '', 'g') LIKE '%' || n.digits || '%'
      OR regexp_replace(o.customer_phone, '\D', '', 'g') LIKE '%' || right(n.digits, 10) || '%'
      OR (
        left(regexp_replace(o.customer_phone, '\D', '', 'g'), 1) = '0'
        AND ('92' || substr(regexp_replace(o.customer_phone, '\D', '', 'g'), 2))
            LIKE '%' || n.digits || '%'
      )
    )
  ORDER BY o.created_at DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.track_order_by_id(p_order_id uuid)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  shop_name text,
  customer_name text,
  customer_phone text,
  items_json jsonb,
  total_amount numeric,
  status text,
  tracking_number text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id, o.shop_id, s.name AS shop_name, o.customer_name, o.customer_phone,
    o.items_json, o.total_amount, o.status, o.tracking_number,
    o.created_at, o.updated_at
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  WHERE o.id = p_order_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.track_orders_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order_by_id(uuid) TO anon, authenticated;

COMMIT;
