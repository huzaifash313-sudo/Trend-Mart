-- =============================================================================
-- TrendsMart — Delivered Order → Review Reminder (in-app bell notification)
-- =============================================================================
-- When a merchant marks an order "Delivered", the buyer gets a dedicated
-- in-app notification inviting them to rate the shop. The review popup opens
-- automatically when they return to the app (client reads the delivered +
-- not-yet-reviewed shops). This trigger makes sure a durable bell entry exists
-- even if the client was offline when the status changed.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_order_delivered_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shop_name text;
BEGIN
  IF NEW.status = 'Delivered' AND NEW.customer_user_id IS NOT NULL THEN
    SELECT name INTO shop_name FROM public.shops WHERE id = NEW.shop_id;
    PERFORM public.create_notification(
      NEW.customer_user_id,
      'order',
      'Order delivered — rate your experience!',
      'Your order from ' || COALESCE(NULLIF(shop_name, ''), 'the shop') || ' was delivered. Tap to rate the shop.',
      '/account',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_notify_delivered_review ON public.orders;
CREATE TRIGGER trg_orders_notify_delivered_review
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'Delivered')
  EXECUTE FUNCTION public.notify_order_delivered_review();

COMMIT;
