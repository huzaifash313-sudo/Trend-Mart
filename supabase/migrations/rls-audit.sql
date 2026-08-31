-- =============================================================================
-- TrendsMart — RLS Policy Audit & Reinforcement
-- Run in Supabase SQL Editor to verify/enforce correct RLS policies.
-- =============================================================================

-- 1. Ensure RLS is enabled on both tables -------------------------------------

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 2. SHOPS — Drop old policies to avoid conflicts -----------------------------

DROP POLICY IF EXISTS "Allow public read on shops" ON public.shops;
DROP POLICY IF EXISTS "Anyone can read shops"      ON public.shops;
DROP POLICY IF EXISTS "Create shop as owner"        ON public.shops;
DROP POLICY IF EXISTS "Owner can update shop"       ON public.shops;
DROP POLICY IF EXISTS "Owner can delete shop"       ON public.shops;
DROP POLICY IF EXISTS "Authenticated users can create shops" ON public.shops;
DROP POLICY IF EXISTS "Owners can update their shop"         ON public.shops;
DROP POLICY IF EXISTS "Owners can delete their shop"         ON public.shops;

-- 3. SHOPS — Re-create with strict owner checks -------------------------------

-- PUBLIC: Anyone can READ shops (marketplace is open)
CREATE POLICY "shops_public_read"
  ON public.shops FOR SELECT
  USING (true);

-- AUTHENTICATED: Create a shop — must set owner_id = auth.uid()
CREATE POLICY "shops_owner_insert"
  ON public.shops FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- AUTHENTICATED: Update own shop only
CREATE POLICY "shops_owner_update"
  ON public.shops FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- AUTHENTICATED: Delete own shop only
CREATE POLICY "shops_owner_delete"
  ON public.shops FOR DELETE
  USING (auth.uid() = owner_id);

-- 4. PRODUCTS — Drop old policies to avoid conflicts --------------------------

DROP POLICY IF EXISTS "Allow public read on products" ON public.products;
DROP POLICY IF EXISTS "Anyone can read products"      ON public.products;
DROP POLICY IF EXISTS "Shop owner can insert product"  ON public.products;
DROP POLICY IF EXISTS "Shop owner can update product"  ON public.products;
DROP POLICY IF EXISTS "Shop owner can delete product"  ON public.products;
DROP POLICY IF EXISTS "Shop owners can create products" ON public.products;
DROP POLICY IF EXISTS "Owners can update their products" ON public.products;
DROP POLICY IF EXISTS "Owners can delete their products" ON public.products;

-- 5. PRODUCTS — Re-create with strict owner checks ----------------------------

-- PUBLIC: Anyone can READ products
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (true);

-- AUTHENTICATED: Insert product — must own the linked shop
CREATE POLICY "products_owner_insert"
  ON public.products FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- AUTHENTICATED: Update product — must own the linked shop
CREATE POLICY "products_owner_update"
  ON public.products FOR UPDATE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- AUTHENTICATED: Delete product — must own the linked shop
CREATE POLICY "products_owner_delete"
  ON public.products FOR DELETE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- 6. VERIFICATION QUERIES (run these to confirm policies are correct) ---------

-- List all policies on shops
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'shops'
ORDER BY cmd;

-- List all policies on products
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'products'
ORDER BY cmd;

-- =============================================================================
-- ✅ Expected output for shops:   SELECT (true), INSERT, UPDATE, DELETE (owner)
-- ✅ Expected output for products: SELECT (true), INSERT, UPDATE, DELETE (owner)
-- =============================================================================