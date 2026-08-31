/* -------------------------------------------------------------------------- */
/*  TrendsMart — Promotional Ads / Sponsored Banners Carousel                  */
/*                                                                             */
/*  Per .cursorrules §7 "Promotional Ads Feature (Sponsored / Paid Ads        */
/*  Carousel)": merchants can request a paid promotional banner slot that     */
/*  scrolls in a dedicated homepage section. Requests enter a Super-Admin     */
/*  approval queue (mirrors the merchant verification queue) so a merchant    */
/*  can never self-publish an ad without the platform team reviewing it       */
/*  (and, in practice, confirming payment) first. Admins may also create      */
/*  platform-wide ads directly (shop_id = NULL) for house promotions.         */
/* -------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.promotional_ads (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id            uuid REFERENCES public.shops(id) ON DELETE CASCADE, -- NULL = platform/house ad
  title              text NOT NULL,
  subtitle           text,
  image_url          text NOT NULL,
  link_url           text NOT NULL,
  badge_label        text,
  placement          text NOT NULL DEFAULT 'homepage_top' CHECK (placement IN ('homepage_top', 'homepage_feed')),
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_active          boolean NOT NULL DEFAULT true, -- merchant/admin pause switch, independent of review status
  starts_at          timestamptz,
  ends_at            timestamptz,
  sort_order         integer NOT NULL DEFAULT 0,
  impression_count   bigint NOT NULL DEFAULT 0,
  click_count        bigint NOT NULL DEFAULT 0,
  rejection_reason   text,
  reviewed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotional_ads_shop_id ON public.promotional_ads(shop_id);
CREATE INDEX IF NOT EXISTS idx_promotional_ads_live
  ON public.promotional_ads(placement, sort_order)
  WHERE status = 'approved' AND is_active = true;

-- ── updated_at maintenance ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_promotional_ads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promotional_ads_updated_at ON public.promotional_ads;
CREATE TRIGGER trg_promotional_ads_updated_at
  BEFORE UPDATE ON public.promotional_ads
  FOR EACH ROW EXECUTE FUNCTION public.touch_promotional_ads_updated_at();

-- ── Guard rail: only admins may set/change approval fields ────────────────
-- Merchants can create requests and edit their own creative (title, image,
-- link, dates, is_active) freely, but the moment they touch review-only
-- columns those columns are silently pinned back to their previous/pending
-- state. This makes "self-approval" impossible even if a client bug or a
-- crafted request tries to slip `status: 'approved'` through.
CREATE OR REPLACE FUNCTION public.guard_promotional_ads_review_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.impression_count := 0;
    NEW.click_count := 0;
    RETURN NEW;
  END IF;

  -- UPDATE: any content edit by a non-admin resets the request back to
  -- 'pending' review (a merchant tweaking an approved ad's image/link
  -- shouldn't silently stay "approved" without a fresh look), and counters
  -- can only move via the SECURITY DEFINER increment functions below.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.subtitle IS DISTINCT FROM OLD.subtitle
     OR NEW.image_url IS DISTINCT FROM OLD.image_url
     OR NEW.link_url IS DISTINCT FROM OLD.link_url
     OR NEW.badge_label IS DISTINCT FROM OLD.badge_label
     OR NEW.placement IS DISTINCT FROM OLD.placement
  THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.status := OLD.status;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  NEW.impression_count := OLD.impression_count;
  NEW.click_count := OLD.click_count;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_promotional_ads_review_fields ON public.promotional_ads;
CREATE TRIGGER trg_guard_promotional_ads_review_fields
  BEFORE INSERT OR UPDATE ON public.promotional_ads
  FOR EACH ROW EXECUTE FUNCTION public.guard_promotional_ads_review_fields();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.promotional_ads ENABLE ROW LEVEL SECURITY;

-- Public: only fully-approved, active, in-date ads are visible.
DROP POLICY IF EXISTS "promotional_ads_public_read" ON public.promotional_ads;
CREATE POLICY "promotional_ads_public_read"
  ON public.promotional_ads FOR SELECT
  USING (
    status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

-- Merchants: full CRUD scoped to their own shop's ad requests (guarded above).
DROP POLICY IF EXISTS "promotional_ads_owner_manage" ON public.promotional_ads;
CREATE POLICY "promotional_ads_owner_manage"
  ON public.promotional_ads FOR ALL
  USING (shop_id IS NOT NULL AND public.is_shop_owner(shop_id))
  WITH CHECK (shop_id IS NOT NULL AND public.is_shop_owner(shop_id));

-- Admins: full control over every ad, including platform-wide (shop_id NULL) ones.
DROP POLICY IF EXISTS "promotional_ads_admin_manage" ON public.promotional_ads;
CREATE POLICY "promotional_ads_admin_manage"
  ON public.promotional_ads FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Public analytics RPCs ──────────────────────────────────────────────────
-- Anonymous visitors need to bump impression/click counters, but must not be
-- able to UPDATE the row directly (RLS above only grants them SELECT). These
-- SECURITY DEFINER functions expose the narrowest possible surface: bump by
-- exactly 1, only for ads that are currently publicly visible.
CREATE OR REPLACE FUNCTION public.increment_ad_impression(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.promotional_ads
  SET impression_count = impression_count + 1
  WHERE id = p_ad_id
    AND status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now());
$$;

CREATE OR REPLACE FUNCTION public.increment_ad_click(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.promotional_ads
  SET click_count = click_count + 1
  WHERE id = p_ad_id
    AND status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now());
$$;

GRANT EXECUTE ON FUNCTION public.increment_ad_impression(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(uuid) TO anon, authenticated;

-- Table-level grants are REQUIRED for PostgREST to touch this table at all —
-- RLS policies alone are not enough (roles get 403/400 without them).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotional_ads TO authenticated;
GRANT SELECT ON public.promotional_ads TO anon;

COMMENT ON TABLE public.promotional_ads IS
  'Sponsored homepage banners. Merchant requests default to pending review; only Super-Admin approval (via is_admin()) makes them publicly visible, enforced by both RLS and the guard trigger above.';
