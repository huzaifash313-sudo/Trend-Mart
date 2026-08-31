-- =============================================================================
-- TrendsMart — Strict Order Ownership
-- =============================================================================
-- Closes the last order-data exposure paths so an order is ONLY ever returned
-- to someone with a genuine relationship to it:
--
--   1. Orders RLS — the previous `orders_customer_select` policy let a signed-in
--      user read any order where `customer_user_id` happened to match them, with
--      NO phone verification. The strict replacement requires BOTH:
--        • orders.customer_user_id = auth.uid()   (the current signed-in user)
--        • orders.customer_phone matches the phone on that user's own profile
--      (normalized to the trailing 10 digits so "0300…" and "92300…" compare equal).
--      Merchants/admins keep their existing owner/admin SELECT policies, so the
--      two flows stay fully separated.
--
--   2. `track_orders_by_phone` RPC — even when a phone match is found, the order
--      is only returned when the caller has a genuine relationship to it:
--        • the customer who placed it (customer_user_id = auth.uid()), OR
--        • the owning merchant (shops.owner_id = auth.uid()), OR
--        • a platform admin.
--      Anonymous callers now receive ZERO rows — the phone number can no longer
--      act as a bearer token into someone else's order history.
--
--   3. `track_order_by_id` keeps the same ownership predicate (already hardened)
--      and now also surfaces `customer_user_id` so the API layer can re-check it.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1. Orders RLS: customer may read ONLY their own order (phone + user_id) ──
DROP POLICY IF EXISTS "orders_customer_select" ON public.orders;
CREATE POLICY "orders_customer_select"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    customer_user_id IS NOT NULL
    AND customer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.phone IS NOT NULL
        AND length(regexp_replace(up.phone, '\D', '', 'g')) >= 10
        AND right(regexp_replace(up.phone, '\D', '', 'g'), 10)
            = right(regexp_replace(customer_phone, '\D', '', 'g'), 10)
    )
  );

-- ── 2. track_orders_by_phone: strict ownership even on a phone match ─────────
-- NOTE: The return row type gains a `customer_user_id` column, which PostgreSQL
-- forbids via CREATE OR REPLACE (42P13). Drop first, then re-create + re-grant.
DROP FUNCTION IF EXISTS public.track_orders_by_phone(text);
CREATE FUNCTION public.track_orders_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  shop_name text,
  shop_whatsapp text,
  customer_name text,
  customer_phone text,
  customer_user_id uuid,
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
    o.id, o.shop_id, s.name AS shop_name, s.whatsapp_number AS shop_whatsapp,
    o.customer_name, o.customer_phone, o.customer_user_id,
    o.items_json, o.total_amount, o.status, o.tracking_number, o.created_at, o.updated_at
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
    AND (
      o.customer_user_id = auth.uid()
      OR s.owner_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  ORDER BY o.created_at DESC
  LIMIT 50;
$$;

-- ── 3. track_order_by_id: same strict ownership predicate ────────────────────
-- Same return-type change as above — drop first.
DROP FUNCTION IF EXISTS public.track_order_by_id(uuid);
CREATE FUNCTION public.track_order_by_id(p_order_id uuid)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  shop_name text,
  shop_whatsapp text,
  customer_name text,
  customer_phone text,
  customer_user_id uuid,
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
    o.id, o.shop_id, s.name AS shop_name, s.whatsapp_number AS shop_whatsapp,
    o.customer_name, o.customer_phone, o.customer_user_id,
    o.items_json, o.total_amount, o.status, o.tracking_number, o.created_at, o.updated_at
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  WHERE o.id = p_order_id
    AND (
      o.customer_user_id = auth.uid()
      OR s.owner_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.track_orders_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order_by_id(uuid) TO anon, authenticated;

COMMIT;
