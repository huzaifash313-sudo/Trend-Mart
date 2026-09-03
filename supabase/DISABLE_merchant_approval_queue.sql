-- =============================================================================
-- Disable merchant store approval queue (temporary)
-- =============================================================================
-- New stores go live immediately (app sets verification_status = 'approved'
-- and is_live = true on create). This SQL:
--   1) Changes the DB default from 'pending' → 'approved'
--   2) Approves any shops still stuck in the old pending queue
--   3) Confirms emails for accounts that already signed up but never verified
--
-- Paste into Supabase → SQL Editor → Run once. Safe to re-run.
-- =============================================================================

ALTER TABLE public.shops
  ALTER COLUMN verification_status SET DEFAULT 'approved';

UPDATE public.shops
SET
  verification_status = 'approved',
  is_live = true
WHERE verification_status = 'pending';

UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE email_confirmed_at IS NULL;
