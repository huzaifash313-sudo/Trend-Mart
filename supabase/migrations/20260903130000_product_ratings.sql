-- Product-level ratings: each product has own stars; shop avg stays denormalized
-- from ALL reviews for that shop (product reviews included → shop rating rises automatically).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS avg_rating numeric(2,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.avg_rating IS 'Average of reviews.rating for this product (1–5), maintained by trigger.';
COMMENT ON COLUMN public.products.review_count IS 'Count of product-scoped reviews, maintained by trigger.';

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reviews_product_created
  ON public.reviews (product_id, created_at DESC)
  WHERE product_id IS NOT NULL;

-- Allow multiple product reviews per shop (one per product). Keep legacy shop-only unique.
DROP INDEX IF EXISTS uq_reviews_shop_user;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_shop_user_legacy
  ON public.reviews (shop_id, user_id)
  WHERE product_id IS NULL AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_user
  ON public.reviews (product_id, user_id)
  WHERE product_id IS NOT NULL AND user_id IS NOT NULL;

-- Fast product aggregate refresh
CREATE OR REPLACE FUNCTION public.refresh_product_rating_stats(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_product_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.products p
  SET
    avg_rating = COALESCE(
      (
        SELECT ROUND(AVG(r.rating)::numeric, 1)
        FROM public.reviews r
        WHERE r.product_id = p_product_id
      ),
      0
    ),
    review_count = COALESCE(
      (
        SELECT COUNT(*)::integer
        FROM public.reviews r
        WHERE r.product_id = p_product_id
      ),
      0
    )
  WHERE p.id = p_product_id;
END;
$$;

-- Shop aggregates = ALL reviews for the shop (product + legacy shop-only).
-- Rating a product therefore automatically updates the store rating.
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

CREATE OR REPLACE FUNCTION public.trg_reviews_refresh_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NOT NULL THEN
      PERFORM public.refresh_product_rating_stats(OLD.product_id);
    END IF;
    PERFORM public.refresh_shop_rating_stats(OLD.shop_id);
    RETURN OLD;
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    PERFORM public.refresh_product_rating_stats(NEW.product_id);
  END IF;
  PERFORM public.refresh_shop_rating_stats(NEW.shop_id);

  IF TG_OP = 'UPDATE' THEN
    IF OLD.product_id IS DISTINCT FROM NEW.product_id AND OLD.product_id IS NOT NULL THEN
      PERFORM public.refresh_product_rating_stats(OLD.product_id);
    END IF;
    IF OLD.shop_id IS DISTINCT FROM NEW.shop_id THEN
      PERFORM public.refresh_shop_rating_stats(OLD.shop_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_shop_ratings ON public.reviews;
DROP TRIGGER IF EXISTS reviews_refresh_rating_stats ON public.reviews;
CREATE TRIGGER reviews_refresh_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reviews_refresh_rating_stats();

-- Helpful index for “top rated” / popular sorts (denormalized columns)
CREATE INDEX IF NOT EXISTS idx_products_avg_rating_desc
  ON public.products (avg_rating DESC, review_count DESC)
  WHERE is_available IS DISTINCT FROM false;

-- Reminder copy: rate the product (shop rating updates automatically)
CREATE OR REPLACE FUNCTION public.notify_order_delivered_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shop_name text;
BEGIN
  IF NEW.status = 'Delivered' AND NEW.customer_user_id IS NOT NULL THEN
    SELECT name INTO shop_name FROM public.shops WHERE id = NEW.shop_id;
    PERFORM public.create_notification(
      NEW.customer_user_id,
      'order',
      'Order delivered — rate your product!',
      'Your order from ' || COALESCE(NULLIF(shop_name, ''), 'the shop') || ' was delivered. Rate the product(s) — that also updates the shop rating.',
      '/account',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;
