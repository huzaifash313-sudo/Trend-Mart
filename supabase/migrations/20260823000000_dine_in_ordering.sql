-- =============================================================================
-- TrendMart — Dine-In Ordering (QR Table Ordering) — Phase 1
-- =============================================================================
-- Adds the QR-table self-ordering layer on top of the existing marketplace:
--   1. `dine_in_tables` — merchant-managed tables, each with a unique QR token.
--   2. `orders` columns: order_type, table_id, table_code, dine_status.
--   3. `shops.shop_type` gains 'dine_in' (restaurants/cafes use the same shop).
--   4. Secure RPCs so anonymous customers at a table can only ever see their
--      own table's data (token = possession proof).
-- Idempotent — safe to re-run. Existing rows/columns are untouched.
-- =============================================================================

BEGIN;

-- ── 1. Extend orders with dine-in context ────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'delivery'
  CHECK (order_type IN ('delivery', 'pickup', 'dine_in'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dine_status text
  CHECK (dine_status IN ('Pending', 'Preparing', 'Ready', 'Served', 'Cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_order_type ON public.orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_dine_table ON public.orders(table_id, order_type)
  WHERE order_type = 'dine_in';
CREATE INDEX IF NOT EXISTS idx_orders_dine_status ON public.orders(dine_status)
  WHERE dine_status IS NOT NULL;

-- ── 2. Extend shops.shop_type to include 'dine_in' ───────────────────────────
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.shops'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%shop_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.shops DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE public.shops ADD CONSTRAINT shops_shop_type_check
  CHECK (shop_type IN ('retail', 'service', 'dine_in'));

-- ── 3. dine_in_tables ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dine_in_tables (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name        text NOT NULL,                 -- e.g. "Table 3"
  qr_token    text NOT NULL UNIQUE,          -- secret URL segment; possession = access
  is_active   boolean NOT NULL DEFAULT true, -- disable pauses ordering from that table
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dine_in_tables_shop_name_unique UNIQUE (shop_id, name)
);

CREATE INDEX IF NOT EXISTS idx_dine_in_tables_shop ON public.dine_in_tables(shop_id, is_active);
CREATE INDEX IF NOT EXISTS idx_dine_in_tables_token ON public.dine_in_tables(qr_token);

ALTER TABLE public.dine_in_tables ENABLE ROW LEVEL SECURITY;

-- Shop owner manages their own tables.
CREATE POLICY "dine_in_tables_owner_all"
  ON public.dine_in_tables FOR ALL
  USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = dine_in_tables.shop_id))
  WITH CHECK (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = dine_in_tables.shop_id));

-- Super-admin can view/modify any table (support/abuse).
CREATE POLICY "dine_in_tables_admin_all"
  ON public.dine_in_tables FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ── 4. RPC: resolve a table token → table + shop info (anonymous-safe) ───────
-- SECURITY DEFINER, but only exposes the non-secret fields the scan page needs.
DROP FUNCTION IF EXISTS public.lookup_dine_table(text);
CREATE FUNCTION public.lookup_dine_table(p_token text)
RETURNS TABLE (
  table_id         uuid,
  table_name       text,
  table_code       text,
  shop_id          uuid,
  shop_name        text,
  shop_logo_url    text,
  shop_banner_url  text,
  shop_is_live     boolean,
  shop_accent_color text,
  shop_whatsapp    text,
  shop_location    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id, t.name, t.name,
    s.id, s.name, s.logo_url, s.banner_url, s.is_live,
    s.accent_color, s.whatsapp_number, s.location
  FROM public.dine_in_tables t
  JOIN public.shops s ON s.id = t.shop_id
  WHERE t.qr_token = p_token
    AND t.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_dine_table(text) TO anon, authenticated;

-- ── 5. RPC: track a dine-in order by id + table token ────────────────────────
-- The customer proves they belong to the table by holding its token, so they
-- only ever see their own table's order — never arbitrary order data.
DROP FUNCTION IF EXISTS public.track_dine_order(uuid, text);
CREATE FUNCTION public.track_dine_order(p_order_id uuid, p_table_token text)
RETURNS TABLE (
  id            uuid,
  shop_id       uuid,
  shop_name     text,
  table_code    text,
  customer_name text,
  items_json    jsonb,
  total_amount  numeric,
  order_type    text,
  dine_status   text,
  status        text,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id, o.shop_id, s.name, o.table_code,
    o.customer_name, o.items_json, o.total_amount,
    o.order_type, o.dine_status, o.status, o.created_at, o.updated_at
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  JOIN public.dine_in_tables t ON t.id = o.table_id
  WHERE o.id = p_order_id
    AND o.order_type = 'dine_in'
    AND t.qr_token = p_table_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.track_dine_order(uuid, text) TO anon, authenticated;

COMMIT;
