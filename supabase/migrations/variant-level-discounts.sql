-- ============================================================================
-- TrendsMart — Per-Variant Original Prices (compare-at / strikethrough)
-- ----------------------------------------------------------------------------
-- Problem: products with variants only carried ONE `original_price` at the
-- product level. When a customer picked a pricier option (e.g. Large pizza at
-- 999) the badge was computed from the base price (599 / original 799) and
-- showed the wrong % OFF or even a negative "Save Rs -200".
--
-- Fix: every size/colour/portion option that has an absolute `price` gets its
-- own `original_price` (~15% above the option price, rounded to the nearest
-- 50). The app (`lib/variantPricing.ts`) then computes the discount per
-- selected variant. Idempotent: options that already have an `original_price`
-- are preserved; options without a `price` are untouched.
--
-- Safe to re-run. No schema change (variants is already jsonb).
-- ============================================================================

UPDATE public.products
SET variants = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(g) <> 'object' OR NOT (g ? 'options') OR jsonb_typeof(g->'options') <> 'array'
        THEN g
      ELSE jsonb_build_object(
        'name', g->'name',
        'options', (
          SELECT jsonb_agg(
            CASE
              WHEN jsonb_typeof(o) <> 'object'
                OR NOT (o ? 'price')
                OR jsonb_typeof(o->'price') <> 'number'
                THEN o
              WHEN o ? 'original_price' THEN o
              ELSE jsonb_set(
                o,
                '{original_price}',
                to_jsonb((ceil(((o->>'price')::numeric) * 1.15 / 50) * 50)::bigint)
              )
            END
          )
          FROM jsonb_array_elements(g->'options') o
        )
      )
    END
  )
  FROM jsonb_array_elements(variants) g
)
WHERE variants IS NOT NULL AND jsonb_typeof(variants) = 'array';
