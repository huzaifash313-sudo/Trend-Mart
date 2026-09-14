-- =============================================================================
-- >>> RUN ME #1 of 4 — TrendsMart POS
-- Open in Supabase SQL Editor → Select all → Run
-- Guide: supabase/migrations/POS_RUN_THESE_IN_ORDER.md
-- =============================================================================
-- TrendsMart Merchant POS — settings + sales channel on orders + stock ledger
-- Safe to re-run.

BEGIN;

-- Shop POS preferences (modules, category pack, receipt footer)
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS pos_settings jsonb DEFAULT NULL;

COMMENT ON COLUMN public.shops.pos_settings IS
  'Merchant POS config: { enabled, modules[], pack, receipt_footer, low_stock_threshold }';

-- How the sale entered the system (online WhatsApp / counter POS / dine-in)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'online';

COMMENT ON COLUMN public.orders.source IS
  'online | pos | dine_in — TrendsMart channel for unified POS queue';

CREATE INDEX IF NOT EXISTS idx_orders_shop_source_created
  ON public.orders (shop_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_shop_status_created
  ON public.orders (shop_id, status, created_at DESC);

-- Optional payment method on POS / counter bills
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT NULL;

COMMENT ON COLUMN public.orders.payment_method IS
  'cash | card | jazzcash | easypaisa | other — mainly POS; null for WhatsApp COD';

-- Stock movement ledger (POS / manual adjust)
CREATE TABLE IF NOT EXISTS public.pos_stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL DEFAULT 'adjust',
  note text DEFAULT '',
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_moves_shop_created
  ON public.pos_stock_moves (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_stock_moves_product
  ON public.pos_stock_moves (product_id, created_at DESC);

ALTER TABLE public.pos_stock_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_stock_moves_owner_all ON public.pos_stock_moves;
CREATE POLICY pos_stock_moves_owner_all ON public.pos_stock_moves
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

-- Backfill dine-in orders source when column is new
UPDATE public.orders
SET source = 'dine_in'
WHERE order_type = 'dine_in'
  AND (source IS NULL OR source = 'online');

COMMIT;
