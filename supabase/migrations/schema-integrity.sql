/* =============================================================================
 * TrendMart — Schema Integrity & Foreign Key Cascade Audit (Prompt 4)
 *
 * This migration ensures all foreign-key relationships across the entire
 * platform have proper `ON DELETE CASCADE` rules configured, preventing
 * orphaned records and ensuring constraint-compliant deletes.
 *
 * Run this in the Supabase SQL Editor if any constraints are missing.
 * All statements are idempotent (use IF NOT EXISTS / IF EXISTS).
 * ============================================================================= */

/* ─────────────────────────────────────────────────────────────────────────────
 * 1. products.shop_id — Ensure CASCADE on shop deletion
 *
 * When a shop is deleted, all its products should also be removed.
 * The original `schema.sql` already had this, but we verify & re-add
 * if it has been dropped or modified.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
BEGIN
  -- Check if the FK constraint exists and re-add if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'products_shop_id_fkey'
      AND table_name = 'products'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 2. orders.shop_id — Ensure CASCADE on shop deletion
 *
 * When a shop is deleted, all orders tied to that shop should cascade.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_shop_id_fkey'
      AND table_name = 'orders'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 3. reviews.shop_id — Ensure CASCADE on shop deletion
 *
 * When a shop is deleted, all reviews for that shop should cascade.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reviews_shop_id_fkey'
      AND table_name = 'reviews'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 4. stories.shop_id — Ensure CASCADE on shop deletion
 *
 * When a shop is deleted, all its stories should cascade.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stories_shop_id_fkey'
      AND table_name = 'stories'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 5. coupons.shop_id — Ensure CASCADE on shop deletion
 *
 * When a shop is deleted, all its coupons should cascade.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'coupons_shop_id_fkey'
      AND table_name = 'coupons'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT coupons_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 6. analytics_logs.shop_id — Ensure CASCADE on shop deletion
 *
 * When a shop is deleted, its analytics logs should cascade.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'analytics_logs_shop_id_fkey'
      AND table_name = 'analytics_logs'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.analytics_logs
      ADD CONSTRAINT analytics_logs_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 7. inquiries.shop_id — Ensure CASCADE on shop deletion
 *
 * When a shop is deleted, its customer inquiries should cascade.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inquiries_shop_id_fkey'
      AND table_name = 'inquiries'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.inquiries
      ADD CONSTRAINT inquiries_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 8. products.shop_id — Verify CASCADE is configured (part 2 — drop & re-add)
 *
 * If the existing FK constraint does NOT have CASCADE, drop and re-add it.
 * This is a safety net for cases where the constraint was created without
 * the ON DELETE CASCADE clause in an older migration.
 * ──────────────────────────────────────────────────────────────────────────── */
DO $$
DECLARE
  _delete_rule text;
BEGIN
  SELECT delete_rule INTO _delete_rule
  FROM information_schema.referential_constraints
  WHERE constraint_name = 'products_shop_id_fkey'
    AND constraint_schema = 'public';

  IF _delete_rule IS NULL OR _delete_rule <> 'CASCADE' THEN
    -- Drop and re-add with CASCADE
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_shop_id_fkey;
    ALTER TABLE public.products
      ADD CONSTRAINT products_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

/* ─────────────────────────────────────────────────────────────────────────────
 * 9. Verify all indexes exist for FK columns
 *
 * Each FK column should have a supporting index for JOIN/WHERE performance.
 * ──────────────────────────────────────────────────────────────────────────── */
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_reviews_shop_id ON public.reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_stories_shop_id ON public.stories(shop_id);
CREATE INDEX IF NOT EXISTS idx_coupons_shop_id ON public.coupons(shop_id);
CREATE INDEX IF NOT EXISTS idx_analytics_logs_shop_id ON public.analytics_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_shop_id ON public.inquiries(shop_id);

/* ─────────────────────────────────────────────────────────────────────────────
 * 10. Integrity check — report orphaned records (helpful for manual review)
 *
 * Uncomment to scan for orphans that slipped through before cascade rules:
 * SELECT 'products' AS tbl, id FROM products WHERE shop_id NOT IN (SELECT id FROM shops);
 * SELECT 'orders' AS tbl, id FROM orders WHERE shop_id NOT IN (SELECT id FROM shops);
 * SELECT 'reviews' AS tbl, id FROM reviews WHERE shop_id NOT IN (SELECT id FROM shops);
 * SELECT 'stories' AS tbl, id FROM stories WHERE shop_id NOT IN (SELECT id FROM shops);
 * SELECT 'coupons' AS tbl, id FROM coupons WHERE shop_id NOT IN (SELECT id FROM shops);
 * ──────────────────────────────────────────────────────────────────────────── */