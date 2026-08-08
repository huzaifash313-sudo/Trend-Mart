-- =============================================================================
-- Disable merchant store approval queue
-- =============================================================================
-- New stores go live immediately (app sets verification_status = 'approved'
-- and is_live = true on create). This SQL:
--   1) Changes the DB default from 'pending' → 'approved'
--   2) Approves any shops still stuck in the old pending queue
--
-- Paste into Supabase → SQL Editor → Run once. Safe to re-run.
-- =============================================================================

-- Drop and recreate default (Postgres can't ALTER DEFAULT easily if CHECK exists)
ALTER TABLE public.shops
  ALTER COLUMN verification_status SET DEFAULT 'approved';

-- Clear the old approval backlog and publish those stores
UPDATE public.shops
SET
  verification_status = 'approved',
  is_live = true
WHERE verification_status = 'pending';
