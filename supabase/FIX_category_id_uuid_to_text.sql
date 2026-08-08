-- =============================================================================
-- Quick fix: products.category_id must be TEXT (category names), not UUID
-- =============================================================================
-- Error this solves:
--   [22P02] invalid input syntax for type uuid: "Tech & IT Services"
--
-- Paste into Supabase → SQL Editor → Run once.
-- Safe to re-run.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'category_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.products
      ALTER COLUMN category_id DROP DEFAULT;
    ALTER TABLE public.products
      ALTER COLUMN category_id TYPE text USING category_id::text;
    RAISE NOTICE 'Converted products.category_id from uuid → text';
  ELSE
    RAISE NOTICE 'products.category_id is already text (or missing) — nothing to do';
  END IF;
END $$;

-- Ensure the column exists as text for brand-new DBs
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id text DEFAULT NULL;
