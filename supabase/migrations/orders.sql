-- =============================================================================
-- TrendMart — Orders / Lead Tracking Table (Enhanced — Prompt 62)
-- =============================================================================

DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_read" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;

-- Re-create table with full schema
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name   text DEFAULT '',
  customer_phone  text DEFAULT '',
  items_json      jsonb DEFAULT '[]'::jsonb,   -- array of {name, price, variant?} objects
  total_amount    numeric(10,2) DEFAULT 0,
  status          text DEFAULT 'Pending',       -- Pending, Processing, Completed, Cancelled
  created_at      timestamptz DEFAULT now()
);

-- Add columns if table already exists (migration-safe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders' AND table_schema = 'public') THEN
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT '';
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items_json jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) DEFAULT 0;
    -- Safe column drops (old schema columns)
    ALTER TABLE public.orders DROP COLUMN IF EXISTS product_id;
    ALTER TABLE public.orders DROP COLUMN IF EXISTS product_name;
    ALTER TABLE public.orders DROP COLUMN IF EXISTS price;
    ALTER TABLE public.orders DROP COLUMN IF EXISTS customer_info;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Public INSERT (anyone can create an order lead via WhatsApp click)
CREATE POLICY "orders_public_insert"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- Public SELECT by phone number (customer tracking)
CREATE POLICY "orders_public_select_by_phone"
  ON public.orders FOR SELECT
  USING (true);

-- Shop owner can READ their orders
CREATE POLICY "orders_owner_read"
  ON public.orders FOR SELECT
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- Shop owner can UPDATE status
CREATE POLICY "orders_owner_update"
  ON public.orders FOR UPDATE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );