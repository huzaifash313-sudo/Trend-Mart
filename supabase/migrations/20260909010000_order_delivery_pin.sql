-- ============================================================================
--  TrendsMart — persist the customer's delivery pin on the order
--
--  Coordinates were previously used only to validate coverage and compute the
--  per-km fee, then thrown away. The pin survived solely inside the WhatsApp
--  message, so a merchant who lost that chat could never find the address
--  again. These columns keep the pin with the order.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS customer_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS customer_location_accuracy_m INTEGER,
  ADD COLUMN IF NOT EXISTS customer_location_source TEXT,
  ADD COLUMN IF NOT EXISTS customer_city TEXT,
  ADD COLUMN IF NOT EXISTS customer_area TEXT;

COMMENT ON COLUMN public.orders.customer_lat
  IS 'Delivery pin latitude captured at checkout (NULL for pickup / dine-in).';
COMMENT ON COLUMN public.orders.customer_lng
  IS 'Delivery pin longitude captured at checkout.';
COMMENT ON COLUMN public.orders.customer_location_accuracy_m
  IS 'Device-reported GPS accuracy in metres. Higher = less trustworthy pin.';
COMMENT ON COLUMN public.orders.customer_location_source
  IS 'How the pin was obtained: gps (device fix) or pin (user placed on map).';

-- Guard against nonsense coordinates reaching the merchant's Maps link.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_coords_valid'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_coords_valid CHECK (
        (customer_lat IS NULL AND customer_lng IS NULL)
        OR (
          customer_lat BETWEEN -90 AND 90
          AND customer_lng BETWEEN -180 AND 180
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_location_source_valid'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_location_source_valid CHECK (
        customer_location_source IS NULL
        OR customer_location_source IN ('gps', 'pin')
      );
  END IF;
END $$;
