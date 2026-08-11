-- Denormalized shop rating aggregates for fast card display (★ 4.5 · 4.2k)

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS avg_rating numeric(2,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.shops.avg_rating IS 'Average of public.reviews.rating (1–5), maintained by trigger.';
COMMENT ON COLUMN public.shops.review_count IS 'Count of reviews for this shop, maintained by trigger.';

CREATE OR REPLACE FUNCTION public.refresh_shop_rating_stats(p_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_shop_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.shops s
  SET
    avg_rating = COALESCE(
      (
        SELECT ROUND(AVG(r.rating)::numeric, 1)
        FROM public.reviews r
        WHERE r.shop_id = p_shop_id
      ),
      0
    ),
    review_count = COALESCE(
      (
        SELECT COUNT(*)::integer
        FROM public.reviews r
        WHERE r.shop_id = p_shop_id
      ),
      0
    )
  WHERE s.id = p_shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reviews_refresh_shop_ratings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_shop_rating_stats(OLD.shop_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_shop_rating_stats(NEW.shop_id);

  IF TG_OP = 'UPDATE' AND OLD.shop_id IS DISTINCT FROM NEW.shop_id THEN
    PERFORM public.refresh_shop_rating_stats(OLD.shop_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_shop_ratings ON public.reviews;
CREATE TRIGGER reviews_refresh_shop_ratings
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reviews_refresh_shop_ratings();

-- One-time backfill
UPDATE public.shops s
SET
  avg_rating = COALESCE(stats.avg_r, 0),
  review_count = COALESCE(stats.cnt, 0)
FROM (
  SELECT
    shop_id,
    ROUND(AVG(rating)::numeric, 1) AS avg_r,
    COUNT(*)::integer AS cnt
  FROM public.reviews
  GROUP BY shop_id
) stats
WHERE s.id = stats.shop_id;
