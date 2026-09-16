-- POS: track tax charged per sale (mirrors discount_amount / delivery_fee).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;
