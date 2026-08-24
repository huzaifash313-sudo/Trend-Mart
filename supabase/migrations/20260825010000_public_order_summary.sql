-- =============================================================================
-- TrendMart — Public Order Summary RPC
-- =============================================================================
-- Powers the single-link order summary page (`/o/[id]`). A WhatsApp order
-- message previously carried one deep-link per item (messy for 10-15 item
-- carts); now it carries ONE link that opens this grouped view.
--
-- Security: SECURITY DEFINER but ONLY exposes safe fields — items, totals,
-- shop identity. NO customer name, phone, address, notes, or user ids.
-- The order UUID is unguessable, so possession of the link is the only
-- requirement (same model as dine-in table tokens).
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_public_order_summary(uuid);
CREATE FUNCTION public.get_public_order_summary(p_order_id uuid)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  shop_name text,
  shop_logo_url text,
  shop_location text,
  items_json jsonb,
  total_amount numeric,
  discount_amount numeric,
  delivery_fee numeric,
  order_type text,
  table_code text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id, o.shop_id, s.name AS shop_name, s.logo_url AS shop_logo_url,
    s.location AS shop_location,
    o.items_json, o.total_amount,
    COALESCE(o.discount_amount, 0), COALESCE(o.delivery_fee, 0),
    o.order_type, o.table_code, o.status, o.created_at
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  WHERE o.id = p_order_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_order_summary(uuid) TO anon, authenticated;

COMMIT;
