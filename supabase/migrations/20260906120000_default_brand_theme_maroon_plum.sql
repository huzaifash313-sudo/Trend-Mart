-- Rebase the platform brand theme onto the decided default.
-- Existing deployments seeded brand_theme='green' (or never published) — flip
-- them to the Maroon + Plum default. Admins can still publish another preset
-- later from the Super-Admin panel; this only resets the seeded fallback.

UPDATE public.platform_settings
SET value = jsonb_build_object('id', 'maroon-plum'),
    updated_at = now()
WHERE key = 'brand_theme'
  AND value->>'id' = 'green';
