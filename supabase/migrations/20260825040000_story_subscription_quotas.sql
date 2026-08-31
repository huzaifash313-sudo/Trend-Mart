-- =============================================================================
-- TrendsMart — Story Subscription Quotas + Pricing Plans (soft-launch model)
-- -----------------------------------------------------------------------------
-- Philosophy: "help merchants, never harm a business."
--   • Every shop gets a free story slot (quota = 1) — no one is ever blocked.
--   • Pro shops can keep more stories live at once (default 10, admin-tunable).
--   • Posting at the limit replaces the OLDEST story instead of erroring, so a
--     merchant can always update their storefront.
--   • No payment is wired in yet. An admin (or a future gateway) flips a shop
--     to `subscription_tier = 'pro'`; the app enforces the quota from that.
--   • `story_plans` + `ad_plans` seeds define the pricing catalog shown when
--     payments go live.
-- =============================================================================

-- 1) Subscription columns on shops ---------------------------------------------
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS stories_quota integer NOT NULL DEFAULT 1
    CHECK (stories_quota >= 1),
  ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz;

-- Pro shops get a generous default quota (admin can tune per shop).
UPDATE public.shops
   SET stories_quota = 10
 WHERE subscription_tier = 'pro' AND stories_quota = 1;

-- 2) Story plans catalog (used once payments go live) ---------------------------
CREATE TABLE IF NOT EXISTS public.story_plans (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  quota         integer NOT NULL CHECK (quota >= 1),
  price         numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.story_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_plans_public_read"
  ON public.story_plans FOR SELECT
  USING (is_active = true);

-- 3) Seed pricing catalog --------------------------------------------------------
-- Story plans — every store always keeps a free slot; Pro raises the ceiling.
INSERT INTO public.story_plans (name, quota, price, duration_days, is_active, sort_order)
SELECT v.name, v.quota, v.price, v.duration_days, v.is_active, v.sort_order
FROM (VALUES
  ('Free Story',         1,    0, 30, true, 1),
  ('Pro Stories — 10',  10,  300, 30, true, 2)
) AS v(name, quota, price, duration_days, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.story_plans s WHERE s.name = v.name);

-- Ad plans — per-day and monthly bundles merchants can pick (shown in /dashboard/ads).
INSERT INTO public.ad_plans (name, placement, duration_days, price, description, is_active, sort_order)
SELECT v.name, v.placement, v.duration_days, v.price, v.description, v.is_active, v.sort_order
FROM (VALUES
  ('Starter Banner — 7 Days',
   'homepage_top', 7, 350,
   'One week in the homepage spotlight.', true, 1),
  ('Popular Banner — 1 Month',
   'homepage_top', 30, 1000,
   'A full month of homepage visibility.', true, 2),
  ('Premium Top Spot — 1 Month',
   'homepage_top', 30, 1500,
   'First position in the sponsored carousel.', true, 3)
) AS v(name, placement, duration_days, price, description, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.ad_plans a WHERE a.name = v.name);

-- 4) Admin can flip a shop to Pro (future: wired to the payment gateway) --------
-- UPDATE public.shops
--    SET subscription_tier = 'pro', stories_quota = 10,
--        pro_expires_at = now() + INTERVAL '30 days'
--  WHERE id = '<shop-uuid>';
