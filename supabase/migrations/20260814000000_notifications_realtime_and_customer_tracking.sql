-- =============================================================================
-- TrendMart — Enable Realtime + Customer Order Tracking SELECT policy
-- =============================================================================
-- Two fixes that make the live notification/tracking system actually work:
--
--   1. Add the order-related tables to the `supabase_realtime` publication.
--      Without this, every `postgres_changes` channel in
--      lib/supabase/realtime.ts (orders, customer_inquiries, products, reviews,
--      inventory_variants, analytics_logs) subscribes but receives ZERO events —
--      the in-app order bells and customer tracking never fire.
--
--   2. Add a customer-facing SELECT policy on orders so a signed-in buyer can
--      receive realtime status updates on their OWN orders
--      (subscribeToCustomerOrders filters `customer_user_id=eq.<uid>`). The
--      previous hardening only allowed merchant + admin reads; customers had no
--      direct read path, so their tracking channel was silently empty.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1. Realtime publication ────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already a member
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_inquiries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_variants;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_logs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Customer SELECT on their own orders ─────────────────────────────────
-- A signed-in buyer may read only the orders where customer_user_id = their id,
-- so the realtime tracking channel can push their own order status changes.
DROP POLICY IF EXISTS "orders_customer_select" ON public.orders;
CREATE POLICY "orders_customer_select"
  ON public.orders FOR SELECT
  USING (customer_user_id IS NOT NULL AND customer_user_id = auth.uid());

COMMIT;
