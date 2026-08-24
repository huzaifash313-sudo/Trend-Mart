-- =============================================================================
-- TrendMart — One store per account (database-level enforcement)
--
-- Business rule: a single signup may own exactly ONE merchant store. The app
-- layer already redirects merchants who open /account/become-merchant to their
-- dashboard, but the database allowed duplicate rows via direct inserts.
--
-- This migration:
--   1. Reconciles any pre-existing duplicates — keeps the NEWEST store per
--      owner and detaches the older ones (owner_id → NULL). Detached stores
--      stay visible on the marketplace but cannot be managed from a dashboard
--      until a Super-Admin re-assigns or removes them.
--   2. Adds a partial unique index so Postgres rejects any future duplicate.
-- =============================================================================

BEGIN;

-- 1. Reconcile legacy duplicates (keep the newest shop per owner).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY owner_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.shops
  WHERE owner_id IS NOT NULL
)
UPDATE public.shops s
SET owner_id = NULL
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- 2. Enforce one store per owner going forward.
--    Partial index: NULL owner_ids (deleted users / detached duplicates) are
--    intentionally not covered, so orphans never block re-assignment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_one_per_owner
  ON public.shops (owner_id)
  WHERE owner_id IS NOT NULL;

COMMIT;
