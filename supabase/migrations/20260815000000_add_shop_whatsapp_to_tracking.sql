-- =============================================================================
-- TrendMart — Expose shop WhatsApp number to order-tracking lookups
-- =============================================================================
-- The guest "Contact Merchant" button on /orders/tracking was building a blank
-- wa.me link because the tracking RPCs only returned `shop_name`, not the shop's
-- WhatsApp number. This adds `whatsapp_number` to both SECURITY DEFINER RPCs so
-- the client can build a real `https://wa.me/<number>` deep link.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.track_orders_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  shop_name text,
  shop_whatsapp text,
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
    o.id, o.shop_id, s.name AS shop_name, s.whatsapp_number AS shop_whatsapp,
    o.customer_name, o.customer_phone, o.items_json, o.total_amount, o.status,
    o.tracking_number, o.created_at, o.updated_at
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
  shop_whatsapp text,
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
    o.id, o.shop_id, s.name AS shop_name, s.whatsapp_number AS shop_whatsapp,
    o.customer_name, o.customer_phone, o.items_json, o.total_amount, o.status,
    o.tracking_number, o.created_at, o.updated_at
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
