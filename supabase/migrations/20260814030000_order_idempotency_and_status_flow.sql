-- =============================================================================
-- TrendsMart — Order idempotency + server-side status transition enforcement
-- =============================================================================
-- Two fixes:
--
--   1. Idempotency: a `client_token` (unique) prevents duplicate orders from
--      double-clicks / retries. The client generates one token per checkout
--      attempt; the server inserts with it and short-circuits if it already
--      exists.
--
--   2. Status flow: a BEFORE UPDATE trigger enforces the strict order lifecycle
--      (Pending → Processing → Dispatched → Delivered, with Cancelled allowed
--      from Pending/Processing/Dispatched). Previously any client could jump
--      e.g. Pending → Delivered via a raw update.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1. Idempotency column ──────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_token_key ON public.orders (client_token)
  WHERE client_token IS NOT NULL;

-- ── 2. Status transition trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_order_status_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only act when the status actually changed.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE OLD.status
      WHEN 'Pending' THEN
        IF NEW.status NOT IN ('Processing', 'Cancelled') THEN
          RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
        END IF;
      WHEN 'Processing' THEN
        IF NEW.status NOT IN ('Dispatched', 'Cancelled') THEN
          RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
        END IF;
      WHEN 'Dispatched' THEN
        IF NEW.status NOT IN ('Delivered', 'Cancelled') THEN
          RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
        END IF;
      ELSE
        -- Delivered / Cancelled are terminal — no further changes.
        RAISE EXCEPTION 'Cannot change status of a terminal order (%)', OLD.status;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_flow ON public.orders;
CREATE TRIGGER trg_orders_status_flow
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_status_flow();

COMMIT;
