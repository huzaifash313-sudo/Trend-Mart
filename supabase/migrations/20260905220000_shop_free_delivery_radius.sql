-- Free-delivery radius: merchants can offer FREE delivery to customers within
-- a set number of km from their shop pin (1/2/3/4/custom). This works alongside
-- the named free-delivery areas: inside the circle the fee is zero, outside it
-- the normal threshold / flat / per-km rules apply.
-- Stored as nullable numeric (km, decimals allowed). NULL / 0 = feature off.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS free_delivery_radius_km numeric;

COMMENT ON COLUMN public.shops.free_delivery_radius_km IS
  'Customers within this many km of the shop pin get FREE delivery (null/0 = off). Overrides flat/per-km fees inside the circle; free areas, free threshold and paid rates still apply outside.';
