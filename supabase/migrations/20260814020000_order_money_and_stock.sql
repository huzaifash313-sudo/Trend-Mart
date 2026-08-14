-- =============================================================================
-- TrendMart — Order money-breakdown columns + atomic product stock deduction
-- =============================================================================
-- Two fixes:
--
--   1. Adds subtotal/discount/delivery/coupon_code columns to `orders`.
--      Previously the route wrote `coupon_code` to a column that did not exist,
--      so ANY order using a coupon failed the insert with a 500. Persisting the
--      breakdown also makes receipts/sales summaries accurate.
--
--   2. Adds an atomic, SECURITY DEFINER RPC that decrements the per-variant
--      `stock` number stored inside `products.variants` (JSONB). This closes the
--      overselling gap: the live checkout path previously only checked boolean
--      availability and never deducted quantities.
--
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1. Money-breakdown columns ─────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(12, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code text;

-- ── 2. Atomic product variant stock deduction ──────────────────────────────
-- `products.variants` is a JSONB array of variant groups:
--   [ { "name": "Size", "options": [ { "label": "M", "stock": 10, ... } ] } ]
-- The order line's `variant` is a display label like "Size: M" (or a bare "M").
-- This function locks the product row, finds the matching option, and only
-- decrements when there is enough stock — atomically, so concurrent checkouts
-- cannot oversell. Returns:
--   true  → deducted OK, OR no tracked variant matched (nothing to deduct)
--   false → a tracked variant matched but had insufficient stock
CREATE OR REPLACE FUNCTION public.deduct_product_variant_stock(
  p_product_id uuid,
  p_variant_label text,
  p_qty integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_variants jsonb;
  v_group jsonb;
  v_option jsonb;
  v_grp_idx int;
  v_opt_idx int;
  v_stock int;
  v_new_option jsonb;
  v_new_group jsonb;
  v_deducted boolean := false;
  v_bare_label text := p_variant_label;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  SELECT variants INTO v_variants FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_variants IS NULL OR jsonb_typeof(v_variants) <> 'array' THEN
    RETURN true; -- no variants tracked → allow (nothing to deduct)
  END IF;

  -- Support "Size: M", "Size:M", and bare "M" labels.
  IF position(':' in p_variant_label) > 0 THEN
    v_bare_label := trim(split_part(p_variant_label, ':', 2));
  END IF;

  FOR v_grp_idx IN 0 .. jsonb_array_length(v_variants) - 1 LOOP
    v_group := v_variants -> v_grp_idx;
    CONTINUE WHEN v_group IS NULL OR jsonb_typeof(v_group -> 'options') <> 'array';

    FOR v_opt_idx IN 0 .. jsonb_array_length(v_group -> 'options') - 1 LOOP
      v_option := v_group -> 'options' -> v_opt_idx;
      CONTINUE WHEN v_option IS NULL;

      IF (v_option ->> 'label') = p_variant_label
         OR (v_option ->> 'label') = v_bare_label THEN
        -- Untracked stock (missing/null key) = unlimited → allow, no deduction.
        IF (v_option ->> 'stock') IS NULL THEN
          RETURN true;
        END IF;
        v_stock := COALESCE((v_option ->> 'stock')::int, 0);
        IF v_stock < p_qty THEN
          RETURN false; -- insufficient stock for this variant
        END IF;
        v_new_option := jsonb_set(v_option, '{stock}', to_jsonb(v_stock - p_qty));
        v_new_group := jsonb_set(
          v_group,
          ARRAY['options', v_opt_idx::text],
          v_new_option
        );
        v_variants := jsonb_set(v_variants, ARRAY[v_grp_idx::text], v_new_group);
        v_deducted := true;
        EXIT;
      END IF;
    END LOOP;

    EXIT WHEN v_deducted;
  END LOOP;

  IF NOT v_deducted THEN
    RETURN true; -- no matching tracked option → allow
  END IF;

  UPDATE public.products SET variants = v_variants WHERE id = p_product_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_product_variant_stock(uuid, text, integer)
  TO authenticated, service_role;

COMMIT;
