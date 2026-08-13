-- Coupon minimum-order + usage columns (safe to re-run).
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_order_amount numeric(10, 2) DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS usage_limit integer DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;
