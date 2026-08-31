-- =============================================================================
-- TrendsMart — Atomic coupon usage increment (closes a TOCTOU race)
-- =============================================================================
-- Previously /api/orders did: SELECT usage_count → UPDATE usage_count = used+1.
-- Two concurrent orders could both read the same count and both write the same
-- value (lost increment), exceeding the coupon's usage_limit.
--
-- This RPC does the increment atomically in a single UPDATE that also respects
-- the usage_limit, so a coupon can never be over-redeemed even under concurrency.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_shop_id uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_rows int;
BEGIN
  UPDATE public.coupons
     SET usage_count = COALESCE(usage_count, 0) + 1
   WHERE shop_id = p_shop_id
     AND upper(code) = upper(p_code)
     AND (usage_limit IS NULL OR usage_limit <= 0 OR COALESCE(usage_count, 0) < usage_limit);

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid, text) TO authenticated, service_role;

COMMIT;
