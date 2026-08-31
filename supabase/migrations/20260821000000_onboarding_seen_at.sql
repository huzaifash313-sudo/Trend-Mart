-- =============================================================================
-- TrendsMart — One-time onboarding flag (per account, not per device)
-- =============================================================================
-- The full-screen 3-step welcome wizard used to be gated by a localStorage key
-- per device. On a shared phone with multiple accounts, or after clearing site
-- data, the wizard could re-appear. This migration adds a durable per-account
-- flag so the wizard shows exactly ONCE per user id, on any device/browser.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_seen_at timestamptz;

COMMENT ON COLUMN public.user_profiles.onboarding_seen_at IS
  'When the one-time 3-step onboarding wizard was first shown to this account.';

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_seen
  ON public.user_profiles (onboarding_seen_at)
  WHERE onboarding_seen_at IS NOT NULL;

COMMIT;
