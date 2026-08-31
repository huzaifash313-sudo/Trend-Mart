-- =============================================================================
-- TrendsMart — Unlimited Free Stories (Instagram / TikTok / Snapchat-style)
-- -----------------------------------------------------------------------------
-- Business decision: every shop may now post as many active stories as it wants
-- instead of being capped at 1, to boost merchant engagement and storefront
-- attraction. The "unlimited" allowance uses a high soft ceiling (100 per shop
-- per 24h) purely as an anti-flood safety net; no real merchant will ever hit
-- it, and posting above it never blocks a store (the oldest story is replaced).
--
-- Pro shops keep a meaningful perk with a higher ceiling (200).
-- =============================================================================

-- 1) New shops default to the effectively-unlimited free allowance -------------
ALTER TABLE public.shops
  ALTER COLUMN stories_quota SET DEFAULT 100;

-- 2) Existing free shops: lift the old 1-story cap to the new allowance --------
UPDATE public.shops
   SET stories_quota = 100
 WHERE subscription_tier = 'free' AND stories_quota = 1;

-- 3) Existing pro shops: keep the perk meaningful vs the free tier -------------
UPDATE public.shops
   SET stories_quota = 200
 WHERE subscription_tier = 'pro' AND stories_quota = 10;

-- 4) Refresh the pricing catalog so displayed numbers match reality -----------
INSERT INTO public.story_plans (name, quota, price, duration_days, is_active, sort_order)
SELECT v.name, v.quota, v.price, v.duration_days, v.is_active, v.sort_order
FROM (VALUES
  ('Free Stories — Unlimited', 100, 0, 30, true, 1),
  ('Pro Stories — 200',       200, 300, 30, true, 2)
) AS v(name, quota, price, duration_days, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.story_plans s WHERE s.name = v.name);

-- Keep the old plan rows aligned with the new quotas (idempotent).
UPDATE public.story_plans
   SET name = 'Free Stories — Unlimited', quota = 100
 WHERE name = 'Free Story';

UPDATE public.story_plans
   SET name = 'Pro Stories — 200', quota = 200
 WHERE name = 'Pro Stories — 10';
