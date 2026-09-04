-- Free-delivery areas: merchants can name specific localities (mohallas /
-- colonies) where delivery is ALWAYS free, regardless of distance or subtotal.
-- Stored as a text array so it scales without a join table.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS free_delivery_areas text[] DEFAULT '{}';
