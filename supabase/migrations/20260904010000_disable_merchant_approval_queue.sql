-- Temporarily disable Super-Admin merchant approval.
-- New shops default to approved + live. Existing pending shops are published.
-- Unconfirmed auth emails are marked confirmed so already-signed-up users can log in.

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
