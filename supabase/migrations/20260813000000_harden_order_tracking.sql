-- =============================================================================
-- TrendsMart — Harden guest "Track Order by ID" (closes a single-order PII leak)
-- =============================================================================
-- `track_order_by_id(p_order_id)` was granted to `anon` and returned the full
-- order (customer name, phone, items, notes) to anyone who knew an order UUID.
-- UUIDs are high-entropy but they leak through shared/clicked tracking links,
-- so we now only return the order to someone with a genuine relationship to it:
--   • the customer who placed it (orders.customer_user_id), OR
--   • the owning merchant (shops.owner_id), OR
--   • a platform admin.
--
-- For everyone else the function returns ZERO ROWS (not an error), so the
-- existence of an order is never revealed. Guest "Track by Phone" still works
-- unchanged via `track_orders_by_phone` (the phone number is the bearer token
-- the caller must already possess).
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_user_id uuid;

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
    AND (
      o.customer_user_id = auth.uid()
      OR s.owner_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  LIMIT 1;
$$;

-- Re-affirm grants (anon callers now always receive zero rows — the ownership
-- predicate above filters them out).
GRANT EXECUTE ON FUNCTION public.track_order_by_id(uuid) TO anon, authenticated;

COMMIT;
