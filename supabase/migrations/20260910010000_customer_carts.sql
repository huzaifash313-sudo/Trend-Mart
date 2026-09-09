-- Customer cart sync (device + cloud)
-- One row per authenticated user; items stored as JSONB (mirrors Zustand cart).

CREATE TABLE IF NOT EXISTS public.customer_carts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_carts_updated_at
  ON public.customer_carts (updated_at DESC);

ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_carts_select_own" ON public.customer_carts;
CREATE POLICY "customer_carts_select_own"
  ON public.customer_carts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_carts_insert_own" ON public.customer_carts;
CREATE POLICY "customer_carts_insert_own"
  ON public.customer_carts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_carts_update_own" ON public.customer_carts;
CREATE POLICY "customer_carts_update_own"
  ON public.customer_carts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_carts_delete_own" ON public.customer_carts;
CREATE POLICY "customer_carts_delete_own"
  ON public.customer_carts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.customer_carts IS
  'Cross-device cart snapshot for signed-in customers. Guest carts stay local-only.';
