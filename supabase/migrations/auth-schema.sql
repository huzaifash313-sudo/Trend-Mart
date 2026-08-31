-- =============================================================================
-- TrendsMart Auth Migration — Run AFTER schema.sql
-- Paste into Supabase SQL Editor: https://supabase.com/dashboard
-- =============================================================================

-- 1. Add owner_id to shops ----------------------------------------------------
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Drop old permissive policies (re-create with owner checks) ---------------
DROP POLICY IF EXISTS "Allow public read on shops" ON public.shops;
DROP POLICY IF EXISTS "Allow public read on products" ON public.products;

-- 3. SELECT: anyone can read --------------------------------------------------
CREATE POLICY "Anyone can read shops"
  ON public.shops FOR SELECT USING (true);

CREATE POLICY "Anyone can read products"
  ON public.products FOR SELECT USING (true);

-- 4. INSERT: only authenticated users can create shops/products ----------------
CREATE POLICY "Authenticated users can create shops"
  ON public.shops FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Shop owners can create products"
  ON public.products FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- 5. UPDATE: only the shop owner can update their shop/products ---------------
CREATE POLICY "Owners can update their shop"
  ON public.shops FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their products"
  ON public.products FOR UPDATE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- 6. DELETE: only the shop owner can delete products --------------------------
CREATE POLICY "Owners can delete their products"
  ON public.products FOR DELETE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- (Optional) Allow shop deletion by owner
CREATE POLICY "Owners can delete their shop"
  ON public.shops FOR DELETE
  USING (auth.uid() = owner_id);