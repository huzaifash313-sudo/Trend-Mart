-- TrendsMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- PART 7 — PROMOTIONAL ADS CAROUSEL
-- #############################################################################

BEGIN;

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
  is_active          boolean NOT NULL DEFAULT true,
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

-- Safety net: backfill any columns missing from an older/partial "promotional_ads" table.
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS subtitle text;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS badge_label text;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'homepage_top';
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS impression_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS click_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.promotional_ads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_promotional_ads_shop_id ON public.promotional_ads(shop_id);
CREATE INDEX IF NOT EXISTS idx_promotional_ads_live
  ON public.promotional_ads(placement, sort_order)
  WHERE status = 'approved' AND is_active = true;

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

ALTER TABLE public.promotional_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotional_ads_public_read" ON public.promotional_ads;
CREATE POLICY "promotional_ads_public_read"
  ON public.promotional_ads FOR SELECT
  USING (
    status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

DROP POLICY IF EXISTS "promotional_ads_owner_manage" ON public.promotional_ads;
CREATE POLICY "promotional_ads_owner_manage"
  ON public.promotional_ads FOR ALL
  USING (shop_id IS NOT NULL AND public.is_shop_owner(shop_id))
  WITH CHECK (shop_id IS NOT NULL AND public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS "promotional_ads_admin_manage" ON public.promotional_ads;
CREATE POLICY "promotional_ads_admin_manage"
  ON public.promotional_ads FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

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

COMMIT;
