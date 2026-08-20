-- Product popularity signals for search / feed ranking.
--
--   orders_count — total units ordered for a product across non-cancelled
--                  orders (derived from orders.items_json, maintained by an
--                  orders trigger).
--   click_count  — total product_click events in analytics_logs for a product
--                  (maintained by an analytics_logs trigger).
--
-- Search ranking blends fuzzy relevance with these signals (plus the parent
-- shop's avg_rating / review_count) so well-reviewed, in-demand, genuinely
-- clicked products surface first.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS orders_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.orders_count IS 'Total units ordered for this product across non-cancelled orders. Maintained by the orders trigger.';
COMMENT ON COLUMN public.products.click_count IS 'Total product_click events logged in analytics_logs for this product. Maintained by the analytics trigger.';

-- Recompute orders_count for the given products from non-cancelled orders.
CREATE OR REPLACE FUNCTION public.refresh_product_order_counts(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.products p
  SET orders_count = COALESCE(agg.cnt, 0)
  FROM (
    SELECT item->>'product_id' AS pid,
           COALESCE(SUM(COALESCE((item->>'quantity')::integer, 1)), 0)::integer AS cnt
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.items_json) AS item
    WHERE o.status IS DISTINCT FROM 'Cancelled'
      AND item->>'product_id' IN (SELECT id::text FROM unnest(p_ids) AS t(id))
    GROUP BY item->>'product_id'
  ) agg
  WHERE p.id::text = agg.pid;
END;
$$;

-- Orders → products.orders_count
CREATE OR REPLACE FUNCTION public.trg_orders_maintain_product_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pids uuid[];
BEGIN
  -- INSERT: increment counts immediately (no rescan of historical orders).
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products p
    SET orders_count = p.orders_count + COALESCE(agg.cnt, 0)
    FROM (
      SELECT (item->>'product_id')::uuid AS pid,
             COALESCE(SUM(COALESCE((item->>'quantity')::integer, 1)), 0)::integer AS cnt
      FROM jsonb_array_elements(NEW.items_json) AS item
      WHERE item->>'product_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      GROUP BY (item->>'product_id')::uuid
    ) agg
    WHERE p.id = agg.pid;
    RETURN NEW;
  END IF;

  -- UPDATE: nothing relevant changed (status + items identical).
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.items_json IS NOT DISTINCT FROM OLD.items_json THEN
    RETURN NEW;
  END IF;

  -- UPDATE / DELETE: recompute affected products from scratch (handles
  -- cancellations and item edits without counting drift).
  SELECT ARRAY_AGG(DISTINCT t.pid) INTO pids
  FROM (
    SELECT (item->>'product_id')::uuid AS pid
    FROM jsonb_array_elements(COALESCE(OLD.items_json, '[]'::jsonb)) AS item
    WHERE item->>'product_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    UNION
    SELECT (item->>'product_id')::uuid AS pid
    FROM jsonb_array_elements(COALESCE(NEW.items_json, '[]'::jsonb)) AS item
    WHERE item->>'product_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) t;

  IF pids IS NOT NULL THEN
    PERFORM public.refresh_product_order_counts(pids);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_maintain_product_counts ON public.orders;
CREATE TRIGGER orders_maintain_product_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_maintain_product_counts();

-- analytics_logs product_click → products.click_count
CREATE OR REPLACE FUNCTION public.trg_analytics_increment_product_click()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type = 'product_click' AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products
    SET click_count = click_count + 1
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_increment_product_click ON public.analytics_logs;
CREATE TRIGGER analytics_increment_product_click
  AFTER INSERT ON public.analytics_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_analytics_increment_product_click();

-- One-time backfill from existing data.
UPDATE public.products p
SET orders_count = COALESCE(agg.cnt, 0)
FROM (
  SELECT item->>'product_id' AS pid,
         COALESCE(SUM(COALESCE((item->>'quantity')::integer, 1)), 0)::integer AS cnt
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items_json) AS item
  WHERE o.status IS DISTINCT FROM 'Cancelled'
    AND item->>'product_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  GROUP BY item->>'product_id'
) agg
WHERE p.id::text = agg.pid;

UPDATE public.products p
SET click_count = agg.cnt
FROM (
  SELECT product_id, COUNT(*)::integer AS cnt
  FROM public.analytics_logs
  WHERE event_type = 'product_click' AND product_id IS NOT NULL
  GROUP BY product_id
) agg
WHERE p.id = agg.product_id;

-- Ordering indexes for popular-first search pools and feed sorts.
CREATE INDEX IF NOT EXISTS idx_products_orders_count ON public.products(orders_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_click_count ON public.products(click_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_popularity_feed ON public.products(orders_count DESC, click_count DESC, created_at DESC);
