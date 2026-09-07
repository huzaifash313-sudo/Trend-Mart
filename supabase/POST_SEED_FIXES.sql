-- =============================================================================
-- TrendsMart — POST-SEED FIXES
-- Run once in the Supabase SQL Editor after the full test seed.
-- 1) Adds `updated_at` to stories (their insert trigger references it; without
--    the column NO story insert works — merchants can't post stories either).
-- 2) Approves the 6 sponsored ads created by the seed so they appear in the
--    public homepage sponsored rails.
-- Safe to re-run.
-- =============================================================================

BEGIN;

-- 1) stories.updated_at (fixes: record "new" has no field "updated_at")
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2) Approve the seed-created sponsored ads.
--    The review-guard trigger normally forces non-admin writes to 'pending',
--    so we disable triggers for this transaction (superuser SQL editor only).
SET LOCAL session_replication_role = replica;

UPDATE public.promotional_ads
SET status = 'approved',
    reviewed_at = now()
WHERE status = 'pending'
  AND badge_label = 'Sponsored'
  AND subtitle = 'Limited time — order now on WhatsApp.';

COMMIT;

-- After this, re-run the seed once to also backfill the story tray:
--   node scripts/seed-full-test-data.mjs
