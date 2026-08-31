-- TrendsMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- PART 8 — CUSTOMER CHECKOUT PROFILE (name / phone / address autofill)
-- #############################################################################
-- Backs the "Smart Checkout Auto-Fill" feature in WhatsAppCheckoutModal.tsx,
-- which reads full_name/phone/address from this table to pre-fill checkout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  address     text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "user_profiles" table.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz DEFAULT NULL;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_owner_all" ON public.user_profiles;
CREATE POLICY "user_profiles_owner_all"
  ON public.user_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_admin_read" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_read"
  ON public.user_profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_profiles_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_profiles_updated_at
      BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;

COMMIT;
