-- >>> RUN ME #5 of 5 — TrendsMart POS finance / credit / recipes / cost
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

BEGIN;

-- Optional purchase / COGS cost on catalog products (null = not tracked)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric;

COMMENT ON COLUMN public.products.cost_price IS
  'Optional unit cost for POS profit reports. Null = skip COGS for this SKU.';

-- Credit / udhaar balance on walk-in customers
ALTER TABLE public.pos_customers
  ADD COLUMN IF NOT EXISTS credit_balance numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_customers.credit_balance IS
  'Outstanding udhaar (positive = customer owes shop).';

-- Expense ledger (shop running costs)
CREATE TABLE IF NOT EXISTS public.pos_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'general',
  notes text DEFAULT '',
  spent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_expenses_shop_spent
  ON public.pos_expenses (shop_id, spent_at DESC);

ALTER TABLE public.pos_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_expenses_owner_all ON public.pos_expenses;
CREATE POLICY pos_expenses_owner_all ON public.pos_expenses
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

-- Credit ledger (udhaar give / collect)
CREATE TABLE IF NOT EXISTS public.pos_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.pos_customers(id) ON DELETE SET NULL,
  customer_phone text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  delta numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'sale',
  note text DEFAULT '',
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_credit_ledger_shop
  ON public.pos_credit_ledger (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_credit_ledger_phone
  ON public.pos_credit_ledger (shop_id, customer_phone);

ALTER TABLE public.pos_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_credit_ledger_owner_all ON public.pos_credit_ledger;
CREATE POLICY pos_credit_ledger_owner_all ON public.pos_credit_ledger
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

-- Recipe / BOM: finished product made from raw ingredients
CREATE TABLE IF NOT EXISTS public.pos_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_recipes_shop_product_unique UNIQUE (shop_id, product_id)
);

COMMENT ON TABLE public.pos_recipes IS
  'BOM for assembled items (e.g. burger). ingredients: [{product_id, qty, name?}].';

CREATE INDEX IF NOT EXISTS idx_pos_recipes_shop
  ON public.pos_recipes (shop_id);

ALTER TABLE public.pos_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_recipes_owner_all ON public.pos_recipes;
CREATE POLICY pos_recipes_owner_all ON public.pos_recipes
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
