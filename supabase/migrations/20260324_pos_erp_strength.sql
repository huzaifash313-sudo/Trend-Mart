-- =============================================================================
-- >>> RUN ME #3 of 4 — TrendsMart POS
-- Open in Supabase SQL Editor → Select all → Run
-- Guide: supabase/migrations/POS_RUN_THESE_IN_ORDER.md
-- =============================================================================
-- TrendsMart POS ERP strength — stock qty, cash sessions, walk-in customers, refunds
-- Safe to re-run.

BEGIN;

-- Numeric inventory for POS (NULL = not tracking count; use availability toggle only)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_qty integer DEFAULT NULL;

COMMENT ON COLUMN public.products.stock_qty IS
  'Optional on-hand units for POS. NULL = untracked (boolean is_available only).';

CREATE INDEX IF NOT EXISTS idx_products_shop_stock_qty
  ON public.products (shop_id, stock_qty)
  WHERE stock_qty IS NOT NULL;

-- Refund / void markers on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS voided_at timestamptz DEFAULT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_split jsonb DEFAULT NULL;

COMMENT ON COLUMN public.orders.payment_split IS
  'Optional POS split pay e.g. {"cash":500,"jazzcash":200}';

-- Cash drawer / day sessions
CREATE TABLE IF NOT EXISTS public.pos_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_cash numeric(12,2) NOT NULL DEFAULT 0,
  closing_cash numeric(12,2) DEFAULT NULL,
  expected_cash numeric(12,2) DEFAULT NULL,
  notes text DEFAULT '',
  cashier_label text DEFAULT 'Owner',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_cash_sessions_shop_status
  ON public.pos_cash_sessions (shop_id, status, opened_at DESC);

ALTER TABLE public.pos_cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_cash_sessions_owner_all ON public.pos_cash_sessions;
CREATE POLICY pos_cash_sessions_owner_all ON public.pos_cash_sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  );

-- Walk-in customer quick-pick book
CREATE TABLE IF NOT EXISTS public.pos_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  visit_count integer NOT NULL DEFAULT 0,
  last_order_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_customers_shop_phone_unique UNIQUE (shop_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_pos_customers_shop_name
  ON public.pos_customers (shop_id, name);

ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_customers_owner_all ON public.pos_customers;
CREATE POLICY pos_customers_owner_all ON public.pos_customers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  );

COMMIT;
