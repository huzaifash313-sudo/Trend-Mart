-- =============================================================================
-- TrendsMart — WhatsApp order lifecycle (sent tracking + resend payload)
-- =============================================================================
-- Customers place orders in-app first; WhatsApp is the hand-off to the merchant.
-- `whatsapp_sent_at` NULL means the merchant should verify before preparing.
-- `whatsapp_message` stores the exact checkout payload for "Send again".
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS whatsapp_message text;

COMMENT ON COLUMN public.orders.whatsapp_sent_at
  IS 'When the customer opened/sent the WhatsApp hand-off message. NULL = not confirmed yet.';
COMMENT ON COLUMN public.orders.whatsapp_message
  IS 'Pre-built WhatsApp order text (with Maps pin) for customer resend.';

-- ── Merchant notification: flag unconfirmed WhatsApp hand-offs ────────────────
CREATE OR REPLACE FUNCTION public.notify_order_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shop_owner uuid;
  merchant_body text;
  buyer_body text;
BEGIN
  SELECT owner_id INTO shop_owner FROM public.shops WHERE id = NEW.shop_id;

  IF NEW.whatsapp_sent_at IS NULL THEN
    merchant_body := NEW.customer_name
      || ' placed an order — WhatsApp message not sent yet. Tap WhatsApp to verify before preparing.';
  ELSE
    merchant_body := NEW.customer_name || ' placed an order (' || NEW.status || ').';
  END IF;

  IF shop_owner IS NOT NULL THEN
    PERFORM public.create_notification(
      shop_owner,
      'sale',
      'New Sale — Rs. ' || round(COALESCE(NEW.total_amount, 0))::text,
      merchant_body,
      '/dashboard/orders',
      NEW.id::text
    );
  END IF;

  IF NEW.customer_user_id IS NOT NULL THEN
    IF NEW.whatsapp_sent_at IS NULL THEN
      buyer_body := 'Order saved in TrendsMart. Send it on WhatsApp so the shop can confirm — or cancel from My Orders if you changed your mind.';
    ELSE
      buyer_body := 'Your order has been placed and sent to the shop.';
    END IF;

    PERFORM public.create_notification(
      NEW.customer_user_id,
      'order',
      'Order confirmed — Rs. ' || round(COALESCE(NEW.total_amount, 0))::text,
      buyer_body,
      '/orders/tracking?orderId=' || NEW.id::text,
      NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── Tracking RPCs: expose WhatsApp lifecycle fields ─────────────────────────
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
  whatsapp_sent_at timestamptz,
  whatsapp_message text,
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
    o.order_type, o.table_code, o.whatsapp_sent_at, o.whatsapp_message,
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
  whatsapp_sent_at timestamptz,
  whatsapp_message text,
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
    o.order_type, o.table_code, o.whatsapp_sent_at, o.whatsapp_message,
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

GRANT EXECUTE ON FUNCTION public.track_orders_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_order_by_id(uuid) TO anon, authenticated;

COMMIT;
