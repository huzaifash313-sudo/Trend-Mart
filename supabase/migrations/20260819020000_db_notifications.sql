-- =============================================================================
-- TrendsMart — Persistent In-App Notification System (DB-backed bell)
-- =============================================================================
-- Replaces the fragile localStorage-only client notifications with a durable
-- `notifications` table. Server-side triggers create rows for:
--
--   • support_tickets INSERT      → notify every admin (New Support Ticket)
--   • support_tickets UPDATE      → notify the reporter (ticket status change)
--   • orders INSERT               → notify shop owner (New Sale) + buyer (confirmation)
--   • orders UPDATE (status)      → notify buyer (order status change)
--   • customer_inquiries INSERT   → notify shop owner (New Inquiry)
--
-- Clients subscribe to the `notifications` table via Supabase Realtime
-- (filtered by user_id) and hydrate the bell from this table, so notifications
-- survive offline periods, refreshes, and different browsers.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1. Notifications table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'system'
             CHECK (type IN ('support', 'order', 'sale', 'inquiry', 'system')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link_url   TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users may read their own notifications
DROP POLICY IF EXISTS "notifications_own_select" ON public.notifications;
CREATE POLICY "notifications_own_select"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users may mark their own notifications as read
DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
CREATE POLICY "notifications_own_update"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users may clear their own notifications
DROP POLICY IF EXISTS "notifications_own_delete" ON public.notifications;
CREATE POLICY "notifications_own_delete"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Required so Realtime can broadcast UPDATE/DELETE records too.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ── 2. Safe insert helper (SECURITY DEFINER — bypasses RLS) ─────────────────
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT '',
  p_link_url text DEFAULT '',
  p_entity_id text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL OR p_title IS NULL OR p_title = '' THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link_url, entity_id)
    VALUES (
      p_user_id,
      CASE WHEN p_type IN ('support', 'order', 'sale', 'inquiry', 'system')
           THEN p_type ELSE 'system' END,
      left(p_title, 160),
      left(COALESCE(p_body, ''), 500),
      left(COALESCE(p_link_url, ''), 300),
      left(COALESCE(p_entity_id, ''), 64)
    );
  EXCEPTION
    WHEN OTHERS THEN NULL; -- never fail the parent transaction on notify errors
  END;
END;
$$;

-- ── 3. Support tickets → notify every admin on new ticket ───────────────────
CREATE OR REPLACE FUNCTION public.notify_admins_new_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_user uuid;
BEGIN
  FOR admin_user IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    PERFORM public.create_notification(
      admin_user,
      'support',
      'New Support Ticket: ' || left(NEW.subject, 80),
      NEW.name || ' (' || NEW.category || ') — ' || left(NEW.message, 140),
      '/admin/support',
      NEW.id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_notify_admin ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_notify_admin
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_ticket();

-- ── 4. Support tickets → notify reporter on status change ───────────────────
CREATE OR REPLACE FUNCTION public.notify_ticket_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.user_id,
      'support',
      'Support request ' || NEW.status,
      'Your request "' || left(NEW.subject, 90) || '" is now ' || NEW.status || '.',
      '/support#my-requests',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_notify_user ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_notify_user
  AFTER UPDATE OF status ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_status_change();

-- ── 5. Orders → notify merchant (sale) + buyer (confirmation) ───────────────
CREATE OR REPLACE FUNCTION public.notify_order_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shop_owner uuid;
BEGIN
  SELECT owner_id INTO shop_owner FROM public.shops WHERE id = NEW.shop_id;

  IF shop_owner IS NOT NULL THEN
    PERFORM public.create_notification(
      shop_owner,
      'sale',
      'New Sale — Rs. ' || round(COALESCE(NEW.total_amount, 0))::text,
      NEW.customer_name || ' placed an order (' || NEW.status || ').',
      '/dashboard/orders',
      NEW.id::text
    );
  END IF;

  IF NEW.customer_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.customer_user_id,
      'order',
      'Order confirmed — Rs. ' || round(COALESCE(NEW.total_amount, 0))::text,
      'Your order has been placed and sent to the shop.',
      '/orders/tracking?orderId=' || NEW.id::text,
      NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_notify_created ON public.orders;
CREATE TRIGGER trg_orders_notify_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_created();

-- ── 6. Orders → notify buyer on status change ───────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.customer_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.customer_user_id,
      'order',
      'Order ' || NEW.status,
      'Your order is now ' || NEW.status || '.',
      '/orders/tracking?orderId=' || NEW.id::text,
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_notify_status ON public.orders;
CREATE TRIGGER trg_orders_notify_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_status_change();

-- ── 7. Inquiries → notify shop owner on new inquiry ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_shop_inquiry_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shop_owner uuid;
BEGIN
  SELECT owner_id INTO shop_owner FROM public.shops WHERE id = NEW.shop_id;
  IF shop_owner IS NOT NULL THEN
    PERFORM public.create_notification(
      shop_owner,
      'inquiry',
      'New inquiry from ' || COALESCE(NULLIF(NEW.customer_name, ''), 'a customer'),
      left(COALESCE(NEW.message, 'No message'), 140),
      '/dashboard/inquiries',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_notify_owner ON public.customer_inquiries;
CREATE TRIGGER trg_inquiries_notify_owner
  AFTER INSERT ON public.customer_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.notify_shop_inquiry_created();

-- ── 8. Realtime publication for instant client delivery ─────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION
      WHEN duplicate_object THEN NULL; -- already a member
    END;
  END IF;
END $$;

-- Admin Support Inbox live feed (INSERT only — default replica identity works).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
    EXCEPTION
      WHEN duplicate_object THEN NULL; -- already a member
    END;
  END IF;
END $$;

COMMIT;
