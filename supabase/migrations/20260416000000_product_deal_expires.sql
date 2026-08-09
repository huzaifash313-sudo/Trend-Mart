-- Product deal / discount end time (markdown pricing timer)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deal_expires_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.products.deal_expires_at IS
  'When the product discount/deal ends. After this time, % OFF badge is hidden.';

CREATE INDEX IF NOT EXISTS idx_products_deal_expires_at
  ON public.products (deal_expires_at)
  WHERE deal_expires_at IS NOT NULL;
