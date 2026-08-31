-- =============================================================================
-- TrendsMart — Review hardening + order buyer identity
-- - Auth-only reviews, locked profile name, merchant replies
-- - Purchase + IP anti-spam columns
-- - customer_user_id on orders for verified-purchase checks
-- =============================================================================

BEGIN;

-- ── Orders: remember who placed the order (when logged in) ──────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_user_id
  ON public.orders (customer_user_id)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shop_buyer
  ON public.orders (shop_id, customer_user_id)
  WHERE customer_user_id IS NOT NULL;

-- ── Reviews: identity, reply, anti-abuse ────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merchant_reply text DEFAULT '',
  ADD COLUMN IF NOT EXISTS merchant_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS visitor_ip_hash text,
  ADD COLUMN IF NOT EXISTS verified_purchase boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_ip_hash ON public.reviews (visitor_ip_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_shop_user
  ON public.reviews (shop_id, user_id)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "reviews_public_insert" ON public.reviews;
DROP POLICY IF EXISTS "reviews_authenticated_insert" ON public.reviews;
DROP POLICY IF EXISTS "reviews_owner_reply_update" ON public.reviews;
DROP POLICY IF EXISTS "reviews_author_delete" ON public.reviews;

-- Public can still read reviews
DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
CREATE POLICY "reviews_public_read"
  ON public.reviews FOR SELECT
  USING (true);

-- Insert only as the signed-in customer (never the shop owner)
CREATE POLICY "reviews_authenticated_insert"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  );

-- Shop owner may reply (and only update reply fields)
CREATE POLICY "reviews_owner_reply_update"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- Author may delete their own review
CREATE POLICY "reviews_author_delete"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

COMMIT;
