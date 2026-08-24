-- =============================================================================
-- TrendMart — Fulfilment Modes (Pickup + Delivery Toggle)
-- =============================================================================
-- Merchants can pause individual order channels without touching the rest of
-- their store:
--   • accepts_delivery = false → checkout hides Delivery (restaurant can keep
--     serving dine-in tables + pickup while they pause deliveries).
--   • accepts_pickup   = false → checkout hides Pickup.
-- Dine-in (QR tables) is a separate channel that only exists for eligible
-- categories and is NOT affected by these toggles.
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS accepts_delivery boolean NOT NULL DEFAULT true;
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS accepts_pickup boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.shops.accepts_delivery
  IS 'Pause/allow delivery orders from checkout. Does not affect dine-in tables.';
COMMENT ON COLUMN public.shops.accepts_pickup
  IS 'Pause/allow self-pickup orders from checkout.';

-- ── Tracking RPCs: expose order_type + table_code so customer tracking and
--    the merchant order desk can show Pickup / Dine-in badges. Drop first
--    (return-type change → 42P13), then recreate + re-grant.
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
  order_type text,
  table_code text,
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
    o.items_json, o.total_amount, o.status, o.tracking_number,
    o.order_type, o.table_code, o.created_at, o.updated_at
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
  order_type text,
  table_code text,
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
    o.items_json, o.total_amount, o.status, o.tracking_number,
    o.order_type, o.table_code, o.created_at, o.updated_at
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
