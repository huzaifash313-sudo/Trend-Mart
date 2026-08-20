/* -------------------------------------------------------------------------- */
/*  TrendMart — Admin Moderation + Ad Pricing Plans                           */
/*                                                                             */
/*  1) User moderation: `is_banned` flag on user_profiles + a fast SECURITY    */
/*     DEFINER RPC for middleware/checkout ban enforcement.                    */
/*  2) Ad monetization: an `ad_plans` catalog (name, placement, duration,      */
/*     price) that merchants pick from when requesting a sponsored banner,     */
/*     plus pricing columns recorded on each promotional_ad.                   */
/*                                                                             */
/*  RUN THIS once in Supabase → SQL Editor (safe to re-run).                   */
/* -------------------------------------------------------------------------- */

-- =============================================================================
-- 1) USER MODERATION
-- =============================================================================

-- Ban flag on customer profiles (admin-controlled only).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- Admin can update any profile (ban / unban). SELECT already available to
-- admins via `user_profiles_admin_read`.
DROP POLICY IF EXISTS "user_profiles_admin_update" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_update"
  ON public.user_profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Fast ban lookup for middleware (edge) and checkout gating.
CREATE OR REPLACE FUNCTION public.is_account_banned(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT is_banned FROM public.user_profiles WHERE user_id = p_user_id),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_account_banned(uuid) TO anon, authenticated;

-- Partial index so the moderation list can filter banned users quickly.
CREATE INDEX IF NOT EXISTS idx_user_profiles_banned
  ON public.user_profiles(is_banned)
  WHERE is_banned = true;

-- =============================================================================
-- 2) AD PRICING PLANS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ad_plans (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  placement     text NOT NULL DEFAULT 'homepage_top'
                CHECK (placement IN ('homepage_top', 'homepage_feed')),
  duration_days integer NOT NULL DEFAULT 7 CHECK (duration_days > 0),
  price         numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_plans ENABLE ROW LEVEL SECURITY;

-- Public read: merchants (even guests) can see active plans + pricing.
DROP POLICY IF EXISTS "ad_plans_public_read" ON public.ad_plans;
CREATE POLICY "ad_plans_public_read"
  ON public.ad_plans FOR SELECT
  USING (is_active = true);

-- Admin management (create / update / deactivate / delete).
DROP POLICY IF EXISTS "ad_plans_admin_all" ON public.ad_plans;
CREATE POLICY "ad_plans_admin_all"
  ON public.ad_plans FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed sensible starter pricing (edit anytime from the Admin → Ads tab).
INSERT INTO public.ad_plans (name, placement, duration_days, price, description, sort_order) VALUES
  ('Homepage Banner — 7 Days',   'homepage_top', 7,  500,  'Top homepage banner for 7 days', 1),
  ('Homepage Banner — 14 Days',  'homepage_top', 14, 900,  'Top homepage banner for 14 days (save Rs. 100)', 2),
  ('Homepage Banner — 30 Days',  'homepage_top', 30, 1500, 'Top homepage banner for a full month (best value)', 3)
ON CONFLICT DO NOTHING;

-- Record which plan a merchant chose + what was charged when the ad request
-- was submitted.
ALTER TABLE public.promotional_ads
  ADD COLUMN IF NOT EXISTS ad_plan_id uuid REFERENCES public.ad_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_paid numeric(10,2),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_promotional_ads_plan ON public.promotional_ads(ad_plan_id);
