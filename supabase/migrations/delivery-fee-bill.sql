-- =============================================================================
-- TrendsMart — Delivery Fee & Order Bill Breakdown (idempotent)
-- ----------------------------------------------------------------------------
-- Ensures every order row can store the exact money breakdown so bills and
-- the /o/ order summary show the delivery fee properly:
--   • subtotal_amount  — pre-discount items subtotal (pack/quantity-tier aware)
--   • discount_amount  — coupon discount applied
--   • delivery_fee     — exact delivery charge (0 = free / pickup)
--   • coupon_code      — coupon used, if any
--   • order_type       — 'delivery' | 'pickup' | 'dine_in'
-- Also recreates get_public_order_summary to return subtotal_amount.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS / DROP + CREATE FUNCTION).
-- =============================================================================

BEGIN;

-- ── 1. Money-breakdown columns (if missing) ─────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(12, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code text;

-- ── 2. Fulfilment mode (if missing) ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_type'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN order_type text NOT NULL DEFAULT 'delivery'
      CHECK (order_type IN ('delivery', 'pickup', 'dine_in'));
  END IF;
END $$;

-- ── 3. Public order summary RPC — include subtotal_amount ────────────────────
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
  subtotal_amount numeric,
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
    COALESCE(o.subtotal_amount, 0), COALESCE(o.discount_amount, 0), COALESCE(o.delivery_fee, 0),
    o.order_type, o.table_code, o.status, o.created_at
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  WHERE o.id = p_order_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_order_summary(uuid) TO anon, authenticated;

COMMIT;
