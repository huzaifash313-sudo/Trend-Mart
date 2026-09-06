-- Rebase the platform brand theme onto the decided deep-plum default
-- (plum-magenta: primary #8B0046 · hero/dark #4A0024). The earlier seeded
-- defaults were 'maroon-plum' (and legacy 'green' on very old deployments);
-- flip those seeded fallbacks so fresh + existing installs boot straight
-- into the same deep-plum brand the code defaults to. An admin publishing a
-- different preset afterwards still wins.

UPDATE public.platform_settings
SET value = jsonb_build_object('id', 'plum-magenta'),
    updated_at = now()
WHERE key = 'brand_theme'
  AND value->>'id' IN ('green', 'maroon-plum');
