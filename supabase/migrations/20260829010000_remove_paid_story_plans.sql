-- =============================================================================
-- TrendMart — Remove Paid Story Plans (Stories are FREE & Unlimited)
-- -----------------------------------------------------------------------------
-- Business decision (confirmed 2026-08-29): stories are a free engagement
-- feature for every shop — there are NO paid story plans, ever. The old
-- "Pro Stories — 200 / Rs 300" catalog row is deactivated so no merchant can
-- ever be shown a price for stories, while the quota stays at the effectively
-- unlimited free ceiling (100/day soft cap — 200 for pro shops as a soft perk).
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- 1) Deactivate every paid story-plan row (any row with price > 0).
UPDATE public.story_plans
   SET is_active = false
 WHERE price > 0;

-- 2) Keep exactly one catalog row: the free, unlimited one.
UPDATE public.story_plans
   SET name = 'Free Stories — Unlimited', quota = 100, price = 0,
       duration_days = 30, is_active = true, sort_order = 1
 WHERE price = 0;

-- 3) Re-assert the free default quota on all shops (anti-flood soft ceiling).
UPDATE public.shops
   SET stories_quota = 100
 WHERE subscription_tier = 'free' AND stories_quota < 100;

COMMIT;
