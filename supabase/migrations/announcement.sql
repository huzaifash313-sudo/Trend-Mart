/* -------------------------------------------------------------------------- */
/*  TrendsMart — Migrate: Add announcement column to shops (Prompt 97)         */
/* -------------------------------------------------------------------------- */

-- Add an optional announcement text column for merchant promotional banners
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS announcement TEXT;

COMMENT ON COLUMN shops.announcement IS 'Optional promotional announcement displayed as a marquee banner on the storefront page.';