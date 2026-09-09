-- Atomic coupon usage decrement (refund on failed/duplicate order insert or cancel)
-- Idempotent — safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.decrement_coupon_usage(p_shop_id uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_rows int;
BEGIN
  UPDATE public.coupons
     SET usage_count = GREATEST(COALESCE(usage_count, 0) - 1, 0)
   WHERE shop_id = p_shop_id
     AND upper(code) = upper(p_code)
     AND COALESCE(usage_count, 0) > 0;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_coupon_usage(uuid, text) TO authenticated, service_role;

COMMIT;
