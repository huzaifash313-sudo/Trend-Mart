-- ============================================================================
--  TrendsMart — delivery pin on saved addresses
--
--  Text-only addresses forced a fresh GPS read on every checkout. Storing the
--  pin with the address means "Home" / "Office" can apply an exact doorstep
--  location in one tap — free, and far more reliable than guessing from a
--  street string.
-- ============================================================================

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN public.customer_addresses.latitude
  IS 'Map pin latitude for this saved address. NULL = text-only (legacy).';
COMMENT ON COLUMN public.customer_addresses.longitude
  IS 'Map pin longitude for this saved address.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_addresses_coords_valid'
  ) THEN
    ALTER TABLE public.customer_addresses
      ADD CONSTRAINT customer_addresses_coords_valid CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (
          latitude BETWEEN -90 AND 90
          AND longitude BETWEEN -180 AND 180
        )
      );
  END IF;
END $$;
