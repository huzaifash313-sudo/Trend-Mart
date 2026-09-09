-- Lock down public order inserts.
-- Orders must be created via the Next.js /api/orders route (service role).
-- The legacy "orders_public_insert" WITH CHECK (true) policy allowed anyone
-- with the anon key to forge orders (arbitrary totals, phones, shop_id).

DROP POLICY IF EXISTS "orders_public_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_anon_insert" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert on orders" ON public.orders;

-- Authenticated clients must not insert directly either — only the service
-- role (used by /api/orders after re-pricing + auth checks) should write rows.
DROP POLICY IF EXISTS "orders_authenticated_insert" ON public.orders;
